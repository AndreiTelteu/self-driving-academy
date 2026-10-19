# Dovezi PBI055 — motive de decizie și observabilitate

Nivel `targeted` (Docs/validation-policy.md): corectitudine izolată + lanț real 219/044/036/050/045 +
cost local înainte/după + memorie (performance_checks `simulation`, `memory`). Nu se pretinde FPS,
hardware, plasare fizică nativă sau bugetul jocului integrat.

## Rezultat implementare

`src/autonomy/decision-explanation.ts` publică o suprafață read-only pentru decizia curentă:
`explainDecision` construiește un obiect înghețat în adâncime cu motivele reale (ultimul motiv este
legat obligatoriu de `state`/`reason` al 045), cantitățile chiar folosite (`targets`) și cheile de
profil chiar consumate (`influences`, fiecare cu valoarea reală), iar `createDecisionExplainer` ține
cel mult o explicație per actor admis, cu `retainedHistory: 0`, citită prin `view`/`read` din portul
de decizie 219. Suprafața nu are nicio referință către FSM, politică sau apelant, deci citirea nu
poate schimba decizia următoare. Poarta de onestitate verifică fiecare cheie în registrul 092
(`implemented === true`); o cheie neimplementată sau necunoscută este respinsă cu
`ContractValidationError`, iar o valoare `null` (neconsumată) este eliminată. Când nu există încă o
decizie, `view` raportează explicit `NO_DECISION`, nu inventează un motiv. Contractul complet, forma
înghețată, ownership-ul, punctul de integrare și „ce nu este" sunt în
[Docs/decision-explanation.md](../../decision-explanation.md).

## Verificări executate și rezultat

- `npm test` — **848 PASS / 0 FAIL** (840 existente + 7 teste izolate 055 + 1 test de lanț real 219),
  la commit `d98fe714e15e7c3bdae7a74068880e03026cb5de`, runtime `v24.21.0` ([tests.txt](tests.txt)).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`
  (`142 TypeScript files`), `npm run check:parameter-catalog` — exit 0 ([checks.txt](checks.txt)).
- Testele 055 izolate ([tests.txt](tests.txt)) — **7 PASS / 0 FAIL**: FOLLOW și FOLLOW_LEADER din
  lanțul real 044/045/046/048 (cu dovezi de proveniență: pe bandă urbană fără curbă este consumată
  doar `speed_delta_urban`, iar `queue_standstill_gap` nu este revendicată pentru un lider în
  mișcare); STOP pe roșu real și pe o regulă STOP reală 037 (roșu consumă doar
  `red_stop_probability` + `red_stop_line_offset`; verde consumă `green_start_delay`; pragul de frână
  târzie nu este revendicat când nu a fost citit); YIELD (052) și CHANGE_LANE (053) și BLOCKED /
  recuperare (054) prin politicile și FSM-ul reale; respingerea oricărei chei neimplementate
  (criteriul 2 — `speed_delta_arterial`, `yield_time_gap`, chei necunoscute, duplicate); imuabilitate
  profundă (aruncare în mod strict la mutație, `Reflect.set` false) și dovada că mutarea obiectului
  returnat nu schimbă decizia următoare (secvențe și explicații identice cu o rulare nealterată);
  determinism (aceleași intrări → explicații adânc egale, dar obiecte distincte) și „fără fabricare"
  (`NO_DECISION` explicit înainte de orice decizie, respingere pentru un actor neadmis).
- Lanț real 219: explicația este colectată chiar în portul de decizie, iar cadence-ul, fazele,
  apelurile input/controller/physics și decizia 045 rămân neatinse; fiecare actor primește exact o
  explicație per decizie adresată, magazinul raportează `retainedHistory: 0`.

## Probe înainte/final și costul nou

Native, secvențial și singur (`PBI_AUTONOMY_CPU_LEASE=parent-approved-exclusive`), un singur braț per
invocare:

```powershell
$env:PBI_AUTONOMY_CPU_LEASE='parent-approved-exclusive'
volta run --node 24.21.0 node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 055 --before
volta run --node 24.21.0 node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 055 --after
```

- Fixture: `055-targeted-explanation-v1` — lanțul real 219/044/036/050/045 pe scena 044/036 authored,
  64 actori, decizii la 10 Hz pe faza de identitate a fiecărui actor. AMBELE brațe evaluează același
  lanț real și același profil; doar AFTER colectează explicația, deci delta izolează explicația.
- Protocol: 1 încălzire + 5 repetări; cost pe fiecare tick de decizie (10 Hz) după 180 tick-uri de
  încălzire (mediana celor 5 repetări). Toate repetările sunt păstrate în JSON.
- Distribuții (ms/decizie): BEFORE cronologic p50 0.0402, p95 0.0622, p99 0.0885 ([before.json](before.json)).
  În rularea AFTER: baza proprie p50 0.0432, p95 0.0717, p99 0.1098, iar AFTER p50 0.0552,
  p95 0.0856, p99 0.1200 ([after.json](after.json)).
- **Cost suplimentar** (AFTER − baza din aceeași rulare): p50 **+0.0120**, p95 **+0.0139**,
  p99 **+0.0102** ms/decizie. Repetările AFTER p95: 0.0858 / 0.0950 / 0.0856 / 0.0842 / 0.0827.
- Ne-perturbare dovedită: 12800 decizii pe repetiție și checksum identic `1958000` în ambele brațe,
  în toate cele 5 repetări; `stopExplanations` 10500 pe repetiție în AFTER.
- Fără brațul explicației nu se încarcă modulul nou: BEFORE este exact același lanț real de decizie
  (044/036/050/045), fără `decision-explanation.ts` (`source.inputs`).

Buget ([Docs/performance-budgets.json](../../performance-budgets.json), `budgetVersion` `203-initial-1`,
`calibration: PROVISIONAL_UNCALIBRATED`): o decizie rulează la 10 Hz, deci costul adăugat p95 de
0.0139 ms/decizie se amortizează la ≈0.0023 ms per tick de 60 Hz, adică sub 0.05 % din bugetul absolut
`authoritativeTickP95Ms` (5.5 desktop / 8 laptop); p95 absolut al brațului AFTER (0.0856 ms/decizie)
este sub 0.3 % din același buget. Pragul de regresie relativă (>10 % **și** >1 ms p95, minimum 3 din 5
confirmări) nu este atins: creșterea absolută este ≈0.014 ms, cu mult sub 1 ms. Bugetul absolut rămâne
aplicabil; această probă locală nu certifică bugetul integrat.

## Memorie

[after.json](after.json) conține 20 de cicluri `build → drive → capture → dispose → gc → counters`
(`gcAvailable: true`, `heapUsed` 13.15–13.53 MB după `gc`). Colectorul 055 raportează, în fiecare
ciclu, `actors: 64`, `explanations: 64` (o explicație per actor la două tick-uri de decizie, fără
creștere), `retainedHistory: 0` și `disposed: true`; contoarele existente ale 044/045 rămân
neafectate. Un colector care ar crește nemărginit ar fi un defect; nu este cazul aici. Nu se inventează
un agregat de memorie.

## Reproducere și limite

- [before.json](before.json), [after.json](after.json) și jurnalele brute
  [before-run.txt](before-run.txt)/[after-run.txt](after-run.txt) păstrează commit-ul
  `d98fe714e15e7c3bdae7a74068880e03026cb5de`, CPU (`AMD Ryzen 7 7735U with Radeon Graphics`),
  OS (`win32 10.0.26300`), runtime (`v24.21.0`), `fixtureVersion` și protocolul
  (`warmupTicks` 180, `measuredTicks` 1200, `repetitions` 5, `cadenceHz` 10, `tickHz` 60), plus
  `fixtureSourceSha256` `f5994af678a467c249f014af840eba36e859bd57c310e3cb50915d616677d5c5`.
  Scrierea folosește `flag: "wx"`; o reluare cere ștergerea explicită a dovezii vechi.
- Conflict raportat: registrul 092 nu marchează `yield_time_gap` (politica 052) ca `implemented`, deci
  criteriul 2 cere ca acea cheie să NU apară ca influență; YIELD expune motivul și pragul ca
  `targets`, iar orice încercare de a declara `yield_time_gap` este respinsă. Repararea cere o
  modificare de contract 092 (și a testului care enumeră cheile implementate), pe care PBI055 nu o
  face.
- Limite: explicația este la fel de onestă precum cheile declarate de owner la `capture`; builderul
  impune forma, legarea de 045, ultimul motiv și poarta registrului, dar nu poate ști că ownerul a
  omis o cheie folosită, deci cablarea trebuie să listeze cheile pe fiecare ramură. Explicațiile sunt
  per felie de decizie și nu se păstrează istoric. Proba este Node CPU-only pe o mașină de tip laptop,
  fără browser, GPU, FPS sau soak; toate etichetele de calibrare rămân provizorii.
