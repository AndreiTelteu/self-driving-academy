import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateSpeedParameters } from '../../src/learning/speed-estimator';
import { parameterEvidenceSpecs } from '../../src/learning/parameter-evidence';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import type { EligibilityWindowRecord } from '../../src/telemetry';

function ready(key: ParameterEvidenceReadModel['key']): ParameterEvidenceReadModel {
  return Object.freeze({
    key,
    status: 'READY',
    distinctEpisodes: 3,
    contextBreakdown: Object.freeze([
      { label: 'FREE_TRAFFIC', roadType: 'urban', speedBand: 'MID', episodes: 3 },
    ]),
    sampleCount: 1800,
    quality: 1,
    uncertainty: 'MODERATE',
    unchanged: true,
    noEstimate: 'ESTIMATOR_NOT_IMPLEMENTED',
  });
}
function eligibility(label: string = 'FREE_TRAFFIC', id: string = 'o'): EligibilityWindowRecord {
  return {
    windowId: `window-${id}`,
    opportunityId: id,
    kind: 'STOP',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: 'v',
    incarnation: 'i',
    segmentId: 's',
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 1,
    lastTick: 600,
    observationCount: 600,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: label === 'FREE_TRAFFIC' ? 'ELIGIBLE' : 'EXTERNAL_CONSTRAINT',
    label,
  } as EligibilityWindowRecord;
}
function artifacts(windowId: string) {
  return {
    windowId,
    sessionId: 'session',
    worldEpoch: 1,
    segmentId: 's',
    vehicleId: 'v',
    incarnation: 'i',
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 1,
    endTick: 600,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 1,
    lastTick: 600,
    observationCount: 600,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick: 1, toTick: 600, ticks: 600 },
  } as const;
}
const reads = parameterEvidenceSpecs
  .filter((x) => x.estimatorOwner === '094')
  .map((x) => ready(x.key));

test('094 distinct demonstration speeds produce distinct candidates; constraints cannot become preference', () => {
  const make = (speed: number) =>
    estimateSpeedParameters(
      reads,
      Array.from({ length: 3 }, (_, i) => ({
        eligibility: eligibility('FREE_TRAFFIC', `o${i}`),
        roadKind: 'URBAN' as const,
        postedLimitMps: 15,
        artifacts: artifacts(`window-o${i}`),
        speedSamples: [
          { tick: 100, speedMps: speed },
          { tick: 700, speedMps: 1000 },
        ],
        intersectionApproach: false,
        curveRadiusM: null,
        normalized: null,
      })),
    );
  const prudent = make(14),
    risky = make(20);
  assert.equal(prudent.candidates.speed_delta_urban.value, -1);
  assert.equal(risky.candidates.speed_delta_urban.value, 5);
  const heldOutTarget = (candidate: number) => Math.min(15 + candidate, 30);
  assert.equal(
    heldOutTarget(risky.candidates.speed_delta_urban.value!) -
      heldOutTarget(prudent.candidates.speed_delta_urban.value!),
    6,
  );
  const constrained = estimateSpeedParameters(reads, [
    {
      eligibility: eligibility('LEADER'),
      artifacts: artifacts('window-o'),
      roadKind: 'URBAN',
      postedLimitMps: 15,
      speedSamples: [{ tick: 1, speedMps: 28 }],
      intersectionApproach: false,
      curveRadiusM: null,
      normalized: null,
    },
  ]);
  assert.equal(constrained.candidates.speed_delta_urban.value, null);
  assert.equal(constrained.candidates.speed_delta_urban.reason, 'NO_MATCHING_OBSERVATIONS');
  const suppressedArtifacts = {
    ...artifacts('window-o'),
    windowClass: 'FULLY_SUPPRESSED',
    prefix: null,
  } as const;
  const suppressed = estimateSpeedParameters(reads, [
    {
      eligibility: eligibility(),
      artifacts: suppressedArtifacts as never,
      roadKind: 'URBAN',
      postedLimitMps: 15,
      speedSamples: [{ tick: 1, speedMps: 28 }],
      intersectionApproach: false,
      curveRadiusM: null,
      normalized: null,
    },
  ]);
  assert.equal(suppressed.candidates.speed_delta_urban.value, null);
});

test('094 refuses evidence keys outside the 093 24-spec vocabulary', () => {
  assert.throws(
    () => estimateSpeedParameters([{ ...ready('speed_delta_urban'), key: 'unknown' } as never], []),
    /Unknown evidence key/,
  );
});
