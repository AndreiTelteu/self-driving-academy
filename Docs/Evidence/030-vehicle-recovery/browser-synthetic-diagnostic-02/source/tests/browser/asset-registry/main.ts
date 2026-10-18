import {
  BabylonAssetRegistry,
  type AssetDefinition,
} from '../../../src/rendering/babylon/asset-registry';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import type { BackendPreference } from '../../../src/rendering';
import { triangleGlb } from './glb-fixture';
import { counts, gpuInfo, measure } from '../scene-adapter/baseline';
import { GetEnvironmentBRDFTexture } from '@babylonjs/core/Misc/brdfTextureTools';
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown, message: string) {
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    message + ': ' + JSON.stringify(a) + ' / ' + JSON.stringify(b),
  );
}
export async function assetProbe(preference: BackendPreference, keep = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference);
  void backend.scene.defaultMaterial;
  // Babylon's shared scene BRDF belongs to the scene, not an imported asset.
  GetEnvironmentBRDFTexture(backend.scene);
  const before = counts(backend);
  const blob = new Blob([triangleGlb() as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const texturedUrl = URL.createObjectURL(
    new Blob([triangleGlb(true) as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' }),
  );
  const manifest: AssetDefinition[] = [
    {
      id: 'triangle',
      version: 'fixture1',
      url,
      critical: true,
      source: 'original fixture',
      license: 'CC0',
    },
    {
      id: 'missing-critical',
      version: '1',
      url: '/missing-critical.glb',
      critical: true,
      source: 'fixture',
      license: 'CC0',
    },
    {
      id: 'missing-decor',
      version: '1',
      url: '/missing-decor.glb',
      critical: false,
      source: 'fixture',
      license: 'CC0',
    },
  ];
  const registry = new BabylonAssetRegistry(backend.scene, manifest, {
    maxConcurrent: 1,
    maxCacheEntries: 3,
  });
  const textureRegistry = new BabylonAssetRegistry(backend.scene, [
    { ...manifest[0], url: texturedUrl },
  ]);
  const [ta, tb] = await Promise.all([
    textureRegistry.acquire('triangle'),
    textureRegistry.acquire('triangle'),
  ]);
  const textureMaterial = ta.root.getChildMeshes().find((mesh) => mesh.material)!.material!;
  assert(textureMaterial.getActiveTextures().length > 0, 'embedded PNG decoded');
  assert(
    textureMaterial === tb.root.getChildMeshes().find((mesh) => mesh.material)!.material,
    'textured instances share material',
  );
  ta.release();
  assert(!tb.root.isDisposed(), 'textured second instance survives');
  tb.release();
  const textureMetrics = textureRegistry.metrics;
  textureRegistry.dispose();
  equal(counts(backend), before, 'embedded texture cleanup');
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = 1;
  imageCanvas.height = 1;
  imageCanvas.getContext('2d')!.fillRect(0, 0, 1, 1);
  const jpeg = Uint8Array.from(atob(imageCanvas.toDataURL('image/jpeg').split(',')[1]), (c) =>
    c.charCodeAt(0),
  );
  const jpegUrl = URL.createObjectURL(
    new Blob([triangleGlb(true, jpeg, 'image/jpeg') as Uint8Array<ArrayBuffer>]),
  );
  const jpegRegistry = new BabylonAssetRegistry(backend.scene, [{ ...manifest[0], url: jpegUrl }]);
  const jpegLease = await jpegRegistry.acquire('triangle');
  assert(
    jpegLease.root
      .getChildMeshes()
      .find((mesh) => mesh.material)!
      .material!.getActiveTextures().length > 0,
    'embedded JPEG decoded',
  );
  jpegLease.release();
  const jpegMetrics = jpegRegistry.metrics;
  jpegRegistry.dispose();
  URL.revokeObjectURL(jpegUrl);
  equal(counts(backend), before, 'embedded JPEG cleanup');
  const progress: string[] = [];
  const unsubscribe = registry.subscribe((value) => {
    if (progress.length < 64) progress.push(`${value.id}:${value.phase}`);
  });
  const [a, b] = await Promise.all([registry.acquire('triangle'), registry.acquire('triangle')]);
  assert(!a.placeholder && !b.placeholder, 'valid GLB');
  b.root.position.x = 2;
  const am = a.root.getChildMeshes().find((mesh) => mesh.material);
  const bm = b.root.getChildMeshes().find((mesh) => mesh.material);
  assert(am && bm && am.material === bm.material, 'instances share one material');
  assert(
    registry.metrics.decodeLoads === 1 && registry.metrics.cacheHits === 1,
    'one concurrent load',
  );
  const material = am.material;
  const loaded = counts(backend);
  a.release();
  a.release();
  assert(
    !b.root.isDisposed() && backend.scene.materials.includes(material!),
    'second lease preserves resources',
  );
  assert(!registry.unload('triangle'), 'pinned cache not unloaded');
  b.release();
  assert(registry.unload('triangle'), 'idle unload');
  equal(counts(backend), before, 'valid cleanup to resource baseline');
  let error = '';
  const failed = await Promise.allSettled([
    registry.acquire('missing-critical'),
    registry.acquire('missing-critical'),
  ]);
  assert(
    failed.every((result) => result.status === 'rejected'),
    'concurrent failure settles both',
  );
  if (failed[0].status === 'rejected') error = String(failed[0].reason);
  await registry.acquire('missing-critical').then(
    () => {
      throw new Error('retry should fail');
    },
    () => {},
  );
  assert(error.includes('Critical asset missing-critical'), 'explicit critical error');
  const decor = await registry.acquire('missing-decor');
  assert(decor.placeholder, 'optional placeholder');
  decor.release();
  equal(counts(backend), before, 'placeholder cleanup');
  const constrained = new BabylonAssetRegistry(backend.scene, manifest, { maxAssetBytes: 100 });
  await constrained.acquire('triangle').then(
    () => {
      throw new Error('transfer budget accepted');
    },
    () => {},
  );
  constrained.dispose();
  equal(counts(backend), before, 'byte capacity failure cleans');
  const closing = new BabylonAssetRegistry(backend.scene, manifest, { maxConcurrent: 1 });
  const closingResults = Promise.allSettled([
    closing.acquire('triangle'),
    closing.acquire('missing-critical'),
  ]);
  closing.dispose();
  assert(
    (await closingResults).every((result) => result.status === 'rejected'),
    'dispose aborts active and drains queued',
  );
  equal(counts(backend), before, 'dispose during load restores resources');
  const queuedManifest = [
    { ...manifest[0], id: 'optional-first', critical: false },
    { ...manifest[0], id: 'optional-second', critical: false },
    { ...manifest[0], id: 'critical-third' },
  ];
  const queued = new BabylonAssetRegistry(backend.scene, queuedManifest, {
    maxConcurrent: 1,
    maxQueued: 2,
    maxCacheEntries: 3,
    maxReports: 2,
  });
  const queuedLeases = await Promise.all(
    queuedManifest.map((definition) => queued.acquire(definition.id)),
  );
  equal(
    queued.metrics.reports.map((report) => report.id),
    ['critical-third', 'optional-second'],
    'critical priority and report capacity',
  );
  assert(queued.metrics.activeLoads === 0, 'concurrency drained');
  for (const lease of queuedLeases) lease.release();
  queued.dispose();
  equal(counts(backend), before, 'queued loads cleanup');
  const pinned = new BabylonAssetRegistry(backend.scene, queuedManifest, {
    maxCacheEntries: 1,
    maxInstances: 1,
  });
  const pin = await pinned.acquire('critical-third');
  await pinned.acquire('optional-first').then(
    () => {
      throw new Error('instance limit accepted');
    },
    () => {},
  );
  pin.release();
  pinned.dispose();
  equal(counts(backend), before, 'instance capacity');
  const cachePinned = new BabylonAssetRegistry(
    backend.scene,
    queuedManifest.map((definition) => ({ ...definition, critical: true })),
    { maxCacheEntries: 1 },
  );
  const cachePin = await cachePinned.acquire('critical-third');
  await cachePinned.acquire('optional-first').then(
    () => {
      throw new Error('pinned cache overflow accepted');
    },
    () => {},
  );
  cachePin.release();
  cachePinned.dispose();
  equal(counts(backend), before, 'pinned cache capacity');
  const boundedQueue = new BabylonAssetRegistry(
    backend.scene,
    queuedManifest.map((definition) => ({ ...definition, critical: true })),
    { maxConcurrent: 1, maxQueued: 1 },
  );
  const boundedResults = await Promise.allSettled(
    queuedManifest.map((definition) => boundedQueue.acquire(definition.id)),
  );
  assert(
    boundedResults.filter((result) => result.status === 'rejected').length === 1,
    'queue capacity rejects overflow',
  );
  for (const result of boundedResults) if (result.status === 'fulfilled') result.value.release();
  boundedQueue.dispose();
  equal(counts(backend), before, 'queue capacity cleanup');
  const originalFetch = globalThis.fetch;
  let failOnce = true;
  const retryRegistry = new BabylonAssetRegistry(backend.scene, [manifest[0]]);
  globalThis.fetch = (...args) => {
    if (failOnce) {
      failOnce = false;
      return Promise.resolve(new Response('temporary fixture failure', { status: 503 }));
    }
    return originalFetch(...args);
  };
  try {
    const firstFailure = await Promise.allSettled([
      retryRegistry.acquire('triangle'),
      retryRegistry.acquire('triangle'),
    ]);
    assert(
      firstFailure.every((result) => result.status === 'rejected'),
      'one failed load rejects both callers',
    );
    const retried = await retryRegistry.acquire('triangle');
    assert(!retried.placeholder, 'same ID retries real GLB after transient failure');
    retried.release();
  } finally {
    globalThis.fetch = originalFetch;
    retryRegistry.dispose();
  }
  equal(counts(backend), before, 'successful retry cleanup');
  const lateClose = new BabylonAssetRegistry(backend.scene, manifest);
  lateClose.subscribe((progress) => {
    if (progress.phase === 'decode-upload') queueMicrotask(() => lateClose.dispose());
  });
  await lateClose.acquire('triangle').then(
    () => {
      throw new Error('disposed decode accepted');
    },
    () => {},
  );
  equal(counts(backend), before, 'late decoded container disposal');
  const cycles = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    const lease = await registry.acquire('triangle');
    lease.release();
    registry.clearIdle();
    equal(counts(backend), before, `cycle ${cycle} resources`);
    cycles.push(registry.metrics.reports.at(-1));
  }
  unsubscribe();
  const lease = await registry.acquire('triangle');
  await backend.scene.whenReadyAsync();
  backend.render();
  const newCost = await measure(backend);
  const metrics = registry.metrics;
  lease.release();
  registry.dispose();
  registry.dispose();
  equal(counts(backend), before, 'registry disposal');
  const report = {
    fixture: '015-triangle-v1',
    backend: backend.rendererKind,
    gpu: gpuInfo(backend),
    browser: navigator.userAgent,
    visibility: document.visibilityState,
    dpr: devicePixelRatio,
    resolution: [640, 360],
    before,
    loaded,
    after: counts(backend),
    progress,
    criticalError: error,
    cycles,
    metrics,
    textureMetrics,
    jpegMetrics,
    newCost,
    checks: [
      'valid GLB',
      'concurrent cache dedup',
      'shared material lifetime',
      'idempotent release',
      'pinned unload rejection',
      'critical error',
      'optional placeholder',
      '20 load/unload cycles',
      'full disposal',
      'embedded PNG/shared textured material',
      'concurrent failure and retry',
      'transfer capacity failure',
      'dispose during active/queued loading',
      'embedded JPEG cleanup',
      'critical queue priority/report capacity/instance capacity',
      'dispose during decode cleans late container',
      'pinned cache capacity/queue capacity',
      'transient HTTP failure followed by successful same-ID real GLB retry',
    ],
  };
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  URL.revokeObjectURL(url);
  URL.revokeObjectURL(texturedUrl);
  if (keep) {
    const visualUrl = URL.createObjectURL(new Blob([triangleGlb(true) as Uint8Array<ArrayBuffer>]));
    const visual = new BabylonAssetRegistry(backend.scene, [
      { ...manifest[0], url: visualUrl },
      manifest[2],
    ]);
    const valid = await visual.acquire('triangle');
    valid.root.position.x = -1.5;
    const placeholder = await visual.acquire('missing-decor');
    placeholder.root.position.x = 1.5;
    await backend.scene.whenReadyAsync();
    backend.render();
    return {
      report,
      dispose: () => {
        visual.dispose();
        URL.revokeObjectURL(visualUrl);
        backend.dispose();
      },
    };
  }
  backend.dispose();
  return { report };
}
