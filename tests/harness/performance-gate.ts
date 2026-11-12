/**
 * PBI 224 — contractul gate-ului de regresii de performanță.
 *
 * Modulul este **pur**: nu citește fișiere, nu pornește procese și nu măsoară timp de perete.
 * Scriptul `scripts/run-performance-gate.mjs` execută probele portabile ale reviziei curente,
 * citește dovezile comise ale celorlalte PBI-uri și scrie `measurement.json`; raportul agregat
 * (`report.json` + `report.md`) este o funcție deterministă de acea măsurătoare și de bugetele
 * citite din `Docs/performance-budgets.json`. `--check` rederivă raportul și îl compară byte cu byte.
 *
 * Reguli fixate aici:
 *  - bugetele sunt **citite** din manifest, niciodată definite sau relaxate în acest modul;
 *  - un verdict `PASS` fără măsurătoare este respins de `verifyPerformanceGateReport`;
 *  - un runner fără GPU real **nu** poate închide criteriul FPS: rândul `fps-hardware` rămâne
 *    `NOT_VALIDATED`, iar verdictul de release nu poate fi `PASS` cât timp există probe nevalidate;
 *  - baseline-ul nu se actualizează automat: manifestul este verificat ca nemodificat.
 */

export const PERFORMANCE_GATE_VERSION = '224-performance-gate-v1' as const;
export const PERFORMANCE_GATE_REPORT_VERSION = '224-performance-gate-report-v1' as const;
export const PERFORMANCE_GATE_REQUIRED_REPETITIONS = 5 as const;
export const PERFORMANCE_GATE_REQUIRED_SOAK_MINUTES = 60 as const;
export const PERFORMANCE_GATE_REQUIRED_SOAK_CYCLES = 20 as const;

const MIB = 1_048_576;

export type GateVerdict = 'PASS' | 'FAIL' | 'NOT_VALIDATED';
export type GateKind = 'PORTABLE' | 'EVIDENCE';
export type GateCriterion =
  | 'bundle'
  | 'capacity'
  | 'gameplay'
  | 'backends'
  | 'soak'
  | 'destruction'
  | 'challenges'
  | 'savefile'
  | 'lifecycle'
  | 'fps';

/** Etichetele criteriilor de acceptare din fișierul PBI 224. */
export const GATE_CRITERIA: Readonly<Record<GateCriterion, string>> = Object.freeze({
  bundle: 'Criteriul 1: bundle-ul și capacitățile resping depășirile',
  capacity: 'Criteriul 1: capacități structurale peste buget sunt respinse',
  fps: 'Criteriul 1: gate-ul FPS se închide numai pe hardware real, aceeași revizie',
  gameplay:
    'Criteriul 2: learning, recorder, autosave, KPI și XP pe workload maxim V1 și ambele backenduri',
  backends: 'Criteriul 2/4: ambele backenduri sunt declarate, nu presupuse',
  soak: 'Criteriul 3: soak de minimum 60 de minute, 20 de cicluri, platou, baseline neschimbat',
  destruction: 'Criteriul 4: distrugere, efecte și audio în buget',
  challenges: 'Criteriul 4: directorul de provocări random în buget',
  savefile: 'Criteriul 4: encode/canonicalizare/hash de savefile în buget',
  lifecycle: 'Criteriul 4: 20 de schimbări Academie/Haos/reset în buget',
});

/* ------------------------------------------------------------------------------------------- */
/* Bugete citite din manifest                                                                  */
/* ------------------------------------------------------------------------------------------- */

export interface GateBudgets {
  readonly budgetVersion: string;
  readonly criticalJsWasmTransferBytes: number;
  readonly firstRideAssetsTransferBytes: number;
  readonly drawCalls: number;
  readonly instances: number;
  readonly batches: number;
  readonly babylonObjects: number;
  readonly recorderRamBytes: number;
  readonly pendingWorkerPayloadBytes: number;
  readonly heavyBackgroundJobs: number;
  readonly frameP95Ms: number;
  readonly frameP99Ms: number;
  readonly gpuP95Ms: number;
  readonly authoritativeTickP95Ms: number;
  readonly p95RelativeIncrease: number;
  readonly p95AbsoluteIncreaseMs: number;
  readonly memoryRelativeIncrease: number;
  readonly memoryAbsoluteIncreaseBytes: number;
  readonly confirmationsOutOfFive: number;
  readonly automaticBaselineReplacement: boolean;
  readonly warmupSeconds: number;
  readonly measuredSeconds: number;
  readonly protocolRepetitions: number;
  readonly source: string;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Manifest field ${path} must be a finite number`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`Manifest field ${path} must be a boolean`);
  return value;
}

/** Citește defensiv manifestul: un buget dispărut este eroare, nu o trecere tacită. */
export function parseGateBudgets(value: unknown): GateBudgets {
  const root = value as Record<string, unknown>;
  if (typeof root !== 'object' || root === null)
    throw new TypeError('Budget manifest must be an object');
  const budgets = root.proposedBudgets as Record<string, unknown> | undefined;
  const capacities = root.proposedCapacities as Record<string, unknown> | undefined;
  const contracts = root.resourceAdmissionContracts as Record<string, unknown> | undefined;
  const rendering = contracts?.rendering as Record<string, unknown> | undefined;
  const regression = root.regressionProposal as Record<string, unknown> | undefined;
  const protocol = root.protocol as Record<string, unknown> | undefined;
  const laptop = budgets?.laptop as Record<string, unknown> | undefined;
  if (!budgets || !capacities || !rendering || !regression || !protocol || !laptop)
    throw new TypeError(
      'Budget manifest is missing proposedBudgets/proposedCapacities/resourceAdmissionContracts/regressionProposal/protocol',
    );
  return Object.freeze({
    budgetVersion: String(root.budgetVersion),
    criticalJsWasmTransferBytes: finite(
      capacities.criticalJsWasmTransferBytes,
      'proposedCapacities.criticalJsWasmTransferBytes',
    ),
    firstRideAssetsTransferBytes: finite(
      capacities.firstRideAssetsTransferBytes,
      'proposedCapacities.firstRideAssetsTransferBytes',
    ),
    drawCalls: finite(rendering.drawCalls, 'resourceAdmissionContracts.rendering.drawCalls'),
    instances: finite(rendering.instances, 'resourceAdmissionContracts.rendering.instances'),
    batches: finite(rendering.batches, 'resourceAdmissionContracts.rendering.batches'),
    babylonObjects: finite(
      rendering.babylonObjects,
      'resourceAdmissionContracts.rendering.babylonObjects',
    ),
    recorderRamBytes: finite(capacities.recorderRamBytes, 'proposedCapacities.recorderRamBytes'),
    pendingWorkerPayloadBytes: finite(
      capacities.pendingWorkerPayloadBytes,
      'proposedCapacities.pendingWorkerPayloadBytes',
    ),
    heavyBackgroundJobs: finite(
      capacities.heavyBackgroundJobs,
      'proposedCapacities.heavyBackgroundJobs',
    ),
    frameP95Ms: finite(laptop.frameP95Ms, 'proposedBudgets.laptop.frameP95Ms'),
    frameP99Ms: finite(laptop.frameP99Ms, 'proposedBudgets.laptop.frameP99Ms'),
    gpuP95Ms: finite(laptop.gpuP95Ms, 'proposedBudgets.laptop.gpuP95Ms'),
    authoritativeTickP95Ms: finite(
      laptop.authoritativeTickP95Ms,
      'proposedBudgets.laptop.authoritativeTickP95Ms',
    ),
    p95RelativeIncrease: finite(
      regression.p95RelativeIncrease,
      'regressionProposal.p95RelativeIncrease',
    ),
    p95AbsoluteIncreaseMs: finite(
      regression.p95AbsoluteIncreaseMs,
      'regressionProposal.p95AbsoluteIncreaseMs',
    ),
    memoryRelativeIncrease: finite(
      regression.memoryRelativeIncrease,
      'regressionProposal.memoryRelativeIncrease',
    ),
    memoryAbsoluteIncreaseBytes: finite(
      regression.memoryAbsoluteIncreaseBytes,
      'regressionProposal.memoryAbsoluteIncreaseBytes',
    ),
    confirmationsOutOfFive: finite(
      regression.confirmationsOutOfFive,
      'regressionProposal.confirmationsOutOfFive',
    ),
    automaticBaselineReplacement: bool(
      regression.automaticBaselineReplacement,
      'regressionProposal.automaticBaselineReplacement',
    ),
    warmupSeconds: finite(protocol.warmupSeconds, 'protocol.warmupSeconds'),
    measuredSeconds: finite(protocol.measuredSeconds, 'protocol.measuredSeconds'),
    protocolRepetitions: finite(protocol.repetitions, 'protocol.repetitions'),
    source: 'Docs/performance-budgets.json',
  });
}

/* ------------------------------------------------------------------------------------------- */
/* Măsurătoarea gate-ului                                                                      */
/* ------------------------------------------------------------------------------------------- */

export interface GateBuildSample {
  readonly javascriptBytes: number;
  readonly wasmBytes: number;
  readonly cssBytes: number;
  readonly gzipBytes: number;
  readonly artifactCount: number;
  readonly digest: string;
}

export interface GateBuildBaseline {
  readonly commit: string;
  readonly javascriptBytes: number;
  readonly wasmBytes: number;
  readonly file: string;
}

export interface GateBuildInput {
  readonly samples: readonly GateBuildSample[];
  readonly baseline: GateBuildBaseline | null;
  /** 0 pentru o rulare curată; >0 doar în demonstrația de regresie controlată. */
  readonly injectedPayloadBytes: number;
}

export interface GateRenderSample {
  readonly digest: string;
  readonly cityDrawCalls: number;
  readonly decorDrawCalls: number;
  readonly thinInstances: number;
  readonly thinBatches: number;
  readonly decorCells: number;
  readonly meshes: number;
  readonly elements: number;
}

export interface GateCommandResult {
  readonly id: string;
  readonly command: string;
  readonly exitCode: number;
}

export interface GateEvidenceInput {
  readonly id: string;
  readonly criterion: GateCriterion;
  readonly title: string;
  readonly files: readonly string[];
  readonly revision: string | null;
  readonly checks: number;
  readonly passed: number;
  readonly verdict: GateVerdict;
  readonly detail: string;
  readonly reason: string;
}

export interface GateSoakInput {
  readonly file: string;
  readonly revision: string | null;
  readonly status: string;
  readonly minutes: number;
  readonly cycles: number;
  readonly cleanCycles: number;
  readonly trends: readonly { readonly id: string; readonly classification: string }[];
  readonly heapDeltaBytes: number;
  readonly allowedHeapGrowthBytes: number;
  readonly queueMaxBytes: number;
  readonly queueMaxJobs: number;
  readonly throttling: string;
  readonly baselineUnmodified: boolean;
}

export interface GateHardwareCapture {
  readonly backend: string;
  readonly workload: string;
  readonly build: string;
  readonly frameP95Ms: number;
  readonly gpuP95Ms: number | null;
}

export interface GateHardwareInput {
  readonly measured: boolean;
  readonly reason: string;
  readonly revision: string | null;
  readonly sameRevision: boolean;
  readonly files: readonly string[];
  readonly captures: readonly GateHardwareCapture[];
}

export interface GateMeasurement {
  readonly version: string;
  readonly budgetVersion: string;
  readonly commit: string;
  readonly measuredAt: string;
  readonly manifest: Readonly<{ readonly digest: string; readonly modified: boolean }>;
  readonly build: GateBuildInput | null;
  readonly render: readonly GateRenderSample[];
  readonly commands: readonly GateCommandResult[];
  readonly evidence: readonly GateEvidenceInput[];
  readonly soak: GateSoakInput | null;
  readonly hardware: GateHardwareInput;
}

/* ------------------------------------------------------------------------------------------- */
/* Raportul agregat                                                                            */
/* ------------------------------------------------------------------------------------------- */

export interface GateRow {
  readonly id: string;
  readonly criterion: GateCriterion;
  readonly title: string;
  readonly kind: GateKind;
  readonly verdict: GateVerdict;
  readonly detail: string;
  readonly reason: string;
  readonly evidence: string;
  readonly revision: string | null;
}

export interface PerformanceGateReport {
  readonly version: string;
  readonly budgetVersion: string;
  readonly commit: string;
  readonly measuredAt: string;
  readonly manifest: Readonly<{
    readonly budgetVersion: string;
    readonly modified: false;
    readonly baselineReplacedAutomatically: false;
    readonly automaticBaselineReplacement: boolean;
  }>;
  readonly hardware: Readonly<{
    readonly measured: boolean;
    readonly reason: string;
    readonly revision: string | null;
    readonly sameRevision: boolean;
  }>;
  readonly repetitions: Readonly<{
    readonly required: number;
    readonly count: number;
    readonly identical: boolean;
    readonly buildBytes: readonly number[];
    readonly renderDigests: readonly string[];
    readonly note: string;
  }>;
  readonly rows: readonly GateRow[];
  readonly notValidated: readonly Readonly<{
    readonly id: string;
    readonly criterion: GateCriterion;
    readonly reason: string;
  }>[];
  readonly summary: Readonly<{
    readonly pass: number;
    readonly fail: number;
    readonly notValidated: number;
    readonly structural: GateVerdict;
    readonly release: GateVerdict;
    readonly openCriteria: readonly string[];
    readonly note: string;
  }>;
}

/** Dovezile obligatorii, în ordinea canonică din raport. */
export const REQUIRED_EVIDENCE_ROWS: readonly Readonly<{
  readonly id: string;
  readonly criterion: GateCriterion;
  readonly title: string;
}>[] = Object.freeze([
  Object.freeze({
    id: 'probe-render-budget',
    criterion: 'capacity' as const,
    title: 'proba 157 (buget de randare) este curentă față de sursă',
  }),
  Object.freeze({
    id: 'probe-simulation-budget',
    criterion: 'gameplay' as const,
    title: 'proba 158 (buget de simulare) este curentă față de sursă',
  }),
  Object.freeze({
    id: 'probe-traffic-benchmark',
    criterion: 'gameplay' as const,
    title: 'proba 156 (benchmark de flotă/trafic) este curentă față de sursă',
  }),
  Object.freeze({
    id: 'probe-hardware-budget',
    criterion: 'gameplay' as const,
    title: 'proba 155 (hardware și bugete) este curentă față de sursă',
  }),
  Object.freeze({
    id: 'probe-soak-integrity',
    criterion: 'soak' as const,
    title: 'raportul soak 159 este curent față de măsurătoarea comisă',
  }),
  Object.freeze({
    id: 'gameplay-systems-max-v1',
    criterion: 'gameplay' as const,
    title: 'learning, recorder+autosave și XP trec pe workload maxim V1 (156)',
  }),
  Object.freeze({
    id: 'destruction-effects-audio',
    criterion: 'destruction' as const,
    title: 'distrugere, efecte și audio în buget (227/228/149)',
  }),
  Object.freeze({
    id: 'challenge-director',
    criterion: 'challenges' as const,
    title: 'directorul de provocări random și experiența în buget (232/233)',
  }),
  Object.freeze({
    id: 'savefile-integrity',
    criterion: 'savefile' as const,
    title: 'encode/canonicalizare/hash de savefile în buget (234)',
  }),
  Object.freeze({
    id: 'academy-chaos-cycles',
    criterion: 'lifecycle' as const,
    title: '20 de schimbări Academie/Haos și 20 de reseturi în buget (225/226)',
  }),
  Object.freeze({
    id: 'backend-matrix',
    criterion: 'backends' as const,
    title: 'matricea WEBGPU + WEBGL 2 este declarată (154)',
  }),
]);

const RENDER_CAPACITY_ROWS = Object.freeze([
  'bundle-critical-transfer',
  'bundle-regression',
  'capacity-render',
  'determinism',
] as const);

function mib(bytes: number): string {
  return `${(bytes / MIB).toFixed(2)} MiB`;
}

function worst(samples: readonly GateBuildSample[]): GateBuildSample | null {
  let selected: GateBuildSample | null = null;
  for (const sample of samples) {
    const total = sample.javascriptBytes + sample.wasmBytes;
    if (selected === null || total > selected.javascriptBytes + selected.wasmBytes)
      selected = sample;
  }
  return selected;
}

function buildRow(input: {
  id: string;
  criterion: GateCriterion;
  title: string;
  verdict: GateVerdict;
  detail: string;
  reason: string;
  evidence: string;
}): GateRow {
  return Object.freeze({ ...input, kind: 'PORTABLE' as const, revision: null });
}

function evidenceRow(
  entry: GateEvidenceInput,
  required: { readonly id: string; readonly criterion: GateCriterion; readonly title: string },
): GateRow {
  const incomplete =
    entry.verdict === 'PASS' && (entry.checks <= 0 || entry.passed !== entry.checks);
  return Object.freeze({
    id: required.id,
    criterion: required.criterion,
    title: required.title,
    kind: 'EVIDENCE' as const,
    verdict: incomplete ? ('FAIL' as const) : entry.verdict,
    detail: entry.detail,
    reason: incomplete
      ? `dovada are ${entry.passed}/${entry.checks} verificări trecute, deci nu poate fi PASS`
      : entry.reason,
    evidence: entry.files.join(', '),
    revision: entry.revision,
  });
}

function missingEvidenceRow(required: {
  readonly id: string;
  readonly criterion: GateCriterion;
  readonly title: string;
}): GateRow {
  return Object.freeze({
    id: required.id,
    criterion: required.criterion,
    title: required.title,
    kind: 'EVIDENCE' as const,
    verdict: 'NOT_VALIDATED' as const,
    detail: '',
    reason: 'dovada nu a fost produsă sau nu a fost citită de măsurătoarea gate-ului',
    evidence: '',
    revision: null,
  });
}

function structuralRows(measurement: GateMeasurement, budgets: GateBudgets): readonly GateRow[] {
  const rows: GateRow[] = [];
  const build = measurement.build;
  const samples = build?.samples ?? [];
  const selected = worst(samples);
  if (build === null || selected === null) {
    const reason =
      'build-ul de producție nu a fost măsurat; gate-ul nu declară PASS fără bytes reali';
    rows.push(
      buildRow({
        id: 'bundle-critical-transfer',
        criterion: 'bundle',
        title: 'bundle JS+WASM sub capacitatea critică de transfer',
        verdict: 'NOT_VALIDATED',
        detail: '',
        reason,
        evidence: 'build de producție (vite)',
      }),
      buildRow({
        id: 'bundle-regression',
        criterion: 'bundle',
        title: 'bundle-ul nu crește peste pragul relativ confirmat',
        verdict: 'NOT_VALIDATED',
        detail: '',
        reason,
        evidence: 'build de producție (vite)',
      }),
    );
  } else {
    const bytes = selected.javascriptBytes + selected.wasmBytes;
    const overBudget = bytes > budgets.criticalJsWasmTransferBytes;
    rows.push(
      buildRow({
        id: 'bundle-critical-transfer',
        criterion: 'bundle',
        title: 'bundle JS+WASM sub capacitatea critică de transfer',
        verdict: overBudget ? 'FAIL' : 'PASS',
        detail: `${mib(bytes)} (${bytes} B) din ${mib(budgets.criticalJsWasmTransferBytes)}; JS ${selected.javascriptBytes} B + WASM ${selected.wasmBytes} B, gzip ${selected.gzipBytes} B, ${selected.artifactCount} artefacte`,
        reason: overBudget
          ? `bundle-ul depășește capacitatea de ${mib(budgets.criticalJsWasmTransferBytes)} cu ${mib(bytes - budgets.criticalJsWasmTransferBytes)}`
          : '',
        evidence: `${budgets.source} proposedCapacities.criticalJsWasmTransferBytes`,
      }),
    );
    const baseline = build.baseline;
    if (baseline === null) {
      rows.push(
        buildRow({
          id: 'bundle-regression',
          criterion: 'bundle',
          title: 'bundle-ul nu crește peste pragul relativ confirmat',
          verdict: 'NOT_VALIDATED',
          detail: '',
          reason: 'lipsește baseline-ul de build comis (155 build-transfer.json)',
          evidence: 'Docs/Evidence/155-hardware-budget/build-transfer.json',
        }),
      );
    } else {
      const baselineBytes = baseline.javascriptBytes + baseline.wasmBytes;
      const confirmed = samples.filter((sample) => {
        const delta = sample.javascriptBytes + sample.wasmBytes - baselineBytes;
        return (
          delta > baselineBytes * budgets.p95RelativeIncrease &&
          delta > budgets.memoryAbsoluteIncreaseBytes
        );
      }).length;
      const regressed = confirmed >= budgets.confirmationsOutOfFive;
      rows.push(
        buildRow({
          id: 'bundle-regression',
          criterion: 'bundle',
          title: 'bundle-ul nu crește peste pragul relativ confirmat',
          verdict: regressed ? 'FAIL' : 'PASS',
          detail: `baseline ${mib(baselineBytes)} (${baseline.commit.slice(0, 12)}); ${confirmed}/${samples.length} repetări peste >${budgets.p95RelativeIncrease * 100}% și >${mib(budgets.memoryAbsoluteIncreaseBytes)}; prag de confirmare ${budgets.confirmationsOutOfFive}/${budgets.protocolRepetitions}`,
          reason: regressed
            ? `creștere relativă confirmată în ${confirmed} din ${samples.length} repetări`
            : '',
          evidence: `${baseline.file} + ${budgets.source} regressionProposal`,
        }),
      );
    }
  }

  const renders = measurement.render;
  if (renders.length === 0) {
    rows.push(
      buildRow({
        id: 'capacity-render',
        criterion: 'capacity',
        title: 'draw calls, instanțe și obiecte Babylon sub capacitățile fixate',
        verdict: 'NOT_VALIDATED',
        detail: '',
        reason: 'proba structurală de randare nu a fost executată',
        evidence: 'tests/harness/render-budget.ts',
      }),
    );
  } else {
    const drawCalls = Math.max(
      ...renders.map((entry) => entry.cityDrawCalls + entry.decorDrawCalls),
    );
    const instances = Math.max(...renders.map((entry) => entry.thinInstances));
    const batches = Math.max(...renders.map((entry) => entry.thinBatches + entry.decorCells));
    const objects = Math.max(...renders.map((entry) => entry.meshes));
    const exceeded = [
      [
        'draw calls',
        drawCalls,
        budgets.drawCalls,
        'resourceAdmissionContracts.rendering.drawCalls',
      ],
      [
        'instanțe thin',
        instances,
        budgets.instances,
        'resourceAdmissionContracts.rendering.instances',
      ],
      ['batchuri', batches, budgets.batches, 'resourceAdmissionContracts.rendering.batches'],
      [
        'obiecte Babylon',
        objects,
        budgets.babylonObjects,
        'resourceAdmissionContracts.rendering.babylonObjects',
      ],
    ].filter(([, value, budget]) => Number(value) > Number(budget));
    rows.push(
      buildRow({
        id: 'capacity-render',
        criterion: 'capacity',
        title: 'draw calls, instanțe și obiecte Babylon sub capacitățile fixate',
        verdict: exceeded.length === 0 ? 'PASS' : 'FAIL',
        detail: `draw calls ${drawCalls}/${budgets.drawCalls}, instanțe thin ${instances}/${budgets.instances}, batchuri ${batches}/${budgets.batches}, obiecte Babylon ${objects}/${budgets.babylonObjects}, ${renders[0]?.elements ?? 0} elemente randate`,
        reason:
          exceeded.length === 0
            ? ''
            : exceeded
                .map(
                  ([name, value, budget]) => `${String(name)} ${String(value)} > ${String(budget)}`,
                )
                .join('; '),
        evidence: `${budgets.source} resourceAdmissionContracts.rendering`,
      }),
    );
  }

  const buildDigests = new Set((build?.samples ?? []).map((sample) => sample.digest));
  const renderDigests = new Set(renders.map((entry) => entry.digest));
  const identical =
    (build?.samples.length ?? 0) > 0 &&
    renders.length > 0 &&
    buildDigests.size === 1 &&
    renderDigests.size === 1;
  rows.push(
    buildRow({
      id: 'determinism',
      criterion: 'capacity',
      title: 'cinci repetări produc aceiași bytes și aceeași probă structurală',
      verdict: identical ? 'PASS' : 'FAIL',
      detail: `${build?.samples.length ?? 0} builduri, ${renders.length} probe de randare; digesturi distincte: ${buildDigests.size} build / ${renderDigests.size} randare`,
      reason: identical
        ? ''
        : 'repetările nu sunt identice; un gate structural trebuie să fie determinist',
      evidence: 'repetițiile gate-ului',
    }),
  );

  const soak = measurement.soak;
  if (soak === null) {
    rows.push(
      Object.freeze({
        id: 'soak-60min',
        criterion: 'soak' as const,
        title: 'soak de minimum 60 de minute și 20 de cicluri, cu platou',
        kind: 'EVIDENCE' as const,
        verdict: 'NOT_VALIDATED' as const,
        detail: '',
        reason: 'nu există o măsurătoare soak a reviziei curente',
        evidence: 'Docs/Evidence/224-performance-gate/soak/',
        revision: null,
      }),
    );
  } else {
    const failures: string[] = [];
    if (soak.status !== 'SOAK_PASS') failures.push(`verdict ${soak.status}`);
    if (soak.minutes < PERFORMANCE_GATE_REQUIRED_SOAK_MINUTES) failures.push(`${soak.minutes} min`);
    if (soak.cycles < PERFORMANCE_GATE_REQUIRED_SOAK_CYCLES)
      failures.push(`${soak.cycles} cicluri`);
    if (soak.cleanCycles !== soak.cycles)
      failures.push(`${soak.cleanCycles}/${soak.cycles} curate`);
    const growth = soak.trends.filter((trend) => trend.classification !== 'PLATEAU');
    if (growth.length > 0)
      failures.push(
        `tendințe fără platou: ${growth.map((trend) => `${trend.id} ${trend.classification}`).join(', ')}`,
      );
    if (soak.heapDeltaBytes > soak.allowedHeapGrowthBytes)
      failures.push(`heap +${mib(soak.heapDeltaBytes)}`);
    if (soak.queueMaxJobs > budgets.heavyBackgroundJobs)
      failures.push(`${soak.queueMaxJobs} joburi în coadă`);
    if (soak.queueMaxBytes > budgets.pendingWorkerPayloadBytes)
      failures.push(`${mib(soak.queueMaxBytes)} payload în așteptare`);
    if (!soak.baselineUnmodified) failures.push('manifestul de bugete apare modificat');
    const plateaus = soak.trends.filter((trend) => trend.classification === 'PLATEAU').length;
    rows.push(
      Object.freeze({
        id: 'soak-60min',
        criterion: 'soak' as const,
        title: 'soak de minimum 60 de minute și 20 de cicluri, cu platou',
        kind: 'EVIDENCE' as const,
        verdict: failures.length === 0 ? ('PASS' as const) : ('FAIL' as const),
        detail: `${soak.minutes} min, ${soak.cycles} cicluri (${soak.cleanCycles} curate), ${plateaus}/${soak.trends.length} tendințe PLATEAU, heap +${mib(soak.heapDeltaBytes)} din ${mib(soak.allowedHeapGrowthBytes)}, coadă max ${soak.queueMaxJobs} joburi / ${soak.queueMaxBytes} B, throttling ${soak.throttling}`,
        reason: failures.length === 0 ? '' : failures.join('; '),
        evidence: soak.file,
        revision: soak.revision,
      }),
    );
  }

  const hardware = measurement.hardware;
  const measuredSameRevision =
    hardware.measured && hardware.sameRevision && hardware.captures.length > 0;
  const overFps = hardware.captures.filter((capture) => capture.frameP95Ms > budgets.frameP95Ms);
  const fpsVerdict: GateVerdict = !measuredSameRevision
    ? 'NOT_VALIDATED'
    : overFps.length === 0
      ? 'PASS'
      : 'FAIL';
  rows.push(
    Object.freeze({
      id: 'fps-hardware',
      criterion: 'fps' as const,
      title: 'FPS și frame p95 pe hardware real, pe aceeași revizie și ambele backenduri',
      kind: 'EVIDENCE' as const,
      verdict: fpsVerdict,
      detail: measuredSameRevision
        ? hardware.captures
            .map(
              (capture) =>
                `${capture.backend} ${capture.workload} p95 ${capture.frameP95Ms} ms, GPU ${capture.gpuP95Ms === null ? 'null (fără timer)' : `${capture.gpuP95Ms} ms`}`,
            )
            .join(' · ')
        : '',
      reason:
        fpsVerdict === 'NOT_VALIDATED'
          ? hardware.reason.trim().length > 0
            ? hardware.reason
            : 'nu există o măsurătoare FPS pe hardware real pentru această revizie'
          : fpsVerdict === 'FAIL'
            ? overFps
                .map(
                  (capture) =>
                    `${capture.backend} ${capture.workload} p95 ${capture.frameP95Ms} ms > ${budgets.frameP95Ms} ms`,
                )
                .join('; ')
            : '',
      evidence: hardware.files.join(', '),
      revision: hardware.revision,
    }),
  );
  return Object.freeze(rows);
}

export function buildPerformanceGateReport(input: {
  readonly budgets: GateBudgets;
  readonly measurement: GateMeasurement;
}): PerformanceGateReport {
  const { budgets, measurement } = input;
  const byId = new Map(measurement.evidence.map((entry) => [entry.id, entry]));
  const evidenceRows = REQUIRED_EVIDENCE_ROWS.map((required) => {
    const entry = byId.get(required.id);
    return entry === undefined ? missingEvidenceRow(required) : evidenceRow(entry, required);
  });
  const rows = Object.freeze([...structuralRows(measurement, budgets), ...evidenceRows]);
  const portable = rows.filter((row) => row.kind === 'PORTABLE');
  const fail = rows.filter((row) => row.verdict === 'FAIL').length;
  const notValidated = rows.filter((row) => row.verdict === 'NOT_VALIDATED');
  const structural: GateVerdict = portable.some((row) => row.verdict === 'FAIL')
    ? 'FAIL'
    : portable.some((row) => row.verdict === 'NOT_VALIDATED')
      ? 'NOT_VALIDATED'
      : 'PASS';
  const release: GateVerdict =
    fail > 0 ? 'FAIL' : notValidated.length > 0 ? 'NOT_VALIDATED' : 'PASS';
  const buildSamples = measurement.build?.samples ?? [];
  const buildBytes = buildSamples.map((sample) => sample.javascriptBytes + sample.wasmBytes);
  const renderDigests = measurement.render.map((entry) => entry.digest);
  const buildDigests = buildSamples.map((sample) => sample.digest);
  const identical =
    buildSamples.length === measurement.render.length &&
    new Set(buildDigests).size <= 1 &&
    new Set(renderDigests).size <= 1 &&
    buildSamples.length > 0;
  const openCriteria = [...new Set(notValidated.map((row) => GATE_CRITERIA[row.criterion]))].sort();
  return Object.freeze({
    version: PERFORMANCE_GATE_REPORT_VERSION,
    budgetVersion: budgets.budgetVersion,
    commit: measurement.commit,
    measuredAt: measurement.measuredAt,
    manifest: Object.freeze({
      budgetVersion: budgets.budgetVersion,
      modified: false as const,
      baselineReplacedAutomatically: false as const,
      automaticBaselineReplacement: budgets.automaticBaselineReplacement,
    }),
    hardware: Object.freeze({
      measured: measurement.hardware.measured,
      reason: measurement.hardware.reason,
      revision: measurement.hardware.revision,
      sameRevision: measurement.hardware.sameRevision,
    }),
    repetitions: Object.freeze({
      required: PERFORMANCE_GATE_REQUIRED_REPETITIONS,
      count: buildSamples.length,
      identical,
      buildBytes: Object.freeze(buildBytes),
      renderDigests: Object.freeze(renderDigests),
      note: identical
        ? `cele ${buildSamples.length} repetări produc aceiași bytes și aceeași probă structurală (variație 0)`
        : `repetările nu sunt identice: ${new Set(buildDigests).size} digesturi de build, ${new Set(renderDigests).size} digesturi de randare`,
    }),
    rows,
    notValidated: Object.freeze(
      notValidated.map((row) =>
        Object.freeze({ id: row.id, criterion: row.criterion, reason: row.reason }),
      ),
    ),
    summary: Object.freeze({
      pass: rows.filter((row) => row.verdict === 'PASS').length,
      fail,
      notValidated: notValidated.length,
      structural,
      release,
      openCriteria: Object.freeze(openCriteria),
      note: 'Verdictul structural acoperă probele portabile ale reviziei curente. Verdictul de release poate fi PASS numai când nicio probă obligatorie nu este NOT_VALIDATED; fără GPU real, FPS rămâne deschis.',
    }),
  });
}

/* ------------------------------------------------------------------------------------------- */
/* Verificarea raportului                                                                      */
/* ------------------------------------------------------------------------------------------- */

/** Autoverificare structurală; nu este folosită niciodată pentru a ascunde un FAIL. */
export function verifyPerformanceGateReport(report: PerformanceGateReport): readonly string[] {
  const issues: string[] = [];
  if (report.manifest.modified !== false) issues.push('manifestul de bugete apare ca modificat');
  if (report.manifest.baselineReplacedAutomatically !== false)
    issues.push('baseline-ul apare ca înlocuit automat');
  if (report.manifest.automaticBaselineReplacement !== false)
    issues.push('manifestul permite înlocuirea automată a baseline-ului');
  const counted = report.summary.pass + report.summary.fail + report.summary.notValidated;
  if (counted !== report.rows.length)
    issues.push(`sumarul numără ${counted} rânduri, raportul are ${report.rows.length}`);
  const fails = report.rows.filter((row) => row.verdict === 'FAIL').length;
  if (fails !== report.summary.fail)
    issues.push(`sumarul declară ${report.summary.fail} FAIL, raportul are ${fails}`);
  const unvalidated = report.rows.filter((row) => row.verdict === 'NOT_VALIDATED');
  if (unvalidated.length !== report.summary.notValidated)
    issues.push(
      `sumarul declară ${report.summary.notValidated} NOT_VALIDATED, raportul are ${unvalidated.length}`,
    );
  if (report.notValidated.length !== unvalidated.length)
    issues.push('lista NOT_VALIDATED nu acoperă toate rândurile nevalidate');
  for (const row of report.rows) {
    if (row.verdict === 'PASS' && row.detail.trim().length === 0)
      issues.push(`rândul ${row.id} este PASS fără măsurătoare`);
    if (row.verdict === 'NOT_VALIDATED' && row.reason.trim().length === 0)
      issues.push(`rândul ${row.id} este NOT_VALIDATED fără motiv`);
    if (row.verdict === 'FAIL' && row.reason.trim().length === 0)
      issues.push(`rândul ${row.id} este FAIL fără motiv`);
    if (row.verdict !== 'NOT_VALIDATED' && row.evidence.trim().length === 0)
      issues.push(`rândul ${row.id} nu citează dovada`);
  }
  const portable = report.rows.filter((row) => row.kind === 'PORTABLE');
  const expectedStructural: GateVerdict = portable.some((row) => row.verdict === 'FAIL')
    ? 'FAIL'
    : portable.some((row) => row.verdict === 'NOT_VALIDATED')
      ? 'NOT_VALIDATED'
      : 'PASS';
  if (report.summary.structural !== expectedStructural)
    issues.push(
      `verdictul structural este ${report.summary.structural}, așteptat ${expectedStructural}`,
    );
  const expectedRelease: GateVerdict =
    fails > 0 ? 'FAIL' : unvalidated.length > 0 ? 'NOT_VALIDATED' : 'PASS';
  if (report.summary.release !== expectedRelease)
    issues.push(`verdictul de release este ${report.summary.release}, așteptat ${expectedRelease}`);
  if (report.summary.release === 'PASS' && !report.hardware.measured)
    issues.push('release PASS fără măsurătoare hardware');
  if (report.summary.release === 'PASS' && report.notValidated.length > 0)
    issues.push('release PASS cu probe nevalidate');
  const ids = report.rows.map((row) => row.id);
  for (const id of [...RENDER_CAPACITY_ROWS, 'soak-60min', 'fps-hardware'])
    if (ids.filter((candidate) => candidate === id).length !== 1)
      issues.push(`rândul obligatoriu ${id} lipsește sau este duplicat`);
  for (const required of REQUIRED_EVIDENCE_ROWS) {
    const row = report.rows.find((candidate) => candidate.id === required.id);
    if (row === undefined) {
      issues.push(`rândul de dovezi ${required.id} lipsește`);
      continue;
    }
    if (row.criterion !== required.criterion)
      issues.push(`rândul ${required.id} are criteriul ${row.criterion}`);
    if (row.verdict === 'PASS' && (row.kind !== 'EVIDENCE' || row.evidence.trim().length === 0))
      issues.push(`rândul ${required.id} este PASS fără sursă de dovezi`);
  }
  const fps = report.rows.find((row) => row.id === 'fps-hardware');
  if (fps !== undefined) {
    if (!report.hardware.measured && fps.verdict !== 'NOT_VALIDATED')
      issues.push('FPS este închis fără măsurătoare hardware reală');
    if (report.hardware.measured && report.hardware.sameRevision && fps.verdict === 'NOT_VALIDATED')
      issues.push('FPS este nevalidat deși există capturi pe aceeași revizie');
  }
  if (report.repetitions.count !== report.repetitions.required)
    issues.push(
      `raportul are ${report.repetitions.count} repetări, contractul cere ${report.repetitions.required}`,
    );
  if (!report.repetitions.identical) {
    const determinism = report.rows.find((row) => row.id === 'determinism');
    if (determinism === undefined || determinism.verdict !== 'FAIL')
      issues.push('repetările nu sunt identice, dar determinismul nu este raportat ca FAIL');
  }
  return Object.freeze(issues);
}

/* ------------------------------------------------------------------------------------------- */
/* Markdown                                                                                    */
/* ------------------------------------------------------------------------------------------- */

export function performanceGateMarkdown(report: PerformanceGateReport): string {
  const lines: string[] = [];
  lines.push('# PBI 224 — raport agregat al gate-ului de regresii de performanță');
  lines.push('');
  lines.push(
    `Verdict structural: \`${report.summary.structural}\` · verdict de release: \`${report.summary.release}\` · revizie \`${report.commit.slice(0, 12)}\` · manifest \`${report.manifest.budgetVersion}\` (nemodificat).`,
  );
  lines.push('');
  lines.push('## Sumar');
  lines.push('');
  lines.push(
    `- Probe: **${report.summary.pass} PASS**, **${report.summary.fail} FAIL**, ${report.summary.notValidated} NOT_VALIDATED`,
  );
  lines.push(
    `- Repetări: ${report.repetitions.count}/${report.repetitions.required}; ${report.repetitions.note}`,
  );
  lines.push(
    `- Hardware FPS: ${report.hardware.measured ? 'măsurat' : 'nemăsurat'}${report.hardware.measured ? ` pe revizia \`${report.hardware.revision ?? 'necunoscută'}\`` : ''}; ${report.hardware.measured ? (report.hardware.sameRevision ? 'aceeași revizie' : 'revizie diferită') : report.hardware.reason}`,
  );
  lines.push('');
  lines.push('## Probe și motive');
  lines.push('');
  lines.push('| Probă | Criteriu | Fel | Verdict | Detaliu | Motiv | Dovadă |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows)
    lines.push(
      `| ${row.id} · ${row.title} | ${GATE_CRITERIA[row.criterion]} | ${row.kind} | \`${row.verdict}\` | ${row.detail.length === 0 ? '—' : row.detail} | ${row.reason.length === 0 ? '—' : row.reason} | ${row.evidence} |`,
    );
  lines.push('');
  lines.push('## Stabilitate pe repetări');
  lines.push('');
  lines.push(
    `- Bytes per repetare: ${report.repetitions.buildBytes.map((bytes) => `${bytes} B`).join(' · ')}`,
  );
  lines.push(
    `- Digesturi de randare: ${report.repetitions.renderDigests.map((digest) => `\`${digest}\``).join(' · ')}`,
  );
  lines.push(`- ${report.repetitions.note}`);
  lines.push('');
  lines.push('## Ce rămâne deschis');
  lines.push('');
  if (report.notValidated.length === 0) lines.push('Nicio probă nu a rămas nevalidată.');
  else
    for (const entry of report.notValidated)
      lines.push(`- **${entry.id}** (${GATE_CRITERIA[entry.criterion]}): ${entry.reason}`);
  lines.push('');
  lines.push(report.summary.note);
  lines.push('');
  return lines.join('\n');
}
