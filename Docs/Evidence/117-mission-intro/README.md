# Dovezi 117 — tutorialul de control pentru primul taxi

Status: implementare și validare funcțională locală PASS. Nivel de validare: `funcțional izolat`
plus o integrare scurtă în browser, conform [politicii proporționale](../../validation-policy.md).
Nu se revendică FPS, GPU, Rapier, soak sau hardware.

## Ce s-a livrat

- `src/missions/tutorial.ts` — contractul `117-mission-tutorial-v1`: cinci pași fixați, observații
  067/068 tipizate, evenimente 007 reale pentru cursă, skip/pauză/reluare, acces la taxiuri
  negate, garanția „fără învățare accidentală” și limite fixe.
- `src/ui/mission-tutorial-format.ts` — parser strict al snapshot-ului de panou și proiecția
  textelor/butoanelor (`117-mission-tutorial-ui-v1`).
- `src/ui/mission-tutorial.ts` — panoul DOM cu patru butoane native, fără listener global.
- `tests/missions/tutorial-fixture.ts`, `tests/missions/mission-intro.test.ts` (13 teste),
  `tests/ui/mission-tutorial.test.ts` (6 teste).
- `tests/missions/mission-intro-report.ts` + `scripts/run-mission-intro-report.mjs` — raport
  determinist cu 40 de verificări și suport `--check`.
- `scripts/capture-mission-tutorial.mjs` — playtest scurt în Chromium pe portul 5117, cu capturi.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 117): tutorialul de control”.

## Rezultat

- Parcursul complet dintr-o singură rulare (selecție taxi → M → L → M → pickup → dropoff) termină
  tutorialul cu `completedBy: PLAY`, toți cei cinci pași `SATISFIED` și **0** joburi de learning,
  **0** versiuni de profil, **0** activări `PROFILE_ACTIVATE` observate.
- O observație `LEARNING` cu `learningEligible: true` sau `null` este refuzată cu eroare de contract
  pentru orice pas; contorul `refusedLearning` ajunge la 2, iar pasul curent rămâne neschimbat.
  Calea ineligibilă funcționează în continuare la același tick.
- Orice taxi rămâne selectabil: `canSelectTaxi` întoarce `allowed: true` pentru fiecare identitate,
  `blockedSelections` este 0, iar selectarea altui taxi la pasul 3 nu resetează pașii deja
  satisfăcuți și nu blochează continuarea. Un vehicul civil este `NOT_A_TAXI`, fără efect.
- Skip: sărirea unui pas avansează la următorul (`SKIPPED`), iar `skip ALL` termină cu
  `completedBy: SKIP` și numără pașii săriți. Pauza transformă observațiile în `TUTORIAL_PAUSED`,
  iar reluarea continuă exact de la pasul reținut.
- Cursa cere `PICKUP` real pentru taxiul selectat: `DROPOFF` de la alt taxi → `FOREIGN_VEHICLE`,
  fără îmbarcare → `RIDE_NOT_BOARDED`, alt `rideId` → `RIDE_NOT_BOARDED`; abia perechea reală
  completează. Pe bus-ul 007 real, un `PROFILE_ACTIVATE` este numărat ca evidență, nu ca progres.
- Panoul: patru butoane native, stare `ACTIVE` cu trei acțiuni, `PAUSED` doar cu `Reia`,
  `COMPLETED` fără nicio acțiune; 0 listeneri globali; redare throttled la 10 Hz cu bypass pe
  schimbarea pasului/etapei.

## Playtest în browser (port 5117)

`scripts/capture-mission-tutorial.mjs` compilează modulul real `src/ui/mission-tutorial.ts` cu
`tsc --ignoreConfig`, servește fișierele emise dintr-un director temporar pe `127.0.0.1:5117` și
rulează Chromium headless la 1280×720. Sesiunea este scurtă, serverul și browserul sunt închise în
`finally`, iar directorul temporar este șters.

- 4 capturi: `playtest-active.png`, `playtest-paused.png`, `playtest-resumed.png`,
  `playtest-completed.png` (Chromium 156.0.8078.4).
- 14/14 verificări: un singur panou, etichetă de regiune, trei acțiuni active, zero listeneri
  globali, Tab → `Pauză` + Enter → `PAUSED`, doar `Reia` activ, Tab → `Reia` + Space → `ACTIVE`,
  tasta de condus `M` nu schimbă starea, clic pe „Sari peste tutorial” → `COMPLETED` cu toate
  butoanele dezactivate și textul „Tutorial finalizat”, zero erori de pagină.
- `playtest.json` păstrează toate verificările și observațiile; capturile sunt randări ale panoului
  real, nu cadre de simulare.

## Comenzi și rezultate exacte

Runtime: Volta, Node 24.21.0 / npm 11.19.0. `npm ci` a rulat o singură dată la început în worktree
(avertisment `EBADENGINE` pentru Node 24.19.0 din shell, 249 pachete instalate, fără eroare de
instalare).

```powershell
npm run typecheck        # exit 0
npm run lint             # exit 0
npm run format:check     # All matched files use Prettier code style! exit 0
npm run check:architecture
# Architecture imports: PASS (266 TypeScript files)
# Architecture negative probes: PASS (6 forbidden dependencies rejected)
# Inspector exception negative probes: PASS (4 forbidden imports rejected)
# Rapier adapter negative probes: PASS (3 forbidden imports rejected)
# exit 0
npm test                 # tests 1904, pass 1904, fail 0, duration_ms 68971.84
node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-intro.test.ts" "tests/ui/mission-tutorial.test.ts"
# tests 19, pass 19, fail 0
node --import ./scripts/register-typescript.mjs scripts/run-mission-intro-report.mjs
# SUMMARY checks 40/40, steps 5, learning jobs 0, overall PASS
node --import ./scripts/register-typescript.mjs scripts/run-mission-intro-report.mjs --check
# Mission intro report is current: Docs/Evidence/117-mission-intro/report.json
$env:PLAYWRIGHT_MODULE='<main checkout>/node_modules/playwright/index.js'
node scripts/capture-mission-tutorial.mjs
# SUMMARY captures 4, checks 14/14, overall PASS
```

Jurnalul complet este în [checks.txt](checks.txt), ieșirea țintită a testelor în
[tests.txt](tests.txt), raportul mașină-citibil în [report.json](report.json) și tabelul uman în
[report.md](report.md).

## Reguli verificate

- **Fără învățare accidentală:** eligibility `false` este obligatorie pentru `LEARNING`; refuzul
  nu avansează pasul, iar contractul nu are nicio cale de a crea job/versiune.
- **Acces necondiționat:** selecția nu este filtrată, dezactivată sau blocată de progres.
- **Fapte reale:** progresul vine doar din 067/068 și din evenimente 007 validate; textul HUD și
  cadrele nu sunt intrări.
- **Ordine explicită:** doar pasul curent poate fi satisfăcut sau sărit; restul observațiilor au
  motive închise.
- **Reluare sigură:** pauza nu pierde progres, reluarea nu sare pași, tick-urile vechi aruncă.
- **Buget fix:** cinci pași, patru dovezi pe pas, un panou, patru listeneri, zero globali.

## Limite

- Panoul nu este montat în `main.ts` sau în vertical slice; compunerea și ecranul de misiuni rămân
  în PBI-urile de UI/compoziție. Nu există XP, persistare între sesiuni sau blocare de taxiuri.
- Testul de browser montează panoul real cu un host de probă determinist, nu jocul complet; nu
  măsoară FPS, memorie sau performanță.
- Tutorialul cere ca apelantul să trimită proiecția 067 și intenția 068; nu le citește singur și nu
  înlocuiește control authority.
- Pragurile și textele sunt propuneri de design; nu există playtest uman de gameplay complet.
