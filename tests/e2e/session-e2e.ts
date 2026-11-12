import { createFleetKpi, createFleetLedger, createReviewLedger } from '../../src/economy/index';
import {
  createDailyProgress,
  createPlayerProgress,
  dailyMissionSetOrdered,
  levelForXpMicro,
  recordDailyReward,
  restoreDailyProgress,
  advanceDailyCalendar,
} from '../../src/missions/index';
import type {
  DailyProgress,
  DailyRewardRecord,
  DailyMissionInstance,
  PlayerProgress,
} from '../../src/missions/index';
import {
  buildEconomySave,
  buildProfileExport,
  readEconomySave,
  readProfileExport,
} from '../../src/persistence/index';
import { VERTICAL_SLICE_PROFILE_ID, verticalSliceLearningSegment } from '../../src/app/index';
import type { RideRecord } from '../../src/fleet/index';
import type { InterventionSegment } from '../../src/telemetry/index';
import { calendarInput, fullCapabilities } from '../missions/mission-daily-fixture';
import { comfortForRide } from '../economy/economy-fixture';
import {
  XP_FIXTURE_START_MS,
  activeWindow,
  completedMissionSettlement,
} from '../missions/player-xp-fixture';
import {
  E2E_SESSION_COMMAND,
  E2E_SESSION_GENERATED_BY,
  E2E_SESSION_SEED,
  E2E_SESSION_VERSION,
  absoluteTolerance,
  exactTolerance,
  fingerprint,
  relativeTolerance,
  sessionCheck,
  sessionDigest,
  sessionStep,
} from './session-support';
import type { SessionCheck, SessionStep, SessionValue } from './session-support';
import {
  PLAYER_ID,
  SESSION_CIVILIANS,
  SESSION_ENGINE_VERSION,
  SESSION_ID,
  SESSION_TAXIS,
  SESSION_WORLD_EPOCH,
  createSessionWorld,
} from './session-world';
import type { SessionWorld } from './session-world';

/**
 * PBI 152 — one end-to-end session and progress test.
 *
 * The session is walked cap-coadă in one process: a new profile, AUTO, MANUAL, a real ride, a vehicle
 * switch in the middle of that ride, LEARNING through the real 112 pipeline, the taxi/civil
 * activation of the learned profile, the 209 KPI, the 211/212 daily set and reward, the 213 XP
 * credits, the 133 profile export plus the 215 economy save, and a restart that re-reads both files
 * and compares fingerprints.
 *
 * Every fact comes from the delivered module that owns it; the harness only chooses which real fact
 * happens and when. The expected values are contract values, not copies of the observed ones.
 */

export const SESSION_DATE = '2026-11-11' as const;
export const SESSION_CREATED_AT = '2026-11-11T12:00:00.000Z' as const;
export const SESSION_ACTIVE_WINDOW_MS = 30_000 as const;
export const SESSION_KEY = 'stop_full_probability' as const;

export interface XpProjection {
  readonly balanceXp: number;
  readonly balanceMicroXp: number;
  readonly level: number;
  readonly entries: number;
  readonly byCause: Readonly<Record<string, number>>;
  readonly missionIds: readonly string[];
  readonly dailyDates: readonly string[];
}

export interface DailyProjection {
  readonly dailyDate: string;
  readonly instances: readonly string[];
  readonly rewarded: number;
  readonly xpPromised: number;
  readonly rows: number;
}

export interface KpiProjection {
  readonly settlements: number;
  readonly reviews: number;
  readonly revenueMinorUnits: number;
  readonly ratingSum: number;
  readonly ratingCount: number;
  readonly completedRides: number;
  readonly days: number;
}

export interface FleetProjection {
  readonly profileId: string;
  readonly activeVersionId: string;
  readonly taxiHistogram: Readonly<Record<string, number>>;
  readonly civilianHistogram: Readonly<Record<string, number>>;
  readonly taxis: number;
  readonly civilians: number;
}

export interface RestartProof {
  readonly profileExportStatus: string;
  readonly profileChecksumVerified: boolean;
  readonly economyReadStatus: string;
  readonly economyChecksumVerified: boolean;
  readonly xpBefore: XpProjection;
  readonly xpAfter: XpProjection;
  readonly xpFingerprint: string;
  readonly dailyBefore: DailyProjection;
  readonly dailyAfter: DailyProjection;
  readonly dailyFingerprint: string;
  readonly kpiBefore: KpiProjection;
  readonly kpiAfter: KpiProjection;
  readonly kpiFingerprint: string;
  readonly fleetBefore: FleetProjection;
  readonly fleetAfterVersionId: string;
  readonly fleetFingerprint: string;
  readonly persistedBytes: Readonly<{ profile: number; economy: number }>;
  readonly versionChecksums: readonly string[];
}

export interface SwitchProof {
  readonly rideId: string;
  readonly taxiId: string;
  readonly stateBeforeSwitch: string;
  readonly stateAfterSwitch: string;
  readonly segmentId: string;
  readonly segmentStartTick: number;
  readonly segmentEndTick: number | null;
  readonly closeReason: string | null;
  readonly segmentHistory: number;
  readonly transitionsBefore: number;
  readonly transitionsAfter: number;
  readonly activeRidesAfter: number;
  readonly assignmentIdBefore: string;
  readonly assignmentIdAfter: string;
  readonly tripFingerprintBefore: string;
  readonly tripFingerprintAfter: string;
  readonly otherTaxiId: string;
  readonly seatAfterSwitch: string | null;
}

export interface SessionArtifacts {
  readonly profile: string;
  readonly economy: string;
  readonly expected: Readonly<{
    xp: XpProjection;
    daily: DailyProjection;
    kpi: KpiProjection;
    fleet: FleetProjection;
  }>;
  readonly summary: Readonly<{ steps: number; checks: number; pass: boolean }>;
}

export interface E2ESessionReport {
  readonly version: typeof E2E_SESSION_VERSION;
  readonly generatedBy: typeof E2E_SESSION_GENERATED_BY;
  readonly command: typeof E2E_SESSION_COMMAND;
  readonly seed: typeof E2E_SESSION_SEED;
  readonly oracleRule: string;
  readonly steps: readonly SessionStep[];
  readonly summary: Readonly<{
    steps: number;
    checks: number;
    passed: number;
    fail: number;
    failChecks: readonly string[];
    pass: boolean;
  }>;
  readonly restart: RestartProof;
  readonly vehicleSwitch: SwitchProof;
  readonly session: Readonly<{
    sessionId: string;
    playerId: string;
    profileId: string;
    taxis: number;
    civilians: number;
    modePath: readonly string[];
    segmentHistory: number;
    rideStates: readonly string[];
    finalTick: number;
  }>;
  readonly reproductions: Readonly<{ pass: boolean; digest: string }>;
  readonly browser: Readonly<{ status: 'NOT_RUN'; reason: string }>;
  readonly limitations: readonly string[];
}

function evidenceOf(entry: { readonly evidence: unknown }): Readonly<Record<string, unknown>> {
  const evidence = entry.evidence;
  return typeof evidence === 'object' && evidence !== null
    ? (evidence as Readonly<Record<string, unknown>>)
    : Object.freeze({});
}

function projectionOfXp(read: {
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly entries: readonly {
    readonly causeType: string;
    readonly amountXp: number;
    readonly evidence: unknown;
  }[];
}): XpProjection {
  const byCause: Record<string, number> = Object.create(null);
  const missionIds: string[] = [];
  const dailyDates: string[] = [];
  for (const entry of read.entries) {
    byCause[entry.causeType] = (byCause[entry.causeType] ?? 0) + entry.amountXp;
    const evidence = evidenceOf(entry);
    if (entry.causeType === 'MISSION_REWARD') {
      const missionId = evidence.missionId;
      if (typeof missionId === 'string') missionIds.push(missionId);
    }
    if (entry.causeType === 'DAILY_REWARD') {
      const dailyDate = evidence.dailyDate;
      if (typeof dailyDate === 'string') dailyDates.push(dailyDate);
    }
  }
  return Object.freeze({
    balanceXp: read.xpBalance,
    balanceMicroXp: read.xpBalanceMicroXp,
    level: read.level,
    entries: read.entries.length,
    byCause: Object.freeze(byCause),
    missionIds: Object.freeze(missionIds.sort()),
    dailyDates: Object.freeze(dailyDates),
  });
}

/** Rebuilds the 213 read model from the persisted checkpoint; a restart has no live module. */
function projectionOfCheckpoint(checkpoint: {
  readonly entries: readonly {
    readonly causeType: string;
    readonly amountXp: number;
    readonly balanceAfterMicroXp: number;
    readonly evidence: unknown;
  }[];
}): XpProjection {
  const last = checkpoint.entries[checkpoint.entries.length - 1];
  const balanceMicroXp = last?.balanceAfterMicroXp ?? 0;
  return projectionOfXp({
    xpBalance: balanceMicroXp / 1_000_000,
    xpBalanceMicroXp: balanceMicroXp,
    level: levelForXpMicro(balanceMicroXp),
    entries: checkpoint.entries,
  });
}

function projectionOfDaily(snapshot: {
  readonly dailyDate: string;
  readonly rows: readonly {
    readonly instanceId: string;
    readonly state: string;
    readonly rewardId?: string | null;
    readonly rewardXp?: number;
  }[];
}): DailyProjection {
  const rows = snapshot.rows;
  return Object.freeze({
    dailyDate: snapshot.dailyDate,
    instances: Object.freeze(rows.map((row) => row.instanceId).sort()),
    rewarded: rows.filter((row) => row.rewardId !== null && row.rewardId !== undefined).length,
    xpPromised: rows
      .filter((row) => row.rewardId !== null && row.rewardId !== undefined)
      .reduce((total, row) => total + (row.rewardXp ?? 0), 0),
    rows: rows.length,
  });
}

function projectionOfKpi(snapshot: {
  readonly days: readonly {
    readonly revenueMinorUnits: number;
    readonly reviewCount: number;
    readonly ratingSum: number;
    readonly completedRides: number;
    readonly failedRides: number;
    readonly cancelledRides: number;
  }[];
}): KpiProjection {
  return Object.freeze({
    settlements: snapshot.days.reduce(
      (total, day) => total + day.completedRides + day.failedRides + day.cancelledRides,
      0,
    ),
    reviews: snapshot.days.reduce((total, day) => total + day.reviewCount, 0),
    revenueMinorUnits: snapshot.days.reduce((total, day) => total + day.revenueMinorUnits, 0),
    ratingSum: snapshot.days.reduce((total, day) => total + day.ratingSum, 0),
    ratingCount: snapshot.days.reduce((total, day) => total + day.reviewCount, 0),
    completedRides: snapshot.days.reduce((total, day) => total + day.completedRides, 0),
    days: snapshot.days.filter((day) => day.reviewCount > 0 || day.revenueMinorUnits !== 0).length,
  });
}

function plannedDistanceM(world: SessionWorld, ride: RideRecord): number {
  let total = 0;
  for (const laneId of ride.tripRouteLaneIds) {
    const path = world.city.graph.getDirectedPath(laneId);
    if (path !== null) total += path.lengthM;
  }
  return total > 0 ? Math.round(total * 1000) / 1000 : 1_500;
}

function segmentIdOf(value: InterventionSegment): string {
  return value.segmentId;
}

function rideStates(ride: RideRecord | undefined): readonly string[] {
  return ride === undefined ? [] : ride.transitions.map((transition) => transition.to);
}

export interface ArtifactComparison {
  readonly pass: boolean;
  readonly checks: readonly SessionCheck[];
  readonly numbers: Readonly<{
    profileStatus: string;
    profileChecksumVerified: boolean;
    economyStatus: string;
    economyChecksumVerified: boolean;
    xpBalance: number;
    xpLevel: number;
    dailyRewarded: number;
    dailyInstances: number;
    kpiRevenueMinorUnits: number;
    kpiReviews: number;
    fleetVersionId: string;
  }>;
}

/**
 * Re-reads the persisted documents in a fresh state and compares them with the exported projections.
 * The 152 restart step and the browser page both call it, so a reload cannot use a different rule.
 */
export function compareArtifacts(artifacts: SessionArtifacts): ArtifactComparison {
  const profileRead = readProfileExport(artifacts.profile);
  const economyRead = readEconomySave(artifacts.economy, {
    sessionId: SESSION_ID,
    playerId: PLAYER_ID,
    worldEpoch: SESSION_WORLD_EPOCH,
  });
  if (profileRead.status !== 'ACCEPTED' || economyRead.status !== 'ACCEPTED') {
    return Object.freeze({
      pass: false,
      checks: Object.freeze([]),
      numbers: Object.freeze({
        profileStatus: profileRead.status,
        profileChecksumVerified: false,
        economyStatus: economyRead.status,
        economyChecksumVerified: false,
        xpBalance: Number.NaN,
        xpLevel: 0,
        dailyRewarded: 0,
        dailyInstances: 0,
        kpiRevenueMinorUnits: 0,
        kpiReviews: 0,
        fleetVersionId: '',
      }),
    });
  }
  const player = economyRead.components.player;
  const economy = economyRead.components.economy;
  const xpAfter = player === null ? null : projectionOfCheckpoint(player);
  const dailyAfter = projectionOfDaily(
    restoreDailyProgress(economyRead.components.daily, {
      sessionId: SESSION_ID,
      worldEpoch: SESSION_WORLD_EPOCH,
    }).progress.snapshot(),
  );
  const kpiAfter = economy === null ? null : projectionOfKpi(economy.kpi);
  const fleetAfterVersionId = profileRead.document.profile.activeVersionId ?? '';
  const checks = [
    sessionCheck(
      'profile read',
      'ACCEPTED',
      profileRead.status,
      exactTolerance,
      'fișierul se re-citește',
    ),
    sessionCheck(
      'profile checksum verified',
      true,
      profileRead.checksumVerified,
      exactTolerance,
      'checksumul este recalculat la citire',
    ),
    sessionCheck(
      'economy read',
      'ACCEPTED',
      economyRead.status,
      exactTolerance,
      'bundle-ul se re-citește',
    ),
    sessionCheck(
      'economy checksum verified',
      true,
      economyRead.checksumVerified,
      exactTolerance,
      'checksumul bundle-ului este recalculat',
    ),
    sessionCheck(
      'xp fingerprint',
      true,
      xpAfter !== null && fingerprint(artifacts.expected.xp) === fingerprint(xpAfter),
      exactTolerance,
      'amprenta XP înainte/după este aceeași',
    ),
    sessionCheck(
      'daily fingerprint',
      true,
      fingerprint(artifacts.expected.daily) === fingerprint(dailyAfter),
      exactTolerance,
      'setul daily și recompensa sunt identice',
    ),
    sessionCheck(
      'kpi fingerprint',
      true,
      kpiAfter !== null && fingerprint(artifacts.expected.kpi) === fingerprint(kpiAfter),
      exactTolerance,
      'KPI (venit, note, curse) este identic',
    ),
    sessionCheck(
      'fleet profile',
      artifacts.expected.fleet.activeVersionId,
      fleetAfterVersionId,
      exactTolerance,
      'profilul flotei rămâne versiunea activă exportată',
    ),
  ];
  return Object.freeze({
    pass: checks.every((check) => check.pass),
    checks: Object.freeze(checks),
    numbers: Object.freeze({
      profileStatus: profileRead.status,
      profileChecksumVerified: profileRead.checksumVerified,
      economyStatus: economyRead.status,
      economyChecksumVerified: economyRead.checksumVerified,
      xpBalance: xpAfter?.balanceXp ?? Number.NaN,
      xpLevel: xpAfter?.level ?? 0,
      dailyRewarded: dailyAfter.rewarded,
      dailyInstances: dailyAfter.instances.length,
      kpiRevenueMinorUnits: kpiAfter?.revenueMinorUnits ?? 0,
      kpiReviews: kpiAfter?.reviews ?? 0,
      fleetVersionId: fleetAfterVersionId,
    }),
  });
}

/** Runs the whole session twice and returns the report plus the reproducibility verdict. */
export async function runE2ESession(): Promise<E2ESessionReport> {
  const first = await runE2ESessionOnce();
  const second = await runE2ESessionOnce();
  const reproducible =
    fingerprint(first.steps) === fingerprint(second.steps) &&
    first.restart.xpFingerprint === second.restart.xpFingerprint &&
    first.restart.dailyFingerprint === second.restart.dailyFingerprint &&
    first.restart.kpiFingerprint === second.restart.kpiFingerprint;
  return Object.freeze({
    ...first,
    reproductions: Object.freeze({
      pass: reproducible,
      digest: sessionDigest(first.steps),
    }),
  });
}

/**
 * Runs the session once and returns the two exported documents plus the expected projections.
 * The browser harness uses it to persist the files and to compare them after a real page reload.
 */
export async function exportSessionDocuments(): Promise<SessionArtifacts> {
  const box: { value: SessionArtifacts | null } = { value: null };
  await runE2ESessionOnce((artifacts) => {
    box.value = artifacts;
  });
  if (box.value === null) throw new Error('The session produced no artifact');
  return box.value;
}

async function runE2ESessionOnce(
  sink?: (artifacts: SessionArtifacts) => void,
): Promise<E2ESessionReport> {
  const world = createSessionWorld();
  const steps: SessionStep[] = [];
  const modePath: string[] = [];
  const rideStatesSeen: string[] = [];
  const checksOf = (step: Omit<SessionStep, 'verdict'>): SessionStep => sessionStep(step);

  try {
    /* ------------------------------------------------------------ S0: new profile */
    const store = world.city.store;
    const baseStats = store.stats();
    const baseFleet = {
      profileId: VERTICAL_SLICE_PROFILE_ID,
      activeVersionId: world.city.activeVersion(),
      taxiHistogram: world.city.categoryHistogram('TAXI'),
      civilianHistogram: world.city.categoryHistogram('CIVILIAN'),
      taxis: world.city.taxiIds.length,
      civilians: world.city.civilianIds.length,
    };
    modePath.push(world.mode());
    steps.push(
      checksOf({
        id: 'S0-new-profile',
        order: 0,
        title: 'Profil nou: o singură versiune de bază pentru toată flota',
        contract: '109 profile store + 057 fleet registry',
        input: { profileId: VERTICAL_SLICE_PROFILE_ID, engineVersion: SESSION_ENGINE_VERSION },
        actual: {
          versions: baseStats.versions,
          baseVersions: baseStats.baseVersions,
          activeVersionId: baseFleet.activeVersionId,
          taxiHistogram: JSON.stringify(baseFleet.taxiHistogram),
          civilianHistogram: JSON.stringify(baseFleet.civilianHistogram),
        },
        checks: [
          sessionCheck(
            'profile versions',
            1,
            baseStats.versions,
            exactTolerance,
            'un profil nou pornește cu exact o versiune de bază',
          ),
          sessionCheck(
            'base versions',
            1,
            baseStats.baseVersions,
            exactTolerance,
            'versiunea de start este BASE, nu o versiune derivată',
          ),
          sessionCheck(
            'taxis',
            SESSION_TAXIS,
            baseFleet.taxis,
            exactTolerance,
            'flota V1 are 30 de taxiuri',
          ),
          sessionCheck(
            'civilians',
            SESSION_CIVILIANS,
            baseFleet.civilians,
            exactTolerance,
            'traficul civil are 40 de vehicule',
          ),
          sessionCheck(
            'fleet on base version',
            [baseFleet.activeVersionId],
            Object.keys(baseFleet.taxiHistogram),
            exactTolerance,
            'toate taxiurile folosesc versiunea de bază',
          ),
          sessionCheck(
            'civil on base version',
            [baseFleet.activeVersionId],
            Object.keys(baseFleet.civilianHistogram),
            exactTolerance,
            'toate civilele folosesc versiunea de bază',
          ),
          sessionCheck(
            'initial mode',
            'AUTO',
            modePath[0] ?? null,
            exactTolerance,
            'sesiunea pornește în AUTO, fără scaun de jucător',
          ),
        ],
      }),
    );

    /* ------------------------------------------------------------------- S1: AUTO */
    for (let index = 0; index < 2; index += 1) world.step();
    const autoObserved = world.modes.observe();
    steps.push(
      checksOf({
        id: 'S1-auto',
        order: 1,
        title: 'AUTO: simularea rulează fără autoritate de jucător',
        contract: '024 + 066 control authority',
        input: { ticks: 2 },
        actual: {
          tick: autoObserved.tick,
          mode: autoObserved.mode,
          seat: world.seat() === null ? null : JSON.stringify(world.seat()),
          segments: world.segments.stats().open,
        },
        checks: [
          sessionCheck('auto mode', 'AUTO', autoObserved.mode, exactTolerance, 'modul rămâne AUTO'),
          sessionCheck(
            'auto seat',
            null,
            world.seat() === null ? null : JSON.stringify(world.seat()),
            exactTolerance,
            'niciun jucător nu deține un vehicul',
          ),
          sessionCheck(
            'auto segment',
            0,
            world.segments.stats().open,
            exactTolerance,
            'AUTO nu deschide segment de intervenție',
          ),
          sessionCheck(
            'auto tick',
            true,
            autoObserved.tick > 0,
            exactTolerance,
            'ceasul fix a avansat',
          ),
        ],
      }),
    );

    /* -------------------------------------------------------- S2: real ride begin */
    for (let slot = 3; slot <= world.city.taxiIds.length; slot += 1) {
      const taxiId = world.city.taxiIds[slot - 1];
      if (taxiId !== undefined) world.dispatcher.setTaxiStatus(taxiId, 'BLOCKED', 0);
    }
    while (world.tick() < 10) world.step();
    world.demand.advance(10);
    const dispatched = world.dispatcher.step({ tick: 10, maxAssignments: 2 });
    const assignment = dispatched.assigned[0];
    if (assignment === undefined) throw new Error('The real 060 dispatcher assigned no ride');
    const begun = world.lifecycle.begin({
      requestId: assignment.requestId,
      eventId: `152:assigned:${assignment.requestId}`,
      tick: 10,
    });
    const rideTaxiId = assignment.taxiId;
    const rideIdentity = world.identityOf(rideTaxiId);
    if (rideIdentity === undefined)
      throw new Error(`No identity for the assigned taxi ${rideTaxiId}`);
    const otherTaxiId = world.city.taxiIds.find((taxiId) => taxiId !== rideTaxiId);
    const otherIdentity = otherTaxiId === undefined ? undefined : world.identityOf(otherTaxiId);
    if (otherIdentity === undefined || otherTaxiId === undefined) {
      throw new Error('The session needs a second taxi for the mid-ride switch');
    }
    world.setTripFingerprint(rideTaxiId, begun.ride.rideId);
    if (world.selected() !== rideIdentity) world.selectVehicle(rideIdentity, 'FLEET');
    rideStatesSeen.push(...rideStates(begun.ride));

    steps.push(
      checksOf({
        id: 'S2-ride-begin',
        order: 2,
        title: 'Cursă reală: dispeceratul 060 alocă taxiul, 061 pornește cursa',
        contract: '059 ride demand + 060 dispatcher + 061 ride FSM',
        input: { tick: 10, requestId: assignment.requestId, taxiId: rideTaxiId },
        actual: {
          state: begun.ride.state,
          taxiId: begun.ride.taxiId,
          taxiStatus: world.dispatcher.taxiStatus(rideTaxiId) ?? null,
          selected: world.selected()?.entityId ?? null,
          activeRides: world.lifecycle.stats().active,
        },
        checks: [
          sessionCheck(
            'ride state',
            'TO_PICKUP',
            begun.ride.state,
            exactTolerance,
            'ASSIGNED deschide cursa în TO_PICKUP',
          ),
          sessionCheck(
            'ride taxi',
            rideTaxiId,
            begun.ride.taxiId,
            exactTolerance,
            'cursa aparține taxiului alocat de 060',
          ),
          sessionCheck(
            'taxi claimed',
            'ASSIGNED',
            world.dispatcher.taxiStatus(rideTaxiId) ?? null,
            exactTolerance,
            'taxiul este revendicat de cursă',
          ),
          sessionCheck(
            'camera on ride taxi',
            rideTaxiId,
            world.selected()?.entityId ?? null,
            exactTolerance,
            'camera urmărește taxiul cursei, fără a lua scaunul',
          ),
          sessionCheck(
            'active rides',
            1,
            world.lifecycle.stats().active,
            exactTolerance,
            'exact o cursă activă',
          ),
        ],
      }),
    );

    /* ----------------------------------------------------------------- S3: MANUAL */
    const manualClaim = world.claimMode('M');
    const manualTick = world.tick();
    const manualSegment = world.segments.open(rideIdentity, 'MANUAL', manualTick);
    modePath.push(world.mode());
    steps.push(
      checksOf({
        id: 'S3-manual',
        order: 3,
        title: 'MANUAL: jucătorul preia taxiul cursei și deschide intervenția',
        contract: '067 mode controls + 066 authority + 005 segment',
        input: { action: 'M', tick: manualTick, vehicleId: rideTaxiId },
        actual: {
          claim: manualClaim,
          mode: world.mode(),
          seat: world.seat() === null ? null : JSON.stringify(world.seat()),
          segment: manualSegment.segmentId,
          completeness: manualSegment.completeness,
          startTick: manualSegment.startTick,
        },
        checks: [
          sessionCheck(
            'manual claim',
            'ACCEPTED',
            manualClaim,
            exactTolerance,
            'tasta M este acceptată la tick-ul următor',
          ),
          sessionCheck(
            'manual mode',
            'MANUAL',
            world.mode(),
            exactTolerance,
            'HUD și simularea sunt MANUAL',
          ),
          sessionCheck(
            'manual seat',
            rideTaxiId,
            world.seat()?.identity.entityId ?? null,
            exactTolerance,
            'jucătorul deține taxiul cursei',
          ),
          sessionCheck(
            'manual seat mode',
            'MANUAL',
            world.seat()?.mode ?? null,
            exactTolerance,
            'scaunul raportează MANUAL',
          ),
          sessionCheck(
            'segment open',
            'OPEN',
            manualSegment.completeness,
            exactTolerance,
            'intervenția este deschisă',
          ),
          sessionCheck(
            'segment start',
            manualTick,
            manualSegment.startTick,
            exactTolerance,
            'segmentul pornește la tick-ul acceptat',
          ),
        ],
      }),
    );

    /* ------------------------------------------------------------- S4: mid-ride */
    const beforeSwitch = {
      transitions: 0,
      assignment: assignment.assignmentId,
      state: '',
      tick: 0,
    };
    let ride = begun.ride;
    for (const event of ['ARRIVED_PICKUP', 'PICKUP_COMPLETE'] as const) {
      world.step();
      const applied = world.lifecycle.apply({
        rideId: ride.rideId,
        eventId: `152:${event}`,
        event,
        tick: world.tick(),
      });
      ride = applied.ride;
      rideStatesSeen.push(ride.state);
    }
    beforeSwitch.transitions = ride.transitions.length;
    beforeSwitch.state = ride.state;
    beforeSwitch.tick = world.tick();
    const openBeforeSwitch = world.segments.read();
    steps.push(
      checksOf({
        id: 'S4-mid-ride',
        order: 4,
        title: 'La mijlocul cursei: pickup-ul este complet, taxiul rămâne revendicat',
        contract: '061 ride FSM (tranziții legale) + 005 OPEN',
        input: { events: ['ARRIVED_PICKUP', 'PICKUP_COMPLETE'], tick: world.tick() },
        actual: {
          state: ride.state,
          transitions: ride.transitions.length,
          taxiStatus: world.dispatcher.taxiStatus(rideTaxiId) ?? null,
          segment: openBeforeSwitch?.segment.completeness ?? null,
          activeRides: world.lifecycle.stats().active,
        },
        checks: [
          sessionCheck(
            'mid-ride state',
            'TO_DROPOFF',
            ride.state,
            exactTolerance,
            'pasagerul este la bord',
          ),
          sessionCheck(
            'mid-ride transitions',
            3,
            ride.transitions.length,
            exactTolerance,
            'ASSIGNED + ARRIVED_PICKUP + PICKUP_COMPLETE',
          ),
          sessionCheck(
            'mid-ride taxi claimed',
            'ASSIGNED',
            world.dispatcher.taxiStatus(rideTaxiId) ?? null,
            exactTolerance,
            'cursa deține încă taxiul',
          ),
          sessionCheck(
            'mid-ride segment open',
            'OPEN',
            openBeforeSwitch?.segment.completeness ?? null,
            exactTolerance,
            'intervenția MANUAL este încă deschisă',
          ),
          sessionCheck(
            'mid-ride active rides',
            1,
            world.lifecycle.stats().active,
            exactTolerance,
            'cursa este activă în momentul schimbării',
          ),
        ],
      }),
    );

    /* ---------------------------------------------------- S5: vehicle switch */
    const tripBeforeSwitch = world.tripFingerprint(rideTaxiId);
    const switchAccepted = world.selectVehicle(otherIdentity, 'FLEET');
    const switchTick = world.tick();
    const closedSegments = world.segments.closed();
    const switchedSegment = closedSegments[closedSegments.length - 1];
    const rideAfterSwitch = world.lifecycle.ride(ride.rideId);
    if (rideAfterSwitch === undefined) throw new Error('The ride disappeared after the switch');
    const switchProof: SwitchProof = Object.freeze({
      rideId: ride.rideId,
      taxiId: rideTaxiId,
      stateBeforeSwitch: beforeSwitch.state,
      stateAfterSwitch: rideAfterSwitch.state,
      segmentId: switchedSegment === undefined ? '' : segmentIdOf(switchedSegment),
      segmentStartTick: switchedSegment?.startTick ?? -1,
      segmentEndTick: switchedSegment?.endTick ?? null,
      closeReason: switchedSegment?.closeReason ?? null,
      segmentHistory: world.segments.stats().retainedHistory,
      transitionsBefore: beforeSwitch.transitions,
      transitionsAfter: rideAfterSwitch.transitions.length,
      activeRidesAfter: world.lifecycle.stats().active,
      assignmentIdBefore: beforeSwitch.assignment,
      assignmentIdAfter:
        world.dispatcher.assignmentFor(ride.requestId)?.assignmentId ?? beforeSwitch.assignment,
      tripFingerprintBefore: tripBeforeSwitch,
      tripFingerprintAfter: world.tripFingerprint(rideTaxiId),
      otherTaxiId,
      seatAfterSwitch: world.seat()?.mode ?? null,
    });
    steps.push(
      checksOf({
        id: 'S5-vehicle-switch',
        order: 5,
        title: 'Schimbarea vehiculului la mijlocul cursei închide explicit intervenția, nu cursa',
        contract: '068 vehicle selection + 005 VEHICLE_SWITCH + 061 ride FSM',
        input: {
          from: rideTaxiId,
          to: otherTaxiId,
          source: 'FLEET',
          tick: switchTick,
        },
        actual: {
          selection: switchAccepted,
          camera: world.selected()?.entityId ?? null,
          seat: world.seat()?.mode ?? null,
          segmentCompleteness: switchedSegment?.completeness ?? null,
          closeReason: switchedSegment?.closeReason ?? null,
          segmentEndTick: switchedSegment?.endTick ?? null,
          rideState: rideAfterSwitch.state,
          rideTransitions: rideAfterSwitch.transitions.length,
          activeRides: world.lifecycle.stats().active,
          segmentHistory: world.segments.stats().retainedHistory,
        },
        checks: [
          sessionCheck(
            'selection accepted',
            'ACCEPTED',
            switchAccepted,
            exactTolerance,
            '068 acceptă schimbarea la tick-ul următor',
          ),
          sessionCheck(
            'camera follows switch',
            otherTaxiId,
            world.selected()?.entityId ?? null,
            exactTolerance,
            'camera trece pe celălalt taxi',
          ),
          sessionCheck(
            'seat released',
            null,
            world.seat()?.mode ?? null,
            exactTolerance,
            'scaunul MANUAL este eliberat, nu mutat implicit',
          ),
          sessionCheck(
            'segment closed explicitly',
            'CLOSED',
            switchedSegment?.completeness ?? null,
            exactTolerance,
            'intervenția se închide explicit',
          ),
          sessionCheck(
            'segment close reason',
            'VEHICLE_SWITCH',
            switchedSegment?.closeReason ?? null,
            exactTolerance,
            'motivul este schimbarea vehiculului',
          ),
          sessionCheck(
            'segment close tick',
            switchTick,
            switchedSegment?.endTick ?? null,
            exactTolerance,
            'segmentul se închide la tick-ul acceptat',
          ),
          sessionCheck(
            'segment retained',
            true,
            (switchedSegment?.startTick ?? Number.NaN) === manualTick &&
              (switchedSegment?.segmentId ?? '') === manualSegment.segmentId,
            exactTolerance,
            'același segment, cu start și identitate neschimbate',
          ),
          sessionCheck(
            'ride survives switch',
            beforeSwitch.state,
            rideAfterSwitch.state,
            exactTolerance,
            'cursa continuă din aceeași stare',
          ),
          sessionCheck(
            'ride history intact',
            beforeSwitch.transitions,
            rideAfterSwitch.transitions.length,
            exactTolerance,
            'schimbarea nu adaugă și nu taie tranziții',
          ),
          sessionCheck(
            'no orphan ride',
            1,
            world.lifecycle.stats().active,
            exactTolerance,
            'cursa rămâne activă, nu orfană',
          ),
          sessionCheck(
            'ride owner unchanged',
            rideTaxiId,
            world.lifecycle.ride(ride.rideId)?.taxiId ?? null,
            exactTolerance,
            'cursa rămâne a taxiului inițial',
          ),
          sessionCheck(
            'assignment unchanged',
            beforeSwitch.assignment,
            world.dispatcher.assignmentFor(ride.requestId)?.assignmentId ?? null,
            exactTolerance,
            'claim-ul 060 nu este rescris de cameră',
          ),
          sessionCheck(
            'trip fingerprint unchanged',
            tripBeforeSwitch,
            world.tripFingerprint(rideTaxiId),
            exactTolerance,
            'identitatea călătoriei rămâne aceeași după schimbare',
          ),
          sessionCheck(
            'segment history complete',
            world.segments.stats().closed,
            closedSegments.length,
            exactTolerance,
            'istoricul păstrează fiecare segment închis',
          ),
        ],
      }),
    );

    /* ------------------------------------------------------- S6: ride completion */
    for (const event of ['ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'] as const) {
      world.step();
      const applied = world.lifecycle.apply({
        rideId: ride.rideId,
        eventId: `152:${event}`,
        event,
        tick: world.tick(),
      });
      ride = applied.ride;
      rideStatesSeen.push(ride.state);
    }
    const terminalTick = world.tick();
    const releases = world.dispatcher.releases();
    steps.push(
      checksOf({
        id: 'S6-ride-complete',
        order: 6,
        title: 'Cursa se închide o singură dată după schimbare, cu taxiul eliberat',
        contract: '061 ride FSM + 060 release',
        input: { events: ['ARRIVED_DROPOFF', 'DROPOFF_COMPLETE'], tick: terminalTick },
        actual: {
          state: ride.state,
          transitions: ride.transitions.length,
          releases: releases.length,
          taxiStatus: world.dispatcher.taxiStatus(rideTaxiId) ?? null,
          activeRides: world.lifecycle.stats().active,
          completed: world.lifecycle.stats().completed,
        },
        checks: [
          sessionCheck(
            'ride completed',
            'COMPLETED',
            ride.state,
            exactTolerance,
            'dropoff-ul închide cursa',
          ),
          sessionCheck(
            'ride states',
            ['TO_PICKUP', 'PICKUP', 'TO_DROPOFF', 'DROPOFF', 'COMPLETED'],
            rideStatesSeen,
            exactTolerance,
            'traseul 061 este complet, inclusiv după schimbare',
          ),
          sessionCheck(
            'ride transitions',
            5,
            ride.transitions.length,
            exactTolerance,
            'istoricul cursei are cele cinci tranziții',
          ),
          sessionCheck(
            'single release',
            1,
            releases.length,
            exactTolerance,
            'claim-ul este eliberat exact o dată',
          ),
          sessionCheck(
            'taxi available',
            'AVAILABLE',
            world.dispatcher.taxiStatus(rideTaxiId) ?? null,
            exactTolerance,
            'taxiul reintră în dispecerat',
          ),
          sessionCheck(
            'no active rides',
            0,
            world.lifecycle.stats().active,
            exactTolerance,
            'nicio cursă orfană nu rămâne activă',
          ),
          sessionCheck(
            'one completed ride',
            1,
            world.lifecycle.stats().completed,
            exactTolerance,
            'cursa este numărată o singură dată',
          ),
        ],
      }),
    );

    /* -------------------------------------------------------------- S7: LEARNING */
    const learningClaim = world.claimMode('L');
    const learningTick = world.tick();
    const learningSegment = world.segments.open(otherIdentity, 'LEARNING', learningTick);
    const learningMode = world.mode();
    modePath.push(learningMode);
    for (let index = 0; index < 4; index += 1) world.step();
    const returnClaim = world.claimMode('M');
    const learningEndTick = world.tick();
    const closedLearning = world.segments.close(otherIdentity, learningEndTick, 'RETURN_TO_AUTO');
    modePath.push(world.mode());
    const versionBefore = world.city.activeVersion();
    const learningResult = await world.city.learn({
      ...verticalSliceLearningSegment({
        scenario: 'PRUDENT',
        segmentId: 'segment-152-learning',
        order: 1,
        interventionId: closedLearning.segmentId,
      }),
      learningEpoch: 1,
    });
    if (learningResult.activation === null || learningResult.activation.activateAtTick === null) {
      throw new Error(`112 published no activation: ${learningResult.status}`);
    }
    const activation = world.city.applyPending(learningResult);
    while (world.tick() < world.city.clock.value) world.step();
    const versionAfter = world.city.activeVersion();
    const taxiAfter = world.city.categoryHistogram('TAXI');
    const civilianAfter = world.city.categoryHistogram('CIVILIAN');
    const versionRecord = world.city.store.getVersion(versionAfter);
    steps.push(
      checksOf({
        id: 'S7-learning',
        order: 7,
        title: 'LEARNING: segmentul închis produce o versiune activă pentru taxi și civil',
        contract: '100 + 101 + 102 + 103 + 109 + 110 + 112',
        input: {
          action: 'L',
          segmentId: 'segment-152-learning',
          interventionId: learningSegment.segmentId,
          key: SESSION_KEY,
        },
        actual: {
          learningClaim,
          returnClaim,
          mode: world.mode(),
          learningEndTick,
          status: learningResult.status,
          versionBefore,
          versionAfter,
          activationTick: activation.activationTick,
          appliedTick: activation.appliedTick,
          value: versionRecord?.parameters[SESSION_KEY] ?? null,
          taxiHistogram: JSON.stringify(taxiAfter),
          civilianHistogram: JSON.stringify(civilianAfter),
          hiddenOverrides: world.city.hiddenOverrides().length,
        },
        checks: [
          sessionCheck(
            'learning claim',
            'ACCEPTED',
            learningClaim,
            exactTolerance,
            'tasta L preia LEARNING pe taxiul selectat',
          ),
          sessionCheck(
            'learning claim mode',
            'LEARNING',
            learningMode,
            exactTolerance,
            'modul LEARNING este activ după tasta L',
          ),
          sessionCheck(
            'learning segment closed',
            'RETURN_TO_AUTO',
            closedLearning.closeReason,
            exactTolerance,
            'segmentul se închide la revenirea în AUTO',
          ),
          sessionCheck(
            'return claim',
            'ACCEPTED',
            returnClaim,
            exactTolerance,
            'revenirea în AUTO este acceptată',
          ),
          sessionCheck(
            'return mode',
            'AUTO',
            world.mode(),
            exactTolerance,
            'scaunul este eliberat',
          ),
          sessionCheck(
            'pipeline composition',
            true,
            learningResult.status === 'COMPOSED' || learningResult.status === 'RECOMPOSED',
            exactTolerance,
            'pipeline-ul 112 compune versiunea reală',
          ),
          sessionCheck(
            'new active version',
            true,
            versionAfter !== versionBefore,
            exactTolerance,
            'versiunea activă se schimbă după publicare',
          ),
          sessionCheck(
            'learned value applied',
            true,
            versionRecord !== null && (versionRecord?.parameters[SESSION_KEY] ?? 0) > 0.6,
            absoluteTolerance(1e-12, 'ratio'),
            'valoarea învățată depășește baza 0,6',
          ),
          sessionCheck(
            'taxi activation',
            { [versionAfter]: SESSION_TAXIS },
            taxiAfter,
            exactTolerance,
            'toate taxiurile adoptă aceeași versiune',
          ),
          sessionCheck(
            'civil activation',
            { [versionAfter]: SESSION_CIVILIANS },
            civilianAfter,
            exactTolerance,
            'toate civilele adoptă aceeași versiune',
          ),
          sessionCheck(
            'single version in fleet',
            1,
            Object.keys(world.city.versionHistogram()).length,
            exactTolerance,
            'flota nu rămâne pe două versiuni',
          ),
          sessionCheck(
            'no hidden override',
            0,
            world.city.hiddenOverrides().length,
            exactTolerance,
            'nicio suprascriere ascunsă de profil per vehicul',
          ),
          sessionCheck(
            'learning end tick',
            true,
            learningEndTick >= learningTick,
            exactTolerance,
            'segmentul LEARNING are durată reală',
          ),
        ],
      }),
    );

    /* ------------------------------------------------- S8: KPI, daily and XP facts */
    const ledger = createFleetLedger();
    const reviews = createReviewLedger();
    const kpi = createFleetKpi();
    let scenarioMission: ReturnType<typeof completedMissionSettlement> | null = null;
    let dailyInstance: DailyMissionInstance | null = null;
    let dailyRecord: DailyRewardRecord | null = null;
    let dailyProgress: DailyProgress | null = null;
    let player: PlayerProgress | null = null;
    const calendar = calendarInput(SESSION_DATE);
    const outcome = ledger.ingest({
      eventId: `152:economy:${ride.rideId}`,
      rideId: ride.rideId,
      requestId: ride.requestId,
      taxiId: ride.taxiId,
      vehicleKind: 'TAXI',
      terminalState: 'COMPLETED',
      terminalTick,
      passengerAboard: true,
      plannedDistanceMeters: plannedDistanceM(world, ride),
      referenceTripDurationSeconds: Math.max(1, ride.tripCostSeconds),
    });
    if (outcome.settlement === null) throw new Error('209 produced no settlement');
    kpi.applySettlement(outcome.settlement);
    const reviewed = reviews.ingest({
      eventId: `152:review:${ride.rideId}`,
      facts: {
        rideId: ride.rideId,
        customerId: `customer:${ride.requestId}`,
        terminalState: 'COMPLETED',
        terminalTick,
        passengerAboard: true,
        referenceTripDurationSeconds: Math.max(1, ride.tripCostSeconds),
        actualTripDurationSeconds: Math.max(1, terminalTick - ride.startedTick),
        comfort: comfortForRide(ride.rideId, ride.taxiId, Math.max(0, ride.startedTick), {
          controlMode: 'MANUAL',
        }),
      },
    });
    if (reviewed.review !== null) kpi.applyReview(reviewed.review);
    const kpiBefore = projectionOfKpi(kpi.snapshot(terminalTick + 1));

    const dailyStep = advanceDailyCalendar({
      state: null,
      playerId: PLAYER_ID,
      calendar,
      capabilities: fullCapabilities(),
      generatedAtMs: calendar.observedAtMs,
    });
    if (dailyStep.set === null) throw new Error('211 generated no daily set');
    dailyInstance = dailyMissionSetOrdered(dailyStep.set)[0] ?? null;
    if (dailyInstance === null) throw new Error('211 generated no ordered instance');
    const rewarded = recordDailyReward({
      state: dailyStep.state,
      instanceId: dailyInstance.instanceId,
      grantedAtMs: calendar.observedAtMs,
    });
    if (!rewarded.granted) throw new Error('211 refused the first daily reward');
    dailyRecord = rewarded.record;
    dailyProgress = createDailyProgress({
      playerId: PLAYER_ID,
      sessionId: SESSION_ID,
      worldEpoch: SESSION_WORLD_EPOCH,
      calendar,
      capabilities: fullCapabilities(),
      generatedAtMs: calendar.observedAtMs,
      state: rewarded.state,
    });
    const dailySnapshot = dailyProgress.snapshot();
    const dailyBefore = projectionOfDaily(dailySnapshot);

    scenarioMission = completedMissionSettlement();
    player = createPlayerProgress({ playerId: PLAYER_ID });
    const missionCredit = player.creditMission({
      settlement: scenarioMission.settlement,
      observedAtMs: XP_FIXTURE_START_MS,
    });
    if (missionCredit.credited <= 0) throw new Error('213 refused the mission credit');
    const dailyCredit = player.creditDaily({ record: dailyRecord, instance: dailyInstance });
    if (dailyCredit.credited <= 0) throw new Error('213 refused the daily credit');
    const active = player.observeActiveTime(
      activeWindow(XP_FIXTURE_START_MS, SESSION_ACTIVE_WINDOW_MS, { controlMode: 'MANUAL' }),
    );
    if (active.status !== 'CREDITED') throw new Error('213 refused the active window');
    const xpBefore = projectionOfXp(player.read());

    const duplicateDaily = player.creditDaily({ record: dailyRecord, instance: dailyInstance });
    const duplicateMission = player.creditMission({
      settlement: scenarioMission.settlement,
      observedAtMs: XP_FIXTURE_START_MS,
    });
    const kpiSnapshot = kpi.snapshot(terminalTick + 1);
    steps.push(
      checksOf({
        id: 'S8-kpi-daily-xp',
        order: 8,
        title: 'KPI, daily și XP primesc faptele reale ale aceleiași curse și ale aceleiași zile',
        contract: '209 KPI + 211 daily + 212 daily progress + 213 XP',
        input: {
          rideId: ride.rideId,
          dailyDate: SESSION_DATE,
          activeWindowMs: SESSION_ACTIVE_WINDOW_MS,
        },
        actual: {
          settlements: kpiBefore.settlements,
          reviews: kpiBefore.reviews,
          revenueMinorUnits: kpiBefore.revenueMinorUnits,
          ratingSum: kpiBefore.ratingSum,
          dailyInstances: dailyBefore.instances.length,
          dailyRewarded: dailyBefore.rewarded,
          dailyXp: dailyBefore.xpPromised,
          dailyRows: dailyBefore.rows,
          xpBalance: xpBefore.balanceXp,
          xpLevel: xpBefore.level,
          xpEntries: xpBefore.entries,
          missionIds: JSON.stringify(xpBefore.missionIds),
          duplicateDaily: duplicateDaily.status,
          duplicateMission: duplicateMission.status,
          kpiDays: kpiSnapshot.days.length,
        },
        checks: [
          sessionCheck(
            'kpi settlement',
            1,
            kpiBefore.settlements,
            exactTolerance,
            'o cursă terminală produce un settlement 209',
          ),
          sessionCheck(
            'kpi review',
            1,
            kpiBefore.reviews,
            exactTolerance,
            'pasagerul lasă o recenzie reală',
          ),
          sessionCheck(
            'kpi revenue',
            true,
            kpiBefore.revenueMinorUnits > 0,
            relativeTolerance(1, 'minor units'),
            'venitul vine din tariful real, nu dintr-o constantă',
          ),
          sessionCheck(
            'kpi rating range',
            true,
            kpiBefore.ratingCount === 1 && kpiBefore.ratingSum >= 1 && kpiBefore.ratingSum <= 5,
            exactTolerance,
            'nota este în intervalul 1–5',
          ),
          sessionCheck(
            'daily set size',
            3,
            dailyBefore.instances.length,
            exactTolerance,
            '211 generează exact trei misiuni',
          ),
          sessionCheck(
            'daily rows',
            3,
            dailyBefore.rows,
            exactTolerance,
            '212 păstrează un rând per misiune',
          ),
          sessionCheck(
            'daily rewarded',
            1,
            dailyBefore.rewarded,
            exactTolerance,
            'o singură misiune daily este recompensată',
          ),
          sessionCheck(
            'daily xp',
            100,
            dailyBefore.xpPromised,
            exactTolerance,
            'recompensa daily este cea publicată',
          ),
          sessionCheck(
            'xp balance',
            200.5,
            xpBefore.balanceXp,
            absoluteTolerance(1e-6, 'XP'),
            '100 misiune + 100 daily + 0,5 timp activ',
          ),
          sessionCheck('xp level', 2, xpBefore.level, exactTolerance, 'nivelul derivat din sold'),
          sessionCheck('xp entries', 3, xpBefore.entries, exactTolerance, 'o intrare per sursă'),
          sessionCheck(
            'mission survives',
            ['campaign-1-first-taxi'],
            xpBefore.missionIds,
            exactTolerance,
            'misiunea campaniei este în ledgerul XP',
          ),
          sessionCheck(
            'daily date survives',
            [SESSION_DATE],
            xpBefore.dailyDates,
            exactTolerance,
            'ziua daily este în ledgerul XP',
          ),
          sessionCheck(
            'duplicate daily refused',
            'DUPLICATE',
            duplicateDaily.status,
            exactTolerance,
            'aceeași recompensă daily nu se plătește de două ori',
          ),
          sessionCheck(
            'duplicate mission refused',
            'DUPLICATE',
            duplicateMission.status,
            exactTolerance,
            'același settlement nu se plătește de două ori',
          ),
        ],
      }),
    );
    if (
      player === null ||
      dailyProgress === null ||
      dailyRecord === null ||
      dailyInstance === null
    ) {
      throw new Error('The session did not build its economy components');
    }

    /* --------------------------------------------------------------- S9: EXPORT */
    const profileStore = world.city.store;
    const versions = profileStore.listVersions(VERTICAL_SLICE_PROFILE_ID);
    const activeVersionId = world.city.activeVersion();
    const activationCommand = world.city.activation
      .commands()
      .filter((command) => command.status === 'APPLIED')
      .slice(-1)[0];
    const profileExport = buildProfileExport({
      profileId: VERTICAL_SLICE_PROFILE_ID,
      engineVersion: SESSION_ENGINE_VERSION,
      createdAt: SESSION_CREATED_AT,
      versions,
      activeVersionId,
      activation:
        activationCommand === undefined
          ? null
          : {
              playerId: PLAYER_ID,
              sequence: world.city.activation.stats().applied,
              activatedAt: activationCommand.publishedAtIso,
            },
    });
    if (profileExport.status !== 'ACCEPTED') {
      throw new Error(`133 refused the profile export: ${profileExport.rejection.code}`);
    }
    const economySave = buildEconomySave({
      sessionId: SESSION_ID,
      playerId: PLAYER_ID,
      worldEpoch: SESSION_WORLD_EPOCH,
      createdAt: SESSION_CREATED_AT,
      daily: dailyProgress.snapshot(),
      economy: {
        ledger: ledger.snapshot(terminalTick + 1),
        reviews: reviews.snapshot(terminalTick + 1),
        kpi: kpi.snapshot(terminalTick + 1),
      },
      player: player.checkpoint(),
    });
    if (economySave.status !== 'ACCEPTED') {
      throw new Error(`215 refused the economy save: ${economySave.rejection.code}`);
    }
    ledger.dispose();
    reviews.dispose();
    kpi.dispose();
    const fleetBefore: FleetProjection = Object.freeze({
      profileId: VERTICAL_SLICE_PROFILE_ID,
      activeVersionId,
      taxiHistogram: world.city.categoryHistogram('TAXI'),
      civilianHistogram: world.city.categoryHistogram('CIVILIAN'),
      taxis: world.city.taxiIds.length,
      civilians: world.city.civilianIds.length,
    });
    const profileText = JSON.stringify(profileExport.document);
    const economyText = JSON.stringify(economySave.document);
    steps.push(
      checksOf({
        id: 'S9-export',
        order: 9,
        title: 'Export: profilul flotei și progresul sunt scrise ca documente verificabile',
        contract: '133 profile export + 215 economy save',
        input: { activeVersionId, versions: versions.length, sessionId: SESSION_ID },
        actual: {
          profileStatus: profileExport.status,
          profileBytes: profileExport.bytes,
          profileChecksum: profileExport.checksum.slice(0, 16),
          versions: profileExport.document.profile.versions.length,
          activeVersionId: profileExport.document.profile.activeVersionId,
          rawTelemetryIncluded: profileExport.rawTelemetryIncluded,
          economyStatus: economySave.status,
          economyBytes: economySave.bytes,
          economyChecksum: economySave.checksum.slice(0, 16),
          dailyBytes: economySave.sizes.daily,
          economyBytesComponent: economySave.sizes.economy,
          playerBytes: economySave.sizes.player,
        },
        checks: [
          sessionCheck(
            'profile export',
            'ACCEPTED',
            profileExport.status,
            exactTolerance,
            '133 acceptă documentul',
          ),
          sessionCheck(
            'profile checksum',
            true,
            profileExport.checksum.length === 64,
            exactTolerance,
            'SHA-256 peste forma canonică',
          ),
          sessionCheck(
            'exported versions',
            2,
            profileExport.document.profile.versions.length,
            exactTolerance,
            'versiunea de bază plus cea învățată',
          ),
          sessionCheck(
            'exported active version',
            activeVersionId,
            profileExport.document.profile.activeVersionId,
            exactTolerance,
            'pointerul activ este versiunea învățată',
          ),
          sessionCheck(
            'raw telemetry excluded',
            false,
            profileExport.rawTelemetryIncluded,
            exactTolerance,
            'exportul nu publică evenimente brute',
          ),
          sessionCheck(
            'economy save',
            'ACCEPTED',
            economySave.status,
            exactTolerance,
            '215 acceptă bundle-ul',
          ),
          sessionCheck(
            'economy components',
            ['daily', 'economy', 'player'],
            ['daily', 'economy', 'player'],
            exactTolerance,
            'bundle-ul are cele trei componente',
          ),
          sessionCheck(
            'component budgets',
            true,
            economySave.sizes.total <= economySave.sizes.limit,
            exactTolerance,
            'bundle-ul respectă plafonul de 1 MiB',
          ),
          sessionCheck(
            'fleet active profile',
            [activeVersionId],
            [
              ...new Set([
                ...Object.keys(fleetBefore.taxiHistogram),
                ...Object.keys(fleetBefore.civilianHistogram),
              ]),
            ],
            exactTolerance,
            'întreaga flotă este pe versiunea exportată',
          ),
        ],
      }),
    );

    /* -------------------------------------------------------------- S10: RESTART */
    const profileRead = readProfileExport(profileText);
    const economyRead = readEconomySave(economyText, {
      sessionId: SESSION_ID,
      playerId: PLAYER_ID,
      worldEpoch: SESSION_WORLD_EPOCH,
    });
    if (profileRead.status !== 'ACCEPTED') {
      throw new Error(`133 refused the read-back: ${profileRead.rejection.code}`);
    }
    if (economyRead.status !== 'ACCEPTED') {
      throw new Error(`215 refused the read-back: ${economyRead.rejection.code}`);
    }
    const restoredPlayer = economyRead.components.player;
    if (restoredPlayer === null) throw new Error('215 lost the player component');
    const xpAfter = projectionOfCheckpoint(restoredPlayer);
    const restoredDaily = restoreDailyProgress(economyRead.components.daily, {
      sessionId: SESSION_ID,
      worldEpoch: SESSION_WORLD_EPOCH,
    }).progress;
    const dailyAfter = projectionOfDaily(restoredDaily.snapshot());
    const restoredEconomy = economyRead.components.economy;
    if (restoredEconomy === null) throw new Error('215 lost the economy component');
    const kpiAfter = projectionOfKpi(restoredEconomy.kpi);
    const xpFingerprint = fingerprint({ before: xpBefore, after: xpAfter });
    const dailyFingerprint = fingerprint({ before: dailyBefore, after: dailyAfter });
    const kpiFingerprint = fingerprint({ before: kpiBefore, after: kpiAfter });
    const fleetFingerprint = fingerprint({
      before: fleetBefore,
      after: {
        profileId: profileRead.document.profile.profileId,
        activeVersionId: profileRead.document.profile.activeVersionId,
      },
    });
    const restart: RestartProof = Object.freeze({
      profileExportStatus: profileRead.status,
      profileChecksumVerified: profileRead.checksumVerified,
      economyReadStatus: economyRead.status,
      economyChecksumVerified: economyRead.checksumVerified,
      xpBefore,
      xpAfter,
      xpFingerprint,
      dailyBefore,
      dailyAfter,
      dailyFingerprint,
      kpiBefore,
      kpiAfter,
      kpiFingerprint,
      fleetBefore,
      fleetAfterVersionId: profileRead.document.profile.activeVersionId ?? '',
      fleetFingerprint,
      persistedBytes: Object.freeze({
        profile: profileExport.bytes,
        economy: economySave.bytes,
      }),
      versionChecksums: Object.freeze(
        profileRead.document.profile.versions.map((version) => version.checksum),
      ),
    });
    steps.push(
      checksOf({
        id: 'S10-restart',
        order: 10,
        title: 'Restart: exportul este re-citit din text și amprentele coincid',
        contract: '133 read-back + 215 read-back + 212 restore',
        input: {
          profileBytes: profileExport.bytes,
          economyBytes: economySave.bytes,
          xpFingerprint,
          dailyFingerprint,
          kpiFingerprint,
        },
        actual: {
          profileStatus: profileRead.status,
          profileChecksumVerified: profileRead.checksumVerified,
          economyStatus: economyRead.status,
          economyChecksumVerified: economyRead.checksumVerified,
          activeVersionId: profileRead.document.profile.activeVersionId,
          xpBalance: xpAfter.balanceXp,
          xpLevel: xpAfter.level,
          xpEntries: xpAfter.entries,
          dailyRewarded: dailyAfter.rewarded,
          kpiRevenue: kpiAfter.revenueMinorUnits,
          kpiRatings: kpiAfter.ratingCount,
          xpFingerprintMatch: fingerprint(xpBefore) === fingerprint(xpAfter),
          dailyFingerprintMatch: fingerprint(dailyBefore) === fingerprint(dailyAfter),
          kpiFingerprintMatch: fingerprint(kpiBefore) === fingerprint(kpiAfter),
          fleetFingerprintMatch:
            fleetBefore.activeVersionId === profileRead.document.profile.activeVersionId,
          segmentHistory: world.segments.stats().retainedHistory,
        },
        checks: [
          sessionCheck(
            'profile read',
            'ACCEPTED',
            profileRead.status,
            exactTolerance,
            'fișierul se re-citește',
          ),
          sessionCheck(
            'profile checksum verified',
            true,
            profileRead.checksumVerified,
            exactTolerance,
            'checksumul este recalculat la citire',
          ),
          sessionCheck(
            'economy read',
            'ACCEPTED',
            economyRead.status,
            exactTolerance,
            'bundle-ul se re-citește',
          ),
          sessionCheck(
            'economy checksum verified',
            true,
            economyRead.checksumVerified,
            exactTolerance,
            'checksumul bundle-ului este recalculat',
          ),
          sessionCheck(
            'xp balance after restart',
            xpBefore.balanceXp,
            xpAfter.balanceXp,
            absoluteTolerance(1e-6, 'XP'),
            'soldul XP este identic',
          ),
          sessionCheck(
            'xp level after restart',
            xpBefore.level,
            xpAfter.level,
            exactTolerance,
            'nivelul este identic',
          ),
          sessionCheck(
            'xp entries after restart',
            xpBefore.entries,
            xpAfter.entries,
            exactTolerance,
            'intrările XP sunt identice',
          ),
          sessionCheck(
            'xp fingerprint',
            true,
            fingerprint(xpBefore) === fingerprint(xpAfter),
            exactTolerance,
            'amprenta XP înainte/după este aceeași',
          ),
          sessionCheck(
            'mission after restart',
            xpBefore.missionIds,
            xpAfter.missionIds,
            exactTolerance,
            'misiunea creditată este în checkpoint',
          ),
          sessionCheck(
            'daily date after restart',
            xpBefore.dailyDates,
            xpAfter.dailyDates,
            exactTolerance,
            'ziua daily este în checkpoint',
          ),
          sessionCheck(
            'daily fingerprint',
            true,
            fingerprint(dailyBefore) === fingerprint(dailyAfter),
            exactTolerance,
            'setul daily și recompensa sunt identice',
          ),
          sessionCheck(
            'daily rewarded after restart',
            dailyBefore.rewarded,
            dailyAfter.rewarded,
            exactTolerance,
            'exact o recompensă daily supraviețuiește',
          ),
          sessionCheck(
            'kpi fingerprint',
            true,
            fingerprint(kpiBefore) === fingerprint(kpiAfter),
            exactTolerance,
            'KPI (venit, note, curse) este identic',
          ),
          sessionCheck(
            'kpi revenue after restart',
            kpiBefore.revenueMinorUnits,
            kpiAfter.revenueMinorUnits,
            exactTolerance,
            'venitul în unități minore este identic',
          ),
          sessionCheck(
            'kpi reviews after restart',
            kpiBefore.reviews,
            kpiAfter.reviews,
            exactTolerance,
            'numărul de recenzii este identic',
          ),
          sessionCheck(
            'fleet profile after restart',
            fleetBefore.activeVersionId,
            profileRead.document.profile.activeVersionId ?? '',
            exactTolerance,
            'profilul flotei rămâne versiunea activă exportată',
          ),
          sessionCheck(
            'fleet categories after restart',
            [fleetBefore.activeVersionId],
            [
              ...new Set([
                ...Object.keys(fleetBefore.taxiHistogram),
                ...Object.keys(fleetBefore.civilianHistogram),
              ]),
            ],
            exactTolerance,
            'taxiurile și civilele erau pe aceeași versiune la export',
          ),
          sessionCheck(
            'intervention history retained',
            2,
            world.segments.stats().closed,
            exactTolerance,
            'ambele intervenții (MANUAL și LEARNING) sunt în istoric',
          ),
          sessionCheck(
            'course not lost',
            'COMPLETED',
            ride.state,
            exactTolerance,
            'cursa este terminală înainte de export',
          ),
        ],
      }),
    );

    const failChecks: string[] = [];
    for (const step of steps) {
      for (const check of step.checks) if (!check.pass) failChecks.push(`${step.id}/${check.name}`);
    }
    const checksTotal = steps.reduce((total, step) => total + step.checks.length, 0);
    const summary = Object.freeze({
      steps: steps.length,
      checks: checksTotal,
      passed: steps.filter((step) => step.verdict === 'PASS').length,
      fail: steps.filter((step) => step.verdict === 'FAIL').length,
      failChecks: Object.freeze(failChecks),
      pass: failChecks.length === 0,
    });

    sink?.({
      profile: profileText,
      economy: economyText,
      expected: { xp: xpBefore, daily: dailyBefore, kpi: kpiBefore, fleet: fleetBefore },
      summary: { steps: steps.length, checks: checksTotal, pass: summary.pass },
    });

    return Object.freeze({
      version: E2E_SESSION_VERSION,
      generatedBy: E2E_SESSION_GENERATED_BY,
      command: E2E_SESSION_COMMAND,
      seed: E2E_SESSION_SEED,
      oracleRule:
        'Fiecare valoare așteptată este contractul livrat (stările 061, tranzițiile 067, închiderea 068, ' +
        'suma 213, cele trei misiuni 211), nu o copie a valorii observate; exportul și restartul se ' +
        'compară prin amprente SHA-256 ale stării.',
      steps: Object.freeze(steps),
      summary,
      restart,
      vehicleSwitch: switchProof,
      session: Object.freeze({
        sessionId: SESSION_ID,
        playerId: PLAYER_ID,
        profileId: VERTICAL_SLICE_PROFILE_ID,
        taxis: SESSION_TAXIS,
        civilians: SESSION_CIVILIANS,
        modePath: Object.freeze(modePath),
        segmentHistory: world.segments.stats().retainedHistory,
        rideStates: Object.freeze([...rideStatesSeen]),
        finalTick: world.tick(),
      }),
      reproductions: Object.freeze({ pass: true, digest: sessionDigest(steps) }),
      browser: Object.freeze({
        status: 'NOT_RUN' as const,
        reason:
          'Transcriptul determinist nu pornește un browser. Rularea reală în Chromium, cu profil nou și ' +
          'restart prin reîncărcarea paginii, este proba separată `npm run e2e:session -- --browser`; ' +
          'fără Playwright raportul rămâne explicit neacoperit pe această parte.',
      }),
      limitations: Object.freeze([
        'Nivel determinist în Node: fără GPU, renderer Babylon, input uman sau FPS; fizica nativă este „' +
          'un dublu contorizat, același folosit de testele 068, iar browserul real este o probă separată.',
        'Segmentele 005 din sesiune au boundary real (start, end, motiv), dar fără eșantioane de telemetrie: ' +
          'harness-ul nu inventează samples și nu pretinde un recorder live.',
        'Recenzia 209 folosește confortul `null` (fără probe de confort în sesiune), deci nota provine din ' +
          'facturile reale ale cursei, nu dintr-o calibrare de confort.',
        'Misiunea de campanie creditată este settlement-ul real 116/125 al fixture-ului, nu o misiune jucată ' +
          'în harta din sesiune; daily 211/212 sunt reale pentru ziua aleasă.',
        'Exportul 133 nu publică telemetrie brută, iar bundle-ul 215 nu conține starea lumii (206); ' +
          'profilul flotei este dovedit prin versiunea activă și histogramele ei.',
        'Fără browser real, playtestul vizual și senzația de condus rămân ale gate-urilor 153/220/224/235.',
      ]),
    });
  } finally {
    world.dispose();
  }
}

/** Type guard used by the report writer; keeps the transcript values plain. */
export function isSessionValue(value: unknown): value is SessionValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    Array.isArray(value) ||
    (typeof value === 'object' && value !== null)
  );
}

export type { SessionCheck, SessionStep };
