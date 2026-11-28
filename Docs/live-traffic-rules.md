# Regulile de trafic live (PBI283)

Versiune 1 · 28 noiembrie 2026. Parte din [planul complet](README.md). Starea de board rămâne a owner-ului de integrare; acest document descrie contractul implementat local.

`createLiveTrafficRules({ map, graph, context })` este adaptorul dintre simularea 058 și contractele deja livrate. El nu creează o a doua simulare, un al doilea ledger, un al doilea store de profil sau un al doilea planner:

- **036** este singurul controller de semafoare. `step(tick)` avansează fazele o dată pe tickul autoritativ, iar fiecare mișcare proprie este citită cu `getMovementSignal`. Semnalele sunt publicate în cadrul 044 cu `completeness.signals = true`.
- **050** primește observația autoritativă a mișcării proprii, linia de oprire authored și cheia de oportunitate derivată din `phaseStartedTick`. Un profil cu `red_stop_probability` sub eșantion poate produce `CROSS_RED_BY_PROFILE`; profilul comun implicit (1) oprește la roșu.
- **037** rămâne producătorul dovezii STOP. `getOpportunity(vehicleId)` expune fereastra de staționare deja deținută de 037 (`startedTick`, `stationaryDurationS`, `distanceToStopLineM`, `full`, `crossed`), fără o a doua dovadă.
- **051** distinge oprirea completă (`FULL_STOP` după dwell), rolling stop-ul (`ROLL_THROUGH`) și traversarea liniei (`STOP_LINE_CROSSED`). Un latch de eliberare ține eliberarea aceleiași oportunități după ce dowell-ul a fost satisfăcut, ca micro-deplasarea de la plecare să nu re-pornească dovada.
- **038/052** folosesc un sidecar de prioritate construit din harta reală: toate perechile incompatibile primesc o regulă explicită. La intersecțiile semaforizate regula este `EQUAL` (036 decide), iar la cele cu STOP ordinea authored este axa X, apoi mișcarea dreaptă înainte, apoi ID-ul lexicografic al mișcării. Nu se citește textura, ordinea de randare sau ordinea array-ului.
- **052** primește observații locale complete pentru actori din același conflict, predicția de lansare a subiectului oprit și predicția constantă a celor care se apropie. O coadă all-way ține ordinea reală de sosire (037 `startedTick`); un vehicul aflat în spatele subiectului nu mai poate înfometa primul arrival. Un breaker explicit de 8 s este folosit doar când nu există niciun actor conflictual în mișcare aproape de intrare.
- **053** cere gap față/spate, acoperire completă, avantaj de viteză și cooldown. O schimbare validată este executată de plannerul 041 existent: banda țintă devine originea, destinația este păstrată, iar progresul longitudinal este proiectat fără deplasare înapoi. Latch-ul și cooldown-ul sunt ținute de apelant.
- **054** este consultat numai pentru un actor oprit fără lider și fără apropiere de intersecție. `REQUEST_REROUTE` este executat de 058 prin plannerul 041 real, pornind de la banda curentă. Nu există o a doua plasare fizică.
- **Jucătorul** este observat numai prin fapte reale: proiecția pe bandă, linia de semnal a mișcării proprii, starea 036 și evenimentul 037 `STOP_LINE_CROSSED`. O trecere pe roșu produce un `LiveTrafficViolationEvent` cu tick, semnal, mișcare, linie, viteza și distanțele reale înainte/după. Fără observație anterioară nu există eveniment; o trecere pe verde nu produce eveniment.

## Cost, limite și recuperare

Adaptorul rulează la 60 Hz pentru semafoare, observația 037 și violații. Decizia 050/051/052/053/054 este fazată la 10 Hz per actor, ca schedulerul 219. Costul este raportat separat în `report().cost` (eșantioane bounded 600) și nu intră în fizica 282. `Docs/Evidence/283-live-traffic/report.json` separă flow-ul de 40 de actori (p95 reguli 0.89 ms/tick, 4.66 ms/tick cost total măsurat) de stress-ul de 56 de actori (p95 1.28 ms/tick, 6.77 ms/tick total) și raportează `deadlockStalls: 0` pentru ambele rulări de 5, respectiv 10 minute.

Un hold STOP/YIELD/BLOCKED care ține un actor staționar 45 s fără lider este tratat ca o rețea blocată: adaptorul îl eliberează explicit și incrementează `blocked.stalledRecoveries`. Hold-ul de semafor nu este eliberat de acest breaker; culoarea rămâne autoritativă. Aceasta este o recuperare de host, nu o culoare verde inventată; semafoarele, STOP-ul și yield-ul normal rămân autoritative. Un al doilea breaker explicit (8 s) există pentru o coadă all-way fără niciun actor conflictual în mișcare.

Limitări: planul de semafoare al hărții de neighbourhood are cicluri lungi (33–59 faze per intersecție), deci un trafic de 56 de actori poate sta în coadă minute întregi (18 actori peste 60 s la finalul rulării de 10 minute, fără niciun actor fără progres 5 minute). Adapterul nu inventează o culoare verde și nu scurtează programul authored. Oprirea/recuperarea fizică 030 și preluarea oricărei mașini rămân 284/282. Proba de browser este un fixture Chromium peste aceleași module 032/033/058/283, cu canvas 2D; shell-ul Babylon complet intră în pauza 012 `overload` în randarea software headless înainte de un ciclu de 226 s, deci nu este declarat ca probă end-to-end a scenei.

## Verificare

- `tests/autonomy/live-traffic-rules.test.ts` — semafor, STOP complet/rolling/crossing, yield, lane-change, violație reală și absența dovezilor fabricate.
- `tests/fleet/civil-traffic-rules.test.ts` — integrarea pe harta reală, flow, cost și deadlock.
- `npm run traffic:live` — raport determinist și proba de cost/deadlock.
- `npm run traffic:live:probe` — proba de browser (Chromium/Playwright), roșu, STOP și consecința.
