import { choice, fields, list, number, requireContract, text } from '../sessions';
import { parseDrivingProfile, parameterUnits } from './contracts';
import type { DrivingProfile } from './contracts';
import { parameterCatalogData } from './parameter-catalog.generated';

export type ParameterKey = (typeof parameterCatalogData.parameters)[number]['key'];
export type ParameterUnit = (typeof parameterUnits)[number];
export type ParameterStage = 'initial_learning_target' | 'extension';

export interface ParameterDefinition {
  readonly key: string;
  readonly category: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
  /** Canonical profile unit; sourceUnit preserves per-turn/per-signal semantics. */
  readonly unit: ParameterUnit;
  readonly sourceUnit: string;
  readonly description: string;
  readonly evidenceContext: string;
  readonly implementationStage: ParameterStage;
  readonly implemented: boolean;
  readonly estimable: boolean;
}

const unitAliases: Readonly<Record<string, ParameterUnit>> = Object.freeze({
  raport: 'ratio',
  pondere: 'weight',
  probabilitate: 'probability',
  's/viraj': 's',
  's/semafor': 's',
});

/** Validate the design catalog, without treating a planned stage as runtime support. */
export function parseParameterCatalog(value: unknown): readonly ParameterDefinition[] {
  const data = fields(value, [
    'schemaVersion',
    'status',
    'updatedOn',
    'units',
    'description',
    'parameters',
  ]);
  requireContract(
    data.schemaVersion === 1 && data.status === 'design_proposal' && data.units === 'SI',
    'Unsupported parameter catalog schema',
  );
  const updatedOn = text(data.updatedOn);
  requireContract(
    /^\d{4}-\d{2}-\d{2}$/.test(updatedOn) &&
      Number.isFinite(Date.parse(updatedOn)) &&
      new Date(updatedOn).toISOString().slice(0, 10) === updatedOn,
    'Invalid catalog date',
  );
  text(data.description);
  const keys = new Set<string>();
  const definitions = list(data.parameters, (value) => {
    const entry = fields(value, [
      'key',
      'category',
      'default',
      'min',
      'max',
      'unit',
      'description',
      'implementationStage',
      'implemented',
      'evidenceContext',
    ]);
    const key = text(entry.key);
    requireContract(
      /^[a-z][a-z0-9_]*$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key),
      'Invalid parameter key',
    );
    requireContract(!keys.has(key), `Duplicate parameter: ${key}`);
    requireContract(
      parameterCatalogData.parameters.some((definition) => definition.key === key),
      `Unknown catalog parameter: ${key}`,
    );
    keys.add(key);
    const sourceUnit = text(entry.unit);
    const unit = choice(
      Object.hasOwn(unitAliases, sourceUnit) ? unitAliases[sourceUnit] : sourceUnit,
      parameterUnits,
    );
    const min = number(entry.min);
    const max = number(entry.max, min);
    requireContract(
      unit !== 'probability' || (min >= 0 && max <= 1),
      'Probability catalog range must be within [0,1]',
    );
    // Fail closed until policy/estimator PBIs add verified runtime capabilities.
    requireContract(entry.implemented === false, 'No policies implemented in this registry');
    return Object.freeze({
      key,
      category: text(entry.category),
      default: number(entry.default, min, max),
      min,
      max,
      unit,
      sourceUnit,
      description: text(entry.description),
      evidenceContext: text(entry.evidenceContext),
      implementationStage: choice(entry.implementationStage, [
        'initial_learning_target',
        'extension',
      ]),
      implemented: false,
      estimable: false,
    });
  });
  requireContract(definitions.length === 80, 'Expected 80 parameter definitions');
  requireContract(
    definitions.filter((entry) => entry.implementationStage === 'initial_learning_target')
      .length === 24,
    'Expected 24 initial learning targets',
  );
  return definitions;
}

/** Verified policy046/047/048/050/051/053 capabilities. Design metadata never grants runtime support. */
const policyKeys = new Set<string>([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
]);
const definitions = Object.freeze(
  parseParameterCatalog(parameterCatalogData).map((definition) =>
    Object.freeze({ ...definition, implemented: policyKeys.has(definition.key) }),
  ),
);
const byKey: Record<string, ParameterDefinition> = Object.create(null);
for (const definition of definitions) byKey[definition.key] = definition;
Object.freeze(byKey);

export const parameterRegistry: Readonly<Record<ParameterKey, ParameterDefinition>> = Object.freeze(
  byKey,
) as Readonly<Record<ParameterKey, ParameterDefinition>>;
export const parameterDefinitions = definitions;

export function getParameterDefinition(key: string): ParameterDefinition {
  requireContract(Object.hasOwn(byKey, key), `Unknown parameter: ${key}`);
  return byKey[key];
}

/**
 * R (`extension`) keys are reserved for V1.
 *
 * The rule is the one of the 077 profile panel: a key whose `implementationStage` is `extension` is
 * reserved, so it is never learned, never manually tuned and never published as a usable value.
 * The panel keeps its own read-only copy of the rule because a presentation module may not call a
 * domain service at runtime; the predicate is the same one.
 */
export function isReservedParameterKey(key: string): boolean {
  const definition = byKey[key];
  return definition !== undefined && definition.implementationStage === 'extension';
}

/** Every R (`extension`) key of the catalog, in catalog order. */
export const reservedParameterKeys: readonly string[] = Object.freeze(
  definitions
    .filter((definition) => definition.implementationStage === 'extension')
    .map((definition) => definition.key),
);

export function validateParameterValue(key: string, value: unknown, unit: unknown): number {
  const definition = getParameterDefinition(key);
  requireContract(unit === definition.unit, `Wrong unit for parameter: ${key}`);
  return number(value, definition.min, definition.max);
}

/** Publication boundary: structural parsing alone never grants learned/manual capability. */
export function parsePublishableDrivingProfile(value: unknown): DrivingProfile {
  const profile = parseDrivingProfile(value);
  for (const [key, value] of Object.entries(profile.parameters)) {
    const definition = getParameterDefinition(key);
    validateParameterValue(key, value, profile.unitsByParameter[key]);
    const source = profile.provenanceByParameter[key];
    if (source === 'LEARNED') {
      requireContract(
        definition.implemented && definition.estimable,
        `Parameter cannot be published as LEARNED: ${key}`,
      );
    } else if (source === 'MANUAL_TUNING') {
      requireContract(definition.implemented, `Parameter cannot be manually tuned: ${key}`);
    }
  }
  return profile;
}
