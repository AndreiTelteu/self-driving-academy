/**
 * PBI 239 — datele harnessului de capturi V4: configurația `?capture=1` și vederile numite.
 *
 * Modulul este pur (fără Babylon, fără DOM): definește *ce* se fotografiază. Controllerul care
 * aplică vederile în scenă este `babylon/visual-capture.ts`. Fără parametrul `capture=1` nu se
 * instalează nimic, deci căile normale ale jocului nu sunt atinse.
 *
 * Coordonatele sunt metri în lumea orașului 042/236 (harta `neighbourhood-compact-v1`):
 * străzile merg pe x și z la multipli de 180 m, carosabilul E are centrul la z≈1,3, iar
 * trotuarul de sud al blocului 0-0 începe la z=3,8. Poziția de start a personajului este
 * (9,8; 3,2) iar taxiul parcat (9,8; 2,05), ambele cu yaw π/2 (spre +x). Un PBI viitor poate adăuga
 * o vedere nouă adăugând o intrare în `CAPTURE_VIEWS`; ordinea este ordinea capturii.
 */
import type { QualityPreset } from './quality-policy';
import { TIME_OF_DAY_HOURS, type TimeOfDayName } from './time-of-day';

export const VISUAL_CAPTURE_VERSION = '239-visual-capture-v1' as const;
/** Rezoluția fixă a capturilor (identică pentru toate PBI-urile 240–253). */
export const CAPTURE_VIEWPORT = Object.freeze({ width: 1920, height: 1080 });
/**
 * Ora zilei implicită pentru capturi. PBI 252 a introdus ora din zi; `--time` o poate schimba,
 * iar manifestul înregistrează momentul efectiv, nu doar ipoteza.
 */
export const CAPTURE_FIXED_CLOCK = Object.freeze({
  hourOfDay: 12,
  note: 'ora implicită 252 = amiază; `?time=morning|noon|sunset|night` o schimbă',
});
/** Seed-ul scenariului fixat pentru capturi (scenariul 236 nu folosește aleatoriu în prezentare). */
export const CAPTURE_SEED = 1;

export type CaptureBackend = 'AUTO' | 'WEBGPU' | 'WEBGL2';

export interface CaptureConfig {
  readonly preset: QualityPreset;
  readonly backend: CaptureBackend;
  /** PBI 254: `procedural` photographs the fallback rig, `glb` (implicit) the imported models. */
  readonly models: CaptureModels;
  /** PBI 252: momentul zilei fotografiat; implicit amiaza, ca baseline-ul 239. */
  readonly time: TimeOfDayName;
}

const PRESETS: readonly QualityPreset[] = ['LOW', 'MEDIUM', 'HIGH'];

export type CaptureModels = 'glb' | 'procedural';

/**
 * Citește `?capture=1&preset=HIGH&backend=webgpu&models=procedural`. Întoarce `null` când steagul
 * lipsește, caz în care aplicația nu instalează nimic. Valorile necunoscute cad pe HIGH / AUTO /
 * GLB, nu aruncă.
 */
export function readCaptureConfig(search: string): CaptureConfig | null {
  const params = new URLSearchParams(search);
  if (params.get('capture') !== '1') return null;
  const preset = (params.get('preset') ?? 'HIGH').toUpperCase();
  const backend = (params.get('backend') ?? 'auto').toUpperCase();
  const models = (params.get('models') ?? 'glb').toLowerCase();
  const time = (params.get('time') ?? 'noon').toLowerCase();
  return Object.freeze({
    preset: PRESETS.find((candidate) => candidate === preset) ?? 'HIGH',
    backend: backend === 'WEBGPU' || backend === 'WEBGL2' ? backend : 'AUTO',
    models: models === 'procedural' ? 'procedural' : 'glb',
    time:
      (Object.keys(TIME_OF_DAY_HOURS) as TimeOfDayName[]).find((candidate) => candidate === time) ??
      'noon',
  });
}

export interface CaptureVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface CapturePose {
  readonly position: CaptureVec3;
  readonly target: CaptureVec3;
  /** FOV vertical în radiani (convenția Babylon). */
  readonly fovRad: number;
}
export interface CapturePlacement2D {
  readonly x: number;
  readonly z: number;
  readonly yawRad: number;
}
export interface CapturePlacement {
  /** Personajul; implicit rămâne la punctul de start. */
  readonly character?: CapturePlacement2D;
  /** Vehicule ale scenariului după `vehicleId`; implicit rămân la poziția de start. */
  readonly vehicles?: Readonly<Record<string, CapturePlacement2D>>;
  /** Mașini suplimentare numai pentru captură (create la `go`, eliberate la următorul `go`). */
  readonly extras?: readonly (CapturePlacement2D & { readonly classId: 'sedan' | 'compact' })[];
}
export type CaptureCategory =
  | 'character'
  | 'taxi'
  | 'street'
  | 'intersection'
  | 'facade'
  | 'city'
  | 'horizon'
  | 'decor'
  | 'civil-cars'
  | 'map-edge'
  | 'ui';
export interface CaptureView {
  readonly id: string;
  readonly category: CaptureCategory;
  readonly title: string;
  /**
   * `canvas`: canvasul 3D umple viewportul 1920×1080 (până când 240 face asta nativ).
   * `page`: pagina așa cum o vede jucătorul, cu layoutul și UI-ul reale.
   */
  readonly surface: 'canvas' | 'page';
  readonly pose: CapturePose;
  readonly placement?: CapturePlacement;
}

const at = (x: number, y: number, z: number): CaptureVec3 => ({ x, y, z });
/** Taxi și civil scoase din cadru, ca să nu intre în vederile care nu le au ca subiect. */
const CARS_AWAY: CapturePlacement = {
  vehicles: {
    'taxi-01': { x: 300, z: 1.3, yawRad: Math.PI / 2 },
    'civil-01': { x: 330, z: 1.3, yawRad: Math.PI / 2 },
  },
};

const VIEWS: readonly CaptureView[] = [
  {
    id: 'character-close',
    category: 'character',
    title: 'Personaj aproape',
    surface: 'canvas',
    pose: { position: at(11.6, 1.45, 5.0), target: at(9.8, 0.95, 3.2), fovRad: 0.7 },
  },
  {
    id: 'taxi-front-three-quarter',
    category: 'taxi',
    title: 'Taxi aproape, 3/4 față',
    surface: 'canvas',
    pose: { position: at(15.5, 1.4, -1.5), target: at(9.8, 0.8, 2.05), fovRad: 0.8 },
    placement: { character: { x: 60, z: 3.2, yawRad: Math.PI / 2 } },
  },
  {
    id: 'taxi-rear-driving',
    category: 'taxi',
    title: 'Taxi din spate, în mers',
    surface: 'canvas',
    pose: { position: at(50.2, 2.3, 1.3), target: at(60, 1.0, 1.3), fovRad: 0.85 },
    placement: {
      vehicles: {
        'taxi-01': { x: 58, z: 1.3, yawRad: Math.PI / 2 },
        'civil-01': { x: 300, z: 1.3, yawRad: Math.PI / 2 },
      },
    },
  },
  {
    id: 'street-eye-level',
    category: 'street',
    title: 'Stradă la nivelul ochilor',
    surface: 'canvas',
    pose: { position: at(20, 1.65, 4.6), target: at(120, 2.2, 1.5), fovRad: 1.0 },
  },
  {
    id: 'intersection-crosswalk',
    category: 'intersection',
    title: 'Intersecție cu trecere de pietoni',
    surface: 'canvas',
    pose: { position: at(203, 2.2, 181.5), target: at(180, 0.2, 180.5), fovRad: 0.9 },
    placement: CARS_AWAY,
  },
  {
    id: 'facades-close',
    category: 'facade',
    title: 'Fațade aproape',
    surface: 'canvas',
    pose: { position: at(105, 2.0, 12), target: at(140, 6, 40), fovRad: 1.0 },
    placement: CARS_AWAY,
  },
  {
    id: 'city-aerial',
    category: 'city',
    title: 'Oraș de sus',
    surface: 'canvas',
    pose: { position: at(180, 230, -150), target: at(180, 0, 150), fovRad: 0.85 },
    placement: CARS_AWAY,
  },
  {
    id: 'horizon',
    category: 'horizon',
    title: 'Orizont',
    surface: 'canvas',
    pose: { position: at(1.7, 1.7, 190), target: at(1.7, 8, 700), fovRad: 1.0 },
    placement: CARS_AWAY,
  },
  {
    // PBI 243: privește spre soare (direcția `daylight-sun` inversată): discul, aureola și norii.
    id: 'sky-sun',
    category: 'horizon',
    title: 'Cer cu soarele',
    surface: 'canvas',
    pose: { position: at(1.7, 1.7, 190), target: at(1.7 + 45, 1.7 + 100, 190 - 35), fovRad: 1.0 },
    placement: CARS_AWAY,
  },
  {
    id: 'decor-tree-bench',
    category: 'decor',
    title: 'Decor: copac, bancă, hidrant',
    surface: 'canvas',
    pose: { position: at(24, 1.8, 0.2), target: at(25, 1.8, 5.5), fovRad: 0.95 },
    placement: CARS_AWAY,
  },
  {
    id: 'decor-lamp-shelter',
    category: 'decor',
    title: 'Decor: stâlp și adăpost',
    surface: 'canvas',
    pose: { position: at(100, 1.8, 0.2), target: at(91.2, 1.6, 5.0), fovRad: 0.95 },
    placement: CARS_AWAY,
  },
  {
    id: 'civil-cars',
    category: 'civil-cars',
    title: 'Mașini civile',
    surface: 'canvas',
    pose: { position: at(58, 1.8, 3.0), target: at(40, 0.9, 1.0), fovRad: 0.95 },
    placement: {
      vehicles: {
        'taxi-01': { x: 30.5, z: 2.05, yawRad: Math.PI / 2 },
        'civil-01': { x: 39.8, z: 2.05, yawRad: Math.PI / 2 },
      },
      extras: [
        { classId: 'compact', x: 47.5, z: 2.05, yawRad: Math.PI / 2 },
        { classId: 'sedan', x: 33, z: -1.7, yawRad: -Math.PI / 2 },
      ],
    },
  },
  {
    id: 'map-edge',
    category: 'map-edge',
    title: 'Marginea hărții',
    surface: 'canvas',
    pose: { position: at(690, 1.7, 1.3), target: at(800, 0.5, 1.3), fovRad: 1.0 },
    placement: CARS_AWAY,
  },
  {
    // PBI 242: taxiul oprit de limita hărții (parapet + zid invizibil la x = 748 m).
    id: 'map-edge-barrier',
    category: 'map-edge',
    title: 'Taxi oprit de parapetul de la marginea hărții',
    surface: 'canvas',
    pose: { position: at(738.5, 1.9, -3.4), target: at(747.5, 0.7, 1.5), fovRad: 0.9 },
    placement: {
      vehicles: {
        'taxi-01': { x: 745.85, z: 1.3, yawRad: Math.PI / 2 },
        'civil-01': { x: 300, z: 1.3, yawRad: Math.PI / 2 },
      },
    },
  },
  {
    id: 'ui-hud',
    category: 'ui',
    title: 'UI și HUD (pagina completă)',
    surface: 'page',
    pose: { position: at(11.6, 1.45, 5.0), target: at(9.8, 0.95, 3.2), fovRad: 0.7 },
  },
];

export const CAPTURE_VIEWS: readonly CaptureView[] = Object.freeze(
  VIEWS.map((view) => Object.freeze(view)),
);

export function captureView(id: string): CaptureView | undefined {
  return CAPTURE_VIEWS.find((view) => view.id === id);
}
