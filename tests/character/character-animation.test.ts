import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_CLIP_IDS,
  CHARACTER_JOINT_IDS,
  CharacterContractError,
  applyCharacterPose,
  characterClipSpec,
  characterPositionBits,
  createCharacterAsset,
  createCharacterAuthority,
  createCharacterPoseWriter,
  sampleCharacterPose,
  type CharacterPose,
} from '../../src/character';

const asset = createCharacterAsset();
const authority = createCharacterAuthority({
  entityId: 'pedestrian-001',
  positionM: { x: 1234.5678901234567, y: -0.10000000000000009, z: 987.6543219876543 },
  yawRad: 0.1234567890123457,
});

function positionBytes(position: { x: number; y: number; z: number }): Buffer {
  return Buffer.from(new Float64Array([position.x, position.y, position.z]).buffer);
}

function expectCode(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) => (error as CharacterContractError).code === code);
}

test('fiecare clip produce doar transformări locale, în ordinea scheletului', () => {
  for (const clipId of CHARACTER_CLIP_IDS) {
    const spec = characterClipSpec(clipId);
    for (let tick = 0; tick < spec.frames; tick += 1) {
      const pose = sampleCharacterPose(asset.skeleton, clipId, tick);
      assert.deepEqual(Object.keys(pose).sort(), [
        'clipId',
        'finished',
        'frame',
        'joints',
        'localOnly',
        'phase',
        'tick',
      ]);
      assert.equal(pose.localOnly, true);
      assert.equal(pose.clipId, clipId);
      assert.equal(pose.tick, tick);
      assert.ok(pose.phase >= 0 && pose.phase <= 1);
      if (spec.loop) assert.ok(pose.phase < 1);
      else assert.equal(pose.phase === 1, pose.frame === spec.frames - 1);
      assert.deepEqual(
        pose.joints.map((transform) => transform.joint),
        [...CHARACTER_JOINT_IDS],
      );
      for (const transform of pose.joints) {
        assert.equal(transform.rotationRad.y, 0);
        assert.equal(transform.rotationRad.z, 0);
        assert.ok(Number.isFinite(transform.rotationRad.x));
        if (transform.joint === 'pelvis') {
          // The only translation is the vertical bob of the root joint: no hidden root motion.
          assert.equal(transform.offsetM.x, 0);
          assert.equal(transform.offsetM.z, 0);
          assert.ok(Math.abs(transform.offsetM.y) < 0.5);
        } else {
          assert.deepEqual(transform.offsetM, { x: 0, y: 0, z: 0 });
        }
      }
    }
  }
});

test('poziția autoritară rămâne bit-identică după eșantionarea oricărui clip', () => {
  const expectedBits = characterPositionBits(authority.positionM);
  const expectedBytes = positionBytes(authority.positionM);
  let frames = 0;
  for (const clipId of CHARACTER_CLIP_IDS) {
    const spec = characterClipSpec(clipId);
    const ticks = [
      ...Array.from({ length: spec.frames }, (_, index) => index),
      ...(spec.loop ? [spec.frames, spec.frames * 13 + 7, spec.frames * 5000] : []),
    ];
    for (const tick of ticks) {
      const pose = sampleCharacterPose(asset.skeleton, clipId, tick);
      const frame = applyCharacterPose(authority, pose);
      assert.equal(frame.entityId, authority.entityId);
      assert.equal(frame.yawRad, authority.yawRad);
      assert.equal(characterPositionBits(frame.positionM), expectedBits);
      assert.equal(Buffer.compare(positionBytes(frame.positionM), expectedBytes), 0);
      assert.equal(frame.positionM.x, authority.positionM.x);
      assert.equal(frame.positionM.y, authority.positionM.y);
      assert.equal(frame.positionM.z, authority.positionM.z);
      frames += 1;
    }
  }
  assert.equal(frames, 309);
});

test('clipurile nu citesc poziția: autorități diferite dau aceleași articulații', () => {
  const pose = sampleCharacterPose(asset.skeleton, 'run', 7);
  const other = createCharacterAuthority({
    entityId: 'pedestrian-002',
    positionM: { x: -42.5, y: 3.25, z: 0.125 },
    yawRad: -1.75,
  });
  const first = applyCharacterPose(authority, pose);
  const second = applyCharacterPose(other, pose);
  assert.deepEqual(first.joints, second.joints);
  assert.notEqual(characterPositionBits(first.positionM), characterPositionBits(second.positionM));
});

test('scrierea poziției prin animație este refuzată explicit, nu ignorată', () => {
  const writer = createCharacterPoseWriter(authority);
  const before = characterPositionBits(authority.positionM);
  expectCode(() => writer.writeEntityPositionM({ x: 0, y: 0, z: 0 }), 'AUTHORITY_WRITE_REFUSED');
  expectCode(() => writer.writeRootMotionM({ x: 1, y: 0, z: 0 }), 'AUTHORITY_WRITE_REFUSED');
  assert.equal(characterPositionBits(authority.positionM), before);
  const frame = writer.commit();
  assert.equal(characterPositionBits(frame.positionM), before);
  assert.equal(frame.joints.length, CHARACTER_JOINT_IDS.length);

  const pose = sampleCharacterPose(asset.skeleton, 'idle', 3);
  const withPosition = { ...pose, positionM: { x: 0, y: 0, z: 0 } } as CharacterPose;
  expectCode(() => applyCharacterPose(authority, withPosition), 'POSE_CONTAINS_ENTITY_POSITION');
  const withTransform = { ...pose, transform: { yawRad: 1 } } as CharacterPose;
  expectCode(() => applyCharacterPose(authority, withTransform), 'POSE_CONTAINS_ENTITY_POSITION');
  const withRootMotion = {
    ...pose,
    joints: pose.joints.map((transform) =>
      transform.joint === 'pelvis'
        ? { ...transform, offsetM: { x: 0.25, y: transform.offsetM.y, z: 0 } }
        : transform,
    ),
  } as CharacterPose;
  expectCode(() => applyCharacterPose(authority, withRootMotion), 'ROOT_MOTION_IN_CLIP');
  const translatedLimb = {
    ...pose,
    joints: pose.joints.map((transform) =>
      transform.joint === 'thigh-left'
        ? { ...transform, offsetM: { x: 0, y: 0.1, z: 0 } }
        : transform,
    ),
  } as CharacterPose;
  expectCode(() => applyCharacterPose(authority, translatedLimb), 'ROOT_MOTION_IN_CLIP');
  assert.equal(characterPositionBits(authority.positionM), before);
});

test('writer-ul refuză articulații necunoscute și acceptă doar transformări locale', () => {
  const writer = createCharacterPoseWriter(authority);
  expectCode(
    () =>
      writer.writeLocalJoint({
        joint: 'tail' as never,
        offsetM: { x: 0, y: 0, z: 0 },
        rotationRad: { x: 0, y: 0, z: 0 },
      }),
    'INVALID_JOINT',
  );
  writer.writeLocalJoint({
    joint: 'thigh-left',
    offsetM: { x: 0, y: 0, z: 0 },
    rotationRad: { x: -0.3, y: 0, z: 0 },
  });
  const frame = writer.commit();
  const thigh = frame.joints.find((transform) => transform.joint === 'thigh-left')!;
  assert.equal(thigh.rotationRad.x, -0.3);
  assert.equal(characterPositionBits(frame.positionM), characterPositionBits(authority.positionM));
});

test('eșantionarea tratează tick-ul determinist: bucle, clipuri one-shot și refuzuri', () => {
  assert.equal(sampleCharacterPose(asset.skeleton, 'idle', 0).frame, 0);
  assert.equal(sampleCharacterPose(asset.skeleton, 'idle', 120).frame, 0);
  assert.equal(sampleCharacterPose(asset.skeleton, 'idle', 121).frame, 1);
  const wrapped = sampleCharacterPose(asset.skeleton, 'walk', 48);
  assert.equal(wrapped.frame, 0);
  assert.deepEqual(wrapped.joints, sampleCharacterPose(asset.skeleton, 'walk', 0).joints);
  assert.equal(sampleCharacterPose(asset.skeleton, 'enter-vehicle', 0).finished, false);
  assert.equal(sampleCharacterPose(asset.skeleton, 'enter-vehicle', 999).finished, true);
  const first = sampleCharacterPose(asset.skeleton, 'run', 5);
  const second = sampleCharacterPose(asset.skeleton, 'run', 5);
  assert.deepEqual(first, second);
  expectCode(() => sampleCharacterPose(asset.skeleton, 'idle', -1), 'INVALID_TICK');
  expectCode(() => sampleCharacterPose(asset.skeleton, 'idle', 1.5), 'INVALID_TICK');
  expectCode(() => sampleCharacterPose(asset.skeleton, 'fly' as never, 0), 'INVALID_CLIP');
});
