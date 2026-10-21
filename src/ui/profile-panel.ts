import type { ParameterDefinition } from '../profiles';
import type {
  ProfilePanelRow,
  ProfilePanelSection,
  ProfilePanelSnapshot,
  ProfilePanelView,
} from './profile-panel-format';
import {
  PROFILE_PANEL_ILLUSTRATIVE_BANNER,
  PROFILE_PANEL_LIMITS,
  PROFILE_PANEL_VERSION,
  parseProfilePanelSnapshot,
  projectProfilePanel,
} from './profile-panel-format';

export interface ProfilePanelOptions {
  /** Text/attribute write ceiling. Defaults to 10 Hz; never tied to the tick rate. */
  readonly maximumHz?: number;
  /**
   * Real catalog (092) used to enforce exact keys, metadata and the R/reserved rule. When omitted the
   * frame is only checked for its own consistency, so production composition must inject it.
   */
  readonly catalog?: readonly ParameterDefinition[];
  /** Build the panel closed; `open()` renders the retained view without recreating rows. */
  readonly open?: boolean;
}

interface SectionNodes {
  readonly element: HTMLElement;
  readonly title: HTMLElement;
  readonly list: HTMLElement;
}

interface RowNodes {
  readonly item: HTMLElement;
  readonly label: HTMLElement;
  readonly value: HTMLElement;
  readonly uncertainty: HTMLElement;
  readonly evidence: HTMLElement;
  readonly source: HTMLElement;
  readonly reason: HTMLElement;
}

interface DeltaRowNodes {
  readonly item: HTMLElement;
  readonly label: HTMLElement;
  readonly change: HTMLElement;
  readonly reason: HTMLElement;
  readonly evidence: HTMLElement;
}

/** Elements owned by one parameter row: `li` plus six `span`s. */
const ROW_ELEMENTS = 7;
/** Elements owned by one category section: `section`, `h3` and `ul`. */
const SECTION_ELEMENTS = 3;
/** Elements owned by one delta row: `li` plus four `span`s. */
const DELTA_ROW_ELEMENTS = 5;
const DESCRIPTION_ID = 'profile-panel-description';

/**
 * 077 profile panel adapter. The DOM is built once, one row element is kept per catalog key and
 * reused across frames, version changes and reopening. It learns nothing, publishes nothing and
 * activates nothing; it has no controls, no global key listener and no state that can mutate a
 * profile. Reserved rows carry visible text and `data-status="RESERVED"`, never colour alone.
 */
export function createProfilePanel(host: HTMLElement, options: ProfilePanelOptions = {}) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Profile panel requires an owned document');
  const maximumHz = options.maximumHz ?? PROFILE_PANEL_LIMITS.maximumHz;
  if (!Number.isFinite(maximumHz) || maximumHz <= 0 || maximumHz > 60)
    throw new Error('Profile panel write rate');
  const catalog = options.catalog,
    interval = 1000 / maximumHz;
  let elementCount = 0,
    createdRows = 0;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    elementCount += 1;
    return node;
  };
  const leaf = (text: string): HTMLElement => {
    const node = element('span');
    node.textContent = text;
    return node;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    badge = element('span'),
    countLabel = element('span'),
    identity = element('dl'),
    banner = element('p'),
    summary = element('p'),
    details = element('details'),
    detailsSummary = element('summary'),
    detailsBody = element('dl'),
    sections = element('div'),
    deltaSection = element('section'),
    deltaTitle = element('h3'),
    deltaEmpty = element('p'),
    deltaList = element('ul'),
    description = element('p');
  root.className = 'profile-panel';
  root.setAttribute('aria-label', 'Panoul profilului');
  header.className = 'profile-panel__header';
  title.className = 'profile-panel__title';
  title.textContent = 'Profil de condus';
  badge.className = 'profile-panel__badge';
  badge.setAttribute('data-illustrative', 'true');
  countLabel.className = 'profile-panel__count';
  identity.className = 'profile-panel__identity';
  banner.className = 'profile-panel__banner';
  banner.textContent = PROFILE_PANEL_ILLUSTRATIVE_BANNER;
  summary.className = 'profile-panel__summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  details.className = 'profile-panel__details';
  detailsSummary.textContent = 'Checksum și dovezi';
  detailsBody.className = 'profile-panel__details-body';
  sections.className = 'profile-panel__sections';
  deltaSection.className = 'profile-panel__delta';
  deltaTitle.textContent = 'Modificări față de versiunea anterioară';
  deltaEmpty.className = 'profile-panel__delta-empty';
  deltaList.className = 'profile-panel__delta-rows';
  description.className = 'profile-panel__description';
  description.id = DESCRIPTION_ID;
  description.textContent =
    'Valorile provin din versiunea publicată. O valoare lipsă este „Neobservat”, niciodată 0. ' +
    'Cheile R sunt rezervate și nu sunt învățabile în V1. Datele ilustrative folosesc valorile ' +
    'implicite din catalog până când serviciul de profiluri publică o versiune.';
  const identityFields = new Map<string, HTMLElement>(),
    detailFields = new Map<string, HTMLElement>();
  const definitionPair = (
    target: Map<string, HTMLElement>,
    caption: string,
  ): [HTMLElement, HTMLElement] => {
    const term = element('dt'),
      value = element('dd');
    term.textContent = caption;
    target.set(caption, value);
    return [term, value];
  };
  for (const caption of ['ID profil', 'Versiune', 'Motor', 'Checksum']) {
    identity.append(...definitionPair(identityFields, caption));
  }
  for (const caption of [
    'Checksum',
    'Parametri cu dovezi',
    'Dovezi totale',
    'Contract',
    'Bază delta',
  ]) {
    detailsBody.append(...definitionPair(detailFields, caption));
  }
  details.append(detailsSummary, detailsBody);
  deltaSection.append(deltaTitle, deltaEmpty, deltaList);
  header.append(title, badge, countLabel);
  root.setAttribute('aria-describedby', DESCRIPTION_ID);
  root.append(header, identity, banner, summary, details, sections, deltaSection, description);
  host.append(root);
  const baseElements = elementCount;

  const sectionNodes = new Map<string, SectionNodes>(),
    rowNodes = new Map<string, RowNodes>(),
    deltaNodes = new Map<string, DeltaRowNodes>();
  let disposed = false,
    busy = false,
    opened = options.open === true,
    current: ProfilePanelSnapshot | null = null,
    view: ProfilePanelView | null = null,
    lastSignature = '',
    lastFrameKey = '',
    lastClock = -Infinity,
    lastWrite = -Infinity,
    writes = 0,
    skipped = 0,
    updates = 0,
    renders = 0;
  if (opened) root.removeAttribute('hidden');
  else root.setAttribute('hidden', '');

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Profile panel reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Profile panel disposed');
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

  const createSection = (category: string): SectionNodes => {
    const section = element('section'),
      heading = element('h3'),
      list = element('ul');
    section.className = 'profile-panel__section';
    section.setAttribute('data-category', category);
    heading.className = 'profile-panel__section-title';
    heading.textContent = category;
    list.className = 'profile-panel__rows';
    section.append(heading, list);
    return { element: section, title: heading, list };
  };
  const createRow = (key: string): RowNodes => {
    const item = element('li'),
      label = leaf(''),
      value = leaf(''),
      uncertainty = leaf(''),
      evidence = leaf(''),
      source = leaf(''),
      reason = leaf('');
    item.className = 'profile-panel__row';
    item.setAttribute('data-key', key);
    label.className = 'profile-panel__label';
    value.className = 'profile-panel__value';
    uncertainty.className = 'profile-panel__uncertainty';
    evidence.className = 'profile-panel__evidence';
    source.className = 'profile-panel__source';
    reason.className = 'profile-panel__reason';
    item.append(label, value, uncertainty, evidence, source, reason);
    createdRows += 1;
    return { item, label, value, uncertainty, evidence, source, reason };
  };
  const createDeltaRow = (key: string): DeltaRowNodes => {
    const item = element('li'),
      label = leaf(''),
      change = leaf(''),
      reason = leaf(''),
      evidence = leaf('');
    item.className = 'profile-panel__delta-row';
    item.setAttribute('data-key', key);
    label.className = 'profile-panel__delta-label';
    change.className = 'profile-panel__delta-change';
    reason.className = 'profile-panel__delta-reason';
    evidence.className = 'profile-panel__delta-evidence';
    item.append(label, change, reason, evidence);
    return { item, label, change, reason, evidence };
  };
  const renderRow = (nodes: RowNodes, row: ProfilePanelRow) => {
    set(nodes.label, row.label);
    set(nodes.value, row.displayValue);
    set(nodes.uncertainty, row.uncertaintyLabel);
    set(nodes.evidence, row.evidenceLabel);
    set(nodes.source, row.sourceLabel);
    set(nodes.reason, row.reasonLabel);
    attribute(nodes.item, 'data-status', row.status);
    attribute(nodes.item, 'data-learnable', row.learnable ? 'true' : 'false');
    attribute(nodes.item, 'aria-label', row.description);
  };
  const renderLayout = (projected: ProfilePanelView) => {
    const liveCategories = new Set(projected.sections.map((section) => section.category));
    for (const [category, nodes] of sectionNodes) {
      if (liveCategories.has(category)) continue;
      nodes.element.remove();
      sectionNodes.delete(category);
    }
    let sectionIndex = 0;
    for (const section of projected.sections) {
      let nodes = sectionNodes.get(section.category);
      if (nodes === undefined) {
        nodes = createSection(section.category);
        sectionNodes.set(section.category, nodes);
      }
      const reference = sections.children[sectionIndex] ?? null;
      if (reference !== nodes.element) sections.insertBefore(nodes.element, reference);
      sectionIndex += 1;
      placeRows(nodes, section);
    }
    const liveKeys = new Set(projected.rows.map((row) => row.key));
    for (const [key, nodes] of rowNodes) {
      if (liveKeys.has(key)) continue;
      nodes.item.remove();
      rowNodes.delete(key);
    }
  };
  const placeRows = (section: SectionNodes, projected: ProfilePanelSection) => {
    for (let index = 0; index < projected.rows.length; index += 1) {
      const row = projected.rows[index]!;
      let nodes = rowNodes.get(row.key);
      if (nodes === undefined) {
        nodes = createRow(row.key);
        rowNodes.set(row.key, nodes);
      }
      const reference = section.list.children[index] ?? null;
      if (reference !== nodes.item) section.list.insertBefore(nodes.item, reference);
      renderRow(nodes, row);
    }
  };
  const renderDelta = (projected: ProfilePanelView) => {
    const delta = projected.delta;
    if (delta === null || delta.rows.length === 0) {
      toggle(deltaList, 'hidden', true);
      toggle(deltaEmpty, 'hidden', false);
      set(
        deltaEmpty,
        delta === null
          ? 'Nicio versiune anterioară comparată.'
          : 'Nicio modificare învățată față de versiunea anterioară.',
      );
      for (const [key, nodes] of deltaNodes) {
        nodes.item.remove();
        deltaNodes.delete(key);
      }
      return;
    }
    toggle(deltaList, 'hidden', false);
    toggle(deltaEmpty, 'hidden', true);
    for (let index = 0; index < delta.rows.length; index += 1) {
      const row = delta.rows[index]!;
      let nodes = deltaNodes.get(row.key);
      if (nodes === undefined) {
        nodes = createDeltaRow(row.key);
        deltaNodes.set(row.key, nodes);
      }
      const reference = deltaList.children[index] ?? null;
      if (reference !== nodes.item) deltaList.insertBefore(nodes.item, reference);
      set(nodes.label, row.label);
      set(nodes.change, row.changeLabel);
      set(nodes.reason, row.reason);
      set(nodes.evidence, row.evidenceLabel);
      attribute(nodes.item, 'aria-label', row.description);
    }
    const liveKeys = new Set(delta.rows.map((row) => row.key));
    for (const [key, nodes] of deltaNodes) {
      if (liveKeys.has(key)) continue;
      nodes.item.remove();
      deltaNodes.delete(key);
    }
  };
  const render = (projected: ProfilePanelView, snapshot: ProfilePanelSnapshot) => {
    renderLayout(projected);
    renderDelta(projected);
    const profile = projected.profile,
      identityValue = (caption: string) => identityFields.get(caption)!,
      detailValue = (caption: string) => detailFields.get(caption)!;
    set(identityValue('ID profil'), profile === null ? '—' : profile.profileId);
    set(identityValue('Versiune'), profile === null ? '—' : profile.versionId);
    set(identityValue('Motor'), profile === null ? '—' : profile.engineVersion);
    set(identityValue('Checksum'), profile === null ? '—' : profile.checksum);
    set(detailValue('Checksum'), profile === null ? '—' : profile.checksum);
    set(
      detailValue('Parametri cu dovezi'),
      `${projected.counts.withEvidence} din ${projected.counts.observed}`,
    );
    set(
      detailValue('Dovezi totale'),
      String(
        projected.rows.reduce(
          (total, row) => total + (row.status === 'OBSERVED' ? row.evidenceCount : 0),
          0,
        ),
      ),
    );
    set(detailValue('Contract'), PROFILE_PANEL_VERSION);
    set(detailValue('Bază delta'), projected.delta?.baseVersionId ?? '—');
    set(badge, projected.illustrative ? 'ILUSTRATIV' : 'PUBLICAT');
    set(countLabel, `${projected.counts.total} parametri`);
    set(summary, projected.summary);
    toggle(banner, 'hidden', !projected.illustrative);
    attribute(badge, 'data-illustrative', projected.illustrative ? 'true' : 'false');
    attribute(root, 'data-illustrative', projected.illustrative ? 'true' : 'false');
    attribute(root, 'data-open', opened ? 'true' : 'false');
    attribute(root, 'data-tick', String(snapshot.tick));
    attribute(root, 'data-observed', String(projected.counts.observed));
    attribute(root, 'data-unobserved', String(projected.counts.unobserved));
    attribute(root, 'data-reserved', String(projected.counts.reserved));
    attribute(root, 'data-changed', String(projected.counts.changed));
    attribute(root, 'data-version', profile === null ? '' : profile.versionId);
    attribute(
      root,
      'aria-label',
      `Panoul profilului · ${projected.illustrative ? 'ilustrativ' : (profile?.versionId ?? '—')} · ` +
        `${projected.counts.observed} observați, ${projected.counts.unobserved} neobservați, ` +
        `${projected.counts.reserved} rezervați`,
    );
    view = projected;
    lastSignature = projected.signature;
    renders += 1;
  };
  const frameKey = (snapshot: ProfilePanelSnapshot): string =>
    JSON.stringify([
      snapshot.illustrative,
      snapshot.profile === null
        ? null
        : [
            snapshot.profile.profileId,
            snapshot.profile.versionId,
            snapshot.profile.engineVersion,
            snapshot.profile.checksum,
          ],
      snapshot.delta === null
        ? null
        : [
            snapshot.delta.baseVersionId,
            snapshot.delta.changes.map((change) => [
              change.key,
              change.previous,
              change.next,
              change.reason,
              change.evidenceCount,
            ]),
          ],
    ]);

  function setOpen(next: boolean) {
    mutate(() => {
      assertLive();
      if (opened === next) return;
      opened = next;
      toggle(root, 'hidden', !opened);
      attribute(root, 'data-open', opened ? 'true' : 'false');
      if (opened && current !== null) {
        const projected = projectProfilePanel(current, catalog);
        if (projected.signature !== lastSignature) render(projected, current);
        else view = projected;
      }
    });
  }

  return Object.freeze({
    update(candidate: ProfilePanelSnapshot, nowMs: number) {
      mutate(() => {
        assertLive();
        const snapshot = parseProfilePanelSnapshot(candidate, catalog);
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Profile panel clock');
        if (
          current !== null &&
          current.sessionId === snapshot.sessionId &&
          current.worldEpoch === snapshot.worldEpoch &&
          snapshot.tick < current.tick
        )
          throw new Error('Stale profile panel snapshot');
        lastClock = nowMs;
        const previous = current;
        current = snapshot;
        const projected = projectProfilePanel(snapshot, catalog),
          nextFrameKey = frameKey(snapshot),
          bypass = previous === null || nextFrameKey !== lastFrameKey;
        lastFrameKey = nextFrameKey;
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
        version: PROFILE_PANEL_VERSION,
        elements: disposed
          ? 0
          : baseElements +
            sectionNodes.size * SECTION_ELEMENTS +
            rowNodes.size * ROW_ELEMENTS +
            deltaNodes.size * DELTA_ROW_ELEMENTS,
        rows: disposed ? 0 : rowNodes.size,
        createdRows,
        deltaRows: disposed ? 0 : deltaNodes.size,
        writes,
        skipped,
        updates,
        renders,
        listeners: 0,
        retainedViews: disposed || view === null ? 0 : 1,
        open: opened,
        disposed,
      }),
    /** The last rendered projection; `null` before the first accepted update. */
    getView: () => (disposed ? null : view),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const nodes of rowNodes.values()) nodes.item.remove();
        for (const nodes of deltaNodes.values()) nodes.item.remove();
        rowNodes.clear();
        deltaNodes.clear();
        sectionNodes.clear();
        current = null;
        view = null;
        root.remove();
      });
    },
  });
}

export type ProfilePanel = ReturnType<typeof createProfilePanel>;
