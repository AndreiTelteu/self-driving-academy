import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAmbientTraffic } from '../src/app/ambient-traffic.ts';
import { createCompositionWorld } from '../src/app/composition-world.ts';

/**
 * PBI283 deterministic live-traffic report and cost/deadlock probe.
 *
 * The report is produced by the real 262 ambient fleet over the real 032/033 city map: one 036
 * controller, the 037 STOP producer, 038/052 priority/yield, 053 lane changes and 054 recovery.
 * It never asserts a PASS the run did not produce; every counter is read from the live rules.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '283-live-traffic'),
  reportJson = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md'),
  seed = 283,
  context = Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'evidence-283-live-traffic',
    worldEpoch: 1,
  }),
  world = createCompositionWorld();

function createFleet(counts = {}) {
  return createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context,
    seed,
    liveRules: true,
    ...counts,
    focus: { x: world.spawn.x, z: world.spawn.z },
  });
}

function summary(report) {
  return {
    signals: report.signals,
    stop: report.stop,
    yield: report.yield,
    laneChange: report.laneChange,
    blocked: report.blocked,
    violations: report.violations,
  };
}

function run(ticks, counts = {}) {
  const ambient = createFleet(counts),
    started = performance.now(),
    actors = ambient.list().map((actor) => actor.vehicleId),
    lastMove = new Map(actors.map((vehicleId) => [vehicleId, 0])),
    previous = new Map(actors.map((vehicleId) => [vehicleId, 0])),
    maxStationary = new Map(actors.map((vehicleId) => [vehicleId, 0]));
  try {
    for (let tick = 1; tick <= ticks; tick += 1) {
      ambient.traffic.step({ tick, dtSeconds: 1 / 60 });
      for (const actor of ambient.list()) {
        const before = previous.get(actor.vehicleId) ?? 0,
          moved = Math.abs(actor.distanceAlongRouteM - before) > 1e-6;
        if (moved) {
          lastMove.set(actor.vehicleId, tick);
          maxStationary.set(actor.vehicleId, 0);
        } else maxStationary.set(actor.vehicleId, (maxStationary.get(actor.vehicleId) ?? 0) + 1);
        previous.set(actor.vehicleId, actor.distanceAlongRouteM);
      }
    }
    const report = ambient.trafficRules(),
      wallMs = performance.now() - started,
      stalled60 = actors.filter((vehicleId) => ticks - (lastMove.get(vehicleId) ?? 0) >= 3600),
      deadlockWindow = ticks,
      deadlockStalls = actors.filter(
        (vehicleId) => ticks - (lastMove.get(vehicleId) ?? 0) >= deadlockWindow,
      ),
      maxStationaryTicks = Math.max(0, ...maxStationary.values()),
      blockedActors = ambient.list().filter((actor) => actor.blocked).length;
    return Object.freeze({
      ticks,
      wallMs,
      report,
      summary: summary(report),
      stalled60,
      deadlockStalls,
      maxStationaryTicks,
      blockedActors,
    });
  } finally {
    ambient.dispose();
  }
}

const shortA = run(1200),
  shortB = run(1200),
  flow = run(18000, { taxiCount: 20, civilianCount: 20 }),
  stress = run(36000),
  shortReportsEqual = JSON.stringify(shortA.summary) === JSON.stringify(shortB.summary),
  deterministic = shortReportsEqual;
const result = Object.freeze({
  version: '283-live-traffic-report-v1',
  generatedAt: new Date().toISOString(),
  seed,
  mapId: world.mapId,
  tests: Object.freeze({
    deterministicShortRun: deterministic,
    shortTicks: 1200,
    shortReportsEqual,
  }),
  flow: Object.freeze({
    actors: flow.report.actors,
    ticks: flow.ticks,
    simulatedSeconds: flow.ticks / 60,
    wallMs: flow.wallMs,
    cost: flow.report.cost,
    wallPerTickMs: flow.wallMs / flow.ticks,
    signals: flow.report.signals,
    stop: flow.report.stop,
    yield: flow.report.yield,
    laneChange: flow.report.laneChange,
    blocked: flow.report.blocked,
    violations: flow.report.violations,
    stalledOver60s: flow.stalled60.length,
    stalledVehicleIds: Object.freeze(flow.stalled60),
    deadlockStalls: flow.deadlockStalls.length,
    maxStationarySeconds: flow.maxStationaryTicks / 60,
    blockedActors: flow.blockedActors,
  }),
  stress: Object.freeze({
    actors: stress.report.actors,
    ticks: stress.ticks,
    simulatedSeconds: stress.ticks / 60,
    wallMs: stress.wallMs,
    cost: stress.report.cost,
    wallPerTickMs: stress.wallMs / stress.ticks,
    signals: stress.report.signals,
    stop: stress.report.stop,
    yield: stress.report.yield,
    laneChange: stress.report.laneChange,
    blocked: stress.report.blocked,
    violations: stress.report.violations,
    stalledOver60s: stress.stalled60.length,
    stalledVehicleIds: Object.freeze(stress.stalled60),
    deadlockStalls: stress.deadlockStalls.length,
    maxStationarySeconds: stress.maxStationaryTicks / 60,
    blockedActors: stress.blockedActors,
  }),
  limitations: Object.freeze([
    'The authored neighbourhood signal plan has 33-59 phases per junction; the 56-actor stress run can queue for minutes.',
    'The 40-actor flow run is the fluidity probe; the 56-actor run is a stress probe and reports its own stalls.',
    'This is a software CPU probe, not FPS/GPU/hardware acceptance.',
    'The browser red/STOP consequence is a separate Chromium fixture (npm run traffic:live:probe).',
  ]),
});
await mkdir(directory, { recursive: true });
await writeFile(reportJson, `${JSON.stringify(result, null, 2)}\n`);

const f = result.flow,
  s = result.stress,
  lines = [
    '# 283 - live traffic rules report',
    '',
    `Deterministic report generated by \`npm run traffic:live\` on ${result.generatedAt}.`,
    '',
    `Map \`${result.mapId}\`, seed ${seed}. Flow probe: ${f.actors} actors, ${f.simulatedSeconds}s simulated (${f.ticks} ticks). Stress probe: ${s.actors} actors, ${s.simulatedSeconds}s.`,
    '',
    '| Probe | Flow (40) | Stress (56) |',
    '| --- | --- | --- |',
    `| deterministic short run (1200 ticks) | ${result.tests.shortReportsEqual ? 'identical' : 'DIFFERS'} | - |`,
    `| signal phase changes | ${f.signals.phaseChanges} | ${s.signals.phaseChanges} |`,
    `| red stop episodes | ${f.signals.redStops} | ${s.signals.redStops} |`,
    `| red holds | ${f.signals.redHolds} | ${s.signals.redHolds} |`,
    `| green start delays | ${f.signals.greenStartDelays} | ${s.signals.greenStartDelays} |`,
    `| red crossings by profile | ${f.signals.redProceedByProfile} | ${s.signals.redProceedByProfile} |`,
    `| STOP approaches | ${f.stop.approaches} | ${s.stop.approaches} |`,
    `| STOP full stops | ${f.stop.fullStops} | ${s.stop.fullStops} |`,
    `| STOP rolling stops | ${f.stop.rollingStops} | ${s.stop.rollingStops} |`,
    `| STOP line crossings | ${f.stop.lineCrossings} | ${s.stop.lineCrossings} |`,
    `| traffic-caused stops | ${f.stop.trafficCausedStops} | ${s.stop.trafficCausedStops} |`,
    `| yield checks / holds / accepted | ${f.yield.checks} / ${f.yield.holds} / ${f.yield.accepted} | ${s.yield.checks} / ${s.yield.holds} / ${s.yield.accepted} |`,
    `| yield unknown / deadlock breaks | ${f.yield.unknown} / ${f.yield.deadlockBreaks} | ${s.yield.unknown} / ${s.yield.deadlockBreaks} |`,
    `| lane-change attempts / validated / applied | ${f.laneChange.attempts} / ${f.laneChange.validated} / ${f.laneChange.applied} | ${s.laneChange.attempts} / ${s.laneChange.validated} / ${s.laneChange.applied} |`,
    `| blocked episodes / reroute requests | ${f.blocked.episodes} / ${f.blocked.rerouteRequests} | ${s.blocked.episodes} / ${s.blocked.rerouteRequests} |`,
    `| stalled 45s recoveries | ${f.blocked.stalledRecoveries} | ${s.blocked.stalledRecoveries} |`,
    `| player violations (red / STOP) | ${f.violations.redLight} / ${f.violations.stopLine} | ${s.violations.redLight} / ${s.violations.stopLine} |`,
    `| actors stalled over 60s at end | ${f.stalledOver60s} | ${s.stalledOver60s} |`,
    `| actors with no move for the whole run (deadlock) | ${f.deadlockStalls} | ${s.deadlockStalls} |`,
    `| max stationary | ${f.maxStationarySeconds.toFixed(1)} s | ${s.maxStationarySeconds.toFixed(1)} s |`,
    `| rules cost p50 / p95 / max | ${f.cost.p50Ms.toFixed(4)} / ${f.cost.p95Ms.toFixed(4)} / ${f.cost.maxMs.toFixed(4)} ms/tick | ${s.cost.p50Ms.toFixed(4)} / ${s.cost.p95Ms.toFixed(4)} / ${s.cost.maxMs.toFixed(4)} ms/tick |`,
    `| measured wall cost per tick | ${f.wallPerTickMs.toFixed(4)} ms/tick | ${s.wallPerTickMs.toFixed(4)} ms/tick |`,
    '',
    'Flow status is read from the real rules report; a non-zero `actors stalled over 60s` is a real',
    'partial result and is not hidden by the probe. The deterministic short run compares the whole',
    'signal/STOP/yield/lane-change/blocked/violation summary, not a transcript.',
    '',
    '## Limitations',
    '',
    ...result.limitations.map((line) => `- ${line}`),
    '',
  ];
await writeFile(reportMarkdown, lines.join('\n'));
console.log(`Wrote ${reportJson}`);
console.log(`Wrote ${reportMarkdown}`);
console.log(
  `traffic flow(40): redStops=${f.signals.redStops} fullStops=${f.stop.fullStops} crossings=${f.stop.lineCrossings} ` +
    `yield=${f.yield.holds}/${f.yield.accepted} laneChanges=${f.laneChange.validated} ` +
    `stalled60=${f.stalledOver60s} p95=${f.cost.p95Ms.toFixed(3)}ms`,
);
console.log(
  `traffic stress(56): redStops=${s.signals.redStops} fullStops=${s.stop.fullStops} crossings=${s.stop.lineCrossings} ` +
    `yield=${s.yield.holds}/${s.yield.accepted} laneChanges=${s.laneChange.validated} ` +
    `stalled60=${s.stalledOver60s} p95=${s.cost.p95Ms.toFixed(3)}ms`,
);
