/**
 * PBI 150 — real asset sources of the build manifest.
 *
 * Every record is derived from the module that already owns the asset contract:
 *
 * - 145 `vehicleAssetInventory()` + `vehicleAssetManifest()` (procedural car geometry/materials);
 * - 146 `cityDecorInventory(plan)` + `cityDecorManifest(plan)` over the real 042 layout;
 * - 147 `PASSENGER_VISUAL_LIMITS` (marker read model; text only, no binary asset);
 * - 148 `AUDIO_CUES` (procedural placeholder buffers) and 149 reusing the same cue table;
 * - the registry/runtime WASM files, whose real byte sizes the Node pipeline reads from disk.
 *
 * A source that cannot be read is returned in `missing` with a closed reason; it is never replaced
 * by a synthetic entry with invented bytes.
 */
import {
  createCityDecorPlan,
  cityDecorManifest,
  cityDecorInventory,
  vehicleAssetInventory,
  vehicleAssetManifest,
  ATMOSPHERE_PRESETS,
  ATMOSPHERE_VERSION,
  environmentTextureBytes,
  SURFACE_PRESETS,
  SURFACE_TEXTURES_VERSION,
  SURFACE_TEXTURE_IDS,
  SURFACE_TEXTURE_SPECS,
  type CityDecorPlan,
} from '../rendering';
import { createCityLayout, createNeighbourhoodMap } from '../world';
import { GLB_ASSETS } from '../rendering';
import { AUDIO_CUES, AUDIO_CUE_IDS, AUDIO_LIMITS, estimateAudioBufferBytes } from '../audio';
import { PASSENGER_VISUAL_LIMITS, PASSENGER_VISUAL_VERSION } from '../ui';
import {
  type AssetDecodedCost,
  type AssetManifestKind,
  type AssetResidencyBasis,
  type AssetRole,
  type AssetSourceRecord,
  type AssetWireEncoding,
} from './asset-manifest';

export const ASSET_SOURCE_MISS_REASONS = [
  'WASM_FILE_MISSING',
  'REGISTRY_DEFINITION_MISSING',
  'INVENTORY_ENTRY_MISSING',
] as const;
export type AssetSourceMissReason = (typeof ASSET_SOURCE_MISS_REASONS)[number];

export interface MissingAssetSource {
  readonly id: string;
  readonly reason: AssetSourceMissReason;
  /** Role of the expected entry; only a missing CRITICAL source blocks the release. */
  readonly role: AssetRole;
  readonly detail: string;
}

export interface WasmFileSource {
  readonly id: string;
  readonly version: string;
  readonly source: string;
  readonly license: string;
  readonly consumers: readonly string[];
  readonly role: AssetRole;
  readonly firstRide: boolean;
  readonly encoding: Extract<AssetWireEncoding, 'IDENTITY' | 'BASE64_INLINE'>;
  readonly rawBytes: number;
  readonly encodedBytes: number;
  readonly gzipBytes: number | null;
  readonly residentBytes: number;
  readonly residencyBasis: AssetResidencyBasis;
  /** A GLB extension decoder (not the core path) reserves decoder WASM/workspace bytes. */
  readonly decoder: boolean;
  readonly workspaceBytes: number;
  /** False when the real file could not be read; the source is reported, never fabricated. */
  readonly available: boolean;
}

export interface RegistryAssetSource {
  readonly id: string;
  readonly version: string;
  readonly source: string;
  readonly license: string;
  readonly consumers: readonly string[];
  readonly critical: boolean;
  readonly firstRide: boolean;
  readonly transferBytes: number;
  readonly gzipBytes: number | null;
  readonly geometryBytes: number;
  readonly textureBytes: number;
  readonly decoderWasmBytes: number;
  readonly decoderWorkspaceBytes: number;
  readonly available: boolean;
}

export interface AssetManifestSourceOptions {
  readonly wasm: readonly WasmFileSource[];
  readonly registry?: readonly RegistryAssetSource[];
  /** Overrides the real 042 layout only for tests; production uses the shipped layout. */
  readonly decorPlan?: CityDecorPlan;
}

export interface AssetManifestRegistrySummary {
  readonly definitions: number;
  readonly decoderWasmBytes: number;
  readonly decoderWorkspaceBytes: number;
}

export interface AssetManifestCollection {
  readonly records: readonly AssetSourceRecord[];
  /** Expected critical ids of this build, including sources that are missing. */
  readonly criticalIds: readonly string[];
  readonly missing: readonly MissingAssetSource[];
  readonly registry: AssetManifestRegistrySummary;
}

const PROCEDURAL_WIRE = Object.freeze({
  encoding: 'NONE' as const,
  rawBytes: 0,
  encodedBytes: 0,
  gzipBytes: null,
});
const ZERO_DECODED: AssetDecodedCost = Object.freeze({
  geometryBytes: 0,
  textureBytes: 0,
  wasmResidentBytes: 0,
  decoderWasmBytes: 0,
  decoderWorkspaceBytes: 0,
  audioBytes: 0,
  textBytes: 0,
});

function decoded(cost: Partial<AssetDecodedCost>): AssetDecodedCost {
  return Object.freeze({ ...ZERO_DECODED, ...cost });
}

function record(
  source: Omit<AssetSourceRecord, 'wire' | 'decoded'> & {
    readonly wire?: AssetSourceRecord['wire'];
    readonly decoded?: AssetSourceRecord['decoded'];
  },
): AssetSourceRecord {
  return Object.freeze({
    ...source,
    wire: source.wire ?? PROCEDURAL_WIRE,
    decoded: source.decoded ?? ZERO_DECODED,
  });
}

function kindForVehicle(entryType: 'PROCEDURAL_MESH' | 'MATERIAL_SET'): AssetManifestKind {
  return entryType === 'MATERIAL_SET' ? 'MATERIAL_SET' : 'PROCEDURAL_MESH';
}

function vehicleRecords(): readonly AssetSourceRecord[] {
  const inventory = vehicleAssetInventory();
  const budget = vehicleAssetManifest({ firstRide: true });
  const budgeted = new Map(budget.assets.map((asset) => [asset.id, asset]));
  return inventory.map((entry) => {
    const cost = budgeted.get(entry.id);
    if (!cost) throw new Error(`Vehicle inventory entry without budget: ${entry.id}`);
    return record({
      id: entry.id,
      kind: kindForVehicle(entry.type),
      role: 'CRITICAL',
      version: entry.version,
      source: entry.source,
      license: entry.license,
      count: 1,
      firstRide: cost.firstRide,
      placeholder: false,
      shaderVariants: cost.shaderVariants,
      residencyBasis: 'CONTRACT_ESTIMATE',
      consumers: ['145'],
      decoded: decoded({
        geometryBytes: cost.geometryGpuBytes,
        textureBytes: cost.textureGpuBytes,
      }),
    });
  });
}

function decorRecords(plan: CityDecorPlan): readonly AssetSourceRecord[] {
  const inventory = cityDecorInventory(plan);
  const budget = cityDecorManifest(plan);
  const budgeted = new Map(budget.assets.map((asset) => [asset.id, asset]));
  const provenance = inventory[0];
  if (!provenance) throw new Error('City decor inventory is empty');
  const records = inventory.map((entry) => {
    const cost = budgeted.get(entry.id);
    if (!cost) throw new Error(`City decor inventory entry without budget: ${entry.id}`);
    return record({
      id: entry.id,
      kind: 'PROCEDURAL_MESH',
      role: entry.role,
      version: entry.version,
      source: entry.source,
      license: entry.license,
      count: entry.count,
      firstRide: false,
      placeholder: false,
      shaderVariants: 0,
      residencyBasis: 'CONTRACT_ESTIMATE',
      consumers: ['146'],
      decoded: decoded({ geometryBytes: entry.costBytes }),
    });
  });
  const materialsId = 'city-decor:materials';
  const materials = budgeted.get(materialsId);
  if (!materials) throw new Error(`City decor material entry missing: ${materialsId}`);
  return [
    ...records,
    record({
      id: materialsId,
      kind: 'MATERIAL_SET',
      role: 'OPTIONAL',
      version: budget.version,
      source: provenance.source,
      license: provenance.license,
      count: 1,
      firstRide: false,
      placeholder: false,
      shaderVariants: materials.shaderVariants,
      residencyBasis: 'CONTRACT_ESTIMATE',
      consumers: ['146'],
    }),
  ];
}

/**
 * PBI 243 — cerul procedural și cubul de mediu (IBL), generate la rulare din starea de atmosferă
 * (`src/rendering/atmosphere.ts`): nu există fișier de transferat. Costul GPU este cel al celui mai
 * mare preset (HIGH, 128 px half-float cu lanț de mip-uri); LOW folosește 32 px.
 */
function atmosphereRecords(): readonly AssetSourceRecord[] {
  const base = {
    kind: 'MATERIAL_SET' as const,
    role: 'CRITICAL' as const,
    version: ATMOSPHERE_VERSION,
    source: 'PBI 243 procedural atmosphere src/rendering/atmosphere.ts (GLSL sky + generated cube)',
    license: 'Project license — original procedural asset, no third-party texture or HDRI',
    count: 1,
    firstRide: false,
    placeholder: false,
    residencyBasis: 'CONTRACT_ESTIMATE' as const,
    consumers: ['243'],
  };
  const largest = Math.max(...Object.values(ATMOSPHERE_PRESETS).map((t) => t.environmentSize));
  return [
    record({ ...base, id: 'atmosphere:sky-shader', shaderVariants: 2 }),
    record({
      ...base,
      id: 'atmosphere:environment-cube',
      shaderVariants: 0,
      decoded: decoded({ textureBytes: environmentTextureBytes(largest) }),
    }),
  ];
}

/**
 * PBI 245/246 — texturile procedurale ale suprafețelor (asfalt, marcaje, trotuar, bordură, iarbă,
 * teren) și ale fațadelor (cărămidă, tencuială, beton): generate la încărcare din zgomot determinist
 * (`src/rendering/surface-textures.ts`), fără fișier. Câte o înregistrare pe textură; costul GPU este
 * cel al presetului HIGH (1024 px de bază), LOW folosește 256.
 */
const FACADE_TEXTURE_IDS: ReadonlySet<string> = new Set([
  'facadeBrick',
  'facadePlaster',
  'facadeConcrete',
]);

function surfaceRecords(): readonly AssetSourceRecord[] {
  const largest = Math.max(...Object.values(SURFACE_PRESETS).map((t) => t.baseSize));
  return SURFACE_TEXTURE_IDS.map((id) => {
    const spec = SURFACE_TEXTURE_SPECS[id];
    const width = Math.max(8, Math.round(largest * spec.sizeFraction.w));
    const height = Math.max(8, Math.round(largest * spec.sizeFraction.h));
    const images = 1 + (spec.hasNormal ? 1 : 0) + (spec.hasOrm ? 1 : 0);
    const owner = FACADE_TEXTURE_IDS.has(id) ? '246' : '245';
    return record({
      id: `surface:texture:${id}`,
      kind: 'MATERIAL_SET',
      role: 'CRITICAL',
      version: SURFACE_TEXTURES_VERSION,
      source: `PBI ${owner} procedural surface texture src/rendering/surface-textures.ts (${spec.description})`,
      license:
        'Project license — original procedural texture, no photo, scan or third-party material',
      count: 1,
      firstRide: false,
      placeholder: false,
      shaderVariants: id === 'asphalt' ? 2 : 0,
      residencyBasis: 'CONTRACT_ESTIMATE',
      consumers: [owner],
      decoded: decoded({ textureBytes: Math.ceil(((width * height * 4 * 4) / 3) * images) }),
    });
  });
}

function audioRecords(): readonly AssetSourceRecord[] {
  return AUDIO_CUE_IDS.map((cueId) => {
    const cue = AUDIO_CUES[cueId];
    return record({
      id: `audio:cue:${cueId}`,
      kind: 'PROCEDURAL_AUDIO',
      role: 'CRITICAL',
      version: AUDIO_LIMITS.version,
      source: `PBI 148 procedural cue table src/audio/contracts.ts (${cueId})`,
      license: 'Project license — original procedural placeholder, not a final recorded asset',
      count: 1,
      firstRide: true,
      placeholder: true,
      shaderVariants: 0,
      residencyBasis: 'CONTRACT_ESTIMATE',
      consumers: ['148', '149'],
      decoded: decoded({ audioBytes: estimateAudioBufferBytes(cue.buffer) }),
    });
  });
}

/**
 * PBI 254 — modelele 3D realiste (CC0, Innerscene). Fiecare GLB are un fișier real în
 * `public/assets/models`, deci transferul este `IDENTITY` cu dimensiunea exactă de pe disc;
 * geometria și texturile decodate sunt citite din accesoriile și imaginile GLB-ului.
 */
function glbRecords(): readonly AssetSourceRecord[] {
  return GLB_ASSETS.map((asset) =>
    record({
      id: `glb:${asset.id}`,
      kind: 'GLB',
      role: asset.critical ? 'CRITICAL' : 'OPTIONAL',
      version: asset.version,
      source: `PBI 254 ${asset.source}`,
      license: asset.license,
      count: 1,
      firstRide: asset.category === 'vehicle' || asset.category === 'character',
      placeholder: false,
      shaderVariants: asset.category === 'character' ? 1 : 0,
      residencyBasis: 'DECLARED_ADMISSION_ESTIMATE',
      consumers: ['254'],
      wire: Object.freeze({
        encoding: 'IDENTITY' as const,
        rawBytes: asset.bytes,
        encodedBytes: asset.bytes,
        gzipBytes: null,
      }),
      decoded: decoded({
        geometryBytes: asset.geometryBytes,
        textureBytes: asset.textureBytes,
      }),
    }),
  );
}

function passengerRecords(): readonly AssetSourceRecord[] {
  return [
    record({
      id: 'passenger:markers',
      kind: 'UI_TEXT',
      role: 'OPTIONAL',
      version: PASSENGER_VISUAL_VERSION,
      source: 'PBI 147 passenger marker read model src/ui/passenger-visual-format.ts',
      license: 'Project license — DOM marker port, no third-party asset',
      count: PASSENGER_VISUAL_LIMITS.markers,
      firstRide: false,
      placeholder: false,
      shaderVariants: 0,
      residencyBasis: 'CONTRACT_ESTIMATE',
      consumers: ['147'],
      decoded: decoded({
        textBytes:
          PASSENGER_VISUAL_LIMITS.markers * PASSENGER_VISUAL_LIMITS.labelCodeUnits * 2 +
          PASSENGER_VISUAL_LIMITS.textCodeUnits * 2,
      }),
    }),
  ];
}

function wasmRecords(options: AssetManifestSourceOptions): {
  records: AssetSourceRecord[];
  missing: MissingAssetSource[];
} {
  const records: AssetSourceRecord[] = [];
  const missing: MissingAssetSource[] = [];
  for (const source of options.wasm) {
    if (!source.available) {
      missing.push(
        Object.freeze({
          id: source.id,
          reason: 'WASM_FILE_MISSING',
          role: source.role,
          detail: source.source,
        }),
      );
      continue;
    }
    records.push(
      record({
        id: source.id,
        kind: 'WASM_MODULE',
        role: source.role,
        version: source.version,
        source: source.source,
        license: source.license,
        count: 1,
        firstRide: source.firstRide,
        placeholder: false,
        shaderVariants: 0,
        residencyBasis: source.residencyBasis,
        consumers: source.consumers,
        wire: Object.freeze({
          encoding: source.encoding,
          rawBytes: source.rawBytes,
          encodedBytes: source.encodedBytes,
          gzipBytes: source.gzipBytes,
        }),
        decoded: decoded({
          wasmResidentBytes: source.residentBytes,
          decoderWasmBytes: source.decoder ? source.residentBytes : 0,
          decoderWorkspaceBytes: source.decoder ? source.workspaceBytes : 0,
        }),
      }),
    );
  }
  return { records, missing };
}

function registryRecords(options: AssetManifestSourceOptions): {
  records: AssetSourceRecord[];
  missing: MissingAssetSource[];
  summary: AssetManifestRegistrySummary;
} {
  const records: AssetSourceRecord[] = [];
  const missing: MissingAssetSource[] = [];
  let decoderWasmBytes = 0;
  let decoderWorkspaceBytes = 0;
  for (const source of options.registry ?? []) {
    decoderWasmBytes += source.decoderWasmBytes;
    decoderWorkspaceBytes += source.decoderWorkspaceBytes;
    if (!source.available) {
      missing.push(
        Object.freeze({
          id: source.id,
          reason: 'REGISTRY_DEFINITION_MISSING',
          role: source.critical ? 'CRITICAL' : 'OPTIONAL',
          detail: source.source,
        }),
      );
      continue;
    }
    records.push(
      record({
        id: source.id,
        kind: 'GLB',
        role: source.critical ? 'CRITICAL' : 'OPTIONAL',
        version: source.version,
        source: source.source,
        license: source.license,
        count: 1,
        firstRide: source.firstRide,
        placeholder: false,
        shaderVariants: 0,
        residencyBasis: 'CONTRACT_ESTIMATE',
        consumers: source.consumers,
        wire: Object.freeze({
          encoding: 'IDENTITY' as const,
          rawBytes: source.transferBytes,
          encodedBytes: source.transferBytes,
          gzipBytes: source.gzipBytes,
        }),
        decoded: decoded({
          geometryBytes: source.geometryBytes,
          textureBytes: source.textureBytes,
          decoderWasmBytes: source.decoderWasmBytes,
          decoderWorkspaceBytes: source.decoderWorkspaceBytes,
        }),
      }),
    );
  }
  return {
    records,
    missing,
    summary: Object.freeze({
      definitions: (options.registry ?? []).length,
      decoderWasmBytes,
      decoderWorkspaceBytes,
    }),
  };
}

/**
 * Collect every manifest record from the real sources of this build. Deterministic and pure: the
 * caller supplies the WASM/registry file measurements read from disk.
 */
export function collectAssetManifestSources(
  options: AssetManifestSourceOptions,
): AssetManifestCollection {
  if (!Array.isArray(options.wasm)) throw new TypeError('WASM sources must be an array');
  const plan = options.decorPlan ?? createCityDecorPlan(createCityLayout(createNeighbourhoodMap()));
  const wasm = wasmRecords(options);
  const registry = registryRecords(options);
  const records = Object.freeze([
    ...vehicleRecords(),
    ...decorRecords(plan),
    ...atmosphereRecords(),
    ...surfaceRecords(),
    ...audioRecords(),
    ...passengerRecords(),
    ...glbRecords(),
    ...wasm.records,
    ...registry.records,
  ]);
  const criticalIds = Object.freeze(
    [
      ...records.filter((entry) => entry.role === 'CRITICAL').map((entry) => entry.id),
      ...wasm.missing.filter((entry) => entry.role === 'CRITICAL').map((entry) => entry.id),
      ...registry.missing.filter((entry) => entry.role === 'CRITICAL').map((entry) => entry.id),
    ].sort(),
  );
  const missing = Object.freeze([...wasm.missing, ...registry.missing]);
  return Object.freeze({
    records,
    criticalIds,
    missing,
    registry: registry.summary,
  });
}
