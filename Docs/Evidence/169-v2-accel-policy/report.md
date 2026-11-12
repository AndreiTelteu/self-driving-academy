# 169 — raport politică de accelerație și frânare

Generat de `scripts/run-v2-accel-policy-report.mjs` din contractul `169-accel-policy-v1`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `braking_jerk` | 047 braking demand 2 m/s² (brake 0.25), from rest of actuation, 8 ticks | 0.2 | 0.027 | 20 | 2.000 | 1.973 | m/s² | deceleration after 8 ticks; both start braking on tick 1, the 20 m/s³ ramp settles at 2.00 m/s² |
| `throttle_release_delay` | lift from 1.5 m/s² and 0.4 throttle at 8 m/s, first release tick | 0 | 0.000 | 3 | 0.400 | 0.400 | ratio | held throttle ticks 0 vs 180 at 60 Hz |
| `launch_intensity` | launch at 0.5 m/s with a 047 request of 1.5 m/s² and 0.4 throttle | 0 | 0.525 | 1 | 1.500 | 0.975 | m/s² | throttle 0.140 vs 0.400; above 2 m/s the key is inert |
| `coasting_bias` | mild 0.4 m/s² request (0.12 throttle) at 8 m/s, one tick | 0 | 0.400 | 1 | 0.000 | 0.400 | m/s² | throttle 0.12 vs 0.00, no brake in either case |

## Separarea cheilor (fiecare cheie inertă în scenariile celorlalte)

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `launch_intensity in braking scene` | braking demand 2 m/s², 8 ticks, launch_intensity 0 vs 1 | 0 | 2.000 | 1 | 2.000 | 0.000 | m/s² | launch is not a braking channel |
| `coasting_bias in launch scene` | launch at 0.5 m/s, coasting_bias 0 vs 1 | 0 | 1.500 | 1 | 1.500 | 0.000 | m/s² | coasting only applies above the 2 m/s launch speed |
| `throttle_release_delay in coasting scene` | mild 0.4 m/s² request at 8 m/s, delay 0 vs 3 s | 0 | 0.400 | 3 | 0.400 | 0.000 | m/s² | the delay only reacts to a request that fell to zero |
| `braking_jerk in launch scene` | launch at 0.5 m/s, braking_jerk 0.2 vs 20 m/s³ | 0.2 | 1.500 | 20 | 1.500 | 0.000 | m/s² | braking jerk is not a launch channel |
| `braking_jerk in lift scene` | lift at 8 m/s, braking_jerk 0.2 vs 20 m/s³ | 0.2 | 0.000 | 20 | 0.000 | 0.000 | ratio | the lift throttle is decided by the release delay alone |
| `coasting_bias in lift scene` | lift at 8 m/s, coasting_bias 0 vs 1 | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | coasting needs a positive mild request, not an already lifted one |

## Siguranță: limitele 047 rămân dominante

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `stop required` | launch request 1.5 m/s² with every style key at maximum, stop required | 0 | 0.400 | 1 | 0.000 | -0.400 | ratio | safety veto true, committed 0.00 m/s² |
| `lead gap 3 m` | launch request 1.5 m/s² with every style key at maximum, lead at 3 m | 0 | 0.400 | 1 | 0.000 | -0.400 | ratio | safety veto true, the 5 m floor wins |
| `braking demand` | braking request 2 m/s² with release delay 3 s and stop required | 0 | 0.000 | 1 | 0.042 | 0.042 | ratio | throttle held false, brake applied on the onset tick |
| `maximum braking` | maximum braking_jerk 20 m/s³, 30 ticks of demand 2 m/s² | 0 | 0.000 | 20 | 2.000 | 2.000 | m/s² | never above comfort_deceleration 2 m/s²; the demand bounds the ramp |
| `maximum launch` | maximum launch_intensity 1, 047 request 1.5 m/s² | 0 | 0.000 | 1 | 1.500 | 1.500 | m/s² | equals desired_acceleration 1.5 m/s² and never exceeds it |
| `strong request` | maximum coasting_bias 1 with a 1.2 m/s² request (above the 0.6 threshold) | 0 | 0.000 | 1 | 1.200 | 1.200 | m/s² | a strong request is not released to coasting |

## Compatibilitate cu cheile M

- Cereri 047 identice cu cheile R neutre vs active: **100/100 tick-uri**.
- Primul tick de frânare 047: **73** (nemodificat de stratul 169).
- Rampa neutră se stabilizează la **-2.00 m/s²** și brake **0.25**.
- Unități M: `desired_acceleration` m/s², `comfort_deceleration` m/s², `acceleration_jerk` m/s³, `brake_reaction_delay` s.
- Unități R: `braking_jerk` m/s³, `throttle_release_delay` s, `launch_intensity` ratio, `coasting_bias` ratio.

## Determinism

- 60 tick-uri: `fnv1a32:912eb553`.
- Rulare repetată: `fnv1a32:912eb553`.

## Verificări

- PASS `key-braking-jerk-effect`: 0.027 -> 2.000 m/s² after 8 ticks
- PASS `key-braking-jerk-bounded`: maximum 20 m/s³ never exceeds the 2 m/s² demand
- PASS `key-release-delay-effect`: held throttle ticks 0 vs 180
- PASS `key-release-delay-cancelled`: brake 0.04 on the onset tick, no hold
- PASS `key-launch-effect`: 0.525 -> 1.500 m/s²
- PASS `key-launch-bounded`: full launch equals desired_acceleration 1.5 m/s²
- PASS `key-coasting-effect`: throttle 0.12 -> 0
- PASS `key-coasting-strong-request`: a 1.2 m/s² request is not released by coasting_bias 1
- PASS `separation-braking`: launch and coasting do not change the braking scene
- PASS `separation-launch`: coasting and braking jerk do not change the launch scene
- PASS `separation-coasting`: the release delay does not change the coasting scene
- PASS `separation-lift`: braking jerk and coasting do not change the lift scene
- PASS `safety-stop`: committed 0.00 m/s² with every style key at maximum
- PASS `safety-gap-floor`: a lead inside 5 m vetoes throttle
- PASS `safety-braking-wins`: braking wins over the release delay and over stop required
- PASS `m-requests-identical`: 100/100 request ticks identical with R neutral vs R active
- PASS `m-braking-settles`: neutral ramp settles at -2.00 m/s² / brake 0.25
- PASS `catalog-ranges`: braking_jerk 0.2-20 m/s³, throttle_release_delay 0-3 s, launch_intensity 0-1 ratio, coasting_bias 0-1 ratio
- PASS `determinism`: digest fnv1a32:912eb553

**Sumar: 19/19 verificări, PASS.**
