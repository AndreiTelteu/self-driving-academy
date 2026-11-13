# 184 — învățare extinsă pentru pietoni și pericole

Generat de `scripts/run-v2-hazard-learning-report.mjs` din contractul `184-hazard-estimator-v1`.
Fiecare cheie se estimează numai din scenariul ei eligibil, din faptele comenzii reale 183 peste
traversări 164 reale și stimuluri 165 reale; o cheie fără dovezi suficiente rămâne `UNOBSERVED`,
nu primește o valoare inventată.

## Cheie → scenariu → context → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Context eligibil | Estimare | Incertitudine | Prag de incertitudine | Validare pe date independente |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `pedestrian_yield_probability` | `PEDESTRIAN_CROSSING` | o traversare reală 164 în care 183 a extras eșantionul determinist `pedestrian-yield` și traversarea nu este un conflict fizic (marja peste `yield_time_gap`): cedarea dovedește `cheie > eșantion`, trecerea dovedește `cheie ≤ eșantion`, iar numitorul este numărul de oportunități distincte, niciodată numărul de cadre | 0.5000 probability | ±0.1021 probability | 0.15 probability | VALIDATED, 12 episoade, valoare 0.5000, eroare 0.0000 ≤ 0.15 |
| `pedestrian_clearance` | `PEDESTRIAN_CLEARANCE_APPROACH` | un tick cu plafon de viteză față de un pieton, peste podeaua fizică `lățime + 0,5 m`, cu `comfort_deceleration` M declarat: camera se recuperează din `plafon² / (2 · comfort)` și cheia este `distanță − cameră`; fără M cunoscut cheia nu se poate izola de plafon | 2.5000 m | ±0.0200 m | 0.15 m | VALIDATED, 12 episoade, valoare 2.5000, eroare 0.0000 ≤ 0.15 |
| `hazard_reaction_delay` | `HAZARD_REACTION` | un stimul 165 observabil cu reacție **nesaturată**: `delayS − brake_reaction_delay` este cheia, iar o întârziere tăiată de plafonul de oprire dovedește doar o margine inferioară | 0.8000 s | ±0.0200 s | 0.2 s | VALIDATED, 8 episoade, valoare 0.8000, eroare 0.0000 ≤ 0.15 |
| `obstacle_clearance` | `OBSTACLE_CLEARANCE_APPROACH` | același plafon de viteză, față de o cutie de obstacol autorată, peste podeaua fizică `lățime/2 + jumătate de cutie + 0,5 m`, cu `comfort_deceleration` M declarat | 2.4000 m | ±0.0200 m | 0.15 m | VALIDATED, 7 episoade, valoare 2.4000, eroare 0.0000 ≤ 0.15 |
| `emergency_brake_intensity` | `EMERGENCY_BRAKE` | o frânare de urgență pe o suprafață cu aderență cunoscută, **sub** plafonul de aderență: `decelerație / brakeAcceleration` este chiar cheia, iar o decelerație plafonată de anvelopă nu spune nimic despre intensitate | 0.6500 ratio | ±0.0200 ratio | 0.15 ratio | VALIDATED, 8 episoade, valoare 0.6500, eroare 0.0000 ≤ 0.15 |
| `evasive_steer_willingness` | `EVASION_OPPORTUNITY` | o oportunitate de ocolire cu spațiu lateral verificat peste marja fizică, în care 183 a extras eșantionul determinist `evasion`: acceptarea dovedește `cheie > eșantion`, refuzul dovedește `cheie ≤ eșantion` | 0.3053 probability | ±0.0200 probability | 0.15 probability | VALIDATED, 4 episoade, valoare 0.2929, eroare 0.0124 ≤ 0.15 |
| `crosswalk_approach_speed` | `CROSSWALK_APPROACH` | o apropiere de trecere autorată în care comanda este **sub** limita postată: `min(cheie, limită)` sub limită este cheia, iar o comandă egală cu limita este doar o margine inferioară | 6.0000 m/s | ±0.0500 m/s | 0.5 m/s | VALIDATED, 5 episoade, valoare 6.0000, eroare 0.0000 ≤ 0.5 |
| `horn_use_probability` | `HORN_OPPORTUNITY` | o oportunitate 165 în care lumea permite claxonul și 183 a extras eșantionul determinist `horn`: folosirea dovedește `cheie > eșantion`, refuzul dovedește `cheie ≤ eșantion`; unde claxonul este interzis nu se trage niciun eșantion | 0.2521 probability | ±0.0200 probability | 0.15 probability | VALIDATED, 4 episoade, valoare 0.2597, eroare 0.0076 ≤ 0.15 |

Split explicit cu seed 184: 72 episoade admise, 0 refuzate, fără suprapunere între estimare și validare.

## Cele două capcane de identificabilitate

- Plafoanele de spațiu depind de M: `pedestrian_clearance` și `obstacle_clearance` sunt `sqrt(2 · comfort_deceleration · cameră)`, deci inversarea cere decelerația de confort din același tick. Fără ea cheia nu se izolează de M.
- `hazard_reaction_delay` este `min(brake_reaction_delay + cheie, plafon de oprire)`: o valoare saturată nu spune nimic despre cheie și nu devine estimare.

## Cazuri fără dovezi identificabile

| Demonstrație | Cheie | Stare | Valoare | Motiv | Excluderi |
| --- | --- | --- | ---: | --- | --- |
| flux fără decelerația de confort M | `pedestrian_clearance` | UNOBSERVED | — | CLEARANCE_M_UNKNOWN | CLEARANCE_M_UNKNOWN×4 |
| flux fără decelerația de confort M | `obstacle_clearance` | UNOBSERVED | — | CLEARANCE_M_UNKNOWN | CLEARANCE_M_UNKNOWN×4 |
| decelerație de confort M declarată greșit | `pedestrian_clearance` | UNOBSERVED | — | CLEARANCE_M_INCONSISTENT | CLEARANCE_M_INCONSISTENT×4 |
| decelerație de confort M declarată greșit | `obstacle_clearance` | UNOBSERVED | — | CLEARANCE_M_INCONSISTENT | CLEARANCE_M_INCONSISTENT×4 |
| spațiu demonstrat sub podeaua fizică | `pedestrian_clearance` | UNOBSERVED | — | CLEARANCE_FLOOR_SATURATED | CLEARANCE_FLOOR_SATURATED×4 |
| spațiu demonstrat sub podeaua fizică | `obstacle_clearance` | UNOBSERVED | — | CLEARANCE_FLOOR_SATURATED | CLEARANCE_FLOOR_SATURATED×4 |
| hazard deja în marjă, comandă 0 m/s | `pedestrian_clearance` | UNOBSERVED | — | CLEARANCE_ROOM_EXHAUSTED | CLEARANCE_ROOM_EXHAUSTED×4 |
| hazard deja în marjă, comandă 0 m/s | `obstacle_clearance` | UNOBSERVED | — | CLEARANCE_ROOM_EXHAUSTED | CLEARANCE_ROOM_EXHAUSTED×4 |
| reacție saturată de plafonul de oprire | `hazard_reaction_delay` | UNOBSERVED | — | REACTION_DELAY_SATURATED | REACTION_DELAY_SATURATED×4 |
| frânare de urgență pe aderență redusă | `emergency_brake_intensity` | UNOBSERVED | — | ADHESION_CAP_SATURATED | ADHESION_CAP_SATURATED×4 |
| ocolire fără spațiul lateral verificat | `evasive_steer_willingness` | UNOBSERVED | — | EVASION_NO_SPACE | EVASION_NO_SPACE×4 |
| apropiere de trecere plafonată de limită | `crosswalk_approach_speed` | UNOBSERVED | — | CROSSWALK_LIMIT_SATURATED | CROSSWALK_LIMIT_SATURATED×4 |
| claxon interzis de lume | `horn_use_probability` | UNOBSERVED | — | HORN_FORBIDDEN | HORN_FORBIDDEN×4 |
| cedare obligatorie la fiecare traversare | `pedestrian_yield_probability` | UNOBSERVED | — | PEDESTRIAN_ALL_CROSSINGS_MANDATORY | PEDESTRIAN_ALL_CROSSINGS_MANDATORY×4 |
| reacții împrăștiate peste pragul de incertitudine | `hazard_reaction_delay` | UNOBSERVED | — | UNCERTAINTY_ABOVE_THRESHOLD | — |
| episoade MANUAL | `pedestrian_yield_probability` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `pedestrian_clearance` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `hazard_reaction_delay` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `obstacle_clearance` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `emergency_brake_intensity` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `evasive_steer_willingness` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `crosswalk_approach_speed` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| episoade MANUAL | `horn_use_probability` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `pedestrian_yield_probability` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `pedestrian_clearance` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `hazard_reaction_delay` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `obstacle_clearance` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `emergency_brake_intensity` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `evasive_steer_willingness` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `crosswalk_approach_speed` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |
| fereastră fără prefix utilizabil | `horn_use_probability` | UNOBSERVED | — | NO_ELIGIBLE_EPISODES | — |

## Zerouri demonstrate

| Demonstrație | Cheie | Stare | Valoare | Motiv | Excluderi |
| --- | --- | --- | ---: | --- | --- |
| claxon nefolosit la fiecare oportunitate | `horn_use_probability` | CANDIDATE | 0.0000 | — | — |
| ocolire refuzată la fiecare oportunitate | `evasive_steer_willingness` | CANDIDATE | 0.0000 | — | — |

## Constrângeri de grup

- `CLEARANCE_SPEED_CAP_DEPENDS_ON_M` (pedestrian_clearance, obstacle_clearance): 183 nu raportează spațiul ca poziție, ci ca plafon de viteză `sqrt(2 · comfort_deceleration · cameră)`, unde camera este `distanță − max(cheie, minim fizic)`. Plafonul amestecă deci cheia cu cheia M `comfort_deceleration`: ca să izolezi cheia trebuie să cunoști decelerația de confort din același tick. Estimatorul recuperează camera din plafon și M declarat și refuză proba când M lipsește (`CLEARANCE_M_UNKNOWN`) sau când M declarat nu reproduce plafonul raportat (`CLEARANCE_M_INCONSISTENT`); nu presupune niciodată o valoare de confort.
- `CLEARANCE_FLOOR_HIDES_SMALL_VALUES` (pedestrian_clearance, obstacle_clearance): Spațiul efectiv este `max(cheie, minim fizic)`, cu minimul `lățime + 0,5 m` față de pieton (2,30 m pentru sedan) și `lățime/2 + jumătate de cutie + 0,5 m` față de obstacol (1,70 m pentru con, 3,40 m pentru barieră). Sub podea toate cheile produc aceeași comandă, deci banda 0,10–2,30 m (respectiv 0,10–1,70 m) a catalogului este ascunsă: o probă ridicată de podea dovedește doar `cheie ≤ minim` și rămâne `CLEARANCE_FLOOR_SATURATED`.
- `REACTION_CAP_HIDES_LARGE_DELAYS` (hazard_reaction_delay): Întârzierea totală este `min(brake_reaction_delay + cheie, (cameră − v² / (2 · capability)) / v)`. Peste plafonul fezabil politica saturează și raportează `saturated`, deci o asemenea probă dovedește doar `cheie ≥ plafon − M` și nu este o estimare: catalogul merge până la 3 s, dar dintr-un stimul apropiat și rapid sunt observabile numai întârzierile care încă mai opresc vehiculul în camera declarată (`REACTION_DELAY_SATURATED`).
- `ADHESION_CAP_HIDES_HIGH_INTENSITIES` (emergency_brake_intensity): Decelerația comandată este `min(cheie · brakeAcceleration, grip · tireGripScale · g)`. Pe `reduced-adhesion` plafonul fizic este 4,463550 m/s², sub capacitatea de frânare de 8 m/s², deci orice intensitate peste 0,557944 produce aceeași frânare la limita anvelopei: proba este refuzată (`ADHESION_CAP_SATURATED`) în loc să fie citită ca intensitate.
- `HAZARD_IN_MARGIN_COMMANDS_ZERO_WITHOUT_CLEARANCE` (pedestrian_clearance, obstacle_clearance): Când hazardul este deja în interiorul spațiului efectiv, `camera = max(0, distanță − spațiu)` este zero, plafonul de viteză este 0 și comanda este 0 m/s la orice valoare a cheii. Oprirea demonstrează siguranța, nu spațiul dorit: proba rămâne `CLEARANCE_ROOM_EXHAUSTED` și nu devine o valoare mică inventată.
- `YIELD_AND_HORN_ARE_BINARY_OPPORTUNITIES` (pedestrian_yield_probability, horn_use_probability): Cedarea și claxonul sunt decizii binare pe oportunități identificate, nu rate pe cadre: numitorul este numărul de traversări (respectiv de oportunități de claxon) distincte, iar un eșantion se trage o singură dată per oportunitate. O cedare obligatorie (pietonul nu poate elibera calea în `yield_time_gap`) nu este o decizie de stil și iese din numitor, iar unde claxonul este interzis nu se trage niciun eșantion.
- `EVASION_DEPENDS_ON_VERIFIED_SPACE` (evasive_steer_willingness): Disponibilitatea de ocolire este inertă sub marja fizică `lățime/2 + jumătate de cutie + 0,5 m`: fără spațiul lateral verificat, 183 nu trage eșantion și nu se deplasează, la orice valoare a cheii. O asemenea oportunitate nu spune nimic despre disponibilitate și rămâne `EVASION_NO_SPACE`.
- `HAZARD_KEYS_FROM_ONE_TICK` (pedestrian_yield_probability, pedestrian_clearance, hazard_reaction_delay, obstacle_clearance, emergency_brake_intensity, evasive_steer_willingness, crosswalk_approach_speed, horn_use_probability): Ordinea ramurilor 183 hotărăște ce fapte există într-un tick: traversarea, cele două plafoane de spațiu, apropierea de trecere, reacția cu frânarea de urgență, ocolirea și claxonul. Un tick poate purta simultan cedarea și plafonul de spațiu față de pieton, dar nicio cheie nu este dedusă din alta: un set cu un singur tip de demonstrație lasă celelalte chei neobservate.

## Intrări refuzate

Niciuna: toate episoadele setului pozitiv sunt `LEARNING` eligibile cu prefix utilizabil.

## Compatibilitate cu 183 (citire fără schimbare de semantică)

| Cheie | Fapt autorat | Fapt estimat | Identic |
| --- | --- | --- | --- |
| `pedestrian_yield_probability` | true | true | da |
| `pedestrian_clearance` | 2.5 | 2.5 | da |
| `hazard_reaction_delay` | 78 | 78 | da |
| `obstacle_clearance` | 2.4 | 2.4 | da |
| `emergency_brake_intensity` | 5.2 | 5.2 | da |
| `evasive_steer_willingness` | 0.44999999999999996 | 0.44999999999999996 | da |
| `crosswalk_approach_speed` | 6 | 6 | da |
| `horn_use_probability` | false | false | da |

- 8/8 fapte rejucate cu profilul estimat sunt identice cu profilul autorat.
- Versiune politică `183-hazard-policy-v2`, candidate-only true, semantică schimbată false, rată 60 Hz, rezervă de spațiu 0.5 m, gravitație 9.81 m/s².
- Chei M citite de politică: comfort_deceleration, brake_reaction_delay, curve_lateral_accel, yield_time_gap.
- Cantități raportate: `pedestrian_yield_probability` = rata pe oportunități distincte de traversare discreționară, nu pe cadre; `pedestrian_clearance` = cheia în metri, inversată din `distanță − plafon² / (2 · comfort_deceleration)`; `hazard_reaction_delay` = contribuția R în secunde, `delayS − brake_reaction_delay`, doar nesaturată; `obstacle_clearance` = aceeași inversare, față de cutia de obstacol autorată; `emergency_brake_intensity` = raportul `decelerație / brakeAcceleration` sub plafonul de aderență; `evasive_steer_willingness` = probabilitatea în sine, intersectată din eșantioane; `crosswalk_approach_speed` = viteza comandată sub limita postată, în m/s; `horn_use_probability` = probabilitatea în sine, intersectată din eșantioane.

## Determinism

- Seed 184: `fnv1a32:57a8782d`.
- Rulare repetată: `fnv1a32:57a8782d`.

## Catalog 092

| Cheie | Interval | Implicit | Unitate |
| --- | ---: | ---: | --- |
| `pedestrian_yield_probability` | 0–1 | 1 | probability |
| `pedestrian_clearance` | 0.1–6 | 2 | m |
| `hazard_reaction_delay` | 0–3 | 0.5 | s |
| `obstacle_clearance` | 0.1–4 | 1 | m |
| `emergency_brake_intensity` | 0–1 | 1 | ratio |
| `evasive_steer_willingness` | 0–1 | 0.3 | probability |
| `crosswalk_approach_speed` | 0.5–15 | 5 | m/s |
| `horn_use_probability` | 0–1 | 0.1 | probability |

## Verificări

- PASS `catalog`: pedestrian_yield_probability 0-1 probability, pedestrian_clearance 0.1-6 m, hazard_reaction_delay 0-3 s, obstacle_clearance 0.1-4 m, emergency_brake_intensity 0-1 ratio, evasive_steer_willingness 0-1 probability, crosswalk_approach_speed 0.5-15 m/s, horn_use_probability 0-1 probability
- PASS `contexts`: 8 scenarii și 8 contexte eligibile distincte: pedestrian_yield_probability->PEDESTRIAN_CROSSING, pedestrian_clearance->PEDESTRIAN_CLEARANCE_APPROACH, hazard_reaction_delay->HAZARD_REACTION, obstacle_clearance->OBSTACLE_CLEARANCE_APPROACH, emergency_brake_intensity->EMERGENCY_BRAKE, evasive_steer_willingness->EVASION_OPPORTUNITY, crosswalk_approach_speed->CROSSWALK_APPROACH, horn_use_probability->HORN_OPPORTUNITY
- PASS `candidates`: pedestrian_yield_probability 0.5000 probability, pedestrian_clearance 2.5000 m, hazard_reaction_delay 0.8000 s, obstacle_clearance 2.4000 m, emergency_brake_intensity 0.6500 ratio, evasive_steer_willingness 0.3053 probability, crosswalk_approach_speed 6.0000 m/s, horn_use_probability 0.2521 probability
- PASS `uncertainty`: pedestrian_yield_probability ±0.1021/0.15, pedestrian_clearance ±0.0200/0.15, hazard_reaction_delay ±0.0200/0.2, obstacle_clearance ±0.0200/0.15, emergency_brake_intensity ±0.0200/0.15, evasive_steer_willingness ±0.0200/0.15, crosswalk_approach_speed ±0.0500/0.5, horn_use_probability ±0.0200/0.15
- PASS `validation`: pedestrian_yield_probability VALIDATED 12 episoade, eroare 0.0000; pedestrian_clearance VALIDATED 12 episoade, eroare 0.0000; hazard_reaction_delay VALIDATED 8 episoade, eroare 0.0000; obstacle_clearance VALIDATED 7 episoade, eroare 0.0000; emergency_brake_intensity VALIDATED 8 episoade, eroare 0.0000; evasive_steer_willingness VALIDATED 4 episoade, eroare 0.0124; crosswalk_approach_speed VALIDATED 5 episoade, eroare 0.0000; horn_use_probability VALIDATED 4 episoade, eroare 0.0076
- PASS `clearance-m-unknown`: pedestrian_clearance UNOBSERVED / CLEARANCE_M_UNKNOWN, obstacle_clearance UNOBSERVED / CLEARANCE_M_UNKNOWN
- PASS `clearance-m-inconsistent`: pedestrian_clearance UNOBSERVED / CLEARANCE_M_INCONSISTENT, obstacle_clearance UNOBSERVED / CLEARANCE_M_INCONSISTENT
- PASS `clearance-floor`: pedestrian_clearance UNOBSERVED / CLEARANCE_FLOOR_SATURATED (CLEARANCE_FLOOR_SATURATED×4), obstacle_clearance UNOBSERVED / CLEARANCE_FLOOR_SATURATED (CLEARANCE_FLOOR_SATURATED×4)
- PASS `clearance-margin`: pedestrian_clearance UNOBSERVED / CLEARANCE_ROOM_EXHAUSTED, obstacle_clearance UNOBSERVED / CLEARANCE_ROOM_EXHAUSTED
- PASS `reaction-saturation`: reacție saturată: UNOBSERVED / REACTION_DELAY_SATURATED
- PASS `adhesion-cap`: aderență redusă: UNOBSERVED / ADHESION_CAP_SATURATED
- PASS `evasion-no-space`: ocolire fără spațiu: UNOBSERVED / EVASION_NO_SPACE
- PASS `crosswalk-limit`: trecere plafonată: UNOBSERVED / CROSSWALK_LIMIT_SATURATED
- PASS `horn-forbidden`: claxon interzis: UNOBSERVED / HORN_FORBIDDEN
- PASS `yield-mandatory`: cedare obligatorie: UNOBSERVED / PEDESTRIAN_ALL_CROSSINGS_MANDATORY, spațiul rămâne CANDIDATE
- PASS `reaction-uncertainty`: reacții împrăștiate: UNOBSERVED / UNCERTAINTY_ABOVE_THRESHOLD, incertitudine 0.7434 > 0.2
- PASS `zero-horn`: refuz constant: CANDIDATE valoare 0, incertitudine 0.0200
- PASS `zero-evasion`: ocolire refuzată constant: CANDIDATE valoare 0, incertitudine 0.0200
- PASS `refusals`: MANUAL: 4 episoade refuzate, 0 admise; fără prefix: 4; toate cheile rămân neobservate
- PASS `policy-facts-only`: eșantionul poartă numai fapte ale comenzii 183: tick, speedMps, postedLimitMps, policyActive, reason, action, geometry, surfaceId, declaredM, pedestrian, obstacleId, clearance, reaction, emergencyBrake, evasion, crosswalk, horn
- PASS `policy-compatibility`: 8/8 fapte rejucate cu profilul estimat sunt identice cu cele ale profilului autorat (pedestrian_yield_probability:true=true, pedestrian_clearance:2.5=2.5, hazard_reaction_delay:78=78, obstacle_clearance:2.4=2.4, emergency_brake_intensity:5.2=5.2, evasive_steer_willingness:0.44999999999999996=0.44999999999999996, crosswalk_approach_speed:6=6, horn_use_probability:false=false)
- PASS `candidate-only`: politica 183-hazard-policy-v2, candidate-only true, semantică schimbată false, M citite comfort_deceleration/brake_reaction_delay/curve_lateral_accel/yield_time_gap, rată 60 Hz
- PASS `determinism`: digest fnv1a32:57a8782d

**Sumar: 23/23 verificări, 8 chei candidate, 0 chei neobservate, PASS.**
