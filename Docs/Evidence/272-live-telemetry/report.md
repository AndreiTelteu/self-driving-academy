# 272 — telemetry, opportunities and eligibility from live driving

Deterministic report generated from the real 032/033 map and the live V3 composition. It does not
start learning, publish a profile or write XP.

## Results

| Scenario | Facts |
| --- | --- |
| Fleet | 58/58 vehicles, 10440 world rows, 0 dropped |
| Follow | 1 deduplicated follower episode(s) |
| MANUAL segment | 90 samples, 0 demonstrations |
| LEARNING segment | 60 samples, 1 closed segments, 61 readable samples |
| STOP | 1 opportunity, 1 unique occurrence, 5 duplicate frames, ELIGIBLE/FREE_TRAFFIC |
| Signal | 1 opportunity, GREEN, ELIGIBLE/FREE_TRAFFIC |
| Artifacts | SUSPENSION_FOCUS_LOST, RECOVERY_TELEPORT, gap false, prefix 39 ticks |
| Buffer | 1024/1024 retained, 176 dropped, 86030 B |
| Dedupe | 1 unique, 5 duplicates |

Profile fingerprint: `4ec212b3cc19e56a1c064490592a137db803ee039de3ef0b118099e5f939e518`; publications 0, jobs 0, XP changes 0.

## Checks

| Check | Verdict | Detail |
| --- | --- | --- |
| `all-58-live-vehicles` | PASS | 58/58 vehicles contribute |
| `camera-and-selection-independent` | PASS | no camera/selection filter is applied to the world ring or opportunity facts |
| `world-samples-bounded` | PASS | 1024/1024 rows retained, 176 dropped |
| `manual-metrics-not-demonstration` | PASS | 90 MANUAL samples, 0 demonstrations |
| `learning-segment-closed-and-exposed` | PASS | 60 LEARNING samples, 61 readable |
| `follow-context-observed` | PASS | 1 follower episode(s) deduped by vehicle+leader acquisition |
| `stop-opportunity-deduped` | PASS | 1 unique occurrence, 5 duplicate frames |
| `stop-window-eligible` | PASS | ELIGIBLE/FREE_TRAFFIC, 1 eligible occurrence |
| `real-signal-opportunity` | PASS | GREEN from the real 036 movement, ELIGIBLE |
| `pause-focus-teleport-artifacts` | PASS | SUSPENSION_FOCUS_LOST, RECOVERY_TELEPORT, prefix 39 ticks |
| `no-learning-and-no-profile-publication` | PASS | 0 jobs, 0 profile publications, 0 demonstrations |
| `memory-within-recorder-budget` | PASS | 1416464 B live fleet, 86030 B bounded probe |

Summary: **12/12 PASS**.
