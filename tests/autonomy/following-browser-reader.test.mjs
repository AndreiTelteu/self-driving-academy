import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateFollowingBrowser } from '../../scripts/verify-following-browser.mjs';

const envelope = JSON.parse(
  await readFile(
    new URL(
      '../../Docs/Evidence/048-following/browser-v4/run-84065c58-9a4e-4b4c-8d79-e5a232889518.json',
      import.meta.url,
    ),
  ),
);
const currentEnvelope = JSON.parse(
  await readFile(
    new URL(
      '../../Docs/Evidence/048-following/browser-v5/run-96fd835e-f1ae-4270-8807-ae47c392a032.json',
      import.meta.url,
    ),
  ),
);
test('048 browser reader rejects incomplete, nonfinite, stale, slowed and retained-resource captures', () => {
  validateFollowingBrowser(envelope.payload);
  const mutations = [
    (p) => {
      p.status = 'FAIL';
    },
    (p) => {
      p.foreground = false;
    },
    (p) => {
      p.episodes[0].result.rows.pop();
    },
    (p) => {
      p.episodes[0].result.rows[2].tick = 2;
    },
    (p) => {
      p.episodes[0].result.rows[2].position.x = Infinity;
    },
    (p) => {
      p.episodes[0].result.rows[2].brake = -1;
    },
    (p) => {
      p.episodes[0].clock.activeRealSeconds = 12;
    },
    (p) => {
      p.episodes[0].clock.overloadCount = 1;
    },
    (p) => {
      p.episodes[0].cleanup.policy.cachedTargets = 1;
    },
    (p) => {
      p.episodes[0].result.rows[1].targetMps = 0.123;
    },
  ];
  for (const mutate of mutations) {
    const p = structuredClone(envelope.payload);
    mutate(p);
    assert.throws(() => validateFollowingBrowser(p));
  }
});

test('048 current browser reader admits opaque native handles and rejects altered held observations or contacts', () => {
  validateFollowingBrowser(currentEnvelope.payload);
  const mutations = [
    (p) => {
      p.episodes[0].result.rows[8].targetSourceTick = 1;
    },
    (p) => {
      p.episodes[0].result.rows[8].targetEgoSpeedMps = -Infinity;
    },
    (p) => {
      p.episodes[0].result.rows[8].targetGapM += 1;
    },
    (p) => {
      p.episodes[0].result.rows[8].observedLeaderId = 'old-leader';
    },
    (p) => {
      p.episodes[0].result.rows[8].collisionStepSerial += 1;
    },
    (p) => {
      p.episodes[0].result.collisionImpulseNs = 0;
    },
    (p) => {
      const row = p.episodes[0].result.rows.find((r) => r.contacts.length);
      row.contacts[0].first.entityId = 'other';
    },
    (p) => {
      const row = p.episodes[0].result.rows.find((r) => r.contacts.length);
      row.contacts[0].impulseNs = -1;
    },
    (p) => {
      const row = p.episodes[0].result.rows.find((r) => r.contacts.length);
      row.contacts[0].first.colliderHandle = Infinity;
    },
  ];
  for (const mutate of mutations) {
    const p = structuredClone(currentEnvelope.payload);
    mutate(p);
    assert.throws(() => validateFollowingBrowser(p));
  }
});
