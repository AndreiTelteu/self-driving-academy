import type {
  ExperimentCompareCoexistence,
  ExperimentCompareCohortRead,
  ExperimentCompareDistribution,
  ExperimentCompareExposureSummary,
  ExperimentCompareIsolatedRead,
  ExperimentCompareMetricDelta,
  ExperimentCompareReady,
  ExperimentCompareSeeds,
  ExperimentCompareUncertainty,
  ExperimentRerunDivergenceCause,
  ExperimentRerunOpportunityKind,
} from '../experiments';

/**
 * 143 A/B comparison projection.
 *
 * The panel is a pure presentation layer over the finished `143-experiment-compare-v1` read model: it
 * receives the comparison and turns it into text, accessible tables and deterministic bars. It never
 * imports the experiments module at runtime, never re-reads a rerun and never re-classifies a
 * divergence. The distribution is shown per cause, per parameter and per opportunity category, so
 * one parameter can never be presented as the explanation of everything; the exposure is printed as
 * counts with the real tick window; the seed count and the uncertainty statement are shown verbatim;
 * an unavailable delta keeps its closed reason instead of becoming a zero.
 */
export const EXPERIMENT_COMPARE_UI_VERSION = '143-experiment-compare-panel-v1' as const;

export const EXPERIMENT_COMPARE_CHART_KEYS = [
  'CAUSE_DISTRIBUTION',
  'PARAMETER_DISTRIBUTION',
  'CATEGORY_DISTRIBUTION',
  'EXPOSURE',
] as const;
export type ExperimentCompareChartKey = (typeof EXPERIMENT_COMPARE_CHART_KEYS)[number];

export const EXPERIMENT_COMPARE_TEXT = Object.freeze({
  title: 'Comparație A/B',
  trigger: 'Comparație A/B',
  triggerDescription:
    'Deschide comparația A/B cu distribuția cauzelor, expunerea, numărul de seed-uri și incertitudinea declarată.',
  close: 'Închide',
  closeDescription: 'Închide comparația A/B și reia simularea suspendată.',
  bodyLabel: 'Conținutul comparației A/B',
  description:
    'Comparația citește rezultatele rerulării 142: diferențele sunt cele raportate acolo, ' +
    'distribuite pe cauze, parametri și categorii, fără să fie atribuite unui singur parametru. ' +
    'Expunerea arată câte oportunități au fost evaluate, câte au fost vizibile sau invizibile și pe ' +
    'ce fereastră de tickuri, numărul de seed-uri este numărat, iar incertitudinea este declarată ' +
    'explicit, nu ascunsă într-o medie.',
  empty: 'Nu există încă o comparație A/B; panoul rămâne gol până la primul rezultat de rerulare.',
  summary: 'Rezumat',
  causes: 'Distribuția cauzelor',
  parameters: 'Distribuția pe parametri',
  categories: 'Distribuția pe categorii',
  exposure: 'Expunere',
  seeds: 'Seed-uri și eșantion',
  uncertainty: 'Incertitudine',
  divergent: 'Diferențe',
  coexistence: 'Cauze care coexistă',
  coexistenceNote:
    'Aceeași oportunitate poate fi explicată de cauze diferite în cohorte controlate diferite; ' +
    'niciun parametru nu este prezentat ca explicația tuturor diferențelor.',
  isolated: 'Scenarii izolate',
  isolatedNote:
    'Un scenariu izolat schimbă exact un parametru; coloana „doar ținta” arată dacă vreo altă ' +
    'valoare a fost raportată de rerulare.',
  metrics: 'Indicatori 138/139',
  metricsNote:
    'Diferențele sunt calculate din valorile deja agregate ale read model-elor; o valoare ' +
    'indisponibilă rămâne indisponibilă, niciodată zero.',
  noDivergences: 'Nicio diferență',
  noCoexistence: 'Nicio oportunitate cu două cauze',
  noMetrics: 'Niciun indicator atașat',
  targetOnly: 'doar ținta',
  foreignParameter: 'alt parametru raportat',
  unavailable: 'Indisponibil',
  counts: 'Numărători',
  causeLabels: Object.freeze({
    PROBABILITY_THRESHOLD: 'Prag de probabilitate',
    GEOMETRY_PARAMETER: 'Parametru de geometrie',
    SEED_DIVERGENCE: 'Divergență de seed',
    UNCLASSIFIED: 'Neatribuită',
  }) as Readonly<Record<ExperimentRerunDivergenceCause, string>>,
  kindLabels: Object.freeze({
    SIGNAL: 'Semafoare',
    STOP: 'STOP',
  }) as Readonly<Record<ExperimentRerunOpportunityKind, string>>,
  parameterLabels: Object.freeze({
    red_stop_probability: 'Probabilitate de oprire la roșu',
    green_start_delay: 'Întârziere la verde',
    red_stop_line_offset: 'Distanță de oprire înaintea liniei',
    late_red_brake_threshold: 'Orizont de frânare la roșu',
    stop_full_probability: 'Probabilitate de oprire completă',
    stop_dwell_time: 'Durată a opririi complete',
    stop_line_offset: 'Distanță înaintea liniei STOP',
  }) as Readonly<Record<string, string>>,
  sourceLabels: Object.freeze({
    BEHAVIOR_138: 'Comportament 138',
    COMFORT_139: 'Confort 139',
  }) as Readonly<Record<string, string>>,
  uncertaintyLabels: Object.freeze({
    MULTI_SEED_SAMPLE: 'Eșantion cu mai multe seed-uri',
    SINGLE_SEED_SAMPLE: 'Eșantion cu un singur seed',
  }) as Readonly<Record<string, string>>,
  reasonLabels: Object.freeze({
    LEFT_UNAVAILABLE: 'valoarea din stânga este indisponibilă',
    RIGHT_UNAVAILABLE: 'valoarea din dreapta este indisponibilă',
  }) as Readonly<Record<string, string>>,
});

export interface ExperimentCompareBar {
  readonly series: 'COUNT' | 'VISIBLE' | 'INVISIBLE';
  readonly value: number;
  /** Bar height already clamped to 0–100, derived from the real counts. */
  readonly percent: number;
  readonly display: string;
  readonly state: 'VALUE' | 'ZERO';
  readonly title: string;
}

export interface ExperimentCompareChartGroup {
  readonly key: string;
  readonly label: string;
  readonly note: string;
  readonly bars: readonly ExperimentCompareBar[];
}

export interface ExperimentCompareChart {
  readonly key: ExperimentCompareChartKey;
  readonly title: string;
  readonly unitLabel: string;
  readonly caption: string;
  readonly state: 'AVAILABLE' | 'EMPTY';
  readonly groups: readonly ExperimentCompareChartGroup[];
  readonly summary: string;
}

export interface ExperimentCompareTable {
  readonly key: string;
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly rowKeys: readonly string[];
  readonly rowStates: readonly string[];
}

export interface ExperimentCompareIsolatedView {
  readonly cohortId: string;
  readonly targetLabel: string;
  readonly changeLabel: string;
  readonly divergences: number;
  readonly namedLabel: string;
  readonly verdict: string;
  readonly verdictState: 'ISOLATED' | 'LEAKED';
}

export interface ExperimentCompareCoexistenceView {
  readonly opportunityKey: string;
  readonly kindLabel: string;
  readonly causesLabel: string;
  readonly parametersLabel: string;
  readonly distinctCauses: number;
  readonly coexists: boolean;
}

export interface ExperimentCompareMetricView {
  readonly key: string;
  readonly sourceLabel: string;
  readonly idLabel: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly deltaLabel: string;
  readonly state: 'DELTA' | 'UNAVAILABLE';
  readonly reasonLabel: string;
}

export interface ExperimentCompareUncertaintyView {
  readonly statusLabel: string;
  readonly statement: string;
  readonly limitations: readonly string[];
  readonly spreadLabel: string;
  readonly seedLabel: string;
}

export interface ExperimentCompareSummaryView {
  readonly headline: string;
  readonly detail: string;
  readonly windowLabel: string;
  readonly seedLabel: string;
  readonly exposureLabel: string;
  readonly attributionLabel: string;
}

export interface ExperimentCompareView {
  readonly version: typeof EXPERIMENT_COMPARE_UI_VERSION;
  readonly signature: string;
  readonly empty: boolean;
  readonly suiteId: string;
  readonly summary: ExperimentCompareSummaryView;
  readonly counts: Readonly<{
    cohorts: number;
    evaluations: number;
    decisions: number;
    divergent: number;
    identical: number;
    visible: number;
    invisible: number;
    seeds: number;
    coexisting: number;
  }>;
  readonly distribution: ExperimentCompareDistribution;
  readonly exposure: ExperimentCompareExposureSummary;
  readonly seeds: ExperimentCompareSeeds;
  readonly uncertainty: ExperimentCompareUncertaintyView;
  readonly charts: readonly ExperimentCompareChart[];
  readonly tables: readonly ExperimentCompareTable[];
  readonly isolated: readonly ExperimentCompareIsolatedView[];
  readonly coexistence: readonly ExperimentCompareCoexistenceView[];
  readonly metrics: readonly ExperimentCompareMetricView[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Deterministic Romanian formatting: a comma decimal separator, no locale dependency. */
export function formatExperimentCompareNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return EXPERIMENT_COMPARE_TEXT.unavailable;
  const rounded = String(round3(value));
  return rounded.includes('.') ? rounded.replace('.', ',') : rounded;
}

export function formatExperimentCompareShare(value: number | null): string {
  if (value === null) return '—';
  return `${(Math.round(value * 1000) / 10).toString().replace('.', ',')}%`;
}

function barPercent(value: number, maximum: number): number {
  if (maximum <= 0 || value <= 0) return 0;
  return Math.min(100, Math.round((value / maximum) * 1000) / 10);
}

function bar(
  series: ExperimentCompareBar['series'],
  value: number,
  maximum: number,
): ExperimentCompareBar {
  return Object.freeze({
    series,
    value,
    percent: barPercent(value, maximum),
    display: String(value),
    state: value > 0 ? ('VALUE' as const) : ('ZERO' as const),
    title: `${series}: ${value}`,
  });
}

function causeChart(distribution: ExperimentCompareDistribution): ExperimentCompareChart {
  const order: readonly ExperimentRerunDivergenceCause[] = Object.freeze([
    'PROBABILITY_THRESHOLD',
    'GEOMETRY_PARAMETER',
    'SEED_DIVERGENCE',
    'UNCLASSIFIED',
  ]);
  const entries = order.map(
    (cause) => [cause, distribution.causes[cause] ?? 0] as [ExperimentRerunDivergenceCause, number],
  );
  const maximum = entries.reduce((top, [, count]) => Math.max(top, count), 0);
  return Object.freeze({
    key: 'CAUSE_DISTRIBUTION',
    title: EXPERIMENT_COMPARE_TEXT.causes,
    unitLabel: 'diferențe',
    caption: `${distribution.divergent} diferențe, ${distribution.distinctCauses} cauze distincte, ${distribution.distinctParameters} parametri distincte.`,
    state: distribution.divergent > 0 ? ('AVAILABLE' as const) : ('EMPTY' as const),
    groups: Object.freeze(
      entries.map(([cause, count]) =>
        Object.freeze({
          key: cause,
          label: EXPERIMENT_COMPARE_TEXT.causeLabels[cause],
          note: cause,
          bars: Object.freeze([bar('COUNT', count, maximum)]),
        }),
      ),
    ),
    summary: `Cauze: ${entries
      .map(([cause, count]) => `${EXPERIMENT_COMPARE_TEXT.causeLabels[cause]} ${count}`)
      .join(', ')}.`,
  });
}

function parameterChart(distribution: ExperimentCompareDistribution): ExperimentCompareChart {
  const maximum = distribution.parameters.reduce((top, row) => Math.max(top, row.count), 0);
  return Object.freeze({
    key: 'PARAMETER_DISTRIBUTION',
    title: EXPERIMENT_COMPARE_TEXT.parameters,
    unitLabel: 'diferențe',
    caption: distribution.parameters
      .map(
        (row) =>
          `${EXPERIMENT_COMPARE_TEXT.parameterLabels[row.key] ?? row.key}: ${row.count} (${formatExperimentCompareShare(row.share)})`,
      )
      .join(' · '),
    state: distribution.distinctParameters > 0 ? ('AVAILABLE' as const) : ('EMPTY' as const),
    groups: Object.freeze(
      distribution.parameters.map((row) =>
        Object.freeze({
          key: row.key,
          label: EXPERIMENT_COMPARE_TEXT.parameterLabels[row.key] ?? row.key,
          note: row.key,
          bars: Object.freeze([bar('COUNT', row.count, maximum)]),
        }),
      ),
    ),
    summary: `Parametri raportați: ${distribution.distinctParameters} din ${distribution.divergent} diferențe.`,
  });
}

function categoryChart(distribution: ExperimentCompareDistribution): ExperimentCompareChart {
  const maximum = distribution.categories.reduce((top, row) => Math.max(top, row.divergent), 0);
  return Object.freeze({
    key: 'CATEGORY_DISTRIBUTION',
    title: EXPERIMENT_COMPARE_TEXT.categories,
    unitLabel: 'diferențe',
    caption: distribution.categories
      .map(
        (row) =>
          `${EXPERIMENT_COMPARE_TEXT.kindLabels[row.kind]}: ${row.divergent}/${row.evaluations}`,
      )
      .join(' · '),
    state: distribution.divergent > 0 ? ('AVAILABLE' as const) : ('EMPTY' as const),
    groups: Object.freeze(
      distribution.categories.map((row) =>
        Object.freeze({
          key: row.kind,
          label: EXPERIMENT_COMPARE_TEXT.kindLabels[row.kind],
          note: `${row.opportunities} oportunități, ${row.evaluations} evaluări`,
          bars: Object.freeze([bar('COUNT', row.divergent, maximum)]),
        }),
      ),
    ),
    summary: `Diferențe pe categorii: ${distribution.categories
      .map((row) => `${row.kind} ${row.divergent}`)
      .join(', ')}.`,
  });
}

function exposureChart(exposure: ExperimentCompareExposureSummary): ExperimentCompareChart {
  const maximum = Math.max(exposure.visible, exposure.invisible);
  return Object.freeze({
    key: 'EXPOSURE',
    title: EXPERIMENT_COMPARE_TEXT.exposure,
    unitLabel: 'evaluări',
    caption: `${exposure.evaluations} evaluări: ${exposure.visible} vizibile, ${exposure.invisible} invizibile.`,
    state: exposure.evaluations > 0 ? ('AVAILABLE' as const) : ('EMPTY' as const),
    groups: Object.freeze([
      Object.freeze({
        key: 'EXPOSURE',
        label: 'Vizibilitate',
        note: exposure.declared ? 'fapt declarat de camera reală sau de fixture' : '',
        bars: Object.freeze([
          bar('VISIBLE', exposure.visible, maximum),
          bar('INVISIBLE', exposure.invisible, maximum),
        ]),
      }),
    ]),
    summary: `Expunere: ${exposure.visible} vizibile, ${exposure.invisible} invizibile, ${exposure.evaluations} evaluări.`,
  });
}

function causeTable(distribution: ExperimentCompareDistribution): ExperimentCompareTable {
  const causes = Object.keys(distribution.causes) as ExperimentRerunDivergenceCause[];
  return Object.freeze({
    key: 'causes',
    caption: EXPERIMENT_COMPARE_TEXT.causes,
    headers: Object.freeze(['Cauză', 'Diferențe', 'Pondere']),
    rows: Object.freeze(
      causes.map((cause) =>
        Object.freeze([
          EXPERIMENT_COMPARE_TEXT.causeLabels[cause],
          String(distribution.causes[cause]),
          formatExperimentCompareShare(
            distribution.divergent === 0
              ? null
              : distribution.causes[cause] / distribution.divergent,
          ),
        ]),
      ),
    ),
    rowKeys: Object.freeze(causes.map((cause) => cause)),
    rowStates: Object.freeze(
      causes.map((cause) => (distribution.causes[cause] > 0 ? 'VALUE' : 'ZERO')),
    ),
  });
}

function parameterTable(distribution: ExperimentCompareDistribution): ExperimentCompareTable {
  return Object.freeze({
    key: 'parameters',
    caption: EXPERIMENT_COMPARE_TEXT.parameters,
    headers: Object.freeze(['Parametru', 'Diferențe', 'Pondere']),
    rows: Object.freeze(
      distribution.parameters.map((row) =>
        Object.freeze([
          EXPERIMENT_COMPARE_TEXT.parameterLabels[row.key] ?? row.key,
          String(row.count),
          formatExperimentCompareShare(row.share),
        ]),
      ),
    ),
    rowKeys: Object.freeze(distribution.parameters.map((row) => row.key)),
    rowStates: Object.freeze(distribution.parameters.map(() => 'VALUE')),
  });
}

function categoryTable(distribution: ExperimentCompareDistribution): ExperimentCompareTable {
  return Object.freeze({
    key: 'categories',
    caption: EXPERIMENT_COMPARE_TEXT.categories,
    headers: Object.freeze(['Categorie', 'Oportunități', 'Evaluări', 'Diferențe']),
    rows: Object.freeze(
      distribution.categories.map((row) =>
        Object.freeze([
          EXPERIMENT_COMPARE_TEXT.kindLabels[row.kind],
          String(row.opportunities),
          String(row.evaluations),
          String(row.divergent),
        ]),
      ),
    ),
    rowKeys: Object.freeze(distribution.categories.map((row) => row.kind)),
    rowStates: Object.freeze(distribution.categories.map(() => 'VALUE')),
  });
}

function exposureTable(cohorts: readonly ExperimentCompareCohortRead[]): ExperimentCompareTable {
  return Object.freeze({
    key: 'exposure',
    caption: EXPERIMENT_COMPARE_TEXT.exposure,
    headers: Object.freeze(['Cohortă', 'Fereastră', 'Sursă', 'Evaluări', 'Vizibile', 'Invizibile']),
    rows: Object.freeze(
      cohorts.map((cohort) =>
        Object.freeze([
          cohort.cohortId,
          `${cohort.exposure.tickWindow.fromTick}–${cohort.exposure.tickWindow.toTick} (${cohort.exposure.tickWindow.ticks} tickuri)`,
          cohort.exposure.source,
          String(cohort.exposure.evaluations),
          String(cohort.exposure.visible),
          String(cohort.exposure.invisible),
        ]),
      ),
    ),
    rowKeys: Object.freeze(cohorts.map((cohort) => cohort.cohortId)),
    rowStates: Object.freeze(
      cohorts.map((cohort) => (cohort.exposure.invisible === 0 ? 'ALL_VISIBLE' : 'SPLIT')),
    ),
  });
}

function seedTable(seeds: ExperimentCompareSeeds): ExperimentCompareTable {
  return Object.freeze({
    key: 'seeds',
    caption: EXPERIMENT_COMPARE_TEXT.seeds,
    headers: Object.freeze([
      'Seed de bază',
      'Hex',
      'Seed de scenariu',
      'Cohorte',
      'Decizii',
      'Diferențe',
    ]),
    rows: Object.freeze(
      seeds.perSeed.map((row) =>
        Object.freeze([
          String(row.baseSeed),
          row.baseSeedHex,
          String(row.scenarioSeedHex),
          String(row.cohorts),
          String(row.decisions),
          String(row.divergent),
        ]),
      ),
    ),
    rowKeys: Object.freeze(seeds.perSeed.map((row) => String(row.baseSeed))),
    rowStates: Object.freeze(seeds.perSeed.map(() => 'SEED')),
  });
}

function isolatedTable(isolated: readonly ExperimentCompareIsolatedView[]): ExperimentCompareTable {
  return Object.freeze({
    key: 'isolated',
    caption: EXPERIMENT_COMPARE_TEXT.isolated,
    headers: Object.freeze(['Cohortă', 'Parametru', 'Valori', 'Diferențe', 'Verificare']),
    rows: Object.freeze(
      isolated.map((row) =>
        Object.freeze([
          row.cohortId,
          row.targetLabel,
          row.changeLabel,
          String(row.divergences),
          row.verdict,
        ]),
      ),
    ),
    rowKeys: Object.freeze(isolated.map((row) => row.cohortId)),
    rowStates: Object.freeze(isolated.map((row) => row.verdictState)),
  });
}

function coexistenceTable(
  coexistence: readonly ExperimentCompareCoexistenceView[],
): ExperimentCompareTable {
  return Object.freeze({
    key: 'coexistence',
    caption: EXPERIMENT_COMPARE_TEXT.coexistence,
    headers: Object.freeze(['Oportunitate', 'Tip', 'Cauze', 'Parametri']),
    rows: Object.freeze(
      coexistence.map((row) =>
        Object.freeze([row.opportunityKey, row.kindLabel, row.causesLabel, row.parametersLabel]),
      ),
    ),
    rowKeys: Object.freeze(coexistence.map((row) => row.opportunityKey)),
    rowStates: Object.freeze(coexistence.map((row) => (row.coexists ? 'COEXISTS' : 'SINGLE'))),
  });
}

function metricTable(metrics: readonly ExperimentCompareMetricView[]): ExperimentCompareTable {
  return Object.freeze({
    key: 'metrics',
    caption: EXPERIMENT_COMPARE_TEXT.metrics,
    headers: Object.freeze(['Indicator', 'Sursă', 'Stânga', 'Dreapta', 'Diferență', 'Stare']),
    rows: Object.freeze(
      metrics.map((row) =>
        Object.freeze([
          row.idLabel,
          row.sourceLabel,
          row.leftLabel,
          row.rightLabel,
          row.deltaLabel,
          row.state === 'DELTA' ? row.state : row.reasonLabel,
        ]),
      ),
    ),
    rowKeys: Object.freeze(metrics.map((row) => row.key)),
    rowStates: Object.freeze(metrics.map((row) => row.state)),
  });
}

function divergenceTable(cohorts: readonly ExperimentCompareCohortRead[]): ExperimentCompareTable {
  const rows: string[][] = [];
  const keys: string[] = [];
  for (const cohort of cohorts) {
    for (const row of cohort.divergences) {
      rows.push([
        cohort.cohortId,
        row.opportunityKey,
        EXPERIMENT_COMPARE_TEXT.kindLabels[row.kind],
        String(row.decisionTick),
        `${row.leftAction}/${row.leftReason}`,
        `${row.rightAction}/${row.rightReason}`,
        EXPERIMENT_COMPARE_TEXT.causeLabels[row.cause],
        row.parameter === null
          ? EXPERIMENT_COMPARE_TEXT.unavailable
          : (EXPERIMENT_COMPARE_TEXT.parameterLabels[row.parameter] ?? row.parameter),
      ]);
      keys.push(`${cohort.cohortId}:${row.opportunityKey}`);
    }
  }
  return Object.freeze({
    key: 'divergences',
    caption: 'Diferențele raportate de 142',
    headers: Object.freeze([
      'Cohortă',
      'Oportunitate',
      'Tip',
      'Tick',
      'Stânga',
      'Dreapta',
      'Cauză',
      'Parametru',
    ]),
    rows: Object.freeze(rows.map((row) => Object.freeze(row))),
    rowKeys: Object.freeze(keys),
    rowStates: Object.freeze(keys.map(() => 'DIVERGENT')),
  });
}

function isolatedViews(
  isolated: readonly ExperimentCompareIsolatedRead[],
): readonly ExperimentCompareIsolatedView[] {
  return Object.freeze(
    isolated.map((entry) =>
      Object.freeze({
        cohortId: entry.cohortId,
        targetLabel: `${EXPERIMENT_COMPARE_TEXT.parameterLabels[entry.targetParameter] ?? entry.targetParameter} (${entry.unit})`,
        changeLabel: `${formatExperimentCompareNumber(entry.left)} → ${formatExperimentCompareNumber(entry.right)}`,
        divergences: entry.divergences,
        namedLabel:
          entry.foreignParameters.length === 0
            ? `${EXPERIMENT_COMPARE_TEXT.targetOnly}: ${entry.namedParameters.join(', ') || '—'}`
            : `${EXPERIMENT_COMPARE_TEXT.foreignParameter}: ${entry.foreignParameters.join(', ')}`,
        verdict:
          entry.onlyTargetChanged && entry.attributable && entry.foreignParameters.length === 0
            ? `doar ${entry.targetParameter} se schimbă`
            : `alt parametru raportat: ${entry.foreignParameters.join(', ') || '—'}`,
        verdictState:
          entry.onlyTargetChanged && entry.attributable && entry.foreignParameters.length === 0
            ? ('ISOLATED' as const)
            : ('LEAKED' as const),
      }),
    ),
  );
}

function coexistenceViews(
  coexistence: ExperimentCompareCoexistence,
): readonly ExperimentCompareCoexistenceView[] {
  return Object.freeze(
    coexistence.opportunities
      .filter((row) => row.coexists)
      .map((row) =>
        Object.freeze({
          opportunityKey: row.opportunityKey,
          kindLabel: EXPERIMENT_COMPARE_TEXT.kindLabels[row.kind],
          causesLabel: [...new Set(row.causes.map((entry) => entry.cause))]
            .map((cause) => EXPERIMENT_COMPARE_TEXT.causeLabels[cause])
            .join(' + '),
          parametersLabel: [...new Set(row.causes.map((entry) => entry.parameter))]
            .filter((parameter): parameter is string => parameter !== null)
            .map((parameter) => EXPERIMENT_COMPARE_TEXT.parameterLabels[parameter] ?? parameter)
            .join(' + '),
          distinctCauses: row.distinctCauses,
          coexists: row.coexists,
        }),
      ),
  );
}

function metricViews(
  metrics: readonly ExperimentCompareMetricDelta[],
): readonly ExperimentCompareMetricView[] {
  return Object.freeze(
    metrics.map((row) =>
      Object.freeze({
        key: `${row.cohortId}:${row.source}:${row.id}`,
        sourceLabel: EXPERIMENT_COMPARE_TEXT.sourceLabels[row.source] ?? row.source,
        idLabel: `${row.id} (${row.unit})`,
        leftLabel: formatExperimentCompareNumber(row.left),
        rightLabel: formatExperimentCompareNumber(row.right),
        deltaLabel:
          row.delta === null
            ? EXPERIMENT_COMPARE_TEXT.unavailable
            : `${row.delta > 0 ? '+' : ''}${formatExperimentCompareNumber(row.delta)}`,
        state: row.state,
        reasonLabel:
          row.reason === null
            ? EXPERIMENT_COMPARE_TEXT.unavailable
            : (EXPERIMENT_COMPARE_TEXT.reasonLabels[row.reason] ?? row.reason),
      }),
    ),
  );
}

function uncertaintyView(
  uncertainty: ExperimentCompareUncertainty,
): ExperimentCompareUncertaintyView {
  return Object.freeze({
    statusLabel:
      EXPERIMENT_COMPARE_TEXT.uncertaintyLabels[uncertainty.status] ?? uncertainty.status,
    statement: uncertainty.statement,
    limitations: uncertainty.limitations,
    spreadLabel: `Diferențe pe seed: minim ${uncertainty.divergentMin}, maxim ${uncertainty.divergentMax}, spread ${uncertainty.divergentSpread}.`,
    seedLabel: `${uncertainty.seeds} seed-uri distincte, ${uncertainty.cohorts} cohorte, ${uncertainty.decisions} decizii.`,
  });
}

/** The empty view a closed or not-yet-produced comparison renders without inventing numbers. */
export function emptyExperimentCompareView(): ExperimentCompareView {
  return Object.freeze({
    version: EXPERIMENT_COMPARE_UI_VERSION,
    signature: 'empty',
    empty: true,
    suiteId: '',
    summary: Object.freeze({
      headline: EXPERIMENT_COMPARE_TEXT.empty,
      detail: EXPERIMENT_COMPARE_TEXT.empty,
      windowLabel: '—',
      seedLabel: '—',
      exposureLabel: '—',
      attributionLabel: '—',
    }),
    counts: Object.freeze({
      cohorts: 0,
      evaluations: 0,
      decisions: 0,
      divergent: 0,
      identical: 0,
      visible: 0,
      invisible: 0,
      seeds: 0,
      coexisting: 0,
    }),
    distribution: Object.freeze({
      cohorts: 0,
      evaluations: 0,
      decisions: 0,
      identical: 0,
      divergent: 0,
      causes: Object.freeze({
        PROBABILITY_THRESHOLD: 0,
        GEOMETRY_PARAMETER: 0,
        SEED_DIVERGENCE: 0,
        UNCLASSIFIED: 0,
      }),
      parameters: Object.freeze([]),
      categories: Object.freeze([]),
      unattributed: 0,
      seedDivergences: 0,
      withoutParameter: 0,
      attributed: 0,
      distinctCauses: 0,
      distinctParameters: 0,
      dominantParameter: null,
      caseKinds: Object.freeze({
        IDENTICAL_PROFILE: Object.freeze({
          cohorts: 0,
          divergent: 0,
          distinctParameters: 0,
          allOnOneParameter: false,
        }),
        ISOLATED_PARAMETER: Object.freeze({
          cohorts: 0,
          divergent: 0,
          distinctParameters: 0,
          allOnOneParameter: false,
        }),
        COMPLEX_STYLE: Object.freeze({
          cohorts: 0,
          divergent: 0,
          distinctParameters: 0,
          allOnOneParameter: false,
        }),
      }),
      singleParameterOnlyCases: Object.freeze([]),
      criterionSatisfied: true,
    }),
    exposure: Object.freeze({
      evaluations: 0,
      visible: 0,
      invisible: 0,
      visibleFraction: null,
      evaluatedOpportunities: 0,
      windows: Object.freeze([]),
      sources: Object.freeze([]),
      declared: true as const,
    }),
    seeds: Object.freeze({
      baseSeeds: Object.freeze([]),
      scenarioSeeds: Object.freeze([]),
      distinctBaseSeeds: 0,
      distinctScenarioSeeds: 0,
      distinctOpportunitySeeds: 0,
      perSeed: Object.freeze([]),
    }),
    uncertainty: Object.freeze({
      statusLabel: EXPERIMENT_COMPARE_TEXT.empty,
      statement: EXPERIMENT_COMPARE_TEXT.empty,
      limitations: Object.freeze([]),
      spreadLabel: '—',
      seedLabel: '—',
    }),
    charts: Object.freeze([]),
    tables: Object.freeze([]),
    isolated: Object.freeze([]),
    coexistence: Object.freeze([]),
    metrics: Object.freeze([]),
  });
}

/**
 * Projects the finished comparison into the panel view. No runtime import of the experiments module
 * is used: the read model arrives as data and is only formatted.
 */
export function projectExperimentCompare(read: ExperimentCompareReady): ExperimentCompareView {
  const distribution = read.distribution;
  const exposure = read.exposure;
  const dominant = distribution.dominantParameter;
  const window = exposure.windows[0];
  const windowLabel =
    window === undefined
      ? 'fără fereastră'
      : `tick ${window.fromTick}–${window.toTick} (${window.ticks} tickuri), ${window.cohorts.length} cohorte`;
  return Object.freeze({
    version: EXPERIMENT_COMPARE_UI_VERSION,
    signature: read.signature,
    empty: false,
    suiteId: read.suiteId,
    summary: Object.freeze({
      headline: `${distribution.divergent} diferențe la ${distribution.decisions} decizii comparate, ${distribution.distinctCauses} cauze și ${distribution.distinctParameters} parametri.`,
      detail:
        dominant === null
          ? `${distribution.identical} decizii identice; nicio diferență de atribuit.`
          : `${distribution.distinctParameters} parametri: cel mai frecvent este ${EXPERIMENT_COMPARE_TEXT.parameterLabels[dominant.key] ?? dominant.key} (${dominant.count} din ${distribution.divergent}, ${formatExperimentCompareShare(dominant.share)}); restul diferențelor sunt distribuite pe ${Math.max(0, distribution.distinctParameters - 1)} alți parametri, ${distribution.unattributed} neatribuite și ${distribution.seedDivergences} din seed.`,
      windowLabel,
      seedLabel: `${read.seeds.distinctBaseSeeds} seed-uri de bază, ${read.seeds.distinctScenarioSeeds} seed-uri de scenariu, ${read.seeds.distinctOpportunitySeeds} seed-uri de oportunitate.`,
      exposureLabel: `${exposure.evaluations} evaluări: ${exposure.visible} vizibile, ${exposure.invisible} invizibile.`,
      attributionLabel: `Distribuție: ${distribution.categories
        .map(
          (row) =>
            `${EXPERIMENT_COMPARE_TEXT.kindLabels[row.kind]} ${row.divergent}/${row.evaluations}`,
        )
        .join(', ')}.`,
    }),
    counts: Object.freeze({
      cohorts: distribution.cohorts,
      evaluations: exposure.evaluations,
      decisions: distribution.decisions,
      divergent: distribution.divergent,
      identical: distribution.identical,
      visible: exposure.visible,
      invisible: exposure.invisible,
      seeds: read.seeds.distinctBaseSeeds,
      coexisting: read.coexistence.coexisting,
    }),
    distribution,
    exposure,
    seeds: read.seeds,
    uncertainty: uncertaintyView(read.uncertainty),
    charts: Object.freeze([
      causeChart(distribution),
      parameterChart(distribution),
      categoryChart(distribution),
      exposureChart(exposure),
    ]),
    tables: Object.freeze([
      causeTable(distribution),
      parameterTable(distribution),
      categoryTable(distribution),
      exposureTable(read.cohorts),
      seedTable(read.seeds),
      isolatedTable(isolatedViews(read.isolated)),
      coexistenceTable(coexistenceViews(read.coexistence)),
      metricTable(metricViews(read.metrics)),
      divergenceTable(read.cohorts),
    ]),
    isolated: isolatedViews(read.isolated),
    coexistence: coexistenceViews(read.coexistence),
    metrics: metricViews(read.metrics),
  });
}
