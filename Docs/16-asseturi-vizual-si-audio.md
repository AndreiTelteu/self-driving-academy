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

## Cartier 146: decor procedural și batchuri locale

Decorul înlocuiește suprafețele goale cu mobilier stradal american stilizat: stâlpi de iluminat, copaci, bănci, hidranți, pubele, parcometre, indicatoare și adăposturi de stație. Plasarea este derivată exclusiv din layout-ul 042: numai pe ribonurile de trotuar și pe trotuarul cel mai apropiat de fiecare zonă de serviciu, cu pas determinist pe tip, offset lateral în lățimea trotuarului și respingere la orice intersecție cu banda, marcaj, intersecție, trecere, linie de stop sau clădire. Harta, rețeaua rutieră și zonele rămân neschimbate; decorul nu creează collidere.

Geometria este originală și procedurală (cutii cu normale plate, cilindri/conuri cu 8 segmente, culori de vârf, un singur material partajat), fără texturi. Fiecare item primește celula spațială de 120 m, iar geometria este fuzionată într-un mesh pe celulă: 1.585 de itemuri ajung în 36 de batchuri locale, 81.620 vârfuri, ≈4,35 MB estimați, 0 texturi. `cityDecorManifest` admite nouă definiții sub capurile 223, iar `cityDecorInventory` păstrează sursa/licența fiecărui tip. Costul total al scenei integrate (042 + decor) este raportat explicit în [Docs/Evidence/146-city-assets](Evidence/146-city-assets/README.md), inclusiv limita de draw calls moștenită din mesh-urile per-bandă ale lui 042.

## Decor destructibil și feedback V1

Registry-ul include arhetipuri intacte/deteriorate pentru garduri ușoare, conuri, lăzi, pubele, indicatoare decorative și mobilier stradal, cu sunete de material, fragmente plafonate și ownership clar. [Modulul 26](26-joaca-libera-haos-si-distrugere.md) fixează coliziunile, starea persistentă, resetul și limitele; [modulul 27](27-reglaje-hud-si-camera.md) fixează camera first-person și intensitatea feedbackului. Pasagerii provocărilor sunt reprezentați simplificat, fără dependență de mers pe jos sau pietoni V2.

## Contractul audio 148: motor, frâne, anvelope și impact

[148](16-asseturi-vizual-si-audio.md) implementează motorul audio în `src/audio/`: contracte, port de backend, adaptor Web Audio, driver fals determinist și puntea cu evenimentele 028. Sunetele sunt legate de **viteză**, **sarcină** și **contactele fizice**: motorul primește `speedMps`, `loadFactor`, `brakeFactor`, `slipFactor` și `distanceM` pe vehicul, iar impactul vine din evenimentul `COLLISION` publicat de adaptorul 028.

**Pornire după gest.** Contextul audio nu există înainte de interacțiunea jucătorului. Starea motorului este `IDLE` (fără context), `SUSPENDED` (context creat, neproductiv), `RUNNING` (grafic activ) sau `CLOSED`. Doar `startFromUserGesture('POINTER' | 'KEYBOARD' | 'TOUCH')` creează contextul și îl reia; orice alt declanșator este respins. Înainte de gest, actualizările vehiculelor sunt marcate `SKIPPED` și impactele sunt refuzate cu `AWAITING_GESTURE`: nimic nu sună pe fond.

**Volume separate.** Mixerul are patru controale independente: `master` și trei bus-uri de categorie — `engine` (motor, anvelope, frâne), `impact` (coliziuni) și `ui` (notificări de preluare a controlului și de publicare a profilului, plus semnalele UI). Câștigul aplicat este `master × categorie`, iar `muted` este comutatorul global de ieșire. Valorile sunt preferințe de runtime și persistă prin setările 009 în grupul `RuntimeSettings.audio`; o modificare de volum nu este o schimbare de control și nu cere o revizie nouă a preferințelor de control.

**Mute izolat.** `setMuted(true)` pune câștigul de ieșire pe zero și lasă neatinse nivelurile de categorie, tick-urile, fizica, telemetria, evenimentele și HUD-ul. Motorul continuă să proceseze voci și impacte; doar ieșirea este tăcută.

**Plafon de voci, ownership și disposal.** `AUDIO_LIMITS` (versiunea `148-audio-v1`) fixează plafoanele explicite: 6 voci `engine`, 4 voci `impact`, 4 voci `ui`, 14 voci în total, cel mult 6 vehicule audibile, cel mult 8 buffere și 1 MiB de buffere deținute. Un vehicul deține cel mult o voce de buclă; când categoria este plină, furtul de voce este determinist (prioritatea cea mai mică, apoi secvența cea mai veche) și, dacă noul cue nu este mai important, cue-ul este abandonat contorizat în `droppedCues`. Un vehicul **neaudibil** (în afara razei de 35 m sau sub pragul de câștig 0,05) nu primește voce, nu generează buffer și nu ocupă slot: flota întreagă nu produce aceeași procesare ca un vehicul apropiat. `releaseVehicle` eliberează proprietatea unei voci, iar `dispose` eliberează toate vocile, proprietățile și contextul, o singură dată; după disposal, apelurile sunt respinse.

**Adaptor și driver fals.** Web Audio API este izolat în `src/audio/web-audio-backend.ts`, care folosește doar forma structurală necesară (`WebAudioContextLike`) și creează contextul la `resume()`. `src/audio/fake-backend.ts` este driverul determinist pentru Node: ceas explicit, contoare, jurnal cu capacitate finită și același port. Nu există dependențe noi în `package.json`.

**Placeholder-uri, nu asseturi finale.** Cele șapte cue-uri (`engine-loop`, `tyre-screech`, `brake-squeal`, `impact`, `takeover-notice`, `profile-notice`, `ui-tick`) folosesc buffere procedurale generate determinist de `src/audio/procedural.ts` (22,05 kHz, mono). Ele sunt **placeholder-uri identificate explicit**, nu asseturile finale înregistrate; înlocuirea cu înregistrările reale nu schimbă contractul motorului. Dovezile sunt în [Docs/Evidence/148-audio-engine](Evidence/148-audio-engine/README.md), inclusiv costul local de memorie și per tick.

## Contractul audio 149: preluare, publicare și misiuni

[149](16-asseturi-vizual-si-audio.md) adaugă feedback distinct pentru preluarea controlului, publicarea profilului și stările misiunilor, **fără** un al doilea sistem audio: contractul pur este `src/audio/feedback.ts` (`149-audio-feedback-v1`), composition root-ul este `src/app/audio-feedback.ts` (`149-audio-feedback-app-v1`), iar echivalentul vizual este `src/ui/audio-feedback-indicator.ts` (`149-audio-feedback-indicator-v1`).

**Legarea de evenimentul real.** Fiecare sunet vine dintr-un eveniment real, nu dintr-o stare anticipată:

| Familie | Evenimentul real | Cue 148 | Categoria |
| --- | --- | --- | --- |
| `TAKEOVER` | evenimentul 007 `MANUAL_START` (seatul 066/068) | `takeover-notice` | `ui` |
| `PUBLICATION` | evenimentul 007 `PROFILE_ACTIVATE` și payloadul 110/112 cu `published: true` | `profile-notice` | `ui` |
| `MISSION` | starea instancei din trackerul real 116 (`ACTIVE`/`COMPLETED`/`FAILED`) | `ui-tick` | `ui` |
| `LEARNING` | notificarea reală 079 cu descriptor de sunet ≠ `NONE` | `ui-tick` | `ui` |

Cue-urile sunt cele șapte ale motorului 148: 149 nu adaugă cue, buffer sau voce și nu modifică `AUDIO_LIMITS`. Toate sunetele trec prin `playOneShot`, deci plafonul de voci, cooldown-ul pe familie, furtul determinist de voce și comutatorul de mute rămân în vigoare. Un rezultat de învățare validat dar **nepublicat** (`RESULT` 079) sună ca analiză, nu ca publicare; doar payloadul explicit de publicare poate produce `profile-notice`.

**Fără dublare.** Fiecare feedback are o **cheie de idempotență explicită**, derivată din identitatea reală a evenimentului: `takeover:<eventId 007>`, `publication:<versionId 110/112>`, `mission:<instanceId 116>:<state>` și `learning:<eventId 079>`. Cheile sunt păstrate într-un registru FIFO mărginit (256 chei, `AUDIO_FEEDBACK_LIMITS.emittedKeys`). Publicarea și notificarea 079 `PUBLISHED` a **aceleiași** versiuni împart aceeași cheie, deci activarea și notificarea nu sună de două ori; evenimentul reluat de un releu, întâlnit și direct, este refuzat cu `DUPLICATE`.

**Rezultat întârziat.** Un feedback primit după un eveniment mai nou este marcat `late`, dar sună propriul rezultat real: o publicare întârziată sună `profile-notice` (publicarea chiar a avut loc), nu starea anticipată, iar o notificare 079 reclasificată `STALE` are descriptor `NONE` și rămâne mută. Contorul `lastTick` este singurul reper de ordine; starea curentă a motorului nu înlocuiește niciodată payloadul evenimentului.

**Toggle rapid.** Comutarea repetată a mute-ului sau a categoriilor trece prin `setMuted`/`applyPreferences` ale motorului 148: câștigul de ieșire se schimbă, vocile, proprietățile și buferele nu. Un burst de evenimente de aceeași familie este limitat de cooldown-ul motorului (0,4 s pe familie) și de plafonul de 4 voci `ui`; nicio voce orfană nu rămâne, iar buferele rămân sub plafonul de 8.

**Echivalent vizual obligatoriu.** Orice informație transmisă audio are și un echivalent vizual: `src/ui/audio-feedback-indicator.ts` este o **linie de stare** mărginită (un singur rând, fără listă, fără istoric, fără fereastră de deduplicare, fără coadă de expirare) care arată simbolul, textul și atributele `data-*` ale ultimului feedback acceptat. Nu este un sistem paralel de notificări: mesajele detaliate de învățare și publicare rămân pe rândurile reale ale infrastructurii 079 (`★ Profil publicat`), iar preluarea rămâne pe indicatorul de mod 067. Indicatoarea este desenată și când motorul refuză sunetul (de exemplu `AWAITING_GESTURE`), deci informația nu depinde de sunet.

Dovezile sunt în [Docs/Evidence/149-audio-feedback](Evidence/149-audio-feedback/README.md).