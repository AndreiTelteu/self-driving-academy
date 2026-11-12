# 172 — învățare extinsă pentru urmărire și distanțe

Generat de `scripts/run-v2-follow-learning-report.mjs` din contractul `172-follow-estimator-v1`.
Fiecare cheie se estimează numai din episodul ei eligibil; o cheie fără dovezi suficiente rămâne `UNOBSERVED`, nu primește o valoare inventată.

## Cheie → episod → context → estimare → incertitudine → validare independentă

| Cheie | Episod | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `cutin_brake_response` | `CUT_IN` | un cut-in real declarat de observație, în care 048 cere o reducere sub angajamentul anterior, măsurat ca fracțiunea din diferență aplicată imediat de 171 | 0.7000 ratio | ±0.0200 ratio | 0.15 ratio | VALIDATED, 2 episoade, valoare 0.7000, eroare 0.0000 ≤ 0.1 |
| `closing_ttc_threshold` | `CLOSING_TTC` | o apropiere reală de lider (viteză de închidere pozitivă, decalaj peste podeaua de 5 m) în care plafonul de contact al 171 limitează efectiv ținta sub preferința 048 | 3.0000 s | ±0.0500 s | 0.5 s | VALIDATED, 2 episoade, valoare 3.0000, eroare 0.0000 ≤ 0.5 |
| `leader_change_delay` | `LEADER_CHANGE` | o schimbare reală de lider fără cut-in, în care adoptarea liderului nou ar însemna accelerare, măsurată ca numărul de tick-uri ținute înainte de adopție | 0.1917 s | ±0.0083 s | 0.1 s | VALIDATED, 2 episoade, valoare 0.1917, eroare 0.0000 ≤ 0.05 |
| `following_hysteresis` | `HYSTERESIS` | o oscilație reală a decalajului în jurul decalajului dorit al 048, cu eșantioane ținute în bandă și eșantioane care ies din ea | 1.0000 m | ±0.2000 m | 0.5 m | VALIDATED, 2 episoade, valoare 1.0000, eroare 0.0000 ≤ 0.2 |

Split explicit cu seed 172: 16 episoade admise, fără suprapunere între estimare și validare.

## Cazuri fără dovezi identificabile

| Cheie | Episod | Scenariu | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- | --- |
| `cutin_brake_response` | `CUT_IN` | cut-in fără reducere oferită de 048 | UNOBSERVED | CUT_IN_WITHOUT_REDUCTION | CUT_IN_WITHOUT_REDUCTION×4 |
| `cutin_brake_response` | `CUT_IN` | patru reacții reale, dar împrăștiate (0,1–1) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `closing_ttc_threshold` | `CLOSING_TTC` | apropiere reală fără plafon activ | UNOBSERVED | TTC_CAP_NOT_BOUND | TTC_CAP_NOT_BOUND×4 |
| `leader_change_delay` | `LEADER_CHANGE` | ținere tăiată de fereastra de dovezi | UNOBSERVED | LEADER_HOLD_CENSORED | LEADER_HOLD_CENSORED×4 |
| `leader_change_delay` | `LEADER_CHANGE` | ținere întreruptă de o reducere | UNOBSERVED | LEADER_HOLD_INTERRUPTED_BY_REDUCTION | LEADER_HOLD_INTERRUPTED_BY_REDUCTION×4 |
| `leader_change_delay` | `LEADER_CHANGE` | întârzieri reale, dar împrăștiate (0–2 s) | UNOBSERVED | UNCERTAINTY_ABOVE_THRESHOLD | — |
| `following_hysteresis` | `HYSTERESIS` | bandă depășită, dar nicio ieșire observată | UNOBSERVED | HYSTERESIS_UPPER_BOUND_UNOBSERVED | HYSTERESIS_UPPER_BOUND_UNOBSERVED×4 |
| `following_hysteresis` | `HYSTERESIS` | oscilație doar deasupra decalajului dorit | UNOBSERVED | NO_BAND_OSCILLATION | NO_BAND_OSCILLATION×4 |
| `following_hysteresis` | `HYSTERESIS` | două benzi incompatibile | UNOBSERVED | CONTRADICTORY_BAND_BOUNDS | — |
| `cutin_brake_response` | `CUT_IN` | demonstrații MANUAL, neeligibile | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |
| `closing_ttc_threshold` | `CLOSING_TTC` | set fără episoade | UNOBSERVED | NO_ELIGIBLE_EPISODES | — |

## Constrângeri de grup

- `CUT_IN_AND_TTC_SHARE_BRAKE` (cutin_brake_response, closing_ttc_threshold): Cut-in-ul și plafonul timpului până la contact împart aceeași frânare: pe un tick de cut-in 171 aplică reacția, apoi plafonul de contact peste ea, deci aceeași reducere poate fi explicată de oricare dintre chei. De aceea un episod de cut-in nu este admis la măsurarea pragului TTC, iar un episod TTC trebuie să nu declare cut-in; altfel una dintre valori ar fi dedusă din cealaltă.
- `HYSTERESIS_DEPENDS_ON_GAP_BAND` (following_hysteresis): Histerezisul este identificabil numai față de banda de decalaj a lui 048: cheia ține angajamentul cât timp |decalaj − decalaj dorit| rămâne sub toleranță. Fără eșantioane ținute și eșantioane care ies din bandă, cheia rămâne neobservată; o singură latură a benzii este doar o limită, nu o valoare. Când decalajul nu oscilează, banda nu se separă de câștigul de viteză al lui 048.
- `LEADER_CHANGE_REQUIRES_NO_CUT_IN` (leader_change_delay): Întârzierea se măsoară doar la un lider nou apărut fără cut-in: politica 171 adoptă cut-in-ul imediat și nu îl poate amâna, deci un astfel de episod nu poate dovedi niciodată întârzierea. O reducere se adoptă pe loc chiar și în timpul ținerii, deci o ținere întreruptă de o frânare lasă cheia neobservată.
- `FOLLOW_KEYS_FROM_ONE_TRAJECTORY` (cutin_brake_response, closing_ttc_threshold, leader_change_delay, following_hysteresis): Cele patru chei pot fi observate în aceeași călătorie, dar nu din aceleași fapte: cut-in-ul cere o interpunere declarată, pragul TTC cere o închidere în care plafonul leagă, întârzierea cere un lider nou fără cut-in, iar histerezisul cere o oscilație reală în bandă. Un set care conține doar un tip de fapt lasă celelalte chei neobservate, în loc să le deducă din traiectoria comună.

## Intrări refuzate

- `manual-1`: NOT_LEARNING_ELIGIBLE
- `manual-2`: NOT_LEARNING_ELIGIBLE
- `manual-3`: NOT_LEARNING_ELIGIBLE
- `manual-4`: NOT_LEARNING_ELIGIBLE
- `cutin-1`: DUPLICATE_EPISODE

## Compatibilitate cu 171

- Ținta commitată pe episodul de cut-in: **7.9500 m/s** (așteptat 7.9500 m/s).
- Plafonul de contact pe episodul de apropiere: **22.3333 m/s** (așteptat 22.3333 m/s).
- Tick-uri de ținere a liderului nou: **12** (așteptat 12).
- Histerezis în interiorul benzii / în afara benzii: **true** / **false**.
- Versiune politică: `171-follow-policy-v1`, candidat-only true, semantică schimbată false.

## Determinism

- Seed 172: `fnv1a32:3e8addc1`.
- Rulare repetată: `fnv1a32:3e8addc1`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `cutin_brake_response` | 0–1 | 0.7 | ratio |
| `closing_ttc_threshold` | 0.3–8 | 3 | s |
| `leader_change_delay` | 0–2 | 0.2 | s |
| `following_hysteresis` | 0–5 | 1 | m |

## Verificări

- PASS `context-cutin`: cut-in-only response 0.7000 ratio; the other three keys stay unobserved
- PASS `context-closing`: closing-only threshold 3.0000 s; cut-in and delay stay unobserved
- PASS `context-leader-change`: leader-change-only delay 0.1917 s; cut-in and closing stay unobserved
- PASS `context-hysteresis`: hysteresis-only band 1.0000 m; cut-in and delay stay unobserved
- PASS `zero-delay-observed`: a demonstrated adoption without delay is a real zero, not missing evidence
- PASS `uncertainty-reported`: cutin_brake_response 0.0200 <= 0.15 ratio, closing_ttc_threshold 0.0500 <= 0.5 s, leader_change_delay 0.0083 <= 0.1 s, following_hysteresis 0.2000 <= 0.5 m
- PASS `uncertainty-threshold-cutin`: scattered cut-in reactions measure 0.4599 > 0.15 and stay unobserved
- PASS `uncertainty-threshold-delay`: delays from 0 to 2 s measure 0.3230 s > 0.1 s and stay unobserved
- PASS `validation-split`: seed 172: every key validates on held-out episodes (cutin_brake_response 2+2, closing_ttc_threshold 2+2, leader_change_delay 2+2, following_hysteresis 2+2)
- PASS `validation-too-small`: three cut-in episodes leave 1 held-out episode, reported as TOO_SMALL
- PASS `unobserved-cutin-without-reduction`: a cut-in that asks for more speed offers no reduction to measure
- PASS `unobserved-closing-not-bound`: a real closing whose cap never binds leaves only a bound, not a threshold
- PASS `unobserved-censored-hold`: a hold cut by the evidence window is reported as censored, not measured
- PASS `unobserved-interrupted-hold`: a brake during the hold is adopted at once, so the delay is not read from it
- PASS `unobserved-band-bounds`: a missing escape, a one-sided drift and two incompatible bands all stay unobserved
- PASS `shared-channel-separation`: a cut-in never proves the TTC threshold and a closing never proves the cut-in reaction
- PASS `no-fabricated-values`: 11 unobserved demonstrations carry value null and an explicit reason
- PASS `group-constraints`: CUT_IN_AND_TTC_SHARE_BRAKE, HYSTERESIS_DEPENDS_ON_GAP_BAND, LEADER_CHANGE_REQUIRES_NO_CUT_IN, FOLLOW_KEYS_FROM_ONE_TRAJECTORY
- PASS `invalid-input-refused`: NaN speed refused; manual-1:NOT_LEARNING_ELIGIBLE, manual-2:NOT_LEARNING_ELIGIBLE, manual-3:NOT_LEARNING_ELIGIBLE, manual-4:NOT_LEARNING_ELIGIBLE, cutin-1:DUPLICATE_EPISODE
- PASS `determinism`: digest fnv1a32:3e8addc1
- PASS `catalog-ranges`: cutin_brake_response 0.7000 ratio, closing_ttc_threshold 3.0000 s, leader_change_delay 0.1917 s, following_hysteresis 1.0000 m
- PASS `policy-compatibility`: 171 reads cut-in commitment 7.9500 m/s (expected 7.9500), contact cap 22.3333 m/s (expected 22.3333), 12 held ticks for 0.1917 s, hysteresis held true/false

**Sumar: 22/22 verificări, 4 chei candidate, 11 demonstrații neobservate, PASS.**
