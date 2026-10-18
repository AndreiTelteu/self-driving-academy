# Dovezi PBI050 — politica la roșu și verde

Nivel `targeted` (Docs/validation-policy.md): corectitudine izolată + cost local înainte/după +
memorie + integrare nativă. Nu se pretinde FPS, hardware sau bugetul jocului integrat.

## Rezultat implementare

Politica 050 produce fapte de decizie la 10 Hz pentru semnalul propriu al subiectului: conformare
probabilistică eșantionată o singură dată pe oportunitate identificată, offset la linia de oprire,
întârziere de plecare la verde și orizont de frânare la roșu târziu. Compoziția se face prin
`signalBehaviorFacts` în `BehaviorFacts.stop`, iar actuația rămâne a lanțului 046/047/024.

## Verificări executate și rezultat

- `npm test` — **832 PASS / 0 FAIL**, inclusiv cele 805 teste existente, la commit
  `8059f60de2ec371740e93b8b57a48c3426e151de`.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` — exit 0
  ([checks.txt](checks.txt)); arhitectura: `140 TypeScript files` PASS.
- Testele PBI050 ([tests.txt](tests.txt)) — **9 PASS / 0 FAIL**:
  `semafor liber` (GREEN_RELEASE), `plecare lentă vs rapidă`, `offset aplicat la linia de oprire`,
  `oportunitate reevaluată` (același `sampledUnit` peste 10 ferestre de decizie și 4 re-citiri),
  `trecere pe roșu` vs `frânare la roșu târziu`, `UNKNOWN/stale` fără fapte inventate, compoziția
  reală 045 (`STOP`/`WAIT_RED_BY_PROFILE`, apoi `FOLLOW`).
- Lanț real 219/044/045/036 ([tests.txt](tests.txt) al grupului) — subiectul cu mișcare proprie
  `west-straight` stă `STOP` pe fereastra roșie și `FOLLOW` pe cea verde; fiecare actor primește
  exact 20 decizii în 120 tick-uri, la faza deterministă 219, iar controllerul/fizica rămân la 60 Hz.

## Probe înainte/final și costul nou

Native, secvențial și singur (`PBI_AUTONOMY_CPU_LEASE=parent-approved-exclusive`), un singur arm
per invocare:

```powershell
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 050 --before
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 050 --after
```

- Fixture: `050-targeted-signal-v1` — harta reală 036/033 cu 64 actori, controler de semafoare real,
  context 044 real, FSM 045 real; 12800 decizii pe repetiție.
- Protocol: 1 încălzire + 5 repetări; cost pe fiecare tick de decizie după 180 tick-uri de încălzire
  (mediana celor 5 repetări). Toate repetările sunt păstrate în JSON.
- Distribuții (ms/decizie): BEFORE p50 0.0258, p95 0.0459, p99 0.0620 —
  AFTER p50 0.0405, p95 0.0650, p99 0.0824.
- **Cost suplimentar** (AFTER − BEFORE): p50 **+0.0146**, p95 **+0.0191**, p99 **+0.0204** ms/decizie.
  Repetările AFTER p95: 0.0638 / 0.0666 / 0.0650 / 0.0604 / 0.0665.
- Fără brațul politicii nu se încarcă modulul nou: BEFORE este exact aceeași probă și cadență 219
  fără evaluarea politicii.

Buget ([Docs/performance-budgets.json](../../performance-budgets.json), `budgetVersion` `203-initial-1`,
`calibration: PROVISIONAL_UNCALIBRATED`): costul adăugat este sub 0.1 % din bugetul absolut de tick
(`authoritativeTickP95Ms` 5.5 desktop / 8 laptop) și mult sub pragul relativ de regresie
(>10 % **și** >1 ms p95, minimum 3 din 5 confirmări). Bugetul absolut rămâne aplicabil; această probă
locală nu certifică bugetul jocului integrat.

## Memorie

[after.json](after.json) conține 20 de cicluri `build → drive → dispose → gc → counters`
(`gcAvailable: true`). Contoarele de ownership sunt cele existente
(`behavior.getStats()`, `roadContext.getStats()`, `roadContext.index.getStats()`), nu agregări
inventate: după `dispose()` nu rămâne nicio identitate, oportunitate sau decizie reținută
(`retainedHistory: 0`), iar proiecția către propagarea în flotă este aceeași ca la 044/045.

## Reproducere și limite

- [before.json](before.json), [after.json](after.json) și jurnalele brute
  [before-run.txt](before-run.txt)/[after-run.txt](after-run.txt) păstrează commit-ul, CPU-ul
  (`AMD Ryzen 7 7735U`), OS-ul (`win32 10.0.26300`), runtime-ul (`v24.21.0`), `fixtureVersion` și
  protocolul. Scrierea folosește `flag: "wx"`; o reluare cere ștergerea explicită a dovezii vechi.
- Limite: proba este Node CPU-only pe o mașină de tip laptop, fără browser, GPU, FPS sau soak;
  datele de distanță până la linia de oprire sunt derivata de geometrie a fixture-ului (capătul
  benzii proprii), nu o linie STOP autorată; actuația efectivă a intenției `STOP` nu este măsurată
  aici. Toate etichetele de calibrare rămân provizorii. Nu se revendică acceptarea hardware sau a
  jocului integrat.
- Proba de browser rămâne de adăugat la gate-ul de integrare vizuală; vezi
  [grupul 050+051+053](../autonomy-policies-group/README.md) pentru statusul acestei limite.
