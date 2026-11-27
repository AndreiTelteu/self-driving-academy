import type {
  FleetSelectionFilter,
  FleetSelectionRow,
  FleetSelectionSnapshot,
  FleetSelectionView,
} from './fleet-selection-format';
import type { MapSelectionSnapshot } from './map-selection-format';
import {
  FLEET_SELECTION_FILTERS,
  FLEET_SELECTION_FILTER_LABELS,
  FLEET_SELECTION_LIMITS,
  FLEET_SELECTION_VERSION,
  parseFleetSelectionSnapshot,
  projectFleetSelection,
} from './fleet-selection-format';
import type { MinimapContext, MinimapGeometry, MinimapScene } from './minimap-format';
import { createMinimapScene } from './minimap-format';
import { createMapSelectionOverlay } from './map-selection';

export interface FleetSelectionPanelSnapshot {
  readonly fleet: FleetSelectionSnapshot;
  readonly map: MapSelectionSnapshot;
}

export interface FleetSelectionPanelOptions {
  readonly select: (vehicleId: string) => boolean | void;
  readonly takeover: (vehicleId: string) => boolean | void;
  /** PBI 271: explicit LEARNING takeover of the selected camera target. */
  readonly learning?: (vehicleId: string) => boolean | void;
  readonly release: () => boolean | void;
  readonly onClose: () => void;
  /** Static 032/033 geometry for the fleet map; the full 281 minimap remains separate. */
  readonly geometry?: MinimapGeometry;
  readonly mapWidthPx?: number;
  readonly mapHeightPx?: number;
  /** Test/renderer port for the map background; the browser default is the canvas 2D context. */
  readonly context?: MinimapContext;
  readonly filter?: FleetSelectionFilter;
  readonly now?: () => number;
  readonly style?: boolean;
}

export interface FleetSelectionPanelStats {
  readonly version: typeof FLEET_SELECTION_VERSION;
  readonly disposed: boolean;
  readonly open: boolean;
  readonly rows: number;
  readonly createdRows: number;
  readonly moves: number;
  readonly writes: number;
  readonly skipped: number;
  readonly updates: number;
  readonly tabTraps: number;
  readonly selects: number;
  readonly takeovers: number;
  readonly releases: number;
  readonly mapMarkers: number;
  readonly listeners: number;
  readonly globalListeners: 0;
  readonly focusables: number;
}

export interface FleetSelectionPanel {
  readonly version: typeof FLEET_SELECTION_VERSION;
  readonly root: HTMLElement;
  update(snapshot: FleetSelectionPanelSnapshot, nowMs: number): void;
  setFilter(filter: FleetSelectionFilter): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  getStats(): FleetSelectionPanelStats;
  dispose(): void;
}

interface RowNodes {
  readonly item: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly name: HTMLElement;
  readonly state: HTMLElement;
  readonly mode: HTMLElement;
  readonly ride: HTMLElement;
  readonly position: HTMLElement;
  readonly onClick: () => void;
}

const DESCRIPTION_ID = 'fleet-selection-description';
const MAP_LEGEND_ID = 'fleet-selection-map-legend';

const STYLE_TEXT = `
.fleet-selection { position: fixed; inset: 4.2rem 1rem 1rem 1rem; z-index: 34; display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 0.6rem; padding: 0.9rem 1rem;
  background: #0b1a16; color: #f3f7fb; border: 1px solid #3d6b58; border-radius: 0.6rem;
  box-shadow: 0 1rem 2.4rem rgba(0, 0, 0, 0.5); overflow: hidden;
  font: 0.82rem/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.fleet-selection[hidden] { display: none; }
.fleet-selection__header { display: flex; align-items: center; gap: 0.6rem; }
.fleet-selection__header h2 { margin: 0; font-size: 1.05rem; }
.fleet-selection__count { color: #9fe0c5; }
.fleet-selection__close { margin-left: auto; }
.fleet-selection button, .fleet-selection select { font: inherit; color: #f3f7fb;
  background: #17352b; border: 1px solid #3d6b58; border-radius: 0.35rem; padding: 0.3rem 0.55rem; }
.fleet-selection button:hover { background: #22503f; }
.fleet-selection button:focus-visible, .fleet-selection select:focus-visible {
  outline: 3px solid #9fe0c5; outline-offset: 2px; }
.fleet-selection button[aria-pressed="true"] { outline: 2px solid #9fe0c5; }
.fleet-selection button:disabled { color: #8aa197; background: #102a22; cursor: not-allowed; }
.fleet-selection__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; }
.fleet-selection__status { margin: 0; color: #c6dbd1; }
.fleet-selection__body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
  gap: 0.8rem; min-height: 0; }
.fleet-selection__list { margin: 0; padding: 0; list-style: none; overflow: auto; min-height: 0;
  display: flex; flex-direction: column; gap: 0.3rem; }
.fleet-selection__row { margin: 0; }
.fleet-selection__row button { width: 100%; display: grid; grid-template-columns: 1fr auto auto;
  gap: 0.2rem 0.6rem; text-align: left; padding: 0.4rem 0.55rem; }
.fleet-selection__name { font-weight: 600; }
.fleet-selection__row[data-state="PLAYER"] .fleet-selection__state { color: #9fe0c5; }
.fleet-selection__row[data-state="BLOCKED"] .fleet-selection__state { color: #ffb4a8; }
.fleet-selection__row[data-state="IN_RIDE"] .fleet-selection__state { color: #ffd28a; }
.fleet-selection__meta { color: #b9cfc5; font-size: 0.76rem; }
.fleet-selection__map { display: flex; flex-direction: column; gap: 0.4rem; min-height: 0; }
.fleet-selection__map-frame { position: relative; width: 100%; aspect-ratio: 320 / 220;
  background: #10231d; border: 1px solid #2c4a3f; border-radius: 0.4rem; overflow: hidden; }
.fleet-selection__map-canvas { width: 100%; height: 100%; display: block; }
.fleet-selection__map-host { position: absolute; inset: 0; }
.fleet-selection__map-host .map-selection { position: absolute; inset: 0; }
.fleet-selection__map-host .map-selection__marker { position: absolute; transform: translate(-50%, -50%);
  width: 1.4rem; height: 1.4rem; min-width: 0; padding: 0; border-radius: 999px;
  border: 1px solid #9fe0c5; background: #17352b; color: #f3f7fb; font-weight: 700;
  line-height: 1.2rem; text-align: center; }
.fleet-selection__map-host .map-selection__marker[data-kind="CIVIL"] { border-radius: 0.25rem; }
.fleet-selection__map-host .map-selection__marker[aria-pressed="true"] {
  outline: 3px solid #9fe0c5; outline-offset: 2px; background: #2b624e; }
.fleet-selection__map-host .map-selection__marker[disabled] { opacity: 0.45; }
.fleet-selection__map-legend { margin: 0; color: #b9cfc5; font-size: 0.76rem; }
.fleet-selection__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.fleet-selection__notice { margin-left: auto; color: #ffd28a; }
.fleet-selection__description { margin: 0; color: #b9cfc5; font-size: 0.76rem; }
`;

function focusQuietly(node: Element | null): boolean {
  if (node === null || typeof (node as HTMLElement).focus !== 'function') return false;
  (node as HTMLElement).focus();
  return true;
}

function isDisabled(node: HTMLElement): boolean {
  return (node as HTMLButtonElement).disabled === true || node.hasAttribute('disabled');
}

function focusables(root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  const visit = (node: HTMLElement): void => {
    if (node.hidden) return;
    const tag = node.tagName.toLowerCase();
    if ((tag === 'button' || tag === 'select') && !isDisabled(node)) found.push(node);
    for (const child of node.children) visit(child as HTMLElement);
  };
  visit(root);
  return found;
}

function drawMapGround(context: MinimapContext, scene: MinimapScene): void {
  context.clearRect(0, 0, scene.transform.widthPx, scene.transform.heightPx);
  context.setLineDash([]);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const command of scene.staticCommands) {
    if (command.kind === 'area') {
      context.fillStyle = '#23302c';
      context.beginPath();
      command.points.forEach((point, index) =>
        index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
      );
      context.closePath();
      context.fill();
      continue;
    }
    context.strokeStyle = '#3d5a4f';
    context.lineWidth = Math.max(1, command.widthPx * 0.7);
    context.beginPath();
    command.points.forEach((point, index) =>
      index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y),
    );
    context.stroke();
  }
}

/**
 * PBI 263 live fleet panel. It lists every taxi and civilian of the composition, filters by
 * available / in ride / blocked, and offers the map's 076 markers. A row or marker click calls only
 * the injected `select` port (camera target); `takeover`/`release` are separate explicit actions.
 * Escape/Tab stay on the panel element; no window/document listener is installed.
 */
export function createFleetSelectionPanel(
  host: HTMLElement,
  options: FleetSelectionPanelOptions,
): FleetSelectionPanel {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Fleet selection panel requires an owned document');
  if (typeof options.select !== 'function' || typeof options.takeover !== 'function')
    throw new Error('Fleet selection panel requires select and takeover ports');
  if (typeof options.release !== 'function' || typeof options.onClose !== 'function')
    throw new Error('Fleet selection panel requires release and onClose ports');
  const now = options.now ?? (() => performance.now()),
    initialFilter = options.filter ?? 'ALL';
  if (!FLEET_SELECTION_FILTERS.includes(initialFilter)) throw new Error('Fleet selection filter');

  const root = doc.createElement('section');
  root.className = 'fleet-selection';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'fleet-selection-title');
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  root.hidden = true;
  root.setAttribute('data-fleet-selection', FLEET_SELECTION_VERSION);

  const header = doc.createElement('header');
  header.className = 'fleet-selection__header';
  const title = doc.createElement('h2');
  title.id = 'fleet-selection-title';
  title.textContent = 'Flotă · alege vehiculul';
  const count = doc.createElement('span');
  count.className = 'fleet-selection__count';
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'fleet-selection__close';
  closeButton.textContent = 'Închide';
  closeButton.setAttribute('data-fleet-action', 'close');
  header.append(title, count, closeButton);

  const controls = doc.createElement('div');
  controls.className = 'fleet-selection__controls';
  const filterLabel = doc.createElement('label');
  filterLabel.textContent = 'Filtru ';
  const filterSelect = doc.createElement('select');
  filterSelect.setAttribute('data-fleet-action', 'filter');
  filterSelect.setAttribute('aria-label', 'Filtru flotă');
  for (const filter of FLEET_SELECTION_FILTERS) {
    const option = doc.createElement('option');
    option.value = filter;
    option.textContent = FLEET_SELECTION_FILTER_LABELS[filter];
    filterSelect.append(option);
  }
  filterSelect.value = initialFilter;
  const status = doc.createElement('p');
  status.className = 'fleet-selection__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(filterLabel, filterSelect, status);

  const body = doc.createElement('div');
  body.className = 'fleet-selection__body';
  const list = doc.createElement('ul');
  list.className = 'fleet-selection__list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Taxiuri și mașini civile');
  const map = doc.createElement('div');
  map.className = 'fleet-selection__map';
  const mapFrame = doc.createElement('div');
  mapFrame.className = 'fleet-selection__map-frame';
  const canvas = doc.createElement('canvas');
  canvas.className = 'fleet-selection__map-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const mapHost = doc.createElement('div');
  mapHost.className = 'fleet-selection__map-host';
  mapFrame.append(canvas, mapHost);
  const mapLegend = doc.createElement('p');
  mapLegend.className = 'fleet-selection__map-legend';
  mapLegend.id = MAP_LEGEND_ID;
  mapLegend.textContent =
    'Harta flotei · T taxi · C civil · un click mută doar camera; preluarea este M.';
  map.append(mapFrame, mapLegend);
  body.append(list, map);

  const actions = doc.createElement('div');
  actions.className = 'fleet-selection__actions';
  const takeoverButton = doc.createElement('button');
  takeoverButton.type = 'button';
  takeoverButton.textContent = 'Preia controlul (M)';
  takeoverButton.setAttribute('data-fleet-action', 'takeover');
  const learningButton = doc.createElement('button');
  learningButton.type = 'button';
  learningButton.textContent = 'Preia · învățare (L)';
  learningButton.setAttribute('data-fleet-action', 'learning');
  if (typeof options.learning !== 'function') {
    learningButton.disabled = true;
    learningButton.setAttribute('aria-disabled', 'true');
    learningButton.title = 'LEARNING nu are portul live.';
  }
  const releaseButton = doc.createElement('button');
  releaseButton.type = 'button';
  releaseButton.textContent = 'Lasă AI-ul (AUTO)';
  releaseButton.setAttribute('data-fleet-action', 'release');
  const notice = doc.createElement('span');
  notice.className = 'fleet-selection__notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  actions.append(takeoverButton, learningButton, releaseButton, notice);

  const description = doc.createElement('p');
  description.className = 'fleet-selection__description';
  description.id = DESCRIPTION_ID;
  description.textContent =
    'Click sau Enter/Space pe un rând ori marker mută doar ținta camerei. Vehiculul rămâne în AUTO până la M explicit; preluarea eliberează vehiculul vechi în AUTO cu ruta păstrată. Panoul suspendă simularea doar în MANUAL/LEARNING; Escape îl închide.';

  root.append(header, controls, body, actions, description);
  host.append(root);

  let styleElement: HTMLElement | null = null;
  if (options.style !== false && doc.head) {
    styleElement = doc.createElement('style');
    styleElement.setAttribute('data-fleet-selection-style', FLEET_SELECTION_VERSION);
    styleElement.textContent = STYLE_TEXT;
    doc.head.append(styleElement);
  }

  const scene =
    options.geometry === undefined
      ? null
      : createMinimapScene(options.geometry, {
          widthPx: options.mapWidthPx ?? 320,
          heightPx: options.mapHeightPx ?? 220,
          paddingPx: 12,
        });
  let mapOverlay: ReturnType<typeof createMapSelectionOverlay> | null = null;
  let context: MinimapContext | null = options.context ?? null;
  if (scene !== null) {
    canvas.width = scene.transform.widthPx;
    canvas.height = scene.transform.heightPx;
    canvas.setAttribute('width', String(scene.transform.widthPx));
    canvas.setAttribute('height', String(scene.transform.heightPx));
    if (context === null) {
      const native = canvas.getContext?.('2d') ?? null;
      context = native as unknown as MinimapContext | null;
    }
    if (context !== null) drawMapGround(context, scene);
    mapOverlay = createMapSelectionOverlay(mapHost, scene.transform, {
      select: (vehicleId) => select(vehicleId),
    });
  } else {
    mapFrame.hidden = true;
    mapLegend.hidden = true;
  }

  const rows = new Map<string, RowNodes>();
  let disposed = false,
    busy = false,
    opened = false,
    filter: FleetSelectionFilter = initialFilter,
    current: FleetSelectionPanelSnapshot | null = null,
    view: FleetSelectionView | null = null,
    previousFocus: Element | null = null,
    lastSignature = '',
    lastTick = -1,
    lastWrite = -Infinity,
    createdRows = 0,
    moves = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    tabTraps = 0,
    selects = 0,
    takeovers = 0,
    releases = 0,
    listeners = 0;

  const mutate = (action: () => void): void => {
    if (busy) throw new Error('Fleet selection panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
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
  const select = (vehicleId: string): void => {
    if (disposed) return;
    selects += 1;
    const accepted = options.select(vehicleId) !== false;
    notice.textContent = accepted
      ? 'Camera s-a mutat. M preia controlul.'
      : 'Selectarea a fost refuzată.';
    if (accepted) {
      mapOverlay?.setFollowed(vehicleId);
      // Camera selection is immediate even when the simulation is suspended in MANUAL. This is a
      // presentation-only projection of the accepted command; the next authoritative frame wins.
      if (current !== null) {
        const optimistic: FleetSelectionSnapshot = Object.freeze({
          ...current.fleet,
          selectedVehicleId: vehicleId,
        });
        render(projectFleetSelection(optimistic, { filter }));
      }
    }
  };
  const createRow = (row: FleetSelectionRow): RowNodes => {
    const item = doc.createElement('li'),
      button = doc.createElement('button'),
      name = doc.createElement('span'),
      state = doc.createElement('span'),
      mode = doc.createElement('span'),
      ride = doc.createElement('span'),
      position = doc.createElement('span'),
      onClick = () => select(row.vehicleId);
    item.className = 'fleet-selection__row';
    item.setAttribute('role', 'presentation');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('data-vehicle-id', row.vehicleId);
    name.className = 'fleet-selection__name';
    state.className = 'fleet-selection__state';
    mode.className = 'fleet-selection__meta fleet-selection__mode';
    ride.className = 'fleet-selection__meta fleet-selection__ride';
    position.className = 'fleet-selection__meta fleet-selection__position';
    button.append(name, state, mode, ride, position);
    button.addEventListener('click', onClick);
    listeners += 1;
    createdRows += 1;
    item.append(button);
    return { item, button, name, state, mode, ride, position, onClick };
  };
  const renderRow = (nodes: RowNodes, row: FleetSelectionRow): void => {
    setText(nodes.name, `${row.label} · ${row.kindLabel}`);
    setText(nodes.state, row.stateLabel);
    setText(nodes.mode, `Mod ${row.modeSymbol} ${row.modeLabel}`);
    setText(nodes.ride, row.rideLabel);
    setText(nodes.position, row.positionLabel);
    setAttribute(nodes.button, 'aria-label', row.description);
    setAttribute(nodes.button, 'aria-selected', row.selected ? 'true' : 'false');
    setAttribute(nodes.button, 'aria-pressed', row.selected ? 'true' : 'false');
    setAttribute(nodes.button, 'data-state', row.state);
    setAttribute(nodes.button, 'data-kind', row.kind);
    setAttribute(nodes.button, 'data-selected', row.selected ? 'true' : 'false');
    setAttribute(nodes.button, 'data-player', row.playerControlled ? 'true' : 'false');
    setAttribute(nodes.item, 'data-state', row.state);
  };
  const render = (next: FleetSelectionView): void => {
    const wanted = new Set(next.rows.map((row) => row.rowId));
    for (const [rowId, nodes] of rows) {
      if (wanted.has(rowId)) continue;
      nodes.button.removeEventListener('click', nodes.onClick);
      listeners -= 1;
      nodes.item.remove();
      rows.delete(rowId);
    }
    for (let index = 0; index < next.rows.length; index += 1) {
      const row = next.rows[index]!;
      let nodes = rows.get(row.rowId);
      if (nodes === undefined) {
        nodes = createRow(row);
        rows.set(row.rowId, nodes);
      }
      const currentChild = list.children[index] ?? null;
      if (currentChild !== nodes.item) {
        list.insertBefore(nodes.item, currentChild);
        moves += 1;
      }
      renderRow(nodes, row);
    }
    setText(count, next.summary);
    setText(status, next.summary);
    const selected = next.rows.find((row) => row.selected) ?? null;
    const player = next.rows.find((row) => row.playerControlled) ?? null;
    takeoverButton.disabled = selected === null || selected.playerControlled;
    learningButton.disabled =
      typeof options.learning !== 'function' || selected === null || selected.playerControlled;
    releaseButton.disabled = player === null;
    setAttribute(
      takeoverButton,
      'aria-label',
      selected === null
        ? 'Preia controlul: selectează întâi un vehicul'
        : `Preia controlul asupra ${selected.label}`,
    );
    setAttribute(
      releaseButton,
      'aria-label',
      player === null ? 'Niciun vehicul condus' : `Lasă ${player.label} în AUTO`,
    );
    lastSignature = next.signature;
    view = next;
    updates += 1;
  };

  const update = (snapshot: FleetSelectionPanelSnapshot, nowMs: number): void => {
    mutate(() => {
      if (disposed) return;
      if (!Number.isFinite(nowMs)) throw new Error('Fleet selection clock');
      const fleet = parseFleetSelectionSnapshot(snapshot?.fleet);
      if (lastTick >= 0 && fleet.tick < lastTick) throw new Error('Stale fleet selection frame');
      lastTick = fleet.tick;
      const previous = current?.fleet ?? null;
      current = snapshot;
      const headerChanged =
        previous === null ||
        previous.selectedVehicleId !== fleet.selectedVehicleId ||
        previous.playerVehicleId !== fleet.playerVehicleId;
      const rateElapsed = nowMs - lastWrite >= 1000 / FLEET_SELECTION_LIMITS.maximumHz;
      // The expensive projection runs at 10 Hz; a camera/PLAYER change bypasses the ceiling so the
      // explicit selection feedback is immediate even when the world is suspended.
      if (!headerChanged && !rateElapsed) {
        skipped += 1;
        return;
      }
      // The 076 overlay owns its own marker identity; feeding it at the same ceiling keeps moving
      // cars current without a per-frame projection.
      mapOverlay?.update(snapshot.map, nowMs);
      lastWrite = nowMs;
      const next = projectFleetSelection(fleet, { filter }),
        selectionChanged = headerChanged || view === null;
      if (!selectionChanged && next.signature === lastSignature) {
        skipped += 1;
        return;
      }
      render(next);
    });
  };

  const setFilter = (nextFilter: FleetSelectionFilter): void => {
    if (disposed) return;
    if (!FLEET_SELECTION_FILTERS.includes(nextFilter)) throw new Error('Fleet selection filter');
    if (filter === nextFilter) return;
    filter = nextFilter;
    filterSelect.value = nextFilter;
    if (current !== null) {
      const next = projectFleetSelection(current.fleet, { filter });
      lastWrite = now();
      render(next);
    }
  };

  const open = (): void => {
    if (disposed) throw new Error('Fleet selection panel is disposed.');
    if (opened) return;
    opened = true;
    previousFocus = doc.activeElement ?? null;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    if (current !== null) {
      const next = projectFleetSelection(current.fleet, { filter });
      render(next);
    }
    focusQuietly(filterSelect);
    if (doc.activeElement === filterSelect) return;
    const first = focusables(root)[0] ?? null;
    focusQuietly(first);
  };
  const close = (): void => {
    if (!opened) return;
    opened = false;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.removeAttribute('role');
    root.removeAttribute('aria-modal');
    if (focusQuietly(previousFocus)) {
      // restored
    }
    previousFocus = null;
    options.onClose();
  };

  const onFilterChange = (): void => setFilter(filterSelect.value as FleetSelectionFilter);
  const onCloseClick = (): void => close();
  const onTakeover = (): void => {
    const selected = view?.rows.find((row) => row.selected);
    if (selected === undefined) {
      notice.textContent = 'Selectează întâi un vehicul.';
      return;
    }
    takeovers += 1;
    const accepted = options.takeover(selected.vehicleId) !== false;
    notice.textContent = accepted
      ? `Preluare cerută pentru ${selected.label}; se aplică la următorul tick.`
      : `Preluarea ${selected.label} a fost refuzată.`;
    // A takeover is explicit: close the panel so a suspended MANUAL world resumes and the command is
    // applied on the next tick. A synchronous refusal keeps the panel open with its reason.
    if (accepted) close();
  };
  const onLearning = (): void => {
    if (typeof options.learning !== 'function') return;
    const selected = view?.rows.find((row) => row.selected);
    if (selected === undefined) {
      notice.textContent = 'Selectează întâi un vehicul.';
      return;
    }
    const accepted = options.learning(selected.vehicleId) !== false;
    notice.textContent = accepted
      ? `Learning cerut pentru ${selected.label}; se aplică la următorul tick.`
      : `Learning pentru ${selected.label} a fost refuzat.`;
    if (accepted) close();
  };
  const onRelease = (): void => {
    releases += 1;
    const accepted = options.release() !== false;
    notice.textContent = accepted
      ? 'Vehiculul revine în AUTO cu ruta păstrată.'
      : 'Niciun vehicul condus nu poate fi eliberat.';
    if (accepted) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    tabTraps += 1;
    const items = focusables(root);
    if (items.length === 0) return;
    const active = doc.activeElement;
    const currentIndex = active === null ? -1 : items.indexOf(active as HTMLElement);
    const direction = event.shiftKey ? -1 : 1;
    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : items.length - 1
        : (currentIndex + direction + items.length) % items.length;
    focusQuietly(items[nextIndex]!);
  };

  filterSelect.addEventListener('change', onFilterChange);
  closeButton.addEventListener('click', onCloseClick);
  takeoverButton.addEventListener('click', onTakeover);
  learningButton.addEventListener('click', onLearning);
  releaseButton.addEventListener('click', onRelease);
  root.addEventListener('keydown', onKeyDown);
  listeners += 5;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.removeAttribute('role');
  root.removeAttribute('aria-modal');

  return Object.freeze({
    version: FLEET_SELECTION_VERSION,
    root,
    update,
    setFilter,
    open,
    close,
    isOpen: () => opened,
    getStats: () =>
      Object.freeze({
        version: FLEET_SELECTION_VERSION,
        disposed,
        open: opened,
        rows: rows.size,
        createdRows,
        moves,
        writes,
        skipped,
        updates,
        tabTraps,
        selects,
        takeovers,
        releases,
        mapMarkers: mapOverlay?.getStats().markers ?? 0,
        listeners: disposed ? 0 : listeners,
        globalListeners: 0 as const,
        focusables: opened && !disposed ? focusables(root).length : 0,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      filterSelect.removeEventListener('change', onFilterChange);
      closeButton.removeEventListener('click', onCloseClick);
      takeoverButton.removeEventListener('click', onTakeover);
      learningButton.removeEventListener('click', onLearning);
      releaseButton.removeEventListener('click', onRelease);
      root.removeEventListener('keydown', onKeyDown);
      for (const nodes of rows.values()) {
        nodes.button.removeEventListener('click', nodes.onClick);
        nodes.item.remove();
      }
      rows.clear();
      mapOverlay?.dispose();
      mapOverlay = null;
      styleElement?.remove();
      styleElement = null;
      listeners = 0;
      view = null;
      current = null;
      root.remove();
    },
  });
}
