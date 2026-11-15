VERDICT: APPROVED

Blocking findings: none.

Non-blocking notes
1. Chase camera at the barrier shows the taxi very dark/navy (existing vehicle lighting, not 242); outside this PBI's scope.
2. Backdrop reads as low-poly hills with haze, not cardboard; uniform dark green, plain until 243/245. Berm + 3 draw calls honest.
3. qa:v3-validation --check is stale independent of 242 at HEAD: input Docs/Evidence/216-v1-regression/report.json hash already differs from HEAD (stale at HEAD). The 157-render-budget report.json hash is also stale in working tree, caused by this PBI's regeneration (expected; 201 report is a stale-by-design evidence, not regenerated). Implementer's claim is partly correct (216 stale at HEAD), but 242 adds one more stale input.
4. Contract change (LIMIT, stats.limits, worldLimit) is consistent; exit-vehicle/enter-vehicle map non-BUILDING to OBSTACLE, so LIMIT degrades safely. Comment in world-limit.ts header still says "OBSTACLE" blockers; code uses LIMIT (stale comment).
5. Walker clamp in walking-composition uses boundsM (wider than limit), walls stop first.

Checks run
- typecheck, lint, format:check, check:architecture: pass.
- npm test: 3490/3490 pass.
- qa:v1-regression --check (27/29, 0 FAIL), v2:contexts --check, perf:render-budget --check: current. Validate-Plan: pass.
- git diff HEAD on tests/app/vehicle-collision.test.ts: empty (238 unchanged).
- visual:capture HIGH/WebGPU 14 frames: street, intersection/crosswalk, horizon, aerial, map-edge, map-edge-barrier viewed: no sky-colour stripe on or beside road; no visible z-fighting on markings/curbs at distance with maxZ 3000.
- Real browser (vite preview, WebGPU): W held, taxi 11.2 m/s, stops at x=745.9999 (limit 748), speed 0 stable for 60 s, no console errors/warnings.
- Not run: WebGL2 fallback, perf re-measure.
