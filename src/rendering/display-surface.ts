/**
 * PBI 240 — suprafața de afișare: dimensiunea CSS a canvasului și DPR-ul real.
 *
 * Observă tot ce poate schimba rezoluția internă (redimensionare, ecran complet, zoom, mutarea între
 * monitoare cu DPR diferit, plus un sondaj de siguranță la 500 ms) și chemă `onChange` numai când metricile se schimbă efectiv. Nu cunoaște
 * Babylon și nu recreează nimic; fiecare ascultător instalat este scos de `dispose()`.
 */
export interface DisplayMetrics {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/** Aceleași limite ca `resolveQuality`: o valoare în afara lor ar arunca la fiecare cadru. */
const MAX_CSS_PIXELS = 16384;
const MIN_DPR = 0.1;
const MAX_DPR = 8;
/** Sondajul prinde schimbările de DPR fără eveniment; citește doar `clientWidth`, ieftin la 2 Hz. */
const POLL_MS = 500;

interface MediaQueryListLike {
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}
interface ResizeObserverLike {
  observe(target: Element): void;
  disconnect(): void;
}
export interface DisplayEnvironment {
  readonly devicePixelRatio: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
  matchMedia?(query: string): MediaQueryListLike;
  ResizeObserver?: new (callback: () => void) => ResizeObserverLike;
  /** Sondaj rar de siguranță (DPR-ul poate schimba fără eveniment, de exemplu sub emulare). */
  setInterval?(callback: () => void, ms: number): number;
  clearInterval?(handle: number): void;
  readonly document?: {
    addEventListener(type: 'fullscreenchange', listener: () => void): void;
    removeEventListener(type: 'fullscreenchange', listener: () => void): void;
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export function readDisplayMetrics(
  canvas: Pick<HTMLCanvasElement, 'clientWidth' | 'clientHeight'>,
  env: Pick<DisplayEnvironment, 'devicePixelRatio' | 'innerWidth' | 'innerHeight'>,
): DisplayMetrics {
  return Object.freeze({
    // Canvasul ascuns (display none) are 0: se folosește fereastra ca să nu cadă calculul.
    width: Math.round(clamp(canvas.clientWidth || env.innerWidth, 1, MAX_CSS_PIXELS)),
    height: Math.round(clamp(canvas.clientHeight || env.innerHeight, 1, MAX_CSS_PIXELS)),
    dpr: clamp(env.devicePixelRatio || 1, MIN_DPR, MAX_DPR),
  });
}

export interface DisplaySurfaceObserver {
  readonly metrics: () => DisplayMetrics;
  /** Citește din nou și notifică dacă s-a schimbat ceva; întoarce true când s-a notificat. */
  refresh(): boolean;
  /** Numărul de ascultători activi (diagnostic și teste de scurgeri). */
  readonly listeners: () => number;
  dispose(): void;
}

export function observeDisplaySurface(options: {
  readonly canvas: Pick<HTMLCanvasElement, 'clientWidth' | 'clientHeight'> & Element;
  readonly env: DisplayEnvironment;
  readonly onChange: (metrics: DisplayMetrics) => void;
}): DisplaySurfaceObserver {
  const { canvas, env, onChange } = options;
  let last = readDisplayMetrics(canvas, env);
  let disposed = false;
  let active = 0;
  let dprQuery: MediaQueryListLike | undefined;

  const refresh = (): boolean => {
    if (disposed) return false;
    const next = readDisplayMetrics(canvas, env);
    const same = next.width === last.width && next.height === last.height && next.dpr === last.dpr;
    // DPR-ul se re-armează chiar dacă restul e neschimbat: interogarea veche nu mai e valabilă.
    if (next.dpr !== last.dpr) armDpr(next.dpr);
    if (same) return false;
    last = next;
    onChange(next);
    return true;
  };

  /** `(resolution: Xdppx)` își schimbă valoarea de adevăr exact când DPR-ul iese din X. */
  function armDpr(dpr: number): void {
    if (dprQuery) {
      dprQuery.removeEventListener('change', refresh);
      active -= 1;
      dprQuery = undefined;
    }
    if (!env.matchMedia) return;
    dprQuery = env.matchMedia(`(resolution: ${dpr}dppx)`);
    dprQuery.addEventListener('change', refresh);
    active += 1;
  }

  env.addEventListener('resize', refresh);
  active += 1;
  env.document?.addEventListener('fullscreenchange', refresh);
  if (env.document) active += 1;
  let observer: ResizeObserverLike | undefined;
  if (env.ResizeObserver) {
    observer = new env.ResizeObserver(refresh);
    observer.observe(canvas);
    active += 1;
  }
  armDpr(last.dpr);
  let poll: number | undefined;
  if (env.setInterval) {
    poll = env.setInterval(refresh, POLL_MS);
    active += 1;
  }

  return {
    metrics: () => last,
    refresh,
    listeners: () => active,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      env.removeEventListener('resize', refresh);
      env.document?.removeEventListener('fullscreenchange', refresh);
      if (poll !== undefined) env.clearInterval?.(poll);
      poll = undefined;
      observer?.disconnect();
      dprQuery?.removeEventListener('change', refresh);
      dprQuery = undefined;
      observer = undefined;
      active = 0;
    },
  };
}
