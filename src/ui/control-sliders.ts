import {
  CONTROL_SLIDER_ENDS,
  CONTROL_SLIDER_FIELDS,
  CONTROL_SLIDER_HINTS,
  CONTROL_SLIDER_LABELS,
  CONTROL_SLIDER_PRESET_LABELS,
  CONTROL_SLIDER_PRESET_VALUES,
  CONTROL_SLIDER_PRESETS,
  CONTROL_SLIDER_RANGES,
  CONTROL_SLIDERS_CITY_TAB,
  CONTROL_SLIDERS_CITY_TAB_LABEL,
  CONTROL_SLIDERS_CITY_TAB_REASON,
  CONTROL_SLIDERS_CONTROL_TAB,
  CONTROL_SLIDERS_DESCRIPTION,
  CONTROL_SLIDERS_POLICY,
  CONTROL_SLIDERS_SAVE_STATE_LABELS,
  CONTROL_SLIDERS_TITLE,
  CONTROL_SLIDERS_VERSION,
  CONTROL_SLIDERS_WRITE_INTERVAL_MS,
  applyControlSliderPreset,
  controlSliderText,
  controlSliderValueText,
  parseControlSlidersDraft,
  projectControlSliders,
  resetControlSlidersDraft,
  revertControlSlidersDraft,
  setControlSliderValue,
  shouldWriteControlSliders,
  type ControlSliderField,
  type ControlSliderPreset,
  type ControlSlidersDraft,
  type ControlSlidersProjection,
} from './control-sliders-format';
import {
  createStyleSlidersTab,
  type StyleSlidersTab,
  type StyleSlidersTabOptions,
} from './style-sliders';
import type { StyleSlidersDraft, StyleSlidersProjection } from './style-sliders-format';

export type { StyleSlidersTab, StyleSlidersTabOptions };

export type ControlSlidersCloseReason = 'ESCAPE' | 'CLOSE';

export interface ControlSlidersPanelOptions {
  /** Escape and the visible „Închide” both go through this host port. */
  readonly close: (reason: ControlSlidersCloseReason) => void;
  /** Called after every committed local draft change (never during a drag). */
  readonly onChange?: (draft: ControlSlidersDraft) => void;
  /** Exactly one apply intention per click; the panel never writes settings itself. */
  readonly apply?: (draft: ControlSlidersDraft) => void;
  /** Called after „Anulează” restored the persisted preferences locally. */
  readonly cancel?: (draft: ControlSlidersDraft) => void;
  /** Called after the confirmed „Revino la valorile inițiale”. */
  readonly reset?: (draft: ControlSlidersDraft) => void;
  /**
   * Optional 230 „Cum conduce orașul” tab. When omitted, the city tab keeps the explicit 229
   * placeholder, so existing 229 hosts and tests are unaffected.
   */
  readonly style?: StyleSlidersTabOptions;
  /** Injected clock for the 10 Hz read-out ceiling; defaults to `performance.now`. */
  readonly now?: () => number;
}

type ControlSlidersActiveTab = 'CONTROL' | 'CITY';

interface SliderRow {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

/**
 * 229 control & comfort sliders popup adapter.
 *
 * The DOM is built once with stable nodes and native `input[type=range]` controls, so arrows,
 * PageUp/PageDown, Home/End, pointer drag and touch all work without a synthetic key handler. Each
 * control owns exactly one `change` listener and each slider one `input` listener for its read-out;
 * no listener is installed on `window` or `document`. A drag only writes the local read-out, at most
 * `CONTROL_SLIDERS_WRITE_HZ` times per second, and commits one draft revision when the gesture ends.
 * Nothing is applied to settings until the host calls `apply` and the real tick applies it.
 */
export function createControlSlidersPanel(
  host: HTMLElement,
  draft: ControlSlidersDraft,
  options: ControlSlidersPanelOptions,
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Control sliders requires an owned document');
  if (typeof options?.close !== 'function') throw new Error('Control sliders close port');
  for (const port of ['onChange', 'apply', 'cancel', 'reset'] as const)
    if (options[port] !== undefined && typeof options[port] !== 'function')
      throw new Error(`Control sliders ${port} port`);
  const clock = options.now ?? (() => performance.now());
  if (typeof clock !== 'function') throw new Error('Control sliders clock');
  const styleOptions = options.style;
  if (styleOptions !== undefined && typeof styleOptions !== 'object')
    throw new Error('Control sliders style tab options');

  const initial = parseControlSlidersDraft(draft),
    player = initial.playerId,
    panelId = `control-sliders-${nextPanelId++}`,
    titleId = `${panelId}-title`,
    descriptionId = `${panelId}-description`,
    controlId = (name: string) => `${panelId}-${name}`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);
  const controls: {
    readonly node: HTMLElement;
    readonly type: string;
    readonly handler: () => void;
  }[] = [];

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    live = element('p'),
    description = element('p'),
    tabs = element('div'),
    controlTab = element('button'),
    cityTab = element('button'),
    panels = element('div'),
    panel = element('section'),
    policy = element('p'),
    presetGroup = element('div'),
    list = element('div'),
    issues = element('p'),
    footer = element('footer'),
    resetButton = element('button'),
    applyButton = element('button'),
    cancelButton = element('button'),
    closeButton = element('button'),
    footerNote = element('p');

  root.className = 'control-sliders';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', titleId);
  root.setAttribute('aria-describedby', descriptionId);
  root.setAttribute('data-panel', 'controlSliders');

  header.className = 'control-sliders__header';
  title.className = 'control-sliders__title';
  title.setAttribute('id', titleId);
  title.textContent = CONTROL_SLIDERS_TITLE;
  live.className = 'control-sliders__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  description.className = 'control-sliders__description';
  description.setAttribute('id', descriptionId);
  description.textContent = CONTROL_SLIDERS_DESCRIPTION;
  header.append(title, live);

  tabs.className = 'control-sliders__tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Taburi de reglaje');
  controlTab.className = 'control-sliders__tab control-sliders__tab--active';
  controlTab.setAttribute('type', 'button');
  controlTab.setAttribute('role', 'tab');
  controlTab.setAttribute('id', controlId('tab-control'));
  controlTab.setAttribute('aria-selected', 'true');
  controlTab.setAttribute('aria-controls', controlId('panel-control'));
  controlTab.textContent = CONTROL_SLIDERS_CONTROL_TAB;
  cityTab.className =
    styleOptions === undefined
      ? 'control-sliders__tab control-sliders__tab--unavailable'
      : 'control-sliders__tab';
  cityTab.setAttribute('type', 'button');
  cityTab.setAttribute('role', 'tab');
  cityTab.setAttribute('id', controlId('tab-city'));
  cityTab.setAttribute('aria-selected', 'false');
  if (styleOptions === undefined) {
    cityTab.setAttribute('disabled', '');
    cityTab.setAttribute('data-state', 'UNAVAILABLE');
    cityTab.setAttribute('data-reason', CONTROL_SLIDERS_CITY_TAB_REASON);
    cityTab.setAttribute(
      'aria-label',
      `${CONTROL_SLIDERS_CITY_TAB}, ${CONTROL_SLIDERS_CITY_TAB_LABEL}`,
    );
    cityTab.textContent = `${CONTROL_SLIDERS_CITY_TAB} · ${CONTROL_SLIDERS_CITY_TAB_LABEL}`;
  } else {
    cityTab.setAttribute('data-state', 'AVAILABLE');
    cityTab.setAttribute('aria-controls', '');
    cityTab.textContent = CONTROL_SLIDERS_CITY_TAB;
  }
  tabs.append(controlTab, cityTab);

  panel.className = 'control-sliders__panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('id', controlId('panel-control'));
  panel.setAttribute('aria-labelledby', controlId('tab-control'));
  panels.className = 'control-sliders__panels';
  panels.append(panel);
  policy.className = 'control-sliders__policy';
  policy.textContent = CONTROL_SLIDERS_POLICY;
  presetGroup.className = 'control-sliders__presets';
  presetGroup.setAttribute('role', 'group');
  presetGroup.setAttribute('aria-label', 'Preseturi de control');

  const presetButtons = new Map<ControlSliderPreset, HTMLButtonElement>();
  for (const preset of CONTROL_SLIDER_PRESETS) {
    const definition = CONTROL_SLIDER_PRESET_VALUES[preset],
      button = element('button');
    button.className = 'control-sliders__preset';
    button.setAttribute('type', 'button');
    button.setAttribute('data-preset', preset);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${definition.label}: ${definition.description}`);
    button.textContent = CONTROL_SLIDER_PRESET_LABELS[preset];
    button.setAttribute('title', definition.description);
    presetButtons.set(preset, button);
    presetGroup.append(button);
  }

  list.className = 'control-sliders__list';
  list.setAttribute('aria-label', 'Slidere de control și confort');

  const rows = new Map<ControlSliderField, SliderRow>();
  for (const field of CONTROL_SLIDER_FIELDS) {
    const row = element('div'),
      label = element('label'),
      output = element('output'),
      hint = element('p'),
      input = element('input'),
      ends = element('div'),
      minEnd = element('span'),
      maxEnd = element('span'),
      id = controlId(field);
    row.className = 'control-sliders__row';
    row.setAttribute('data-field', field);
    label.className = 'control-sliders__label';
    label.setAttribute('for', id);
    label.textContent = CONTROL_SLIDER_LABELS[field];
    output.className = 'control-sliders__value';
    output.setAttribute('for', id);
    hint.className = 'control-sliders__hint';
    hint.setAttribute('id', `${id}-hint`);
    hint.textContent = CONTROL_SLIDER_HINTS[field];
    input.className = 'control-sliders__range';
    input.setAttribute('type', 'range');
    input.setAttribute('id', id);
    input.setAttribute('min', String(CONTROL_SLIDER_RANGES[field].min));
    input.setAttribute('max', String(CONTROL_SLIDER_RANGES[field].max));
    input.setAttribute('step', String(CONTROL_SLIDER_RANGES[field].step));
    input.setAttribute('aria-describedby', `${id}-hint`);
    ends.className = 'control-sliders__ends';
    ends.setAttribute('aria-hidden', 'true');
    minEnd.textContent = CONTROL_SLIDER_ENDS[field].min;
    maxEnd.textContent = CONTROL_SLIDER_ENDS[field].max;
    ends.append(minEnd, maxEnd);
    row.append(label, output, hint, input, ends);
    list.append(row);
    rows.set(field, { root: row, input, output });
  }

  issues.className = 'control-sliders__issues';
  issues.setAttribute('role', 'alert');
  issues.setAttribute('hidden', '');

  footer.className = 'control-sliders__footer';
  resetButton.className = 'control-sliders__reset';
  applyButton.className = 'control-sliders__apply';
  cancelButton.className = 'control-sliders__cancel';
  closeButton.className = 'control-sliders__close';
  for (const button of [resetButton, applyButton, cancelButton, closeButton])
    button.setAttribute('type', 'button');
  resetButton.textContent = 'Revino la valorile inițiale';
  applyButton.textContent = 'Aplică';
  cancelButton.textContent = 'Anulează';
  closeButton.textContent = 'Închide';
  footerNote.className = 'control-sliders__note';
  footerNote.textContent =
    'Aplicarea se face la următorul tick, cu o versiune nouă de control; tastaturile rămân neschimbate.';
  footer.append(resetButton, applyButton, cancelButton, closeButton, footerNote);

  panel.append(policy, presetGroup, list, issues);
  root.append(header, description, tabs, panels, footer);
  host.append(root);

  const styleTab: StyleSlidersTab | null =
    styleOptions === undefined
      ? null
      : createStyleSlidersTab(panels, {
          ...styleOptions,
          onChange: (next) => {
            styleOptions.onChange?.(next);
            if (activeTab === 'CITY') refreshFooter();
          },
        });
  if (styleTab !== null) {
    styleTab.root.setAttribute('aria-labelledby', cityTab.id);
    cityTab.setAttribute('aria-controls', styleTab.root.id);
    styleTab.setActive(false);
  }
  let activeTab: ControlSlidersActiveTab = 'CONTROL';

  let disposed = false,
    busy = false,
    emitting = false,
    resetPending = false,
    current = initial,
    view: ControlSlidersProjection = projectControlSliders(initial),
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
    presetUses = 0,
    updates = 0,
    escapes = 0,
    closeRequests = 0,
    focusMoves = 0,
    focusRestores = 0,
    tabSwitches = 0,
    styleApplies = 0,
    open = false,
    previousFocus: HTMLElement | null = null;
  const pending = new Map<ControlSliderField, number>();

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Control sliders reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Control sliders disposed');
  };
  const now = () => {
    const value = clock();
    if (!Number.isFinite(value)) throw new Error('Control sliders clock');
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

  const rowOf = (field: ControlSliderField): SliderRow => {
    const row = rows.get(field);
    if (row === undefined) throw new Error('Control sliders row');
    return row;
  };
  const writeRow = (field: ControlSliderField, value: number) => {
    const row = rowOf(field);
    setValue(row.input, value);
    set(row.output, controlSliderText(field, value));
    attribute(row.input, 'aria-valuetext', controlSliderValueText(field, value));
  };
  const render = (projected: ControlSlidersProjection) => {
    for (const field of CONTROL_SLIDER_FIELDS) writeRow(field, projected.values[field]);
    for (const preset of CONTROL_SLIDER_PRESETS) {
      const button = presetButtons.get(preset);
      if (button === undefined) throw new Error('Control sliders preset');
      attribute(button, 'aria-pressed', projected.activePreset === preset ? 'true' : 'false');
    }
    set(live, `${CONTROL_SLIDERS_SAVE_STATE_LABELS[projected.saveState]}. ${projected.summary}`);
    set(issues, projected.issues.map((issue) => issue.message).join(' '));
    if (projected.issues.length === 0) attribute(issues, 'hidden', '');
    else removeAttribute(issues, 'hidden');
    attribute(root, 'data-save-state', projected.saveState);
    attribute(root, 'data-changed', String(projected.changedCount));
    if (activeTab === 'CONTROL') {
      if (projected.canApply) removeAttribute(applyButton, 'disabled');
      else attribute(applyButton, 'disabled', '');
      if (projected.changedCount > 0) removeAttribute(cancelButton, 'disabled');
      else attribute(cancelButton, 'disabled', '');
      set(resetButton, 'Revino la valorile inițiale');
      set(
        footerNote,
        'Aplicarea se face la următorul tick, cu o versiune nouă de control; tastaturile rămân neschimbate.',
      );
      attribute(root, 'data-tab', 'CONTROL');
    }
    lastSignature = projected.signature;
    renders += 1;
  };
  const refreshFooter = () => {
    if (activeTab === 'CITY' && styleTab !== null) {
      const chrome = styleTab.getChrome();
      if (chrome.applyDisabled) attribute(applyButton, 'disabled', '');
      else removeAttribute(applyButton, 'disabled');
      if (chrome.cancelDisabled) attribute(cancelButton, 'disabled', '');
      else removeAttribute(cancelButton, 'disabled');
      set(resetButton, chrome.resetLabel);
      set(footerNote, chrome.note);
      attribute(root, 'data-tab', 'CITY');
      attribute(cityTab, 'data-save-state', chrome.saveState);
      return;
    }
    attribute(root, 'data-tab', 'CONTROL');
    removeAttribute(cityTab, 'data-save-state');
    render(view);
  };
  const selectTab = (tab: ControlSlidersActiveTab) => {
    if (styleTab === null && tab === 'CITY') return;
    activeTab = tab;
    resetPending = false;
    attribute(controlTab, 'aria-selected', tab === 'CONTROL' ? 'true' : 'false');
    attribute(controlTab, 'tabindex', tab === 'CONTROL' ? '0' : '-1');
    attribute(cityTab, 'aria-selected', tab === 'CITY' ? 'true' : 'false');
    attribute(cityTab, 'tabindex', tab === 'CITY' ? '0' : '-1');
    attribute(
      controlTab,
      'class',
      `control-sliders__tab${tab === 'CONTROL' ? ' control-sliders__tab--active' : ''}`,
    );
    attribute(
      cityTab,
      'class',
      `control-sliders__tab${tab === 'CITY' ? ' control-sliders__tab--active' : ''}`,
    );
    if (tab === 'CONTROL') removeAttribute(panel, 'hidden');
    else attribute(panel, 'hidden', '');
    styleTab?.setActive(tab === 'CITY');
    tabSwitches += 1;
    refreshFooter();
  };
  const applyDraft = (next: ControlSlidersDraft, notify: boolean) => {
    const parsed = parseControlSlidersDraft(next);
    if (parsed.playerId !== player) throw new Error('Control sliders belong to another player');
    const projected = projectControlSliders(parsed);
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
  const commitField = (field: ControlSliderField) => {
    const row = rowOf(field),
      value = pending.get(field) ?? Number(row.input.value);
    pending.delete(field);
    lastOutputWrite = -Infinity;
    writeRow(field, value);
    changes += 1;
    resetPending = false;
    set(resetButton, 'Revino la valorile inițiale');
    applyDraft(setControlSliderValue(current, field, value), true);
  };
  const flushReadout = (field: ControlSliderField) => {
    const row = rowOf(field),
      value = pending.get(field) ?? Number(row.input.value);
    if (!Number.isFinite(value)) return;
    throttledReads += 1;
    set(row.output, controlSliderText(field, value));
    attribute(row.input, 'aria-valuetext', controlSliderValueText(field, value));
  };

  const focusOrder = (): HTMLElement[] => {
    const ordered: HTMLElement[] = [controlTab];
    if (styleTab !== null) ordered.push(cityTab);
    if (activeTab === 'CITY' && styleTab !== null) {
      for (const node of styleTab.focusables()) ordered.push(node);
    } else {
      for (const preset of CONTROL_SLIDER_PRESETS) {
        const button = presetButtons.get(preset);
        if (button !== undefined) ordered.push(button);
      }
      for (const field of CONTROL_SLIDER_FIELDS) ordered.push(rowOf(field).input);
    }
    ordered.push(resetButton, applyButton, cancelButton, closeButton);
    return ordered.filter((node) => !node.hasAttribute('disabled') && !node.hasAttribute('hidden'));
  };
  const focusNode = (node: HTMLElement) => {
    if (typeof node.focus !== 'function') return;
    node.focus();
    focusMoves += 1;
  };
  function onKeyDown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      escapes += 1;
      close('ESCAPE');
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const order = focusOrder();
    if (order.length === 0) return;
    const active = doc?.activeElement as HTMLElement | null,
      index = active === null ? -1 : order.indexOf(active),
      step = event.shiftKey ? -1 : 1,
      next =
        index === -1
          ? order[step === 1 ? 0 : order.length - 1]
          : order[(index + step + order.length) % order.length];
    if (next !== undefined) focusNode(next);
  }
  const openPanel = () => {
    if (open) return;
    open = true;
    previousFocus =
      doc?.activeElement && typeof (doc.activeElement as HTMLElement).focus === 'function'
        ? (doc.activeElement as HTMLElement)
        : null;
    root.addEventListener('keydown', onKeyDown as unknown as (event: Event) => void);
    attribute(root, 'data-focus-state', 'OPEN');
    const order = focusOrder();
    if (order[0] !== undefined) focusNode(order[0]);
  };
  const closePanel = () => {
    if (!open) return;
    open = false;
    root.removeEventListener('keydown', onKeyDown as unknown as (event: Event) => void);
    removeAttribute(root, 'data-focus-state');
    if (previousFocus !== null && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
      focusRestores += 1;
    }
    previousFocus = null;
  };
  function close(reason: ControlSlidersCloseReason) {
    closeRequests += 1;
    closePanel();
    options.close(reason);
  }

  const listen = (node: HTMLElement, type: string, handler: () => void): void => {
    node.addEventListener(type, handler as unknown as (event: Event) => void);
    controls.push({ node, type, handler });
  };
  for (const field of CONTROL_SLIDER_FIELDS) {
    const row = rowOf(field);
    listen(row.input, 'input', () => {
      inputEvents += 1;
      const value = Number(row.input.value);
      if (!Number.isFinite(value)) return;
      pending.set(field, value);
      const at = now();
      if (shouldWriteControlSliders(lastOutputWrite, at)) {
        lastOutputWrite = at;
        flushReadout(field);
      }
    });
    listen(row.input, 'change', () => commitField(field));
  }
  for (const preset of CONTROL_SLIDER_PRESETS) {
    const button = presetButtons.get(preset);
    if (button === undefined) throw new Error('Control sliders preset');
    listen(button, 'click', () =>
      mutate(() => {
        assertLive();
        presetUses += 1;
        resetPending = false;
        set(resetButton, 'Revino la valorile inițiale');
        applyDraft(applyControlSliderPreset(current, preset), true);
      }),
    );
  }
  if (styleTab !== null) {
    listen(controlTab, 'click', () =>
      mutate(() => {
        assertLive();
        selectTab('CONTROL');
      }),
    );
    listen(cityTab, 'click', () =>
      mutate(() => {
        assertLive();
        selectTab('CITY');
      }),
    );
  }
  listen(resetButton, 'click', () =>
    mutate(() => {
      assertLive();
      if (activeTab === 'CITY' && styleTab !== null) {
        styleTab.handle('RESET');
        refreshFooter();
        return;
      }
      if (!resetPending) {
        resetPending = true;
        set(resetButton, 'Confirmă revenirea');
        set(
          live,
          'Revenirea propune valorile inițiale pentru toate cele șapte slidere. Apasă din nou pentru confirmare; nimic nu este aplicat încă.',
        );
        return;
      }
      resetPending = false;
      set(resetButton, 'Revino la valorile inițiale');
      resets += 1;
      applyDraft(resetControlSlidersDraft(current), true);
      if (options.reset !== undefined && !emitting) {
        emitting = true;
        try {
          options.reset(current);
        } finally {
          emitting = false;
        }
      }
      set(live, 'Valorile inițiale sunt propuse local. Aplică pentru a le păstra.');
    }),
  );
  listen(cancelButton, 'click', () =>
    mutate(() => {
      assertLive();
      if (activeTab === 'CITY' && styleTab !== null) {
        styleTab.handle('CANCEL');
        refreshFooter();
        return;
      }
      resetPending = false;
      set(resetButton, 'Revino la valorile inițiale');
      applyDraft(revertControlSlidersDraft(current), true);
      cancels += 1;
      set(live, 'Modificările locale au fost anulate; reglajele salvate rămân neschimbate.');
      if (options.cancel !== undefined && !emitting) {
        emitting = true;
        try {
          options.cancel(current);
        } finally {
          emitting = false;
        }
      }
    }),
  );
  listen(applyButton, 'click', () =>
    mutate(() => {
      assertLive();
      resetPending = false;
      if (activeTab === 'CITY' && styleTab !== null) {
        const chrome = styleTab.getChrome();
        styleTab.handle('APPLY');
        refreshFooter();
        if (!chrome.applyDisabled && styleTab.getView().canApply) {
          styleApplies += 1;
          // The popup must close so the suspended world reaches the tick that publishes the delta.
          close('CLOSE');
        }
        return;
      }
      set(resetButton, 'Revino la valorile inițiale');
      if (view.saveState !== 'DIRTY') {
        set(
          live,
          view.saveState === 'UNCHANGED'
            ? 'Nicio modificare de aplicat.'
            : 'Corectează valorile din afara limitelor înainte de aplicare.',
        );
        return;
      }
      applies += 1;
      set(
        live,
        'Aplicarea a fost cerută. Se face o singură dată, la următorul tick, cu o versiune nouă de control.',
      );
      if (options.apply !== undefined && !emitting) {
        emitting = true;
        try {
          options.apply(current);
        } finally {
          emitting = false;
        }
      }
    }),
  );
  listen(closeButton, 'click', () => mutate(() => close('CLOSE')));

  render(view);

  return Object.freeze({
    /** Host frame hook: identical projections write nothing and can never exceed the 10 Hz ceiling. */
    update(candidate: ControlSlidersDraft, nowMs: number) {
      mutate(() => {
        assertLive();
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Control sliders clock');
        lastClock = nowMs;
        updates += 1;
        const parsed = parseControlSlidersDraft(candidate),
          projected = projectControlSliders(parsed);
        if (projected.signature === lastSignature) {
          skipped += 1;
          return;
        }
        if (!shouldWriteControlSliders(lastOutputWrite, nowMs)) {
          skipped += 1;
          return;
        }
        lastOutputWrite = nowMs;
        applyDraft(parsed, false);
      });
    },
    setDraft(candidate: ControlSlidersDraft) {
      mutate(() => {
        assertLive();
        updates += 1;
        applyDraft(candidate, false);
      });
    },
    openPanel,
    closePanel,
    announce(text: string) {
      mutate(() => {
        assertLive();
        if (typeof text !== 'string' || text.length === 0 || text.length > 512)
          throw new Error('Control sliders announcement');
        set(live, text);
      });
    },
    getDraft: () => current,
    getView: () => view,
    isOpen: () => open,
    /** The 230 tab, or `null` when this popup was opened without one. */
    getStyleTab: () => styleTab,
    getStyleDraft: (): StyleSlidersDraft | null => styleTab?.getDraft() ?? null,
    getStyleView: (): StyleSlidersProjection | null => styleTab?.getView() ?? null,
    getActiveTab: () => activeTab,
    /** Frame hook of the city tab: same 10 Hz coalescing, no global listener. */
    updateStyle(candidate: StyleSlidersDraft, nowMs: number) {
      if (styleTab === null) throw new Error('Control sliders has no style tab');
      mutate(() => {
        assertLive();
        styleTab.update(candidate, nowMs);
        if (activeTab === 'CITY') refreshFooter();
      });
    },
    setStyleDraft(candidate: StyleSlidersDraft) {
      if (styleTab === null) throw new Error('Control sliders has no style tab');
      mutate(() => {
        assertLive();
        styleTab.setDraft(candidate);
        if (activeTab === 'CITY') refreshFooter();
      });
    },
    getStats: () =>
      Object.freeze({
        version: CONTROL_SLIDERS_VERSION,
        controls: CONTROL_SLIDERS_PANEL_LIMITS.controls,
        presets: CONTROL_SLIDER_PRESETS.length,
        elements: disposed ? 0 : CONTROL_SLIDERS_PANEL_LIMITS.elements,
        textNodes: disposed ? 0 : CONTROL_SLIDERS_PANEL_LIMITS.textNodes,
        listeners: disposed ? 0 : controls.length + (open ? 1 : 0) + (styleTab === null ? 0 : 1),
        writeHz: 10 as const,
        writeIntervalMs: CONTROL_SLIDERS_WRITE_INTERVAL_MS,
        writes,
        renders,
        skipped,
        inputEvents,
        throttledReads,
        updates,
        changes,
        presetsUsed: presetUses,
        applies,
        cancels,
        resets,
        escapes,
        closeRequests,
        focusMoves,
        focusRestores,
        tab: activeTab,
        tabs: styleTab === null ? 1 : 2,
        tabSwitches,
        styleTab: styleTab === null ? ('UNAVAILABLE' as const) : ('AVAILABLE' as const),
        styleApplies,
        styleApplyDisabled: styleTab === null ? true : styleTab.getChrome().applyDisabled,
        styleCancelDisabled: styleTab === null ? true : styleTab.getChrome().cancelDisabled,
        styleSaveState: styleTab === null ? ('UNAVAILABLE' as const) : styleTab.getView().saveState,
        globalListeners: 0 as const,
        saveState:
          activeTab === 'CITY' && styleTab !== null ? styleTab.getView().saveState : view.saveState,
        open,
        disposed,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        closePanel();
        disposed = true;
        for (const control of controls)
          control.node.removeEventListener(
            control.type,
            control.handler as unknown as (event: Event) => void,
          );
        controls.length = 0;
        rows.clear();
        presetButtons.clear();
        pending.clear();
        styleTab?.dispose();
        root.remove();
      });
    },
  });
}

export type ControlSlidersPanel = ReturnType<typeof createControlSlidersPanel>;

let nextPanelId = 1;

/** Bounded contract facts for evidence; no profile or vehicle value appears here. */
export const CONTROL_SLIDERS_PANEL_LIMITS = Object.freeze({
  version: CONTROL_SLIDERS_VERSION,
  controls: 2 + CONTROL_SLIDER_PRESETS.length + CONTROL_SLIDER_FIELDS.length + 4,
  sliderRows: CONTROL_SLIDER_FIELDS.length,
  presets: CONTROL_SLIDER_PRESETS.length,
  elements: 84,
  textNodes: 52,
  listeners: CONTROL_SLIDER_FIELDS.length * 2 + CONTROL_SLIDER_PRESETS.length + 4 + 1,
  retainedDrafts: 1,
  globalListeners: 0,
});
