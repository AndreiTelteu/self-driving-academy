/**
 * PBI 150 — deterministic asset-manifest report.
 *
 * The report reads the real inventory modules and the real bytes of the shipped WASM files, builds
 * the versioned manifest, and exercises the four release-critical scenarios:
 *
 * 1. a new build with one changed asset invalidates only that cache entry;
 * 2. raising the manifest format version invalidates every entry (controlled, not accidental);
 * 3. a missing critical asset or unreadable source blocks the release with a closed reason and the
 *    exact id list, without adding a fabricated entry;
 * 4. wire bytes and decoded/resident estimates stay separate: gzip/base64 transport never becomes
 *    GPU, WASM or decoder residency.
 *
 * It reuses the evidence produced by the existing harnesses (145/146 build manifests, 223 render
 * budgets build manifest) instead of inventing another browser probe: the artifact hashes are
 * recomputed and the emitted WASM sizes are compared with the package bytes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  ASSET_MANIFEST_FORMAT_VERSION,
  ASSET_MANIFEST_VERSION,
  accountAssetManifest,
  assetBudgetManifest,
  assetManifestBudget,
  auditAssetManifest,
  checkResidentBudgets,
  createAssetManifest,
  diffAssetCache,
  type AssetManifest,
  type AssetManifestAccounting,
  type AssetManifestAudit,
  type AssetManifestBudgetDiagnostic,
  type AssetSourceRecord,
} from '../../src/build/asset-manifest';
import {
  collectAssetManifestSources,
  type AssetManifestCollection,
  type WasmFileSource,
} from '../../src/build/asset-manifest-sources';
import { sha256Hex } from '../../src/build/content-hash';
import { RENDER_ASSET_CAPS } from '../../src/rendering';
import { AUDIO_LIMITS } from '../../src/audio';
import { PASSENGER_VISUAL_LIMITS } from '../../src/ui';

interface BudgetDocument {
  readonly resourceAdmissionContracts: {
    readonly physics: { readonly reservedWasmAdmissionEstimateBytes: number };
  };
}

interface EvidenceBudgetAsset {
  readonly id: string;
  readonly firstRide: boolean;
  readonly transferBytes: number;
  readonly geometryGpuBytes: number;
  readonly textureGpuBytes: number;
  readonly shaderVariants: number;
}

interface VehicleEvidence {
  readonly declared: readonly EvidenceBudgetAsset[];
}

interface DecorEvidence {
  readonly decor: {
    readonly stats: { readonly items: number; readonly gpuBytes: number };
    readonly countsByKind: Readonly<Record<string, number>>;
    readonly inventory: readonly {
      readonly id: string;
      readonly kind: string;
      readonly type: string;
      readonly version: string;
      readonly role: string;
      readonly source: string;
      readonly license: string;
      readonly count: number;
      readonly costBytes: number;
    }[];
  };
}

interface AudioEvidence {
  readonly contract: {
    readonly cues: readonly { readonly cueId: string }[];
    readonly placeholderAssets: string;
  };
}

interface BuildManifestEvidence {
  readonly artifactHash: string;
  readonly artifacts: readonly { readonly path: string; readonly bytes: number }[];
}

export interface AssetManifestCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface AssetManifestScenario {
  readonly name: string;
  readonly detail: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface AssetManifestReport {
  readonly version: typeof ASSET_MANIFEST_VERSION;
  readonly formatVersion: number;
  readonly manifest: {
    readonly hash: string;
    readonly etag: string;
    readonly entries: number;
    readonly critical: number;
    readonly optional: number;
    readonly placeholder: number;
    readonly wireBytes: number;
    readonly decodedBytes: number;
  };
  readonly accounting: AssetManifestAccounting;
  readonly registry: AssetManifestCollection['registry'];
  readonly audit: AssetManifestAudit;
  readonly budgets: Readonly<
    Record<
      'LOW' | 'MEDIUM' | 'HIGH',
      { accepted: boolean; diagnostics: readonly AssetManifestBudgetDiagnostic[] }
    >
  >;
  readonly inventory: readonly {
    readonly id: string;
    readonly kind: string;
    readonly role: string;
    readonly version: string;
    readonly count: number;
    readonly consumers: readonly string[];
    readonly cacheKey: string;
    readonly inputsHash: string;
    readonly wireBytes: number;
    readonly decodedBytes: number;
  }[];
  readonly scenarios: readonly AssetManifestScenario[];
  readonly checks: readonly AssetManifestCheck[];
  readonly summary: { readonly checks: number; readonly passed: number; readonly pass: boolean };
}

export interface AssetManifestEvidence {
  readonly manifest: AssetManifest;
  readonly report: AssetManifestReport;
  readonly collection: AssetManifestCollection;
}

const RAPIER_WASM = 'node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm';
const RAPIER_BUNDLE = 'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs';
const GLSLANG_WASM = 'node_modules/@babylonjs/core/assets/glslang/glslang.wasm';
const TWGSL_WASM = 'node_modules/@babylonjs/core/assets/twgsl/twgsl.wasm';

function readJson<T>(root: string, relative: string): T {
  return JSON.parse(readFileSync(join(root, relative), 'utf8')) as T;
}

function readBytes(root: string, relative: string): Buffer | null {
  try {
    return readFileSync(join(root, relative));
  } catch {
    return null;
  }
}

function gzipBytes(bytes: Buffer): number {
  return gzipSync(bytes, { level: 9 }).length;
}

function base64Length(rawBytes: number): number {
  return Math.ceil(rawBytes / 3) * 4;
}

export const ASSET_MANIFEST_EVIDENCE_PATHS = Object.freeze({
  manifest: 'Docs/Evidence/150-asset-manifest/asset-manifest.json',
  report: 'Docs/Evidence/150-asset-manifest/report.json',
  markdown: 'Docs/Evidence/150-asset-manifest/report.md',
});

/**
 * Real WASM sources. The Rapier compatibility bundle embeds its module as base64, so its on-wire
 * cost is the base64 length (larger than the raw module), not the raw `.wasm` size. The decoder
 * field stays 0: the core GLB path admits no extension decoder WASM.
 */
function wasmSources(root: string, physicsWasmLimit: number): readonly WasmFileSource[] {
  const rapier = readBytes(root, RAPIER_WASM);
  const bundle = readBytes(root, RAPIER_BUNDLE);
  let rapierSource: WasmFileSource;
  if (!rapier || !bundle) {
    rapierSource = {
      id: 'runtime:wasm:rapier',
      version: '021-raycast-v1',
      source: 'npm @dimforge/rapier3d-compat@0.21.0 dist/rapier_wasm3d_bg.wasm',
      license: 'Apache-2.0',
      consumers: ['021', '223'],
      role: 'CRITICAL',
      firstRide: true,
      encoding: 'BASE64_INLINE',
      rawBytes: 0,
      encodedBytes: 0,
      gzipBytes: null,
      residentBytes: 0,
      residencyBasis: 'DECLARED_ADMISSION_ESTIMATE',
      decoder: false,
      workspaceBytes: 0,
      available: false,
    };
  } else {
    const text = bundle.toString('utf8');
    const marker = '"AGFzbQ';
    const start = text.indexOf(marker);
    const base64 = start < 0 ? '' : (text.slice(start + 1).match(/^[A-Za-z0-9+/=]+/)?.[0] ?? '');
    const embedded = Buffer.from(base64, 'base64');
    if (!embedded.equals(rapier))
      throw new Error('Rapier inline WASM does not match the package file');
    if (base64.length !== base64Length(rapier.length))
      throw new Error('Rapier base64 length does not match its raw module');
    rapierSource = {
      id: 'runtime:wasm:rapier',
      version: '021-raycast-v1',
      source:
        'npm @dimforge/rapier3d-compat@0.21.0 dist/rapier_wasm3d_bg.wasm inlined as base64 in dist/rapier.mjs',
      license: 'Apache-2.0',
      consumers: ['021', '223'],
      role: 'CRITICAL',
      firstRide: true,
      encoding: 'BASE64_INLINE',
      rawBytes: rapier.length,
      encodedBytes: base64.length,
      gzipBytes: gzipBytes(rapier),
      residentBytes: physicsWasmLimit,
      residencyBasis: 'DECLARED_ADMISSION_ESTIMATE',
      decoder: false,
      workspaceBytes: 0,
      available: true,
    };
  }
  const moduleSource = (id: string, relativePath: string, moduleName: string): WasmFileSource => {
    const bytes = readBytes(root, relativePath);
    return {
      id,
      version: '223-initial-1',
      source: `npm @babylonjs/core@9.29.0 assets/${moduleName}/${moduleName}.wasm (emitted by the 223 render build)`,
      license: 'Apache-2.0',
      consumers: ['223'],
      role: 'CRITICAL',
      firstRide: true,
      encoding: 'IDENTITY',
      rawBytes: bytes?.length ?? 0,
      encodedBytes: bytes?.length ?? 0,
      gzipBytes: bytes ? gzipBytes(bytes) : null,
      residentBytes: bytes?.length ?? 0,
      residencyBasis: 'MODULE_BYTES_LOWER_BOUND',
      decoder: false,
      workspaceBytes: 0,
      available: bytes !== null,
    };
  };
  return Object.freeze([
    rapierSource,
    moduleSource('runtime:wasm:glslang', GLSLANG_WASM, 'glslang'),
    moduleSource('runtime:wasm:twgsl', TWGSL_WASM, 'twgsl'),
  ]);
}

function vehicleProjection(manifest: AssetManifest): readonly EvidenceBudgetAsset[] {
  return assetBudgetManifest(manifest)
    .assets.filter((asset) => asset.id.startsWith('vehicle:'))
    .slice()
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function deckInventoryProjection(manifest: AssetManifest) {
  return manifest.entries
    .filter((entry) => entry.id.startsWith('city-decor:') && entry.id !== 'city-decor:materials')
    .map((entry) => ({
      id: entry.id,
      kind: entry.id.slice('city-decor:'.length),
      type: 'PROCEDURAL_MESH',
      version: entry.version,
      role: entry.role,
      source: entry.source,
      license: entry.license,
      count: entry.count,
      costBytes: entry.decoded.geometryBytes,
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function artifactFingerprint(manifest: BuildManifestEvidence): string {
  return sha256Hex(JSON.stringify(manifest.artifacts));
}

function findArtifactBytes(manifest: BuildManifestEvidence, prefix: string): number | null {
  const artifact = manifest.artifacts.find((entry) => {
    const name = entry.path.split('/').at(-1) ?? '';
    return name.startsWith(`${prefix}-`) && name.endsWith('.wasm');
  });
  return artifact?.bytes ?? null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildAssetManifestEvidence(root: string): AssetManifestEvidence {
  const budgets = readJson<BudgetDocument>(root, 'Docs/performance-budgets.json');
  const physicsWasmLimit =
    budgets.resourceAdmissionContracts.physics.reservedWasmAdmissionEstimateBytes;
  if (!Number.isSafeInteger(physicsWasmLimit) || physicsWasmLimit <= 0)
    throw new Error('Invalid physics WASM admission budget');

  const wasm = wasmSources(root, physicsWasmLimit);
  // No final GLB asset ships in V1 yet; the registry contract is versioned with zero definitions
  // instead of inventing placeholder entries just to fill the manifest.
  const collection = collectAssetManifestSources({ wasm, registry: [] });
  const manifest = createAssetManifest(collection.records);
  const missingSourceIds = collection.missing
    .filter((entry) => entry.role === 'CRITICAL')
    .map((entry) => entry.id);
  const audit = auditAssetManifest(manifest, {
    criticalIds: collection.criticalIds,
    missingSourceIds,
  });
  const accounting = accountAssetManifest(manifest);
  const scenarios: AssetManifestScenario[] = [];

  const presetResults = {} as Record<
    'LOW' | 'MEDIUM' | 'HIGH',
    { accepted: boolean; diagnostics: readonly AssetManifestBudgetDiagnostic[] }
  >;
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const result = assetManifestBudget(manifest, preset);
    presetResults[preset] = {
      accepted: result.accepted,
      diagnostics: result.diagnostics,
    };
  }

  const residentLimits = {
    geometryBytes: RENDER_ASSET_CAPS.geometryGpuBytes,
    textureBytes: RENDER_ASSET_CAPS.textureGpuBytes.HIGH,
    wasmResidentBytes: physicsWasmLimit + RENDER_ASSET_CAPS.decoderWasmBytes,
    decoderWasmBytes: RENDER_ASSET_CAPS.decoderWasmBytes,
    decoderWorkspaceBytes: RENDER_ASSET_CAPS.decoderWorkspaceBytes,
    audioBytes: AUDIO_LIMITS.maxBufferBytes,
    textBytes:
      PASSENGER_VISUAL_LIMITS.markers * PASSENGER_VISUAL_LIMITS.labelCodeUnits * 2 +
      PASSENGER_VISUAL_LIMITS.textCodeUnits * 2,
  };
  const residentDiagnostics = checkResidentBudgets(manifest, residentLimits);

  // Scenario 1: a rebuild changes exactly one asset payload.
  const rebuilt = collection.records.map((entry): AssetSourceRecord =>
    entry.id === 'vehicle:sedan:near'
      ? {
          ...entry,
          decoded: { ...entry.decoded, geometryBytes: entry.decoded.geometryBytes + 640 },
        }
      : entry,
  );
  const rebuiltManifest = createAssetManifest(rebuilt);
  const rebuiltDiff = diffAssetCache(manifest, rebuiltManifest);
  scenarios.push({
    name: 'rebuild-one-asset',
    detail:
      'Rebuild with vehicle:sedan:near geometry +640 B: only that cache entry is invalidated.',
    data: {
      changed: 'vehicle:sedan:near',
      invalidatedIds: rebuiltDiff.invalidatedIds,
      invalidated: rebuiltDiff.invalidatedIds.length,
      reused: rebuiltDiff.reusedIds.length,
      evicted: rebuiltDiff.evictedIds.length,
      manifestHashChanged: rebuiltManifest.hash !== manifest.hash,
    },
  });

  // Scenario 2: a format-version bump invalidates every cache key on purpose.
  const bumpedManifest = createAssetManifest(collection.records, {
    formatVersion: ASSET_MANIFEST_FORMAT_VERSION + 1,
  });
  const bumpedDiff = diffAssetCache(manifest, bumpedManifest);
  scenarios.push({
    name: 'format-version-bump',
    detail:
      'Format version bump keeps every asset unchanged but invalidates all cache keys explicitly.',
    data: {
      formatVersion: bumpedManifest.formatVersion,
      invalidated: bumpedDiff.invalidatedIds.length,
      reused: bumpedDiff.reusedIds.length,
    },
  });

  // Scenario 3: a missing critical asset blocks the release with the exact ids.
  const removedIds = ['runtime:wasm:rapier', 'vehicle:sedan:near'];
  const partialManifest = createAssetManifest(
    collection.records.filter((entry) => !removedIds.includes(entry.id)),
    { formatVersion: ASSET_MANIFEST_FORMAT_VERSION },
  );
  const partialAudit = auditAssetManifest(partialManifest, {
    criticalIds: collection.criticalIds,
  });
  scenarios.push({
    name: 'missing-critical-asset',
    detail: 'Two critical records removed: release blocked with the exact missing id list.',
    data: {
      removedIds,
      entries: partialManifest.entries.length,
      releaseBlocked: partialAudit.releaseBlocked,
      reason: partialAudit.reason,
      missingCriticalIds: partialAudit.missingCriticalIds,
    },
  });

  // Scenario 4: an unreadable real source file is reported, never fabricated.
  const missingWasm = wasmSources(root, physicsWasmLimit).map((entry) =>
    entry.id === 'runtime:wasm:rapier' ? { ...entry, available: false } : entry,
  );
  const missingCollection = collectAssetManifestSources({
    wasm: missingWasm,
    registry: [],
  });
  const missingManifest = createAssetManifest(missingCollection.records);
  const missingAudit = auditAssetManifest(missingManifest, {
    criticalIds: missingCollection.criticalIds,
    missingSourceIds: missingCollection.missing.map((entry) => entry.id),
  });
  scenarios.push({
    name: 'missing-source-file',
    detail: 'Rapier WASM file unavailable: reported as missing source and the release is blocked.',
    data: {
      missing: missingCollection.missing.map((entry) => ({
        id: entry.id,
        reason: entry.reason,
      })),
      entries: missingManifest.entries.length,
      releaseBlocked: missingAudit.releaseBlocked,
      reason: missingAudit.reason,
      missingCriticalIds: missingAudit.missingCriticalIds,
    },
  });

  // Scenario 5: a corrupted manifest without provenance is blocked by the audit.
  const corruptedManifest = {
    ...manifest,
    entries: manifest.entries.map((entry) =>
      entry.id === 'city-decor:tree' ? { ...entry, license: ' ' } : entry,
    ),
  };
  const corruptedAudit = auditAssetManifest(corruptedManifest, {
    criticalIds: collection.criticalIds,
  });
  scenarios.push({
    name: 'missing-provenance',
    detail: 'A manifest entry without licence is blocked before release.',
    data: {
      corrupted: 'city-decor:tree',
      releaseBlocked: corruptedAudit.releaseBlocked,
      reason: corruptedAudit.reason,
      missingProvenanceIds: corruptedAudit.missingProvenanceIds,
    },
  });

  // Scenario 6: wire versus resident accounting from the real files.
  const rapierEntry = manifest.entries.find((entry) => entry.id === 'runtime:wasm:rapier')!;
  const glslangEntry = manifest.entries.find((entry) => entry.id === 'runtime:wasm:glslang')!;
  scenarios.push({
    name: 'wire-vs-resident',
    detail:
      'Base64 transport grows the Rapier module on the wire, while residency uses the 021 declared WASM estimate; gzip only shrinks transport.',
    data: {
      rapierRawBytes: rapierEntry.wire.rawBytes,
      rapierEncodedBytes: rapierEntry.wire.encodedBytes,
      rapierResidentBytes: rapierEntry.decoded.wasmResidentBytes,
      rapierBase64Expansion: rapierEntry.wire.encodedBytes - rapierEntry.wire.rawBytes,
      glslangRawBytes: glslangEntry.wire.rawBytes,
      glslangGzipBytes: glslangEntry.wire.gzipBytes,
      glslangResidentBytes: glslangEntry.decoded.wasmResidentBytes,
      totalWireBytes: accounting.wire.encodedBytes,
      totalDecodedBytes: accounting.decoded.totalBytes,
    },
  });

  const vehicleEvidence = readJson<VehicleEvidence>(
    root,
    'Docs/Evidence/145-vehicle-assets/measurement.json',
  );
  const decorEvidence = readJson<DecorEvidence>(
    root,
    'Docs/Evidence/146-city-assets/measurement.json',
  );
  const audioEvidence = readJson<AudioEvidence>(root, 'Docs/Evidence/148-audio-engine/report.json');
  const build145 = readJson<BuildManifestEvidence>(
    root,
    'Docs/Evidence/145-vehicle-assets/build-manifest.json',
  );
  const build146 = readJson<BuildManifestEvidence>(
    root,
    'Docs/Evidence/146-city-assets/build-manifest.json',
  );
  const build223 = readJson<BuildManifestEvidence>(
    root,
    'Docs/Evidence/223-render-assets/build-manifest.json',
  );

  const sortedVehicleEvidence = [...vehicleEvidence.declared].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const decorInventory = deckInventoryProjection(manifest);
  const sortedDecorEvidence = [...decorEvidence.decor.inventory].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const audioIds = manifest.entries
    .filter((entry) => entry.id.startsWith('audio:cue:'))
    .map((entry) => entry.id.slice('audio:cue:'.length))
    .sort();
  const evidenceAudioIds = audioEvidence.contract.cues.map((cue) => cue.cueId).sort();
  const decorGpuBytes = manifest.entries
    .filter((entry) => entry.id.startsWith('city-decor:') && entry.id !== 'city-decor:materials')
    .reduce((sum, entry) => sum + entry.decoded.geometryBytes, 0);
  const emittedWasm = new Map(
    [build145, build146, build223].map((build) => [
      build,
      {
        glslang: findArtifactBytes(build, 'glslang'),
        twgsl: findArtifactBytes(build, 'twgsl'),
      },
    ]),
  );

  const checks: AssetManifestCheck[] = [
    {
      name: 'manifest-format-versioned',
      pass:
        manifest.formatVersion === ASSET_MANIFEST_FORMAT_VERSION &&
        manifest.manifestVersion === ASSET_MANIFEST_VERSION &&
        manifest.entries.length === collection.records.length &&
        /^[0-9a-f]{64}$/.test(manifest.hash) &&
        manifest.etag === `"${manifest.hash.slice(0, 32)}"`,
      detail: `format ${manifest.formatVersion}, version ${manifest.manifestVersion}, entries ${manifest.entries.length}, hash ${manifest.hash.slice(0, 12)}…`,
    },
    {
      name: 'manifest-provenance-complete',
      pass:
        manifest.entries.every(
          (entry) =>
            entry.version.trim().length > 0 &&
            entry.source.trim().length > 0 &&
            entry.license.trim().length > 0 &&
            entry.consumers.length > 0,
        ) && audit.complete,
      detail: `audit ${audit.reason}; provenance complete for ${manifest.entries.length} entries`,
    },
    {
      name: 'manifest-deterministic',
      pass:
        createAssetManifest(collection.records).hash === manifest.hash &&
        sameJson(createAssetManifest(collection.records).entries, manifest.entries),
      detail: 'two collections of the same real sources produce the same hash and entries',
    },
    {
      name: 'selective-cache-invalidation',
      pass:
        rebuiltDiff.invalidatedIds.length === 1 &&
        rebuiltDiff.invalidatedIds[0] === 'vehicle:sedan:near' &&
        rebuiltDiff.reusedIds.length === manifest.entries.length - 1 &&
        rebuiltDiff.evictedIds.length === 0 &&
        rebuiltManifest.hash !== manifest.hash,
      detail: `invalidated ${rebuiltDiff.invalidatedIds.length} (${rebuiltDiff.invalidatedIds.join(', ')}), reused ${rebuiltDiff.reusedIds.length}, evicted ${rebuiltDiff.evictedIds.length}`,
    },
    {
      name: 'format-version-invalidates-all',
      pass:
        bumpedDiff.invalidatedIds.length === manifest.entries.length &&
        bumpedDiff.reusedIds.length === 0,
      detail: `format bump invalidated ${bumpedDiff.invalidatedIds.length}/${manifest.entries.length} entries explicitly`,
    },
    {
      name: 'missing-critical-blocks-release',
      pass:
        partialAudit.releaseBlocked === true &&
        partialAudit.reason === 'MISSING_CRITICAL_ASSETS' &&
        sameJson(partialAudit.missingCriticalIds, [...removedIds].sort()) &&
        partialManifest.entries.length === manifest.entries.length - removedIds.length,
      detail: `reason ${partialAudit.reason}, missing ${partialAudit.missingCriticalIds.join(', ')}, entries ${partialManifest.entries.length}`,
    },
    {
      name: 'missing-source-file-blocks-release',
      pass:
        missingCollection.missing.some((entry) => entry.id === 'runtime:wasm:rapier') &&
        missingManifest.entries.every((entry) => entry.id !== 'runtime:wasm:rapier') &&
        missingAudit.releaseBlocked === true &&
        missingAudit.missingCriticalIds.includes('runtime:wasm:rapier') &&
        missingManifest.entries.length === manifest.entries.length - 1,
      detail: `reason ${missingAudit.reason}, missing ${missingCollection.missing.map((entry) => entry.id).join(', ')}`,
    },
    {
      name: 'missing-provenance-blocks-release',
      pass:
        corruptedAudit.releaseBlocked === true &&
        corruptedAudit.reason === 'MISSING_PROVENANCE' &&
        sameJson(corruptedAudit.missingProvenanceIds, ['city-decor:tree']),
      detail: `reason ${corruptedAudit.reason}, missing provenance ${corruptedAudit.missingProvenanceIds.join(', ')}`,
    },
    {
      name: 'wire-separated-from-resident',
      pass:
        rapierEntry.wire.encodedBytes > rapierEntry.wire.rawBytes &&
        rapierEntry.decoded.wasmResidentBytes > rapierEntry.wire.encodedBytes &&
        (glslangEntry.wire.gzipBytes ?? Infinity) < glslangEntry.wire.rawBytes &&
        accounting.decoded.totalBytes > accounting.wire.encodedBytes,
      detail: `wire ${accounting.wire.encodedBytes} B, decoded ${accounting.decoded.totalBytes} B, rapier base64 ${rapierEntry.wire.encodedBytes} B > raw ${rapierEntry.wire.rawBytes} B, resident ${rapierEntry.decoded.wasmResidentBytes} B`,
    },
    {
      name: 'transfer-budget-223',
      pass:
        presetResults.LOW.accepted &&
        presetResults.MEDIUM.accepted &&
        presetResults.HIGH.accepted &&
        constantCriticalCodeBudget(manifest) <= RENDER_ASSET_CAPS.criticalCodeTransferBytes,
      detail: `first-ride transfer ${accounting.wire.encodedBytes} B <= ${RENDER_ASSET_CAPS.firstRideTransferBytes} B; critical WASM ${constantCriticalCodeBudget(manifest)} B <= ${RENDER_ASSET_CAPS.criticalCodeTransferBytes} B`,
    },
    {
      name: 'resident-budgets-021-223-148',
      pass: residentDiagnostics.length === 0,
      detail:
        residentDiagnostics.length === 0
          ? `geometry ${accounting.decoded.geometryBytes} B, textures ${accounting.decoded.textureBytes} B, WASM resident ${accounting.decoded.wasmResidentBytes} B, decoders ${accounting.decoded.decoderWasmBytes} B / workspace ${accounting.decoded.decoderWorkspaceBytes} B, audio ${accounting.decoded.audioBytes} B`
          : residentDiagnostics
              .map((entry) => `${entry.metric} ${entry.actual} > ${entry.limit}`)
              .join('; '),
    },
    {
      name: 'registry-honest-empty',
      pass:
        collection.registry.definitions === 0 &&
        collection.registry.decoderWasmBytes === 0 &&
        collection.registry.decoderWorkspaceBytes === 0 &&
        manifest.entries.every((entry) => entry.kind !== 'GLB'),
      detail:
        'no final GLB asset ships in V1; the registry decoder WASM/workspace stay 0 under the 8/16 MiB caps instead of fabricated entries',
    },
    {
      name: 'cross-check-145-vehicle-evidence',
      pass: sameJson(vehicleProjection(manifest), sortedVehicleEvidence),
      detail: `manifest vehicle budget equals Docs/Evidence/145-vehicle-assets/measurement.json (${sortedVehicleEvidence.length} assets)`,
    },
    {
      name: 'cross-check-146-city-evidence',
      pass:
        sameJson(decorInventory, sortedDecorEvidence) &&
        decorGpuBytes === decorEvidence.decor.stats.gpuBytes &&
        Object.values(decorEvidence.decor.countsByKind).reduce((sum, count) => sum + count, 0) ===
          decorEvidence.decor.stats.items,
      detail: `decor inventory ${decorInventory.length} kinds, ${decorGpuBytes} B equals the 146 measured ${decorEvidence.decor.stats.gpuBytes} B and ${decorEvidence.decor.stats.items} items`,
    },
    {
      name: 'cross-check-148-audio-evidence',
      pass:
        sameJson(audioIds, evidenceAudioIds) &&
        audioEvidence.contract.placeholderAssets.includes('procedural') &&
        accounting.decoded.audioBytes <= AUDIO_LIMITS.maxBufferBytes,
      detail: `${audioIds.length} cue ids match the 148 report; ${accounting.decoded.audioBytes} B <= ${AUDIO_LIMITS.maxBufferBytes} B`,
    },
    {
      name: 'build-evidence-hashes-recomputed',
      pass:
        artifactFingerprint(build145) === build145.artifactHash &&
        artifactFingerprint(build146) === build146.artifactHash &&
        artifactFingerprint(build223) === build223.artifactHash,
      detail: `artifact hashes recomputed for 145 (${build145.artifacts.length}), 146 (${build146.artifacts.length}) and 223 (${build223.artifacts.length}) builds`,
    },
    {
      name: 'build-wasm-artifacts-match-packages',
      pass: [build145, build146, build223].every(
        (build) =>
          emittedWasm.get(build)?.glslang === glslangEntry.wire.rawBytes &&
          emittedWasm.get(build)?.twgsl === twgslBytes(manifest),
      ),
      detail:
        'emitted glslang/twgsl bytes in the real 145/146/223 builds equal the package WASM sizes in the manifest',
    },
  ];

  const passed = checks.filter((entry) => entry.pass).length;
  const report: AssetManifestReport = {
    version: ASSET_MANIFEST_VERSION,
    formatVersion: manifest.formatVersion,
    manifest: {
      hash: manifest.hash,
      etag: manifest.etag,
      entries: manifest.entries.length,
      critical: manifest.entries.filter((entry) => entry.role === 'CRITICAL').length,
      optional: manifest.entries.filter((entry) => entry.role === 'OPTIONAL').length,
      placeholder: manifest.entries.filter((entry) => entry.placeholder).length,
      wireBytes: accounting.wire.encodedBytes,
      decodedBytes: accounting.decoded.totalBytes,
    },
    accounting,
    registry: collection.registry,
    audit,
    budgets: presetResults,
    inventory: manifest.entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      role: entry.role,
      version: entry.version,
      count: entry.count,
      consumers: entry.consumers,
      cacheKey: entry.cacheKey,
      inputsHash: entry.inputsHash,
      wireBytes: entry.wire.encodedBytes,
      decodedBytes: Object.values(entry.decoded).reduce((sum, value) => sum + value, 0),
    })),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  };
  return { manifest, report, collection };
}

function constantCriticalCodeBudget(manifest: AssetManifest): number {
  return assetBudgetManifest(manifest).criticalCodeTransferBytes;
}

function twgslBytes(manifest: AssetManifest): number {
  return manifest.entries.find((entry) => entry.id === 'runtime:wasm:twgsl')?.wire.rawBytes ?? NaN;
}

export function runAssetManifestReport(root: string): AssetManifestReport {
  return buildAssetManifestEvidence(root).report;
}

export function serializeAssetManifest(manifest: AssetManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function assetManifestReportMarkdown(report: AssetManifestReport): string {
  const lines = [
    '# PBI 150 — manifest și pipeline de asseturi',
    '',
    `Versiune contract: \`${report.version}\`, format \`${report.formatVersion}\`.`,
    '',
    '## Identitate',
    '',
    '| Câmp | Valoare |',
    '| --- | --- |',
    `| Intrări | ${report.manifest.entries} (${report.manifest.critical} critice, ${report.manifest.optional} opționale) |`,
    `| Placeholder-uri marcate | ${report.manifest.placeholder} |`,
    `| Hash manifest | \`${report.manifest.hash}\` |`,
    `| ETag | \`${report.manifest.etag}\` |`,
    `| Bytes pe wire | ${report.manifest.wireBytes} B |`,
    `| Resurse decodate estimate | ${report.manifest.decodedBytes} B |`,
    '',
    '## Contabilitate separată',
    '',
    '| Categorie | Bytes |',
    '| --- | ---: |',
    `| Wire — raw | ${report.accounting.wire.rawBytes} |`,
    `| Wire — encoded | ${report.accounting.wire.encodedBytes} |`,
    `| Wire — gzip comparativ | ${report.accounting.wire.gzipBytes} |`,
    `| Decodat — geometrie | ${report.accounting.decoded.geometryBytes} |`,
    `| Decodat — texturi | ${report.accounting.decoded.textureBytes} |`,
    `| Decodat — WASM rezident | ${report.accounting.decoded.wasmResidentBytes} |`,
    `| Decodat — WASM decodere | ${report.accounting.decoded.decoderWasmBytes} |`,
    `| Decodat — workspace decodere | ${report.accounting.decoded.decoderWorkspaceBytes} |`,
    `| Decodat — audio | ${report.accounting.decoded.audioBytes} |`,
    `| Decodat — text | ${report.accounting.decoded.textBytes} |`,
    `| Decodat — total | ${report.accounting.decoded.totalBytes} |`,
    '',
    '## Scenarii',
    '',
    ...report.scenarios.map(
      (scenario) =>
        `- \`${scenario.name}\` — ${scenario.detail} → \`${JSON.stringify(scenario.data)}\``,
    ),
    '',
    '## Verificări',
    '',
    '| Verificare | Rezultat | Detaliu |',
    '| --- | --- | --- |',
    ...report.checks.map(
      (check) => `| \`${check.name}\` | ${check.pass ? 'PASS' : 'FAIL'} | ${check.detail} |`,
    ),
    '',
    `Rezultat: ${report.summary.passed}/${report.summary.checks} verificări, overall ${
      report.summary.pass ? 'PASS' : 'FAIL'
    }.`,
    '',
  ];
  return lines.join('\n');
}
