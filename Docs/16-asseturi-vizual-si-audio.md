# Asseturi vizual și audio

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Direcția vizuală și sunetul

Propunere de direcție: oraș american stilizat cu clădiri joase, bulevarde, palmieri sau vegetație potrivită, benzinărie, zone comerciale și rezidențiale. Formele și texturile sunt lizibile și coerente cu atmosfera unui joc din perioada GTA San Andreas. Vehiculele, clădirile, iconurile și sunetele sunt asseturi originale sau selectate pentru acest proiect.

Grafica pune în evidență semafoarele, benzile, distanțele și comportamentul. Un overlay de analiză poate afișa banda, ținta de viteză, liderul, spațiul urmărit și următoarea decizie; este o unealtă opțională, nu un obstacol în timpul cursei.

Camera din spate urmărește vehiculul cu amortizare, adaptare la viteză și evitare a obstacolelor. Schimbarea taxiului mută camera cu o tranziție scurtă și arată imediat ID-ul și modul. Mișcarea camerei și intensitatea feedbackului sunt reglabile.

Sunetul include motor, variație cu sarcina, anvelope, frâne, coliziuni, claxon și notificări distincte pentru preluarea controlului și publicarea profilului. Jocul pornește audio după o interacțiune a jucătorului și oferă controale separate de volum. Informațiile esențiale sunt disponibile și vizual.

## Pipeline de asseturi

Fiecare asset are ID, tip, versiune/hash, rol critic/opțional, sursă și licență. Buildul include manifestul și fișierele WASM necesare. Asseturile auto păstrează pivoturile roților, scara și rădăcina entityId. Orașul folosește LOD și instanțiere numai după măsurare și verificarea selecției.

Scenele de gameplay folosesc asseturi simple în prototip, apoi se înlocuiesc prin registry fără a modifica semantica rutieră. V1 reprezintă pasagerii simplificat; pietonii autonomi V2 și personajul V3 au asseturi și animații distincte.
