import type { QualityPreset } from './quality-policy';

const MiB = 1024 * 1024;
/** Admission caps, distinct from compressed transfer and exact unavailable GPU memory. */
export const RENDER_ASSET_CAPS = Object.freeze({
  version: '223-initial-1',
  budgetVersion: '203-initial-1',
  maxAssetDefinitions: 256,
  criticalCodeTransferBytes: 8 * MiB,
  firstRideTransferBytes: 20 * MiB,
  decoderWasmBytes: 8 * MiB,
  decoderWorkspaceBytes: 16 * MiB,
  geometryGpuBytes: 64 * MiB,
  textureGpuBytes: Object.freeze({ LOW: 256 * MiB, MEDIUM: 384 * MiB, HIGH: 384 * MiB }),
  shaderVariants: 64,
  decodeMs: 2000,
  shaderPrepareMs: 2000,
  firstUseMs: 50,
  maxCells: 256,
  maxBatches: 512,
  maxInstances: 8192,
  maxPerBatch: 256,
  maxDrawCalls: 128,
  maxBabylonObjects: 4096,
  maxMatrixBufferBytes: 2 * MiB,
});
export function checkRenderingCounters(counters: {
  drawCalls: number;
  babylonObjects: number;
  matrixBufferBytes: number;
}) {
  const diagnostics: BudgetDiagnostic[] = [];
  for (const [metric, limit] of [
    ['drawCalls', RENDER_ASSET_CAPS.maxDrawCalls],
    ['babylonObjects', RENDER_ASSET_CAPS.maxBabylonObjects],
    ['matrixBufferBytes', RENDER_ASSET_CAPS.maxMatrixBufferBytes],
  ] as const) {
    const actual = counters[metric];
    count(actual);
    if (actual > limit) diagnostics.push({ metric, actual, limit, assetId: null });
  }
  return diagnostics;
}
export interface BudgetedAsset {
  readonly id: string;
  readonly firstRide: boolean;
  readonly transferBytes: number;
  readonly geometryGpuBytes: number;
  readonly textureGpuBytes: number;
  readonly shaderVariants: number;
}
export interface AssetBudgetManifest {
  readonly version: string;
  readonly criticalCodeTransferBytes: number;
  readonly decoderWasmBytes: number;
  readonly decoderWorkspaceBytes: number;
  readonly assets: readonly BudgetedAsset[];
}
export interface BudgetDiagnostic {
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
  readonly assetId: string | null;
}
function count(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid asset budget count');
}
export function checkAssetManifest(manifest: AssetBudgetManifest, preset: QualityPreset) {
  if (
    !manifest ||
    typeof manifest.version !== 'string' ||
    !manifest.version.trim() ||
    !['LOW', 'MEDIUM', 'HIGH'].includes(preset)
  )
    throw new Error('Invalid asset budget manifest');
  if (
    !Array.isArray(manifest.assets) ||
    manifest.assets.length > RENDER_ASSET_CAPS.maxAssetDefinitions
  )
    throw new Error('Asset manifest definition capacity');
  const ids = new Set<string>();
  const totals = { transferBytes: 0, geometryGpuBytes: 0, textureGpuBytes: 0, shaderVariants: 0 };
  for (const asset of manifest.assets) {
    if (
      !asset ||
      typeof asset.id !== 'string' ||
      !asset.id.trim() ||
      ids.has(asset.id) ||
      typeof asset.firstRide !== 'boolean'
    )
      throw new Error('Invalid/duplicate budget asset');
    ids.add(asset.id);
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      count(asset[key]);
      if (key !== 'transferBytes' || asset.firstRide) totals[key] += asset[key];
      count(totals[key]);
    }
  }
  const diagnostics: BudgetDiagnostic[] = [];
  const compare = (metric: string, actual: number, limit: number) => {
    count(actual);
    if (actual > limit) diagnostics.push({ metric, actual, limit, assetId: null });
  };
  compare(
    'criticalCodeTransferBytes',
    manifest.criticalCodeTransferBytes,
    RENDER_ASSET_CAPS.criticalCodeTransferBytes,
  );
  compare('firstRideTransferBytes', totals.transferBytes, RENDER_ASSET_CAPS.firstRideTransferBytes);
  compare('decoderWasmBytes', manifest.decoderWasmBytes, RENDER_ASSET_CAPS.decoderWasmBytes);
  compare(
    'decoderWorkspaceBytes',
    manifest.decoderWorkspaceBytes,
    RENDER_ASSET_CAPS.decoderWorkspaceBytes,
  );
  compare('geometryGpuBytes', totals.geometryGpuBytes, RENDER_ASSET_CAPS.geometryGpuBytes);
  compare('textureGpuBytes', totals.textureGpuBytes, RENDER_ASSET_CAPS.textureGpuBytes[preset]);
  compare('shaderVariants', totals.shaderVariants, RENDER_ASSET_CAPS.shaderVariants);
  return Object.freeze({
    accepted: diagnostics.length === 0,
    totals: Object.freeze(totals),
    diagnostics: Object.freeze(diagnostics),
  });
}
export function admitAssetManifest(manifest: AssetBudgetManifest, preset: QualityPreset): void {
  const result = checkAssetManifest(manifest, preset);
  if (!result.accepted)
    throw new Error(`Asset manifest over budget: ${JSON.stringify(result.diagnostics)}`);
}
/** Completion gates do not claim to interrupt synchronous native decoding. */
export function checkAssetUsage(
  asset: BudgetedAsset,
  actual: {
    transferBytes: number;
    geometryGpuBytes: number;
    textureGpuBytes: number;
    decodeMs: number;
    shaderPrepareMs: number;
    firstUseMs: number;
  },
) {
  const diagnostics: BudgetDiagnostic[] = [];
  for (const metric of [
    'transferBytes',
    'geometryGpuBytes',
    'textureGpuBytes',
    'decodeMs',
    'shaderPrepareMs',
    'firstUseMs',
  ] as const) {
    const value = actual[metric];
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid asset usage');
    const limit = metric.endsWith('Ms')
      ? RENDER_ASSET_CAPS[metric as 'decodeMs' | 'shaderPrepareMs' | 'firstUseMs']
      : asset[metric as 'transferBytes' | 'geometryGpuBytes' | 'textureGpuBytes'];
    if (value > limit) diagnostics.push({ metric, actual: value, limit, assetId: asset.id });
  }
  return diagnostics;
}
