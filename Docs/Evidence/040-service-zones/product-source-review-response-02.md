#040 SOURCE review response02

No checks/worlds/build/formatter ran. Original frozen8 inputs and before-01 evidence
remain unchanged. This document is additive to handoff01, not a captured baseline edit.

Root's two contract questions closed at SOURCE:

1. World corridor now requires EXACT supported heading `atan2(dz,dx)` of the actual
   adjacent directed collinear region. Only equivalent+pi/-pi representation is canonical;
   no angular tolerance or positive-dot shortcut admits slant/near-perpendicular heading.
   Existing service heading is derived from that actual directed geometry. Authored
   recovery headings outside the supported alignment yield UNSUPPORTED_CORRIDOR.
2. App comment and Docs cite the real unchanged Rapier builder's fixed
   `ColliderDesc.cuboid(.85,.3,2)` chassis and the actual wheel attachment geometry;
   max(.85,track/2+radius),max(2,wheelbase/2+radius) is the exact030 conservative horizontal
   envelope, not a wheel-only whole-body estimate or visualization bound. Future chassis
   contracts require explicit revalidation. Native Y/support remain actual and independent.

New source adverse cases: aligned/reverse-directed path, reversed/near-perpendicular/
slightly-slanted metadata heading denial, endpoint footprint denial, disposal callback
denial while active with unchanged ownership. Existing concave-notch edge crossing,
boundary inclusion, stale-token/serial, changed graph geometry and native moving/anonymous
blocker assertions remain. Draft counts are now nine world pure, five app pure, two
AFTER-proof pure (16 total), plus two native class cases. All UNEXECUTED.

Changed only six unbound/newproduct paths: src/world/service-zones.ts,
src/app/service-zones.ts, tests/world/service-zones.test.ts, tests/app/service-zones.test.ts,
Docs/service-zones.md, this additive response. No shared index edit. Root's pending
world/index.ts additive export prerequisite remains unchanged.
