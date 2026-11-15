/**
 * PBI 239 — controllerul de capturi V4 (numai cu `?capture=1`).
 *
 * Instalează `window.__visualCapture` și pozitionează determinist camera, personajul și
 * vehiculele după datele din `rendering/visual-capture.ts`. Nu pașește simulația și nu apasă
 * „Pornește”: în starea READY bucla aplicației doar randează, deci tot ce setează controllerul
 * rămâne fix. Fără steag acest modul nu este chemat și nu scrie nimic global.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { CharacterRenderFrame } from '../../character';
import type { CaptureConfig, CapturePlacement2D, CaptureView } from '../visual-capture';
import {
  CAPTURE_FIXED_CLOCK,
  CAPTURE_SEED,
  CAPTURE_VIEWPORT,
  CAPTURE_VIEWS,
  VISUAL_CAPTURE_VERSION,
  captureView,
} from '../visual-capture';
import type { V3BrowserComposition } from './v3-browser-composition';
import type { VehicleRepresentation } from './vehicle-scene';

export interface CaptureTimingSummary {
  readonly samples: number;
  readonly meanMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}
export interface CaptureGoResult {
  readonly viewId: string;
  readonly surface: 'canvas' | 'page';
  readonly renderedFrames: number;
  /** Timp CPU al `scene.render()` (trimiterea comenzilor), nu timp GPU. */
  readonly cpuRenderMs: CaptureTimingSummary;
  /** Intervalul dintre cadre `requestAnimationFrame`; plafonat de vsync pe un GPU real. */
  readonly frameIntervalMs: CaptureTimingSummary;
}
export interface VisualCaptureApi {
  readonly version: typeof VISUAL_CAPTURE_VERSION;
  ready(): boolean;
  views(): readonly Pick<CaptureView, 'id' | 'category' | 'title' | 'surface'>[];
  go(viewId: string, options?: { readonly measureFrames?: number }): Promise<CaptureGoResult>;
  info(): Readonly<Record<string, unknown>>;
}

const WARMUP_FRAMES = 4;
const DEFAULT_MEASURE_FRAMES = 30;
const CANVAS_STYLE_KEYS = [
  'position',
  'inset',
  'width',
  'height',
  'maxWidth',
  'zIndex',
  'display',
] as const;

function summarise(samples: readonly number[]): CaptureTimingSummary {
  if (samples.length === 0) return { samples: 0, meanMs: 0, p95Ms: 0, maxMs: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))]!;
  return { samples: sorted.length, meanMs: mean, p95Ms: p95, maxMs: sorted[sorted.length - 1]! };
}

export interface VisualCaptureOptions {
  readonly composition: V3BrowserComposition;
  readonly canvas: HTMLCanvasElement;
  readonly config: CaptureConfig;
}

/** Întoarce funcția de demontare; nimic nu rămâne pe `window` după ea. */
export function installVisualCapture(options: VisualCaptureOptions): () => void {
  const { composition, canvas, config } = options;
  const view = composition.view;
  const scene = view.scene;
  const initialStyle = Object.fromEntries(
    CANVAS_STYLE_KEYS.map((key) => [key, canvas.style[key]]),
  ) as Record<(typeof CANVAS_STYLE_KEYS)[number], string>;
  const initialCharacter: CharacterRenderFrame = composition.composition.characterFrame();
  const initialVehicles = new Map<string, CapturePlacement2D>(
    composition.composition.frame.vehicles.map((vehicle) => [
      vehicle.vehicleId,
      { x: vehicle.positionM.x, z: vehicle.positionM.z, yawRad: vehicle.yawRad },
    ]),
  );
  let extras: VehicleRepresentation[] = [];
  let current: string | null = null;
  let disposed = false;

  const transform = (placement: CapturePlacement2D) => ({
    positionM: { x: placement.x, y: 0, z: placement.z },
    rotationQuaternion: {
      x: 0,
      y: Math.sin(placement.yawRad / 2),
      z: 0,
      w: Math.cos(placement.yawRad / 2),
    },
  });

  const fitCanvas = (surface: 'canvas' | 'page'): void => {
    if (surface === 'canvas') {
      Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        maxWidth: 'none',
        zIndex: '1000',
        display: 'block',
      });
    } else {
      Object.assign(canvas.style, initialStyle);
    }
    // Lifecycle-ul ascultă `resize` și redimensionează motorul.
    window.dispatchEvent(new Event('resize'));
  };

  const nextFrame = (): Promise<number> =>
    new Promise((resolve) => requestAnimationFrame((time) => resolve(time)));

  const place = (target: CaptureView): void => {
    for (const extra of extras) extra.dispose();
    extras = [];
    const placement = target.placement;
    for (const [vehicleId, home] of initialVehicles) {
      const representation = view.representation(vehicleId);
      if (!representation) continue;
      representation.setTransform(transform(placement?.vehicles?.[vehicleId] ?? home));
    }
    placement?.extras?.forEach((extra, index) => {
      extras.push(view.vehicles.create(`capture-extra-${index}`, extra.classId, transform(extra)));
    });
    const character = placement?.character;
    view.character.applyFrame(
      character
        ? {
            ...initialCharacter,
            positionM: { ...initialCharacter.positionM, x: character.x, z: character.z },
            yawRad: character.yawRad,
          }
        : initialCharacter,
    );
    const { pose } = target;
    view.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    view.camera.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z));
    view.camera.fov = pose.fovRad;
    view.vehicles.updateLod(view.camera.position, config.preset);
  };

  const api: VisualCaptureApi = {
    version: VISUAL_CAPTURE_VERSION,
    ready: () => !disposed && scene.isReady(),
    views: () =>
      CAPTURE_VIEWS.map(({ id, category, title, surface }) => ({ id, category, title, surface })),
    async go(viewId, goOptions) {
      const target = captureView(viewId);
      if (!target) throw new Error(`Vedere de captură necunoscută: ${viewId}`);
      if (disposed) throw new Error('Controllerul de captură este eliberat.');
      fitCanvas(target.surface);
      place(target);
      current = viewId;
      await scene.whenReadyAsync();
      for (let index = 0; index < WARMUP_FRAMES; index += 1) await nextFrame();
      const measureFrames = Math.max(1, goOptions?.measureFrames ?? DEFAULT_MEASURE_FRAMES);
      const cpu: number[] = [];
      let startedAt = 0;
      const before = scene.onBeforeRenderObservable.add(() => {
        startedAt = performance.now();
      });
      const after = scene.onAfterRenderObservable.add(() => {
        cpu.push(performance.now() - startedAt);
      });
      const intervals: number[] = [];
      try {
        let last = await nextFrame();
        for (let index = 0; index < measureFrames; index += 1) {
          const time = await nextFrame();
          intervals.push(time - last);
          last = time;
        }
      } finally {
        scene.onBeforeRenderObservable.remove(before);
        scene.onAfterRenderObservable.remove(after);
      }
      return {
        viewId,
        surface: target.surface,
        renderedFrames: cpu.length,
        cpuRenderMs: summarise(cpu),
        frameIntervalMs: summarise(intervals),
      };
    },
    info() {
      return {
        version: VISUAL_CAPTURE_VERSION,
        preset: config.preset,
        requestedBackend: config.backend,
        seed: CAPTURE_SEED,
        clock: CAPTURE_FIXED_CLOCK,
        viewport: CAPTURE_VIEWPORT,
        window: { width: window.innerWidth, height: window.innerHeight },
        devicePixelRatio: window.devicePixelRatio,
        backend: composition.backendInfo(),
        stats: composition.stats(),
        postProcessing: composition.view.daylight.getPostProcessingState(),
        currentView: current,
      };
    },
  };
  const holder = globalThis as unknown as { __visualCapture?: VisualCaptureApi };
  holder.__visualCapture = api;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const extra of extras) extra.dispose();
    extras = [];
    if (holder.__visualCapture === api) holder.__visualCapture = undefined;
  };
}
