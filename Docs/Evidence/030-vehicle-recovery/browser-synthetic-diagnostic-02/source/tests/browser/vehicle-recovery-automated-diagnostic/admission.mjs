import assert from 'node:assert/strict';
/** One admitted backend attempt. Rejections never reset a previously claimed slot. */
export function diagnosticAdmission() {
  let claimed = false;
  return () => {
    assert(!claimed, 'Diagnostic session already claimed; no reentrant/repeated Start');
    claimed = true;
  };
}
