import {
  STYLE_SLIDERS_DESCRIPTION,
  STYLE_SLIDERS_PROVENANCE_NOTE,
  STYLE_SLIDER_FIELDS,
  STYLE_SLIDERS_POLICY,
  STYLE_SLIDERS_SAVE_STATE_LABELS,
  STYLE_SLIDERS_TITLE,
  STYLE_SLIDER_UNAVAILABLE,
  applyStyleSliderDraftChange,
  isStyleSliderField,
  projectStyleSliders,
  revertStyleSlidersDraft,
  setStyleSliderValue,
  shouldWriteStyleSliders,
  styleSliderText,
  styleSliderValueText,
  type StyleSlidersDraft,
  type StyleSlidersProjection,
} from './style-sliders-format';

/**
 * 230 „Cum conduce orașul” tab adapter.
 *
 * The DOM is built once with stable nodes and native `input[type=range]` controls. A drag only
 * writes the local read-out, at most 10 times per second; one draft revision is committed when the
 * gesture ends. Nothing is published until the host applies the draft at a tick through the real
 * 109/205/110 path, so this module never writes a version, an activation or a parameter.
 *
 * Unavailable catalog keys stay visible and disabled with the reason and the `R` badge; they are
 * never hidden, and they are never silently clamped. Restore is an explicit intent behind a second
 * confirmation click and is executed by the injected host port (114/078).
 */
export type StyleSlidersAction = 'APPLY' | 'CANCEL' | 'RESET';

export interface StyleSlidersTabOptions {
  readonly draft: StyleSlidersDraft;
  /** Called after every committed local draft change (never during a drag). */
  readonly onChange?: (draft: StyleSlidersDraft) => void;
  /** Exactly one apply intention per click; the host owns the tick publication. */
  readonly apply?: (draft: StyleSlidersDraft) => void;
  /** „Anulează”: drop the local proposal. */
  readonly cancel?: (draft: StyleSlidersDraft) => void;
  /** „Revino la versiunea activă”: propose the edited version's values again. */
  readonly reset?: (draft: StyleSlidersDraft) => void;
  /** Explicit stale rebase; the host reloads the new head. */
  readonly rebase?: (draft: StyleSlidersDraft) => void;
  /** Restore intent, emitted only after the visible confirmation. */
  readonly restore?: (versionId: string) => void;
  /** Injected clock for the 10 Hz read-out ceiling; defaults to `performance.now`. */
  readonly now?: () => number;
}

export interface StyleSlidersChrome {
  readonly applyDisabled: boolean;
  readonly cancelDisabled: boolean;
  readonly resetLabel: string;
  readonly note: string;
  readonly saveState: StyleSlidersProjection['saveState'];
  readonly saveStateLabel: string;
}

interface SliderRow {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

export function createStyleSlidersTab(host: HTMLElement, options: StyleSlidersTabOptions) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Style sliders requires an owned document');
  if (!options || typeof options !== 'object') throw new Error('Style sliders tab options');
  for (const port of ['onChange', 'apply', 'cancel', 'reset', 'rebase', 'restore'] as const)
    if (options[port] !== undefined && typeof options[port] !== 'function')
      throw new Error(`Style sliders ${port} port`);
  const clock = options.now ?? (() => performance.now());
  if (typeof clock !== 'function') throw new Error('Style sliders clock');

  const initial = projectStyleSliders(options.draft),
    panelId = `style-sliders-${nextStylePanelId++}`,
    titleId = `${panelId}-title`,
    descriptionId = `${panelId}-description`,
    controlId = (name: string) => `${panelId}-${name}`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);
  const controls: { node: HTMLElement; type: string; handler: () => void }[] = [];

  const root = element('section'),
    header = element('div'),
    summary = element('p'),
    policy = element('p'),
    provenance = element('p'),
    stale = element('div'),
    staleText = element('p'),
    rebaseButton = element('button'),
    list = element('div'),
    issues = element('p'),
    unavailableSection = element('section'),
    unavailableTitle = element('h3'),
    unavailableList = element('ul'),
    restoreSection = element('section'),
    restoreTitle = element('h3'),
    restoreReason = element('p'),
    restoreSelect = element('select'),
    restoreButton = element('button'),
    confirmButton = element('button'),
    status = element('p');

  root.className = 'style-sliders';
  root.setAttribute('role', 'tabpanel');
  root.setAttribute('id', controlId('panel-city'));
  root.setAttribute('aria-labelledby', controlId('tab-city'));
  root.setAttribute('data-panel', 'styleSliders');
  root.setAttribute('data-save-state', initial.saveState);

  header.className = 'style-sliders__header';
  summary.className = 'style-sliders__summary';
  summary.setAttribute('id', titleId);
  policy.className = 'style-sliders__policy';
  policy.textContent = STYLE_SLIDERS_POLICY;
  provenance.className = 'style-sliders__provenance';
  provenance.setAttribute('id', descriptionId);
  provenance.textContent = STYLE_SLIDERS_PROVENANCE_NOTE;
  header.append(summary, policy, provenance);

  stale.className = 'style-sliders__stale';
  stale.setAttribute('role', 'note');
  stale.setAttribute('hidden', '');
  staleText.className = 'style-sliders__stale-text';
  rebaseButton.className = 'style-sliders__rebase';
  rebaseButton.setAttribute('type', 'button');
  rebaseButton.textContent = 'Reîncarcă baza';
  rebaseButton.setAttribute('aria-label', 'Reîncarcă versiunea activă ca bază a draftului');
  stale.append(staleText, rebaseButton);

  list.className = 'style-sliders__list';
  list.setAttribute('aria-label', 'Slidere de stil pentru oraș');

  const rows = new Map<string, SliderRow>();
  for (const field of STYLE_SLIDER_FIELDS) {
    const row = element('div'),
      label = element('label'),
      output = element('output'),
      hint = element('p'),
      input = element('input'),
      ends = element('div'),
      minEnd = element('span'),
      maxEnd = element('span'),
      id = controlId(field),
      definition = initial.rows.find((entry) => entry.field === field);
    if (definition === undefined) throw new Error('Style sliders row definition');
    row.className = 'style-sliders__row';
    row.setAttribute('data-field', field);
    row.setAttribute('data-parameter-key', definition.parameterKey);
    label.className = 'style-sliders__label';
    label.setAttribute('for', id);
    label.textContent = definition.label;
    output.className = 'style-sliders__value';
    output.setAttribute('for', id);
    hint.className = 'style-sliders__hint';
    hint.setAttribute('id', `${id}-hint`);
    hint.textContent = definition.hint;
    input.className = 'style-sliders__range';
    input.setAttribute('type', 'range');
    input.setAttribute('id', id);
    input.setAttribute('min', String(definition.min));
    input.setAttribute('max', String(definition.max));
    input.setAttribute('step', String(definition.step));
    input.setAttribute('aria-describedby', `${id}-hint`);
    ends.className = 'style-sliders__ends';
    ends.setAttribute('aria-hidden', 'true');
    minEnd.textContent = definition.ends.min;
    maxEnd.textContent = definition.ends.max;
    ends.append(minEnd, maxEnd);
    row.append(label, output, hint, input, ends);
    list.append(row);
    rows.set(field, { root: row, input, output });
  }

  issues.className = 'style-sliders__issues';
  issues.setAttribute('role', 'alert');
  issues.setAttribute('hidden', '');

  unavailableSection.className = 'style-sliders__unavailable';
  unavailableTitle.className = 'style-sliders__unavailable-title';
  unavailableTitle.textContent = 'Chei vizibile, dar dezactivate';
  unavailableList.className = 'style-sliders__unavailable-list';
  for (const entry of STYLE_SLIDER_UNAVAILABLE) {
    const item = element('li'),
      label = element('span'),
      badge = element('span'),
      detail = element('p');
    item.className = 'style-sliders__unavailable-row';
    item.setAttribute('data-parameter-key', entry.parameterKey);
    item.setAttribute('data-reason', entry.reason);
    item.setAttribute('aria-disabled', 'true');
    label.className = 'style-sliders__unavailable-label';
    label.textContent = entry.label;
    badge.className = 'style-sliders__unavailable-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = 'R';
    detail.className = 'style-sliders__unavailable-detail';
    detail.textContent = entry.detail;
    item.append(label, badge, detail);
    unavailableList.append(item);
  }
  unavailableSection.append(unavailableTitle, unavailableList);

  restoreSection.className = 'style-sliders__restore';
  restoreTitle.className = 'style-sliders__restore-title';
  restoreTitle.textContent = 'Revino la o versiune anterioară';
  restoreReason.className = 'style-sliders__restore-reason';
  restoreReason.setAttribute('role', 'note');
  restoreReason.setAttribute('id', `${panelId}-restore-reason`);
  restoreReason.textContent =
    'Restaurarea cere confirmare și publică o activare nouă; versiunea veche nu este editată.';
  restoreSelect.className = 'style-sliders__restore-select';
  restoreSelect.setAttribute('aria-label', 'Versiune anterioară de restaurat');
  restoreSelect.setAttribute('aria-describedby', `${panelId}-restore-reason`);
  restoreButton.className = 'style-sliders__restore-button';
  restoreButton.setAttribute('type', 'button');
  restoreButton.textContent = 'Restaurează';
  restoreButton.setAttribute('disabled', '');
  confirmButton.className = 'style-sliders__confirm-button';
  confirmButton.setAttribute('type', 'button');
  confirmButton.setAttribute('hidden', '');
  confirmButton.textContent = 'Confirmă restaurarea';
  restoreSection.append(restoreTitle, restoreReason, restoreSelect, restoreButton, confirmButton);

  status.className = 'style-sliders__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');

  root.append(header, stale, list, issues, unavailableSection, restoreSection, status);
  host.append(root);

  let disposed = false,
    busy = false,
    emitting = false,
    active = false,
    resetPending = false,
    confirmingRestore: string | null = null,
    current = options.draft,
    view = initial,
    lastSignature = '',
    lastClock = -Infinity,
    lastOutputWrite = -Infinity,
    writes = 0,
    renders = 0,
    skipped = 0,
    inputEvents = 0,
    throttledReads = 0,
    changes = 0,
    applies = 0,
    cancels = 0,
    resets = 0,
    rebases = 0,
    restoreIntents = 0,
    restoreConfirms = 0,
    tabs = 0,
    updates = 0;
  const pending = new Map<string, number>();
  let queuedDraft: StyleSlidersDraft | null = null;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Style sliders reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
      if (queuedDraft !== null) {
        const next = queuedDraft;
        queuedDraft = null;
        applyDraft(next, false);
      }
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Style sliders disposed');
  };
  const now = () => {
    const value = clock();
    if (!Number.isFinite(value)) throw new Error('Style sliders clock');
    return value;
  };
  const set = (node: HTMLElement, text: string) => {
    if (node.textContent === text) return;
    node.textContent = text;
    writes += 1;
  };
  const setValue = (node: HTMLInputElement, value: number) => {
    const text = String(value);
    if (node.value === text) return;
    node.value = text;
    writes += 1;
  };
  const attribute = (node: HTMLElement, name: string, value: string) => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };
  const removeAttribute = (node: HTMLElement, name: string) => {
    if (!node.hasAttribute(name)) return;
    node.removeAttribute(name);
    writes += 1;
  };

  const rowOf = (field: string): SliderRow => {
    const row = rows.get(field);
    if (row === undefined) throw new Error('Style sliders row');
    return row;
  };
  const writeRow = (row: StyleSlidersProjection['rows'][number]) => {
    const node = rowOf(row.field);
    if (!row.enabled || row.displayValue === null) {
      attribute(node.input, 'disabled', '');
      attribute(node.root, 'data-unavailable', row.reason ?? 'NOT_IN_BASE');
      set(node.output, '—');
      attribute(node.input, 'aria-valuetext', row.valueText);
      return;
    }
    removeAttribute(node.input, 'disabled');
    removeAttribute(node.root, 'data-unavailable');
    setValue(node.input, row.displayValue);
    set(node.output, row.text);
    attribute(node.input, 'aria-valuetext', row.valueText);
    attribute(node.root, 'data-changed', String(row.changed));
    attribute(node.root, 'data-provenance', row.valueProvenance);
  };

  const renderRestore = (projection: StyleSlidersProjection) => {
    const options_ = projection.history.filter((entry) => !entry.current),
      signature = options_.map((entry) => `${entry.versionId}:${entry.changedKeys}`).join('|');
    if (restoreSelect.getAttribute('data-signature') !== signature) {
      while (restoreSelect.children.length > 0) restoreSelect.children[0]?.remove();
      for (const entry of options_) {
        const option = element('option');
        option.value = entry.versionId;
        option.textContent = `${entry.versionId} · ${entry.changedKeys} ${entry.changedKeys === 1 ? 'cheie' : 'chei'} · ${entry.createdAt}`;
        restoreSelect.append(option);
      }
      attribute(restoreSelect, 'data-signature', signature);
      writes += 1;
    }
    if (options_.length === 0) {
      attribute(restoreButton, 'disabled', '');
      attribute(restoreSelect, 'disabled', '');
    } else {
      removeAttribute(restoreButton, 'disabled');
      removeAttribute(restoreSelect, 'disabled');
    }
    const selected = restoreSelect.value;
    if (confirmingRestore !== null && confirmingRestore !== selected) confirmingRestore = null;
    if (confirmingRestore === null) {
      set(restoreButton, 'Restaurează');
      attribute(confirmButton, 'hidden', '');
      removeAttribute(restoreButton, 'data-confirming');
    } else {
      set(restoreButton, 'Renunță');
      removeAttribute(confirmButton, 'hidden');
      attribute(restoreButton, 'data-confirming', 'true');
      attribute(confirmButton, 'aria-label', `Confirmă restaurarea versiunii ${confirmingRestore}`);
    }
  };

  const render = (projection: StyleSlidersProjection) => {
    for (const row of projection.rows) writeRow(row);
    set(
      summary,
      `Versiunea editată: ${projection.baseVersionId}. ${projection.changedCount} ${projection.changedCount === 1 ? 'diferență' : 'diferențe'} față de ea; se publică doar diferențele.`,
    );
    set(status, `${STYLE_SLIDERS_SAVE_STATE_LABELS[projection.saveState]}. ${projection.summary}`);
    set(issues, projection.issues.map((issue) => issue.message).join(' '));
    if (projection.issues.length === 0) attribute(issues, 'hidden', '');
    else removeAttribute(issues, 'hidden');
    attribute(root, 'data-save-state', projection.saveState);
    attribute(root, 'data-changed', String(projection.changedCount));
    if (projection.saveState === 'STALE' || projection.saveState === 'SESSION_CHANGED') {
      removeAttribute(stale, 'hidden');
      set(
        staleText,
        projection.saveState === 'STALE'
          ? 'Versiunea activă este alta decât baza draftului. Reîncarcă baza; nimic nu este suprascris tăcut.'
          : 'Sesiunea activă s-a schimbat; draftul a fost invalidat.',
      );
      if (projection.saveState === 'SESSION_CHANGED') attribute(rebaseButton, 'disabled', '');
      else removeAttribute(rebaseButton, 'disabled');
    } else {
      attribute(stale, 'hidden', '');
    }
    renderRestore(projection);
    lastSignature = projection.signature;
    renders += 1;
  };
  const applyDraft = (next: StyleSlidersDraft, notify: boolean) => {
    const parsed = applyStyleSliderDraftChange(current, next);
    const projected = projectStyleSliders(parsed);
    current = parsed;
    view = projected;
    if (projected.signature === lastSignature) {
      skipped += 1;
      return;
    }
    render(projected);
    if (notify && options.onChange !== undefined && !emitting) {
      emitting = true;
      try {
        options.onChange(current);
      } finally {
        emitting = false;
      }
    }
  };
  const commitField = (field: string) => {
    const row = rowOf(field),
      value = pending.get(field) ?? Number(row.input.value);
    pending.delete(field);
    lastOutputWrite = -Infinity;
    changes += 1;
    resetPending = false;
    if (!isStyleSliderField(field)) return;
    const definition = view.rows.find((entry) => entry.field === field);
    if (definition === undefined || !definition.enabled) return;
    applyDraft(setStyleSliderValue(current, field, value), true);
  };
  const flushReadout = (field: string) => {
    const row = rowOf(field),
      value = pending.get(field) ?? Number(row.input.value),
      definition = view.rows.find((entry) => entry.field === field);
    if (!Number.isFinite(value) || definition === undefined) return;
    throttledReads += 1;
    set(row.output, styleSliderText(definition.field, value));
    attribute(row.input, 'aria-valuetext', styleSliderValueText(definition.field, value));
  };

  const listen = (node: HTMLElement, type: string, handler: () => void): void => {
    node.addEventListener(type, handler as unknown as (event: Event) => void);
    controls.push({ node, type, handler });
  };
  for (const field of STYLE_SLIDER_FIELDS) {
    const row = rowOf(field);
    listen(row.input, 'input', () => {
      inputEvents += 1;
      const value = Number(row.input.value);
      if (!Number.isFinite(value)) return;
      pending.set(field, value);
      const at = now();
      if (shouldWriteStyleSliders(lastOutputWrite, at)) {
        lastOutputWrite = at;
        flushReadout(field);
      }
    });
    listen(row.input, 'change', () => commitField(field));
  }
  listen(rebaseButton, 'click', () =>
    mutate(() => {
      assertLive();
      if (options.rebase === undefined) {
        set(status, 'Baza nu poate fi reîncărcată de această suprafață.');
        return;
      }
      rebases += 1;
      options.rebase(current);
    }),
  );
  listen(restoreSelect, 'change', () =>
    mutate(() => {
      assertLive();
      confirmingRestore = null;
      render(view);
    }),
  );
  listen(restoreButton, 'click', () =>
    mutate(() => {
      assertLive();
      const selected = restoreSelect.value;
      if (selected === '') {
        set(status, 'Alege mai întâi o versiune din listă.');
        return;
      }
      if (confirmingRestore === selected) {
        confirmingRestore = null;
        restoreIntents += 1;
        restoreConfirms += 1;
        render(view);
        set(
          status,
          `Restaurarea versiunii ${selected} a fost cerută. Se publică la următorul tick.`,
        );
        if (options.restore !== undefined && !emitting) {
          emitting = true;
          try {
            options.restore(selected);
          } finally {
            emitting = false;
          }
        }
        return;
      }
      confirmingRestore = selected;
      render(view);
      set(
        status,
        `Confirmă restaurarea versiunii ${selected}. Versiunea actuală nu este editată; se publică o activare nouă.`,
      );
    }),
  );
  listen(confirmButton, 'click', () =>
    mutate(() => {
      assertLive();
      const selected = confirmingRestore;
      if (selected === null) return;
      confirmingRestore = null;
      restoreIntents += 1;
      restoreConfirms += 1;
      render(view);
      set(status, `Restaurarea versiunii ${selected} a fost cerută. Se publică la următorul tick.`);
      if (options.restore !== undefined && !emitting) {
        emitting = true;
        try {
          options.restore(selected);
        } finally {
          emitting = false;
        }
      }
    }),
  );

  const chrome = (): StyleSlidersChrome =>
    Object.freeze({
      applyDisabled: !view.canApply,
      cancelDisabled: view.changedCount === 0,
      resetLabel: 'Revino la versiunea activă',
      note: 'Aplică publică doar diferențele, ca versiune MANUAL_TUNING, la următorul tick comun pentru taxiuri și civili.',
      saveState: view.saveState,
      saveStateLabel: STYLE_SLIDERS_SAVE_STATE_LABELS[view.saveState],
    });

  const handle = (action: StyleSlidersAction): void =>
    mutate(() => {
      assertLive();
      if (action === 'APPLY') {
        if (view.saveState === 'STALE') {
          set(status, 'Versiunea activă s-a schimbat; reîncarcă baza înainte de aplicare.');
          return;
        }
        if (view.saveState === 'SESSION_CHANGED') {
          set(status, 'Sesiunea activă s-a schimbat; draftul nu mai poate fi aplicat.');
          return;
        }
        if (!view.canApply) {
          set(
            status,
            view.saveState === 'UNCHANGED'
              ? 'Nicio diferență de aplicat; nu se creează versiune.'
              : 'Corectează valorile din afara limitelor înainte de aplicare.',
          );
          return;
        }
        applies += 1;
        set(
          status,
          'Aplicarea a fost cerută: doar diferențele, ca versiune MANUAL_TUNING, la următorul tick.',
        );
        if (options.apply !== undefined && !emitting) {
          emitting = true;
          try {
            options.apply(current);
          } finally {
            emitting = false;
          }
        }
        return;
      }
      if (action === 'CANCEL') {
        resetPending = false;
        cancels += 1;
        applyDraft(revertStyleSlidersDraft(current), true);
        set(status, 'Modificările locale au fost anulate; versiunea activă rămâne neschimbată.');
        if (options.cancel !== undefined && !emitting) {
          emitting = true;
          try {
            options.cancel(current);
          } finally {
            emitting = false;
          }
        }
        return;
      }
      if (!resetPending) {
        resetPending = true;
        set(
          status,
          'Apasă din nou pentru a propune valorile versiunii active; nimic nu este aplicat încă.',
        );
        return;
      }
      resetPending = false;
      resets += 1;
      applyDraft(revertStyleSlidersDraft(current), true);
      set(status, 'Valorile versiunii active sunt propuse local. Aplică pentru a le păstra.');
      if (options.reset !== undefined && !emitting) {
        emitting = true;
        try {
          options.reset(current);
        } finally {
          emitting = false;
        }
      }
    });

  render(view);

  return Object.freeze({
    root,
    setActive(next: boolean) {
      mutate(() => {
        assertLive();
        active = next;
        tabs += 1;
        if (next) removeAttribute(root, 'hidden');
        else attribute(root, 'hidden', '');
        if (next) render(view);
      });
    },
    isActive: () => active,
    setDraft(candidate: StyleSlidersDraft) {
      if (busy) {
        queuedDraft = candidate;
        return;
      }
      mutate(() => {
        assertLive();
        updates += 1;
        applyDraft(candidate, false);
      });
    },
    /** Frame hook: identical projections write nothing and never exceed the 10 Hz ceiling. */
    update(candidate: StyleSlidersDraft, nowMs: number) {
      if (busy) {
        queuedDraft = candidate;
        return;
      }
      mutate(() => {
        assertLive();
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Style sliders clock');
        lastClock = nowMs;
        updates += 1;
        const projected = projectStyleSliders(candidate);
        if (projected.signature === lastSignature) {
          skipped += 1;
          return;
        }
        if (!shouldWriteStyleSliders(lastOutputWrite, nowMs)) {
          skipped += 1;
          return;
        }
        lastOutputWrite = nowMs;
        applyDraft(candidate, false);
      });
    },
    announce(text: string) {
      mutate(() => {
        assertLive();
        if (typeof text !== 'string' || text.length === 0 || text.length > 512)
          throw new Error('Style sliders announcement');
        set(status, text);
      });
    },
    handle,
    getChrome: chrome,
    getDraft: () => current,
    getView: () => view,
    focusables(): HTMLElement[] {
      const ordered: HTMLElement[] = [];
      for (const field of STYLE_SLIDER_FIELDS) {
        const row = rowOf(field);
        if (!row.input.hasAttribute('disabled')) ordered.push(row.input);
      }
      if (!rebaseButton.hasAttribute('disabled') && !stale.hasAttribute('hidden'))
        ordered.push(rebaseButton);
      if (!restoreSelect.hasAttribute('disabled')) ordered.push(restoreSelect);
      if (!restoreButton.hasAttribute('disabled')) ordered.push(restoreButton);
      if (!confirmButton.hasAttribute('hidden')) ordered.push(confirmButton);
      return ordered.filter((node) => !node.hasAttribute('hidden'));
    },
    getStats: () =>
      Object.freeze({
        version: view.version,
        tuningMapVersion: view.tuningMapVersion,
        fields: STYLE_SLIDER_FIELDS.length,
        unavailableRows: STYLE_SLIDER_UNAVAILABLE.length,
        writeHz: 10 as const,
        writes,
        renders,
        skipped,
        inputEvents,
        throttledReads,
        updates,
        changes,
        applies,
        cancels,
        resets,
        rebases,
        restoreIntents,
        restoreConfirms,
        tabs,
        active,
        globalListeners: 0 as const,
        lastSignature,
        saveState: view.saveState,
        disposed,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const control of controls)
          control.node.removeEventListener(
            control.type,
            control.handler as unknown as (event: Event) => void,
          );
        controls.length = 0;
        rows.clear();
        pending.clear();
        root.remove();
      });
    },
  });
}

export type StyleSlidersTab = ReturnType<typeof createStyleSlidersTab>;

let nextStylePanelId = 1;

/** Bounded contract facts for evidence. */
export const STYLE_SLIDERS_TAB_LIMITS = Object.freeze({
  fields: STYLE_SLIDER_FIELDS.length,
  unavailableRows: STYLE_SLIDER_UNAVAILABLE.length,
  historyRows: 8,
  retainedDrafts: 1,
  globalListeners: 0,
});

export { STYLE_SLIDERS_DESCRIPTION, STYLE_SLIDERS_TITLE };
