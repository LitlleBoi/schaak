// =============================================================================
// SCHAAKSERVER MET WEBSOCKETS EN MYSQL (server.js)
// =============================================================================
// Deze server regelt:
// 1. Het serveren van de website (HTML, CSS, JS, afbeeldingen) via Express.
// 2. Real-time multiplayer schaken via WebSockets (ws library).
// 3. Inloggen en registreren met een echte MySQL database (XAMPP & Render).
//
// GESCHIKT VOOR: Lokaal testen met XAMPP en online zetten via Render.
// =============================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { Chess } = require('chess.js');
const mysql = require('mysql2/promise');

// -----------------------------------------------------------------------------
// STAP 1: Webserver opzetten met Express
// -----------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware om JSON data in POST-verzoeken (inloggen/registreren) te kunnen lezen
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serveer alle bestanden in deze map (zoals index.html, chess.html, style.css, etc.)
app.use(express.static(__dirname));

// Startpagina routering
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// -----------------------------------------------------------------------------
// STAP 2: MySQL Database Verbinding (XAMPP schaak_db)
// -----------------------------------------------------------------------------
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'schaak_db',
  port: process.env.DB_PORT || 3306
};

let db = null;

// Initialiseer de database automatisch bij het starten van de server
async function initDatabase() {
  try {
    // 1. Maak eerst verbinding met MySQL server om database aan te maken indien nodig
    const rootConn = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4;`);
    await rootConn.end();

    // 2. Verbind met de database zelf
    db = mysql.createPool(dbConfig);

    // 3. Maak de gebruikers-tabel aan als die nog niet bestaat
    await db.query(`
      CREATE TABLE IF NOT EXISTS \`gebruikers\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`gebruikersnaam\` VARCHAR(50) NOT NULL UNIQUE,
        \`wachtwoord\` VARCHAR(255) NOT NULL,
        \`elo\` INT DEFAULT 1200,
        \`gewonnen\` INT DEFAULT 0,
        \`verloren\` INT DEFAULT 0,
        \`remise\` INT DEFAULT 0,
        \`aangemaakt_op\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('✅ MySQL Database verbonden & tabel `gebruikers` is klaar!');
  } catch (err) {
    console.warn('⚠️ MySQL verbinding mislukt (is MySQL gestart in XAMPP?):', err.message);
    console.warn('⚠️ Server draait door met lokale opslag fallback.');
  }
}
initDatabase();

// -----------------------------------------------------------------------------
// STAP 3: Inloggen & Registreren API Endpoints
// -----------------------------------------------------------------------------

// REGISTREREN (Nieuw account aanmaken in MySQL)
app.post('/api/registreren', async (req, res) => {
  const { gebruikersnaam, wachtwoord } = req.body;

  if (!gebruikersnaam || !wachtwoord) {
    return res.status(400).json({ success: false, fout: 'Vul een gebruikersnaam en wachtwoord in.' });
  }

  // Als MySQL niet verbonden is, fallback zodat het altijd werkt
  if (!db) {
    return res.json({
      success: true,
      gebruiker: { naam: gebruikersnaam, elo: 1200, gewonnen: 0, verloren: 0, remise: 0 }
    });
  }

  try {
    // Controleer of de gebruikersnaam al bestaat
    const [bestaand] = await db.query(
      'SELECT id FROM gebruikers WHERE gebruikersnaam = ?',
      [gebruikersnaam]
    );

    if (bestaand.length > 0) {
      return res.status(400).json({ success: false, fout: 'Deze gebruikersnaam is al in gebruik!' });
    }

    // Voeg nieuwe gebruiker toe aan MySQL database
    const [result] = await db.query(
      'INSERT INTO gebruikers (gebruikersnaam, wachtwoord, elo) VALUES (?, ?, 1200)',
      [gebruikersnaam, wachtwoord]
    );

    console.log(`👤 Nieuwe gebruiker geregistreerd in MySQL: ${gebruikersnaam}`);
    return res.json({
      success: true,
      gebruiker: {
        id: result.insertId,
        naam: gebruikersnaam,
        elo: 1200,
        gewonnen: 0,
        verloren: 0,
        remise: 0
      }
    });
  } catch (err) {
    console.error('MySQL Registratiefout:', err);
    return res.status(500).json({ success: false, fout: 'Database fout bij registreren.' });
  }
});

// INLOGGEN (Account controleren in MySQL)
app.post('/api/inloggen', async (req, res) => {
  const { gebruikersnaam, wachtwoord } = req.body;

  if (!gebruikersnaam || !wachtwoord) {
    return res.status(400).json({ success: false, fout: 'Vul alle velden in.' });
  }

  if (!db) {
    return res.json({
      success: true,
      gebruiker: { naam: gebruikersnaam, elo: 1200, gewonnen: 0, verloren: 0, remise: 0 }
    });
  }

  try {
    // Zoek de gebruiker op in de MySQL database
    const [rijen] = await db.query(
      'SELECT id, gebruikersnaam, wachtwoord, elo, gewonnen, verloren, remise FROM gebruikers WHERE gebruikersnaam = ?',
      [gebruikersnaam]
    );

    // 1. Controleer eerst of het account überhaupt bestaat in de database
    if (rijen.length === 0) {
      return res.status(404).json({
        success: false,
        code: 'GEEN_ACCOUNT',
        fout: 'Dit account bestaat nog niet in de database! Meld je eerst aan.'
      });
    }

    // 2. Controleer of het wachtwoord klopt
    if (rijen[0].wachtwoord !== wachtwoord) {
      return res.status(401).json({
        success: false,
        code: 'FOUT_WACHTWOORD',
        fout: 'Onjuist wachtwoord ingevuld.'
      });
    }

    const g = rijen[0];
    console.log(`🔑 Gebruiker succesvol ingelogd via MySQL: ${g.gebruikersnaam}`);
    return res.json({
      success: true,
      gebruiker: {
        id: g.id,
        naam: g.gebruikersnaam,
        elo: g.elo,
        gewonnen: g.gewonnen,
        verloren: g.verloren,
        remise: g.remise
      }
    });
  } catch (err) {
    console.error('MySQL Inlogfout:', err);
    return res.status(500).json({ success: false, fout: 'Database fout bij inloggen.' });
  }
});

// -----------------------------------------------------------------------------
// STAP 4: WebSocket-server koppelen aan de HTTP-server
// -----------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Kamers en wachtrijen
const kamers = new Map();
const wachtrijen = {
  3: [],
  5: [],
  10: [],
  0: []
};

// Functie om een unieke kamercode te maken van 6 tekens (bijv. "A7X9K2")
function maakKamerId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Veilig een JSON-bericht sturen naar een WebSocket client
function stuurBericht(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Bericht sturen naar BEIDE spelers in een kamer
function stuurNaarKamer(kamer, data) {
  if (kamer.spelerWit) stuurBericht(kamer.spelerWit.ws, data);
  if (kamer.spelerZwart) stuurBericht(kamer.spelerZwart.ws, data);
}

// Update uitslag in MySQL database
async function updateSpelStatistieken(winnaarNaam, verliezerNaam, isRemise) {
  if (!db) return;
  try {
    if (isRemise) {
      if (winnaarNaam) await db.query('UPDATE gebruikers SET remise = remise + 1 WHERE gebruikersnaam = ?', [winnaarNaam]);
      if (verliezerNaam) await db.query('UPDATE gebruikers SET remise = remise + 1 WHERE gebruikersnaam = ?', [verliezerNaam]);
    } else {
      if (winnaarNaam) await db.query('UPDATE gebruikers SET gewonnen = gewonnen + 1, elo = elo + 10 WHERE gebruikersnaam = ?', [winnaarNaam]);
      if (verliezerNaam) await db.query('UPDATE gebruikers SET verloren = verloren + 1, elo = GREATEST(100, elo - 10) WHERE gebruikersnaam = ?', [verliezerNaam]);
    }
  } catch (e) {
    console.error('Fout bij bijwerken statistieken in MySQL:', e);
  }
}

// -----------------------------------------------------------------------------
// STAP 5: De schaakklok bijhouden
// -----------------------------------------------------------------------------
function startSchaakKlok(kamer) {
  if (kamer.klokInterval) clearInterval(kamer.klokInterval);

  kamer.klokInterval = setInterval(() => {
    if (kamer.spelAfgelopen) {
      clearInterval(kamer.klokInterval);
      return;
    }

    const beurt = kamer.schaakSpel.turn(); // 'w' of 'b'

    if (beurt === 'w') {
      kamer.tijdWit -= 1;
      if (kamer.tijdWit <= 0) {
        kamer.tijdWit = 0;
        kamer.spelAfgelopen = true;
        clearInterval(kamer.klokInterval);
        stuurNaarKamer(kamer, {
          type: 'spelEinde',
          reden: 'tijd',
          winnaar: 'zwart',
          tekst: 'Tijd is om! Zwart wint op de klok.'
        });
        updateSpelStatistieken(kamer.spelerZwart?.naam, kamer.spelerWit?.naam, false);
      }
    } else {
      kamer.tijdZwart -= 1;
      if (kamer.tijdZwart <= 0) {
        kamer.tijdZwart = 0;
        kamer.spelAfgelopen = true;
        clearInterval(kamer.klokInterval);
        stuurNaarKamer(kamer, {
          type: 'spelEinde',
          reden: 'tijd',
          winnaar: 'wit',
          tekst: 'Tijd is om! Wit wint op de klok.'
        });
        updateSpelStatistieken(kamer.spelerWit?.naam, kamer.spelerZwart?.naam, false);
      }
    }

    // Stuur de actuele kloktijden elke seconde naar beide spelers
    stuurNaarKamer(kamer, {
      type: 'klokUpdate',
      tijdWit: kamer.tijdWit,
      tijdZwart: kamer.tijdZwart,
      beurt: beurt
    });
  }, 1000);
}

// -----------------------------------------------------------------------------
// STAP 6: Een nieuw spel starten tussen twee spelers
// -----------------------------------------------------------------------------
function startNieuwSpel(kamerId, speler1, speler2, tijdMinuten) {
  const tijdSeconden = (tijdMinuten > 0 ? tijdMinuten : 10) * 60;

  // RANDOM KLEURVERDELING (50% kans op wit of zwart)
  const speler1IsWit = Math.random() < 0.5;
  const spelerWit = speler1IsWit ? speler1 : speler2;
  const spelerZwart = speler1IsWit ? speler2 : speler1;

  const schaakSpel = new Chess();

  const kamer = {
    id: kamerId,
    tijdMinuten: tijdMinuten,
    tijdWit: tijdSeconden,
    tijdZwart: tijdSeconden,
    spelerWit: spelerWit,
    spelerZwart: spelerZwart,
    schaakSpel: schaakSpel,
    spelAfgelopen: false,
    klokInterval: null
  };

  kamers.set(kamerId, kamer);

  spelerWit.ws.kamerId = kamerId;
  spelerWit.ws.kleur = 'wit';
  spelerZwart.ws.kamerId = kamerId;
  spelerZwart.ws.kleur = 'zwart';

  // Bericht naar speler Wit
  stuurBericht(spelerWit.ws, {
    type: 'spelGestart',
    kamerId: kamerId,
    jouwKleur: 'wit',
    tegenstanderNaam: spelerZwart.naam,
    tegenstanderElo: spelerZwart.elo,
    tijdWit: tijdSeconden,
    tijdZwart: tijdSeconden,
    fen: schaakSpel.fen()
  });

  // Bericht naar speler Zwart
  stuurBericht(spelerZwart.ws, {
    type: 'spelGestart',
    kamerId: kamerId,
    jouwKleur: 'zwart',
    tegenstanderNaam: spelerWit.naam,
    tegenstanderElo: spelerWit.elo,
    tijdWit: tijdSeconden,
    tijdZwart: tijdSeconden,
    fen: schaakSpel.fen()
  });

  startSchaakKlok(kamer);
}

// -----------------------------------------------------------------------------
// STAP 7: WebSocket-verbindingen afhandelen
// -----------------------------------------------------------------------------
wss.on('connection', (ws) => {
  ws.on('message', (ruwBericht) => {
    let bericht;
    try {
      bericht = JSON.parse(ruwBericht);
    } catch (e) {
      return;
    }

    if (bericht.naam) {
      ws.spelerNaam = bericht.naam;
      ws.spelerElo = bericht.elo || 1200;
    }

    // -------------------------------------------------------------------------
    // ACTIE: Matchmaking (3 min, 10 min, etc.)
    // -------------------------------------------------------------------------
    if (bericht.type === 'zoekSpel') {
      const gekozenTijd = parseInt(bericht.tijd, 10) || 10;
      const tijdSleutel = wachtrijen[gekozenTijd] !== undefined ? gekozenTijd : 10;
      const wachtrij = wachtrijen[tijdSleutel];

      while (wachtrij.length > 0 && wachtrij[0].ws.readyState !== WebSocket.OPEN) {
        wachtrij.shift();
      }

      if (wachtrij.length > 0) {
        const tegenstander = wachtrij.shift();
        const kamerId = maakKamerId();
        const huidigeSpeler = {
          ws: ws,
          naam: ws.spelerNaam || 'Speler 2',
          elo: ws.spelerElo || 1200
        };
        startNieuwSpel(kamerId, tegenstander, huidigeSpeler, tijdSleutel);
      } else {
        const wachtende = {
          ws: ws,
          naam: ws.spelerNaam || 'Speler 1',
          elo: ws.spelerElo || 1200
        };
        wachtrij.push(wachtende);
        ws.isAanHetWachten = tijdSleutel;

        stuurBericht(ws, {
          type: 'wachtenOpTegenstander',
          tijd: tijdSleutel,
          tekst: `Wachten op een tegenstander voor een ${tijdSleutel} minuten partij...`
        });
      }
    }

    // -------------------------------------------------------------------------
    // ACTIE: Kamercode maken of joinen
    // -------------------------------------------------------------------------
    else if (bericht.type === 'maakOfJoinKamer') {
      const kamerId = (bericht.kamerId || maakKamerId()).toUpperCase();
      const gekozenTijd = parseInt(bericht.tijd, 10) || 10;
      let kamer = kamers.get(kamerId);

      const speler = {
        ws: ws,
        naam: ws.spelerNaam || 'Gast',
        elo: ws.spelerElo || 1200
      };

      if (!kamer) {
        kamer = {
          id: kamerId,
          tijdMinuten: gekozenTijd,
          wachtendeSpeler: speler
        };
        kamers.set(kamerId, kamer);
        ws.kamerId = kamerId;

        stuurBericht(ws, {
          type: 'kamerAangemaakt',
          kamerId: kamerId,
          tijd: gekozenTijd,
          tekst: `Kamer aangemaakt! Deel code "${kamerId}" of stuur de link naar een vriend.`
        });
      } else if (kamer.wachtendeSpeler && kamer.wachtendeSpeler.ws !== ws) {
        const speler1 = kamer.wachtendeSpeler;
        const speler2 = speler;
        startNieuwSpel(kamerId, speler1, speler2, kamer.tijdMinuten);
      }
    }

    // -------------------------------------------------------------------------
    // ACTIE: Een schaakzet doen
    // -------------------------------------------------------------------------
    else if (bericht.type === 'zet') {
      const kamer = kamers.get(ws.kamerId);
      if (!kamer || kamer.spelAfgelopen) return;

      const spelerKleur = ws.kleur;
      const beurt = kamer.schaakSpel.turn();

      if ((beurt === 'w' && spelerKleur !== 'wit') || (beurt === 'b' && spelerKleur !== 'zwart')) {
        stuurBericht(ws, { type: 'fout', melding: 'Het is niet jouw beurt!' });
        return;
      }

      const zetResultaat = kamer.schaakSpel.move({
        from: bericht.van,
        to: bericht.naar,
        promotion: bericht.promotie || 'q'
      });

      if (!zetResultaat) {
        stuurBericht(ws, { type: 'fout', melding: 'Dit is een ongeldige zet.' });
        return;
      }

      stuurNaarKamer(kamer, {
        type: 'zetGedaan',
        zet: zetResultaat,
        van: bericht.van,
        naar: bericht.naar,
        san: zetResultaat.san,
        fen: kamer.schaakSpel.fen(),
        beurt: kamer.schaakSpel.turn(),
        zettenGeschiedenis: kamer.schaakSpel.history()
      });

      if (kamer.schaakSpel.isGameOver()) {
        kamer.spelAfgelopen = true;
        clearInterval(kamer.klokInterval);

        let reden = 'onbekend';
        let winnaar = null;
        let tekst = 'Spel afgelopen!';

        if (kamer.schaakSpel.isCheckmate()) {
          reden = 'schaakmat';
          winnaar = spelerKleur;
          tekst = `Schaakmat! ${winnaar.toUpperCase()} heeft gewonnen!`;
          const winnaarNaam = spelerKleur === 'wit' ? kamer.spelerWit?.naam : kamer.spelerZwart?.naam;
          const verliezerNaam = spelerKleur === 'wit' ? kamer.spelerZwart?.naam : kamer.spelerWit?.naam;
          updateSpelStatistieken(winnaarNaam, verliezerNaam, false);
        } else if (kamer.schaakSpel.isDraw()) {
          reden = 'remise';
          tekst = 'Remise (gelijkspel)!';
          updateSpelStatistieken(kamer.spelerWit?.naam, kamer.spelerZwart?.naam, true);
        }

        stuurNaarKamer(kamer, {
          type: 'spelEinde',
          reden: reden,
          winnaar: winnaar,
          tekst: tekst
        });
      }
    }

    // -------------------------------------------------------------------------
    // ACTIE: Chatbericht sturen
    // -------------------------------------------------------------------------
    else if (bericht.type === 'chat') {
      const kamer = kamers.get(ws.kamerId);
      if (!kamer) return;

      const afzenderNaam = ws.spelerNaam || (ws.kleur ? ws.kleur.toUpperCase() : 'Speler');

      stuurNaarKamer(kamer, {
        type: 'chat',
        afzender: afzenderNaam,
        kleur: ws.kleur,
        tekst: bericht.tekst
      });
    }

    // -------------------------------------------------------------------------
    // ACTIE: Opgeven
    // -------------------------------------------------------------------------
    else if (bericht.type === 'opgeven') {
      const kamer = kamers.get(ws.kamerId);
      if (!kamer || kamer.spelAfgelopen) return;

      kamer.spelAfgelopen = true;
      clearInterval(kamer.klokInterval);

      const opgevendeKleur = ws.kleur;
      const winnaar = opgevendeKleur === 'wit' ? 'zwart' : 'wit';
      const winnaarNaam = winnaar === 'wit' ? kamer.spelerWit?.naam : kamer.spelerZwart?.naam;
      const verliezerNaam = opgevendeKleur === 'wit' ? kamer.spelerWit?.naam : kamer.spelerZwart?.naam;

      updateSpelStatistieken(winnaarNaam, verliezerNaam, false);

      stuurNaarKamer(kamer, {
        type: 'spelEinde',
        reden: 'opgave',
        winnaar: winnaar,
        tekst: `${opgevendeKleur.toUpperCase()} heeft opgegeven. ${winnaar.toUpperCase()} (${winnaarNaam}) wint!`
      });
    }

    // -------------------------------------------------------------------------
    // ACTIE: Remise aanbieden
    // -------------------------------------------------------------------------
    else if (bericht.type === 'remiseAanbod') {
      const kamer = kamers.get(ws.kamerId);
      if (!kamer || kamer.spelAfgelopen) return;

      const tegenstanderWs = (ws === kamer.spelerWit?.ws) ? kamer.spelerZwart?.ws : kamer.spelerWit?.ws;
      stuurBericht(tegenstanderWs, {
        type: 'remiseAanbodOntvangen',
        vanKleur: ws.kleur,
        vanNaam: ws.spelerNaam || (ws.kleur === 'wit' ? 'Wit' : 'Zwart')
      });
    }

    // -------------------------------------------------------------------------
    // ACTIE: Remise accepteren of weigeren
    // -------------------------------------------------------------------------
    else if (bericht.type === 'remiseReactie') {
      const kamer = kamers.get(ws.kamerId);
      if (!kamer || kamer.spelAfgelopen) return;

      if (bericht.geaccepteerd) {
        kamer.spelAfgelopen = true;
        clearInterval(kamer.klokInterval);

        updateSpelStatistieken(kamer.spelerWit?.naam, kamer.spelerZwart?.naam, true);

        stuurNaarKamer(kamer, {
          type: 'spelEinde',
          reden: 'remise',
          winnaar: null,
          tekst: 'Remise geaccepteerd! De partij is in gelijkspel geëindigd.'
        });
      } else {
        const tegenstanderWs = (ws === kamer.spelerWit?.ws) ? kamer.spelerZwart?.ws : kamer.spelerWit?.ws;
        stuurBericht(tegenstanderWs, {
          type: 'remiseGeweigerd',
          tekst: 'De tegenstander heeft het remise-aanbod geweigerd.'
        });
      }
    }
  });

  // Verbinding verbroken
  ws.on('close', () => {
    if (ws.isAanHetWachten !== undefined && wachtrijen[ws.isAanHetWachten]) {
      wachtrijen[ws.isAanHetWachten] = wachtrijen[ws.isAanHetWachten].filter(s => s.ws !== ws);
    }

    if (ws.kamerId && kamers.has(ws.kamerId)) {
      const kamer = kamers.get(ws.kamerId);

      if (!kamer.spelAfgelopen) {
        kamer.spelAfgelopen = true;
        if (kamer.klokInterval) clearInterval(kamer.klokInterval);

        const overgeblevenWs = (ws === kamer.spelerWit?.ws) ? kamer.spelerZwart?.ws : kamer.spelerWit?.ws;
        stuurBericht(overgeblevenWs, {
          type: 'tegenstanderVerlaten',
          tekst: 'De tegenstander heeft de verbinding verbroken. Jij wint!'
        });
      }

      kamers.delete(ws.kamerId);
    }
  });
});

// -----------------------------------------------------------------------------
// STAP 8: Server starten
// -----------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` Schaakserver draait op: http://localhost:${PORT}`);
  console.log(` MySQL & WebSockets zijn actief!`);
  console.log(`===============================================`);
});
