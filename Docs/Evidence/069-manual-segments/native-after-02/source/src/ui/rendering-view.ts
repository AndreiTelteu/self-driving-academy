import type { ApplicationState, RenderingState } from '../app';

export function createRenderingView(root: HTMLDivElement) {
  const section = document.createElement('section');
  const title = document.createElement('h1');
  title.textContent = 'Self Driving Academy';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Scenă de randare Babylon.js');
  host.append(canvas);
  const retry = document.createElement('button');
  const play = document.createElement('button');
  const pause = document.createElement('button');
  for (const button of [retry, play, pause]) button.type = 'button';
  retry.textContent = 'Reîncearcă';
  play.textContent = 'Pornește';
  pause.textContent = 'Pauză';
  retry.hidden = play.hidden = pause.hidden = true;
  section.append(title, status, host, play, pause, retry);
  root.append(section);
  let onRetry = (): void => {};
  let onPlay = (): void => {};
  let onPause = (): void => {};
  const retryClick = (): void => onRetry();
  const playClick = (): void => onPlay();
  const pauseClick = (): void => onPause();
  retry.addEventListener('click', retryClick);
  play.addEventListener('click', playClick);
  pause.addEventListener('click', pauseClick);
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
    show(state: RenderingState | ApplicationState): void {
      section.dataset.state = state.kind;
      section.setAttribute('aria-busy', String(state.kind === 'LOADING'));
      status.setAttribute('role', state.kind === 'ERROR' ? 'alert' : 'status');
      switch (state.kind) {
        case 'LOADING':
          status.textContent = 'Se inițializează randarea…';
          break;
        case 'READY':
          status.textContent = `Bootstrap pregătit · Babylon.js · ${state.rendererKind}`;
          break;
        case 'PLAYING':
          status.textContent = `Sesiune bootstrap pornită · ${state.rendererKind}`;
          break;
        case 'PAUSED':
          status.textContent =
            state.reason === 'overload'
              ? 'Pauză de suprasarcină. Redu costul vizual înainte de reluare.'
              : 'Sesiune în pauză';
          break;
        case 'ERROR':
          status.textContent = `Randarea nu a pornit. ${state.message}`;
          break;
        case 'DISPOSED':
          status.textContent = 'Sesiune închisă';
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
