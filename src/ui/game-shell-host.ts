/**
 * PBI 260 — gazda UI a shell-ului jocului.
 *
 * Montează controalele de start/pauză/reluare și un singur panou de integrare. Panoul este o
 * suprafață modală reală: nume accesibil, focus mutat pe primul control, Tab ținut în panou,
 * Escape închide prin portul injectat și focusul revine la butonul care l-a deschis. Nu există
 * listeneri pe `window`/`document`, iar panoul nu reconstruiește rândurile la fiecare cadru.
 *
 * Gazda nu ia decizii de joc: starea porturilor și a tick-ului vine exclusiv din read model-ul
 * shell-ului, iar deschiderea/închiderea trece prin porturile injectate.
 */
import type { GameShellStatus } from '../app';

export const GAME_SHELL_HOST_VERSION = '260-game-shell-host-v1' as const;
export const GAME_SHELL_HOST_REFRESH_MS = 100;
const PANEL_ID = 'integration';

export interface GameShellSessionChoiceView {
  readonly kind: string;
  readonly label: string;
  readonly live: boolean;
  readonly profileId: string;
  readonly worldEpoch: number;
  readonly learningEpoch: number;
  readonly checkpoints: number;
}

/** Read model for the session menu; owner-ul 261 furnizează valorile, gazda nu le deduce. */
export interface GameShellSessionMenuView {
  readonly live: string | null;
  readonly choices: readonly GameShellSessionChoiceView[];
}

export interface GameShellHostOptions {
  readonly root: HTMLElement;
  readonly snapshot: () => GameShellStatus;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  /** Alegerea explicită Academie/Haos; absența portului nu montează meniul. */
  readonly sessionMenu?: () => GameShellSessionMenuView;
  readonly onChooseSession?: (kind: string) => void;
  /** „Oraș proaspăt, păstrează stilul”: resetul aparține owner-ului 261, nu gazdei. */
  readonly onResetWorld?: () => void;
  /** PBI 279: deschide setările live din bara shell-ului; opțional. */
  readonly onOpenSettings?: () => boolean;
  /** Host-ul cere shell-ului deschiderea; `false` înseamnă că panoul nu a fost acceptat. */
  readonly onOpenPanel: () => boolean;
  readonly onClosePanel: () => void;
  /** PBI 263: deschide panoul live de selecție a flotei; opțional, montat numai când există. */
  readonly onOpenFleet?: () => boolean;
  /** PBI 264: deschide panoul live de cereri/dispecerizare; opțional, montat numai când există. */
  readonly onOpenRides?: () => boolean;
  /** PBI 270: deschide panoul companiei; opțional, montat numai când există. */
  readonly onOpenCompany?: () => boolean;
  /** PBI 267: deschide pop-up-ul KPI; opțional, montat numai când există. */
  readonly onOpenKpis?: () => boolean;
  /** PBI 267: deschide tabloul orașului; opțional, montat numai când există. */
  readonly onOpenCity?: () => boolean;
  /** PBI 275: deschide panoul de misiuni; opțional, montat numai când există. */
  readonly onOpenMissions?: () => boolean;
  /** PBI 276: deschide panoul de progres și misiuni zilnice; opțional. */
  readonly onOpenProgress?: () => boolean;
  /** PBI 277: deschide panoul provocărilor live; opțional, montat numai când există. */
  readonly onOpenChallenges?: () => boolean;
  /** PBI 278: „Salvează jocul în fișier”; absența portului nu montează acțiunea. */
  readonly onSaveGame?: () => GameShellFileResult | Promise<GameShellFileResult>;
  /** PBI 278: un fișier citit este validat și rezumat; înlocuirea cere confirmarea separată. */
  readonly onLoadGame?: (file: GameShellFile) => GameShellFileResult | Promise<GameShellFileResult>;
  /** PBI 278: confirmarea explicită a preview-ului afișat. */
  readonly onConfirmLoad?: () => GameShellFileResult | Promise<GameShellFileResult>;
  readonly onCancelLoad?: () => void;
  /** PBI 278: starea autosave-ului, separată de starea fișierului. */
  readonly saveStatus?: () => GameShellSaveStatus;
  readonly now?: () => number;
  /** Testele pot opri injectarea de CSS; producția o lasă activă. */
  readonly style?: boolean;
}

export interface GameShellFile {
  readonly fileName: string;
  readonly text: string;
}

export interface GameShellFileResult {
  readonly status: 'READY' | 'PREVIEW' | 'COMMITTED' | 'ERROR';
  readonly message: string;
  readonly fileName?: string | null;
  readonly text?: string | null;
  readonly checksum?: string | null;
  readonly previewId?: string | null;
  readonly lines?: readonly string[];
}

export interface GameShellSaveStatus {
  readonly label: string;
  readonly detail: string;
  readonly tick: number | null;
  readonly lastSavedTick: number | null;
}

export interface GameShellHostStats {
  readonly version: typeof GAME_SHELL_HOST_VERSION;
  readonly disposed: boolean;
  readonly panelOpen: boolean;
  readonly sessionKind: string | null;
  readonly sessionChoices: number;
  readonly sessionSelects: number;
  readonly opens: number;
  readonly closes: number;
  readonly restores: number;
  readonly refreshes: number;
  readonly rowWrites: number;
  readonly tabTraps: number;
  readonly listeners: number;
  readonly globalListeners: 0;
  readonly focusables: number;
  readonly saveOpen: boolean;
  readonly saveActions: number;
  readonly loadPreviews: number;
  readonly importsConfirmed: number;
  readonly settingsOpens: number;
  readonly lastRefreshAt: number | null;
}

export interface GameShellHost {
  readonly version: typeof GAME_SHELL_HOST_VERSION;
  readonly root: HTMLElement;
  setSessionState(kind: string): void;
  /** Resincronizează meniul de sesiune din portul injectat, fără a aștepta un cadru. */
  refreshSession(): void;
  refresh(force?: boolean): void;
  /** PBI 278: același drum ca inputul de fișier, folosit de probe și de teste. */
  loadFileText(fileName: string, text: string): Promise<void>;
  isPanelOpen(): boolean;
  isSaveOpen(): boolean;
  getStats(): GameShellHostStats;
  dispose(): void;
}

const STYLE_TEXT = `
.game-shell-host { position: fixed; top: 1rem; left: calc(var(--layout-hud-width) + var(--layout-gap) * 2);
  right: calc(var(--layout-minimap-width) + var(--layout-gap) * 2); z-index: 30; color: #f3f7fb;
  font: 0.82rem/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.game-shell-host__bar { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.4rem;
  align-items: center; max-width: min(52rem, calc(100vw - 2rem)); padding: 0.35rem 0.5rem;
  background: rgba(8, 20, 17, 0.88); border: 1px solid #2c4a3f; border-radius: 0.55rem;
  box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.35); }
.game-shell-host__badge { font-weight: 600; letter-spacing: 0.04em; color: #9fe0c5;
  min-width: 4.5rem; }
.game-shell-host__bar button, .game-shell-host__panel button {
  font: inherit; color: #f3f7fb; background: #17352b; border: 1px solid #3d6b58;
  border-radius: 0.35rem; padding: 0.3rem 0.55rem; cursor: pointer; }
.game-shell-host__bar button:hover, .game-shell-host__panel button:hover { background: #22503f; }
.game-shell-host__bar select { font: inherit; color: #f3f7fb; background: #102a22;
  border: 1px solid #3d6b58; border-radius: 0.35rem; padding: 0.28rem 0.4rem; }
.game-shell-host__bar select:focus-visible { outline: 3px solid #9fe0c5; outline-offset: 2px; }
.game-shell-host__bar button:focus-visible, .game-shell-host__panel button:focus-visible {
  outline: 3px solid #9fe0c5; outline-offset: 2px; }
.game-shell-host__panel { position: fixed; top: 4.2rem; right: 1rem; width: min(42rem, calc(100vw - 2rem));
  max-height: min(78vh, 40rem); overflow: auto; padding: 1rem 1.1rem; background: #0b1a16;
  border: 1px solid #3d6b58; border-radius: 0.6rem; box-shadow: 0 1rem 2.4rem rgba(0, 0, 0, 0.5); }
.game-shell-host__panel[hidden] { display: none; }
.game-shell-host__panel h2 { margin: 0 0 0.4rem; font-size: 1.1rem; }
.game-shell-host__summary { margin: 0 0 0.65rem; color: #c6dbd1; }
.game-shell-host__note { margin: 0.65rem 0; color: #b9cfc5; }
.game-shell-host__table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.game-shell-host__table th, .game-shell-host__table td { text-align: left; padding: 0.22rem 0.3rem;
  border-bottom: 1px solid #234437; vertical-align: top; }
.game-shell-host__table th { color: #9fe0c5; font-weight: 600; }
.game-shell-host__table tr[data-shell-status="ABSENT"] td { color: #c6dbd1; }
.game-shell-host__table tr[data-shell-status="PRESENT"] td[data-shell-cell="status"] { color: #9fe0c5; }
.game-shell-host__panel button { margin-top: 0.75rem; }
.game-shell-host__save { position: fixed; top: 4.2rem; right: 1rem; width: min(34rem, calc(100vw - 2rem));
  max-height: min(78vh, 40rem); overflow: auto; padding: 1rem 1.1rem; background: #0b1a16;
  border: 1px solid #3d6b58; border-radius: 0.6rem; box-shadow: 0 1rem 2.4rem rgba(0, 0, 0, 0.5); }
.game-shell-host__save[hidden] { display: none; }
.game-shell-host__save h2 { margin: 0 0 0.4rem; font-size: 1.05rem; }
.game-shell-host__save p { margin: 0.35rem 0; color: #c6dbd1; }
.game-shell-host__save ul { margin: 0.35rem 0 0.6rem; padding-left: 1.1rem; color: #d7e7df; }
.game-shell-host__save button { margin: 0.35rem 0.4rem 0 0; }
.game-shell-host__save input[type="file"] { color: #c6dbd1; max-width: 100%; }
`;

interface Row {
  readonly row: HTMLElement;
  readonly status: HTMLElement;
  readonly steps: HTMLElement;
}

function focusQuietly(node: Element | null | undefined): boolean {
  if (node === null || node === undefined) return false;
  if (typeof (node as HTMLElement).focus !== 'function') return false;
  (node as HTMLElement).focus();
  return true;
}

export function createGameShellHost(options: GameShellHostOptions): GameShellHost {
  if (options === undefined || options === null || typeof options !== 'object')
    throw new Error('Game shell host: options are required.');
  const root = options.root;
  if (!root || typeof root.append !== 'function')
    throw new Error('Game shell host: root element is required.');
  const doc = root.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function')
    throw new Error('Game shell host: root must own a document.');
  for (const callback of [
    options.snapshot,
    options.onStart,
    options.onPause,
    options.onResume,
    options.onOpenPanel,
    options.onClosePanel,
  ])
    if (typeof callback !== 'function')
      throw new Error('Game shell host: ports must be synchronous functions.');
  const now = options.now ?? (() => performance.now());

  const host = doc.createElement('div');
  host.className = 'game-shell-host';
  host.setAttribute('data-game-shell-host', GAME_SHELL_HOST_VERSION);
  const bar = doc.createElement('div');
  bar.className = 'game-shell-host__bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Sesiune');
  const badge = doc.createElement('span');
  badge.className = 'game-shell-host__badge';
  badge.setAttribute('data-shell-kind', 'LOADING');
  const sessionSelect =
    options.sessionMenu !== undefined && options.onChooseSession !== undefined
      ? doc.createElement('select')
      : null;
  if (sessionSelect !== null) {
    sessionSelect.setAttribute('data-shell-action', 'session');
    sessionSelect.setAttribute('aria-label', 'Sesiune');
    sessionSelect.title = 'Alege Academie sau Joacă liberă / Haos';
  }
  const startButton = doc.createElement('button');
  startButton.type = 'button';
  startButton.textContent = 'Start';
  startButton.setAttribute('data-shell-action', 'start');
  const pauseButton = doc.createElement('button');
  pauseButton.type = 'button';
  pauseButton.textContent = 'Pauză';
  pauseButton.setAttribute('data-shell-action', 'pause');
  const resumeButton = doc.createElement('button');
  resumeButton.type = 'button';
  resumeButton.textContent = 'Reia';
  resumeButton.setAttribute('data-shell-action', 'resume');
  const panelButton = doc.createElement('button');
  panelButton.type = 'button';
  panelButton.textContent = 'Integrare';
  panelButton.setAttribute('data-shell-action', 'panel');
  panelButton.setAttribute('aria-haspopup', 'dialog');
  panelButton.setAttribute('aria-expanded', 'false');
  const fleetButton = options.onOpenFleet === undefined ? null : doc.createElement('button');
  if (fleetButton !== null) {
    fleetButton.type = 'button';
    fleetButton.textContent = 'Flotă';
    fleetButton.setAttribute('data-shell-action', 'fleet');
    fleetButton.setAttribute('aria-haspopup', 'dialog');
  }
  const ridesButton = options.onOpenRides === undefined ? null : doc.createElement('button');
  if (ridesButton !== null) {
    ridesButton.type = 'button';
    ridesButton.textContent = 'Curse';
    ridesButton.setAttribute('data-shell-action', 'rides');
    ridesButton.setAttribute('aria-haspopup', 'dialog');
  }
  const companyButton = options.onOpenCompany === undefined ? null : doc.createElement('button');
  if (companyButton !== null) {
    companyButton.type = 'button';
    companyButton.textContent = 'Companie';
    companyButton.setAttribute('data-shell-action', 'company');
    companyButton.setAttribute('aria-haspopup', 'dialog');
  }
  const kpisButton = options.onOpenKpis === undefined ? null : doc.createElement('button');
  if (kpisButton !== null) {
    kpisButton.type = 'button';
    kpisButton.textContent = 'KPIs';
    kpisButton.setAttribute('data-shell-action', 'kpis');
    kpisButton.setAttribute('aria-haspopup', 'dialog');
  }
  const cityButton = options.onOpenCity === undefined ? null : doc.createElement('button');
  if (cityButton !== null) {
    cityButton.type = 'button';
    cityButton.textContent = 'Oraș';
    cityButton.setAttribute('data-shell-action', 'city');
    cityButton.setAttribute('aria-haspopup', 'dialog');
  }
  const missionsButton = options.onOpenMissions === undefined ? null : doc.createElement('button');
  if (missionsButton !== null) {
    missionsButton.type = 'button';
    missionsButton.textContent = 'Misiuni';
    missionsButton.setAttribute('data-shell-action', 'missions');
    missionsButton.setAttribute('aria-haspopup', 'dialog');
  }
  const progressButton = options.onOpenProgress === undefined ? null : doc.createElement('button');
  if (progressButton !== null) {
    progressButton.type = 'button';
    progressButton.textContent = 'Progres';
    progressButton.setAttribute('data-shell-action', 'progress');
    progressButton.setAttribute('aria-haspopup', 'dialog');
  }
  const challengesButton =
    options.onOpenChallenges === undefined ? null : doc.createElement('button');
  if (challengesButton !== null) {
    challengesButton.type = 'button';
    challengesButton.textContent = 'Provocări';
    challengesButton.setAttribute('data-shell-action', 'challenges');
    challengesButton.setAttribute('aria-haspopup', 'dialog');
  }
  const settingsButton = options.onOpenSettings === undefined ? null : doc.createElement('button');
  if (settingsButton !== null) {
    settingsButton.type = 'button';
    settingsButton.textContent = 'Setări';
    settingsButton.setAttribute('data-shell-action', 'settings');
    settingsButton.setAttribute('aria-haspopup', 'dialog');
  }
  const saveButton = options.onSaveGame === undefined ? null : doc.createElement('button');
  if (saveButton !== null) {
    saveButton.type = 'button';
    saveButton.textContent = 'Salvează';
    saveButton.title = 'Salvează jocul în fișier';
    saveButton.setAttribute('data-shell-action', 'save-game');
    saveButton.setAttribute('aria-label', 'Salvează jocul în fișier');
  }
  const loadButton = options.onLoadGame === undefined ? null : doc.createElement('button');
  if (loadButton !== null) {
    loadButton.type = 'button';
    loadButton.textContent = 'Încarcă';
    loadButton.title = 'Încarcă jocul din fișier';
    loadButton.setAttribute('data-shell-action', 'load-game');
    loadButton.setAttribute('aria-label', 'Încarcă jocul din fișier');
    loadButton.setAttribute('aria-haspopup', 'dialog');
  }
  bar.append(badge);
  if (sessionSelect !== null) bar.append(sessionSelect);
  bar.append(startButton, pauseButton, resumeButton, panelButton);
  if (fleetButton !== null) bar.append(fleetButton);
  if (ridesButton !== null) bar.append(ridesButton);
  if (companyButton !== null) bar.append(companyButton);
  if (kpisButton !== null) bar.append(kpisButton);
  if (cityButton !== null) bar.append(cityButton);
  if (missionsButton !== null) bar.append(missionsButton);
  if (progressButton !== null) bar.append(progressButton);
  if (challengesButton !== null) bar.append(challengesButton);
  if (settingsButton !== null) bar.append(settingsButton);
  if (saveButton !== null) bar.append(saveButton);
  if (loadButton !== null) bar.append(loadButton);

  const panel = doc.createElement('div');
  panel.className = 'game-shell-host__panel';
  // `role`/`aria-modal` există numai cât timp panoul este deschis: inputul 025 tratează orice
  // `[role="dialog"][aria-modal="true"]` din document ca blocant, chiar dacă este ascuns.
  panel.setAttribute('aria-labelledby', 'game-shell-panel-title');
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('data-shell-panel', PANEL_ID);
  panel.hidden = true;
  const title = doc.createElement('h2');
  title.id = 'game-shell-panel-title';
  title.textContent = 'Sesiune și integrare';
  const summary = doc.createElement('p');
  summary.className = 'game-shell-host__summary';
  summary.setAttribute('role', 'status');
  summary.setAttribute('aria-live', 'polite');
  const table = doc.createElement('table');
  table.className = 'game-shell-host__table';
  const caption = doc.createElement('caption');
  caption.textContent = 'Ordinea declarată a porturilor pe tick';
  const head = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const label of ['#', 'Sistem', 'PBI', 'Stare', 'Tick-uri']) {
    const cell = doc.createElement('th');
    cell.setAttribute('scope', 'col');
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = doc.createElement('tbody');
  table.append(caption, head, body);
  const note = doc.createElement('p');
  note.className = 'game-shell-host__note';
  note.textContent =
    'Porturile „Neintegrat” sunt dependențe ale taskurilor 261–286. Shell-ul le raportează explicit și nu le înlocuiește cu o simulare paralelă.';
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Închide panoul';
  closeButton.setAttribute('data-shell-action', 'close-panel');
  const resetButton = options.onResetWorld === undefined ? null : doc.createElement('button');
  if (resetButton !== null) {
    resetButton.type = 'button';
    resetButton.textContent = 'Oraș proaspăt, păstrează stilul';
    resetButton.setAttribute('data-shell-action', 'reset-world');
  }
  panel.append(title, summary, table, note);
  if (resetButton !== null) panel.append(resetButton);
  panel.append(closeButton);
  const saveSurface = doc.createElement('div');
  saveSurface.className = 'game-shell-host__save';
  saveSurface.setAttribute('aria-labelledby', 'game-shell-save-title');
  saveSurface.setAttribute('aria-hidden', 'true');
  saveSurface.setAttribute('data-shell-save', 'file');
  saveSurface.hidden = true;
  const saveTitle = doc.createElement('h2');
  saveTitle.id = 'game-shell-save-title';
  saveTitle.textContent = 'Salvează / încarcă jocul';
  const saveStatus = doc.createElement('p');
  saveStatus.setAttribute('role', 'status');
  saveStatus.setAttribute('aria-live', 'polite');
  saveStatus.textContent = 'Nicio acțiune de fișier încă.';
  const savePreview = doc.createElement('ul');
  savePreview.setAttribute('data-shell-save-preview', 'none');
  const fileLabel = doc.createElement('label');
  fileLabel.textContent = 'Fișier .sdasave: ';
  const fileInput = doc.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.sdasave,application/json';
  fileInput.setAttribute('data-shell-action', 'save-file');
  fileLabel.append(fileInput);
  const confirmLoadButton = doc.createElement('button');
  confirmLoadButton.type = 'button';
  confirmLoadButton.textContent = 'Confirmă înlocuirea';
  confirmLoadButton.setAttribute('data-shell-action', 'confirm-load');
  confirmLoadButton.disabled = true;
  const cancelLoadButton = doc.createElement('button');
  cancelLoadButton.type = 'button';
  cancelLoadButton.textContent = 'Anulează';
  cancelLoadButton.setAttribute('data-shell-action', 'cancel-load');
  const closeSaveButton = doc.createElement('button');
  closeSaveButton.type = 'button';
  closeSaveButton.textContent = 'Închide';
  closeSaveButton.setAttribute('data-shell-action', 'close-save');
  saveSurface.append(
    saveTitle,
    saveStatus,
    savePreview,
    fileLabel,
    confirmLoadButton,
    cancelLoadButton,
    closeSaveButton,
  );
  host.append(bar, panel, saveSurface);
  root.append(host);

  let styleElement: HTMLElement | null = null;
  if (options.style !== false && doc.head && typeof doc.createElement === 'function') {
    styleElement = doc.createElement('style');
    styleElement.setAttribute('data-game-shell-style', GAME_SHELL_HOST_VERSION);
    styleElement.textContent = STYLE_TEXT;
    doc.head.append(styleElement);
  }

  let disposed = false;
  let panelOpen = false;
  let saveOpen = false;
  let saveActions = 0;
  let loadPreviews = 0;
  let importsConfirmed = 0;
  let settingsOpens = 0;
  let pendingPreviewId: string | null = null;
  let saveBusy = false;
  let previousSaveFocus: Element | null = null;
  let sessionKind: string | null = null;
  let previousFocus: Element | null = null;
  let lastRefreshAt: number | null = null;
  let opens = 0;
  let closes = 0;
  let restores = 0;
  let refreshes = 0;
  let rowWrites = 0;
  let tabTraps = 0;
  let sessionChoices = 0;
  let sessionSelects = 0;
  let lastMenuSignature = '';
  let listeners =
    (sessionSelect === null ? 6 : 7) +
    (resetButton === null ? 0 : 1) +
    (fleetButton === null ? 0 : 1) +
    (ridesButton === null ? 0 : 1) +
    (companyButton === null ? 0 : 1) +
    (kpisButton === null ? 0 : 1) +
    (cityButton === null ? 0 : 1) +
    (missionsButton === null ? 0 : 1) +
    (progressButton === null ? 0 : 1) +
    (challengesButton === null ? 0 : 1) +
    (settingsButton === null ? 0 : 1) +
    (saveButton === null ? 0 : 1) +
    (loadButton === null ? 0 : 1) +
    (options.onLoadGame === undefined
      ? 0
      : 2 + (options.onConfirmLoad === undefined ? 0 : 1) + 1 + 1);
  const rows = new Map<string, Row>();

  const syncSession = (): void => {
    if (disposed || sessionSelect === null || options.sessionMenu === undefined) return;
    const menu = options.sessionMenu();
    const signature = menu.choices
      .map(
        (choice) =>
          `${choice.kind}:${choice.label}:${String(choice.checkpoints)}:${choice.profileId}:` +
          `${String(choice.worldEpoch)}:${String(choice.learningEpoch)}`,
      )
      .join('|');
    if (signature !== lastMenuSignature) {
      while (sessionSelect.children.length > 0) sessionSelect.children[0]!.remove();
      for (const choice of menu.choices) {
        const option = doc.createElement('option');
        option.value = choice.kind;
        option.textContent = choice.label;
        option.setAttribute('data-session-kind', choice.kind);
        sessionSelect.append(option);
      }
      lastMenuSignature = signature;
      sessionChoices = menu.choices.length;
    }
    const known = menu.choices.some((choice) => choice.kind === sessionSelect.value);
    sessionSelect.value =
      menu.live ?? (known ? sessionSelect.value : (menu.choices[0]?.kind ?? ''));
    sessionSelects += 1;
  };

  const initial = options.snapshot();
  for (const system of initial.systems) {
    const row = doc.createElement('tr');
    row.setAttribute('data-shell-system', system.id);
    const orderCell = doc.createElement('td');
    orderCell.textContent = String(system.order);
    const titleCell = doc.createElement('td');
    titleCell.textContent = system.title;
    const ownerCell = doc.createElement('td');
    ownerCell.textContent = system.owner;
    const statusCell = doc.createElement('td');
    statusCell.setAttribute('data-shell-cell', 'status');
    const stepsCell = doc.createElement('td');
    stepsCell.setAttribute('data-shell-cell', 'steps');
    row.append(orderCell, titleCell, ownerCell, statusCell, stepsCell);
    body.append(row);
    rows.set(system.id, { row, status: statusCell, steps: stepsCell });
  }

  const updateControls = (): void => {
    const kind = sessionKind ?? 'LOADING';
    const hiddenBar = kind === 'LOADING' || kind === 'ERROR' || kind === 'DISPOSED';
    bar.hidden = hiddenBar;
    startButton.hidden = panelOpen || kind !== 'READY';
    pauseButton.hidden = panelOpen || kind !== 'PLAYING';
    resumeButton.hidden = panelOpen || kind !== 'PAUSED';
    panelButton.hidden = panelOpen;
    if (fleetButton !== null)
      fleetButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (ridesButton !== null)
      ridesButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (companyButton !== null)
      companyButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (kpisButton !== null)
      kpisButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (cityButton !== null)
      cityButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (missionsButton !== null)
      missionsButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (progressButton !== null)
      progressButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (challengesButton !== null)
      challengesButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (settingsButton !== null)
      settingsButton.hidden =
        panelOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (saveButton !== null)
      saveButton.hidden =
        panelOpen || saveOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    if (loadButton !== null)
      loadButton.hidden =
        panelOpen || saveOpen || (kind !== 'READY' && kind !== 'PLAYING' && kind !== 'PAUSED');
    badge.textContent = panelOpen ? 'PANOU' : saveOpen ? 'FIȘIER' : kind;
    badge.setAttribute('data-shell-kind', panelOpen ? 'PANEL' : saveOpen ? 'FILE' : kind);
    host.setAttribute('data-shell-state', panelOpen ? 'PANEL' : saveOpen ? 'FILE' : kind);
  };

  const writeRow = (system: GameShellStatus['systems'][number]): void => {
    const row = rows.get(system.id);
    if (row === undefined) return;
    const status = system.status === 'PRESENT' ? 'Prezent' : 'Neintegrat';
    if (row.status.textContent !== status) {
      row.status.textContent = status;
      rowWrites += 1;
    }
    const steps = String(system.steps);
    if (row.steps.textContent !== steps) {
      row.steps.textContent = steps;
      rowWrites += 1;
    }
    row.row.setAttribute('data-shell-status', system.status);
  };

  const refresh = (force = false): void => {
    if (disposed) return;
    if (!panelOpen && !force) return;
    const at = now();
    if (!force && lastRefreshAt !== null && at - lastRefreshAt < GAME_SHELL_HOST_REFRESH_MS) return;
    const status = options.snapshot();
    syncSession();
    const total = status.portsPresent + status.portsAbsent;
    const liveSession =
      options.sessionMenu?.().choices.find((choice) => choice.live)?.label ?? 'nealeasă';
    summary.textContent =
      `Sesiune ${liveSession} · ${status.sessionId} · epoch ${status.worldEpoch} · ` +
      `learning ${status.learningEpoch} · tick ${status.tick} · ` +
      `mod ${status.mode} · ${status.paused ? `pauză (${status.cause ?? 'manual'})` : 'rulează'} · ` +
      `porturi ${status.portsPresent}/${total}`;
    const world = status.world;
    note.textContent =
      `Lume: ${world.attached ? `atașată la tick ${world.tick}` : 'detașată'} · ` +
      `atașări ${world.attachments} · lumi active ${world.activeWorlds}/${world.maxActiveWorlds}. ` +
      'Porturile „Neintegrat” sunt dependențe ale taskurilor 261–286; shell-ul nu le simulează.';
    for (const system of status.systems) writeRow(system);
    refreshSaveStatus();
    lastRefreshAt = at;
    refreshes += 1;
    updateControls();
  };

  const showPanel = (): void => {
    if (disposed) throw new Error('Game shell host is disposed.');
    if (panelOpen) return;
    panelOpen = true;
    opens += 1;
    refresh(true);
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panelButton.setAttribute('aria-expanded', 'true');
    updateControls();
    const active = doc.activeElement;
    previousFocus = active ?? null;
    focusQuietly(closeButton);
  };

  const hidePanel = (): void => {
    if (!panelOpen) return;
    panelOpen = false;
    closes += 1;
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    panelButton.setAttribute('aria-expanded', 'false');
    updateControls();
    if (focusQuietly(previousFocus)) restores += 1;
    previousFocus = null;
  };

  const close = (): void => {
    if (!panelOpen) return;
    hidePanel();
    // Portul de închidere rulează după ce suprafața modală a dispărut: 025 poate primi din nou
    // taste de condus, iar gazda poate readuce focusul pe canvas.
    options.onClosePanel();
  };

  const onStart = (): void => options.onStart();
  const onPause = (): void => options.onPause();
  const onResume = (): void => options.onResume();
  const onSession = (): void => {
    if (sessionSelect === null) return;
    options.onChooseSession?.(sessionSelect.value);
    syncSession();
  };
  const onReset = (): void => {
    if (!panelOpen) return;
    close();
    options.onResetWorld?.();
  };
  const onPanel = (): void => {
    if (panelOpen) {
      close();
      return;
    }
    if (!options.onOpenPanel()) return;
    showPanel();
  };
  const onClose = (): void => close();
  const onFleet = (): void => {
    if (panelOpen) return;
    options.onOpenFleet?.();
  };
  const onRides = (): void => {
    if (panelOpen) return;
    options.onOpenRides?.();
  };
  const onCompany = (): void => {
    if (panelOpen) return;
    options.onOpenCompany?.();
  };
  const onKpis = (): void => {
    if (panelOpen) return;
    options.onOpenKpis?.();
  };
  const onCity = (): void => {
    if (panelOpen) return;
    options.onOpenCity?.();
  };
  const onMissions = (): void => {
    if (panelOpen) return;
    options.onOpenMissions?.();
  };
  const onProgress = (): void => {
    if (panelOpen) return;
    options.onOpenProgress?.();
  };
  const onChallenges = (): void => {
    if (panelOpen) return;
    options.onOpenChallenges?.();
  };
  const onSettings = (): void => {
    if (panelOpen || saveOpen) return;
    settingsOpens += 1;
    options.onOpenSettings?.();
  };
  const onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      tabTraps += 1;
      focusQuietly(closeButton);
    }
  };

  const renderFileResult = (result: GameShellFileResult): void => {
    saveStatus.textContent = result.message;
    saveStatus.setAttribute('data-save-status', result.status);
    savePreview.textContent = '';
    const lines = result.lines ?? [];
    savePreview.setAttribute('data-shell-save-preview', result.status);
    for (const line of lines) {
      const item = doc.createElement('li');
      item.textContent = line;
      savePreview.append(item);
    }
    pendingPreviewId = result.status === 'PREVIEW' ? (result.previewId ?? null) : null;
    confirmLoadButton.disabled =
      pendingPreviewId === null || options.onConfirmLoad === undefined || saveBusy;
    confirmLoadButton.setAttribute('data-preview-id', pendingPreviewId ?? '');
  };

  const refreshSaveStatus = (): void => {
    if (options.saveStatus === undefined || saveBusy || pendingPreviewId !== null) return;
    saveStatus.textContent = options.saveStatus().detail;
  };

  const download = (fileName: string, text: string): boolean => {
    const view = doc.defaultView;
    if (view === null || typeof view.Blob !== 'function' || view.URL === undefined) return false;
    try {
      const url = view.URL.createObjectURL(new view.Blob([text], { type: 'application/json' }));
      const link = doc.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      link.click();
      view.URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  };

  const showSaveSurface = (): void => {
    if (disposed || saveOpen) return;
    if (panelOpen) close();
    saveOpen = true;
    saveActions += 1;
    previousSaveFocus = doc.activeElement;
    const current = options.saveStatus?.();
    renderFileResult({
      status: 'READY',
      message:
        current === undefined
          ? 'Alege un fișier .sdasave; nimic nu este înlocuit înainte de confirmare.'
          : `${current.label} · ${current.detail}. Alege un fișier .sdasave; nimic nu este înlocuit înainte de confirmare.`,
      lines: [],
    });
    saveSurface.hidden = false;
    saveSurface.setAttribute('aria-hidden', 'false');
    saveSurface.setAttribute('role', 'dialog');
    saveSurface.setAttribute('aria-modal', 'true');
    loadButton?.setAttribute('aria-expanded', 'true');
    updateControls();
    focusQuietly(fileInput);
  };

  const hideSaveSurface = (): void => {
    if (!saveOpen) return;
    saveOpen = false;
    saveSurface.hidden = true;
    saveSurface.setAttribute('aria-hidden', 'true');
    saveSurface.removeAttribute('role');
    saveSurface.removeAttribute('aria-modal');
    loadButton?.setAttribute('aria-expanded', 'false');
    pendingPreviewId = null;
    confirmLoadButton.disabled = true;
    fileInput.value = '';
    updateControls();
    if (focusQuietly(previousSaveFocus)) restores += 1;
    previousSaveFocus = null;
  };

  const runSave = async (): Promise<void> => {
    if (saveBusy || options.onSaveGame === undefined) return;
    saveBusy = true;
    saveActions += 1;
    renderFileResult({
      status: 'READY',
      message: 'Se pregătește fișierul...',
      lines: [],
    });
    try {
      const result = await options.onSaveGame();
      if (result.status === 'READY' && result.text !== null && result.text !== undefined) {
        const written = download(result.fileName ?? 'self-driving-academy.sdasave', result.text);
        renderFileResult({
          ...result,
          message: written
            ? `Fișier pregătit pentru descărcare · ${result.fileName ?? ''}`
            : `${result.message} · descărcarea nu este disponibilă în acest browser`,
        });
      } else {
        renderFileResult(result);
      }
    } catch (error) {
      renderFileResult({
        status: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
        lines: [],
      });
    } finally {
      saveBusy = false;
    }
  };

  const loadFileText = async (fileName: string, text: string): Promise<void> => {
    if (saveBusy || options.onLoadGame === undefined) return;
    if (!saveOpen) showSaveSurface();
    saveBusy = true;
    loadPreviews += 1;
    renderFileResult({
      status: 'READY',
      message: `Se verifică ${fileName}...`,
      lines: [],
    });
    try {
      const result = await options.onLoadGame({ fileName, text });
      renderFileResult(result);
    } catch (error) {
      renderFileResult({
        status: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
        lines: [],
      });
    } finally {
      saveBusy = false;
      confirmLoadButton.disabled = pendingPreviewId === null || options.onConfirmLoad === undefined;
    }
  };

  const runConfirm = async (): Promise<void> => {
    if (saveBusy || pendingPreviewId === null || options.onConfirmLoad === undefined) return;
    saveBusy = true;
    try {
      const result = await options.onConfirmLoad();
      renderFileResult(result);
      if (result.status === 'COMMITTED') importsConfirmed += 1;
    } catch (error) {
      renderFileResult({
        status: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
        lines: [],
      });
    } finally {
      saveBusy = false;
      confirmLoadButton.disabled = pendingPreviewId === null;
    }
  };

  const onSave = (): void => {
    void runSave();
  };
  const onLoad = (): void => {
    showSaveSurface();
  };
  const onFileChange = (): void => {
    const file = fileInput.files?.[0];
    if (file === undefined) return;
    void file.text().then((text) => loadFileText(file.name, text));
  };
  const onConfirm = (): void => {
    void runConfirm();
  };
  const onCancel = (): void => {
    pendingPreviewId = null;
    confirmLoadButton.disabled = true;
    options.onCancelLoad?.();
    hideSaveSurface();
  };
  const onCloseSave = (): void => hideSaveSurface();
  const onSaveKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      tabTraps += 1;
      focusQuietly(confirmLoadButton.disabled ? closeSaveButton : confirmLoadButton);
    }
  };

  startButton.addEventListener('click', onStart);
  pauseButton.addEventListener('click', onPause);
  resumeButton.addEventListener('click', onResume);
  sessionSelect?.addEventListener('change', onSession);
  resetButton?.addEventListener('click', onReset);
  panelButton.addEventListener('click', onPanel);
  fleetButton?.addEventListener('click', onFleet);
  ridesButton?.addEventListener('click', onRides);
  companyButton?.addEventListener('click', onCompany);
  kpisButton?.addEventListener('click', onKpis);
  cityButton?.addEventListener('click', onCity);
  missionsButton?.addEventListener('click', onMissions);
  progressButton?.addEventListener('click', onProgress);
  challengesButton?.addEventListener('click', onChallenges);
  settingsButton?.addEventListener('click', onSettings);
  saveButton?.addEventListener('click', onSave);
  loadButton?.addEventListener('click', onLoad);
  fileInput.addEventListener('change', onFileChange);
  confirmLoadButton.addEventListener('click', onConfirm);
  cancelLoadButton.addEventListener('click', onCancel);
  closeSaveButton.addEventListener('click', onCloseSave);
  saveSurface.addEventListener('keydown', onSaveKeyDown);
  closeButton.addEventListener('click', onClose);
  panel.addEventListener('keydown', onPanelKeyDown);

  syncSession();
  updateControls();

  return Object.freeze({
    version: GAME_SHELL_HOST_VERSION,
    root: host,
    setSessionState(kind: string): void {
      if (disposed) throw new Error('Game shell host is disposed.');
      sessionKind = kind;
      updateControls();
      syncSession();
      if (panelOpen) refresh(true);
    },
    refreshSession(): void {
      if (disposed) return;
      syncSession();
    },
    loadFileText,
    refresh,
    isPanelOpen: () => panelOpen,
    isSaveOpen: () => saveOpen,
    getStats: () =>
      Object.freeze({
        version: GAME_SHELL_HOST_VERSION,
        disposed,
        panelOpen,
        sessionKind,
        sessionChoices,
        sessionSelects,
        opens,
        closes,
        restores,
        refreshes,
        rowWrites,
        tabTraps,
        listeners: disposed ? 0 : listeners,
        globalListeners: 0 as const,
        focusables: (panelOpen || saveOpen) && !disposed ? 1 : 0,
        saveOpen,
        saveActions,
        loadPreviews,
        importsConfirmed,
        settingsOpens,
        lastRefreshAt,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      startButton.removeEventListener('click', onStart);
      pauseButton.removeEventListener('click', onPause);
      resumeButton.removeEventListener('click', onResume);
      sessionSelect?.removeEventListener('change', onSession);
      resetButton?.removeEventListener('click', onReset);
      panelButton.removeEventListener('click', onPanel);
      fleetButton?.removeEventListener('click', onFleet);
      ridesButton?.removeEventListener('click', onRides);
      companyButton?.removeEventListener('click', onCompany);
      kpisButton?.removeEventListener('click', onKpis);
      cityButton?.removeEventListener('click', onCity);
      missionsButton?.removeEventListener('click', onMissions);
      progressButton?.removeEventListener('click', onProgress);
      challengesButton?.removeEventListener('click', onChallenges);
      settingsButton?.removeEventListener('click', onSettings);
      saveButton?.removeEventListener('click', onSave);
      loadButton?.removeEventListener('click', onLoad);
      fileInput.removeEventListener('change', onFileChange);
      confirmLoadButton.removeEventListener('click', onConfirm);
      cancelLoadButton.removeEventListener('click', onCancel);
      closeSaveButton.removeEventListener('click', onCloseSave);
      saveSurface.removeEventListener('keydown', onSaveKeyDown);
      closeButton.removeEventListener('click', onClose);
      panel.removeEventListener('keydown', onPanelKeyDown);
      listeners = 0;
      panelOpen = false;
      saveOpen = false;
      pendingPreviewId = null;
      previousFocus = null;
      previousSaveFocus = null;
      rows.clear();
      styleElement?.remove();
      styleElement = null;
      host.remove();
    },
  });
}
