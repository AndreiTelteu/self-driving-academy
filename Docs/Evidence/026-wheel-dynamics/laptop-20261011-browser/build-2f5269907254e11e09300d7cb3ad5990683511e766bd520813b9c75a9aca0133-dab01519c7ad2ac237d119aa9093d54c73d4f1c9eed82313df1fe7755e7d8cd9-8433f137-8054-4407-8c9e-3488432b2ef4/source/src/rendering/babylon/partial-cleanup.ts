import { releaseOwnersOnce } from '../backend-policy';

/** Babylon 9.29 acquired owners only; initialized engines retain native dispose(). */
interface PartialWebGPUOwners {
  _isDisposed: boolean;
  _timestampQuery?: { dispose(): void };
  _mainTexture?: { destroy(): void };
  _depthTexture?: { destroy(): void };
  _textureHelper?: { destroyDeferredTextures(): void };
  _bufferManager?: { destroyDeferredBuffers(): void };
  _device?: { destroy(): void };
}

export function ownPartialWebGPUCleanup(
  partial: PartialWebGPUOwners,
  commonDispose: () => void,
  baseDispose: () => void,
): () => void {
  return releaseOwnersOnce([
    () => {
      partial._isDisposed = true;
    },
    () => partial._timestampQuery?.dispose(),
    () => partial._mainTexture?.destroy(),
    () => partial._depthTexture?.destroy(),
    () => partial._textureHelper?.destroyDeferredTextures(),
    () => partial._bufferManager?.destroyDeferredBuffers(),
    () => partial._device?.destroy(),
    commonDispose,
    baseDispose,
  ]);
}

/** The context was recorded before Engine construction, including constructor failure. */
export function releaseOwnedCanvas(
  canvas: { width: number; height: number },
  context?: { getExtension(name: 'WEBGL_lose_context'): { loseContext(): void } | null },
): void {
  releaseOwnersOnce([
    () => context?.getExtension('WEBGL_lose_context')?.loseContext(),
    () => {
      canvas.width = 0;
    },
    () => {
      canvas.height = 0;
    },
  ])();
}
