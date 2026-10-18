import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { RenderingBackend } from '../../../src/rendering/babylon';
import { createPhysicalSchedulingWorkload } from './workload';

test('actual physical scheduling fixture preserves70controllers and can verify cleanup twice after native disposal', async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const backend: RenderingBackend = {
    rendererKind: 'WEBGL2',
    scene,
    canvas: {} as HTMLCanvasElement,
    render: () => undefined,
    resize: () => undefined,
    dispose: () => scene.dispose(),
  };
  try {
    for (const arm of ['UNPHASED_REFERENCE', 'ENTITY_PHASED'] as const) {
      const workload = await createPhysicalSchedulingWorkload(backend, arm, 0);
      try {
        workload.prepareObservation(false);
        workload.frame(0, false, () => undefined);
        for (let tick = 1; tick <= 12; tick++)
          workload.frame((tick * 1000) / 60, false, () => undefined);
        const counts = workload.counts();
        assert.equal(counts.vehicles, 70);
        assert.ok(counts.physicsSteps >= 11);
        assert.equal(counts.controllers, counts.physicsSteps * 70);
        assert.ok(workload.semanticCheckpoints().length > 0);
      } finally {
        const cleanup = workload.dispose();
        assert.equal(cleanup.worldDisposed, true);
        assert.ok(
          Object.entries(cleanup).every(([key, value]) => key === 'worldDisposed' || value === 0),
        );
        assert.deepEqual(workload.dispose(), cleanup);
        assert.equal(workload.counts().vehicles, 0);
      }
    }
    // A factory failure before handing ownership to the protocol must release its native realm
    // and preserve the original owner fault instead of replacing it with a disposed read.
    const original = new Error('Owner scene construction failed');
    const broken = {
      ...backend,
      get scene(): Scene {
        throw original;
      },
    };
    await assert.rejects(
      createPhysicalSchedulingWorkload(broken, 'ENTITY_PHASED', 1),
      (error) => error === original,
    );
    const next = await createPhysicalSchedulingWorkload(backend, 'ENTITY_PHASED', 2);
    assert.equal(next.dispose().worldDisposed, true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
