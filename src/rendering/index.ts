import type { SimulationSnapshot } from '../simulation';
export type { BackendPreference, RendererKind } from './backend-policy';
export type { VisualTransform, VisualVehicleState, VisualWorldIdentity } from './scene-contract';

export interface Renderer {
  present(snapshot: SimulationSnapshot): void;
  dispose(): void;
}

export interface BootstrapPresentation {
  readonly status: string;
  readonly engineLabel: string;
}

export interface BootstrapView {
  show(presentation: BootstrapPresentation): void;
  dispose(): void;
}
