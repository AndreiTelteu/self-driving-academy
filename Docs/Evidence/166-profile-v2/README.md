# 166 — scheme și suport V2 pentru profile

PBI 166 versionează suportul celor 80 de chei ale catalogului 092 și migrează profilele V1 fără
estimări fabricate. Contractul este [`166-profile-v2-v1`](../../../src/profiles/profile-v2.ts);
raportul determinist este [report.json](report.json), iar varianta umană [report.md](report.md).

Regula oracolului: fiecare valoare provine din documentul V1 de fixture sau din defaultul real al
catalogului 092. Un rând `DEFAULT` nu are dovezi, încredere sau incertitudine; un rând `UNSET` nu are
valoare deloc. Nicio cheie R nu devine LEARNED sau MANUAL_TUNING prin migrare.

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Verificări ale raportului | **15/15 PASS** |
| Chei în schemă | **80** (24 V1 + 56 R) |
| Chei setate de jucător, moștenite din V1 | **5 / 4** |
| Chei default din catalog | **71** (15 chei V1 absente + 56 R) |
| Chei nesetate (politica UNSET) | **56** |
| Chei V1 verificate pentru echivalență | **9**, diferențe **0** |
| Checksum V2 al fixture-ului | `fnv1a64:3e31e4d29b287964` |
| Checksum V1 păstrat la rollback | `fixture:academy-style-v7` |
| Amprenta SHA-256 a raportului | `094228fac6b9332d5597a8ae9343256f05002d09a9eb2bcfa880b8375c4f80ad` |
| Verdict | **PASS** |

## Cum migrează un profil V1

`migrateProfileV1ToV2` citește documentul prin parserul V1 deja livrat (`parseDrivingProfile`), apoi
parcurge catalogul 092 în ordinea lui:

- **cheie prezentă în V1** → valoarea, unitatea, proveniența și dovezile rămân neschimbate. Originea
  este `PLAYER_SET` pentru `MANUAL_TUNING`/`IMPORTED` și `INHERITED_V1` pentru `BASE`/`LEARNED`;
  sursa este `v1:<proveniență>`, deci se vede exact cine a produs valoarea.
- **cheie absentă** → primește `defaultul` din catalog (`catalog:092-catalog-1@2026-10-04#default`),
  originea `DEFAULT`, sursa de dovezi `CATALOG_DEFAULT`, zero dovezi. Este un default de proiectare,
  nu o estimare din date inexistente.
- **cheie R cu politica `UNSET`** → valoare `null`, originea `UNSET`, motivul `RESERVED_UNSET`, iar
  cheia lipsește din mapa `parameters`. Varianta implicită rămâne `DEFAULT`, pentru că cerința este
  ca un profil V1 să rămână utilizabil cu default pentru cheile noi.

`migratedFrom` păstrează documentul V1 integral, cu checksum-ul lui. De aceea `rollbackProfileV2ToV1`
întoarce exact profilul V1: aceleași 9 valori, unități, proveniențe, dovezi, identitate și checksum.
O valoare reglată direct în schema V2 (`source: v2:MANUAL_TUNING`) nu poate fi reprezentată în V1 și
rollback-ul este refuzat cu `MIGRATION_NOT_REPRESENTABLE`, nu pierdută tacit.

## Versionare și refuzuri explicite

Profilul V2 are `schemaVersion: 2` și `catalogVersion: 092-catalog-1@2026-10-04`. `readProfileDocument`
acceptă un document curent, migrează explicit unul V1 și refuză restul **înainte** de a interpreta
valori. `parseDrivingProfile` refuză schema 2, deci niciun build V1 nu poate citi greșit un profil V2.

| Caz | Cod real măsurat |
| --- | --- |
| Schemă mai nouă (`schemaVersion: 3`) | `SCHEMA_TOO_NEW` |
| Catalog mai nou (`...@2027-01-01`) | `CATALOG_TOO_NEW` |
| Catalog necunoscut, mai vechi | `CATALOG_UNSUPPORTED` |
| Cheie inexistentă în catalog | `UNKNOWN_KEY` |
| Unitate diferită de catalog | `UNIT_MISMATCH` |
| Valoare în afara intervalului 092 | `VALUE_OUT_OF_RANGE` |
| Cheie R într-un profil V1 | `RESERVED_KEY_IN_V1` |
| Document V2 incomplet sau cu suport fals | `INVALID_PROFILE` |
| Checksum V2 modificat | `CHECKSUM_MISMATCH` |
| Reglaj V2 după migrare, la rollback | `MIGRATION_NOT_REPRESENTABLE` |

## Proiecția pentru UI: cheie → sursă → valoare

`projectProfileV2ForUi` produce 80 de rânduri, în ordinea catalogului. Fiecare rând declară originea
(`PLAYER_SET`, `INHERITED_V1`, `DEFAULT`, `UNSET`) cu etichetă în română, sursa reală, suportul
derivat strict din registru (`SUPPORTED` = 23 chei implementate, `DEFAULT_ONLY` = chei V1
neimplementate, `RESERVED` = cele 56 R), sursa dovezilor și motivul în text.

| Cheie | Stadiu | Origine | Sursă | Suport | Dovezi | Valoare | Dovezi efective |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| `speed_delta_urban` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | V1_PROVENANCE | 1.5 | 0 |
| `speed_delta_residential` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 0.4 | 0 |
| `speed_delta_arterial` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `curve_lateral_accel` | V1 | PLAYER_SET | v1:IMPORTED | SUPPORTED | V1_PROVENANCE | 3.1 | 0 |
| `intersection_approach_speed` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 6 | 0 |
| `cruise_speed_variability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `overtake_speed_bonus` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `cruise_accel_deadband` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `desired_acceleration` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1.5 | 0 |
| `comfort_deceleration` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `acceleration_jerk` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `braking_jerk` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `throttle_release_delay` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.2 | 0 |
| `brake_reaction_delay` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 0.5 | 0 |
| `launch_intensity` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.6 | 0 |
| `coasting_bias` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.4 | 0 |
| `following_time_headway` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | PROFILE_EVIDENCE | 2.1 | 6 |
| `following_min_gap` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 2.6 | 0 |
| `queue_standstill_gap` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `cutin_brake_response` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.7 | 0 |
| `following_speed_gain` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 0.7 | 0 |
| `closing_ttc_threshold` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `leader_change_delay` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.2 | 0 |
| `following_hysteresis` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `red_stop_probability` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | V1_PROVENANCE | 1 | 0 |
| `yellow_stop_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.8 | 0 |
| `green_start_delay` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 0.7 | 0 |
| `red_stop_line_offset` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1 | 0 |
| `red_run_gap_acceptance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2.5 | 0 |
| `yellow_commit_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `green_launch_acceleration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1.5 | 0 |
| `late_red_brake_threshold` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `stop_full_probability` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1 | 0 |
| `stop_dwell_time` | V1 | INHERITED_V1 | v1:BASE | SUPPORTED | V1_PROVENANCE | 1.9 | 0 |
| `stop_line_offset` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 1 | 0 |
| `yield_time_gap` | V1 | INHERITED_V1 | v1:BASE | DEFAULT_ONLY | V1_PROVENANCE | 4 | 0 |
| `rolling_stop_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `priority_assertiveness` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `allway_stop_patience` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `blocked_intersection_entry_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `lane_change_front_gap` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 12 | 0 |
| `lane_change_back_gap` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 10 | 0 |
| `lane_change_speed_gain` | V1 | DEFAULT | catalog:092-catalog-1@2026-10-04#default | SUPPORTED | CATALOG_DEFAULT | 2 | 0 |
| `lane_change_cooldown` | V1 | PLAYER_SET | v1:MANUAL_TUNING | SUPPORTED | V1_PROVENANCE | 3.2 | 0 |
| `lane_change_duration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `signal_lead_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `signal_use_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `pass_on_right_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `lane_center_offset` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `steering_response_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `steering_rate_limit` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `turn_entry_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 5 | 0 |
| `turn_exit_acceleration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1.5 | 0 |
| `corner_cutting_bias` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `lateral_clearance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.8 | 0 |
| `lateral_correction_deadband` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.1 | 0 |
| `route_time_weight` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.6 | 0 |
| `route_distance_weight` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `route_turn_penalty` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `route_signal_penalty` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 5 | 0 |
| `route_congestion_penalty` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `reroute_patience` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 20 | 0 |
| `u_turn_willingness` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0 | 0 |
| `reverse_recovery_duration` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `pedestrian_yield_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `pedestrian_clearance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 2 | 0 |
| `hazard_reaction_delay` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `obstacle_clearance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `emergency_brake_intensity` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `evasive_steer_willingness` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.3 | 0 |
| `crosswalk_approach_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 5 | 0 |
| `horn_use_probability` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.1 | 0 |
| `pickup_approach_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `pickup_curb_distance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `pickup_stop_precision` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 1 | 0 |
| `pickup_dwell_time` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `dropoff_approach_speed` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 3 | 0 |
| `dropoff_curb_distance` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.5 | 0 |
| `occupied_acceleration_scale` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.85 | 0 |
| `occupied_lateral_accel_scale` | R | DEFAULT | catalog:092-catalog-1@2026-10-04#default | RESERVED | CATALOG_DEFAULT | 0.85 | 0 |

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS |
| `npm run check:parameter-catalog` | catalogul 092 neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/profiles/profile-v2.test.ts` | 14 teste, 14 PASS |
| `npm test` | 2956 teste, 2956 PASS, 0 fail (103,6 s) |
| `npm run profile:v2` | 15/15 verificări PASS, raport scris |
| `npm run profile:v2 -- --check` | `report.json` și `report.md` actuale |

Testele acoperă: migrarea documentului V1 de fixture și a unei versiuni 109 reale, defaults pentru
cele 56 de chei R, politica `UNSET`, echivalența celor 9 valori V1, rollback-ul exact cu checksum,
respingerea schemei/catalogului prea nou, a intrării invalide, a cheii R într-un profil V1, a
checksum-ului modificat și a suportului fals, refuzul rollback-ului după un reglaj V2, determinismul
și înghețarea rezultatului. Importul/exportul 133/134 nu a fost atins; regresia lui este acoperită de
suita completă.

## Fișiere atinse

- `src/profiles/profile-v2.ts` — contractul `166-profile-v2-v1`.
- `src/profiles/profile-store.ts` — `profileContentHash`, primitiva FNV-1a deja folosită de 109, expusă pentru checksum-ul V2.
- `src/profiles/index.ts` — suprafața publică.
- `tests/profiles/profile-v2.test.ts`, `tests/profiles/profile-v2-suite.ts` — teste și oracolul raportului.
- `scripts/run-profile-v2-report.mjs`, `package.json` — raportul determinist.
- `Docs/12-profiluri-si-propagare.md`, `Docs/15-salvare-si-import-export.md` — secțiunile contractului.

## Limitări

- Niciun controler nu consumă încă valorile R: proiecția declară `RESERVED`, iar 092 rămâne fail-closed. Migrarea le cară ca default, nu le activează.
- Catalogul livrat nu are nicio cheie estimabilă (`estimable: false` pentru toate cele 80), deci un profil V1 real nu poate conține LEARNED; ramura `V1_LEARNED_VALUE` a migrării este acoperită structural, nu cu un profil LEARNED publicabil.
- Documentul V2 este un read model derivat; nu s-a adăugat un rând nou în schema 127, iar rândurile 109 rămân sursa imuabilă. Persistarea V2 nu este cerută de criterii.
- Valoarea `v2:MANUAL_TUNING` este acceptată ca sursă pentru un reglaj ulterior migrării, dar PBI 166 nu livrează un editor de profile V2; testul o construiește explicit pentru a dovedi refuzul rollback-ului.
