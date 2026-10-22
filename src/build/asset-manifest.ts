/**
 * PBI 150 — versioned build asset manifest.
 *
 * The manifest is generated from the real asset inventories of PBIs 145/146/147/148/149 and the
 * registry/runtime WASM files. It is a pure build contract:
 *
 * - every entry keeps the provenance of the source (id, type, version, role, source, licence,
 *   consumers) and a content identity (`inputsHash`, `recordHash`);
 * - `cacheKey` is derived only from the byte-relevant inputs plus the manifest format version, so a
 *   new build invalidates exactly the entries whose payload changed;
 * - wire bytes (encoded response bytes) and decoded/resident estimates (geometry, textures, WASM,
 *   decoder workspace, audio, text) are separate categories and never substituted for each other;
 * - a missing critical source blocks the release with a closed reason and the exact id list.
 *
 * Nothing here reads the filesystem or the clock: the Node report pipeline feeds real file sizes in,
 * and the same module is safe to execute in the browser bundle.
 */
import {
  checkAssetManifest,
  type AssetBudgetManifest,
  type BudgetDiagnostic,
  type QualityPreset,
} from '../rendering';
import { canonicalJson, contentHash, sha256Hex } from './content-hash';

export const ASSET_MANIFEST_FORMAT_VERSION = 1 as const;
export const ASSET_MANIFEST_VERSION = '150-asset-manifest-v1' as const;

export const ASSET_MANIFEST_KINDS = [
  'PROCEDURAL_MESH',
  'MATERIAL_SET',
  'PROCEDURAL_AUDIO',
  'UI_TEXT',
  'WASM_MODULE',
  'GLB',
] as const;
export type AssetManifestKind = (typeof ASSET_MANIFEST_KINDS)[number];

export const ASSET_ROLES = ['CRITICAL', 'OPTIONAL'] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/**
 * How the bytes reach the client. `NONE` marks a runtime-generated asset (procedural geometry,
 * synthesised audio) that must never be given a fabricated transfer size. `BASE64_INLINE` is the
 * real encoding of the Rapier WASM inside its compatibility bundle.
 */
export const ASSET_WIRE_ENCODINGS = ['NONE', 'IDENTITY', 'BASE64_INLINE'] as const;
export type AssetWireEncoding = (typeof ASSET_WIRE_ENCODINGS)[number];

export const ASSET_RESIDENCY_BASES = [
  'CONTRACT_ESTIMATE',
  'DECLARED_ADMISSION_ESTIMATE',
  'MODULE_BYTES_LOWER_BOUND',
  'NOT_APPLICABLE',
] as const;
export type AssetResidencyBasis = (typeof ASSET_RESIDENCY_BASES)[number];

export interface AssetWireCost {
  readonly encoding: AssetWireEncoding;
  /** Bytes as stored in the repository/package, before transport encoding. */
  readonly rawBytes: number;
  /** Bytes actually shipped to the client (identity or base64-inlined). */
  readonly encodedBytes: number;
  /** Optional real gzip size of the raw bytes; a transport option, never residency. */
  readonly gzipBytes: number | null;
}

/** Decoded/resident estimates. Disjoint fields: no field is a transfer measurement. */
export interface AssetDecodedCost {
  readonly geometryBytes: number;
  readonly textureBytes: number;
  readonly wasmResidentBytes: number;
  readonly decoderWasmBytes: number;
  readonly decoderWorkspaceBytes: number;
  readonly audioBytes: number;
  readonly textBytes: number;
}

export interface AssetSourceRecord {
  readonly id: string;
  readonly kind: AssetManifestKind;
  readonly role: AssetRole;
  readonly version: string;
  readonly source: string;
  readonly license: string;
  /** How many instances/definitions this record covers (1 unless an inventory reports counts). */
  readonly count: number;
  /** The asset belongs to the first ride and therefore counts against its transfer budget. */
  readonly firstRide: boolean;
  /** Explicitly marked procedural placeholder (PBI 148 audio), never a final recorded asset. */
  readonly placeholder: boolean;
  readonly shaderVariants: number;
  readonly residencyBasis: AssetResidencyBasis;
  /** Real PBIs that consume this asset; 149 reuses the 148 cue table and adds no asset. */
  readonly consumers: readonly string[];
  readonly wire: AssetWireCost;
  readonly decoded: AssetDecodedCost;
}

export interface AssetManifestEntry extends AssetSourceRecord {
  /** Hash of the byte-relevant inputs only: a licence/source edit does not evict cached bytes. */
  readonly inputsHash: string;
  /** Hash of the complete record, including provenance. */
  readonly recordHash: string;
  /** Selective cache identity: format version + asset id + byte-relevant inputs. */
  readonly cacheKey: string;
}

export interface AssetManifest {
  readonly formatVersion: number;
  readonly manifestVersion: string;
  /** Content hash over the complete manifest (provenance included). */
  readonly hash: string;
  /** Quoted HTTP-style strong tag derived from `hash`. */
  readonly etag: string;
  readonly entries: readonly AssetManifestEntry[];
}

export interface AssetManifestOptions {
  /** Defaults to `ASSET_MANIFEST_FORMAT_VERSION`; raising it invalidates every cache key. */
  readonly formatVersion?: number;
  readonly manifestVersion?: string;
}

const DECODED_FIELDS = [
  'geometryBytes',
  'textureBytes',
  'wasmResidentBytes',
  'decoderWasmBytes',
  'decoderWorkspaceBytes',
  'audioBytes',
  'textBytes',
] as const;
type DecodedField = (typeof DECODED_FIELDS)[number];

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function versioned(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z][0-9a-z.-]*$/i.test(value) && value.length <= 64;
}

function validateWire(wire: AssetWireCost, id: string): AssetWireCost {
  if (!ASSET_WIRE_ENCODINGS.includes(wire.encoding))
    throw new TypeError(`Invalid wire encoding for ${id}`);
  if (!isCount(wire.rawBytes) || !isCount(wire.encodedBytes))
    throw new TypeError(`Invalid wire bytes for ${id}`);
  if (wire.gzipBytes !== null && !isCount(wire.gzipBytes))
    throw new TypeError(`Invalid gzip bytes for ${id}`);
  if (wire.encoding === 'NONE') {
    if (wire.rawBytes !== 0 || wire.encodedBytes !== 0 || wire.gzipBytes !== null)
      throw new TypeError(`Runtime-generated asset ${id} cannot declare transfer bytes`);
  } else if (wire.rawBytes === 0) {
    throw new TypeError(`Transferred asset ${id} must declare raw bytes`);
  }
  if (wire.encoding === 'IDENTITY' && wire.encodedBytes !== wire.rawBytes)
    throw new TypeError(`Identity transfer of ${id} must keep raw bytes`);
  if (wire.encoding === 'BASE64_INLINE' && wire.encodedBytes !== Math.ceil(wire.rawBytes / 3) * 4)
    throw new TypeError(`Base64 wire size of ${id} does not match its raw bytes`);
  if (wire.gzipBytes !== null && wire.rawBytes > 0 && wire.gzipBytes > wire.rawBytes)
    throw new TypeError(`gzip transport of ${id} cannot exceed its raw bytes`);
  return Object.freeze({
    encoding: wire.encoding,
    rawBytes: wire.rawBytes,
    encodedBytes: wire.encodedBytes,
    gzipBytes: wire.gzipBytes,
  });
}

function validateDecoded(decoded: AssetDecodedCost, id: string): AssetDecodedCost {
  const copy = {} as Record<DecodedField, number>;
  for (const field of DECODED_FIELDS) {
    const value = decoded[field];
    if (!isCount(value)) throw new TypeError(`Invalid decoded ${field} for ${id}`);
    copy[field] = value;
  }
  return Object.freeze(copy);
}

function validateRecord(record: AssetSourceRecord): AssetSourceRecord {
  if (!isText(record.id)) throw new TypeError('Asset record requires an id');
  if (!ASSET_MANIFEST_KINDS.includes(record.kind))
    throw new TypeError(`Invalid kind for ${record.id}`);
  if (!ASSET_ROLES.includes(record.role)) throw new TypeError(`Invalid role for ${record.id}`);
  if (!versioned(record.version)) throw new TypeError(`Invalid version for ${record.id}`);
  if (!isText(record.source)) throw new TypeError(`Missing source for ${record.id}`);
  if (!isText(record.license)) throw new TypeError(`Missing license for ${record.id}`);
  if (!isCount(record.count) || record.count < 1)
    throw new TypeError(`Invalid count for ${record.id}`);
  if (typeof record.firstRide !== 'boolean') throw new TypeError(`Invalid firstRide ${record.id}`);
  if (typeof record.placeholder !== 'boolean')
    throw new TypeError(`Invalid placeholder flag ${record.id}`);
  if (!isCount(record.shaderVariants)) throw new TypeError(`Invalid shader variants ${record.id}`);
  if (!ASSET_RESIDENCY_BASES.includes(record.residencyBasis))
    throw new TypeError(`Invalid residency basis ${record.id}`);
  if (!Array.isArray(record.consumers) || record.consumers.some((entry) => !isText(entry)))
    throw new TypeError(`Invalid consumers ${record.id}`);
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    role: record.role,
    version: record.version,
    source: record.source,
    license: record.license,
    count: record.count,
    firstRide: record.firstRide,
    placeholder: record.placeholder,
    shaderVariants: record.shaderVariants,
    residencyBasis: record.residencyBasis,
    consumers: Object.freeze([...record.consumers].sort()),
    wire: validateWire(record.wire, record.id),
    decoded: validateDecoded(record.decoded, record.id),
  });
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createAssetManifest(
  records: readonly AssetSourceRecord[],
  options: AssetManifestOptions = {},
): AssetManifest {
  const formatVersion = options.formatVersion ?? ASSET_MANIFEST_FORMAT_VERSION;
  const manifestVersion = options.manifestVersion ?? ASSET_MANIFEST_VERSION;
  if (!Number.isSafeInteger(formatVersion) || formatVersion < 1)
    throw new RangeError('Invalid asset manifest format version');
  if (!versioned(manifestVersion)) throw new TypeError('Invalid asset manifest version');
  if (!Array.isArray(records) || records.length === 0)
    throw new RangeError('Asset manifest requires at least one record');
  const seen = new Set<string>();
  const entries = records
    .map(validateRecord)
    .sort((left, right) => compareIds(left.id, right.id))
    .map((record): AssetManifestEntry => {
      if (seen.has(record.id)) throw new RangeError(`Duplicate asset ID: ${record.id}`);
      seen.add(record.id);
      const inputsHash = sha256Hex(
        canonicalJson({
          kind: record.kind,
          version: record.version,
          count: record.count,
          placeholder: record.placeholder,
          shaderVariants: record.shaderVariants,
          wire: record.wire,
          decoded: record.decoded,
        }),
      );
      return Object.freeze({
        ...record,
        inputsHash,
        recordHash: sha256Hex(canonicalJson(record)),
        cacheKey: sha256Hex(`${manifestVersion}|${formatVersion}|${record.id}|${inputsHash}`),
      });
    });
  const hash = contentHash({ formatVersion, manifestVersion, entries });
  return Object.freeze({
    formatVersion,
    manifestVersion,
    hash,
    etag: `"${hash.slice(0, 32)}"`,
    entries: Object.freeze(entries),
  });
}

export const ASSET_AUDIT_REASONS = [
  'OK',
  'EMPTY_MANIFEST',
  'DUPLICATE_ASSET_ID',
  'MISSING_PROVENANCE',
  'MISSING_CRITICAL_ASSETS',
  'INVALID_VERSION',
] as const;
export type AssetAuditReason = (typeof ASSET_AUDIT_REASONS)[number];

export interface AssetManifestExpectation {
  /** Critical ids the release requires, taken from the real inventories of the current build. */
  readonly criticalIds: readonly string[];
  /** Sources that could not be read at all; they are never replaced by a fabricated entry. */
  readonly missingSourceIds?: readonly string[];
  readonly requireProvenance?: boolean;
}

export interface AssetManifestAudit {
  readonly complete: boolean;
  readonly releaseBlocked: boolean;
  /** Closed reason code; a caller can switch on it without parsing prose. */
  readonly reason: AssetAuditReason;
  readonly expectedEntries: number;
  readonly presentEntries: number;
  readonly missingCriticalIds: readonly string[];
  readonly missingProvenanceIds: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly invalidVersionIds: readonly string[];
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compareIds));
}

export function auditAssetManifest(
  manifest: AssetManifest,
  expectation: AssetManifestExpectation,
): AssetManifestAudit {
  const entries = manifest.entries;
  const present = new Set(entries.map((entry) => entry.id));
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  const duplicateIds = uniqueSorted([...counts].filter(([, count]) => count > 1).map(([id]) => id));
  const missingCriticalIds = uniqueSorted([
    ...expectation.criticalIds.filter((id) => !present.has(id)),
    ...(expectation.missingSourceIds ?? []),
  ]);
  const missingProvenanceIds = uniqueSorted(
    entries
      .filter((entry) => !isText(entry.source) || !isText(entry.license))
      .map((entry) => entry.id),
  );
  const invalidVersionIds = uniqueSorted(
    entries.filter((entry) => !versioned(entry.version)).map((entry) => entry.id),
  );
  let reason: AssetAuditReason = 'OK';
  if (entries.length === 0) reason = 'EMPTY_MANIFEST';
  else if (duplicateIds.length > 0) reason = 'DUPLICATE_ASSET_ID';
  else if ((expectation.requireProvenance ?? true) && missingProvenanceIds.length > 0)
    reason = 'MISSING_PROVENANCE';
  else if (missingCriticalIds.length > 0) reason = 'MISSING_CRITICAL_ASSETS';
  else if (invalidVersionIds.length > 0) reason = 'INVALID_VERSION';
  const complete = reason === 'OK';
  return Object.freeze({
    complete,
    releaseBlocked: !complete,
    reason,
    expectedEntries: expectation.criticalIds.length + (expectation.missingSourceIds?.length ?? 0),
    presentEntries: entries.length,
    missingCriticalIds,
    missingProvenanceIds,
    duplicateIds,
    invalidVersionIds,
  });
}

export function assertAssetManifestReleasable(
  manifest: AssetManifest,
  expectation: AssetManifestExpectation,
): AssetManifestAudit {
  const audit = auditAssetManifest(manifest, expectation);
  if (audit.releaseBlocked)
    throw new Error(
      `Asset manifest blocked (${audit.reason}); missing critical: ${
        audit.missingCriticalIds.join(', ') || 'none'
      }; missing provenance: ${audit.missingProvenanceIds.join(', ') || 'none'}`,
    );
  return audit;
}

export const ASSET_CACHE_DECISIONS = ['REUSED', 'CONTENT_CHANGED', 'ADDED', 'EVICTED'] as const;
export type AssetCacheDecisionKind = (typeof ASSET_CACHE_DECISIONS)[number];

export interface AssetCacheDecision {
  readonly id: string;
  readonly decision: AssetCacheDecisionKind;
  readonly previousCacheKey: string | null;
  readonly nextCacheKey: string | null;
}

export interface AssetCacheDiff {
  readonly decisions: readonly AssetCacheDecision[];
  readonly invalidatedIds: readonly string[];
  readonly reusedIds: readonly string[];
  readonly evictedIds: readonly string[];
}

/**
 * Selective cache invalidation: only entries whose byte-relevant inputs changed (or new entries)
 * are invalidated; untouched entries keep their cache key. Provenance-only edits are reused.
 */
export function diffAssetCache(previous: AssetManifest, next: AssetManifest): AssetCacheDiff {
  const before = new Map(previous.entries.map((entry) => [entry.id, entry]));
  const after = new Map(next.entries.map((entry) => [entry.id, entry]));
  const decisions: AssetCacheDecision[] = [];
  for (const entry of next.entries) {
    const old = before.get(entry.id);
    const decision: AssetCacheDecisionKind = !old
      ? 'ADDED'
      : old.cacheKey === entry.cacheKey
        ? 'REUSED'
        : 'CONTENT_CHANGED';
    decisions.push(
      Object.freeze({
        id: entry.id,
        decision,
        previousCacheKey: old?.cacheKey ?? null,
        nextCacheKey: entry.cacheKey,
      }),
    );
  }
  for (const entry of previous.entries)
    if (!after.has(entry.id))
      decisions.push(
        Object.freeze({
          id: entry.id,
          decision: 'EVICTED' as const,
          previousCacheKey: entry.cacheKey,
          nextCacheKey: null,
        }),
      );
  decisions.sort((left, right) => compareIds(left.id, right.id));
  const ids = (kind: AssetCacheDecisionKind) =>
    Object.freeze(decisions.filter((entry) => entry.decision === kind).map((entry) => entry.id));
  return Object.freeze({
    decisions: Object.freeze(decisions),
    invalidatedIds: Object.freeze(
      decisions
        .filter((entry) => entry.decision !== 'REUSED')
        .map((entry) => entry.id)
        .sort(compareIds),
    ),
    reusedIds: ids('REUSED'),
    evictedIds: ids('EVICTED'),
  });
}

export interface AssetWireAccounting {
  readonly rawBytes: number;
  readonly encodedBytes: number;
  /** Sum of the optional real gzip sizes; a transport comparison, not a resident value. */
  readonly gzipBytes: number;
  readonly byEncoding: Readonly<
    Record<AssetWireEncoding, { assets: number; rawBytes: number; encodedBytes: number }>
  >;
}

export interface AssetDecodedAccounting {
  readonly geometryBytes: number;
  readonly textureBytes: number;
  readonly wasmResidentBytes: number;
  readonly decoderWasmBytes: number;
  readonly decoderWorkspaceBytes: number;
  readonly audioBytes: number;
  readonly textBytes: number;
  readonly totalBytes: number;
}

export interface AssetManifestAccounting {
  readonly wire: AssetWireAccounting;
  readonly decoded: AssetDecodedAccounting;
}

/** Separate accounting: the decoded total is a resident estimate and never a transfer size. */
export function accountAssetManifest(manifest: AssetManifest): AssetManifestAccounting {
  const byEncoding = {
    NONE: { assets: 0, rawBytes: 0, encodedBytes: 0 },
    IDENTITY: { assets: 0, rawBytes: 0, encodedBytes: 0 },
    BASE64_INLINE: { assets: 0, rawBytes: 0, encodedBytes: 0 },
  } as Record<AssetWireEncoding, { assets: number; rawBytes: number; encodedBytes: number }>;
  let rawBytes = 0;
  let encodedBytes = 0;
  let gzipBytes = 0;
  const decoded: Record<DecodedField, number> = {
    geometryBytes: 0,
    textureBytes: 0,
    wasmResidentBytes: 0,
    decoderWasmBytes: 0,
    decoderWorkspaceBytes: 0,
    audioBytes: 0,
    textBytes: 0,
  };
  for (const entry of manifest.entries) {
    rawBytes += entry.wire.rawBytes;
    encodedBytes += entry.wire.encodedBytes;
    gzipBytes += entry.wire.gzipBytes ?? 0;
    const bucket = byEncoding[entry.wire.encoding];
    bucket.assets += 1;
    bucket.rawBytes += entry.wire.rawBytes;
    bucket.encodedBytes += entry.wire.encodedBytes;
    for (const field of DECODED_FIELDS) decoded[field] += entry.decoded[field];
  }
  const totalBytes = DECODED_FIELDS.reduce((sum, field) => sum + decoded[field], 0);
  return Object.freeze({
    wire: Object.freeze({
      rawBytes,
      encodedBytes,
      gzipBytes,
      byEncoding: Object.freeze(byEncoding),
    }),
    decoded: Object.freeze({ ...decoded, totalBytes }),
  });
}

/** Projection onto the existing PBI 223 budget contract (transfer only counts first-ride assets). */
export function assetBudgetManifest(
  manifest: AssetManifest,
  options: { readonly criticalCodeTransferBytes?: number } = {},
): AssetBudgetManifest {
  const wasmWireBytes = manifest.entries
    .filter((entry) => entry.kind === 'WASM_MODULE')
    .reduce((sum, entry) => sum + entry.wire.encodedBytes, 0);
  const criticalCodeTransferBytes = options.criticalCodeTransferBytes ?? wasmWireBytes;
  if (!Number.isSafeInteger(criticalCodeTransferBytes) || criticalCodeTransferBytes < 0)
    throw new RangeError('Invalid critical code transfer');
  return Object.freeze({
    version: `${manifest.manifestVersion}+${manifest.hash.slice(0, 12)}`,
    criticalCodeTransferBytes,
    decoderWasmBytes: manifest.entries.reduce(
      (sum, entry) => sum + entry.decoded.decoderWasmBytes,
      0,
    ),
    decoderWorkspaceBytes: manifest.entries.reduce(
      (sum, entry) => sum + entry.decoded.decoderWorkspaceBytes,
      0,
    ),
    assets: Object.freeze(
      manifest.entries.map((entry) =>
        Object.freeze({
          id: entry.id,
          firstRide: entry.firstRide,
          transferBytes: entry.wire.encodedBytes,
          geometryGpuBytes: entry.decoded.geometryBytes,
          textureGpuBytes: entry.decoded.textureBytes,
          shaderVariants: entry.shaderVariants,
        }),
      ),
    ),
  });
}

export function assetManifestBudget(manifest: AssetManifest, preset: QualityPreset) {
  return checkAssetManifest(assetBudgetManifest(manifest), preset);
}

export interface ResidentBudgetLimits {
  readonly geometryBytes: number;
  readonly textureBytes: number;
  readonly wasmResidentBytes: number;
  readonly decoderWasmBytes: number;
  readonly decoderWorkspaceBytes: number;
  readonly audioBytes: number;
  readonly textBytes: number;
}

export interface ResidentBudgetDiagnostic {
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
  readonly assetIds: readonly string[];
}

/**
 * Resident-budget admission. Limits come from the fixed contracts (223 GPU caps, 021 WASM
 * admission, 148 audio buffer cap); the manifest only reports the estimates it declares.
 */
export function checkResidentBudgets(
  manifest: AssetManifest,
  limits: ResidentBudgetLimits,
): readonly ResidentBudgetDiagnostic[] {
  const accounting = accountAssetManifest(manifest);
  const diagnostics: ResidentBudgetDiagnostic[] = [];
  for (const field of DECODED_FIELDS) {
    const limit = limits[field];
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new RangeError(`Invalid resident budget limit ${field}`);
    const actual = accounting.decoded[field];
    if (actual > limit)
      diagnostics.push(
        Object.freeze({
          metric: `decoded.${field}`,
          actual,
          limit,
          assetIds: Object.freeze(
            manifest.entries
              .filter((entry) => entry.decoded[field] > 0)
              .map((entry) => entry.id)
              .sort(compareIds),
          ),
        }),
      );
  }
  return Object.freeze(diagnostics);
}

export type AssetManifestBudgetDiagnostic = BudgetDiagnostic;
