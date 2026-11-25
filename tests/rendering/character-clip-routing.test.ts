import assert from 'node:assert/strict';
import test from 'node:test';
import { characterGroupClipName } from '../../src/rendering/babylon/character-scene';

test('254/258: imported animation groups are routed by their original glTF clip name', () => {
  assert.equal(characterGroupClipName('character:Idle_Standing'), 'Idle_Standing');
  assert.equal(characterGroupClipName('character:Walk_Relaxed'), 'Walk_Relaxed');
  assert.equal(characterGroupClipName('character:Run'), 'Run');
  assert.equal(characterGroupClipName('Idle_Standing'), 'Idle_Standing');
  // The prefix is removed exactly once; a clip name containing `:` is preserved.
  assert.equal(characterGroupClipName('character:Vendor:Clip'), 'Vendor:Clip');
});
