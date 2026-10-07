/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleDamage } from '../../../src/vehicles/damage-state';
import { createCollisionEpisodes } from '../../../src/vehicles/collision-episodes';
import { vehicleClass } from '../../../src/vehicles/vehicle-classes';
test('actual028 drain retains unregistered participant suffix; complete029 population accepts both actual tokens once', () => {
  const context = { schemaVersion: 1 as const, units: 'SI' as const, sessionId: 'pure-damage-two-participants', worldEpoch: 0 };
  const subject = Object.freeze({ entityId: 'subject', handle: 1, generation: 1 });
  const other = Object.freeze({ entityId: 'other', handle: 2, generation: 1 });
  const first = Object.freeze({ entityId: 'subject', kind: 'VEHICLE' as const, serial: 1, colliderHandle: 1 });
  const second = Object.freeze({ entityId: 'other', kind: 'VEHICLE' as const, serial: 2, colliderHandle: 2 });
  // Pure identity seam; no native world, invented impulse result or geometry claim.
  const source = { isCurrent: (token: unknown) => token === first || token === second };
  const damage = createVehicleDamage(context, { bodyIdentity: id => id === 'subject' ? subject : id === 'other' ? other : undefined, collisionSource: source });
  const episodes = createCollisionEpisodes(context, source);
  try {
    damage.register(subject, vehicleClass('sedan').massKg);
    episodes.update(392, [{ first, second, impulseNs: 478.3064727783203 }]);
    const deliver = (incident: Parameters<typeof damage.applyIncident>[0]) => { damage.applyIncident(incident); };
    const rejected = episodes.drain(deliver);
    assert.equal(rejected.status, 'blocked');
    assert.equal(rejected.pending, 1);
    assert(rejected.blocked instanceof Error);
    assert.match(rejected.blocked.message, /Damage participant unregistered/);
    assert.equal(damage.getStats().historyRecords, 0);
    assert.equal(damage.readDamage(subject).lastIncidentId, null);
    damage.register(other, vehicleClass('sedan').massKg);
    const accepted = episodes.drain(deliver);
    assert.equal(accepted.status, 'drained'); assert.equal(accepted.accepted, 1); assert.equal(accepted.pending, 0);
    const history = damage.readHistory();
    assert.equal(history.length, 1); assert.deepEqual(history[0]!.vehicleIds, ['other', 'subject']);
    assert.equal(history[0]!.impulseNs, 478.3064727783203);
    assert.equal(damage.readDamage(other).lastIncidentId, damage.readDamage(subject).lastIncidentId);
    assert.equal(episodes.drain(deliver).accepted, 0);
    assert.equal(damage.getStats().historyRecords, 1);
  } finally { episodes.dispose(); damage.dispose(); }
  assert.equal(damage.getStats().vehicles, 0);
  assert.equal(damage.getStats().historyRecords, 0);
});
