/**
 * PBI 236 — rădăcina de browser a compunerii V3.
 *
 * Un singur loc leagă: scena Babylon, compunerea pură (193 → 192/vehicul → 194 → 198), inputul
 * real de tastatură (066 pentru cele șapte acțiuni + F pentru sprint + G pentru intrare/ieșire) și
 * HUD-ul de personaj. `step` este chemat o dată per tick fix; `present` o dată per cadru.
 *
 * Modulul nu conține reguli de joc: orice decizie aparține contractelor chemate de compunere.
 */
import type { Scene } from '@babylonjs/core/scene';
import {
  V3_COMPOSITION_VERSION,
  createV3Composition,
  type CompositionFrame,
  type CompositionMode,
  type CompositionVehicleSeed,
  type V3Composition,
} from '../../app';
import type { CivilTraffic } from '../../fleet';
import { bindKeyboardDriveInput, type KeyboardDriveBinding } from '../../input';
import type { ContractContext } from '../../sessions';
import type { RuntimeSettings } from '../../settings';
import { createCharacterHud, type CharacterHud } from '../../ui';
import type { CityLayout, LaneGraph, RoadMap } from '../../world';
import type { RendererKind } from '../backend-policy';
import type { QualityPreset } from '../quality-policy';
import {
  createV3CompositionScene,
  type V3CompositionScene,
  type V3CompositionSceneStats,
} from './v3-composition-scene';
import type { GlbModelLibrary } from './glb-model-library';

export const V3_BROWSER_COMPOSITION_VERSION = '236-v3-browser-composition-v1' as const;

/** Tastele compunerii care nu fac parte din cele șapte acțiuni 066. */
export const COMPOSITION_KEYS = Object.freeze({
  sprint: 'KeyF',
  interact: 'KeyG',
  /** PBI 257: M comută MANUAL/AUTO pentru mașina condusă. */
  mode: 'KeyM',
});

export interface V3BrowserCompositionOptions {
  readonly scene: Scene;
  readonly surface: HTMLElement;
  readonly hudRoot: HTMLElement;
  readonly layout: CityLayout;
  readonly settings: RuntimeSettings;
  readonly context: ContractContext;
  readonly spawn: Readonly<{ x: number; z: number; yawRad: number }>;
  readonly vehicles: readonly CompositionVehicleSeed[];
  /** PBI 256: traficul AI 058, pasat compunerii; caller-ul îl eliberează. */
  readonly traffic?: CivilTraffic;
  /** PBI 257: harta/graful pentru driverul AUTO al mașinii conduse. */
  readonly map?: RoadMap;
  readonly graph?: LaneGraph;
  readonly rendererKind: RendererKind;
  readonly preset: QualityPreset;
  readonly viewport: Readonly<{ width: number; height: number; dpr: number }>;
  /** Cât timp inputul este admis (de regulă starea PLAYING a aplicației). */
  readonly enabled: () => boolean;
  /** PBI 254: the already decoded GLB models; the composition owns them afterwards. */
  readonly models?: GlbModelLibrary;
}

export interface CostSummary {
  readonly samples: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export interface V3BrowserComposition {
  readonly version: typeof V3_BROWSER_COMPOSITION_VERSION;
  readonly composition: V3Composition;
  readonly view: V3CompositionScene;
  readonly hud: CharacterHud;
  readonly port: V3Composition['port'];
  step(tick: number): CompositionFrame;
  present(forceHud?: boolean): void;
  syncInput(): boolean;
  /** PBI 257: modul mașinii conduse; `null` când jucătorul este pe jos. */
  vehicleMode(): CompositionMode | null;
  setVehicleMode(mode: 'AUTO' | 'MANUAL'): CompositionMode | null;
  toggleVehicleMode(): CompositionMode | null;
  reset(): void;
  probeDoubleDelivery(): string;
  costs(): Readonly<{ tick: CostSummary; present: CostSummary; frame: CostSummary }>;
  read(): Readonly<Record<string, unknown>>;
  backendInfo(): ReturnType<V3CompositionScene['backendInfo']>;
  stats(): V3CompositionSceneStats;
  /** PBI 240: propagă dimensiunea CSS și DPR-ul la rezoluția internă; nu recreează scena. */
  resize(viewport: Readonly<{ width: number; height: number; dpr: number }>): void;
  dispose(): void;
}

const MAX_SAMPLES = 600;

function summarise(samples: readonly number[]): CostSummary {
  if (samples.length === 0)
    return Object.freeze({ samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]!;
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  return Object.freeze({
    samples: sorted.length,
    meanMs: mean,
    p50Ms: at(0.5),
    p95Ms: Math.max(at(0.95), at(0.5)),
    maxMs: sorted[sorted.length - 1]!,
  });
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as
    | {
        readonly isContentEditable?: boolean;
        closest?: (selector: string) => unknown;
      }
    | null
    | undefined;
  if (!element) return false;
  if (element.isContentEditable === true) return true;
  if (typeof element.closest !== 'function') return false;
  return (
    element.closest(
      'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],[role="textbox"]',
    ) !== null
  );
}

export function createV3BrowserComposition(
  options: V3BrowserCompositionOptions,
): V3BrowserComposition {
  const view = createV3CompositionScene({
    scene: options.scene,
    layout: options.layout,
    quality: options.settings.quality,
    preset: options.preset,
    viewport: options.viewport,
    rendererKind: options.rendererKind,
    models: options.models,
  });
  const composition = createV3Composition({
    layout: options.layout,
    start: options.spawn,
    control: options.settings.input.control,
    context: options.context,
    vehicles: options.vehicles,
    ...(options.traffic === undefined ? {} : { traffic: options.traffic }),
    ...(options.map === undefined ? {} : { map: options.map }),
    ...(options.graph === undefined ? {} : { graph: options.graph }),
  });
  const hud = createCharacterHud(options.hudRoot);
  const tickSamples: number[] = [];
  const presentSamples: number[] = [];
  const frameSamples: number[] = [];
  let lastPresentAt: number | null = null;
  let latest: CompositionFrame | null = null;

  const keyboard: KeyboardDriveBinding = bindKeyboardDriveInput({
    surface: options.surface,
    bindings: options.settings.input.bindings,
    port: composition.port,
    enabled: options.enabled,
    onFocusLost: () => composition.releaseInput(),
  });

  const doc = options.surface.ownerDocument;
  const interact = (): void => {
    const authority = composition.arbiter.snapshot().authority;
    if (authority.consumer === 'VEHICLE') composition.requestExit();
    else composition.requestEntry();
  };
  const intentKeys = (event: KeyboardEvent): void => {
    if (!options.enabled() || doc.hidden || !doc.hasFocus()) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (isTypingTarget(event.target)) return;
    if (event.code === COMPOSITION_KEYS.sprint) {
      event.preventDefault();
      if (event.type === 'keydown' && event.repeat) return;
      composition.setSprint(event.type === 'keydown');
      return;
    }
    if (event.code === COMPOSITION_KEYS.mode) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) composition.toggleVehicleMode();
      return;
    }
    if (event.code !== COMPOSITION_KEYS.interact) return;
    event.preventDefault();
    if (event.type === 'keydown' && !event.repeat) interact();
  };
  doc.addEventListener('keydown', intentKeys);
  doc.addEventListener('keyup', intentKeys);

  let disposed = false;
  const present = (forceHud = false): void => {
    if (disposed || latest === null) return;
    const now = performance.now();
    if (lastPresentAt !== null) {
      if (frameSamples.length >= MAX_SAMPLES) frameSamples.shift();
      frameSamples.push(now - lastPresentAt);
    }
    lastPresentAt = now;
    const started = now;
    const characterFrame = composition.characterFrame();
    view.apply(latest, characterFrame);
    hud.update(latest, forceHud);
    if (presentSamples.length >= MAX_SAMPLES) presentSamples.shift();
    presentSamples.push(performance.now() - started);
  };

  const api: V3BrowserComposition = {
    version: V3_BROWSER_COMPOSITION_VERSION,
    composition,
    view,
    hud,
    port: composition.port,
    step(tick: number): CompositionFrame {
      if (disposed) throw new Error('Compunerea de browser este eliberată.');
      keyboard.sync();
      const started = performance.now();
      latest = composition.step({ tick });
      if (tickSamples.length >= MAX_SAMPLES) tickSamples.shift();
      tickSamples.push(performance.now() - started);
      return latest;
    },
    present,
    syncInput(): boolean {
      return keyboard.sync();
    },
    vehicleMode(): CompositionMode | null {
      return composition.vehicleMode();
    },
    setVehicleMode(mode: 'AUTO' | 'MANUAL'): CompositionMode | null {
      return composition.setVehicleMode(mode);
    },
    toggleVehicleMode(): CompositionMode | null {
      return composition.toggleVehicleMode();
    },
    reset(): void {
      composition.resetScenario();
      latest = composition.frame;
      present(true);
    },
    probeDoubleDelivery(): string {
      const result = composition.lastResult;
      if (result === null) return 'NO_TICK';
      try {
        composition.arbiter.deliver(result, result.command.consumer, {
          character: () => {},
          vehicle: () => {},
        });
        return 'ACCEPTED';
      } catch (error: unknown) {
        return (error as { code?: string }).code ?? 'UNKNOWN';
      }
    },
    costs() {
      return Object.freeze({
        tick: summarise(tickSamples),
        present: summarise(presentSamples),
        frame: summarise(frameSamples),
      });
    },
    read(): Readonly<Record<string, unknown>> {
      const frame = latest ?? composition.frame;
      const stats = composition.arbiter.getStats();
      const segments = composition.segments.getStats();
      return Object.freeze({
        version: V3_BROWSER_COMPOSITION_VERSION,
        contract: V3_COMPOSITION_VERSION,
        tick: frame.tick,
        authority: `${frame.authority.consumer}:${
          frame.authority.consumer === 'CHARACTER'
            ? frame.authority.characterId
            : frame.authority.vehicleId
        }`,
        hud: Object.freeze({
          controlledKind: frame.hud.controlledKind,
          controlledEntityId: frame.hud.controlledEntityId,
          controlledLabel: frame.hud.controlledLabel,
          mode: frame.hud.mode,
          cameraEntityId: frame.hud.cameraEntityId,
          cameraDivergent: frame.hud.cameraDivergent,
          clipId: frame.hud.clipId,
          speedMps: frame.hud.speedMps,
          transitionRemainingTicks: frame.hud.transitionRemainingTicks,
        }),
        character: Object.freeze({
          entityId: frame.character.entityId,
          tick: frame.character.tick,
          positionM: frame.character.positionM,
          yawRad: frame.character.yawRad,
          clipId: frame.character.clipId,
          speedMps: frame.character.speedMps,
          positionBits: frame.character.positionBits,
        }),
        camera: Object.freeze({
          entityId: frame.camera.entityId,
          positionM: frame.camera.positionM,
          lookAtM: frame.camera.lookAtM,
          distanceM: frame.camera.distanceM,
          fovRadians: frame.camera.fovRadians,
          transitioning: frame.camera.transitioning,
          transitionRemainingTicks: frame.camera.transitionRemainingTicks,
        }),
        vehicles: frame.vehicles.map((vehicle) =>
          Object.freeze({
            vehicleId: vehicle.vehicleId,
            controlMode: vehicle.controlMode,
            positionM: vehicle.positionM,
            yawRad: vehicle.yawRad,
            speedMps: vehicle.speedMps,
          }),
        ),
        segments: Object.freeze({
          walking: segments.walking,
          openSegmentId: segments.openSegmentId,
          lastClosedSegmentId: segments.lastClosedSegmentId,
          counters: segments.counters,
        }),
        deliveries: stats.delivered,
        refused: stats.refused,
        transitions: stats.transitions,
        held: stats.held,
        neutralized: stats.neutralized,
        lastSegmentAction: frame.lastSegmentAction,
        lastEvent: frame.events.at(-1) ?? null,
        keys: COMPOSITION_KEYS,
        costs: api.costs(),
      });
    },
    backendInfo(): ReturnType<V3CompositionScene['backendInfo']> {
      return view.backendInfo();
    },
    resize(viewport: Readonly<{ width: number; height: number; dpr: number }>): void {
      if (!disposed) view.resize(viewport);
    },
    stats(): V3CompositionSceneStats {
      return view.stats();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('keydown', intentKeys);
      doc.removeEventListener('keyup', intentKeys);
      keyboard.dispose();
      composition.dispose();
      hud.dispose();
      view.dispose();
    },
  };

  // Tick-ul 1 este afișat înainte de primul cadru jucat; bucla fixă pornește de la el.
  composition.releaseInput();
  latest = composition.step({ tick: 1 });
  present(true);

  return Object.freeze(api);
}
