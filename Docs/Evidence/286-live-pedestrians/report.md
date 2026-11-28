# 286 live pedestrians, crossings and hazards — deterministic report

Generated: 2026-11-28T00:00:00.000Z
Contract: 286-live-pedestrian-hazards-v1
Level: V2
Checks: 9/9 passed, 0 failed

## Real network

- 80 authored crosswalks, 48 live links, 32 refused links.
- 96 pedestrians created (96 requested).
- Crossing length: 10.00–17.40 m, mean 12.47 m.

## Crossing phase and yield

- Phases observed: ON_SIDEWALK → WAITING → CROSSING → CROSSED → WITHDRAWN.
- Crossings: 96 started, 92 completed; 2 asserted, 94 gap accepted.
- Proven yield: conflict tick 197, physical stop tick 284, outcome YIELDED.
- Stop distance 9.68 m, minimum observed 9.68 m, speed at stop 0.17 m/s.
- Coverage: 900 complete steps, 0 incomplete steps.
- Unobserved run: 92 unobserved crossings, 0 stop events, yield rate MISSING.

## Hazard obstacle in the same 282 world

- Named boxes added/active: 1/1; incidents 0.
- Encounter outcome: PASSED_CLEAR; contact tick none; minimum distance 4.03 m.
- Reaction: BRAKE at tick 198, latency 197 ticks.
- Avoidance: PASSED_CLEAR, no contact, minimum centre distance 4.03 m.

## V2 context

- 900 live frames; facts: SPEED_MEASURED, ROAD_TYPE_URBAN, THROTTLE_INPUT, LONGITUDINAL_ACCEL, CONFLICT, PEDESTRIAN, COASTING, BRAKE_INPUT.
- Observable keys: cruise_speed_variability, cruise_accel_deadband, braking_jerk, coasting_bias, pedestrian_yield_probability, pedestrian_clearance, hazard_reaction_delay.

## Cost for 96 pedestrians and 96 hazards

- 96 pedestrians, 96 hazard data obstacles, 600 steps.
- Evaluations: 53985 pedestrian, 103664 hazard; peaks 96 pedestrians, 192 hazards per step.
- Wall-clock p50/p95 are reported by the separate `pedestrians:live:cost` probe; this deterministic
  report keeps only structural counters.

## Acceptance checks

| Check | Result | Detail |
| --- | --- | --- |
| network-real-crosswalks | PASS | 48 links on 80 crosswalks, 96 pedestrians |
| crossing-phase | PASS | 96 started, 92 completed |
| yield-real-tick-order | PASS | conflict tick 197, stop tick 284, outcome YIELDED |
| yield-real-physics-distance | PASS | stop 9.68 m, minimum 9.68 m |
| unobserved-no-yield | PASS | 92 unobserved crossings, stop events 0 |
| obstacle-same-physics | PASS | box added 1, outcome PASSED_CLEAR, incidents 0 |
| obstacle-reaction-and-avoidance | PASS | reaction BRAKE +197 ticks, clearance 4.03 m, contact none |
| v2-context-live | PASS | 7 observable keys, pedestrian true, brake true |
| cost-96-pedestrians-96-hazards | PASS | 96 pedestrians, 96 hazards, 53985 pedestrian / 103664 hazard evaluations |

## Limitations

- 32 of the 80 authored crosswalks have no derived sidewalk at both ends; the 164 contract refuses them and the report keeps that gap instead of approximating a link.
- A pedestrian has no native Rapier collider in 282, so a vehicle-pedestrian impact is not invented in this report; the 164 contact channel remains available to the collision owner when it exists.
- The physical hazard window is bounded by the 028 registry: only free named-box slots are added; the cost probe uses the 96 data obstacles without creating 96 native boxes.
- The browser probe renders the real composition and the real Rapier world without claiming FPS, GPU cost or heap; those remain outside this report.
