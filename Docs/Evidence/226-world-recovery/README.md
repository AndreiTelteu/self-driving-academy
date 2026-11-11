# Dovezi PBI 226 — deblocare rapidă și resetul orașului cu stil păstrat

Contract: `226-world-recovery-v1` · modul ales: **`src/persistence/`** (`src/persistence/world-recovery.ts`) ·
nivel de validare: `targeted`.

## Ce s-a livrat

Un singur coordinator pentru trei operații cu efecte disjuncte:

| Operație | Ce face exact | Ce nu atinge |
| --- | --- | --- |
| `recoverVehicle` (R, inclusiv HUD) | repoziționează vehiculul controlat la un punct validat `SAFE` de recuperarea 030, restaurează mobilitatea și, cu pasager, închide cursa **o singură dată** cu `RECOVERED_WITH_PASSENGER` | epoci, profil, serie economică, checkpoint, XP, daily, rewards, misiuni |
| `beginCityReset` + `commitCityReset` | scrie checkpointul `SCENARIO_RESET`, închide segmente și curse/provocări o dată, invalidează joburile vechi, avansează `worldEpoch`/`learningEpoch`/`economyEpoch`, repornește lumea în `PAUSED_AUTO` și marchează discontinuitatea replay | transformarea vehiculului, stilul activ, XP/daily/rewards/misiuni/dovezi |
| `restoreStyle` | activează o versiune 109 în spatele barierei `learningEpoch` | lumea fizică, cursele, checkpointul, seria economică, XP/daily/rewards/misiuni |

Proprietarii reali sunt conduși prin porturi, nu duplicați: `RecoveryVehicle` este literal
`Pick<ReturnType<typeof createVehicleRecovery>, 'readProjection' | 'request' | 'commit' | 'readHistory'>`
din `src/vehicles`, iar portul lumii refolosește vocabularul `SessionWorldPort` al lui 225
(`closeSegment`, `invalidateJobs(..., 'WORLD_RESET')`, `releaseInput`, `start(PAUSED_AUTO)`).

## Rezultate reale (report.json)

- Verificări: **65/65 PASS** (`report.json`, `summary.pass = true`).
- R: `colliderCount = 0`, `mobilityRestored = true`, `ticksToMobility = 0`, `stages = 5`,
  `xpBeforeMicroXp = 500000 → 500000`, `xpDeltaMicroXp = 0`, `debits = 0`.
- R cu pasager: **1** închidere `RECOVERED_WITH_PASSENGER` (`revenue = 0`, terminal), al doilea R
  închide **0**, istoricul rămâne **1**.
- Haos: provocarea recuperată este `AVAILABLE` la același tick, `ticksWaited = 0`; în Academie
  `retries = 0`.
- Reset: epoce `1/0/1 → 2/1/2`, **2** activități închise cu `SCENARIO_RESET` (`revenue = 0, 0`),
  **1** segment închis, **2** joburi invalidate, **2** inputuri eliberate, lume nouă cu **64**
  corpuri, **40** vehicule de trafic, **1** listener, **2** joburi, **1** lume vie, serie economică
  `1 → 2` cu istoric **2**, replay `WORLD_RESET` cu discontinuitate, checkpoint **612 bytes**
  (checksum 71 caractere), `missionCompletions = 0`, `rewardGrants = 0`.
- Păstrate după reset: profil (checksum identic), dovezi, XP (`500000`), daily, rewards, misiuni.
- 20 de reseturi: epoce `21/20/21`, **20** checkpointuri, **20** fapte replay, **21** serii
  economice, **1** închidere de scenă, **0** duplicate, corpuri `[64]`, listeners `[1]`,
  joburi `[2]`, **1** lume vie, XP și profil neschimbate.
- Commit refuzat: `CHECKPOINT_COMMIT_FAILED`, **0** checkpointuri, epoce neschimbate, **0** închideri,
  **1** serie; reîncercarea comite **o dată**.
- Reset parțial: etapa `WORLD_REBUILD`, fault activ, reluare `RESET`, **1** checkpoint, **2** serii,
  **0** închideri duplicate.
- Stil: `profile-1@1 → profile-1@2`, checksum valid, barieră `LEARNING_EPOCH` (`0 → 1`),
  `worldEpoch`/`economyEpoch` neschimbate, **0** închideri, **0** checkpointuri, **0** fapte replay,
  a doua activare refuzată `ALREADY_ACTIVE`.

## Comenzi executate și rezultate

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`, zero erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, zero avertismente) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (importuri, 6 + 4 + 3 probe negative, entry point reale) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/world-recovery.test.ts tests/persistence/world-recovery-report.test.ts` | **21/21 PASS** |
| `node --import ./scripts/register-typescript.mjs scripts/run-world-recovery-report.mjs` | **65/65 verificări, PASS** |
| `node --import ./scripts/register-typescript.mjs scripts/run-world-recovery-report.mjs --cost --cost-iterations 500` | `cost.json`: 500 iterații, medie 0,556 ms, p95 0,93 ms, max 5,148 ms |
| `node --import ./scripts/register-typescript.mjs scripts/run-world-recovery-report.mjs --check` | PASS („World recovery report is current”) |
| `npm test` (prima rulare) | 2577 teste, **2576 pass**, 1 fail: `tests/workers/protocol.test.ts` (buget de anulare 100,79 ms sub încărcarea paralelă a altor agenți) |
| `npm test` (repetare, conform politicii) | 2577 teste, **2577 pass, 0 fail**, 86,8 s |
| `PBI/Validate-Board.ps1` (după mutarea în In Progress) | `Valid: true`, `In Progress: 1`, `RequiredDonePaths: []` |
| `PBI/Validate-Board.ps1 -RequireDone '226'` | `Valid: true`, `Done: 172`, `In Progress: 0`, `RequiredDonePaths: ["PBI/Done/226-world_recovery.md"]` |

## Fișiere atinse

- `src/persistence/world-recovery.ts` — nou: contractul `226-world-recovery-v1`.
- `src/persistence/index.ts` — exporturile noi, adăugate la finalul blocului existent.
- `tests/persistence/world-recovery-fixture.ts` — dubluri deterministe pentru 030/206/209/207/065/109
  peste instanțele reale 211/212/213/125/116/109.
- `tests/persistence/world-recovery.test.ts` — 18 teste deterministe.
- `tests/persistence/world-recovery-report.ts` — transcriptul determinist + `measureRecoveryCost`.
- `tests/persistence/world-recovery-report.test.ts` — dovada că raportul comis este cel curent.
- `scripts/run-world-recovery-report.mjs` — scriptul de raport, cu `--check` și `--cost`.
- `package.json` — `world:recovery`, ultima intrare din blocul `"scripts"`.
- `Docs/26-joaca-libera-haos-si-distrugere.md` — secțiunea „Contract implementat V1 (PBI 226)”.
- `Docs/Evidence/226-world-recovery/README.md`, `report.json`, `report.md`, `cost.json`.
- `PBI/Done/226-world_recovery.md` — mutat fizic din `In Progress`.

## Performanță (performance_checks: simulation, storage, frame)

Aplicat nivelul `targeted` din [politica de validare](../../validation-policy.md): corectitudine
izolată și cost local, fără benchmark hardware și fără a pretinde playtest uman.

- **simulation**: R se comite la aceeași graniță de tick (`ticksToMobility = 0`) în 5 etape
  sincrone; resetul nu mută munca în tick (`workOnResetTick = 0`), are cel mult un reset pregătit și
  un commit simultan, conform `proposedCapacities.preparingCheckpoints = 1` /
  `committingCheckpoints = 1`.
- **storage**: checkpointul de reset are **612 bytes** canonici și checksum `sha256:` de 71
  caractere; 20 de reseturi scriu exact 20 de checkpointuri. `twoSessionCheckpointBytes` rămâne
  `null` în [manifest](../../performance-budgets.json): nu este inventat.
- **frame**: nu s-a măsurat FPS, p95/p99 de cadru sau latență input→comandă pe workload-ul real;
  raportul declară explicit `NOT_MEASURED`.
- **Ținta de două secunde**: `target.proposedMs = 2000`, `measured = "NOT_MEASURED"`,
  `playtest = "NOT_PERFORMED"`, `humanPlaytestClaimed = false`. Obiectiv s-a măsurat doar ce este
  determinist; costul real de perete al apelului în harness (dubluri, nu browser) stă separat în
  `cost.json` (500 iterații: medie 0,556 ms, p95 0,93 ms), exact ca precedentul 206: costul nu intră
  în `report.json`.

## Limitări

- Adaptorul durabil al checkpointului și al lumii rămâne al stratului de compoziție; modulul livrează
  contractul și magazinul determinist în memorie.
- Nu s-a executat un playtest uman al revenirii la condus și nu s-a măsurat hardware; ținta de două
  secunde rămâne nevalidată ca senzație de joc.
- Decorul destructibil, bugetele lui de corpuri/efecte și integrările vizuale rămân la PBI 227.
- Heap-ul exact rămâne `null`; memoria este raportată ca contoare de proprietate (lumi, joburi,
  listeners, checkpointuri, serii economice), nu ca bytes de heap.
- Porturile 030/206/209/207/065 sunt dubluri deterministe ale contractelor; tipul `RecoveryVehicle`
  leagă 030 la signatura reală, iar vocabularele `WORLD_RESET`/discontinuitate sunt verificate față
  de constantele publicate de 207 în raport.
