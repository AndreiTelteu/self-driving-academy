# 216 — regresii V1 pentru moduri, KPI-uri, daily și XP

Transcript determinist generat de `scripts/run-v1-regression-report.mjs` cu `npm run qa:v1-regression`.
Machine-readable: [report.json](report.json).

Regula oracolului: Fiecare valoare așteptată este contractul documentat (Docs/18, 22, 23, 25 și dovezile 205–215, 217), nu o copie a valorii observate. Zero ceas de perete, zero aleator.

## Nivel de validare

- Nivel: `targeted`
- Playtest: `NOT_RUN`
- Frame: `NOT_RUN`
- Memorie: `STRUCTURAL_OWNERSHIP_COUNTERS`
- Motiv: Politica de validare 2026-10-08: scenarii deterministe, cost structural și integrare limitată. Suita nu are browser, GPU sau hardware de referință.

Ce rămâne de verificat în browser:

- Lizibilitatea explicațiilor și a HUD-ului la 1280×720 și 1920×1080
- Senzația de condus MANUAL/LEARNING și revenirea după panouri
- Input real, focus/blur și pauza în browser
- Frame p95/p99 pe hardware-ul de referință (gate 220/224)

## Matricea executată

29 rânduri: 27 PASS, 0 FAIL, 2 NOT_RUN.
Categorii: BENCHMARK 2, CHECKPOINT 2, COMBINED 1, DAILY 2, DEPENDENCIES 3, KPI 4, LEARNING_BARRIER 2, MODES 5, PLAYTEST 1, PROPAGATION 2, REPLAY 2, XP 3.

| ID | Categorie | Polaritate | Scenariu | Contract | Verdict | Rezultat real |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | MODES | POSITIVE | Toate cele șase tranziții pe taxi, cu un singur scaun PLAYER | 217-three-modes-v1 | PASS | {"rows":6,"transitions":["AUTO->MANUAL","AUTO->LEARNING","MANUAL->AUTO","MANUAL->LEARNING","LEARNING->AUTO","LEARNING->MANUAL"],"failures":0,"maxPlayerSeats":1} |
| A2 | MODES | POSITIVE | Toate cele șase tranziții pe un vehicul civil | 217-three-modes-v1 | PASS | {"rows":6,"failures":0,"modes":["MANUAL","LEARNING"]} |
| A3 | MODES | POSITIVE | Tranziția păstrează viteza, direcția și pasul de poziție | 217-three-modes-v1 | PASS | {"preserved":12,"maxStepErrorM":0} |
| A4 | MODES | NEGATIVE | Defecte injectate: salt de poziție și schimbare de viteză | 217-three-modes-v1 | PASS | {"jumpKinds":["PHYSICS_POSITION_STEP"],"speedKinds":["PHYSICS_SPEED"]} |
| A5 | MODES | NEGATIVE | Defecte injectate: două scaune, segment lipsă și segment străin | 217-three-modes-v1 | PASS | {"extraSeatKinds":["MULTIPLE_PLAYER_SEATS"],"missingKinds":["MISSING_CLOSED_SEGMENT"],"wrongKinds":["WRONG_CLOSED_SEGMENT","OLD_SEGMENT_MODE"]} |
| A6 | PROPAGATION | POSITIVE | Taxiurile și civilii adoptă aceeași versiune de stil | 208-city-style-v1 | PASS | {"phases":7,"checks":71,"commonVersionAfter":"segment-208-fleet~112","crossCategoryUpdated":true,"hiddenOverrides":0} |
| A7 | PROPAGATION | NEGATIVE | Un segment MANUAL civil nu învață și nu publică | 208-city-style-v1 | PASS | {"manualStatus":"SKIPPED_MANUAL","manualVersionChanges":0,"manualActivations":0} |
| A8 | LEARNING_BARRIER | POSITIVE | Restore cu un job în coadă: jobul este anulat, rezultatul târziu refuzat | 205-learning-epoch-v1 | PASS | {"epoch":2,"cancelledJobs":1,"lateResults":1,"versionsBefore":3,"versionsAfter":3} |
| A9 | LEARNING_BARRIER | NEGATIVE | Import invalid: refuz fără generație nouă | 205-learning-epoch-v1 | PASS | {"status":"REJECTED","code":"IMPORT_INVALID","pending":null,"generations":1} |
| B1 | KPI | POSITIVE | Venit și rating în ambele direcții, plus un incident real | 214-kpi-impact-v1 | PASS | {"upDown":{"revenue":500,"rating":-3},"downUp":{"revenue":-500,"rating":3},"downDown":{"revenue":-800,"rating":-4,"incidents":1}} |
| B2 | KPI | POSITIVE | Aceleași fapte, trei moduri de control | 209-kpi-review-v1 | PASS | {"ratings":[4,4,4],"modes":["MANUAL","LEARNING","AUTO"]} |
| B3 | KPI | POSITIVE | Douăsprezece luni sintetice, paginare vizuală și medie ponderată | 210-kpi-history-v1 | PASS | {"months":12,"monthsWithData":11,"monthsWithoutData":1,"partialMonths":1,"exactDays":310,"visualPoints":52,"revenue":31960,"reviews":284,"weightedMean":2.552817,"cappedPoints":20} |
| B4 | KPI | POSITIVE | Pop-up închis fără citiri, deschidere cu o singură citire, pauză în MANUAL | 210-kpi-history-popup-v1 | PASS | {"closedRefresh":"SKIPPED_CLOSED","readsBefore":0,"readsAfterOpen":1,"rendersAfterOpen":1,"suspensions":["panel"],"resumes":1} |
| B5 | DAILY | POSITIVE | Exact trei misiuni, obiectiv MANUAL îndeplinit și recompense unice pe obiectiv | 211-mission-daily-v1 | PASS | {"instances":3,"promisedXp":300,"grantedXp":200,"rewards":2,"manualState":"COMPLETED","manualProgress":2} |
| B6 | DAILY | NEGATIVE | Eveniment străin, mod nepotrivit și ziua următoare | 212-daily-progress-v1 | PASS | {"rejection":"FOREIGN_SESSION","nextDayAction":"NEW_DAY","nextDayRows":3,"rewardsKept":0} |
| B7 | XP | POSITIVE | Credite idempotente, fracții de minut și ferestre excluse | 213-player-progress-v1 | PASS | {"missionXp":100,"duplicateXp":0,"replayXp":0,"dailyXp":100,"balance":202.666666,"level":2,"pausedSkips":1,"backgroundSkips":1} |
| B8 | XP | NEGATIVE | Un credit negativ este refuzat, nu debitat | 213-player-progress-v1 | PASS | {"refused":true,"balanceMicroXp":202666666} |
| B9 | XP | POSITIVE | Amprente înainte/după pe cele cinci căi de scădere | 214-kpi-impact-v1 + 213-player-progress-v1 | PASS | {"balanceBefore":200.5,"balanceAfter":200.5,"levelBefore":2,"levelAfter":2,"fingerprintBefore":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","fingerprintAfter":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","paths":[{"id":"KPI_DOWN","fingerprint":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","unchanged":true},{"id":"INCIDENT","fingerprint":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","unchanged":true},{"id":"MISSION_FAILED","fingerprint":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","unchanged":true},{"id":"GOAL_REFUSED","fingerprint":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","unchanged":true},{"id":"DAY_MISSED","fingerprint":"85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc","unchanged":true}]} |
| B10 | CHECKPOINT | POSITIVE | Captură, commit, reluare și 60 de tick-uri identice cu oracolul | 206-world-checkpoint-v1 | PASS | {"tick":60,"vehicles":70,"bytes":64378,"checksum":"c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5","resumeMode":"PAUSED_AUTO","continuationTicks":60} |
| B11 | CHECKPOINT | NEGATIVE | Captură în interiorul tick-ului și snapshot modificat | 206-world-checkpoint-v1 | PASS | {"inStep":"TICK_NOT_BOUNDARY","tampered":"CHECKSUM_MISMATCH"} |
| B12 | REPLAY | POSITIVE | Fereastră completă, checksum reproductibil și rând modificat refuzat | 207-world-replay-chunk-v1 | PASS | {"bytes":129377,"samples":60,"status":"COMPLETE","events":1,"checksum":"ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218"} |
| B13 | REPLAY | POSITIVE | Seek și redare fără venit, review, reward sau XP | 141-experiment-replay-v1 | PASS | {"seekStatus":"SEEKED","landedTick":399,"atIncident":true,"frames":41,"liveWrites":0,"xpBalanceMicroXp":100000000} |
| C1 | COMBINED | POSITIVE | Conducere cu learning, recorder, autosave, KPI și XP în aceeași sesiune | 115-vertical-slice-v1 + 207 + 131 + 209 + 213 | PASS | {"ticks":1900,"vehicles":70,"baseCompliance":78.57142857142857,"learnedCompliance":100,"systemsCompliance":100,"learningDelta":21.428571,"systemsUnchanged":true,"settlements":3,"reviews":3,"xpBalance":200.5,"captures":4,"recorderPeakBytes":4909260} |
| C2 | BENCHMARK | COST | Costurile noi ale stack-ului combinat, față de bugetele din manifest | Docs/25 performance contract + performance-budgets.json | PASS | {"budgetVersion":"203-initial-1","recorderPeakBytes":4909260,"recorderCapBytes":25165824,"chunkBytes":632652,"chunkBytesPerSimulatedSecond":30367,"checkpointBytes":64900,"progressBytes":9804,"economyBytes":14483,"economyComponents":{"daily":4919,"economy":7341,"player":1745},"measuredBudgets":7} |
| C3 | PLAYTEST | POSITIVE | Playtest în browser: explicații, senzație de condus, HUD | Docs/validation-policy.md | NOT_RUN | Nu s-a rulat un browser real sau input uman. Nivelul atins este `targeted`, cu scenarii deterministe în Node; playtestul rămâne pentru gate-ul 235. |
| C4 | BENCHMARK | COST | Frame p95/p99 pe hardware real | performance-budgets.json proposedBudgets.frameP95Ms | NOT_RUN | Suita nu are renderer, GPU sau browser; bugetul de cadru rămâne al gate-urilor 220/224/155. Nu se raportează FPS headless. |
| D1 | DEPENDENCIES | DOCUMENT | Gate separat pentru extensii, fără dependență inversă | PBI/235 + 225-234 | PASS | {"gate":"235","gateDependencies":["216","224","226","228","229","230","233","234","084"],"extensionClosure":10,"missing":[],"inverse":[]} |
| D2 | DEPENDENCIES | DOCUMENT | Graful complet de dependențe nu are cicluri | PBI board | PASS | {"nodes":235,"edges":235,"cycles":0,"duplicates":0,"external":0} |
| D3 | DEPENDENCIES | DOCUMENT | Dependențele regresiei V1 sunt în Done | PBI/216 | PASS | {"dependencies":["215","141","108","208","217","205"],"undone":[]} |

## XP fără pierderi

Sold înainte: 200.5 XP (nivel 2, 3 intrări).
Sold după: 200.5 XP (nivel 2, 3 intrări).
Pierderi: **0**. Debitări: 0. Credite negative: false.

Amprenta stării economice (sold, nivel, intrări, cursor): `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` → `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc`.
Contoarele de refuz sunt intenționat în afara amprentei: un duplicat refuzat crește un contor fără să plătească sau să scadă XP.

| Cale de scădere | Amprentă după | Rezultat |
| --- | --- | --- |
| KPI_DOWN | `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` | identic |
| INCIDENT | `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` | identic |
| MISSION_FAILED | `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` | identic |
| GOAL_REFUSED | `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` | identic |
| DAY_MISSED | `85df901a8cacee6620dfdc7eb2c3f8e48ee5f135e27516d4a607b2643112e3cc` | identic |

## Costuri noi față de manifest

| Metrică | Real | Buget | Unitate | Verdict | Sursă |
| --- | --- | --- | --- | --- | --- |
| recorder peak charged bytes | 4909260 | 33554432 | bytes | PASS | performance-budgets.json proposedCapacities.recorderRamBytes |
| recorder sealed chunk bytes | 632652 | 134217728 | bytes | PASS | performance-budgets.json proposedCapacities.optionalReplayStorageBytes |
| autosave checkpoint bytes | 64900 | 1048576 | bytes | PASS | 131-autosave-v1 AUTOSAVE_BUDGET.maxCheckpointBytes (PERSISTENCE_LIMITS) |
| autosave progress body bytes | 9804 | 262144 | bytes | PASS | 131-autosave-v1 AUTOSAVE_BUDGET.maxProgressBodyBytes (PERSISTENCE_LIMITS) |
| economy bundle bytes | 14483 | 1048576 | bytes | PASS | 215-economy-save-v1 ECONOMY_SAVE_LIMITS.maxDocumentBytes |
| preparing checkpoints | 0 | 1 | generations | PASS | performance-budgets.json proposedCapacities.preparingCheckpoints |
| committing checkpoints | 0 | 1 | generations | PASS | performance-budgets.json proposedCapacities.committingCheckpoints |
| KPI visual chart points | 52 | — | points | NOT_RUN | no manifest budget; 210 KPI_HISTORY_LIMITS caps the chart |
| frame p95 | — | 18.5 | ms | NOT_RUN | performance-budgets.json proposedBudgets.desktop.frameP95Ms |

Lacune declarate, fără prag inventat:

- **frame / render**: Manifestul are buget frame p95, dar suita nu are renderer; nu se inventează o măsurătoare headless.
- **KPI chart points**: Manifestul nu are buget pentru punctele graficului; limita aplicabilă este KPI_HISTORY_LIMITS (60 implicit, 90 maximum), raportată ca limită de componentă.
- **economy bundle**: Manifestul nu are buget dedicat bundle-ului 215; limita aplicabilă este ECONOMY_SAVE_LIMITS.maxDocumentBytes (un rând de 1 MiB).
- **local Node tick cost**: Costul per tick al stack-ului este măsurabil doar cu ceas de perete; rulează separat cu `--cost` și nu este o probă de cadru.

## Dependențe

- Noduri: 235
- Muchii: 235
- Cicluri: 0
- Id-uri duplicate: 0
- Gate 235 acoperă extensiile 225–234: true
- Dependențe inverse către 235: 0
- Id-uri externe raportate: 0

## Versiuni

- threeModes: `217-three-modes-v1`
- cityStyle: `208-city-style-v1`
- learningEpoch: `205-learning-epoch-v1`
- worldSnapshot: `206-world-snapshot-v1`
- worldRecorder: `207-world-recorder-v1`
- worldReplayChunk: `207-world-replay-chunk-v1`
- kpi: `209-economy-clock-v1`
- kpiHistory: `210-kpi-history-v1`
- kpiImpact: `214-kpi-impact-v1`
- dailyGenerator: `211-daily-generator-v1`
- dailyProgress: `212-daily-progress-v1`
- budgetVersion: `203-initial-1`

## Limitări

- Nivel `targeted`: fără browser, GPU, input uman sau hardware de referință; playtestul și frame-ul rămân NOT_RUN.
- Condusul din proba combinată este comportamentul simulat 115 (oportunități declarate), nu fizica Babylon/Rapier live.
- Costurile de memorie sunt contoare de ownership (recorder, checkpoint, bundle), nu RAM totală a paginii.
- Review-urile din proba combinată folosesc durata reală a cursei din fixture și un read model 139 real pentru cursele finalizate; formula completă de confort rămâne a dovezilor 209/214.
- Costul per tick al stack-ului este măsurat separat, cu ceas de perete, de `npm run qa:v1-regression -- --cost`; nu este o probă de cadru sau de FPS.
- Nu s-a modificat `src/`; orice defect găsit ar fi raportat aici, nu reparat.
