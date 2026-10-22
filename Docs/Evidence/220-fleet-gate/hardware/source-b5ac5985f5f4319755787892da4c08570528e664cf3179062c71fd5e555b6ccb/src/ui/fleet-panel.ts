import type {
  FleetPanelFilter,
  FleetPanelRow,
  FleetPanelSnapshot,
  FleetPanelSort,
  FleetPanelView,
} from './fleet-panel-format';
import {
  FLEET_PANEL_FILTERS,
  FLEET_PANEL_FILTER_LABELS,
  FLEET_PANEL_LIMITS,
  FLEET_PANEL_SORTS,
  FLEET_PANEL_SORT_LABELS,
  FLEET_PANEL_VERSION,
  fleetPanelBlockedSignature,
  parseFleetPanelSnapshot,
  projectFleetPanel,
} from './fleet-panel-format';

export interface FleetPanelOptions {
  /** Row write/reorder ceiling. Defaults to 10 Hz; never tied to the tick rate. */
  readonly maximumHz?: number;
  /** Selection intent port. The panel never moves, switches or takes over a vehicle itself. */
  readonly select?: (vehicleId: string) => void;
  readonly filter?: FleetPanelFilter;
  readonly sort?: FleetPanelSort;
  /** Build the panel closed; `open()` renders the retained view without rebuilding rows. */
  readonly open?: boolean;
}

interface RowNodes {
  readonly item: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly slot: HTMLElement;
  readonly state: HTMLElement;
  readonly mode: HTMLElement;
  readonly ride: HTMLElement;
  readonly eta: HTMLElement;
  readonly profile: HTMLElement;
  readonly onClick: () => void;
  mounted: boolean;
}

/** Leaf text nodes owned by one row; kept explicit for the bounded `textNodes` statistic. */
const ROW_TEXT_NODES = 6;
/** Elements owned by one row: `li` + `button` + six `span`s. */
const ROW_ELEMENTS = 8;

const DESCRIPTION_ID = 'fleet-panel-description';

/**
 * 075 fleet panel adapter. It builds the DOM once, keeps one row element per vehicle identity and
 * reuses/moves those elements when filters and sorting change. It does not create, move or take over
 * a vehicle: a click only emits the injected selection intent. No global key listener is installed,
 * so driving keys keep working while the panel is open.
 */
export function createFleetPanel(host: HTMLElement, options: FleetPanelOptions = {}) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Fleet panel requires an owned document');
  const maximumHz = options.maximumHz ?? FLEET_PANEL_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Fleet panel write rate');
  const initialFilter = options.filter ?? 'ALL',
    initialSort = options.sort ?? 'SLOT';
  if (!FLEET_PANEL_FILTERS.includes(initialFilter)) throw new Error('Fleet panel filter');
  if (!FLEET_PANEL_SORTS.includes(initialSort)) throw new Error('Fleet panel sort');
  const interval = 1000 / maximumHz;
  let elementCount = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const leaf = (tag: 'span' | 'th' | 'td', text: string): HTMLElement => {
    const node = element(tag);
    node.textContent = text;
    return node;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    countValue = element('span'),
    controls = element('div'),
    filterLabel = element('label'),
    filterCaption = element('span'),
    filterSelect = element('select'),
    sortLabel = element('label'),
    sortCaption = element('span'),
    sortSelect = element('select'),
    list = element('ul'),
    status = element('p'),
    description = element('p');
  title.textContent = 'Taxiuri';
  filterCaption.textContent = 'Filtru';
  sortCaption.textContent = 'Sortare';
  const filterOptions: HTMLOptionElement[] = [],
    sortOptions: HTMLOptionElement[] = [];
  for (const filter of FLEET_PANEL_FILTERS) {
    const option = element('option');
    option.value = filter;
    option.textContent = FLEET_PANEL_FILTER_LABELS[filter];
    filterOptions.push(option);
    filterSelect.append(option);
  }
  for (const sort of FLEET_PANEL_SORTS) {
    const option = element('option');
    option.value = sort;
    option.textContent = FLEET_PANEL_SORT_LABELS[sort];
    sortOptions.push(option);
    sortSelect.append(option);
  }
  filterSelect.value = initialFilter;
  sortSelect.value = initialSort;
  root.className = 'fleet-panel';
  root.setAttribute('aria-label', 'Lista taxiurilor');
  header.className = 'fleet-panel__header';
  title.className = 'fleet-panel__title';
  countValue.className = 'fleet-panel__count';
  controls.className = 'fleet-panel__controls';
  filterLabel.className = 'fleet-panel__control';
  filterCaption.className = 'fleet-panel__caption';
  filterSelect.className = 'fleet-panel__filter';
  sortLabel.className = 'fleet-panel__control';
  sortCaption.className = 'fleet-panel__caption';
  sortSelect.className = 'fleet-panel__sort';
  list.className = 'fleet-panel__rows';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Taxiuri');
  status.className = 'fleet-panel__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  description.className = 'fleet-panel__description';
  description.id = DESCRIPTION_ID;
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  filterLabel.append(filterCaption, filterSelect);
  sortLabel.append(sortCaption, sortSelect);
  header.append(title, countValue);
  controls.append(filterLabel, sortLabel);
  root.append(header, controls, list, status, description);
  host.append(root);
  const baseElements = elementCount,
    chromeText: readonly HTMLElement[] = [
      title,
      countValue,
      filterCaption,
      ...filterOptions,
      sortCaption,
      ...sortOptions,
      status,
      description,
    ];

  const rows = new Map<string, RowNodes>();
  let disposed = false,
    busy = false,
    emitting = false,
    opened = options.open === true,
    filter: FleetPanelFilter = initialFilter,
    sort: FleetPanelSort = initialSort,
    current: FleetPanelSnapshot | null = null,
    view: FleetPanelView | null = null,
    lastSignature = '',
    lastBlockedSignature = '',
    lastClock = -Infinity,
    lastWrite = -Infinity,
    createdRows = 0,
    attaches = 0,
    moves = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0,
    listeners = 0;
  if (opened) root.removeAttribute('hidden');
  else root.setAttribute('hidden', '');

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Fleet panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Fleet panel disposed');
  };
  const set = (node: HTMLElement, value: string) => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };
  const emit = (vehicleId: string) => {
    if (disposed || emitting || options.select === undefined) return;
    emitting = true;
    try {
      options.select(vehicleId);
    } finally {
      emitting = false;
    }
  };
  const createRow = (vehicleId: string): RowNodes => {
    const item = element('li'),
      button = element('button'),
      slot = leaf('span', ''),
      state = leaf('span', ''),
      mode = leaf('span', ''),
      ride = leaf('span', ''),
      eta = leaf('span', ''),
      profile = leaf('span', '');
    item.className = 'fleet-panel__item';
    item.setAttribute('role', 'presentation');
    item.setAttribute('data-vehicle-id', vehicleId);
    button.className = 'fleet-panel__row';
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'option');
    button.setAttribute('data-vehicle-id', vehicleId);
    button.setAttribute('aria-selected', 'false');
    slot.className = 'fleet-panel__slot';
    state.className = 'fleet-panel__state';
    mode.className = 'fleet-panel__mode';
    ride.className = 'fleet-panel__ride';
    eta.className = 'fleet-panel__eta';
    profile.className = 'fleet-panel__profile';
    button.append(slot, state, mode, ride, eta, profile);
    item.append(button);
    const onClick = () => emit(vehicleId);
    button.addEventListener('click', onClick);
    listeners += 1;
    createdRows += 1;
    return {
      item,
      button,
      slot,
      state,
      mode,
      ride,
      eta,
      profile,
      onClick,
      mounted: false,
    };
  };
  const renderRow = (nodes: RowNodes, row: FleetPanelRow) => {
    set(nodes.slot, row.slotLabel);
    set(nodes.state, row.stateLabel);
    set(nodes.mode, `${row.modeSymbol} · ${row.modeLabel}`);
    set(nodes.ride, row.rideLabel);
    set(nodes.eta, row.etaLabel);
    set(nodes.profile, row.profileLabel);
    attribute(nodes.button, 'aria-label', row.description);
    attribute(nodes.button, 'aria-selected', row.followed ? 'true' : 'false');
    attribute(nodes.item, 'data-state', row.state);
    attribute(nodes.item, 'data-blocked', row.blocked ? 'true' : 'false');
    attribute(nodes.item, 'data-followed', row.followed ? 'true' : 'false');
    attribute(nodes.item, 'data-pinned', row.pinned ? 'true' : 'false');
  };
  const describe = (projected: FleetPanelView): string => {
    const followed = projected.rows.find((row) => row.followed),
      blocked = projected.rows.find((row) => row.blocked);
    return [
      `Listă de taxiuri, filtru ${FLEET_PANEL_FILTER_LABELS[projected.filter]}, sortare ${FLEET_PANEL_SORT_LABELS[projected.sort]}.`,
      `${projected.counts.visible} din ${projected.counts.total} taxiuri afișate.`,
      projected.counts.pinned === 0
        ? 'Niciun rând nu este păstrat de filtru.'
        : `${projected.counts.pinned} ${projected.counts.pinned === 1 ? 'rând este păstrat' : 'rânduri sunt păstrate'} de filtru.`,
      followed === undefined
        ? 'Niciun taxi urmărit nu este în listă.'
        : `Taxiul urmărit este ${followed.slotLabel}.`,
      blocked === undefined
        ? 'Niciun taxi blocat nu este vizibil.'
        : `Un taxi blocat rămâne vizibil: ${blocked.slotLabel}.`,
      'Selectarea unui rând schimbă doar ținta camerei; vehiculul rămâne în AUTO până la preluarea explicită.',
    ].join(' ');
  };
  const render = (projected: FleetPanelView, snapshot: FleetPanelSnapshot) => {
    const snapshotIds = new Set(snapshot.taxis.map((taxi) => taxi.vehicleId)),
      visibleIds = new Set(projected.rows.map((row) => row.rowId));
    for (const [vehicleId, nodes] of rows) {
      if (snapshotIds.has(vehicleId)) continue;
      nodes.button.removeEventListener('click', nodes.onClick);
      listeners -= 1;
      nodes.item.remove();
      rows.delete(vehicleId);
    }
    for (const child of [...list.children]) {
      const vehicleId = child.getAttribute('data-vehicle-id') ?? '';
      if (visibleIds.has(vehicleId)) continue;
      child.remove();
      const detached = rows.get(vehicleId);
      if (detached !== undefined) detached.mounted = false;
    }
    for (let index = 0; index < projected.rows.length; index += 1) {
      const row = projected.rows[index]!;
      let nodes = rows.get(row.rowId);
      if (nodes === undefined) {
        nodes = createRow(row.rowId);
        rows.set(row.rowId, nodes);
      }
      const currentChild = list.children[index] ?? null,
        attached = nodes.mounted;
      if (currentChild !== nodes.item) {
        list.insertBefore(nodes.item, currentChild);
        if (attached) moves += 1;
        else attaches += 1;
      }
      nodes.mounted = true;
      renderRow(nodes, row);
    }
    attribute(root, 'data-filter', projected.filter);
    attribute(root, 'data-sort', projected.sort);
    attribute(root, 'data-open', opened ? 'true' : 'false');
    attribute(root, 'data-tick', String(snapshot.tick));
    attribute(root, 'data-visible', String(projected.counts.visible));
    attribute(root, 'data-total', String(projected.counts.total));
    attribute(root, 'data-followed', projected.followedTaxiId ?? '');
    attribute(
      root,
      'aria-label',
      `Lista taxiurilor · ${projected.counts.visible} din ${projected.counts.total} · ${FLEET_PANEL_FILTER_LABELS[projected.filter]}`,
    );
    set(
      countValue,
      `${projected.counts.visible} din ${projected.counts.total} taxiuri` +
        (projected.counts.pinned === 0
          ? ''
          : ` · ${projected.counts.pinned} ${projected.counts.pinned === 1 ? 'fixat' : 'fixate'}`),
    );
    set(status, projected.summary);
    set(description, describe(projected));
    view = projected;
    lastSignature = projected.signature;
    renders += 1;
  };
  const renderRetained = () => {
    if (current === null) return;
    const projected = projectFleetPanel(current, { filter, sort });
    if (projected.signature === lastSignature) {
      view = projected;
      return;
    }
    lastWrite = lastClock;
    render(projected, current);
  };
  const onFilterChange = () => {
    const value = filterSelect.value as FleetPanelFilter;
    if (disposed || !FLEET_PANEL_FILTERS.includes(value)) return;
    setFilter(value);
  };
  const onSortChange = () => {
    const value = sortSelect.value as FleetPanelSort;
    if (disposed || !FLEET_PANEL_SORTS.includes(value)) return;
    setSort(value);
  };
  filterSelect.addEventListener('change', onFilterChange);
  sortSelect.addEventListener('change', onSortChange);
  listeners += 2;

  function setFilter(next: FleetPanelFilter) {
    mutate(() => {
      assertLive();
      if (!FLEET_PANEL_FILTERS.includes(next)) throw new Error('Fleet panel filter');
      if (filter === next) return;
      filter = next;
      filterSelect.value = next;
      renderRetained();
    });
  }

  function setSort(next: FleetPanelSort) {
    mutate(() => {
      assertLive();
      if (!FLEET_PANEL_SORTS.includes(next)) throw new Error('Fleet panel sort');
      if (sort === next) return;
      sort = next;
      sortSelect.value = next;
      renderRetained();
    });
  }

  function setOpen(next: boolean) {
    mutate(() => {
      assertLive();
      if (opened === next) return;
      opened = next;
      if (opened) root.removeAttribute('hidden');
      else root.setAttribute('hidden', '');
      writes += 1;
      attribute(root, 'data-open', opened ? 'true' : 'false');
      if (opened) {
        view = current === null ? null : projectFleetPanel(current, { filter, sort });
        renderRetained();
      }
    });
  }

  return Object.freeze({
    update(candidate: FleetPanelSnapshot, nowMs: number) {
      mutate(() => {
        assertLive();
        const snapshot = parseFleetPanelSnapshot(candidate);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Fleet panel clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale fleet panel snapshot');
        lastClock = nowMs;
        const previous = current;
        current = snapshot;
        const projected = projectFleetPanel(snapshot, { filter, sort }),
          blockedSignature = fleetPanelBlockedSignature(snapshot),
          bypass =
            previous === null ||
            (previous.followedTaxiId ?? null) !== (snapshot.followedTaxiId ?? null) ||
            blockedSignature !== lastBlockedSignature;
        lastBlockedSignature = blockedSignature;
        if (projected.signature === lastSignature) {
          view = projected;
          skipped += 1;
          return;
        }
        if (!bypass && nowMs - lastWrite < interval) {
          skipped += 1;
          return;
        }
        lastWrite = nowMs;
        updates += 1;
        render(projected, snapshot);
      });
    },
    setFilter,
    setSort,
    setOpen,
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    isOpen: () => opened,
    getStats: () =>
      Object.freeze({
        version: FLEET_PANEL_VERSION,
        elements: disposed ? 0 : baseElements + rows.size * ROW_ELEMENTS,
        textNodes: disposed ? 0 : chromeText.length + rows.size * ROW_TEXT_NODES,
        rows: disposed ? 0 : list.children.length,
        retainedRows: rows.size,
        createdRows,
        attaches,
        moves,
        writes,
        skipped,
        updates,
        renders,
        listeners,
        retainedViews: disposed || current === null ? 0 : 1,
        open: opened,
        disposed,
      }),
    /** The retained frame and its current projection; `null` before the first accepted update. */
    getView: () => (disposed ? null : view),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const nodes of rows.values()) {
          nodes.button.removeEventListener('click', nodes.onClick);
          nodes.item.remove();
        }
        rows.clear();
        filterSelect.removeEventListener('change', onFilterChange);
        sortSelect.removeEventListener('change', onSortChange);
        listeners = 0;
        current = null;
        view = null;
        root.remove();
      });
    },
  });
}

export type FleetPanel = ReturnType<typeof createFleetPanel>;
