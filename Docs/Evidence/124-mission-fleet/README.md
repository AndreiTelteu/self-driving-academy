# Dovezi 124 — provocarea finală de serviciu

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform [politicii proporționale](../../validation-policy.md).
Nu se revendică FPS, GPU, Rapier, soak sau hardware; contractul este de domeniu, fără UI, DOM sau
efect în `main.ts`.

## Ce s-a livrat

- `src/missions/fleet.ts` — contractul `124-mission-fleet-v1`: briefing-ul de dinainte de start,
  cererea de curse 059, țintele de serviciu, bugetul numeric de incidente 007 și evaluarea celor trei
  dimensiuni separate (serviciu, confort, fidelitate) cu verdict compozit explicit.
- `src/missions/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-fleet-fixture.ts` — fixture real: scenariul 065 compune 032/033/041, 057,
  059, 060, 061 și 064; profilul este publicat prin 109 și aplicat prin 110; cursele de confort sunt
  ferestre reale 121; fidelitatea este evaluarea reală 122 a aceleiași flote; incidentele sunt
  evenimente 007 `COLLISION` în forma publicată de adaptorul 028.
- `tests/missions/mission-fleet.test.ts` — 13 teste deterministe (contract, briefing înainte de
  start, succes, eșec, reluare cu alt profil, buget depășit, buget idempotent, fereastră incompletă,
  cursă întârziată, refuzuri, determinism/imutabilitate, transcriptul raportului).
- `tests/missions/mission-fleet-report.ts` + `scripts/run-mission-fleet-report.mjs` — raport
  determinist cu 77 de verificări, 5 rulări și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 124): provocarea finală de serviciu".
- `package.json` — scriptul `missions:fleet`, adăugat la finalul blocului `scripts`.
- `Docs/Evidence/124-mission-fleet/report.json` și `report.md` — transcriptul real.
- `PBI/Done/124-mission_fleet.md` — taskul mutat fizic în Done.

## Ce conține fereastra de evaluare și cum e disponibilă înainte de start

`fleetChallengeBriefing` este un contract separat de evaluare. El cere doar definiția 116, dificultatea,
`startTick` și profilul, iar rezultatul are `status: BEFORE_START` și `evaluated: { rides: 0,
incidents: 0 }` structural. Un câmp de rezultat trimis la briefing (`rides`, `incidents`, un scor) este
refuzat ca „Unknown fleet briefing field", deci condițiile afișate nu pot depinde de cursă.

Fereastra este `[startTick, endTick]`, cu ambele capete incluse (`bounds: INCLUSIVE`), `durationTicks`
luat din `windowTicks` al definiției 116 (21.600 tick-uri = 6 minute la 60 Hz) și `endTick =
startTick + durationTicks`. Briefingul mai conține:

- cele patru condiții afișate, câte una pe dimensiune (`SERVICE`, `COMFORT`, `FIDELITY`, `INCIDENTS`),
  fiecare cu enunț și țintă;
- `serviceTargets` rezolvate (`minimumServedRides` din obiectivul 116, `minimumServedFraction`,
  `maximumLateRides`);
- `comfortTargets` (minimum o cursă evaluată, zero eșecuri, pragurile 121 de 2 m/s² și 2 m/s³);
- `fidelityTargets` (100% celule potrivite, verdict 122 `EXACT`);
- `incidentBudget` numeric din 116 (`0` pentru etapa 8);
- `compositeRule` cu regula de compunere și explicația de necompensare.

`evaluateFleetMission` reconstruiește exact același briefing din aceleași intrări și îl embeduiește în
rezultat. Testul și raportul compară byte-cu-byte briefingul embedat cu cel de dinainte de start
(`briefing-embedded-everywhere: true`), deci o cursă nu poate fi judecată după alte condiții decât
cele afișate. Panoul jucătorului poate randa direct acest obiect; PBI-ul nu include UI.

## Cererea de curse, țintele de serviciu și bugetul de incidente

Cererea este cererea reală 059 (`requestId`, `scenarioId`, `windowId`, `ordinal`, `spawnTick`,
`demandLevel`, `access: TAXI`, zonele de origine/destinație) plus promisiunea de serviciu autorată
`promiseTick`, cu `spawnTick < promiseTick <= endTick`. Rezultatul raportează pentru fiecare cerere
starea închisă (`SERVED`, `FAILED`, `CANCELLED`, `PENDING`), cursa 061 și taxiul, `responseTicks`,
`late` și secunde livrate.

Țintele de serviciu sunt `minimumServedRides` (pragul 116 `fleet-clean-dropoffs` pentru dificultatea
aleasă: 2/3/4 pentru EASY/NORMAL/HARD), `minimumServedFraction: 1` și `maximumLateRides: 0`. Valorile
măsurate vin exclusiv din 059/061: 32 de cereri în rularea de referință, curse servite/eșuate/anulate/
în așteptare, secunde planificate versus livrate. Nu există o metrică paralelă de serviciu.

Bugetul de incidente este numeric (`0`) și numără evenimente reale 007 `COLLISION`, validate cu
`parseSimulationEvent`, numai în intervalul evaluat și o singură dată pe `eventId`. O relivrare a
aceluiași eveniment este raportată ca `duplicates` și nu umflă bugetul; un incident din altă fereastră
sau al unui vehicul nedeclarat este refuzat.

## Cum sunt separate confortul, serviciul și fidelitatea

Cele trei dimensiuni au valori, praguri, verdicte și dovezi proprii:

- `service`: verdict `MET`/`BELOW_TARGET`, cu rândurile tuturor cererilor și secunde planificate/
  livrate/ratate;
- `comfort`: verdict `PASSED`/`FAILED`/`NOT_EVALUATED`, cu fiecare cursă 121 evaluată și vârfurile ei;
- `fidelity`: verdict `MET`/`BELOW_TARGET`, cu verdictul 122, celulele potrivite și fracția.

Verdictul compozit este o conjuncție explicită, nu un scor: `ALL_DIMENSIONS_WITHIN_BUDGET` produce
`SUCCESS` numai când fereastra este completă și toate cele patru condiții trec, `INCOMPLETE` când
fereastra s-a încheiat cu cereri fără rezultat și `FAILURE` altfel, cu `failingDimensions` și motive
închise. Nicio dimensiune nu compensează alta: în rularea `service-failure`, fidelitatea rămâne
`MET`/`EXACT` (3200/3200) deși serviciul și confortul eșuează, iar în `incident-budget` serviciul,
confortul și fidelitatea trec deși bugetul este depășit.

## Numere reale (din `report.json`)

| Rulare | Profil | Încercare | Serviciu | Confort | Fidelitate | Incidente | Compozit | Rezultat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| success | `fleet-124-v1` | 1 | `MET` 32/32 | `PASSED` 3/3 | `MET` `EXACT` 3200/3200 | 0/0 | `SUCCESS` | `PROGRESS` |
| service-failure | `fleet-124-v1` | 1 | `BELOW_TARGET` 2/32 | `FAILED` 0/2 | `MET` `EXACT` 3200/3200 | 0/0 | `FAILURE` | `NO_PROGRESS` |
| replay-other-profile | `fleet-124-v2` | 2 | `MET` 32/32 | `PASSED` 3/3 | `BELOW_TARGET` `PARTIAL` 3194/3200 | 0/0 | `FAILURE` | `NO_PROGRESS` |
| incident-budget | `fleet-124-v1` | 1 | `MET` 32/32 | `PASSED` 3/3 | `MET` `EXACT` 3200/3200 | 1/0 | `FAILURE` | `NO_PROGRESS` |
| incomplete-window | `fleet-124-v1` | 1 | `BELOW_TARGET` 2/32 | `PASSED` 2/2 | `MET` `EXACT` 3200/3200 | 0/0 | `INCOMPLETE` | `NO_PROGRESS` |

Detalii numerice:

- **succes**: 32 de cereri 059, 32 servite, fracție `1`, 4809,54451 s planificate = 4809,54451 s
  livrate, 0 secunde ratate, 0 curse întârziate, 3 curse de confort `PASSED` cu vârf 0 m/s² și 0 m/s³,
  3200/3200 celule de fidelitate, 0 incidente; fereastra se încheie legitim la tick-ul 802 din 21.600
  pentru că nu a rămas nicio cerere fără rezultat.
- **eșec**: 2 curse servite, 30 eșuate, fracție `0,0625`, 4809,54451 s planificate versus
  303,507729 s livrate, 4506,03678 s ratate; confort `FAILED` pe ambele curse evaluate (vârf
  300 m/s² și 36000 m/s³, peste pragurile 2/2); fidelitatea rămâne `EXACT`.
- **reluare cu alt profil**: încercarea 2 folosește `fleet-124-v2`, cu aceeași fereastră, aceleași
  condiții și aceleași ținte; 6 vehicule păstrează versiunea veche, deci fidelitatea 122 este
  `PARTIAL` cu 3194/3200 celule, iar compozitul eșuează doar pe `FIDELITY`.
- **buget depășit**: un eveniment 007 `COLLISION` real în fereastră, buget `0`, rămas `-1`, compozit
  `FAILURE` doar pe `INCIDENTS`; o relivrare a aceluiași `eventId` raportează `used: 1`,
  `duplicates: 1`.
- **fereastră incompletă**: 2 curse servite, 30 de cereri `PENDING`, fereastra se oprește la tick-ul 52
  din 21.600, compozit `INCOMPLETE` cu `failingDimensions: WINDOW, SERVICE` și motivele
  `WINDOW_INCOMPLETE, SERVICE_BELOW_TARGET`.

## Comenzi rulate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, fără avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (324 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2290 teste, 2290 pass, 0 fail, 76,42 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-fleet.test.ts"` | 13 teste, 13 pass, 0 fail |
| `npm run missions:fleet` | `SUMMARY checks 77/77, runs 5, overall PASS` |
| `node --import ./scripts/register-typescript.mjs scripts/run-mission-fleet-report.mjs --check` | `Mission fleet report is current`, exit 0 |

## Limite

- Rularea este Node deterministă: scenariul 065, cererile 059, cursele 061, activarea 109/110,
  confortul 121, fidelitatea 122 și evenimentele 007 sunt contracte reale, dar nu există browser,
  renderer sau sesiune umană. „Playtest-ul" succes/eșec/reluare este simulat determinist, nu jucat.
- Partea autorată este comportamentul jucătorului: ce cereri se finalizează, eșuează, se anulează sau
  rămân în așteptare, profilul de confort al curselor, câte vehicule păstrează versiunea veche și câte
  coliziuni reale apar. Aritmetica dimensiunilor și verdictelor este a contractului.
- Misiunea este un contract de domeniu: nu are HUD, panou sau compoziție în `main.ts`; briefingul este
  obiectul pe care un panou îl poate randa, nu o interfață livrată aici.
- Țintele `minimumServedFraction = 1`, `maximumLateRides = 0` și fidelitatea `100% / EXACT` sunt
  propuneri de calibrare V1, nu valori calibrate pe jucători reali.
- Nu se revendică FPS, frame, GPU, Rapier sau măsurători de hardware.
