import { choice, fields, list, nullable, number, record, requireContract, text } from '../sessions';

export const parameterUnits = [
  'm',
  's',
  'm/s',
  'm/s²',
  'm/s³',
  'rad',
  'rad/s',
  '1/s',
  'ratio',
  'weight',
  'probability',
] as const;
export const parameterSources = ['LEARNED', 'MANUAL_TUNING', 'BASE', 'IMPORTED'] as const;

export interface ParameterEvidence {
  readonly key: string;
  readonly effectiveCount: number;
  readonly contexts: readonly string[];
  readonly quality: number;
  readonly uncertainty: number;
  readonly sourceSegmentIds: readonly string[];
  readonly estimatorVersion: string;
}

export function parseParameterEvidence(value: unknown): ParameterEvidence {
  const data = fields(value, [
    'key',
    'effectiveCount',
    'contexts',
    'quality',
    'uncertainty',
    'sourceSegmentIds',
    'estimatorVersion',
  ]);
  const sourceSegmentIds = list(data.sourceSegmentIds, text);
  requireContract(
    new Set(sourceSegmentIds).size === sourceSegmentIds.length,
    'Duplicate evidence segment IDs',
  );
  const effectiveCount = number(data.effectiveCount, 0);
  requireContract(
    effectiveCount === 0 || sourceSegmentIds.length > 0,
    'Observed evidence requires source segments',
  );
  return Object.freeze({
    key: text(data.key),
    effectiveCount,
    contexts: list(data.contexts, text),
    quality: number(data.quality, 0, 1),
    uncertainty: number(data.uncertainty, 0),
    sourceSegmentIds,
    estimatorVersion: text(data.estimatorVersion),
  });
}

export interface DrivingProfile {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly profileId: string;
  readonly versionId: string;
  readonly parentVersionId: string | null;
  readonly engineVersion: string;
  readonly parameters: Readonly<Record<string, number>>;
  readonly unitsByParameter: Readonly<Record<string, (typeof parameterUnits)[number]>>;
  readonly provenanceByParameter: Readonly<Record<string, (typeof parameterSources)[number]>>;
  readonly evidenceByParameter: Readonly<Record<string, ParameterEvidence | null>>;
  readonly sourceSegmentIds: readonly string[];
  readonly createdAt: string;
  readonly checksum: string;
}

/** Structural validation; parameter support/ranges belong to the future controller registry. */
export function parseDrivingProfile(value: unknown): DrivingProfile {
  const data = fields(value, [
    'schemaVersion',
    'units',
    'profileId',
    'versionId',
    'parentVersionId',
    'engineVersion',
    'parameters',
    'unitsByParameter',
    'provenanceByParameter',
    'evidenceByParameter',
    'sourceSegmentIds',
    'createdAt',
    'checksum',
  ]);
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported profile schema or units',
  );
  const versionId = text(data.versionId);
  const parentVersionId = nullable(data.parentVersionId, text);
  requireContract(versionId !== parentVersionId, 'Profile cannot be its own parent');
  const rawParameters = record(data.parameters);
  const keys = Object.keys(rawParameters);
  const rawUnits = fields(data.unitsByParameter, keys);
  const rawSources = fields(data.provenanceByParameter, keys);
  const rawEvidence = fields(data.evidenceByParameter, keys);
  const parameters: Record<string, number> = Object.create(null);
  const unitsByParameter: Record<string, (typeof parameterUnits)[number]> = Object.create(null);
  const provenanceByParameter: Record<string, (typeof parameterSources)[number]> =
    Object.create(null);
  const evidenceByParameter: Record<string, ParameterEvidence | null> = Object.create(null);
  const sourceSegmentIds = list(data.sourceSegmentIds, text);
  requireContract(
    new Set(sourceSegmentIds).size === sourceSegmentIds.length,
    'Duplicate profile source segments',
  );
  for (const key of keys) {
    requireContract(
      /^[a-z][a-z0-9_]*$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key),
      'Invalid/reserved parameter key',
    );
    const unit = choice(rawUnits[key], parameterUnits);
    parameters[key] = number(
      rawParameters[key],
      unit === 'probability' ? 0 : -Infinity,
      unit === 'probability' ? 1 : Infinity,
    );
    unitsByParameter[key] = unit;
    const provenance = choice(rawSources[key], parameterSources);
    provenanceByParameter[key] = provenance;
    const evidence = nullable(rawEvidence[key], parseParameterEvidence);
    requireContract(
      evidence === null || evidence.key === key,
      'Evidence key does not match parameter',
    );
    requireContract(
      evidence === null || evidence.sourceSegmentIds.every((id) => sourceSegmentIds.includes(id)),
      'Evidence source missing from profile',
    );
    requireContract(
      provenance !== 'LEARNED' || (evidence !== null && evidence.effectiveCount > 0),
      'Learned values require observations',
    );
    evidenceByParameter[key] = evidence;
  }
  const createdAt = text(data.createdAt);
  requireContract(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(createdAt) &&
      Number.isFinite(Date.parse(createdAt)) &&
      new Date(createdAt).toISOString() ===
        createdAt.replace(
          /(?:\.(\d{1,3}))?Z$/,
          (_, fraction: string | undefined) => `.${(fraction ?? '').padEnd(3, '0')}Z`,
        ),
    'Expected valid UTC calendar timestamp',
  );
  return Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    profileId: text(data.profileId),
    versionId,
    parentVersionId,
    engineVersion: text(data.engineVersion),
    parameters: Object.freeze(parameters),
    unitsByParameter: Object.freeze(unitsByParameter),
    provenanceByParameter: Object.freeze(provenanceByParameter),
    evidenceByParameter: Object.freeze(evidenceByParameter),
    sourceSegmentIds,
    createdAt,
    checksum: text(data.checksum),
  });
}
