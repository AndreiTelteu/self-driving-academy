import { ContractValidationError } from '../sessions';
import type { Vector3 } from '../vehicles';
export class MapValidationError extends ContractValidationError {
  readonly path: string;
  readonly reason: string;
  readonly id: string | null;
  readonly positionM: Vector3 | null;
  constructor(
    path: string,
    message: string,
    id: string | null = null,
    positionM: Vector3 | null = null,
  ) {
    super(
      `${path}${id ? ` [${id}]` : ''}${positionM ? ` @(${positionM.x},${positionM.y},${positionM.z})m` : ''}: ${message}`,
    );
    this.name = 'MapValidationError';
    this.path = path;
    this.reason = message;
    this.id = id;
    this.positionM = positionM;
  }
}
export function at<T>(path: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof MapValidationError) throw error;
    if (error instanceof ContractValidationError) throw new MapValidationError(path, error.message);
    throw error;
  }
}
export function ensure(
  condition: boolean,
  path: string,
  message: string,
  id: string | null = null,
  positionM: Vector3 | null = null,
): asserts condition {
  if (!condition) throw new MapValidationError(path, message, id, positionM);
}
