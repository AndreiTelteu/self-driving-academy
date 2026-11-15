# Checklist de release V3 (PBI 202)

> Fișier generat determinist de `npm run release:v3`. Nu edita manual.

**Verdict: NOT_VALIDATED.** 10 `PASS`, 3 `FAIL`, 10 `NOT_RUN`; 13 rânduri deschise, fiecare cu owner. Verdictul nu poate fi `PASS` cât timp există rânduri `FAIL` sau `NOT_RUN`.

## Rândurile checklist-ului

| Rând | Arie | Criteriu | Verdict | Owner | Dovadă | Detaliu |
| --- | --- | --- | --- | --- | --- | --- |
| `dependencies-v3` | Dependențe | Lanțul V3 191–201 este fizic în Done, cu completed_at, dovezi și raport propriu | PASS | — | `PBI/Done`<br>`Docs/Evidence` | 11/11 PBI-uri V3 în Done, fiecare cu `completed_at`, README fără „De completat", raport comis și comanda raportului prezentă în `package.json` |
| `artifact-derived` | Artefact | Capabilitățile și controalele sunt derivate, iar verificările artefactului trec | PASS | proprietarul 202 (release V3) | `Docs/Evidence/202-v3-release/capabilities.json`<br>`Docs/Evidence/202-v3-release/controls.json` | 12 capabilități, 6 limitări declarate, 15 acțiuni de control |
| `controls-real` | Controale | Fiecare control documentat există în cod; niciunul nu este inventat | PASS | — | `Docs/Evidence/202-v3-release/controls.md`<br>`src/settings/store.ts` | 10 acțiuni cu consumator real, 5 declarate fără listener, 4 gesturi de pointer implementate |
| `character-chain` | Verificare | Lanțul personaj–mașină trece în toate cele trei moduri, cu o singură autoritate | PASS | — | `Docs/Evidence/201-v3-validation/report.json` | PASS: 3/3 moduri (AUTO/MANUAL/LEARNING) trec lanțul real 192→195→193→196→197→198 și 3/3 conduceri rămân cu o singură autoritate; fiecare mod se reia după ieșire (FOCUS+TAKE+RETURN) și personajul merge 1.226 m; 216 27/29 rânduri PASS cu 0 pierderi XP; 198 16/16 scenarii; 200 160/160 verificări de salvare/reload. |
| `digest-integrity` | Verificare | Mersul nu alterează catalogul, KPI-urile, XP-ul sau starea zilnică | PASS | — | `Docs/Evidence/201-v3-validation/report.json` | PASS: 9/9 digeste SHA-256 identice după 5000 tick-uri de mers (114.10 m) și după reload 200: catalog 092 (fișier + registru), capabilități 187, KPI 209 (1 zi), ledger 209 (3 decontări), XP 213 (2 intrări, 100.5 XP / nivel 2), daily 211 și sesiunea 135; reload ACCEPTED, checksum verificat, 0 corpuri create, al doilea reload identic. 187: 80 chei, 0 findings. |
| `contract25-v3` | Performanță | Contractul 25 pe workload-ul V3, inclusiv streamingul vizual | NOT_RUN | proprietarul 201/224 | `Docs/Evidence/201-v3-validation/report.json`<br>`Docs/Evidence/224-performance-gate/report.json` | NOT_RUN: Contractul 25 reexecutat pe workload-ul `201-workload-v3-1`: 158 PASS, 157 STRUCTURAL_PASS (17 PASS / 2 NOT_MEASURED), 159 SOAK_PASS, 224 structural PASS, 154 9/9 combinații. Manifest 203-initial-1 nemodificat (SHA-256 identic cu HEAD). FPS/frame pe GPU real rămâne NOT_RUN (fps-hardware NOT_VALIDATED): cei 2 pași vizuali NOT_MEASURED cer renderer real. |
| `v1-regression` | Regresii | Regresia V1 rămâne fără eșecuri și fără pierderi de XP | PASS | — | `Docs/Evidence/216-v1-regression/report.json` | 27/29 rânduri PASS, 0 FAIL, 2 NOT_RUN |
| `v2-parameter-gate` | Catalog | Catalogul de 80 de chei rămâne certificat, fără findings | PASS | — | `Docs/Evidence/187-v2-parameter-gate/report.json` | 80/80 chei, 0 findings, verdict PASS |
| `walking-save` | Salvare | Slotul V3 păstrează poziția, camera și autoritatea, iar migrarea este validă | PASS | — | `Docs/Evidence/200-v3-walking-save/report.json` | 160/160 verificări, 4/4 scenarii, 18/18 refuzuri închise |
| `walking-tutorial` | Misiuni | Tutorialul nu blochează accesul la taxiuri și nu inventează XP | PASS | — | `Docs/Evidence/199-v3-walking-tutorial/report.json` | 6 pași, 6 pozitive, 30 refuzuri, acces taxiuri NEVER_GATED |
| `docs-scope` | Documentație | Docs/20 descrie scope-ul real și trimite la artefactul V3 | PASS | proprietarul 202 (release V3) | `Docs/20-extensii-si-mers-pe-jos.md`<br>`Docs/Evidence/202-v3-release/capabilities.md` | secțiunea finală generată există, iar promisiunea de XP pentru timpul de mers a fost înlocuită cu `NOT_IMPLEMENTED` |
| `hardware-fps-v3` | Performanță | FPS, frame p95/p99 și lucru GPU pe hardware real, ambele backenduri | NOT_RUN | operatorul cu GPU real + proprietarul 224 | `Docs/Evidence/224-performance-gate/report.json`<br>`Docs/Evidence/201-v3-validation/report.json` | 224: `fps-hardware = NOT_VALIDATED`, release `NOT_VALIDATED`; FPS headless nu este raportat ca FPS real. |
| `harness-v3-timing` | Performanță | Harness de performanță cu workload-ul V3 (personaj, pietoni, pericole) | NOT_RUN | proprietarul 220/224 | `Docs/Evidence/201-v3-validation/report.json` | Harness-ul de performanță (155/156/158/220/224) exprimă flota și civilii; nu are fixture cu personaj, pietoni sau pericole. Măsurarea frame/simulare pe `201-workload-v3-1` cere o pagină de harness cu GPU real, care nu există în ownership-ul acestui PBI. Cifrele de FPS/tick pentru V3 nu sunt inventate. (workload `201-workload-v3-1`) |
| `visual-streaming` | Performanță | Streamingul vizual: cei doi pași `NOT_MEASURED` ai lui 157 | NOT_RUN | proprietarul 157/223 | `Docs/Evidence/157-render-budget/report.json`<br>`Docs/Evidence/201-v3-validation/report.json` | Doi pași cer renderer real; 157 raportează `STRUCTURAL_PASS` cu 2 `NOT_MEASURED`, nu o măsurătoare vizuală. |
| `soak-v3` | Performanță | Soak V3 de 60 de minute pe workload-ul cu personaj | NOT_RUN | proprietarul 159/224 | `Docs/Evidence/159-soak/report.json`<br>`Docs/Evidence/201-v3-validation/report.json` | Soak-ul comis (60,002 min, 20 cicluri) este pe workload-ul V1 și citit din dovezi, nu reexecutat; nu are variantă cu personaj, pietoni și pericole. |
| `playtest-human` | Experiență | Playtest uman cu minimum cinci participanți | NOT_RUN | proprietarul 235/216 | `Docs/Evidence/235-fun-qa/report.json`<br>`Docs/Evidence/216-v1-regression/report.json` | 235: `NOT_RUN`, 0/5 participanți; rândul C3 al lui 216 rămâne `NOT_RUN`. |
| `qa-ui-153` | Moștenire | QA vizual 153: opt defecte medii, inclusiv două componente ieșite din viewport la 200% zoom | FAIL | proprietarul 153 (QA vizual) | `Docs/Evidence/153-ui-qa/report.json` | 8/308 verificări eșuate, 8 defecte MEDIUM deschise (D1, D2, D3, D4, D5, D6, D7, D8) |
| `fun-experience-235` | Moștenire | Experiența 235: confort HUD/cameră și playtestul rămân deschise | FAIL | proprietarul 235 (experiență) | `Docs/Evidence/235-fun-qa/report.json` | C3 eșuat, C5 neexecutat; 4/6 criterii PASS |
| `inherited-v2-gates` | Moștenire | Deschiderile checklist-ului V2 rămân vizibile în release-ul V3 | FAIL | proprietarii rândurilor din 190 (224, 220, 159, 216/235) | `Docs/Evidence/190-v2-release/release-checklist.json` | 190 păstrează 6 rânduri deschise: `inherited-v1-gates`, `fps-hardware`, `harness-v2`, `soak-v2`, `playtest-human`, `remeasure-224` |
| `remeasure-224` | Performanță | Dovada comisă a gate-ului 224 este pe revizia curentă | NOT_RUN | proprietarul 224 | `Docs/Evidence/224-performance-gate/report.json`<br>`Docs/Evidence/201-v3-validation/gate-measure/report.json` | 201 a reexecutat gate-ul într-un director propriu (`structural PASS`), fără să suprascrie dovada comisă a lui 224; `--check` pe dovada comisă rămâne deschis. |
| `extended-keys-56` | Scope | Cele 56 de chei extinse nu sunt livrabile end-to-end | NOT_RUN | proprietarul etapei de plan (migrarea `KEY_EXTENSION_STAGE`) | `src/learning/candidate-validation.ts`<br>`Docs/Evidence/187-v2-parameter-gate/report.json` | 56 chei rezervate; validarea candidaților le refuză cu codul etapei, iar exportul le scrie `null`. |
| `walking-time-xp` | Scope | XP pentru timpul de mers nu este implementat | NOT_RUN | proprietarul 199/213 | `Docs/Evidence/199-v3-walking-tutorial/report.json` | `walkingTimeXp = NOT_IMPLEMENTED`, `xpGranted = 0`; Docs/20 declară explicit această lipsă. |
| `in-game-composition` | Scope | Contractele V3 sunt headless, nu cablate într-o sesiune de browser | NOT_RUN | proprietarul compoziției aplicației (src/main.ts) | `src/main.ts` | 0 referințe la `character`, 0 la `authority`, 0 la `walker` în `src/main.ts`; dovada este contractul și raportul, nu o sesiune jucabilă. |

## Dependențele V3 (191–201)

| ID | Titlu | Fișier | Status | completed_at | Dovezi | Raport | Comandă | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `191` | Personaj animații și reprezentare | `PBI/Done/191-character_assets.md` | Done | `2026-11-14T19:45:00+02:00` | `Docs/Evidence/191-v3-character/README.md` | `Docs/Evidence/191-v3-character/report.json` | `character:report` | PASS |
| `192` | Controller fizic pentru mers pe jos | `PBI/Done/192-character_physics.md` | Done | `2026-11-14T20:31:48+02:00` | `Docs/Evidence/192-v3-walker/README.md` | `Docs/Evidence/192-v3-walker/report.json` | `walker:report` | PASS |
| `193` | Autoritate input la personaj sau mașină | `PBI/Done/193-character_input.md` | Done | `2026-11-14T21:06:40+02:00` | `Docs/Evidence/193-v3-authority/README.md` | `Docs/Evidence/193-v3-authority/report.json` | `authority:report` | PASS |
| `194` | Cameră third person pentru personaj | `PBI/Done/194-character_camera.md` | Done | `2026-11-14T21:39:01+02:00` | `Docs/Evidence/194-v3-camera/README.md` | `Docs/Evidence/194-v3-camera/report.json` | `character:camera` | PASS |
| `195` | Intrarea în orice mașină din proximitate | `PBI/Done/195-enter_vehicle.md` | Done | `2026-11-14T22:14:02+02:00` | `Docs/Evidence/195-v3-enter/README.md` | `Docs/Evidence/195-v3-enter/report.json` | `enter:report` | PASS |
| `196` | Ieșirea din mașină și punct valid | `PBI/Done/196-exit_vehicle.md` | Done | `2026-11-14T22:51:34.261+02:00` | `Docs/Evidence/196-v3-exit/README.md` | `Docs/Evidence/196-v3-exit/report.json` | `exit:report` | PASS |
| `197` | Schimbare rapidă taxi și revenire la mers | `PBI/Done/197-walking_fleet_jump.md` | Done | `2026-11-14T23:36:49.634+02:00` | `Docs/Evidence/197-v3-fleet-switch/README.md` | `Docs/Evidence/197-v3-fleet-switch/report.json` | `fleet:switch` | PASS |
| `198` | Intervenții și telemetrie cu personaj | `PBI/Done/198-walking_segments.md` | Done | `2026-11-15T00:03:06+02:00` | `Docs/Evidence/198-v3-walking-segments/README.md` | `Docs/Evidence/198-v3-walking-segments/report.json` | `walking:segments` | PASS |
| `199` | Tutorial și misiuni pentru mers și vehicule | `PBI/Done/199-walking_missions.md` | Done | `2026-11-15T00:42:41+02:00` | `Docs/Evidence/199-v3-walking-tutorial/README.md` | `Docs/Evidence/199-v3-walking-tutorial/report.json` | `walking:tutorial` | PASS |
| `200` | Salvarea personajului și migrare V3 | `PBI/Done/200-walking_save.md` | Done | `2026-11-15T01:35:20+02:00` | `Docs/Evidence/200-v3-walking-save/README.md` | `Docs/Evidence/200-v3-walking-save/report.json` | `walking:save` | PASS |
| `201` | Validare integrală V3 | `PBI/Done/201-walking_qa.md` | Done | `2026-11-15T02:40:37+02:00` | `Docs/Evidence/201-v3-validation/README.md` | `Docs/Evidence/201-v3-validation/report.json` | `qa:v3-validation` | PASS |

**11/11** PBI-uri V3 sunt fizic în `PBI/Done`, cu `status: Done`, `completed_at` completat, un README de dovezi fără „De completat" și un raport a cărui comandă există în `package.json`.

## Rândurile deschise

- `contract25-v3` (**NOT_RUN**) — NOT_RUN: Contractul 25 reexecutat pe workload-ul `201-workload-v3-1`: 158 PASS, 157 STRUCTURAL_PASS (17 PASS / 2 NOT_MEASURED), 159 SOAK_PASS, 224 structural PASS, 154 9/9 combinații. Manifest 203-initial-1 nemodificat (SHA-256 identic cu HEAD). FPS/frame pe GPU real rămâne NOT_RUN (fps-hardware NOT_VALIDATED): cei 2 pași vizuali NOT_MEASURED cer renderer real. · owner: proprietarul 201/224
- `hardware-fps-v3` (**NOT_RUN**) — 224: `fps-hardware = NOT_VALIDATED`, release `NOT_VALIDATED`; FPS headless nu este raportat ca FPS real. · owner: operatorul cu GPU real + proprietarul 224
- `harness-v3-timing` (**NOT_RUN**) — Harness-ul de performanță (155/156/158/220/224) exprimă flota și civilii; nu are fixture cu personaj, pietoni sau pericole. Măsurarea frame/simulare pe `201-workload-v3-1` cere o pagină de harness cu GPU real, care nu există în ownership-ul acestui PBI. Cifrele de FPS/tick pentru V3 nu sunt inventate. (workload `201-workload-v3-1`) · owner: proprietarul 220/224
- `visual-streaming` (**NOT_RUN**) — Doi pași cer renderer real; 157 raportează `STRUCTURAL_PASS` cu 2 `NOT_MEASURED`, nu o măsurătoare vizuală. · owner: proprietarul 157/223
- `soak-v3` (**NOT_RUN**) — Soak-ul comis (60,002 min, 20 cicluri) este pe workload-ul V1 și citit din dovezi, nu reexecutat; nu are variantă cu personaj, pietoni și pericole. · owner: proprietarul 159/224
- `playtest-human` (**NOT_RUN**) — 235: `NOT_RUN`, 0/5 participanți; rândul C3 al lui 216 rămâne `NOT_RUN`. · owner: proprietarul 235/216
- `qa-ui-153` (**FAIL**) — 8/308 verificări eșuate, 8 defecte MEDIUM deschise (D1, D2, D3, D4, D5, D6, D7, D8) · owner: proprietarul 153 (QA vizual)
- `fun-experience-235` (**FAIL**) — C3 eșuat, C5 neexecutat; 4/6 criterii PASS · owner: proprietarul 235 (experiență)
- `inherited-v2-gates` (**FAIL**) — 190 păstrează 6 rânduri deschise: `inherited-v1-gates`, `fps-hardware`, `harness-v2`, `soak-v2`, `playtest-human`, `remeasure-224` · owner: proprietarii rândurilor din 190 (224, 220, 159, 216/235)
- `remeasure-224` (**NOT_RUN**) — 201 a reexecutat gate-ul într-un director propriu (`structural PASS`), fără să suprascrie dovada comisă a lui 224; `--check` pe dovada comisă rămâne deschis. · owner: proprietarul 224
- `extended-keys-56` (**NOT_RUN**) — 56 chei rezervate; validarea candidaților le refuză cu codul etapei, iar exportul le scrie `null`. · owner: proprietarul etapei de plan (migrarea `KEY_EXTENSION_STAGE`)
- `walking-time-xp` (**NOT_RUN**) — `walkingTimeXp = NOT_IMPLEMENTED`, `xpGranted = 0`; Docs/20 declară explicit această lipsă. · owner: proprietarul 199/213
- `in-game-composition` (**NOT_RUN**) — 0 referințe la `character`, 0 la `authority`, 0 la `walker` în `src/main.ts`; dovada este contractul și raportul, nu o sesiune jucabilă. · owner: proprietarul compoziției aplicației (src/main.ts)

## Comenzi

```bash
npm run release:v3
npm run release:v3 -- --check
```
