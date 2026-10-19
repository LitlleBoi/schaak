// =============================================================================
// ALGEMENE APP LOGICA MET MYSQL INTEGRATIE (app.js)
// =============================================================================
const $ = s => document.querySelector(s);
const LS = localStorage;

// Hulpfunctie om melding toasts onderaan te tonen
const melding = t => {
  const m = $('#melding');
  if (!m) return;
  m.textContent = t;
  m.classList.add('zie');
  setTimeout(() => m.classList.remove('zie'), 2200);
};

// -----------------------------------------------------------------------------
// STAP 1: Gebruikersprofiel ophalen (ALLEEN ALS ECHT INGELOGD)
// -----------------------------------------------------------------------------
const gebruiker = () => {
  try {
    const data = JSON.parse(LS.getItem('gebruiker'));
    if (data && data.naam) return data;
    return null;
  } catch (e) {
    return null;
  }
};

// -----------------------------------------------------------------------------
// STAP 2: Pagina-beveiliging (Je MOET ingelogd zijn voor spelen/vrienden/profiel)
// -----------------------------------------------------------------------------
const beveiligd = ['spelen', 'vrienden', 'profiel', 'chess'];
const pad = location.pathname.split('/').pop().replace('.html', '') || 'index';

// Als je naar een beveiligde pagina gaat zonder account -> direct naar login.html!
if (beveiligd.includes(pad) && !gebruiker()) {
  location.replace('login.html');
}

// -----------------------------------------------------------------------------
// STAP 3: Uitloggen knop
// -----------------------------------------------------------------------------
$('#uitloggen')?.addEventListener('click', e => {
  e.preventDefault();
  LS.removeItem('gebruiker');
  sessionStorage.removeItem('pasAangemeld');
  location.href = 'index.html';
});

// Aanmelden: foto-voorbeeld
let fotoData = null;
$('#foto')?.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    fotoData = r.result;
    const i = $('#voorbeeld');
    if (i) {
      i.src = fotoData;
      i.className = 'foto';
    }
  };
  r.readAsDataURL(f);
});

// -----------------------------------------------------------------------------
// STAP 4: Eerst aanmelden (Gegevens worden opgeslagen in MySQL database)
// -----------------------------------------------------------------------------
$('#aanmeldForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = new FormData(e.target);
  const gebruikersnaam = (d.get('gebruiker') || '').trim();
  const wachtwoord = d.get('wachtwoord');
  const foutEl = $('#fout');
  if (foutEl) foutEl.textContent = '';

  try {
    // Stuur gegevens naar backend om op te slaan in MySQL
    const res = await fetch('/api/registreren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gebruikersnaam, wachtwoord })
    });
    const data = await res.json();

    if (!data.success) {
      if (foutEl) foutEl.textContent = data.fout || 'Fout bij registreren.';
      return;
    }

    // Gegevens zijn succesvol in de MySQL database opgeslagen!
    // Bewaar tijdelijk de gebruikersnaam zodat we die kunnen voorinvullen op de inlogpagina
    sessionStorage.setItem('pasAangemeld', gebruikersnaam);

    // Stuur de speler door naar login.html om nu in te loggen met gebruikersnaam en wachtwoord!
    location.href = 'login.html?aangemeld=1';
  } catch (err) {
    console.error('Fout bij registreren:', err);
    if (foutEl) foutEl.textContent = 'Kon geen verbinding maken met de server.';
  }
});

// -----------------------------------------------------------------------------
// STAP 5: Inloggen met gebruikersnaam en wachtwoord (gecontroleerd in MySQL)
// -----------------------------------------------------------------------------
$('#loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const d = new FormData(e.target);
  const gebruikersnaam = (d.get('gebruiker') || '').trim();
  const wachtwoord = d.get('wachtwoord');
  const foutEl = $('#fout');
  if (foutEl) foutEl.textContent = '';

  try {
    // Controleer inloggegevens in de MySQL database via de server
    const res = await fetch('/api/inloggen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gebruikersnaam, wachtwoord })
    });
    const data = await res.json();

    if (!data.success) {
      if (foutEl) {
        if (data.code === 'GEEN_ACCOUNT') {
          foutEl.innerHTML = `⚠️ ${data.fout} <br><a href="aanmelden.html" style="color:#ffd54a; text-decoration:underline; font-weight:bold;">Meld je hier direct aan</a>`;
        } else {
          foutEl.textContent = '❌ ' + (data.fout || 'Onjuiste gebruikersnaam of wachtwoord.');
        }
      }
      return;
    }

    // Succesvol ingelogd via MySQL! Bewaar de ingelogde sessie in localStorage
    LS.setItem('gebruiker', JSON.stringify({
      ...data.gebruiker,
      foto: fotoData
    }));

    // Ga door naar de speelpagina
    location.href = 'spelen.html';
  } catch (err) {
    console.error('Fout bij inloggen:', err);
    if (foutEl) foutEl.textContent = 'Kon geen verbinding maken met de server.';
  }
});

// -----------------------------------------------------------------------------
// STAP 6: Speelpagina en Profielfuncties
// -----------------------------------------------------------------------------
const vrienden = [{ naam: 'GrootmeesterNL', elo: 1500 }, { naam: 'SchaakKoning', elo: 1450 }];
const historie = [
  { naam: 'GrootmeesterNL', elo: 1500, punten: -8 },
  { naam: 'SchaakKoning', elo: 1450, punten: 8 }
];
const pion = `<div class="pion"><img src="img/pion.png" alt=""></div>`;
const tijdKnoppen = `
  <button class="klein" data-tijd="10">10 min</button>
  <button class="klein" data-tijd="5">5 min</button>
  <button class="klein" data-tijd="3">3 min</button>
`;

function vulSpelen() {
  const g = gebruiker();
  // Als je niet bent ingelogd, ga naar login
  if (!g) {
    location.replace('login.html');
    return;
  }

  const v = $('#vriendenLijst');
  if (v) {
    v.innerHTML = vrienden.map(f => `
      <div class="rij">
        ${pion}
        <div class="info">
          <span>${f.naam} (${f.elo})</span>
          ${tijdKnoppen}
        </div>
      </div>
    `).join('');
  }

  const h = $('#geschiedenis');
  if (h) {
    h.innerHTML = historie.map(g => `
      <div class="rij">
        <div class="gesch">
          <div class="pion" style="width:80px;height:80px">
            <img src="img/pion.png" style="width:44px" alt="">
          </div>
          <div class="punten">
            <span class="teken ${g.punten < 0 ? 'min' : 'plus'}">${g.punten < 0 ? '−' : '+'}</span>
            ${g.punten < 0 ? '-' : '+'}${Math.abs(g.punten)}
          </div>
        </div>
        <div class="info">
          <span>${g.naam} (${g.elo})</span>
          <button class="klein" data-actie="rematch">Rematch</button>
          <button class="klein" data-actie="verzoek">Vriendverzoek</button>
        </div>
      </div>
    `).join('');
  }

  // Privékamer aanmaken
  $('#maakKamerKnop')?.addEventListener('click', () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    location.href = `chess.html?kamer=${code}&tijd=10`;
  });

  // Privékamer joinen
  $('#joinKamerKnop')?.addEventListener('click', () => {
    const code = ($('#kamerCodeInvoer')?.value || '').trim().toUpperCase();
    if (!code) {
      melding('Vul eerst een kamercode in');
      return;
    }
    location.href = `chess.html?kamer=${code}`;
  });
}

// Klik events op tijd-knoppen (3 min, 10 min, etc.)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tijd],[data-actie]');
  if (!b) return;

  if (b.dataset.actie === 'verzoek') {
    melding('Vriendverzoek verstuurd');
  } else if (b.dataset.actie === 'rematch') {
    location.href = 'chess.html?tijd=10';
  } else if (b.dataset.tijd !== undefined) {
    location.href = 'chess.html?tijd=' + b.dataset.tijd;
  }
});

function vulProfiel() {
  const g = gebruiker();
  if (!g) {
    location.replace('login.html');
    return;
  }
  const pNaam = $('#pNaam');
  const pElo = $('#pElo');
  const pFoto = $('#pFoto');
  if (pNaam) pNaam.textContent = g.naam;
  if (pElo) pElo.textContent = g.elo || 1200;
  if (g.foto && pFoto) {
    pFoto.src = g.foto;
    pFoto.className = 'foto';
    pFoto.style.cssText = 'width:100%;height:100%;object-fit:cover';
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
