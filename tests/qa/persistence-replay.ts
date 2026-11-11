import {
  canonicalizeJson,
  computeWorldSnapshotChecksum,
  createWorldCheckpointWriter,
  loadLatestWorldCheckpoint,
  readWorldSnapshot,
} from '../../src/persistence/index';
import type { WorldCaptureIdentity, WorldCaptureResult } from '../../src/persistence/index';
import { computeWorldReplayChunkChecksum, readWorldReplayChunk } from '../../src/replay/index';
import type { WorldReplayChunk } from '../../src/replay/index';
import { createExperimentReplay } from '../../src/experiments/index';
import { experimentReplayImmutableFacts } from '../../src/experiments/index';
import type { ExperimentReplayResult } from '../../src/experiments/index';
import {
  REPLAY_FIXTURE,
  createReplayIsolation,
  createReplaySource,
  createReplaySourcePort,
} from '../experiments/experiment-replay-fixture';
import {
  WORLD_FIXTURE,
  canonicalWorld,
  createWorldFixture,
  createWorldFromSnapshot,
  runWorld,
  worldSource,
} from '../persistence/world-checkpoint-fixtures';
import type { MutableWorld } from '../persistence/world-checkpoint-fixtures';
import {
  WORLD_CHECKPOINT,
  WORLD_SESSION,
  WORLD_VERSIONS,
  createOrigin,
  openTab,
  sequenceClock,
} from '../persistence/world-checkpoint-harness';
import { fixedClock } from '../persistence/fixtures';
import type { QaCheck, QaRow } from './v1-regression-support';
import { qaCheck, qaRow } from './v1-regression-support';

/**
 * Checkpoint (206) and replay (207/141) regressions.
 *
 * The checkpoint rows use the real in-memory IndexedDB double and the real writer, loader and
 * restorer; the replay rows use a real sealed 207 chunk of 40 vehicles, a COLLISION between two AUTO
 * vehicles outside the camera, and the real 141 projection with its immutable-ledger fingerprints.
 */

function worldAt(tick: number): MutableWorld {
  const world = createWorldFixture();
  runWorld(world, tick);
  return world;
}

function identity(generation: number): WorldCaptureIdentity {
  return { checkpointId: WORLD_CHECKPOINT, sessionId: WORLD_SESSION, generation };
}

function prepared(result: WorldCaptureResult) {
  if (result.status !== 'PREPARED') throw new Error(`206 refused the capture: ${result.status}`);
  return result.capture;
}

function tamperSnapshot<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as {
    vehicles: { position: { x: number } }[];
  };
  copy.vehicles[0]!.position.x += 1;
  return copy as unknown as T;
}

function tamperChunk(chunk: WorldReplayChunk): WorldReplayChunk {
  const copy = JSON.parse(JSON.stringify(chunk)) as {
    samples: { vehicles: number[][] }[];
  };
  copy.samples[0]!.vehicles[0]![1] = (copy.samples[0]!.vehicles[0]![1] ?? 0) + 1;
  return copy as unknown as WorldReplayChunk;
}

function codeOfReplay(result: ExperimentReplayResult): string {
  return result.status === 'REFUSED' ? `${result.stage}/${result.codes.join(',')}` : result.status;
}

function canonicalText(value: unknown): string {
  const canonical = canonicalizeJson(value, { maxDepth: 64 });
  if (canonical.status === 'REJECTED') throw new Error(canonical.rejection.message);
  return canonical.text;
}

/** The 207 payload without its own `checksum`/`bytes` fields, exactly as the reader re-verifies it. */
function chunkPayload(chunk: WorldReplayChunk): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...chunk };
  delete payload.checksum;
  delete payload.bytes;
  return payload;
}

export interface PersistenceReplaySection {
  readonly rows: readonly QaRow[];
  readonly checks: readonly QaCheck[];
}

export async function runPersistenceReplay(): Promise<PersistenceReplaySection> {
  /* ---------------------------------------------------------------- 206: checkpoint */
  const origin = createOrigin();
  const repository = await openTab(origin);
  const writer = createWorldCheckpointWriter({
    repository,
    writerId: 'tab-216',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 2.5, 3, 10, 20, 26]),
    now: fixedClock(),
  });

  let checkpointPositive: QaCheck[];
  let checkpointNegative: QaCheck[];
  let captureBytes = 0;
  let captureChecksum = '';
  let captureTick = 0;
  let captureVehicles = 0;
  let resumeMode = 'MISSING';

  try {
    const oracle = worldAt(WORLD_FIXTURE.captureTick);
    const capture = prepared(writer.captureAtTick(worldSource(oracle), identity(1)));
    const commit = await writer.commitCapture(capture);
    const checksumMatches = computeWorldSnapshotChecksum(capture.snapshot) === capture.checksum;
    const read = readWorldSnapshot(capture.body);

    const loaded = await loadLatestWorldCheckpoint(repository, WORLD_SESSION, {
      versions: WORLD_VERSIONS,
      currentTick: WORLD_FIXTURE.captureTick,
    });
    const restored = loaded.status === 'RESUMABLE' ? createWorldFromSnapshot(loaded.state) : null;
    if (restored !== null) {
      runWorld(oracle, WORLD_FIXTURE.continuationTicks);
      runWorld(restored, WORLD_FIXTURE.continuationTicks);
    }
    resumeMode = loaded.status === 'RESUMABLE' ? loaded.resume.mode : 'MISSING';

    const inStep = writer.captureAtTick(
      { ...worldSource(oracle), boundary: 'IN_STEP' },
      identity(2),
    );
    const tampered = readWorldSnapshot(tamperSnapshot(capture.body));

    captureBytes = capture.bytes;
    captureChecksum = capture.checksum;
    captureTick = capture.tick;
    captureVehicles = capture.snapshot.vehicles.length;

    checkpointPositive = [
      qaCheck(
        'capture tick',
        WORLD_FIXTURE.captureTick,
        capture.tick,
        'all subsystems share the tick',
      ),
      qaCheck(
        'capture vehicles',
        70,
        capture.snapshot.vehicles.length,
        '30 taxis and 40 civilians',
      ),
      qaCheck('capture rides', 30, capture.snapshot.rides.length, 'the passenger rides are copied'),
      qaCheck(
        'capture signals',
        8,
        capture.snapshot.signals.length,
        'signals are part of the snapshot',
      ),
      qaCheck(
        'capture opportunities',
        64,
        capture.snapshot.opportunities.length,
        'opportunities are copied',
      ),
      qaCheck(
        'checksum',
        true,
        checksumMatches,
        'the stored checksum is recomputed from the state',
      ),
      qaCheck('read accepted', 'ACCEPTED', read.status, 'a stored snapshot re-reads'),
      qaCheck('commit', 'COMMITTED', commit.status, 'the capture is durable'),
      qaCheck('load resumable', 'RESUMABLE', loaded.status, 'the latest checkpoint is usable'),
      qaCheck(
        'resume paused auto',
        'PAUSED_AUTO',
        resumeMode,
        'a restart resumes paused and automatic',
      ),
      qaCheck(
        'resume releases input',
        true,
        loaded.status === 'RESUMABLE' && loaded.resume.inputReleased,
        'no held command survives the restart',
      ),
      qaCheck(
        'continuation identical',
        true,
        restored !== null && canonicalWorld(restored) === canonicalWorld(oracle),
        '60 further ticks are byte-identical to the oracle',
      ),
    ];
    checkpointNegative = [
      qaCheck(
        'in-step capture',
        'TICK_NOT_BOUNDARY',
        inStep.status === 'REJECTED' ? inStep.rejection.code : inStep.status,
        'a capture inside a tick is refused',
      ),
      qaCheck(
        'tampered snapshot',
        'CHECKSUM_MISMATCH',
        tampered.status === 'REJECTED' ? tampered.rejection.code : tampered.status,
        'an edited snapshot is refused before restore',
      ),
    ];
  } finally {
    repository.close();
  }

  /* -------------------------------------------------------------- 207/141: replay */
  const source = createReplaySource();
  const chunkRead = readWorldReplayChunk(source.chunk);
  const chunkTampered = readWorldReplayChunk(tamperChunk(source.chunk));
  const checksum = chunkRead.status === 'ACCEPTED' ? chunkRead.checksum : 'MISSING';
  const recomputed = computeWorldReplayChunkChecksum(chunkPayload(source.chunk));

  const isolation = createReplayIsolation();
  const replay = createExperimentReplay(
    {
      experimentId: REPLAY_FIXTURE.experimentId,
      source: source.chunk,
      expectedSessionId: REPLAY_FIXTURE.sessionId,
      expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
      isolation: isolation.port,
    },
    createReplaySourcePort(),
  );
  const foreign = createExperimentReplay(
    {
      experimentId: REPLAY_FIXTURE.experimentId,
      source: source.chunk,
      expectedSessionId: 'session:216-foreign',
      expectedWorldEpoch: REPLAY_FIXTURE.worldEpoch,
      isolation: isolation.port,
    },
    createReplaySourcePort(),
  );

  const beforeProgress = isolation.progress.read();
  let seekStatus = 'MISSING';
  let landedTick: number | null = null;
  let seekAtIncident = false;
  let seekIsolation = false;
  let runTicks = 0;
  let runIsolation = false;
  let liveWrites: number | null = null;
  let immutableFacts = 0;
  let immutableCoverage = 0;
  if (replay.status === 'READY') {
    const seek = replay.player.seek(REPLAY_FIXTURE.incidentTick);
    seekStatus = seek.status;
    landedTick = seek.landedTick;
    seekAtIncident = seek.atIncident;
    seekIsolation = seek.isolation.unchanged;
    const run = replay.player.replay();
    runTicks = run.ticks;
    runIsolation = run.isolation.unchanged;
    liveWrites = run.isolation.liveWrites;
    const verified = replay.player.isolation();
    immutableFacts = verified.facts.length;
    immutableCoverage = Object.keys(verified.coverage).length;
  }
  const afterProgress = isolation.progress.read();
  const progressUnchanged =
    canonicalText(beforeProgress) === canonicalText(afterProgress) &&
    beforeProgress.xpBalanceMicroXp === afterProgress.xpBalanceMicroXp;

  const replayChunkChecks: QaCheck[] = [
    qaCheck('chunk accepted', 'ACCEPTED', chunkRead.status, 'a sealed 207 chunk re-reads'),
    qaCheck(
      'chunk bytes match',
      true,
      chunkRead.status === 'ACCEPTED' && chunkRead.bytes === source.chunk.bytes,
      'the stored byte count is canonical',
    ),
    qaCheck(
      'chunk deterministic',
      true,
      checksum === source.chunk.checksum && recomputed === checksum,
      'the checksum is reproducible',
    ),
    qaCheck(
      'chunk tampered',
      'CHECKSUM_MISMATCH',
      chunkTampered.status === 'REJECTED' ? chunkTampered.rejection.code : chunkTampered.status,
      'an edited replay row is refused',
    ),
  ];
  const replayProjectionChecks: QaCheck[] = [
    qaCheck('replay ready', 'READY', replay.status, 'the 141 projection accepts the chunk'),
    qaCheck('seek status', 'SEEKED', seekStatus, 'the incident seek lands'),
    qaCheck('seek lands on incident', true, seekAtIncident, 'the seek target is the incident tick'),
    qaCheck('seek isolation', true, seekIsolation, 'a seek writes no ledger'),
    qaCheck('replay frames', true, runTicks > 0, 'the replay produced observed frames'),
    qaCheck('replay isolation', true, runIsolation, 'the whole replay writes no ledger'),
    qaCheck('replay live writes', 0, liveWrites, 'structural: zero live writes'),
    qaCheck(
      'immutable facts',
      experimentReplayImmutableFacts.length,
      immutableFacts,
      'profile, revenue, ratings, missions and XP are fingerprinted',
    ),
    qaCheck('immutable coverage', immutableFacts, immutableCoverage, 'every fact maps to a ledger'),
    qaCheck('XP untouched by replay', true, progressUnchanged, 'the player balance is identical'),
    qaCheck(
      'foreign source',
      'IDENTITY/FOREIGN_SOURCE',
      codeOfReplay(foreign),
      'another session is refused',
    ),
  ];

  const rows: QaRow[] = [
    qaRow({
      id: 'B10',
      category: 'CHECKPOINT',
      contract: '206-world-checkpoint-v1',
      scenario: 'Captură, commit, reluare și 60 de tick-uri identice cu oracolul',
      polarity: 'POSITIVE',
      actual: {
        tick: captureTick,
        vehicles: captureVehicles,
        bytes: captureBytes,
        checksum: captureChecksum,
        resumeMode,
        continuationTicks: WORLD_FIXTURE.continuationTicks,
      },
      checks: checkpointPositive,
      note: 'Un checkpoint complet este reluat în pauză/AUTO și continuă identic.',
    }),
    qaRow({
      id: 'B11',
      category: 'CHECKPOINT',
      contract: '206-world-checkpoint-v1',
      scenario: 'Captură în interiorul tick-ului și snapshot modificat',
      polarity: 'NEGATIVE',
      actual: { inStep: 'TICK_NOT_BOUNDARY', tampered: 'CHECKSUM_MISMATCH' },
      checks: checkpointNegative,
      note: 'Limita de tick și checksumul refuză date incoerente.',
    }),
    qaRow({
      id: 'B12',
      category: 'REPLAY',
      contract: '207-world-replay-chunk-v1',
      scenario: 'Fereastră completă, checksum reproductibil și rând modificat refuzat',
      polarity: 'POSITIVE',
      actual: {
        bytes: source.chunk.bytes,
        samples: source.chunk.samples.length,
        status: source.chunk.completeness.status,
        events: source.chunk.events.length,
        checksum,
      },
      checks: replayChunkChecks,
      note: 'Replay-ul păstrează tick-urile exacte și refuză o fereastră falsificată.',
    }),
    qaRow({
      id: 'B13',
      category: 'REPLAY',
      contract: '141-experiment-replay-v1',
      scenario: 'Seek și redare fără venit, review, reward sau XP',
      polarity: 'POSITIVE',
      actual: {
        seekStatus,
        landedTick,
        atIncident: seekAtIncident,
        frames: runTicks,
        liveWrites,
        xpBalanceMicroXp: afterProgress.xpBalanceMicroXp,
      },
      checks: replayProjectionChecks,
      note: 'Replay-ul este read-only: amprentele ledgerelor și soldul XP rămân identice.',
    }),
  ];

  return Object.freeze({
    rows: Object.freeze(rows),
    checks: Object.freeze([
      ...checkpointPositive,
      ...checkpointNegative,
      ...replayChunkChecks,
      ...replayProjectionChecks,
    ]),
  });
}
