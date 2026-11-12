# 168 — învățare pentru viteză și ritm

Generat de `scripts/run-v2-speed-learning-report.mjs` din contractul `168-tempo-estimator-v1`.
Fiecare cheie se estimează numai din faptul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → context → estimare → incertitudine → validare independentă

| Cheie | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `speed_delta_arterial` | probe arteriale FREE_TRAFFIC/ELIGIBLE fără constrângere de lider, măsurate ca viteză − limita postată | 4.075 m/s | ±0.100 m/s | 1 m/s | VALIDATED, 2 episoade, valoare 3.950, eroare 0.125 ≤ 1 |
| `cruise_speed_variability` | cicluri de croazieră FREE_TRAFFIC/ELIGIBLE de minimum 600 tick-uri, fără depășiri și fără lider | 1.200 m/s | ±0.050 m/s | 0.5 m/s | VALIDATED, 2 episoade, valoare 1.200, eroare 0.000 ≤ 0.5 |
| `overtake_speed_bonus` | depășiri reale, neconstrânse de trafic, comparate cu linia de croazieră a aceluiași episod | 2.000 m/s | ±0.200 m/s | 1.5 m/s | VALIDATED, 2 episoade, valoare 2.000, eroare 0.000 ≤ 1.5 |
| `cruise_accel_deadband` | pași de țintă observați care au ținut commit-ul anterior (limită inferioară) sau l-au mișcat (limită superioară) | 0.325 m/s | ±0.075 m/s | 0.4 m/s | VALIDATED, 2 episoade, valoare —, eroare — ≤ 0.1 |

Split explicit cu seed 168: 16 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `speed_delta_arterial` | arterial samples capped by a slow lead | UNOBSERVED | TRAFFIC_DOMINATED | TRAFFIC_CONSTRAINED×3 |
| `cruise_speed_variability` | cruise stretches shorter than 600 ticks | UNOBSERVED | NO_ELIGIBLE_EPISODES | SHORT_CRUISE_CYCLE×3 |
| `overtake_speed_bonus` | overtakes at the 167 traffic envelope | UNOBSERVED | TRAFFIC_DOMINATED | TRAFFIC_DOMINATED×2 |
| `cruise_accel_deadband` | every step stays inside the band | UNOBSERVED | DEADBAND_UPPER_BOUND_UNOBSERVED | — |
| `cruise_accel_deadband` | held and moved steps contradict | UNOBSERVED | CONTRADICTORY_STEP_BOUNDS | — |

## Constrângeri de grup

- `CRUISE_DISPERSION_SHARED` (cruise_speed_variability, cruise_accel_deadband): Variația de croazieră și deadband-ul acționează asupra aceleiași serii de viteză: dispersia de croazieră poate fi explicată fie de unda de ritm, fie de o bandă de toleranță care filtrează unda. Deadband-ul nu se estimează din dispersie, ci doar din pași de țintă observați; fără pași ținuți și pași mișcați, cheia rămâne neobservată.
- `OVERTAKE_ADVANTAGE_UNDER_LEAD` (overtake_speed_bonus): Avantajul de viteză la depășire este bonus numai când liderul nu plafonează viteza. Depășirile în care viteza atinge anvelopa de trafic 167 sunt excluse, deci un set format doar din astfel de manevre produce `TRAFFIC_DOMINATED`, nu un bonus.
- `ARTERIAL_DELTA_UNDER_LEAD` (speed_delta_arterial): Delta arterială este diferența de stil față de limita postată. Probele arteriale cu lider apropiat sunt plafonate de trafic și nu pot deveni preferință; ele sunt excluse înainte de estimare, la fel ca în estimatorul 094 pentru drumurile urbane.
- `TEMPO_FROM_ONE_TRAJECTORY` (speed_delta_arterial, cruise_speed_variability, overtake_speed_bonus, cruise_accel_deadband): Cele patru chei de tempo pot fi observate în aceeași călătorie, dar nu din aceleași fapte: arterialul cere probe arteriale libere, variabilitatea cere cicluri de croazieră, bonusul cere depășiri reale, iar deadband-ul cere pași de țintă. Un set care conține doar un tip de fapt lasă celelalte chei neobservate, în loc să le deducă din traiectoria comună.

## Intrări refuzate

- `manual-demo`: NOT_LEARNING_ELIGIBLE
- `duplicate-demo`: DUPLICATE_EPISODE

## Determinism

- Seed 168: `fnv1a32:60f0a4cf`.
- Rulare repetată: `fnv1a32:60f0a4cf`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `speed_delta_arterial` | -10–20 | 0 | m/s |
| `cruise_speed_variability` | 0–3 | 0.3 | m/s |
| `overtake_speed_bonus` | 0–10 | 2 | m/s |
| `cruise_accel_deadband` | 0.05–2 | 0.3 | m/s |

## Verificări

- PASS `context-arterial`: arterial-only estimate 4.075 m/s; cruise, overtake and deadband stay unobserved
- PASS `context-cruise`: cruise-only variability 1.200 m/s; deadband is not inferred from the same dispersion
- PASS `context-overtake`: overtake-only bonus 2.000 m/s
- PASS `context-deadband`: deadband 0.325 ± 0.075 m/s from held and moved steps only
- PASS `uncertainty-reported`: speed_delta_arterial 0.100 <= 1, cruise_speed_variability 0.050 <= 0.5, overtake_speed_bonus 0.200 <= 1.5, cruise_accel_deadband 0.075 <= 0.4
- PASS `uncertainty-threshold`: noisy arterial uncertainty 3.942 > 1 m/s keeps the key unobserved
- PASS `validation-split`: seed 168: continuous keys validate on held-out episodes; deadband validates on 2 held-out episodes
- PASS `validation-too-small`: three arterial episodes leave 1 held-out episode(s), reported as TOO_SMALL
- PASS `unobserved-arterial-traffic`: 3 arterial episodes excluded at the 167 traffic envelope
- PASS `unobserved-overtake-traffic`: 2 overtakes at the traffic envelope cannot prove a style bonus
- PASS `unobserved-short-cruise`: 3 cruise stretches shorter than one full 600-tick cycle are excluded
- PASS `unobserved-covering-deadband`: a band that holds every observed step has no upper bound
- PASS `unobserved-contradictory-deadband`: a held 0.5 m/s step and a moved 0.3 m/s step leave no admissible interval
- PASS `no-fabricated-values`: 5 unobserved demonstrations carry value null and an explicit reason
- PASS `group-constraints`: CRUISE_DISPERSION_SHARED, OVERTAKE_ADVANTAGE_UNDER_LEAD, ARTERIAL_DELTA_UNDER_LEAD, TEMPO_FROM_ONE_TRAJECTORY
- PASS `invalid-input-refused`: NaN speed refused; manual-demo:NOT_LEARNING_ELIGIBLE, duplicate-demo:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:60f0a4cf
- PASS `catalog-ranges`: speed_delta_arterial 4.075 m/s, cruise_speed_variability 1.200 m/s, overtake_speed_bonus 2.000 m/s, cruise_accel_deadband 0.325 m/s
- PASS `policy-compatibility`: 167 reads base 17.975 m/s, ceiling 17.975 m/s, deadband 0.325 m/s, commit 16.808 m/s

**Sumar: 19/19 verificări, 4 chei candidate, 5 demonstrații neobservate, PASS.**
