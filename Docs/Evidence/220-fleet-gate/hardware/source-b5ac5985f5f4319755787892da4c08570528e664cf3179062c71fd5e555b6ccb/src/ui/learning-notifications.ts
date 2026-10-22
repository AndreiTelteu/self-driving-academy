import type {
  LearningNotificationCurrentJob,
  LearningNotificationItem,
  LearningNotificationPolicy,
  LearningNotificationSoundCue,
  LearningNotificationState,
  LearningNotificationView,
} from './learning-notification-format';
import {
  LEARNING_NOTIFICATION_LIMITS,
  LEARNING_NOTIFICATION_VERSION,
  createLearningNotificationState,
  dismissLearningNotification,
  expireLearningNotifications,
  projectLearningNotifications,
  reduceLearningNotifications,
} from './learning-notification-format';

export type LearningNotificationPushStatus =
  'ACCEPTED' | 'STALE' | 'DEDUPED' | 'UNCHANGED' | 'THROTTLED' | 'REJECTED';

export interface LearningNotificationPushResult {
  readonly status: LearningNotificationPushStatus;
  /** Closed message for a rejected push; never rendered. */
  readonly reason: string | null;
  readonly view: LearningNotificationView;
}

/** Optional host port. The visual notification never depends on it. */
export type LearningNotificationAnnouncer = (
  cue: LearningNotificationSoundCue,
  notification: LearningNotificationItem,
) => void;

export interface LearningNotificationsOptions {
  /** Text/attribute write ceiling; defaults to 10 Hz and is never tied to the tick rate. */
  readonly maximumHz?: number;
  readonly maxActive?: number;
  readonly dedupeWindowMs?: number;
  readonly ttlMs?: number;
  readonly staleTtlMs?: number;
  /**
   * The learning job the host currently tracks. A notification whose segment/job/epoch/session/
   * world no longer matches it becomes a quiet `STALE`, never the current result.
   */
  readonly current?: () => LearningNotificationCurrentJob | null;
  /**
   * Render dismiss buttons. They are `tabindex="-1"` so they never enter the driving tab order;
   * `dismiss(eventId)` works with or without them.
   */
  readonly dismissible?: boolean;
  /** Optional sound port. A blocked or throwing port never prevents the visual render. */
  readonly announce?: LearningNotificationAnnouncer;
}

interface RowNodes {
  readonly item: HTMLElement;
  readonly symbol: HTMLElement;
  readonly text: HTMLElement;
  readonly detail: HTMLElement;
  readonly missing: HTMLElement;
  readonly button: HTMLElement | null;
  missingKey: string;
}

/** Elements owned by one row: `li`, symbol, text, detail, missing list and the optional button. */
const ROW_BASE_ELEMENTS = 5;
/** Elements owned by the section: `section`, `ol` and the summary paragraph. */
const BASE_ELEMENTS = 3;

/**
 * 079 notification adapter. One `section[aria-label]` with a polite live region, one stable row per
 * visible notification (at most three), a symbol and text for every kind, and `data-*` attributes
 * that bind each row to its segment and job. It renders no fabricated evidence, has no global
 * listener and never writes the same state twice.
 */
export function createLearningNotifications(
  host: HTMLElement,
  options: LearningNotificationsOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Learning notifications require an owned document');
  const maximumHz = options.maximumHz ?? LEARNING_NOTIFICATION_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Learning notification write rate');
  const interval = 1000 / maximumHz,
    dismissible = options.dismissible === true,
    policy: Partial<LearningNotificationPolicy> = {
      maxActive: options.maxActive,
      dedupeWindowMs: options.dedupeWindowMs,
      ttlMs: options.ttlMs,
      staleTtlMs: options.staleTtlMs,
    };
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
      doc.createElement(tag),
    leaf = (text: string): HTMLElement => {
      const node = element('span');
      node.textContent = text;
      return node;
    };

  const root = element('section'),
    list = element('ol'),
    summary = element('p');
  root.className = 'learning-notifications';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'false');
  root.setAttribute('aria-label', 'Notificări de învățare');
  list.className = 'learning-notifications__list';
  summary.className = 'learning-notifications__summary';
  root.append(list, summary);
  host.append(root);

  const rows = new Map<string, RowNodes>(),
    announced = new Set<string>();
  let disposed = false,
    state: LearningNotificationState = createLearningNotificationState({
      ...policy,
      current: options.current?.() ?? null,
    }),
    view = projectLearningNotifications(state),
    pending = false,
    lastWrite = -Infinity,
    clock = 0,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0,
    dismissed = 0,
    rejected = 0,
    announcedCount = 0,
    announceFailures = 0,
    clickListeners = 0;
  summary.textContent = view.summary;
  root.setAttribute('data-count', '0');
  root.setAttribute('data-active', '0');
  root.setAttribute('data-version', LEARNING_NOTIFICATION_VERSION);

  const assertLive = () => {
    if (disposed) throw new Error('Learning notifications disposed');
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
  const toggle = (node: HTMLElement, name: string, value: boolean) => {
    if (node.hasAttribute(name) === value) return;
    if (value) node.setAttribute(name, '');
    else node.removeAttribute(name);
    writes += 1;
  };

  const createRow = (item: LearningNotificationItem): RowNodes => {
    const node = element('li'),
      symbol = leaf(item.symbol),
      text = leaf(item.text),
      detail = element('p'),
      missing = element('ul'),
      button = dismissible ? element('button') : null;
    node.className = 'learning-notifications__item';
    symbol.className = 'learning-notifications__symbol';
    symbol.setAttribute('aria-hidden', 'true');
    text.className = 'learning-notifications__text';
    detail.className = 'learning-notifications__detail';
    missing.className = 'learning-notifications__missing';
    if (button !== null) {
      button.className = 'learning-notifications__dismiss';
      button.setAttribute('type', 'button');
      // Never a tab stop: dismissing must not steal focus from driving.
      button.setAttribute('tabindex', '-1');
      button.addEventListener('click', () => {
        dismiss(node.getAttribute('data-event') ?? '');
      });
      clickListeners += 1;
    }
    node.append(symbol, text, detail, missing, ...(button === null ? [] : [button]));
    return { item: node, symbol, text, detail, missing, button, missingKey: '\u0000' };
  };

  const renderMissing = (nodes: RowNodes, item: LearningNotificationItem) => {
    const key = item.missing.map((row) => row.text).join('|');
    if (nodes.missingKey !== key) {
      nodes.missing.textContent = '';
      for (const row of item.missing) {
        const entry = element('li');
        entry.className = 'learning-notifications__missing-item';
        entry.setAttribute('data-key', row.key);
        entry.setAttribute('data-state', row.state);
        entry.textContent = row.text;
        nodes.missing.append(entry);
      }
      nodes.missingKey = key;
      writes += 1;
    }
    toggle(nodes.missing, 'hidden', item.missing.length === 0);
  };

  const renderRow = (nodes: RowNodes, item: LearningNotificationItem) => {
    set(nodes.symbol, item.symbol);
    set(nodes.text, item.text);
    set(nodes.detail, item.detail ?? '');
    toggle(nodes.detail, 'hidden', item.detail === null);
    renderMissing(nodes, item);
    for (const [name, value] of item.attributes) attribute(nodes.item, name, value);
    if (nodes.button !== null)
      attribute(nodes.button, 'aria-label', `Închide notificarea: ${item.title}`);
  };

  const announceNew = (items: readonly LearningNotificationItem[]) => {
    const port = options.announce;
    for (const item of items) {
      if (announced.has(item.eventId)) continue;
      announced.add(item.eventId);
      if (announced.size > LEARNING_NOTIFICATION_LIMITS.seenKeys) {
        const oldest = announced.values().next();
        if (!oldest.done) announced.delete(oldest.value);
      }
      if (port === undefined || item.soundCue === 'NONE') continue;
      try {
        port(item.soundCue, item);
        announcedCount += 1;
      } catch {
        announceFailures += 1;
      }
    }
  };

  const render = (projected: LearningNotificationView) => {
    const live = new Set(projected.notifications.map((item) => item.eventId));
    for (const [key, nodes] of rows) {
      if (live.has(key)) continue;
      nodes.item.remove();
      rows.delete(key);
      if (nodes.button !== null) clickListeners -= 1;
    }
    for (let index = 0; index < projected.notifications.length; index += 1) {
      const item = projected.notifications[index]!;
      let nodes = rows.get(item.eventId);
      if (nodes === undefined) {
        nodes = createRow(item);
        rows.set(item.eventId, nodes);
      }
      const reference = list.children[index] ?? null;
      if (reference !== nodes.item) list.insertBefore(nodes.item, reference);
      renderRow(nodes, item);
    }
    set(summary, projected.summary);
    attribute(root, 'data-count', String(projected.counts.active));
    attribute(root, 'data-active', String(projected.counts.active));
    attribute(root, 'data-stale', String(projected.counts.stale));
    attribute(root, 'data-errors', String(projected.counts.errors));
    attribute(root, 'data-published', String(projected.counts.published));
    renders += 1;
    updates += 1;
    view = projected;
    announceNew(projected.notifications);
  };

  const apply = (next: LearningNotificationState, nowMs: number, bypass: boolean) => {
    const projected = projectLearningNotifications(next);
    state = next;
    clock = Math.max(clock, nowMs);
    if (projected.signature === view.signature) {
      skipped += 1;
      pending = false;
      view = projected;
      return;
    }
    if (!bypass && nowMs - lastWrite < interval) {
      skipped += 1;
      pending = true;
      return;
    }
    lastWrite = nowMs;
    pending = false;
    render(projected);
  };

  const currentPolicy = (): Partial<LearningNotificationPolicy> => ({
    ...policy,
    current: options.current?.() ?? null,
  });

  const push = (event: unknown, nowMs: number): LearningNotificationPushResult => {
    assertLive();
    const previous = state,
      previousIds = new Set(previous.entries.map((entry) => entry.event.eventId)),
      previousView = view,
      nextPolicy = currentPolicy();
    let next: LearningNotificationState;
    try {
      next = reduceLearningNotifications(previous, event, nowMs, nextPolicy);
    } catch (error) {
      rejected += 1;
      return Object.freeze({
        status: 'REJECTED',
        reason: error instanceof Error ? error.message : 'Malformed learning notification',
        view,
      });
    }
    const added = next.entries.find((entry) => !previousIds.has(entry.event.eventId)) ?? null;
    let status: LearningNotificationPushStatus = 'UNCHANGED';
    if (added !== null) status = added.stale ? 'STALE' : 'ACCEPTED';
    else if (next.counters.deduped > previous.counters.deduped) status = 'DEDUPED';
    const newKind = added === null ? null : added.stale ? 'STALE' : added.event.kind,
      kindChanged =
        newKind !== null && !previousView.notifications.some((item) => item.kind === newKind),
      segmentChanged =
        added !== null && previousView.notifications.at(-1)?.segmentId !== added.event.segmentId,
      bypass = previousView.notifications.length === 0 || kindChanged || segmentChanged;
    const beforeWrites = writes;
    apply(next, nowMs, bypass);
    if (added !== null && pending && writes === beforeWrites) status = 'THROTTLED';
    return Object.freeze({ status, reason: null, view });
  };

  const update = (nowMs: number): LearningNotificationView => {
    assertLive();
    const next = expireLearningNotifications(state, nowMs, currentPolicy());
    if (next === state && !pending) {
      clock = Math.max(clock, nowMs);
      return view;
    }
    apply(next, nowMs, false);
    return view;
  };

  function dismiss(eventId: string): boolean {
    assertLive();
    const next = dismissLearningNotification(state, eventId);
    if (next === state) return false;
    dismissed += 1;
    apply(next, Math.max(clock, state.nowMs), true);
    return true;
  }

  return Object.freeze({
    push,
    update,
    dismiss,
    isActive: (eventId: string): boolean => rows.has(eventId),
    getView: () => view,
    getStats: () =>
      Object.freeze({
        version: LEARNING_NOTIFICATION_VERSION,
        maximumHz,
        elements: disposed
          ? 0
          : BASE_ELEMENTS +
            [...rows.values()].reduce(
              (total, nodes) =>
                total +
                ROW_BASE_ELEMENTS +
                (nodes.button === null ? 0 : 1) +
                nodes.missing.children.length,
              0,
            ),
        rows: disposed ? 0 : rows.size,
        active: disposed ? 0 : state.entries.length,
        writes,
        updates,
        renders,
        skipped,
        dismissed,
        rejected,
        deduped: state.counters.deduped,
        expired: state.counters.expired,
        evicted: state.counters.evicted,
        announced: announcedCount,
        announceFailures,
        listeners: clickListeners,
        clickListeners,
        keyListeners: 0,
        retainedViews: 1,
        pending,
        disposed,
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const nodes of rows.values()) nodes.item.remove();
      rows.clear();
      clickListeners = 0;
      announced.clear();
      root.remove();
    },
  });
}

export type LearningNotifications = ReturnType<typeof createLearningNotifications>;
