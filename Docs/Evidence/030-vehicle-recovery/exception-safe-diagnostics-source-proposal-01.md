# Exception-safe recovery diagnostics SOURCE proposal

No frozen568 production/input/archive bytes changed. No execution, native world, build or browser retry. Current V5 proofs remain accurate for their exact captured bytes; a corrected production closure must be separately versioned and verified before publication/current acceptance.

Confirmed blocker: recovery-state.ts fail(error) uses instanceof Error then error.name/message; Rapier recovery applyPlacement catch likewise and later readback catch reads error.name. A hostile thrown Error getter or Proxy prototype/name/message trap can throw during diagnostics, replacing the original failed stage and bypassing actual PARTIAL/readback accounting.

Minimal proposed helper, private vehicles module (no game API expansion):
```ts
export function recoveryFailureText(error: unknown, fallback: string): string {
  return typeof error === 'string' && error.length > 0 ? error.slice(0, 512) : fallback;
}
```
All object/function throws (including normal Error, hostile Error, Proxy, boxed primitive) use explicit original stage fallback. No instanceof, descriptor/prototype access, name/message reads, String/coercion/toJSON, property inspection or hook execution. Primitive empty-string/falsy/null/undefined throws still produce NONEMPTY failure (nonempty stage constants); new intent admission remains blocked after fault; successful state remains distinguished by actual try/catch/control counters, not truthiness. Raw original thrown value is not modified or serialized. Existing acquired owner error references/lifetime propagation remain as currently owned; this helper only selects a bounded diagnostic string for existing records.

Replace recovery-state fail body with helper(error,'Recovery stage threw'); preserve each exact delivery/native/history retry branch/attempts and fences. Native setter catch helper(error,'Native setter threw'), readback catch append helper(error,'Native readback threw'); no setter/readback/finally/control change. After an actual translation succeeds and rotation throws, attempted2/completed1 and actual after-state must remain recorded even when diagnostic input is hostile. Independent query/free cleanup continues unchanged. Avoid descriptor fallback entirely: even reflection on a Proxy can execute user traps, so own-data reflection is not necessary to safely diagnose an arbitrary caught value.

Meaningful unexecuted tests proposed:
- Pure diagnostic values primitive string/empty/falsy/null/undefined; Error.name/message getters throwing with zero getter calls; Proxy get/getPrototypeOf/getOwnPropertyDescriptor/toPrimitive traps with zero calls; custom object name/message and boxed primitive fallback.
- Actual owner segment delivery throw hostile Error after native complete: PARTIAL delivered prefix preserved, one native placement, original history retained, delivery-only retry no replay, original Error fields untouched.
- Actual native rotation setter injected hostile Error after translation: attempted2/completed1, failure non-null, actual after-readback translation visible, no secondplacement, world/port resources released once.
- Actual native readback failure Proxy/falsy: afternull/failure non-null with original attempted/completed counts; all acquired cleanup attempts independent once. Existing setters/safe placement/support thresholds unchanged.

Future proposed commands after root grant: scoped formatter/BOTHtypes/lint/architecture plus exact affected pure suites; separately archived current native suite only under explicit native grant. No AFTER5 performance rerun or new hardware is proposed without root provenance/acceptance decision. Distinct native/source identity required; original BEFORE/failed AFTER1–3/AFTER4/V5 fullraw remain immutable historical records after production change.