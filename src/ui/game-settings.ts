import type {
  GameSettingsCameraMode,
  GameSettingsComfortField,
  GameSettingsDraft,
  GameSettingsGraphics,
  GameSettingsProjection,
  GameSettingsSaveState,
  GameSettingsUnits,
} from './game-settings-format';
import {
  GAME_SETTINGS_AUDIO_LABEL,
  GAME_SETTINGS_AUDIO_REASON,
  GAME_SETTINGS_BACKEND_LABELS,
  GAME_SETTINGS_CAMERA_LABELS,
  GAME_SETTINGS_COMFORT_FIELDS,
  GAME_SETTINGS_COMFORT_LABELS,
  GAME_SETTINGS_POLICY,
  GAME_SETTINGS_PRESET_LABELS,
  GAME_SETTINGS_RANGES,
  GAME_SETTINGS_SECTIONS,
  GAME_SETTINGS_SECTION_LABELS,
  GAME_SETTINGS_UNIT_LABELS,
  GAME_SETTINGS_VERSION,
  formatDistanceDisplay,
  formatSpeedDisplay,
  parseGameSettingsDraft,
  projectGameSettings,
  resetGameSettingsDraft,
  revertGameSettingsDraft,
  setCameraMode,
  setComfortValues,
  setDisplayUnits,
  setGraphics,
  unitPreview,
} from './game-settings-format';

export const GAME_SETTINGS_TITLE = 'Setări';
export const GAME_SETTINGS_SAVE_LABEL = 'Salvează';
export const GAME_SETTINGS_RESET_LABEL = 'Resetează';
export const GAME_SETTINGS_RESET_CONFIRM_LABEL = 'Confirmă resetarea';
export const GAME_SETTINGS_CANCEL_LABEL = 'Renunță';
export const GAME_SETTINGS_AUDIO_TEXT = `Audio: ${GAME_SETTINGS_AUDIO_LABEL} · ${GAME_SETTINGS_AUDIO_REASON}`;
export const GAME_SETTINGS_DESCRIPTION =
  'Preferințe de dispozitiv pentru unități, cameră, confort și grafică. Valorile sunt propuse local și se păstrează numai cu Salvează; simularea, profilul învățat, AI-ul și stilul flotei nu sunt modificate.';

export interface GameSettingsPanelOptions {
  /** Optional SI sample used by the live unit preview (defaults to 12.5 m/s and 120 m). */
  readonly preview?: Readonly<{ speedMps: number; distanceM: number }>;
  /** Called after every accepted local draft change. */
  readonly onChange?: (draft: GameSettingsDraft) => void;
  /** Exactly one save intention per click; the panel never persists settings itself. */
  readonly save?: (draft: GameSettingsDraft) => void;
  /** Called after „Renunță” restored the persisted sections locally. */
  readonly cancel?: (draft: GameSettingsDraft) => void;
}

interface ControlNode {
  readonly node: HTMLElement;
  readonly handler: () => void;
}

interface ComfortRow {
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

/**
 * 081 settings panel adapter.
 *
 * The DOM is built once with stable nodes and native `select`, `input[type=range]` and checkbox
 * controls. Each control owns exactly one `change` listener; no listener is installed on `window`,
 * `document` or the host, so the panel never interprets driving input. A click on Salvează emits
 * one `save(draft)` intention through the injected port and nothing else. The learned-style editor
 * is not part of this panel.
 */
export function createGameSettingsPanel(
  host: HTMLElement,
  draft: GameSettingsDraft,
  options: GameSettingsPanelOptions = {},
) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Game settings requires an owned document');
  if (options.onChange !== undefined && typeof options.onChange !== 'function')
    throw new Error('Game settings change port');
  if (options.save !== undefined && typeof options.save !== 'function')
    throw new Error('Game settings save port');
  if (options.cancel !== undefined && typeof options.cancel !== 'function')
    throw new Error('Game settings cancel port');
  const sample = options.preview ?? { speedMps: 12.5, distanceM: 120 };
  if (!Number.isFinite(sample.speedMps) || !Number.isFinite(sample.distanceM))
    throw new Error('Game settings preview sample');

  const initial = parseGameSettingsDraft(draft),
    player = initial.playerId,
    panelId = `game-settings-${nextPanelId++}`,
    descriptionId = `${panelId}-description`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);
  const controls: ControlNode[] = [];
  const listen = (node: HTMLElement, handler: () => void) => {
    node.addEventListener('change', handler);
    controls.push({ node, handler });
  };
  const controlId = (name: string) => `${panelId}-${name}`;
  const select = (name: string, entries: readonly (readonly [string, string])[]) => {
    const node = element('select');
    node.className = 'game-settings__select';
    node.setAttribute('id', controlId(name));
    for (const [value, label] of entries) {
      const option = element('option');
      option.setAttribute('value', value);
      option.textContent = label;
      node.append(option);
    }
    return node;
  };
  const output = (name: string) => {
    const node = element('output');
    node.className = 'game-settings__value';
    node.setAttribute('for', controlId(name));
    return node;
  };
  const range = (
    name: string,
    spec: { readonly min: number; readonly max: number; readonly step: number },
  ) => {
    const node = element('input');
    node.className = 'game-settings__range';
    node.setAttribute('type', 'range');
    node.setAttribute('id', controlId(name));
    node.setAttribute('min', String(spec.min));
    node.setAttribute('max', String(spec.max));
    node.setAttribute('step', String(spec.step));
    return node;
  };
  const row = (
    labelText: string,
    control: HTMLElement,
    name: string,
    visibleValue?: HTMLElement,
  ) => {
    const wrapper = element('div'),
      label = element('label');
    wrapper.className = 'game-settings__row';
    label.className = 'game-settings__label';
    label.setAttribute('for', controlId(name));
    label.textContent = labelText;
    wrapper.append(label, control);
    if (visibleValue !== undefined) wrapper.append(visibleValue);
    return wrapper;
  };
  const section = (name: string, label: string) => {
    const wrapper = element('section'),
      heading = element('h3');
    wrapper.className = 'game-settings__section';
    wrapper.setAttribute('data-section', name);
    heading.className = 'game-settings__heading';
    heading.textContent = label;
    wrapper.append(heading);
    return wrapper;
  };

  const root = element('section'),
    header = element('header'),
    title = element('h2'),
    live = element('p'),
    description = element('p'),
    units = section('units', GAME_SETTINGS_SECTION_LABELS.units),
    camera = section('camera', GAME_SETTINGS_SECTION_LABELS.camera),
    comfort = section('comfort', GAME_SETTINGS_SECTION_LABELS.comfort),
    graphics = section('graphics', GAME_SETTINGS_SECTION_LABELS.graphics),
    audio = section('audio', 'Audio'),
    audioText = element('p'),
    preview = element('p'),
    issues = element('p'),
    footer = element('div'),
    resetButton = element('button'),
    saveButton = element('button'),
    cancelButton = element('button'),
    policy = element('p');

  root.className = 'game-settings';
  root.setAttribute('aria-label', 'Setări joc');
  root.setAttribute('aria-describedby', descriptionId);
  header.className = 'game-settings__header';
  title.className = 'game-settings__title';
  live.className = 'game-settings__live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  description.className = 'game-settings__description';
  description.setAttribute('id', descriptionId);
  description.textContent = GAME_SETTINGS_DESCRIPTION;
  audio.className += ' game-settings__section--unavailable';
  audio.setAttribute('data-state', 'UNAVAILABLE');
  audio.setAttribute('aria-disabled', 'true');
  audioText.className = 'game-settings__audio';
  audioText.textContent = GAME_SETTINGS_AUDIO_TEXT;
  preview.className = 'game-settings__preview';
  issues.className = 'game-settings__issues';
  footer.className = 'game-settings__footer';
  policy.className = 'game-settings__policy';
  policy.textContent = GAME_SETTINGS_POLICY;
  resetButton.className = 'game-settings__reset';
  saveButton.className = 'game-settings__save';
  cancelButton.className = 'game-settings__cancel';
  for (const button of [resetButton, saveButton, cancelButton])
    button.setAttribute('type', 'button');
  title.textContent = GAME_SETTINGS_TITLE;
  resetButton.textContent = GAME_SETTINGS_RESET_LABEL;
  saveButton.textContent = GAME_SETTINGS_SAVE_LABEL;
  cancelButton.textContent = GAME_SETTINGS_CANCEL_LABEL;

  header.append(title, live);
  audio.append(audioText);
  footer.append(resetButton, saveButton, cancelButton, policy);

  const speed = select('speed', [
      ['km/h', GAME_SETTINGS_UNIT_LABELS.speed['km/h']],
      ['mph', GAME_SETTINGS_UNIT_LABELS.speed.mph],
    ]),
    distance = select('distance', [
      ['m', GAME_SETTINGS_UNIT_LABELS.distance.m],
      ['ft', GAME_SETTINGS_UNIT_LABELS.distance.ft],
    ]),
    cameraMode = select('camera', [
      ['CHASE', GAME_SETTINGS_CAMERA_LABELS.CHASE],
      ['FIRST_PERSON', GAME_SETTINGS_CAMERA_LABELS.FIRST_PERSON],
    ]),
    preset = select('preset', [
      ['LOW', GAME_SETTINGS_PRESET_LABELS.LOW],
      ['MEDIUM', GAME_SETTINGS_PRESET_LABELS.MEDIUM],
      ['HIGH', GAME_SETTINGS_PRESET_LABELS.HIGH],
    ]),
    backend = select('backend', [
      ['AUTO', GAME_SETTINGS_BACKEND_LABELS.AUTO],
      ['WEBGPU', GAME_SETTINGS_BACKEND_LABELS.WEBGPU],
      ['WEBGL2', GAME_SETTINGS_BACKEND_LABELS.WEBGL2],
    ]);

  units.append(row('Viteză', speed, 'speed'), row('Distanță', distance, 'distance'));
  camera.append(row('Cameră', cameraMode, 'camera'));

  const comfortRows = new Map<GameSettingsComfortField, ComfortRow>();
  for (const field of GAME_SETTINGS_COMFORT_FIELDS) {
    const input = range(field, GAME_SETTINGS_RANGES[field]),
      value = output(field);
    comfort.append(row(GAME_SETTINGS_COMFORT_LABELS[field], input, field, value));
    comfortRows.set(field, { input, output: value });
  }

  const resolution = range('resolution', GAME_SETTINGS_RANGES.resolutionScale),
    resolutionOutput = output('resolution'),
    adaptive = element('input');
  adaptive.className = 'game-settings__checkbox';
  adaptive.setAttribute('type', 'checkbox');
  adaptive.setAttribute('id', controlId('adaptive'));
  adaptive.setAttribute('role', 'switch');
  graphics.append(
    row('Presetare', preset, 'preset'),
    row('Backend preferat', backend, 'backend'),
    row('Scala rezoluției', resolution, 'resolution', resolutionOutput),
    row('Adaptare automată', adaptive, 'adaptive'),
  );

  root.append(
    header,
    description,
    units,
    camera,
    comfort,
    graphics,
    audio,
    preview,
    issues,
    footer,
  );
  host.append(root);

  let disposed = false,
    busy = false,
    emitting = false,
    resetPending = false,
    current = initial,
    view: GameSettingsProjection = projectGameSettings(initial),
    lastSignature = '',
    lastClock = -Infinity,
    writes = 0,
    renders = 0,
    skipped = 0,
    updates = 0,
    saves = 0,
    resets = 0,
    cancels = 0,
    changes = 0;

  const mutate = (action: () => void) => {
    if (busy) throw new Error('Game settings reentrant');
    busy = true;
    try {
      action();
    } finally {
      busy = false;
    }
  };
  const assertLive = () => {
    if (disposed) throw new Error('Game settings disposed');
  };
  const set = (node: HTMLElement, text: string) => {
    if (node.textContent === text) return;
    node.textContent = text;
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
  const setSelect = (node: HTMLSelectElement, value: string) => {
    if (node.value === value) return;
    node.value = value;
    writes += 1;
  };
  const setRange = (node: HTMLInputElement, value: number) => {
    const text = String(value);
    if (node.value === text) return;
    node.value = text;
    writes += 1;
  };
  const setCheckbox = (node: HTMLInputElement, value: boolean) => {
    if (node.checked === value) return;
    node.checked = value;
    writes += 1;
  };
  const previewText = () => {
    const speedView = formatSpeedDisplay(sample.speedMps, current.proposed.units.speed),
      distanceView = formatDistanceDisplay(sample.distanceM, current.proposed.units.distance),
      reference = unitPreview(sample.speedMps, sample.distanceM);
    return `Afișat: ${speedView.text} · ${distanceView.text}. Simularea rămâne ${reference.siSpeed} (SI). Referință: ${reference.speedText}.`;
  };
  const render = (projected: GameSettingsProjection) => {
    setSelect(speed, projected.values.units.speed);
    setSelect(distance, projected.values.units.distance);
    setSelect(cameraMode, projected.values.cameraMode);
    for (const field of GAME_SETTINGS_COMFORT_FIELDS) {
      const nodes = comfortRows.get(field);
      if (nodes === undefined) throw new Error('Game settings comfort row');
      setRange(nodes.input, projected.values.comfort[field]);
      set(
        nodes.output,
        field === 'fov'
          ? `${projected.values.comfort.fov}°`
          : String(projected.values.comfort[field]),
      );
    }
    setSelect(preset, projected.values.graphics.preset);
    setSelect(backend, projected.values.graphics.preferredBackend);
    setRange(resolution, projected.values.graphics.resolutionScale);
    set(resolutionOutput, `${Math.round(projected.values.graphics.resolutionScale * 100)}%`);
    setCheckbox(adaptive, projected.values.graphics.adaptive);
    set(preview, previewText());
    set(issues, projected.issues.map((issue) => issue.message).join(' '));
    if (projected.issues.length === 0) attribute(issues, 'hidden', '');
    else removeAttribute(issues, 'hidden');
    attribute(root, 'data-save-state', projected.saveState);
    attribute(root, 'data-changed', String(projected.changedCount));
    if (projected.canSave) removeAttribute(saveButton, 'disabled');
    else attribute(saveButton, 'disabled', '');
    const reference = unitPreview(sample.speedMps, sample.distanceM);
    set(
      live,
      `${projected.summary} Afișat: ${formatSpeedDisplay(sample.speedMps, projected.values.units.speed).text} · ${formatDistanceDisplay(sample.distanceM, projected.values.units.distance).text}; simularea rămâne ${reference.siSpeed} (SI).`,
    );
    lastSignature = projected.signature;
    renders += 1;
  };
  const applyDraft = (next: GameSettingsDraft, notify: boolean) => {
    const parsed = parseGameSettingsDraft(next);
    if (parsed.playerId !== player) throw new Error('Game settings belong to another player');
    const projected = projectGameSettings(parsed),
      identical = projected.signature === lastSignature;
    current = parsed;
    view = projected;
    if (identical) {
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
  const localChange = (next: GameSettingsDraft) => {
    changes += 1;
    resetPending = false;
    set(resetButton, GAME_SETTINGS_RESET_LABEL);
    applyDraft(next, true);
  };
  const save = () =>
    mutate(() => {
      assertLive();
      resetPending = false;
      set(resetButton, GAME_SETTINGS_RESET_LABEL);
      if (view.saveState !== 'DIRTY') {
        set(
          live,
          view.saveState === 'UNCHANGED'
            ? 'Nicio modificare de salvat.'
            : 'Corectează valorile din afara limitelor înainte de salvare.',
        );
        return;
      }
      saves += 1;
      if (options.save !== undefined && !emitting) {
        emitting = true;
        try {
          options.save(current);
        } finally {
          emitting = false;
        }
      }
    });
  const requestReset = () =>
    mutate(() => {
      assertLive();
      if (!resetPending) {
        resetPending = true;
        set(resetButton, GAME_SETTINGS_RESET_CONFIRM_LABEL);
        set(
          live,
          'Resetarea propune valorile implicite pentru unități, cameră, confort și grafică. Apasă din nou pentru confirmare; tastele rămân neschimbate și salvarea este explicită.',
        );
        return;
      }
      resetPending = false;
      set(resetButton, GAME_SETTINGS_RESET_LABEL);
      resets += 1;
      applyDraft(resetGameSettingsDraft(current), true);
      set(
        live,
        'Valorile implicite sunt propuse local. Salvează pentru a le păstra; nimic nu a fost scris încă.',
      );
    });
  const requestCancel = () =>
    mutate(() => {
      assertLive();
      resetPending = false;
      set(resetButton, GAME_SETTINGS_RESET_LABEL);
      applyDraft(revertGameSettingsDraft(current), true);
      cancels += 1;
      set(live, 'Modificările locale au fost renunțate; setările salvate rămân neschimbate.');
      if (options.cancel !== undefined && !emitting) {
        emitting = true;
        try {
          options.cancel(current);
        } finally {
          emitting = false;
        }
      }
    });

  listen(speed, () =>
    localChange(setDisplayUnits(current, { speed: speed.value as GameSettingsUnits['speed'] })),
  );
  listen(distance, () =>
    localChange(
      setDisplayUnits(current, { distance: distance.value as GameSettingsUnits['distance'] }),
    ),
  );
  listen(cameraMode, () =>
    localChange(setCameraMode(current, cameraMode.value as GameSettingsCameraMode)),
  );
  for (const field of GAME_SETTINGS_COMFORT_FIELDS) {
    const nodes = comfortRows.get(field);
    if (nodes === undefined) throw new Error('Game settings comfort row');
    listen(nodes.input, () => {
      const value = Number(nodes.input.value);
      localChange(setComfortValues(current, { [field]: value }));
    });
  }
  listen(preset, () =>
    localChange(setGraphics(current, { preset: preset.value as GameSettingsGraphics['preset'] })),
  );
  listen(backend, () =>
    localChange(
      setGraphics(current, {
        preferredBackend: backend.value as GameSettingsGraphics['preferredBackend'],
      }),
    ),
  );
  listen(resolution, () =>
    localChange(setGraphics(current, { resolutionScale: Number(resolution.value) })),
  );
  listen(adaptive, () => localChange(setGraphics(current, { adaptive: adaptive.checked })));
  resetButton.addEventListener('click', requestReset);
  saveButton.addEventListener('click', save);
  cancelButton.addEventListener('click', requestCancel);
  render(view);

  return Object.freeze({
    update(candidate: GameSettingsDraft, nowMs: number) {
      mutate(() => {
        assertLive();
        if (!Number.isFinite(nowMs) || nowMs < lastClock) throw new Error('Game settings clock');
        lastClock = nowMs;
        updates += 1;
        applyDraft(candidate, false);
      });
    },
    setDraft(candidate: GameSettingsDraft) {
      mutate(() => {
        assertLive();
        updates += 1;
        applyDraft(candidate, false);
      });
    },
    getDraft: () => current,
    getView: () => view,
    getStats: () =>
      Object.freeze({
        version: GAME_SETTINGS_VERSION,
        sections: GAME_SETTINGS_SECTIONS.length,
        controls: GAME_SETTINGS_PANEL_LIMITS.controls,
        elements: disposed ? 0 : GAME_SETTINGS_PANEL_LIMITS.elements,
        textNodes: disposed ? 0 : GAME_SETTINGS_PANEL_LIMITS.textNodes,
        listeners: disposed ? 0 : controls.length + 3,
        writes,
        renders,
        skipped,
        updates,
        changes,
        saves,
        resets,
        cancels,
        saveState: view.saveState as GameSettingsSaveState,
        issues: view.issues.length,
        disposed,
      }),
    dispose() {
      mutate(() => {
        if (disposed) return;
        disposed = true;
        for (const control of controls) control.node.removeEventListener('change', control.handler);
        resetButton.removeEventListener('click', requestReset);
        saveButton.removeEventListener('click', save);
        cancelButton.removeEventListener('click', requestCancel);
        controls.length = 0;
        comfortRows.clear();
        root.remove();
      });
    },
  });
}

export type GameSettingsPanel = ReturnType<typeof createGameSettingsPanel>;

let nextPanelId = 1;

/** Bounded contract facts for evidence; no profile or fleet value appears here. */
export const GAME_SETTINGS_PANEL_LIMITS = Object.freeze({
  version: GAME_SETTINGS_VERSION,
  controls: 14,
  sections: GAME_SETTINGS_SECTIONS.length,
  elements: 85,
  textNodes: 49,
  listeners: 17,
  retainedDrafts: 1,
});
