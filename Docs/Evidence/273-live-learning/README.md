# 273 — Dovezi: pipeline-ul de learning live

Contract: `273-live-learning-v1` · `273-live-evidence-v1` · `273-learning-queue-runtime-v1`.

## Ce s-a verificat

| Probă | Rezultat |
| --- | --- |
| `npm run learning:live` | **30/30 PASS** |
| `npm run learning:live -- --check` | PASS (raport proaspăt) |
| `npm run learning:live:cost` | cost local scris în `cost.json` |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/live-evidence.test.ts` | 4/4 PASS |
| `node --import ./scripts/register-typescript.mjs --test tests/app/live-learning.test.ts` | 6/6 PASS |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/estimator-queue.test.ts` | 1/1 PASS |
| `npm run learning:live:fixture` | **22/22 PASS** — Chromium, fixture determinist peste modulele reale |
| `npm run learning:live:probe` | **4/9 PASS**, probă live limitată (vezi mai jos) |

Raportul determinist folosește harta reală 032/033, writer-ul real 272, runtime-ul real 103/221 și
publicarea reală 109/110. Nu conține ceas de perete, nu scrie XP și nu creează o a doua simulare.

## Rezultatul end-to-end

- Segment: `report-composed`, cheie `speed_delta_residential`, context `FREE_TRAFFIC`.
- Dovezi: `READY`, candidat `CANDIDATE` (`-2.1999998092651367`), 1 episod.
- Bază `profile-v1` → versiune imuabilă `report-composed~112`, părinte `profile-v1`.
- Valoare `0 → -0.33` (`learningWeight` 0.15, un singur episod).
- Activare `PENDING` la tick 2, aplicată la tick 2.
- Flotă: `profile-v1` → `report-composed~112` pe toate cele 64 de vehicule.
- Fingerprint profil: `1c4d32b2f4e3829a` → `af1274c24a841c31`.
- XP: `681271edaa4119b4e650abb07af84d335b2c4f691ec94fff5da1f54995bd201e` neschimbat.
- Joburi / versiuni: 1 / 1.

## Refuzuri demonstrate

- MANUAL: 0 joburi, 0 versiuni.
- LEARNING neeligibil: 0 joburi, 0 versiuni.
- Fără dovezi: 1 job, `INSUFFICIENT_EVIDENCE`, 0 versiuni.
- Epocă străină: `STALE_JOB`/`EPOCH_MISMATCH`, 0 joburi, doar versiunea de bază în store.
- Restore cu job în curs: epoca 1 → 2, 1 job anulat, rezultat târziu `STALE_JOB` cu `versionId: null`,
  starea fizică păstrată, flota pe `report-target-v2`.
- Import invalid: `REJECTED`, epoca neschimbată. Import valid: epoca 1 → 2, ținta activă.
- Profil nou: epoca 1 → 2, ținta activă.

## Cost local

`cost.json` este `PROVISIONAL_UNCALIBRATED`, Node CPU, fără FPS/GPU/frame/hardware. Măsurat pe
AMD Ryzen 7 7735U, Node 24.19.0, Windows:

- proiecția dovezilor: p50 1.0338 ms, p95 4.7239 ms;
- coada 103/221: `queueMs` 0.4854, `serviceMs` 3.0095, `endToEndMs` 3.4949, payload 930 B;
- pas tick → activare aplicată: 16.6813 ms (include yield-ul runtime-ului și polling-ul sondei).

## Proba de browser deterministă

`browser-fixture.json` păstrează proba cerută de PBI peste modulele reale: Chromium 157, 1360×720,
**22/22 verificări PASS**. Pagina `tests/browser/live-learning/index.html` rulează `createLiveLearningFixture`
— writer-ul real 272, harness-ul real 103/221 (numai transportul `worker_threads` este înlocuit de
microtask, ca în testele Node), store-ul real 109, activarea reală 110 și bariera reală 205 — pe harta
reală 032/033. Segmentul LEARNING determinist are 1.080 de eșantioane 085, o oportunitate 086 și o
fereastră 087 `ELIGIBLE`/`FREE_TRAFFIC` la tick 1–196.

- O versiune imuabilă `browser-composed~112`, părinte `profile-v1`, checksum `fnv1a64:8b538607ca7cd5f3`;
  store-ul refuză rescrierea aceluiași id cu `VERSION_ID_DUPLICATE`.
- `speed_delta_residential` 0 → -0.33, candidat -2.1999998092651367, dovezi `READY`, 1 episod.
- Activare `PENDING` la tick 2 și aplicată la tick 2; callback-ul, `lastAppliedTick` și `activateAtTick`
  coincid, iar după 6 tick-uri suplimentare nu apare o a doua publicare.
- Flotă: 24 taxiuri + 40 civili = 64, toate pe `browser-composed~112`; stilul orașului are aceeași versiune.
- Fingerprint profil `1c4d32b2f4e3829a` → `af1274c24a841c31`, identic cu raportul Node.
- Fingerprint XP `681271ed…bd201e` neschimbat (273 nu montează niciun writer XP; digestul coincide cu
  raportul Node).

Capturi: [segment închis](screenshots/fixture-01-segment.png),
[activare](screenshots/fixture-02-activating.png), [publicat](screenshots/fixture-03-published.png).

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
npm run learning:live:fixture
```

## Proba de browser live — limitare documentată

`browser.json` păstrează rularea reală: Chromium 157/WEBGL2, 1280×720, 4/9 verificări. Segmentul
LEARNING închis are 734 de eșantioane 085 reale și un job 103 real, dar singura fereastră 087
eligibilă apare la tick 841 din 849, prea târziu pentru prefixul de 10 s; cele 28 de artefacte sunt
pauze ale renderer-ului SwiftShader (overload), nu dovezi de condus. Proba nu este raportată ca PASS
și nu inventează o publicare. Rulează cu:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
npm run learning:live:probe
```

Pentru dovada pe browser real/hardware, proba live trebuie rerulată fără pauzele de overload (287).

## Fișiere

- `src/app/live-learning.ts` — composition root-ul live.
- `src/learning/live-evidence.ts` — adaptorul 085–088 → 093 → 094/098.
- `src/learning/estimator-queue.ts` — runtime-ul real 103/221.
- `src/workers/memory-store.ts` — store-ul mărginit al governorului.
- `src/app/live-three-modes.ts` — `updateGeneration` pentru segmentele deschise după o barieră.
- `src/main.ts` — portul `learning`, sursa de stil comună, store-ul 109/110, flagul de probă
  `?nofocuspause=1` și debug read model.
- `tests/learning/live-evidence.test.ts`, `tests/app/live-learning.test.ts`,
  `tests/learning/estimator-queue.test.ts`, `tests/harness/live-learning-fixture.ts`,
  `tests/harness/learning-queue-harness.ts`.
- `tests/app/live-learning-report.ts`, `scripts/run-live-learning-report.mjs`,
  `scripts/run-live-learning-cost.mjs`, `scripts/run-live-learning-probe.mjs`.
- `tests/browser/live-learning/`, `scripts/run-live-learning-fixture.mjs` — proba deterministă de browser.
- `Docs/live-learning.md`.

## Limitări

- Fixture-ul determinist dovedește pipeline-ul în Chromium, dar nu este lumea live condusă cu tastatura;
  proba live rămâne 4/9 și este raportată separat, fără PASS simulat.
- Transportul 103 din pagină este harness-ul cu microtask; raportul Node măsoară `WorkerRuntime` real.
- Proba de browser headless este limitată de renderer-ul software; nu este o dovadă hardware.
- UI-ul de learning/profil, restore din UI, setările și fizica rămân 274/279/282.
- Persistența versiunilor și reluarea după reload rămân 278; store-ul 109 este RAM-only.
- Estimatorul live folosește 094/098; celelalte familii 168–186 rămân candidate-only până la
  integrarea lor în adaptorul de dovezi.
