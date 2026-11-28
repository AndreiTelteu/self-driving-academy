import { sha256Hex } from '../../../src/persistence/canonical-json';
import { verifyProfileVersionChecksum } from '../../../src/profiles';
import type { ProfileVersion } from '../../../src/profiles';
import type { LiveTelemetrySegmentRead } from '../../../src/telemetry';
import { LIVE_FIXTURE_LANE, createLiveLearningFixture } from '../../harness/live-learning-fixture';
import type { LiveLearningFixture } from '../../harness/live-learning-fixture';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PROFILE_ID,
} from '../../harness/profile-pipeline-fixture';

/**
 * PBI 273 deterministic browser fixture.
 *
 * The page runs the real 272 telemetry writer, the real 103/221 queue harness (only the
 * `worker_threads` transport is replaced by the harness microtask), the real 109 store, the real 110
 * activation and the real 205 barrier over the real 032/033 map. The segment is driven on the
 * fixture lane with the same deterministic speed profile the Node report uses, so the 087 window is
 * genuinely ELIGIBLE and the whole pipeline publishes instead of waiting for a lucky live window.
 *
 * The page never reimplements an estimator, a store or a pipeline: it only calls the real modules
 * and reads their immutable results. The live-game probe remains a separate, documented limitation.
 */
export const FIXTURE_VERSION = '273-live-learning-browser-v1' as const;
const SEGMENT_ID = 'browser-composed';
const SEGMENT_TICKS = 1080;

type Scalar = string | number | boolean | null;
type Phase = 'BOOT' | 'READY' | 'SEGMENT_CLOSED' | 'ACTIVATING' | 'PASS' | 'FAIL';

interface ProbeCheck {
  readonly name: string;
  readonly expected: Scalar;
  readonly actual: Scalar;
  readonly pass: boolean;
  readonly detail: string;
}

interface TrajectoryPoint {
  readonly tick: number;
  readonly x: number;
  readonly z: number;
  readonly speedMps: number;
}

interface FleetRow {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly version: string;
}

interface FleetFacts {
  readonly total: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly versions: readonly string[];
  readonly allOnVersion: boolean;
  readonly rows: readonly FleetRow[];
}

interface ProbeState {
  readonly fixtureVersion: typeof FIXTURE_VERSION;
  status: 'RUNNING' | 'PASS' | 'FAIL';
  phase: Phase;
  detail: string;
  error: string | null;
  contract: string | null;
  segmentId: string | null;
  tick: number;
  segment: Readonly<{
    startTick: number;
    endTick: number | null;
    samples: number;
    opportunities: number;
    eligibleWindows: number;
    artifacts: number;
  }> | null;
  window: Readonly<{
    windowId: string;
    opportunityId: string;
    kind: string;
    label: string;
    openedTick: number;
    lastTick: number;
    observations: number;
  }> | null;
  stats: Readonly<Record<string, Scalar>> | null;
  publishedVersion: Readonly<{
    versionId: string;
    parentVersionId: string | null;
    checksum: string;
    depth: number;
    changedKey: string | null;
    baseValue: number | null;
    composedValue: number | null;
  }> | null;
  activation: Readonly<{
    status: string | null;
    activateAtTick: number | null;
    appliedAtTick: number | null;
    published: number;
    applied: number;
  }> | null;
  profile: Readonly<{
    versionId: string;
    fingerprintBefore: string;
    fingerprintAfter: string;
    changed: boolean;
    learnedKey: string | null;
    provenance: string | null;
  }> | null;
  xp: Readonly<{
    writer: string;
    fingerprintBefore: string;
    fingerprintAfter: string;
    unchanged: boolean;
  }> | null;
  fleet: Readonly<{
    total: number;
    taxis: number;
    civilians: number;
    versions: readonly string[];
    allOnVersion: boolean;
    rows: readonly FleetRow[];
  }> | null;
  checks: readonly ProbeCheck[];
  trace: readonly string[];
}

function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`Missing PBI 273 fixture element: ${label}`);
  return value;
}

const canvas = required(document.querySelector<HTMLCanvasElement>('#view'), '#view');
const context = required(canvas.getContext('2d'), '2d context');
const phaseNode = required(document.querySelector<HTMLElement>('#phase'), '#phase');
const detailNode = required(document.querySelector<HTMLElement>('#detail'), '#detail');
const factsNode = required(document.querySelector<HTMLElement>('#facts'), '#facts');
const checksNode = required(document.querySelector<HTMLElement>('#checks'), '#checks');
const reportNode = required(document.querySelector<HTMLElement>('#report'), '#report');

const state: ProbeState = {
  fixtureVersion: FIXTURE_VERSION,
  status: 'RUNNING',
  phase: 'BOOT',
  detail: 'Se pregătește fixture-ul determinist.',
  error: null,
  contract: null,
  segmentId: null,
  tick: 0,
  segment: null,
  window: null,
  stats: null,
  publishedVersion: null,
  activation: null,
  profile: null,
  xp: null,
  fleet: null,
  checks: Object.freeze([]),
  trace: Object.freeze([]),
};

const trace: string[] = [];
let fixture: LiveLearningFixture | null = null;
let trajectory: readonly TrajectoryPoint[] = Object.freeze([]);
let windowSpan: { readonly fromTick: number; readonly toTick: number } | null = null;
const viewBounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };

function updateViewBounds(): void {
  if (trajectory.length === 0) return;
  const xs = trajectory.map((point) => point.x);
  const zs = trajectory.map((point) => point.z);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const width = Math.max(140, Math.max(...xs) - Math.min(...xs) + 60);
  const depth = Math.max(70, Math.max(...zs) - Math.min(...zs) + 40);
  const ratio = (canvas.width - 48) / 340;
  const spanX = width / depth < ratio ? depth * ratio : width;
  const spanZ = width / depth < ratio ? depth : width / ratio;
  viewBounds.minX = centerX - spanX / 2;
  viewBounds.maxX = centerX + spanX / 2;
  viewBounds.minZ = centerZ - spanZ / 2;
  viewBounds.maxZ = centerZ + spanZ / 2;
}

const globalScope = globalThis as unknown as { __liveLearningProbe?: ProbeState };
globalScope.__liveLearningProbe = state;

const XP_LEDGER = Object.freeze({
  awards: 0,
  spends: 0,
  level: null,
  writer: 'NOT_MOUNTED_273',
});

function xpFingerprint(): string {
  return sha256Hex(JSON.stringify(XP_LEDGER));
}

function check(name: string, expected: Scalar, actual: Scalar, detail: string): ProbeCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function note(detail: string): void {
  if (trace.length < 60) trace.push(`${state.phase}: ${detail}`);
  state.trace = Object.freeze([...trace]);
}

function setPhase(phase: Phase, detail: string): void {
  state.phase = phase;
  state.detail = detail;
  note(detail);
  render();
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function snapshotFleet(source: LiveLearningFixture): FleetFacts {
  const registry = source.pipelineWorld.registry;
  const rows = registry.list().map((vehicle) => ({
    vehicleId: vehicle.vehicleId,
    driverKind: vehicle.driverKind,
    version: registry.state(vehicle.vehicleId)?.appliedProfileVersion ?? 'MISSING',
  }));
  return Object.freeze({
    total: rows.length,
    taxis: rows.filter((row) => row.driverKind === 'TAXI').length,
    civilians: rows.filter((row) => row.driverKind === 'CIVILIAN').length,
    versions: Object.freeze([...new Set(rows.map((row) => row.version))].sort()),
    allOnVersion: false,
    rows: Object.freeze(rows),
  });
}

function fleetOnVersion(facts: FleetFacts, versionId: string): FleetFacts {
  return Object.freeze({
    ...facts,
    allOnVersion: facts.rows.every((row) => row.version === versionId),
  });
}

function segmentFacts(read: LiveTelemetrySegmentRead) {
  return Object.freeze({
    startTick: read.summary.startTick,
    endTick: read.summary.endTick,
    samples: read.summary.samples,
    opportunities: read.summary.opportunities,
    eligibleWindows: read.summary.eligibleWindows,
    artifacts: read.summary.artifacts,
  });
}

function drive(): LiveTelemetrySegmentRead {
  const source = fixture;
  if (source === null) throw new Error('Fixture is not ready');
  return source.drive({
    segmentId: SEGMENT_ID,
    startDistanceM: 130,
    ticks: SEGMENT_TICKS,
    speed: (tick, total) => (tick < total - 240 ? 9 : 2),
  });
}

function rewriteAttempt(version: ProfileVersion): string {
  const source = fixture;
  const delta = version.provenance.delta;
  if (source === null || delta === null) return 'NO_DELTA';
  const result = source.pipelineWorld.store.derive({
    profileId: PIPELINE_PROFILE_ID,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId ?? PIPELINE_BASE_VERSION,
    segmentId: 'browser-rewrite-attempt',
    reason: 'browser fixture immutability attempt',
    delta: {
      profileVersionId: version.versionId,
      parentVersionId: version.parentVersionId ?? PIPELINE_BASE_VERSION,
      engineVersion: PIPELINE_ENGINE,
      schemaVersion: 1,
      units: 'SI',
      values: delta.changes.map((change) => ({
        key: change.key,
        unit: change.unit,
        value: change.newValue,
      })),
    },
  });
  return result.status === 'REJECTED' ? result.rejection.code : result.status;
}

async function run(): Promise<void> {
  fixture = createLiveLearningFixture();
  const before = fixture.live.read();
  const fleetBefore = snapshotFleet(fixture);
  const xpBefore = xpFingerprint();
  state.contract = before.contract;
  state.tick = before.tick;
  state.stats = Object.freeze({ ...before.stats });
  state.xp = Object.freeze({
    writer: XP_LEDGER.writer,
    fingerprintBefore: xpBefore,
    fingerprintAfter: xpBefore,
    unchanged: true,
  });
  state.fleet = fleetBefore;
  setPhase('READY', 'Fixture creată; rulez segmentul LEARNING determinist.');
  await pause(250);

  const closed = drive();
  state.segmentId = SEGMENT_ID;
  state.segment = segmentFacts(closed);
  const eligible = closed.windows.filter(
    (window) => window.windowClass === 'ELIGIBLE' && window.segmentId === SEGMENT_ID,
  );
  const chosen = [...eligible].sort(
    (left, right) =>
      left.openedTick - right.openedTick || left.windowId.localeCompare(right.windowId),
  )[0];
  state.window =
    chosen === undefined
      ? null
      : Object.freeze({
          windowId: chosen.windowId,
          opportunityId: chosen.opportunityId,
          kind: chosen.kind,
          label: chosen.label,
          openedTick: chosen.openedTick,
          lastTick: chosen.lastTick,
          observations: chosen.observationCount,
        });
  windowSpan =
    chosen === undefined ? null : { fromTick: chosen.openedTick, toTick: chosen.lastTick };
  trajectory = Object.freeze(
    closed.samples.map((sample) => {
      const vehicle = sample.observation.state;
      return {
        tick: sample.observation.tick,
        x: vehicle.transform.positionM.x,
        z: vehicle.transform.positionM.z,
        speedMps: Math.hypot(vehicle.velocityMps.x, vehicle.velocityMps.y, vehicle.velocityMps.z),
      };
    }),
  );
  updateViewBounds();
  setPhase(
    'SEGMENT_CLOSED',
    `Segment închis: ${closed.summary.samples} eșantioane, ${eligible.length} ferestre 087 eligibile.`,
  );
  await pause(700);

  setPhase('ACTIVATING', 'Coada reală 103/221 rulează; aștept 109 și activarea 110.');
  await fixture.settle(60);
  const after = fixture.live.read();
  const version = fixture.pipelineWorld.store.getVersion(after.headVersionId);
  const history = after.history.find((row) => row.segmentId === SEGMENT_ID) ?? null;
  const fleetAfter = fleetOnVersion(snapshotFleet(fixture), after.headVersionId);
  const xpAfter = xpFingerprint();
  const applied = fixture.applied.at(-1) ?? null;

  // Six more real fixed ticks: a second publication would show up here.
  await fixture.advance(6);
  const stable = fixture.live.read();

  if (version === null) throw new Error(`Missing immutable version ${after.headVersionId}`);
  const key = history?.key ?? null;
  const baseParameters = fixture.pipelineWorld.store.getVersion(PIPELINE_BASE_VERSION)!.parameters;
  const appliedProfile = fixture.style.profile;
  const rewrite = rewriteAttempt(version);
  state.tick = stable.tick;
  state.stats = Object.freeze({ ...stable.stats });
  state.publishedVersion = Object.freeze({
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    checksum: version.checksum,
    depth: version.depth,
    changedKey: key,
    baseValue: key === null ? null : (baseParameters[key] ?? null),
    composedValue: key === null ? null : (version.parameters[key] ?? null),
  });
  state.activation = Object.freeze({
    status: history?.activationStatus ?? null,
    activateAtTick: history?.activateAtTick ?? null,
    appliedAtTick: stable.activation.lastAppliedTick,
    published: stable.stats.activationsPublished,
    applied: stable.stats.activationsApplied,
  });
  state.profile = Object.freeze({
    versionId: appliedProfile.versionId,
    fingerprintBefore: before.profile.fingerprint,
    fingerprintAfter: stable.profile.fingerprint,
    changed: before.profile.fingerprint !== stable.profile.fingerprint,
    learnedKey: key,
    provenance: key === null ? null : (appliedProfile.provenanceByParameter[key] ?? null),
  });
  state.xp = Object.freeze({
    writer: XP_LEDGER.writer,
    fingerprintBefore: xpBefore,
    fingerprintAfter: xpAfter,
    unchanged: xpBefore === xpAfter,
  });
  state.fleet = fleetAfter;

  const eligibleCount = state.window === null ? 0 : eligible.length;
  const checks: ProbeCheck[] = [
    check(
      'pipeline-contract',
      '273-live-learning-v1',
      before.contract,
      `live pipeline ${before.version}`,
    ),
    check(
      'segment-closed-eligible',
      true,
      closed.summary.completeness === 'CLOSED' &&
        closed.summary.controlMode === 'LEARNING' &&
        closed.summary.learningEligible === true,
      `${closed.summary.completeness}/${closed.summary.controlMode}/eligible ${closed.summary.learningEligible}`,
    ),
    check(
      'segment-sampled',
      true,
      closed.summary.samples >= SEGMENT_TICKS,
      `${closed.summary.samples} real 085 samples in ticks ${closed.summary.startTick}–${closed.summary.endTick}`,
    ),
    check(
      'eligible-window-087',
      true,
      eligibleCount >= 1,
      state.window === null
        ? 'no ELIGIBLE window on the closed segment'
        : `${state.window.windowId} ${state.window.label} ${state.window.kind} ${state.window.openedTick}–${state.window.lastTick} (${state.window.observations} observations)`,
    ),
    check('job-submitted', 1, stable.stats.jobs, `segment ${SEGMENT_ID}`),
    check(
      'evidence-ready',
      'READY',
      history?.evidenceStatus ?? 'MISSING',
      `key ${key ?? '—'}, ${history?.episodes ?? 0} episodes, candidate ${history?.candidateStatus ?? '—'}`,
    ),
    check(
      'candidate-ready',
      'CANDIDATE',
      history?.candidateStatus ?? 'MISSING',
      `value ${history?.candidateValue ?? '—'} from real 094/098 estimators`,
    ),
    check(
      'immutable-version',
      true,
      stable.stats.versions === 1 &&
        version.versionId === after.headVersionId &&
        version.versionId !== PIPELINE_BASE_VERSION &&
        version.parentVersionId === PIPELINE_BASE_VERSION &&
        version.depth === 1 &&
        verifyProfileVersionChecksum(version) &&
        fixture.pipelineWorld.store.listVersions(PIPELINE_PROFILE_ID).length === 2,
      `${version.versionId} parent ${version.parentVersionId}, checksum ${version.checksum}, store versions ${fixture.pipelineWorld.store.listVersions(PIPELINE_PROFILE_ID).length}`,
    ),
    check(
      'store-refuses-rewrite',
      'VERSION_ID_DUPLICATE',
      rewrite,
      'the same immutable version id cannot be derived a second time',
    ),
    check(
      'common-tick-activation',
      true,
      history?.activationStatus === 'PENDING' &&
        history.activateAtTick !== null &&
        stable.activation.lastAppliedTick === history.activateAtTick &&
        applied?.versionId === version.versionId &&
        applied.tick === history.activateAtTick,
      `PENDING at tick ${history?.activateAtTick ?? '—'}, applied ${stable.activation.lastAppliedTick}, callback ${applied?.tick ?? '—'}`,
    ),
    check(
      'activation-once',
      true,
      stable.stats.activationsPublished === 1 &&
        stable.stats.activationsApplied === 1 &&
        stable.activation.applied === 1,
      `published ${stable.stats.activationsPublished}, applied ${stable.stats.activationsApplied}, common tick ${stable.activation.lastAppliedTick ?? '—'}`,
    ),
    check(
      'city-style-published',
      version.versionId,
      stable.cityStyle?.versionId ?? null,
      `city style applied at tick ${stable.cityStyle?.appliedAtTick ?? '—'}`,
    ),
    check(
      'profile-published',
      version.versionId,
      appliedProfile.versionId,
      `style profile ${appliedProfile.profileId} source ${appliedProfile.sourceSegmentIds.join(', ')}`,
    ),
    check(
      'profile-fingerprint-changed',
      true,
      before.profile.fingerprint !== stable.profile.fingerprint,
      `${before.profile.fingerprint} -> ${stable.profile.fingerprint}`,
    ),
    check(
      'learned-parameter',
      true,
      key !== null &&
        appliedProfile.provenanceByParameter[key] === 'LEARNED' &&
        appliedProfile.parameters[key] === version.parameters[key],
      `${key ?? '—'} ${state.publishedVersion.baseValue} -> ${state.publishedVersion.composedValue} (${state.profile?.provenance ?? '—'})`,
    ),
    check(
      'whole-fleet-adopted',
      version.versionId,
      fleetAfter.versions.length === 1 ? fleetAfter.versions[0] : fleetAfter.versions.join(', '),
      `${fleetAfter.taxis} taxis + ${fleetAfter.civilians} civilians = ${fleetAfter.total}, all on version ${fleetAfter.allOnVersion}`,
    ),
    check(
      'xp-untouched',
      xpBefore,
      xpAfter,
      `${XP_LEDGER.writer}: no XP writer is mounted by 273; digest matches the Node report`,
    ),
    check(
      'no-second-publication',
      true,
      stable.stats.versions === 1 &&
        stable.stats.activationsPublished === 1 &&
        stable.stats.activationsApplied === 1 &&
        stable.headVersionId === version.versionId,
      `after 6 extra fixed ticks: versions ${stable.stats.versions}, head ${stable.headVersionId}`,
    ),
  ];

  state.checks = Object.freeze(checks);
  const failed = checks.filter((row) => !row.pass);
  state.status = failed.length === 0 ? 'PASS' : 'FAIL';
  state.error =
    failed.length === 0 ? null : failed.map((row) => `${row.name}: ${row.actual}`).join(' | ');
  setPhase(
    state.status,
    failed.length === 0
      ? `Publicat ${version.versionId}; ${fleetAfter.total} vehicule pe versiunea nouă.`
      : `Verificări eșuate: ${failed.map((row) => row.name).join(', ')}`,
  );
}

function renderFacts(): void {
  const facts: [string, string][] = [
    ['Contract', state.contract ?? '—'],
    ['Fază', state.phase],
    ['Tick', String(state.tick)],
    ['Segment', state.segmentId ?? '—'],
    [
      'Eșantioane',
      state.segment === null
        ? '—'
        : `${state.segment.samples} (${state.segment.startTick}–${state.segment.endTick ?? '—'})`,
    ],
    [
      'Oportunități / 087',
      state.segment === null
        ? '—'
        : `${state.segment.opportunities} / ${state.segment.eligibleWindows}`,
    ],
    [
      'Fereastră 087',
      state.window === null
        ? '—'
        : `${state.window.label} ${state.window.openedTick}–${state.window.lastTick}`,
    ],
    [
      'Joburi / versiuni',
      state.stats === null ? '—' : `${state.stats.jobs} / ${state.stats.versions}`,
    ],
    [
      'Versiune',
      state.publishedVersion === null
        ? '—'
        : `${state.publishedVersion.versionId} ← ${state.publishedVersion.parentVersionId ?? '—'}`,
    ],
    [
      'Valoare',
      state.publishedVersion === null
        ? '—'
        : `${state.publishedVersion.changedKey}: ${state.publishedVersion.baseValue} → ${state.publishedVersion.composedValue}`,
    ],
    [
      'Activare',
      state.activation === null
        ? '—'
        : `${state.activation.status} @ ${state.activation.activateAtTick ?? '—'}, aplicată ${state.activation.appliedAtTick ?? '—'}`,
    ],
    [
      'Flotă',
      state.fleet === null
        ? '—'
        : `${state.fleet.taxis}T + ${state.fleet.civilians}C = ${state.fleet.total}: ${state.fleet.versions.join(', ')}`,
    ],
    [
      'Profil',
      state.profile === null
        ? '—'
        : `${state.profile.fingerprintBefore} → ${state.profile.fingerprintAfter}`,
    ],
    ['XP', state.xp === null ? '—' : `${state.xp.writer}: ${state.xp.fingerprintAfter}`],
  ];
  factsNode.replaceChildren(
    ...facts.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      return [term, detail];
    }),
  );
}

function renderChecks(): void {
  const rows = state.checks.map((row) => {
    const line = document.createElement('div');
    line.className = 'check';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = row.name;
    const verdict = document.createElement('span');
    verdict.className = `verdict ${row.pass ? 'pass' : 'fail'}`;
    verdict.textContent = row.pass ? 'PASS' : 'FAIL';
    const detail = document.createElement('span');
    detail.textContent = row.detail;
    line.append(name, verdict, detail);
    return line;
  });
  checksNode.replaceChildren(...rows);
}

function render(): void {
  phaseNode.textContent = state.phase;
  phaseNode.className =
    state.status === 'PASS'
      ? 'badge'
      : state.status === 'FAIL'
        ? 'badge red'
        : state.phase === 'SEGMENT_CLOSED' || state.phase === 'ACTIVATING'
          ? 'badge amber'
          : 'badge';
  detailNode.textContent = state.detail;
  renderFacts();
  renderChecks();
  reportNode.textContent = JSON.stringify(
    {
      fixtureVersion: state.fixtureVersion,
      status: state.status,
      phase: state.phase,
      contract: state.contract,
      segmentId: state.segmentId,
      tick: state.tick,
      segment: state.segment,
      window: state.window,
      stats: state.stats,
      publishedVersion: state.publishedVersion,
      activation: state.activation,
      profile: state.profile,
      xp: state.xp,
      fleet:
        state.fleet === null
          ? null
          : {
              total: state.fleet.total,
              taxis: state.fleet.taxis,
              civilians: state.fleet.civilians,
              versions: state.fleet.versions,
              allOnVersion: state.fleet.allOnVersion,
            },
      checks: state.checks,
      trace: state.trace,
      error: state.error,
    },
    null,
    2,
  );
  draw();
}

function project(x: number, z: number): { x: number; y: number } {
  const width = Math.max(1e-6, viewBounds.maxX - viewBounds.minX);
  const depth = Math.max(1e-6, viewBounds.maxZ - viewBounds.minZ);
  const left = 24;
  const top = 104;
  const right = canvas.width - 24;
  const bottom = 444;
  return {
    x: left + ((x - viewBounds.minX) / width) * (right - left),
    y: top + ((z - viewBounds.minZ) / depth) * (bottom - top),
  };
}

function speedColor(speedMps: number): string {
  const ratio = Math.max(0, Math.min(1, speedMps / 10));
  const red = Math.round(240 - 170 * ratio);
  const green = Math.round(120 + 100 * ratio);
  const blue = Math.round(80 + 140 * ratio);
  return `rgb(${red}, ${green}, ${blue})`;
}

function draw(): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#12242c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const source = fixture;
  context.fillStyle = '#e8f4f8';
  context.font = '16px system-ui, sans-serif';
  context.fillText(`273 — pipeline-ul de learning live · ${state.phase}`, 20, 28);
  context.font = '12px system-ui, sans-serif';
  context.fillStyle = '#b9d7e2';
  context.fillText(state.detail.slice(0, 130), 20, 48);
  if (source === null) return;

  context.strokeStyle = '#24404b';
  context.lineWidth = 1;
  for (const lane of source.world.map.lanes) {
    const path = source.world.graph.getDirectedPath(lane.id);
    if (path === null || path.points.length < 2) continue;
    context.beginPath();
    for (let index = 0; index < path.points.length; index += 1) {
      const point = project(path.points[index]!.x, path.points[index]!.z);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  const lane = source.world.graph.getDirectedPath(LIVE_FIXTURE_LANE);
  if (lane !== null) {
    context.strokeStyle = '#3f6f86';
    context.lineWidth = 2.5;
    context.beginPath();
    for (let index = 0; index < lane.points.length; index += 1) {
      const point = project(lane.points[index]!.x, lane.points[index]!.z);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  for (const point of trajectory) {
    const position = project(point.x, point.z);
    context.fillStyle = speedColor(point.speedMps);
    context.beginPath();
    context.arc(position.x, position.y, 1.8, 0, Math.PI * 2);
    context.fill();
  }
  if (windowSpan !== null) {
    context.strokeStyle = '#7fe0b4';
    context.lineWidth = 3;
    context.beginPath();
    let started = false;
    for (const point of trajectory) {
      if (point.tick < windowSpan.fromTick || point.tick > windowSpan.toTick) continue;
      const position = project(point.x, point.z);
      if (!started) {
        context.moveTo(position.x, position.y);
        started = true;
      } else context.lineTo(position.x, position.y);
    }
    context.stroke();
    const first = trajectory.find((point) => point.tick === windowSpan!.fromTick);
    if (first !== undefined) {
      const position = project(first.x, first.z);
      context.fillStyle = '#7fe0b4';
      context.font = '12px system-ui, sans-serif';
      context.fillText('087 ELIGIBLE / FREE_TRAFFIC', position.x + 6, position.y - 6);
    }
  }

  context.fillStyle = '#0b1a20';
  context.fillRect(12, 452, canvas.width - 24, 156);
  context.fillStyle = '#9fc2ce';
  context.font = '12px system-ui, sans-serif';
  context.fillText(
    `Flotă ${state.fleet?.total ?? 0} · versiuni ${state.fleet?.versions.join(', ') ?? '—'} · verde = versiunea publicată`,
    24,
    474,
  );
  const rows = state.fleet?.rows ?? [];
  const cell = 15;
  const gap = 2;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const column = index % 32;
    const line = Math.floor(index / 32);
    const x = 24 + column * (cell + gap);
    const y = 486 + line * (cell + gap);
    context.fillStyle = row.version === PIPELINE_BASE_VERSION ? '#4a8298' : '#2f9b74';
    context.fillRect(x, y, cell, cell);
    context.fillStyle = '#e8f4f8';
    context.font = '9px system-ui, sans-serif';
    context.fillText(row.driverKind === 'TAXI' ? 'T' : 'C', x + 4, y + 11);
  }
  context.fillStyle = '#9fc2ce';
  context.font = '11px system-ui, sans-serif';
  context.fillText(
    state.window === null
      ? 'Nicio fereastră 087 eligibilă încă.'
      : `Fereastră 087 ${state.window.label}: tick ${state.window.openedTick}–${state.window.lastTick}; ${state.segment?.samples ?? 0} eșantioane reale.`,
    24,
    550,
  );
  context.fillText(
    state.publishedVersion === null
      ? 'Aștept versiunea imuabilă 109.'
      : `${state.publishedVersion.versionId} (părinte ${state.publishedVersion.parentVersionId ?? '—'}), ${state.publishedVersion.changedKey} ${state.publishedVersion.baseValue} → ${state.publishedVersion.composedValue}`,
    24,
    570,
  );
  context.fillText(
    state.activation === null
      ? 'Aștept activarea 110 la tick comun.'
      : `110 ${state.activation.status} @ ${state.activation.activateAtTick ?? '—'}; aplicată ${state.activation.appliedAtTick ?? '—'} pe toată flota.`,
    24,
    590,
  );
}

function fail(error: unknown): void {
  state.status = 'FAIL';
  state.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  setPhase('FAIL', state.error.split('\n')[0] ?? 'Fixture error');
}

render();
setTimeout(() => {
  run().catch(fail);
}, 30);
