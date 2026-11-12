/**
 * PBI 156 — benchmark-ul flotei și al traficului, executat rând cu rând.
 *
 * Matricea are patru axe: numărul de taxiuri (20/24/30), densitatea de civili (20/40/80), sistemul
 * atașat (baseline, learning, recorder+autosave, credite XP) și condiția (normal, trafic
 * agresiv/contacte, cold/first-use). Fiecare rând este **executat** pe contractele reale — 057
 * populație, 058 trafic civil, 059/060 cerere+dispecer, 036 semafoare, 044 context rutier, 024
 * controller, 022/028 fizică Rapier și publicare de contacte — plus sistemul atașat: pipeline-ul
 * 103→112, recorder-ul 207 cu capture de checkpoint 206/222, respectiv creditele 213.
 *
 * Separează CPU-ul pe componente (fizică Rapier, decizii, UI proiectat fără DOM, sistem atașat) și
 * declară `NOT_MEASURED` pentru ce nu poate fi măsurat fără renderer (GPU fără timer, frame, paint
 * DOM, memoria exactă). Bugetele sunt citite din manifestul 203 și **nu** sunt modificate.
 *
 * Modulul nu atinge `src/`; refolosește harness-ul 155 pentru percentile, sumare, citirea
 * manifestului și verdictul „un PASS fără măsurătoare nu există”.
 */
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createVehicleController } from '../../src/vehicles';
import type { BodyIdentity, BodyState, VehicleCommandPacket } from '../../src/vehicles';
import { createCollisionEventAdapter, createEventBus } from '../../src/simulation';
import { createRoadContext } from '../../src/autonomy';
import type { RoadContextFrame } from '../../src/autonomy';
import { createCandidateProfileStore } from '../../src/learning';
import { getParameterDefinition, parseDrivingProfile } from '../../src/profiles';
import type { DrivingProfile } from '../../src/profiles';
import {
  createCivilTraffic,
  createFleetScenario,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetScenario } from '../../src/fleet';
import { createSignalController } from '../../src/world';
import type { LaneGraph } from '../../src/world';
import { createProfilePipeline } from '../../src/app/profile-pipeline';
import type { ProfileLearningSegment, ProfilePipeline } from '../../src/app/profile-pipeline';
import {
  VERTICAL_SLICE_ENGINE_VERSION,
  VERTICAL_SLICE_PLAYER_ID,
  VERTICAL_SLICE_SESSION_ID,
  VERTICAL_SLICE_WORLD_EPOCH,
  verticalSliceBaseParameters,
  verticalSliceLearningSegment,
} from '../../src/app/vertical-slice';
import { createMetricService } from '../../src/experiments';
import { readMetricSnapshot } from '../../src/app/metric-service';
import { createPlayerProgress } from '../../src/missions';
import { createWorldRecorder } from '../../src/replay';
import { captureWorldSnapshot } from '../../src/persistence';
import type { WorldCaptureInput, WorldSnapshot } from '../../src/persistence';
import { projectTaxiHud, TAXI_HUD_VERSION } from '../../src/ui/taxi-hud-format';
import { FLEET_PANEL_VERSION, projectFleetPanel } from '../../src/ui/fleet-panel-format';
import { createLearningQueueHarness } from './learning-queue-harness';
import { activeWindow, XP_FIXTURE_START_MS } from '../missions/player-xp-fixture';
import { syntheticRouteSearch } from '../simulation/scheduling-reference';
import { budgetSource, round, summarize } from './hardware-budget';
import type { BudgetManifest, StatisticSummary, Verdict } from './hardware-budget';

export const TRAFFIC_BENCHMARK_VERSION = '156-traffic-benchmark-v1' as const;

/** The 065 population fixture caps authoritative civilians at 40; 80 is a declared surplus probe. */
export const AUTHORITATIVE_CIVILIAN_MAXIMUM = 40;

export const TRAFFIC_TAXI_COUNTS = Object.freeze([20, 24, 30] as const);
export const TRAFFIC_CIVIL_DENSITIES = Object.freeze([20, 40, 80] as const);
export const TRAFFIC_SYSTEM_IDS = Object.freeze([
  'BASELINE',
  'LEARNING',
  'RECORDER_AUTOSAVE',
  'XP',
] as const);
export const TRAFFIC_CONDITIONS = Object.freeze([
  'NORMAL',
  'AGGRESSIVE',
  'COLD_FIRST_USE',
] as const);

export type TrafficTaxiCount = (typeof TRAFFIC_TAXI_COUNTS)[number];
export type TrafficCivilDensity = (typeof TRAFFIC_CIVIL_DENSITIES)[number];
export type TrafficSystemId = (typeof TRAFFIC_SYSTEM_IDS)[number];
export type TrafficConditionId = (typeof TRAFFIC_CONDITIONS)[number];

export const TRAFFIC_WARMUP_TICKS = 30;
export const TRAFFIC_MEASURED_TICKS = 180;
export const TRAFFIC_COLD_TICKS = 120;
export const TRAFFIC_REPEATS = 2;
export const TRAFFIC_COLD_REPEATS = 1;
export const TRAFFIC_AUTOSAVE_CADENCE_TICKS = 90;
export const TRAFFIC_LEARNING_CADENCE_TICKS = 300;
export const TRAFFIC_XP_WINDOW_TICKS = 300;
export const TRAFFIC_UI_CADENCE_TICKS = 6;
export const TRAFFIC_DECISION_CADENCE_TICKS = 6;
export const TRAFFIC_OBSERVATION_HALF_EXTENT_M = 80;
export const TRAFFIC_SEED = 156_001;
const FIXTURE_NOW = '2026-11-12T00:00:00.000Z';
const TICK_SECONDS = 1 / 60;

/** Manifest workloads: only these four combinations are declared, the rest are reported. */
export function trafficClassification(
  taxis: number,
  civilians: number,
): 'GATE' | 'STRESS' | 'REPORTED' {
  if (taxis === 30 && civilians === 80) return 'STRESS';
  if (
    (taxis === 20 && civilians === 20) ||
    (taxis === 24 && civilians === 40) ||
    (taxis === 30 && civilians === 40)
  )
    return 'GATE';
  return 'REPORTED';
}

export interface TrafficRowSpec {
  readonly id: string;
  readonly taxis: TrafficTaxiCount;
  readonly civilians: TrafficCivilDensity;
  readonly system: TrafficSystemId;
  readonly condition: TrafficConditionId;
  readonly classification: 'GATE' | 'STRESS' | 'REPORTED';
  readonly authoritativeCivilians: number;
  readonly surplusCivilians: number;
}

export function trafficRowId(
  taxis: TrafficTaxiCount,
  civilians: TrafficCivilDensity,
  system: TrafficSystemId,
  condition: TrafficConditionId,
): string {
  return `156-${taxis}x${civilians}-${system.toLowerCase()}-${condition.toLowerCase()}`;
}

/** Full four-axis matrix; every combination is executed, none is skipped to look better. */
export function expandTrafficMatrix(): readonly TrafficRowSpec[] {
  const rows: TrafficRowSpec[] = [];
  for (const taxis of TRAFFIC_TAXI_COUNTS)
    for (const civilians of TRAFFIC_CIVIL_DENSITIES)
      for (const system of TRAFFIC_SYSTEM_IDS)
        for (const condition of TRAFFIC_CONDITIONS)
          rows.push(
            Object.freeze({
              id: trafficRowId(taxis, civilians, system, condition),
              taxis,
              civilians,
              system,
              condition,
              classification: trafficClassification(taxis, civilians),
              authoritativeCivilians: Math.min(civilians, AUTHORITATIVE_CIVILIAN_MAXIMUM),
              surplusCivilians: Math.max(0, civilians - AUTHORITATIVE_CIVILIAN_MAXIMUM),
            }),
          );
  return Object.freeze(rows);
}

/* ------------------------------------------------------------------ measurement types */

export interface TrafficCpuBreakdown {
  /** Whole authoritative tick: physics, decisions, UI, system work and the glue between them. */
  readonly tick: StatisticSummary;
  /** Rapier step reported by the real 022 probe. */
  readonly physics: StatisticSummary;
  /** Command realization reported by the real 024 controller, excluding the Rapier step. */
  readonly controller: StatisticSummary;
  /** Context 044, civil decisions 058, dispatch 059/060 and the command policy. */
  readonly decisions: StatisticSummary;
  /** DOM-free 073/075 projections at the HUD cadence. */
  readonly ui: StatisticSummary;
  /** Attached system work, sampled only on the ticks where it actually ran. */
  readonly system: StatisticSummary;
}

export interface TrafficRepeatMeasurement {
  readonly repeat: number;
  readonly ticks: number;
  readonly simulatedSeconds: number;
  readonly wallMs: number;
  readonly cpu: TrafficCpuBreakdown;
  readonly contactsMax: number;
  readonly collisionEvents: number;
  readonly minPairGapM: number | null;
  readonly pairLeaderSpeedMax: number;
  readonly pairFollowerSpeedMax: number;
  readonly decisions: number;
  readonly invisibleDecisions: number;
  readonly taxisMoved: number;
  readonly systemInvocations: number;
  readonly uiInvocations: number;
  readonly learningSegments: number;
  readonly learningActivations: number;
  readonly learningEndToEndMs: readonly number[];
  readonly recorderSamples: number;
  readonly recorderPeakBytes: number;
  readonly autosaveCaptures: number;
  readonly autosaveBytes: number;
  readonly xpWindows: number;
  readonly xpEntries: number;
  readonly fleetVehicles: number;
  readonly fleetVehicleSeconds: number;
  readonly invisibleTaxis: number;
  readonly invisibleVehicles: number;
  readonly physicalVehicles: number;
  readonly surplusActors: number;
  readonly coldFirstCommandMs: number | null;
  readonly cleanupLeaked: boolean;
}

interface RunResult {
  readonly measurement: TrafficRepeatMeasurement;
  readonly samples: {
    tick: number[];
    physics: number[];
    controller: number[];
    decisions: number[];
    ui: number[];
    system: number[];
  };
}

export interface TrafficRowMeasurement {
  readonly spec: TrafficRowSpec;
  readonly repeats: readonly TrafficRepeatMeasurement[];
  readonly pooled: TrafficCpuBreakdown;
  readonly perRepeatP95: readonly Readonly<{
    repeat: number;
    tick: number;
    physics: number;
    decisions: number;
    ui: number;
    system: number;
  }>[];
  readonly simulatedSeconds: number;
  readonly wallSeconds: number;
  readonly expectedTaxis: number;
  readonly expectedCivilians: number;
  readonly physicalVehicles: number;
  readonly surplusActors: number;
  readonly invisibleTaxis: number;
  readonly invisibleVehicles: number;
  readonly invisibleTaxiDecisions: number;
  readonly invisibleTaxiBodiesMoved: number;
  readonly fleetVehicles: number;
  readonly fleetVehicleSeconds: number;
  readonly exposureSeconds: number;
  readonly contactsMax: number;
  readonly collisionEvents: number;
  readonly learningSegments: number;
  readonly learningActivations: number;
  readonly learningEndToEndMs: StatisticSummary | null;
  readonly recorderPeakBytes: number | null;
  readonly recorderSamples: number;
  readonly autosaveCaptures: number;
  readonly autosaveBytes: number;
  readonly xpWindows: number;
  readonly xpEntries: number;
  readonly coldFirstCommandMs: number | null;
  readonly cleanupLeaked: boolean;
  readonly structural: readonly Readonly<{ id: string; pass: boolean; detail: string }>[];
}

export interface TrafficBenchmarkMeasurement {
  readonly version: typeof TRAFFIC_BENCHMARK_VERSION;
  readonly measuredAt: string;
  readonly machine: string;
  readonly command: string;
  readonly protocol: Readonly<{
    warmupTicks: number;
    measuredTicks: number;
    coldTicks: number;
    repeats: number;
    coldRepeats: number;
    autosaveCadenceTicks: number;
    learningCadenceTicks: number;
    xpWindowTicks: number;
    uiCadenceTicks: number;
    decisionCadenceTicks: number;
    observationHalfExtentM: number;
    seed: number;
  }>;
  readonly rows: readonly TrafficRowMeasurement[];
}

export interface MeasureTrafficOptions {
  readonly measuredAt: string;
  readonly machine: string;
  readonly command: string;
  /** Debug/recovery filter; the committed artifact always measures the complete matrix. */
  readonly only?: readonly string[];
  readonly onRow?: (row: TrafficRowMeasurement, index: number, total: number) => void;
}

/* ------------------------------------------------------------------ report types */

export interface TrafficBudgetCheck {
  readonly id: string;
  readonly metric: string;
  readonly actual: number | null;
  readonly budget: number | null;
  readonly unit: string;
  readonly direction: 'maximum' | 'minimum';
  readonly source: string;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface TrafficBenchmarkRow {
  readonly id: string;
  readonly spec: TrafficRowSpec;
  readonly workload: string;
  readonly classification: TrafficRowSpec['classification'];
  readonly ticks: number;
  readonly simulatedSeconds: number;
  readonly wallSeconds: number;
  readonly cpu: TrafficCpuBreakdown;
  readonly perRepeatP95: TrafficRowMeasurement['perRepeatP95'];
  readonly gpu: Readonly<{ verdict: 'NOT_MEASURED'; reason: string }>;
  readonly exposure: Readonly<{
    fleetVehicles: number;
    simulatedSeconds: number;
    fleetVehicleSeconds: number;
    invisibleTaxis: number;
    invisibleShare: number;
    invisibleTaxiDecisions: number;
    invisibleTaxiBodiesMoved: number;
  }>;
  readonly checks: readonly TrafficBudgetCheck[];
  readonly stressOverBudget: readonly string[];
  readonly verdict: 'PASS' | 'FAIL' | 'STRESS' | 'REPORTED';
  readonly findings: readonly string[];
}

export interface TrafficBenchmarkReport {
  readonly version: typeof TRAFFIC_BENCHMARK_VERSION;
  readonly measuredAt: string;
  readonly machine: string;
  readonly command: string;
  readonly manifest: Readonly<{
    budgetVersion: string;
    status: string;
    approvedGate: boolean;
    modified: false;
  }>;
  readonly protocol: TrafficBenchmarkMeasurement['protocol'];
  readonly matrix: Readonly<{
    taxis: readonly number[];
    civilians: readonly number[];
    systems: readonly TrafficSystemId[];
    conditions: readonly TrafficConditionId[];
    rows: number;
    gateRows: number;
    stressRows: number;
    reportedRows: number;
  }>;
  readonly rows: readonly TrafficBenchmarkRow[];
  readonly summary: Readonly<{
    pass: number;
    fail: number;
    stress: number;
    reported: number;
    gate: 'MEASURED_GATE_PASS' | 'FAILED';
    hardwareGameplayGate: 'NOT_VALIDATED';
    note: string;
  }>;
  readonly notMeasured: readonly Readonly<{
    metric: string;
    reason: string;
    measuredInstead: string;
  }>[];
}

const WORKLOAD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  '20x20': 'manifest scaling 20 taxiuri / 20 civili',
  '24x40': 'manifest normal 24 taxiuri / 40 civili',
  '30x40': 'manifest maximum V1 30 taxiuri / 40 civili',
  '30x80': 'manifest overload 30 taxiuri / 80 civili',
});

function workloadLabel(spec: TrafficRowSpec): string {
  return WORKLOAD_LABELS[`${spec.taxis}x${spec.civilians}`] ?? 'în afara workload-urilor declarate';
}

function check(input: {
  id: string;
  metric: string;
  actual: number | null;
  budget: number | null;
  unit: string;
  direction: 'maximum' | 'minimum';
  source: string;
  note?: string;
}): TrafficBudgetCheck {
  const within =
    input.actual === null || input.budget === null
      ? false
      : input.direction === 'maximum'
        ? input.actual <= input.budget
        : input.actual >= input.budget;
  return Object.freeze({
    id: input.id,
    metric: input.metric,
    actual: input.actual === null ? null : round(input.actual),
    budget: input.budget,
    unit: input.unit,
    direction: input.direction,
    source: input.source,
    verdict: (input.actual === null || input.budget === null
      ? 'NOT_MEASURED'
      : within
        ? 'PASS'
        : 'FAIL') as Verdict,
    note: input.note ?? '',
  });
}

/** Reads the budgets from the fixed 203 manifest; nothing here defines or relaxes one. */
export function buildTrafficBenchmarkReport(input: {
  readonly manifest: BudgetManifest;
  readonly measurement: TrafficBenchmarkMeasurement;
}): TrafficBenchmarkReport {
  const { manifest, measurement } = input;
  if (measurement.rows.length < 1) throw new RangeError('The benchmark needs measured rows');
  const budgets = manifest.proposedBudgets.laptop;
  const rows: TrafficBenchmarkRow[] = [];
  for (const row of measurement.rows) {
    const { spec } = row;
    const checks: TrafficBudgetCheck[] = [];
    checks.push(
      check({
        id: `${spec.id}-tick-p95`,
        metric: 'tick autoritar p95',
        actual: row.pooled.tick.p95,
        budget: budgets.authoritativeTickP95Ms,
        unit: 'ms',
        direction: 'maximum',
        source: budgetSource(manifest, 'proposedBudgets.laptop.authoritativeTickP95Ms'),
      }),
      check({
        id: `${spec.id}-physics-p95`,
        metric: 'pas Rapier p95',
        actual: row.pooled.physics.p95,
        budget: budgets.rapierStepP95Ms,
        unit: 'ms',
        direction: 'maximum',
        source: budgetSource(manifest, 'proposedBudgets.laptop.rapierStepP95Ms'),
      }),
    );
    if (spec.system === 'LEARNING')
      checks.push(
        check({
          id: `${spec.id}-learning-p95`,
          metric: 'închidere segment → activare learning p95',
          actual: row.learningEndToEndMs?.p95 ?? null,
          budget: manifest.proposedBudgets.segmentCloseToProfileActivationP95Ms,
          unit: 'ms',
          direction: 'maximum',
          source: budgetSource(manifest, 'proposedBudgets.segmentCloseToProfileActivationP95Ms'),
          note:
            row.learningEndToEndMs === null
              ? 'niciun segment închis nu a produs o activare măsurabilă'
              : `${row.learningSegments} segmente, ${row.learningActivations} activări`,
        }),
      );
    if (spec.system === 'RECORDER_AUTOSAVE')
      checks.push(
        check({
          id: `${spec.id}-recorder-bytes`,
          metric: 'vârf de bytes reținuți de recorder',
          actual: row.recorderPeakBytes,
          budget: manifest.proposedCapacities.recorderRamBytes ?? null,
          unit: 'B',
          direction: 'maximum',
          source: budgetSource(manifest, 'proposedCapacities.recorderRamBytes'),
          note: `${row.recorderSamples} mostre, ${row.autosaveCaptures} capturi de checkpoint, ${row.autosaveBytes} B capturați`,
        }),
      );
    if (spec.condition === 'COLD_FIRST_USE')
      checks.push(
        check({
          id: `${spec.id}-cold-first-command`,
          metric: 'pornire la prima comandă acceptată, cold',
          actual: row.coldFirstCommandMs,
          budget: manifest.proposedBudgets.coldFirstAcceptedCommandP95Ms,
          unit: 'ms',
          direction: 'maximum',
          source: budgetSource(manifest, 'proposedBudgets.coldFirstAcceptedCommandP95Ms'),
          note: 'prima comandă autoritară a fixture-ului integrat, fără warmup',
        }),
      );
    for (const structural of row.structural)
      checks.push(
        Object.freeze({
          id: `${spec.id}-${structural.id}`,
          metric: structural.id,
          actual: null,
          budget: null,
          unit: 'ratio',
          direction: 'maximum' as const,
          source: 'contract 156',
          verdict: (structural.pass ? 'PASS' : 'FAIL') as Verdict,
          note: structural.detail,
        }),
      );

    const failures = checks.filter((entry) => entry.verdict === 'FAIL');
    const stressOverBudget = failures.map(
      (entry) => `${entry.metric}: ${entry.actual ?? '—'} ${entry.unit}`,
    );
    const verdict: TrafficBenchmarkRow['verdict'] =
      spec.classification === 'STRESS'
        ? 'STRESS'
        : spec.classification === 'REPORTED'
          ? 'REPORTED'
          : failures.length === 0
            ? 'PASS'
            : 'FAIL';
    const findings = failures.map((entry) =>
      entry.budget === null
        ? `${entry.metric}: ${entry.note}`
        : `${entry.metric} ${entry.actual ?? '—'} ${entry.unit} față de bugetul ${entry.budget} ${entry.unit} (${entry.source})`,
    );
    rows.push(
      Object.freeze({
        id: spec.id,
        spec,
        workload: workloadLabel(spec),
        classification: spec.classification,
        ticks: row.repeats.reduce((total, repeat) => total + repeat.ticks, 0),
        simulatedSeconds: row.simulatedSeconds,
        wallSeconds: row.wallSeconds,
        cpu: row.pooled,
        perRepeatP95: row.perRepeatP95,
        gpu: Object.freeze({
          verdict: 'NOT_MEASURED' as const,
          reason:
            'proba rulează în Node, fără renderer Babylon; nu există timer GPU. Valoarea rămâne null, nu 0.',
        }),
        exposure: Object.freeze({
          fleetVehicles: row.fleetVehicles,
          simulatedSeconds: row.exposureSeconds,
          fleetVehicleSeconds: row.fleetVehicleSeconds,
          invisibleTaxis: row.invisibleTaxis,
          invisibleShare:
            row.expectedTaxis === 0 ? 0 : round(row.invisibleTaxis / row.expectedTaxis),
          invisibleTaxiDecisions: row.invisibleTaxiDecisions,
          invisibleTaxiBodiesMoved: row.invisibleTaxiBodiesMoved,
        }),
        checks: Object.freeze(checks),
        stressOverBudget: Object.freeze(stressOverBudget),
        verdict,
        findings: Object.freeze(findings),
      }),
    );
  }

  const gateRows = rows.filter((row) => row.classification === 'GATE');
  const fail = gateRows.filter((row) => row.verdict === 'FAIL').length;
  return Object.freeze({
    version: TRAFFIC_BENCHMARK_VERSION,
    measuredAt: measurement.measuredAt,
    machine: measurement.machine,
    command: measurement.command,
    manifest: Object.freeze({
      budgetVersion: manifest.budgetVersion,
      status: manifest.status,
      approvedGate: manifest.approvedGate,
      modified: false as const,
    }),
    protocol: measurement.protocol,
    matrix: Object.freeze({
      taxis: TRAFFIC_TAXI_COUNTS,
      civilians: TRAFFIC_CIVIL_DENSITIES,
      systems: TRAFFIC_SYSTEM_IDS,
      conditions: TRAFFIC_CONDITIONS,
      rows: rows.length,
      gateRows: gateRows.length,
      stressRows: rows.filter((row) => row.verdict === 'STRESS').length,
      reportedRows: rows.filter((row) => row.verdict === 'REPORTED').length,
    }),
    rows: Object.freeze(rows),
    summary: Object.freeze({
      pass: rows.filter((row) => row.verdict === 'PASS').length,
      fail,
      stress: rows.filter((row) => row.verdict === 'STRESS').length,
      reported: rows.filter((row) => row.verdict === 'REPORTED').length,
      gate: fail > 0 ? 'FAILED' : 'MEASURED_GATE_PASS',
      hardwareGameplayGate: 'NOT_VALIDATED' as const,
      note: 'Verdictul acoperă numai tick-ul, fizica, deciziile, UI-ul proiectat, sistemele atașate și expunerea măsurate aici. Frame-ul, FPS-ul, GPU-ul și main-thread-ul cu randare rămân NOT_MEASURED; gate-ul hardware al jocului complet rămâne NOT_VALIDATED.',
    }),
    notMeasured: Object.freeze([
      Object.freeze({
        metric: 'interval de cadru / FPS',
        reason: 'proba este headless (Node), fără renderer Babylon și fără cadru de prezentare',
        measuredInstead: 'tick-ul autoritar complet și defalcarea lui pe componente CPU',
      }),
      Object.freeze({
        metric: 'lucru GPU p95',
        reason: 'nu există timer GPU fără renderer; valoarea este null, nu 0',
        measuredInstead: 'costul CPU al fizicii, deciziilor, UI proiectat și sistemului atașat',
      }),
      Object.freeze({
        metric: 'main-thread total p95',
        reason: 'include randarea CPU și paint-ul DOM, care nu există în proba headless',
        measuredInstead: 'tick-ul complet măsurat, comparat cu bugetul de tick autoritar',
      }),
      Object.freeze({
        metric: 'timp simulat / timp real activ',
        reason:
          'proba headless rulează cât mai repede, nu la 60 Hz real; raportul simulat/timp CPU nu este metricul de pacing al manifestului',
        measuredInstead:
          'tick-ul complet și durata măsurată; rata simulat/timp CPU rămâne un diagnostic, nu un verdict',
      }),
      Object.freeze({
        metric: 'UI DOM layout/paint',
        reason: 'Node nu are DOM; se măsoară proiecțiile pure 073/075, nu layout-ul browserului',
        measuredInstead: 'proiecția HUD 073 și panoul de flotă 075 la cadența HUD',
      }),
      Object.freeze({
        metric: 'memoria exactă a paginii și a GPU',
        reason: 'nu există API portabil; contoarele de ownership sunt raportate separat',
        measuredInstead: 'bytes reținuți de recorder și bytes capturați de checkpoint',
      }),
      Object.freeze({
        metric: 'pornirea la prima comandă a jocului complet, cold',
        reason:
          'pagina de joc completă nu există încă; se măsoară prima comandă a fixture-ului integrat',
        measuredInstead: 'world build + populare + prima comandă autoritară acceptată',
      }),
    ]),
  });
}

/** Structural self-check; a PASS without a measurement or a silent NOT_MEASURED is refused. */
export function verifyTrafficBenchmarkReport(report: TrafficBenchmarkReport): readonly string[] {
  const issues: string[] = [];
  if (report.manifest.modified !== false) issues.push('manifestul de bugete apare ca modificat');
  const expected = expandTrafficMatrix().length;
  if (report.rows.length !== expected)
    issues.push(`matricea are ${report.rows.length} rânduri, contractul cere ${expected}`);
  for (const row of report.rows) {
    if (row.verdict === 'PASS' && row.classification !== 'GATE')
      issues.push(`rândul ${row.id} este PASS fără să fie un workload de gate`);
    if (row.checks.length === 0) issues.push(`rândul ${row.id} nu are nicio verificare`);
    for (const entry of row.checks) {
      if (entry.verdict === 'PASS' && entry.actual === null && entry.budget !== null)
        issues.push(`verificarea ${entry.id} este PASS fără măsurătoare`);
      if (entry.verdict === 'NOT_MEASURED' && entry.note.trim().length === 0)
        issues.push(`verificarea ${entry.id} este NOT_MEASURED fără motiv`);
      if (entry.verdict === 'PASS' && entry.actual === null && entry.budget === null && !entry.note)
        issues.push(`verificarea structurală ${entry.id} nu explică rezultatul`);
      if (entry.budget !== null && !entry.source.startsWith('Docs/performance-budgets.json'))
        issues.push(`verificarea ${entry.id} nu citează manifestul de bugete`);
    }
    if (row.exposure.fleetVehicleSeconds <= 0)
      issues.push(`rândul ${row.id} nu are expunere pozitivă`);
    if (row.exposure.invisibleTaxis < 1)
      issues.push(`rândul ${row.id} nu dovedește niciun taxi invizibil`);
    if (row.exposure.invisibleTaxiDecisions < 1)
      issues.push(`rândul ${row.id} nu dovedește decizii pentru taxiurile invizibile`);
    if (row.exposure.invisibleTaxiBodiesMoved < 1)
      issues.push(`rândul ${row.id} nu dovedește mișcarea corpurilor invizibile`);
    if (row.cpu.physics.count < 1 || row.cpu.decisions.count < 1)
      issues.push(`rândul ${row.id} nu separă fizica de decizii`);
    if (row.gpu.verdict !== 'NOT_MEASURED')
      issues.push(`rândul ${row.id} pretinde o măsurătoare GPU fără renderer`);
  }
  const counted =
    report.summary.pass + report.summary.fail + report.summary.stress + report.summary.reported;
  if (counted !== report.rows.length)
    issues.push(`sumarul numără ${counted} rânduri, raportul are ${report.rows.length}`);
  return Object.freeze(issues);
}

/* ------------------------------------------------------------------ execution */

interface ActorPlan {
  readonly id: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly style: 'PRUDENT' | 'AGGRESSIVE';
  readonly surplus: boolean;
  laneId: string;
  cursorM: number;
  contactRole: 'LEADER' | 'FOLLOWER' | null;
}

interface RowRunInput {
  readonly spec: TrafficRowSpec;
  readonly repeat: number;
}

function laneSample(
  graph: LaneGraph,
  laneId: string,
  longitudinalM: number,
): { x: number; y: number; z: number; headingRad: number; lengthM: number } | null {
  const path = graph.getDirectedPath(laneId);
  if (!path || path.points.length < 2) return null;
  let remaining = Math.min(Math.max(longitudinalM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!,
      to = path.points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
        lengthM: path.lengthM,
      };
    }
    remaining -= length;
  }
  const last = path.points[path.points.length - 1]!;
  return { x: last.x, y: last.y, z: last.z, headingRad: 0, lengthM: path.lengthM };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function headingOf(state: BodyState): number {
  const q = state.transform.rotationQuaternion;
  const forwardX = 2 * (q.x * q.z + q.w * q.y),
    forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(forwardZ, forwardX);
}

function speedOf(state: BodyState): number {
  return Math.hypot(state.velocityMps.x, state.velocityMps.z);
}

function styleProjection(store: ReturnType<typeof createCandidateProfileStore>, versionId: string) {
  const version = store.getVersion(versionId);
  if (version === null) throw new Error(`Missing base profile version ${versionId}`);
  const parameters: Record<string, number> = Object.create(null),
    unitsByParameter: Record<string, string> = Object.create(null),
    provenanceByParameter: Record<string, string> = Object.create(null),
    evidenceByParameter: Record<string, null> = Object.create(null);
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key]!;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parseDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [...version.sourceSegmentIds],
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
}

function frameSummary(values: readonly number[]): StatisticSummary {
  if (values.length < 1) throw new RangeError('A measured component needs at least one sample');
  return summarize(values);
}

function captureCheckpoint(input: {
  tick: number;
  vehicles: readonly BodyState[];
  actors: readonly ActorPlan[];
}): Readonly<{ bytes: number; status: string; snapshot: WorldSnapshot | null; rejection: string }> {
  const controllers = input.vehicles.map((state) => ({
    entityId: state.identity.entityId,
    fsmState: 'CRUISE',
    fsmStateTick: input.tick,
    controlMode: 'AUTO' as const,
    targetSpeed: speedOf(state),
    laneOffset: 0,
    memory: { integrator: 0, ticks_in_state: 0 },
  }));
  const byId = new Map(input.actors.map((actor) => [actor.id, actor]));
  const vehicles = input.vehicles.map((state, index) => ({
    entityId: state.identity.entityId,
    // Rapier's WASM handle is not always a safe integer (observed 5e-324 on the second body), so the
    // checkpoint stores a stable 1-based slot; entityId remains the real identity.
    handle: index + 1,
    vehicleClass:
      byId.get(state.identity.entityId)?.driverKind === 'TAXI'
        ? ('TAXI' as const)
        : ('CIVILIAN' as const),
    position: { ...state.transform.positionM },
    rotation: { ...state.transform.rotationQuaternion },
    linearVelocity: { ...state.velocityMps },
    angularVelocity: { x: 0, y: 0, z: 0 },
    controlMode: 'AUTO' as const,
    fsmState: 'CRUISE',
    routeId: 'route-156-fixture',
    routeNodeIndex: 0,
    routeProgress: 0,
    segmentId: null,
    rideId: null,
    passengerIds: [],
  }));
  const capture: WorldCaptureInput = {
    tick: input.tick,
    tickBoundary: 'BOUNDARY',
    subsystemTicks: {
      physics: input.tick,
      controllers: input.tick,
      rides: input.tick,
      passengers: input.tick,
      opportunities: input.tick,
      signals: input.tick,
      dispatch: input.tick,
      learning: input.tick,
      rng: input.tick,
    },
    worldEpoch: 1,
    profile: { profileId: 'profile-156', activeVersionId: 'v1', activationSequence: 0 },
    vehicles,
    controllers,
    rides: [],
    passengers: [],
    segments: [],
    opportunities: [],
    signals: [],
    dispatch: { pending: [], acceptedResults: [] },
    learning: {
      learningEpoch: 1,
      pendingJobs: [],
      completedObservations: [],
      acceptedResultKeys: [],
    },
    rng: { seed: TRAFFIC_SEED, streams: { traffic: 0, rideDemand: 0, opportunities: 0 } },
    dedup: { lastEventSequence: 0, seenEventIds: [] },
  };
  const captured = captureWorldSnapshot(capture);
  return captured.status === 'CAPTURED'
    ? Object.freeze({
        bytes: captured.bytes,
        status: 'CAPTURED',
        snapshot: captured.snapshot,
        rejection: '',
      })
    : Object.freeze({
        bytes: 0,
        status: 'REJECTED',
        snapshot: null,
        rejection: JSON.stringify(captured.rejection),
      });
}

async function runTrafficRow(input: RowRunInput): Promise<RunResult> {
  const { spec, repeat } = input;
  const cold = spec.condition === 'COLD_FIRST_USE';
  const rowStarted = performance.now();
  const context = {
    schemaVersion: 1,
    units: 'SI',
    sessionId: `156-${spec.id}`,
    worldEpoch: 1,
  } as const;
  const scope = { sessionId: context.sessionId, worldEpoch: 1 };
  const scenario: FleetScenario = createFleetScenario({
    taxiCount: spec.taxis,
    civilianCount: spec.authoritativeCivilians,
    seed: TRAFFIC_SEED + repeat,
    scenarioId: `traffic156-${spec.id}`,
    sessionId: context.sessionId,
    worldEpoch: 1,
  });
  const world = await createRapierProbe();
  const bus = createEventBus(scope);
  const road = createRoadContext(scenario.map);
  const signals = createSignalController(scenario.map, { context, eventBus: bus });
  const collision = createCollisionEventAdapter({ context, physics: world, eventBus: bus });
  const controller = createVehicleController(context, world);
  const metrics = createMetricService();

  const profileId = scenario.configuration.profile.profileId;
  const baseVersionId = `city-style-base-156-${spec.id}`;
  const store = createCandidateProfileStore({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    now: () => FIXTURE_NOW,
  });
  const base = store.createBase({
    profileId,
    versionId: baseVersionId,
    parameters: verticalSliceBaseParameters(),
    createdAt: FIXTURE_NOW,
  });
  if (base.status !== 'ACCEPTED') throw new Error('156 base style version rejected by 109');
  const baseStyle = styleProjection(store, baseVersionId);
  const clock = { value: 0 };
  let pipeline: ProfilePipeline | null = null;
  let queueHarness: ReturnType<typeof createLearningQueueHarness> | null = null;
  let activation: ReturnType<typeof createProfileActivation> | null = null;
  if (spec.system === 'LEARNING') {
    const activationSource = createProfileActivationSource({
      profileId,
      versionId: baseVersionId,
    });
    activation = createProfileActivation({
      registry: scenario.registry,
      source: activationSource,
      engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
      clock: () => clock.value,
      now: () => FIXTURE_NOW,
    });
    queueHarness = createLearningQueueHarness({
      engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    });
    pipeline = createProfilePipeline({
      engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
      playerId: VERTICAL_SLICE_PLAYER_ID,
      profileId,
      learningEpoch: 1,
      sessionId: VERTICAL_SLICE_SESSION_ID,
      worldEpoch: VERTICAL_SLICE_WORLD_EPOCH,
      queue: queueHarness.queue,
      store,
      activation,
      tick: () => clock.value,
    });
  }
  const traffic = createCivilTraffic({
    registry: scenario.registry,
    map: scenario.map,
    graph: scenario.graph,
    planner: scenario.planner,
    styleSource: { activeStyle: (): DrivingProfile => baseStyle },
    seed: TRAFFIC_SEED,
  });

  const civilLanes = scenario.map.lanes
    .filter((lane) => lane.access.includes('CIVIL'))
    .map((lane) => lane.id)
    .sort();
  const actors: ActorPlan[] = [];
  const identities = new Map<string, BodyIdentity>();
  const states = new Map<string, BodyState>();
  const offs: (() => void)[] = [];
  const routeCache = new Map<string, readonly string[] | null>();

  const primaryLane = (id: string, fallbackIndex: number): string => {
    const taxiLane = scenario.positions.laneFor(id);
    if (taxiLane) return taxiLane;
    return civilLanes[fallbackIndex % Math.max(civilLanes.length, 1)]!;
  };

  scenario.taxiIds.forEach((id, index) =>
    actors.push({
      id,
      driverKind: 'TAXI',
      style: index % 3 === 1 ? 'AGGRESSIVE' : 'PRUDENT',
      surplus: false,
      laneId: primaryLane(id, index),
      cursorM: (index % 7) * 6,
      contactRole: null,
    }),
  );
  scenario.civilianIds.forEach((id, index) => {
    actors.push({
      id,
      driverKind: 'CIVILIAN',
      style: index % 3 === 1 ? 'AGGRESSIVE' : 'PRUDENT',
      surplus: false,
      laneId: civilLanes[(index + scenario.taxiIds.length) % Math.max(civilLanes.length, 1)]!,
      cursorM: (index % 7) * 6,
      contactRole: null,
    });
  });
  for (let index = 0; index < spec.surplusCivilians; index += 1) {
    actors.push({
      id: `surplus-civil-${String(index).padStart(3, '0')}`,
      driverKind: 'CIVILIAN',
      style: index % 3 === 1 ? 'AGGRESSIVE' : 'PRUDENT',
      surplus: true,
      laneId: civilLanes[(index * 3 + 1) % Math.max(civilLanes.length, 1)]!,
      cursorM: (index % 5) * 8,
      contactRole: null,
    });
  }
  /* Declared aggressive fixture: a real closing pair on the same lane plus barriers and debris. */
  if (spec.condition === 'AGGRESSIVE' && actors.length >= 2) {
    const contactLane =
      [...scenario.map.lanes]
        .filter((lane) => lane.access.includes('CIVIL'))
        .sort((left, right) => {
          const leftLength = scenario.graph.getDirectedPath(left.id)?.lengthM ?? 0;
          const rightLength = scenario.graph.getDirectedPath(right.id)?.lengthM ?? 0;
          return rightLength - leftLength;
        })[0]?.id ?? actors[0]!.laneId;
    const leader = actors[0]!;
    const follower = actors[1]!;
    leader.laneId = contactLane;
    leader.cursorM = 20;
    leader.contactRole = 'LEADER';
    follower.laneId = contactLane;
    follower.cursorM = 14;
    follower.contactRole = 'FOLLOWER';
  }
  const planById = new Map(actors.map((actor) => [actor.id, actor]));
  const initialPositions = new Map<string, { x: number; z: number }>();

  actors.forEach((actor, index) => {
    const lane = laneSample(scenario.graph, actor.laneId, actor.cursorM);
    const position = lane
      ? { x: lane.x, y: 0.85, z: lane.z }
      : { x: (index % 10) * 2.4 - 12, y: 0.85, z: Math.floor(index / 10) * 6 };
    world.addClassCar(actor.id, position, index % 2 ? 'compact' : 'sedan');
    const identity = world.bodyIdentity(actor.id)!;
    // A fresh Rapier body faces +Z; align it with the lane heading so a short measured run starts
    // already pointing down its lane instead of spending the window turning.
    const heading = lane?.headingRad ?? 0;
    const halfTurn = (Math.PI / 2 - heading) / 2;
    world.setPose(identity, {
      positionM: { ...position },
      rotationQuaternion: { x: 0, y: Math.sin(halfTurn), z: 0, w: Math.cos(halfTurn) },
    });
    identities.set(actor.id, identity);
    controller.register(identity);
    initialPositions.set(actor.id, { x: position.x, z: position.z });
    offs.push(world.subscribeBody(identity, (state) => states.set(actor.id, state)));
  });
  if (spec.condition === 'AGGRESSIVE') {
    world.addBox({ x: 0, y: 1, z: 44 }, { x: 22, y: 1, z: 0.6 });
    world.addBox({ x: -14, y: 1, z: 22 }, { x: 0.6, y: 1, z: 12 });
    for (let index = 0; index < 24; index += 1)
      world.addBox(
        { x: (index % 6) * 0.8 - 2.5, y: 0.4 + Math.floor(index / 6) * 0.65, z: 38 },
        { x: 0.35, y: 0.35, z: 0.35 },
      );
  }

  const observationCenter = initialPositions.get(actors[0]!.id)!;
  /* The probe's own ground is a 1000×1000 m plate around the origin; the 032 map extends farther
     (lanes at x≈560, z≈720). Without this declared plate the farthest cars would fall and never
     drive. It is a fixture ground, not a physics setting: gravity, solver, CCD and dt are untouched. */
  const spawnPoints = [...initialPositions.values()];
  const minX = Math.min(...spawnPoints.map((point) => point.x));
  const maxX = Math.max(...spawnPoints.map((point) => point.x));
  const minZ = Math.min(...spawnPoints.map((point) => point.z));
  const maxZ = Math.max(...spawnPoints.map((point) => point.z));
  world.addBox(
    { x: (minX + maxX) / 2, y: -0.5, z: (minZ + maxZ) / 2 },
    { x: (maxX - minX) / 2 + 80, y: 0.5, z: (maxZ - minZ) / 2 + 80 },
  );
  const taxiIds = [...scenario.taxiIds];
  const isVisible = (id: string): boolean => {
    const position = initialPositions.get(id)!;
    return (
      Math.abs(position.x - observationCenter.x) <= TRAFFIC_OBSERVATION_HALF_EXTENT_M &&
      Math.abs(position.z - observationCenter.z) <= TRAFFIC_OBSERVATION_HALF_EXTENT_M
    );
  };
  const invisibleTaxiIds = new Set(taxiIds.filter((id) => !isVisible(id)));
  const invisibleVehicleIds = new Set(
    actors.map((actor) => actor.id).filter((id) => !isVisible(id)),
  );

  let contactsMax = 0;
  let collisionEvents = 0;
  let decisions = 0;
  let invisibleDecisions = 0;
  let learningSegments = 0;
  let learningActivations = 0;
  let pendingSegment: Promise<unknown> | null = null;
  let pendingClosedAt: number | null = null;
  let recorderSamples = 0;
  let recorderPeakBytes = 0;
  let autosaveCaptures = 0;
  let autosaveBytes = 0;
  let xpWindows = 0;
  let xpEntries = 0;
  let systemInvocations = 0;
  let uiInvocations = 0;
  let coldFirstCommandMs: number | null = null;
  let minPairGapM = Number.POSITIVE_INFINITY;
  let pairFollowerSpeedMax = 0;
  let pairLeaderSpeedMax = 0;
  const contactLeaderId = actors[0]?.id ?? null;
  const contactFollowerId = actors[1]?.id ?? null;
  const learningEndToEnd: number[] = [];

  const progress = spec.system === 'XP' ? createPlayerProgress({ playerId: 'player-156' }) : null;
  const recorder =
    spec.system === 'RECORDER_AUTOSAVE'
      ? createWorldRecorder({
          sessionId: `session-${spec.id}`,
          worldEpoch: 1,
          versions: {
            engineVersion: 'babylon-9.29.0',
            physicsVersion: 'rapier-0.21.0',
            mapVersion: `map-156-${spec.taxis}x${spec.civilians}`,
          },
          pinBeforeSeconds: 5,
          pinAfterSeconds: 5,
          now: () => FIXTURE_NOW,
        })
      : null;

  const laneOrder = new Map<string, ActorPlan[]>();
  const refreshLaneOrder = (): void => {
    for (const list of laneOrder.values()) list.length = 0;
    for (const actor of actors) {
      let list = laneOrder.get(actor.laneId);
      if (!list) {
        list = [];
        laneOrder.set(actor.laneId, list);
      }
      list.push(actor);
    }
    for (const list of laneOrder.values()) list.sort((left, right) => right.cursorM - left.cursorM);
  };

  const cachedRouteSearch = (from: string, to: string): void => {
    const key = `${scenario.planner.graphVersion}:${scenario.planner.costVersion}:${from}:${to}`;
    if (!routeCache.has(key)) routeCache.set(key, syntheticRouteSearch(scenario.graph, from, to));
  };

  const commandFor = (actor: ActorPlan, tick: number, dtSeconds: number): VehicleCommandPacket => {
    const state = states.get(actor.id)!;
    const speed = speedOf(state);
    actor.cursorM += speed * dtSeconds;
    let lane = laneSample(scenario.graph, actor.laneId, actor.cursorM);
    if (!lane || actor.cursorM >= lane.lengthM) {
      const successors = scenario.graph.getSuccessors(
        actor.laneId,
        actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
      );
      actor.laneId = successors.length ? successors[0]!.id : actor.laneId;
      actor.cursorM = 0;
      lane = laneSample(scenario.graph, actor.laneId, 0);
    }
    const ahead = laneSample(scenario.graph, actor.laneId, actor.cursorM + 9);
    const target = ahead ?? lane;
    const style =
      actor.style === 'AGGRESSIVE'
        ? { cruiseMps: 13, minimumGapM: 1.6, headwayS: 0.35 }
        : { cruiseMps: 8, minimumGapM: 4.5, headwayS: 1.1 };
    let desired = style.cruiseMps;
    const snapshot = actor.surplus ? undefined : traffic.get(actor.id);
    if (snapshot) desired = Math.min(desired, 2);
    const order = laneOrder.get(actor.laneId) ?? [];
    const index = order.indexOf(actor);
    if (index > 0) {
      const leader = order[index - 1]!;
      const gap = leader.cursorM - actor.cursorM;
      const minimum = style.minimumGapM + speed * style.headwayS * 0.1;
      if (gap < minimum) desired = Math.min(desired, Math.max(0, speed - 2.5));
    }
    const heading = headingOf(state);
    const wanted = target ? target.headingRad : heading;
    let error = wanted - heading;
    while (error > Math.PI) error -= 2 * Math.PI;
    while (error < -Math.PI) error += 2 * Math.PI;
    const throttle =
      actor.contactRole === 'FOLLOWER' && tick <= 260 ? 1 : clamp((desired - speed) * 0.55, 0, 1);
    const brake =
      actor.contactRole === 'LEADER' && tick <= 260
        ? 1
        : desired < speed - 0.4
          ? clamp((speed - desired) * 0.45, 0, 1)
          : 0;
    return {
      identity: identities.get(actor.id)!,
      command: {
        ...context,
        vehicleId: actor.id,
        tick,
        source: 'AUTONOMY' as const,
        throttle: Math.round(throttle * 1000) / 1000,
        brake: Math.round(brake * 1000) / 1000,
        steering: Math.round(clamp(error * 0.55, -1, 1) * 1000) / 1000,
        handbrake: false,
        turnSignal: 'OFF' as const,
      },
    };
  };

  const publishContext = (tick: number): void => {
    const frame: RoadContextFrame = {
      ...scope,
      tick,
      vehicles: actors
        .map((actor) => {
          const state = states.get(actor.id)!;
          const plan = planById.get(actor.id)!;
          return {
            id: actor.id,
            incarnation: identities.get(actor.id)!.generation,
            positionM: state.transform.positionM,
            headingRad: headingOf(state),
            access: plan.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const),
            speedMps: speedOf(state),
            radiusM: 1.2,
            route: null,
            distances: [],
          };
        })
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      obstacles: [],
      zones: [],
      signals: scenario.map.intersections.flatMap((intersection) =>
        intersection.movements
          .map((movement) => signals.getMovementSignal(intersection.id, movement.id))
          .filter((signal) => signal !== null),
      ),
      completeness: { vehicles: true, obstacles: false, zones: false, signals: true },
    };
    road.updateFrame(frame);
  };

  const externalVehicleObservations = () =>
    actors
      .filter((actor) => !actor.surplus && planById.get(actor.id)!.driverKind === 'TAXI')
      .map((actor) => {
        const state = states.get(actor.id)!;
        return {
          vehicleId: actor.id,
          driverKind: 'TAXI' as const,
          positionM: state.transform.positionM,
          headingRad: headingOf(state),
          speedMps: speedOf(state),
          radiusM: 1.8,
        };
      });

  const frameOf = (tick: number) => ({
    tick,
    vehicles: actors.map((actor, index) => {
      const state = states.get(actor.id)!;
      return {
        entityId: actor.id,
        handle: index + 1,
        vehicleClass: (actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVILIAN') as 'TAXI' | 'CIVILIAN',
        controlMode: 'AUTO' as const,
        position: { ...state.transform.positionM },
        rotation: { ...state.transform.rotationQuaternion },
        linearVelocity: { ...state.velocityMps },
        fsmState: 'CRUISE',
        rideId: null,
        passengerIds: [],
        inCamera: !invisibleVehicleIds.has(actor.id),
      };
    }),
    signals: [] as {
      signalId: string;
      phase: 'GREEN' | 'YELLOW' | 'RED';
      remainingTicks: number;
    }[],
  });

  const uiWork = (tick: number): void => {
    const selected = actors[0]!;
    projectTaxiHud({
      schemaVersion: 1,
      units: 'SI',
      sessionId: context.sessionId,
      worldEpoch: 1,
      version: TAXI_HUD_VERSION,
      tick,
      speedMps: speedOf(states.get(selected.id)!),
      mode: 'AUTO',
      taxi: {
        vehicleId: selected.id,
        slot: 1,
        classId: 'sedan',
        profileId,
        profileVersion: baseVersionId,
      },
      ride: null,
    });
    projectFleetPanel({
      schemaVersion: 1,
      units: 'SI',
      version: FLEET_PANEL_VERSION,
      sessionId: context.sessionId,
      worldEpoch: 1,
      tick,
      followedTaxiId: selected.id,
      taxis: scenario.taxiIds.map((vehicleId, index) => ({
        vehicleId,
        slot: index + 1,
        classId: 'sedan',
        profileId,
        appliedProfileVersion: baseVersionId,
        controlMode: 'AUTO' as const,
        serviceState: null,
        blocked: false,
        ride: null,
      })),
    });
  };

  const systemWork = (tick: number): boolean => {
    let worked = false;
    if (pipeline !== null && queueHarness !== null) {
      if (
        (learningSegments === 0 || tick % TRAFFIC_LEARNING_CADENCE_TICKS === 0) &&
        pendingSegment === null
      ) {
        const ordinal = learningSegments + 1;
        learningSegments += 1;
        const segment: ProfileLearningSegment = verticalSliceLearningSegment({
          scenario: ordinal % 2 ? 'PRUDENT' : 'RECKLESS',
          segmentId: `${spec.id}:segment:${ordinal}`,
          order: ordinal,
          interventionId: `${spec.id}:intervention:${ordinal}`,
          reason: `benchmark 156 ${spec.id} segment ${ordinal}`,
        });
        const closedAt = performance.now();
        queueHarness.plan(segment.segmentId, 'result');
        pendingSegment = pipeline
          .onSegmentClosed(segment)
          .then((result) => {
            if (result.status === 'COMPOSED' || result.status === 'RECOMPOSED') {
              if (pendingClosedAt === null) pendingClosedAt = closedAt;
            }
          })
          .catch(() => undefined)
          .finally(() => {
            pendingSegment = null;
          });
        worked = true;
      }
      const step = pipeline.advance();
      if (step?.status === 'APPLIED') {
        learningActivations += 1;
        if (pendingClosedAt !== null) {
          learningEndToEnd.push(performance.now() - pendingClosedAt);
          pendingClosedAt = null;
        }
      }
      worked = true;
    }
    if (spec.system === 'RECORDER_AUTOSAVE' && recorder !== null) {
      const result = recorder.recordTick(frameOf(tick));
      if (result.status === 'SAMPLED') recorderSamples += 1;
      if (tick % TRAFFIC_AUTOSAVE_CADENCE_TICKS === 0) {
        const checkpoint = captureCheckpoint({
          tick,
          vehicles: [...states.values()],
          actors,
        });
        if (checkpoint.status === 'CAPTURED' && checkpoint.snapshot !== null) {
          const recorded = recorder.recordCheckpoint({
            checkpointId: `${spec.id}-cp-${tick}`,
            snapshot: checkpoint.snapshot,
          });
          if (recorded) {
            autosaveCaptures += 1;
            autosaveBytes += checkpoint.bytes;
          }
        }
      }
      const stats = recorder.getStats();
      recorderPeakBytes = Math.max(recorderPeakBytes, stats.peakChargedBytes);
      worked = true;
    }
    if (spec.system === 'XP' && progress !== null) {
      if (xpWindows === 0 || tick % TRAFFIC_XP_WINDOW_TICKS === 0) {
        progress.observeActiveTime(
          activeWindow(XP_FIXTURE_START_MS + tick * 1000, 30_000, { controlMode: 'LEARNING' }),
        );
        xpWindows += 1;
        worked = true;
      }
      if (tick % TRAFFIC_UI_CADENCE_TICKS === 0) {
        xpEntries = progress.read().entries.length;
        worked = true;
      }
    }
    return worked;
  };

  const samples = {
    tick: [] as number[],
    physics: [] as number[],
    controller: [] as number[],
    decisions: [] as number[],
    ui: [] as number[],
    system: [] as number[],
  };
  const measuredTicks = cold ? TRAFFIC_COLD_TICKS : TRAFFIC_MEASURED_TICKS;
  const warmupTicks = cold ? 0 : TRAFFIC_WARMUP_TICKS;
  let tick = 0;

  const cleanup = (): boolean => {
    for (const off of offs) off();
    recorder?.dispose();
    metrics.dispose();
    traffic.dispose();
    pipeline?.dispose();
    queueHarness?.dispose();
    activation?.dispose();
    store.dispose();
    collision.dispose();
    signals.dispose();
    road.dispose();
    controller.dispose();
    bus.dispose();
    scenario.dispose();
    world.dispose();
    const resources = world.bodyResources();
    return resources.entities !== 0 || resources.subscriptions !== 0;
  };

  try {
    offs.push(
      bus.subscribe((event) => {
        if (event.type === 'COLLISION') collisionEvents += 1;
      }),
    );
    world.publishBodies(0, false);
    signals.step(0);
    traffic.step({ tick: 0, dtSeconds: TICK_SECONDS, vehicles: externalVehicleObservations() });
    publishContext(0);
    refreshLaneOrder();
    if (recorder !== null) {
      const anchor = captureCheckpoint({ tick: 0, vehicles: [...states.values()], actors });
      if (anchor.status !== 'CAPTURED' || anchor.snapshot === null)
        throw new Error(`The 156 recorder anchor was rejected for ${spec.id}: ${anchor.rejection}`);
      const anchored = recorder.recordCheckpoint({
        checkpointId: `${spec.id}-anchor`,
        snapshot: anchor.snapshot,
      });
      if (!anchored) throw new Error(`The 156 recorder anchor was refused for ${spec.id}`);
    }

    for (let warmup = 0; warmup < warmupTicks; warmup += 1) {
      tick += 1;
      if (tick % 20 === 0) refreshLaneOrder();
      collision.beforePhysicsStep(tick);
      // Settle the suspension and wheel contacts before any command is measured; this is the same
      // real physics step the 047 driving fixture uses, not a synthetic warmup.
      controller.step({ tick, dtSeconds: TICK_SECONDS }, [], [], false);
      collision.captureAfterPhysicsStep(tick);
      world.publishBodies(tick, false);
      signals.step(tick);
      traffic.step({
        tick,
        dtSeconds: TICK_SECONDS,
        vehicles: externalVehicleObservations(),
      });
      clock.value = tick;
      if (tick % TRAFFIC_DECISION_CADENCE_TICKS === 0) publishContext(tick);
      if (tick % 60 === 0) {
        scenario.demand.advance(tick);
        for (const active of scenario.dispatcher.assignments())
          if (tick - active.tick >= 90)
            scenario.dispatcher.release(active.taxiId, 'COMPLETED', tick);
        scenario.dispatcher.step({ tick, maxAssignments: 4 });
      }
    }

    for (let measured = 0; measured < measuredTicks; measured += 1) {
      tick += 1;
      const tickStarted = performance.now();
      if (tick % 20 === 0) refreshLaneOrder();
      let contextMs = 0;

      const decisionsStarted = performance.now();
      actors.forEach((actor, index) => {
        if (index % TRAFFIC_DECISION_CADENCE_TICKS !== tick % TRAFFIC_DECISION_CADENCE_TICKS)
          return;
        if (road.getContext(actor.id)) {
          decisions += 1;
          if (invisibleTaxiIds.has(actor.id)) invisibleDecisions += 1;
        }
        cachedRouteSearch('west-in', 'west-out');
      });
      traffic.step({
        tick,
        dtSeconds: TICK_SECONDS,
        vehicles: externalVehicleObservations(),
      });
      if (tick % TRAFFIC_DECISION_CADENCE_TICKS === 0) {
        scenario.demand.advance(tick);
        for (const active of scenario.dispatcher.assignments())
          if (tick - active.tick >= 90)
            scenario.dispatcher.release(active.taxiId, 'COMPLETED', tick);
        scenario.dispatcher.step({ tick, maxAssignments: 4 });
      }
      const packets = actors.map((actor) => commandFor(actor, tick, TICK_SECONDS));
      const decisionsMs = performance.now() - decisionsStarted;

      collision.beforePhysicsStep(tick);
      const step = controller.step({ tick, dtSeconds: TICK_SECONDS }, packets, [], true);
      collision.captureAfterPhysicsStep(tick);
      world.publishBodies(tick, true);
      signals.step(tick);
      contactsMax = Math.max(contactsMax, world.contacts());
      if (contactLeaderId !== null && contactFollowerId !== null) {
        const leaderState = states.get(contactLeaderId),
          followerState = states.get(contactFollowerId);
        if (leaderState && followerState) {
          const gap = Math.hypot(
            leaderState.transform.positionM.x - followerState.transform.positionM.x,
            leaderState.transform.positionM.z - followerState.transform.positionM.z,
          );
          minPairGapM = Math.min(minPairGapM, gap);
          pairFollowerSpeedMax = Math.max(pairFollowerSpeedMax, speedOf(followerState));
          pairLeaderSpeedMax = Math.max(pairLeaderSpeedMax, speedOf(leaderState));
        }
      }

      if (tick % TRAFFIC_DECISION_CADENCE_TICKS === 0) {
        const contextStarted = performance.now();
        publishContext(tick);
        contextMs = performance.now() - contextStarted;
      }

      const systemStarted = performance.now();
      clock.value = tick;
      const worked = systemWork(tick);
      const systemMs = performance.now() - systemStarted;
      if (worked) {
        samples.system.push(systemMs);
        systemInvocations += 1;
      }

      let uiMs = 0;
      if (tick % TRAFFIC_UI_CADENCE_TICKS === 0) {
        const uiStarted = performance.now();
        uiWork(tick);
        uiMs = performance.now() - uiStarted;
        samples.ui.push(uiMs);
        uiInvocations += 1;
      }

      const tickMs = performance.now() - tickStarted;
      samples.tick.push(tickMs);
      samples.decisions.push(decisionsMs + contextMs);
      samples.physics.push(step.physics.stepMs);
      samples.controller.push(Math.max(0, step.physics.totalMs - step.physics.stepMs));
      if (cold && coldFirstCommandMs === null && step.controls.length === actors.length)
        coldFirstCommandMs = performance.now() - rowStarted;
      // Let the real 103 queue microtasks settle without inventing wall time or a fake timer.
      if (tick % 30 === 0) await Promise.resolve();
    }

    if (pendingSegment !== null) await pendingSegment;
    await Promise.resolve();
    if (pipeline !== null && learningActivations === 0) {
      for (let extra = 0; extra < 12; extra += 1) {
        clock.value = tick + extra + 1;
        const step = pipeline.advance();
        if (step?.status === 'APPLIED') {
          learningActivations += 1;
          if (pendingClosedAt !== null) {
            learningEndToEnd.push(performance.now() - pendingClosedAt);
            pendingClosedAt = null;
          }
          break;
        }
        await Promise.resolve();
      }
    }
    if (samples.system.length === 0) samples.system.push(0);

    const simulatedSeconds = measuredTicks * TICK_SECONDS;
    const wallMs = samples.tick.reduce((total, value) => total + value, 0);
    const snapshot = readMetricSnapshot(
      { metrics, fleet: scenario.registry },
      { tick, simulatedSeconds, distanceAvailable: false },
    );
    const taxisMoved = taxiIds.filter((id) => {
      const initial = initialPositions.get(id)!;
      const state = states.get(id);
      if (!state) return false;
      return (
        Math.abs(state.transform.positionM.x - initial.x) > 0.01 ||
        Math.abs(state.transform.positionM.z - initial.z) > 0.01 ||
        speedOf(state) > 0.01
      );
    }).length;
    const resourcesLeaked = cleanup();
    const measurement: TrafficRepeatMeasurement = Object.freeze({
      repeat,
      ticks: measuredTicks,
      simulatedSeconds,
      wallMs,
      cpu: Object.freeze({
        tick: frameSummary(samples.tick),
        physics: frameSummary(samples.physics),
        controller: frameSummary(samples.controller),
        decisions: frameSummary(samples.decisions),
        ui: frameSummary(samples.ui),
        system: frameSummary(samples.system),
      }),
      contactsMax,
      collisionEvents,
      minPairGapM: Number.isFinite(minPairGapM) ? minPairGapM : null,
      pairLeaderSpeedMax,
      pairFollowerSpeedMax,
      decisions,
      invisibleDecisions,
      taxisMoved,
      systemInvocations,
      uiInvocations,
      learningSegments,
      learningActivations,
      learningEndToEndMs: Object.freeze([...learningEndToEnd]),
      recorderSamples,
      recorderPeakBytes,
      autosaveCaptures,
      autosaveBytes,
      xpWindows,
      xpEntries,
      fleetVehicles: snapshot.fleet.vehicles,
      fleetVehicleSeconds: snapshot.fleetVehicleSeconds,
      invisibleTaxis: invisibleTaxiIds.size,
      invisibleVehicles: invisibleVehicleIds.size,
      physicalVehicles: actors.length,
      surplusActors: spec.surplusCivilians,
      coldFirstCommandMs,
      cleanupLeaked: resourcesLeaked,
    });
    return Object.freeze({ measurement, samples });
  } catch (error) {
    cleanup();
    throw error;
  }
}

/* ------------------------------------------------------------------ matrix runner */

function pool(values: readonly number[]): StatisticSummary {
  return summarize(values);
}

export async function measureTrafficBenchmark(
  options: MeasureTrafficOptions,
): Promise<TrafficBenchmarkMeasurement> {
  const matrix = expandTrafficMatrix();
  const selected =
    options.only === undefined
      ? matrix
      : matrix.filter((spec) => options.only!.some((id) => spec.id.includes(id)));
  if (selected.length === 0) throw new RangeError('The benchmark filter selected no row');
  const rows: TrafficRowMeasurement[] = [];
  let index = 0;
  for (const spec of selected) {
    index += 1;
    const repeats = spec.condition === 'COLD_FIRST_USE' ? TRAFFIC_COLD_REPEATS : TRAFFIC_REPEATS;
    const runs: RunResult[] = [];
    for (let repeat = 1; repeat <= repeats; repeat += 1)
      runs.push(await runTrafficRow({ spec, repeat }));
    const first = runs[0]!.measurement;
    const pooled = {
      tick: pool(runs.flatMap((run) => run.samples.tick)),
      physics: pool(runs.flatMap((run) => run.samples.physics)),
      controller: pool(runs.flatMap((run) => run.samples.controller)),
      decisions: pool(runs.flatMap((run) => run.samples.decisions)),
      ui: pool(runs.flatMap((run) => run.samples.ui)),
      system: pool(runs.flatMap((run) => run.samples.system)),
    };
    const learning = runs.flatMap((run) => [...run.measurement.learningEndToEndMs]);
    const simulatedSeconds = runs.reduce(
      (total, run) => total + run.measurement.simulatedSeconds,
      0,
    );
    const wallSeconds = runs.reduce((total, run) => total + run.measurement.wallMs, 0) / 1000;
    const structural: { id: string; pass: boolean; detail: string }[] = [
      Object.freeze({
        id: 'populatie-fizica-completa',
        pass: runs.every(
          (run) =>
            run.measurement.physicalVehicles === spec.taxis + spec.civilians &&
            run.measurement.fleetVehicles === spec.taxis + spec.authoritativeCivilians,
        ),
        detail: `${first.physicalVehicles} vehicule fizice (${spec.taxis} taxiuri + ${spec.civilians} civili, inclusiv ${spec.surplusCivilians} surplus); registrul 057 are ${first.fleetVehicles}`,
      }),
      Object.freeze({
        id: 'taxiuri-invizibile-simulate',
        pass:
          first.invisibleTaxis >= 1 &&
          runs.every(
            (run) => run.measurement.invisibleDecisions >= run.measurement.invisibleTaxis,
          ) &&
          first.taxisMoved >= 1,
        detail: `${first.invisibleTaxis}/${spec.taxis} taxiuri în afara ferestrei de observare de ±${TRAFFIC_OBSERVATION_HALF_EXTENT_M} m; ${first.invisibleDecisions} decizii și ${first.taxisMoved}/${spec.taxis} corpuri în mișcare`,
      }),
      Object.freeze({
        id: 'expunere-include-flota-intreaga',
        pass: runs.every(
          (run) =>
            run.measurement.fleetVehicleSeconds ===
            run.measurement.fleetVehicles * run.measurement.simulatedSeconds,
        ),
        detail: `${first.fleetVehicles} vehicule × ${first.simulatedSeconds} s = ${first.fleetVehicleSeconds} vehicul-secunde, inclusiv taxiurile invizibile`,
      }),
      Object.freeze({
        id: 'cleanup-fara-resurse',
        pass: runs.every((run) => !run.measurement.cleanupLeaked),
        detail: 'world-ul Rapier, recorderul, pipeline-ul și abonamentele sunt eliberate la final',
      }),
    ];
    if (spec.condition === 'AGGRESSIVE')
      structural.push(
        Object.freeze({
          id: 'contacte-agresive',
          pass: runs.every((run) => run.measurement.contactsMax >= 1),
          detail: `contacte maxime ${Math.max(...runs.map((run) => run.measurement.contactsMax))}, evenimente de coliziune ${runs.reduce((total, run) => total + run.measurement.collisionEvents, 0)}, distanță minimă în pereche ${Math.min(...runs.map((run) => run.measurement.minPairGapM ?? 999)).toFixed(2)} m, viteză max urmăritor ${Math.max(...runs.map((run) => run.measurement.pairFollowerSpeedMax)).toFixed(2)} m/s, lider ${Math.max(...runs.map((run) => run.measurement.pairLeaderSpeedMax)).toFixed(2)} m/s`,
        }),
      );
    if (spec.system === 'LEARNING')
      structural.push(
        Object.freeze({
          id: 'learning-activat',
          pass: runs.every((run) => run.measurement.learningActivations >= 1),
          detail: `segmente ${first.learningSegments}, activări ${first.learningActivations}`,
        }),
      );
    if (spec.system === 'RECORDER_AUTOSAVE')
      structural.push(
        Object.freeze({
          id: 'recorder-autosave-executat',
          pass: runs.every(
            (run) => run.measurement.recorderSamples > 0 && run.measurement.autosaveCaptures > 0,
          ),
          detail: `${first.recorderSamples} mostre, ${first.autosaveCaptures} capturi, vârf ${first.recorderPeakBytes} B`,
        }),
      );
    if (spec.system === 'XP')
      structural.push(
        Object.freeze({
          id: 'xp-creditat',
          pass: runs.every((run) => run.measurement.xpWindows >= 1),
          detail: `${first.xpWindows} ferestre de 30 s, ${first.xpEntries} intrări în ledger`,
        }),
      );
    const row: TrafficRowMeasurement = Object.freeze({
      spec,
      repeats: Object.freeze(runs.map((run) => run.measurement)),
      pooled: Object.freeze(pooled),
      perRepeatP95: Object.freeze(
        runs.map((run) =>
          Object.freeze({
            repeat: run.measurement.repeat,
            tick: run.measurement.cpu.tick.p95,
            physics: run.measurement.cpu.physics.p95,
            decisions: run.measurement.cpu.decisions.p95,
            ui: run.measurement.cpu.ui.p95,
            system: run.measurement.cpu.system.p95,
          }),
        ),
      ),
      simulatedSeconds,
      wallSeconds,
      expectedTaxis: spec.taxis,
      expectedCivilians: spec.civilians,
      physicalVehicles: first.physicalVehicles,
      surplusActors: first.surplusActors,
      invisibleTaxis: first.invisibleTaxis,
      invisibleVehicles: first.invisibleVehicles,
      invisibleTaxiDecisions: runs.reduce(
        (total, run) => total + run.measurement.invisibleDecisions,
        0,
      ),
      invisibleTaxiBodiesMoved: first.taxisMoved,
      fleetVehicles: first.fleetVehicles,
      fleetVehicleSeconds: runs.reduce(
        (total, run) => total + run.measurement.fleetVehicleSeconds,
        0,
      ),
      exposureSeconds: simulatedSeconds,
      contactsMax: Math.max(...runs.map((run) => run.measurement.contactsMax)),
      collisionEvents: runs.reduce((total, run) => total + run.measurement.collisionEvents, 0),
      learningSegments: runs.reduce((total, run) => total + run.measurement.learningSegments, 0),
      learningActivations: runs.reduce(
        (total, run) => total + run.measurement.learningActivations,
        0,
      ),
      learningEndToEndMs: learning.length === 0 ? null : summarize(learning),
      recorderPeakBytes:
        spec.system === 'RECORDER_AUTOSAVE'
          ? Math.max(...runs.map((run) => run.measurement.recorderPeakBytes))
          : null,
      recorderSamples: runs.reduce((total, run) => total + run.measurement.recorderSamples, 0),
      autosaveCaptures: runs.reduce((total, run) => total + run.measurement.autosaveCaptures, 0),
      autosaveBytes: runs.reduce((total, run) => total + run.measurement.autosaveBytes, 0),
      xpWindows: runs.reduce((total, run) => total + run.measurement.xpWindows, 0),
      xpEntries: first.xpEntries,
      coldFirstCommandMs: first.coldFirstCommandMs,
      cleanupLeaked: runs.some((run) => run.measurement.cleanupLeaked),
      structural: Object.freeze(structural),
    });
    rows.push(row);
    options.onRow?.(row, index, selected.length);
  }
  return Object.freeze({
    version: TRAFFIC_BENCHMARK_VERSION,
    measuredAt: options.measuredAt,
    machine: options.machine,
    command: options.command,
    protocol: Object.freeze({
      warmupTicks: TRAFFIC_WARMUP_TICKS,
      measuredTicks: TRAFFIC_MEASURED_TICKS,
      coldTicks: TRAFFIC_COLD_TICKS,
      repeats: TRAFFIC_REPEATS,
      coldRepeats: TRAFFIC_COLD_REPEATS,
      autosaveCadenceTicks: TRAFFIC_AUTOSAVE_CADENCE_TICKS,
      learningCadenceTicks: TRAFFIC_LEARNING_CADENCE_TICKS,
      xpWindowTicks: TRAFFIC_XP_WINDOW_TICKS,
      uiCadenceTicks: TRAFFIC_UI_CADENCE_TICKS,
      decisionCadenceTicks: TRAFFIC_DECISION_CADENCE_TICKS,
      observationHalfExtentM: TRAFFIC_OBSERVATION_HALF_EXTENT_M,
      seed: TRAFFIC_SEED,
    }),
    rows: Object.freeze(rows),
  });
}

/* ------------------------------------------------------------------ markdown */

function summaryCell(summary: StatisticSummary | null, digits = 2): string {
  return summary === null ? '—' : `${summary.p95.toFixed(digits)} / ${summary.p99.toFixed(digits)}`;
}

export function trafficBenchmarkMarkdown(report: TrafficBenchmarkReport): string {
  const lines: string[] = [];
  lines.push('# PBI 156 — benchmark flotă și trafic');
  lines.push('');
  lines.push(
    `Raport determinist derivat din matricea executată (${report.version}); bugetele sunt citite din manifestul \`${report.manifest.budgetVersion}\` și **nu** sunt modificate.`,
  );
  lines.push('');
  lines.push(`- Măsurat: ${report.measuredAt} pe ${report.machine}`);
  lines.push(`- Comandă: \`${report.command}\``);
  lines.push(
    `- Matrice: **${report.matrix.rows} rânduri** = ${report.matrix.taxis.length} numere de taxiuri × ${report.matrix.civilians.length} densități × ${report.matrix.systems.length} sisteme × ${report.matrix.conditions.length} condiții`,
  );
  lines.push(
    `- Sumar: **${report.summary.pass} PASS**, **${report.summary.fail} FAIL**, ${report.summary.stress} STRESS, ${report.summary.reported} REPORTED; gate: \`${report.summary.gate}\`; hardware joc complet: \`${report.summary.hardwareGameplayGate}\``,
  );
  lines.push('');
  lines.push('## Protocol');
  lines.push('');
  lines.push(
    `- Fiecare rulare: ${report.protocol.warmupTicks} tick-uri warmup + ${report.protocol.measuredTicks} tick-uri măsurate, ${report.protocol.repeats} repetări (${report.protocol.coldRepeats} pentru cold/first-use, fără warmup, ${report.protocol.coldTicks} tick-uri)`,
  );
  lines.push(
    `- Fereastră de observare: ±${report.protocol.observationHalfExtentM} m față de poziția taxiului 0; taxiurile din afara ei sunt „invizibile” pentru cameră, dar rămân în lumea fizică`,
  );
  lines.push(
    `- Cadențe: decizii ${report.protocol.decisionCadenceTicks} tick-uri, UI ${report.protocol.uiCadenceTicks} tick-uri, autosave ${report.protocol.autosaveCadenceTicks} tick-uri, learning ${report.protocol.learningCadenceTicks} tick-uri, XP ${report.protocol.xpWindowTicks} tick-uri`,
  );
  lines.push('');
  lines.push('## Matricea executată');
  lines.push('');
  lines.push(
    '| Taxiuri | Civili | Sistem | Condiție | Clasificare | Tick p95 / p99 (ms) | Fizică p95 | Decizii p95 | UI p95 | Sistem p95 | GPU | Verdict |',
  );
  lines.push('| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows)
    lines.push(
      `| ${row.spec.taxis} | ${row.spec.civilians} | ${row.spec.system} | ${row.spec.condition} | ${row.classification} | ${summaryCell(row.cpu.tick)} | ${row.cpu.physics.p95.toFixed(2)} | ${row.cpu.decisions.p95.toFixed(2)} | ${row.cpu.ui.p95.toFixed(2)} | ${row.cpu.system.p95.toFixed(2)} | NOT_MEASURED | ${row.verdict} |`,
    );
  lines.push('');
  lines.push('## Taxiuri invizibile și expunere');
  lines.push('');
  lines.push(
    '| Taxiuri | Civili | Sistem | Condiție | Invizibile | Decizii invizibile | Corpuri în mișcare | Expunere (vehicul-secunde) |',
  );
  lines.push('| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |');
  for (const row of report.rows)
    lines.push(
      `| ${row.spec.taxis} | ${row.spec.civilians} | ${row.spec.system} | ${row.spec.condition} | ${row.exposure.invisibleTaxis}/${row.spec.taxis} | ${row.exposure.invisibleTaxiDecisions} | ${row.exposure.invisibleTaxiBodiesMoved}/${row.spec.taxis} | ${row.exposure.fleetVehicleSeconds.toFixed(2)} |`,
    );
  lines.push('');
  lines.push(
    'Expunerea este citită din contractul real 137: `fleetVehicleSeconds = fleet.vehicles × simulatedSeconds`, cu numitorul pe toată flota 057, nu pe selecția camerei.',
  );
  lines.push('');
  lines.push('## Verificări de buget pe rândurile de gate');
  lines.push('');
  lines.push('| Rând | Verificare | Valoare | Buget | Sursă | Verdict |');
  lines.push('| --- | --- | ---: | ---: | --- | --- |');
  for (const row of report.rows.filter((entry) => entry.classification === 'GATE'))
    for (const entry of row.checks)
      lines.push(
        `| ${row.id} | ${entry.metric} | ${entry.actual === null ? '—' : entry.actual} ${entry.unit} | ${entry.budget === null ? 'fără buget' : `${entry.budget} ${entry.unit}`} | ${entry.source} | ${entry.verdict} |`,
      );
  lines.push('');
  lines.push('## Suprasarcină și abateri');
  lines.push('');
  const stress = report.rows.filter((row) => row.classification === 'STRESS');
  if (stress.length === 0) lines.push('Nicio probă de suprasarcină în matrice.');
  else {
    lines.push(
      '`30 taxiuri / 80 civili` este workload-ul `overload` al manifestului: se raportează separat, cu verdict `STRESS`, și nu închide gate-ul normal.',
    );
    lines.push('');
    for (const row of stress) {
      const tick = row.checks.find((entry) => entry.id.endsWith('-tick-p95'));
      lines.push(
        `- ${row.id}: tick p95 ${tick?.actual ?? '—'} ms (buget ${tick?.budget ?? '—'} ms); ${row.stressOverBudget.length === 0 ? 'fără depășiri măsurate' : `depășiri: ${row.stressOverBudget.join('; ')}`}`,
      );
    }
  }
  lines.push('');
  const failures = report.rows.filter((row) => row.verdict === 'FAIL');
  if (failures.length === 0) {
    lines.push(
      'Niciun rând de gate nu depășește bugetele măsurabile. Rândurile `REPORTED` sunt combinații de densitate în afara workload-urilor declarate în manifest; ele sunt măsurate și raportate, nu folosite ca dovadă de gate.',
    );
  } else {
    lines.push('Rânduri de gate peste buget:');
    lines.push('');
    for (const row of failures)
      lines.push(`- ${row.id}: ${row.findings.join('; ') || 'verificare structurală eșuată'}`);
  }
  lines.push('');
  lines.push('## Ce nu a putut fi măsurat');
  lines.push('');
  lines.push('| Metrică | Motiv | Măsurat în schimb |');
  lines.push('| --- | --- | --- |');
  for (const entry of report.notMeasured)
    lines.push(`| ${entry.metric} | ${entry.reason} | ${entry.measuredInstead} |`);
  lines.push('');
  lines.push(report.summary.note);
  lines.push('');
  return lines.join('\n');
}
