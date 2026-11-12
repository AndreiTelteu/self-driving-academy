# 167 — raport politică de viteză și ritm

Generat de `scripts/run-v2-speed-policy-report.mjs` din contractul `167-speed-policy-v1`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `speed_delta_arterial` | arterial 13.9 m/s posted, no lead vehicle, tempo keys neutral | -10 | 3.90 | 20 | 30.00 | 26.10 | m/s | arterial delta inert on URBAN: 10.90 m/s |
| `cruise_speed_variability` | urban target 10.9 m/s, posted 13.9 m/s, 600 ticks, deadband 0.05 m/s | 0.3 | 0.57 | 3 | 5.94 | 5.38 | m/s | peak-to-peak of the committed target; changes 22 vs 199, max 13.87 m/s |
| `overtake_speed_bonus` | urban target 10.9 m/s, overtaking an observed lead, tempo keys neutral | 0 | 10.90 | 2 | 12.90 | 2.00 | m/s | 10 m/s bonus saturates at 13.90 m/s; not overtaking keeps 10.90 m/s |
| `cruise_accel_deadband` | urban target 10.9 m/s, speed 9.6 m/s, previous commit 10.5 m/s | 0.05 | 10.90 | 2 | 10.50 | 0.40 | m/s | request ACCELERATE vs HOLD |

## Separarea de constrângerile traficului

| Constrângere | Scenariu | Cheie joasă | Rezultat | Cheie ridicată | Rezultat | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `traffic gap` | lead at 9 m/s, 8 m gap, maximum tempo keys vs minimal tempo keys | 0 | 10.50 | 10 | 10.50 | 0.00 | m/s | binding TRAFFIC |
| `traffic gap` | lead at 9 m/s, 3 m gap (inside the 5 m minimum), maximum tempo keys vs minimal | 0 | 0.00 | 10 | 0.00 | 0.00 | m/s | hard traffic constraint commands 0 m/s |
| `signal` | stop required, previous commit 12 m/s, deadband 2 m/s | 0 | 0.00 | 10 | 0.00 | 0.00 | m/s | binding SIGNAL, deadband cannot delay the stop |
| `curve` | 046 curve preference 8 m/s, maximum overtake bonus vs minimal tempo keys | 0 | 8.00 | 10 | 8.00 | 0.00 | m/s | binding CURVE |
| `legal ceiling` | urban target 10.9 m/s, posted 13.9 m/s, maximum overtake bonus vs minimal | 0 | 10.90 | 10 | 13.90 | 3.00 | m/s | binding STYLE_CEILING, posted 13.9 m/s |

## Compatibilitate cu cheile M

- Ținta 046 cu cheile 167 neutre: **10 m/s**.
- Ținta 046 cu cheile 167 active: **10 m/s**.
- Identice: **da**.
- Unități: `speed_delta_urban` m/s, `speed_delta_residential` m/s, `curve_lateral_accel` m/s², `intersection_approach_speed` m/s, `speed_delta_arterial` m/s, `cruise_speed_variability` m/s, `overtake_speed_bonus` m/s, `cruise_accel_deadband` m/s.

## Determinism

- Seed 7, 60 tick-uri: `fnv1a32:6a605666`.
- Rulare repetată: `fnv1a32:6a605666`.

## Verificări

- PASS `m-compat-target`: 046 target 10 m/s with R neutral and 10 m/s with R active; tempo-neutral commit 10 m/s
- PASS `key-arterial-effect`: 3.90 -> 30.00 m/s
- PASS `key-arterial-scope`: urban commit 10.90 m/s with arterial delta 20
- PASS `key-variability-effect`: peak-to-peak 0.57 vs 5.94 m/s
- PASS `key-variability-bounded`: maximum 13.87 m/s <= posted 13.9 m/s
- PASS `key-bonus-effect`: 10.90 -> 12.90 m/s
- PASS `key-bonus-overtake-only`: not overtaking commit 10.90 m/s
- PASS `key-bonus-legal-ceiling`: 10 m/s bonus commits 13.90 m/s against posted 13.9 m/s
- PASS `key-deadband-request`: ACCELERATE vs HOLD
- PASS `key-deadband-hold`: 10.90 vs 10.50 m/s
- PASS `separation-traffic`: maximum 10.50 m/s, minimal 10.50 m/s
- PASS `separation-gap-floor`: inside the 5 m minimum both variants commit 0 m/s
- PASS `separation-signal`: deadband 2 m/s still commits 0.00 m/s
- PASS `separation-curve`: curve cap holds 8.00 m/s
- PASS `catalog-ranges`: speed_delta_arterial -10-20 m/s, cruise_speed_variability 0-3 m/s, overtake_speed_bonus 0-10 m/s, cruise_accel_deadband 0.05-2 m/s
- PASS `determinism`: digest fnv1a32:6a605666

**Sumar: 16/16 verificări, PASS.**
