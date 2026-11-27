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
| `npm run learning:live:probe` | **4/9 PASS**, probă de browser limitată (vezi mai jos) |

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

## Proba de browser

`browser.json` păstrează rularea reală: Chromium 157/WEBGL2, 1280×720, 4/9 verificări. Segmentul
LEARNING închis are 734 de eșantioane 085 reale și un job 103 real, dar singura fereastră 087
eligibilă apare la tick 841 din 849, prea târziu pentru prefixul de 10 s; cele 28 de artefacte sunt
pauze ale renderer-ului SwiftShader (overload), nu dovezi de condus. Proba nu este raportată ca PASS
și nu inventează o publicare. Rulează cu:

```powershell
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
npm run learning:live:probe
```

Pentru dovada pe browser real/hardware, proba trebuie rerulată fără pauzele de overload (287).

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
- `Docs/live-learning.md`.

## Limitări

- Proba de browser headless este limitată de renderer-ul software; nu este o dovadă hardware.
- UI-ul de learning/profil, restore din UI, setările și fizica rămân 274/279/282.
- Persistența versiunilor și reluarea după reload rămân 278; store-ul 109 este RAM-only.
- Estimatorul live folosește 094/098; celelalte familii 168–186 rămân candidate-only până la
  integrarea lor în adaptorul de dovezi.
