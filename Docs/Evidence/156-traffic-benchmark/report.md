# PBI 156 — benchmark flotă și trafic

Raport determinist derivat din matricea executată (156-traffic-benchmark-v1); bugetele sunt citite din manifestul `203-initial-1` și **nu** sunt modificate.

- Măsurat: 2026-11-12T05:29:26.936Z pe AMD Ryzen 7 7735U with Radeon Graphics; 16 fire logice; 14 GiB RAM; Node 24.19.0; Windows; rulare headless, fără renderer
- Comandă: `npm run perf:traffic-benchmark -- --measure`
- Matrice: **108 rânduri** = 3 numere de taxiuri × 3 densități × 4 sisteme × 3 condiții
- Sumar: **36 PASS**, **0 FAIL**, 12 STRESS, 60 REPORTED; gate: `MEASURED_GATE_PASS`; hardware joc complet: `NOT_VALIDATED`

## Protocol

- Fiecare rulare: 30 tick-uri warmup + 180 tick-uri măsurate, 2 repetări (1 pentru cold/first-use, fără warmup, 120 tick-uri)
- Fereastră de observare: ±80 m față de poziția taxiului 0; taxiurile din afara ei sunt „invizibile” pentru cameră, dar rămân în lumea fizică
- Cadențe: decizii 6 tick-uri, UI 6 tick-uri, autosave 90 tick-uri, learning 300 tick-uri, XP 300 tick-uri

## Matricea executată

| Taxiuri | Civili | Sistem | Condiție | Clasificare | Tick p95 / p99 (ms) | Fizică p95 | Decizii p95 | UI p95 | Sistem p95 | GPU | Verdict |
| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 20 | 20 | BASELINE | NORMAL | GATE | 4.47 / 6.36 | 0.24 | 3.17 | 0.25 | 0.00 | NOT_MEASURED | PASS |
| 20 | 20 | BASELINE | AGGRESSIVE | GATE | 3.33 / 4.72 | 0.15 | 2.44 | 0.10 | 0.00 | NOT_MEASURED | PASS |
| 20 | 20 | BASELINE | COLD_FIRST_USE | GATE | 3.47 / 4.38 | 0.12 | 2.58 | 0.08 | 0.00 | NOT_MEASURED | PASS |
| 20 | 20 | LEARNING | NORMAL | GATE | 2.97 / 4.01 | 0.09 | 2.10 | 0.09 | 0.03 | NOT_MEASURED | PASS |
| 20 | 20 | LEARNING | AGGRESSIVE | GATE | 3.52 / 4.36 | 0.15 | 2.53 | 0.09 | 0.02 | NOT_MEASURED | PASS |
| 20 | 20 | LEARNING | COLD_FIRST_USE | GATE | 3.05 / 4.19 | 0.09 | 2.37 | 0.08 | 0.02 | NOT_MEASURED | PASS |
| 20 | 20 | RECORDER_AUTOSAVE | NORMAL | GATE | 4.94 / 9.57 | 0.17 | 3.38 | 0.10 | 0.21 | NOT_MEASURED | PASS |
| 20 | 20 | RECORDER_AUTOSAVE | AGGRESSIVE | GATE | 3.87 / 6.37 | 0.17 | 2.68 | 0.09 | 0.11 | NOT_MEASURED | PASS |
| 20 | 20 | RECORDER_AUTOSAVE | COLD_FIRST_USE | GATE | 4.16 / 5.72 | 0.12 | 2.97 | 0.09 | 0.10 | NOT_MEASURED | PASS |
| 20 | 20 | XP | NORMAL | GATE | 3.14 / 4.34 | 0.09 | 2.29 | 0.09 | 0.12 | NOT_MEASURED | PASS |
| 20 | 20 | XP | AGGRESSIVE | GATE | 3.45 / 4.88 | 0.14 | 2.33 | 0.09 | 0.05 | NOT_MEASURED | PASS |
| 20 | 20 | XP | COLD_FIRST_USE | GATE | 2.81 / 4.15 | 0.10 | 2.06 | 0.06 | 0.05 | NOT_MEASURED | PASS |
| 20 | 40 | BASELINE | NORMAL | REPORTED | 5.39 / 6.92 | 0.14 | 4.19 | 0.08 | 0.00 | NOT_MEASURED | REPORTED |
| 20 | 40 | BASELINE | AGGRESSIVE | REPORTED | 4.52 / 5.10 | 0.16 | 3.46 | 0.07 | 0.00 | NOT_MEASURED | REPORTED |
| 20 | 40 | BASELINE | COLD_FIRST_USE | REPORTED | 4.22 / 4.96 | 0.12 | 3.13 | 0.07 | 0.00 | NOT_MEASURED | REPORTED |
| 20 | 40 | LEARNING | NORMAL | REPORTED | 4.66 / 5.42 | 0.13 | 3.53 | 0.08 | 0.03 | NOT_MEASURED | REPORTED |
| 20 | 40 | LEARNING | AGGRESSIVE | REPORTED | 5.40 / 7.29 | 0.18 | 3.97 | 0.07 | 0.03 | NOT_MEASURED | REPORTED |
| 20 | 40 | LEARNING | COLD_FIRST_USE | REPORTED | 4.56 / 4.92 | 0.12 | 3.40 | 0.05 | 0.02 | NOT_MEASURED | REPORTED |
| 20 | 40 | RECORDER_AUTOSAVE | NORMAL | REPORTED | 6.35 / 8.53 | 0.18 | 4.56 | 0.08 | 0.21 | NOT_MEASURED | REPORTED |
| 20 | 40 | RECORDER_AUTOSAVE | AGGRESSIVE | REPORTED | 7.15 / 9.64 | 0.28 | 5.20 | 0.10 | 0.23 | NOT_MEASURED | REPORTED |
| 20 | 40 | RECORDER_AUTOSAVE | COLD_FIRST_USE | REPORTED | 5.00 / 6.40 | 0.15 | 3.72 | 0.08 | 0.12 | NOT_MEASURED | REPORTED |
| 20 | 40 | XP | NORMAL | REPORTED | 5.00 / 6.35 | 0.13 | 3.90 | 0.09 | 0.04 | NOT_MEASURED | REPORTED |
| 20 | 40 | XP | AGGRESSIVE | REPORTED | 5.05 / 6.06 | 0.19 | 3.60 | 0.07 | 0.03 | NOT_MEASURED | REPORTED |
| 20 | 40 | XP | COLD_FIRST_USE | REPORTED | 4.84 / 6.81 | 0.14 | 3.60 | 0.08 | 0.04 | NOT_MEASURED | REPORTED |
| 20 | 80 | BASELINE | NORMAL | REPORTED | 5.91 / 6.97 | 0.24 | 3.87 | 0.07 | 0.00 | NOT_MEASURED | REPORTED |
| 20 | 80 | BASELINE | AGGRESSIVE | REPORTED | 6.44 / 7.32 | 0.27 | 4.41 | 0.09 | 0.00 | NOT_MEASURED | REPORTED |
| 20 | 80 | BASELINE | COLD_FIRST_USE | REPORTED | 5.43 / 6.89 | 0.21 | 3.65 | 0.05 | 0.00 | NOT_MEASURED | REPORTED |
| 20 | 80 | LEARNING | NORMAL | REPORTED | 5.68 / 7.17 | 0.24 | 3.92 | 0.07 | 0.04 | NOT_MEASURED | REPORTED |
| 20 | 80 | LEARNING | AGGRESSIVE | REPORTED | 5.78 / 7.52 | 0.27 | 3.98 | 0.08 | 0.04 | NOT_MEASURED | REPORTED |
| 20 | 80 | LEARNING | COLD_FIRST_USE | REPORTED | 5.74 / 6.96 | 0.27 | 4.09 | 0.07 | 0.04 | NOT_MEASURED | REPORTED |
| 20 | 80 | RECORDER_AUTOSAVE | NORMAL | REPORTED | 5.91 / 12.11 | 0.23 | 3.69 | 0.08 | 0.24 | NOT_MEASURED | REPORTED |
| 20 | 80 | RECORDER_AUTOSAVE | AGGRESSIVE | REPORTED | 7.42 / 14.04 | 0.31 | 4.77 | 0.09 | 0.24 | NOT_MEASURED | REPORTED |
| 20 | 80 | RECORDER_AUTOSAVE | COLD_FIRST_USE | REPORTED | 6.71 / 8.46 | 0.25 | 4.66 | 0.11 | 0.19 | NOT_MEASURED | REPORTED |
| 20 | 80 | XP | NORMAL | REPORTED | 5.38 / 6.89 | 0.22 | 3.67 | 0.07 | 0.03 | NOT_MEASURED | REPORTED |
| 20 | 80 | XP | AGGRESSIVE | REPORTED | 8.23 / 9.43 | 0.37 | 5.60 | 0.09 | 0.05 | NOT_MEASURED | REPORTED |
| 20 | 80 | XP | COLD_FIRST_USE | REPORTED | 8.58 / 10.51 | 0.33 | 6.09 | 0.09 | 0.03 | NOT_MEASURED | REPORTED |
| 24 | 20 | BASELINE | NORMAL | REPORTED | 3.04 / 4.28 | 0.09 | 2.30 | 0.08 | 0.00 | NOT_MEASURED | REPORTED |
| 24 | 20 | BASELINE | AGGRESSIVE | REPORTED | 3.70 / 4.76 | 0.15 | 2.74 | 0.08 | 0.00 | NOT_MEASURED | REPORTED |
| 24 | 20 | BASELINE | COLD_FIRST_USE | REPORTED | 3.42 / 4.67 | 0.10 | 2.60 | 0.09 | 0.00 | NOT_MEASURED | REPORTED |
| 24 | 20 | LEARNING | NORMAL | REPORTED | 3.42 / 4.75 | 0.10 | 2.49 | 0.08 | 0.02 | NOT_MEASURED | REPORTED |
| 24 | 20 | LEARNING | AGGRESSIVE | REPORTED | 3.10 / 4.33 | 0.10 | 2.28 | 0.08 | 0.02 | NOT_MEASURED | REPORTED |
| 24 | 20 | LEARNING | COLD_FIRST_USE | REPORTED | 2.80 / 3.17 | 0.08 | 2.02 | 0.06 | 0.01 | NOT_MEASURED | REPORTED |
| 24 | 20 | RECORDER_AUTOSAVE | NORMAL | REPORTED | 3.18 / 6.38 | 0.10 | 2.21 | 0.09 | 0.13 | NOT_MEASURED | REPORTED |
| 24 | 20 | RECORDER_AUTOSAVE | AGGRESSIVE | REPORTED | 3.49 / 6.47 | 0.13 | 2.49 | 0.07 | 0.10 | NOT_MEASURED | REPORTED |
| 24 | 20 | RECORDER_AUTOSAVE | COLD_FIRST_USE | REPORTED | 3.68 / 5.07 | 0.11 | 2.81 | 0.09 | 0.10 | NOT_MEASURED | REPORTED |
| 24 | 20 | XP | NORMAL | REPORTED | 3.00 / 3.80 | 0.09 | 2.37 | 0.07 | 0.03 | NOT_MEASURED | REPORTED |
| 24 | 20 | XP | AGGRESSIVE | REPORTED | 3.42 / 4.59 | 0.13 | 2.41 | 0.08 | 0.04 | NOT_MEASURED | REPORTED |
| 24 | 20 | XP | COLD_FIRST_USE | REPORTED | 3.40 / 4.21 | 0.11 | 2.42 | 0.08 | 0.02 | NOT_MEASURED | REPORTED |
| 24 | 40 | BASELINE | NORMAL | GATE | 4.60 / 5.48 | 0.13 | 3.58 | 0.08 | 0.00 | NOT_MEASURED | PASS |
| 24 | 40 | BASELINE | AGGRESSIVE | GATE | 4.89 / 5.90 | 0.17 | 3.63 | 0.07 | 0.00 | NOT_MEASURED | PASS |
| 24 | 40 | BASELINE | COLD_FIRST_USE | GATE | 5.44 / 6.16 | 0.13 | 4.15 | 0.09 | 0.00 | NOT_MEASURED | PASS |
| 24 | 40 | LEARNING | NORMAL | GATE | 4.73 / 6.16 | 0.13 | 3.69 | 0.10 | 0.03 | NOT_MEASURED | PASS |
| 24 | 40 | LEARNING | AGGRESSIVE | GATE | 5.26 / 5.88 | 0.18 | 3.81 | 0.08 | 0.03 | NOT_MEASURED | PASS |
| 24 | 40 | LEARNING | COLD_FIRST_USE | GATE | 4.38 / 5.02 | 0.11 | 3.19 | 0.06 | 0.02 | NOT_MEASURED | PASS |
| 24 | 40 | RECORDER_AUTOSAVE | NORMAL | GATE | 6.52 / 9.23 | 0.18 | 4.84 | 0.10 | 0.22 | NOT_MEASURED | PASS |
| 24 | 40 | RECORDER_AUTOSAVE | AGGRESSIVE | GATE | 7.09 / 9.21 | 0.26 | 5.10 | 0.13 | 0.23 | NOT_MEASURED | PASS |
| 24 | 40 | RECORDER_AUTOSAVE | COLD_FIRST_USE | GATE | 5.08 / 7.69 | 0.14 | 3.64 | 0.09 | 0.12 | NOT_MEASURED | PASS |
| 24 | 40 | XP | NORMAL | GATE | 5.63 / 7.16 | 0.14 | 4.16 | 0.10 | 0.04 | NOT_MEASURED | PASS |
| 24 | 40 | XP | AGGRESSIVE | GATE | 5.08 / 6.17 | 0.18 | 3.76 | 0.08 | 0.03 | NOT_MEASURED | PASS |
| 24 | 40 | XP | COLD_FIRST_USE | GATE | 5.00 / 5.60 | 0.14 | 3.82 | 0.08 | 0.03 | NOT_MEASURED | PASS |
| 24 | 80 | BASELINE | NORMAL | REPORTED | 6.42 / 7.95 | 0.28 | 4.21 | 0.10 | 0.00 | NOT_MEASURED | REPORTED |
| 24 | 80 | BASELINE | AGGRESSIVE | REPORTED | 5.25 / 6.69 | 0.25 | 3.59 | 0.08 | 0.00 | NOT_MEASURED | REPORTED |
| 24 | 80 | BASELINE | COLD_FIRST_USE | REPORTED | 5.35 / 6.62 | 0.22 | 3.73 | 0.06 | 0.00 | NOT_MEASURED | REPORTED |
| 24 | 80 | LEARNING | NORMAL | REPORTED | 6.41 / 7.20 | 0.27 | 4.13 | 0.08 | 0.03 | NOT_MEASURED | REPORTED |
| 24 | 80 | LEARNING | AGGRESSIVE | REPORTED | 5.95 / 7.23 | 0.28 | 4.12 | 0.09 | 0.04 | NOT_MEASURED | REPORTED |
| 24 | 80 | LEARNING | COLD_FIRST_USE | REPORTED | 6.16 / 6.58 | 0.25 | 4.07 | 0.08 | 0.03 | NOT_MEASURED | REPORTED |
| 24 | 80 | RECORDER_AUTOSAVE | NORMAL | REPORTED | 6.41 / 13.44 | 0.26 | 4.10 | 0.09 | 0.27 | NOT_MEASURED | REPORTED |
| 24 | 80 | RECORDER_AUTOSAVE | AGGRESSIVE | REPORTED | 6.54 / 13.09 | 0.29 | 4.32 | 0.09 | 0.20 | NOT_MEASURED | REPORTED |
| 24 | 80 | RECORDER_AUTOSAVE | COLD_FIRST_USE | REPORTED | 5.21 / 8.44 | 0.19 | 3.63 | 0.06 | 0.18 | NOT_MEASURED | REPORTED |
| 24 | 80 | XP | NORMAL | REPORTED | 6.83 / 8.10 | 0.27 | 4.52 | 0.09 | 0.04 | NOT_MEASURED | REPORTED |
| 24 | 80 | XP | AGGRESSIVE | REPORTED | 8.57 / 10.01 | 0.37 | 5.93 | 0.10 | 0.05 | NOT_MEASURED | REPORTED |
| 24 | 80 | XP | COLD_FIRST_USE | REPORTED | 5.78 / 6.17 | 0.23 | 3.84 | 0.08 | 0.03 | NOT_MEASURED | REPORTED |
| 30 | 20 | BASELINE | NORMAL | REPORTED | 3.67 / 4.40 | 0.13 | 2.59 | 0.10 | 0.00 | NOT_MEASURED | REPORTED |
| 30 | 20 | BASELINE | AGGRESSIVE | REPORTED | 3.18 / 4.00 | 0.13 | 2.29 | 0.09 | 0.00 | NOT_MEASURED | REPORTED |
| 30 | 20 | BASELINE | COLD_FIRST_USE | REPORTED | 3.69 / 4.70 | 0.11 | 2.60 | 0.10 | 0.00 | NOT_MEASURED | REPORTED |
| 30 | 20 | LEARNING | NORMAL | REPORTED | 4.05 / 5.57 | 0.13 | 2.75 | 0.10 | 0.03 | NOT_MEASURED | REPORTED |
| 30 | 20 | LEARNING | AGGRESSIVE | REPORTED | 3.85 / 4.63 | 0.16 | 2.66 | 0.13 | 0.03 | NOT_MEASURED | REPORTED |
| 30 | 20 | LEARNING | COLD_FIRST_USE | REPORTED | 3.90 / 6.45 | 0.12 | 2.88 | 0.09 | 0.03 | NOT_MEASURED | REPORTED |
| 30 | 20 | RECORDER_AUTOSAVE | NORMAL | REPORTED | 3.76 / 7.07 | 0.11 | 2.61 | 0.09 | 0.11 | NOT_MEASURED | REPORTED |
| 30 | 20 | RECORDER_AUTOSAVE | AGGRESSIVE | REPORTED | 3.75 / 6.91 | 0.15 | 2.58 | 0.10 | 0.13 | NOT_MEASURED | REPORTED |
| 30 | 20 | RECORDER_AUTOSAVE | COLD_FIRST_USE | REPORTED | 4.21 / 5.02 | 0.10 | 2.61 | 0.10 | 0.17 | NOT_MEASURED | REPORTED |
| 30 | 20 | XP | NORMAL | REPORTED | 3.77 / 4.97 | 0.11 | 2.82 | 0.10 | 0.03 | NOT_MEASURED | REPORTED |
| 30 | 20 | XP | AGGRESSIVE | REPORTED | 3.44 / 4.37 | 0.12 | 2.63 | 0.10 | 0.03 | NOT_MEASURED | REPORTED |
| 30 | 20 | XP | COLD_FIRST_USE | REPORTED | 2.91 / 3.41 | 0.09 | 2.12 | 0.07 | 0.02 | NOT_MEASURED | REPORTED |
| 30 | 40 | BASELINE | NORMAL | GATE | 4.75 / 6.23 | 0.14 | 3.76 | 0.11 | 0.00 | NOT_MEASURED | PASS |
| 30 | 40 | BASELINE | AGGRESSIVE | GATE | 4.81 / 5.85 | 0.17 | 3.65 | 0.08 | 0.00 | NOT_MEASURED | PASS |
| 30 | 40 | BASELINE | COLD_FIRST_USE | GATE | 4.83 / 6.17 | 0.14 | 3.75 | 0.10 | 0.00 | NOT_MEASURED | PASS |
| 30 | 40 | LEARNING | NORMAL | GATE | 4.98 / 5.92 | 0.13 | 3.70 | 0.10 | 0.03 | NOT_MEASURED | PASS |
| 30 | 40 | LEARNING | AGGRESSIVE | GATE | 5.44 / 6.94 | 0.21 | 4.01 | 0.09 | 0.03 | NOT_MEASURED | PASS |
| 30 | 40 | LEARNING | COLD_FIRST_USE | GATE | 6.86 / 8.41 | 0.19 | 5.37 | 0.11 | 0.04 | NOT_MEASURED | PASS |
| 30 | 40 | RECORDER_AUTOSAVE | NORMAL | GATE | 7.00 / 12.43 | 0.21 | 5.00 | 0.12 | 0.26 | NOT_MEASURED | PASS |
| 30 | 40 | RECORDER_AUTOSAVE | AGGRESSIVE | GATE | 5.41 / 10.35 | 0.20 | 3.76 | 0.10 | 0.15 | NOT_MEASURED | PASS |
| 30 | 40 | RECORDER_AUTOSAVE | COLD_FIRST_USE | GATE | 5.30 / 6.18 | 0.13 | 3.60 | 0.09 | 0.11 | NOT_MEASURED | PASS |
| 30 | 40 | XP | NORMAL | GATE | 4.34 / 4.95 | 0.12 | 3.42 | 0.07 | 0.04 | NOT_MEASURED | PASS |
| 30 | 40 | XP | AGGRESSIVE | GATE | 5.94 / 7.17 | 0.22 | 4.35 | 0.08 | 0.03 | NOT_MEASURED | PASS |
| 30 | 40 | XP | COLD_FIRST_USE | GATE | 5.19 / 6.20 | 0.15 | 4.05 | 0.10 | 0.03 | NOT_MEASURED | PASS |
| 30 | 80 | BASELINE | NORMAL | STRESS | 5.79 / 6.87 | 0.26 | 3.90 | 0.10 | 0.00 | NOT_MEASURED | STRESS |
| 30 | 80 | BASELINE | AGGRESSIVE | STRESS | 6.09 / 8.32 | 0.27 | 4.11 | 0.10 | 0.00 | NOT_MEASURED | STRESS |
| 30 | 80 | BASELINE | COLD_FIRST_USE | STRESS | 5.92 / 6.11 | 0.22 | 4.02 | 0.12 | 0.00 | NOT_MEASURED | STRESS |
| 30 | 80 | LEARNING | NORMAL | STRESS | 5.74 / 6.30 | 0.24 | 3.85 | 0.08 | 0.03 | NOT_MEASURED | STRESS |
| 30 | 80 | LEARNING | AGGRESSIVE | STRESS | 6.67 / 7.86 | 0.32 | 4.49 | 0.12 | 0.04 | NOT_MEASURED | STRESS |
| 30 | 80 | LEARNING | COLD_FIRST_USE | STRESS | 6.18 / 7.33 | 0.25 | 4.19 | 0.09 | 0.03 | NOT_MEASURED | STRESS |
| 30 | 80 | RECORDER_AUTOSAVE | NORMAL | STRESS | 5.71 / 13.79 | 0.24 | 3.85 | 0.09 | 0.22 | NOT_MEASURED | STRESS |
| 30 | 80 | RECORDER_AUTOSAVE | AGGRESSIVE | STRESS | 7.20 / 13.63 | 0.32 | 4.43 | 0.10 | 0.29 | NOT_MEASURED | STRESS |
| 30 | 80 | RECORDER_AUTOSAVE | COLD_FIRST_USE | STRESS | 8.38 / 9.78 | 0.34 | 5.61 | 0.10 | 0.26 | NOT_MEASURED | STRESS |
| 30 | 80 | XP | NORMAL | STRESS | 8.27 / 10.04 | 0.34 | 5.74 | 0.10 | 0.05 | NOT_MEASURED | STRESS |
| 30 | 80 | XP | AGGRESSIVE | STRESS | 5.80 / 6.60 | 0.27 | 3.76 | 0.09 | 0.03 | NOT_MEASURED | STRESS |
| 30 | 80 | XP | COLD_FIRST_USE | STRESS | 5.29 / 6.19 | 0.20 | 3.65 | 0.07 | 0.04 | NOT_MEASURED | STRESS |

## Taxiuri invizibile și expunere

| Taxiuri | Civili | Sistem | Condiție | Invizibile | Decizii invizibile | Corpuri în mișcare | Expunere (vehicul-secunde) |
| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |
| 20 | 20 | BASELINE | NORMAL | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | BASELINE | AGGRESSIVE | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | BASELINE | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 80.00 |
| 20 | 20 | LEARNING | NORMAL | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | LEARNING | AGGRESSIVE | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | LEARNING | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 80.00 |
| 20 | 20 | RECORDER_AUTOSAVE | NORMAL | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | RECORDER_AUTOSAVE | AGGRESSIVE | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 80.00 |
| 20 | 20 | XP | NORMAL | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | XP | AGGRESSIVE | 18/20 | 1080 | 20/20 | 240.00 |
| 20 | 20 | XP | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 80.00 |
| 20 | 40 | BASELINE | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | BASELINE | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | BASELINE | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 40 | LEARNING | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | LEARNING | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | LEARNING | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 40 | RECORDER_AUTOSAVE | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | RECORDER_AUTOSAVE | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 40 | XP | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | XP | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 40 | XP | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 80 | BASELINE | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | BASELINE | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | BASELINE | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 80 | LEARNING | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | LEARNING | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | LEARNING | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 80 | RECORDER_AUTOSAVE | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | RECORDER_AUTOSAVE | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 20 | 80 | XP | NORMAL | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | XP | AGGRESSIVE | 18/20 | 1080 | 20/20 | 360.00 |
| 20 | 80 | XP | COLD_FIRST_USE | 18/20 | 360 | 20/20 | 120.00 |
| 24 | 20 | BASELINE | NORMAL | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | BASELINE | AGGRESSIVE | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | BASELINE | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 88.00 |
| 24 | 20 | LEARNING | NORMAL | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | LEARNING | AGGRESSIVE | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | LEARNING | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 88.00 |
| 24 | 20 | RECORDER_AUTOSAVE | NORMAL | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | RECORDER_AUTOSAVE | AGGRESSIVE | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 88.00 |
| 24 | 20 | XP | NORMAL | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | XP | AGGRESSIVE | 22/24 | 1320 | 24/24 | 264.00 |
| 24 | 20 | XP | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 88.00 |
| 24 | 40 | BASELINE | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | BASELINE | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | BASELINE | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 40 | LEARNING | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | LEARNING | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | LEARNING | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 40 | RECORDER_AUTOSAVE | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | RECORDER_AUTOSAVE | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 40 | XP | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | XP | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 40 | XP | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 80 | BASELINE | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | BASELINE | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | BASELINE | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 80 | LEARNING | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | LEARNING | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | LEARNING | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 80 | RECORDER_AUTOSAVE | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | RECORDER_AUTOSAVE | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 24 | 80 | XP | NORMAL | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | XP | AGGRESSIVE | 22/24 | 1320 | 24/24 | 384.00 |
| 24 | 80 | XP | COLD_FIRST_USE | 22/24 | 440 | 24/24 | 128.00 |
| 30 | 20 | BASELINE | NORMAL | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | BASELINE | AGGRESSIVE | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | BASELINE | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 100.00 |
| 30 | 20 | LEARNING | NORMAL | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | LEARNING | AGGRESSIVE | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | LEARNING | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 100.00 |
| 30 | 20 | RECORDER_AUTOSAVE | NORMAL | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | RECORDER_AUTOSAVE | AGGRESSIVE | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 100.00 |
| 30 | 20 | XP | NORMAL | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | XP | AGGRESSIVE | 28/30 | 1680 | 30/30 | 300.00 |
| 30 | 20 | XP | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 100.00 |
| 30 | 40 | BASELINE | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | BASELINE | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | BASELINE | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 40 | LEARNING | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | LEARNING | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | LEARNING | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 40 | RECORDER_AUTOSAVE | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | RECORDER_AUTOSAVE | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 40 | XP | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | XP | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 40 | XP | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 80 | BASELINE | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | BASELINE | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | BASELINE | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 80 | LEARNING | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | LEARNING | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | LEARNING | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 80 | RECORDER_AUTOSAVE | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | RECORDER_AUTOSAVE | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | RECORDER_AUTOSAVE | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |
| 30 | 80 | XP | NORMAL | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | XP | AGGRESSIVE | 28/30 | 1680 | 30/30 | 420.00 |
| 30 | 80 | XP | COLD_FIRST_USE | 28/30 | 560 | 30/30 | 140.00 |

Expunerea este citită din contractul real 137: `fleetVehicleSeconds = fleet.vehicles × simulatedSeconds`, cu numitorul pe toată flota 057, nu pe selecția camerei.

## Verificări de buget pe rândurile de gate

| Rând | Verificare | Valoare | Buget | Sursă | Verdict |
| --- | --- | ---: | ---: | --- | --- |
| 156-20x20-baseline-normal | tick autoritar p95 | 4.471 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-baseline-normal | pas Rapier p95 | 0.242 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-baseline-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-aggressive | tick autoritar p95 | 3.33 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-baseline-aggressive | pas Rapier p95 | 0.155 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-baseline-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-cold_first_use | tick autoritar p95 | 3.473 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-baseline-cold_first_use | pas Rapier p95 | 0.119 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-baseline-cold_first_use | pornire la prima comandă acceptată, cold | 359.519 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-20x20-baseline-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-baseline-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-normal | tick autoritar p95 | 2.967 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-learning-normal | pas Rapier p95 | 0.086 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-learning-normal | închidere segment → activare learning p95 | 347.109 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-20x20-learning-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-normal | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-aggressive | tick autoritar p95 | 3.516 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-learning-aggressive | pas Rapier p95 | 0.146 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-learning-aggressive | închidere segment → activare learning p95 | 408.376 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-20x20-learning-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-aggressive | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-cold_first_use | tick autoritar p95 | 3.049 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-learning-cold_first_use | pas Rapier p95 | 0.094 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-learning-cold_first_use | închidere segment → activare learning p95 | 227.87 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-20x20-learning-cold_first_use | pornire la prima comandă acceptată, cold | 449.047 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-20x20-learning-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-learning-cold_first_use | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-normal | tick autoritar p95 | 4.94 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-recorder_autosave-normal | pas Rapier p95 | 0.17 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-recorder_autosave-normal | vârf de bytes reținuți de recorder | 234240 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-20x20-recorder_autosave-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-normal | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-aggressive | tick autoritar p95 | 3.871 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-recorder_autosave-aggressive | pas Rapier p95 | 0.174 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-recorder_autosave-aggressive | vârf de bytes reținuți de recorder | 234240 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-20x20-recorder_autosave-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-aggressive | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-cold_first_use | tick autoritar p95 | 4.162 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-recorder_autosave-cold_first_use | pas Rapier p95 | 0.119 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-recorder_autosave-cold_first_use | vârf de bytes reținuți de recorder | 156160 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-20x20-recorder_autosave-cold_first_use | pornire la prima comandă acceptată, cold | 455.98 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-20x20-recorder_autosave-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-recorder_autosave-cold_first_use | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-normal | tick autoritar p95 | 3.14 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-xp-normal | pas Rapier p95 | 0.092 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-xp-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-normal | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-aggressive | tick autoritar p95 | 3.452 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-xp-aggressive | pas Rapier p95 | 0.145 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-xp-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-aggressive | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-cold_first_use | tick autoritar p95 | 2.811 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-20x20-xp-cold_first_use | pas Rapier p95 | 0.095 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-20x20-xp-cold_first_use | pornire la prima comandă acceptată, cold | 352.95 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-20x20-xp-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-20x20-xp-cold_first_use | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-normal | tick autoritar p95 | 4.597 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-baseline-normal | pas Rapier p95 | 0.129 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-baseline-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-aggressive | tick autoritar p95 | 4.894 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-baseline-aggressive | pas Rapier p95 | 0.175 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-baseline-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-cold_first_use | tick autoritar p95 | 5.438 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-baseline-cold_first_use | pas Rapier p95 | 0.133 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-baseline-cold_first_use | pornire la prima comandă acceptată, cold | 370.888 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-24x40-baseline-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-baseline-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-normal | tick autoritar p95 | 4.734 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-learning-normal | pas Rapier p95 | 0.132 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-learning-normal | închidere segment → activare learning p95 | 611.124 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-24x40-learning-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-normal | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-aggressive | tick autoritar p95 | 5.256 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-learning-aggressive | pas Rapier p95 | 0.182 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-learning-aggressive | închidere segment → activare learning p95 | 617.098 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-24x40-learning-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-aggressive | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-cold_first_use | tick autoritar p95 | 4.375 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-learning-cold_first_use | pas Rapier p95 | 0.113 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-learning-cold_first_use | închidere segment → activare learning p95 | 365.677 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-24x40-learning-cold_first_use | pornire la prima comandă acceptată, cold | 351.27 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-24x40-learning-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-learning-cold_first_use | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-normal | tick autoritar p95 | 6.522 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-recorder_autosave-normal | pas Rapier p95 | 0.181 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-recorder_autosave-normal | vârf de bytes reținuți de recorder | 372480 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-24x40-recorder_autosave-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-normal | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-aggressive | tick autoritar p95 | 7.093 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-recorder_autosave-aggressive | pas Rapier p95 | 0.262 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-recorder_autosave-aggressive | vârf de bytes reținuți de recorder | 372480 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-24x40-recorder_autosave-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-aggressive | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-cold_first_use | tick autoritar p95 | 5.079 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-recorder_autosave-cold_first_use | pas Rapier p95 | 0.137 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-recorder_autosave-cold_first_use | vârf de bytes reținuți de recorder | 248320 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-24x40-recorder_autosave-cold_first_use | pornire la prima comandă acceptată, cold | 360.292 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-24x40-recorder_autosave-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-recorder_autosave-cold_first_use | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-normal | tick autoritar p95 | 5.63 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-xp-normal | pas Rapier p95 | 0.139 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-xp-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-normal | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-aggressive | tick autoritar p95 | 5.077 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-xp-aggressive | pas Rapier p95 | 0.176 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-xp-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-aggressive | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-cold_first_use | tick autoritar p95 | 4.995 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-24x40-xp-cold_first_use | pas Rapier p95 | 0.144 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-24x40-xp-cold_first_use | pornire la prima comandă acceptată, cold | 359.747 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-24x40-xp-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-24x40-xp-cold_first_use | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-normal | tick autoritar p95 | 4.752 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-baseline-normal | pas Rapier p95 | 0.137 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-baseline-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-aggressive | tick autoritar p95 | 4.813 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-baseline-aggressive | pas Rapier p95 | 0.174 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-baseline-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-cold_first_use | tick autoritar p95 | 4.832 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-baseline-cold_first_use | pas Rapier p95 | 0.143 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-baseline-cold_first_use | pornire la prima comandă acceptată, cold | 368.128 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-30x40-baseline-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-baseline-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-normal | tick autoritar p95 | 4.977 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-learning-normal | pas Rapier p95 | 0.134 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-learning-normal | închidere segment → activare learning p95 | 624.855 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-30x40-learning-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-normal | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-aggressive | tick autoritar p95 | 5.441 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-learning-aggressive | pas Rapier p95 | 0.207 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-learning-aggressive | închidere segment → activare learning p95 | 681.737 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-30x40-learning-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-aggressive | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-cold_first_use | tick autoritar p95 | 6.86 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-learning-cold_first_use | pas Rapier p95 | 0.188 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-learning-cold_first_use | închidere segment → activare learning p95 | 580.826 ms | 2000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.segmentCloseToProfileActivationP95Ms | PASS |
| 156-30x40-learning-cold_first_use | pornire la prima comandă acceptată, cold | 550.735 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-30x40-learning-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-learning-cold_first_use | learning-activat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-normal | tick autoritar p95 | 6.999 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-recorder_autosave-normal | pas Rapier p95 | 0.208 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-recorder_autosave-normal | vârf de bytes reținuți de recorder | 407040 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-30x40-recorder_autosave-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-normal | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-aggressive | tick autoritar p95 | 5.407 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-recorder_autosave-aggressive | pas Rapier p95 | 0.201 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-recorder_autosave-aggressive | vârf de bytes reținuți de recorder | 407040 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-30x40-recorder_autosave-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-aggressive | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-cold_first_use | tick autoritar p95 | 5.3 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-recorder_autosave-cold_first_use | pas Rapier p95 | 0.13 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-recorder_autosave-cold_first_use | vârf de bytes reținuți de recorder | 271360 B | 33554432 B | Docs/performance-budgets.json (203-initial-1) proposedCapacities.recorderRamBytes | PASS |
| 156-30x40-recorder_autosave-cold_first_use | pornire la prima comandă acceptată, cold | 377.775 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-30x40-recorder_autosave-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-recorder_autosave-cold_first_use | recorder-autosave-executat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-normal | tick autoritar p95 | 4.345 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-xp-normal | pas Rapier p95 | 0.115 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-xp-normal | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-normal | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-normal | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-normal | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-normal | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-aggressive | tick autoritar p95 | 5.938 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-xp-aggressive | pas Rapier p95 | 0.224 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-xp-aggressive | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-aggressive | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-aggressive | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-aggressive | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-aggressive | contacte-agresive | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-aggressive | xp-creditat | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-cold_first_use | tick autoritar p95 | 5.187 ms | 8 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.authoritativeTickP95Ms | PASS |
| 156-30x40-xp-cold_first_use | pas Rapier p95 | 0.15 ms | 5 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.laptop.rapierStepP95Ms | PASS |
| 156-30x40-xp-cold_first_use | pornire la prima comandă acceptată, cold | 394.701 ms | 12000 ms | Docs/performance-budgets.json (203-initial-1) proposedBudgets.coldFirstAcceptedCommandP95Ms | PASS |
| 156-30x40-xp-cold_first_use | populatie-fizica-completa | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-cold_first_use | taxiuri-invizibile-simulate | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-cold_first_use | expunere-include-flota-intreaga | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-cold_first_use | cleanup-fara-resurse | — ratio | fără buget | contract 156 | PASS |
| 156-30x40-xp-cold_first_use | xp-creditat | — ratio | fără buget | contract 156 | PASS |

## Suprasarcină și abateri

`30 taxiuri / 80 civili` este workload-ul `overload` al manifestului: se raportează separat, cu verdict `STRESS`, și nu închide gate-ul normal.

- 156-30x80-baseline-normal: tick p95 5.788 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-baseline-aggressive: tick p95 6.088 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-baseline-cold_first_use: tick p95 5.925 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-learning-normal: tick p95 5.735 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-learning-aggressive: tick p95 6.675 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-learning-cold_first_use: tick p95 6.183 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-recorder_autosave-normal: tick p95 5.71 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-recorder_autosave-aggressive: tick p95 7.198 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-recorder_autosave-cold_first_use: tick p95 8.375 ms (buget 8 ms); depășiri: tick autoritar p95: 8.375 ms
- 156-30x80-xp-normal: tick p95 8.273 ms (buget 8 ms); depășiri: tick autoritar p95: 8.273 ms
- 156-30x80-xp-aggressive: tick p95 5.799 ms (buget 8 ms); fără depășiri măsurate
- 156-30x80-xp-cold_first_use: tick p95 5.289 ms (buget 8 ms); fără depășiri măsurate

Niciun rând de gate nu depășește bugetele măsurabile. Rândurile `REPORTED` sunt combinații de densitate în afara workload-urilor declarate în manifest; ele sunt măsurate și raportate, nu folosite ca dovadă de gate.

## Ce nu a putut fi măsurat

| Metrică | Motiv | Măsurat în schimb |
| --- | --- | --- |
| interval de cadru / FPS | proba este headless (Node), fără renderer Babylon și fără cadru de prezentare | tick-ul autoritar complet și defalcarea lui pe componente CPU |
| lucru GPU p95 | nu există timer GPU fără renderer; valoarea este null, nu 0 | costul CPU al fizicii, deciziilor, UI proiectat și sistemului atașat |
| main-thread total p95 | include randarea CPU și paint-ul DOM, care nu există în proba headless | tick-ul complet măsurat, comparat cu bugetul de tick autoritar |
| timp simulat / timp real activ | proba headless rulează cât mai repede, nu la 60 Hz real; raportul simulat/timp CPU nu este metricul de pacing al manifestului | tick-ul complet și durata măsurată; rata simulat/timp CPU rămâne un diagnostic, nu un verdict |
| UI DOM layout/paint | Node nu are DOM; se măsoară proiecțiile pure 073/075, nu layout-ul browserului | proiecția HUD 073 și panoul de flotă 075 la cadența HUD |
| memoria exactă a paginii și a GPU | nu există API portabil; contoarele de ownership sunt raportate separat | bytes reținuți de recorder și bytes capturați de checkpoint |
| pornirea la prima comandă a jocului complet, cold | pagina de joc completă nu există încă; se măsoară prima comandă a fixture-ului integrat | world build + populare + prima comandă autoritară acceptată |

Verdictul acoperă numai tick-ul, fizica, deciziile, UI-ul proiectat, sistemele atașate și expunerea măsurate aici. Frame-ul, FPS-ul, GPU-ul și main-thread-ul cu randare rămân NOT_MEASURED; gate-ul hardware al jocului complet rămâne NOT_VALIDATED.
