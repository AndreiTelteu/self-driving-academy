# PBI 202 — închiderea release-ului V3 cu mers pe jos

Release-ul V3 se închide ca **documentat, derivat și verificat, dar `NOT_VALIDATED`**: toate cele 11
PBI-uri V3 (191–201) sunt fizic în `PBI/Done`, cu `completed_at`, dovezi fără „De completat" și raport
propriu, iar documentația descrie controalele și scope-ul real. Verdictul nu poate fi `PASS` cât timp
există rânduri `FAIL`/`NOT_RUN` deschise — moștenite din 190/201 și din defectele 153/235 — și nici nu
ar fi onest: contractele V3 sunt headless, nu sunt cablate într-o sesiune de browser.

Comanda este `npm run release:v3`:

```bash
npm run release:v3            # scrie artefactele și secțiunea finală din Docs/20
npm run release:v3 -- --check # regenerează în memorie și compară byte cu byte
```

## Ce s-a livrat

| Fișier | Conținut |
| --- | --- |
| [capabilities.json](capabilities.json) / [.md](capabilities.md) | 12 capabilități derivate din contractele 191–201 și din 188/211/213: ce poți face, numerele reale, dovada, nivelul de livrare și limitarea care rămâne |
| [controls.json](controls.json) / [.md](controls.md) | cele 15 acțiuni 009 cu tastele reale, consumatorii derivați din 066/067/030, cele 5 bindinguri fără listener și gesturile de pointer din 017/018/075/083 |
| [release-checklist.json](release-checklist.json) / [.md](release-checklist.md) | 23 de rânduri `PASS`/`FAIL`/`NOT_RUN`, 13 deschise, fiecare cu owner; tabelul 11/11 al dependențelor V3 |
| [scripts/run-v3-release-artifact.mjs](../../../scripts/run-v3-release-artifact.mjs) | generatorul determinist, cu `--check`; intrarea `release:v3` este ultima din `scripts` |
| [Docs/20](../../20-extensii-si-mers-pe-jos.md) | secțiune finală generată între marcaje, plus corectura afirmației despre XP-ul de mers |

`src/`, `Docs/25`, `Docs/11`, `Docs/13`, `Docs/18`, `Docs/19`, `Docs/driving-parameters.json`,
`Docs/performance-budgets.json`, bugetele și celelalte dovezi comise nu au fost modificate.

## Cum derivă artefactul (nu este scris de mână)

Lanțul este executabil, nu narativ:

1. **Dependențele** — pentru fiecare ID 191–201, generatorul caută fișierul în `PBI/Done`, citește
   frontmatterul (`status`, `completed_at`), verifică absența fișierului din `To Do`/`In Progress`,
   citește `Docs/Evidence/<id>-*/README.md` (nu acceptă „De completat"), cere `report.json` comis și
   verifică faptul că `report.command` (`npm run …`) există în `package.json`.
2. **Capabilitățile** — fiecare rând este legat de contractul și raportul PBI-ului care îl livrează;
   numerele (scenarii, rază, tranziții, segmente, verificări, digeste) sunt citite din rapoarte, iar
   constantele reale vin din `src/character` și `src/input` (`WALKER_GAIT_SPEEDS_MPS`,
   `WALKER_POLICY.stepCeilingM`, `CHARACTER_JOINT_IDS`, `authorityDriveActions`).
3. **Nivelul de livrare** — `src/main.ts` este compoziția de browser; generatorul numără referințele la
   `character`, `authority`, `walker`, la adaptorul de tastatură și la cel de moduri. Rezultatul real
   este **0/0/0/0/0**, deci fiecare capabilitate este `HEADLESS_CONTRACT`, cu limitarea ei explicită.
4. **Controalele** — tastele vin din `createDefaultSettings(...).input.bindings`; consumatorii sunt
   derivați din textul adaptoarelor (066 pentru cele șapte acțiuni, 067 pentru M/L, 030 pentru R).
   Un binding fără consumator este `DECLARED_ONLY`, nu control funcțional.
5. **Checklist-ul** — fiecare rând este calculat dintr-un raport comis (201 C1/C2/C3, 216, 187, 200,
   199, 224, 153, 235, 190) sau din artefactul însuși. Un rând deschis fără owner oprește rularea.

### Rezultatul real

| Indicator | Valoare |
| --- | ---: |
| Dependențe V3 în `PBI/Done`, cu dovezi și raport | **11/11** |
| Capabilități derivate | **12** |
| Capabilități `HEADLESS_CONTRACT` / `IN_GAME` | **12 / 0** |
| Limitări declarate (ce nu e livrat end-to-end) | **6** |
| Acțiuni de control 009 / cu consumator real / declarate fără listener | **15 / 10 / 5** |
| Gesturi de pointer implementate / indisponibile | **4 / 1** |
| Chei extinse rezervate de etapa de plan | **56** |
| Chei extinse cu provocare dedicată | **15/56** |
| Rânduri de checklist `PASS` / `FAIL` / `NOT_RUN` | **10 / 3 / 10** |
| Rânduri deschise, fiecare cu owner | **13** |
| Verdict de release | **NOT_VALIDATED** |

## Criteriul 1 — 11/11 dependențe V3, dovadă pe disc

Tabelul de mai jos este derivat din disc la fiecare rulare; `release-checklist.md` îl publică integral,
cu `completed_at`, README, raport și comanda raportului.

| ID | Fișier în `PBI/Done` | `completed_at` | Dovezi | Verdict |
| --- | --- | --- | --- | --- |
| 191 | `191-character_assets.md` | `2026-11-14T19:45:00+02:00` | `Docs/Evidence/191-v3-character/` | PASS |
| 192 | `192-character_physics.md` | `2026-11-14T20:31:48+02:00` | `Docs/Evidence/192-v3-walker/` | PASS |
| 193 | `193-character_input.md` | `2026-11-14T21:06:40+02:00` | `Docs/Evidence/193-v3-authority/` | PASS |
| 194 | `194-character_camera.md` | `2026-11-14T21:39:01+02:00` | `Docs/Evidence/194-v3-camera/` | PASS |
| 195 | `195-enter_vehicle.md` | `2026-11-14T22:14:02+02:00` | `Docs/Evidence/195-v3-enter/` | PASS |
| 196 | `196-exit_vehicle.md` | `2026-11-14T22:51:34.261+02:00` | `Docs/Evidence/196-v3-exit/` | PASS |
| 197 | `197-walking_fleet_jump.md` | `2026-11-14T23:36:49.634+02:00` | `Docs/Evidence/197-v3-fleet-switch/` | PASS |
| 198 | `198-walking_segments.md` | `2026-11-15T00:03:06+02:00` | `Docs/Evidence/198-v3-walking-segments/` | PASS |
| 199 | `199-walking_missions.md` | `2026-11-15T00:42:41+02:00` | `Docs/Evidence/199-v3-walking-tutorial/` | PASS |
| 200 | `200-walking_save.md` | `2026-11-15T01:35:20+02:00` | `Docs/Evidence/200-v3-walking-save/` | PASS |
| 201 | `201-walking_qa.md` | `2026-11-15T02:40:37+02:00` | `Docs/Evidence/201-v3-validation/` | PASS |

Fiecare rând cere patru lucruri, nu unul: fișierul fizic în `Done`, `status: "Done"` cu `completed_at`
completat, un README de dovezi fără „De completat" și un `report.json` a cărui comandă există în
`package.json`. Un singur eșec face rândul `FAIL` și oprește verdictul artefactului.

## Criteriul 2 — documentația spune adevărul

### Controalele reale

Tastele documentate sunt exact cele din `createDefaultSettings` (009), nu o listă paralelă:

- **Condus**: `W` accelerație, `S` frână/înapoi, `A`/`D` virare, `Space` frână de mână, `Q`/`E`
  semnalizare — toate consumate de adaptorul 066.
- **Moduri**: `M` MANUAL, `L` LEARNING — singurele două taste pe care adaptorul 067 le transformă în
  intenții.
- **Recuperare**: `R`, prin adaptorul 030.
- **Declarate fără listener de tastatură**: `K` (KPI), `Tab` (flotă), `C` (cameră), `P` (profil),
  `Escape` (pauză). Acțiunile există în UI ca butoane; `C` are un toggle separat în adaptorul de
  renderer, care nu citește bindingul 009. Toate 15 sunt remapabile prin 080.
- **Pointer**: clic pe un vehicul din canvas (068, prag de drag 5 px), clic pe un rând din lista flotei
  (075), pointer lock pentru camera vehiculului cu Escape pentru eliberare (017), Tab/Shift+Tab prins în
  panou și Escape pentru închidere (083).
- **Ce nu există**: orbită de cameră third person cu mouse-ul. Contractul 194 primește orbita doar ca
  intenție explicită; nu a fost inventat un binding.
- **Alergarea**: `sprint` există în vocabularul 193, dar nu are binding 009. Este canal de contract, nu
  control live — și este declarat astfel.

### Capabilitățile și limitările

Cele 12 capabilități sunt contracte headless: personaj third person (17 articulații, 5 clipuri,
compatibilitate 9/9), mers/alergare/idle (8/8 scenarii, 1.3710/2.9091 m/s, pas 0.14 m), autoritate unică
(13/13, 512 tick-uri exhaustive, 0 livrări greșite), cameră (5/5, tranziție 18 cadre, 0 clonări), intrare
(10/10, rază 0.89 m), ieșire (12/12, marjă 0.05 m, 2 → 2 entități), schimbare taxi (12/12, FOCUS la
200 m cu 0 m mișcați), segmente (16/16, 3600 tick-uri/82.26 m cu 0 segmente), tutorial (6 pași, 30 de
refuzuri, acces taxiuri `NEVER_GATED`), salvare (160/160 verificări, 4/4 scenarii), cele trei moduri
(3/3 + 3/3) și provocările/KPI-urile neatinse (catalog compus 27, digeste 9/9 identice).

Ce **nu** este livrat end-to-end este declarat în șase rânduri cu owner: cele 56 de chei extinse rezervate
(`KEY_EXTENSION_STAGE`), acoperirea 15/56 a provocărilor, XP-ul de timp de mers `NOT_IMPLEMENTED`,
streamingul vizual `NOT_MEASURED`, FPS-ul hardware `NOT_VALIDATED` și compunerea în browser
`NOT_COMPOSED`.

### Corectura din Docs/20

Fraza „Mersul activ poate contribui la XP de timp, fără a deveni demonstrație de driving" promitea o
funcționalitate inexistentă: contractul 199 raportează `walkingTimeXp = 'NOT_IMPLEMENTED'` și
`xpGranted = 0`. Fraza a fost înlocuită cu afirmația explicită că mersul nu acordă XP de timp în această
revizie. Corectura este în afara secțiunii generate (rândul de context V3) și este consemnată aici și în
secțiunea finală. Nicio altă afirmație din Docs/20 nu a fost modificată.

## Ce rămâne deschis (moștenit, cu owner)

| Rând | Verdict | Owner | Ce lipsește |
| --- | --- | --- | --- |
| `contract25-v3` | `NOT_RUN` | 201/224 | contractul 25 pe workload-ul V3: FPS/frame pe GPU real și cei 2 pași vizuali |
| `hardware-fps-v3` | `NOT_RUN` | operator GPU + 224 | `fps-hardware = NOT_VALIDATED`; capturile 220 sunt pe alt build |
| `harness-v3-timing` | `NOT_RUN` | 220/224 | harness cu personaj, pietoni și pericole; workload-ul V3 nu are probe de timp |
| `visual-streaming` | `NOT_RUN` | 157/223 | 2 pași `NOT_MEASURED`, cer renderer real |
| `soak-v3` | `NOT_RUN` | 159/224 | soak de 60 min pe workload-ul V3, nu pe V1 |
| `playtest-human` | `NOT_RUN` | 235/216 | 0/5 participanți; rândul C3 al lui 216 rămâne `NOT_RUN` |
| `qa-ui-153` | `FAIL` | 153 | 8 defecte MEDIUM (D1–D8), inclusiv suprafețe ieșite din viewport la 200% zoom |
| `fun-experience-235` | `FAIL` | 235 | C3 eșuat (confort HUD/cameră/first-person), C5 `NOT_RUN` |
| `inherited-v2-gates` | `FAIL` | 224/220/159/216/235 | checklist-ul 190 păstrează 6 rânduri deschise |
| `remeasure-224` | `NOT_RUN` | 224 | dovada comisă a gate-ului 224 nu este pe revizia curentă |
| `extended-keys-56` | `NOT_RUN` | etapa de plan | cele 56 de chei sunt certificate, dar rezervate |
| `walking-time-xp` | `NOT_RUN` | 199/213 | XP de timp de mers `NOT_IMPLEMENTED` |
| `in-game-composition` | `NOT_RUN` | compoziția aplicației | contractele nu sunt cablate în `src/main.ts` |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run release:v3` | exit 0; 6 fișiere scrise; 12/12 verificări `PASS`; dependențe 11/11; checklist 10 PASS / 3 FAIL / 10 NOT_RUN; release `NOT_VALIDATED`; artefact `PASS` |
| `npm run release:v3 -- --check` | exit 0; „Release artifacts V3 are current." |
| `node --import ./scripts/register-typescript.mjs --test tests/release/v3-release-artifact.test.ts` | exit 0; 7/7 teste trecute |
| `npm run typecheck` | exit 0 (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 warning-uri |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!" |
| `npm run check:architecture` | exit 0, PASS |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized." |
| `npm test` | exit 0; **3 415 teste, 3 415 trecute, 0 eșuate** (3 408 existente + 7 în `tests/release`) |
| `pwsh ./PBI/Validate-Board.ps1 -RequireDone '202'` | `Valid: true`, 235 task-uri (0 To Do, 0 In Progress, 235 Done) |

## Fișiere atinse

| Fișier | Schimbare |
| --- | --- |
| `scripts/run-v3-release-artifact.mjs` | nou — generatorul cu `--check` |
| `tests/release/v3-release-artifact.test.ts` | nou — poarta de execuție a artefactului |
| `package.json` | o intrare nouă, ultima din `scripts`: `release:v3` |
| `Docs/20-extensii-si-mers-pe-jos.md` | secțiune finală generată + corectura XP-ului de mers |
| `Docs/Evidence/202-v3-release/` | nou — capabilities, controls, checklist, acest document |

## Limitări

- Generatorul citește dovezile comise și nu reexecută probele grele (FPS hardware, soak, browser,
  playtest). Un rând `PASS` înseamnă că dovada comisă spune `PASS` și că fișierul există, nu că proba a
  fost reexecutată aici.
- Nivelul `HEADLESS_CONTRACT` este o constatare despre compoziția actuală (`src/main.ts`), nu un verdict
  despre calitatea contractelor. Compunerea într-o sesiune de browser rămâne un pas separat, cu owner.
- Artefactul nu inventează cifre de FPS, latență sau senzație de joc; acestea rămân `NOT_RUN`.
- `--check` compară și secțiunea din Docs/20; o editare manuală între marcaje este raportată ca învechită.
