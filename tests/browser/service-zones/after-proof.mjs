import assert from 'node:assert/strict';
/** Actual extra040 proof is checked separately; original native oracle DTO is unchanged. */
export function verifyProductQuery(q) {
  const product = q.product,
    safe = q.anchorId === 'point-safe';
  assert(['point-safe', 'point-blocked'].includes(q.anchorId));
  assert.deepEqual(
    Object.keys(product).sort(),
    ['category', 'id', 'anchorNodeId', 'positionM', 'corridor', 'status'].sort(),
  );
  assert.equal(product.category, safe ? 'SERVICE' : 'RECOVERY');
  assert.equal(product.id, safe ? 'service' : 'point-blocked');
  assert.equal(product.anchorNodeId, safe ? '040-safe' : '040-blocked');
  assert.deepEqual(product.positionM, { x: 0, y: 0, z: safe ? -12 : -5 });
  assert.deepEqual(product.corridor, {
    mapId: '040-authored-service-baseline-v1',
    laneId: 'lane-0',
    access: 'TAXI',
    start: { x: 0, y: 0, z: -40 },
    end: { x: 0, y: 0, z: 100 },
    widthM: 24,
  });
  assert(['SAFE', 'BLOCKED', 'INVALID_SUPPORT'].includes(q.inspection.status));
  assert.equal(
    product.status,
    q.inspection.status === 'SAFE'
      ? 'AVAILABLE'
      : q.inspection.status === 'BLOCKED'
        ? 'OCCUPIED'
        : 'INVALID_SUPPORT',
  );
  return Object.fromEntries(Object.entries(q).filter(([key]) => key !== 'product'));
}
