import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_GROUND_CONTACT_TOLERANCE_M,
  aggregateContact,
  checkClipContact,
  createCharacterAsset,
  evaluateContact,
  measureContactFrame,
  measureClipContact,
  sampleCharacterPose,
  type CharacterContactFrame,
  type CharacterPose,
} from '../../src/character';

const asset = createCharacterAsset();
const tolerance = CHARACTER_GROUND_CONTACT_TOLERANCE_M;

function shiftPelvis(pose: CharacterPose, offsetY: number): CharacterPose {
  return {
    ...pose,
    joints: pose.joints.map((transform) =>
      transform.joint === 'pelvis'
        ? { ...transform, offsetM: { x: 0, y: transform.offsetM.y + offsetY, z: 0 } }
        : transform,
    ),
  };
}

function contactOf(pose: CharacterPose, frame = 0): CharacterContactFrame {
  return { ...measureContactFrame(asset.skeleton, pose), frame };
}

test('mersul și alergarea păstrează un picior în contact în fiecare cadru', () => {
  for (const clipId of ['walk', 'run'] as const) {
    const check = checkClipContact(asset.skeleton, clipId);
    assert.equal(check.verdict, 'PASS');
    const contact = check.contact;
    assert.equal(contact.frames, measureClipContact(asset.skeleton, clipId).frames);
    assert.equal(contact.supportFrames, contact.frames);
    assert.ok(contact.bothFeetFrames > 0, 'double support exists');
    assert.ok(contact.lowestMinM >= -tolerance);
    assert.ok(contact.lowestMaxM <= tolerance);
    assert.ok(contact.maxPenetrationM <= tolerance);
    assert.ok(contact.maxFloatM <= tolerance);
    // The measured swing foot leaves the ground, so the check is not trivially flat.
    assert.ok(contact.leftSoleMaxM > 0.1);
    assert.ok(contact.rightSoleMaxM > 0.1);
    for (const frame of contact.frameDetail) {
      assert.ok(frame.lowestM >= -tolerance);
      assert.ok(Math.min(frame.leftSoleM, frame.rightSoleM) <= tolerance);
    }
  }
});

test('idle ține ambele tălpi în contact, iar tranzițiile nu coboară sub sol', () => {
  const idle = checkClipContact(asset.skeleton, 'idle');
  assert.equal(idle.verdict, 'PASS');
  assert.equal(idle.contact.bothFeetFrames, idle.contact.frames);
  assert.ok(idle.contact.leftSoleMaxM <= tolerance);
  assert.ok(idle.contact.rightSoleMaxM <= tolerance);

  for (const clipId of ['enter-vehicle', 'exit-vehicle'] as const) {
    const check = checkClipContact(asset.skeleton, clipId);
    assert.equal(check.verdict, 'PASS');
    assert.ok(check.contact.lowestMinM >= -tolerance);
    assert.ok(check.contact.maxPenetrationM <= tolerance);
  }
  const exit = checkClipContact(asset.skeleton, 'exit-vehicle');
  // The exit clip lifts one foot to step out; it is not a frozen pose.
  assert.ok(exit.contact.rightSoleMaxM > 0.05);
  assert.ok(exit.contact.leftSoleMaxM <= tolerance);
});

test('coborârea pelvisului deplasează tălpile: contactul vine din FK, nu din ținte', () => {
  const pose = sampleCharacterPose(asset.skeleton, 'walk', 0);
  const lowered = contactOf(shiftPelvis(pose, -0.2));
  assert.ok(lowered.leftSoleM < -0.19);
  assert.ok(lowered.lowestM < -0.19);
  const check = evaluateContact('walk', aggregateContact('walk', [lowered]));
  assert.deepEqual([...check.reasons], ['GROUND_PENETRATION']);
  assert.equal(check.verdict, 'FAIL');
});

test('un cadru plutitor este refuzat cu motiv, nu acceptat tacit', () => {
  const pose = sampleCharacterPose(asset.skeleton, 'idle', 0);
  const lifted = contactOf(shiftPelvis(pose, 0.2));
  assert.ok(lifted.lowestM > 0.19);
  const walkCheck = evaluateContact('walk', aggregateContact('walk', [lifted]));
  assert.ok(walkCheck.reasons.includes('GROUND_FLOAT'));
  assert.ok(walkCheck.reasons.includes('NO_SUPPORT_FOOT'));
  const idleCheck = evaluateContact('idle', aggregateContact('idle', [lifted]));
  assert.ok(idleCheck.reasons.includes('IDLE_FOOT_LIFTED'));
  // Transitions may lift a foot, so a pure float is not a failure there; only sinking is.
  const transitionCheck = evaluateContact(
    'enter-vehicle',
    aggregateContact('enter-vehicle', [lifted]),
  );
  assert.equal(transitionCheck.verdict, 'PASS');
});

test('agregarea raportează min/max numeric, toleranța și suportul', () => {
  const contact = measureClipContact(asset.skeleton, 'walk');
  assert.equal(contact.toleranceM, tolerance);
  assert.equal(contact.frames, 48);
  assert.equal(contact.frameDetail.length, 48);
  assert.ok(Number.isFinite(contact.lowestMinM));
  assert.ok(Number.isFinite(contact.lowestMaxM));
  assert.ok(contact.leftSoleMinM >= -1e-9);
  assert.ok(contact.leftSoleMaxM <= 0.17);
  assert.equal(contact.maxPenetrationM, Math.max(0, -contact.lowestMinM));
  assert.equal(contact.maxFloatM, Math.max(0, contact.lowestMaxM));
  const frames = contact.frameDetail;
  assert.equal(frames[0]!.frame, 0);
  assert.equal(frames.at(-1)!.frame, 47);
  assert.throws(() => aggregateContact('walk', []), RangeError);
});
