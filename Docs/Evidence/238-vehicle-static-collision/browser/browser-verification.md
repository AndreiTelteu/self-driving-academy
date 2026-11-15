# Browser verification PBI 238 (QA, independent)

Tool: Playwright MCP (T3 preview_open timed out after 660 s; Vite dev server too slow for the browser, so the
same working tree was served via `vite build` + `vite preview` on :4173). Real keyboard events (page.keyboard
down/up: W/S/A/D/G) with a polling steering loop reading `window.__v3Composition.read()`. Start button clicked first.
Console: 0 errors, 0 warnings on the preview build.

| Scenario | Result | Numbers |
|---|---|---|
| B hydrant (25.2,5.5) | PASS | peak 8.3 m/s -> 0 at (22.95,4.82); nose touches hydrant (B1/B2) |
| B bench (17.2,5.5) | PASS | stopped at (15.19,3.36), body beside bench, gap ~0.03 m (B3) |
| B street-lamp (31.2,4.4) | PASS | peak 11.2 -> 0 at (28.82,4.04) (B4) |
| B parking-meter (49.2,4.4) | PASS | 11.2 -> 0 at (47.04,3.45) |
| B tree | NOT observed in browser (controller orbited it); covered only by unit test |
| C building bld:0-0:0-0 (wall z=24.7154) | PASS | 11.2 -> 0 at (42.77,22.55) yaw -0.319; front corner z=24.7153 (touching, not inside); camera (39.56,1.74,21.49) d=3.5, cameraDivergent=false; holding W+A/D for 7 s: no pass-through, camera stable (C2, C3) |
| D reverse | PASS | hold S from standstill: speed -0.85, -1.7, -2.56, then -3.0 cap; moved 9 m away |
| A benches | PARTIAL | bench 17.2 and 80.2 visually: backrest on grass side, seat toward road (A0, B3). Other streets/shelters only via unit test |

Observations: pressed against a wall at an angle the car creeps ~0.025 m/s (x 42.77 -> 42.69 in 3 s) with speed read 0;
slide-along is practically absent at 20 deg incidence (not a pass-through). The player-character mesh stays
visible beside the car after entering (pre-existing).
