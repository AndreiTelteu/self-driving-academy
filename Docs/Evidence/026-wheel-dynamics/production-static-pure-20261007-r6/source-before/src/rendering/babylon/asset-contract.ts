export interface AssetLimits {
  readonly maxConcurrent: number;
  readonly maxQueued: number;
  readonly maxCacheEntries: number;
  readonly maxAssetBytes: number;
  readonly maxResidentBytes: number;
  readonly maxInstances: number;
  readonly maxVertices: number;
  readonly maxNodes: number;
  readonly maxMaterials: number;
  readonly fetchTimeoutMs: number;
  readonly decodeUploadBudgetMs: number;
  readonly maxReports: number;
  readonly maxTextureDimension: number;
  readonly maxTextureBytes: number;
}
export const DEFAULT_ASSET_LIMITS: AssetLimits = Object.freeze({
  maxConcurrent: 2,
  maxQueued: 32,
  maxCacheEntries: 32,
  maxAssetBytes: 4 * 1024 * 1024,
  maxResidentBytes: 20 * 1024 * 1024,
  maxInstances: 512,
  maxVertices: 100_000,
  maxNodes: 512,
  maxMaterials: 32,
  fetchTimeoutMs: 10_000,
  decodeUploadBudgetMs: 2_000,
  maxReports: 64,
  maxTextureDimension: 2048,
  maxTextureBytes: 16 * 1024 * 1024,
});
/** Embedded geometry and PNG/JPEG textures. External resources/extension decoders reject. */
export function analyzeRegistryGlb(bytes: Uint8Array, limits: AssetLimits = DEFAULT_ASSET_LIMITS) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    bytes.length > limits.maxAssetBytes ||
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length ||
    view.getUint32(16, true) !== 0x4e4f534a
  )
    throw new Error('Invalid GLB 2 header');
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > bytes.length - 20) throw new Error('Invalid GLB JSON length');
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  if (!data || typeof data !== 'object') throw new Error('Invalid glTF document');
  const document = data as Record<string, unknown>;
  const array = (key: string): Record<string, unknown>[] => {
    const value = document[key] ?? [];
    if (!Array.isArray(value) || value.some((item) => !item || typeof item !== 'object'))
      throw new Error(`Invalid glTF ${key}`);
    return value as Record<string, unknown>[];
  };
  if (
    (document.extensionsUsed as unknown[] | undefined)?.length ||
    (document.extensionsRequired as unknown[] | undefined)?.length
  )
    throw new Error(
      'Registry GLB extension decoders unsupported; provide core glTF geometry/PNG/JPEG',
    );
  if (array('buffers').some((buffer) => buffer.uri !== undefined))
    throw new Error('External GLB buffers forbidden');
  if (array('nodes').length > limits.maxNodes || array('materials').length > limits.maxMaterials)
    throw new Error('Asset node/material capacity');
  let decoded = 0,
    counts = 0;
  const accessors = array('accessors');
  if (
    array('meshes').length > limits.maxNodes ||
    accessors.length > limits.maxNodes ||
    array('animations').length > limits.maxNodes ||
    array('skins').length > limits.maxNodes
  )
    throw new Error('Asset mesh/accessor/animation capacity');
  let vertices = 0,
    primitives = 0;
  for (const mesh of array('meshes')) {
    if (!Array.isArray(mesh.primitives)) throw new Error('Invalid GLB primitives');
    primitives += mesh.primitives.length;
    for (const primitive of mesh.primitives as Record<string, unknown>[]) {
      const attributes = primitive.attributes as Record<string, unknown> | undefined;
      const index = attributes?.POSITION;
      if (!Number.isSafeInteger(index) || !accessors[index as number])
        throw new Error('Invalid GLB POSITION');
      vertices += Number(accessors[index as number].count);
    }
  }
  if (primitives > limits.maxNodes || vertices > limits.maxVertices)
    throw new Error('Asset primitive/vertex capacity');
  for (const accessor of accessors) {
    if (!Number.isSafeInteger(accessor.count) || (accessor.count as number) < 0 || accessor.sparse)
      throw new Error('Invalid/unbounded GLB accessor');
    counts += accessor.count as number;
    const components: Record<string, number> = {
      SCALAR: 1,
      VEC2: 2,
      VEC3: 3,
      VEC4: 4,
      MAT2: 4,
      MAT3: 9,
      MAT4: 16,
    };
    const sizes: Record<string, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const size = components[String(accessor.type)] * sizes[String(accessor.componentType)];
    if (!size) throw new Error('Invalid GLB accessor type');
    decoded += (accessor.count as number) * size;
  }
  if (counts > limits.maxVertices * 16 || decoded > limits.maxAssetBytes * 4)
    throw new Error('Asset decoded geometry budget exceeded');
  let textureBytes = 0;
  const binaryStart = 20 + jsonLength + 8;
  const views = array('bufferViews');
  for (const image of array('images')) {
    if (image.uri !== undefined || !Number.isSafeInteger(image.bufferView))
      throw new Error('Texture must be embedded in GLB');
    const buffer = views[image.bufferView as number];
    if (!buffer || buffer.buffer !== 0 || !Number.isSafeInteger(buffer.byteLength))
      throw new Error('Invalid embedded image');
    const offset = (buffer.byteOffset ?? 0) as number;
    const length = buffer.byteLength as number;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      length < 24 ||
      binaryStart + offset + length > bytes.length
    )
      throw new Error('Invalid embedded image range');
    const encoded = bytes.subarray(binaryStart + offset, binaryStart + offset + length);
    const header = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    let width = 0,
      height = 0;
    if (
      image.mimeType === 'image/png' &&
      header.getUint32(0) === 0x89504e47 &&
      header.getUint32(12) === 0x49484452
    ) {
      width = header.getUint32(16);
      height = header.getUint32(20);
    } else if (image.mimeType === 'image/jpeg' && header.getUint16(0) === 0xffd8) {
      let cursor = 2;
      while (cursor + 9 < encoded.length) {
        if (encoded[cursor] !== 255) break;
        const marker = encoded[cursor + 1];
        const size = header.getUint16(cursor + 2);
        if (size < 2 || cursor + size + 2 > encoded.length) break;
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          height = header.getUint16(cursor + 5);
          width = header.getUint16(cursor + 7);
          break;
        }
        cursor += size + 2;
      }
    }
    if (
      width < 1 ||
      height < 1 ||
      width > limits.maxTextureDimension ||
      height > limits.maxTextureDimension
    )
      throw new Error('PNG/JPEG texture dimensions invalid or over budget');
    textureBytes += Math.ceil((width * height * 4 * 4) / 3); // RGBA plus complete mip chain, conservative.
  }
  const textures = array('textures');
  if (textures.length > limits.maxMaterials * 8) throw new Error('Asset texture count exceeded');
  textureBytes *= Math.max(1, textures.length);
  if (textureBytes > limits.maxTextureBytes)
    throw new Error('Asset decoded texture budget exceeded');
  return Object.freeze({
    geometryGpuBytes: decoded,
    textureGpuBytes: textureBytes,
    decodedResourceBytes: decoded + textureBytes,
    decoderWasmBytes: 0,
    decoderWorkspaceBytes: 0,
    codecs: 'CORE_GLB_PNG_JPEG' as const,
  });
}
export function validateRegistryGlb(
  bytes: Uint8Array,
  limits: AssetLimits = DEFAULT_ASSET_LIMITS,
): number {
  return analyzeRegistryGlb(bytes, limits).decodedResourceBytes;
}
