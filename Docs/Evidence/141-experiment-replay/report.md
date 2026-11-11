# Raport determinist 141 — replay vizual din stări înregistrate

- Contract: `141-experiment-replay-v1` peste `207-world-replay-chunk-v1` ancorat pe `206-world-snapshot-v1`
- Cadru: 60 Hz, eșantioane 20 Hz (cadență 3 tickuri)
- Chunk: `session-141:incident:event-collision-141-400`, 129377 bytes, `ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218`
- Fereastră cerută 340..520, stocată 340..520, sigilată la 520
- Completitudine sursă: COMPLETE
- Eșantioane observate: 60 (342..519)

## Incidentul redat

- Auto-only: true; vizibilitate: OUTSIDE_CAMERA; invizibil: true
- Tick incident 400, clasificare citită din tick 399

| Entitate | Clasă | Mod | În cameră |
| --- | --- | --- | --- |
| taxi-02 | TAXI | AUTO | false |
| taxi-03 | TAXI | AUTO | false |

| Entitate | Fapt | Tick exact |
| --- | --- | --- |
| civil-01 | CREATED | 380 |
| civil-03 | REMOVED | 406 |

## Seek la incident

- Cerut 400, aterizat 399, exact false, ancoră de incident true

| Motiv | Interval | Detaliu |
| --- | --- | --- |
| TICK_NOT_OBSERVED | 400..400 | The seek target 400 has no recorded row; the replay lands on 399 and declares 1 tick(s) absent |

## Pauză

- Stare PAUSED; tick 399 → 399
- Cadru identic înainte/după: true; poziție identică: true
- `play()` în timpul pauzei: PAUSED

## Ciclul de viață al vehiculelor

- Vehicul creat la tick 380, prima linie observată 381
- Vehicul eliminat la tick 406; poză la eliminare: ABSENT/ENTITY_REMOVED
- Prezent pe linia de dinainte: true; absent după: true
- Reînviat în replay: 0 cadre

## Replay

- 41 cadre, 41 tickuri, 399..519, absențe declarate: 0
- Interpolare la tick 400 între 399 și 402 (alpha 0.3333333333333333), identică cu 207: true

## Ferestre parțiale și goluri

- Clip sigilat devreme: PARTIAL, declarat parțial true, motive CAPTURE_FINALIZED_EARLY
- Interval lipsă declarat: 431..520 (fereastra stocată se termină la 430)
- Captură cu gol: PARTIAL, interval 441..468, poziție în gol: ABSENT/TICK_NOT_OBSERVED

## Imutabilitate

- Operații verificate: SEEK, PAUSE, RESUME, SEEK, PLAY, REPLAY
- Neschimbat: true; scrieri live: 0
- Profil `fnv1a64:883e718e91bbcbd5`
- learning `5f9bdd0d3962f6e8f25b1d4264d0cccb4bcde4f22369479e7fe1aaeac1409a51`
- rewards `1e4092d867943b66ef2dcef9103fdb0271a6ac0c827097ec28375aaf8e5de1ef`
- kpi `715c118ae2024171eabcb1eae9e69d6eef649767be327054252433a566eea146`

| Operație | Amprente | Schimbate |
| --- | --- | --- |
| SEEK | identice | - |
| PAUSE | identice | - |
| RESUME | identice | - |
| SEEK | identice | - |
| PLAY | identice | - |
| REPLAY | identice | - |

- Probă de control revenue: true; probă de control profil: true

## Refuzuri demonstrate

| Probă | Etapă | Coduri | Detaliu |
| --- | --- | --- | --- |
| CHECKSUM_CORRUPTED | SOURCE | CHECKSUM_MISMATCH | CHECKSUM_MISMATCH: The stored chunk does not match its checksum (chunk.checksum) |
| CHUNK_VERSION | SOURCE | INVALID_SOURCE | INCOMPATIBLE_VERSION: Expected 207-world-replay-chunk-v1 (chunk.chunkVersion) |
| NOT_PINNED | SOURCE | INVALID_SOURCE | INVALID_CHUNK: Only pinned incident chunks are stored (chunk.pinned) |
| FOREIGN_SESSION | IDENTITY | FOREIGN_SOURCE | The chunk belongs to session-other/1, the experiment to session-141/1 |
| FOREIGN_EPOCH | IDENTITY | FOREIGN_SOURCE | The chunk belongs to session-141/2, the experiment to session-141/1 |
| INVALID_REQUEST | REQUEST | INVALID_REQUEST | The isolation needs a ledger port and a profile port (request.isolation) |
| SEEK_OUT_OF_WINDOW | SEEK | SEEK_OUT_OF_WINDOW | The seek target 2000 is outside the stored clip 340..520 |

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
| contract-version | 141-experiment-replay-v1 | 141-experiment-replay-v1 | PASS | 141 contract |
| source-contract | 207-world-replay-chunk-v1+206-world-snapshot-v1 | 207-world-replay-chunk-v1+206-world-snapshot-v1 | PASS | the projection consumes the sealed 207 chunk and its 206 anchor |
| no-policy | false | false | PASS | the replay never re-runs the policy |
| no-physics | false | false | PASS | the replay never re-runs the physics step |
| no-invented-ticks | false | false | PASS | an unobserved tick is declared, not invented |
| no-live-writes | false | false | PASS | a replay never writes live state |
| chunk-checksum | ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218 | ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218 | PASS | SHA-256 of the sealed chunk |
| chunk-bytes | 129377 | 129377 | PASS | canonical bytes of the sealed chunk |
| chunk-ticks | 340..520 | 340..520 | PASS | stored window |
| chunk-completeness | COMPLETE | COMPLETE | PASS | the complete capture declares itself complete |
| observed-ticks | 60 | 60 | PASS | recorded 20 Hz rows within the window |
| first-observed | 342 | 342 | PASS | first recorded row of the pin |
| last-observed | 519 | 519 | PASS | last recorded row of the pin |
| auto-only | true | true | PASS | the incident is AUTO only |
| outside-camera | OUTSIDE_CAMERA | OUTSIDE_CAMERA | PASS | both colliding vehicles are outside the camera |
| invisible | true | true | PASS | no involved vehicle was visible |
| incident-modes | AUTO,AUTO | AUTO,AUTO | PASS | the mode read from the classified tick |
| incident-classified-at | 399 | 399 | PASS | the tick the classification was read from |
| camera-filter | false | false | PASS | the camera is recorded, never used as a filter |
| created-in-window | civil-01@380 | civil-01@380 | PASS | a vehicle is created inside the pinned window |
| removed-in-window | civil-03@406 | civil-03@406 | PASS | a vehicle is removed inside the pinned window |
| seek-requested | 400 | 400 | PASS | the default seek target is the incident |
| seek-landed | 399 | 399 | PASS | the last recorded row before the incident |
| seek-exact | false | false | PASS | tick 400 has no transform row of its own |
| seek-at-incident | true | true | PASS | the landing is the incident anchor |
| seek-missing | TICK_NOT_OBSERVED 400..400 | TICK_NOT_OBSERVED 400..400 | PASS | the seek declares the tick it could not land on |
| seek-window | 340..520 | 340..520 | PASS | the requested pin window is reported |
| pause-status | PAUSED | PAUSED | PASS | pause freezes the replay |
| pause-tick | 399 | 399 | PASS | the tick does not move |
| pause-frame-identical | true | true | PASS | the frame is byte-identical before and after the pause |
| pause-position-identical | true | true | PASS | only the paused flag changes |
| pause-play-frozen | PAUSED | PAUSED | PASS | play while paused does not advance |
| pause-play-frozen-ticks | 0 | 0 | PASS | a frozen play advances zero ticks |
| removed-pose | ABSENT/ENTITY_REMOVED | ABSENT/ENTITY_REMOVED | PASS | no pose is interpolated across the removal |
| removed-before | true | true | PASS | the vehicle is still drawn on the row before its removal |
| removed-before-tick | 405 | 405 | PASS | the row before the removal lands exactly on 405 |
| removed-after | true | true | PASS | the vehicle is gone from every later recorded row |
| removed-no-resurrection | 0 | 0 | PASS | no frame after the removal tick carries the removed vehicle |
| created-before | false | false | PASS | the created vehicle does not exist before its creation tick |
| created-pose | ABSENT/ENTITY_NOT_YET_CREATED | ABSENT/ENTITY_NOT_YET_CREATED | PASS | a pose before the creation tick is declared absent |
| created-first-row | true | true | PASS | the first row after the creation tick carries the new vehicle |
| created-seek | 381 | 381 | PASS | the created vehicle appears at the first recorded row after 380 |
| partial-declared | true | true | PASS | an early seal is declared partial |
| partial-status | PARTIAL | PARTIAL | PASS | the partial clip is not presented whole |
| partial-reason | true | true | PASS | the reason is the closed 207 vocabulary |
| partial-missing | 431..520 | 431..520 | PASS | the missing post-incident span is declared |
| gap-declared | TICK_NOT_OBSERVED | TICK_NOT_OBSERVED | PASS | a capture gap is a declared absence |
| gap-range | 441..468 | 441..468 | PASS | the exact lost cadence span |
| gap-skipped | 1 | 1 | PASS | a step over the gap reports what it skipped |
| gap-pose | ABSENT/TICK_NOT_OBSERVED | ABSENT/TICK_NOT_OBSERVED | PASS | no pose is interpolated inside the gap |
| gap-step-tick | 471 | 471 | PASS | the next recorded row after the gap |
| interpolation-from | 399 | 399 | PASS | the pose is interpolated from the recorded row 399 |
| interpolation-to | 402 | 402 | PASS | to the recorded row 402 |
| interpolation-matches-207 | true | true | PASS | same result as the 207 helper |
| replay-frames | 41 | 41 | PASS | the run replays from the incident anchor (index 19) to the last observed row |
| replay-ticks | 41 | 41 | PASS | one frame per recorded row |
| replay-last-tick | 519 | 519 | PASS | the run ends on the last recorded row |
| replay-absences | 0 | 0 | PASS | the complete window has no capture gap; sub-cadence ticks are the declared 20 Hz interpolation |
| immutability-operations | SEEK,PAUSE,RESUME,SEEK,PLAY,REPLAY | SEEK,PAUSE,RESUME,SEEK,PLAY,REPLAY | PASS | every projection operation is verified |
| immutability-unchanged | true | true | PASS | profile, revenue, ratings, missions and XP are unchanged |
| immutability-live-writes | 0 | 0 | PASS | no live row was written |
| immutability-checks-unchanged | true | true | PASS | each operation compares its own before/after |
| immutability-ledger | true | true | PASS | the three ledger digests are identical |
| immutability-profile | true | true | PASS | the profile checksum is identical |
| control-revenue | true | true | PASS | a real revenue write changes the KPI digest and nothing else |
| control-profile | true | true | PASS | a real profile activation changes the profile checksum |
| refusal-checksum | SOURCE/CHECKSUM_MISMATCH | SOURCE/CHECKSUM_MISMATCH | PASS | a corrupted chunk is refused by the 207 reader |
| refusal-version | SOURCE/INVALID_SOURCE | SOURCE/INVALID_SOURCE | PASS | another chunk version is refused |
| refusal-unpinned | SOURCE/INVALID_SOURCE | SOURCE/INVALID_SOURCE | PASS | a chunk that is not a pinned incident clip is refused |
| refusal-session | IDENTITY/FOREIGN_SOURCE | IDENTITY/FOREIGN_SOURCE | PASS | a chunk recorded in another session is refused |
| refusal-epoch | IDENTITY/FOREIGN_SOURCE | IDENTITY/FOREIGN_SOURCE | PASS | a chunk of another world epoch is refused |
| refusal-request | REQUEST/INVALID_REQUEST | REQUEST/INVALID_REQUEST | PASS | an incomplete request is refused before any source is read |
| refusal-seek | SEEK/SEEK_OUT_OF_WINDOW | SEEK/SEEK_OUT_OF_WINDOW | PASS | a seek outside the stored window is refused |
| deterministic | true | true | PASS | two independent runs replay the same frames |

## Sumar

- Probe de refuz: 7
- Verificări: 74/74
- Rezultat: PASS
