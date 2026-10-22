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

[Pasagerii simplificați 147](passenger-visual.md) fixează reprezentarea V1 ca read model vizual peste starea reală 061 și ancorele reale 032: fazele `WAITING_PICKUP`/`BOARDING`/`ONBOARD`/`DROPPING_OFF`, ocuparea 0/1 și markerii `PICKUP`/`PASSENGER`/`DROPOFF` identificați stabil prin `rideId + rol`. Prezentarea nu schimbă cursa și nu creează pietoni, telemetrie sau oportunități; un asset 3D final și sistemul de pietoni V2 rămân separate.

## Admiterea asseturilor finale

145/146 depind de gate-ul de flotă 220 și bugetele 223. Manifestul include costuri transferate/decodate, texturi estimate, LOD/materiale, decodere/WASM și startup critic separat de decorul opțional. Batchurile statice sunt locale; calitatea nu schimbă colliderele sau simularea. Audio are plafon de voci și reutilizare/disposal. 150 verifică automat manifestul și capacitățile conform [modulului 25](25-performanta-contracte-si-benchmark.md).

## Vehicule 145: două clase vizuale, pivoturi și LOD

Sedanul și compactul au o definiție vizuală derivată din mecanica 023: patru pivoturi de roată la `x = ±track/2`, `z = ±wheelbase/2` și `y = connection(-0,15) - rest(0,35)`, cu raza clasei. Roțile din față virează în jurul lui +Y, toate se rotesc în jurul lui +X, iar poziția de suspensie din proiecția fizică (023/028) este aplicată pe pivot, nu inventată. Geometria este procedurală, originală, în cadrele documentate (+Z înainte, +X dreapta) și se grupează pe material: caroserie cu culori de vârf, faruri, stopuri, frână și semnalizare. Cele patru roți ale unui vehicul folosesc o singură sursă instanțiată, deci un singur draw call pentru roți.

LOD are trei niveluri (`NEAR`/`MID`/`FAR`) cu histerezis de 5 m, la distanțe dependente de preset (LOW 30/70, MEDIUM 40/85, HIGH 55/110). Schimbarea nivelului numai ascunde grupuri de prezentare: nodurile, pivoturile, colliderul 023 (`cuboid(0.85, 0.3, 2)`) și maparea `entityId` rămân identice. `vehicleAssetManifest` admite șapte definiții (șase seturi de geometrie + materialele partajate) sub capurile 223, cu transfer runtime zero și texturi zero; sursele/licențele sunt inventariate în `vehicleAssetInventory`. Dovezile de măsurare pe 24 de instanțe dinamice sunt în [Docs/Evidence/145-vehicle-assets](Evidence/145-vehicle-assets/README.md).

## Decor destructibil și feedback V1

Registry-ul include arhetipuri intacte/deteriorate pentru garduri ușoare, conuri, lăzi, pubele, indicatoare decorative și mobilier stradal, cu sunete de material, fragmente plafonate și ownership clar. [Modulul 26](26-joaca-libera-haos-si-distrugere.md) fixează coliziunile, starea persistentă, resetul și limitele; [modulul 27](27-reglaje-hud-si-camera.md) fixează camera first-person și intensitatea feedbackului. Pasagerii provocărilor sunt reprezentați simplificat, fără dependență de mers pe jos sau pietoni V2.
