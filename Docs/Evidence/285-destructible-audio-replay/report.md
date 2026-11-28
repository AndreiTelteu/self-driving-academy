# 285 destructible decor, audio and replay — deterministic report

Generated: 2026-11-28T00:00:00.000Z
Contract: 285-live-chaos-v1
Level: targeted
Checks: 13/13 passed, 0 failed

## Plan

- 35 definitions in 3 playground zones (467 structural ids).
- zone:drift:surface:ix:2-2: DRIFT_PAD, 0 destructibles, 2 entries, 2 routes.
- zone:ramp:surface:lane:03N0: RAMP, 0 destructibles, 2 entries, 2 routes.
- zone:alley:walk:blk:3-0:N: DEMOLITION_ALLEY, 35 destructibles, 2 entries, 2 routes.

## Material matrix

| Archetype | Material | Rate | Gain | Tier | Move N·s | Break N·s | Fragments |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FENCE_LIGHT | WOOD | 0.82 | 0.55 | HEAVY | 15.6 | 117 | 2 |
| CONE | PLASTIC | 1.25 | 0.35 | HEAVY | 1.25 | 37.5 | 2 |
| CRATE | WOOD | 0.7 | 0.7 | HEAVY | 7.2 | 99 | 2 |
| BIN | METAL | 1.05 | 0.8 | HEAVY | 7.7 | 110 | 2 |
| DECOR_SIGN | GLASS | 1.45 | 0.9 | HEAVY | 3.6 | 72 | 2 |
| STREET_FURNITURE | METAL | 0.6 | 1 | HEAVY | 22.5 | 180 | 2 |

## Acceptance checks

| Check | Result | Detail |
| --- | --- | --- |
| material-threshold | PASS | 6 archetypes, 6 distinct playback rates, 4 materials |
| audio-gesture-fallback | PASS | pre-gesture reaction AWAITING_GESTURE with SHOCK_RING |
| source-parity | PASS | MANUAL:BROKEN, LEARNING:BROKEN, AUTO:BROKEN |
| light-yields | PASS | {"state":"MOVED","blocking":false,"vehicleDeltaVMps":0.000938,"bodyAdmitted":false} |
| dedup | PASS | {"firstBroken":2,"secondBroken":2,"firstReactions":2,"secondReactions":2,"duplicateBreaks":0,"impacts":1} |
| chain-instigator | PASS | {"events":2,"chain":1,"instigators":["probe-vehicle","destructible:zone:alley:walk:blk:3-0:N:crate:2"],"chainBreaks":1} |
| audio-cap | PASS | {"played":4,"refused":2,"impactVoices":4,"buffers":1,"bufferBytes":39692} |
| fragment-cap-lifetime | PASS | {"peak":4,"dropped":8,"activeAfterLifetime":0,"poolCap":4} |
| reset-restores-xp-profile | PASS | {"restored":true,"baseline":true,"xpUnchanged":true,"profileUnchanged":true,"xp":[500000,500000]} |
| replay-order-zeros | PASS | {"status":"REPLAYED","recordedEvents":2,"destructionEvents":1,"resetEvents":1,"orderIdentical":true,"eventsIdentical":true,"reactionFingerprints":["id-v1:19:destructible-broken21:285-live-chaos-report2:201:045:destructible:zone:alley:walk:blk:3-0:N:bin:19/destructible:zone:alley:walk:blk:3-0:N:bin:19/BIN/METAL/HEAVY/1.000/1.050/0.8000/2/FRAGMENT_BURST"],"stepsSimulation":0,"policyEvaluations":0,"awardsGranted":0,"learningArtifacts":0} |
| replay-reset-order | PASS | latest chunk: 1 destruction, 1 reset, order true |
| structural-boundary | PASS | {"structuralIds":467,"destructibleIds":35,"overlaps":[],"untouched":true} |
| caps-reported | PASS | objects 35/96, fragments 0/192, impact voices 4, replay 1/4096 |

## Caps and reset

- Objects 35/96; fragments 0/192; impact voices 4; buffers 8.
- Resets: 20; restored true; baseline true; XP unchanged true; profile unchanged true.
- Replay latest: 1 destruction, 1 reset, order true, events true, simulation steps 0, policy evaluations 0, awards 0, learning artifacts 0.
- Structural boundary: untouched; overlaps 0.

## Cost

Structural ownership counters only. Wall-clock and heap measurements are written by the separate cost command in `cost.json`; FPS, GPU and hardware are not claimed.

## Limitations

- The live Rapier composition has six free named-obstacle slots after ninety buildings; only the nearest six logical objects are bound at once.
- The browser probe injects a contact through the same 227/228/207 path; it is labelled PROBE_INJECTED, not a driven collision.
- The report is a targeted deterministic contract report, not an FPS, GPU or hardware measurement.
- Ambient audio is not implemented: the 148 cue table has no ambient cue and no second audio system was created.
