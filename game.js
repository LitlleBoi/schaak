// =============================================================================
// SCHAAKCLIENT MET WEBSOCKETS (game.js)
// =============================================================================
// Dit bestand regelt alles wat er op het scherm van de speler gebeurt:
// 1. Verbinding maken met de WebSocket server (lokaal of op Render)
// 2. Het schaakbord tekenen en stukken tonen (Wit onder of Zwart onder)
// 3. Zetten doen en valideren via chess.js
// 4. Zetten en chatberichten real-time versturen via WebSockets
// 5. De 3 minuten of 10 minuten klokken synchroon laten lopen
//
// UITLEG VOOR DE PRESENTATIE:
// - WebSockets zorgen voor een constante, directe 2-weg verbinding met de server.
// - Zodra jij een zet doet, sturen we een JSON-berichtje naar de server.
// - De server stuurt dit direct door naar het scherm van je tegenstander!
// =============================================================================

// -----------------------------------------------------------------------------
// STAP 1: URL Parameters en Spelergegevens ophalen
// -----------------------------------------------------------------------------
const params = new URLSearchParams(window.location.search);
// Haal de gekozen tijd op uit de URL (bijv. chess.html?tijd=3 of chess.html?tijd=10)
const gekozenTijd = parseInt(params.get('tijd'), 10) || 10;
// Haal eventuele kamercode op (bijv. chess.html?kamer=A1B2C3)
const gekozenKamer = (params.get('kamer') || '').toUpperCase();

// Haal de ingelogde speler op (je MOET eerst ingelogd zijn!)
let spelerInfo = null;
try {
  const opgeslagen = JSON.parse(localStorage.getItem('gebruiker'));
  if (opgeslagen && opgeslagen.naam) {
    spelerInfo = opgeslagen;
  }
} catch (e) {
  spelerInfo = null;
}

if (!spelerInfo) {
  alert('Je bent nog niet ingelogd! Meld je eerst aan of log in met je account.');
  window.location.replace('login.html');
}

// -----------------------------------------------------------------------------
// STAP 2: Spelstatus variabelen
// -----------------------------------------------------------------------------
let mijnKleur = null;        // Wordt 'wit' of 'zwart' (bepaald door de server)
let actieveKamerId = null;   // De unieke code van de partij
let schaakSpel = new Chess(); // De officiële schaakregels via chess.js
let geselecteerdVeld = null; // Het vakje dat de speler heeft aangeklikt (bijv. 'e2')
let geldigeZetten = [];      // Waar mag het geselecteerde stuk naartoe?
let spelBezig = false;       // Is de partij actief?
let laatsteZet = null;       // Onthoud de laatste zet voor gele markering

// Mapping van chess.js stukken naar onze lokale SVG afbeeldingen in img/stukken/
// Bijv. 'wP' = Witte Pion, 'bK' = Zwarte Koning
function getStukSvgPad(stuk) {
  if (!stuk) return null;
  const kleurCode = stuk.color === 'w' ? 'w' : 'b';
  const typeCode = stuk.type.toUpperCase();
  return `img/stukken/${kleurCode}${typeCode}.svg`;
}

// Audio geluidseffect met de Web Audio API (werkt overal zonder externe mp3's)
function speelZetGeluid() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// STAP 3: WebSocket verbinding openen
// -----------------------------------------------------------------------------
// Dit werkt automatisch op localhost (ws://) én op Render (wss:// met SSL)!
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}`;
const ws = new WebSocket(wsUrl);

// Bericht sturen naar de server via WebSockets
function stuurNaarServer(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Zodra de verbinding open is:
ws.onopen = () => {
  console.log('Verbonden met schaak WebSocket server!');

  // Als er een specifieke kamer in de URL staat, join die kamer
  if (gekozenKamer) {
    stuurNaarServer({
      type: 'maakOfJoinKamer',
      kamerId: gekozenKamer,
      tijd: gekozenTijd,
      naam: spelerInfo.naam,
      elo: spelerInfo.elo
    });
  } else {
    // Anders: start matchmaking voor de gekozen tijd (3 min of 10 min)
    stuurNaarServer({
      type: 'zoekSpel',
      tijd: gekozenTijd,
      naam: spelerInfo.naam,
      elo: spelerInfo.elo
    });
  }
};

// -----------------------------------------------------------------------------
// STAP 4: Berichten ontvangen van de WebSocket server
// -----------------------------------------------------------------------------
ws.onmessage = (event) => {
  let bericht;
  try {
    bericht = JSON.parse(event.data);
  } catch (e) {
    return;
  }

  console.log('Bericht ontvangen van server:', bericht.type, bericht);

  // 1. Wachten op een tegenstander
  if (bericht.type === 'wachtenOpTegenstander' || bericht.type === 'kamerAangemaakt') {
    toonWachtScherm(bericht.tekst, bericht.kamerId);
  }

  // 2. Het spel start! (Server heeft tegenstander gematcht en kleuren willekeurig gekozen)
  else if (bericht.type === 'spelGestart') {
    verbergWachtScherm();
    mijnKleur = bericht.jouwKleur; // 'wit' of 'zwart'
    actieveKamerId = bericht.kamerId;
    spelBezig = true;

    // Reset schaakbordpositie
    schaakSpel = new Chess(bericht.fen || undefined);
    laatsteZet = null;
    geselecteerdVeld = null;

    // Pas de namen en kleuren aan op het scherm
    updateSpelerBalken(bericht);

    // Initialiseer de klokken
    updateKlokWeergave('klokOnder', mijnKleur === 'wit' ? bericht.tijdWit : bericht.tijdZwart);
    updateKlokWeergave('klokBoven', mijnKleur === 'wit' ? bericht.tijdZwart : bericht.tijdWit);

    // Teken het schaakbord (gedraaid als je zwart bent!)
    tekenSchaakbord();

    // Toon pop-up melding
    toonMelding(`Spel gestart! Jij bent ${mijnKleur.toUpperCase()} (${mijnKleur === 'wit' ? '♔' : '♚'})`);
  }

  // 3. Klok synchronisatie van de server (elke seconde)
  else if (bericht.type === 'klokUpdate') {
    if (mijnKleur === 'wit') {
      updateKlokWeergave('klokOnder', bericht.tijdWit);
      updateKlokWeergave('klokBoven', bericht.tijdZwart);
    } else {
      updateKlokWeergave('klokOnder', bericht.tijdZwart);
      updateKlokWeergave('klokBoven', bericht.tijdWit);
    }

    // Markeer de actieve speler balk
    const beurt = bericht.beurt; // 'w' of 'b'
    const ikBenAanDeBeurt = (beurt === 'w' && mijnKleur === 'wit') || (beurt === 'b' && mijnKleur === 'zwart');
    const spelerOnderEl = document.getElementById('spelerOnder');
    const spelerBovenEl = document.getElementById('spelerBoven');
    if (spelerOnderEl && spelerBovenEl) {
      spelerOnderEl.classList.toggle('actief', ikBenAanDeBeurt);
      spelerBovenEl.classList.toggle('actief', !ikBenAanDeBeurt);
    }
  }

  // 4. Een zet is gedaan (door jou of door de tegenstander)
  else if (bericht.type === 'zetGedaan') {
    schaakSpel.move(bericht.zet);
    laatsteZet = { van: bericht.van, naar: bericht.naar };
    speelZetGeluid();
    tekenSchaakbord();
    updateZettenGeschiedenis(bericht.zettenGeschiedenis);
  }

  // 5. Spel is afgelopen (schaakmat, tijd om, opgave of remise)
  else if (bericht.type === 'spelEinde') {
    spelBezig = false;
    tekenSchaakbord();
    toonEindScherm(bericht.tekst, bericht.winnaar);
  }

  // 6. Chatbericht ontvangen
  else if (bericht.type === 'chat') {
    voegChatToe(bericht.afzender, bericht.tekst, bericht.kleur === mijnKleur);
  }

  // 7. Remise-aanbod ontvangen van tegenstander
  else if (bericht.type === 'remiseAanbodOntvangen') {
    toonRemiseAanbodModal(bericht.vanNaam);
  }

  // 8. Remise geweigerd
  else if (bericht.type === 'remiseGeweigerd') {
    toonMelding(bericht.tekst);
  }

  // 9. Tegenstander heeft verbinding verbroken
  else if (bericht.type === 'tegenstanderVerlaten') {
    spelBezig = false;
    toonEindScherm(bericht.tekst, mijnKleur);
  }

  // 10. Foutmelding van server
  else if (bericht.type === 'fout') {
    toonMelding(bericht.melding);
  }
};

ws.onclose = () => {
  console.log('WebSocket verbinding gesloten');
};

// -----------------------------------------------------------------------------
// STAP 5: Het Schaakbord Tekenen (HTML & DOM)
// -----------------------------------------------------------------------------
// Een schaakbord heeft 64 velden: rijen 1 t/m 8 en kolommen a t/m h.
// Als je WIT bent, staat rij 8 bovenaan en rij 1 onderaan.
// Als je ZWART bent, draaien we het bord om: rij 1 bovenaan, rij 8 onderaan!
function tekenSchaakbord() {
  const bordEl = document.getElementById('bord');
  if (!bordEl) return;
  bordEl.innerHTML = '';

  const rijen = mijnKleur === 'zwart' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const kolommen = mijnKleur === 'zwart' ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const beurt = schaakSpel.turn(); // 'w' of 'b'
  const isKoningInSchaak = schaakSpel.in_check();

  for (let r = 0; r < 8; r++) {
    for (let k = 0; k < 8; k++) {
      const rij = rijen[r];
      const kolom = kolommen[k];
      const veld = `${kolom}${rij}`; // Bijv. 'e4'

      const veldVak = document.createElement('div');
      veldVak.className = 'veld-vak';
      veldVak.dataset.veld = veld;

      // Donkere of lichte veldkleur (groen of crème)
      const isDonker = (k + r) % 2 === 1;
      if (isDonker) veldVak.classList.add('donker');

      // Markeer geselecteerd veld
      if (geselecteerdVeld === veld) {
        veldVak.classList.add('gekozen');
      }

      // Markeer laatste zet van het spel
      if (laatsteZet && (laatsteZet.van === veld || laatsteZet.naar === veld)) {
        veldVak.classList.add('laatste-zet');
      }

      // Welk stuk staat er op dit veld?
      const stuk = schaakSpel.get(veld);

      // Als de koning schaak staat, kleur zijn vakje rood!
      if (isKoningInSchaak && stuk && stuk.type === 'k' && stuk.color === beurt) {
        veldVak.classList.add('schaak');
      }

      if (stuk) {
        veldVak.classList.add('heeft-stuk');
        const img = document.createElement('img');
        img.className = 'stuk';
        img.src = getStukSvgPad(stuk);
        img.alt = `${stuk.color}${stuk.type}`;
        veldVak.appendChild(img);
      }

      // Toon mogelijke zetten stip als dit veld een geldige bestemming is
      if (geldigeZetten.includes(veld)) {
        const stip = document.createElement('div');
        stip.className = 'mogelijke-zet';
        veldVak.appendChild(stip);
      }

      // Klik event op een schaakvakje
      veldVak.addEventListener('click', () => klikOpVeld(veld));

      bordEl.appendChild(veldVak);
    }
  }
}

// -----------------------------------------------------------------------------
// STAP 6: Klikken en Zetten doen
// -----------------------------------------------------------------------------
function klikOpVeld(veld) {
  // Alleen zetten toestaan als het spel bezig is
  if (!spelBezig) return;

  const beurt = schaakSpel.turn(); // 'w' of 'b'
  const mijnBeurtKleur = mijnKleur === 'wit' ? 'w' : 'b';

  // Ben jij wel aan de beurt?
  if (beurt !== mijnBeurtKleur) {
    toonMelding('Het is nog niet jouw beurt!');
    return;
  }

  const stukOpVeld = schaakSpel.get(veld);

  // SCENARIO 1: Speler klikt op een eigen stuk om te selecteren
  if (stukOpVeld && stukOpVeld.color === mijnBeurtKleur) {
    geselecteerdVeld = veld;

    // Bereken alle legale zetten voor dit stuk via chess.js
    const moves = schaakSpel.moves({ square: veld, verbose: true });
    geldigeZetten = moves.map(m => m.to);

    tekenSchaakbord();
    return;
  }

  // SCENARIO 2: Er is al een stuk geselecteerd en de speler klikt op een doelvak
  if (geselecteerdVeld) {
    if (geldigeZetten.includes(veld)) {
      // De zet is legaal!
      const vanVeld = geselecteerdVeld;
      const naarVeld = veld;

      // Stuur de zet naar de server via WebSockets
      stuurNaarServer({
        type: 'zet',
        van: vanVeld,
        naar: naarVeld,
        promotie: 'q' // Automatisch dame bij pion-promotie
      });

      // Deselecteer
      geselecteerdVeld = null;
      geldigeZetten = [];
      tekenSchaakbord();
    } else {
      // Ongeldig vakje aangeklikt -> deselecteer
      geselecteerdVeld = null;
      geldigeZetten = [];
      tekenSchaakbord();
    }
  }
}

// -----------------------------------------------------------------------------
// STAP 7: Klok en Tijdweergave
// -----------------------------------------------------------------------------
function updateKlokWeergave(elementId, secondenTotaal) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const sec = Math.max(0, Math.floor(secondenTotaal || 0));
  const min = Math.floor(sec / 60);
  const restSec = sec % 60;
  el.textContent = `${min.toString().padStart(2, '0')}:${restSec.toString().padStart(2, '0')}`;
}

// -----------------------------------------------------------------------------
// STAP 8: Spelersinfo en Zetgeschiedenis bijwerken
// -----------------------------------------------------------------------------
function updateSpelerBalken(data) {
  const naamOnder = document.getElementById('naamOnder');
  const eloOnder = document.getElementById('eloOnder');
  const naamBoven = document.getElementById('naamBoven');
  const eloBoven = document.getElementById('eloBoven');

  const ikIcoon = mijnKleur === 'wit' ? '♔' : '♚';
  const tegenstanderIcoon = mijnKleur === 'wit' ? '♚' : '♔';

  if (naamOnder) naamOnder.innerHTML = `${spelerInfo.naam} <span style="font-size:18px">${ikIcoon}</span> <small>(${mijnKleur.toUpperCase()})</small>`;
  if (eloOnder) eloOnder.textContent = `(${spelerInfo.elo})`;

  if (naamBoven) naamBoven.innerHTML = `${data.tegenstanderNaam} <span style="font-size:18px">${tegenstanderIcoon}</span> <small>(${mijnKleur === 'wit' ? 'ZWART' : 'WIT'})</small>`;
  if (eloBoven) eloBoven.textContent = `(${data.tegenstanderElo || 1200})`;
}

function updateZettenGeschiedenis(zetten) {
  const lijst = document.getElementById('zettenLijst');
  if (!lijst || !zetten) return;

  let html = '';
  for (let i = 0; i < zetten.length; i += 2) {
    const zetNummer = Math.floor(i / 2) + 1;
    const witZet = zetten[i] || '';
    const zwartZet = zetten[i + 1] || '';
    html += `<span class="nr">${zetNummer}.</span><span>${witZet}</span><span class="b">${zwartZet}</span>`;
  }
  lijst.innerHTML = html;
  lijst.scrollTop = lijst.scrollHeight;
}

// -----------------------------------------------------------------------------
// STAP 9: Chatfunctie via WebSockets
// -----------------------------------------------------------------------------
function voegChatToe(afzender, tekst, isIk) {
  const chatBox = document.getElementById('chat');
  if (!chatBox) return;

  const p = document.createElement('p');
  if (isIk) p.className = 'ik';
  p.innerHTML = `<b>${afzender}:</b> ${tekst}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
if (chatForm && chatInput) {
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const tekst = chatInput.value.trim();
    if (!tekst) return;

    // Stuur chatbericht via WebSocket
    stuurNaarServer({
      type: 'chat',
      tekst: tekst
    });

    chatInput.value = '';
  });
}

// -----------------------------------------------------------------------------
// STAP 10: Knoppen: Opgeven en Remise
// -----------------------------------------------------------------------------
const opgevenKnop = document.getElementById('opgeven');
if (opgevenKnop) {
  opgevenKnop.addEventListener('click', () => {
    if (!spelBezig) {
      window.location.href = 'spelen.html';
      return;
    }
    toonOpgevenModal();
  });
}

const gelijkspelKnop = document.getElementById('gelijkspel');
if (gelijkspelKnop) {
  gelijkspelKnop.addEventListener('click', () => {
    if (!spelBezig) return;
    stuurNaarServer({ type: 'remiseAanbod' });
    toonMelding('🤝 Remise (gelijkspel) aangeboden aan tegenstander...');
  });
}

// Modal voor bevestigen van Opgeven
function toonOpgevenModal() {
  let modal = document.getElementById('actieModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'actieModal';
    modal.className = 'spel-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="overlay-kaart">
      <div style="font-size:42px; margin-bottom:8px">🏳️</div>
      <h2>Opgeven?</h2>
      <p style="margin: 8px 0 16px; opacity:0.9">Weet je zeker dat je wilt opgeven? Je tegenstander wint dan direct de partij.</p>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="bevestigOpgeven" class="knop rood" style="font-size:16px; padding:8px 20px;">Ja, geef op</button>
        <button id="annuleerOpgeven" class="klein" style="font-size:16px; padding:8px 20px;">Annuleren</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  document.getElementById('bevestigOpgeven').onclick = () => {
    modal.style.display = 'none';
    stuurNaarServer({ type: 'opgeven' });
  };
  document.getElementById('annuleerOpgeven').onclick = () => {
    modal.style.display = 'none';
  };
}

// Modal wanneer tegenstander remise (gelijkspel) aanbiedt
function toonRemiseAanbodModal(vanNaam) {
  let modal = document.getElementById('actieModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'actieModal';
    modal.className = 'spel-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="overlay-kaart">
      <div style="font-size:42px; margin-bottom:8px">🤝</div>
      <h2>Remise Aangeboden</h2>
      <p style="margin: 8px 0 16px; opacity:0.9"><b>${vanNaam || 'Je tegenstander'}</b> biedt remise (gelijkspel) aan. Wil je dit accepteren?</p>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="accepteerRemise" class="knop lime" style="font-size:16px; padding:8px 20px;">Accepteren</button>
        <button id="weigerRemise" class="klein" style="font-size:16px; padding:8px 20px;">Weigeren</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  document.getElementById('accepteerRemise').onclick = () => {
    modal.style.display = 'none';
    stuurNaarServer({ type: 'remiseReactie', geaccepteerd: true });
  };
  document.getElementById('weigerRemise').onclick = () => {
    modal.style.display = 'none';
    stuurNaarServer({ type: 'remiseReactie', geaccepteerd: false });
  };
}

// -----------------------------------------------------------------------------
// STAP 11: Wachtscherm & Popups (UI helpers)
// -----------------------------------------------------------------------------
function toonWachtScherm(tekst, kamerId) {
  let overlay = document.getElementById('wachtOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wachtOverlay';
    overlay.className = 'spel-overlay';
    document.body.appendChild(overlay);
  }

  const actueleUrl = window.location.origin + window.location.pathname + `?kamer=${kamerId || actieveKamerId || ''}&tijd=${gekozenTijd}`;

  overlay.innerHTML = `
    <div class="overlay-kaart">
      <div class="laad-animatie">⏳</div>
      <h2>Wachten op tegenstander</h2>
      <p style="margin: 8px 0 16px; opacity:0.9">${tekst || 'Zoeken naar een tegenstander...'}</p>
      
      <div style="background:rgba(0,0,0,0.25); padding:12px; border-radius:12px; margin-bottom:16px;">
        <span style="font-size:13px; display:block; margin-bottom:6px;">Speeltijd: <b>${gekozenTijd} minuten</b></span>
        ${kamerId ? `<span style="font-size:13px; display:block; margin-bottom:8px;">Kamercode: <b style="letter-spacing:2px; font-size:18px; color:#ffd54a">${kamerId}</b></span>` : ''}
        <button id="kopieerLinkKnop" class="klein lime" style="width:100%; font-size:14px; padding:6px 12px;">🔗 Kopieer link voor vriend</button>
      </div>

      <a href="spelen.html" class="klein" style="display:inline-block; text-decoration:none;">Annuleren</a>
    </div>
  `;
  overlay.style.display = 'flex';

  const kopieerKnop = document.getElementById('kopieerLinkKnop');
  if (kopieerKnop) {
    kopieerKnop.onclick = () => {
      navigator.clipboard.writeText(actueleUrl).then(() => {
        kopieerKnop.textContent = '✅ Link gekopieerd!';
        setTimeout(() => { kopieerKnop.textContent = '🔗 Kopieer link voor vriend'; }, 2500);
      }).catch(() => {
        prompt('Kopieer deze link:', actueleUrl);
      });
    };
  }
}

function verbergWachtScherm() {
  const overlay = document.getElementById('wachtOverlay');
  if (overlay) overlay.style.display = 'none';
}

function toonEindScherm(tekst, winnaar) {
  let overlay = document.getElementById('eindOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'eindOverlay';
    overlay.className = 'spel-overlay';
    document.body.appendChild(overlay);
  }

  const isWinnaar = winnaar && winnaar === mijnKleur;
  const isGelijkspel = !winnaar || winnaar === 'remise';

  let titel = 'Partij beëindigd';
  let icoon = '♟️';
  if (isWinnaar) {
    titel = 'Gefeliciteerd, jij wint! 🎉';
    icoon = '🏆';
  } else if (!isGelijkspel) {
    titel = 'Helaas, verloren! 😢';
    icoon = '💀';
  } else {
    titel = 'Remise (Gelijkspel) 🤝';
    icoon = '⚖️';
  }

  overlay.innerHTML = `
    <div class="overlay-kaart">
      <div style="font-size:52px; margin-bottom:8px">${icoon}</div>
      <h2 style="font-size:26px; margin-bottom:10px">${titel}</h2>
      <p style="font-size:16px; margin-bottom:20px; line-height:1.4">${tekst}</p>
      <div style="display:flex; gap:12px; justify-content:center;">
        <a href="spelen.html" class="knop" style="font-size:18px; padding:10px 22px; text-decoration:none;">Nieuw Spel</a>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
}

function toonMelding(tekst) {
  const meldingEl = document.getElementById('melding');
  if (meldingEl) {
    meldingEl.textContent = tekst;
    meldingEl.classList.add('zie');
    setTimeout(() => meldingEl.classList.remove('zie'), 3000);
  }
}

// Teken initieel leeg bord bij het inladen
tekenSchaakbord();
