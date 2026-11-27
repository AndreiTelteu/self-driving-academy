import type { ApplicationState, RenderingState } from '../app';

export function createRenderingView(root: HTMLDivElement) {
  // PBI 251: canvasul de joc umple fereastra (`.game-stage`); ecranul de start, meniul de pauză
  // și HUD-ul sunt overlay-uri moderne peste el. Panoul de debug este disponibil doar cu ?debug=1.
  const section = document.createElement('section');
  section.className = 'game-shell';

  // Canvas de joc
  const host = document.createElement('div');
  host.className = 'game-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.setAttribute('aria-label', 'Scenă de randare Babylon.js');
  host.append(canvas);

  // Ecran de start (251): overlay fullscreen cu titlu și butoane
  const startScreen = document.createElement('div');
  startScreen.className = 'start-screen';
  startScreen.setAttribute('role', 'dialog');
  startScreen.setAttribute('aria-label', 'Ecran de start');
  startScreen.innerHTML = `
    <div class="start-screen__content">
      <h1 class="start-screen__title">Self Driving Academy</h1>
      <p class="start-screen__subtitle">Învață să conduci într-un oraș virtual</p>
      <div class="start-screen__loading" role="status" aria-live="polite">
        <div class="start-screen__spinner"></div>
        <span class="start-screen__status">Se încarcă...</span>
      </div>
      <div class="start-screen__actions">
        <button type="button" class="start-screen__button start-screen__button--primary" data-action="play">Joacă</button>
        <button type="button" class="start-screen__button" data-action="settings">Setări</button>
      </div>
    </div>
  `;

  // Meniu de pauză (251): overlay cu acțiuni
  const pauseMenu = document.createElement('div');
  pauseMenu.className = 'pause-menu';
  pauseMenu.setAttribute('role', 'dialog');
  pauseMenu.setAttribute('aria-label', 'Meniu de pauză');
  pauseMenu.hidden = true;
  pauseMenu.innerHTML = `
    <div class="pause-menu__content">
      <h2 class="pause-menu__title">Pauză</h2>
      <div class="pause-menu__actions">
        <button type="button" class="pause-menu__button pause-menu__button--primary" data-action="resume">Reia</button>
        <button type="button" class="pause-menu__button" data-action="settings">Setări</button>
        <button type="button" class="pause-menu__button" data-action="restart">Reîncarcă</button>
        <button type="button" class="pause-menu__button pause-menu__button--danger" data-action="quit">Ieși</button>
      </div>
    </div>
  `;

  // HUD de joc (251): vitezometru și indicatori moderni
  const gameHud = document.createElement('div');
  gameHud.className = 'game-hud';
  gameHud.hidden = true;
  gameHud.innerHTML = `
    <div class="game-hud__speed">
      <output class="game-hud__speed-value">0</output>
      <span class="game-hud__speed-unit">km/h</span>
    </div>
    <div class="game-hud__modes" role="group" aria-label="Mod de control">
      <button type="button" class="game-hud__mode" data-action="mode" aria-keyshortcuts="M" title="M comută AUTO/MANUAL">
        <span class="game-hud__mode-symbol">M</span>
        <span class="game-hud__mode-text">Conduce AI-ul</span>
      </button>
      <button type="button" class="game-hud__mode game-hud__learning" data-action="learning" aria-keyshortcuts="L" title="L comută LEARNING">
        <span class="game-hud__mode-symbol">L</span>
        <span class="game-hud__mode-text">Learning</span>
      </button>
      <span class="game-hud__eligibility" role="status"></span>
    </div>
    <div class="game-hud__hint" data-hint="enter-vehicle" hidden>
      <kbd>G</kbd> Intră în taxi
    </div>
  `;

  // Overlay vechi pentru compatibilitate cu testele existente (251: ascuns în producție)
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay';
  overlay.hidden = true; // 251: ascuns în producție, vizibil doar pentru debug
  const title = document.createElement('h1');
  title.textContent = 'Self Driving Academy';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const retry = document.createElement('button');
  const play = document.createElement('button');
  const pause = document.createElement('button');
  for (const button of [retry, play, pause]) button.type = 'button';
  retry.textContent = 'Reîncearcă';
  play.textContent = 'Pornește';
  pause.textContent = 'Pauză';
  retry.hidden = play.hidden = pause.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'game-overlay__actions';
  actions.append(play, pause, retry);
  overlay.append(title, status, actions);

  section.append(host, startScreen, pauseMenu, gameHud, overlay);
  root.append(section);

  let onRetry = (): void => {};
  let onPlay = (): void => {};
  let onPause = (): void => {};
  let onMode = (): void => {};
  let onLearning = (): void => {};
  let onSettings = (): void => {};
  const retryClick = (): void => onRetry();
  const playClick = (): void => onPlay();
  const pauseClick = (): void => onPause();
  const modeClick = (): void => onMode();
  const learningClick = (): void => onLearning();
  const settingsClick = (): void => onSettings();
  retry.addEventListener('click', retryClick);
  play.addEventListener('click', playClick);
  pause.addEventListener('click', pauseClick);
  const speedValue = gameHud.querySelector<HTMLOutputElement>('.game-hud__speed-value');
  const speedUnit = gameHud.querySelector<HTMLElement>('.game-hud__speed-unit');
  const modeButton = gameHud.querySelector<HTMLButtonElement>(
    '.game-hud__mode[data-action="mode"]',
  );
  const learningButton = gameHud.querySelector<HTMLButtonElement>(
    '.game-hud__mode[data-action="learning"]',
  );
  const learningText = gameHud.querySelector<HTMLElement>(
    '.game-hud__learning .game-hud__mode-text',
  );
  const modeSymbol = gameHud.querySelector<HTMLElement>('.game-hud__mode-symbol');
  const modeText = gameHud.querySelector<HTMLElement>('.game-hud__mode-text');
  const eligibilityText = gameHud.querySelector<HTMLElement>('.game-hud__eligibility');
  modeButton?.addEventListener('click', modeClick);
  learningButton?.addEventListener('click', learningClick);

  // 251: butoanele din ecranul de start și meniul de pauză
  const startSettingsButton = startScreen.querySelector('[data-action="settings"]');
  const pauseSettingsButton = pauseMenu.querySelector('[data-action="settings"]');
  startScreen.querySelector('[data-action="play"]')?.addEventListener('click', playClick);
  startSettingsButton?.addEventListener('click', settingsClick);
  pauseMenu.querySelector('[data-action="resume"]')?.addEventListener('click', playClick);
  pauseSettingsButton?.addEventListener('click', settingsClick);
  pauseMenu.querySelector('[data-action="restart"]')?.addEventListener('click', retryClick);
  pauseMenu.querySelector('[data-action="quit"]')?.addEventListener('click', () => {
    window.location.reload();
  });

  return {
    getCanvas: (): HTMLCanvasElement => {
      const current = host.querySelector('canvas');
      if (!current) throw new Error('Canvas lipsește');
      return current;
    },
    onRetry(callback: () => void): void {
      onRetry = callback;
    },
    onPlay(callback: () => void): void {
      onPlay = callback;
    },
    onPause(callback: () => void): void {
      onPause = callback;
    },
    onMode(callback: () => void): void {
      onMode = callback;
    },
    onLearning(callback: () => void): void {
      onLearning = callback;
    },
    /** PBI 279: the native Settings buttons of the start screen and pause menu. */
    onSettings(callback: () => void): void {
      onSettings = callback;
    },
    /** PBI 257/271: HUD-ul central citește frame-ul compunerii, nu starea statică din HTML. */
    updatePlayHud(view: {
      readonly speedMps: number;
      readonly mode: 'AUTO' | 'MANUAL' | 'LEARNING' | null;
      readonly controlledKind: 'CHARACTER' | 'VEHICLE';
      readonly canToggle: boolean;
      readonly canLearn?: boolean;
      readonly learningEligible?: boolean;
      /** PBI 279: presentation only; SI remains the authoritative value. */
      readonly speedUnit?: 'km/h' | 'mph';
    }): void {
      const unit = view.speedUnit ?? 'km/h';
      const speed = Math.max(
        0,
        Math.round(Math.abs(view.speedMps) * (unit === 'mph' ? 2.2369362920544 : 3.6)),
      );
      if (speedValue && speedValue.textContent !== String(speed))
        speedValue.textContent = String(speed);
      if (speedUnit && speedUnit.textContent !== unit) speedUnit.textContent = unit;
      if (speedValue) speedValue.setAttribute('aria-label', `${speed} ${unit}`);
      const symbol =
        view.controlledKind === 'CHARACTER'
          ? '—'
          : view.mode === 'AUTO'
            ? 'AI'
            : view.mode === 'LEARNING'
              ? 'L'
              : 'M';
      const text =
        view.controlledKind === 'CHARACTER'
          ? 'Pe jos · M în mașină'
          : view.mode === 'AUTO'
            ? 'Conduce AI-ul'
            : view.mode === 'LEARNING'
              ? 'Conduci · orașul învață'
              : 'Conduci · învățare oprită';
      if (modeSymbol && modeSymbol.textContent !== symbol) modeSymbol.textContent = symbol;
      if (modeText && modeText.textContent !== text) modeText.textContent = text;
      if (learningText) {
        const learning = view.controlledKind === 'CHARACTER' ? 'Learning' : 'Learning · L';
        if (learningText.textContent !== learning) learningText.textContent = learning;
      }
      const canLearn = view.canLearn ?? view.canToggle;
      if (modeButton) {
        modeButton.disabled = !view.canToggle;
        modeButton.dataset.mode = view.mode ?? 'NONE';
        modeButton.title = view.canToggle
          ? 'M: AUTO ↔ MANUAL (LEARNING → AUTO)'
          : 'Intră într-o mașină';
        modeButton.setAttribute(
          'aria-label',
          view.canToggle
            ? `Mod ${view.mode ?? 'necunoscut'}; M comută AUTO/MANUAL`
            : 'Mod indisponibil pe jos; intră într-o mașină',
        );
      }
      if (learningButton) {
        learningButton.disabled = !canLearn;
        learningButton.dataset.mode = view.mode ?? 'NONE';
        learningButton.title = canLearn ? 'L: LEARNING ↔ MANUAL' : 'Întră într-o mașină';
        learningButton.setAttribute(
          'aria-label',
          canLearn ? 'L comută LEARNING' : 'LEARNING indisponibil pe jos',
        );
      }
      if (eligibilityText) {
        const eligibility =
          view.controlledKind === 'CHARACTER' || view.learningEligible === undefined
            ? ''
            : view.learningEligible
              ? 'Eligibil pentru învățare'
              : 'Învățare neeligibilă';
        if (eligibilityText.textContent !== eligibility) eligibilityText.textContent = eligibility;
      }
    },
    show(state: RenderingState | ApplicationState): void {
      section.dataset.state = state.kind;
      section.setAttribute('aria-busy', String(state.kind === 'LOADING'));
      status.setAttribute('role', state.kind === 'ERROR' ? 'alert' : 'status');

      // 251: actualizează ecranul de start
      const startLoading = startScreen.querySelector('.start-screen__loading');
      const startStatus = startScreen.querySelector('.start-screen__status');
      const startActions = startScreen.querySelector('.start-screen__actions');

      switch (state.kind) {
        case 'LOADING':
          status.textContent = 'Se inițializează randarea…';
          startScreen.hidden = false;
          startLoading?.removeAttribute('hidden');
          startActions?.setAttribute('hidden', '');
          if (startStatus) startStatus.textContent = 'Se încarcă...';
          pauseMenu.hidden = true;
          gameHud.hidden = true;
          break;
        case 'READY':
          status.textContent = `Bootstrap pregătit · Babylon.js · ${state.rendererKind}`;
          startScreen.hidden = false;
          startLoading?.setAttribute('hidden', '');
          startActions?.removeAttribute('hidden');
          pauseMenu.hidden = true;
          gameHud.hidden = true;
          break;
        case 'PLAYING':
          status.textContent = `Sesiune bootstrap pornită · ${state.rendererKind}`;
          startScreen.hidden = true;
          pauseMenu.hidden = true;
          gameHud.hidden = false;
          break;
        case 'PAUSED':
          status.textContent =
            state.reason === 'overload'
              ? 'Pauză de suprasarcină. Redu costul vizual înainte de reluare.'
              : state.reason === 'panel'
                ? 'Sesiune suspendată de un panou deschis.'
                : 'Sesiune în pauză';
          startScreen.hidden = true;
          // PBI 260: un panou deschis suspendă simularea fără să afișeze meniul de pauză; gazda
          // shell-ului deține suprafața modală și o închide prin portul ei.
          pauseMenu.hidden = state.reason === 'panel';
          gameHud.hidden = state.reason === 'panel';
          break;
        case 'ERROR':
          status.textContent = `Randarea nu a pornit. ${state.message}`;
          startScreen.hidden = false;
          startLoading?.removeAttribute('hidden');
          startActions?.setAttribute('hidden', '');
          if (startStatus) startStatus.textContent = `Eroare: ${state.message}`;
          pauseMenu.hidden = true;
          gameHud.hidden = true;
          break;
        case 'DISPOSED':
          status.textContent = 'Sesiune închisă';
          startScreen.hidden = false;
          startLoading?.removeAttribute('hidden');
          startActions?.setAttribute('hidden', '');
          if (startStatus) startStatus.textContent = 'Sesiune închisă';
          pauseMenu.hidden = true;
          gameHud.hidden = true;
          break;
      }
      retry.hidden = !['ERROR', 'READY', 'PLAYING', 'PAUSED'].includes(state.kind);
      retry.textContent = state.kind === 'ERROR' ? 'Reîncearcă' : 'Reîncarcă';
      play.hidden = state.kind !== 'READY' && state.kind !== 'PAUSED';
      play.textContent = state.kind === 'PAUSED' ? 'Reia' : 'Pornește';
      pause.hidden = state.kind !== 'PLAYING';
      host.hidden = state.kind === 'ERROR' || state.kind === 'DISPOSED';
    },
    dispose(): void {
      retry.removeEventListener('click', retryClick);
      play.removeEventListener('click', playClick);
      pause.removeEventListener('click', pauseClick);
      startSettingsButton?.removeEventListener('click', settingsClick);
      pauseSettingsButton?.removeEventListener('click', settingsClick);
      section.remove();
    },
  };
}
