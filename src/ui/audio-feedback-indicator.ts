import type { AudioFeedbackVisual } from '../audio';

/**
 * 149 visual indicator.
 *
 * The indicator is the visual twin of the 149 sounds: one bounded status line that shows the
 * symbol and the text of the last accepted feedback, with the same `data-*` identity the audio
 * feedback carries. It is an *indicator*, not a second notification system: there is no list, no
 * history, no deduplication window and no expiry queue, and the detailed learning and publication
 * messages keep their 079 notification rows.
 *
 * The indicator never depends on the audio: the visual is rendered even when the engine refuses
 * the cue because the player gesture is missing.
 */
export const AUDIO_FEEDBACK_INDICATOR_VERSION = '149-audio-feedback-indicator-v1' as const;

export const AUDIO_FEEDBACK_INDICATOR_LIMITS = Object.freeze({
  version: AUDIO_FEEDBACK_INDICATOR_VERSION,
  /** One section, one symbol span and one text span. */
  elements: 3,
  textNodes: 2,
  listeners: 0,
  maximumHz: 10,
  /** Only the last visual is retained; the indicator keeps no history. */
  retainedVisuals: 1,
});

export interface AudioFeedbackIndicatorStats {
  readonly version: typeof AUDIO_FEEDBACK_INDICATOR_VERSION;
  readonly elements: number;
  readonly textNodes: number;
  readonly listeners: number;
  readonly updates: number;
  readonly writes: number;
  readonly skipped: number;
  readonly retainedVisuals: number;
  readonly disposed: boolean;
}

export interface AudioFeedbackIndicator {
  /** Renders the visual twin of one feedback. */
  show(visual: AudioFeedbackVisual, nowMs?: number): void;
  /** The last rendered visual; `null` before the first one. */
  getVisual(): AudioFeedbackVisual | null;
  getStats(): AudioFeedbackIndicatorStats;
  dispose(): void;
}

export function createAudioFeedbackIndicator(host: HTMLElement): AudioFeedbackIndicator {
  const doc = host.ownerDocument;
  if (!doc) throw new Error('Audio feedback indicator requires an owned document');
  const root = doc.createElement('section'),
    symbol = doc.createElement('span'),
    text = doc.createElement('span');
  root.className = 'audio-feedback-indicator';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'Ultimul feedback audio');
  symbol.className = 'audio-feedback-indicator__symbol';
  symbol.setAttribute('aria-hidden', 'true');
  text.className = 'audio-feedback-indicator__text';
  root.append(symbol, text);
  host.append(root);

  let disposed = false;
  let updates = 0;
  let writes = 0;
  let skipped = 0;
  let lastWrite = -Infinity;
  let current: AudioFeedbackVisual | null = null;

  const set = (node: HTMLElement, value: string): void => {
    if (node.textContent === value) return;
    node.textContent = value;
    writes += 1;
  };
  const attribute = (node: HTMLElement, name: string, value: string): void => {
    if (node.getAttribute(name) === value) return;
    node.setAttribute(name, value);
    writes += 1;
  };

  return Object.freeze({
    show(visual: AudioFeedbackVisual, nowMs = 0): void {
      if (disposed) throw new Error('Audio feedback indicator disposed');
      if (!Number.isFinite(nowMs) || nowMs < 0) throw new Error('Audio feedback indicator clock');
      const previous = current;
      current = visual;
      updates += 1;
      const kindChanged = previous === null || previous.kind !== visual.kind;
      if (!kindChanged && nowMs - lastWrite < 1000 / AUDIO_FEEDBACK_INDICATOR_LIMITS.maximumHz) {
        skipped += 1;
        return;
      }
      lastWrite = nowMs;
      set(symbol, visual.symbol);
      set(text, visual.text);
      for (const [name, value] of visual.attributes) attribute(root, name, value);
      attribute(root, 'data-symbol', visual.symbol);
      attribute(root, 'data-text', visual.text);
      attribute(root, 'data-indicator-version', AUDIO_FEEDBACK_INDICATOR_VERSION);
    },
    getVisual(): AudioFeedbackVisual | null {
      return current;
    },
    getStats(): AudioFeedbackIndicatorStats {
      return Object.freeze({
        version: AUDIO_FEEDBACK_INDICATOR_VERSION,
        elements: disposed ? 0 : AUDIO_FEEDBACK_INDICATOR_LIMITS.elements,
        textNodes: disposed ? 0 : AUDIO_FEEDBACK_INDICATOR_LIMITS.textNodes,
        listeners: AUDIO_FEEDBACK_INDICATOR_LIMITS.listeners,
        updates,
        writes,
        skipped,
        retainedVisuals: current === null ? 0 : AUDIO_FEEDBACK_INDICATOR_LIMITS.retainedVisuals,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      current = null;
      root.remove();
    },
  });
}

export type AudioFeedbackIndicatorAdapter = ReturnType<typeof createAudioFeedbackIndicator>;
