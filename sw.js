const C='chess-v2',F=['index.html','login.html','aanmelden.html','spelen.html','vrienden.html','profiel.html','chess.html','style.css','app.js','img/logo.png','img/pion.png','img/patroon.png','img/achtergrond.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(F))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
