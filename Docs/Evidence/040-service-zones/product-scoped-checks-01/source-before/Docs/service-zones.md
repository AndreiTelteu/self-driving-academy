# Service zones and recovery points —040 SOURCE contract

This feature is SOURCE-only until its new correctness/native/browser checks execute.
The chronological pre040 baseline is immutable13224224,20worlds/2,600 actual queries;
both current and historical baseline readers exited0 on2026-10-07 at18:35:49Z.
It is not hardware/full-game/RAM acceptance and does not complete040.

`createServiceZoneCatalog` owns a validated032 metadata copy and binds it to033's exact
map/lane/access/direction/node geometry. Service IDs, anchor nodes, access and PICKUP /
DROPOFF / BOTH are actual authored metadata. A bounded directed per-class search checks
the requested origin lane. Unknown IDs, incompatible access/purpose and unknown/unreachable
origins produce explicit semantic denial.032 already rejects maps whose eligible services
are unreachable from an admitted access lane;040 preserves this contract.

The exact authored anchor remains the requested x/z. Ground-level collinear directed
segments around the anchor are merged into their maximal supported region. Its width,
exact aligned orientation, every directed node/segment and map identity are cross-checked with
the bound graph. A turn at the anchor, slope, bridge height, reversed heading or footprint
outside this region fails closed.040 accepts only the exact directed corridor heading
(+pi and-pi denote the same direction); even slightly slanted authored recovery headings
are unsupported, not rounded into alignment. Near-perpendicular positive-dot admission
is not permitted. Arbitrary caller-issued road rectangles are not accepted
by the app API. Recovery does not move or recenter the anchor. Service zones also require
a supported simple ground-level polygon to contain the full conservative oriented vehicle
rectangle. All edge intersection subintervals are tested; four corners inside alone cannot
hide a concave notch. Boundary inclusion is exact, with no physical threshold tolerance.

`createServiceZoneAvailability` composes the catalog with an existing caller-owned030
native port. It derives footprint half-width/length from ACTUAL native wheel track,
wheelbase and radius, combined with the same030 FIXED chassis bounds. The authoritative
Rapier builder in `src/vehicles/rapier/index.ts` creates `ColliderDesc.cuboid(0.85,0.3,2)`
for both current023 classes (full1.7x0.6x4m), then actual wheel attachments at+-track/2 and
+-wheelbase/2. The030 inspector uses `max(0.85,track/2+radius)` and
`max(2,wheelbase/2+radius)` for its complete conservative horizontal envelope.040 mirrors
that current native contract; it does not derive a chassis from wheels or visual meshes.
Future changed chassis geometry requires an updated native geometry contract and new
validation, not silent reuse of these constants. The actual current
body centre height supplies only candidate Y, while the unchanged030 native inspector
decides ground/support validity and full live anonymous/moving collider occupancy. It
checks body token, serial, native state and mechanical dimensions freshly around semantic
and native calls; same-serial changes are not cached. AVAILABLE / OCCUPIED /
INVALID_SUPPORT are distinct from static READY / DENIED. No automatic querying, learned
policy, service transaction, native setter, step or teleport is introduced.

Finite admission:256 service zones,256 recovery points,256 vertices/polygon,2,048 route
lanes,65,536 traversed edges,one synchronous request in flight. Requests are exact own-data
DTOs with bounded128-unit IDs; native identity getters are rejected by the existing030
strict parser. Metadata polygons/graph are construction-owned static inputs; there is no
occupancy or native-geometry cache, internal queue or growing request history. Borrowed
graph, world and030 native port remain caller-owned. Feature disposal releases only its
admission slot; catalog disposal clears its owned indexes. Resource counters and bounded
payload/channel bytes are separate from unavailable total JS/native/WASM RAM.

Current drafted validation: semantic/access/purpose/unknown/oversized-footprint cases;
concave-notch and exact boundary; corner/forged/replaced graph; capacity/malformed polygon;
own-data/getter rejection; fresh occupancy/support, stale tokens/serial and reentry;
two real-class native service/recovery inspections with moving and anonymous blockers,
readonly bodies/mechanics/serial, support denial, generation replacement and once cleanup.
All these new product tests remain UNEXECUTED. The separate AFTER collector uses exactly
the original20-world70/110 alternating OFF/ON180+600-tick protocol, preserved physical /
control / native-input oracle proof and unchanged5.5ms normal / joint>10%AND>1ms>=3/5 gates.
Safe requests exercise the actual SERVICE polygon path; blocked requests exercise RECOVERY.
Product metadata/decision evidence is additional, never substituted for original native
states. Both browser backends and relevant memory/retention validation remain pending.
