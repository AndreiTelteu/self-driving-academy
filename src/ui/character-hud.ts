/**
 * PBI 236 — HUD-ul de personaj: entitatea controlată, modul, clipul și viteza.
 *
 * Consumă exclusiv proiecția compactă a compunerii; nu citește starea autorității, nu pașește
 * tick-uri și nu scrie nimic în lume. Textul se actualizează la 10 Hz (contractul 25 cere HUD la
 * 5–10 Hz), plus imediat când se schimbă entitatea controlată sau modul.
 */
import type { CompositionFrame } from '../app';

export const CHARACTER_HUD_VERSION = '236-character-hud-v1' as const;
export const CHARACTER_HUD_INTERVAL_TICKS = 6;

export interface CharacterHudOptions {
  /** Cadenta de actualizare în tick-uri; implicit 6 (10 Hz la 60 Hz). */
  readonly intervalTicks?: number;
}

export interface CharacterHud {
  readonly version: typeof CHARACTER_HUD_VERSION;
  readonly root: HTMLElement;
  update(frame: CompositionFrame, force?: boolean): void;
  dispose(): void;
}

const CONTROLS_HINT =
  'W/S accelerează/frână · A/D virează · F alergare · G intră/iese · M AUTO/MANUAL · Space frână de mână';

export function createCharacterHud(
  root: HTMLElement,
  options: CharacterHudOptions = {},
): CharacterHud {
  const interval = Math.max(1, Math.trunc(options.intervalTicks ?? CHARACTER_HUD_INTERVAL_TICKS));
  const panel = document.createElement('section');
  panel.className = 'character-hud';
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.dataset.state = 'CHARACTER';
  panel.style.cssText = [
    'position:absolute',
    'left:12px',
    'bottom:12px',
    'z-index:10',
    'min-width:260px',
    // PBI 257: nu acoperă vitezometrul central pe ecrane late; sub 1100 px game-hud se mută sus.
    'max-width:28vw',
    'box-sizing:border-box',
    'padding:10px 12px',
    'border-radius:10px',
    'background:rgba(8,20,26,0.82)',
    'color:#e8f4f8',
    'font:13px/1.45 system-ui,sans-serif',
    'pointer-events:none',
    'box-shadow:0 2px 12px rgba(0,0,0,0.35)',
  ].join(';');
  const title = document.createElement('strong');
  title.textContent = 'Personaj';
  const mode = document.createElement('span');
  mode.style.cssText =
    'margin-left:8px;padding:1px 8px;border-radius:999px;background:#1f6f8b;font-weight:600';
  mode.textContent = 'MANUAL';
  const line = document.createElement('div');
  line.style.cssText = 'margin-top:4px;color:#b9d7e2';
  const detail = document.createElement('div');
  detail.style.cssText = 'color:#8fb4c2';
  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:6px;color:#7fa3b0;font-size:11px';
  hint.textContent = CONTROLS_HINT;
  panel.append(title, mode, line, detail, hint);
  root.append(panel);

  let lastTick = -Infinity;
  let lastKey = '';
  let disposed = false;

  return Object.freeze({
    version: CHARACTER_HUD_VERSION,
    root: panel,
    update(frame: CompositionFrame, force = false): void {
      if (disposed) return;
      const hud = frame.hud;
      const key = `${hud.controlledKind}:${hud.controlledEntityId}:${hud.mode}`;
      if (!force && key === lastKey && frame.tick - lastTick < interval) return;
      lastTick = frame.tick;
      lastKey = key;
      title.textContent = hud.controlledLabel;
      mode.textContent = hud.mode;
      mode.style.background = hud.mode === 'MANUAL' ? '#1f6f8b' : '#3f7a3f';
      line.textContent = `${hud.clipId ?? 'vehicul'} · ${hud.speedMps.toFixed(2)} m/s · tick ${frame.tick}`;
      detail.textContent =
        hud.cameraDivergent === true
          ? `cameră pe ${hud.cameraEntityId} · tranziție ${hud.transitionRemainingTicks}`
          : `cameră pe ${hud.cameraEntityId}`;
      panel.dataset.state = hud.controlledKind;
      panel.dataset.controlled = hud.controlledEntityId;
      panel.dataset.mode = hud.mode;
      panel.dataset.clip = hud.clipId ?? 'vehicle';
      panel.dataset.tick = String(frame.tick);
      panel.dataset.camera = hud.cameraEntityId;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      panel.remove();
    },
  });
}
