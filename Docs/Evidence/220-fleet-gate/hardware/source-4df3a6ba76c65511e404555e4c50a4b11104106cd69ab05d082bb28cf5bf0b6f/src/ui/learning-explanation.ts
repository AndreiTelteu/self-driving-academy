import type {
  LearningExplanationSnapshot,
  LearningExplanationView,
} from './learning-explanation-format';
import {
  LEARNING_EXPLANATION_LIMITS,
  LEARNING_EXPLANATION_VERSION,
  parseLearningExplanationSnapshot,
  projectLearningExplanation,
} from './learning-explanation-format';

export type LearningExplanationUpdateStatus =
  'ACCEPTED' | 'UNCHANGED' | 'THROTTLED' | 'STALE' | 'REJECTED';

export interface LearningExplanationPanelOptions {
  /** Text/attribute write ceiling; defaults to 10 Hz and is never tied to the tick rate. */
  readonly maximumHz?: number;
  /**
   * The 24 learnable keys (092 `initial_learning_target`). When supplied, a frame carrying an R key
   * as a learned change is rejected before the DOM sees it.
   */
  readonly learningKeys?: readonly string[];
}

interface ChangeRowNodes {
  readonly item: HTMLElement;
  readonly values: Map<string, HTMLElement>;
}

/** One change row owns `li`, `dl` and eight `dt`/`dd` pairs. */
const ROW_ELEMENTS = 18;

const ROW_CAPTIONS = [
  'Valoare',
  'Delta',
  'Dovezi',
  'Contexte',
  'Calitate',
  'Încredere',
  'Segmente',
  'Motiv',
] as const;

const IDENTITY_CAPTIONS = [
  'Job',
  'Segment',
  'Profil',
  'Epocă învățare',
  'Mod',
  'Ordine',
  'Sesiune',
  'Lume',
  'Tick',
] as const;

const DESCRIPTION_ID = 'learning-explanation-description';

/**
 * 104 explanation adapter. The DOM is built once: a header with the job binding and a status badge,
 * one `dd` per change field, an explicit version line, a no-change block, the missing evidence list
 * and the real failure detail. It renders only validated frames, writes only changed text, caps
 * writes at 10 Hz (a status/version/job change bypasses the cap) and never invents a version,
 * evidence count, context or value. It has no controls and no global key listener.
 */
export function createLearningExplanationPanel(
  host: HTMLElement,
  options: LearningExplanationPanelOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Learning explanation requires an owned document');
  const maximumHz = options.maximumHz ?? LEARNING_EXPLANATION_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Learning explanation write rate');
  const interval = 1000 / maximumHz,
    learningKeys = options.learningKeys;
  let elementCount = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const leaf = (
    tag: 'span' | 'dt' | 'dd' | 'p' | 'h2' | 'h3' | 'li',
    text: string,
  ): HTMLElement => {
    const node = element(tag);
    node.textContent = text;
    return node;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    badge = element('span'),
    countLabel = element('span'),
    identity = element('dl'),
    versionLine = element('p'),
    summary = element('p'),
    noChange = element('p'),
    changesSection = element('section'),
    changesTitle = element('h3'),
    changesEmpty = element('p'),
    changesList = element('ul'),
    missingSection = element('section'),
    missingTitle = element('h3'),
    missingList = element('ul'),
    failure = element('p'),
    description = element('p');
  root.className = 'learning-explanation';
  root.setAttribute('tabindex', '-1');
  root.setAttribute('aria-label', 'Explicarea modificărilor învățate');
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  header.className = 'learning-explanation__header';
  title.className = 'learning-explanation__title';
  title.textContent = 'Explicarea modificărilor';
  badge.className = 'learning-explanation__badge';
  countLabel.className = 'learning-explanation__count';
  identity.className = 'learning-explanation__identity';
  versionLine.className = 'learning-explanation__version';
  summary.className = 'learning-explanation__summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  noChange.className = 'learning-explanation__no-change';
  changesSection.className = 'learning-explanation__changes';
  changesTitle.className = 'learning-explanation__changes-title';
  changesTitle.textContent = 'Modificări față de baza epocii';
  changesEmpty.className = 'learning-explanation__changes-empty';
  changesEmpty.textContent = 'Nicio modificare învățată în acest rezultat.';
  changesList.className = 'learning-explanation__rows';
  missingSection.className = 'learning-explanation__missing-section';
  missingTitle.className = 'learning-explanation__missing-title';
  missingTitle.textContent = 'Dovezi și contexte lipsă';
  missingList.className = 'learning-explanation__missing';
  failure.className = 'learning-explanation__failure';
  description.className = 'learning-explanation__description';
  description.id = DESCRIPTION_ID;
  description.textContent =
    'Fiecare modificare este legată de numărul efectiv de episoade, contexte, calitate și ' +
    'încrederea din dovezi. „Nicio versiune nouă” înseamnă că dovezile nu justifică o schimbare; ' +
    'o eroare sau o respingere nu este niciodată o publicare.';

  const identityValues = new Map<string, HTMLElement>();
  for (const caption of IDENTITY_CAPTIONS) {
    identity.append(leaf('dt', caption), leaf('dd', '—'));
    identityValues.set(caption, identity.children[identity.children.length - 1] as HTMLElement);
  }
  changesSection.append(changesTitle, changesEmpty, changesList);
  missingSection.append(missingTitle, missingList);
  header.append(title, badge, countLabel);
  root.append(
    header,
    identity,
    versionLine,
    summary,
    noChange,
    changesSection,
    missingSection,
    failure,
    description,
  );
  host.append(root);
  const baseElements = elementCount;

  const rows = new Map<string, ChangeRowNodes>();
  let disposed = false,
    current: LearningExplanationSnapshot | null = null,
    view: LearningExplanationView | null = null,
    lastSignature = '',
    lastBinding = '',
    lastClock = -Infinity,
    lastWrite = -Infinity,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0,
    rejected = 0,
    stale = 0,
    pending = false;

  const assertLive = () => {
    if (disposed) throw new Error('Learning explanation disposed');
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

  const createRow = (): ChangeRowNodes => {
    const item = element('li'),
      list = element('dl'),
      values = new Map<string, HTMLElement>();
    item.className = 'learning-explanation__row';
    list.className = 'learning-explanation__row-fields';
    for (const caption of ROW_CAPTIONS) {
      const term = leaf('dt', caption),
        value = leaf('dd', '—');
      list.append(term, value);
      values.set(caption, value);
    }
    item.append(list);
    return { item, values };
  };

  const renderRows = (projected: LearningExplanationView) => {
    const live = new Set(projected.rows.map((row) => row.key));
    for (const [key, nodes] of rows) {
      if (live.has(key)) continue;
      nodes.item.remove();
      rows.delete(key);
    }
    for (let index = 0; index < projected.rows.length; index += 1) {
      const row = projected.rows[index]!;
      let nodes = rows.get(row.key);
      if (nodes === undefined) {
        nodes = createRow();
        rows.set(row.key, nodes);
      }
      const reference = changesList.children[index] ?? null;
      if (reference !== nodes.item) changesList.insertBefore(nodes.item, reference);
      set(nodes.values.get('Valoare')!, row.changeLabel);
      set(nodes.values.get('Delta')!, row.deltaLabel);
      set(nodes.values.get('Dovezi')!, row.evidenceLabel);
      set(nodes.values.get('Contexte')!, row.contextsLabel);
      set(
        nodes.values.get('Calitate')!,
        `${row.qualityLabel} · incertitudine ${row.uncertaintyLabel}`,
      );
      set(nodes.values.get('Încredere')!, row.confidenceLabel);
      set(nodes.values.get('Segmente')!, row.sourceLabel);
      set(nodes.values.get('Motiv')!, row.reason);
      attribute(nodes.item, 'data-key', row.key);
      attribute(nodes.item, 'data-confidence', row.confidence);
      attribute(nodes.item, 'aria-label', row.description);
    }
    toggle(changesList, 'hidden', projected.rows.length === 0);
    toggle(changesEmpty, 'hidden', projected.rows.length > 0);
  };

  const renderMissing = (projected: LearningExplanationView) => {
    const key = projected.missing.map((row) => row.text).join('|'),
      previousKey = missingList.getAttribute('data-key');
    if (previousKey !== key) {
      missingList.textContent = '';
      for (const row of projected.missing) {
        const entry = leaf('li', row.text);
        entry.className = 'learning-explanation__missing-item';
        entry.setAttribute('data-index', String(row.index));
        missingList.append(entry);
      }
      attribute(missingList, 'data-key', key);
      writes += 1;
    }
    toggle(missingSection, 'hidden', projected.missing.length === 0);
  };

  const render = (projected: LearningExplanationView) => {
    renderRows(projected);
    renderMissing(projected);
    const value = (caption: string) => identityValues.get(caption)!;
    set(value('Job'), projected.jobKey);
    set(value('Segment'), projected.segmentId);
    set(value('Profil'), projected.profileId);
    set(value('Epocă învățare'), String(projected.learningEpoch));
    set(value('Mod'), projected.mode);
    set(value('Ordine'), String(projected.order));
    set(value('Sesiune'), projected.sessionId);
    set(value('Lume'), String(projected.worldEpoch));
    set(value('Tick'), String(projected.tick));
    set(badge, `${projected.symbol} ${projected.title}`);
    set(
      countLabel,
      `${projected.counts.changes} ${projected.counts.changes === 1 ? 'modificare' : 'modificări'}`,
    );
    set(versionLine, `Versiune: ${projected.versionLabel}`);
    set(summary, projected.summary);
    set(noChange, projected.noChange ?? '');
    toggle(noChange, 'hidden', projected.noChange === null);
    set(failure, projected.failure ?? '');
    toggle(failure, 'hidden', projected.failure === null);
    attribute(root, 'data-status', projected.status);
    attribute(root, 'data-version', projected.versionId ?? '');
    attribute(root, 'data-no-version', projected.noVersion ? 'true' : 'false');
    attribute(root, 'data-published', 'false');
    attribute(root, 'data-success', projected.success ? 'true' : 'false');
    attribute(root, 'data-job', projected.jobKey);
    attribute(root, 'data-segment', projected.segmentId);
    attribute(root, 'data-changes', String(projected.counts.changes));
    attribute(root, 'data-tick', String(projected.tick));
    attribute(badge, 'data-status', projected.status);
    attribute(
      root,
      'aria-label',
      `Explicarea modificărilor · ${projected.title} · ${projected.segmentId} · ${projected.versionLabel}`,
    );
    view = projected;
    lastSignature = projected.signature;
    renders += 1;
  };

  return Object.freeze({
    update(candidate: unknown, nowMs: number): LearningExplanationUpdateStatus {
      assertLive();
      let snapshot: LearningExplanationSnapshot;
      try {
        snapshot = parseLearningExplanationSnapshot(candidate, learningKeys);
      } catch {
        rejected += 1;
        return 'REJECTED';
      }
      if (!Number.isFinite(nowMs) || nowMs < lastClock) {
        rejected += 1;
        return 'REJECTED';
      }
      if (
        current !== null &&
        snapshot.sessionId === current.sessionId &&
        snapshot.worldEpoch === current.worldEpoch &&
        snapshot.tick < current.tick
      ) {
        stale += 1;
        return 'STALE';
      }
      lastClock = Math.max(lastClock, nowMs);
      const previous = current;
      current = snapshot;
      const projected = projectLearningExplanation(snapshot),
        binding = JSON.stringify([
          snapshot.status,
          snapshot.versionId,
          snapshot.segmentId,
          snapshot.jobKey,
          snapshot.learningEpoch,
          snapshot.order,
          snapshot.sessionId,
          snapshot.worldEpoch,
        ]),
        bypass = previous === null || binding !== lastBinding;
      lastBinding = binding;
      if (projected.signature === lastSignature) {
        skipped += 1;
        pending = false;
        view = projected;
        return 'UNCHANGED';
      }
      if (!bypass && nowMs - lastWrite < interval) {
        skipped += 1;
        pending = true;
        return 'THROTTLED';
      }
      lastWrite = nowMs;
      pending = false;
      updates += 1;
      render(projected);
      return 'ACCEPTED';
    },
    getView: () => (disposed ? null : view),
    getStats: () =>
      Object.freeze({
        version: LEARNING_EXPLANATION_VERSION,
        maximumHz,
        elements: disposed
          ? 0
          : baseElements + rows.size * ROW_ELEMENTS + missingList.children.length,
        rows: disposed ? 0 : rows.size,
        writes,
        updates,
        renders,
        skipped,
        rejected,
        stale,
        pending,
        status: view?.status ?? null,
        listeners: 0,
        clickListeners: 0,
        keyListeners: 0,
        retainedViews: disposed || view === null ? 0 : 1,
        history: LEARNING_EXPLANATION_LIMITS.history,
        disposed,
      }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const nodes of rows.values()) nodes.item.remove();
      rows.clear();
      current = null;
      view = null;
      root.remove();
    },
  });
}

export type LearningExplanationPanel = ReturnType<typeof createLearningExplanationPanel>;
