# 176 — învățare extinsă pentru stop și prioritate

Generat de `scripts/run-v2-stop-learning-report.mjs` din contractul `176-stop-priority-estimator-v1`.
Fiecare cheie se estimează numai din scenariul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `rolling_stop_speed` | `ROLLING_STOP` | o comandă `ROLL_THROUGH` reală a lui 051, în care 175 raportează viteza de traversare: o comandă neplafonată dă cheia exact, una plafonată dovedește doar `cheie > 2,5 m/s` | 1.2000 m/s | ±0.0500 m/s | 0.5 m/s | VALIDATED, 2 episoade, valoare 1.2000, eroare 0.0000 ≤ 0.5 |
| `priority_assertiveness` | `PRIORITY_CLAIM` | un refuz real 052 cu un separator cunoscut, în care 175 revendică sau cedează: revendicarea dă limita inferioară, cedarea dă limita superioară a asertivității | 0.3667 ratio | ±0.0333 ratio | 0.15 ratio | VALIDATED, 2 episoade, valoare 0.3667, eroare 0.0000 ≤ 0.15 |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | o eliberare 051 la un all-way stop unde subiectul nu este primul sosit: ținerea dă limita inferioară, trecerea dă limita superioară a răbdării | 4.0000 s | ±0.2000 s | 0.5 s | VALIDATED, 2 episoade, valoare 4.0000, eroare 0.0000 ≤ 0.5 |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | o oportunitate de intrare fără spațiu de ieșire declarat, fără veto, în care 175 a extras eșantionul determinist: acceptarea dă limita inferioară, așteptarea sub plafon dă limita superioară | 0.2804 probability | ±0.0912 probability | 0.15 probability | VALIDATED, 2 episoade, valoare 0.2804, eroare 0.0000 ≤ 0.15 |

Split explicit cu seed 176: 16 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- | --- |
| `rolling_stop_speed` | `ROLLING_STOP` | comenzi plafonate la 2,5 m/s: cheia peste plafon nu este identificabilă | UNOBSERVED | ROLLING_STOP_CAP_SATURATED | ROLLING_STOP_CAP_SATURATED×4 |
| `rolling_stop_speed` | `ROLLING_STOP` | viteze reale împrăștiate între 0,2 și 2,5 m/s | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `rolling_stop_speed` | `ROLLING_STOP` | demonstrații care pretind simultan ≤ 2,5 m/s și > 2,5 m/s | UNOBSERVED | ROLLING_STOP_CAP_INCONSISTENT | ROLLING_STOP_CAP_INCONSISTENT×1 |
| `rolling_stop_speed` | `ROLLING_STOP` | demonstrații MANUAL, neeligibile | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `priority_assertiveness` | `PRIORITY_CLAIM` | doar revendicări, fără limită superioară | UNOBSERVED | ASSERTIVENESS_UPPER_BOUND_UNOBSERVED | — |
| `priority_assertiveness` | `PRIORITY_CLAIM` | doar cedări, fără limită inferioară | UNOBSERVED | ASSERTIVENESS_LOWER_BOUND_UNOBSERVED | — |
| `priority_assertiveness` | `PRIORITY_CLAIM` | revendicare sub o cedare: limite incompatibile | UNOBSERVED | CONTRADICTORY_ASSERTIVENESS_BOUNDS | CONTRADICTORY_ASSERTIVENESS_BOUNDS×4 |
| `priority_assertiveness` | `PRIORITY_CLAIM` | limită reală, dar prea largă (0,07–0,60) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `priority_assertiveness` | `PRIORITY_CLAIM` | yield_time_gap la podeaua de 3 s: cheia este inertă | UNOBSERVED | ASSERTIVENESS_INERT_AT_FLOOR | ASSERTIVENESS_INERT_AT_FLOOR×4 |
| `priority_assertiveness` | `PRIORITY_CLAIM` | 052 a acordat prioritatea: nicio revendicare | UNOBSERVED | PRIORITY_NOT_REFUSED | PRIORITY_NOT_REFUSED×4 |
| `priority_assertiveness` | `PRIORITY_CLAIM` | refuz 052 fără separator raportat | UNOBSERVED | PRIORITY_SEPARATION_UNKNOWN | PRIORITY_SEPARATION_UNKNOWN×4 |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | doar eliberări, fără limită inferioară | UNOBSERVED | ALLWAY_LOWER_BOUND_UNOBSERVED | — |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | doar țineri, fără limită superioară | UNOBSERVED | ALLWAY_UPPER_BOUND_UNOBSERVED | — |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | ținere peste o eliberare: limite incompatibile | UNOBSERVED | CONTRADICTORY_ALLWAY_BOUNDS | CONTRADICTORY_ALLWAY_BOUNDS×4 |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | limită reală, dar prea largă (2–9 s) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | primul sosit la all-way stop: niciodată întârziat | UNOBSERVED | ALLWAY_FIRST_ARRIVAL | ALLWAY_FIRST_ARRIVAL×4 |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | apropiere 051 încă în STOP, fără eliberare | UNOBSERVED | ALLWAY_STOP_NOT_RELEASED | ALLWAY_STOP_NOT_RELEASED×4 |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | veto de intersecție blocată, fără eșantion | UNOBSERVED | BLOCKED_INTERSECTION_VETO | BLOCKED_INTERSECTION_VETO×4 |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | spațiu de ieșire declarat: eșantionul este ocolit | UNOBSERVED | EXIT_SPACE_DECLARED | EXIT_SPACE_DECLARED×4 |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | doar acceptări, fără limită superioară | UNOBSERVED | BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED | — |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | doar așteptări sub plafon, fără limită inferioară | UNOBSERVED | BLOCKED_ENTRY_LOWER_BOUND_UNOBSERVED | — |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | acceptare lângă plafonul de 0,5: cheia peste plafon nu se vede | UNOBSERVED | BLOCKED_ENTRY_CAP_SATURATED | — |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | acceptare sub o așteptare: limite incompatibile | UNOBSERVED | CONTRADICTORY_BLOCKED_ENTRY_BOUNDS | CONTRADICTORY_BLOCKED_ENTRY_BOUNDS×4 |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | limită reală, dar prea largă (0,02–0,49) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | set fără episoade | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |

## Constrângeri de grup

- `ROLLING_STOP_AND_STOP_INTENT_SHARED` (rolling_stop_speed): Viteza de rolling stop există numai în scenariul în care 051 a declarat `ROLL_THROUGH`: rolul opririi complete este decis de cheile M `stop_full_probability` și `stop_dwell_time`, deci un tick cu oprire completă sau cu apropiere nu spune nimic despre viteză. Schimbarea probabilității M mută proporția de oportunități care ajung la cheie, fără să o estimeze.
- `ROLLING_STOP_CAP_CEILING` (rolling_stop_speed): Plafonul explicit al politicii, `rollingStopMaximumMps = 2,5 m/s`, face ca orice valoare peste el să fie invizibilă: comanda raportează 2,5 m/s cu `rollingStopCapped`, adică doar limita inferioară `cheie > 2,5`. Intervalul catalogului merge până la 5 m/s, dar acea zonă nu este identificabilă din comportament, deci cheia rămâne neobservată în loc să primească plafonul ca valoare.
- `ASSERTIVENESS_AND_YIELD_GAP_SHARED` (priority_assertiveness): Asertivitatea este identificabilă numai din refuzul 052 cu separator cunoscut: cerința efectivă este `yield_time_gap − asertivitate · (yield_time_gap − 3 s)`. Un `yield_time_gap` deja sub podeaua de 3 s lasă cheia inertă — cerința rămâne pragul M — deci acolo nu se măsoară nimic, iar o prioritate acordată de 052 nu este o decizie de revendicare.
- `ALLWAY_PATIENCE_AFTER_M_DWELL` (allway_stop_patience): Răbdarea se numără de la momentul în care propria oprire 051 (`stop_dwell_time`) a fost satisfăcută și numai pentru un sosit care nu este primul: primul sosit pleacă fără întârziere, iar o apropiere ori o ținere 051 domină cheia. Un episod fără `RELEASE` nu oferă nicio latură a intervalului, iar durata M a opririi deplasează momentul din care se măsoară.
- `BLOCKED_ENTRY_VETO_SHADOWS_PROBABILITY` (blocked_intersection_entry_probability): Vetoul de intersecție blocată este absolut și este evaluat primul: comanda rămâne `STOP` fără eșantion, deci un astfel de tick nu spune nimic despre probabilitate. Un spațiu de ieșire declarat ocolește complet eșantionul, iar plafonul de 0,5 al politicii ascunde orice valoare peste el — cheia rămâne neobservată, nu plafonul.
- `STOP_PRIORITY_KEYS_FROM_ONE_APPROACH` (rolling_stop_speed, priority_assertiveness, allway_stop_patience, blocked_intersection_entry_probability): Cele patru chei pot apărea în aceeași călătorie, dar nu din același fapt: ordinea ramurilor 175 dă fiecărui tick un singur fapt — veto, intenție 051, rolling stop, all-way, refuz 052 sau eșantion de intrare. Un set cu un singur tip de demonstrație lasă celelalte trei chei neobservate.

## Intrări refuzate

- `rolling-1`: NOT_LEARNING_ELIGIBLE
- `rolling-2`: NOT_LEARNING_ELIGIBLE
- `rolling-3`: NOT_LEARNING_ELIGIBLE
- `rolling-4`: NOT_LEARNING_ELIGIBLE
- `rolling-1`: DUPLICATE_EPISODE

## Compatibilitate cu 175

- Rolling stop: **1.2000 m/s** → `ROLLING_STOP_AT_SPEED` (plafon aplicat: false).
- Asertivitate: cerință efectivă **4.9000 s**; 4.9 s revendicat (true), 4.8500000000000005 s cedat (true).
- Răbdare all-way: **3.9000 s** sub cheie → `ALLWAY_PATIENCE`; 4.1000 s → `ALLWAY_TURN`.
- Intrare blocată: eșantion 0.1893 → `BLOCKED_ENTRY_ACCEPTED` (true); eșantion 0.3716 → `BLOCKED_ENTRY_WAIT` (false).
- Versiune politică: `175-stop-priority-policy-v1`, candidat-only true, semantică schimbată false, plafon rolling 2.5 m/s, podea asertivitate 3 s, plafon intrare 0.5.

## Determinism

- Seed 176: `fnv1a32:cf5e99b7`.
- Rulare repetată: `fnv1a32:cf5e99b7`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `rolling_stop_speed` | 0.2–5 | 1 | m/s |
| `priority_assertiveness` | 0–1 | 0.3 | ratio |
| `allway_stop_patience` | 0–10 | 2 | s |
| `blocked_intersection_entry_probability` | 0–1 | 0 | probability |

## Verificări

- PASS `scenario-rolling`: rolling-only speed 1.2000 m/s; assertiveness, patience and entry stay unobserved
- PASS `scenario-priority`: refusal-only assertiveness 0.3667 ratio; the other three stay unobserved
- PASS `scenario-allway`: all-way-only patience 4.0000 s; the other three stay unobserved
- PASS `scenario-blocked`: entry-only probability 0.2804 between the draws 0.1893 and 0.3716
- PASS `zero-patience-observed`: a release at 0 s is a demonstrated patience of zero, not missing evidence
- PASS `uncertainty-reported`: rolling_stop_speed 0.0500 <= 0.5 m/s, priority_assertiveness 0.0333 <= 0.15 ratio, allway_stop_patience 0.2000 <= 0.5 s, blocked_intersection_entry_probability 0.0912 <= 0.15 probability
- PASS `uncertainty-rolling`: scattered speeds measure ±1.5112 m/s > 0.5 and stay unobserved
- PASS `uncertainty-assertiveness`: a 0.07–0.60 bound measures ±0.2667 > 0.15 and stays unobserved
- PASS `uncertainty-patience`: a 2–9 s bound measures ±3.5000 s and stays unobserved
- PASS `uncertainty-entry`: a wide draw interval measures ±0.2333 > 0.15 and stays unobserved
- PASS `validation-split`: seed 176: every key validates on held-out episodes (rolling_stop_speed 2+2, priority_assertiveness 2+2, allway_stop_patience 2+2, blocked_intersection_entry_probability 2+2)
- PASS `validation-too-small`: three episodes leave 1 held-out episode, reported as TOO_SMALL
- PASS `rolling-cap`: a capped command proves only `key > 2,5 m/s`, and a set that mixes both sides of the cap has no value
- PASS `assertiveness-floor`: below the 3 s floor the M threshold decides and nothing is measured; a single inequality is only a bound
- PASS `assertiveness-no-decision`: a granted priority and an unknown separation are not claim observations, and two incompatible bounds have no value
- PASS `patience-context`: the first arrival and a held 051 STOP never observe patience; one-sided demonstrations remain bounds
- PASS `entry-veto`: the veto decides before the draw and a declared exit bypasses it, so neither proves the probability
- PASS `entry-ceiling`: above the 0.5 cap the key is invisible, hard refusal and acceptance bounds can contradict, and a single side stays unobserved
- PASS `shared-channel-separation`: a rolling stop never supplies a claim, a refusal never supplies a crawl speed, and an entry draw never proves patience
- PASS `no-fabricated-values`: 25 unobserved demonstrations carry value null and an explicit reason
- PASS `group-constraints`: ROLLING_STOP_AND_STOP_INTENT_SHARED, ROLLING_STOP_CAP_CEILING, ASSERTIVENESS_AND_YIELD_GAP_SHARED, ALLWAY_PATIENCE_AFTER_M_DWELL, BLOCKED_ENTRY_VETO_SHADOWS_PROBABILITY, STOP_PRIORITY_KEYS_FROM_ONE_APPROACH
- PASS `invalid-input-refused`: NaN rolling speed refused; rolling-1:NOT_LEARNING_ELIGIBLE, rolling-2:NOT_LEARNING_ELIGIBLE, rolling-3:NOT_LEARNING_ELIGIBLE, rolling-4:NOT_LEARNING_ELIGIBLE, rolling-1:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:cf5e99b7
- PASS `catalog-ranges`: rolling_stop_speed 1.2000 m/s, priority_assertiveness 0.3667 ratio, allway_stop_patience 4.0000 s, blocked_intersection_entry_probability 0.2804 probability
- PASS `policy-compatibility`: 175 reads the estimate without a semantic change: crawl 1.2000 m/s, required gap 4.9000 s (4.9000 claimed / 4.8500 yielded), patience 4.0000 s held at 3.9000 s and turned at 4.1000 s, entry accepted at draw 0.1893 and waited at draw 0.3716

**Sumar: 25/25 verificări, 4 chei candidate, 25 demonstrații neobservate, PASS.**
