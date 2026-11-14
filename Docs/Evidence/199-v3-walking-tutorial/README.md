# 199 — tutorial și misiuni pentru mers și vehicule

Contract: `199-walking-tutorial-v1` în [`src/missions/walking-tutorial.ts`](../../../src/missions/walking-tutorial.ts),
exportat din `src/missions/index.ts`. Este un model de progres **pur, headless și determinist**, ca
tutorialul 117: fără Babylon, fără DOM, fără ceas, fără `Math.random`, fără serviciu de simulare,
fără scriere în telemetrie, fără profil și fără job de learning.

## Ce s-a implementat

### Șase pași, fiecare dintr-un singur eveniment real

| Pas | Eveniment care îl avansează | Sursă |
| --- | --- | --- |
| `SELECT_TAXI` | selecția acceptată a unui taxi | 068 |
| `WALK_TO_TAXI` | mișcarea reală a walker-ului între două poziții autoritare | 192 |
| `ENTER_VEHICLE` | intrarea acceptată (mod `MANUAL`, autoritate `VEHICLE:<id>`) | 195 |
| `BOARD_PASSENGER` | `PICKUP` validat pentru taxiul ales | 007 |
| `FINISH_RIDE` | `DROPOFF` validat pentru cursa îmbarcată | 007 |
| `EXIT_VEHICLE` | ieșirea acceptată (mod `AUTO`, autoritate `CHARACTER:<id>`) | 196 |

Tutorialul nu are nicio altă cale de avansare: nu citește timp, cadre, poziția în listă sau text.
Prima stare 192 observată doar înregistrează poziția (`WALK_BASELINE_RECORDED`); pasul de mers
avansează numai când poziția următoare diferă. Intrarea și ieșirea sunt validate structural din
deciziile reale 195/196: modul impus, autoritatea 193 corectă, număr de entități neschimbat și
amprenta stării mașinii identică înainte/după.

### Fără dublă bifare, fără avansare din eveniment greșit

- Vocabular închis de refuz: `WRONG_STEP`, `FOREIGN_VEHICLE`, `NO_SELECTED_TAXI`, `RIDE_NOT_BOARDED`,
  `UNRELATED_EVENT`, `EVENT_ALREADY_APPLIED`, `NO_WALKER_MOTION`, `ENTRY_REFUSED`, `EXIT_REFUSED`,
  `TUTORIAL_COMPLETE`, `TUTORIAL_ABANDONED`, `TUTORIAL_PAUSED`, `WALK_BASELINE_RECORDED`,
  `EVIDENCE_DROPPED`, `NOT_A_TAXI`, `TUTORIAL_NOT_ACTIVE`.
- Fiecare pas are un singur eveniment care îl poate satisface; celelalte cinci evenimente reale sunt
  refuzate fără să schimbe progresul (30 de sonde).
- Un fapt rejucat pe tutorialul complet este refuzat cu `TUTORIAL_COMPLETE`; pașii rămân `SATISFIED`
  o singură dată, cu același `satisfiedTick`.
- `skip`, `pause`, `resume` și `abandon` sunt explicit modelate; un tutorial abandonat păstrează
  progresul parțial și nu mai avansează.

### Criteriul 1 — flota și misiunile existente sunt neatinse

Testul [`tests/missions/walking-tutorial.test.ts`](../../../tests/missions/walking-tutorial.test.ts)
construiește independent, înainte de tutorial și după el, un snapshot complet: catalogul 231
(12 template-uri), provocările 188 (15, total 27), setul zilnic 211 pentru `2026-11-15` (3 instanțe),
progresul și deblocările 125, accesul la flota reală 057 (64 vehicule, 24 taxiuri, 64 conduse,
24 selectabile, zero revocări, zero taxiuri blocate), `PlayerProgress` 213 și o misiune V1 finalizată
prin tracker-ul real 116. JSON-ul complet și digeste SHA-256 sunt bit-identice după tutorialul
complet **și** după cel abandonat la mijloc.

### Fără learning

- `stats()` raportează structural `learningJobs: 0`, `profileVersions: 0`, `demonstrations: 0`,
  `estimatorCandidates: 0`, `blockedSelections: 0`, `xpGranted: 0`.
- Un `PROFILE_ACTIVATE` este doar dovadă (`learningActivationsObserved`) și nu avansează niciun pas.
- Martorul 198: 120 de tick-uri de mers prin contractul real de segmente produc **0** segmente și
  **0** candidați; un segment `LEARNING` închis produce exact **1** candidat, deci poarta 069 nu este
  tautologică.
- Un test de sursă verifică faptul că modulul nu importă `learning`, `telemetry`, `profiles` sau
  `experiments` și nu apelează `estimatorCandidate(`.

### Reluare, serializare, XP

- Aceeași secvență de două ori → aceeași stare finală și același digest.
- Reluarea din mijloc (`snapshot()` → `parseWalkingTutorialState` → `createWalkingTutorial({ resume })`)
  continuă exact ca rularea neîntreruptă. Parserul strict refuză versiunea necunoscută, ordinea
  schimbată a pașilor, contoarele inconsistente, un pas terminal rămas `PENDING` și istoricul
  nemonoton.
- XP pentru timpul de mers (permis de Docs/20) **nu este implementat** aici:
  `WALKING_TUTORIAL_POLICY.walkingTimeXp = 'NOT_IMPLEMENTED'` și `stats().xpGranted` rămâne zero.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings (`eslint . --max-warnings 0`) |
| `npm run format:check` | „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS (409 fișiere TypeScript), probe negative PASS |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `npm test` | **3392/3392** teste trecute, 0 eșecuri, 1 suită, 112,8 s |
| `npm run walking:tutorial` | PASS: 6/6 pași, 30/30 refuzuri, 10/10 verificări, digest `sha256:e3c83000985001c76f6f9ebed6a94a8e45067862a8c87a278b2e86c767a3f898` |
| `npm run walking:tutorial -- --check` | raport curent |
| testele țintă `tests/missions/walking-tutorial*.test.ts` | 17/17 trecute |

Snapshot de compatibilitate din raport: catalog 231 `sha256:8b16253fcd4d8792f2f66dc4468cc3614175dc6935af1597b6a3cb97704d6f89`,
provocări 188 `sha256:2f1708b5e95ce61c43181f46756f795aec66e427ada1442686124be9b6e7f913`,
daily 211 `sha256:62fb673902333d1a9ea3a487676064802c8ebc31ea6fa5e4bc6921a1dd2df052`,
acces flotă `sha256:29eb133a97582c17cab46432d666f5c88c122b2817b8c166e0f7178744716a98` —
aceleași înainte, după tutorialul complet și după cel abandonat.

## Fișiere atinse

- Creat: `src/missions/walking-tutorial.ts`
- Modificat: `src/missions/index.ts` (export la finalul fișierului)
- Creat: `tests/missions/walking-tutorial-suite.ts`, `tests/missions/walking-tutorial.test.ts`
- Creat: `tests/missions/walking-tutorial-report.ts`, `tests/missions/walking-tutorial-report.test.ts`
- Creat: `scripts/run-v3-walking-tutorial-report.mjs`
- Modificat: `package.json` (ultimul script: `walking:tutorial`)
- Modificat: `Docs/13-misiuni-si-progres.md` (secțiune nouă la final)
- Creat: `Docs/Evidence/199-v3-walking-tutorial/README.md`, `report.json`, `report.md`
- Mutat fizic: `PBI/To Do/199-walking_missions.md` → `PBI/Done/199-walking_missions.md`

## Limitări

- XP pentru timpul de mers nu este implementat aici; Docs/20 îl permite, contractul îl raportează
  explicit ca `NOT_IMPLEMENTED` și nu îl simulează.
- Tutorialul este headless: UI-ul, tastatura și HUD-ul rămân ale modulelor existente; proba folosește
  stări 192 și decizii 195/196 reale, nu un browser.
- Provocările 231/188, misiunile zilnice, deblocările și `PlayerProgress` sunt citite ca snapshot
  comparativ; tutorialul nu are legătură de scriere cu ele.
- Reluarea este idempotentă pe progres, nu pe contoarele de dovadă: un fapt rejucat este refuzat, dar
  numărul de observații crește, exact ca la 117.
