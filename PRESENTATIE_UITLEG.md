# ♟️ Schaakgame met WebSockets - Presentatie & Render Handleiding

Welkom! Dit project is speciaal gebouwd zodat jij precies begrijpt hoe alles werkt en het met trots kunt presenteren. Alle code is simpel gehouden en voorzien van duidelijke Nederlandse comments.

---

## 🚀 Inhoudsopgave
1. [Hoe werkt de game? (In het kort)](#1-hoe-werkt-de-game-in-het-kort)
2. [Wat zijn WebSockets en waarom gebruiken we ze?](#2-wat-zijn-websockets-en-waarom-gebruiken-we-ze)
3. [Uitleg van de code (Voor je presentatie)](#3-uitleg-van-de-code-voor-je-presentatie)
   - `server.js` (De backend server)
   - `game.js` (De frontend logica)
   - Schaakklok (3 min en 10 min)
   - Random toewijzing van Wit en Zwart
4. [Lokaal testen op twee schermen/tabbladen](#4-lokaal-testen-op-twee-schermen)
5. [Stap-voor-stap online zetten met Render](#5-stap-voor-stap-online-zetten-met-render)

---

## 1. Hoe werkt de game? (In het kort)
- Twee spelers openen de website op hun eigen scherm (bijv. computer, laptop of telefoon).
- Op `spelen.html` kies je voor **3 minuten** (snelschaak) of **10 minuten** (rapid).
- Zodra twee spelers dezelfde tijd kiezen (of elkaars kamercode delen), start het spel:
  - **Random kleuren:** De server loot met 50/50 kans wie Wit (♔) en wie Zwart (♚) is.
  - **Gedraaid bord:** Speel je met Zwart? Dan draait het bord automatisch om zodat jouw stukken altijd onderaan staan!
  - **Schaakklok:** Beide spelers starten met exact 3:00 of 10:00 minuten. Zodra iemand aan de beurt is, telt de klok elke seconde af.
  - **Realtime:** Zodra Speler A een zet doet, verschijnt deze binnen milliseconden op het scherm van Speler B.
  - **Live Chat:** Je kunt realtime chatten met je tegenstander.

---

## 2. Wat zijn WebSockets en waarom gebruiken we ze?
> **Spiekbriefje voor je presentatie:**
> *"Normaal internetverkeer (HTTP) werkt als een vraag-en-antwoord: de browser vraagt iets aan de server, de server geeft antwoord en verbreekt de verbinding. Bij een multiplayer game zoals schaken werkt dat niet goed, want als mijn tegenstander een zet doet, moet ik dat DIRECT zien zonder dat ik mijn pagina hoef te verversen.*
> 
> *Daarom gebruiken we **WebSockets**. Een WebSocket is een 'open telefoonlijn' tussen de browser en de server. De verbinding blijft continu open. Zodra speler 1 een zet doet, stuurt de server dat meteen door naar speler 2!"*

---

## 3. Uitleg van de code (Voor je presentatie)

### A. `server.js` (Backend met Node.js, Express & ws)
In `server.js` regelen we de centrale spelregie:
1. **Express webserver:** Serveert alle bestanden (`app.use(express.static(__dirname))`). Render gebruikt hiervoor `process.env.PORT`.
2. **WebSocket Server (`wss`):** Luistert naar binnenkomende verbindingen van spelers.
3. **Matchmaking & Kamers (`wachtrijen`):**
   - Als iemand klikt op 3 minuten, kijkt de server of er al iemand wacht in de wachtrij van 3 min.
   - Zo ja: match maken en spel starten!
4. **Random Wit of Zwart (`Math.random() < 0.5`):**
   - De server kiest willekeurig wie wit en wie zwart is:
     ```javascript
     const speler1IsWit = Math.random() < 0.5;
     const spelerWit = speler1IsWit ? speler1 : speler2;
     const spelerZwart = speler1IsWit ? speler2 : speler1;
     ```
5. **De Schaakklok (`startSchaakKlok`):**
   - De server start een `setInterval` die elke seconde 1 seconde aftrekt van de speler die aan de beurt is.
   - Als de tijd 0 bereikt, roept de server de winnaar uit!

### C. MySQL Database & Inloggen (`server.js` & `database.sql`)
1. **Database Schema:** We gebruiken de database `schaak_db` met de tabel `gebruikers`.
   - Velden: `id`, `gebruikersnaam`, `wachtwoord`, `elo`, `gewonnen`, `verloren`, `remise`, `aangemaakt_op`.
2. **Automatische Verbinding:** Zodra `server.js` start, verbindt hij met XAMPP MySQL op poort 3306 en maakt de tabel automatisch aan als deze nog niet bestaat!
3. **Inloggen & Registreren APIs:**
   - `/api/registreren`: Controleert of de naam al bestaat en slaat het nieuwe account op in MySQL.
   - `/api/inloggen`: Controleert gebruikersnaam en wachtwoord in de database.
   - Bij winst, verlies of remise worden de statistieken en ELO-punten van de spelers direct bijgewerkt in MySQL!
4. **phpMyAdmin:** Je kunt de gebruikers en uitslagen direct bekijken via `http://localhost/phpmyadmin` in de tabel `gebruikers`.
2. **Bord tekenen (`tekenSchaakbord`):**
   - Maakt de 64 velden (a8 t/m h1).
   - Als jij Zwart bent, draait de functie de rijen en kolommen om!
   - Tekent de schaakstukken met mooie SVG's uit de map `img/stukken/`.
3. **Zetten doen (`klikOpVeld`):**
   - Klik op een eigen stuk -> toont gele achtergrond en stippen op geldige velden.
   - Klik op een doelveld -> stuurt `{ type: 'zet', van: 'e2', naar: 'e4' }` naar de server.
4. **Klok updaten:** Toont netjes `MM:SS` (bijvoorbeeld `03:00` of `09:45`).
5. **Chat:** Luistert naar het chatformulier en stuurt berichtjes door.

---

## 4. Lokaal testen op twee schermen / tabbladen

### Stap 1: Start de server
Open je terminal in deze map en voer uit:
```bash
node server.js
```
Je ziet dan:
```
===============================================
 Schaakserver draait op: http://localhost:3000
 WebSocket luistert op dezelfde poort
===============================================
```

### Stap 2: Open twee tabbladen
1. Open in Chrome tabblad 1: `http://localhost:3000/spelen.html`
2. Open in een Incognito-venster (of ander tabblad) tabblad 2: `http://localhost:3000/spelen.html`
3. Klik in **beide** tabbladen op **"⚡ 3 min"** (of allebei op **"⏱️ 10 min"**).
4. **BAM!** De game start automatisch:
   - Eén tabblad is Wit, het andere is Zwart (volledig random!).
   - Beide klokken staan op 03:00 (of 10:00).
   - Doe een zet in het ene scherm, en zie hem direct bewegen in het andere scherm!

---

## 5. Stap-voor-stap online zetten met Render

Render is een gratis hostingplatform waar Node.js applicaties perfect op draaien.

### Stap 1: Zet je project op GitHub
1. Maak een gratis account op [GitHub.com](https://github.com) (als je dat nog niet hebt).
2. Maak een nieuwe repository aan (bijv. `schaakgame`).
3. Upload alle bestanden uit deze map naar je repository (of via Git terminal):
   ```bash
   git init
   git add .
   git commit -m "Schaakgame met WebSockets en klokken"
   git branch -M main
   git remote add origin https://github.com/JOUW_GEBRUIKERSNAAM/schaakgame.git
   git push -u origin main
   ```
   *(Let op: de map `node_modules` hoef je niet te uploaden, dat regelt Render automatisch via package.json!)*

### Stap 2: Maak een Web Service aan op Render
1. Ga naar [https://render.com](https://render.com) en log in (bijv. via je GitHub-account).
2. Klik op **"New +"** en kies **"Web Service"**.
3. Selecteer je GitHub repository (`schaakgame`).
4. Vul de instellingen in:
   - **Name:** `mijn-schaakgame` (of een naam naar keuze)
   - **Region:** Frankfurt (EU) (lekker snel voor Nederland)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start` *(of `node server.js`)*
   - **Instance Type:** `Free`
5. Klik onderaan op **"Create Web Service"**.

### Stap 3: Klaar!
Binnen 1 à 2 minuten staat je website online op een link zoals:
`https://mijn-schaakgame.onrender.com`

Stuur deze link naar je vriend of docent, en jullie kunnen direct vanaf twee verschillende laptops of telefoons tegen elkaar schaken! 🏆
