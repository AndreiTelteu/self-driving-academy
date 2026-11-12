# 170 â€” Ã®nvÄƒÈ›are pentru acceleraÈ›ie È™i frÃ¢nare

Generat de `scripts/run-v2-accel-learning-report.mjs` din contractul `170-accel-estimator-v1`.
Fiecare cheie se estimeazÄƒ numai din faptul ei eligibil; o cheie fÄƒrÄƒ dovezi suficiente rÄƒmÃ¢ne `UNOBSERVED`, nu primeÈ™te o valoare inventatÄƒ.

## Cheie â†’ context â†’ estimare â†’ incertitudine â†’ validare independentÄƒ

| Cheie | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `braking_jerk` | frânări reale cerute de 047, măsurate ca panta decelerației commitate după onset, cu cererea de decelerație constantă și rampa complet observată sub ea | 3.0000 m/s³ | Â±0.0500 m/s³ | 1.5 m/s³ | VALIDATED, 2 episoade, valoare 3.0000, eroare 0.0000 â‰¤ 1.5 |
| `throttle_release_delay` | ridicări reale de throttle (cerere 047 căzută la zero, fără cerere de frânare), măsurate ca numărul de tick-uri în care accelerația și throttle-ul anterior sunt menținute | 0.2000 s | Â±0.0020 s | 0.25 s | VALIDATED, 2 episoade, valoare 0.2000, eroare 0.0000 â‰¤ 0.1 |
| `launch_intensity` | plecări reale sub 2 m/s, măsurate ca raportul dintre accelerația aplicată și cererea 047, între fracțiunea minimă a politicii 169 și cererea integrală | 0.6000 ratio | Â±0.0657 ratio | 0.1 ratio | VALIDATED, 2 episoade, valoare 0.6000, eroare 0.0000 â‰¤ 0.06 |
| `coasting_bias` | coasting real peste 2 m/s, măsurat ca eliberarea unei cereri pozitive mici (≤ 0,6 m/s²) între cererea integrală și rularea liberă | 0.4000 ratio | Â±0.0657 ratio | 0.1 ratio | VALIDATED, 2 episoade, valoare 0.4000, eroare 0.0000 â‰¤ 0.06 |

Split explicit cu seed 170: 16 episoade admise, fÄƒrÄƒ suprapunere Ã®ntre estimare È™i validare.

## Cazuri fÄƒrÄƒ dovezi identificabile

| Cheie | Scenariu | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `braking_jerk` | rampa de frÃ¢nare este tÄƒiatÄƒ Ã®nainte de cererea 047 | UNOBSERVED | BRAKING_RAMP_CENSORED | BRAKING_RAMP_CENSOREDÃ—4 |
| `braking_jerk` | cererea 047 este atinsÄƒ Ã®n primul tick de frÃ¢nare | UNOBSERVED | BRAKING_RAMP_NOT_OBSERVED | BRAKING_RAMP_NOT_OBSERVEDÃ—4 |
| `braking_jerk` | cererea 047 se schimbÄƒ Ã®n timpul rampei | UNOBSERVED | BRAKING_DEMAND_CHANGED | BRAKING_DEMAND_CHANGEDÃ—4 |
| `braking_jerk` | patru rampe reale, dar Ã®mprÄƒÈ™tiate (2, 8, 14, 20 m/sÂ³) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | â€” |
| `throttle_release_delay` | fereastra de dovezi taie È›inerea | UNOBSERVED | RELEASE_HOLD_CENSORED | RELEASE_HOLD_CENSOREDÃ—4 |
| `throttle_release_delay` | frÃ¢narea anuleazÄƒ ridicarea | UNOBSERVED | RELEASE_CANCELLED_BY_BRAKING | RELEASE_CANCELLED_BY_BRAKINGÃ—4 |
| `throttle_release_delay` | oprire cerutÄƒ pe toatÄƒ ridicarea | UNOBSERVED | SAFETY_CONSTRAINED | SAFETY_CONSTRAINEDÃ—4 |
| `launch_intensity` | cerere puternicÄƒ constantÄƒ, fÄƒrÄƒ plecare | UNOBSERVED | NO_LAUNCH_EVENT | NO_LAUNCH_EVENTÃ—4 |
| `launch_intensity` | raport aplicat/cerut peste anvelopa 169 | UNOBSERVED | LAUNCH_FACTOR_OUT_OF_ENVELOPE | LAUNCH_FACTOR_OUT_OF_ENVELOPEÃ—4 |
| `coasting_bias` | doar cereri puternice (1,2 m/sÂ²) | UNOBSERVED | STRONG_REQUEST | STRONG_REQUESTÃ—4 |
| `coasting_bias` | raport aplicat/cerut peste anvelopa 169 | UNOBSERVED | COASTING_FACTOR_OUT_OF_ENVELOPE | COASTING_FACTOR_OUT_OF_ENVELOPEÃ—4 |
| `coasting_bias` | oprire cerutÄƒ pe toatÄƒ rularea | UNOBSERVED | SAFETY_CONSTRAINED | SAFETY_CONSTRAINEDÃ—4 |

## ConstrÃ¢ngeri de grup

- `BRAKING_AND_RELEASE_SHARED_TRANSITION` (braking_jerk, throttle_release_delay): Jerk-ul de frânare și întârzierea de ridicare împart aceeași tranziție de pedală: o cerere de frânare anulează imediat ținerea de throttle, deci aceleași tick-uri nu pot dovedi ambele chei. O ridicare urmată de frânare dă cel mult una dintre valori, iar un episod care conține ambele fapte separat le estimează pe rând, din intervale disjuncte.
- `LAUNCH_AND_COAST_SHARED_REQUEST` (launch_intensity, coasting_bias): Plecarea și coasting-ul citesc același raport dintre accelerația aplicată și cererea 047; numai pragul de 2 m/s al politicii 169 le separă. Un segment care rămâne sub 2 m/s nu poate dovedi coasting-ul, iar unul care rulează doar peste 2 m/s nu poate dovedi plecarea, deci niciuna dintre chei nu se deduce din cealaltă.
- `JERK_ABOVE_DEMAND_RAMP` (braking_jerk): Rampa de frânare este plafonată de cererea 047: dacă decelerația atinge cererea în primul tick observat, jerk-ul rămâne doar o limită inferioară, nu o valoare. Rampa trunchiată sau cu cerere schimbată la mijloc lasă cheia neobservată în loc să producă o pantă inventată.
- `VETO_SPLITS_BRAKING_FROM_THROTTLE` (braking_jerk, throttle_release_delay, launch_intensity, coasting_bias): Veto-ul dur al politicii 169 (oprire cerută sau lider în interiorul a 5 m) anulează throttle-ul, ținerea, plecarea și coasting-ul, dar nu frânarea: o cerere de frânare este aplicată de la primul tick. Același segment constrâns poate deci dovedi `braking_jerk` și nu poate dovedi niciodată celelalte trei chei.

## IntrÄƒri refuzate

- `manual-demo`: NOT_LEARNING_ELIGIBLE
- `duplicate-demo`: DUPLICATE_EPISODE

## Compatibilitate cu 169

- Factor de plecare citit de politicÄƒ: **0.7400** (așteptat 0.7400).
- Factor de coasting citit de politicÄƒ: **0.6000** (așteptat 0.6000).
- Tick-uri de throttle È›inute de politicÄƒ: **12** (așteptat 12).
- Tick-uri pÃ¢nÄƒ la cererea de frÃ¢nare: **40** (așteptat 40); commit-ul la tick-ul 5 este -0.2500 m/sÂ².
- Versiune politicÄƒ: `169-accel-policy-v1`, candidat-only true, semanticÄƒ schimbatÄƒ false.

## Determinism

- Seed 170: `fnv1a32:eaa7cad7`.
- Rulare repetatÄƒ: `fnv1a32:eaa7cad7`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `braking_jerk` | 0.2â€“20 | 3 | m/s³ |
| `throttle_release_delay` | 0â€“3 | 0.2 | s |
| `launch_intensity` | 0â€“1 | 0.6 | ratio |
| `coasting_bias` | 0â€“1 | 0.4 | ratio |

## VerificÄƒri

- PASS `context-braking`: braking-only jerk 3.0000 m/sÂ³; release, launch and coasting stay unobserved
- PASS `context-release`: release-only delay 0.2000 s; braking, launch and coasting stay unobserved
- PASS `context-launch`: launch-only intensity 0.6000; coasting is not read from the launch ratio
- PASS `context-coasting`: coasting-only bias 0.4000; launch is not read from the coasting ratio
- PASS `uncertainty-reported`: braking_jerk 0.0500 <= 1.5 m/s³, throttle_release_delay 0.0020 <= 0.25 s, launch_intensity 0.0657 <= 0.1 ratio, coasting_bias 0.0657 <= 0.1 ratio
- PASS `uncertainty-threshold`: noisy braking uncertainty 3.9423 > 1.5 m/sÂ³ keeps the key unobserved
- PASS `validation-split`: seed 170: every key validates on held-out episodes (braking_jerk 2+2, throttle_release_delay 2+2, launch_intensity 2+2, coasting_bias 2+2)
- PASS `validation-too-small`: three braking episodes leave 1 held-out episode(s), reported as TOO_SMALL
- PASS `unobserved-steady-request`: a steady 1,5 m/sÂ² request proves none of the four facts
- PASS `unobserved-braking-ramp`: a cut ramp, a ramp hidden by its own demand and a moving demand all stay unobserved
- PASS `unobserved-release`: a cut hold, a hold cancelled by braking and a vetoed hold are excluded, not measured
- PASS `unobserved-coasting`: strong requests are not coasting and a ratio above one is outside the 169 envelope
- PASS `unobserved-launch-envelope`: a launch ratio above the 047 request is outside the 169 envelope
- PASS `shared-transition-separation`: the same lift-then-brake transition proves jerk and cannot prove the hold
- PASS `veto-separation`: the 5 m floor zeroes throttle, hold, launch and coasting, never the braking ramp
- PASS `no-fabricated-values`: 12 unobserved demonstrations carry value null and an explicit reason
- PASS `group-constraints`: BRAKING_AND_RELEASE_SHARED_TRANSITION, LAUNCH_AND_COAST_SHARED_REQUEST, JERK_ABOVE_DEMAND_RAMP, VETO_SPLITS_BRAKING_FROM_THROTTLE
- PASS `invalid-input-refused`: NaN speed refused; manual-demo:NOT_LEARNING_ELIGIBLE, duplicate-demo:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:eaa7cad7
- PASS `catalog-ranges`: braking_jerk 3.0000 m/s³, throttle_release_delay 0.2000 s, launch_intensity 0.6000 ratio, coasting_bias 0.4000 ratio
- PASS `policy-compatibility`: 169 reads launch factor 0.7400, coasting factor 0.6000, 12 held throttle ticks, braking demand reached after 40 ticks (expected 40)

**Sumar: 21/21 verificÄƒri, 4 chei candidate, 12 demonstraÈ›ii neobservate, PASS.**
