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
    <button type="button" class="game-hud__mode" data-action="mode" aria-keyshortcuts="M" title="M comută MANUAL/AUTO">
      <span class="game-hud__mode-symbol">M</span>
      <span class="game-hud__mode-text">Manual · M pentru AUTO</span>
    </button>
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
  const retryClick = (): void => onRetry();
  const playClick = (): void => onPlay();
  const pauseClick = (): void => onPause();
  const modeClick = (): void => onMode();
  retry.addEventListener('click', retryClick);
  play.addEventListener('click', playClick);
  pause.addEventListener('click', pauseClick);
  const speedValue = gameHud.querySelector<HTMLOutputElement>('.game-hud__speed-value');
  const modeButton = gameHud.querySelector<HTMLButtonElement>('.game-hud__mode');
  const modeSymbol = gameHud.querySelector<HTMLElement>('.game-hud__mode-symbol');
  const modeText = gameHud.querySelector<HTMLElement>('.game-hud__mode-text');
  modeButton?.addEventListener('click', modeClick);

  // 251: butoanele din ecranul de start și meniul de pauză
  startScreen.querySelector('[data-action="play"]')?.addEventListener('click', playClick);
  startScreen.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
    // TODO: deschide setările
    console.log('Settings clicked');
  });
  pauseMenu.querySelector('[data-action="resume"]')?.addEventListener('click', playClick);
  pauseMenu.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
    // TODO: deschide setările
    console.log('Settings clicked');
  });
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
    /** PBI 257: HUD-ul central citește frame-ul compunerii, nu starea statică din HTML. */
    updatePlayHud(view: {
      readonly speedMps: number;
      readonly mode: 'AUTO' | 'MANUAL' | 'LEARNING' | null;
      readonly controlledKind: 'CHARACTER' | 'VEHICLE';
      readonly canToggle: boolean;
    }): void {
      const kmh = Math.max(0, Math.round(Math.abs(view.speedMps) * 3.6));
      if (speedValue && speedValue.textContent !== String(kmh))
        speedValue.textContent = String(kmh);
      const symbol =
        view.mode === 'AUTO' ? 'AI' : view.mode === 'LEARNING' ? 'L' : view.mode ? 'M' : '—';
      const text =
        view.controlledKind === 'CHARACTER'
          ? 'Pe jos · M în mașină'
          : view.mode === 'AUTO'
            ? 'AUTO · Conduce AI-ul (M)'
            : view.mode === 'LEARNING'
              ? 'LEARNING · Conduci tu (M)'
              : 'MANUAL · Conduci tu (M)';
      if (modeSymbol && modeSymbol.textContent !== symbol) modeSymbol.textContent = symbol;
      if (modeText && modeText.textContent !== text) modeText.textContent = text;
      if (modeButton) {
        modeButton.disabled = !view.canToggle;
        modeButton.dataset.mode = view.mode ?? 'NONE';
        modeButton.title = view.canToggle
          ? 'M comută MANUAL/AUTO'
          : 'Intră într-o mașină pentru AUTO';
        modeButton.setAttribute(
          'aria-label',
          view.canToggle
            ? `Mod ${view.mode ?? 'necunoscut'}; M comută MANUAL/AUTO`
            : 'Mod indisponibil pe jos; intră într-o mașină',
        );
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
              : 'Sesiune în pauză';
          startScreen.hidden = true;
          pauseMenu.hidden = false;
          gameHud.hidden = true;
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
      section.remove();
    },
  };
}
