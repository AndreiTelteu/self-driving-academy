# Dovezi grup 050+051+053 — proba comună de politică autonomă

Probă comună pentru cele trei politici de autonomie (050 semafor, 051 STOP, 053 schimbare de bandă):
aceeași cadență 219, aceleași fixture-uri reale 036/037/033/044/045, un singur arm per invocare.

## Rezultat

Cele trei politici compun `BehaviorFacts` prin punți separate (`signalBehaviorFacts`,
`stopBehaviorFacts`, `laneChangeBehaviorFacts`) și lasă faptele 045/048/052 neatinse: un diagnostic
străin este respins, iar un fapt indisponibil nu inventează nimic. Ordinea de precedentă este
explicită: intenția roșie > regula STOP > cerere explicită.

## Verificări executate și rezultat

- `npm test` **832 PASS / 0 FAIL**; `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run check:architecture` exit 0 ([checks.txt](checks.txt)).
- Integrarea reală 219 pentru toate cele trei politici (vezi `tests/autonomy/policy-decision-path.test.ts`,
  inclusă în [053 tests.txt](../053-lane-change/tests.txt)): fiecare actor primește exact
  `ticks/6` decizii la faza deterministă 219, inputul are loc la fiecare tick, iar controllerul și
  fizica rămân la exact 60 Hz.

## Probe înainte/final și costul nou

```powershell
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi group --before
node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi group --after
```

- Fixture: `group-targeted-autonomy-v1` (64 actori semafor + subiect STOP + subiect bandă).
- Protocol: 1 încălzire + 5 repetări, cost pe fiecare tick de decizie după 180 tick-uri.
- Distribuții (ms/decizie): BEFORE p50 0.0268, p95 0.0481, p99 0.0605 —
  AFTER p50 0.0410, p95 0.0661, p99 0.0908.
- **Cost suplimentar**: p50 **+0.0142**, p95 **+0.0180**, p99 **+0.0303** ms/decizie pentru toate
  cele trei politici împreună. `parts` din JSON păstrează distribuția fiecărei politici separat.

Buget ([Docs/performance-budgets.json](../../performance-budgets.json), `203-initial-1`,
`PROVISIONAL_UNCALIBRATED`): costul combinat rămâne sub 1 % din `authoritativeTickP95Ms` (5.5 desktop
/ 8 laptop) și mult sub pragul relativ de regresie (>10 % **și** >1 ms p95, 3/5 confirmări). Bugetele
absolute rămân aplicabile; această probă nu certifică bugetul jocului integrat.

## Memorie

[after.json](after.json) păstrează 20 de cicluri de lifecycle pentru toate cele trei fixture-uri, cu
contoarele existente de ownership (045, 044/index, 037, 033) și `heapUsed` după `gc`. Cele trei
politici sunt pure; latch-ul 053 este deținut de apelant. Nu se însumează categorii suprapuse.

## Limitări

- Proba este Node CPU-only, secvențială și singură (`PBI_AUTONOMY_CPU_LEASE=parent-approved-exclusive`),
  pe o mașină de tip laptop (`AMD Ryzen 7 7735U`, `win32 10.0.26300`, Node `v24.21.0`). Etichetele de
  calibrare rămân provizorii.
- **Proba de browser nu a fost executată.** Nu există în această verificare un playtest Chrome
  WebGPU/WebGL2 cu efect vizibil de driving pentru 050/051/053; prin urmare niciun criteriu vizual și
  nici acceptarea hardware nu sunt bifate aici. Ce lipsește exact: un harness de browser care să
  ruleze cele trei politici prin lanțul 219/044–049/024 pe un fixture fizic și să păstreze captura
  (aceeași formă ca `Docs/Evidence/048-following/browser-v7` / `049`), plus o mașină cu GPU real;
  probele native de mai sus nu înlocuiesc această dovadă și nu o pretind executată.
