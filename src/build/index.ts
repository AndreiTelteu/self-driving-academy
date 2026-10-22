/**
 * Public entry point of the build module.
 *
 * The build contract is browser-safe: it describes asset identity, transfer bytes, resident
 * estimates and cache invalidation without reading the filesystem or the clock. The Node report
 * pipeline (`scripts/run-asset-manifest-report.mjs`) feeds the measured file sizes in.
 */
export { canonicalJson, contentHash, sha256Hex } from './content-hash';
export {
  ASSET_MANIFEST_FORMAT_VERSION,
  ASSET_MANIFEST_VERSION,
  ASSET_MANIFEST_KINDS,
  ASSET_ROLES,
  ASSET_WIRE_ENCODINGS,
  ASSET_RESIDENCY_BASES,
  ASSET_AUDIT_REASONS,
  ASSET_CACHE_DECISIONS,
  createAssetManifest,
  auditAssetManifest,
  assertAssetManifestReleasable,
  diffAssetCache,
  accountAssetManifest,
  assetBudgetManifest,
  assetManifestBudget,
  checkResidentBudgets,
} from './asset-manifest';
export { ASSET_SOURCE_MISS_REASONS, collectAssetManifestSources } from './asset-manifest-sources';
export type {
  AssetManifest,
  AssetManifestEntry,
  AssetManifestKind,
  AssetManifestOptions,
  AssetSourceRecord,
  AssetRole,
  AssetWireCost,
  AssetWireEncoding,
  AssetDecodedCost,
  AssetResidencyBasis,
  AssetAuditReason,
  AssetManifestAudit,
  AssetManifestExpectation,
  AssetCacheDecision,
  AssetCacheDecisionKind,
  AssetCacheDiff,
  AssetManifestAccounting,
  AssetWireAccounting,
  AssetDecodedAccounting,
  AssetManifestBudgetDiagnostic,
  ResidentBudgetLimits,
  ResidentBudgetDiagnostic,
} from './asset-manifest';
export type {
  AssetManifestCollection,
  AssetManifestRegistrySummary,
  AssetManifestSourceOptions,
  AssetSourceMissReason,
  MissingAssetSource,
  RegistryAssetSource,
  WasmFileSource,
} from './asset-manifest-sources';
