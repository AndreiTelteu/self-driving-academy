# Dovezi PBI053 — schimbări de bandă și depășire V1

Nivel `targeted` (Docs/validation-policy.md): corectitudine izolată + cost local înainte/după +
memorie + integrare nativă cu graful 033.

## Rezultat implementare

Politica 053 porționează schimbarea opțională de bandă prin gap față/spate, avantaj de viteză și
cooldown, pe o proiecție explicită de vecinătate 033. Manevra începută este ținută într-un latch
deținut de apelant și transmis înainte/înapoi, deci nu este re-validată și resetată în fiecare cadru.
Compoziția se face prin `laneChangeBehaviorFacts` în `BehaviorFacts.laneChange` (`VALIDATED`).

## Verificări executate și rezultat

- `npm test` — **832 PASS / 0 FAIL** (inclusiv 805 existente), commit
  `8059f60de2ec371740e93b8b57a48c3426e151de`.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` — exit 0
  ([checks.txt](checks.txt)).
- Testele PBI053 ([tests.txt](tests.txt)) — **9 PASS / 0 FAIL**:
  `gap insuficient` rămâne în bandă, `avantaj absent` rămâne în bandă, `două schimbări apropiate`
  sunt blocate de cooldown (inclusiv limita inclusivă și un cooldown mai scurt),
  `manevra acceptată are continuitate` (5 decizii consecutive `COMMITTED_CONTINUITY` cu gap-uri care
  eșuează și cooldown activ, fără reset), eliberare explicită când banda țintă nu mai este vecină
  033, semantica de acces din graf (un vecin CIVIL dispare pentru TAXI) și compoziția reală 045
  (`CHANGE_LANE`/`LANE_CHANGE_VALIDATED`).
- Lanț real 219/033/046: `CHANGE_LANE` se menține pe cadență, iar 046 păstrează ținta de stil
  (`targetMps > 0`, `reason != BEHAVIOR_CHANGE_LANE`), deci contractul 044–049/052 rămâne intact.

## Probe înainte/final și costul nou

```powershell
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 053 --before
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 053 --after
```

- Fixture: `053-targeted-lane-v1` — coridor real cu două benzi paralele și joncțiune, vecinătatea
  derivată cu `createLaneGraph`, latch de manevră purtat de apelant, FSM 045 real.
- Protocol: 1 încălzire + 5 repetări; cost pe fiecare tick de decizie (10 Hz) după 180 tick-uri.
- Distribuții (ms/decizie): BEFORE p50 0.0063, p95 0.0094, p99 0.0246 —
  AFTER p50 0.0155, p95 0.0215, p99 0.0518.
- **Cost suplimentar**: p50 **+0.0092**, p95 **+0.0121**, p99 **+0.0272** ms/decizie. Repetările
  AFTER p95: 0.0215 / 0.0210 / 0.0228 / 0.0206 / 0.0219.

Buget ([Docs/performance-budgets.json](../../performance-budgets.json), `203-initial-1`,
`PROVISIONAL_UNCALIBRATED`): sub 0.2 % din bugetul absolut de tick și mult sub pragul relativ
(>10 % **și** >1 ms p95, 3/5). Proba nu certifică bugetul integrat.

## Memorie

[after.json](after.json) păstrează 20 de cicluri cu contoarele existente
(`behavior.getStats()`, `lanes` din `graph.getStats()`), plus `heapUsed` după `gc`. Modulul 053 nu
deține nicio hartă de actori sau manevre: latch-ul este al apelantului și are cel mult două câmpuri
primitive, iar `retainedHistory` este 0. Nu se inventează un agregat de memorie.

## Reproducere și limite

- [before.json](before.json), [after.json](after.json),
  [before-run.txt](before-run.txt)/[after-run.txt](after-run.txt): commit, CPU (`AMD Ryzen 7 7735U`),
  OS (`win32 10.0.26300`), runtime (`v24.21.0`), `fixtureVersion`, protocol. Scriere cu `flag: "wx"`.
- Limite: vecinătatea laterală este proiecția explicită a owner-ului din graful 033 (nu se deduc
  benzi laterale); latch-ul și finalizarea manevrei sunt decizii explicite ale apelantului; proba este
  Node CPU-only pe mașină de tip laptop, fără browser, GPU, FPS sau soak.
- Proba de browser și statusul limitei rămân în
  [grupul 050+051+053](../autonomy-policies-group/README.md).
