import {
  createGameSettingsPanel,
  type GameSettingsPanel,
  type GameSettingsPanelOptions,
} from './game-settings';
import { createKeyRemappingPanel, type KeyRemappingPanelOptions } from './key-remapping';
import {
  createStyleSlidersTab,
  type StyleSlidersTab,
  type StyleSlidersTabOptions,
} from './style-sliders';
import { createPanelFocusController, focusableControls } from './panel-focus';
import type { GameSettingsDraft } from './game-settings-format';
import type { KeyRemappingDraft } from './key-remapping-format';
import type { StyleSlidersDraft } from './style-sliders-format';

/**
 * PBI 279 live settings surface.
 *
 * A native dialog with three tab panels: device settings (081), key remapping (080) and the city
 * style editor (230). The panes reuse the real adapters; only the active pane is in the DOM, so the
 * 083 focus trap never reaches hidden controls. Escape and Tab go through the 083 focus controller,
 * and no listener is installed on `window`/`document`.
 */
export const LIVE_SETTINGS_PANEL_VERSION = '279-live-settings-panel-v1' as const;

export type LiveSettingsTab = 'GAME' | 'KEYS' | 'STYLE';

export interface LiveSettingsPanelOptions {
  readonly settingsDraft: GameSettingsDraft;
  readonly keyDraft: KeyRemappingDraft;
  readonly styleDraft: StyleSlidersDraft | null;
  readonly styleUnavailableReason?: string | null;
  readonly settings?: GameSettingsPanelOptions;
  readonly keys?: KeyRemappingPanelOptions;
  readonly style?: Omit<StyleSlidersTabOptions, 'draft'>;
  readonly initialTab?: LiveSettingsTab;
  readonly close: () => void;
  readonly now?: () => number;
}

export interface LiveSettingsPanelStats {
  readonly version: typeof LIVE_SETTINGS_PANEL_VERSION;
  readonly disposed: boolean;
  readonly open: boolean;
  readonly tab: LiveSettingsTab;
  readonly tabs: number;
  readonly panes: number;
  readonly opens: number;
  readonly closes: number;
  readonly tabSwitches: number;
  readonly focus: ReturnType<ReturnType<typeof createPanelFocusController>['getStats']>;
  readonly settings: ReturnType<GameSettingsPanel['getStats']>;
  readonly keys: ReturnType<ReturnType<typeof createKeyRemappingPanel>['getStats']>;
  readonly style: ReturnType<StyleSlidersTab['getStats']> | null;
  readonly globalListeners: 0;
}

const TAB_LABELS: Readonly<Record<LiveSettingsTab, string>> = Object.freeze({
  GAME: 'Joc și control',
  KEYS: 'Taste',
  STYLE: 'Stil oraș',
});

let nextPanelId = 1;

export function createLiveSettingsPanel(host: HTMLElement, options: LiveSettingsPanelOptions) {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Live settings requires an owned document');
  if (!options || typeof options !== 'object') throw new Error('Live settings panel options');
  if (typeof options.close !== 'function') throw new Error('Live settings close port');
  const clock = options.now ?? (() => performance.now());
  if (typeof clock !== 'function') throw new Error('Live settings clock');

  const panelId = `live-settings-${nextPanelId++}`,
    titleId = `${panelId}-title`,
    descriptionId = `${panelId}-description`,
    tabId = (tab: LiveSettingsTab) => `${panelId}-tab-${tab.toLowerCase()}`,
    paneId = (tab: LiveSettingsTab) => `${panelId}-pane-${tab.toLowerCase()}`;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
    doc.createElement(tag);

  const root = element('div'),
    surface = element('div'),
    header = element('header'),
    title = element('h2'),
    description = element('p'),
    closeButton = element('button'),
    tabList = element('div'),
    status = element('p'),
    body = element('div'),
    tabButtons = new Map<LiveSettingsTab, HTMLButtonElement>(),
    panes = new Map<LiveSettingsTab, HTMLElement>();

  root.className = 'live-settings';
  root.setAttribute('data-live-settings', LIVE_SETTINGS_PANEL_VERSION);
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  surface.className = 'live-settings__surface';
  surface.setAttribute('aria-labelledby', titleId);
  surface.setAttribute('aria-describedby', descriptionId);
  header.className = 'live-settings__header';
  title.id = titleId;
  title.className = 'live-settings__title';
  title.textContent = 'Setări';
  description.id = descriptionId;
  description.className = 'live-settings__description';
  description.textContent =
    'Preferințe de dispozitiv: unități, cameră, control, grafică, taste și stilul orașului. Setările dispozitivului nu modifică profilul învățat, AI-ul sau XP-ul; numai „Aplică” din tabul de stil publică o versiune MANUAL_TUNING, prin bariera de generație.';
  closeButton.type = 'button';
  closeButton.className = 'live-settings__close';
  closeButton.textContent = 'Închide';
  closeButton.setAttribute('data-live-settings-action', 'close');
  closeButton.setAttribute('aria-label', 'Închide setările');
  tabList.className = 'live-settings__tabs';
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Secțiuni de setări');
  status.className = 'live-settings__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  body.className = 'live-settings__body';
  header.append(title, description, closeButton);
  surface.append(header, tabList, status, body);
  root.append(surface);
  host.append(root);

  const tabs: LiveSettingsTab[] = ['GAME', 'KEYS', 'STYLE'];
  for (const tab of tabs) {
    const button = element('button');
    button.type = 'button';
    button.className = 'live-settings__tab';
    button.id = tabId(tab);
    button.setAttribute('role', 'tab');
    button.setAttribute('data-live-settings-tab', tab);
    button.setAttribute('aria-controls', paneId(tab));
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;
    button.textContent = TAB_LABELS[tab];
    if (tab === 'STYLE' && options.styleDraft === null) {
      button.setAttribute('disabled', '');
      button.title = options.styleUnavailableReason ?? 'Editorul de stil este indisponibil.';
    }
    tabList.append(button);
    tabButtons.set(tab, button);
  }

  const gamePane = element('div'),
    keyPane = element('div'),
    styleHost = element('div');
  gamePane.id = paneId('GAME');
  gamePane.setAttribute('role', 'tabpanel');
  gamePane.setAttribute('aria-labelledby', tabId('GAME'));
  keyPane.id = paneId('KEYS');
  keyPane.setAttribute('role', 'tabpanel');
  keyPane.setAttribute('aria-labelledby', tabId('KEYS'));

  const settingsPanel = createGameSettingsPanel(
    gamePane,
    options.settingsDraft,
    options.settings ?? {},
  );
  const keyPanel = createKeyRemappingPanel(keyPane, options.keyDraft, options.keys ?? {});
  let stylePanel: StyleSlidersTab | null =
    options.styleDraft === null
      ? null
      : createStyleSlidersTab(styleHost, { ...options.style, draft: options.styleDraft });
  let styleResetPending = false;
  const attachStyleActions = (panel: StyleSlidersTab): void => {
    if (panel.root.querySelector('[data-live-settings-style-actions]') !== null) return;
    const actions = element('div'),
      apply = element('button'),
      cancel = element('button'),
      reset = element('button');
    actions.className = 'style-sliders__actions live-settings__style-actions';
    actions.setAttribute('data-live-settings-style-actions', 'true');
    apply.type = 'button';
    apply.className = 'style-sliders__apply';
    apply.textContent = 'Aplică';
    apply.setAttribute('aria-label', 'Aplică diferențele de stil prin bariera de generație');
    cancel.type = 'button';
    cancel.className = 'style-sliders__cancel';
    cancel.textContent = 'Anulează';
    reset.type = 'button';
    reset.className = 'style-sliders__reset';
    reset.textContent = 'Revino la versiunea activă';
    const onApply = (): void => {
      panel.handle('APPLY');
    };
    const onCancel = (): void => {
      styleResetPending = false;
      reset.textContent = 'Revino la versiunea activă';
      panel.handle('CANCEL');
    };
    const onReset = (): void => {
      if (!styleResetPending) {
        styleResetPending = true;
        reset.textContent = 'Confirmă revenirea';
        return;
      }
      styleResetPending = false;
      reset.textContent = 'Revino la versiunea activă';
      panel.handle('RESET');
    };
    apply.addEventListener('click', onApply);
    cancel.addEventListener('click', onCancel);
    reset.addEventListener('click', onReset);
    actions.append(apply, cancel, reset);
    panel.root.append(actions);
  };
  if (stylePanel !== null) attachStyleActions(stylePanel);
  if (stylePanel !== null) {
    stylePanel.root.id = paneId('STYLE');
    stylePanel.root.setAttribute('aria-labelledby', tabId('STYLE'));
    stylePanel.root.setAttribute('data-live-settings-pane', 'STYLE');
  }
  const styleUnavailable = element('p');
  styleUnavailable.className = 'live-settings__unavailable';
  styleUnavailable.setAttribute('data-live-settings-unavailable', 'STYLE');
  styleUnavailable.textContent =
    options.styleUnavailableReason ?? 'Editorul de stil este indisponibil în această sesiune.';

  panes.set('GAME', gamePane);
  panes.set('KEYS', keyPane);
  if (stylePanel !== null) panes.set('STYLE', stylePanel.root as HTMLElement);

  let disposed = false,
    open = false,
    activeTab: LiveSettingsTab =
      options.initialTab === 'STYLE' && stylePanel === null
        ? 'GAME'
        : (options.initialTab ?? 'GAME'),
    opens = 0,
    closes = 0,
    tabSwitches = 0;
  const focus = createPanelFocusController(host, { close: () => requestClose() });

  const assertLive = () => {
    if (disposed) throw new Error('Live settings disposed');
  };
  const setStatus = (text: string) => {
    if (status.textContent !== text) status.textContent = text;
  };
  const mountPane = (tab: LiveSettingsTab) => {
    while (body.children.length > 0) body.children[0]!.remove();
    const pane = panes.get(tab);
    if (pane !== undefined) {
      body.append(pane);
      return pane;
    }
    body.append(styleUnavailable);
    return styleUnavailable;
  };
  const selectTab = (tab: LiveSettingsTab, moveFocus: boolean) => {
    assertLive();
    if (!panes.has(tab)) return;
    activeTab = tab;
    for (const [name, button] of tabButtons) {
      const selected = name === tab;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    }
    if (open) {
      const pane = mountPane(tab);
      stylePanel?.setActive(tab === 'STYLE');
      tabSwitches += 1;
      if (moveFocus) {
        const first = focusableControls(pane)[0];
        if (first !== undefined) first.focus();
      }
    }
  };
  const hide = () => {
    if (!open) return;
    open = false;
    closes += 1;
    focus.close();
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    surface.removeAttribute('role');
    surface.removeAttribute('aria-modal');
  };
  function requestClose(): void {
    if (!open) return;
    hide();
    options.close();
  }
  const onClose = () => requestClose();
  const onTabClick = (tab: LiveSettingsTab) => () => selectTab(tab, true);
  const tabHandlers = new Map<LiveSettingsTab, () => void>();
  for (const tab of tabs) {
    const handler = onTabClick(tab);
    tabHandlers.set(tab, handler);
    tabButtons.get(tab)?.addEventListener('click', handler);
  }
  closeButton.addEventListener('click', onClose);
  selectTab(activeTab, false);
  setStatus('Setările sunt închise.');

  return Object.freeze({
    version: LIVE_SETTINGS_PANEL_VERSION,
    root,
    openPanel(): boolean {
      assertLive();
      if (open) return true;
      open = true;
      opens += 1;
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');
      surface.setAttribute('role', 'dialog');
      surface.setAttribute('aria-modal', 'true');
      mountPane(activeTab);
      const mounted = focus.open('gameSettings', surface);
      const pane = panes.get(activeTab);
      if (pane !== undefined) {
        const first = focusableControls(pane)[0];
        if (first !== undefined) first.focus();
      }
      setStatus(
        'Setările sunt deschise. Anulează revine la valorile salvate; Salvează scrie numai setările dispozitivului.',
      );
      return mounted;
    },
    closePanel(): boolean {
      if (!open) return false;
      hide();
      return true;
    },
    isOpen: () => open,
    getTab: () => activeTab,
    setTab(tab: LiveSettingsTab): boolean {
      assertLive();
      if (!panes.has(tab)) return false;
      selectTab(tab, true);
      return true;
    },
    setSettingsDraft(candidate: GameSettingsDraft) {
      assertLive();
      settingsPanel.setDraft(candidate);
    },
    setKeyDraft(candidate: KeyRemappingDraft) {
      assertLive();
      keyPanel.setDraft(candidate);
    },
    setStyleDraft(candidate: StyleSlidersDraft | null) {
      assertLive();
      if (candidate === null) return;
      if (stylePanel === null) {
        stylePanel = createStyleSlidersTab(gamePane, { ...options.style, draft: candidate });
        stylePanel.root.id = paneId('STYLE');
        stylePanel.root.setAttribute('aria-labelledby', tabId('STYLE'));
        stylePanel.root.setAttribute('data-live-settings-pane', 'STYLE');
        panes.set('STYLE', stylePanel.root as HTMLElement);
        const button = tabButtons.get('STYLE');
        if (button !== undefined) {
          button.removeAttribute('disabled');
          button.removeAttribute('title');
        }
      } else {
        stylePanel.setDraft(candidate);
      }
    },
    setStyleUnavailable(reason: string | null) {
      assertLive();
      styleUnavailable.textContent = reason ?? 'Editorul de stil este indisponibil.';
      const button = tabButtons.get('STYLE');
      if (button !== undefined && stylePanel === null) {
        button.setAttribute('disabled', '');
        if (reason !== null) button.title = reason;
      }
    },
    announce(text: string) {
      assertLive();
      if (typeof text !== 'string' || text.length === 0 || text.length > 512)
        throw new Error('Live settings announcement');
      setStatus(text);
    },
    getSettingsDraft: () => settingsPanel.getDraft(),
    getKeyDraft: () => keyPanel.getDraft(),
    getStyleDraft: () => stylePanel?.getDraft() ?? null,
    update(
      drafts: { settings: GameSettingsDraft; keys: KeyRemappingDraft; style?: StyleSlidersDraft },
      nowMs: number,
    ) {
      assertLive();
      settingsPanel.update(drafts.settings, nowMs);
      keyPanel.setDraft(drafts.keys);
      if (drafts.style !== undefined) {
        if (stylePanel === null) {
          stylePanel = createStyleSlidersTab(styleHost, { ...options.style, draft: drafts.style });
          stylePanel.root.id = paneId('STYLE');
          stylePanel.root.setAttribute('aria-labelledby', tabId('STYLE'));
          stylePanel.root.setAttribute('data-live-settings-pane', 'STYLE');
          attachStyleActions(stylePanel);
          panes.set('STYLE', stylePanel.root as HTMLElement);
          const button = tabButtons.get('STYLE');
          if (button !== undefined) {
            button.removeAttribute('disabled');
            button.removeAttribute('title');
          }
        } else {
          stylePanel.setDraft(drafts.style);
        }
      }
      clock();
    },
    getStats: (): LiveSettingsPanelStats =>
      Object.freeze({
        version: LIVE_SETTINGS_PANEL_VERSION,
        disposed,
        open,
        tab: activeTab,
        tabs: tabs.length,
        panes: panes.size,
        opens,
        closes,
        tabSwitches,
        focus: focus.getStats(),
        settings: settingsPanel.getStats(),
        keys: keyPanel.getStats(),
        style: stylePanel?.getStats() ?? null,
        globalListeners: 0 as const,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (open) hide();
      for (const tab of tabs) {
        const handler = tabHandlers.get(tab);
        const button = tabButtons.get(tab);
        if (handler !== undefined) button?.removeEventListener('click', handler);
      }
      closeButton.removeEventListener('click', onClose);
      focus.dispose();
      settingsPanel.dispose();
      keyPanel.dispose();
      stylePanel?.dispose();
      stylePanel = null;
      panes.clear();
      tabButtons.clear();
      root.remove();
    },
  });
}

export type LiveSettingsPanel = ReturnType<typeof createLiveSettingsPanel>;
