# Asseturi vizual și audio

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Direcția vizuală și sunetul

Propunere de direcție: oraș american stilizat cu clădiri joase, bulevarde, palmieri sau vegetație potrivită, benzinărie, zone comerciale și rezidențiale. Formele și texturile sunt stilizate, lizibile și coerente cu identitatea proprie a orașului. Vehiculele, clădirile, iconurile și sunetele sunt asseturi originale sau selectate pentru acest proiect.

Grafica pune în evidență semafoarele, benzile, distanțele și comportamentul. Un overlay de analiză poate afișa banda, ținta de viteză, liderul, spațiul urmărit și următoarea decizie; este o unealtă opțională, nu un obstacol în timpul cursei.

Camera din spate urmărește vehiculul cu amortizare, adaptare la viteză și evitare a obstacolelor. Schimbarea taxiului mută camera cu o tranziție scurtă și arată imediat ID-ul și modul. Mișcarea camerei și intensitatea feedbackului sunt reglabile.

Sunetul include motor, variație cu sarcina, anvelope, frâne, coliziuni, claxon și notificări distincte pentru preluarea controlului și publicarea profilului. Jocul pornește audio după o interacțiune a jucătorului și oferă controale separate de volum. Informațiile esențiale sunt disponibile și vizual.

## Pipeline de asseturi

Fiecare asset are ID, tip, versiune/hash, rol critic/opțional, sursă și licență. Buildul include manifestul și fișierele WASM necesare. Asseturile auto păstrează pivoturile roților, scara și rădăcina entityId. Orașul folosește LOD și instanțiere numai după măsurare și verificarea selecției.

Scenele de gameplay folosesc asseturi simple în prototip, apoi se înlocuiesc prin registry fără a modifica semantica rutieră. V1 reprezintă pasagerii simplificat; pietonii autonomi V2 și personajul V3 au asseturi și animații distincte.

## Admiterea asseturilor finale

145/146 depind de gate-ul de flotă 220 și bugetele 223. Manifestul include costuri transferate/decodate, texturi estimate, LOD/materiale, decodere/WASM și startup critic separat de decorul opțional. Batchurile statice sunt locale; calitatea nu schimbă colliderele sau simularea. Audio are plafon de voci și reutilizare/disposal. 150 verifică automat manifestul și capacitățile conform [modulului 25](25-performanta-contracte-si-benchmark.md).

## Decor destructibil și feedback V1

Registry-ul include arhetipuri intacte/deteriorate pentru garduri ușoare, conuri, lăzi, pubele, indicatoare decorative și mobilier stradal, cu sunete de material, fragmente plafonate și ownership clar. [Modulul 26](26-joaca-libera-haos-si-distrugere.md) fixează coliziunile, starea persistentă, resetul și limitele; [modulul 27](27-reglaje-hud-si-camera.md) fixează camera first-person și intensitatea feedbackului. Pasagerii provocărilor sunt reprezentați simplificat, fără dependență de mers pe jos sau pietoni V2.
