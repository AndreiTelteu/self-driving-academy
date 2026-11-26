import type {
  LiveRideAssignmentView,
  LiveRideLifecycleRideView,
  LiveRideLifecycleSnapshot,
  LiveRideReleaseCause,
  LiveRideRequestView,
  LiveRideSnapshot,
} from '../fleet';
import type { PassengerVisualFrame } from './passenger-visual-format';
import { formatDistanceM, formatDuration, formatEtaRange, rideStageView } from './taxi-hud-format';

export const LIVE_RIDES_PANEL_VERSION = '265-live-rides-panel-v1' as const;
/** The read model refreshes at 10 Hz, like the 263 fleet panel; a closed panel writes nothing. */
export const LIVE_RIDES_PANEL_REFRESH_HZ = 10 as const;

export interface LiveRidesPanelOptions {
  readonly onClose: () => void;
  readonly now?: () => number;
  /** Tests disable the injected style; production leaves it enabled. */
  readonly style?: boolean;
}

export interface LiveRidesPanelStats {
  readonly version: typeof LIVE_RIDES_PANEL_VERSION;
  readonly disposed: boolean;
  readonly open: boolean;
  readonly requests: number;
  readonly assignments: number;
  readonly rides: number;
  readonly activeRides: number;
  readonly terminalRides: number;
  readonly passengerMarkers: number;
  readonly createdRequestRows: number;
  readonly createdAssignmentRows: number;
  readonly createdRideRows: number;
  readonly writes: number;
  readonly skipped: number;
  readonly updates: number;
  readonly closes: number;
  readonly listeners: number;
  readonly globalListeners: 0;
  readonly focusables: number;
}

export interface LiveRidesPanel {
  readonly version: typeof LIVE_RIDES_PANEL_VERSION;
  readonly root: HTMLElement;
  /**
   * The 264 live queue/assignments plus the optional 265 lifecycle read model and 147 passenger
   * frames. The two extra arguments are optional so the 264 panel contract stays usable alone.
   */
  update(
    snapshot: LiveRideSnapshot,
    nowMs: number,
    rides?: LiveRideLifecycleSnapshot,
    passenger?: Readonly<Record<string, PassengerVisualFrame>>,
  ): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  getStats(): LiveRidesPanelStats;
  dispose(): void;
}

const TITLE_ID = 'live-rides-title';
const DESCRIPTION_ID = 'live-rides-description';

const STYLE_TEXT = `
.live-rides { position: fixed; inset: 4.2rem 1rem 1rem 1rem; z-index: 36; display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 0.55rem; padding: 0.9rem 1rem;
  background: #0b1a16; color: #f3f7fb; border: 1px solid #3d6b58; border-radius: 0.6rem;
  box-shadow: 0 1rem 2.4rem rgba(0, 0, 0, 0.5); overflow: hidden;
  font: 0.82rem/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.live-rides[hidden] { display: none; }
.live-rides__header { display: flex; align-items: baseline; gap: 0.7rem; }
.live-rides__header h2 { margin: 0; font-size: 1.05rem; }
.live-rides__count { color: #9fe0c5; }
.live-rides__close { margin-left: auto; }
.live-rides button { font: inherit; color: #f3f7fb; background: #17352b;
  border: 1px solid #3d6b58; border-radius: 0.35rem; padding: 0.3rem 0.55rem; cursor: pointer; }
.live-rides button:hover { background: #22503f; }
.live-rides button:focus-visible { outline: 3px solid #9fe0c5; outline-offset: 2px; }
.live-rides__summary { margin: 0; color: #c6dbd1; }
.live-rides__body { display: grid; grid-template-rows: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr);
  gap: 0.6rem; min-height: 0; }
.live-rides__section { display: flex; flex-direction: column; min-height: 0; gap: 0.25rem; }
.live-rides__section h3 { margin: 0; font-size: 0.9rem; color: #9fe0c5; }
.live-rides__scroll { overflow: auto; min-height: 0; border-top: 1px solid #234437; }
.live-rides__table { width: 100%; border-collapse: collapse; font-size: 0.76rem; }
.live-rides__table th, .live-rides__table td { text-align: left; padding: 0.22rem 0.35rem;
  border-bottom: 1px solid #234437; vertical-align: top; white-space: nowrap; }
.live-rides__table th { color: #9fe0c5; font-weight: 600; position: sticky; top: 0;
  background: #0b1a16; }
.live-rides__table tr[data-state="ASSIGNED"] td[data-live-cell="state"] { color: #ffd28a; }
.live-rides__table tr[data-state="PENDING"] td[data-live-cell="state"] { color: #9fe0c5; }
.live-rides__table tr[data-state="RELEASED"] td[data-live-cell="state"] { color: #ffb4a8; }
.live-rides__table tr[data-state^="REJECTED"] td[data-live-cell="state"] { color: #ffb4a8; }
.live-rides__table tr[data-state="SCHEDULED"] td[data-live-cell="state"] { color: #b9cfc5; }
.live-rides__empty { margin: 0.3rem 0; color: #b9cfc5; }
.live-rides__description { margin: 0; color: #b9cfc5; font-size: 0.76rem; }
`;

function focusQuietly(node: Element | null): boolean {
  if (node === null || typeof (node as HTMLElement).focus !== 'function') return false;
  (node as HTMLElement).focus();
  return true;
}

function formatCost(seconds: number | null): string {
  return seconds === null ? '—' : `${seconds.toFixed(1)} s`;
}

function releaseLabel(cause: LiveRideReleaseCause | null): string {
  switch (cause) {
    case null:
      return '';
    case 'PLAYER_TAKEOVER':
      return ' · preluat de jucător';
    case 'BLOCKED':
      return ' · blocat';
    case 'DAMAGED':
      return ' · avariat';
    case 'OFFLINE':
      return ' · offline';
    case 'SCENARIO_RESET':
      return ' · reset scenariu';
  }
}

function requestLabel(request: LiveRideRequestView): string {
  return `${request.windowId} · r${String(request.ordinal).padStart(2, '0')}`;
}

function requestStateLabel(request: LiveRideRequestView): string {
  switch (request.state) {
    case 'SCHEDULED':
      return `programată (tick ${request.spawnTick})`;
    case 'PENDING':
      return 'în coadă';
    case 'ASSIGNED':
      return 'alocată';
    case 'RELEASED':
      return `eliberată${releaseLabel(request.releaseCause)}`;
    case 'REJECTED_INVALID':
      return `respinsă (${request.validationStatus})`;
    case 'REJECTED_QUEUE':
      return 'respinsă (coadă plină)';
    case 'REJECTED_NO_ROUTE':
      return 'respinsă (fără rută)';
    case 'CONSUMED':
      return 'consumată fără urmă';
  }
}

function requestTaxiLabel(request: LiveRideRequestView): string {
  if (request.taxiId === null) return '—';
  return request.taxiSlot === null ? request.taxiId : `Taxi #${request.taxiSlot}`;
}

function assignmentTaxiLabel(assignment: LiveRideAssignmentView): string {
  return assignment.taxiSlot === null ? assignment.taxiId : `Taxi #${assignment.taxiSlot}`;
}

function rideTaxiLabel(ride: LiveRideLifecycleRideView): string {
  return ride.taxiSlot === null ? ride.taxiId : `Taxi #${ride.taxiSlot}`;
}

function ridePassengerLabel(
  ride: LiveRideLifecycleRideView,
  frame: PassengerVisualFrame | undefined,
): string {
  if (ride.terminal) return '—';
  if (frame === undefined)
    return ride.state === 'TO_DROPOFF' || ride.state === 'DROPOFF' ? 'la bord' : '—';
  return `${frame.labels.passenger} · ${frame.labels.occupancy}`;
}

function rideEtaLabel(ride: LiveRideLifecycleRideView): string {
  if (ride.terminal || ride.eta === null) return 'Fără estimare';
  const eta = ride.eta;
  switch (eta.status) {
    case 'ESTIMATED': {
      if (eta.etaSeconds === null) return 'Indisponibil';
      const range = formatEtaRange(eta.etaMinSeconds, eta.etaMaxSeconds);
      return range === '—'
        ? `~${formatDuration(eta.etaSeconds)}`
        : `~${formatDuration(eta.etaSeconds)} (${range})`;
    }
    case 'ARRIVED':
      return ride.state === 'PICKUP' ? 'La pasager' : 'La destinație';
    case 'UNAVAILABLE':
      return eta.reason === null ? 'Indisponibil' : `Indisponibil (${eta.reason})`;
  }
}

function rideProgressLabel(ride: LiveRideLifecycleRideView): string {
  if (ride.terminal) return ride.state === 'COMPLETED' ? '100% · 0 m' : '—';
  if (ride.eta === null) return '—';
  const fraction = ride.eta.progressFraction,
    remaining = ride.eta.remainingDistanceM;
  if (fraction === null && remaining === null) return '—';
  const percent =
      fraction === null ? null : `${Math.min(100, Math.max(0, Math.round(fraction * 100)))}%`,
    distance = formatDistanceM(remaining);
  if (percent === null) return distance;
  if (remaining === null) return percent;
  return `${percent} · ${distance}`;
}

function rideReasonLabel(ride: LiveRideLifecycleRideView): string {
  if (ride.terminal) return ride.reason ?? '—';
  if (ride.eta?.status === 'UNAVAILABLE') return ride.eta.reason ?? 'Indisponibil';
  return '—';
}

function rideStageLabel(ride: LiveRideLifecycleRideView): string {
  return rideStageView(ride.state, ride.pickupZoneId, ride.dropoffZoneId).stage;
}

interface Row {
  readonly row: HTMLTableRowElement;
  readonly cells: readonly HTMLTableCellElement[];
}

function createRow(doc: Document, cells: readonly string[]): Row {
  const row = doc.createElement('tr'),
    nodes: HTMLTableCellElement[] = [];
  for (const value of cells) {
    const cell = doc.createElement('td');
    cell.textContent = value;
    row.append(cell);
    nodes.push(cell);
  }
  return { row, cells: nodes };
}

/**
 * Read-only live rides panel (PBI 264). It renders the 059 queue and the 060 assignments from the
 * accepted live read model, but owns no demand, taxi or assignment state. It installs no
 * window/document listener and writes DOM only while open.
 */
export function createLiveRidesPanel(
  host: HTMLElement,
  options: LiveRidesPanelOptions,
): LiveRidesPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Live rides panel requires an owned document');
  if (typeof options.onClose !== 'function')
    throw new Error('Live rides panel requires an onClose port');
  const now = options.now ?? (() => performance.now());

  const root = doc.createElement('section');
  root.className = 'live-rides';
  root.setAttribute('data-live-rides', LIVE_RIDES_PANEL_VERSION);
  root.setAttribute('aria-labelledby', TITLE_ID);
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  root.hidden = true;

  const header = doc.createElement('header');
  header.className = 'live-rides__header';
  const title = doc.createElement('h2');
  title.id = TITLE_ID;
  title.textContent = 'Curse live · cereri și taxiuri alocate';
  const count = doc.createElement('span');
  count.className = 'live-rides__count';
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'live-rides__close';
  closeButton.textContent = 'Închide';
  closeButton.setAttribute('data-live-action', 'close');
  header.append(title, count, closeButton);

  const summary = doc.createElement('p');
  summary.className = 'live-rides__summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');

  const body = doc.createElement('div');
  body.className = 'live-rides__body';

  const requestsSection = doc.createElement('section');
  requestsSection.className = 'live-rides__section';
  const requestsHeading = doc.createElement('h3');
  requestsHeading.textContent = 'Cereri din scenariul live';
  const requestsScroll = doc.createElement('div');
  requestsScroll.className = 'live-rides__scroll';
  const requestsTable = doc.createElement('table');
  requestsTable.className = 'live-rides__table';
  const requestsCaption = doc.createElement('caption');
  requestsCaption.textContent = 'Cereri de cursă 059, în ordine stabilă după tick și ID';
  const requestsHead = doc.createElement('thead');
  const requestsHeadRow = doc.createElement('tr');
  for (const label of ['Cerere', 'Pickup → dropoff', 'Stare', 'Taxi', 'Pickup / cursă']) {
    const th = doc.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = label;
    requestsHeadRow.append(th);
  }
  requestsHead.append(requestsHeadRow);
  const requestsBody = doc.createElement('tbody');
  requestsTable.append(requestsCaption, requestsHead, requestsBody);
  requestsScroll.append(requestsTable);
  const requestsEmpty = doc.createElement('p');
  requestsEmpty.className = 'live-rides__empty';
  requestsEmpty.textContent = 'Nicio cerere încă; programul începe la tickul de spawn configurat.';
  requestsSection.append(requestsHeading, requestsScroll, requestsEmpty);

  const assignmentsSection = doc.createElement('section');
  assignmentsSection.className = 'live-rides__section';
  const assignmentsHeading = doc.createElement('h3');
  assignmentsHeading.textContent = 'Alocări active 060 (revendicări reale)';
  const assignmentsScroll = doc.createElement('div');
  assignmentsScroll.className = 'live-rides__scroll';
  const assignmentsTable = doc.createElement('table');
  assignmentsTable.className = 'live-rides__table';
  const assignmentsCaption = doc.createElement('caption');
  assignmentsCaption.textContent =
    'Taxiul și costurile reale 041 ale ambelor etape, replanificate la asignare';
  const assignmentsHead = doc.createElement('thead');
  const assignmentsHeadRow = doc.createElement('tr');
  for (const label of [
    'Taxi',
    'Cerere',
    'Pickup → dropoff',
    'Cost pickup',
    'Cost cursă',
    'Lane-uri',
  ]) {
    const th = doc.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = label;
    assignmentsHeadRow.append(th);
  }
  assignmentsHead.append(assignmentsHeadRow);
  const assignmentsBody = doc.createElement('tbody');
  assignmentsTable.append(assignmentsCaption, assignmentsHead, assignmentsBody);
  assignmentsScroll.append(assignmentsTable);
  const assignmentsEmpty = doc.createElement('p');
  assignmentsEmpty.className = 'live-rides__empty';
  assignmentsEmpty.textContent = 'Nicio alocare activă.';
  assignmentsSection.append(assignmentsHeading, assignmentsScroll, assignmentsEmpty);

  const ridesSection = doc.createElement('section');
  ridesSection.className = 'live-rides__section';
  const ridesHeading = doc.createElement('h3');
  ridesHeading.textContent = 'Curse 061 live (pickup → dropoff → pasager)';
  const ridesScroll = doc.createElement('div');
  ridesScroll.className = 'live-rides__scroll';
  const ridesTable = doc.createElement('table');
  ridesTable.className = 'live-rides__table';
  const ridesCaption = doc.createElement('caption');
  ridesCaption.textContent =
    'Cursa reală din revendicarea 060: etapa 061, pasagerul 147, ETA 064 și motivul terminal';
  const ridesHead = doc.createElement('thead');
  const ridesHeadRow = doc.createElement('tr');
  for (const label of [
    'Taxi',
    'Cerere',
    'Etapă',
    'Pickup → dropoff',
    'Pasager',
    'ETA',
    'Progres',
    'Motiv',
  ]) {
    const th = doc.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = label;
    ridesHeadRow.append(th);
  }
  ridesHead.append(ridesHeadRow);
  const ridesBody = doc.createElement('tbody');
  ridesTable.append(ridesCaption, ridesHead, ridesBody);
  ridesScroll.append(ridesTable);
  const ridesEmpty = doc.createElement('p');
  ridesEmpty.className = 'live-rides__empty';
  ridesEmpty.textContent = 'Nicio cursă activă sau încheiată încă.';
  ridesSection.append(ridesHeading, ridesScroll, ridesEmpty);

  body.append(requestsSection, assignmentsSection, ridesSection);

  const description = doc.createElement('p');
  description.className = 'live-rides__description';
  description.id = DESCRIPTION_ID;
  description.textContent =
    'Panoul citește programul 059, revendicările 060, cursele 061, pickup/dropoff 062–063, ETA 064 și pasagerul 147. Cererile apar determinist din scenariu; taxiurile blocate, avariate, offline sau conduse de jucător nu sunt propuse. Este read-only, iar shell-ul suspendă simularea cât timp este deschis în MANUAL, ca orice panou.';

  root.append(header, summary, body, description);
  host.append(root);

  let styleElement: HTMLElement | null = null;
  if (options.style !== false && doc.head) {
    styleElement = doc.createElement('style');
    styleElement.setAttribute('data-live-rides-style', LIVE_RIDES_PANEL_VERSION);
    styleElement.textContent = STYLE_TEXT;
    doc.head.append(styleElement);
  }

  const requestRows = new Map<string, Row>();
  const assignmentRows = new Map<string, Row>();
  const rideRows = new Map<string, Row>();
  let disposed = false,
    open = false,
    lastTick = -1,
    lastWrite = -Infinity,
    previousFocus: Element | null = null,
    writes = 0,
    skipped = 0,
    updates = 0,
    closes = 0,
    createdRequestRows = 0,
    createdAssignmentRows = 0,
    createdRideRows = 0,
    activeRides = 0,
    terminalRides = 0,
    passengerMarkers = 0,
    listeners = 0;

  const setText = (node: HTMLElement, value: string): void => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };
  const setAttribute = (node: HTMLElement, name: string, value: string): void => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };
  const writeCells = (nodes: Row, values: readonly string[]): void => {
    for (let index = 0; index < values.length; index += 1) {
      const cell = nodes.cells[index];
      if (cell !== undefined) setText(cell, values[index]!);
    }
  };

  const renderRequests = (requests: readonly LiveRideRequestView[]): void => {
    const wanted = new Set(requests.map((request) => request.requestId));
    for (const [requestId, nodes] of requestRows) {
      if (wanted.has(requestId)) continue;
      nodes.row.remove();
      requestRows.delete(requestId);
    }
    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index]!;
      let nodes = requestRows.get(request.requestId);
      if (nodes === undefined) {
        nodes = createRow(doc, ['', '', '', '', '']);
        nodes.cells[2]!.setAttribute('data-live-cell', 'state');
        requestRows.set(request.requestId, nodes);
        createdRequestRows += 1;
      }
      const currentChild = requestsBody.children[index] ?? null;
      if (currentChild !== nodes.row) requestsBody.insertBefore(nodes.row, currentChild);
      writeCells(nodes, [
        requestLabel(request),
        `${request.originZoneId} → ${request.destinationZoneId}`,
        requestStateLabel(request),
        requestTaxiLabel(request),
        `${formatCost(request.pickupCostSeconds)} / ${formatCost(request.tripCostSeconds)}`,
      ]);
      setAttribute(nodes.row, 'data-state', request.state);
      setAttribute(nodes.row, 'data-request-id', request.requestId);
    }
    requestsEmpty.hidden = requests.length > 0;
    requestsScroll.hidden = requests.length === 0;
  };

  const renderAssignments = (assignments: readonly LiveRideAssignmentView[]): void => {
    const wanted = new Set(assignments.map((assignment) => assignment.assignmentId));
    for (const [assignmentId, nodes] of assignmentRows) {
      if (wanted.has(assignmentId)) continue;
      nodes.row.remove();
      assignmentRows.delete(assignmentId);
    }
    for (let index = 0; index < assignments.length; index += 1) {
      const assignment = assignments[index]!;
      let nodes = assignmentRows.get(assignment.assignmentId);
      if (nodes === undefined) {
        nodes = createRow(doc, ['', '', '', '', '', '']);
        assignmentRows.set(assignment.assignmentId, nodes);
        createdAssignmentRows += 1;
      }
      const currentChild = assignmentsBody.children[index] ?? null;
      if (currentChild !== nodes.row) assignmentsBody.insertBefore(nodes.row, currentChild);
      writeCells(nodes, [
        assignmentTaxiLabel(assignment),
        `${assignment.requestId.slice(-10)}`,
        `${assignment.pickupZoneId} → ${assignment.dropoffZoneId}`,
        formatCost(assignment.pickupCostSeconds),
        formatCost(assignment.tripCostSeconds),
        `${assignment.pickupRouteLaneIds.length} + ${assignment.tripRouteLaneIds.length}`,
      ]);
      setAttribute(nodes.row, 'data-taxi-id', assignment.taxiId);
      setAttribute(nodes.row, 'data-assignment-id', assignment.assignmentId);
    }
    assignmentsEmpty.hidden = assignments.length > 0;
    assignmentsScroll.hidden = assignments.length === 0;
  };

  const renderRides = (
    rides: LiveRideLifecycleSnapshot | null,
    passenger: Readonly<Record<string, PassengerVisualFrame>>,
  ): void => {
    const rows = rides?.rides ?? [];
    const wanted = new Set(rows.map((ride) => ride.rideId));
    for (const [rideId, nodes] of rideRows) {
      if (wanted.has(rideId)) continue;
      nodes.row.remove();
      rideRows.delete(rideId);
    }
    activeRides = rides?.counts.active ?? 0;
    terminalRides = rides?.counts.terminals ?? 0;
    passengerMarkers = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const ride = rows[index]!;
      let nodes = rideRows.get(ride.rideId);
      if (nodes === undefined) {
        nodes = createRow(doc, ['', '', '', '', '', '', '', '']);
        rideRows.set(ride.rideId, nodes);
        createdRideRows += 1;
      }
      const frame = passenger[ride.rideId];
      passengerMarkers += frame?.markers.length ?? 0;
      const currentChild = ridesBody.children[index] ?? null;
      if (currentChild !== nodes.row) ridesBody.insertBefore(nodes.row, currentChild);
      writeCells(nodes, [
        rideTaxiLabel(ride),
        `${ride.requestId.slice(-10)}`,
        rideStageLabel(ride),
        `${ride.pickupZoneId} → ${ride.dropoffZoneId}`,
        ridePassengerLabel(ride, frame),
        rideEtaLabel(ride),
        rideProgressLabel(ride),
        rideReasonLabel(ride),
      ]);
      setAttribute(nodes.row, 'data-state', ride.state);
      setAttribute(nodes.row, 'data-ride-id', ride.rideId);
      setAttribute(nodes.row, 'data-terminal', String(ride.terminal));
    }
    ridesEmpty.hidden = rows.length > 0;
    ridesScroll.hidden = rows.length === 0;
  };

  const render = (
    snapshot: LiveRideSnapshot,
    rides: LiveRideLifecycleSnapshot | null,
    passenger: Readonly<Record<string, PassengerVisualFrame>>,
  ): void => {
    const counts = snapshot.counts,
      totals = snapshot.totals;
    setText(
      count,
      `${counts.pending} în coadă · ${counts.assigned} alocate · ${counts.availableTaxis} taxiuri libere`,
    );
    setText(
      summary,
      `Tick ${snapshot.tick} · cereri ${counts.valid}/${counts.requests} valide · ` +
        `coadă ${counts.pending}/${snapshot.queue.limit} (${snapshot.queue.policy}) · ` +
        `asignări ${totals.assignments} · eliberări ${totals.releases} · ` +
        `curse ${rides?.counts.active ?? 0} active / ${rides?.counts.terminals ?? 0} terminale · ` +
        `pasageri la bord ${rides?.counts.passengersOnBoard ?? 0} · ` +
        `căutări 041 ultimul pas ${totals.lastSearches}/${snapshot.queue.routeSearchBudget} ` +
        `(max ${totals.maxSearchesPerStep}) · pas la ${snapshot.queue.dispatchEveryTicks} tick-uri`,
    );
    renderRequests(snapshot.requests);
    renderAssignments(snapshot.assignments);
    renderRides(rides, passenger);
    setAttribute(root, 'data-tick', String(snapshot.tick));
    setAttribute(root, 'data-ride-count', String(rideRows.size));
    updates += 1;
  };

  const update = (
    snapshot: LiveRideSnapshot,
    nowMs: number,
    rides?: LiveRideLifecycleSnapshot,
    passenger?: Readonly<Record<string, PassengerVisualFrame>>,
  ): void => {
    if (disposed) return;
    if (!Number.isFinite(nowMs)) throw new Error('Live rides panel clock');
    const atTick = snapshot?.tick;
    if (!Number.isSafeInteger(atTick) || atTick < 0) throw new Error('Live rides panel tick');
    if (lastTick >= 0 && atTick < lastTick) throw new Error('Stale live rides frame');
    if (rides !== undefined) {
      if (!Number.isSafeInteger(rides.tick) || rides.tick < 0)
        throw new Error('Live rides ride tick');
      if (rides.tick !== atTick) throw new Error('Live rides ride tick mismatch');
    }
    lastTick = atTick;
    if (!Number.isFinite(nowMs)) throw new Error('Live rides panel clock');
    // A closed panel never writes; an open one refreshes at 10 Hz, not per frame.
    if (!open) {
      skipped += 1;
      return;
    }
    if (nowMs - lastWrite < 1000 / LIVE_RIDES_PANEL_REFRESH_HZ) {
      skipped += 1;
      return;
    }
    lastWrite = nowMs;
    render(snapshot, rides ?? null, passenger ?? {});
  };

  const openPanel = (): void => {
    if (disposed) throw new Error('Live rides panel is disposed.');
    if (open) return;
    open = true;
    previousFocus = doc.activeElement ?? null;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    lastWrite = now() - 1000 / LIVE_RIDES_PANEL_REFRESH_HZ;
    focusQuietly(closeButton);
  };
  const close = (): void => {
    if (!open) return;
    open = false;
    closes += 1;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.removeAttribute('role');
    root.removeAttribute('aria-modal');
    focusQuietly(previousFocus);
    previousFocus = null;
    options.onClose();
  };

  const onCloseClick = (): void => close();
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  };
  closeButton.addEventListener('click', onCloseClick);
  root.addEventListener('keydown', onKeyDown);
  listeners += 2;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');

  return Object.freeze({
    version: LIVE_RIDES_PANEL_VERSION,
    root,
    update,
    open: openPanel,
    close,
    isOpen: () => open,
    getStats: () =>
      Object.freeze({
        version: LIVE_RIDES_PANEL_VERSION,
        disposed,
        open,
        requests: requestRows.size,
        assignments: assignmentRows.size,
        rides: rideRows.size,
        activeRides,
        terminalRides,
        passengerMarkers,
        createdRequestRows,
        createdAssignmentRows,
        createdRideRows,
        writes,
        skipped,
        updates,
        closes,
        listeners: disposed ? 0 : listeners,
        globalListeners: 0 as const,
        focusables: open && !disposed ? 1 : 0,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      closeButton.removeEventListener('click', onCloseClick);
      root.removeEventListener('keydown', onKeyDown);
      for (const nodes of requestRows.values()) nodes.row.remove();
      requestRows.clear();
      for (const nodes of assignmentRows.values()) nodes.row.remove();
      assignmentRows.clear();
      for (const nodes of rideRows.values()) nodes.row.remove();
      rideRows.clear();
      styleElement?.remove();
      styleElement = null;
      listeners = 0;
      root.remove();
    },
  });
}
