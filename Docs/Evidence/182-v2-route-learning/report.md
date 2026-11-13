# 182 — învățare extinsă pentru trasee și recuperare

Generat de `scripts/run-v2-route-learning-report.mjs` din contractul `182-route-estimator-v1`.
Fiecare cheie se estimează numai din scenariul ei eligibil, din faptele comenzii reale 181 peste
alternative produse de planificatorul livrat 041; o cheie fără dovezi suficiente rămâne
`UNOBSERVED`, nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `route_time_weight` | `TIME_VERSUS_DISTANCE` | o decizie 181 reală între exact două alternative admise care diferă în timp de stil și lungime, cu virajele, semafoarele și congestia identice: alegerea dovedește doar raportul `share_timp / share_distanță`, niciodată o pondere absolută | 0.0724 weight | ±0.0050 weight | 0.03 weight | VALIDATED, 4 episoade, valoare 0.0724, eroare 0.0001 ≤ 0.03 |
| `route_distance_weight` | `DISTANCE_VERSUS_TIME` | aceeași pereche comparabilă, citită de cealaltă parte: reciproca aceluiași raport, pentru că cele două ponderi sunt fețele aceleiași decizii | 0.0354 weight | ±0.0050 weight | 0.03 weight | VALIDATED, 4 episoade, valoare 0.0355, eroare 0.0001 ≤ 0.03 |
| `route_turn_penalty` | `TURN_VERSUS_LENGTH` | o pereche de aceeași viteză liberă (deci termenii de timp și distanță sunt coliniari) care diferă în lungime și în virajele declarate: alegerea dovedește doar `share_viraj / (share_timp + share_distanță)`; o pereche cu geometrie identică este ordinală | 0.2357 s | ±0.0164 s | 0.04 s | VALIDATED, 2 episoade, valoare 0.2353, eroare 0.0004 ≤ 0.04 |
| `route_signal_penalty` | `SIGNAL_VERSUS_LENGTH` | o pereche de aceeași viteză liberă care diferă în lungime și în semafoarele declarate: alegerea dovedește doar `share_semafor / (share_timp + share_distanță)` | 0.5891 s | ±0.0221 s | 0.06 s | VALIDATED, 2 episoade, valoare 0.5879, eroare 0.0012 ≤ 0.06 |
| `route_congestion_penalty` | `CONGESTION_VERSUS_LENGTH` | o pereche de aceeași viteză liberă care diferă în lungime și în întârzierea de congestie declarată: alegerea dovedește doar `share_congestie / (share_timp + share_distanță)` | 0.0674 ratio | ±0.0126 ratio | 0.03 ratio | VALIDATED, 2 episoade, valoare 0.0672, eroare 0.0002 ≤ 0.03 |
| `reroute_patience` | `KEEP_TO_SWITCH` | tranziția reală WAIT → COMMIT între două rute admise: primul tick scurs care commitează este `max(1, ceil(cheie · 60))`, deci `P` tick-uri admit `cheie ∈ ((P − 1)/60, P/60]` | 19.9917 s | ±0.0500 s | 0.5 s | VALIDATED, 2 episoade, valoare 19.9833, eroare 0.0083 ≤ 0.5 |
| `u_turn_willingness` | `U_TURN_OPPORTUNITY` | o oportunitate cu întoarcerea declarată permisă, în care 181 a extras eșantionul determinist: admiterea dovedește `cheie > eșantion`, refuzul dovedește `cheie ≤ eșantion`; o întoarcere interzisă sau nedeclarată nu trage eșantion | 0.1042 probability | ±0.0434 probability | 0.15 probability | VALIDATED, 2 episoade, valoare 0.1260, eroare 0.0218 ≤ 0.15 |
| `reverse_recovery_duration` | `RECOVERY_COMMIT` | o recuperare cerută și commitată cu spațiul din spate declarat liber: durata commitată este `max(cheie, 2,5 s)`, deci peste podea valoarea este chiar cheia, iar pe podea este doar o margine superioară | 4.0000 s | ±0.0500 s | 0.5 s | VALIDATED, 2 episoade, valoare 4.0000, eroare 0.0000 ≤ 0.5 |

Split explicit cu seed 182: 28 episoade admise, 0 refuzate, fără suprapunere între estimare și validare.

## Ce este identificabil din cotele normalizate

- `rho = share_timp / share_distanță`: **2.0467**
- `kappa_viraj = share_viraj / (share_timp + share_distanță)`: **2.1854**
- `kappa_semafor = share_semafor / (share_timp + share_distanță)`: **5.4636**
- `kappa_congestie = share_congestie / (share_timp + share_distanță)`: **0.6250**

| Cotă | Estimare (reprezentant cu sumă 1) | Cotă autorată (din 181) |
| --- | ---: | ---: |
| `route_time_weight` | 0.072435989183 | 0.071428571429 |
| `route_distance_weight` | 0.035392271105 | 0.035714285714 |
| `route_turn_penalty` | 0.235651164867 | 0.238095238095 |
| `route_signal_penalty` | 0.589127912166 | 0.595238095238 |
| `route_congestion_penalty` | 0.067392662680 | 0.059523809524 |

Suma cotelor raportate este **1**; 8/8 chei au candidat.
181 normalizează din nou aceste valori la exact aceiași coeficienți, deci familia de profile
`λ · w` dă aceeași politică: scalele absolute nu sunt identificabile, doar cotele sunt.

## Cazuri fără dovezi identificabile

| Demonstrație | Cheie | Stare | Valoare | Motiv | Excluderi |
| --- | --- | --- | ---: | --- | --- |
| întoarcere interzisă | `u_turn_willingness` | UNOBSERVED | — | U_TURN_PERMISSION_NOT_DECLARED | U_TURN_PERMISSION_NOT_DECLARED×4 |
| recuperare pe podeaua de 2,5 s | `reverse_recovery_duration` | UNOBSERVED | — | RECOVERY_FLOOR_SATURATED | RECOVERY_FLOOR_SATURATED×1 |
| recuperare fără spațiu liber | `reverse_recovery_duration` | UNOBSERVED | — | RECOVERY_BLOCKED_NO_COMMAND | RECOVERY_BLOCKED_NO_COMMAND×4 |
| fereastră închisă înainte de commit | `reroute_patience` | UNOBSERVED | — | PATIENCE_UPPER_BOUND_UNOBSERVED | — |
| raport timp/distanță pe o singură parte | `route_time_weight` | UNOBSERVED | — | TIME_DISTANCE_UPPER_BOUND_UNOBSERVED | TIME_DISTANCE_PAIR_MISSING×1 |
| raport timp/distanță pe o singură parte | `route_distance_weight` | UNOBSERVED | — | TIME_DISTANCE_UPPER_BOUND_UNOBSERVED | TIME_DISTANCE_PAIR_MISSING×1 |
| raport timp/distanță pe o singură parte | `route_turn_penalty` | CANDIDATE | 0.2357 | — | TURN_TRADE_OFF_MISSING×1 |
| raport timp/distanță pe o singură parte | `route_signal_penalty` | CANDIDATE | 0.5891 | — | SIGNAL_TRADE_OFF_MISSING×1 |
| raport timp/distanță pe o singură parte | `route_congestion_penalty` | CANDIDATE | 0.0674 | — | CONGESTION_TRADE_OFF_MISSING×1 |
| o penalizare pe o singură parte | `route_time_weight` | UNOBSERVED | — | SHARE_BUDGET_INCOMPLETE | TIME_DISTANCE_PAIR_MISSING×1 |
| o penalizare pe o singură parte | `route_distance_weight` | UNOBSERVED | — | SHARE_BUDGET_INCOMPLETE | TIME_DISTANCE_PAIR_MISSING×1 |
| o penalizare pe o singură parte | `route_turn_penalty` | UNOBSERVED | — | TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED | TURN_TRADE_OFF_MISSING×1 |
| o penalizare pe o singură parte | `route_signal_penalty` | UNOBSERVED | — | SHARE_BUDGET_INCOMPLETE | SIGNAL_TRADE_OFF_MISSING×1 |
| o penalizare pe o singură parte | `route_congestion_penalty` | UNOBSERVED | — | SHARE_BUDGET_INCOMPLETE | CONGESTION_TRADE_OFF_MISSING×1 |
| doi șoferi contrazicători | `route_time_weight` | UNOBSERVED | — | CONTRADICTORY_TIME_DISTANCE_BOUNDS | TIME_DISTANCE_PAIR_MISSING×1 |
| doi șoferi contrazicători | `route_distance_weight` | UNOBSERVED | — | CONTRADICTORY_TIME_DISTANCE_BOUNDS | TIME_DISTANCE_PAIR_MISSING×1 |
| doi șoferi contrazicători | `route_turn_penalty` | CANDIDATE | 0.2357 | — | TURN_TRADE_OFF_MISSING×1 |
| doi șoferi contrazicători | `route_signal_penalty` | CANDIDATE | 0.5891 | — | SIGNAL_TRADE_OFF_MISSING×1 |
| doi șoferi contrazicători | `route_congestion_penalty` | CANDIDATE | 0.0674 | — | CONGESTION_TRADE_OFF_MISSING×1 |
| episoade MANUAL | `route_time_weight` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `route_distance_weight` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `route_turn_penalty` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `route_signal_penalty` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `route_congestion_penalty` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `reroute_patience` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `u_turn_willingness` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `reverse_recovery_duration` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `route_time_weight` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `route_distance_weight` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `route_turn_penalty` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `route_signal_penalty` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `route_congestion_penalty` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `reroute_patience` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `u_turn_willingness` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `reverse_recovery_duration` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |

## Zerouri demonstrate

| Demonstrație | Cheie | Stare | Valoare | Motiv | Excluderi |
| --- | --- | --- | ---: | --- | --- |
| U refuzat la fiecare oportunitate | `u_turn_willingness` | CANDIDATE | 0.0000 | — | — |
| răbdarea de la podeaua catalogului | `reroute_patience` | CANDIDATE | 2.0000 | — | — |

## Constrângeri de grup

- `SHARE_SCALE_UNIDENTIFIABLE` (route_time_weight, route_distance_weight, route_turn_penalty, route_signal_penalty, route_congestion_penalty): 181 împarte fiecare pondere la suma celor cinci, `share_k = w_k / Σw`, cuantizat la 1e-12, deci orice profil scris la altă scară produce exact aceiași coeficienți și aceeași politică. Din comportament sunt identificabile doar rapoarte între cote, niciodată cele cinci ponderi absolute: familia `λ · w` dă aceeași politică pentru orice `λ > 0`. Estimatorul raportează reprezentantul canonic cu sumă 1, `w_k := share_k`, care este în intervalul fiecărei chei și pe care 181 îl normalizează înapoi la exact aceiași coeficienți; nu inversează niciodată un scor brut într-o pondere, pentru că acea inversare presupune o scală pe care 181 a eliminat-o.
- `TIME_AND_DISTANCE_SHARE_ONE_TRADE_OFF` (route_time_weight, route_distance_weight): Ponderea timpului și ponderea distanței sunt fețele aceleiași decizii: o singură pereche în care timpul și distanța se opun dovedește raportul `rho = share_timp / share_distanță`, iar cealaltă cheie este reciproca lui. Pe o pereche de aceeași viteză liberă timpul de stil și lungimea sunt coliniari, deci perechea nu separă deloc cele două ponderi; ele nu pot fi estimate independent una de alta din aceeași alegere.
- `SHARE_BUDGET_COUPLES_THE_FIVE_WEIGHTS` (route_turn_penalty, route_signal_penalty, route_congestion_penalty): Cota unei penalizări este `κ / (1 + κ_viraj + κ_semafor + κ_congestie)`, iar cotele timpului și distanței împart numitorul `(1 + ρ) · (1 + Σκ)`: o penalizare demonstrată doar pe o singură parte lasă toate cele cinci cote neidentificabile, pentru că numitorul comun nu poate fi format. Asimetria reală este cealaltă: ρ cenzat lasă neobservate doar timpul și distanța, în timp ce cele trei penalizări rămân identificabile din perechile lor de aceeași viteză.
- `PENALTY_MAGNITUDE_NEEDS_A_LENGTH_TRADE_OFF` (route_turn_penalty, route_signal_penalty): O pereche cu geometrie identică în care doar numărul de viraje sau de semafoare diferă este pur ordinală: pentru orice penalizare pozitivă câștigă aceeași alternativă, iar o penalizare zero este departajată după id. Mărimea penalizării este observabilă numai când numărătoarea se opune lungimii, adică atunci când șoferul acceptă un ocol declarat ca să evite un viraj sau un semafor.
- `U_TURN_PERMISSION_SHADOWS_WILLINGNESS` (u_turn_willingness): Cu întoarcerea interzisă (`FORBIDDEN`) sau nedeclarată (`UNKNOWN`), 181 nu extrage niciun eșantion și nu admite niciodată alternativa cu U, la orice valoare a cheii: o asemenea secvență nu spune nimic despre disponibilitate și lasă cheia neobservată.
- `RECOVERY_FLOOR_HIDES_SHORT_DURATIONS` (reverse_recovery_duration): Durata commitată este `max(cheie, 2,5 s)`, derivată din 3 m la 1,2 m/s, deci fiecare cheie din banda 0–2,5 s a catalogului produce aceeași manevră de 150 de tick-uri și 3 m: o recuperare commitată pe podea dovedește doar `cheie ≤ 2,5 s` și nu devine valoare.
- `PATIENCE_ONLY_BETWEEN_ADMISSIBLE_ROUTES` (reroute_patience): Răbdarea guvernează numai schimbarea între două rute admise: o rută curentă care nu mai este admisă este părăsită imediat (`FORCED_REROUTE`), iar o rută curentă optimă este ținută (`KEPT`). Nicio comandă forțată și nicio primă decizie fără rută curentă nu observă cheia.
- `ROUTE_KEYS_FROM_ONE_DECISION` (route_time_weight, route_distance_weight, route_turn_penalty, route_signal_penalty, route_congestion_penalty, reroute_patience, u_turn_willingness, reverse_recovery_duration): Cele opt chei pot apărea în aceeași călătorie, dar nu din același fapt: o decizie 181 oferă cel mult o pereche de alternative punctată, o tranziție de răbdare, un eșantion de U sau o recuperare commitată. Un set cu un singur tip de demonstrație lasă celelalte chei neobservate, iar estimatorul nu deduce niciodată o cheie din alta.

## Intrări refuzate

Niciuna: toate episoadele setului pozitiv sunt `LEARNING` eligibile cu prefix utilizabil.

## Compatibilitate cu 181 (citire fără schimbare de semantică)

- 12/12 decizii rejucate cu profilul estimat aleg exact ce alege profilul autorat.
- Profilul autorat la factorii 1/10 (aceleași cote) produce aceeași alegere în 12/12 decizii.
- Versiune politică `181-route-policy-v2`, candidate-only true, semantică schimbată false, rată 60 Hz, podea de recuperare 2.5 s.
- Cantități raportate: `route_time_weight` = cota `share_timp` din bugetul normalizat al lui 181; `route_distance_weight` = cota `share_distanță` din bugetul normalizat al lui 181; `route_turn_penalty` = cota `share_viraj` din bugetul normalizat al lui 181; `route_signal_penalty` = cota `share_semafor` din bugetul normalizat al lui 181; `route_congestion_penalty` = cota `share_congestie` din bugetul normalizat al lui 181; `reroute_patience` = cheia în secunde, inversată din `max(1, ceil(cheie · 60))`; `u_turn_willingness` = probabilitatea în sine, intersectată din eșantioane; `reverse_recovery_duration` = cheia în secunde, citită peste podeaua de 2,5 s.

## Determinism

- Seed 182: `fnv1a32:e438ed74`.
- Rulare repetată: `fnv1a32:e438ed74`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `route_time_weight` | 0–1 | 0.6 | weight |
| `route_distance_weight` | 0–1 | 0.3 | weight |
| `route_turn_penalty` | 0–20 | 2 | s |
| `route_signal_penalty` | 0–60 | 5 | s |
| `route_congestion_penalty` | 0–2 | 0.5 | ratio |
| `reroute_patience` | 2–120 | 20 | s |
| `u_turn_willingness` | 0–1 | 0 | probability |
| `reverse_recovery_duration` | 0–8 | 2 | s |

## Verificări

- PASS `catalog`: route_time_weight 0-1 weight, route_distance_weight 0-1 weight, route_turn_penalty 0-20 s, route_signal_penalty 0-60 s, route_congestion_penalty 0-2 ratio, reroute_patience 2-120 s, u_turn_willingness 0-1 probability, reverse_recovery_duration 0-8 s
- PASS `contexts`: 8 scenarii și 8 contexte eligibile distincte: route_time_weight->TIME_VERSUS_DISTANCE, route_distance_weight->DISTANCE_VERSUS_TIME, route_turn_penalty->TURN_VERSUS_LENGTH, route_signal_penalty->SIGNAL_VERSUS_LENGTH, route_congestion_penalty->CONGESTION_VERSUS_LENGTH, reroute_patience->KEEP_TO_SWITCH, u_turn_willingness->U_TURN_OPPORTUNITY, reverse_recovery_duration->RECOVERY_COMMIT
- PASS `candidates`: route_time_weight 0.0724 weight, route_distance_weight 0.0354 weight, route_turn_penalty 0.2357 s, route_signal_penalty 0.5891 s, route_congestion_penalty 0.0674 ratio, reroute_patience 19.9917 s, u_turn_willingness 0.1042 probability, reverse_recovery_duration 4.0000 s
- PASS `uncertainty`: route_time_weight ±0.0050/0.03, route_distance_weight ±0.0050/0.03, route_turn_penalty ±0.0164/0.04, route_signal_penalty ±0.0221/0.06, route_congestion_penalty ±0.0126/0.03, reroute_patience ±0.0500/0.5, u_turn_willingness ±0.0434/0.15, reverse_recovery_duration ±0.0500/0.5
- PASS `validation`: route_time_weight VALIDATED 4 episoade, eroare 0.0001; route_distance_weight VALIDATED 4 episoade, eroare 0.0001; route_turn_penalty VALIDATED 2 episoade, eroare 0.0004; route_signal_penalty VALIDATED 2 episoade, eroare 0.0012; route_congestion_penalty VALIDATED 2 episoade, eroare 0.0002; reroute_patience VALIDATED 2 episoade, eroare 0.0083; u_turn_willingness VALIDATED 2 episoade, eroare 0.0218; reverse_recovery_duration VALIDATED 2 episoade, eroare 0.0000
- PASS `shares-sum`: suma celor cinci cote raportate este 1.0000000000000002
- PASS `shares-renormalize`: 5/5 cote raportate se renormalizează la ele însele prin 181 (aceleași cifre la 1e-9)
- PASS `scale-invariance`: profilul scris la factorii 1/10 produce aceeași alegere în 12/12 decizii
- PASS `policy-compatibility`: 12/12 decizii rejucate cu profilul estimat aleg exact ce alege profilul autorat
- PASS `u-turn-forbidden`: întoarcere interzisă: UNOBSERVED / U_TURN_PERMISSION_NOT_DECLARED
- PASS `recovery-floor`: recuperare pe podea: UNOBSERVED / RECOVERY_FLOOR_SATURATED
- PASS `recovery-blocked`: recuperare blocată: UNOBSERVED / RECOVERY_BLOCKED_NO_COMMAND
- PASS `patience-censored`: răbdare cenzurată: UNOBSERVED / PATIENCE_UPPER_BOUND_UNOBSERVED
- PASS `one-sided-rho`: raport pe o singură parte: timp TIME_DISTANCE_UPPER_BOUND_UNOBSERVED, viraj CANDIDATE
- PASS `budget-coupling`: route_time_weight SHARE_BUDGET_INCOMPLETE, route_distance_weight SHARE_BUDGET_INCOMPLETE, route_turn_penalty TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED, route_signal_penalty SHARE_BUDGET_INCOMPLETE, route_congestion_penalty SHARE_BUDGET_INCOMPLETE
- PASS `contradiction`: doi șoferi: timp CONTRADICTORY_TIME_DISTANCE_BOUNDS, semafor CANDIDATE
- PASS `zero-u-turn`: refuz constant: CANDIDATE valoare 0, incertitudine 0.0282
- PASS `floor-patience`: răbdarea de la podea: CANDIDATE valoare 2 (demonstrată)
- PASS `refusals`: MANUAL: 28 episoade refuzate, 0 admise; fără prefix: 28; toate cheile rămân neobservate
- PASS `no-profile-leak`: eșantionul nu poartă nici pondere, nici scor: tick, policyActive, reason, action, referenceSeconds, referenceMetres, currentRouteId, candidateRouteId, selectedRouteId, reroute, uTurn, recovery, routes
- PASS `candidate-only`: politica 181-route-policy-v2, candidate-only true, semantică schimbată false, podea 2.5 s, rată 60 Hz
- PASS `determinism`: digest fnv1a32:e438ed74

**Sumar: 22/22 verificări, 8 chei candidate, 0 chei neobservate, PASS.**
