/**
 * PBI 236 — rădăcina de browser a compunerii V3.
 *
 * Un singur loc leagă: scena Babylon, compunerea pură (193 → 192/vehicul → 194 → 198), inputul
 * real de tastatură (066 pentru cele șapte acțiuni + F pentru sprint + G pentru intrare/ieșire) și
 * HUD-ul de personaj. `step` este chemat o dată per tick fix; `present` o dată per cadru.
 *
 * Modulul nu conține reguli de joc: orice decizie aparține contractelor chemate de compunere.
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import {
  V3_COMPOSITION_VERSION,
  createV3Composition,
  type CompositionCameraMode,
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
import type { TimeOfDayName } from '../time-of-day';
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
  /** PBI 257: M comută MANUAL/AUTO pentru mașina condusă sau preia ținta selectată. */
  mode: 'KeyM',
  /** PBI 263: L cere explicit LEARNING; până la 271 refuzul este raportat, nu simulat. */
  learning: 'KeyL',
  /** PBI 252: T schimbă ora din zi (dimineață → amiază → apus → noapte). */
  time: 'KeyT',
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
  /** PBI 280: called only after a real C press changed the presentation preference. */
  readonly onCameraModeChanged?: (mode: CompositionCameraMode) => void;
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
  /** PBI 279: applies saved bindings, control preferences and quality without a new world. */
  applySettings(settings: RuntimeSettings): void;
  /** PBI 257: modul mașinii conduse; `null` când jucătorul este pe jos. */
  vehicleMode(): CompositionMode | null;
  setVehicleMode(mode: 'AUTO' | 'MANUAL'): CompositionMode | null;
  toggleVehicleMode(): CompositionMode | null;
  /** PBI 263: camera-only target; `null` follows the controlled entity again. */
  selectVehicle(vehicleId: string | null): boolean;
  /** PBI 263: explicit M/L on the selected car, or the held car's existing toggle. */
  takeOverSelected(mode: 'MANUAL' | 'LEARNING'): boolean;
  /** PBI 271: real M/L action, accepted on the next authoritative tick. */
  requestModeAction(action: 'M' | 'L', expectedVehicleId?: string): boolean;
  /** PBI 271: explicit target mode, accepted on the next authoritative tick. */
  requestMode(mode: 'AUTO' | 'MANUAL' | 'LEARNING', vehicleId?: string): boolean;
  /** PBI 280: presentation-only camera preference; no authority, tick or segment is written. */
  cameraMode(): CompositionCameraMode;
  setCameraMode(mode: CompositionCameraMode): CompositionCameraMode;
  toggleCameraMode(): CompositionCameraMode;
  selectedVehicleId(): string | null;
  playerVehicleId(): string | null;
  reset(): void;
  probeDoubleDelivery(): string;
  costs(): Readonly<{ tick: CostSummary; present: CostSummary; frame: CostSummary }>;
  read(): Readonly<Record<string, unknown>>;
  backendInfo(): ReturnType<V3CompositionScene['backendInfo']>;
  stats(): V3CompositionSceneStats;
  /** PBI 240: propagă dimensiunea CSS și DPR-ul la rezoluția internă; nu recreează scena. */
  resize(viewport: Readonly<{ width: number; height: number; dpr: number }>): void;
  /** PBI 252: ora din zi, schimbată din tastă, capturi sau debug; nu atinge simularea. */
  setTimeOfDay(name: TimeOfDayName): TimeOfDayName;
  getTimeOfDay(): string;
  cycleTimeOfDay(): string;
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
    cameraMode: options.settings.input.cameraMode,
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
  // PBI 279: M/L are part of the same 15 remappable actions; the host updates both codes and the
  // driving map from the saved settings. Other composition keys (F/G/T) are not 009 actions.
  let modeCode = options.settings.input.bindings.manualMode,
    learningCode = options.settings.input.bindings.learningMode,
    cameraCode = options.settings.input.bindings.camera;

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
    if (event.code === modeCode) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) composition.requestModeAction('M');
      return;
    }
    if (event.code === learningCode) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) composition.requestModeAction('L');
      return;
    }
    if (event.code === cameraCode) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) {
        const mode = composition.toggleCameraMode();
        options.onCameraModeChanged?.(mode);
      }
      return;
    }
    if (event.code === COMPOSITION_KEYS.time) {
      event.preventDefault();
      if (event.type === 'keydown' && !event.repeat) view.cycleTimeOfDay();
      return;
    }
    if (event.code !== COMPOSITION_KEYS.interact) return;
    event.preventDefault();
    if (event.type === 'keydown' && !event.repeat) interact();
  };
  doc.addEventListener('keydown', intentKeys);
  doc.addEventListener('keyup', intentKeys);

  /**
   * PBI 280: the driven shell is hidden only while FIRST_PERSON is the published view. The helper
   * restores the exact previous `isVisible` values when the view, the vehicle or the world changes;
   * it touches presentation meshes only and never a body, collider or authority.
   */
  const hiddenMeshes = new Map<AbstractMesh, boolean>();
  let hiddenVehicleId: string | null = null;
  const restoreHiddenMeshes = (): void => {
    for (const [mesh, visible] of hiddenMeshes) if (!mesh.isDisposed()) mesh.isVisible = visible;
    hiddenMeshes.clear();
    hiddenVehicleId = null;
  };
  const applyFirstPersonVisibility = (vehicleId: string | null): void => {
    if (vehicleId === null) {
      restoreHiddenMeshes();
      return;
    }
    const representation = view.representation(vehicleId);
    if (representation === undefined) return;
    const stale = [...hiddenMeshes.keys()].some((mesh) => mesh.isDisposed());
    if (hiddenVehicleId === vehicleId && !stale) return;
    restoreHiddenMeshes();
    for (const mesh of representation.root.getChildMeshes(false)) {
      if (mesh.isDisposed()) continue;
      hiddenMeshes.set(mesh, mesh.isVisible);
      mesh.isVisible = false;
    }
    hiddenVehicleId = vehicleId;
  };

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
    // PBI 280: the driver-seat camera keeps the 017 near plane and the car up vector; the body is
    // hidden after `apply` because that call may create the representation on its first frame.
    view.camera.minZ = latest.camera.mode === 'FIRST_PERSON' ? 0.05 : 0.1;
    view.camera.upVector.set(latest.camera.up.x, latest.camera.up.y, latest.camera.up.z);
    view.apply(latest, characterFrame);
    applyFirstPersonVisibility(
      latest.camera.mode === 'FIRST_PERSON' ? latest.camera.entityId : null,
    );
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
    applySettings(next: RuntimeSettings): void {
      if (disposed) throw new Error('Compunerea de browser este eliberată.');
      keyboard.remap(next.input.bindings);
      modeCode = next.input.bindings.manualMode;
      learningCode = next.input.bindings.learningMode;
      cameraCode = next.input.bindings.camera;
      composition.setControlPreferences(next.input.control);
      composition.setCameraMode(next.input.cameraMode);
      view.daylight.applyPreferences(next.quality);
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
    selectVehicle(vehicleId: string | null): boolean {
      return composition.selectVehicle(vehicleId);
    },
    takeOverSelected(mode: 'MANUAL' | 'LEARNING'): boolean {
      return composition.takeOverSelected(mode);
    },
    requestModeAction(action: 'M' | 'L', expectedVehicleId?: string): boolean {
      return composition.requestModeAction(action, expectedVehicleId);
    },
    requestMode(mode: 'AUTO' | 'MANUAL' | 'LEARNING', vehicleId?: string): boolean {
      return composition.requestMode(mode, vehicleId);
    },
    cameraMode(): CompositionCameraMode {
      return composition.cameraMode();
    },
    setCameraMode(mode: CompositionCameraMode): CompositionCameraMode {
      return composition.setCameraMode(mode);
    },
    toggleCameraMode(): CompositionCameraMode {
      return composition.toggleCameraMode();
    },
    selectedVehicleId(): string | null {
      return composition.selectedVehicleId();
    },
    playerVehicleId(): string | null {
      return composition.playerVehicleId();
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
        selection: Object.freeze({
          selectedVehicleId: frame.selectedVehicleId,
          playerVehicleId: frame.playerVehicleId,
          cameraEntityId: frame.camera.entityId,
        }),
        fleet: frame.vehicles.map((vehicle) =>
          Object.freeze({
            vehicleId: vehicle.vehicleId,
            driverKind: vehicle.driverKind,
            classId: vehicle.classId,
            slot: vehicle.slot,
            controlMode: vehicle.controlMode,
            blocked: vehicle.blocked,
            positionM: vehicle.positionM,
            yawRad: vehicle.yawRad,
            rideId: vehicle.rideId,
            routeLaneIds: vehicle.routeLaneIds,
          }),
        ),
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
          mode: frame.camera.mode,
          positionM: frame.camera.positionM,
          lookAtM: frame.camera.lookAtM,
          anchorM: frame.camera.anchorM,
          up: frame.camera.up,
          distanceM: frame.camera.distanceM,
          fovRadians: frame.camera.fovRadians,
          transitioning: frame.camera.transitioning,
          transitionRemainingTicks: frame.camera.transitionRemainingTicks,
        }),
        vehicles: frame.vehicles.map((vehicle) =>
          Object.freeze({
            vehicleId: vehicle.vehicleId,
            driverKind: vehicle.driverKind,
            classId: vehicle.classId,
            controlMode: vehicle.controlMode,
            positionM: vehicle.positionM,
            yawRad: vehicle.yawRad,
            speedMps: vehicle.speedMps,
            speedLimitMps: vehicle.speedLimitMps,
            laneId: vehicle.laneId,
            routeLaneIds: vehicle.routeLaneIds,
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
    setTimeOfDay(name: TimeOfDayName): TimeOfDayName {
      if (disposed) throw new Error('Compunerea de browser este eliberată.');
      return view.setTimeOfDay(name);
    },
    getTimeOfDay: () => view.getTimeOfDay(),
    cycleTimeOfDay: () => view.cycleTimeOfDay(),
    stats(): V3CompositionSceneStats {
      return view.stats();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener('keydown', intentKeys);
      doc.removeEventListener('keyup', intentKeys);
      keyboard.dispose();
      restoreHiddenMeshes();
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
