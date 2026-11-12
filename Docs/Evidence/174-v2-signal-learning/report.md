# 174 — învățare extinsă pentru semafoare

Generat de `scripts/run-v2-signal-learning-report.mjs` din contractul `174-signal-estimator-v2`.
Fiecare cheie se estimează numai din scenariul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `yellow_stop_probability` | `YELLOW_FEASIBILITY` | o apropiere de galben în mișcare, cu geometrie cunoscută, în care 173 a ajuns la eșantionul său de fezabilitate (nu era deja angajată), plus factorul M de conformitate al aceluiași tick | 0.8875 probability | ±0.0493 probability | 0.2 probability | VALIDATED, 2 episoade, valoare 0.7625, eroare 0.1250 ≤ 0.15 |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | o traversare de roșu propusă de 050, în care lumea a raportat un gap conflictual; acceptarea dă limita superioară, refuzul peste plasa de siguranță de 3 s dă limita inferioară | 4.5000 s | ±0.5000 s | 1 s | VALIDATED, 2 episoade, valoare 4.5000, eroare 0.0000 ≤ 1 |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | o apropiere de galben în care 173 a intrat fie angajat, fie eșantionat, deci timpul până la linie delimitează orizontul de angajare | 2.0500 s | ±0.1500 s | 0.6 s | VALIDATED, 4 episoade, valoare 2.0500, eroare 0.0000 ≤ 0.5 |
| `green_launch_acceleration` | `GREEN_LAUNCH` | o plecare de pe loc la verde, după expirarea ținerii M de la verde, în care 173 comandă accelerația de plecare | 1.5000 m/s² | ±0.0500 m/s² | 0.35 m/s² | VALIDATED, 2 episoade, valoare 1.5000, eroare 0.0000 ≤ 0.4 |

Split explicit cu seed 174: 16 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- | --- |
| `yellow_stop_probability` | `YELLOW_FEASIBILITY` | oportunități sub pragul de eșantioane | UNOBSERVED | YELLOW_TRIALS_BELOW_MINIMUM | YELLOW_TRIALS_BELOW_MINIMUM×2 |
| `yellow_stop_probability` | `YELLOW_FEASIBILITY` | opt rate de oprire reale, dar împrăștiate (0–1) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `yellow_stop_probability` | `YELLOW_FEASIBILITY` | demonstrații MANUAL, neeligibile | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | doar apropieri angajate, fără limită superioară | UNOBSERVED | COMMIT_UPPER_BOUND_UNOBSERVED | — |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | doar apropieri eșantionate, fără limită inferioară | UNOBSERVED | COMMIT_LOWER_BOUND_UNOBSERVED | — |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | limite reale, dar prea largi (0,4–4,0 s) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | două limite incompatibile în același episod | UNOBSERVED | CONTRADICTORY_COMMIT_BOUNDS | CONTRADICTORY_COMMIT_BOUNDS×4 |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | oprire M de frânare târzie, care precede orizontul | UNOBSERVED | COMMIT_PREEMPTED_BY_LATE_BRAKE | COMMIT_PREEMPTED_BY_LATE_BRAKE×4 |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | doar traversări acceptate, fără limită inferioară | UNOBSERVED | RED_RUN_LOWER_BOUND_UNOBSERVED | — |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | doar refuzuri peste plasa de siguranță | UNOBSERVED | RED_RUN_UPPER_BOUND_UNOBSERVED | — |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | toate refuzurile sub plasa de siguranță de 3 s | UNOBSERVED | RED_RUN_SAFETY_CAP | RED_RUN_SAFETY_CAP×4 |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | acceptare sub un refuz, imposibil de satisfăcut | UNOBSERVED | CONTRADICTORY_GAP_BOUNDS | CONTRADICTORY_GAP_BOUNDS×4 |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | limită reală, dar prea largă (3–8 s) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | gap conflictual necunoscut | UNOBSERVED | RED_RUN_GAP_UNKNOWN | RED_RUN_GAP_UNKNOWN×4 |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | 050 păstrează oprirea, nicio traversare propusă | UNOBSERVED | RED_RUN_NOT_PROPOSED | RED_RUN_NOT_PROPOSED×4 |
| `green_launch_acceleration` | `GREEN_LAUNCH` | ținerea M de la verde încă activă | UNOBSERVED | GREEN_LAUNCH_HELD_BY_DELAY | GREEN_LAUNCH_HELD_BY_DELAY×4 |
| `green_launch_acceleration` | `GREEN_LAUNCH` | eliberare din mișcare, nu plecare de pe loc | UNOBSERVED | GREEN_LAUNCH_NOT_FROM_STANDSTILL | GREEN_LAUNCH_NOT_FROM_STANDSTILL×4 |
| `green_launch_acceleration` | `GREEN_LAUNCH` | patru plecări reale, dar împrăștiate (0,3–6) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `yellow_stop_probability` | `YELLOW_FEASIBILITY` | set fără episoade | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |

## Constrângeri de grup

- `YELLOW_STOP_AND_RED_COMPLIANCE_SHARED` (yellow_stop_probability): Probabilitatea de galben și probabilitatea M de oprire la roșu împart aceeași decizie: 173 oprește cu probabilitatea efectivă `red_stop_probability · yellow_stop_probability`. Din comportament se vede numai produsul, deci factorul M observat este denominatorul onest al cheii; cu un factor M nul nicio oprire la galben nu este posibilă și cheia rămâne neobservată, în loc să fie dedusă dintr-un raport imposibil.
- `YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH` (yellow_stop_probability, yellow_commit_time): Probabilitatea de galben și orizontul de angajare împart aceeași apropiere: 173 verifică întâi orizontul, apoi eșantionează. O apropiere angajată dovedește doar o limită inferioară a orizontului și nu intră în numitorul opririlor, iar una eșantionată dă o limită superioară a orizontului și un singur eșantion de conformitate. Niciuna nu este dedusă din cealaltă.
- `RED_RUN_GAP_DEPENDS_ON_OBSERVED_GAP` (red_run_gap_acceptance): Gap-ul pe roșu este identificabil numai când lumea raportează un gap conflictual: un gap necunoscut refuză traversarea și nu dovedește nimic. Sub plasa de siguranță de 3 s a lui 173 cerința efectivă este plasa, nu cheia, deci un refuz acolo nu oferă limită inferioară; cheia se măsoară doar din decizii în care capul de siguranță nu a decis.
- `GREEN_LAUNCH_AFTER_START_DELAY` (green_launch_acceleration): Accelerația de plecare este identificabilă numai după ce ținerea M de la verde a expirat și vehiculul este încă oprit: cât timp 173 raportează `GREEN_START_DELAY`, comanda este ținerea, nu plecarea, iar un vehicul deja în mișcare raportează o eliberare, nu o plecare de pe loc.
- `SIGNAL_KEYS_FROM_ONE_APPROACH` (yellow_stop_probability, red_run_gap_acceptance, yellow_commit_time, green_launch_acceleration): Cele patru chei pot fi observate în aceeași călătorie, dar nu din aceleași fapte: probabilitatea de galben cere un eșantion de fezabilitate, orizontul cere o apropiere angajată sau eșantionată, gap-ul pe roșu cere o traversare propusă cu gap observat, iar plecarea cere un verde de pe loc după ținerea M. Un set cu un singur tip de fapt lasă celelalte chei neobservate.

## Intrări refuzate

- `yellow-feasibility-1`: NOT_LEARNING_ELIGIBLE
- `yellow-feasibility-2`: NOT_LEARNING_ELIGIBLE
- `yellow-feasibility-3`: NOT_LEARNING_ELIGIBLE
- `yellow-feasibility-4`: NOT_LEARNING_ELIGIBLE
- `yellow-feasibility-1`: DUPLICATE_EPISODE

## Compatibilitate cu 173

- Eșantion de galben sub probabilitate: 0.4563 → `YELLOW_STOP`; peste probabilitate: 0.9620 → `YELLOW_PROCEED`.
- Apropiere la 2.0000 s → `YELLOW_COMMIT`; apropiere la 2.1000 s → `YELLOW_STOP` (eșantionată).
- Gap pe roșu: cerință efectivă **4.5000 s**; 4.5 s acceptat (true), 4.4 s refuzat (false).
- Accelerație de plecare la verde: **1.5000 m/s²**.
- Versiune politică: `173-signal-policy-v2`, candidat-only true, semantică schimbată false, plasă de siguranță 3 s, plafon de plecare 6 m/s².

## Determinism

- Seed 174: `fnv1a32:adefc652`.
- Rulare repetată: `fnv1a32:adefc652`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `yellow_stop_probability` | 0–1 | 0.8 | probability |
| `red_run_gap_acceptance` | 0.1–8 | 2.5 | s |
| `yellow_commit_time` | 0.2–6 | 2 | s |
| `green_launch_acceleration` | 0.2–6 | 1.5 | m/s² |

## Verificări

- PASS `scenario-yellow`: yellow-only stop rate 0.8875 probability; engagement, red run and launch stay unobserved
- PASS `scenario-commit`: commitment-only horizon 2.0500 s; the other three stay unobserved
- PASS `scenario-red`: red-run-only gap 4.5000 s; the yellow keys and launch stay unobserved
- PASS `scenario-launch`: launch-only acceleration 1.5000 m/s²; the other three stay unobserved
- PASS `zero-stop-observed`: a demonstrated stop rate of zero is a real zero, not missing evidence
- PASS `uncertainty-reported`: yellow_stop_probability 0.0493 <= 0.2 probability, red_run_gap_acceptance 0.5000 <= 1 s, yellow_commit_time 0.1500 <= 0.6 s, green_launch_acceleration 0.0500 <= 0.35 m/s²
- PASS `uncertainty-yellow`: scattered stop rates measure 0.3020 > 0.2 and stay unobserved
- PASS `uncertainty-launch`: scattered launches measure 0.6504 m/s² > 0.35 and stay unobserved
- PASS `uncertainty-commit`: a 0.4–4.0 s bound measures ±1.8000 s and stays unobserved
- PASS `uncertainty-gap`: a 3–8 s bound measures ±2.5000 s and stays unobserved
- PASS `validation-split`: seed 174: every key validates on held-out episodes (yellow_stop_probability 2+2, red_run_gap_acceptance 2+2, yellow_commit_time 4+4, green_launch_acceleration 2+2)
- PASS `validation-too-small`: three episodes leave 1 held-out episode, reported as TOO_SMALL
- PASS `unobserved-safety-cap`: below the 3 s safety cap the cap decides, and a 050 stop proposes no crossing at all
- PASS `unobserved-unknown-gap`: an unknown conflict gap refuses the crossing and proves no key value
- PASS `unobserved-bounds`: a single inequality is a bound, two incompatible demonstrations have no value, and the M late brake precedes the horizon
- PASS `unobserved-green-launch`: the M start delay and a release from motion are not launch observations
- PASS `shared-channel-separation`: an engagement approach never supplies a compliance trial, and a red run never proves the yellow keys
- PASS `no-fabricated-values`: 19 unobserved demonstrations carry value null and an explicit reason
- PASS `group-constraints`: YELLOW_STOP_AND_RED_COMPLIANCE_SHARED, YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH, RED_RUN_GAP_DEPENDS_ON_OBSERVED_GAP, GREEN_LAUNCH_AFTER_START_DELAY, SIGNAL_KEYS_FROM_ONE_APPROACH
- PASS `invalid-input-refused`: NaN speed refused; yellow-feasibility-1:NOT_LEARNING_ELIGIBLE, yellow-feasibility-2:NOT_LEARNING_ELIGIBLE, yellow-feasibility-3:NOT_LEARNING_ELIGIBLE, yellow-feasibility-4:NOT_LEARNING_ELIGIBLE, yellow-feasibility-1:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:adefc652
- PASS `catalog-ranges`: yellow_stop_probability 0.8875 probability, red_run_gap_acceptance 4.5000 s, yellow_commit_time 2.0500 s, green_launch_acceleration 1.5000 m/s²
- PASS `policy-compatibility`: 173 reads the estimate without a semantic change: yellow samples 0.4563 → YELLOW_STOP and 0.9620 → YELLOW_PROCEED, engagement 2.0000 s → YELLOW_COMMIT, required red gap 4.5000 s (4.5 accepted / 4.4 rejected), launch 1.5000 m/s²

**Sumar: 23/23 verificări, 4 chei candidate, 19 demonstrații neobservate, PASS.**
