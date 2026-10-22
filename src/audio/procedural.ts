import type { AudioCueId } from './contracts';

/**
 * Deterministic procedural synthesis of the placeholder cue buffers.
 *
 * The recorded audio assets of module 16 are not in the repository yet, so the engine renders
 * placeholder buffers from a fixed generator: same cue, same samples, every run and every
 * machine. The buffers are explicitly placeholders and are replaced by the final assets without
 * changing the engine contract.
 */

/** Linear congruential generator with a cue dependent seed: no global state, no wall clock. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function seedOf(cueId: AudioCueId): number {
  let hash = 2166136261;
  for (let index = 0; index < cueId.length; index += 1) {
    hash ^= cueId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const TAU = Math.PI * 2;

export function renderProceduralCue(
  cueId: AudioCueId,
  frames: number,
  sampleRate: number,
): Float32Array {
  const samples = new Float32Array(frames);
  const random = lcg(seedOf(cueId));
  const step = 1 / sampleRate;
  for (let index = 0; index < frames; index += 1) {
    const time = index * step;
    let value = 0;
    switch (cueId) {
      case 'engine-loop': {
        // Low fundamental with two harmonics and a touch of deterministic noise.
        value =
          0.5 * Math.sin(TAU * 55 * time) +
          0.25 * Math.sin(TAU * 110 * time) +
          0.12 * Math.sin(TAU * 220 * time) +
          0.05 * (random() * 2 - 1);
        break;
      }
      case 'tyre-screech': {
        // Band limited noise with a slow amplitude modulation.
        const noise = random() * 2 - 1;
        const previous = index > 0 ? samples[index - 1] : 0;
        value = 0.6 * (noise - previous) + 0.25 * Math.sin(TAU * 48 * time) * noise;
        break;
      }
      case 'brake-squeal': {
        // Rising squeal from 900 Hz to 1400 Hz.
        const frequency = 900 + 500 * (index / Math.max(1, frames));
        value = 0.45 * Math.sin(TAU * frequency * time);
        break;
      }
      case 'impact': {
        // Noise burst with an exponential decay and a low thump.
        const decay = Math.exp(-6 * (index / Math.max(1, frames)));
        value = 0.7 * (random() * 2 - 1) * decay + 0.4 * Math.sin(TAU * 80 * time) * decay;
        break;
      }
      case 'takeover-notice': {
        const first = index < frames / 2;
        value = 0.4 * Math.sin(TAU * (first ? 660 : 880) * time);
        break;
      }
      case 'profile-notice': {
        const first = index < frames / 2;
        value = 0.4 * Math.sin(TAU * (first ? 520 : 780) * time);
        break;
      }
      case 'ui-tick': {
        const decay = Math.exp(-24 * (index / Math.max(1, frames)));
        value = 0.35 * Math.sin(TAU * 1200 * time) * decay;
        break;
      }
      default: {
        value = 0;
        break;
      }
    }
    samples[index] = Math.max(-1, Math.min(1, value));
  }
  return samples;
}
