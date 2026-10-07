import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticAdmission } from './admission.mjs';
test('once admission remains claimed after terminal failure and repeated rejection', () => {
  const claim = diagnosticAdmission();
  claim();
  assert.throws(claim, /already claimed/);
  assert.throws(claim, /already claimed/);
});
