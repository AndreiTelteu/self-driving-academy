# Capabilitățile release-ului V3 (PBI 202)

> Fișier generat determinist de `npm run release:v3`. Nu edita manual.

**Verdict al artefactului: PASS.** 12 capabilități derivate din contractele și rapoartele 191–201, fiecare cu nivelul real de livrare. Dependențe V3 în Done: **11/11**.

## Ce poți face în contractele livrate

| # | Capabilitate | Contract | Ce poți face | Dovadă | Nivel |
| --- | --- | --- | --- | --- | --- |
| 1 | Personaj third person cu schelet, scară umană și cinci clipuri | `191-character-v1` | Personaj de 1.78 m, 17 articulații, clipurile idle, walk, run, enter-vehicle, exit-vehicle eșantionate la 60 Hz; contactul cu solul este măsurat pe fiecare cadru, nu apreciat. | `Docs/Evidence/191-v3-character/report.json`<br>`Docs/Evidence/191-v3-character/README.md` | HEADLESS_CONTRACT |
| 2 | Mers, alergare și idle pe tick fix, cu coliziune și trepte reale | `192-walker-v1` | Walker determinist la 60 Hz: mers 1.370968 m/s, alergare 2.909091 m/s, pas maxim 0.14 m (bordura reală), clipul ales din viteza măsurată. | `Docs/Evidence/192-v3-walker/report.json`<br>`Docs/Evidence/192-v3-walker/README.md` | HEADLESS_CONTRACT |
| 3 | O singură autoritate de input: personaj sau vehicul, niciodată ambele | `193-input-authority-v1` | Arbitrajul 193 produce exact o comandă pe tick pentru entitatea activă; portul este exact portul de tastatură din 066, iar tastele ținute la tranziție rămân neutralizate până la o eliberare reală. | `Docs/Evidence/193-v3-authority/report.json`<br>`Docs/Evidence/193-v3-authority/README.md` | HEADLESS_CONTRACT |
| 4 | Cameră third person cu tranziție de 18 tick-uri și ocluzie reală | `194-character-camera-v1` | Camera urmărește exact entitatea autoritară, trunchiază raza la primul obstacol cu marjă de 0.05 m, limitează pitch-ul și distanța și serializează starea pentru reload. | `Docs/Evidence/194-v3-camera/report.json`<br>`Docs/Evidence/194-v3-camera/README.md` | HEADLESS_CONTRACT |
| 5 | Intrare în orice mașină accesibilă, cu autoritate și cursă păstrate | `195-enter-vehicle-v1` | Ușa este pe flancul real al caroseriei, raza de interacțiune este 0.89 m (jumătatea anvergurii brațelor din 191), iar acceptarea impune modul MANUAL; poziția, ruta și cursa rămân bit-identice. | `Docs/Evidence/195-v3-enter/report.json`<br>`Docs/Evidence/195-v3-enter/README.md` | HEADLESS_CONTRACT |
| 6 | Ieșire într-un punct fizic valid, fără teleportare | `196-exit-vehicle-v1` | Candidații sunt flancurile, spatele și fața caroseriei, cu marjă liberă de 0.05 m; mașina eliberată revine în AUTO cu ruta de dinainte de preluare, iar peste 1.370968 m/s ieșirea este refuzată. | `Docs/Evidence/196-v3-exit/report.json`<br>`Docs/Evidence/196-v3-exit/README.md` | HEADLESS_CONTRACT |
| 7 | Schimbare rapidă a taxiului: FOCUS, TAKE și RETURN | `197-fleet-switch-v1` | FOCUS mută doar camera și nu mișcă personajul (probă la 200 m), TAKE compune atomic ieșirea 196 cu intrarea 195, iar RETURN readuce corpul fie la poziția de dinainte de preluare, fie la punctul valid al ieșirii. | `Docs/Evidence/197-v3-fleet-switch/report.json`<br>`Docs/Evidence/197-v3-fleet-switch/README.md` | HEADLESS_CONTRACT |
| 8 | Segmente MANUAL/LEARNING: mersul nu devine demonstrație de condus | `198-walking-segments-v1` | Read model-ul 198 transformă tranzițiile 195/196/197 în segmente închise; 3600 tick-uri și 82.26 m de mers produc 0 segmente și 0 candidați, iar un singur segment LEARNING eligibil închis produce exact un candidat 069. | `Docs/Evidence/198-v3-walking-segments/report.json`<br>`Docs/Evidence/198-v3-walking-segments/README.md` | HEADLESS_CONTRACT |
| 9 | Tutorial nou în șase pași care nu blochează accesul la taxiuri | `199-walking-tutorial-v1` | Tutorialul avansează numai pe evenimente reale (selecție 068, mișcare 192, intrare 195, pickup/dropoff 007, ieșire 196); accesul la taxiuri este NEVER_GATED, iar faptele rejucate sunt refuzate. | `Docs/Evidence/199-v3-walking-tutorial/report.json`<br>`Docs/Evidence/199-v3-walking-tutorial/README.md` | HEADLESS_CONTRACT |
| 10 | Salvare V3 cu poziția personajului, camera și autoritatea | `200-walking-save-v1` | Slotul 200 păstrează poziția bit-identică, yaw-ul, autoritatea, camera (inclusiv mijlocul tranziției de 18 tick-uri) și starea segmentelor; migrarea sesiunilor vechi produce o stare validă. | `Docs/Evidence/200-v3-walking-save/report.json`<br>`Docs/Evidence/200-v3-walking-save/README.md` | HEADLESS_CONTRACT |
| 11 | Cele trei moduri AUTO/MANUAL/LEARNING, intrare–ieșire–revenire | `201-v3-validation-flow-v1` | Lanțul real 192 → 195 → 193 → 196 → 197 → 198 trece în toate cele trei moduri: fiecare mod face FOCUS → TAKE → RETURN, iar personajul merge după ieșire; conducerea lungă 193/194 are un singur consumator pe tick. | `Docs/Evidence/201-v3-validation/report.json`<br>`Docs/Evidence/201-v3-validation/README.md` | HEADLESS_CONTRACT |
| 12 | Provocări, misiuni zilnice și KPI/XP existente, neatinse de mers | `188-v2-challenges-v1 + 211/213` | Catalogul compus are 12 template-uri V1 + 15 provocări extinse (27 în total); mersul nu atinge catalogul, KPI-urile, ledgerul, XP-ul sau starea zilnică (digest 9/9 identic la 201). | `Docs/Evidence/188-v2-challenges/report.json`<br>`Docs/Evidence/201-v3-validation/report.json` | HEADLESS_CONTRACT |

## Numerele reale din rapoarte

| Capabilitate | Indicatori derivați |
| --- | --- |
| Personaj third person cu schelet, scară umană și cinci clipuri | `joints` 17<br>`clips` 5<br>`clipsPassed` 5<br>`samplingHz` 60<br>`compatibility` 9/9<br>`authorityFrames` 309<br>`visualIssues` 0 |
| Mers, alergare și idle pe tick fix, cu coliziune și trepte reale | `scenarios` 8/8<br>`walkSpeedMps` 1.370968<br>`runSpeedMps` 2.909091<br>`stepCeilingM` 0.14<br>`maxPenetrationM` 0<br>`vehicleBodiesCreated` 0 |
| O singură autoritate de input: personaj sau vehicul, niciodată ambele | `scenarios` 13/13<br>`exhaustiveTicks` 512<br>`wrongConsumerDeliveries` 0<br>`simultaneousNonEmptyTicks` 0<br>`transitions` 18/18<br>`snapshotBytes` 169 |
| Cameră third person cu tranziție de 18 tick-uri și ocluzie reală | `scenarios` 5/5<br>`transitionTicks` 18<br>`transitionFrames` 18<br>`maxStepM` 0.33401<br>`entityClones` 0<br>`targetWrites` 0 |
| Intrare în orice mașină accesibilă, cu autoritate și cursă păstrate | `scenarios` 10/10<br>`interactionRadiusM` 0.89<br>`entryMode` MANUAL<br>`cameraTransitionTicks` 18 |
| Ieșire într-un punct fizic valid, fără teleportare | `scenarios` 12/12<br>`clearanceM` 0.05<br>`releaseMode` AUTO<br>`maxExitSpeedMps` 1.370968<br>`entitiesAfter` 2 |
| Schimbare rapidă a taxiului: FOCUS, TAKE și RETURN | `scenarios` 12/12<br>`focusProofDistanceM` 200<br>`takeReachM` 0.89<br>`projection` PASS |
| Segmente MANUAL/LEARNING: mersul nu devine demonstrație de condus | `scenarios` 16/16<br>`walkingTicks` 3600<br>`walkingDistanceM` 82.26<br>`closedSegments` 0<br>`candidates` 0<br>`boundDistanceM` 50000 |
| Tutorial nou în șase pași care nu blochează accesul la taxiuri | `steps` 6<br>`positives` 6<br>`negatives` 30<br>`taxiAccess` NEVER_GATED<br>`walkingTimeXp` NOT_IMPLEMENTED<br>`xpGranted` 0 |
| Salvare V3 cu poziția personajului, camera și autoritatea | `checks` 160/160<br>`scenarios` 4/4<br>`refusals` 18/18<br>`migrationPreservesEverything` true<br>`reloadCoherent` true |
| Cele trei moduri AUTO/MANUAL/LEARNING, intrare–ieșire–revenire | `modes` AUTO, MANUAL, LEARNING<br>`cases` 3/3<br>`seated` 3/3<br>`walkedAfterM` 1.225591<br>`criteria` 2 PASS / 0 FAIL / 1 NOT_RUN |
| Provocări, misiuni zilnice și KPI/XP existente, neatinse de mers | `templates` 12<br>`extendedChallenges` 15<br>`composedTotal` 27<br>`extendedKeysCovered` 15<br>`extendedKeysTotal` 56<br>`identicalDigests` 9 |

## Nivelul de livrare, derivat din compoziție

`src/main.ts` conține 0 referințe la `character`, 0 la `authority`, 0 la `walker`, 0 la adaptorul de tastatură și 0 la adaptorul de moduri. Nivelul raportat este **NOT_COMPOSED**: capabilitățile sunt module headless dovedite, nu o sesiune de browser.

## Ce nu este livrat end-to-end

| Limitare | Stare | Detaliu | Owner | Dovadă |
| --- | --- | --- | --- | --- |
| Cele 56 de chei extinse rămân rezervate de etapa de plan | `NOT_DELIVERED_END_TO_END` | Lista de chei rezervate are 56 intrări; validarea candidaților le refuză cu codul de etapă, iar exportul le scrie `null` în `reservedParameters`. Poarta 187 le certifică (80 chei, 0 findings), dar certificarea nu schimbă etapa. | proprietarul etapei de plan (migrarea `KEY_EXTENSION_STAGE`) | `src/learning/candidate-validation.ts`<br>`src/profiles/parameter-registry.ts`<br>`Docs/Evidence/187-v2-parameter-gate/report.json` |
| Provocările acoperă 15 din 56 de chei extinse | `PARTIAL` | 15 chei au o provocare dedicată, 41 nu; lipsa unei provocări nu este un eșec de catalog, dar nu există demonstrație de joc pentru cele 41. | proprietarul 188/231 (catalogul de provocări) | `Docs/Evidence/188-v2-challenges/report.json` |
| XP pentru timpul de mers nu este implementat | `NOT_IMPLEMENTED` | Contractul 199 raportează `walkingTimeXp = NOT_IMPLEMENTED` și `xpGranted = 0`; Docs/20 a fost corectat să nu mai promită această contribuție. | proprietarul 199/213 (XP și progres) | `Docs/Evidence/199-v3-walking-tutorial/report.json`<br>`src/missions/walking-tutorial.ts` |
| Streamingul vizual rămâne fără măsurătoare | `NOT_MEASURED` | Doi pași ai streamingului vizual sunt `NOT_MEASURED` la 157; ei cer renderer real, nu probe structurale. Verdictul C3 al lui 201 este din acest motiv `NOT_RUN`. | proprietarul 157/223 | `Docs/Evidence/157-render-budget/report.json`<br>`Docs/Evidence/201-v3-validation/report.json` |
| FPS și frame p95/p99 pe hardware real nu sunt validate | `NOT_VALIDATED` | Gate-ul 224 raportează `fps-hardware = NOT_VALIDATED`, iar release-ul lui este `NOT_VALIDATED`; capturile hardware 220 sunt pe alt build. | operatorul cu GPU real + proprietarul 224 | `Docs/Evidence/224-performance-gate/report.json`<br>`Docs/Evidence/201-v3-validation/report.json` |
| Contractele V3 nu sunt cablate în compoziția de browser | `NOT_COMPOSED` | `src/main.ts` are 0 referințe la `character`, 0 la `authority`, 0 la `walker`, 0 la adaptorul de tastatură și 0 la adaptorul de moduri. Capabilitățile sunt livrate ca module headless cu dovezi, nu ca sesiune jucabilă în build. | proprietarul compoziției aplicației (src/main.ts) | `src/main.ts`<br>`src/app/index.ts` |

## Verificările artefactului

| Verificare | Rezultat | Detaliu |
| --- | --- | --- |
| `dependencies-done` | PASS | 11/11 PBI-uri 191–201 în Done, cu dovezi și raport |
| `capability-evidence` | PASS | 12/12 capabilități cu toate fișierele de dovadă existente |
| `capability-level-honest` | PASS | compoziția de browser nu referențiază contractele (0/0/0); fiecare capabilitate declară limitarea |
| `not-delivered-declared` | PASS | 6 limitări declarate, fiecare cu owner și dovadă existentă |
| `controls-fail-closed` | PASS | 6/6 verificări de controale |
| `reserved-keys` | PASS | 56 chei rezervate, refuz `KEY_EXTENSION_STAGE` prezent |
| `catalog-composition` | PASS | catalog compus 27 (12 V1 + 15 extinse), acoperire chei 15/56 |
| `walking-xp-not-promised` | PASS | Docs/20 declară `walkingTimeXp` = `NOT_IMPLEMENTED` și nu mai promite XP de mers |
| `docs-section-generated` | PASS | secțiunea finală generată există, trimite la artefact și declară `walkingTimeXp` = `NOT_IMPLEMENTED` |
| `checklist-owners` | PASS | 0 rânduri deschise fără owner |
| `release-verdict-rule` | PASS | 13 rânduri deschise, verdict NOT_VALIDATED |
| `evidence-files` | PASS | directorul de dovezi al release-ului există |

## Comenzi

```bash
npm run release:v3
npm run release:v3 -- --check
```
