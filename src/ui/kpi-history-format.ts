import type {
  KpiHistoryAverageState,
  KpiHistoryMonth,
  KpiHistoryPoint,
  KpiHistoryProjection,
  KpiHistorySelection,
  KpiHistoryState,
} from '../economy';

/**
 * 210 KPI popup projection.
 *
 * The popup is a pure presentation layer: it receives the 209 history selection and turns it into
 * text, accessible tables and deterministic chart bars. It never imports the economy at runtime and
 * never reads a ledger, a store or a renderer. A month without data keeps the closed `fără date`
 * text and is never rendered as a zero bar or a fabricated average; a real zero stays `0`. A partial
 * month says so and is never compared with a completed month. Averages are printed from the exact
 * `ratingSum / reviewCount` the selection already computed.
 */
export const KPI_HISTORY_UI_VERSION = '210-kpi-history-popup-v1' as const;

export const KPI_HISTORY_CHART_KEYS = [
  'MONTH_REVENUE',
  'DAILY_RIDES',
  'DAILY_REVIEWS',
  'DAILY_RATING',
  'RATING_DISTRIBUTION',
] as const;
export type KpiHistoryChartKey = (typeof KPI_HISTORY_CHART_KEYS)[number];

export const KPI_HISTORY_CHART_TITLES: Readonly<Record<KpiHistoryChartKey, string>> = Object.freeze(
  {
    MONTH_REVENUE: 'Revenue lunar (efectiv și proiectat)',
    DAILY_RIDES: 'Curse terminale pe zi simulată',
    DAILY_REVIEWS: 'Review-uri pe zi simulată',
    DAILY_RATING: 'Media notelor pe zi simulată (0–5)',
    RATING_DISTRIBUTION: 'Distribuția notelor 0–5',
  },
);

export const KPI_HISTORY_CHART_UNITS: Readonly<Record<KpiHistoryChartKey, string>> = Object.freeze({
  MONTH_REVENUE: 'monedă',
  DAILY_RIDES: 'curse/zi',
  DAILY_REVIEWS: 'review-uri/zi',
  DAILY_RATING: 'note 0–5',
  RATING_DISTRIBUTION: 'review-uri',
});

export const KPI_HISTORY_TEXT = Object.freeze({
  title: 'KPIs și istoricul flotei',
  trigger: 'KPIs',
  triggerDescription:
    'Deschide popup-ul KPIs cu revenue lunar, curse, review-uri, media și distribuția notelor.',
  close: 'Închide',
  closeDescription: 'Închide popup-ul KPIs și reia simularea suspendată.',
  bodyLabel: 'Conținutul popup-ului KPIs',
  description:
    'Popup-ul citește agregările incrementale ale flotei, fără să rescaneze ledgerul. ' +
    'Media este ratingSum / reviewCount peste sumele exacte; o lună fără date este „fără date”, ' +
    'nu zero, iar luna curentă este parțială și nu se compară cu o lună încheiată.',
  empty: 'Nu există încă date economice; graficele rămân goale până la prima cursă terminală.',
  noData: 'fără date',
  noReviews: 'fără review-uri',
  unavailable: 'Indisponibil',
  complete: 'lună încheiată',
  partial: 'lună parțială',
  partialNote:
    'Lună parțială: arată doar intervalul observat și nu se compară cu o lună încheiată.',
  actual: 'efectiv',
  projected: 'proiectat',
  insufficient: 'Date insuficiente',
  noProjection: 'proiecție indisponibilă',
  downsampled:
    'Punctele graficului sunt grupate vizual; fiecare grup păstrează sumele exacte și numărul de zile.',
  exact: 'Fiecare punct al graficului este o zi simulată exactă.',
});

export type KpiHistoryBarState =
  'VALUE' | 'ZERO' | 'NO_REVIEWS' | 'NO_DATA' | 'PROJECTED' | 'INSUFFICIENT';

export interface KpiHistoryChartBar {
  readonly series: 'ACTUAL' | 'PROJECTED' | 'VALUE';
  readonly value: number | null;
  /** Bar height, already clamped to 0–100. */
  readonly percent: number;
  readonly display: string;
  readonly state: KpiHistoryBarState;
  readonly title: string;
}

export interface KpiHistoryChartGroup {
  readonly key: string;
  readonly label: string;
  readonly note: string;
  readonly bars: readonly KpiHistoryChartBar[];
}

export interface KpiHistoryChart {
  readonly key: KpiHistoryChartKey;
  readonly title: string;
  readonly unitLabel: string;
  readonly caption: string;
  readonly state: 'AVAILABLE' | 'NO_DATA';
  readonly groups: readonly KpiHistoryChartGroup[];
  readonly summary: string;
}

export interface KpiHistoryTable {
  readonly key: string;
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly rowKeys: readonly string[];
  readonly rowStates: readonly string[];
}

export interface KpiHistoryMonthView {
  readonly key: string;
  readonly label: string;
  readonly state: KpiHistoryState;
  readonly stateLabel: string;
  readonly revenueLabel: string;
  readonly ridesLabel: string;
  readonly reviewsLabel: string;
  readonly averageLabel: string;
  readonly sampleLabel: string;
  readonly note: string;
  readonly isPartial: boolean;
  readonly hasData: boolean;
}

export interface KpiHistoryProjectionView {
  readonly status: KpiHistoryProjection['status'];
  readonly headline: string;
  readonly detail: string;
  readonly windowLabel: string;
  readonly actualLabel: string;
  readonly projectedLabel: string;
  readonly sampleLabel: string;
}

export interface KpiHistoryTotalsView {
  readonly monthsLabel: string;
  readonly revenueLabel: string;
  readonly ridesLabel: string;
  readonly reviewsLabel: string;
  readonly averageLabel: string;
  readonly sampleLabel: string;
}

export interface KpiHistoryDownsamplingView {
  readonly downsampled: boolean;
  readonly exactPoints: number;
  readonly visualPoints: number;
  readonly maximumDailyPoints: number;
  readonly label: string;
}

export interface KpiHistoryView {
  readonly version: typeof KPI_HISTORY_UI_VERSION;
  readonly tick: number;
  readonly title: string;
  readonly description: string;
  readonly summary: string;
  readonly currency: string;
  readonly empty: boolean;
  readonly months: readonly KpiHistoryMonthView[];
  readonly charts: readonly KpiHistoryChart[];
  readonly tables: readonly KpiHistoryTable[];
  readonly projection: KpiHistoryProjectionView;
  readonly totals: KpiHistoryTotalsView;
  readonly downsampling: KpiHistoryDownsamplingView;
  readonly historyScans: 0;
  readonly signature: string;
}

/** Trims trailing zeros; the project prints decimal fractions with the same `.` separator. */
export function formatKpiHistoryNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function formatKpiHistoryAverage(
  value: number | null,
  state: KpiHistoryAverageState,
): string {
  if (state === 'AVAILABLE' && value !== null) return formatKpiHistoryNumber(value, 3);
  return state === 'NO_REVIEWS' ? KPI_HISTORY_TEXT.noReviews : KPI_HISTORY_TEXT.noData;
}

function moneyLabel(value: number | null, currency: string): string {
  return value === null ? KPI_HISTORY_TEXT.noData : `${formatKpiHistoryNumber(value)} ${currency}`;
}

function countLabel(value: number | null): string {
  return value === null ? KPI_HISTORY_TEXT.noData : formatKpiHistoryNumber(value);
}

function sampleLabel(reviewCount: number | null): string {
  return reviewCount === null
    ? KPI_HISTORY_TEXT.noData
    : `${formatKpiHistoryNumber(reviewCount)} review-uri`;
}

function percentOf(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) return 0;
  const percent = Math.round((value / scale) * 1000) / 10;
  return Math.min(100, Math.max(0, percent));
}

function stateLabel(state: KpiHistoryState): string {
  if (state === 'PARTIAL') return KPI_HISTORY_TEXT.partial;
  if (state === 'COMPLETE') return KPI_HISTORY_TEXT.complete;
  return KPI_HISTORY_TEXT.noData;
}

function monthLabel(index: number): string {
  return `Luna simulată ${index}`;
}

function pointLabel(point: KpiHistoryPoint): string {
  return point.exactPoints === 1
    ? `Ziua simulată ${point.firstIndex}`
    : `Zilele ${point.firstIndex}–${point.lastIndex} (${point.exactPoints} zile)`;
}

function monthViews(selection: KpiHistorySelection): KpiHistoryMonthView[] {
  return selection.months.map((month: KpiHistoryMonth) => ({
    key: month.periodId,
    label: monthLabel(month.index),
    state: month.state,
    stateLabel: stateLabel(month.state),
    revenueLabel: moneyLabel(month.revenueMinorUnits, month.currency ?? selection.currency),
    ridesLabel: countLabel(month.terminalRides),
    reviewsLabel: countLabel(month.reviewCount),
    averageLabel: formatKpiHistoryAverage(month.averageRating, month.averageState),
    sampleLabel: sampleLabel(month.reviewCount),
    note: month.state === 'PARTIAL' ? KPI_HISTORY_TEXT.partialNote : '',
    isPartial: month.state === 'PARTIAL',
    hasData: month.state !== 'NO_DATA',
  }));
}

function revenueChart(
  selection: KpiHistorySelection,
  months: readonly KpiHistoryMonthView[],
): KpiHistoryChart {
  const projected =
      selection.projection.status === 'PROJECTED'
        ? selection.projection.projectedRevenueMinorUnits
        : null,
    scale = Math.max(
      1,
      projected ?? 0,
      ...selection.months.map((month) => month.revenueMinorUnits ?? 0),
    ),
    groups = selection.months.map((month, index) => {
      const view = months[index]!,
        current = month.index === selection.currentMonthIndex,
        actual: KpiHistoryChartBar = Object.freeze({
          series: 'ACTUAL' as const,
          value: month.revenueMinorUnits,
          percent: month.revenueMinorUnits === null ? 0 : percentOf(month.revenueMinorUnits, scale),
          display:
            month.revenueMinorUnits === null
              ? KPI_HISTORY_TEXT.noData
              : `${formatKpiHistoryNumber(month.revenueMinorUnits)} ${selection.currency}`,
          state:
            month.revenueMinorUnits === null
              ? ('NO_DATA' as const)
              : month.revenueMinorUnits === 0
                ? ('ZERO' as const)
                : ('VALUE' as const),
          title:
            month.revenueMinorUnits === null
              ? `${view.label}: ${KPI_HISTORY_TEXT.noData}`
              : `${view.label}: ${formatKpiHistoryNumber(month.revenueMinorUnits)} ${selection.currency} efectiv, ${view.ridesLabel} curse terminale, ${view.sampleLabel}`,
        }),
        bars: KpiHistoryChartBar[] = [actual];
      if (current) {
        const value = projected,
          available = selection.projection.status === 'PROJECTED';
        bars.push(
          Object.freeze({
            series: 'PROJECTED' as const,
            value,
            percent: value === null ? 0 : percentOf(value, scale),
            display: available
              ? `${formatKpiHistoryNumber(value ?? 0)} ${selection.currency}`
              : KPI_HISTORY_TEXT.noProjection,
            state: available ? ('PROJECTED' as const) : ('INSUFFICIENT' as const),
            title: available
              ? `${view.label}: ${formatKpiHistoryNumber(value ?? 0)} ${selection.currency} proiectat din fereastra observată`
              : `${view.label}: ${KPI_HISTORY_TEXT.insufficient}`,
          }),
        );
      }
      return Object.freeze({
        key: month.periodId,
        label: `Luna ${month.index}`,
        note: view.isPartial ? KPI_HISTORY_TEXT.partial : '',
        bars: Object.freeze(bars),
      });
    });
  return Object.freeze({
    key: 'MONTH_REVENUE' as const,
    title: KPI_HISTORY_CHART_TITLES.MONTH_REVENUE,
    unitLabel: selection.currency,
    caption:
      'Barele efective sunt revenue-ul realizat al fiecărei luni simulate. Luna curentă este parțială și are, separat, o bară proiectată din fereastra observată; proiecția nu înlocuiește încasarea realizată.',
    state: selection.totals.monthsWithData === 0 ? ('NO_DATA' as const) : ('AVAILABLE' as const),
    groups: Object.freeze(groups),
    summary:
      selection.totals.monthsWithData === 0
        ? KPI_HISTORY_TEXT.empty
        : `${formatKpiHistoryNumber(selection.totals.months)} luni în fereastră, ${formatKpiHistoryNumber(selection.totals.monthsWithData)} cu date, revenue efectiv ${formatKpiHistoryNumber(selection.totals.revenueMinorUnits)} ${selection.currency}.`,
  });
}

function dailyChart(
  selection: KpiHistorySelection,
  key: 'DAILY_RIDES' | 'DAILY_REVIEWS' | 'DAILY_RATING',
): KpiHistoryChart {
  const points = selection.daily.visual,
    scale =
      key === 'DAILY_RATING'
        ? 5
        : Math.max(
            1,
            ...points.map((point) =>
              key === 'DAILY_RIDES' ? point.terminalRides : point.reviewCount,
            ),
          ),
    groups = points.map((point) => {
      const value =
          key === 'DAILY_RIDES'
            ? point.terminalRides
            : key === 'DAILY_REVIEWS'
              ? point.reviewCount
              : point.averageRating,
        available = value !== null,
        state: KpiHistoryBarState = !available
          ? ('NO_REVIEWS' as const)
          : value === 0
            ? ('ZERO' as const)
            : ('VALUE' as const),
        display =
          key === 'DAILY_RATING'
            ? available
              ? `${formatKpiHistoryNumber(value, 3)} / 5`
              : KPI_HISTORY_TEXT.noReviews
            : available
              ? formatKpiHistoryNumber(value)
              : KPI_HISTORY_TEXT.noData,
        title =
          key === 'DAILY_RATING'
            ? `${pointLabel(point)}: media ${formatKpiHistoryAverage(point.averageRating, point.averageState)}, ${sampleLabel(point.reviewCount)}`
            : `${pointLabel(point)}: ${available ? formatKpiHistoryNumber(value) : KPI_HISTORY_TEXT.noData} ${key === 'DAILY_RIDES' ? 'curse terminale' : 'review-uri'}, ${sampleLabel(point.reviewCount)}`;
      return Object.freeze({
        key: point.periodId,
        label:
          point.exactPoints === 1
            ? `Ziua ${point.firstIndex}`
            : `Zilele ${point.firstIndex}–${point.lastIndex}`,
        note: point.completeness === 'PARTIAL' ? KPI_HISTORY_TEXT.partial : '',
        bars: Object.freeze([
          Object.freeze({
            series: 'VALUE' as const,
            value,
            percent: available ? percentOf(value, scale) : 0,
            display,
            state,
            title,
          }),
        ]),
      });
    }),
    title = KPI_HISTORY_CHART_TITLES[key],
    unit = KPI_HISTORY_CHART_UNITS[key],
    summary =
      points.length === 0
        ? KPI_HISTORY_TEXT.empty
        : `${formatKpiHistoryNumber(points.length)} puncte, ${formatKpiHistoryNumber(selection.daily.exactPoints)} zile exacte, media fiecărui punct este calculată din sumele exacte.`;
  return Object.freeze({
    key,
    title,
    unitLabel: unit,
    caption:
      key === 'DAILY_RATING'
        ? 'O zi fără review-uri nu are medie: bara lipsește și textul spune „fără review-uri”. Media unui grup este ratingSum / reviewCount, nu media mediilor zilnice.'
        : 'Fiecare bară este un punct al graficului; un grup de zile păstrează suma exactă a zilelor sale. Zilele fără evenimente nu sunt inventate.',
    state: points.length === 0 ? ('NO_DATA' as const) : ('AVAILABLE' as const),
    groups: Object.freeze(groups),
    summary,
  });
}

function distributionChart(selection: KpiHistorySelection): KpiHistoryChart {
  const distribution = selection.distribution,
    scale = Math.max(1, distribution.maximumCount),
    groups = distribution.counts.map((count, rating) =>
      Object.freeze({
        key: `rating-${rating}`,
        label: `Nota ${rating}`,
        note: '',
        bars: Object.freeze([
          Object.freeze({
            series: 'VALUE' as const,
            value: count,
            percent: percentOf(count, scale),
            display: formatKpiHistoryNumber(count),
            state:
              distribution.state === 'NO_DATA'
                ? ('NO_DATA' as const)
                : count === 0
                  ? ('ZERO' as const)
                  : ('VALUE' as const),
            title: `Nota ${rating}: ${formatKpiHistoryNumber(count)} review-uri din ${formatKpiHistoryNumber(distribution.reviewCount)}`,
          }),
        ]),
      }),
    );
  return Object.freeze({
    key: 'RATING_DISTRIBUTION' as const,
    title: KPI_HISTORY_CHART_TITLES.RATING_DISTRIBUTION,
    unitLabel: KPI_HISTORY_CHART_UNITS.RATING_DISTRIBUTION,
    caption:
      'Histograma însumează review-urile efective din fereastra lunilor afișate. Notele 0–5 sunt cele înregistrate; o lună fără review-uri nu produce note.',
    state: distribution.state === 'AVAILABLE' ? ('AVAILABLE' as const) : ('NO_DATA' as const),
    groups: Object.freeze(groups),
    summary:
      distribution.state === 'NO_DATA'
        ? KPI_HISTORY_TEXT.empty
        : `${formatKpiHistoryNumber(distribution.reviewCount)} review-uri în fereastră, maxim ${formatKpiHistoryNumber(distribution.maximumCount)} într-o notă.`,
  });
}

function monthTable(months: readonly KpiHistoryMonthView[], currency: string): KpiHistoryTable {
  return Object.freeze({
    key: 'months',
    caption: `Tabel lunar: revenue, curse, review-uri, media și eșantionul (moneda ${currency})`,
    headers: Object.freeze([
      'Lună simulată',
      'Stare',
      'Revenue',
      'Curse',
      'Review-uri',
      'Media',
      'Eșantion',
    ]),
    rows: Object.freeze(
      months.map((month) =>
        Object.freeze([
          month.label,
          month.stateLabel,
          month.revenueLabel,
          month.ridesLabel,
          month.reviewsLabel,
          month.averageLabel,
          month.sampleLabel,
        ]),
      ),
    ),
    rowKeys: Object.freeze(months.map((month) => month.key)),
    rowStates: Object.freeze(months.map((month) => month.state)),
  });
}

function dailyTable(selection: KpiHistorySelection): KpiHistoryTable {
  return Object.freeze({
    key: 'days',
    caption:
      'Tabel zilnic: fiecare rând este o zi exactă sau un grup vizual de zile, cu sumele exacte ale membrilor',
    headers: Object.freeze(['Interval', 'Curse', 'Review-uri', 'Media', 'Eșantion']),
    rows: Object.freeze(
      selection.daily.visual.map((point) =>
        Object.freeze([
          pointLabel(point),
          formatKpiHistoryNumber(point.terminalRides),
          formatKpiHistoryNumber(point.reviewCount),
          formatKpiHistoryAverage(point.averageRating, point.averageState),
          sampleLabel(point.reviewCount),
        ]),
      ),
    ),
    rowKeys: Object.freeze(selection.daily.visual.map((point) => point.periodId)),
    rowStates: Object.freeze(selection.daily.visual.map((point) => point.completeness)),
  });
}

function distributionTable(selection: KpiHistorySelection): KpiHistoryTable {
  const distribution = selection.distribution,
    total = distribution.reviewCount;
  return Object.freeze({
    key: 'distribution',
    caption: 'Distribuția notelor 0–5 în fereastra lunilor afișate',
    headers: Object.freeze(['Notă', 'Review-uri', 'Pondere']),
    rows: Object.freeze(
      distribution.counts.map((count, rating) =>
        Object.freeze([
          `Nota ${rating}`,
          formatKpiHistoryNumber(count),
          distribution.state === 'NO_DATA' || total === 0
            ? KPI_HISTORY_TEXT.noReviews
            : `${formatKpiHistoryNumber((count / total) * 100, 1)}%`,
        ]),
      ),
    ),
    rowKeys: Object.freeze(distribution.counts.map((_, rating) => `rating-${rating}`)),
    rowStates: Object.freeze(
      distribution.counts.map(() =>
        distribution.state === 'NO_DATA' ? 'NO_DATA' : distribution.state,
      ),
    ),
  });
}

function projectionView(selection: KpiHistorySelection): KpiHistoryProjectionView {
  const projection = selection.projection,
    monthSeconds = `luna are ${formatKpiHistoryNumber(projection.monthSeconds)} s simulați`;
  if (projection.status === 'PROJECTED')
    return Object.freeze({
      status: 'PROJECTED' as const,
      headline: `Proiecție pentru luna curentă: ${formatKpiHistoryNumber(projection.projectedRevenueMinorUnits ?? 0)} ${selection.currency}`,
      detail:
        `Proiecția folosește fereastra observată (${formatKpiHistoryNumber(projection.observedSeconds ?? 0)} s) ` +
        `din cei ${formatKpiHistoryNumber(projection.terminalRides)} pași terminali; ${monthSeconds}. ` +
        'Încasarea realizată rămâne separată și nu este înlocuită de proiecție.',
      windowLabel:
        projection.windowStartTick === null || projection.windowEndTick === null
          ? 'Fereastră indisponibilă'
          : `Fereastră: tick ${projection.windowStartTick}–${projection.windowEndTick} · ${formatKpiHistoryNumber(projection.observedSeconds ?? 0)} s observate`,
      actualLabel: `Efectiv luna curentă: ${moneyLabel(selection.totals.revenueMinorUnits, selection.currency)}`,
      projectedLabel: `Proiectat: ${formatKpiHistoryNumber(projection.projectedRevenueMinorUnits ?? 0)} ${selection.currency}`,
      sampleLabel: `Eșantion: ${formatKpiHistoryNumber(projection.terminalRides)} curse terminale (minimum ${formatKpiHistoryNumber(projection.minimumTerminalRides)}) · ${formatKpiHistoryNumber(projection.observedSeconds ?? 0)} s (minimum ${formatKpiHistoryNumber(projection.minimumExposureSeconds)} s)`,
    });
  const detail =
    projection.reason === 'FEW_RIDES'
      ? `Sunt ${formatKpiHistoryNumber(projection.terminalRides)} curse terminale, sub minimumul de ${formatKpiHistoryNumber(projection.minimumTerminalRides)}; proiecția nu se afișează.`
      : projection.reason === 'SHORT_EXPOSURE'
        ? `Expunerea observată este ${formatKpiHistoryNumber(projection.exposureSeconds)} s, sub minimumul de ${formatKpiHistoryNumber(projection.minimumExposureSeconds)} s; proiecția nu se afișează.`
        : 'Nu există încă o lună cu date; proiecția nu se afișează.';
  return Object.freeze({
    status: 'INSUFFICIENT_DATA' as const,
    headline: KPI_HISTORY_TEXT.insufficient,
    detail,
    windowLabel: 'Fără fereastră de proiecție',
    actualLabel: `Efectiv luna curentă: ${moneyLabel(null, selection.currency)}`,
    projectedLabel: KPI_HISTORY_TEXT.noProjection,
    sampleLabel: `Eșantion: ${formatKpiHistoryNumber(projection.terminalRides)} curse terminale · ${formatKpiHistoryNumber(projection.exposureSeconds)} s observate`,
  });
}

function totalsView(selection: KpiHistorySelection): KpiHistoryTotalsView {
  const totals = selection.totals;
  return Object.freeze({
    monthsLabel: `${formatKpiHistoryNumber(totals.months)} luni (${formatKpiHistoryNumber(totals.monthsWithData)} cu date, ${formatKpiHistoryNumber(totals.monthsWithoutData)} fără date, ${formatKpiHistoryNumber(totals.partialMonths)} parțiale)`,
    revenueLabel: moneyLabel(
      totals.monthsWithData === 0 ? null : totals.revenueMinorUnits,
      selection.currency,
    ),
    ridesLabel:
      totals.monthsWithData === 0
        ? KPI_HISTORY_TEXT.noData
        : formatKpiHistoryNumber(totals.terminalRides),
    reviewsLabel:
      totals.monthsWithData === 0
        ? KPI_HISTORY_TEXT.noData
        : formatKpiHistoryNumber(totals.reviewCount),
    averageLabel: formatKpiHistoryAverage(totals.averageRating, totals.averageState),
    sampleLabel: sampleLabel(totals.monthsWithData === 0 ? null : totals.reviewCount),
  });
}

function downsamplingView(selection: KpiHistorySelection): KpiHistoryDownsamplingView {
  const daily = selection.daily;
  return Object.freeze({
    downsampled: daily.downsampled,
    exactPoints: daily.exactPoints,
    visualPoints: daily.visualPoints,
    maximumDailyPoints: daily.maximumDailyPoints,
    label: daily.downsampled
      ? `${KPI_HISTORY_TEXT.downsampled} ${formatKpiHistoryNumber(daily.exactPoints)} zile exacte → ${formatKpiHistoryNumber(daily.visualPoints)} puncte (plafon ${formatKpiHistoryNumber(daily.maximumDailyPoints)}).`
      : `${KPI_HISTORY_TEXT.exact} ${formatKpiHistoryNumber(daily.exactPoints)} puncte, sub plafonul de ${formatKpiHistoryNumber(daily.maximumDailyPoints)}.`,
  });
}

function signatureOf(selection: KpiHistorySelection): string {
  return JSON.stringify({
    tick: selection.tick,
    currency: selection.currency,
    months: selection.months.map((month) => [
      month.index,
      month.state,
      month.revenueMinorUnits,
      month.terminalRides,
      month.reviewCount,
      month.ratingSum,
    ]),
    days: selection.daily.visual.map((point) => [
      point.firstIndex,
      point.lastIndex,
      point.revenueMinorUnits,
      point.terminalRides,
      point.reviewCount,
      point.ratingSum,
    ]),
    distribution: selection.distribution.counts,
    projection: [
      selection.projection.status,
      selection.projection.projectedRevenueMinorUnits,
      selection.projection.terminalRides,
      selection.projection.exposureSeconds,
    ],
  });
}

/** The closed empty view: no month, no chart point and no invented number. */
export function emptyKpiHistoryView(currency = 'SDA'): KpiHistoryView {
  const emptySelectionText = KPI_HISTORY_TEXT.empty,
    projection: KpiHistoryProjectionView = Object.freeze({
      status: 'INSUFFICIENT_DATA' as const,
      headline: KPI_HISTORY_TEXT.insufficient,
      detail: 'Nu există încă o lună cu date; proiecția nu se afișează.',
      windowLabel: 'Fără fereastră de proiecție',
      actualLabel: `${KPI_HISTORY_TEXT.noData}`,
      projectedLabel: KPI_HISTORY_TEXT.noProjection,
      sampleLabel: 'Eșantion: 0 curse terminale · 0 s observate',
    });
  return Object.freeze({
    version: KPI_HISTORY_UI_VERSION,
    tick: 0,
    title: KPI_HISTORY_TEXT.title,
    description: KPI_HISTORY_TEXT.description,
    summary: emptySelectionText,
    currency,
    empty: true,
    months: Object.freeze([]),
    charts: Object.freeze(
      KPI_HISTORY_CHART_KEYS.map((key) =>
        Object.freeze({
          key,
          title: KPI_HISTORY_CHART_TITLES[key],
          unitLabel: key === 'MONTH_REVENUE' ? currency : KPI_HISTORY_CHART_UNITS[key],
          caption: emptySelectionText,
          state: 'NO_DATA' as const,
          groups: Object.freeze([]),
          summary: emptySelectionText,
        }),
      ),
    ),
    tables: Object.freeze([]),
    projection,
    totals: Object.freeze({
      monthsLabel: '0 luni',
      revenueLabel: KPI_HISTORY_TEXT.noData,
      ridesLabel: KPI_HISTORY_TEXT.noData,
      reviewsLabel: KPI_HISTORY_TEXT.noData,
      averageLabel: KPI_HISTORY_TEXT.noData,
      sampleLabel: KPI_HISTORY_TEXT.noData,
    }),
    downsampling: Object.freeze({
      downsampled: false,
      exactPoints: 0,
      visualPoints: 0,
      maximumDailyPoints: 0,
      label: emptySelectionText,
    }),
    historyScans: 0 as const,
    signature: JSON.stringify({ empty: true, currency }),
  });
}

/** Projects the 209 history selection into the popup view; deterministic for identical input. */
export function projectKpiHistory(selection: KpiHistorySelection): KpiHistoryView {
  if (selection.months.length === 0 && selection.daily.exactPoints === 0)
    return emptyKpiHistoryView(selection.currency);
  const months = monthViews(selection),
    charts = [
      revenueChart(selection, months),
      dailyChart(selection, 'DAILY_RIDES'),
      dailyChart(selection, 'DAILY_REVIEWS'),
      dailyChart(selection, 'DAILY_RATING'),
      distributionChart(selection),
    ],
    totals = totalsView(selection),
    downsampling = downsamplingView(selection),
    summary = [
      `${totals.monthsLabel}.`,
      `Revenue în fereastră: ${totals.revenueLabel}.`,
      `Curse terminale: ${totals.ridesLabel}.`,
      `Review-uri: ${totals.reviewsLabel} (${totals.sampleLabel}), media ponderată ${totals.averageLabel}.`,
      `${formatKpiHistoryNumber(selection.completedMonths)} luni încheiate în istoricul 209.`,
    ].join(' ');
  return Object.freeze({
    version: KPI_HISTORY_UI_VERSION,
    tick: selection.tick,
    title: KPI_HISTORY_TEXT.title,
    description: KPI_HISTORY_TEXT.description,
    summary,
    currency: selection.currency,
    empty: selection.totals.monthsWithData === 0 && selection.daily.exactPoints === 0,
    months: Object.freeze(months),
    charts: Object.freeze(charts),
    tables: Object.freeze([
      monthTable(months, selection.currency),
      dailyTable(selection),
      distributionTable(selection),
    ]),
    projection: projectionView(selection),
    totals,
    downsampling,
    historyScans: 0 as const,
    signature: signatureOf(selection),
  });
}
