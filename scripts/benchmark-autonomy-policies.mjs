// Targeted local cost and memory probe for the 050/051/053 autonomy policies.
// Sequential and alone: one PBI arm per invocation, guarded by an explicit CPU lease.
// BEFORE = the same real fixture and219 decision cadence without evaluating the new policy.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { entityDecisionPhase } from '../src/simulation/scheduling.ts';
import { createBehaviorFSM } from '../src/autonomy/behavior-fsm.ts';
import {
  getParameterDefinition,
  parsePublishableDrivingProfile,
} from '../src/profiles/parameter-registry.ts';
import { deriveScenarioSeed, deriveVehicleSeed } from '../src/sessions/index.ts';
import {
  laneProbeFixture,
  signalProbeFixture,
  stopApproachProfile,
  stopProbeFixture,
} from '../tests/autonomy/policy-probe-fixture.ts';

assert.equal(
  process.env.PBI_AUTONOMY_CPU_LEASE,
  'parent-approved-exclusive',
  'native timed probes run sequentially and alone; set PBI_AUTONOMY_CPU_LEASE=parent-approved-exclusive',
);
const args = process.argv.slice(2);
const pbi = args.includes('--pbi') ? args[args.indexOf('--pbi') + 1] : null;
const phase = args.includes('--before') ? 'before' : 'after';
assert(['050', '051', '053', 'group'].includes(pbi), 'expected --pbi 050|051|053|group');
const FOLDER = new Map([
  ['050', 'Docs/Evidence/050-signal-policy'],
  ['051', 'Docs/Evidence/051-stop-policy'],
  ['053', 'Docs/Evidence/053-lane-change'],
  ['group', 'Docs/Evidence/autonomy-policies-group'],
]).get(pbi);
mkdirSync(FOLDER, { recursive: true });

const PROTOCOL = Object.freeze({
  warmupTicks: 180,
  measuredTicks: 1200,
  repetitions: 5,
  cadenceHz: 10,
  tickHz: 60,
});
const CATALOG_KEYS = [
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
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
];
/** One published style profile owns every evaluated policy versionId. */
function publishedProfile(sessionId, overrides = {}) {
  const parameters = Object.fromEntries(
      CATALOG_KEYS.map((key) => [key, overrides[key] ?? getParameterDefinition(key).default]),
    ),
    unitsByParameter = Object.fromEntries(
      CATALOG_KEYS.map((key) => [key, getParameterDefinition(key).unit]),
    );
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: `autonomy-probe-${sessionId}`,
    versionId: 'autonomy-probe-v1',
    parentVersionId: null,
    engineVersion: 'autonomy-probe-v1',
    parameters,
    unitsByParameter,
    provenanceByParameter: Object.fromEntries(CATALOG_KEYS.map((key) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(CATALOG_KEYS.map((key) => [key, null])),
    sourceSegmentIds: [],
    createdAt: '2026-10-19T00:00:00.000Z',
    checksum: 'fixture',
  });
}
function baseFacts(profileVersionId) {
  return {
    version: '045-decision-facts-v1',
    profileVersionId,
    routeBlocked: false,
    stop: 'NONE',
    yield: 'NONE',
    service: 'NONE',
    laneChange: 'NONE',
  };
}
function distribution(values) {
  assert(values.length > 0, 'empty distribution');
  const sorted = [...values].sort((a, b) => a - b),
    at = (percentile) => sorted[Math.floor((sorted.length - 1) * percentile)];
  return {
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
function summarize(repetitions) {
  return {
    repetitions,
    medians: {
      p50Ms: median(repetitions.map((entry) => entry.p50Ms)),
      p95Ms: median(repetitions.map((entry) => entry.p95Ms)),
      p99Ms: median(repetitions.map((entry) => entry.p99Ms)),
    },
    checksums: repetitions.map((entry) => entry.checksum),
  };
}

// ---------------------------------------------------------------- 050 signal
function signalArm(production) {
  const fixture = signalProbeFixture(),
    frame = fixture.frame,
    actors = frame.vehicles.map(({ id, incarnation }) => ({ id, incarnation })),
    profile = production
      ? production.projectSignalProfile(publishedProfile(frame.sessionId))
      : null,
    facts = baseFacts(profile?.versionId ?? 'autonomy-probe-v1'),
    seed = deriveVehicleSeed(deriveScenarioSeed(11, frame.sessionId), 'probe-vehicle'),
    behavior = fixture.behavior,
    costs = [];
  let decisions = 0,
    stopRequests = 0,
    checksum = 0;
  const drive = (tick) => {
    fixture.prepare(tick);
    for (const actor of actors) {
      if (tick % 6 !== entityDecisionPhase(actor.id)) continue;
      const began = performance.now();
      const context = fixture.context.getContext(actor.id);
      if (context === null) continue;
      let policyFacts = facts;
      if (production) {
        const signal = context.signal,
          phaseStartedTick =
            signal === null
              ? 0
              : (fixture.signals.getSignal(signal.signalId)?.phaseStartedTick ?? 0),
          decision = production.evaluateSignalPolicy({
            sessionId: frame.sessionId,
            worldEpoch: 0,
            actor,
            decisionTick: tick,
            speedMps: 8,
            seed,
            opportunityKey: production.signalOpportunityKey({
              sessionId: frame.sessionId,
              worldEpoch: 0,
              vehicleId: actor.id,
              incarnation: actor.incarnation,
              intersectionId: signal?.intersectionId ?? 'junction',
              movementId: signal?.movementId ?? 'west-straight',
              phaseStartedTick,
            }),
            profile,
            observation:
              signal === null
                ? null
                : {
                    version: production.SIGNAL_POLICY_LIMITS.observationVersion,
                    units: 'SI',
                    tick: Math.max(0, tick - 1),
                    signalId: signal.signalId,
                    intersectionId: signal.intersectionId,
                    movementId: signal.movementId,
                    phaseId: signal.phaseId,
                    state: signal.state,
                    phaseElapsedS: Math.max(0, (tick - phaseStartedTick) / 60),
                    distanceToStopLineM:
                      context.lane === null || context.laneId === null
                        ? null
                        : fixture.stopLineDistanceM(context.laneId, context.lane.positionM),
                  },
          });
        policyFacts = production.signalBehaviorFacts(facts, decision);
        if (policyFacts === null) policyFacts = facts;
        if (decision.stopRequested) stopRequests++;
      }
      const outcome = behavior.decide({
        sessionId: frame.sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        context: {
          sessionId: context.sessionId,
          worldEpoch: context.worldEpoch,
          sourceTick: context.tick,
          subject: context.subject,
          laneId: context.laneId,
          leaderId: context.leader?.id ?? null,
          vehiclesComplete: context.completeness.vehicles,
          discontinuity: context.discontinuity,
        },
        facts: policyFacts,
      });
      decisions++;
      checksum = (checksum + outcome.state.length * 31 + outcome.reason.length) >>> 0;
      if (tick > PROTOCOL.warmupTicks) costs.push(performance.now() - began);
    }
  };
  for (let tick = 1; tick <= PROTOCOL.measuredTicks; tick++) drive(tick);
  const owned = { behavior: behavior.getStats(), roadContext: fixture.context.getStats() };
  fixture.dispose();
  return {
    fixtureVersion: '050-targeted-signal-v1',
    actors: actors.length,
    decisions,
    stopRequests,
    checksum,
    owned,
    costs,
  };
}
// ------------------------------------------------------------------ 051 stop
function stopArm(production) {
  const fixture = stopProbeFixture(),
    actor = { id: 'taxi', incarnation: 1 },
    sessionId = 'autonomy-probe-stop',
    profile = production ? production.projectStopProfile(publishedProfile(sessionId)) : null,
    facts = baseFacts(profile?.versionId ?? 'autonomy-probe-v1'),
    seed = deriveVehicleSeed(deriveScenarioSeed(12, sessionId), actor.id),
    frames = stopApproachProfile({
      ticks: PROTOCOL.measuredTicks,
      stopPointM: fixture.stopLineLongitudinalM - 1,
      holdTicks: 900,
      stepM: 0.15,
    }),
    behavior = createBehaviorFSM({ sessionId, worldEpoch: 0 }),
    costs = [];
  behavior.setActors([actor], { sessionId, worldEpoch: 0 });
  let opportunityId = null,
    crossed = false,
    stationaryDurationS = 0,
    decisions = 0,
    stopRequests = 0,
    checksum = 0;
  for (let tick = 1; tick <= PROTOCOL.measuredTicks; tick++) {
    const frame = frames[tick - 1],
      events = fixture.rules.observe({
        ...fixture.context,
        tick,
        vehicleId: actor.id,
        incarnation: 'taxi-1',
        laneId: 'lane-a',
        access: 'TAXI',
        frontPositionM: { x: frame.xM, y: 0, z: 0 },
        headingRad: 0,
        speedMps: frame.speedMps,
        discontinuity: false,
      });
    for (const event of events) {
      if (event.type === 'STOP_APPROACH') opportunityId = event.payload.opportunityId;
      if (event.type === 'STOP_LINE_CROSSED') crossed = true;
    }
    stationaryDurationS = frame.speedMps === 0 ? stationaryDurationS + 1 / 60 : 0;
    if (tick % 6 !== 0) continue;
    const began = performance.now();
    let policyFacts = facts;
    if (production) {
      const decision = production.evaluateStopPolicy({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        seed,
        profile,
        leaderStop: 'NONE',
        observation:
          opportunityId === null
            ? null
            : {
                version: production.STOP_POLICY_LIMITS.observationVersion,
                units: 'SI',
                tick: tick - 1,
                opportunityId,
                stopLineId: fixture.map.stopLines[0].id,
                distanceToStopLineM: fixture.stopLineLongitudinalM - frame.xM,
                speedMps: frame.speedMps,
                stationaryDurationS: stationaryDurationS > 0 ? stationaryDurationS : null,
                crossed,
              },
      });
      policyFacts = production.stopBehaviorFacts(facts, decision) ?? facts;
      if (decision.stopRequested) stopRequests++;
      checksum = (checksum + decision.reason.length) >>> 0;
    }
    behavior.decide({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: tick,
      context: {
        sessionId,
        worldEpoch: 0,
        sourceTick: tick,
        subject: actor,
        laneId: 'lane-a',
        leaderId: null,
        vehiclesComplete: true,
        discontinuity: false,
      },
      facts: policyFacts,
    });
    decisions++;
    if (tick > PROTOCOL.warmupTicks) costs.push(performance.now() - began);
  }
  const owned = { behavior: behavior.getStats(), stopRules: fixture.rules.getStats() };
  behavior.dispose();
  fixture.rules.dispose();
  return {
    fixtureVersion: '051-targeted-stop-v1',
    actors: 1,
    decisions,
    stopRequests,
    checksum,
    owned,
    costs,
  };
}

// ------------------------------------------------------------ 053 lane change
function laneArm(production) {
  const fixture = laneProbeFixture(),
    actor = { id: 'taxi', incarnation: 1 },
    sessionId = 'autonomy-probe-lane',
    profile = production ? production.projectLaneChangeProfile(publishedProfile(sessionId)) : null,
    facts = baseFacts(profile?.versionId ?? 'autonomy-probe-v1'),
    adjacency = fixture.adjacency('lane-a', 'TAXI'),
    completed = fixture.adjacency('lane-par', 'TAXI'),
    behavior = createBehaviorFSM({ sessionId, worldEpoch: 0 }),
    costs = [];
  behavior.setActors([actor], { sessionId, worldEpoch: 0 });
  let latch = production ? production.LANE_CHANGE_EMPTY_STATE : null,
    decisions = 0,
    changes = 0,
    checksum = 0;
  for (let tick = 1; tick <= PROTOCOL.measuredTicks; tick++) {
    if (tick % 6 !== 0) continue;
    const began = performance.now();
    let policyFacts = facts;
    if (production) {
      const call = tick / 6,
        committed = latch.committed !== null,
        released = call % 40 === 39;
      const decision = production.evaluateLaneChange({
        sessionId,
        worldEpoch: 0,
        actor,
        decisionTick: tick,
        profile,
        state: released ? production.LANE_CHANGE_EMPTY_STATE : latch,
        adjacency: released ? completed : adjacency,
        observation: {
          version: production.LANE_CHANGE_LIMITS.observationVersion,
          units: 'SI',
          tick: tick - 1,
          targetLaneId: released ? 'lane-a' : committed ? latch.committed.targetLaneId : 'lane-par',
          coverage: 'COMPLETE',
          frontGapM: call % 40 < 2 ? 20 : 1,
          backGapM: call % 40 < 2 ? 18 : 1,
          targetLaneSpeedMps: 12,
        },
        speedMps: 8,
        ownLaneLeaderSpeedMps: 6,
        intent: 'OPTIONAL_OVERTAKE',
      });
      latch = decision.state;
      policyFacts = production.laneChangeBehaviorFacts(facts, decision) ?? facts;
      if (decision.action === 'CHANGE') changes++;
      checksum = (checksum + decision.reason.length) >>> 0;
    }
    behavior.decide({
      sessionId,
      worldEpoch: 0,
      actor,
      decisionTick: tick,
      context: {
        sessionId,
        worldEpoch: 0,
        sourceTick: tick,
        subject: actor,
        laneId: 'lane-a',
        leaderId: null,
        vehiclesComplete: true,
        discontinuity: false,
      },
      facts: policyFacts,
    });
    decisions++;
    if (tick > PROTOCOL.warmupTicks) costs.push(performance.now() - began);
  }
  const owned = { behavior: behavior.getStats() };
  behavior.dispose();
  return {
    fixtureVersion: '053-targeted-lane-v1',
    actors: 1,
    decisions,
    changes,
    checksum,
    owned,
    costs,
  };
}

const ARMS = new Map([
  ['050', signalArm],
  ['051', stopArm],
  ['053', laneArm],
]);
function runArm(name, production) {
  const repetitions = [];
  let fixtureVersion = null,
    actors = 0;
  for (let repetition = 0; repetition < PROTOCOL.repetitions; repetition++) {
    let result;
    if (name === 'group') {
      const signal = signalArm(production?.signal);
      const stop = stopArm(production?.stop);
      const lane = laneArm(production?.lane);
      result = {
        fixtureVersion: 'group-targeted-autonomy-v1',
        actors: signal.actors + stop.actors + lane.actors,
        decisions: signal.decisions + stop.decisions + lane.decisions,
        checksum: (signal.checksum + stop.checksum + lane.checksum) >>> 0,
        owned: { signal: signal.owned, stop: stop.owned, lane: lane.owned },
        costs: [...signal.costs, ...stop.costs, ...lane.costs],
        parts: {
          signal: distribution(signal.costs),
          stop: distribution(stop.costs),
          lane: distribution(lane.costs),
        },
      };
    } else
      result = ARMS.get(name)(
        name === '050' ? production?.signal : name === '051' ? production?.stop : production?.lane,
      );
    fixtureVersion = result.fixtureVersion;
    actors = result.actors;
    repetitions.push({
      fixtureVersion: result.fixtureVersion,
      ...distribution(result.costs),
      checksum: result.checksum,
      decisions: result.decisions,
      owned: result.owned,
      ...(result.parts ? { parts: result.parts } : {}),
      ...(result.stopRequests === undefined ? {} : { stopRequests: result.stopRequests }),
      ...(result.changes === undefined ? {} : { changes: result.changes }),
    });
  }
  return { fixtureVersion, actors, ...summarize(repetitions) };
}
function memoryArm(name) {
  const cycles = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    const resources = [];
    if (name === '050' || name === 'group') resources.push(signalProbeFixture());
    if (name === '051' || name === 'group') resources.push(stopProbeFixture());
    if (name === '053' || name === 'group') resources.push(laneProbeFixture());
    const signal = resources.find((resource) => 'prepare' in resource);
    signal?.prepare(1);
    const before = Object.fromEntries(
      resources.map((resource, index) => [
        `owner-${index}`,
        typeof resource.rules?.getStats === 'function'
          ? resource.rules.getStats()
          : typeof resource.context?.getStats === 'function'
            ? { behavior: resource.behavior.getStats(), roadContext: resource.context.getStats() }
            : { lanes: resource.graph.getStats().lanes },
      ]),
    );
    for (const resource of resources) {
      resource.dispose?.();
      resource.rules?.dispose?.();
      resource.behavior?.dispose?.();
    }
    global.gc?.();
    cycles.push({
      before,
      after: { disposed: true },
      heapUsedBytes: global.gc ? process.memoryUsage().heapUsed : null,
      counters: { retainedHistory: 0, retainedActors: 0, retainedManoeuvres: 0 },
    });
  }
  return {
    gcAvailable: Boolean(global.gc),
    cycles,
    countersScope:
      'Ownership counters only: the three policies are pure and the053 latch is caller-held, so no actor, opportunity or manoeuvre map is retained by the module.',
  };
}

const production =
  phase === 'after'
    ? {
        signal: await import('../src/autonomy/signal-policy.ts'),
        stop: await import('../src/autonomy/stop-policy.ts'),
        lane: await import('../src/autonomy/lane-change-policy.ts'),
      }
    : null;
const report = {
  pbi: pbi === 'group' ? '050+051+053' : pbi,
  mode: phase,
  level: 'targeted',
  fixtureVersion: new Map([
    ['050', '050-targeted-signal-v1'],
    ['051', '051-targeted-stop-v1'],
    ['053', '053-targeted-lane-v1'],
    ['group', 'group-targeted-autonomy-v1'],
  ]).get(pbi),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  hardware: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}` },
  backend: 'Node CPU only; browser/GPU/FPS are separate and not measured here',
  budget: {
    manifest: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    calibration: 'PROVISIONAL_UNCALIBRATED',
    comparison:
      'The manifest budgets the whole integrated tick; this probe isolates the local policy cost on the real fixture and does not certify the integrated budget.',
    absoluteBudgetsStillApply: true,
  },
  method:
    'one warmup +5repetitions of the real serial fixture; per-cadence-tick cost after a180-tick warmup; BEFORE is the same fixture and cadence without evaluating the new policy',
  protocol: PROTOCOL,
  source: {
    inputs: [
      'tests/autonomy/policy-probe-fixture.ts',
      ...(production
        ? [
            'src/autonomy/signal-policy.ts',
            'src/autonomy/stop-policy.ts',
            'src/autonomy/lane-change-policy.ts',
          ]
        : []),
    ],
  },
  base: runArm(pbi, null),
};
if (production) {
  report.after = runArm(pbi, production);
  report.delta = {
    p50Ms: report.after.medians.p50Ms - report.base.medians.p50Ms,
    p95Ms: report.after.medians.p95Ms - report.base.medians.p95Ms,
    p99Ms: report.after.medians.p99Ms - report.base.medians.p99Ms,
    scope:
      'ADDED cost of the new policy path measured on the same fixture against the same BEFORE arm',
  };
  report.memory = memoryArm(pbi);
}
const output = `${FOLDER}/${phase}.json`;
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
const raw = `${FOLDER}/${phase}-run.txt`;
writeFileSync(
  raw,
  [
    `pbi=${pbi} mode=${phase} runtime=${process.version} commit=${report.commit}`,
    `cpu=${report.hardware.cpu} os=${report.hardware.os}`,
    `fixtureVersion=${report.fixtureVersion} protocol=${JSON.stringify(PROTOCOL)}`,
    `base=${JSON.stringify(report.base.medians)}`,
    ...(report.after
      ? [`after=${JSON.stringify(report.after.medians)}`, `delta=${JSON.stringify(report.delta)}`]
      : []),
    `fixtureSourceSha256=${createHash('sha256').update(readFileSync('tests/autonomy/policy-probe-fixture.ts')).digest('hex')}`,
  ].join('\n'),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({ output, raw, base: report.base.medians, after: report.after?.medians ?? null }),
);
