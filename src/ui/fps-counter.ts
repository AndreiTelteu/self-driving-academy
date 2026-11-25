/**
 * Contor FPS permanent, în colțul stânga-sus, independent de panoul de diagnostic.
 *
 * Măsoară cadrele prezentate real de browser (`requestAnimationFrame`), nu tick-urile simulării,
 * și nu depinde de eșantionarea diagnosticului (care poate fi oprită). Textul se reîmprospătează
 * de 4 ori pe secundă, cu media pe fereastra respectivă și cel mai lung cadru din ea.
 */
export const FPS_COUNTER_VERSION = 'fps-counter-v1' as const;
export const FPS_COUNTER_REFRESH_MS = 250;

export interface FpsCounter {
  readonly version: typeof FPS_COUNTER_VERSION;
  readonly root: HTMLElement;
  dispose(): void;
}

export interface FpsWindowSummary {
  readonly fps: number;
  readonly worstFrameMs: number;
}

/** Rezumatul unei ferestre de măsurare; exportat pentru teste. */
export function summarizeFpsWindow(
  frames: number,
  elapsedMs: number,
  worstFrameMs: number,
): FpsWindowSummary {
  if (!(elapsedMs > 0) || frames <= 0) return Object.freeze({ fps: 0, worstFrameMs: 0 });
  return Object.freeze({ fps: (frames * 1000) / elapsedMs, worstFrameMs });
}

/** Culoarea textului după FPS: verde ≥ 55, galben ≥ 30, roșu sub. */
export function fpsColor(fps: number): string {
  if (fps >= 55) return '#7ee08a';
  if (fps >= 30) return '#f2d06b';
  return '#ff7a6b';
}

export function createFpsCounter(root: HTMLElement): FpsCounter {
  const panel = document.createElement('div');
  panel.className = 'fps-counter';
  panel.setAttribute('aria-hidden', 'true');
  panel.style.cssText = [
    'position:absolute',
    'left:12px',
    'top:12px',
    'z-index:11',
    'padding:4px 8px',
    'border-radius:6px',
    'background:rgba(8,20,26,0.72)',
    'color:#7ee08a',
    'font:600 12px/1.3 ui-monospace,Consolas,monospace',
    'pointer-events:none',
    'user-select:none',
    'white-space:pre',
  ].join(';');
  panel.textContent = '-- FPS';
  root.append(panel);

  let frames = 0;
  let windowStart: number | null = null;
  let previous: number | null = null;
  let worst = 0;
  let handle = 0;
  let disposed = false;

  const tick = (now: number): void => {
    if (disposed) return;
    if (previous !== null) {
      const delta = now - previous;
      // Un tab ascuns suspendă rAF: intervalul uriaș nu e un cadru, deci repornește fereastra.
      if (delta > 1000) {
        windowStart = now;
        frames = 0;
        worst = 0;
      } else {
        frames += 1;
        if (delta > worst) worst = delta;
      }
    }
    previous = now;
    windowStart ??= now;
    const elapsed = now - windowStart;
    if (elapsed >= FPS_COUNTER_REFRESH_MS) {
      const summary = summarizeFpsWindow(frames, elapsed, worst);
      panel.textContent = `${Math.round(summary.fps)} FPS · max ${summary.worstFrameMs.toFixed(1)} ms`;
      panel.style.color = fpsColor(summary.fps);
      windowStart = now;
      frames = 0;
      worst = 0;
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);

  return Object.freeze({
    version: FPS_COUNTER_VERSION,
    root: panel,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(handle);
      panel.remove();
    },
  });
}
