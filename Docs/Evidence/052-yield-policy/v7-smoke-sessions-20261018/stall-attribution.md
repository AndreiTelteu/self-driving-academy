# PBI052 — atribuirea stall-ului WEBGPU (2026-10-18)

Analiză read-only a capturilor din `v7-smoke-sessions-20261018`, plus verificarea jurnalelor Windows.
Nu s-a rulat nicio probă nouă și nu s-a modificat nicio sursă de produs.

## Concluzie

Stall-ul este **întârziere de livrare a callback-ului `requestAnimationFrame`** (frame presentation),
nu cost de aplicație:

- eșecul din sesiunea `193106239Z`, arm 10: `stampMs 96549.1` față de `beforeNative.nowMs 96017.7` și
  `rafAttempt.waitStartMs 96019.3` → **~530 ms** până la invocarea callback-ului;
- în interiorul callback-ului totul e normal: `stamp→callback 2.5 ms`, `callback→continuation 0 ms`,
  `continuation→read 0.1 ms`;
- costurile native pentru tick-urile 139–142 sunt 1.6 / 2.4 / 2.0 / 1.7 ms (`stepMs 0-0.2`), iar
  contorul `nativeSerial` nu avansează în timpul pauzei (`counterAfter 322`, neschimbat);
- **niciun longtask** în timpul pauzei (`longTasks.count 0`, `maxMs 0`); singurul longtask observat are
  83 ms și e înainte de fereastra măsurată ⇒ firul principal nu a fost blocat (fără GC/JS/JIT).

A doua eșecătură (sesiunea `192001395Z`, arm 9, `nativePhaseRatio 0.976181`) are aceeași natură: canalul
`frame` are `max 217 ms` (restul ≈16.7 ms), ceea ce împinge 180 tickuri la 3073.2 ms (≈58.6 Hz).

## Cadence normală, deci stall izolat — nu throttling cronic

Intervale între stampilele RAF, calculate din canalele brute `rafTime`:

| Sursă | meanGap | maxGap |
| --- | --- | --- |
| WEBGPU, arme curate 0–9 | 16.693 ms | ≤17.7 ms |
| WEBGL2, arme 0–13 (sesiunea `192656329Z`) | 16.693 ms | ≤17.8 ms |

28 de brațe WEBGL2 și 10 brațe WEBGPU curate nu au nicio deviație peste ~17.8 ms. Deci nu există o
latență cronică; doar stall-uri rare.

## Nu e cauzat de 052 sau de scenă

- `main p95` 6.5 ms, `tick p95` 2.7 ms, `step p95` 0.2 ms, `policy p95` 0.1 ms pe brațul care a eșuat;
- fail-fast-ul V7 de boundary a raportat `WITHIN_EXISTING_BOUNDARY` (deci nu e vechea nepotrivire
  ENTRY/previous RAF din V6);
- scene: 2 mesh-uri (calibrare) / 70 mașini (măsurat), 1920×1080 DPR1, cleanup zero.

## Verificări de mediu (locale, read-only)

- Power scheme **High performance**, pe alimentare (baterie 79 %).
- **Niciun** eveniment de display/TDR (`Display`, `amdkmdag`, id 4101/4102/4103) în ultimele 2 ore.
- **Niciun** `Application Error`/`Application Hang`/WER pentru Chrome în ultimele 2 ore.
- Niciun eveniment `Microsoft-Windows-Kernel-Processor-Power`.

Prin urmare nu există dovadă de reset de driver, crash sau throttling de procesor/power în timpul probelor.

## Interpretare și limite

Semnătura e identică cu cea raportată deja în istoricul PBI (V6: `awaitGap 1658.6 ms`, fără cauză
GC/OS demonstrată). Aici putem exclude suplimentar: costul aplicației, blocajul firului principal,
cronicitatea și resetul de driver. Rămâne o întârziere de prezentare proprie căii **WEBGPU/D3D12** pe
iGPU-ul AMD Radeon 680M (Ryzen 7 7735U) din Chrome 155; WEBGL2 a rămas curat în 28/28 de brațe.

Nu se poate stabili cauza ultimă (driver vs. Chrome/Dawn vs. memorie GPU) din datele deja capturate.
Discriminatorul următor, dacă e autorizat, este proba reutilizabilă `tests/browser/raf-scheduling-diagnostic`
(faza `RAF_ONLY`, fără renderer și fără native): o pauză acolo ar izola problema la browser/compositor, nu
la WebGPU/Babylon.

## Artefacte de analiză

`diag-dump.mjs` (timeline pe un braț), `raf-gaps.mjs` (intervale RAF pe braț), `arms-summary.mjs`
(tabel per braț). Toate sunt read-only peste capturile din acest folder.
