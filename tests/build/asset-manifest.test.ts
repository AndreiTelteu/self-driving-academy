import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  ASSET_MANIFEST_FORMAT_VERSION,
  ASSET_MANIFEST_VERSION,
  accountAssetManifest,
  assetBudgetManifest,
  assetManifestBudget,
  assertAssetManifestReleasable,
  auditAssetManifest,
  canonicalJson,
  checkResidentBudgets,
  collectAssetManifestSources,
  createAssetManifest,
  diffAssetCache,
  sha256Hex,
  type AssetDecodedCost,
  type AssetSourceRecord,
  type WasmFileSource,
} from '../../src/build';
import { RENDER_ASSET_CAPS } from '../../src/rendering';
import { AUDIO_LIMITS } from '../../src/audio';

const ZERO_DECODED: AssetDecodedCost = {
  geometryBytes: 0,
  textureBytes: 0,
  wasmResidentBytes: 0,
  decoderWasmBytes: 0,
  decoderWorkspaceBytes: 0,
  audioBytes: 0,
  textBytes: 0,
};

function assetRecord(id: string, overrides: Partial<AssetSourceRecord> = {}): AssetSourceRecord {
  return {
    id,
    kind: 'PROCEDURAL_MESH',
    role: 'CRITICAL',
    version: '150-test-v1',
    source: 'PBI 150 test source',
    license: 'Project license — test fixture',
    count: 1,
    firstRide: true,
    placeholder: false,
    shaderVariants: 0,
    residencyBasis: 'CONTRACT_ESTIMATE',
    consumers: ['150'],
    wire: { encoding: 'NONE', rawBytes: 0, encodedBytes: 0, gzipBytes: null },
    decoded: { ...ZERO_DECODED, geometryBytes: 1024 },
    ...overrides,
  };
}

function wasmSource(
  id: string,
  rawBytes: number,
  overrides: Partial<WasmFileSource> = {},
): WasmFileSource {
  return {
    id,
    version: '223-test-v1',
    source: `package ${id}.wasm`,
    license: 'Apache-2.0',
    consumers: ['223'],
    role: 'CRITICAL',
    firstRide: true,
    encoding: 'IDENTITY',
    rawBytes,
    encodedBytes: rawBytes,
    gzipBytes: null,
    residentBytes: rawBytes,
    residencyBasis: 'MODULE_BYTES_LOWER_BOUND',
    decoder: false,
    workspaceBytes: 0,
    available: true,
    ...overrides,
  };
}

function realCollection() {
  return collectAssetManifestSources({
    wasm: [
      wasmSource('runtime:wasm:rapier', 1024, {
        encoding: 'BASE64_INLINE',
        encodedBytes: Math.ceil(1024 / 3) * 4,
        residencyBasis: 'DECLARED_ADMISSION_ESTIMATE',
        residentBytes: 32 * 1024 * 1024,
      }),
      wasmSource('runtime:wasm:glslang', 943_680),
      wasmSource('runtime:wasm:twgsl', 1_702_916),
    ],
    registry: [],
  });
}

test('sha256Hex matches node:crypto on ASCII, Unicode and long inputs', () => {
  for (const input of [
    '',
    'abc',
    'PBI 150 — manifest și pipeline',
    'x'.repeat(1000),
    '🚗'.repeat(97),
  ]) {
    assert.equal(sha256Hex(input), createHash('sha256').update(input, 'utf8').digest('hex'));
  }
});

test('canonicalJson sorts object keys, drops undefined and rejects non-finite numbers', () => {
  assert.equal(
    canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined }),
    '{"a":[true,null,"x"],"b":1}',
  );
  assert.equal(canonicalJson(-0), '0');
  assert.throws(() => canonicalJson(Number.NaN), /non-finite/);
  assert.throws(() => canonicalJson(() => 1), /cannot encode/);
});

test('manifest identity is deterministic and independent of source order', () => {
  const records = [assetRecord('a'), assetRecord('b'), assetRecord('c')];
  const first = createAssetManifest(records);
  const second = createAssetManifest([...records].reverse());
  assert.equal(first.hash, second.hash);
  assert.deepEqual(first.entries, second.entries);
  assert.equal(first.formatVersion, ASSET_MANIFEST_FORMAT_VERSION);
  assert.equal(first.manifestVersion, ASSET_MANIFEST_VERSION);
  assert.equal(first.etag, `"${first.hash.slice(0, 32)}"`);
  assert.deepEqual(
    first.entries.map((entry) => entry.id),
    ['a', 'b', 'c'],
  );
  for (const entry of first.entries) {
    assert.match(entry.inputsHash, /^[0-9a-f]{64}$/);
    assert.match(entry.recordHash, /^[0-9a-f]{64}$/);
    assert.match(entry.cacheKey, /^[0-9a-f]{64}$/);
  }
});

test('selective invalidation touches only the changed payload, not provenance', () => {
  const records = [assetRecord('a'), assetRecord('b'), assetRecord('c')];
  const previous = createAssetManifest(records);
  const changed = records.map((record) =>
    record.id === 'b' ? { ...record, decoded: { ...record.decoded, geometryBytes: 2048 } } : record,
  );
  const diff = diffAssetCache(previous, createAssetManifest(changed));
  assert.deepEqual(diff.invalidatedIds, ['b']);
  assert.deepEqual(diff.reusedIds, ['a', 'c']);
  assert.deepEqual(diff.evictedIds, []);
  assert.equal(diff.decisions.find((entry) => entry.id === 'b')?.decision, 'CONTENT_CHANGED');

  const relicensed = records.map((record) =>
    record.id === 'b' ? { ...record, license: 'Project license — updated wording' } : record,
  );
  const next = createAssetManifest(relicensed);
  const provenanceDiff = diffAssetCache(previous, next);
  assert.deepEqual(provenanceDiff.invalidatedIds, []);
  assert.notEqual(next.hash, previous.hash);
  assert.equal(
    next.entries.find((entry) => entry.id === 'b')?.cacheKey,
    previous.entries.find((entry) => entry.id === 'b')?.cacheKey,
  );

  const removed = diffAssetCache(previous, createAssetManifest(records.slice(0, 2)));
  assert.deepEqual(removed.evictedIds, ['c']);
});

test('raising the format version invalidates every cache key explicitly', () => {
  const records = [assetRecord('a'), assetRecord('b')];
  const previous = createAssetManifest(records);
  const bumped = createAssetManifest(records, {
    formatVersion: ASSET_MANIFEST_FORMAT_VERSION + 1,
  });
  const diff = diffAssetCache(previous, bumped);
  assert.equal(diff.invalidatedIds.length, records.length);
  assert.deepEqual(diff.reusedIds, []);
  assert.ok(
    bumped.entries.every(
      (entry) => entry.cacheKey !== previous.entries.find((old) => old.id === entry.id)?.cacheKey,
    ),
  );
});

test('release blocks with a closed reason and the exact missing critical ids', () => {
  const records = [assetRecord('critical:a'), assetRecord('critical:b', { firstRide: false })];
  const manifest = createAssetManifest(records);
  const removed = createAssetManifest(records.slice(0, 1));
  const audit = auditAssetManifest(removed, { criticalIds: ['critical:a', 'critical:b'] });
  assert.equal(audit.complete, false);
  assert.equal(audit.releaseBlocked, true);
  assert.equal(audit.reason, 'MISSING_CRITICAL_ASSETS');
  assert.deepEqual(audit.missingCriticalIds, ['critical:b']);
  assert.throws(
    () => assertAssetManifestReleasable(removed, { criticalIds: ['critical:a', 'critical:b'] }),
    /MISSING_CRITICAL_ASSETS/,
  );

  const missingSource = auditAssetManifest(manifest, {
    criticalIds: ['critical:a', 'critical:b', 'runtime:wasm:rapier'],
    missingSourceIds: ['runtime:wasm:rapier'],
  });
  assert.equal(missingSource.reason, 'MISSING_CRITICAL_ASSETS');
  assert.deepEqual(missingSource.missingCriticalIds, ['runtime:wasm:rapier']);
});

test('release blocks a manifest entry without provenance', () => {
  const manifest = createAssetManifest([assetRecord('a'), assetRecord('b')]);
  const corrupted = {
    ...manifest,
    entries: manifest.entries.map((entry) =>
      entry.id === 'b' ? { ...entry, license: ' ' } : entry,
    ),
  };
  const audit = auditAssetManifest(corrupted, { criticalIds: ['a', 'b'] });
  assert.equal(audit.reason, 'MISSING_PROVENANCE');
  assert.equal(audit.releaseBlocked, true);
  assert.deepEqual(audit.missingProvenanceIds, ['b']);
});

test('wire bytes never become decoded/resident estimates', () => {
  const raw = 3000;
  const encoded = Math.ceil(raw / 3) * 4;
  const manifest = createAssetManifest([
    assetRecord('runtime:wasm:inline', {
      kind: 'WASM_MODULE',
      wire: { encoding: 'BASE64_INLINE', rawBytes: raw, encodedBytes: encoded, gzipBytes: 900 },
      decoded: { ...ZERO_DECODED, wasmResidentBytes: 33_554_432 },
      residencyBasis: 'DECLARED_ADMISSION_ESTIMATE',
    }),
    assetRecord('wired', {
      wire: { encoding: 'IDENTITY', rawBytes: 500, encodedBytes: 500, gzipBytes: null },
      decoded: { ...ZERO_DECODED, textureBytes: 4096 },
    }),
  ]);
  const accounting = accountAssetManifest(manifest);
  assert.equal(accounting.wire.rawBytes, raw + 500);
  assert.equal(accounting.wire.encodedBytes, encoded + 500);
  assert.equal(accounting.wire.gzipBytes, 900);
  assert.equal(accounting.wire.byEncoding.BASE64_INLINE.assets, 1);
  assert.equal(accounting.decoded.wasmResidentBytes, 33_554_432);
  assert.equal(accounting.decoded.textureBytes, 4096);
  assert.equal(accounting.decoded.totalBytes, 33_554_432 + 4096);
  assert.notEqual(accounting.decoded.totalBytes, accounting.wire.encodedBytes);

  assert.throws(
    () =>
      createAssetManifest([
        assetRecord('runtime', {
          wire: { encoding: 'NONE', rawBytes: 10, encodedBytes: 0, gzipBytes: null },
        }),
      ]),
    /cannot declare transfer bytes/,
  );
  assert.throws(
    () =>
      createAssetManifest([
        assetRecord('bad-base64', {
          wire: { encoding: 'BASE64_INLINE', rawBytes: 100, encodedBytes: 100, gzipBytes: null },
        }),
      ]),
    /Base64 wire size/,
  );
});

test('validation rejects duplicate ids, invalid versions and empty input', () => {
  assert.throws(
    () => createAssetManifest([assetRecord('a'), assetRecord('a')]),
    /Duplicate asset ID/,
  );
  assert.throws(
    () => createAssetManifest([assetRecord('a')], { manifestVersion: 'bad version' }),
    /Invalid asset manifest version/,
  );
  assert.throws(() => createAssetManifest([]), /at least one record/);
  assert.throws(() => createAssetManifest([assetRecord('a', { version: ' ' })]), /Invalid version/);
});

test('real inventories produce the versioned manifest with no fabricated assets', () => {
  const collection = realCollection();
  const manifest = createAssetManifest(collection.records);
  assert.equal(manifest.entries.length, 27);
  assert.equal(manifest.entries.filter((entry) => entry.role === 'CRITICAL').length, 17);
  assert.equal(manifest.entries.filter((entry) => entry.role === 'OPTIONAL').length, 10);
  assert.equal(manifest.entries.filter((entry) => entry.placeholder).length, 7);
  assert.equal(manifest.entries.filter((entry) => entry.kind === 'GLB').length, 0);
  assert.equal(manifest.entries.filter((entry) => entry.kind === 'WASM_MODULE').length, 3);
  assert.equal(manifest.entries.filter((entry) => entry.id.startsWith('city-decor:')).length, 9);
  assert.equal(manifest.entries.filter((entry) => entry.id.startsWith('vehicle:')).length, 7);
  assert.equal(collection.registry.definitions, 0);
  assert.equal(collection.registry.decoderWasmBytes, 0);
  assert.equal(collection.registry.decoderWorkspaceBytes, 0);
  assert.deepEqual(collection.missing, []);
  assert.equal(collection.criticalIds.length, 17);
  const audit = auditAssetManifest(manifest, { criticalIds: collection.criticalIds });
  assert.equal(audit.reason, 'OK');
  assert.equal(audit.releaseBlocked, false);
});

test('a missing real source is reported and never replaced by a fabricated entry', () => {
  const collection = collectAssetManifestSources({
    wasm: [
      wasmSource('runtime:wasm:rapier', 0, {
        encoding: 'BASE64_INLINE',
        encodedBytes: 0,
        available: false,
      }),
      wasmSource('runtime:wasm:glslang', 943_680),
    ],
    registry: [],
  });
  const manifest = createAssetManifest(collection.records);
  assert.equal(collection.missing.length, 1);
  assert.equal(collection.missing[0]?.reason, 'WASM_FILE_MISSING');
  assert.equal(
    manifest.entries.some((entry) => entry.id === 'runtime:wasm:rapier'),
    false,
  );
  const audit = auditAssetManifest(manifest, {
    criticalIds: collection.criticalIds,
    missingSourceIds: collection.missing.map((entry) => entry.id),
  });
  assert.equal(audit.releaseBlocked, true);
  assert.equal(audit.reason, 'MISSING_CRITICAL_ASSETS');
  assert.deepEqual(audit.missingCriticalIds, ['runtime:wasm:rapier']);
});

test('manifest projects onto the 223 budgets for LOW, MEDIUM and HIGH', () => {
  const manifest = createAssetManifest(realCollection().records);
  const projection = assetBudgetManifest(manifest);
  assert.equal(projection.criticalCodeTransferBytes, Math.ceil(1024 / 3) * 4 + 943_680 + 1_702_916);
  assert.equal(projection.decoderWasmBytes, 0);
  assert.equal(projection.decoderWorkspaceBytes, 0);
  const transfer = projection.assets
    .filter((asset) => asset.firstRide)
    .reduce((sum, asset) => sum + asset.transferBytes, 0);
  assert.ok(transfer <= RENDER_ASSET_CAPS.firstRideTransferBytes);
  for (const preset of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    const result = assetManifestBudget(manifest, preset);
    assert.deepEqual(result.diagnostics, [], preset);
    assert.equal(result.accepted, true);
  }
});

test('resident budgets cover geometry, WASM, decoders, audio and text with the owning limits', () => {
  const manifest = createAssetManifest(realCollection().records);
  const physicsWasmBytes = 32 * 1024 * 1024;
  const limits = {
    geometryBytes: RENDER_ASSET_CAPS.geometryGpuBytes,
    textureBytes: RENDER_ASSET_CAPS.textureGpuBytes.HIGH,
    wasmResidentBytes: physicsWasmBytes + 943_680 + 1_702_916,
    decoderWasmBytes: RENDER_ASSET_CAPS.decoderWasmBytes,
    decoderWorkspaceBytes: RENDER_ASSET_CAPS.decoderWorkspaceBytes,
    audioBytes: AUDIO_LIMITS.maxBufferBytes,
    textBytes: 4096,
  };
  assert.deepEqual(checkResidentBudgets(manifest, limits), []);
  const audio = accountAssetManifest(manifest).decoded.audioBytes;
  assert.ok(audio > 0);
  assert.ok(audio <= AUDIO_LIMITS.maxBufferBytes);

  const diagnostics = checkResidentBudgets(manifest, { ...limits, audioBytes: audio - 1 });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.metric, 'decoded.audioBytes');
  assert.equal(diagnostics[0]?.limit, audio - 1);
  assert.ok((diagnostics[0]?.assetIds.length ?? 0) > 0);
  assert.ok(diagnostics[0]?.assetIds.every((id) => id.startsWith('audio:cue:')));
});

test('a first-ride transfer over 20 MiB is rejected by the existing budget contract', () => {
  const manifest = createAssetManifest([
    assetRecord('oversized', {
      wire: {
        encoding: 'IDENTITY',
        rawBytes: 21 * 1024 * 1024,
        encodedBytes: 21 * 1024 * 1024,
        gzipBytes: null,
      },
    }),
  ]);
  const result = assetManifestBudget(manifest, 'MEDIUM');
  assert.equal(result.accepted, false);
  assert.deepEqual(
    result.diagnostics.map((entry) => entry.metric),
    ['firstRideTransferBytes'],
  );
});
