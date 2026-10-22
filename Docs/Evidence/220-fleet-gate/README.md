# PBI 220 — gate de performanță al flotei (raport de măsurare)

Nivel `full`, rulat pe hardware real cu build de producție, preset fix, cinci repetări pe fiecare workload și pe fiecare backend. Rezultatul: **toate cele trei workload-uri V1 normale trec bugetele coloanei `laptop`, iar proba de stres 30/80 este raportată separat, fără a masca V1.**

## Hardware identificat (CIM, la pornirea serverului)

| Câmp | Valoare |
| --- | --- |
| Model | LENOVO 82YM (Yoga 7 14ARP8) |
| CPU | AMD Ryzen 7 7735U with Radeon Graphics (8 nuclee / 16 fire, 2701 MHz) |
| GPU | AMD Radeon(TM) Graphics (RDNA-2 integrat), driver 32.0.12019.1028 |
| RAM | 16 GiB (4 × 4 GiB @ 6400 MT/s) |
| OS | Microsoft Windows 11 Home, 10.0.26300, build 26300 |
| Browser | Chrome 155.0.8059.85 |
| Display | 1920×1200 @ 60 Hz, DPR 1 (96 DPI) |
| Alimentare | AC conectat (`BatteryStatus 2`), 79 %, schema **High performance** |
| Canvas | 1920×1080 CSS și intern (DPR 1), preset `LOW_FIXED_220_FLEET`, adaptive quality off |

**Coloana de bugete aplicată: `laptop`** (`Docs/performance-budgets.json`, `proposedBudgets.laptop`). Derogarea din 203 privește exclusiv bootstrap-ul de laptop din 203; aici s-a măsurat efectiv, deci nu se aplică nicio derogare. Coloana `desktop` nu a fost folosită.

## Matricea executată

| Workload | Taxiuri | Civili | Rol |
| --- | --- | --- | --- |
| `scaling-20` | 20 | 20 | scalare (manifest: `workloads.scaling`) |
| `normal-24` | 24 | 40 | workload uzual V1 |
| `maximum-30` | 30 | 40 | maxim V1 validat |
| `overload-30-80` | 30 | 80 | suprasarcină, **separată**, fără gate FPS normal |

Fiecare rulare: **30 s warmup + 120 s măsurare**, cinci repetări, câte un backend per pagină (WEBGPU și WEBGL2 în sesiuni distincte), build de producție, inspector închis, fereastră în prim-plan. Toate vehiculele rămân în lumea fizică, inclusiv cele din afara frustum-ului (camera este o privire de ansamblu îndepărtată).

Workload-ul fizic: populația reală 057 (taxiuri + civili), cerere/dispecer 059/060, decizii 058, context 044, semafoare 036, programator 219, controller 024, fizică 022/Rapier și publicare contacte 028, plus pipeline-ul real de learning 103 → 109 → 110 → 112. Stiluri prudente/agresive, bariere + moloz la punctul de îngustare, depășiri declanșate scriptat și cozi reale (20–42 contacte simultane observate per rulare).

## Rezultate — mediană a celor 5 repetări (min–max)

### WEBGPU — captură `20261022T024028061Z`

| Workload | frame p95 | frame p99 | main p95 | tick p95 | Rapier p95 | GPU p95 | input p95 | learning p95 | ratio | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scaling-20 | 16,8 (16,8–16,9) | 16,9 (16,9–17,0) | 3,6 (3,4–3,7) | 3,2 (3,0–3,2) | 0,3 (0,3–0,5) | indisponibil | 1,6 (1,6–1,8) | 17,4 (17,2–17,8) | 1,0001 | PASS |
| normal-24 | 16,8 (16,8) | 16,9 (16,9) | 5,2 (4,8–5,4) | 4,7 (4,3–4,9) | 0,4 (0,3–0,4) | indisponibil | 2,2 (2,1–2,4) | 17,8 (17,7–18,1) | 1,0001 | PASS |
| maximum-30 | 16,8 (16,8–16,9) | 16,9 (16,9–17,0) | 6,1 (5,3–6,5) | 5,5 (4,8–5,8) | 0,4 (0,4) | indisponibil | 2,5 (2,4–2,6) | 17,8 (17,6–19,1) | 1,0001 | PASS |
| overload-30-80 | 16,8 (16,8) | 16,9 (16,8–16,9) | 7,6 (7,1–7,8) | 6,9 (6,4–7,0) | 0,5 (0,5) | indisponibil | 3,7 (3,5–3,8) | 18,5 (17,8–19,0) | 1,0001 | STRUCTURAL PASS |

### WEBGL2 — captură `20261022T033847343Z`

| Workload | frame p95 | frame p99 | main p95 | tick p95 | Rapier p95 | GPU p95 | input p95 | learning p95 | ratio | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scaling-20 | 16,8 (16,8) | 16,9 (16,9) | 3,3 (3,2–3,5) | 3,1 (3,0–3,2) | 0,3 (0,3–0,4) | 1,09 (0,49–1,18) | 1,6 (1,5–1,7) | 17,3 (17,0–17,5) | 1,0001 | PASS |
| normal-24 | 16,8 (16,8–16,9) | 16,9 (16,9–17,0) | 4,5 (4,4–4,8) | 4,2 (4,1–4,4) | 0,3 (0,3–0,4) | 1,07 (0,49–1,09) | 2,0 (2,0–2,2) | 17,7 (17,4–17,8) | 1,0001 | PASS |
| maximum-30 | 16,8 (16,8–16,9) | 16,9 (16,9) | 4,9 (4,8–5,1) | 4,5 (4,4–4,7) | 0,4 (0,3–0,4) | 1,09 (0,49–1,11) | 2,2 (2,1–2,3) | 17,6 (17,3–18,2) | 1,0001 | PASS |
| overload-30-80 | 16,8 (16,8–16,9) | 16,9 (16,9–17,0) | 5,8 (5,7–6,5) | 5,3 (5,2–6,0) | 0,4 (0,4–0,5) | 1,09 (0,49–1,18) | 3,0 (2,9–3,3) | 17,9 (17,9–18,7) | 1,0001 | STRUCTURAL PASS |

Bugete `laptop` aplicate: frame p95 ≤ 35, p99 ≤ 50, main p95 ≤ 20, tick p95 ≤ 8, Rapier p95 ≤ 5, GPU p95 ≤ 28 (doar cu timer), input p95 ≤ 80, learning ≤ 2000 ms, ratio ≥ 0,98, niciun Long Task de aplicație > 50 ms. Toate valorile sunt sub buget; `framesOver35Ms = 0` în toate cele 40 de rulări.

### Reproductibilitate

Toate repetările sunt păstrate; medianele și dispersia sunt în `*-summary.json` și în `*-independent-verification.json`. Criteriul de reproductibilitate este cel din manifestul 203 (variație relativă > 10 % **și** absolută ≥ 1 ms). Nu a fost raportată nicio abatere pentru workload-urile normale. `rapierStepP95Ms` și `gpuP95Ms` au dispersie relativă mare pe valori sub 0,5 ms, respectiv ~1 ms; diferența absolută este sub pragul de 1 ms, deci nu este o regresie (vezi limita „zgomot sub-milisecundă”).

### Stres separat

`overload-30-80` (30 taxiuri + 80 civili = 110 corpuri fizice, capacitatea maximă de admitere a fizicii) a rulat în aceeași sesiune, dar cu verdict propriu: `STRESS_STRUCTURAL_PASS` (toate corpurile prezente, contacte, ratio, cleanup) **fără** gate FPS normal. Verificatorul refuză explicit ca proba de stres să fie raportată ca PASS normal. Rezultatele V1 nu depind de reducerea traficului: `maximum-30` are propriile cinci repetări.

## Corecții reale făcute între probe (înainte/după)

Prima captură completă (`20261022T005309189Z`, păstrată) a arătat tick autoritar p95 de 6,6–10,4 ms la 30/40, peste bugetul de 8 ms, cu defalcare pe faze. Au fost corectate cauze reale, fără relaxarea pragurilor:

1. **Priming înainte de warmup** — compilarea shaderelor intra în primul cadru măsurat și producea un salt de 385 ms (devenit `overload` la tick 0). Acum se fac trei cadre de primire înainte de începerea ceasului.
2. **Contextul 044 publicat la cadența deciziilor (10 Hz, fazat pe entități) plus imediat la evenimente urgente**, nu la fiecare tick — conform contractului „decizii scadente”, nu „toată flota decide în același tick”.
3. **Cache de rutare mărginit** pe cheia `graphVersion/costVersion/origin/destination` în locul unei căutări 033 complete la fiecare decizie (contractul cere cache cu plafon și invalidare).

Efect: tick p95 `maximum-30` 6,6–10,4 ms → 4,8–5,8 ms (WEBGPU) și 4,4–4,7 ms (WEBGL2); `overload-30-80` 6,4–7,0 / 5,2–6,0 ms. Semantica fizicii, learning-ului și KPI nu a fost schimbată; toate testele proiectului trec.

## Comenzi și reproducere

```powershell
# preflight scurt (schema, transport, capacitate, cleanup, export, citire independentă)
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/Run-FleetGate.ps1 -Backend WEBGPU -Profile smoke -TimeoutMinutes 10

# sesiune completă, câte una per backend (fereastra rămâne în prim-plan)
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/Run-FleetGate.ps1 -Backend WEBGPU -Profile full -TimeoutMinutes 75
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/Run-FleetGate.ps1 -Backend WEBGL2 -Profile full -TimeoutMinutes 75

# verificare independentă (doar JSON, fără browser/build)
node --import ./scripts/register-typescript.mjs scripts/verify-fleet-gate-evidence.mjs 20261022T024028061Z WEBGPU
node --import ./scripts/register-typescript.mjs scripts/verify-fleet-gate-evidence.mjs 20261022T033847343Z WEBGL2
```

Serverul (`scripts/fleet-gate-server.mjs`) face build-ul de producție, identifică hardware-ul prin CIM, refuză drift-ul de sursă la fiecare export, scrie fișiere imuabile per rulare și permite reluarea prin `?captureId=`. Fiecare captură are `build-manifest.json`, `hardware.json`, `conditions.json` și `machine-load.csv` (încărcarea CPU eșantionată la 4 s pe toată sesiunea).

## Istoric păstrat (nu se reclasifică)

- `20261022T000030202Z` … `20261022T000923098Z` — preflight-uri eșuate: identitate de profil 110/057, observații 058 duplicate, pipeline de learning fără activare în fereastra smoke. Rapoartele și cauzele sunt păstrate.
- `20261022T001046713Z` — primul preflight valid (`SMOKE_ONLY`).
- `20261022T001553984Z`, `20261022T002242141Z`, `20261022T003530440Z` — opriri pe pierdere de focus / overload la tick 0, înainte de priming.
- `20261022T005309189Z` — prima matrice completă, înainte de corecțiile 1–3 (tick peste buget).
- `20261022T011117006Z`, `20261022T011524535Z` — DEV (diagnostic, 3 perechi 15/30 s), folosite pentru escaladare, nu pentru gate.
- `20261022T013549569Z` — sesiune abandonată după un bug de reluare (`saved-runs` trata fișierele de eșec ca rulări); reparat în server.
- `20261022T024028061Z`, `20261022T033847343Z` — capturile acceptate.

Arhivele de sursă duplicată au fost păstrate doar pentru preflight-ul valid, captura dinainte de corecții și cele două capturi acceptate; rapoartele celorlalte capturi rămân, dar arhiva lor de sursă a fost eliminată pentru a limita dimensiunea depozitului.

## Limitări reale

- **Timer GPU:** pe WEBGPU, Babylon nu raportează timer query (`unavailable: timer query unsupported`); GPU p95 este `null`, nu 0. Pe WEBGL2 timerul este disponibil și raportează rezultate asincrone, neasociate cadrului CPU curent (primul rezultat proaspăt este eliminat).
- **Memorie:** API-ul de memorie exactă nu este disponibil; se raportează doar `performance.memory.usedJSHeapSize` (37–70 MB) și contoarele de resurse deținute de aplicație, fără însumarea categoriilor suprapuse.
- **Politica de comandă:** comenzile provin dintr-o politică de fixture peste progresul real pe rută și interacțiunea reală 058 (leader/blocked). Nu măsoară politicile de joc 045/050/051/052; acelea rămân în workload-ul integrat 155.
- **Stres 30/80:** populația autoritară 057/058 este plafonată la 70 (40 civili). Cei 40 de civili suplimentari ai probei de stres sunt corpuri fizice reale, în afara contractului de populație, pentru a atinge capacitatea de admitere 110 a fizicii; sunt marcați în raport (`surplusActors`) și nu sunt folosiți pentru niciun verdict V1.
- **Zgomot sub-milisecundă:** percentilele GPU (~1 ms) și Rapier (0,3–0,5 ms) au dispersie relativă mare; pragul de reproductibilitate cere și ≥ 1 ms absolut, ca zgomotul să nu fie raportat ca regresie.
- **Condiții de mașină:** laptopul este partajat cu un al doilea agent. Sesiunile au avut `machine-load.csv` cu medie 21,6 % (vârf 86 %) pentru WEBGPU și 18,6 % (vârf 83 %) pentru WEBGL2, în mare parte în afara ferestrelor măsurate; o rulare `maximum-30` a pierdut focusul în timpul măsurării, a fost exportată ca eșec și repetată integral (nimic nu a fost înlocuit sau trunchiat). Nu există telemetrie termică continuă; schema de alimentare și starea bateriei sunt identitatea de la pornire.
- **Identitatea sursei între capturi:** cele două capturi acceptate au fost produse din surse care diferă doar în stratul de analiză (`plan.ts`: regula de reproductibilitate și numele raportului de matrice). Codul de măsurare (`workload.ts`, `protocol.ts`, `main.ts`) este identic. Verificarea în modul arhivă trece pentru ambele; `--current` trece pentru captura WEBGL2 (sursa comisă) și raportează diferența pentru WEBGPU, unde arhiva de sursă rămâne sursa de adevăr.
- **Fără soak:** 60 de minute de soak și ciclurile lifecycle rămân la 224; acest gate nu le înlocuiește.
