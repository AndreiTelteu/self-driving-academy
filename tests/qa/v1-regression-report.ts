import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTOSAVE_BUDGET,
  ECONOMY_SAVE_LIMITS,
  WORLD_SNAPSHOT_VERSION,
} from '../../src/persistence/index';
import { ECONOMY_CLOCK_VERSION, KPI_HISTORY_LIMITS } from '../../src/economy/index';
import { DAILY_GENERATOR_VERSION, DAILY_PROGRESS_VERSION } from '../../src/missions/index';
import { KPI_IMPACT_VERSION } from '../../src/economy/index';
import {
  CITY_STYLE_VERSION,
  LEARNING_EPOCH_VERSION,
  THREE_MODES_VERSION,
} from '../../src/app/index';
import { WORLD_RECORDER_VERSION, WORLD_REPLAY_CHUNK_VERSION } from '../../src/replay/index';
import { runModesPropagation } from './modes-propagation';
import { runEconomyDailyXp } from './economy-daily-xp';
import { runPersistenceReplay } from './persistence-replay';
import { runCombinedProbe } from './combined-probe';
import type { CombinedProbe } from './combined-probe';
import { runDependencyCheck } from './dependencies';
import type { QaCheck, QaRow } from './v1-regression-support';
import {
  V1_REGRESSION_COMMAND,
  V1_REGRESSION_VERSION,
  notRunRow,
  qaCheck,
  qaRow,
} from './v1-regression-support';

/**
 * The executed V1 regression matrix of PBI 216.
 *
 * The report is a transcript: every row names the delivered contract it regresses, the command that
 * ran it and the real numbers it produced. Costs are compared with `Docs/performance-budgets.json`
 * where a budget exists; where the manifest has no budget, the gap is reported instead of a made-up
 * threshold. The level of validation is `targeted`: deterministic Node scenarios and structural
 * costs, no browser playtest and no frame/FPS claim.
 */

export interface BudgetRow {
  readonly metric: string;
  readonly actual: number | string | null;
  readonly budget: number | string | null;
  readonly unit: string;
  readonly source: string;
  readonly verdict: 'PASS' | 'FAIL' | 'NOT_RUN';
  readonly note: string;
}

export interface V1RegressionReport {
  readonly version: typeof V1_REGRESSION_VERSION;
  readonly generatedBy: 'scripts/run-v1-regression-report.mjs';
  readonly command: typeof V1_REGRESSION_COMMAND;
  readonly oracleRule: string;
  readonly validation: Readonly<{
    level: 'targeted';
    playtest: 'NOT_RUN';
    frame: 'NOT_RUN';
    memory: 'STRUCTURAL_OWNERSHIP_COUNTERS';
    reason: string;
    playtestRemaining: readonly string[];
  }>;
  readonly versions: Readonly<Record<string, string>>;
  readonly rows: readonly QaRow[];
  readonly summary: Readonly<{
    rows: number;
    pass: number;
    fail: number;
    notRun: number;
    categories: Readonly<Record<string, number>>;
  }>;
  readonly xp: Readonly<{
    before: Readonly<{ balance: number; level: number; entries: number }>;
    after: Readonly<{ balance: number; level: number; entries: number }>;
    fingerprintBefore: string;
    fingerprintAfter: string;
    paths: readonly Readonly<{ id: string; fingerprint: string; unchanged: boolean }>[];
    losses: number;
    debits: 0;
    negativeCredits: false;
  }>;
  readonly budgets: readonly BudgetRow[];
  readonly gaps: readonly Readonly<{ component: string; reason: string }>[];
  readonly dependencies: Readonly<{
    nodes: number;
    edges: number;
    external: readonly string[];
    cycles: readonly (readonly string[])[];
    gateCoversExtensions: boolean;
    inverseDependencies: readonly string[];
    duplicates: readonly string[];
  }>;
  readonly limitations: readonly string[];
}

const REPORT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MANIFEST = JSON.parse(
  readFileSync(join(REPORT_ROOT, 'Docs', 'performance-budgets.json'), 'utf8'),
) as {
  budgetVersion: string;
  proposedBudgets: { desktop: Record<string, number> };
  proposedCapacities: Record<string, number | null>;
};

function budgetRow(input: {
  readonly metric: string;
  readonly actual: number | string | null;
  readonly budget: number | string | null;
  readonly unit: string;
  readonly source: string;
  readonly note: string;
}): BudgetRow {
  const pass =
    typeof input.actual === 'number' &&
    typeof input.budget === 'number' &&
    input.actual <= input.budget;
  return Object.freeze({
    ...input,
    verdict: input.actual === null || input.budget === null ? 'NOT_RUN' : pass ? 'PASS' : 'FAIL',
  });
}

function budgetChecks(budgets: readonly BudgetRow[]): QaCheck[] {
  return budgets.map((entry) =>
    qaCheck(
      `budget ${entry.metric}`,
      entry.verdict,
      entry.verdict === 'NOT_RUN' ? 'NOT_RUN' : 'PASS',
      `${String(entry.actual)} ${entry.unit} against ${String(entry.budget)} (${entry.source})`,
    ),
  );
}

function budgetsOf(probe: CombinedProbe, kpiVisualPoints: number): readonly BudgetRow[] {
  const capacities = MANIFEST.proposedCapacities;
  return Object.freeze([
    budgetRow({
      metric: 'recorder peak charged bytes',
      actual: probe.recorder.peakChargedBytes,
      budget: capacities.recorderRamBytes ?? null,
      unit: 'bytes',
      source: 'performance-budgets.json proposedCapacities.recorderRamBytes',
      note: 'Ownership counter of the 207 ring, pinned chunk and event reserve; not page RAM.',
    }),
    budgetRow({
      metric: 'recorder sealed chunk bytes',
      actual: probe.recorder.chunkBytes,
      budget: capacities.optionalReplayStorageBytes ?? null,
      unit: 'bytes',
      source: 'performance-budgets.json proposedCapacities.optionalReplayStorageBytes',
      note: 'One pinned incident chunk stays far below the optional replay cap.',
    }),
    budgetRow({
      metric: 'autosave checkpoint bytes',
      actual: probe.autosave.checkpointBytes,
      budget: AUTOSAVE_BUDGET.maxCheckpointBytes,
      unit: 'bytes',
      source: '131-autosave-v1 AUTOSAVE_BUDGET.maxCheckpointBytes (PERSISTENCE_LIMITS)',
      note: 'One 206 checkpoint row written by the real 131 cycle.',
    }),
    budgetRow({
      metric: 'autosave progress body bytes',
      actual: probe.autosave.progressBytes,
      budget: AUTOSAVE_BUDGET.maxProgressBodyBytes,
      unit: 'bytes',
      source: '131-autosave-v1 AUTOSAVE_BUDGET.maxProgressBodyBytes (PERSISTENCE_LIMITS)',
      note: 'The 130 progress rows of the same cycle.',
    }),
    budgetRow({
      metric: 'economy bundle bytes',
      actual: probe.economyBytes,
      budget: ECONOMY_SAVE_LIMITS.maxDocumentBytes,
      unit: 'bytes',
      source: '215-economy-save-v1 ECONOMY_SAVE_LIMITS.maxDocumentBytes',
      note: 'Daily, economy and XP bundle; the component caps are the enforceable limits.',
    }),
    budgetRow({
      metric: 'preparing checkpoints',
      actual: probe.autosave.pendingTick === null ? 0 : 1,
      budget: capacities.preparingCheckpoints ?? null,
      unit: 'generations',
      source: 'performance-budgets.json proposedCapacities.preparingCheckpoints',
      note: 'At most one generation prepares at a time.',
    }),
    budgetRow({
      metric: 'committing checkpoints',
      actual: probe.autosave.committingTick === null ? 0 : 1,
      budget: capacities.committingCheckpoints ?? null,
      unit: 'generations',
      source: 'performance-budgets.json proposedCapacities.committingCheckpoints',
      note: 'At most one generation commits at a time.',
    }),
    budgetRow({
      metric: 'KPI visual chart points',
      actual: kpiVisualPoints,
      budget: null,
      unit: 'points',
      source: 'no manifest budget; 210 KPI_HISTORY_LIMITS caps the chart',
      note: 'The cap is a UI component limit, not a performance budget.',
    }),
    budgetRow({
      metric: 'frame p95',
      actual: null,
      budget: MANIFEST.proposedBudgets.desktop.frameP95Ms ?? null,
      unit: 'ms',
      source: 'performance-budgets.json proposedBudgets.desktop.frameP95Ms',
      note: 'No renderer ran in this suite; the frame budget stays owned by 220/224/155.',
    }),
  ]);
}

export async function runV1RegressionReport(): Promise<V1RegressionReport> {
  const modes = await runModesPropagation();
  const economy = await runEconomyDailyXp();
  const persistence = await runPersistenceReplay();
  const combined = await runCombinedProbe();
  const dependencies = runDependencyCheck(REPORT_ROOT);

  const budgets = budgetsOf(combined.probe, economy.facts.kpiVisualPoints);
  const benchmarkChecks = budgetChecks(budgets);
  const benchmarkRows: QaRow[] = [
    qaRow({
      id: 'C2',
      category: 'BENCHMARK',
      contract: 'Docs/25 performance contract + performance-budgets.json',
      scenario: 'Costurile noi ale stack-ului combinat, față de bugetele din manifest',
      polarity: 'COST',
      actual: {
        budgetVersion: MANIFEST.budgetVersion,
        recorderPeakBytes: combined.probe.recorder.peakChargedBytes,
        recorderCapBytes: combined.probe.recorder.ramByteCap,
        chunkBytes: combined.probe.recorder.chunkBytes,
        chunkBytesPerSimulatedSecond: combined.probe.recorder.chunkBytesPerSimulatedSecond,
        checkpointBytes: combined.probe.autosave.checkpointBytes,
        progressBytes: combined.probe.autosave.progressBytes,
        economyBytes: combined.probe.economyBytes,
        economyComponents: combined.probe.economyComponents,
        measuredBudgets: budgets.filter((entry) => entry.verdict !== 'NOT_RUN').length,
      },
      checks: benchmarkChecks,
      note: 'Costurile sunt contoare reale de ownership și bytes; nu se pretinde FPS sau RAM totală.',
    }),
    notRunRow({
      id: 'C3',
      category: 'PLAYTEST',
      contract: 'Docs/validation-policy.md',
      scenario: 'Playtest în browser: explicații, senzație de condus, HUD',
      polarity: 'POSITIVE',
      reason:
        'Nu s-a rulat un browser real sau input uman. Nivelul atins este `targeted`, cu scenarii deterministe în Node; playtestul rămâne pentru gate-ul 235.',
    }),
    notRunRow({
      id: 'C4',
      category: 'BENCHMARK',
      contract: 'performance-budgets.json proposedBudgets.frameP95Ms',
      scenario: 'Frame p95/p99 pe hardware real',
      polarity: 'COST',
      reason:
        'Suita nu are renderer, GPU sau browser; bugetul de cadru rămâne al gate-urilor 220/224/155. Nu se raportează FPS headless.',
    }),
  ];

  const rows: QaRow[] = [
    ...modes.rows,
    ...economy.rows,
    ...persistence.rows,
    ...combined.rows,
    ...benchmarkRows,
    ...dependencies.rows,
  ];
  const pass = rows.filter((entry) => entry.verdict === 'PASS').length;
  const fail = rows.filter((entry) => entry.verdict === 'FAIL').length;
  const notRun = rows.filter((entry) => entry.verdict === 'NOT_RUN').length;
  const categories: Record<string, number> = {};
  for (const row of rows) categories[row.category] = (categories[row.category] ?? 0) + 1;

  return Object.freeze({
    version: V1_REGRESSION_VERSION,
    generatedBy: 'scripts/run-v1-regression-report.mjs' as const,
    command: V1_REGRESSION_COMMAND,
    oracleRule:
      'Fiecare valoare așteptată este contractul documentat (Docs/18, 22, 23, 25 și dovezile 205–215, 217), nu o copie a valorii observate. Zero ceas de perete, zero aleator.',
    validation: Object.freeze({
      level: 'targeted' as const,
      playtest: 'NOT_RUN' as const,
      frame: 'NOT_RUN' as const,
      memory: 'STRUCTURAL_OWNERSHIP_COUNTERS' as const,
      reason:
        'Politica de validare 2026-10-08: scenarii deterministe, cost structural și integrare limitată. Suita nu are browser, GPU sau hardware de referință.',
      playtestRemaining: Object.freeze([
        'Lizibilitatea explicațiilor și a HUD-ului la 1280×720 și 1920×1080',
        'Senzația de condus MANUAL/LEARNING și revenirea după panouri',
        'Input real, focus/blur și pauza în browser',
        'Frame p95/p99 pe hardware-ul de referință (gate 220/224)',
      ]),
    }),
    versions: Object.freeze({
      threeModes: THREE_MODES_VERSION,
      cityStyle: CITY_STYLE_VERSION,
      learningEpoch: LEARNING_EPOCH_VERSION,
      worldSnapshot: WORLD_SNAPSHOT_VERSION,
      worldRecorder: WORLD_RECORDER_VERSION,
      worldReplayChunk: WORLD_REPLAY_CHUNK_VERSION,
      kpi: ECONOMY_CLOCK_VERSION,
      kpiHistory: KPI_HISTORY_LIMITS.version,
      kpiImpact: KPI_IMPACT_VERSION,
      dailyGenerator: DAILY_GENERATOR_VERSION,
      dailyProgress: DAILY_PROGRESS_VERSION,
      budgetVersion: MANIFEST.budgetVersion,
    }),
    rows: Object.freeze(rows),
    summary: Object.freeze({
      rows: rows.length,
      pass,
      fail,
      notRun,
      categories: Object.freeze(
        Object.fromEntries(
          Object.keys(categories)
            .sort()
            .map((key) => [key, categories[key]!]),
        ),
      ),
    }),
    xp: economy.xp,
    budgets,
    gaps: Object.freeze([
      Object.freeze({
        component: 'frame / render',
        reason:
          'Manifestul are buget frame p95, dar suita nu are renderer; nu se inventează o măsurătoare headless.',
      }),
      Object.freeze({
        component: 'KPI chart points',
        reason:
          'Manifestul nu are buget pentru punctele graficului; limita aplicabilă este KPI_HISTORY_LIMITS (60 implicit, 90 maximum), raportată ca limită de componentă.',
      }),
      Object.freeze({
        component: 'economy bundle',
        reason:
          'Manifestul nu are buget dedicat bundle-ului 215; limita aplicabilă este ECONOMY_SAVE_LIMITS.maxDocumentBytes (un rând de 1 MiB).',
      }),
      Object.freeze({
        component: 'local Node tick cost',
        reason:
          'Costul per tick al stack-ului este măsurabil doar cu ceas de perete; rulează separat cu `--cost` și nu este o probă de cadru.',
      }),
    ]),
    dependencies: dependencies.graph,
    limitations: Object.freeze([
      'Nivel `targeted`: fără browser, GPU, input uman sau hardware de referință; playtestul și frame-ul rămân NOT_RUN.',
      'Condusul din proba combinată este comportamentul simulat 115 (oportunități declarate), nu fizica Babylon/Rapier live.',
      'Costurile de memorie sunt contoare de ownership (recorder, checkpoint, bundle), nu RAM totală a paginii.',
      'Review-urile din proba combinată folosesc durata reală a cursei din fixture și un read model 139 real pentru cursele finalizate; formula completă de confort rămâne a dovezilor 209/214.',
      'Costul per tick al stack-ului este măsurat separat, cu ceas de perete, de `npm run qa:v1-regression -- --cost`; nu este o probă de cadru sau de FPS.',
      'Nu s-a modificat `src/`; orice defect găsit ar fi raportat aici, nu reparat.',
    ]),
  });
}
