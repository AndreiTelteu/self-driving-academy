# 280 — camera first-person din poziția șoferului

Transcript determinist generat de `npm run camera:first-person`; contract `280-first-person-camera-v1`.
Machine-readable: [report.json](report.json).

## Sumar

- Scenarii: **5/5** PASS.
- Verdict: **PASS**.
- Digest SHA-256: `7a47aa66c92c8728982dca887fcca8643c762b8bb80c2e1d83f1ec944a200e4c`.
- Cost local tick p95: CHASE 0.097 ms, FIRST_PERSON 0.096 ms, delta -0.002 ms.

| Scenariu | Verdict | Detaliu |
| --- | --- | --- |
| `switch-and-back` | PASS | C: CHASE → FIRST_PERSON → CHASE |
| `fov` | PASS | ControlPreferences.fov → first-person FOV |
| `exit-reenter-switch` | PASS | exit → walk → re-enter → switch taxi/civil |
| `anchor-taxi` | PASS | sedan driver anchor |
| `anchor-civil` | PASS | compact driver anchor |

## Ancore reale

- Sedan: `(-0.343, 1.460, 0.058)` m, stânga, în cabina 145.
- Compact: `(-0.317, 1.477, -0.014)` m, stânga, în cabina 145.

## FOV

- setare 60° → măsurat 60.0000° (FIRST_PERSON)
- setare 75° → măsurat 75.0000° (FIRST_PERSON)
- setare 100° → măsurat 100.0000° (FIRST_PERSON)

## Cost

Node v24.19.0, one V3 composition with one driven taxi, no ambient traffic; 120 warmup + 600 measured fixed ticks × 3 alternating repetitions.

Local tick CPU only; not a frame/FPS/GPU measurement and not the 203/287 hardware gate.

| Mod | p50 median (ms) | p95 median (ms) | mean median (ms) |
| --- | ---: | ---: | ---: |
| CHASE | 0.0785 | 0.0970 | 0.0820 |
| FIRST_PERSON | 0.0722 | 0.0955 | 0.0775 |

## Limitări

- The report is a local Node tick measurement, not a browser frame/FPS/GPU result and not the 203/287 hardware gate.
- The live first-person view is a presentation choice of the driven car; a camera-only selection of another car stays in CHASE until that car is explicitly taken over.
- The live V3 car has no modelled cabin interior, so the whole exterior shell of the driven car is hidden in first person; the road, traffic, city and lights remain rendered.
- Mouse look/recenter and pointer capture remain the 017 fixture contract; PBI 280 only mounts C, the driver anchor and the saved presentation preference.
