import { parameterDefinitions } from '../profiles';
import { choice, list, number, randomUint32, requireContract, text, tick } from '../sessions';
import { VEHICLE_CLASSES, controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';
import { boundedId, compareText, frozenSorted, plainFields, requireRequired } from './contracts';
import { campaignMissionDefinitions, missionObjectiveKinds } from './definitions';
import type { MissionDifficulty, MissionObjectiveKind } from './definitions';

/**
 * 211 daily mission generation and stable daily calendar.
 *
 * The module owns no clock, no random source, no DOM, no renderer, no profile store and no XP
 * ledger. The caller supplies the observed instant, the IANA time zone and that zone's UTC offset
 * and day length, so a local calendar date is an explicit function of the moment and the offset and
 * never of `Date.now()`. Every random decision is `randomUint32(seed, key, index)` over a seed
 * derived from `(playerId, dailyDate, generatorVersion)`: the same day regenerates the same bytes,
 * a different day gets new identities and re-sampled parameters.
 *
 * The set is generated once and persisted. A reload parses the stored set back; a later capability
 * unlock, a different driving profile, a refresh or a replay never regenerates it.
 * `advanceDailyCalendar` owns the day boundary, clock rollback/forward and the expiry boundary, and
 * it records capability drift without touching the retained set.
 *
 * `MANUAL` remains a progress path: a capability snapshot without the MANUAL control mode is
 * refused, and every set carries at least one instance playable in MANUAL without learning. A
 * learning instance names the exact supported 092 key it demonstrates.
 */

export const DAILY_SCHEMA_VERSION = '211-mission-daily-v1' as const;
export const DAILY_CALENDAR_VERSION = '211-daily-calendar-v1' as const;
export const DAILY_CAPABILITY_VERSION = '211-daily-capabilities-v1' as const;
export const DAILY_GENERATOR_VERSION = '211-daily-generator-v1' as const;
export const DAILY_TEMPLATE_CATALOG_VERSION = '211-daily-templates-v1' as const;
export const DAILY_NAMESPACE = 'daily:211' as const;

/** Exactly three missions per local day; the number is part of the contract. */
export const DAILY_MISSIONS_PER_DAY = 3 as const;

/** Initial XP proposal of Docs/23 for one daily mission; the amount is calibration, not certified. */
export const DAILY_MISSION_XP = 100 as const;

/** Authoritative simulation rate the declared evaluation windows are expressed in. */
export const DAILY_TICK_HZ = 60 as const;

export const DAILY_LIMITS = Object.freeze({
  version: DAILY_SCHEMA_VERSION,
  missionsPerDay: DAILY_MISSIONS_PER_DAY,
  /** Recent sets retained per player; older sets are dropped with a counter. */
  retainedSets: 32,
  /** Reward identities retained per player; the oldest is dropped with a counter. */
  retainedRewards: 128,
  /** Calendar events retained per player (boundaries, rollbacks and jumps). */
  retainedEvents: 64,
  /** Deterministic generation attempts used to avoid repeating the previous day verbatim. */
  generatorAttempts: 8,
  /** Real 092 keys one snapshot may carry. */
  learningKeys: 64,
  /** Real map zone ids one snapshot may carry. */
  zones: 64,
  /** Real vehicle classes one snapshot may carry. */
  vehicleClasses: 8,
  /** Authored 116 campaign stages a snapshot may declare completed. */
  campaignMissions: 32,
  /** Unlock identities a snapshot may declare earned. */
  unlocks: 64,
  /** Template families one versioned catalog may carry. */
  templateFamilies: 16,
  /** UTC offsets are bounded to the real world range ±14 hours. */
  utcOffsetSeconds: 50_400,
  /** Calendar dates before the identity anchor are refused. */
  minimumYear: 1970,
  /** Code units per player, zone, family, version and identity. */
  idCodeUnits: 256,
  /** Code units per encoded instance identity. */
  instanceIdCodeUnits: 768,
  /** Code units per encoded reward identity. */
  rewardIdCodeUnits: 1_536,
});

export const dailyClockActions = ['NEW_DAY', 'SAME_DAY', 'ROLLBACK', 'FORWARD_JUMP'] as const;
export type DailyClockAction = (typeof dailyClockActions)[number];

export const dailyControlRequirements = ['MANUAL', 'LEARNING', 'ANY'] as const;
export type DailyControlRequirement = (typeof dailyControlRequirements)[number];

export const dailyTemplateCategories = ['SERVICE', 'SKILL', 'EXPERIMENT', 'ODDITY'] as const;
export type DailyTemplateCategory = (typeof dailyTemplateCategories)[number];

/** Defined capability gaps; a gap replaces an objective instead of throwing at runtime. */
export const dailyCapabilityGaps = [
  'LEARNING_KEYS',
  'LEARNING_MODE',
  'CAMPAIGN_PROGRESS',
  'ZONES',
] as const;
export type DailyCapabilityGap = (typeof dailyCapabilityGaps)[number];

export const dailySetPhases = ['PENDING', 'ACTIVE', 'EXPIRED'] as const;
export type DailySetPhase = (typeof dailySetPhases)[number];

const millisecondsPerDay = 86_400_000;
const secondsPerMillisecond = 1_000;

/** Allowed lengths of a local calendar day: 23 h, 24 h and 25 h across a DST transition. */
export const DAILY_DAY_LENGTHS = Object.freeze([82_800, 86_400, 90_000] as const);

// ---------------------------------------------------------------------------------------------
// Local calendar: an explicit moment plus an explicit offset, never the system clock
// ---------------------------------------------------------------------------------------------

function daysFromCivil(year: number, month: number, day: number): number {
  const shifted = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function civilFromDays(days: number): { readonly year: number; month: number; day: number } {
  const shifted = days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  return Object.freeze({ year: year + (month <= 2 ? 1 : 0), month, day });
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** Days since 1970-01-01 for a strict `YYYY-MM-DD` local calendar date. */
export function parseDailyDate(value: unknown): number {
  const date = text(value);
  requireContract(/^\d{4}-\d{2}-\d{2}$/.test(date), 'Invalid daily date; expected YYYY-MM-DD');
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  requireContract(
    year >= DAILY_LIMITS.minimumYear && year <= 9999 && month >= 1 && month <= 12 && day >= 1,
    'Daily date is outside the supported calendar range',
  );
  const days = daysFromCivil(year, month, day);
  const civil = civilFromDays(days);
  requireContract(
    civil.year === year && civil.month === month && civil.day === day,
    'Daily date is not a real calendar date',
  );
  return days;
}

export function formatDailyDate(days: number): string {
  requireContract(Number.isSafeInteger(days), 'Daily day index must be a safe integer');
  const civil = civilFromDays(days);
  return `${pad(civil.year, 4)}-${pad(civil.month, 2)}-${pad(civil.day, 2)}`;
}

function readTimeZone(value: unknown): string {
  const zone = text(value);
  const segments = zone.split('/');
  requireContract(
    zone.length <= 64 &&
      zone.trim() === zone &&
      segments.every((segment) => /^[A-Za-z][A-Za-z0-9_+.-]*$/.test(segment)),
    'Invalid IANA calendar time zone',
  );
  return zone;
}

function readOffsetSeconds(value: unknown): number {
  const offset = number(value, -DAILY_LIMITS.utcOffsetSeconds, DAILY_LIMITS.utcOffsetSeconds);
  requireContract(Number.isSafeInteger(offset), 'UTC offset must be a whole number of seconds');
  return offset;
}

function readDayLengthSeconds(value: unknown): number {
  const length = number(
    value,
    DAILY_DAY_LENGTHS[0],
    DAILY_DAY_LENGTHS[DAILY_DAY_LENGTHS.length - 1],
  );
  requireContract(
    (DAILY_DAY_LENGTHS as readonly number[]).includes(length),
    'Daily day length must be 23, 24 or 25 hours',
  );
  return length;
}

export interface DailyCalendarInput {
  /** IANA zone id of the player's stored profile time zone. */
  readonly timeZone: string;
  /** Explicit observed instant in epoch milliseconds; `Date.now()` never enters this module. */
  readonly observedAtMs: number;
  /** UTC offset in effect for this local date, in seconds (DST included). */
  readonly utcOffsetSeconds: number;
  /** Real length of this local date: 82 800, 86 400 or 90 000 seconds. */
  readonly dayLengthSeconds: number;
}

export interface DailyCalendarDay {
  readonly timeZone: string;
  readonly dailyDate: string;
  /** Days since 1970-01-01 of the local date; the identity anchor of the day. */
  readonly dayIndex: number;
  readonly utcOffsetSeconds: number;
  readonly dayLengthSeconds: number;
  /** Epoch milliseconds of local midnight, under this day's offset. */
  readonly dayStartMs: number;
  /** Epoch milliseconds of the exclusive day boundary. */
  readonly expiresAtMs: number;
}

const calendarFields = [
  'timeZone',
  'observedAtMs',
  'utcOffsetSeconds',
  'dayLengthSeconds',
] as const;

/**
 * Resolve the local calendar day of an explicit instant.
 *
 * `dayIndex = floor((observedAtMs + offset) / 86 400 000)`, so the date is a pure function of the
 * moment and the offset. The day window is `[dayStartMs, expiresAtMs)`: a 23 h or 25 h DST day
 * shortens or lengthens the window, and adjacent days tile the timeline exactly when the caller
 * supplies the real offset and length of each day.
 */
export function resolveDailyCalendarDay(value: unknown): DailyCalendarDay {
  const data = plainFields(value, calendarFields, 'daily calendar input');
  for (const key of calendarFields) requireRequired(data, key, 'daily calendar input');
  const timeZone = readTimeZone(data.timeZone);
  const observedAtMs = tick(data.observedAtMs);
  const utcOffsetSeconds = readOffsetSeconds(data.utcOffsetSeconds);
  const dayLengthSeconds = readDayLengthSeconds(data.dayLengthSeconds);
  const dayIndex = Math.floor(
    (observedAtMs + utcOffsetSeconds * secondsPerMillisecond) / millisecondsPerDay,
  );
  requireContract(dayIndex >= 0, 'Observed instant is before the identity anchor');
  const dayStartMs = dayIndex * millisecondsPerDay - utcOffsetSeconds * secondsPerMillisecond;
  const expiresAtMs = dayStartMs + dayLengthSeconds * secondsPerMillisecond;
  requireContract(
    Number.isSafeInteger(dayStartMs) && Number.isSafeInteger(expiresAtMs),
    'Resolved day window is outside the safe integer range',
  );
  requireContract(dayStartMs <= observedAtMs, 'Observed instant precedes its own local day');
  requireContract(observedAtMs < expiresAtMs, 'Observed instant is past its own local day');
  return Object.freeze({
    timeZone,
    dailyDate: formatDailyDate(dayIndex),
    dayIndex,
    utcOffsetSeconds,
    dayLengthSeconds,
    dayStartMs,
    expiresAtMs,
  });
}

// ---------------------------------------------------------------------------------------------
// Capability snapshot: persisted, versioned, built only from delivered contracts
// ---------------------------------------------------------------------------------------------

export interface DailyCapabilitySnapshot {
  readonly snapshotVersion: typeof DAILY_CAPABILITY_VERSION;
  /** Implemented 092 keys a LEARNING daily may name; empty disables learning objectives. */
  readonly learningKeys: readonly string[];
  /** Real dropoff zone ids of the loaded map; a flavour parameter, never a capability gate. */
  readonly zones: readonly string[];
  /** Real vehicle class ids of the fleet. */
  readonly vehicleClasses: readonly string[];
  /** Control modes available to the player; MANUAL is mandatory. */
  readonly controlModes: readonly ControlMode[];
  /** Completed 116 campaign mission ids; gates the advanced templates. */
  readonly campaignCompleted: readonly string[];
  /** Earned 116 unlock ids; recorded for evidence, never fabricated. */
  readonly unlocks: readonly string[];
  /** Stable digest of the snapshot content; a stored snapshot must match its own digest. */
  readonly capabilityDigest: string;
}

const capabilityFields = [
  'snapshotVersion',
  'learningKeys',
  'zones',
  'vehicleClasses',
  'controlModes',
  'campaignCompleted',
  'unlocks',
  'capabilityDigest',
] as const;

function sortedUniqueIdList(
  value: unknown,
  maximum: number,
  maximumCodeUnits: number,
  label: string,
): readonly string[] {
  const ids = list(value, (entry) => boundedId(entry, maximumCodeUnits, label));
  requireContract(ids.length <= maximum, `${label} capacity exceeded`);
  const unique = new Set(ids);
  requireContract(unique.size === ids.length, `Duplicate ${label}`);
  return frozenSorted(unique);
}

/** Stable 128-bit digest of canonical identity parts; used to detect capability drift. */
function digestParts(parts: readonly string[]): string {
  const key = parts.join('\u0000');
  const words: string[] = [];
  for (let index = 0; index < 4; index += 1)
    words.push(randomUint32(0x211_0000, key, index).toString(16).padStart(8, '0'));
  return words.join('');
}

interface CapabilityContent {
  readonly learningKeys: readonly string[];
  readonly zones: readonly string[];
  readonly vehicleClasses: readonly string[];
  readonly controlModes: readonly ControlMode[];
  readonly campaignCompleted: readonly string[];
  readonly unlocks: readonly string[];
}

function capabilityDigest(input: CapabilityContent): string {
  return digestParts([
    DAILY_CAPABILITY_VERSION,
    ...input.learningKeys,
    '|zones',
    ...input.zones,
    '|classes',
    ...input.vehicleClasses,
    '|modes',
    ...input.controlModes,
    '|campaign',
    ...input.campaignCompleted,
    '|unlocks',
    ...input.unlocks,
  ]);
}

const campaignDefinitions = campaignMissionDefinitions();
const campaignIds = new Set(campaignDefinitions.map((mission) => mission.missionId));
const campaignPrerequisites = new Map(
  campaignDefinitions.map((mission) => [mission.missionId, mission.prerequisites] as const),
);
const campaignUnlockIds = new Set(
  campaignDefinitions.flatMap((mission) =>
    mission.rewards.flatMap((reward) => (reward.unlockId === null ? [] : [reward.unlockId])),
  ),
);
const implementedLearningKeys = new Set(
  parameterDefinitions.filter((definition) => definition.implemented).map((entry) => entry.key),
);
const vehicleClassIds = new Set(Object.keys(VEHICLE_CLASSES));

function readCapabilityContent(
  value: unknown,
): CapabilityContent & { readonly snapshotVersion: string } {
  const data = plainFields(value, capabilityFields, 'daily capability snapshot');
  for (const key of capabilityFields) requireRequired(data, key, 'daily capability snapshot');
  const snapshotVersion = text(data.snapshotVersion);
  requireContract(
    snapshotVersion === DAILY_CAPABILITY_VERSION,
    `Unsupported daily capability snapshot version: ${snapshotVersion}`,
  );
  const learningKeys = sortedUniqueIdList(
    data.learningKeys,
    DAILY_LIMITS.learningKeys,
    DAILY_LIMITS.idCodeUnits,
    'daily learning key',
  );
  const zones = sortedUniqueIdList(
    data.zones,
    DAILY_LIMITS.zones,
    DAILY_LIMITS.idCodeUnits,
    'daily zone',
  );
  const vehicleClasses = sortedUniqueIdList(
    data.vehicleClasses,
    DAILY_LIMITS.vehicleClasses,
    DAILY_LIMITS.idCodeUnits,
    'daily vehicle class',
  );
  const modes = list(data.controlModes, (entry) => choice(entry, controlModes));
  requireContract(new Set(modes).size === modes.length, 'Duplicate daily control mode');
  const campaignCompleted = sortedUniqueIdList(
    data.campaignCompleted,
    DAILY_LIMITS.campaignMissions,
    DAILY_LIMITS.idCodeUnits,
    'daily completed campaign mission',
  );
  const unlocks = sortedUniqueIdList(
    data.unlocks,
    DAILY_LIMITS.unlocks,
    DAILY_LIMITS.idCodeUnits,
    'daily unlock',
  );
  return {
    snapshotVersion,
    learningKeys,
    zones,
    vehicleClasses,
    controlModes: frozenSorted(modes) as readonly ControlMode[],
    campaignCompleted,
    unlocks,
  };
}

/** Structural read of a stored snapshot; the digest is verified against the content. */
function readStoredCapabilities(value: unknown): DailyCapabilitySnapshot {
  const content = readCapabilityContent(value);
  const data = plainFields(value, capabilityFields, 'daily capability snapshot');
  const digest = text(data.capabilityDigest);
  requireContract(
    /^[0-9a-f]{32}$/.test(digest),
    'Invalid daily capability digest; expected 32 lowercase hex digits',
  );
  requireContract(
    digest === capabilityDigest(content),
    'Daily capability snapshot does not match its own digest',
  );
  return Object.freeze({
    snapshotVersion: DAILY_CAPABILITY_VERSION,
    learningKeys: content.learningKeys,
    zones: content.zones,
    vehicleClasses: content.vehicleClasses,
    controlModes: content.controlModes,
    campaignCompleted: content.campaignCompleted,
    unlocks: content.unlocks,
    capabilityDigest: digest,
  });
}

/**
 * Build a capability snapshot from real delivered state.
 *
 * Every list is validated against a delivered contract: a learning key must be an implemented 092
 * parameter, a vehicle class must exist in the real fleet, a campaign id and an unlock id must be
 * authored by 116, and a completed stage must have all its prerequisites completed. A snapshot
 * without MANUAL is refused: removing the no-learning progress path is not a capability gap.
 */
export function createDailyCapabilities(value: unknown): DailyCapabilitySnapshot {
  const content = readCapabilityContent(value);
  for (const key of content.learningKeys)
    requireContract(
      implementedLearningKeys.has(key),
      `Daily learning key is not implemented: ${key}`,
    );
  for (const classId of content.vehicleClasses)
    requireContract(vehicleClassIds.has(classId), `Unknown daily vehicle class: ${classId}`);
  requireContract(
    content.controlModes.includes('MANUAL'),
    'Daily capabilities must keep the MANUAL control mode available',
  );
  const completed = new Set(content.campaignCompleted);
  for (const missionId of content.campaignCompleted) {
    requireContract(campaignIds.has(missionId), `Unknown campaign mission completed: ${missionId}`);
    for (const prerequisite of campaignPrerequisites.get(missionId) ?? [])
      requireContract(
        completed.has(prerequisite),
        `Completed campaign mission is missing its prerequisite: ${prerequisite}`,
      );
  }
  for (const unlockId of content.unlocks)
    requireContract(campaignUnlockIds.has(unlockId), `Unknown daily unlock: ${unlockId}`);
  return readStoredCapabilities(value);
}

/** Convenience builder for callers that already hold canonical lists. */
export function dailyCapabilities(input: {
  readonly learningKeys: readonly string[];
  readonly zones: readonly string[];
  readonly vehicleClasses: readonly string[];
  readonly controlModes: readonly string[];
  readonly campaignCompleted: readonly string[];
  readonly unlocks: readonly string[];
}): DailyCapabilitySnapshot {
  const content: CapabilityContent = {
    learningKeys: frozenSorted(new Set(input.learningKeys)),
    zones: frozenSorted(new Set(input.zones)),
    vehicleClasses: frozenSorted(new Set(input.vehicleClasses)),
    controlModes: frozenSorted(new Set(input.controlModes)) as readonly ControlMode[],
    campaignCompleted: frozenSorted(new Set(input.campaignCompleted)),
    unlocks: frozenSorted(new Set(input.unlocks)),
  };
  return createDailyCapabilities({
    snapshotVersion: DAILY_CAPABILITY_VERSION,
    learningKeys: content.learningKeys,
    zones: content.zones,
    vehicleClasses: content.vehicleClasses,
    controlModes: content.controlModes,
    campaignCompleted: content.campaignCompleted,
    unlocks: content.unlocks,
    capabilityDigest: capabilityDigest(content),
  });
}

// ---------------------------------------------------------------------------------------------
// Versioned template families
// ---------------------------------------------------------------------------------------------

export interface DailyTemplateFamily {
  readonly familyId: string;
  /** Explicit template version; a new authored revision is a new version string. */
  readonly version: string;
  readonly category: DailyTemplateCategory;
  readonly controlRequirement: DailyControlRequirement;
  /** Objective kinds are the closed 116 vocabulary with a real evaluator. */
  readonly objectiveKind: MissionObjectiveKind;
  /** `true` when the objective names a supported 092 key for LEARNING. */
  readonly learningKeyRequired: boolean;
  /** `true` when the objective is playable in MANUAL without changing the profile. */
  readonly allowsManual: boolean;
  /** Completed 116 campaign missions required before the family becomes eligible. */
  readonly minCampaignMissions: number;
  /** Ascending target options; difficulty and the distinctness rule pick inside it. */
  readonly targets: readonly number[];
  /** Declared incident budgets; `null` means "no incident budget". */
  readonly incidentBudgets: readonly (number | null)[];
  /** Declared evaluation windows in authoritative ticks; `null` means "until completed". */
  readonly windowTicksOptions: readonly (number | null)[];
  /** Declared `FULL_STOP` duration floors in seconds; `null` for every other objective. */
  readonly minDurationOptions: readonly (number | null)[];
  readonly title: string;
  readonly label: string;
}

export interface DailyTemplateCatalog {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: string;
  readonly families: readonly DailyTemplateFamily[];
}

const templateFamilyFields = [
  'familyId',
  'version',
  'category',
  'controlRequirement',
  'objectiveKind',
  'learningKeyRequired',
  'allowsManual',
  'minCampaignMissions',
  'targets',
  'incidentBudgets',
  'windowTicksOptions',
  'minDurationOptions',
  'title',
  'label',
] as const;

const templateCatalogFields = ['schemaVersion', 'units', 'version', 'families'] as const;

function readNullableNumbers(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  wholeNumbers = true,
): readonly (number | null)[] {
  const entries = list(value, (entry) =>
    entry === null ? null : number(entry, minimum, maximum),
  ) as (number | null)[];
  requireContract(entries.length > 0, `${label} must declare at least one option`);
  for (const entry of entries)
    if (entry !== null && wholeNumbers)
      requireContract(Number.isSafeInteger(entry), `${label} options must be whole numbers`);
  requireContract(
    new Set(entries.map((entry) => String(entry))).size === entries.length,
    `Duplicate ${label}`,
  );
  return Object.freeze(entries);
}

export function parseDailyTemplateCatalog(value: unknown): DailyTemplateCatalog {
  const data = plainFields(value, templateCatalogFields, 'daily template catalog');
  for (const key of templateCatalogFields) requireRequired(data, key, 'daily template catalog');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported daily template schema',
  );
  const version = boundedId(
    data.version,
    DAILY_LIMITS.idCodeUnits,
    'daily template catalog version',
  );
  const families = list(data.families, readTemplateFamily);
  requireContract(
    families.length > 0 && families.length <= DAILY_LIMITS.templateFamilies,
    'Daily template family capacity violated',
  );
  requireContract(
    new Set(families.map((family) => family.familyId)).size === families.length,
    'Duplicate daily template family id',
  );
  return Object.freeze({ schemaVersion: 1 as const, units: 'SI' as const, version, families });
}

function readTemplateFamily(value: unknown): DailyTemplateFamily {
  const data = plainFields(value, templateFamilyFields, 'daily template family');
  for (const key of templateFamilyFields) requireRequired(data, key, 'daily template family');
  const familyId = boundedId(data.familyId, DAILY_LIMITS.idCodeUnits, 'daily template family');
  const version = boundedId(data.version, DAILY_LIMITS.idCodeUnits, 'daily template version');
  const category = choice(data.category, dailyTemplateCategories);
  const controlRequirement = choice(data.controlRequirement, dailyControlRequirements);
  const objectiveKind = choice(data.objectiveKind, missionObjectiveKinds);
  const learningKeyRequired = readBoolean(data.learningKeyRequired, 'learning key requirement');
  const allowsManual = readBoolean(data.allowsManual, 'manual allowance');
  const minCampaignMissions = tick(data.minCampaignMissions);
  requireContract(
    minCampaignMissions <= DAILY_LIMITS.campaignMissions,
    'Daily template campaign requirement exceeds the campaign capacity',
  );
  const targets = list(data.targets, (entry) => {
    const target = number(entry, 1, 1_000_000);
    requireContract(Number.isSafeInteger(target), 'Daily target must be a whole number');
    return target;
  });
  requireContract(targets.length > 0, 'Daily template must declare at least one target');
  for (let index = 1; index < targets.length; index += 1)
    requireContract(
      targets[index]! >= targets[index - 1]!,
      'Daily template targets must be ascending',
    );
  requireContract(new Set(targets).size === targets.length, 'Duplicate daily template target');
  const incidentBudgets = readNullableNumbers(
    data.incidentBudgets,
    'daily incident budget',
    0,
    1_000,
  );
  const windowTicksOptions = readNullableNumbers(
    data.windowTicksOptions,
    'daily evaluation window',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const minDurationOptions = readNullableNumbers(
    data.minDurationOptions,
    'daily stop duration',
    0,
    3_600,
    false,
  );
  requireContract(
    objectiveKind === 'FULL_STOPS'
      ? minDurationOptions.some((entry) => entry !== null)
      : minDurationOptions.every((entry) => entry === null),
    `Only FULL_STOPS declares a stop duration: ${objectiveKind}`,
  );
  requireContract(
    !learningKeyRequired || controlRequirement === 'LEARNING',
    'A learning-key template must require LEARNING explicitly',
  );
  requireContract(
    !(controlRequirement === 'LEARNING' && allowsManual),
    'A LEARNING template cannot claim a MANUAL objective',
  );
  requireContract(
    objectiveKind !== 'LEARNING_ACTIVATIONS' || controlRequirement === 'LEARNING',
    'LEARNING_ACTIVATIONS requires the LEARNING control mode',
  );
  return Object.freeze({
    familyId,
    version,
    category,
    controlRequirement,
    objectiveKind,
    learningKeyRequired,
    allowsManual,
    minCampaignMissions,
    targets: Object.freeze([...targets]),
    incidentBudgets,
    windowTicksOptions,
    minDurationOptions,
    title: boundedId(data.title, 160, 'daily template title'),
    label: boundedId(data.label, 160, 'daily template label'),
  });
}

function readBoolean(value: unknown, label: string): boolean {
  requireContract(typeof value === 'boolean', `Expected boolean ${label}`);
  return value;
}

/**
 * The delivered V1 catalog. Families cover service, skill, a supported experiment and an unusual
 * challenge; every objective kind has a real 116 evaluator, so no template is a HUD-text promise.
 * 231/233 can pass its own versioned catalog and this default never blocks that integration.
 */
export function createDailyTemplateCatalog(): DailyTemplateCatalog {
  return parseDailyTemplateCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: DAILY_TEMPLATE_CATALOG_VERSION,
    families: [
      {
        familyId: 'daily-manual-service',
        version: '1',
        category: 'SKILL',
        controlRequirement: 'MANUAL',
        objectiveKind: 'MANUAL_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [1, 2, 3],
        incidentBudgets: [null, 1],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Curse în MANUAL',
        label: 'Finalizează curse cu intervenție MANUAL',
      },
      {
        familyId: 'daily-clean-service',
        version: '1',
        category: 'SERVICE',
        controlRequirement: 'ANY',
        objectiveKind: 'CLEAN_DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [1, 2],
        incidentBudgets: [0, 1],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Serviciu fără incident',
        label: 'Livrează pasageri fără incident',
      },
      {
        familyId: 'daily-service-window',
        version: '1',
        category: 'SERVICE',
        controlRequirement: 'ANY',
        objectiveKind: 'DROPOFFS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 1,
        targets: [2, 3, 4],
        incidentBudgets: [1, 2],
        windowTicksOptions: [3_600, 7_200, 10_800],
        minDurationOptions: [null],
        title: 'Fereastră de serviciu',
        label: 'Execută curse într-o fereastră simulată cu buget de incidente',
      },
      {
        familyId: 'daily-learning-demonstration',
        version: '1',
        category: 'EXPERIMENT',
        controlRequirement: 'LEARNING',
        objectiveKind: 'LEARNING_ACTIVATIONS',
        learningKeyRequired: true,
        allowsManual: false,
        minCampaignMissions: 0,
        targets: [1, 2],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Demonstrație LEARNING',
        label: 'Publică o versiune LEARNING pentru o cheie deja suportată',
      },
      {
        familyId: 'daily-stop-discipline',
        version: '1',
        category: 'SKILL',
        controlRequirement: 'ANY',
        objectiveKind: 'FULL_STOPS',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [1, 2, 3],
        incidentBudgets: [null, 1],
        windowTicksOptions: [null],
        minDurationOptions: [1.5, 2, 2.5],
        title: 'Disciplina opririlor',
        label: 'Oprește complet la oportunitățile întâlnite',
      },
      {
        familyId: 'daily-lane-flow',
        version: '1',
        category: 'ODDITY',
        controlRequirement: 'ANY',
        objectiveKind: 'LANE_CHANGES',
        learningKeyRequired: false,
        allowsManual: true,
        minCampaignMissions: 0,
        targets: [2, 3, 4],
        incidentBudgets: [null],
        windowTicksOptions: [null],
        minDurationOptions: [null],
        title: 'Fluiditatea benzilor',
        label: 'Finalizează schimbări de bandă într-un flux curat',
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------------------------

export interface DailyMissionInstance {
  /** Stable identity: one slot of one local day; it includes the date, never an array position. */
  readonly instanceId: string;
  readonly slot: number;
  readonly familyId: string;
  readonly templateVersion: string;
  readonly category: DailyTemplateCategory;
  readonly objectiveKind: MissionObjectiveKind;
  readonly controlRequirement: DailyControlRequirement;
  readonly allowsManual: boolean;
  /** Exact supported 092 key a LEARNING objective demonstrates; `null` otherwise. */
  readonly learningKey: string | null;
  readonly target: number;
  readonly difficulty: MissionDifficulty;
  readonly zone: string | null;
  readonly incidentBudget: number | null;
  readonly windowTicks: number | null;
  readonly minDurationS: number | null;
  readonly rewardXp: number;
  readonly title: string;
  readonly label: string;
}

export interface DailyMissionSet {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof DAILY_SCHEMA_VERSION;
  readonly playerId: string;
  readonly dailyDate: string;
  readonly calendarTimeZone: string;
  readonly calendarOffsetSeconds: number;
  readonly dayLengthSeconds: number;
  readonly dayStartMs: number;
  readonly expiresAtMs: number;
  readonly generatorVersion: string;
  readonly templateCatalogVersion: string;
  readonly seed: number;
  readonly generatedAtMs: number;
  readonly capabilitySnapshot: DailyCapabilitySnapshot;
  readonly instances: readonly DailyMissionInstance[];
  /** Content signature over families, targets and zones; a repeat is reported, never hidden. */
  readonly signature: string;
  /** True when the day differs from the previous set, or when no previous set exists. */
  readonly distinctFromPrevious: boolean;
  /** Slots filled by repeating an eligible family because the catalog was too small. */
  readonly fallbacks: number;
  readonly capabilityGaps: readonly DailyCapabilityGap[];
  readonly excludedFamilies: readonly string[];
}

const generationFields = [
  'playerId',
  'calendar',
  'capabilities',
  'generatedAtMs',
  'generatorVersion',
  'templateCatalog',
  'previousSet',
] as const;

function shuffledIndices(length: number, seed: number, key: string, attempt: number): number[] {
  const indices: number[] = [];
  for (let index = 0; index < length; index += 1) indices.push(index);
  for (let index = 0; index < length; index += 1) {
    const span = length - index;
    const pick = index + (randomUint32(seed, key, attempt * 128 + index) % span);
    const swap = indices[pick]!;
    indices[pick] = indices[index]!;
    indices[index] = swap;
  }
  return indices;
}

function capabilityGapsOf(snapshot: DailyCapabilitySnapshot): readonly DailyCapabilityGap[] {
  const gaps: DailyCapabilityGap[] = [];
  if (snapshot.zones.length === 0) gaps.push('ZONES');
  if (snapshot.campaignCompleted.length === 0) gaps.push('CAMPAIGN_PROGRESS');
  if (!snapshot.controlModes.includes('LEARNING')) gaps.push('LEARNING_MODE');
  if (snapshot.learningKeys.length === 0) gaps.push('LEARNING_KEYS');
  return frozenSorted(gaps) as readonly DailyCapabilityGap[];
}

function eligibleFamilies(
  catalog: DailyTemplateCatalog,
  snapshot: DailyCapabilitySnapshot,
): readonly DailyTemplateFamily[] {
  return Object.freeze(
    catalog.families.filter((family) => {
      if (family.minCampaignMissions > snapshot.campaignCompleted.length) return false;
      if (family.controlRequirement === 'LEARNING') {
        if (!snapshot.controlModes.includes('LEARNING')) return false;
        if (snapshot.learningKeys.length === 0) return false;
      }
      return true;
    }),
  );
}

function difficultyFor(completedMissions: number): MissionDifficulty {
  if (completedMissions === 0) return 'EASY';
  return completedMissions < 4 ? 'NORMAL' : 'HARD';
}

function preferredTargetIndex(
  size: number,
  difficulty: MissionDifficulty,
  seed: number,
  familyId: string,
  attempt: number,
  slot: number,
): number {
  if (difficulty === 'EASY') return 0;
  if (difficulty === 'HARD') return size - 1;
  return randomUint32(seed, `target:${familyId}`, attempt * 256 + slot) % size;
}

function sampleList<T>(options: readonly T[], seed: number, key: string, index: number): T {
  return options[randomUint32(seed, key, index) % options.length]!;
}

interface SlotParameterization {
  readonly target: number;
  readonly zone: string | null;
  readonly incidentBudget: number | null;
  readonly windowTicks: number | null;
  readonly minDurationS: number | null;
  readonly learningKey: string | null;
  readonly difficulty: MissionDifficulty;
}

/**
 * Sample one slot, avoiding an identical `(family, target, zone)` variant inside the same day.
 * A repeated family therefore still produces a distinct instance; when the catalog cannot offer any
 * further variant the generation is refused instead of emitting duplicates.
 */
function parameterize(
  family: DailyTemplateFamily,
  snapshot: DailyCapabilitySnapshot,
  seed: number,
  attempt: number,
  slot: number,
  used: Set<string>,
): SlotParameterization {
  const difficulty = difficultyFor(snapshot.campaignCompleted.length);
  const size = family.targets.length;
  const start = preferredTargetIndex(size, difficulty, seed, family.familyId, attempt, slot);
  const zoneCount = Math.max(snapshot.zones.length, 1);
  for (let step = 0; step < size * zoneCount; step += 1) {
    const target = family.targets[(start + step) % size]!;
    const zone = snapshot.zones.length === 0 ? null : snapshot.zones[(start + step) % zoneCount]!;
    const variantKey = `${family.familyId}|${target}|${zone ?? '-'}`;
    if (used.has(variantKey)) continue;
    used.add(variantKey);
    return Object.freeze({
      target,
      zone,
      incidentBudget: sampleList(
        family.incidentBudgets,
        seed,
        `incidents:${family.familyId}`,
        attempt * 256 + slot,
      ),
      windowTicks: sampleList(
        family.windowTicksOptions,
        seed,
        'evaluation:' + family.familyId,
        attempt * 256 + slot,
      ),
      minDurationS: sampleList(
        family.minDurationOptions,
        seed,
        `duration:${family.familyId}`,
        attempt * 256 + slot,
      ),
      learningKey: family.learningKeyRequired
        ? sampleList(
            snapshot.learningKeys,
            seed,
            `learning:${family.familyId}`,
            attempt * 256 + slot,
          )
        : null,
      difficulty,
    });
  }
  throw new Error(
    `Daily template family cannot produce another distinct mission: ${family.familyId}`,
  );
}

/** Stable instance identity: player, local date, slot and template version. */
export function dailyInstanceId(
  playerId: string,
  dailyDate: string,
  slot: number,
  familyId: string,
  templateVersion: string,
): string {
  requireContract(
    Number.isSafeInteger(slot) && slot >= 1 && slot <= DAILY_MISSIONS_PER_DAY,
    'Invalid daily slot',
  );
  parseDailyDate(dailyDate);
  return `daily-v1:${boundedId(playerId, DAILY_LIMITS.idCodeUnits, 'player')}:${dailyDate}:s${slot}:${boundedId(
    familyId,
    DAILY_LIMITS.idCodeUnits,
    'daily template family',
  )}@${boundedId(templateVersion, DAILY_LIMITS.idCodeUnits, 'daily template version')}`;
}

/** Stable reward identity: one mission instance, granted at most once by the caller's ledger. */
export function dailyRewardId(playerId: string, instanceId: string): string {
  return `daily-reward-v1:${boundedId(playerId, DAILY_LIMITS.idCodeUnits, 'player')}:${boundedId(
    instanceId,
    DAILY_LIMITS.instanceIdCodeUnits,
    'daily instance',
  )}`;
}

function instanceSignature(instance: DailyMissionInstance): string {
  return `${instance.familyId}@${instance.templateVersion}#${instance.target}#${instance.zone ?? '-'}`;
}

function instanceOf(
  playerId: string,
  day: DailyCalendarDay,
  family: DailyTemplateFamily,
  slot: number,
  parameters: SlotParameterization,
): DailyMissionInstance {
  const instanceId = dailyInstanceId(
    playerId,
    day.dailyDate,
    slot,
    family.familyId,
    family.version,
  );
  requireContract(
    instanceId.length <= DAILY_LIMITS.instanceIdCodeUnits,
    'Daily instance identity exceeds the code-unit limit',
  );
  return Object.freeze({
    instanceId,
    slot,
    familyId: family.familyId,
    templateVersion: family.version,
    category: family.category,
    objectiveKind: family.objectiveKind,
    controlRequirement: family.controlRequirement,
    allowsManual: family.allowsManual,
    learningKey: parameters.learningKey,
    target: parameters.target,
    difficulty: parameters.difficulty,
    zone: parameters.zone,
    incidentBudget: parameters.incidentBudget,
    windowTicks: parameters.windowTicks,
    minDurationS: parameters.minDurationS,
    rewardXp: DAILY_MISSION_XP,
    title: family.title,
    label: family.label,
  });
}

/**
 * Generate the three missions of one local day.
 *
 * Determinism: `seed = hash(playerId, dailyDate, generatorVersion)`; every choice is
 * `randomUint32(seed, key, attemptIndex)`. The same inputs produce the same bytes, and a different
 * day produces new identities plus re-sampled parameters.
 *
 * Capability insufficiency has a defined result: a family is excluded, the remaining families fill
 * the three slots, a repeated family uses a different target/zone variant, and the set reports
 * `capabilityGaps`, `excludedFamilies` and `fallbacks`. It never throws for a missing capability.
 */
export function generateDailyMissionSet(value: unknown): DailyMissionSet {
  const data = plainFields(value, generationFields, 'daily generation input');
  for (const key of ['playerId', 'calendar', 'capabilities', 'generatedAtMs'])
    requireRequired(data, key, 'daily generation input');
  const playerId = boundedId(data.playerId, DAILY_LIMITS.idCodeUnits, 'player');
  const day = resolveDailyCalendarDay(data.calendar);
  const snapshot = createDailyCapabilities(data.capabilities);
  const generatedAtMs = tick(data.generatedAtMs);
  const generatorVersion =
    data.generatorVersion === undefined
      ? DAILY_GENERATOR_VERSION
      : boundedId(data.generatorVersion, DAILY_LIMITS.idCodeUnits, 'daily generator version');
  const catalog =
    data.templateCatalog === undefined
      ? createDailyTemplateCatalog()
      : parseDailyTemplateCatalog(data.templateCatalog);
  const previous =
    data.previousSet === undefined || data.previousSet === null
      ? null
      : parseDailyMissionSet(data.previousSet);
  requireContract(
    previous === null || previous.playerId === playerId,
    'Previous daily set belongs to another player',
  );
  const seed = randomUint32(
    0x211_0001,
    `${playerId}|${generatorVersion}|${catalog.version}`,
    day.dayIndex,
  );
  const eligible = eligibleFamilies(catalog, snapshot);
  const manualFamilies = eligible.filter((family) => family.allowsManual);
  requireContract(
    manualFamilies.length > 0,
    'Daily template catalog has no objective playable in MANUAL without learning',
  );
  const excludedFamilies = frozenSorted(
    catalog.families
      .filter((family) => !eligible.includes(family))
      .map((family) => family.familyId),
  );
  const gaps = capabilityGapsOf(snapshot);
  const fallbacks = Math.max(0, DAILY_MISSIONS_PER_DAY - eligible.length);

  let instances: readonly DailyMissionInstance[] = [];
  let distinctFromPrevious = false;
  for (let attempt = 0; attempt < DAILY_LIMITS.generatorAttempts; attempt += 1) {
    const order = shuffledIndices(eligible.length, seed, 'family', attempt).map(
      (index) => eligible[index]!,
    );
    const picked = order.slice(0, Math.min(DAILY_MISSIONS_PER_DAY, order.length));
    if (!picked.some((family) => family.allowsManual))
      picked[picked.length - 1] = manualFamilies[0]!;
    while (picked.length < DAILY_MISSIONS_PER_DAY)
      picked.push(eligible[picked.length % eligible.length]!);
    const used = new Set<string>();
    const built = picked.map((family, index) =>
      instanceOf(
        playerId,
        day,
        family,
        index + 1,
        parameterize(family, snapshot, seed, attempt, index, used),
      ),
    );
    const signature = built.map((entry) => instanceSignature(entry)).join(',');
    instances = Object.freeze(built);
    distinctFromPrevious = previous === null || signature !== previous.signature;
    if (distinctFromPrevious) break;
  }
  requireContract(
    instances.length === DAILY_MISSIONS_PER_DAY,
    'Daily set must contain three missions',
  );
  requireContract(
    instances.some((entry) => entry.allowsManual && entry.learningKey === null),
    'Daily set must keep at least one MANUAL objective without learning',
  );
  requireContract(
    new Set(instances.map((entry) => entry.instanceId)).size === DAILY_MISSIONS_PER_DAY,
    'Daily instances must have distinct identities',
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: DAILY_SCHEMA_VERSION,
    playerId,
    dailyDate: day.dailyDate,
    calendarTimeZone: day.timeZone,
    calendarOffsetSeconds: day.utcOffsetSeconds,
    dayLengthSeconds: day.dayLengthSeconds,
    dayStartMs: day.dayStartMs,
    expiresAtMs: day.expiresAtMs,
    generatorVersion,
    templateCatalogVersion: catalog.version,
    seed,
    generatedAtMs,
    capabilitySnapshot: snapshot,
    instances,
    signature: instances.map((entry) => instanceSignature(entry)).join(','),
    distinctFromPrevious,
    fallbacks,
    capabilityGaps: gaps,
    excludedFamilies,
  });
}

// ---------------------------------------------------------------------------------------------
// Persisted set: strict round-trip, no rerandomisation on reload
// ---------------------------------------------------------------------------------------------

const setFields = [
  'schemaVersion',
  'units',
  'version',
  'playerId',
  'dailyDate',
  'calendarTimeZone',
  'calendarOffsetSeconds',
  'dayLengthSeconds',
  'dayStartMs',
  'expiresAtMs',
  'generatorVersion',
  'templateCatalogVersion',
  'seed',
  'generatedAtMs',
  'capabilitySnapshot',
  'instances',
  'signature',
  'distinctFromPrevious',
  'fallbacks',
  'capabilityGaps',
  'excludedFamilies',
] as const;

const instanceFields = [
  'instanceId',
  'slot',
  'familyId',
  'templateVersion',
  'category',
  'objectiveKind',
  'controlRequirement',
  'allowsManual',
  'learningKey',
  'target',
  'difficulty',
  'zone',
  'incidentBudget',
  'windowTicks',
  'minDurationS',
  'rewardXp',
  'title',
  'label',
] as const;

function objectiveRequiresLearning(kind: MissionObjectiveKind): boolean {
  return kind === 'LEARNING_ACTIVATIONS' || kind === 'DISTINCT_PROFILE_VERSIONS';
}

function readInstance(value: unknown): DailyMissionInstance {
  const data = plainFields(value, instanceFields, 'daily mission instance');
  for (const key of instanceFields) requireRequired(data, key, 'daily mission instance');
  const instanceId = boundedId(
    data.instanceId,
    DAILY_LIMITS.instanceIdCodeUnits,
    'daily mission instance',
  );
  const slot = number(data.slot, 1, DAILY_MISSIONS_PER_DAY);
  requireContract(Number.isSafeInteger(slot), 'Daily slot must be a whole number');
  const objectiveKind = choice(data.objectiveKind, missionObjectiveKinds);
  const controlRequirement = choice(data.controlRequirement, dailyControlRequirements);
  const allowsManual = readBoolean(data.allowsManual, 'manual allowance');
  const learningKey =
    data.learningKey === null
      ? null
      : boundedId(data.learningKey, DAILY_LIMITS.idCodeUnits, 'daily learning key');
  requireContract(
    !allowsManual || controlRequirement !== 'LEARNING',
    'A LEARNING daily objective cannot allow MANUAL',
  );
  requireContract(
    objectiveRequiresLearning(objectiveKind) === (controlRequirement === 'LEARNING'),
    'Daily objective kind and control requirement disagree',
  );
  requireContract(
    controlRequirement !== 'LEARNING' || learningKey !== null,
    'A LEARNING daily objective must name its supported learning key',
  );
  requireContract(
    controlRequirement === 'LEARNING' || learningKey === null,
    'Only a LEARNING daily objective names a learning key',
  );
  const target = number(data.target, 1, 1_000_000);
  requireContract(Number.isSafeInteger(target), 'Daily target must be a whole number');
  const incidentBudget =
    data.incidentBudget === null ? null : number(data.incidentBudget, 0, 1_000);
  if (incidentBudget !== null)
    requireContract(Number.isSafeInteger(incidentBudget), 'Daily incident budget must be whole');
  const windowTicks =
    data.windowTicks === null
      ? null
      : (() => {
          const ticks = tick(data.windowTicks);
          requireContract(ticks > 0, 'Daily evaluation window must be positive');
          return ticks;
        })();
  const minDurationS = data.minDurationS === null ? null : number(data.minDurationS, 0, 3_600);
  requireContract(
    objectiveKind === 'FULL_STOPS' ? minDurationS !== null : minDurationS === null,
    `Only FULL_STOPS declares a stop duration: ${objectiveKind}`,
  );
  const rewardXp = number(data.rewardXp, 0, 1_000_000);
  requireContract(Number.isSafeInteger(rewardXp), 'Daily reward must be a whole number');
  return Object.freeze({
    instanceId,
    slot,
    familyId: boundedId(data.familyId, DAILY_LIMITS.idCodeUnits, 'daily template family'),
    templateVersion: boundedId(
      data.templateVersion,
      DAILY_LIMITS.idCodeUnits,
      'daily template version',
    ),
    category: choice(data.category, dailyTemplateCategories),
    objectiveKind,
    controlRequirement,
    allowsManual,
    learningKey,
    target,
    difficulty: choice(data.difficulty, ['EASY', 'NORMAL', 'HARD'] as const),
    zone: data.zone === null ? null : boundedId(data.zone, DAILY_LIMITS.idCodeUnits, 'zone'),
    incidentBudget,
    windowTicks,
    minDurationS,
    rewardXp,
    title: boundedId(data.title, 160, 'daily mission title'),
    label: boundedId(data.label, 160, 'daily mission label'),
  });
}

/**
 * Parse a persisted set back into the contract.
 *
 * The reload is the stability proof: the stored set is authoritative and is never regenerated.
 * Identities, slots, signature, day window, capability digest and the MANUAL invariant are all
 * verified, so a forged or truncated save is refused.
 */
export function parseDailyMissionSet(value: unknown): DailyMissionSet {
  const data = plainFields(value, setFields, 'daily mission set');
  for (const key of setFields) requireRequired(data, key, 'daily mission set');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI' && data.version === DAILY_SCHEMA_VERSION,
    'Unsupported daily mission set schema version or units',
  );
  const playerId = boundedId(data.playerId, DAILY_LIMITS.idCodeUnits, 'player');
  const dailyDate = text(data.dailyDate);
  const dayIndex = parseDailyDate(dailyDate);
  const calendarTimeZone = readTimeZone(data.calendarTimeZone);
  const calendarOffsetSeconds = readOffsetSeconds(data.calendarOffsetSeconds);
  const dayLengthSeconds = readDayLengthSeconds(data.dayLengthSeconds);
  const dayStartMs = tick(data.dayStartMs);
  const expiresAtMs = tick(data.expiresAtMs);
  requireContract(
    dayStartMs === dayIndex * millisecondsPerDay - calendarOffsetSeconds * secondsPerMillisecond,
    'Daily set day start does not match its local date and offset',
  );
  requireContract(
    expiresAtMs === dayStartMs + dayLengthSeconds * secondsPerMillisecond,
    'Daily set expiry does not match its local day length',
  );
  const seed = number(data.seed, 0, 0xffff_ffff);
  requireContract(Number.isSafeInteger(seed), 'Daily seed must be a uint32');
  const instances = list(data.instances, readInstance);
  requireContract(
    instances.length === DAILY_MISSIONS_PER_DAY,
    'A daily set contains exactly three missions',
  );
  requireContract(
    new Set(instances.map((entry) => entry.instanceId)).size === DAILY_MISSIONS_PER_DAY,
    'Daily instances must have distinct identities',
  );
  requireContract(
    new Set(instances.map((entry) => entry.slot)).size === DAILY_MISSIONS_PER_DAY,
    'Daily slots must be distinct',
  );
  for (const entry of instances)
    requireContract(
      entry.instanceId ===
        dailyInstanceId(playerId, dailyDate, entry.slot, entry.familyId, entry.templateVersion),
      'Daily instance identity does not match its local day and slot',
    );
  requireContract(
    instances.some((entry) => entry.allowsManual && entry.learningKey === null),
    'Daily set must keep at least one MANUAL objective without learning',
  );
  const signature = text(data.signature);
  requireContract(
    signature === instances.map((entry) => instanceSignature(entry)).join(','),
    'Daily set signature does not match its instances',
  );
  const fallbacks = number(data.fallbacks, 0, DAILY_MISSIONS_PER_DAY);
  requireContract(Number.isSafeInteger(fallbacks), 'Daily fallback count must be a whole number');
  const gaps = list(data.capabilityGaps, (entry) => choice(entry, dailyCapabilityGaps));
  requireContract(new Set(gaps).size === gaps.length, 'Duplicate daily capability gap');
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: DAILY_SCHEMA_VERSION,
    playerId,
    dailyDate,
    calendarTimeZone,
    calendarOffsetSeconds,
    dayLengthSeconds,
    dayStartMs,
    expiresAtMs,
    generatorVersion: boundedId(
      data.generatorVersion,
      DAILY_LIMITS.idCodeUnits,
      'daily generator version',
    ),
    templateCatalogVersion: boundedId(
      data.templateCatalogVersion,
      DAILY_LIMITS.idCodeUnits,
      'daily template catalog version',
    ),
    seed,
    generatedAtMs: tick(data.generatedAtMs),
    capabilitySnapshot: readStoredCapabilities(data.capabilitySnapshot),
    instances,
    signature,
    distinctFromPrevious: readBoolean(data.distinctFromPrevious, 'previous-day distinction'),
    fallbacks,
    capabilityGaps: frozenSorted(gaps) as readonly DailyCapabilityGap[],
    excludedFamilies: frozenSorted(
      list(data.excludedFamilies, (entry) =>
        boundedId(entry, DAILY_LIMITS.idCodeUnits, 'excluded daily template family'),
      ),
    ),
  });
}

/** Exclusive day boundary: ACTIVE while `dayStartMs <= observedAtMs < expiresAtMs`. */
export function dailySetPhase(set: DailyMissionSet, observedAtMs: number): DailySetPhase {
  const observed = tick(observedAtMs);
  if (observed < set.dayStartMs) return 'PENDING';
  return observed < set.expiresAtMs ? 'ACTIVE' : 'EXPIRED';
}

export function dailySetExpired(set: DailyMissionSet, observedAtMs: number): boolean {
  return dailySetPhase(set, observedAtMs) === 'EXPIRED';
}

export interface DailyCalendarContinuity {
  /** Milliseconds between the previous expiry and the next start; `0` is a seamless boundary. */
  readonly gapMs: number;
  readonly overlap: boolean;
  readonly contiguous: boolean;
}

/** Adjacent local days tile the timeline exactly when each day carries its real offset and length. */
export function dailyCalendarContinuity(
  previous: DailyMissionSet,
  next: DailyMissionSet,
): DailyCalendarContinuity {
  const gapMs = next.dayStartMs - previous.expiresAtMs;
  return Object.freeze({ gapMs, overlap: gapMs < 0, contiguous: gapMs === 0 });
}

// ---------------------------------------------------------------------------------------------
// Calendar state: day boundary, rollback, forward jump, retained rewards
// ---------------------------------------------------------------------------------------------

export interface DailyRewardRecord {
  readonly instanceId: string;
  readonly rewardId: string;
  readonly dailyDate: string;
  readonly grantedAtMs: number;
}

export interface DailyClockEvent {
  readonly action: DailyClockAction;
  readonly fromDate: string | null;
  readonly toDate: string;
  readonly observedAtMs: number;
  readonly skippedDays: number;
  readonly fromTimeZone: string | null;
  readonly toTimeZone: string;
}

export interface DailyCalendarCounters {
  readonly generated: number;
  readonly regenerated: number;
  readonly rollbacks: number;
  readonly forwardJumps: number;
  readonly expiredSets: number;
  readonly droppedSets: number;
  readonly droppedRewards: number;
  readonly droppedEvents: number;
}

export interface DailyCalendarState {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof DAILY_CALENDAR_VERSION;
  readonly playerId: string;
  /** Highest local date ever observed; clock rollback never lowers it. */
  readonly highestObservedDate: string | null;
  /** Calendar time zone that applies from now on. */
  readonly timeZone: string;
  readonly sets: readonly DailyMissionSet[];
  readonly rewards: readonly DailyRewardRecord[];
  readonly clockEvents: readonly DailyClockEvent[];
  readonly counters: DailyCalendarCounters;
}

const stateFields = [
  'schemaVersion',
  'units',
  'version',
  'playerId',
  'highestObservedDate',
  'timeZone',
  'sets',
  'rewards',
  'clockEvents',
  'counters',
] as const;

const counterFields = [
  'generated',
  'regenerated',
  'rollbacks',
  'forwardJumps',
  'expiredSets',
  'droppedSets',
  'droppedRewards',
  'droppedEvents',
] as const;

const rewardFields = ['instanceId', 'rewardId', 'dailyDate', 'grantedAtMs'] as const;
const clockEventFields = [
  'action',
  'fromDate',
  'toDate',
  'observedAtMs',
  'skippedDays',
  'fromTimeZone',
  'toTimeZone',
] as const;

function readReward(value: unknown): DailyRewardRecord {
  const data = plainFields(value, rewardFields, 'daily reward record');
  for (const key of rewardFields) requireRequired(data, key, 'daily reward record');
  const dailyDate = text(data.dailyDate);
  parseDailyDate(dailyDate);
  return Object.freeze({
    instanceId: boundedId(data.instanceId, DAILY_LIMITS.instanceIdCodeUnits, 'daily instance'),
    rewardId: boundedId(data.rewardId, DAILY_LIMITS.rewardIdCodeUnits, 'daily reward'),
    dailyDate,
    grantedAtMs: tick(data.grantedAtMs),
  });
}

function readClockEvent(value: unknown): DailyClockEvent {
  const data = plainFields(value, clockEventFields, 'daily clock event');
  for (const key of clockEventFields) requireRequired(data, key, 'daily clock event');
  const fromDate = data.fromDate === null ? null : text(data.fromDate);
  if (fromDate !== null) parseDailyDate(fromDate);
  const toDate = text(data.toDate);
  parseDailyDate(toDate);
  return Object.freeze({
    action: choice(data.action, dailyClockActions),
    fromDate,
    toDate,
    observedAtMs: tick(data.observedAtMs),
    skippedDays: tick(data.skippedDays),
    fromTimeZone: data.fromTimeZone === null ? null : readTimeZone(data.fromTimeZone),
    toTimeZone: readTimeZone(data.toTimeZone),
  });
}

function readCounters(value: unknown): DailyCalendarCounters {
  const data = plainFields(value, counterFields, 'daily calendar counters');
  for (const key of counterFields) requireRequired(data, key, 'daily calendar counters');
  return Object.freeze({
    generated: tick(data.generated),
    regenerated: tick(data.regenerated),
    rollbacks: tick(data.rollbacks),
    forwardJumps: tick(data.forwardJumps),
    expiredSets: tick(data.expiredSets),
    droppedSets: tick(data.droppedSets),
    droppedRewards: tick(data.droppedRewards),
    droppedEvents: tick(data.droppedEvents),
  });
}

/** First boot: an empty calendar with a real time zone and no sets. */
export function createDailyCalendarState(playerId: string, timeZone: string): DailyCalendarState {
  return parseDailyCalendarState({
    schemaVersion: 1,
    units: 'SI',
    version: DAILY_CALENDAR_VERSION,
    playerId: boundedId(playerId, DAILY_LIMITS.idCodeUnits, 'player'),
    highestObservedDate: null,
    timeZone: readTimeZone(timeZone),
    sets: [],
    rewards: [],
    clockEvents: [],
    counters: {
      generated: 0,
      regenerated: 0,
      rollbacks: 0,
      forwardJumps: 0,
      expiredSets: 0,
      droppedSets: 0,
      droppedRewards: 0,
      droppedEvents: 0,
    },
  });
}

export function parseDailyCalendarState(value: unknown): DailyCalendarState {
  const data = plainFields(value, stateFields, 'daily calendar state');
  for (const key of stateFields) requireRequired(data, key, 'daily calendar state');
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI' && data.version === DAILY_CALENDAR_VERSION,
    'Unsupported daily calendar schema version or units',
  );
  const playerId = boundedId(data.playerId, DAILY_LIMITS.idCodeUnits, 'player');
  const timeZone = readTimeZone(data.timeZone);
  const highestObservedDate =
    data.highestObservedDate === null ? null : text(data.highestObservedDate);
  if (highestObservedDate !== null) parseDailyDate(highestObservedDate);
  const sets = list(data.sets, parseDailyMissionSet);
  requireContract(sets.length <= DAILY_LIMITS.retainedSets, 'Daily set capacity violated');
  for (const set of sets)
    requireContract(set.playerId === playerId, 'Daily set belongs to another player');
  if (highestObservedDate !== null) {
    const highest = parseDailyDate(highestObservedDate);
    for (const set of sets)
      requireContract(
        parseDailyDate(set.dailyDate) <= highest,
        'Retained daily set is newer than the highest observed date',
      );
  }
  const rewards = list(data.rewards, readReward);
  requireContract(rewards.length <= DAILY_LIMITS.retainedRewards, 'Daily reward capacity violated');
  requireContract(
    new Set(rewards.map((entry) => entry.instanceId)).size === rewards.length,
    'Duplicate daily reward record',
  );
  const clockEvents = list(data.clockEvents, readClockEvent);
  requireContract(
    clockEvents.length <= DAILY_LIMITS.retainedEvents,
    'Daily event capacity violated',
  );
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: DAILY_CALENDAR_VERSION,
    playerId,
    highestObservedDate,
    timeZone,
    sets,
    rewards,
    clockEvents,
    counters: readCounters(data.counters),
  });
}

function trimmed<T>(
  entries: readonly T[],
  maximum: number,
): { readonly kept: readonly T[]; readonly dropped: number } {
  if (entries.length <= maximum) return { kept: entries, dropped: 0 };
  return { kept: entries.slice(entries.length - maximum), dropped: entries.length - maximum };
}

/** Serialisable copy of a frozen contract value; used only to derive an updated state. */
function toPlain<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function findSet(state: DailyCalendarState, dailyDate: string): DailyMissionSet | null {
  for (const set of state.sets) if (set.dailyDate === dailyDate) return set;
  return null;
}

export function dailyCalendarSet(
  state: DailyCalendarState,
  dailyDate: string,
): DailyMissionSet | null {
  return findSet(state, dailyDate);
}

/** A rewarded instance stays rewarded across a clock rollback, a reload or a replay. */
export function dailyRewardFor(
  state: DailyCalendarState,
  instanceId: string,
): DailyRewardRecord | null {
  for (const reward of state.rewards) if (reward.instanceId === instanceId) return reward;
  return null;
}

export interface DailyCalendarStepInput {
  /** Persisted state or `null` at first boot. */
  readonly state: unknown;
  readonly playerId: string;
  readonly calendar: DailyCalendarInput;
  readonly capabilities: unknown;
  readonly generatedAtMs: number;
  readonly generatorVersion?: string;
  readonly templateCatalog?: unknown;
}

export interface DailyCalendarStep {
  readonly state: DailyCalendarState;
  readonly action: DailyClockAction;
  readonly set: DailyMissionSet | null;
  readonly skippedDays: number;
  /** `true` only when a same-day set was missing and had to be rebuilt. */
  readonly regenerated: boolean;
  /** Capability content changed since the retained set was generated; the set is untouched. */
  readonly capabilityDrift: boolean;
  readonly gaps: readonly DailyCapabilityGap[];
}

const stepFields = [
  'state',
  'playerId',
  'calendar',
  'capabilities',
  'generatedAtMs',
  'generatorVersion',
  'templateCatalog',
] as const;

function eventOf(
  action: DailyClockAction,
  fromDate: string | null,
  toDate: string,
  observedAtMs: number,
  skippedDays: number,
  fromTimeZone: string | null,
  toTimeZone: string,
): DailyClockEvent {
  return Object.freeze({
    action,
    fromDate,
    toDate,
    observedAtMs,
    skippedDays,
    fromTimeZone,
    toTimeZone,
  });
}

/**
 * Advance the calendar to the local day of an explicit instant.
 *
 * - first boot or a later date: exactly one new set for that local date;
 * - same date: the retained set is returned untouched, so a refresh, a reload, a new driving
 *   profile or a later unlock cannot rerandomise the day;
 * - rollback: the retained set (if still in history) is returned, `highestObservedDate` is not
 *   lowered and no reward is reactivated;
 * - forward jump: only the current day is generated; skipped days produce no sets and no offline
 *   XP, and the number of skipped days is reported.
 */
export function advanceDailyCalendar(value: unknown): DailyCalendarStep {
  const data = plainFields(value, stepFields, 'daily calendar step input');
  for (const key of ['state', 'playerId', 'calendar', 'capabilities', 'generatedAtMs'])
    requireRequired(data, key, 'daily calendar step input');
  const playerId = boundedId(data.playerId, DAILY_LIMITS.idCodeUnits, 'player');
  const day = resolveDailyCalendarDay(data.calendar);
  const snapshot = createDailyCapabilities(data.capabilities);
  const generatedAtMs = tick(data.generatedAtMs);
  const state =
    data.state === null || data.state === undefined
      ? createDailyCalendarState(playerId, day.timeZone)
      : parseDailyCalendarState(data.state);
  requireContract(state.playerId === playerId, 'Daily calendar belongs to another player');
  const gaps = capabilityGapsOf(snapshot);
  const highestIndex =
    state.highestObservedDate === null ? null : parseDailyDate(state.highestObservedDate);

  if (highestIndex !== null && day.dayIndex === highestIndex) {
    const retained = findSet(state, day.dailyDate);
    if (retained !== null) {
      const drift = retained.capabilitySnapshot.capabilityDigest !== snapshot.capabilityDigest;
      const nextState =
        state.timeZone === day.timeZone
          ? state
          : parseDailyCalendarState({ ...toPlain(state), timeZone: day.timeZone });
      return Object.freeze({
        state: nextState,
        action: 'SAME_DAY' as const,
        set: retained,
        skippedDays: 0,
        regenerated: false,
        capabilityDrift: drift,
        gaps,
      });
    }
    // The retained set was dropped by retention while this is still the highest day: rebuild it
    // deterministically, report it and count it. The objectives are byte-identical.
    const set = generateDailyMissionSet({
      playerId,
      calendar: data.calendar,
      capabilities: data.capabilities,
      generatedAtMs,
      generatorVersion: data.generatorVersion,
      templateCatalog: data.templateCatalog,
    });
    const nextState = parseDailyCalendarState({
      ...toPlain(state),
      timeZone: day.timeZone,
      sets: [...state.sets, set],
      clockEvents: [
        ...state.clockEvents,
        eventOf(
          'SAME_DAY',
          day.dailyDate,
          day.dailyDate,
          generatedAtMs,
          0,
          state.timeZone,
          day.timeZone,
        ),
      ],
      counters: {
        ...state.counters,
        generated: state.counters.generated + 1,
        regenerated: state.counters.regenerated + 1,
      },
    });
    return Object.freeze({
      state: nextState,
      action: 'SAME_DAY' as const,
      set,
      skippedDays: 0,
      regenerated: true,
      capabilityDrift: false,
      gaps,
    });
  }

  if (highestIndex !== null && day.dayIndex < highestIndex) {
    const retained = findSet(state, day.dailyDate);
    const events = trimmed(
      [
        ...state.clockEvents,
        eventOf(
          'ROLLBACK',
          state.highestObservedDate,
          day.dailyDate,
          generatedAtMs,
          0,
          state.timeZone,
          day.timeZone,
        ),
      ],
      DAILY_LIMITS.retainedEvents,
    );
    const nextState = parseDailyCalendarState({
      ...toPlain(state),
      timeZone: day.timeZone,
      clockEvents: events.kept,
      counters: {
        ...state.counters,
        rollbacks: state.counters.rollbacks + 1,
        droppedEvents: state.counters.droppedEvents + events.dropped,
      },
    });
    return Object.freeze({
      state: nextState,
      action: 'ROLLBACK' as const,
      set: retained,
      skippedDays: 0,
      regenerated: false,
      capabilityDrift:
        retained === null
          ? false
          : retained.capabilitySnapshot.capabilityDigest !== snapshot.capabilityDigest,
      gaps,
    });
  }

  const skippedDays = highestIndex === null ? 0 : day.dayIndex - highestIndex - 1;
  const action: DailyClockAction = skippedDays > 0 ? 'FORWARD_JUMP' : 'NEW_DAY';
  const set = generateDailyMissionSet({
    playerId,
    calendar: data.calendar,
    capabilities: data.capabilities,
    generatedAtMs,
    generatorVersion: data.generatorVersion,
    templateCatalog: data.templateCatalog,
  });
  const expired = state.sets.filter((entry) => entry.expiresAtMs <= set.dayStartMs).length;
  const sets = trimmed([...state.sets, set], DAILY_LIMITS.retainedSets);
  const events = trimmed(
    [
      ...state.clockEvents,
      eventOf(
        action,
        state.highestObservedDate,
        day.dailyDate,
        generatedAtMs,
        skippedDays,
        state.timeZone,
        day.timeZone,
      ),
    ],
    DAILY_LIMITS.retainedEvents,
  );
  const nextState = parseDailyCalendarState({
    ...toPlain(state),
    highestObservedDate: day.dailyDate,
    timeZone: day.timeZone,
    sets: sets.kept,
    clockEvents: events.kept,
    counters: {
      ...state.counters,
      generated: state.counters.generated + 1,
      forwardJumps: state.counters.forwardJumps + (action === 'FORWARD_JUMP' ? 1 : 0),
      expiredSets: state.counters.expiredSets + expired,
      droppedSets: state.counters.droppedSets + sets.dropped,
      droppedEvents: state.counters.droppedEvents + events.dropped,
    },
  });
  return Object.freeze({
    state: nextState,
    action,
    set,
    skippedDays,
    regenerated: false,
    capabilityDrift: false,
    gaps,
  });
}

export interface DailyRewardInput {
  readonly state: unknown;
  readonly instanceId: string;
  readonly grantedAtMs: number;
}

export interface DailyRewardResult {
  readonly state: DailyCalendarState;
  readonly record: DailyRewardRecord;
  readonly granted: boolean;
  readonly duplicate: boolean;
}

const rewardInputFields = ['state', 'instanceId', 'grantedAtMs'] as const;

/**
 * Record the single XP credit of one daily instance.
 *
 * The credit identity is derived from the instance, so a reload, a replay or a clock rollback
 * cannot grant it twice; the caller's XP ledger is not touched here. The instance must exist in a
 * retained set of that player.
 */
export function recordDailyReward(value: unknown): DailyRewardResult {
  const data = plainFields(value, rewardInputFields, 'daily reward input');
  for (const key of rewardInputFields) requireRequired(data, key, 'daily reward input');
  const state = parseDailyCalendarState(data.state);
  const instanceId = boundedId(data.instanceId, DAILY_LIMITS.instanceIdCodeUnits, 'daily instance');
  const grantedAtMs = tick(data.grantedAtMs);
  const existing = dailyRewardFor(state, instanceId);
  if (existing !== null)
    return Object.freeze({ state, record: existing, granted: false, duplicate: true });
  let dailyDate: string | null = null;
  for (const set of state.sets)
    if (set.instances.some((entry) => entry.instanceId === instanceId)) {
      dailyDate = set.dailyDate;
      break;
    }
  requireContract(dailyDate !== null, 'Daily reward refers to an unknown mission instance');
  const record: DailyRewardRecord = Object.freeze({
    instanceId,
    rewardId: dailyRewardId(state.playerId, instanceId),
    dailyDate,
    grantedAtMs,
  });
  const rewards = trimmed([...state.rewards, record], DAILY_LIMITS.retainedRewards);
  const nextState = parseDailyCalendarState({
    ...toPlain(state),
    rewards: rewards.kept,
    counters: {
      ...state.counters,
      droppedRewards: state.counters.droppedRewards + rewards.dropped,
    },
  });
  return Object.freeze({ state: nextState, record, granted: true, duplicate: false });
}

/** Stable, sorted identity list used by reports and evidence rows. */
export function dailyMissionSetFamilies(set: DailyMissionSet): readonly string[] {
  return frozenSorted(set.instances.map((entry) => entry.familyId));
}

/** Stable display order of the instances by slot, independent of the stored array order. */
export function dailyMissionSetOrdered(set: DailyMissionSet): readonly DailyMissionInstance[] {
  return Object.freeze(
    [...set.instances].sort((left, right) => compareText(String(left.slot), String(right.slot))),
  );
}
