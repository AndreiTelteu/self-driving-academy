# 178 — învățare extinsă pentru schimbare de bandă și depășire

Generat de `scripts/run-v2-lane-learning-report.mjs` din contractul `178-lane-estimator-v2`.
Fiecare cheie se estimează numai din scenariul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `lane_change_duration` | `MANOEUVRE_DURATION` | o manevră reală a lui 177 în care progresul lateral este observat: tick-urile efective `D` inversează plafonul `ceil(max(cheie, 1 s) · 60)`, deci cheia se află în `((D − 1)/60, D/60]`; podeaua de 1 s face `D = 60` ambiguu pentru tot intervalul 0,5–1 s | 1.9917 s | ±0.0500 s | 0.5 s | VALIDATED, 2 episoade, valoare 1.9917, eroare 0.0000 ≤ 0.5 |
| `signal_lead_time` | `SIGNAL_LEAD` | o manevră semnalizată care a pornit efectiv: numărul de tick-uri dintre pornirea indicatorului și prima mișcare laterală inversează același plafon; fără indicator nu există avans de măsurat | 1.9917 s | ±0.0500 s | 0.5 s | VALIDATED, 2 episoade, valoare 1.9917, eroare 0.0000 ≤ 0.5 |
| `signal_use_probability` | `INDICATOR_USE` | oportunități distincte care au ajuns la decizia indicatorului: numitorul este numărul de oportunități, nu numărul de cadre, iar numărătorul este oportunitățile cu indicatorul pornit | 0.3846 probability | ±0.0954 probability | 0.15 probability | VALIDATED, 8 episoade, valoare 0.4231, eroare 0.0385 ≤ 0.15 |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | o oportunitate de depășire prin dreapta în care harta permite manevra și spațiul declarat acoperă pragul M, deci 177 a extras eșantionul: acceptarea dă limita inferioară, refuzul dă limita superioară | 0.3377 probability | ±0.0880 probability | 0.15 probability | VALIDATED, 2 episoade, valoare 0.3377, eroare 0.0000 ≤ 0.15 |

Split explicit cu seed 178: 16 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- | --- |
| `lane_change_duration` | `MANOEUVRE_DURATION` | manevre care ating podeaua de 1 s (chei 0,5–1 s): banda nu este identificabilă | UNOBSERVED | DURATION_FLOOR_SATURATED | — |
| `lane_change_duration` | `MANOEUVRE_DURATION` | manevre care pretind simultan podeaua și o durată exactă | UNOBSERVED | DURATION_FLOOR_INCONSISTENT | DURATION_FLOOR_INCONSISTENT×1 |
| `lane_change_duration` | `MANOEUVRE_DURATION` | durate reale împrăștiate între 1,5 și 4,5 s | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `lane_change_duration` | `MANOEUVRE_DURATION` | demonstrații MANUAL, neeligibile | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `signal_lead_time` | `SIGNAL_LEAD` | manevre fără indicator: avansul nu există | UNOBSERVED | SIGNAL_LEAD_WITHOUT_INDICATOR | SIGNAL_LEAD_WITHOUT_INDICATOR×4 |
| `signal_lead_time` | `SIGNAL_LEAD` | manevre semnalizate a căror mișcare nu a pornit: avans cenzat | UNOBSERVED | SIGNAL_LEAD_CENSORED | SIGNAL_LEAD_CENSORED×4 |
| `signal_lead_time` | `SIGNAL_LEAD` | avansuri reale împrăștiate între 1,5 și 4,5 s | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `signal_use_probability` | `INDICATOR_USE` | episoade contradictorii, fără indicator în unele și mereu în altele | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `signal_use_probability` | `INDICATOR_USE` | prea puține oportunități distincte pentru o rată | UNOBSERVED | INDICATOR_TRIALS_BELOW_MINIMUM | — |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | hartă care interzice, nu declară sau nu acoperă spațiul: niciun eșantion extras | UNOBSERVED | RIGHT_PASS_PRECONDITION | RIGHT_PASS_PRECONDITION×4 |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | doar acceptări, fără limită superioară | UNOBSERVED | RIGHT_PASS_UPPER_BOUND_UNOBSERVED | — |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | doar refuzuri, fără limită inferioară | UNOBSERVED | RIGHT_PASS_LOWER_BOUND_UNOBSERVED | — |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | acceptare peste un refuz: limite incompatibile | UNOBSERVED | CONTRADICTORY_RIGHT_PASS_BOUNDS | CONTRADICTORY_RIGHT_PASS_BOUNDS×4 |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | limită reală, dar prea largă (0,05–0,47) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | set fără episoade | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |

## Constrângeri de grup

- `DURATION_FLOOR_HIDES_SUB_SECOND` (lane_change_duration): Podeaua explicită a politicii, `minimumManoeuvreDurationS = 1 s`, face ca orice cheie din intervalul 0,5–1 s al catalogului să producă aceleași 60 de tick-uri: `D = 60` dovedește doar `cheie ≤ 1 s`, deci acea bandă nu este identificabilă din comportament și cheia rămâne neobservată în loc să primească podeaua ca valoare.
- `MANOEUVRE_TIMELINE_SHARED` (lane_change_duration, signal_lead_time): Cele două durate sunt segmente ale aceleiași cronologii de tick-uri: avansul de semnalizare precede prima mișcare, iar durata numără tick-urile de după ea. O fereastră trunchiată înainte de pornire cenzează avansul, iar una tăiată în timpul mișcării cenzează durata; aceeași manevră nu poate furniza două valori independente din același tick.
- `SIGNAL_LEAD_DEPENDS_ON_INDICATOR` (signal_lead_time, signal_use_probability): Avansul există prin definiție numai când indicatorul este folosit: fără indicator manevra pornește în tick-ul validării, deci nu există interval de măsurat. Cele două chei împart aceeași oportunitate — un eșantion `signal-use` decide indicatorul, iar avansul se numără numai după el — dar niciuna nu se deduce din cealaltă.
- `RIGHT_PASS_REFUSAL_PRECEDES_SAMPLE` (pass_on_right_probability): Declarația de siguranță a lumii precede eșantionul: o depășire prin dreapta interzisă, o permisiune `UNKNOWN` sau un spațiu declarat sub `lane_change_front_gap` refuză manevra înainte de orice extragere. Un astfel de tick nu spune nimic despre probabilitate, iar plafonul de spațiu al lui 053 mută proporția de oportunități care ajung la cheie.
- `LANE_KEYS_FROM_ONE_MANOEUVRE` (lane_change_duration, signal_lead_time, signal_use_probability, pass_on_right_probability): Cele patru chei pot apărea în aceeași călătorie, dar nu din același fapt: ordinea ramurilor 177 dă fiecărui tick un singur fapt — refuz 053, refuz de permisiune ori spațiu, eșantion de depășire prin dreapta, eșantion de indicator, avans de semnalizare sau progres lateral. Un set cu un singur tip de demonstrație lasă celelalte trei chei neobservate.

## Intrări refuzate

- `duration-1`: NOT_LEARNING_ELIGIBLE
- `duration-2`: NOT_LEARNING_ELIGIBLE
- `duration-3`: NOT_LEARNING_ELIGIBLE
- `duration-4`: NOT_LEARNING_ELIGIBLE
- `duration-1`: DUPLICATE_EPISODE

## Compatibilitate cu 177

- Durată: **120 tick-uri** de mișcare laterală, progres 0.2500 după 30 de tick-uri (`CHANGE_WITHOUT_SIGNAL`); podeaua de 1 s dă 60 tick-uri, iar plafonul de 5 s dă 300.
- Avans: **120 tick-uri** între indicator și prima mișcare (`SIGNAL_LEAD` → `SIGNAL_LEAD_COMPLETE`), cu progres lateral 0.0000 la pornire.
- Indicator: cheia 0.3846 → eșantion 0.3248 pornește indicatorul, eșantion 0.5529 nu pornește indicatorul.
- Depășire prin dreapta: eșantion 0.2498 → `CHANGE_WITHOUT_SIGNAL` (true); eșantion 0.4257 → `RIGHT_OVERTAKE_REFUSED` (false).
- Versiune politică: `177-lane-policy-v2`, candidat-only true, semantică schimbată false, rată de tick 60 Hz, podea de manevră 1 s.

## Determinism

- Seed 178: `fnv1a32:61224c01`.
- Rulare repetată: `fnv1a32:61224c01`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `lane_change_duration` | 0.5–5 | 2 | s |
| `signal_lead_time` | 0–5 | 1 | s |
| `signal_use_probability` | 0–1 | 1 | probability |
| `pass_on_right_probability` | 0–1 | 0 | probability |

## Verificări

- PASS `scenario-duration`: duration-only duration 1.9917 s; lead, indicator and right pass stay unobserved
- PASS `scenario-lead`: lead-only lead 1.9917 s; duration, indicator and right pass stay unobserved
- PASS `scenario-indicator`: indicator-only probability 0.4000 over distinct opportunities; duration and right pass stay unobserved
- PASS `scenario-right-pass`: right-pass-only probability 0.3377 between the draws 0.2498 and 0.4257
- PASS `zero-lead-observed`: signalling that starts the movement in the same tick is a demonstrated lead of 0 s, not missing evidence
- PASS `zero-indicator-observed`: forty opportunities without a single indicator are a demonstrated zero probability
- PASS `uncertainty-reported`: lane_change_duration 0.0500 <= 0.5 s, signal_lead_time 0.0500 <= 0.5 s, signal_use_probability 0.0954 <= 0.15 probability, pass_on_right_probability 0.0880 <= 0.15 probability
- PASS `uncertainty-duration`: scattered durations measure ±0.6570 s > 0.5 and stay unobserved
- PASS `uncertainty-lead`: scattered leads measure ±0.6570 s > 0.5 and stay unobserved
- PASS `uncertainty-indicator`: never-versus-always indicator episodes measure ±0.6570 > 0.15 and stay unobserved
- PASS `uncertainty-right-pass`: a 0.05–0.47 bound measures ±0.2088 > 0.15 and stays unobserved
- PASS `validation-split`: seed 178: every key validates on held-out episodes (lane_change_duration 2+2, signal_lead_time 3+2, signal_use_probability 8+8, pass_on_right_probability 2+2)
- PASS `validation-too-small`: three episodes leave 1 held-out episode, reported as TOO_SMALL
- PASS `duration-floor`: the explicit one-second floor makes every key in 0.5–1 s produce the same 60 ticks, so that band stays unobserved and a set that mixes the floor with an exact duration has no value
- PASS `lead-requires-indicator`: without the indicator there is no lead, a signalled manoeuvre whose movement never started is only a censored wait, and only a started signalled manoeuvre measures the key
- PASS `right-pass-precondition`: a forbidden, undeclared or too-tight right lane refuses the manoeuvre before the draw, so it says nothing about the probability
- PASS `right-pass-bounds`: a grant is only a lower bound, a refusal only an upper bound, and a grant above a refusal has no intersection
- PASS `indicator-trials`: the rate rests on 26 distinct opportunities, not on frames
- PASS `no-fabricated-values`: 15 unobserved demonstrations carry value null and an explicit reason
- PASS `group-constraints`: DURATION_FLOOR_HIDES_SUB_SECOND, MANOEUVRE_TIMELINE_SHARED, SIGNAL_LEAD_DEPENDS_ON_INDICATOR, RIGHT_PASS_REFUSAL_PRECEDES_SAMPLE, LANE_KEYS_FROM_ONE_MANOEUVRE
- PASS `invalid-input-refused`: NaN lateral progress refused; duration-1:NOT_LEARNING_ELIGIBLE, duration-2:NOT_LEARNING_ELIGIBLE, duration-3:NOT_LEARNING_ELIGIBLE, duration-4:NOT_LEARNING_ELIGIBLE, duration-1:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:61224c01
- PASS `catalog-ranges`: lane_change_duration 1.9917 s, signal_lead_time 1.9917 s, signal_use_probability 0.3846 probability, pass_on_right_probability 0.3377 probability
- PASS `policy-compatibility`: 177 reads the estimate without a semantic change: 120 ticks of lateral movement at 0.2500 after 30 ticks, 120 lead ticks, indicator on at draw 0.3248 and off at 0.5529, right pass granted at draw 0.2498 and refused at 0.4257

**Sumar: 24/24 verificări, 4 chei candidate, 15 demonstrații neobservate, PASS.**
