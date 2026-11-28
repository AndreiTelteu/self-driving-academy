# 283 — live traffic rules evidence

Generated 28 November 2026 from the prepared worktree. The board move and final integration belong
to the orchestrator; this folder is the implementation evidence only.

## Deterministic report

`npm run traffic:live` runs the real 262 ambient fleet over the real 032/033 city map. It executes:

- one 036 controller per composition, advanced once per 60 Hz tick;
- 037 STOP observations and the 051 full/rolling/crossing decision;
- 038/052 priority/yield with the authored sidecar and the live all-way queue;
- 053 lane-change gates and 041 route continuation;
- 054 stagnation recovery requests.

Two probes share the same code:

| Probe | Actors | Simulated | Rules p95 | Wall/tick | Deadlock stalls (no move in run) |
| --- | --- | --- | --- | --- | --- |
| flow | 40 | 300 s | 0.89 ms | 4.66 ms | 0 |
| stress | 56 | 600 s | 1.28 ms | 6.77 ms | 0 |

The stress probe still ends with 29 actors stationary >60 s because the authored signal plan has
220–411 s cycles; that is congestion, not a deadlock (no actor is without movement for the whole
run, and the maximum single stationary interval is 327 s). The report preserves this partial result
rather than hiding it.

Key counters from the report:

- 187 red stop episodes and 337 signal phase changes in the stress run;
- 86 full stops, 85 real line crossings and 157 traffic-caused stops (never classified as a STOP
  intent or violation);
- 17,136 yield checks with 9,418 holds and 7,718 accepts;
- 34 validated and applied lane changes, with front/rear gap, advantage and cooldown refusals;
- `deadlockStalls: 0` in both probes.

See [report.json](report.json) and [report.md](report.md).

## Browser probe

`npm run traffic:live:probe` builds a Chromium fixture over the same 032/033/058/283 modules with a
2D canvas. It waits for a real red movement with an AUTO taxi stopped at its authored line, gives
that taxi explicit PLAYER authority, crosses the line while the movement is still red, and checks
the real `283-traffic-violation-v1` event and the visible notice.

Result: **PASS 5/5** in Chrome 157.0.8103.51. The stopped taxi was at `sig:1-2` /
`mv:1-2:12W0>02W0`, 0.00 m/s on `sl:1-2:12W0`; the violation is `RED_LIGHT` at tick 1007 with
`frontDistanceBeforeM` positive and `frontDistanceAfterM <= 0`. Screenshots:
[ai-stopped-at-red.png](screenshots/ai-stopped-at-red.png),
[player-red-violation.png](screenshots/player-red-violation.png).

See [browser.json](browser.json) and [browser.md](browser.md).

Limitation: the full Babylon shell pauses with the 012 `overload` cause under headless software
rendering before a 226 s signal cycle can be observed. The fixture uses the same authoritative
traffic/rules owners and a real Chromium page, but it is not a hardware FPS/GPU gate and not a
claim that the rendered shell was exercised end-to-end.

## Tests

- `tests/autonomy/live-traffic-rules.test.ts`: 036 red hold, real red violation with previous
  evidence, no fabricated green/first-observation violation, 037/051 full stop and crossing,
  rolling profile, priority sidecar, 053 gate, 054 request.
- `tests/fleet/civil-traffic-rules.test.ts`: real 262 fleet red/STOP/yield evidence, no fabricated
  player violation, determinism.

## Limitations

- Signal cycles are authored content; the adapter does not shorten them.
- Full civil autonomy, destructibles and pedestrians remain 284/285/286.
- Browser evidence is a fixture, not the rendered game shell; the 012 overload pause is a software
  renderer artifact, not a traffic deadlock.
