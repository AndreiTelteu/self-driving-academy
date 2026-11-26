import type {
  CompanyCostCategory,
  CompanyCostKind,
  CompanyEvolutionRead,
  CompanyEvolutionRefusalReason,
  CompanyMonthReport,
  CompanyOfferState,
} from '../economy';

/**
 * PBI 270 company dashboard projection.
 *
 * The dashboard is a pure presentation layer over the 268 finance read model and the 269 company
 * evolution read model. It never imports the economy at runtime, never reads a ledger, a store or a
 * renderer, and never creates a second ledger or fleet. Every number in the chart is the same
 * `CompanyMonthReport` number the table prints:
 *
 * - a month without a bucket is `null` / `fără date`, never `0` and never interpolated;
 * - a real zero month stays `0`, and a negative profit stays negative in both the chart and the table;
 * - the chart and the table are two projections of one ordered month list, so no mean of means is
 *   computed and no average is invented for a missing period.
 */
export const COMPANY_DASHBOARD_UI_VERSION = '270-company-dashboard-v1' as const;

/** The dashboard shows at most twelve simulated months, like the 210 KPI window. */
export const COMPANY_DASHBOARD_WINDOW_MONTHS = 12;

/** The panel re-reads the live port at most ten times per second while it is open. */
export const COMPANY_DASHBOARD_REFRESH_MS = 100;

export const COMPANY_DASHBOARD_TEXT = Object.freeze({
  title: 'Companie · profit, costuri și investiții',
  description:
    'Panoul citește exclusiv read model-ul companiei 268/269: revenue, costuri operaționale, ' +
    'profit, cash, valoare de flotă și nivel. O lună fără date este „fără date”, nu zero; ' +
    'un profit zero sau negativ real este afișat ca atare. Graficul și tabelul folosesc aceleași ' +
    'agregate lunare, fără medii ale mediilor.',
  close: 'Închide',
  closeDescription: 'Închide panoul companiei și reia simularea suspendată.',
  bodyLabel: 'Conținutul panoului companiei',
  empty: 'Nu există încă date despre companie; panoul nu inventează revenue, costuri sau flotă.',
  noData: 'fără date',
  noHistory: 'Nu există încă o lună simulată cu intrări în ledgerul companiei.',
  noRide: 'Nu există încă o cursă costată; detalierea pe cursă apare după prima cursă terminală.',
  notApplicable: 'n/a',
  complete: 'lună încheiată',
  partial: 'lună parțială',
  partialNote:
    'Lună parțială: arată doar intervalul observat și nu se compară cu o lună încheiată.',
  available: 'Disponibil',
  levelLabel: 'Nivel companie',
  revenueLabel: 'Revenue',
  costLabel: 'Costuri',
  profitLabel: 'Profit',
  cashLabel: 'Cash',
  fleetValueLabel: 'Valoare flotă',
  companyLevelLabel: 'Nivel',
  investmentsLabel: 'Achiziții de vehicule',
  upgradesLabel: 'Upgrade-uri',
  pendingLabel: 'Efecte în așteptare',
  refusalLabel: 'Refuzuri',
  lastRideLabel: 'Ultima cursă costată',
  monthlyLabel: 'Luni simulate',
  costBreakdownLabel: 'Costuri pe categorie',
  confirm: 'Confirmă',
  cancel: 'Anulează',
  buy: 'Cumpără',
  activate: 'Activează',
  blocked: 'Blocat',
  accepted: 'Acceptat',
  rejected: 'Refuzat',
  unavailable: 'Indisponibil',
  closed: 'Panoul este închis.',
  pendingNone: 'Nu există o acțiune în așteptare.',
  refreshNote:
    'Actualizare la 10 Hz cât timp panoul este deschis; panoul închis nu citește ledgerul.',
});

export const COMPANY_COST_CATEGORY_LABELS: Readonly<Record<CompanyCostCategory, string>> =
  Object.freeze({
    ENERGY: 'Energie',
    MAINTENANCE: 'Mentenanță',
    INCIDENT: 'Incidente',
    SERVICE: 'Serviciu',
    INSURANCE: 'Asigurări',
    SALARIES: 'Salarii',
    LICENSES: 'Licențe',
  });

export const COMPANY_OFFER_STATE_LABELS: Readonly<Record<CompanyOfferState, string>> =
  Object.freeze({
    AVAILABLE: COMPANY_DASHBOARD_TEXT.available,
    OWNED: 'Deținut',
    LEVEL_REQUIRED: 'Nivel insuficient',
    INSUFFICIENT_CASH: 'Fonduri insuficiente',
    FLEET_CAPACITY: 'Flotă plină',
    FLEET_UNAVAILABLE: 'Flotă indisponibilă',
  });

export const COMPANY_REFUSAL_LABELS: Readonly<Record<CompanyEvolutionRefusalReason, string>> =
  Object.freeze({
    INSUFFICIENT_CASH: 'Fonduri insuficiente',
    LEVEL_REQUIRED: 'Nivel insuficient',
    ALREADY_OWNED: 'Deja deținut',
    FLEET_UNAVAILABLE: 'Flota nu este disponibilă',
    FLEET_CAPACITY: 'Capacitatea flotei este plină',
    FLEET_REFUSED: 'Flota a refuzat vehiculul',
    LEDGER_REJECTED: 'Ledgerul companiei a refuzat acțiunea',
    INVALID_OFFER: 'Oferta nu există',
    INVALID_INPUT: 'Comandă invalidă',
  });

const COMPANY_UPGRADE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  'upgrade-preventive-maintenance': 'Mentenanță preventivă',
  'upgrade-service-contract': 'Contract de service',
  'upgrade-energy-routing': 'Rutare eficientă',
  'upgrade-insurance-bundle': 'Pachet de asigurări',
  'upgrade-incident-response': 'Răspuns la incidente',
});

const TERMINAL_STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  COMPLETED: 'Finalizată',
  FAILED: 'Eșuată',
  CANCELLED: 'Anulată',
});

export type CompanyDashboardMonthState = 'NO_DATA' | 'COMPLETE' | 'PARTIAL';
export type CompanyDashboardBarState = 'VALUE' | 'ZERO' | 'NEGATIVE' | 'NO_DATA';
export type CompanyDashboardBarSeries = 'REVENUE' | 'COST' | 'PROFIT';

export interface CompanyDashboardBar {
  readonly series: CompanyDashboardBarSeries;
  readonly value: number | null;
  /** Absolute height, already clamped to 0–100; the sign is carried by `state` and the text. */
  readonly percent: number;
  readonly display: string;
  readonly state: CompanyDashboardBarState;
  readonly title: string;
}

export interface CompanyDashboardChartGroup {
  readonly key: string;
  readonly label: string;
  readonly state: CompanyDashboardMonthState;
  readonly bars: readonly CompanyDashboardBar[];
}

export interface CompanyDashboardChart {
  readonly key: 'MONTHS';
  readonly title: string;
  readonly unitLabel: string;
  readonly caption: string;
  readonly state: 'AVAILABLE' | 'NO_DATA';
  readonly groups: readonly CompanyDashboardChartGroup[];
  readonly summary: string;
}

export interface CompanyDashboardTable {
  readonly key: string;
  readonly caption: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly rowKeys: readonly string[];
  readonly rowStates: readonly string[];
}

export interface CompanyDashboardMonthView {
  readonly key: string;
  readonly index: number;
  readonly label: string;
  readonly state: CompanyDashboardMonthState;
  readonly stateLabel: string;
  readonly revenueMinorUnits: number | null;
  readonly costMinorUnits: number | null;
  readonly profitMinorUnits: number | null;
  readonly revenueLabel: string;
  readonly costLabel: string;
  readonly profitLabel: string;
  readonly terminalRides: number | null;
  readonly ridesLabel: string;
  readonly note: string;
  readonly isPartial: boolean;
  readonly hasData: boolean;
  readonly negativeProfit: boolean;
}

export interface CompanyDashboardMetricsView {
  readonly revenueMinorUnits: number;
  readonly costMinorUnits: number;
  readonly profitMinorUnits: number;
  readonly cashMinorUnits: number;
  readonly fleetValueMinorUnits: number;
  readonly companyLevel: number;
  readonly companyLevelMax: number;
  readonly reinvestedProfitMinorUnits: number;
  readonly toNextLevelMinorUnits: number;
  readonly revenueLabel: string;
  readonly costLabel: string;
  readonly profitLabel: string;
  readonly cashLabel: string;
  readonly fleetValueLabel: string;
  readonly levelLabel: string;
  readonly levelDetail: string;
  readonly profitNegative: boolean;
}

export interface CompanyDashboardOfferCard {
  readonly key: string;
  readonly offerId: string;
  readonly title: string;
  readonly costMinorUnits: number;
  readonly costLabel: string;
  readonly effectLabel: string;
  readonly state: CompanyOfferState;
  readonly stateLabel: string;
  readonly reasonLabel: string | null;
  readonly blocked: boolean;
  readonly confirmationLabel: string;
}

export interface CompanyDashboardUpgradeCard {
  readonly key: string;
  readonly upgradeId: string;
  readonly title: string;
  readonly costMinorUnits: number;
  readonly costLabel: string;
  readonly effectLabel: string;
  readonly state: CompanyOfferState;
  readonly stateLabel: string;
  readonly reasonLabel: string | null;
  readonly blocked: boolean;
  readonly effective: boolean;
  readonly confirmationLabel: string;
}

export interface CompanyDashboardEffectView {
  readonly key: string;
  readonly categoryLabel: string;
  readonly reductionLabel: string;
  readonly periodLabel: string;
  readonly upgrades: number;
}

export interface CompanyDashboardRideLineView {
  readonly key: string;
  readonly categoryLabel: string;
  readonly quantityLabel: string;
  readonly amountLabel: string;
}

export interface CompanyDashboardRideView {
  readonly key: string;
  readonly entryId: string;
  readonly rideId: string;
  readonly tick: number;
  readonly stateLabel: string;
  readonly revenueLabel: string;
  readonly costLabel: string;
  readonly profitLabel: string;
  readonly negativeProfit: boolean;
  readonly lines: readonly CompanyDashboardRideLineView[];
}

export interface CompanyDashboardView {
  readonly version: typeof COMPANY_DASHBOARD_UI_VERSION;
  readonly tick: number;
  readonly currency: string;
  readonly empty: boolean;
  readonly noHistory: boolean;
  readonly title: string;
  readonly description: string;
  readonly summary: string;
  readonly metrics: CompanyDashboardMetricsView;
  readonly months: readonly CompanyDashboardMonthView[];
  readonly chart: CompanyDashboardChart;
  readonly tables: readonly CompanyDashboardTable[];
  readonly lastRide: CompanyDashboardRideView | null;
  readonly offers: readonly CompanyDashboardOfferCard[];
  readonly upgrades: readonly CompanyDashboardUpgradeCard[];
  readonly pendingEffects: readonly CompanyDashboardEffectView[];
  readonly refusalsLabel: string;
  readonly historyScans: 0;
  readonly signature: string;
}

/** Trims trailing zeros; no locale grouping, so tests and evidence stay deterministic. */
export function formatCompanyDashboardNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function formatCompanyDashboardMoney(value: number | null, currency: string): string {
  return value === null
    ? COMPANY_DASHBOARD_TEXT.noData
    : `${formatCompanyDashboardNumber(value)} ${currency}`;
}

function classLabel(classId: 'sedan' | 'compact'): string {
  return classId === 'sedan' ? 'sedan' : 'compact';
}

function offerTitle(offerId: string, classId: 'sedan' | 'compact'): string {
  const suffix = offerId.split('-').at(-1) ?? '';
  return `Taxi ${classLabel(classId)}${/^\d+$/.test(suffix) ? ` ${suffix}` : ''}`;
}

function upgradeTitle(upgradeId: string): string {
  const known = COMPANY_UPGRADE_TITLES[upgradeId];
  if (known !== undefined) return known;
  return upgradeId
    .replace(/^upgrade-/, '')
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function reductionLabel(basisPoints: number): string {
  const percent = formatCompanyDashboardNumber((10_000 - basisPoints) / 100, 2);
  return `${percent}%`;
}

function monthIndexFromPeriodId(periodId: string): number | null {
  const match = /^m(\d+)$/.exec(periodId);
  if (match === null) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

function monthLabel(index: number): string {
  return `Luna simulată ${index}`;
}

function stateLabel(state: CompanyDashboardMonthState): string {
  if (state === 'PARTIAL') return COMPANY_DASHBOARD_TEXT.partial;
  if (state === 'COMPLETE') return COMPANY_DASHBOARD_TEXT.complete;
  return COMPANY_DASHBOARD_TEXT.noData;
}

function countOrNull(value: number | null): string {
  return value === null ? COMPANY_DASHBOARD_TEXT.noData : formatCompanyDashboardNumber(value);
}

function moneyOrNull(value: number | null, currency: string): string {
  return formatCompanyDashboardMoney(value, currency);
}

function barState(value: number | null): CompanyDashboardBarState {
  if (value === null) return 'NO_DATA';
  if (value === 0) return 'ZERO';
  if (value < 0) return 'NEGATIVE';
  return 'VALUE';
}

function percentOf(value: number, scale: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((Math.abs(value) / scale) * 1000) / 10));
}

function monthView(report: CompanyMonthReport, currency: string): CompanyDashboardMonthView {
  const state: CompanyDashboardMonthState =
      report.completeness === 'PARTIAL' ? 'PARTIAL' : 'COMPLETE',
    index = monthIndexFromPeriodId(report.periodId) ?? 0;
  return Object.freeze({
    key: report.periodId,
    index,
    label: monthLabel(index),
    state,
    stateLabel: stateLabel(state),
    revenueMinorUnits: report.revenueMinorUnits,
    costMinorUnits: report.totalCostMinorUnits,
    profitMinorUnits: report.profitMinorUnits,
    revenueLabel: moneyOrNull(report.revenueMinorUnits, currency),
    costLabel: moneyOrNull(report.totalCostMinorUnits, currency),
    profitLabel: moneyOrNull(report.profitMinorUnits, currency),
    terminalRides: report.terminalRides,
    ridesLabel: countOrNull(report.terminalRides),
    note: state === 'PARTIAL' ? COMPANY_DASHBOARD_TEXT.partialNote : '',
    isPartial: state === 'PARTIAL',
    hasData: true,
    negativeProfit: report.profitMinorUnits < 0,
  });
}

function missingMonthView(index: number): CompanyDashboardMonthView {
  return Object.freeze({
    key: `missing-${index}`,
    index,
    label: monthLabel(index),
    state: 'NO_DATA' as const,
    stateLabel: COMPANY_DASHBOARD_TEXT.noData,
    revenueMinorUnits: null,
    costMinorUnits: null,
    profitMinorUnits: null,
    revenueLabel: COMPANY_DASHBOARD_TEXT.noData,
    costLabel: COMPANY_DASHBOARD_TEXT.noData,
    profitLabel: COMPANY_DASHBOARD_TEXT.noData,
    terminalRides: null,
    ridesLabel: COMPANY_DASHBOARD_TEXT.noData,
    note: '',
    isPartial: false,
    hasData: false,
    negativeProfit: false,
  });
}

/**
 * Builds the retained month window. A missing bucket between two real months becomes an explicit
 * `NO_DATA` slot; a real zero bucket keeps its zero. The window ends at the newest real bucket
 * because an empty month creates no bucket at all; when the ledger has no bucket the list is empty
 * and the panel shows `fără date`, not twelve fabricated zeros.
 */
function monthWindow(
  reports: readonly CompanyMonthReport[],
  windowMonths: number,
): readonly CompanyDashboardMonthView[] {
  const byIndex = new Map<number, CompanyMonthReport>();
  for (const report of reports) {
    const index = monthIndexFromPeriodId(report.periodId);
    if (index !== null) byIndex.set(index, report);
  }
  if (byIndex.size === 0) return Object.freeze([]);
  const last = Math.max(...byIndex.keys()),
    first = Math.max(0, last - windowMonths + 1),
    months: CompanyDashboardMonthView[] = [];
  for (let index = first; index <= last; index += 1) {
    const report = byIndex.get(index);
    months.push(
      report === undefined
        ? missingMonthView(index)
        : monthView(report, report.currency.length > 0 ? report.currency : 'SDA'),
    );
  }
  return Object.freeze(months);
}

function monthChart(months: readonly CompanyDashboardMonthView[]): CompanyDashboardChart {
  const values = months.flatMap((month) =>
      month.hasData
        ? [month.revenueMinorUnits ?? 0, month.costMinorUnits ?? 0, month.profitMinorUnits ?? 0]
        : [],
    ),
    scale = Math.max(1, ...values.map((value) => Math.abs(value))),
    groups = months.map((month) => {
      const bar = (
        series: CompanyDashboardBarSeries,
        value: number | null,
      ): CompanyDashboardBar => {
        const state = barState(value),
          display = value === null ? COMPANY_DASHBOARD_TEXT.noData : `${value} SDA`;
        return Object.freeze({
          series,
          value,
          percent: value === null ? 0 : percentOf(value, scale),
          display,
          state,
          title:
            value === null
              ? `${month.label}: ${COMPANY_DASHBOARD_TEXT.noData}`
              : `${month.label}: ${series === 'REVENUE' ? 'revenue' : series === 'COST' ? 'costuri' : 'profit'} ${value} SDA`,
        });
      };
      return Object.freeze({
        key: month.key,
        label: month.label,
        state: month.state,
        bars: Object.freeze([
          bar('REVENUE', month.revenueMinorUnits),
          bar('COST', month.costMinorUnits),
          bar('PROFIT', month.profitMinorUnits),
        ]),
      });
    }),
    withData = months.filter((month) => month.hasData),
    totalRevenue = withData.reduce((sum, month) => sum + (month.revenueMinorUnits ?? 0), 0),
    totalCost = withData.reduce((sum, month) => sum + (month.costMinorUnits ?? 0), 0),
    totalProfit = withData.reduce((sum, month) => sum + (month.profitMinorUnits ?? 0), 0),
    summary =
      withData.length === 0
        ? COMPANY_DASHBOARD_TEXT.noHistory
        : `${withData.length} luni cu date din ${months.length} în fereastră; revenue ${totalRevenue} SDA, costuri ${totalCost} SDA, profit ${totalProfit} SDA.`;
  return Object.freeze({
    key: 'MONTHS' as const,
    title: 'Revenue, costuri și profit pe lună simulată',
    unitLabel: 'SDA',
    caption:
      'Fiecare grup este o lună simulată; barele sunt exact revenue, costul total și profitul din ' +
      'tabelul lunar. O lună fără date nu are bară și scrie „fără date”; profitul negativ este ' +
      'marcat explicit, nu ascuns sub zero.',
    state: withData.length === 0 ? ('NO_DATA' as const) : ('AVAILABLE' as const),
    groups: Object.freeze(groups),
    summary,
  });
}

function monthlyTable(
  months: readonly CompanyDashboardMonthView[],
  currency: string,
): CompanyDashboardTable {
  return Object.freeze({
    key: 'months',
    caption: `Tabel lunar: revenue, costuri, profit și curse terminale (moneda ${currency})`,
    headers: Object.freeze([
      'Lună simulată',
      'Stare',
      'Revenue',
      'Costuri',
      'Profit',
      'Curse terminale',
    ]),
    rows: Object.freeze(
      months.map((month) =>
        Object.freeze([
          month.label,
          month.stateLabel,
          month.revenueLabel,
          month.costLabel,
          month.profitLabel,
          month.ridesLabel,
        ]),
      ),
    ),
    rowKeys: Object.freeze(months.map((month) => month.key)),
    rowStates: Object.freeze(months.map((month) => month.state)),
  });
}

function sumCategory(
  reports: readonly CompanyMonthReport[],
  category: CompanyCostCategory,
): number {
  return reports.reduce((sum, report) => sum + report.costByCategory[category], 0);
}

function costBreakdownTable(
  reports: readonly CompanyMonthReport[],
  months: readonly CompanyDashboardMonthView[],
  currency: string,
): CompanyDashboardTable {
  const windowReports = reports.filter((report) => {
      const index = monthIndexFromPeriodId(report.periodId);
      return index !== null && months.some((month) => month.index === index && month.hasData);
    }),
    latest = windowReports.reduce<CompanyMonthReport | null>(
      (current, report) =>
        current === null ||
        (monthIndexFromPeriodId(report.periodId) ?? -1) >
          (monthIndexFromPeriodId(current.periodId) ?? -1)
          ? report
          : current,
      null,
    ),
    windowTotal = windowReports.reduce((sum, report) => sum + report.totalCostMinorUnits, 0),
    hasData = windowReports.length > 0;
  const rows: (readonly string[])[] = [],
    rowKeys: string[] = [],
    rowStates: string[] = [];
  for (const category of Object.keys(COMPANY_COST_CATEGORY_LABELS) as CompanyCostCategory[]) {
    const latestAmount = latest === null ? null : latest.costByCategory[category],
      windowAmount = hasData ? sumCategory(windowReports, category) : null,
      share =
        windowAmount === null || windowTotal <= 0
          ? COMPANY_DASHBOARD_TEXT.notApplicable
          : `${formatCompanyDashboardNumber((windowAmount / windowTotal) * 100, 1)}%`;
    rows.push(
      Object.freeze([
        COMPANY_COST_CATEGORY_LABELS[category],
        moneyOrNull(latestAmount, currency),
        moneyOrNull(windowAmount, currency),
        share,
      ]),
    );
    rowKeys.push(`cost:${category}`);
    rowStates.push(hasData ? 'DATA' : 'NO_DATA');
  }
  return Object.freeze({
    key: 'costs',
    caption:
      'Costuri pe categorie: ultima lună cu date, totalul ferestrei afișate și ponderea în costul ' +
      'ferestrei. Sumele sunt exacte, nu medii.',
    headers: Object.freeze(['Categorie', 'Ultima lună', 'Total fereastră', 'Pondere']),
    rows: Object.freeze(rows),
    rowKeys: Object.freeze(rowKeys),
    rowStates: Object.freeze(rowStates),
  });
}

function quantityLabel(kind: CompanyCostKind, quantity: number): string {
  if (kind === 'PER_KM') return `${formatCompanyDashboardNumber(quantity)} m`;
  if (kind === 'PER_INCIDENT')
    return `${formatCompanyDashboardNumber(quantity)} ${quantity === 1 ? 'incident' : 'incidente'}`;
  return `${formatCompanyDashboardNumber(quantity)} cursă`;
}

function rideView(read: CompanyEvolutionRead, currency: string): CompanyDashboardRideView | null {
  const ride = read.finance.lastRide;
  if (ride === null) return null;
  return Object.freeze({
    key: ride.entryId,
    entryId: ride.entryId,
    rideId: ride.rideId,
    tick: ride.tick,
    stateLabel: TERMINAL_STATE_LABELS[ride.terminalState] ?? ride.terminalState,
    revenueLabel: formatCompanyDashboardMoney(ride.revenueMinorUnits, currency),
    costLabel: formatCompanyDashboardMoney(ride.grossCostMinorUnits, currency),
    profitLabel: formatCompanyDashboardMoney(ride.grossProfitMinorUnits, currency),
    negativeProfit: ride.grossProfitMinorUnits < 0,
    lines: Object.freeze(
      ride.lines.map((line) =>
        Object.freeze({
          key: `${ride.entryId}:${line.category}`,
          categoryLabel: COMPANY_COST_CATEGORY_LABELS[line.category],
          quantityLabel: quantityLabel(line.kind, line.quantity),
          amountLabel: formatCompanyDashboardMoney(line.amountMinorUnits, currency),
        }),
      ),
    ),
  });
}

function offerReason(
  state: CompanyOfferState,
  requiredLevel: number,
  costMinorUnits: number,
  read: CompanyEvolutionRead,
  purchaseSlot: number | null,
): string | null {
  if (state === 'AVAILABLE') return null;
  if (state === 'OWNED')
    return purchaseSlot === null
      ? 'Deținut deja; o a doua achiziție este refuzată.'
      : `Deținut deja la slotul ${purchaseSlot}; o a doua achiziție este refuzată.`;
  if (state === 'LEVEL_REQUIRED')
    return `Nivel insuficient: cere nivelul ${requiredLevel}, compania are nivelul ${read.companyLevel.level}.`;
  if (state === 'INSUFFICIENT_CASH')
    return `Fonduri insuficiente: cost ${costMinorUnits} ${read.currency}, cash ${read.cash.cashMinorUnits} ${read.currency}.`;
  if (state === 'FLEET_CAPACITY')
    return `Capacitatea flotei este plină (${read.fleet.capacityTaxis} taxiuri).`;
  return 'Flota live nu este disponibilă; achiziția nu poate fi aplicată.';
}

function offerCards(read: CompanyEvolutionRead): readonly CompanyDashboardOfferCard[] {
  return Object.freeze(
    read.offers.map((view) => {
      const title = offerTitle(view.offer.offerId, view.offer.classId),
        purchased = read.fleet.purchased.find((entry) => entry.offerId === view.offer.offerId),
        effectLabel =
          view.purchase === null
            ? `Adaugă un taxi ${classLabel(view.offer.classId)} în flota live.`
            : `Taxi ${classLabel(view.offer.classId)} adăugat la slotul ${view.purchase.slot}${
                purchased?.simulated === false ? ' (actor indisponibil)' : ''
              }.`,
        reasonLabel = offerReason(
          view.state,
          view.offer.requiredLevel,
          view.offer.costMinorUnits,
          read,
          view.purchase?.slot ?? null,
        ),
        costLabel = formatCompanyDashboardMoney(view.offer.costMinorUnits, read.currency);
      return Object.freeze({
        key: `offer:${view.offer.offerId}`,
        offerId: view.offer.offerId,
        title,
        costMinorUnits: view.offer.costMinorUnits,
        costLabel,
        effectLabel,
        state: view.state,
        stateLabel: COMPANY_OFFER_STATE_LABELS[view.state],
        reasonLabel,
        blocked: view.state !== 'AVAILABLE',
        confirmationLabel: `Confirmă cumpărarea „${title}” pentru ${costLabel}. Efect: ${effectLabel}`,
      });
    }),
  );
}

function upgradeCards(read: CompanyEvolutionRead): readonly CompanyDashboardUpgradeCard[] {
  return Object.freeze(
    read.upgrades.map((view) => {
      const title = upgradeTitle(view.upgrade.upgradeId),
        categoryLabel = COMPANY_COST_CATEGORY_LABELS[view.upgrade.effect.category],
        reduction = reductionLabel(view.upgrade.effect.basisPoints),
        ownership = view.ownership,
        effectLabel =
          ownership === null
            ? `Reduce costul ${categoryLabel} cu ${reduction} de la începutul lunii simulate următoare.`
            : `Reduce costul ${categoryLabel} cu ${reduction} din ${ownership.effectiveFromPeriodId}.`,
        reasonLabel =
          view.state === 'AVAILABLE'
            ? null
            : view.state === 'OWNED'
              ? `Upgrade deținut; un al doilea upgrade este refuzat. Efect ${
                  view.effective ? 'activ' : 'programat'
                } din ${ownership?.effectiveFromPeriodId ?? COMPANY_DASHBOARD_TEXT.noData}.`
              : view.state === 'LEVEL_REQUIRED'
                ? `Nivel insuficient: cere nivelul ${view.upgrade.requiredLevel}, compania are nivelul ${read.companyLevel.level}.`
                : `Fonduri insuficiente: cost ${view.upgrade.costMinorUnits} ${read.currency}, cash ${read.cash.cashMinorUnits} ${read.currency}.`,
        costLabel = formatCompanyDashboardMoney(view.upgrade.costMinorUnits, read.currency),
        stateLabel =
          view.state === 'OWNED'
            ? view.effective
              ? 'Deținut · efect activ'
              : 'Deținut · efect programat'
            : COMPANY_OFFER_STATE_LABELS[view.state];
      return Object.freeze({
        key: `upgrade:${view.upgrade.upgradeId}`,
        upgradeId: view.upgrade.upgradeId,
        title,
        costMinorUnits: view.upgrade.costMinorUnits,
        costLabel,
        effectLabel,
        state: view.state,
        stateLabel,
        reasonLabel,
        blocked: view.state !== 'AVAILABLE',
        effective: view.effective,
        confirmationLabel: `Confirmă upgrade-ul „${title}” pentru ${costLabel}. Efect: ${effectLabel}`,
      });
    }),
  );
}

function pendingEffectViews(read: CompanyEvolutionRead): readonly CompanyDashboardEffectView[] {
  return Object.freeze(
    read.pendingEffects.map((effect) =>
      Object.freeze({
        key: `effect:${effect.category}:${effect.effectiveFromPeriodId}`,
        categoryLabel: COMPANY_COST_CATEGORY_LABELS[effect.category],
        reductionLabel: reductionLabel(effect.basisPoints),
        periodLabel: effect.effectiveFromPeriodId,
        upgrades: effect.upgradeIds.length,
      }),
    ),
  );
}

function refusalLabel(read: CompanyEvolutionRead): string {
  const entries = Object.entries(read.refusals.byReason).filter(([, count]) => count > 0);
  if (entries.length === 0) return 'Niciun refuz înregistrat.';
  const counts = entries
    .map(
      ([reason, count]) =>
        `${COMPANY_REFUSAL_LABELS[reason as CompanyEvolutionRefusalReason]} ${count}`,
    )
    .join(', ');
  return `Refuzuri ${read.refusals.total}: ${counts}.`;
}

function levelDetail(read: CompanyEvolutionRead): string {
  const level = read.companyLevel,
    next =
      level.nextThresholdMinorUnits === null
        ? 'nivel maxim atins'
        : `mai lipsesc ${level.toNextLevelMinorUnits} SDA până la nivelul ${level.level + 1}`;
  return `${level.level} / ${level.maxLevel} · ${level.reinvestedProfitMinorUnits} SDA reinvestiți · ${next}`;
}

function signatureOf(read: CompanyEvolutionRead): string {
  return JSON.stringify({
    tick: read.tick,
    currency: read.currency,
    totals: [
      read.finance.totals.revenueMinorUnits,
      read.finance.totals.netCostMinorUnits,
      read.finance.totals.profitMinorUnits,
      read.cash.cashMinorUnits,
      read.fleet.fleetValueMinorUnits,
      read.companyLevel.level,
      read.companyLevel.reinvestedProfitMinorUnits,
    ],
    months: read.finance.months.map((month) => [
      month.periodId,
      month.completeness,
      month.revenueMinorUnits,
      month.rideCostMinorUnits,
      month.fixedCostMinorUnits,
      month.adjustmentMinorUnits,
      month.totalCostMinorUnits,
      month.profitMinorUnits,
      month.terminalRides,
      month.costByCategory,
    ]),
    lastRide: read.finance.lastRide?.entryId ?? null,
    offers: read.offers.map((offer) => [offer.offer.offerId, offer.state]),
    upgrades: read.upgrades.map((upgrade) => [
      upgrade.upgrade.upgradeId,
      upgrade.state,
      upgrade.effective,
    ]),
    pendingEffects: read.pendingEffects.map((effect) => [
      effect.category,
      effect.basisPoints,
      effect.effectiveFromPeriodId,
    ]),
    refusals: [read.refusals.total, read.refusals.last?.reason ?? null],
  });
}

/** The closed empty view: no month, no chart point, no invented metric or fleet value. */
export function emptyCompanyDashboardView(currency = 'SDA'): CompanyDashboardView {
  return Object.freeze({
    version: COMPANY_DASHBOARD_UI_VERSION,
    tick: 0,
    currency,
    empty: true,
    noHistory: true,
    title: COMPANY_DASHBOARD_TEXT.title,
    description: COMPANY_DASHBOARD_TEXT.description,
    summary: COMPANY_DASHBOARD_TEXT.empty,
    metrics: Object.freeze({
      revenueMinorUnits: 0,
      costMinorUnits: 0,
      profitMinorUnits: 0,
      cashMinorUnits: 0,
      fleetValueMinorUnits: 0,
      companyLevel: 0,
      companyLevelMax: 0,
      reinvestedProfitMinorUnits: 0,
      toNextLevelMinorUnits: 0,
      revenueLabel: COMPANY_DASHBOARD_TEXT.noData,
      costLabel: COMPANY_DASHBOARD_TEXT.noData,
      profitLabel: COMPANY_DASHBOARD_TEXT.noData,
      cashLabel: COMPANY_DASHBOARD_TEXT.noData,
      fleetValueLabel: COMPANY_DASHBOARD_TEXT.noData,
      levelLabel: COMPANY_DASHBOARD_TEXT.noData,
      levelDetail: COMPANY_DASHBOARD_TEXT.empty,
      profitNegative: false,
    }),
    months: Object.freeze([]),
    chart: Object.freeze({
      key: 'MONTHS' as const,
      title: 'Revenue, costuri și profit pe lună simulată',
      unitLabel: currency,
      caption: COMPANY_DASHBOARD_TEXT.empty,
      state: 'NO_DATA' as const,
      groups: Object.freeze([]),
      summary: COMPANY_DASHBOARD_TEXT.empty,
    }),
    tables: Object.freeze([]),
    lastRide: null,
    offers: Object.freeze([]),
    upgrades: Object.freeze([]),
    pendingEffects: Object.freeze([]),
    refusalsLabel: COMPANY_DASHBOARD_TEXT.noData,
    historyScans: 0 as const,
    signature: JSON.stringify({ empty: true, currency }),
  });
}

/** Projects the 268/269 read model into the dashboard view; deterministic for identical input. */
export function projectCompanyDashboard(
  read: CompanyEvolutionRead,
  windowMonths = COMPANY_DASHBOARD_WINDOW_MONTHS,
): CompanyDashboardView {
  if (!Number.isSafeInteger(windowMonths) || windowMonths < 1 || windowMonths > 60)
    throw new Error('Company dashboard window is invalid');
  const currency = read.currency,
    months = monthWindow(read.finance.months, windowMonths),
    chart = monthChart(months),
    reportsInWindow = read.finance.months.filter((report) => {
      const index = monthIndexFromPeriodId(report.periodId);
      return index !== null && months.some((month) => month.index === index && month.hasData);
    }),
    metrics: CompanyDashboardMetricsView = Object.freeze({
      revenueMinorUnits: read.finance.totals.revenueMinorUnits,
      costMinorUnits: read.finance.totals.netCostMinorUnits,
      profitMinorUnits: read.finance.totals.profitMinorUnits,
      cashMinorUnits: read.cash.cashMinorUnits,
      fleetValueMinorUnits: read.fleet.fleetValueMinorUnits,
      companyLevel: read.companyLevel.level,
      companyLevelMax: read.companyLevel.maxLevel,
      reinvestedProfitMinorUnits: read.companyLevel.reinvestedProfitMinorUnits,
      toNextLevelMinorUnits: read.companyLevel.toNextLevelMinorUnits,
      revenueLabel: formatCompanyDashboardMoney(read.finance.totals.revenueMinorUnits, currency),
      costLabel: formatCompanyDashboardMoney(read.finance.totals.netCostMinorUnits, currency),
      profitLabel: formatCompanyDashboardMoney(read.finance.totals.profitMinorUnits, currency),
      cashLabel: formatCompanyDashboardMoney(read.cash.cashMinorUnits, currency),
      fleetValueLabel: formatCompanyDashboardMoney(read.fleet.fleetValueMinorUnits, currency),
      levelLabel: `${read.companyLevel.level} / ${read.companyLevel.maxLevel}`,
      levelDetail: levelDetail(read),
      profitNegative: read.finance.totals.profitMinorUnits < 0,
    }),
    summary = [
      `Nivel ${read.companyLevel.level} / ${read.companyLevel.maxLevel}.`,
      `Revenue ${metrics.revenueLabel}, costuri ${metrics.costLabel}, profit ${metrics.profitLabel}.`,
      `Cash ${metrics.cashLabel}, valoare flotă ${metrics.fleetValueLabel}.`,
      chart.summary,
    ].join(' ');
  return Object.freeze({
    version: COMPANY_DASHBOARD_UI_VERSION,
    tick: read.tick,
    currency,
    empty: false,
    noHistory: months.length === 0,
    title: COMPANY_DASHBOARD_TEXT.title,
    description: COMPANY_DASHBOARD_TEXT.description,
    summary,
    metrics,
    months,
    chart,
    tables: Object.freeze([
      monthlyTable(months, currency),
      costBreakdownTable(reportsInWindow, months, currency),
    ]),
    lastRide: rideView(read, currency),
    offers: offerCards(read),
    upgrades: upgradeCards(read),
    pendingEffects: pendingEffectViews(read),
    refusalsLabel: refusalLabel(read),
    historyScans: 0 as const,
    signature: signatureOf(read),
  });
}
