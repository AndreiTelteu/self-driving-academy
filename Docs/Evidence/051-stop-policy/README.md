# Dovezi PBI051 — politica STOP și opriri incomplete

Nivel `targeted` (Docs/validation-policy.md): corectitudine izolată + cost local înainte/după +
memorie + integrare nativă cu producătorul autoritativ 037.

## Rezultat implementare

Politica 051 citește observația autoritativă 037 a oportunității STOP și decide probabilitatea
opririi complete, durata și offsetul. Calea de dovezi rămâne separată: o oprire provocată de lider
nu devine niciodată intenția STOP a șoferului. Compoziția se face prin `stopBehaviorFacts` în
`BehaviorFacts.stop` (`STOP_RULE_BY_PROFILE`), iar intenția roșie existentă este păstrată.

## Verificări executate și rezultat

- `npm test` — **832 PASS / 0 FAIL** (inclusiv 805 existente), commit
  `8059f60de2ec371740e93b8b57a48c3426e151de`.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` — exit 0
  ([checks.txt](checks.txt)).
- Testele PBI051 ([tests.txt](tests.txt)) — **6 PASS / 0 FAIL**:
  `STOP liber` (APPROACH → HOLD → DWELL_IN_PROGRESS → DWELL_SATISFIED, durata comparată inclusiv la
  limită), `profil prudent vs rolling stop` cu rezultate distincte și un singur eșantion pe
  oportunitate, `STOP cu coadă` (lider → `NO_STOP`/`LEADER_STOP_NOT_STOP_INTENT`, FSM `FOLLOW_LEADER`;
  roșu independent păstrat), traversare și admisie strictă.
- Dovadă nativă 037 ([tests.txt](tests.txt)): o rulare reală cu `createStopRules` produce
  `STOP_APPROACH`, un singur `FULL_STOP` pentru aceeași `opportunityId` și `STOP_LINE_CROSSED`;
  politica trece prin `STOP_APPROACH`/`STOP_HOLD`/`DWELL_IN_PROGRESS` și eliberează doar după durata
  dovedită, iar o cerință de dwell peste dovada observată nu eliberează niciodată.
- Lanț real 219/037 (în dovezile de grup): `STOP`/`WAIT_STOP_BY_PROFILE` la cadență, `FOLLOW` după
  eliberare; cazul de coadă la 25 m înaintea liniei nu deschide nicio oportunitate 037 și rămâne
  `FOLLOW_LEADER`.

## Probe înainte/final și costul nou

```powershell
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 051 --before
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 051 --after
```

- Fixture: `051-targeted-stop-v1` — `createStopRules` real pe linia STOP autorată din minimalMap,
  apropiere cinematică autorată (0.15 m/tick), oprire și traversare, FSM 045 real.
- Protocol: 1 încălzire + 5 repetări; cost pe fiecare tick de decizie (10 Hz) după 180 tick-uri.
- Distribuții (ms/decizie): BEFORE p50 0.0063, p95 0.0100, p99 0.0132 —
  AFTER p50 0.0156, p95 0.0241, p99 0.0642.
- **Cost suplimentar**: p50 **+0.0093**, p95 **+0.0141**, p99 **+0.0510** ms/decizie. Repetările
  AFTER p95: 0.0245 / 0.0220 / 0.0241 / 0.0238 / 0.0249; p99 variază mai mult pe mașina de laptop, dar
  rămâne cu două ordine de mărime sub bugetul absolut de tick.

Buget ([Docs/performance-budgets.json](../../performance-budgets.json), `203-initial-1`,
`PROVISIONAL_UNCALIBRATED`): costul adăugat este sub 0.2 % din `authoritativeTickP95Ms` și mult sub
pragul relativ (>10 % **și** >1 ms p95, 3/5 confirmări). Această probă locală nu certifică bugetul
integrat și nu îl înlocuiește.

## Memorie

[after.json](after.json) păstrează 20 de cicluri de lifecycle cu contoarele existente 037
(`rules.getStats()`: `vehicles`, `trackedIncarnations`, `activeOpportunities`) și 045
(`behavior.getStats()`), plus `heapUsed` după `gc`. Politica este pură: nu reține actori,
oportunități sau istoric (`retainedHistory: 0`); după `dispose()` toate contoarele de ownership
revine la zero. Nu se însumează categorii de memorie suprapuse.

## Reproducere și limite

- [before.json](before.json), [after.json](after.json),
  [before-run.txt](before-run.txt)/[after-run.txt](after-run.txt): commit, CPU (`AMD Ryzen 7 7735U`),
  OS (`win32 10.0.26300`), runtime (`v24.21.0`), `fixtureVersion`, protocol. Fișierele se scriu cu
  `flag: "wx"`.
- Limite: durata staționară curentă a unei oportunități este readback-ul autoritativ al owner-ului
  asupra fluxului 037 (037 publică dovedirea completă, nu durata curentă); producătorul 037 trebuie
  configurat cu o fereastră minimă de dovadă pentru ca `stop_dwell_time` să rămână rezolvabil.
  Proba este Node CPU-only pe mașină de tip laptop; nu acoperă FPS, browser, GPU sau soak.
- Proba de browser și statusul limitei rămân consemnate în
  [grupul 050+051+053](../autonomy-policies-group/README.md).
