import type { EligibilityLabel } from '../../../src/telemetry/eligibility-windows.ts';
import type { OpportunityKind, OpportunityOutcome } from '../../../src/telemetry/opportunities.ts';

export type FixtureArtifact = 'NONE' | 'COLLISION' | 'RECOVERY' | 'INCOMPLETE';
export type FixtureState = 'RESOLVED' | 'TRUNCATED';
export interface StopOpportunityMarker {
  readonly kind: 'STOP';
  readonly observation: 'OBSERVED' | 'NOT_OBSERVED';
}

export interface DemonstrationFixture {
  readonly id: string;
  readonly purpose: string;
  readonly eligibilityLabel: EligibilityLabel;
  readonly opportunityKind: OpportunityKind;
  readonly opportunityState: FixtureState;
  readonly outcome: OpportunityOutcome | null;
  readonly artifact: FixtureArtifact;
  readonly ticks: readonly number[];
  readonly entityIds: readonly string[];
  readonly commandThrottle: number;
  readonly longitudinalAccelerationMps2: number;
  readonly stopOpportunity: StopOpportunityMarker;
  readonly claimedCompleteness: 'COMPLETE' | 'TRUNCATED';
  readonly expectedVerdict: 'VALID' | 'CORRUPTED';
  readonly expectedReason?: string;
  readonly expectedPath?: string;
  readonly opportunityIds?: readonly string[];
}

const outcomes: Record<OpportunityKind, OpportunityOutcome> = {
  STOP: 'STOPPED',
  RED: 'HELD',
  GREEN: 'RELEASED',
  YIELD: 'YIELDED',
  LANE_CHANGE: 'COMPLETED',
};
const kinds: readonly OpportunityKind[] = ['STOP', 'RED', 'GREEN', 'YIELD', 'LANE_CHANGE'];
const labels: readonly EligibilityLabel[] = [
  'FREE_TRAFFIC',
  'LEADER',
  'BLOCKED_GREEN',
  'MECHANICAL_LIMIT',
  'IMPACT',
  'PAUSE',
  'FOCUS_LOST',
  'MANUAL_SEGMENT',
  'AUTO_SEGMENT',
  'NOT_OBSERVABLE',
];

function contextFixture(label: EligibilityLabel): DemonstrationFixture {
  return {
    id: `eligibility-${label.toLowerCase()}`,
    purpose: `087 label ${label}`,
    eligibilityLabel: label,
    opportunityKind: label === 'BLOCKED_GREEN' ? 'GREEN' : 'STOP',
    opportunityState: 'RESOLVED',
    outcome: label === 'BLOCKED_GREEN' ? 'RELEASED' : 'STOPPED',
    artifact: label === 'IMPACT' ? 'COLLISION' : 'NONE',
    ticks: [1, 2, 3],
    entityIds: ['taxi-1'],
    commandThrottle: 0.4,
    longitudinalAccelerationMps2: 1,
    stopOpportunity: { kind: 'STOP', observation: 'OBSERVED' },
    claimedCompleteness: 'COMPLETE',
    expectedVerdict: 'VALID',
  };
}

export const validFixtures: readonly DemonstrationFixture[] = Object.freeze([
  ...labels.map(contextFixture),
  ...kinds.flatMap((kind) => [
    {
      ...contextFixture('FREE_TRAFFIC'),
      id: `opportunity-${kind.toLowerCase()}-resolved`,
      purpose: `086 ${kind} resolved`,
      opportunityKind: kind,
      opportunityState: 'RESOLVED' as const,
      outcome: outcomes[kind],
    },
    {
      ...contextFixture('FREE_TRAFFIC'),
      id: `opportunity-${kind.toLowerCase()}-truncated`,
      purpose: `086 ${kind} truncated`,
      opportunityKind: kind,
      opportunityState: 'TRUNCATED' as const,
      outcome: null,
    },
  ]),
  {
    ...contextFixture('FREE_TRAFFIC'),
    id: 'stop-not-observed',
    purpose: 'A demonstration without a STOP stimulus is explicitly not observed',
    stopOpportunity: { kind: 'STOP', observation: 'NOT_OBSERVED' },
    opportunityKind: 'RED',
    outcome: 'HELD',
  },
  {
    ...contextFixture('IMPACT'),
    id: 'artefact-collision',
    purpose: '088 collision artefact',
    artifact: 'COLLISION',
  },
  {
    ...contextFixture('IMPACT'),
    id: 'artefact-recovery',
    purpose: '088 recovery placement artefact',
    artifact: 'RECOVERY',
  },
  {
    ...contextFixture('IMPACT'),
    id: 'artefact-incomplete',
    purpose: '088 incomplete segment artefact',
    artifact: 'INCOMPLETE',
    claimedCompleteness: 'TRUNCATED',
  },
]);

const corrupted = (
  id: string,
  purpose: string,
  patch: Partial<DemonstrationFixture>,
  reason: string,
  path: string,
): DemonstrationFixture => ({
  ...contextFixture('FREE_TRAFFIC'),
  id,
  purpose,
  expectedVerdict: 'CORRUPTED',
  expectedReason: reason,
  expectedPath: path,
  ...patch,
});

export const corruptedFixtures: readonly DemonstrationFixture[] = Object.freeze([
  corrupted(
    'bad-non-monotonic-tick',
    'Tick regression',
    { ticks: [1, 3, 2] },
    'NON_MONOTONIC_TICK',
    'ticks[2]',
  ),
  corrupted(
    'bad-foreign-entity',
    'Foreign entity in the segment',
    { entityIds: ['taxi-1', 'other-entity'] },
    'FOREIGN_ENTITY',
    'entityIds[1]',
  ),
  corrupted(
    'bad-duplicate-entity',
    'Duplicate entity in the segment',
    { entityIds: ['taxi-1', 'taxi-1'] },
    'DUPLICATE_ENTITY',
    'entityIds[1]',
  ),
  corrupted(
    'bad-non-finite',
    'Non-finite SI value',
    { longitudinalAccelerationMps2: Number.NaN },
    'NON_FINITE_VALUE',
    'longitudinalAccelerationMps2',
  ),
  corrupted(
    'bad-command-range',
    'Command outside the 085 range',
    { commandThrottle: 1.2 },
    'COMMAND_OUT_OF_RANGE',
    'commandThrottle',
  ),
  corrupted(
    'bad-opportunity-kind',
    'Unknown opportunity kind',
    { opportunityKind: 'PARK' as OpportunityKind },
    'UNKNOWN_OPPORTUNITY_KIND',
    'opportunityKind',
  ),
  corrupted(
    'bad-opportunity-state',
    'Unknown opportunity lifecycle state',
    { opportunityState: 'DONE' as FixtureState },
    'UNKNOWN_OPPORTUNITY_STATE',
    'opportunityState',
  ),
  corrupted(
    'bad-duplicate-opportunity-id',
    'Duplicate opportunity identity',
    { opportunityIds: ['duplicate-id', 'duplicate-id'] },
    'DUPLICATE_OPPORTUNITY_ID',
    'opportunities[1].id',
  ),
  corrupted(
    'bad-eligibility-impact',
    'ELIGIBLE label contradicts collision evidence',
    { artifact: 'COLLISION', eligibilityLabel: 'FREE_TRAFFIC' },
    'ELIGIBILITY_FACT_CONTRADICTION',
    'eligibilityLabel',
  ),
  corrupted(
    'bad-truncated-complete',
    'Truncated segment claims COMPLETE',
    { artifact: 'INCOMPLETE', claimedCompleteness: 'COMPLETE' },
    'TRUNCATED_CLAIMS_COMPLETE',
    'claimedCompleteness',
  ),
  corrupted(
    'bad-missing-stop-marker',
    'Missing stimulus must carry an explicit STOP marker',
    { stopOpportunity: null as never },
    'NOT_OBSERVED',
    'stopOpportunity',
  ),
]);

export const fixtureManifest = Object.freeze({
  valid: validFixtures.map(({ id, purpose, eligibilityLabel, opportunityKind, artifact }) => ({
    id,
    purpose,
    eligibilityLabel,
    opportunityKind,
    artifact,
  })),
  corrupted: corruptedFixtures.map(({ id, purpose, expectedReason, expectedPath }) => ({
    id,
    purpose,
    expectedReason,
    expectedPath,
  })),
});
