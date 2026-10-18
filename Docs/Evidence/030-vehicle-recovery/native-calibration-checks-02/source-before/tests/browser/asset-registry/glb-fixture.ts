/** Original 3-vertex calibration triangle; CC0, no external resources. */
export function triangleGlb(
  textured = false,
  encodedImage?: Uint8Array,
  mimeType = 'image/png',
): Uint8Array {
  const png =
    encodedImage ??
    Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      ),
      (c) => c.charCodeAt(0),
    );
  const binaryLength = textured ? Math.ceil((68 + png.length) / 4) * 4 : 44;
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, ...(textured ? { TEXCOORD_0: 2 } : {}) },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.1, 0.8, 0.6, 1],
          metallicFactor: 0,
          ...(textured ? { baseColorTexture: { index: 0 } } : {}),
        },
        doubleSided: true,
      },
    ],
    ...(textured ? { textures: [{ source: 0 }], images: [{ bufferView: 3, mimeType }] } : {}),
    buffers: [{ byteLength: binaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      ...(textured
        ? [
            { buffer: 0, byteOffset: 44, byteLength: 24 },
            { buffer: 0, byteOffset: 68, byteLength: png.length },
          ]
        : []),
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-1, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ...(textured ? [{ bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' }] : []),
    ],
  };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(json, 20);
  const chunk = 20 + jsonLength;
  view.setUint32(chunk, binaryLength, true);
  view.setUint32(chunk + 4, 0x004e4942, true);
  bytes.set(new Uint8Array(new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), chunk + 8);
  view.setUint16(chunk + 44, 0, true);
  view.setUint16(chunk + 46, 1, true);
  view.setUint16(chunk + 48, 2, true);
  if (textured) {
    bytes.set(new Uint8Array(new Float32Array([0, 0, 1, 0, 0.5, 1]).buffer), chunk + 8 + 44);
    bytes.set(png, chunk + 8 + 68);
  }
  return bytes;
}
