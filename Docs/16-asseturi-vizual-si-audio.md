# Asseturi vizual și audio

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Direcția vizuală și sunetul

Propunere de direcție: oraș american stilizat cu clădiri joase, bulevarde, palmieri sau vegetație potrivită, benzinărie, zone comerciale și rezidențiale. Formele și texturile sunt stilizate, lizibile și coerente cu identitatea proprie a orașului. Vehiculele, clădirile, iconurile și sunetele sunt asseturi originale sau selectate pentru acest proiect.

> **Decizie actualizată la 16 noiembrie 2026.** Formularea „forme și texturi stilizate” de mai sus rămâne ca istoric. Pentru V4 direcția este „realism stilizat curat”: proporții reale, materiale PBR, lumină fizică și umbre, în continuare cu asseturi originale. Decizia și auditul sunt în [Calitate vizuală V4](30-calitate-vizuala-v4.md#decizia-utilizatorului).

Grafica pune în evidență semafoarele, benzile, distanțele și comportamentul. Un overlay de analiză poate afișa banda, ținta de viteză, liderul, spațiul urmărit și următoarea decizie; este o unealtă opțională, nu un obstacol în timpul cursei.

Camera din spate urmărește vehiculul cu amortizare, adaptare la viteză și evitare a obstacolelor. Schimbarea taxiului mută camera cu o tranziție scurtă și arată imediat ID-ul și modul. Mișcarea camerei și intensitatea feedbackului sunt reglabile.

Sunetul include motor, variație cu sarcina, anvelope, frâne, coliziuni, claxon și notificări distincte pentru preluarea controlului și publicarea profilului. Jocul pornește audio după o interacțiune a jucătorului și oferă controale separate de volum. Informațiile esențiale sunt disponibile și vizual.

## Pipeline de asseturi

Fiecare asset are ID, tip, versiune/hash, rol critic/opțional, sursă și licență. Buildul include manifestul și fișierele WASM necesare. Asseturile auto păstrează pivoturile roților, scara și rădăcina entityId. Orașul folosește LOD și instanțiere numai după măsurare și verificarea selecției.

Scenele de gameplay folosesc asseturi simple în prototip, apoi se înlocuiesc prin registry fără a modifica semantica rutieră. V1 reprezintă pasagerii simplificat; pietonii autonomi V2 și personajul V3 au asseturi și animații distincte.

[Pasagerii simplificați 147](passenger-visual.md) fixează reprezentarea V1 ca read model vizual peste starea reală 061 și ancorele reale 032: fazele `WAITING_PICKUP`/`BOARDING`/`ONBOARD`/`DROPPING_OFF`, ocuparea 0/1 și markerii `PICKUP`/`PASSENGER`/`DROPOFF` identificați stabil prin `rideId + rol`. Prezentarea nu schimbă cursa și nu creează pietoni, telemetrie sau oportunități; un asset 3D final și sistemul de pietoni V2 rămân separate.

## Admiterea asseturilor finale

145/146 depind de gate-ul de flotă 220 și bugetele 223. Manifestul include costuri transferate/decodate, texturi estimate, LOD/materiale, decodere/WASM și startup critic separat de decorul opțional. Batchurile statice sunt locale; calitatea nu schimbă colliderele sau simularea. Audio are plafon de voci și reutilizare/disposal. 150 verifică automat manifestul și capacitățile conform [modulului 25](25-performanta-contracte-si-benchmark.md).

## Manifestul de build 150: identitate, cache selectiv și contabilitate separată

Contractul `150-asset-manifest-v1` (formatul `1`) trăiește în `src/build/` și este **browser-safe**: nu citește fișiere și nu consultă ceasul, deci poate rula și în bundle. Este generat din inventarele reale ale modulelor, nu scris de mână: 145 `vehicleAssetInventory`, 146 `cityDecorInventory` peste layout-ul 042, 147 `PASSENGER_VISUAL_LIMITS`, 148/149 `AUDIO_CUES` și fișierele WASM reale din pachete. Rezultatul are **27 de intrări** (7 vehicule, 9 decor inclusiv materialele, 7 cue-uri audio, 1 read model de text pentru pasageri, 3 module WASM), dintre care 17 critice și 10 opționale. Un asset procedural generat la runtime nu primește un cost de transfer inventat: `wire.encoding = NONE` înseamnă exact 0 bytes pe wire.

**Identitate versionată.** Fiecare intrare păstrează proveniența (`id`, `kind`, `role` critic/opțional, `version`, `source`, `license`, `count`, `firstRide`, `placeholder`, `consumers`) și are trei hash-uri: `inputsHash` peste datele care schimbă bytes-ii, `recordHash` peste intrarea completă și `cacheKey`. `cacheKey = SHA-256(manifestVersion | formatVersion | id | inputsHash)`, deci o modificare de licență sau de sursă schimbă hash-ul manifestului, dar **nu** evictuiește payload-ul din cache. Manifestul are un `hash` peste întregul conținut și un `etag` derivat din el. `createAssetManifest` sortează intrările după `id`, astfel încât ordinea surselor să nu conteze.

**Cache selectiv.** `diffAssetCache(previous, next)` întoarce decizii explicite `REUSED`/`CONTENT_CHANGED`/`ADDED`/`EVICTED`. Un rebuild care schimbă geometria unui singur vehicul invalidează exact acea intrare și refolosește restul; o creștere de `formatVersion` invalidează intenționat toate cheile, ca schimbare controlată, nu accidentală. Ștergerea unui asset produce `EVICTED`, nu o intrare fictivă.

**Wire separat de rezident.** Contabilitatea are două domenii disjuncte. `wire` (`rawBytes`, `encodedBytes`, `gzipBytes`, grupat pe `NONE`/`IDENTITY`/`BASE64_INLINE`) descrie numai transportul; `decoded` (`geometryBytes`, `textureBytes`, `wasmResidentBytes`, `decoderWasmBytes`, `decoderWorkspaceBytes`, `audioBytes`, `textBytes`) descrie estimarea rezidentă. Gzip-ul este doar o comparație de transport și nu devine niciodată memorie GPU sau WASM. Rapier are modulul brut de 3.082.103 B, dar călătorește base64 în bundle (4.109.472 B) și este admis la 33.554.432 B rezidenți prin contractul 021 (`DECLARED_ADMISSION_ESTIMATE`); glslang (943.680 B) și twgsl (1.702.916 B) sunt `IDENTITY`, iar rezidența lor este limita inferioară dată de bytes-ii modulului (`MODULE_BYTES_LOWER_BOUND`). Totalurile reale: **6.756.068 B pe wire** și **40.934.632 B decodați estimați** (geometrie 4.469.344, WASM rezident 36.201.028, audio 261.956, text 2.304, texturi 0).

**Lipsa unui asset critic blochează release-ul.** `auditAssetManifest` întoarce un motiv închis (`OK`, `EMPTY_MANIFEST`, `DUPLICATE_ASSET_ID`, `MISSING_PROVENANCE`, `MISSING_CRITICAL_ASSETS`, `INVALID_VERSION`) și lista exactă de `id`-uri lipsă; `assertAssetManifestReleasable` aruncă înainte de release. Sursele care nu pot fi citite sunt raportate cu `WASM_FILE_MISSING`, `REGISTRY_DEFINITION_MISSING` sau `INVENTORY_ENTRY_MISSING` și nu sunt înlocuite cu intrări inventate. Registry-ul livrează în continuare 0 definiții GLB, deci decoderele raportează 0 B WASM/workspace sub capurile 223; modelele 3D ale lui 254 sunt core glTF (fără Draco/meshopt/KTX2) și intră în manifest ca intrări `GLB` separate.

**CI și bugete.** `npm run assets:manifest` scrie dovezi deterministe, iar `npm run assets:manifest -- --check` eșuează dacă manifestul sau raportul salvat este învechit. Proiecția `assetBudgetManifest` intră în contractul 223 (`checkAssetManifest`, LOW/MEDIUM/HIGH), iar `checkResidentBudgets` verifică geometria/texturile față de capurile 223, WASM-ul față de admiterea 021 și audio-ul față de `AUDIO_LIMITS.maxBufferBytes` din 148. Testele refac hash-urile dovezilor 145/146/223 și compară inventarele cu măsurătorile reale (145: 7 asseturi; 146: 4.354.688 B pentru 1.585 de itemuri; 148: 7 cue-uri). Dovezile complete sunt în [Docs/Evidence/150-asset-manifest](Evidence/150-asset-manifest/README.md).

## Vehicule 145: două clase vizuale, pivoturi și LOD

Sedanul și compactul au o definiție vizuală derivată din mecanica 023: patru pivoturi de roată la `x = ±track/2`, `z = ±wheelbase/2` și `y = connection(-0,15) - rest(0,35)`, cu raza clasei. Roțile din față virează în jurul lui +Y, toate se rotesc în jurul lui +X, iar poziția de suspensie din proiecția fizică (023/028) este aplicată pe pivot, nu inventată. Geometria este procedurală, originală, în cadrele documentate (+Z înainte, +X dreapta) și se grupează pe material: caroserie cu culori de vârf, faruri, stopuri, frână și semnalizare. Cele patru roți ale unui vehicul folosesc o singură sursă instanțiată, deci un singur draw call pentru roți.

LOD are trei niveluri (`NEAR`/`MID`/`FAR`) cu histerezis de 5 m, la distanțe dependente de preset (LOW 30/70, MEDIUM 40/85, HIGH 55/110). Schimbarea nivelului numai ascunde grupuri de prezentare: nodurile, pivoturile, colliderul 023 (`cuboid(0.85, 0.3, 2)`) și maparea `entityId` rămân identice. `vehicleAssetManifest` admite șapte definiții (șase seturi de geometrie + materialele partajate) sub capurile 223, cu transfer runtime zero și texturi zero; sursele/licențele sunt inventariate în `vehicleAssetInventory`. Dovezile de măsurare pe 24 de instanțe dinamice sunt în [Docs/Evidence/145-vehicle-assets](Evidence/145-vehicle-assets/README.md).

## Cartier 146: decor procedural și batchuri locale

Decorul înlocuiește suprafețele goale cu mobilier stradal american stilizat: stâlpi de iluminat, copaci, bănci, hidranți, pubele, parcometre, indicatoare și adăposturi de stație. Plasarea este derivată exclusiv din layout-ul 042: numai pe ribonurile de trotuar și pe trotuarul cel mai apropiat de fiecare zonă de serviciu, cu pas determinist pe tip, offset lateral în lățimea trotuarului și respingere la orice intersecție cu banda, marcaj, intersecție, trecere, linie de stop sau clădire. Harta, rețeaua rutieră și zonele rămân neschimbate; decorul nu creează collidere.

Geometria este originală și procedurală (cutii cu normale plate, cilindri/conuri cu 8 segmente, culori de vârf, un singur material partajat), fără texturi. Fiecare item primește celula spațială de 120 m, iar geometria este fuzionată într-un mesh pe celulă: 1.585 de itemuri ajung în 36 de batchuri locale, 81.620 vârfuri, ≈4,35 MB estimați, 0 texturi. `cityDecorManifest` admite nouă definiții sub capurile 223, iar `cityDecorInventory` păstrează sursa/licența fiecărui tip. Costul total al scenei integrate (042 + decor) este raportat explicit în [Docs/Evidence/146-city-assets](Evidence/146-city-assets/README.md), inclusiv limita de draw calls moștenită din mesh-urile per-bandă ale lui 042.

## Fațade 246: materiale și texturi procedurale pentru clădiri

Clădirile primesc trei texturi procedurale originale noi (`surface:texture:facadeBrick`, `surface:texture:facadePlaster`, `surface:texture:facadeConcrete`, dală de 4 m, albedo + normal + ORM, generate la încărcare din același zgomot determinist ca la 245) și cinci materiale în `surface-materials.ts`: `buildingWallBrick/Plaster/Concrete` (PBR), `buildingGlass` (reflectă IBL-ul 243 la 2,2× intensitate de mediu) și `buildingTrim`. Variația dintre clădiri (8 stiluri, palete, vitrină/intrare/servicii la parter) este un plan pur în `src/rendering/building-facades.ts`, derivat din seed-ul hărții; nu există fișiere descărcate, deci manifestul 150 crește de la 37 la 40 de intrări (30 critice), toate sub licență de proiect. Sticla nu are textură: interiorul fals este luminat prin culori de vârf pe HIGH.

## Modele 3D realiste 254: catalog GLB, rig și fallback

Din 2026-11-24 (PBI 254) personajul, taxiul, sedanul, copacii, lămpile și băncile nu mai sunt geometrie procedurală în browser: sunt modele CC0 (Innerscene) livrate în `public/assets/models/{vehicles,characters,buildings,decor}` și înregistrate în `src/rendering/babylon/glb-assets.ts`. Catalogul este singura sursă de adevăr pentru id, URL, octeți, sursă și licență; `Docs/30` și manifestul 150 citesc din el.

**Descărcare și optimizare.** `jordan-animated.glb` a fost adus de la 24,42 MB la 3,46 MB cu `gltf-transform` (`resize --width 256 --height 256`, `simplify --ratio 0.35 --error 0.002`, `prune`), păstrând skin-ul de 56 de oase și toate cele șapte clipuri; extensia `KHR_materials_specular` a fost eliminată, deci fișierul rămâne core glTF cu PNG embedded. Vehiculele și decorul sunt deja mici (11–49 KB) și nu au fost atinse.

**Încărcare.** `glb-model-library.ts` decodează containerele o singură dată, înainte de construirea scenelor (`await` în `main.ts`), iar scenele le instanțiază sincron. Un model care nu se poate descărca este raportat în `failed` și nu blochează pornirea. Fără bibliotecă (teste headless, `?capture=1&models=procedural`) rig-urile procedurale 145/191 rămân active, deci contractele vechi sunt încă verificate de teste.

**Rig-uri.** Vehiculul păstrează contractul 145: rădăcina autoritativă, patru pivote de direcție la centrele anvelopelor, un nod de spin pe axa X locală, grupurile de materiale pentru LOD și lumini (faruri, stopuri, frână). Modelul are nasul pe `-X`, deci un holder îl rotește cu +90° pe `+Z`; offsetul pe verticală aliniază talpa roții cu `restY - rază`. Personajul păstrează contractul 191: `applyFrame` copiază poziția și yaw-ul, iar `setClip` alege clipul de locomoție (`idle/walk/run` → `Idle_Standing/Walk_Relaxed|Walk_Brisk/Run`) fără să atingă autoritatea. Decorul folosește thin instances pe mesh-urile GLB, un draw call per mesh per model, cu aceeași rotație `Ry(rotationY)` din planul 146.

**Bugete.** Cele șapte modele au 3.641.524 B pe wire (IDENTITY) și 3.297.695 B decodați (geometrie și animații 2.532.320, texturi 765.375); diferența până la bytes-ii de pe disc este JSON-ul glTF și antetele GLB. Nu există decodor WASM sau workspace: check-ul `glb-core-only-no-decoder` din raportul 150 verifică exact asta, iar manifestul crește cu 7 intrări `GLB` (3 critice — taxi, sedan, personaj — și 4 opționale: casa și cele trei piese de decor).

**Reglaje după playtest (258).** Rădăcina vizuală a vehiculelor GLB stă la 0,8 m deasupra solului (`VEHICLE_RIDE_HEIGHT_M`), cota de repaus a șasiului; fără ea mașina intra în asfalt. Grupurile de animație ale personajului primesc prefixul `character:` la instanțiere, deci rutarea folosește numele glTF original (`Idle_Standing`, `Walk_Relaxed`, `Run`); opțiunea `instantiate` este separată de `cloneMaterials`. `CharacterScene.setVisible` este chemat de compunere când autoritatea trece pe vehicul. Modelul taxiului nu are nod de ușă, deci deschiderea ușii rămâne neimplementată.

**Modele de clădiri 255.** Layout-ul 042 are fronturi de bloc de 30–60 m, nu loturi de 4–6 m, deci masele rămân geometria 246 (amprenta și înălțimea reală), iar șase tipologii CC0 (casă mică/medie/înaltă, apartament mediu/înalt, magazin) se așază ca un rând de clădiri mici la nivelul străzii: fața la trotuar, corpul în interiorul blocului, scală uniformă pe înălțimea blocului. Planul pur `src/rendering/building-modules.ts` dă 541 de plasări deterministe pentru 86 blocuri; `city-buildings-glb.ts` le contopește pe material și le desenează cu thin instances (33 mesh-uri, 6 tipologii). Mobilierul rămas folosește GLB: hidrant, coș, adăpost de stație și două modele de indicator (nume de stradă / STOP), cu `parking-meter` procedural pentru că nu există o sursă CC0. Toate cele 17 modele sunt în catalog și în manifestul 150.

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

## Contractul audio 228: reacțiile de material ale distrugerii

[228](26-joaca-libera-haos-si-distrugere.md) închide bucla dintre decorul destructibil 227 și sunetul real. Feedback-ul de distrugere **nu** adaugă un cue, un buffer sau un pool paralel: `src/audio/destruction-feedback.ts` (`228-destruction-feedback-v1`) folosește exact cue-ul `impact` al motorului 148, dar îi aplică un playback rate și un gain de material derivate din arhetipul 227 — gard `WOOD` 0,82, con `PLASTIC` 1,25, ladă `WOOD` 0,70, pubelă `METAL` 1,05, indicator `GLASS` 1,45, mobilier `METAL` 0,60. Metoda `playDestructionImpact` intră în același pool de 4 voci `impact` și în aceleași plafoane de buffere, deci un burst este limitat, iar fiecare sunet are un companion vizual cu material, intensitate și variantă (`FRAGMENT_BURST`/`SHOCK_RING`).

**Aceleași reguli de gest, mute și date.** Contextul audio continuă să existe numai după o interacțiune a jucătorului: înainte de gest, o distrugere răspunde `AWAITING_GESTURE`, nu creează buffer și nu pornește nicio voce, dar indicatorul vizual și fragmentele cosmetice rămân. `setMuted(true)` pune câștigul efectiv pe zero fără să elimine reacția. Fără o poziție de ascultător, reacția este derivată, dar nu sună (`NO_LISTENER`); fără o definiție 227, obiectul este `ABSENT`, nu primește un material inventat.

Dovezi: [Docs/Evidence/228-destruction-feedback](Evidence/228-destruction-feedback/README.md).

## Contractul live 285: distrugere, sunet și replay în joc

[285](26-joaca-libera-haos-si-distrugere.md) montează contractele 227/228/207/148 în compunerea live fără să le schimbe. `src/app/live-chaos.ts` creează planul real 227 din layout, catalogul 228, recorder-ul 207 și un singur motor 148; `src/rendering/babylon/destructible-decor-scene.ts` desenează cele 35 de obiecte, un pool cosmetic de 192 de fragmente cu durată de 120 tick-uri și 4 inele de șoc. Sunetul de distrugere rămâne exact cele șase profiluri de material de la 228, în pool-ul `impact` al lui 148, iar motorul, frâna și anvelopele folosesc aceleași plafoane. Înainte de gest nu există context audio; informația este întotdeauna disponibilă vizual, cu varianta explicită `SHOCK_RING` și textul „efect vizual”. Un reset publică `WORLD_RESET` în epoch-ul următor, iar 228 repetă chunk-ul 207 în ordine, cu zero pași de simulare, politică, recompense sau învățare. Costul software raportat este 0,2 ms p95 pentru pasul live și 0,6 ms p95 pentru un impact injectat; FPS, GPU și heap-ul exact nu sunt pretinse. Limita declarată este fereastra de 6 collidere fizice (registry-ul 028 are 96 de obstacole, iar 90 sunt clădiri), plus lipsa unui cue ambiental în tabelul 148.

Dovezi: [Evidence/285-destructible-audio-replay](Evidence/285-destructible-audio-replay/README.md).
