# Dovezi 121 — obiectivul de confort al cursei cu pasager

Status: implementare și validare funcțională locală PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform
[politicii proporționale](../../validation-policy.md). Nu se revendică FPS, GPU, Rapier, soak sau
hardware; proba de browser nu este necesară pentru acest contract, pentru că obiectivul este o
contract de domeniu fără UI, fără DOM și fără efect în `main.ts`.

## Ce s-a livrat

- `src/missions/comfort.ts` — contractul `121-mission-comfort-v1`: obiectivul `passenger-comfort`,
  praguri derivate din catalogul real de parametri, pasager derivat din ciclul 061, segmente 069,
  proiecția telemetriei 085, excluderi 088, stări închise și poarta de misiune 116.
- `src/missions/index.ts` — exporturile publice ale modulului (constante, tipuri și funcții).
- `tests/missions/comfort-fixture.ts` — fixture care înregistrează cursele cu recorderul real 085
  și le filtrează cu filtrul real 088.
- `tests/missions/mission-comfort.test.ts` — 19 teste deterministe (lin, brusc, jerk, recuperare,
  teleport exclus, separare stil, contracte invalide, determinism, transcript).
- `tests/missions/mission-comfort-report.ts` + `scripts/run-mission-comfort-report.mjs` — raport
  determinist cu 43 de verificări, 10 scenarii și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 121): obiectivul de confort”.
- `PBI/Done/121-mission_comfort.md` — taskul mutat fizic în Done.

## Pragurile: date reale, nu valori inventate

Pragurile obiectivului sunt valorile implicite livrate de catalogul de parametri al proiectului,
citite la import din registrul real (`src/profiles/parameter-registry.ts`):

| Prag | Cheie de catalog | Valoare implicită | Unitate |
| --- | --- | --- | --- |
| accelerație maximă | `comfort_deceleration` | 2 | m/s² |
| jerk maxim | `acceleration_jerk` | 2 | m/s³ |

`COMFORT_THRESHOLD_SOURCE` publică cheile, iar `parseComfortObjective` refuză orice altă sursă de
prag. Pragurile sunt **constante de misiune**: niciun profil publicat sau ajustat manual nu este
citit la runtime, pipeline-ul de publicare a profilului (112) nu este atins și confortul nu este o
cheie de profil care poate fi învățată, reglată sau publicată.

## Separarea confort vs. fidelitatea stilului

- `separation` declară `styleFidelity: NOT_USED` și `styleScore: NOT_USED`.
- Rezultatul are `styleFidelity: null` și `styleScoreUsed: false`; niciun scenariu nu raportează
  valoare de stil (verificarea `no-style-in-any-scenario`).
- Un câmp de scor de stil în intrare este refuzat de parser ca câmp necunoscut
  (verificările `style-score-rejected` și `injectedStyleScoreRejected`).
- `comfortMissionOutcome` completează misiunea numai pentru un rezultat `PASSED`; un `DROPOFF`
  singur nu încheie obiectivul de confort.

## Teleportarea exclusă din indicatori

Folosim exclusiv span-ul `suppressed` al ferestrelor reale 088: un eșantion din span nu intră în
metrică, iar un interval de accelerație care traversează span-ul este eliminat. Cele două modele
reale de recuperare 030 sunt acoperite:

| Scenariu | Status | Vârf a | Vârf jerk | Intervale a | Intervale jerk | Excluse (eșantion/interval) | Teleporturi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `recovery-without-window` | FAILED `BOTH_LIMITS` | 720,9375 | 43200 | 120 | 119 | 0 / 0 | 0 |
| `recovery-segment-closed-088` | PASSED | 0,9375 | 0 | 118 | 117 | 1 / 1 | 1 |
| `recovery-open-segment-088` | PASSED | 0,9375 | 0 | 59 | 58 | 61 / 0 | 1 |

Fără fereastra 088 același salt de viteză este raportat corect ca violare (720,9375 m/s²), deci
filtrarea 088 este cea care separă teleportarea de condus, nu un prag mărit. Recuperările rămân
vizibile ca dovezi excluse: `exclusions.teleports`, `exclusions.collisions`, `exclusions.pauses`.

## Scenariile complete (raport determinist)

| Scenariu | Status | Motiv | Vârf a (m/s²) | Vârf jerk (m/s³) | Depășiri a / jerk |
| --- | --- | --- | --- | --- | --- |
| `smooth` | PASSED | — | 0,9375 | 0 | 0 / 0 |
| `brisk` | FAILED | `ACCELERATION_LIMIT` | 5,625 | 0 | 120 / 0 |
| `jerky` | FAILED | `JERK_LIMIT` | 1,875 | 225 | 0 / 119 |
| `recovery-without-window` | FAILED | `BOTH_LIMITS` | 720,9375 | 43200 | 1 / 2 |
| `recovery-segment-closed-088` | PASSED | — | 0,9375 | 0 | 0 / 0 |
| `recovery-open-segment-088` | PASSED | — | 0,9375 | 0 | 0 / 0 |
| `clean-window` | PASSED | — | 0,9375 | 0 | 0 / 0 |
| `no-passenger` | NO_PASSENGER | — | 0 | 0 | 0 / 0 |
| `insufficient-data` | INSUFFICIENT_DATA | — | 0,9375 | 0 | 0 / 0 |
| `window-exceeded` | WINDOW_EXCEEDED | — | 0 | 0 | 0 / 0 |

Toate stările închise (`PASSED`, `FAILED`, `NO_PASSENGER`, `INSUFFICIENT_DATA`, `WINDOW_EXCEEDED`)
sunt acoperite în raport și în test.

## Date reale, nu aproximări

- **085** — toate eșantioanele vin din recorderul real `createTickSampleRecorder`, segment
  `LEARNING` cu `learningEligible: true`, 121 eșantioane citite prin `readSample`. Verificarea
  `telemetry-derived-matches-recorded` arată că accelerația derivată de metrică (`Δv/Δt`) este
  identică cu accelerația longitudinală înregistrată de 085: deviație **0 m/s²**.
- **061** — prezența pasagerului este derivată (`comfortPassengerAboard`): `TO_DROPOFF` și `DROPOFF`
  au pasager, `TO_PICKUP`, `PICKUP`, `COMPLETED` și `CANCELLED` nu. Pasagerul nu poate fi afirmat
  liber de apelant.
- **069** — segmentele evaluate sunt segmente reale cu `controlMode` și `learningEligible` fixate
  la deschidere; un segment `MANUAL` cu eligibilitate `true` este refuzat.
- **088** — ferestrele de excludere sunt produse de filtrul real `createArtifactFilter`; faptele 030
  (`RECOVERY_TELEPORT` / `RECOVERY_030`) apar ca artefacte `TELEPORT` în fereastră.
- **116** — misiunea `campaign-5-comfort-ride` trece prin parserul real de catalog.

## Comenzi și rezultate exacte

Runtime: Node v24.19.0 / npm 11.17.0 (shell), `node_modules` deja instalat în worktree. Ieșirea
completă este în [checks.txt](checks.txt), ieșirea suitei complete în [tests.txt](tests.txt),
raportul mașină-citibil în [report.json](report.json) și tabelul uman în [report.md](report.md).

```powershell
npm run typecheck        # exit 0
npm run lint             # exit 0
npm run format:check     # All matched files use Prettier code style! exit 0
npm run check:architecture
# Architecture imports: PASS (267 TypeScript files)
# Architecture negative probes: PASS (6 forbidden dependencies rejected)
# exit 0
npm run check:parameter-catalog   # Parameter catalog is synchronized. exit 0
npm test                 # tests 1923, pass 1923, fail 0, duration_ms 67029.8014
node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-comfort.test.ts"
# tests 19, pass 19, fail 0, duration_ms 774.458
node --import ./scripts/register-typescript.mjs scripts/run-mission-comfort-report.mjs
# SUMMARY checks 43/43, scenarios 10, teleports excluded 1, overall PASS
node --import ./scripts/register-typescript.mjs scripts/run-mission-comfort-report.mjs --check
# Mission comfort report is current: Docs/Evidence/121-mission-comfort/report.json
npm run missions:comfort   # shortcut npm adăugat în package.json; aceeași ieșire 43/43 PASS
```

## Board

Fișierul taskului a fost mutat fizic din `PBI/In Progress/121-mission_comfort.md` în
`PBI/Done/121-mission_comfort.md` (sursa nu mai există, destinația există) și validat cu:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File ./PBI/Validate-Board.ps1 -RequireDone '121'
# {
#   "Valid": true,
#   "Total": 235,
#   "Columns": { "To Do": 102, "In Progress": 0, "Done": 133 },
#   "FirstId": "001",
#   "LastId": "235",
#   "RequiredDonePaths": [
#     "...\PBI\Done\121-mission_comfort.md"
#   ]
# }
# exit=0
```

Observație de mediu: `powershell` (Windows PowerShell 5.1) nu poate rula validatorul acestui
board — `ConvertFrom-Json` nu enumeră tablourile în 5.1, deci dependențele multi-valoare sunt
citite ca un singur element, iar validatorul se oprește la PBI-ul 054 („Dependență inexistentă
045 041 030 pentru 054”). Eroarea este **preexistentă și independentă de 121**: aceeași rulare pe
board-ul canonic neatinins produce exact același mesaj. Validatorul trece integral cu PowerShell 7
(`pwsh`), rularea de mai sus.

## Fișiere și documente atinse

- `src/missions/comfort.ts` (nou), `src/missions/index.ts` (exporturi).
- `tests/missions/comfort-fixture.ts` (nou), `tests/missions/mission-comfort.test.ts` (nou),
  `tests/missions/mission-comfort-report.ts` (nou).
- `scripts/run-mission-comfort-report.mjs` (nou).
- `Docs/13-misiuni-si-progres.md` (contractul 121).
- `Docs/Evidence/121-mission-comfort/README.md`, `checks.txt`, `tests.txt`, `report.json`,
  `report.md`.
- `PBI/In Progress/121-mission_comfort.md` → `PBI/Done/121-mission_comfort.md`.

Nu au fost atinse: pipeline-ul de publicare a profilului (112), catalogul de parametri
(`Docs/driving-parameters.json` și `src/profiles/parameter-catalog.generated.ts` rămân
neschimbate), modulele 061/069/085/088, UI-ul de misiuni și celelalte PBI-uri.

## Limite

- Pragurile sunt valorile implicite livrate de catalog (`comfort_deceleration`,
  `acceleration_jerk`), **nu** o calibrare cu pasageri umani. Calibrarea pe date reale de călătorie
  rămâne deschisă; PBI-ul 139 (metrici de confort) acoperă partea de KPI, nu acest obiectiv.
- Cursele din fixture sunt înregistrări deterministe ale recorderului 085, nu condus uman. Pașii de
  accelerație sunt dyadici (1/64 m/s per tick la 0,9375 m/s², 1/32 m/s la 1,875 m/s²) pentru ca
  stocarea float32 a recorderului să fie exactă și raportul să nu ascundă erori de rotunjire.
- Recorderul 085 refuză o fizică în afara intervalului ±100 m/s²; de aceea tick-ul teleportat este
  înregistrat cu accelerație longitudinală zero (recuperarea stabilește viteza, nu produce o
  accelerație fizică), iar saltul este identificat de filtrul 088.
- Nu există probă de browser: obiectivul nu are UI în V1 și nu este montat în `main.ts` sau în
  vertical slice (montarea misiunii rămâne PBI-ului 118/126). Nu se măsoară performanță, memorie
  sau latență.
- Obiectivul raportează accelerația longitudinală și jerk-ul pe interval; accelerația laterală și
  confortul în viraje nu sunt în contract.
