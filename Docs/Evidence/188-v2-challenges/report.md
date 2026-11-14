# 188 Provocări pentru comportamentele extinse — raport determinist

- Schema: `188-extended-challenges-v1`
- Catalog extins: `188-extended-challenge-catalog-v1`
- Tick: 60 Hz
- Provocări: 15 (Pietoni 3, Rutare 3, Semnalizare 3, Pericole 3, Serviciu 3)
- Chei V2 acoperite: 12 template-uri 231 neschimbate + 15 provocări extinse = 27

## Cele cinci familii

| Familie | Provocări | ID-uri | Chei |
| --- | --- | --- | --- |
| Pietoni | 3 | v2-challenge-crosswalk-approach, v2-challenge-pedestrian-clearance, v2-challenge-pedestrian-yield | crosswalk_approach_speed, pedestrian_clearance, pedestrian_yield_probability |
| Rutare | 3 | v2-challenge-reroute-patience, v2-challenge-reverse-recovery, v2-challenge-u-turn-discipline | reroute_patience, reverse_recovery_duration, u_turn_willingness |
| Semnalizare | 3 | v2-challenge-green-launch, v2-challenge-red-gap, v2-challenge-yellow-decision | green_launch_acceleration, red_run_gap_acceptance, yellow_stop_probability |
| Pericole | 3 | v2-challenge-emergency-brake, v2-challenge-hazard-reaction, v2-challenge-obstacle-clearance | emergency_brake_intensity, hazard_reaction_delay, obstacle_clearance |
| Serviciu | 3 | v2-challenge-dropoff-curb, v2-challenge-pickup-dwell, v2-challenge-pickup-precision | dropoff_curb_distance, pickup_dwell_time, pickup_stop_precision |

## Cheile, evaluatorii și pragurile derivate

| Cheie | Familie | Evaluator | Derivare | Prag | Comparație | Valoare cheie | Default catalog | Oportunități | Podea | Țintă |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| crosswalk_approach_speed | PEDESTRIAN | crosswalk-approach-speed | MAX_SPEED_MPS | 5 mps | AT_MOST | 5 | 5 | 1 | — | 1 |
| dropoff_curb_distance | SERVICE | dropoff-curb | MAX_METRES | 0.5 m | AT_MOST | 0.5 | 0.5 | 1 | — | 1 |
| emergency_brake_intensity | HAZARD | emergency-brake | MIN_RATIO | 1 ratio | AT_LEAST | 1 | 1 | 1 | — | 1 |
| green_launch_acceleration | SIGNALLING | green-launch | MAX_ACCEL_MPS2 | 1.5 mps2 | AT_MOST | 1.5 | 1.5 | 1 | — | 1 |
| hazard_reaction_delay | HAZARD | hazard-reaction | MAX_TICKS | 30 ticks | AT_MOST | 0.5 | 0.5 | 1 | — | 1 |
| obstacle_clearance | HAZARD | obstacle-clearance | MIN_METRES | 1 m | AT_LEAST | 1 | 1 | 1 | — | 1 |
| pedestrian_clearance | PEDESTRIAN | pedestrian-clearance | MIN_METRES | 2 m | AT_LEAST | 2 | 2 | 1 | — | 1 |
| pedestrian_yield_probability | PEDESTRIAN | pedestrian-yield | MIN_YIELDS_PER_OPPORTUNITY | 4 count | AT_LEAST | 1 | 1 | 4 | — | 4 |
| pickup_dwell_time | SERVICE | pickup-dwell | MIN_TICKS | 180 ticks | AT_LEAST | 3 | 3 | 1 | — | 1 |
| pickup_stop_precision | SERVICE | pickup-precision | MAX_METRES | 1 m | AT_MOST | 1 | 1 | 1 | — | 1 |
| red_run_gap_acceptance | SIGNALLING | red-gap | MIN_TICKS | 150 ticks | AT_LEAST | 2.5 | 2.5 | 1 | — | 1 |
| reroute_patience | ROUTING | reroute-patience | MIN_TICKS | 1200 ticks | AT_LEAST | 20 | 20 | 1 | — | 1 |
| reverse_recovery_duration | ROUTING | reverse-recovery | MIN_TICKS | 150 ticks | AT_LEAST | 2 | 2 | 1 | 2.5 | 1 |
| u_turn_willingness | ROUTING | u-turn-discipline | MAX_COUNT_PER_OPPORTUNITY | 0 count | AT_MOST | 0 | 0 | 3 | — | 1 |
| yellow_stop_probability | SIGNALLING | yellow-decision | MIN_YIELDS_PER_OPPORTUNITY | 2 count | AT_LEAST | 0.8 | 0.8 | 2 | — | 2 |

## Obiective observabile și explicații

| Provocare | Familie | Cheie | Eveniment explicație | Măsurat vs prag | Fixture valid | Fixture invalid |
| --- | --- | --- | --- | --- | --- | --- |
| v2-challenge-crosswalk-approach | PEDESTRIAN | crosswalk_approach_speed | CROSSWALK_APPROACH | 7 vs 5 mps | PASSED | FAILED / APPROACH_TOO_FAST |
| v2-challenge-dropoff-curb | SERVICE | dropoff_curb_distance | DROPOFF_STOP | 1.4 vs 0.5 m | PASSED | FAILED / CURB_TOO_FAR |
| v2-challenge-emergency-brake | HAZARD | emergency_brake_intensity | EMERGENCY_BRAKE | 0.5 vs 1 ratio | PASSED | FAILED / BRAKE_TOO_WEAK |
| v2-challenge-green-launch | SIGNALLING | green_launch_acceleration | GREEN_RELEASE | 3.2 vs 1.5 mps2 | PASSED | FAILED / GREEN_LAUNCH_TOO_HARD |
| v2-challenge-hazard-reaction | HAZARD | hazard_reaction_delay | HAZARD_REACTION | 60 vs 30 ticks | PASSED | FAILED / REACTION_TOO_SLOW |
| v2-challenge-obstacle-clearance | HAZARD | obstacle_clearance | OBSTACLE_PASS | 1.5 vs 1 m | PASSED | FAILED / OBSTACLE_CONTACT |
| v2-challenge-pedestrian-clearance | PEDESTRIAN | pedestrian_clearance | PEDESTRIAN_CLEARED | 1.2 vs 2 m | PASSED | FAILED / CLEARANCE_SHORTFALL |
| v2-challenge-pedestrian-yield | PEDESTRIAN | pedestrian_yield_probability | PEDESTRIAN_YIELDED | 3 vs 4 count | PASSED | INCOMPLETE / PROGRESS |
| v2-challenge-pickup-dwell | SERVICE | pickup_dwell_time | PICKUP_BOARDING | 60 vs 180 ticks | PASSED | FAILED / DWELL_TOO_SHORT |
| v2-challenge-pickup-precision | SERVICE | pickup_stop_precision | PICKUP_STOP | 2 vs 1 m | PASSED | FAILED / STOP_OUTSIDE_WINDOW |
| v2-challenge-red-gap | SIGNALLING | red_run_gap_acceptance | RED_GAP | 60 vs 150 ticks | PASSED | FAILED / RED_GAP_SHORTFALL |
| v2-challenge-reroute-patience | ROUTING | reroute_patience | ROUTE_REROUTE | 300 vs 1200 ticks | PASSED | FAILED / REROUTE_TOO_EARLY |
| v2-challenge-reverse-recovery | ROUTING | reverse_recovery_duration | REVERSE_RECOVERY | 60 vs 150 ticks | PASSED | FAILED / RECOVERY_TOO_SHORT |
| v2-challenge-u-turn-discipline | ROUTING | u_turn_willingness | U_TURN | 1 vs 0 count | PASSED | FAILED / ILLEGAL_U_TURN |
| v2-challenge-yellow-decision | SIGNALLING | yellow_stop_probability | YELLOW_DECISION | 1 vs 2 count | PASSED | FAILED / YELLOW_CROSSED |

## Evaluatori puri

| Evaluator | Familie | Flux de fapte | Derivare | Comparație | Țintă | Evenimente |
| --- | --- | --- | --- | --- | --- | --- |
| crosswalk-approach-speed | PEDESTRIAN | PEDESTRIAN_CROSSINGS | MAX_SPEED_MPS | AT_MOST | SINGLE | CROSSWALK_APPROACH, DEADLINE_EXPIRED, INCIDENT |
| dropoff-curb | SERVICE | SERVICE_STOPS | MAX_METRES | AT_MOST | SINGLE | DROPOFF_STOP, DEADLINE_EXPIRED, INCIDENT |
| emergency-brake | HAZARD | HAZARD_PASSES | MIN_RATIO | AT_LEAST | SINGLE | EMERGENCY_BRAKE, DEADLINE_EXPIRED, INCIDENT |
| green-launch | SIGNALLING | SIGNAL_OPPORTUNITIES | MAX_ACCEL_MPS2 | AT_MOST | SINGLE | GREEN_RELEASE, DEADLINE_EXPIRED, INCIDENT |
| hazard-reaction | HAZARD | HAZARD_PASSES | MAX_TICKS | AT_MOST | SINGLE | HAZARD_REACTION, DEADLINE_EXPIRED, INCIDENT |
| obstacle-clearance | HAZARD | HAZARD_PASSES | MIN_METRES | AT_LEAST | SINGLE | OBSTACLE_PASS, DEADLINE_EXPIRED, INCIDENT |
| pedestrian-clearance | PEDESTRIAN | PEDESTRIAN_CROSSINGS | MIN_METRES | AT_LEAST | SINGLE | PEDESTRIAN_CLEARED, DEADLINE_EXPIRED, INCIDENT |
| pedestrian-yield | PEDESTRIAN | PEDESTRIAN_CROSSINGS | MIN_YIELDS_PER_OPPORTUNITY | AT_LEAST | THRESHOLD | PEDESTRIAN_YIELDED, DEADLINE_EXPIRED, INCIDENT |
| pickup-dwell | SERVICE | SERVICE_STOPS | MIN_TICKS | AT_LEAST | SINGLE | PICKUP_BOARDING, DEADLINE_EXPIRED, INCIDENT |
| pickup-precision | SERVICE | SERVICE_STOPS | MAX_METRES | AT_MOST | SINGLE | PICKUP_STOP, DEADLINE_EXPIRED, INCIDENT |
| red-gap | SIGNALLING | SIGNAL_OPPORTUNITIES | MIN_TICKS | AT_LEAST | SINGLE | RED_GAP, DEADLINE_EXPIRED, INCIDENT |
| reroute-patience | ROUTING | ROUTE_DECISIONS | MIN_TICKS | AT_LEAST | SINGLE | ROUTE_REROUTE, DEADLINE_EXPIRED, INCIDENT |
| reverse-recovery | ROUTING | RECOVERY_ATTEMPTS | MIN_TICKS | AT_LEAST | SINGLE | REVERSE_RECOVERY, DEADLINE_EXPIRED, INCIDENT |
| u-turn-discipline | ROUTING | ROUTE_DECISIONS | MAX_COUNT_PER_OPPORTUNITY | AT_MOST | SINGLE | U_TURN, DEADLINE_EXPIRED, INCIDENT |
| yellow-decision | SIGNALLING | SIGNAL_OPPORTUNITIES | MIN_YIELDS_PER_OPPORTUNITY | AT_LEAST | THRESHOLD | YELLOW_DECISION, DEADLINE_EXPIRED, INCIDENT |

## Compatibilitate V1

- Catalog 231: 12 template-uri, digest `fnv1a32:9714302b` (pre-188 `fnv1a32:9714302b`)
- Progres campanie: 8 misiuni finalizate, digest `fnv1a32:7f45fc70`
- Deblocări: monotone `true`, digest `fnv1a32:0da1f677`
- Acces vehicule: 64/64 conduse, 24/24 taxiuri selectabile, revocate 0, taxiuri blocate 0
- PlayerProgress: digest `fnv1a32:8646bf48`, import `fnv1a32:92f67b0f`
- Import progres V1 înainte/după: `fnv1a32:4dbf7b01` / `fnv1a32:99fbd1de`, identic `true`
- Scrieri de profil: 0, joburi de learning: 0

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
| families | 5 | 5 | PASS | The catalog covers the five authored families |
| family-minimum | 3 | 3 | PASS | Each family carries at least one challenge, in the delivered catalog three |
| challenges | 15 | 15 | PASS | Fifteen extended challenges are authored |
| v1-templates | 12 | 12 | PASS | The delivered 231 catalog still has twelve templates |
| composed-total | 27 | 27 | PASS | The composed catalog publishes both halves without sharing an id |
| v1-catalog-digest | fnv1a32:9714302b | fnv1a32:9714302b | PASS | The 231 catalog bytes are the pre-188 bytes |
| v2-keys | 56 | 56 | PASS | The 187 table exposes the 56 extended keys |
| covered-keys | 15 | 15 | PASS | Fifteen distinct real V2 keys are covered by the delivered challenges |
| no-v1-key | 0 | 0 | PASS | No challenge uses a V1 key as its context |
| passing-fixtures | 15 | 15 | PASS | Every challenge passes a realizable tick-window fixture |
| failing-fixtures | 15 | 15 | PASS | Every challenge fails an invalid fixture that changes only the governed fact |
| v1-progress-digest | fnv1a32:7f45fc70 | fnv1a32:7f45fc70 | PASS | The 125 campaign progress is the pre-188 snapshot |
| v1-unlocks-digest | fnv1a32:0da1f677 | fnv1a32:0da1f677 | PASS | The 125 unlock list is the pre-188 snapshot |
| v1-access-digest | fnv1a32:bdd636b4 | fnv1a32:bdd636b4 | PASS | The 125 vehicle access is the pre-188 snapshot |
| v1-player-digest | fnv1a32:8646bf48 | fnv1a32:8646bf48 | PASS | The 213 player progress is the pre-188 snapshot |
| v1-checkpoint-digest | fnv1a32:92f67b0f | fnv1a32:92f67b0f | PASS | The 213 progress import round-trips byte for byte |
| v1-before-after | true | true | PASS | Progress, unlocks, access and player progress are identical after the 188 work |
| v1-missions-completed | 8 | 8 | PASS | The whole delivered campaign completed through the real 116 tracker |
| v1-taxis-selectable | 24 | 24 | PASS | All 24 real taxis stay selectable |
| v1-vehicles-driveable | 64 | 64 | PASS | All 64 real fleet vehicles stay driveable |
| v1-revoked | 0 | 0 | PASS | No unlock can revoke a vehicle |
| v1-blocked-taxis | 0 | 0 | PASS | No taxi is blocked by progress |
| v1-import-stable | true | true | PASS | Importing the V1 progress returns the same digest before and after |
| profile-writes | 0 | 0 | PASS | The whole extended catalog writes no profile |
| learning-jobs | 0 | 0 | PASS | The whole extended catalog starts no learning job |

## Determinism

- Rulări comparate: 2
- Stabile: `true`
- Digest: `fnv1a32:a043542d`

## Sumar

- Verificări: 40/40
- Rezultat: PASS

Template-uri 231 declarate neschimbate: 12.
Provocări extinse: 15. Chei V2 necoperite: 41.
Limite: 32 provocări, 32 fapte per flux, 8 încercări.
