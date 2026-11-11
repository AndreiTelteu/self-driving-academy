import {
  THREE_MODE_TRANSITIONS,
  assertTransition,
  runThreeModesMatrix,
  transitionFailures,
} from '../../src/app/index';
import type { ThreeModeTransitionObservation } from '../../src/app/index';
import { CITY_STYLE_BASE_VERSION, runCityStyleScenario } from '../../src/app/index';
import type { CityStyleScenarioReport } from '../../src/app/index';
import type { BodyIdentity } from '../../src/vehicles/index';
import { createThreeModesServices } from '../app/three-modes-fixture';
import { createCityStyleServices } from '../app/city-style-propagation-report';
import { createEpochWorld } from '../harness/learning-epoch-fixture';
import { PIPELINE_PROFILE_ID } from '../harness/profile-pipeline-fixture';
import type { QaCheck, QaRow } from './v1-regression-support';
import { qaCheck, qaRow, sameJson } from './v1-regression-support';

/**
 * Criterion 1: the three modes, the taxi/civil propagation and the learning barrier pass positive
 * and negative scenarios.
 *
 * Everything here is a real re-execution of a delivered contract (217, 208, 205) over its own
 * deterministic fixture. The negative rows inject one fault at a time and require the contract to
 * name it; a scenario that silently accepted the fault would fail the row.
 */

const IDENTITY: BodyIdentity = Object.freeze({ entityId: 'taxi:217', handle: 1, generation: 1 });

/** A fully valid AUTO -> MANUAL transition, the base of every injected-fault probe. */
function observation(
  overrides: Partial<ThreeModeTransitionObservation> = {},
): ThreeModeTransitionObservation {
  return {
    transition: THREE_MODE_TRANSITIONS[0]!,
    kind: 'TAXI',
    scenarioId: 'probe-216',
    previousTick: 10,
    atTick: 11,
    eligible: true,
    expectedClosedSegmentId: null,
    closed: null,
    opened: {
      segmentId: 'segment:probe',
      vehicleId: IDENTITY.entityId,
      mode: 'MANUAL',
      learningEligible: false,
      startTick: 11,
      endTick: null,
      completeness: 'OPEN',
      closeReason: null,
      samples: 0,
    },
    beforePhysics: {
      tick: 10,
      positionM: { x: 0, y: 0, z: 0 },
      speedMps: 8,
      headingRad: 0,
    },
    afterPhysics: {
      tick: 11,
      positionM: { x: 0, y: 0, z: 8 / 60 },
      speedMps: 8,
      headingRad: 0,
    },
    seatCount: 1,
    seat: { identity: IDENTITY, mode: 'MANUAL' },
    controlledIdentity: IDENTITY,
    ...overrides,
  };
}

function failureKinds(value: ThreeModeTransitionObservation): readonly string[] {
  return transitionFailures(value).map((entry) => entry.kind);
}

function phase(report: CityStyleScenarioReport, id: string) {
  const found = report.phases.find((entry) => entry.phase === id);
  if (found === undefined) throw new Error(`208 report is missing the ${id} phase`);
  return found;
}

function phaseCheck(report: CityStyleScenarioReport, name: string) {
  const found = report.checks.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`208 report is missing the ${name} check`);
  return found;
}

export interface ModesPropagationSection {
  readonly rows: readonly QaRow[];
  readonly checks: readonly QaCheck[];
}

export async function runModesPropagation(): Promise<ModesPropagationSection> {
  const services = createThreeModesServices();
  const matrix = await runThreeModesMatrix(services);
  const taxiRows = matrix.rows.filter((row) => row.kind === 'TAXI');
  const civilRows = matrix.rows.filter((row) => row.kind === 'CIVIL');

  const taxiChecks: QaCheck[] = [
    qaCheck('matrix row count', 12, matrix.rows.length, 'six transitions on both kinds'),
    qaCheck('taxi transitions', 6, taxiRows.length, 'each accepted transition is one row'),
    qaCheck(
      'taxi failures',
      [],
      taxiRows.flatMap((row) => row.failures),
      'no accepted taxi transition fails its own oracle',
    ),
    qaCheck(
      'taxi segments',
      true,
      taxiRows.every(
        (row) =>
          row.closed.endTick === (row.from === 'AUTO' ? null : row.atTick) &&
          row.opened.startTick === (row.to === 'AUTO' ? null : row.atTick),
      ),
      'the old segment closes and the new one opens at the accepted tick',
    ),
    qaCheck('max player seats', 1, matrix.counts.maxPlayerSeats, 'at most one PLAYER seat exists'),
  ];

  const civilChecks: QaCheck[] = [
    qaCheck('civil transitions', 6, civilRows.length, 'civilians accept the same six transitions'),
    qaCheck(
      'civil failures',
      [],
      civilRows.flatMap((row) => row.failures),
      'a civilian follows the same segment contract as a taxi',
    ),
    qaCheck(
      'civil learning eligibility',
      true,
      civilRows.every((row) => (row.opened.learningEligible ?? false) === (row.to === 'LEARNING')),
      'only a LEARNING segment is eligible, exactly like a taxi',
    ),
  ];

  const physicsChecks: QaCheck[] = [
    qaCheck(
      'physics preserved rows',
      12,
      matrix.rows.filter((row) => row.physics.preserved).length,
      'no transition changes speed or heading',
    ),
    qaCheck(
      'position step error',
      0,
      Math.max(...matrix.rows.map((row) => row.physics.positionStepErrorM)),
      'the per-tick position step is identical before and after the transition',
    ),
  ];

  const negativePhysics: QaCheck[] = [];
  const jumped = observation({
    afterPhysics: {
      tick: 11,
      positionM: { x: 5, y: 0, z: 8 / 60 },
      speedMps: 8,
      headingRad: 0,
    },
  });
  const sped = observation({
    afterPhysics: { tick: 11, positionM: { x: 0, y: 0, z: 8 / 60 }, speedMps: 9, headingRad: 0 },
  });
  let jumpThrew = false;
  let speedThrew = false;
  try {
    assertTransition(jumped);
  } catch {
    jumpThrew = true;
  }
  try {
    assertTransition(sped);
  } catch {
    speedThrew = true;
  }
  negativePhysics.push(
    qaCheck('jump refused', true, jumpThrew, 'an injected position jump is not accepted'),
    qaCheck(
      'jump failure kind',
      true,
      failureKinds(jumped).includes('PHYSICS_POSITION_STEP'),
      'the failure names the position step',
    ),
    qaCheck(
      'speed failure kind',
      true,
      failureKinds(sped).includes('PHYSICS_SPEED'),
      'an injected speed change is named',
    ),
    qaCheck('speed refused', true, speedThrew, 'an injected speed change is not accepted'),
  );

  const extraSeat = observation({ seatCount: 2 });
  const missingSegment = observation({ expectedClosedSegmentId: 'segment:missing' });
  const wrongSegment = observation({
    expectedClosedSegmentId: 'segment:missing',
    closed: {
      segmentId: 'segment:other',
      vehicleId: IDENTITY.entityId,
      mode: 'MANUAL',
      learningEligible: false,
      startTick: 8,
      endTick: 11,
      closeReason: 'MODE_CHANGE',
      samples: 3,
    },
  });
  const negativeScene: QaCheck[] = [
    qaCheck(
      'multiple seats',
      true,
      failureKinds(extraSeat).includes('MULTIPLE_PLAYER_SEATS'),
      'two PLAYER seats are refused',
    ),
    qaCheck(
      'missing segment',
      true,
      failureKinds(missingSegment).includes('MISSING_CLOSED_SEGMENT'),
      'a lost closed segment is refused',
    ),
    qaCheck(
      'wrong segment',
      true,
      failureKinds(wrongSegment).includes('WRONG_CLOSED_SEGMENT'),
      'another vehicle segment is refused',
    ),
  ];

  const city = await runCityStyleScenario(createCityStyleServices());
  const learningPhase = phase(city, 'CIVIL_LEARNING');
  const manualPhase = phase(city, 'CIVIL_MANUAL');
  const laterPhase = phase(city, 'LATER_SPAWN');
  const propagationChecks: QaCheck[] = [
    qaCheck('208 phases', 7, city.phases.length, 'the seven documented scenarios ran'),
    qaCheck('208 pass', true, city.summary.pass, 'no phase reports a failed check'),
    qaCheck('208 checks', true, city.summary.checks >= 25, 'the suite covers both categories'),
    qaCheck(
      'taxi and civilian share one version',
      1,
      Object.keys(learningPhase.after).length,
      'the CIVIL_LEARNING world reports exactly one applied version',
    ),
    qaCheck(
      'shared version is the learned one',
      learningPhase.commonVersionAfter,
      Object.keys(learningPhase.after)[0] ?? 'MISSING',
      'both categories report the published version',
    ),
    qaCheck(
      'propagation changed the style',
      true,
      city.commonVersionAfter !== CITY_STYLE_BASE_VERSION,
      'the common version is not the base any more',
    ),
    qaCheck(
      '208 cross category',
      true,
      city.crossCategoryUpdated,
      'a civil LEARNING segment updates taxis too',
    ),
    qaCheck(
      '208 hidden overrides',
      0,
      city.hiddenOverrides.length,
      'no vehicle keeps a private profile identity',
    ),
    qaCheck(
      '208 preserved routes',
      1,
      phase(city, 'CIVIL_RELEASE').preservedRoutes,
      'a released civilian keeps the same route',
    ),
    qaCheck(
      '208 later spawn',
      laterPhase.details.appliedVersion,
      laterPhase.details.pendingVersion,
      'vehicles created before and after the tick read the same version',
    ),
  ];

  const propagationNegative: QaCheck[] = [
    qaCheck(
      '208 MANUAL reason',
      'MANUAL_SEGMENT_NOT_LEARNABLE',
      manualPhase.details.manualStatus === 'SKIPPED_MANUAL'
        ? 'MANUAL_SEGMENT_NOT_LEARNABLE'
        : manualPhase.details.manualStatus,
      'a MANUAL segment is not learnable',
    ),
    qaCheck(
      '208 MANUAL versions',
      0,
      manualPhase.manualVersionChanges,
      'MANUAL changes no profile version',
    ),
    qaCheck(
      '208 MANUAL activations',
      0,
      manualPhase.details.manualActivations,
      'MANUAL publishes no activation',
    ),
    qaCheck(
      '208 MANUAL check',
      true,
      sameJson(phaseCheck(city, 'manual-segment-job').actual, false),
      'MANUAL never reaches the learning queue',
    ),
  ];

  const barrier = createEpochWorld();
  let barrierChecks: QaCheck[] = [];
  let barrierActual: Readonly<Record<string, unknown>> = {};
  try {
    const job = barrier.job({ segmentId: 'job-216-restore', order: 1 });
    const admission = barrier.queue.queue.submit(job);
    barrier.barrier.trackJob(job);
    const versionsBefore = barrier.store.listVersions(PIPELINE_PROFILE_ID).length;
    const pending = barrier.barrier.requestChange({
      reason: 'RESTORE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: barrier.targetVersionId,
      importValid: true,
    });
    barrier.advanceTick();
    const resolved = barrier.barrier.resolve();
    const late = barrier.barrier.isCurrent(job);
    const versionsAfter = barrier.store.listVersions(PIPELINE_PROFILE_ID).length;
    const ticket = admission.ticket;
    if (ticket === null) throw new Error('205 fixture did not admit the job');
    const outcome = await ticket.outcome;
    barrierActual = Object.freeze({
      epoch: barrier.barrier.current().learningEpoch,
      cancelledJobs: resolved.barrier?.cancelledJobs.length ?? 0,
      lateResults: barrier.barrier.stats().lateResults,
      versionsBefore,
      versionsAfter,
    });
    barrierChecks = [
      qaCheck('barrier pending', 'PENDING', pending.status, 'the change waits for the common tick'),
      qaCheck('barrier applied', 'APPLIED', resolved.status, 'the restore commits at the tick'),
      qaCheck(
        'barrier cancelled job',
        ['job-216-restore'],
        [...(resolved.barrier?.cancelledJobs ?? [])],
        'a queued job of the old epoch is cancelled',
      ),
      qaCheck(
        'queue outcome',
        'cancelled',
        outcome.status,
        'the queue itself reports the cancellation',
      ),
      qaCheck('late result', 'LATE_RESULT', late.status, 'a late result is not accepted'),
      qaCheck('late accepted', false, late.accepted, 'the late result creates nothing'),
      qaCheck(
        'epoch advanced',
        2,
        barrier.barrier.current().learningEpoch,
        'the epoch advances once',
      ),
      qaCheck(
        'versions unchanged',
        versionsBefore,
        versionsAfter,
        'the barrier itself publishes no version',
      ),
    ];
  } finally {
    barrier.dispose();
  }

  const invalidImport = createEpochWorld();
  let invalidImportChecks: QaCheck[] = [];
  let invalidImportActual: Readonly<Record<string, unknown>> = {};
  try {
    const result = invalidImport.barrier.requestChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: invalidImport.targetVersionId,
      importValid: false,
    });
    invalidImportActual = Object.freeze({
      status: result.status,
      code: result.code,
      pending: invalidImport.barrier.pending(),
      generations: invalidImport.barrier.generations().length,
    });
    invalidImportChecks = [
      qaCheck('invalid import status', 'REJECTED', result.status, 'an invalid import is refused'),
      qaCheck('invalid import code', 'IMPORT_INVALID', result.code, 'the refusal names the import'),
      qaCheck('invalid import barrier', null, result.barrier, 'no barrier is created'),
      qaCheck(
        'invalid import pending',
        null,
        invalidImport.barrier.pending(),
        'nothing is left pending',
      ),
      qaCheck(
        'invalid import generation',
        1,
        invalidImport.barrier.generations().length,
        'the refused import creates no generation',
      ),
    ];
  } finally {
    invalidImport.dispose();
  }

  const rows: QaRow[] = [
    qaRow({
      id: 'A1',
      category: 'MODES',
      contract: '217-three-modes-v1',
      scenario: 'Toate cele șase tranziții pe taxi, cu un singur scaun PLAYER',
      polarity: 'POSITIVE',
      actual: {
        rows: taxiRows.length,
        transitions: [...new Set(taxiRows.map((row) => row.transition))],
        failures: taxiRows.flatMap((row) => row.failures).length,
        maxPlayerSeats: matrix.counts.maxPlayerSeats,
      },
      checks: taxiChecks,
      note: 'Cele șase tranziții AUTO/MANUAL/LEARNING sunt separate de segmente la tick-ul acceptat.',
    }),
    qaRow({
      id: 'A2',
      category: 'MODES',
      contract: '217-three-modes-v1',
      scenario: 'Toate cele șase tranziții pe un vehicul civil',
      polarity: 'POSITIVE',
      actual: {
        rows: civilRows.length,
        failures: civilRows.flatMap((row) => row.failures).length,
        modes: [...new Set(civilRows.map((row) => row.opened.mode ?? row.closed.mode ?? 'AUTO'))],
      },
      checks: civilChecks,
      note: 'Un civil acceptă aceleași tranziții și același contract de segmente.',
    }),
    qaRow({
      id: 'A3',
      category: 'MODES',
      contract: '217-three-modes-v1',
      scenario: 'Tranziția păstrează viteza, direcția și pasul de poziție',
      polarity: 'POSITIVE',
      actual: {
        preserved: matrix.rows.filter((row) => row.physics.preserved).length,
        maxStepErrorM: Math.max(...matrix.rows.map((row) => row.physics.positionStepErrorM)),
      },
      checks: physicsChecks,
      note: 'Nicio tranziție nu produce teleportare sau schimbare de viteză.',
    }),
    qaRow({
      id: 'A4',
      category: 'MODES',
      contract: '217-three-modes-v1',
      scenario: 'Defecte injectate: salt de poziție și schimbare de viteză',
      polarity: 'NEGATIVE',
      actual: {
        jumpKinds: failureKinds(jumped),
        speedKinds: failureKinds(sped),
      },
      checks: negativePhysics,
      note: 'Contractul refuză explicit o fizică discontinuă, nu o toleră.',
    }),
    qaRow({
      id: 'A5',
      category: 'MODES',
      contract: '217-three-modes-v1',
      scenario: 'Defecte injectate: două scaune, segment lipsă și segment străin',
      polarity: 'NEGATIVE',
      actual: {
        extraSeatKinds: failureKinds(extraSeat),
        missingKinds: failureKinds(missingSegment),
        wrongKinds: failureKinds(wrongSegment),
      },
      checks: negativeScene,
      note: 'Fiecare defect are un cod propriu de eșec.',
    }),
    qaRow({
      id: 'A6',
      category: 'PROPAGATION',
      contract: '208-city-style-v1',
      scenario: 'Taxiurile și civilii adoptă aceeași versiune de stil',
      polarity: 'POSITIVE',
      actual: {
        phases: city.summary.phases,
        checks: city.summary.checks,
        commonVersionAfter: city.commonVersionAfter,
        crossCategoryUpdated: city.crossCategoryUpdated,
        hiddenOverrides: city.hiddenOverrides.length,
      },
      checks: propagationChecks,
      note: 'Propagarea se face la tick-ul comun, pentru ambele categorii.',
    }),
    qaRow({
      id: 'A7',
      category: 'PROPAGATION',
      contract: '208-city-style-v1',
      scenario: 'Un segment MANUAL civil nu învață și nu publică',
      polarity: 'NEGATIVE',
      actual: {
        manualStatus: manualPhase.details.manualStatus,
        manualVersionChanges: manualPhase.manualVersionChanges,
        manualActivations: manualPhase.details.manualActivations,
      },
      checks: propagationNegative,
      note: 'MANUAL rămâne telemetrie, fără job, versiune sau activare.',
    }),
    qaRow({
      id: 'A8',
      category: 'LEARNING_BARRIER',
      contract: '205-learning-epoch-v1',
      scenario: 'Restore cu un job în coadă: jobul este anulat, rezultatul târziu refuzat',
      polarity: 'POSITIVE',
      actual: barrierActual,
      checks: barrierChecks,
      note: 'Bariera invalidează joburile epoch-ului vechi înainte de a aplica noul profil.',
    }),
    qaRow({
      id: 'A9',
      category: 'LEARNING_BARRIER',
      contract: '205-learning-epoch-v1',
      scenario: 'Import invalid: refuz fără generație nouă',
      polarity: 'NEGATIVE',
      actual: invalidImportActual,
      checks: invalidImportChecks,
      note: 'Un import invalid păstrează coada și generația curentă.',
    }),
  ];

  const checks = [
    ...taxiChecks,
    ...civilChecks,
    ...physicsChecks,
    ...negativePhysics,
    ...negativeScene,
    ...propagationChecks,
    ...propagationNegative,
    ...barrierChecks,
    ...invalidImportChecks,
  ];
  return Object.freeze({ rows: Object.freeze(rows), checks: Object.freeze(checks) });
}
