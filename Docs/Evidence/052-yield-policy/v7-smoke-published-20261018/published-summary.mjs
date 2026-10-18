import { readFileSync } from 'node:fs';
const dir = process.argv[2];
const report = JSON.parse(readFileSync(dir + '/report.json', 'utf8'));
const terminal = JSON.parse(readFileSync(dir + '/terminal.json', 'utf8'));
const start = JSON.parse(readFileSync(dir + '/started.json', 'utf8'));
console.log('backend       ', start.backend, '| full', start.full, '| sourceHash', start.sourceHash.slice(0, 16));
console.log('terminal      ', terminal.status, '| arms', terminal.arms, '| captureId', start.captureId);
console.log('renderer      ', report.renderer, '| foreground', report.foreground, '| dpr', report.dpr, '| res', JSON.stringify(report.internalResolution));
console.log('cleanup       ', JSON.stringify(report.rendererCleanup), '| owner', JSON.stringify(report.ownerCleanup));
console.log('calibration arms (14 m, 13 s, real Rapier physics in the browser):');
for (const [i, c] of report.calibration.entries()) {
  const d = c.trace?.[0]?.decision;
  console.log(
    '  arm',
    i,
    String(c.classId).padEnd(8),
    'gap=' + String(c.thresholdS).padEnd(4),
    'acceptedTick=' + String(c.acceptedTick).padEnd(5),
    'firstEntryTick=' + String(c.firstEntryTick).padEnd(5),
    'clearTick=' + String(c.clearTick).padEnd(5),
    'collisionTick=' + String(c.collisionTick).padEnd(5),
    'maxImpulseNs=' + (c.maxImpulseNs != null ? Number(c.maxImpulseNs).toFixed(2) : '-').padEnd(9),
    'decision=' + (d ? d.action + '/' + d.reason + ' minGap=' + d.minimumGapS?.toFixed(3) : '-'),
  );
}
console.log('measured arms (1 s warm + 3 s, 70 cars):');
for (const [i, r] of report.runs.entries()) {
  console.log(
    '  run',
    i,
    'pair=' + r.pair,
    'current=' + r.current,
    'native=' + r.dualClock.nativePhaseRatio.toFixed(5),
    'raf=' + r.dualClock.matchedRafRatio.toFixed(5),
    'simWall=' + r.simulationToActiveWallTime.toFixed(5),
    'overload=' + r.overloadCount,
    'finalBodies=' + r.finalBodies.length,
  );
}
