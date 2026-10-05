# Simulation-side collision composition

Ownership: NEW `src/simulation/collision-events.ts` only after explicit023 publication/release. Root owns simulation/vehicles public barrels. The adapter imports vehicles public records and existing same-module EventBus types. Vehicles never import simulation. Existing rendering, scheduler, profiles and session lifecycle remain coordinator-owned.

Supply the session-owned EventBus and world collision port to composition; do not create a second bus. If a fixture creates a bus, use only `{ sessionId: context.sessionId, worldEpoch: context.worldEpoch }`, the actual EventBusOptions shape, rather than spreading schemaVersion/units. EventBusStats now exposes its readonly sessionId alongside epoch; construction and each admission validate both before native effects.

The concrete planned adapter provides a before-physics-step admission check, post-step contact capture/publication, and publication-only retry. Admission validates consecutive tick/context and drains any old pending suffix before physics advances. If retry remains blocked, return an explicit blocked result; no newer physics tick may run. After a step has already completed, retry publications without rerunning that step. A readback/capacity failure after physical advance is an explicit partial-tick failure requiring owner pause/recovery, not a silent skipped event or invented epoch.

The implemented native collisionStepSerial increments exactly once immediately after a successful native world.step, including when later query/publication code fails. Adapter admission checks it before and after pending callbacks; capture requires exactly one actual advance and matching snapshot serial. A prepared tick permits identical admission retry but cannot be overwritten by another tick. A wrong capture label can be corrected before readback without replaying physics. Adapter getStats.physicsStepSerial is its last successfully captured owned counter; the current native counter is the port getter and readback.physicsStepSerial. After a capture failure, these can differ and faulted requires explicit owner recovery.

Translate each immutable incident into exact007 event fields:

```text
schemaVersion/units/sessionId/worldEpoch from incident
eventId = incident.incidentId
tick = incident.tick
entityIds = [incident.vehicleId, incident.otherEntityId]
type = COLLISION
payload = { vehicleId, otherEntityId, impulseNs }
```

No token, native handle, episode number or diagnostic field enters the event payload. Delivered and duplicate results both acknowledge the pending incident. Inspect every listener failure; such failures are accepted events, so they must not block the queue or repeat effects. A thrown publish retains the failed suffix. Keep accepted-prefix count, pending count, discarded stale-registration count and explicit blocked status; a thrown null/undefined must still be reported as blocked.

Diagnostic output must be bounded independently of pending incidents. Report the total listener-failure count and explicit sample/truncation counts with event/listener identity. Avoid retaining arbitrary unknown error graphs in owned history. Error inspection must not throw after event acceptance, because retrying a duplicate cannot recover a failure list already returned by the bus. Native removal/reuse/disposal inside a bus listener invalidates subsequent old-token incidents; core drains check current identity before every publication.

Planned composition tests: parse exactCOLLISION variant, one accepted effect for persistent/retry, accepted listener failure reported without repeat, accepted-prefix then capacity failure and duplicate retry, source removal/reuse during first publication, old/foreign epoch rejection, disposal/reset ownership, and admission blocking before the next physical step. Native tests additionally cover named static obstacles and real positive normal impulse, ground/sensor/unmapped exclusion, complete snapshots, registered token removal and repeated world cleanup. Incremental readback/tracker/event publication timings remain separate from the unchanged legacy query comparison.
