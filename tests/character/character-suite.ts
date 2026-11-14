/**
 * PBI 191 — deterministic evidence suite for the character asset, animation and ground contact.
 *
 * The suite is shared by `npm run character:report` and the tests: it measures the real asset
 * against the real city/vehicle references, samples every clip frame, proves that the authoritative
 * position is bit-identical after animation, and records the explicit refusals.
 */
import { createHash } from 'node:crypto';
import {
  CHARACTER_CLIP_IDS,
  CHARACTER_GROUND_CONTACT_TOLERANCE_M,
  CHARACTER_SAMPLING_HZ,
  applyCharacterPose,
  characterClipNominalSpeedMps,
  characterClipSpec,
  characterHeadTopM,
  characterJointFrames,
  characterPositionBits,
  characterScaleTable,
  checkCharacterCompatibility,
  checkClipContact,
  createCharacterAsset,
  createCharacterAuthority,
  createCharacterPoseWriter,
  requireCharacterCompatibility,
  sampleCharacterPose,
  type CharacterAsset,
  type CharacterClipContact,
  type CharacterClipId,
  type CharacterCompatibility,
  type CharacterCompatibilityCheck,
  type CharacterContactFrame,
  type CharacterContractError,
  type CharacterWorldReference,
} from '../../src/character';
import {
  admitCharacterAssets,
  buildCharacterVisual,
  characterAssetBudget,
  characterAssetInventory,
  characterVisualAlignment,
  CHARACTER_VISUAL_LODS,
} from '../../src/rendering';
import { realWorldReference, type RealWorldReference } from './world-reference';

export const CHARACTER_CONTRACT = '191-character-v1';
export const CHARACTER_COMMAND = 'npm run character:report';

interface ClipReport {
  readonly clipId: CharacterClipId;
  readonly kind: string;
  readonly durationS: number;
  readonly frames: number;
  readonly loop: boolean;
  readonly samplingHz: number;
  readonly nominalSpeedMps: number;
  readonly toleranceM: number;
  readonly lowestMinM: number;
  readonly lowestMaxM: number;
  readonly leftSoleMinM: number;
  readonly leftSoleMaxM: number;
  readonly rightSoleMinM: number;
  readonly rightSoleMaxM: number;
  readonly maxPenetrationM: number;
  readonly maxFloatM: number;
  readonly supportFrames: number;
  readonly bothFeetFrames: number;
  readonly headTopMinM: number;
  readonly headTopMaxM: number;
  readonly reasons: readonly string[];
  readonly verdict: 'PASS' | 'FAIL';
  readonly frameDetail: readonly CharacterContactFrame[];
}

interface AuthorityClipProof {
  readonly clipId: CharacterClipId;
  readonly framesSampled: number;
  readonly extraTicks: readonly number[];
  readonly identical: boolean;
  readonly mismatchedFrames: number;
}

interface AuthorityProof {
  readonly entityId: string;
  readonly positionBits: string;
  readonly yawRad: number;
  readonly clips: readonly AuthorityClipProof[];
  readonly positionIndependentOfAuthority: boolean;
  readonly refusals: readonly Readonly<{
    case: string;
    refused: boolean;
    code: string | null;
    positionBitsUnchanged: boolean;
    message: string;
  }>[];
}

interface RefusalReport {
  readonly case: string;
  readonly refused: boolean;
  readonly reasons: readonly string[];
  readonly message: string;
  readonly detail: readonly CharacterCompatibilityCheck[];
}

interface VisualReport {
  readonly lods: readonly Readonly<{
    lod: string;
    parts: number;
    vertices: number;
    indices: number;
    gpuBytes: number;
    drawCalls: number;
    materialGroups: readonly string[];
  }>[];
  readonly alignmentIssues: readonly string[];
  readonly inventoryEntries: number;
  readonly inventoryBytes: number;
  readonly budgetAccepted: boolean;
  readonly budgetDiagnostics: number;
}

export interface CharacterReport {
  readonly generatedBy: string;
  readonly command: string;
  readonly contract: string;
  readonly samplingHz: number;
  readonly reference: RealWorldReference;
  readonly asset: Readonly<{
    id: string;
    version: string;
    scale: number;
    declared: CharacterAsset['declared'];
    measured: CharacterAsset['measured'];
    scaleTable: ReturnType<typeof characterScaleTable>;
  }>;
  readonly compatibility: CharacterCompatibility;
  readonly clips: readonly ClipReport[];
  readonly authority: AuthorityProof;
  readonly refusals: readonly RefusalReport[];
  readonly visual: VisualReport;
  readonly determinism: Readonly<{ runs: number; identical: boolean; digest: string }>;
  readonly summary: Readonly<{
    compatibilityPassed: number;
    compatibilityChecks: number;
    clipsPassed: number;
    clips: number;
    authorityFrames: number;
    refusedCases: number;
    refusedCasesTotal: number;
    visualIssues: number;
    pass: boolean;
  }>;
  readonly limitations: readonly string[];
}

function probeAuthority() {
  return createCharacterAuthority({
    entityId: 'pedestrian-001',
    // Deliberately awkward values: bit identity must not depend on decimal round numbers.
    positionM: { x: 1234.5678901234567, y: -0.10000000000000009, z: 987.6543219876543 },
    yawRad: 0.1234567890123457,
  });
}

function clipReport(asset: CharacterAsset, clipId: CharacterClipId): ClipReport {
  const spec = characterClipSpec(clipId);
  const check = checkClipContact(asset.skeleton, clipId);
  const contact: CharacterClipContact = check.contact;
  let headMin = Number.POSITIVE_INFINITY;
  let headMax = Number.NEGATIVE_INFINITY;
  for (const frame of contact.frameDetail) {
    const pose = sampleCharacterPose(asset.skeleton, clipId, frame.frame);
    const top = characterHeadTopM(asset.skeleton, characterJointFrames(asset.skeleton, pose));
    headMin = Math.min(headMin, top);
    headMax = Math.max(headMax, top);
  }
  return {
    clipId,
    kind: spec.kind,
    durationS: spec.durationS,
    frames: spec.frames,
    loop: spec.loop,
    samplingHz: CHARACTER_SAMPLING_HZ,
    nominalSpeedMps: characterClipNominalSpeedMps(spec),
    toleranceM: contact.toleranceM,
    lowestMinM: contact.lowestMinM,
    lowestMaxM: contact.lowestMaxM,
    leftSoleMinM: contact.leftSoleMinM,
    leftSoleMaxM: contact.leftSoleMaxM,
    rightSoleMinM: contact.rightSoleMinM,
    rightSoleMaxM: contact.rightSoleMaxM,
    maxPenetrationM: contact.maxPenetrationM,
    maxFloatM: contact.maxFloatM,
    supportFrames: contact.supportFrames,
    bothFeetFrames: contact.bothFeetFrames,
    headTopMinM: headMin,
    headTopMaxM: headMax,
    reasons: check.reasons,
    verdict: check.verdict,
    frameDetail: contact.frameDetail,
  };
}

function authorityProof(asset: CharacterAsset): AuthorityProof {
  const authority = probeAuthority();
  const expectedBits = characterPositionBits(authority.positionM);
  const clips: AuthorityClipProof[] = [];
  let allIdentical = true;
  for (const clipId of CHARACTER_CLIP_IDS) {
    const spec = characterClipSpec(clipId);
    const extraTicks = spec.loop ? [spec.frames, spec.frames * 7 + 13, spec.frames * 1001] : [];
    const ticks = [...Array.from({ length: spec.frames }, (_, index) => index), ...extraTicks];
    let mismatched = 0;
    for (const tick of ticks) {
      const pose = sampleCharacterPose(asset.skeleton, clipId, tick);
      const frame = applyCharacterPose(authority, pose);
      if (characterPositionBits(frame.positionM) !== expectedBits) mismatched += 1;
      if (frame.positionM.x !== authority.positionM.x) mismatched += 1;
    }
    allIdentical = allIdentical && mismatched === 0;
    clips.push({
      clipId,
      framesSampled: ticks.length,
      extraTicks,
      identical: mismatched === 0,
      mismatchedFrames: mismatched,
    });
  }

  // Two different authorities must share the exact same joints: clips never read the position.
  const other = createCharacterAuthority({
    entityId: 'pedestrian-002',
    positionM: { x: -42.5, y: 3.25, z: 0.125 },
    yawRad: -1.75,
  });
  const pose = sampleCharacterPose(asset.skeleton, 'walk', 11);
  const first = applyCharacterPose(authority, pose);
  const second = applyCharacterPose(other, pose);
  const positionIndependentOfAuthority =
    JSON.stringify(first.joints) === JSON.stringify(second.joints) &&
    characterPositionBits(first.positionM) !== characterPositionBits(second.positionM);

  const refusals: AuthorityProof['refusals'][number][] = [];
  const record = (label: string, action: () => void) => {
    const before = characterPositionBits(authority.positionM);
    try {
      action();
      refusals.push({
        case: label,
        refused: false,
        code: null,
        positionBitsUnchanged: characterPositionBits(authority.positionM) === before,
        message: 'accepted (contract violation)',
      });
    } catch (error) {
      const contractError = error as CharacterContractError;
      refusals.push({
        case: label,
        refused: true,
        code: contractError.code ?? null,
        positionBitsUnchanged: characterPositionBits(authority.positionM) === before,
        message: contractError.message,
      });
    }
  };
  const writer = createCharacterPoseWriter(authority);
  record('writer.writeEntityPositionM', () => writer.writeEntityPositionM({ x: 0, y: 0, z: 0 }));
  record('writer.writeRootMotionM', () => writer.writeRootMotionM({ x: 1, y: 0, z: 0 }));
  const poseWithPosition = { ...pose, positionM: { x: 0, y: 0, z: 0 } };
  record('applyCharacterPose cu positionM', () =>
    applyCharacterPose(authority, poseWithPosition as typeof pose),
  );
  const rootMotionPose = {
    ...pose,
    joints: pose.joints.map((transform) =>
      transform.joint === 'pelvis'
        ? { ...transform, offsetM: { x: 0.5, y: transform.offsetM.y, z: 0 } }
        : transform,
    ),
  };
  record('applyCharacterPose cu root motion pe X', () =>
    applyCharacterPose(authority, rootMotionPose as typeof pose),
  );
  const transformedPose = { ...pose, transform: { positionM: { x: 0, y: 0, z: 0 } } };
  record('applyCharacterPose cu transform străin', () =>
    applyCharacterPose(authority, transformedPose as typeof pose),
  );

  return {
    entityId: authority.entityId,
    positionBits: expectedBits,
    yawRad: authority.yawRad,
    clips,
    positionIndependentOfAuthority,
    refusals,
  };
}

function refusalReport(
  label: string,
  asset: CharacterAsset,
  reference: CharacterWorldReference,
): RefusalReport {
  const compatibility = checkCharacterCompatibility(asset, reference);
  let message = 'accepted';
  try {
    requireCharacterCompatibility(asset, reference);
  } catch (error) {
    message = (error as CharacterContractError).message;
  }
  return {
    case: label,
    refused: !compatibility.accepted,
    reasons: compatibility.refusals,
    message,
    detail: compatibility.checks,
  };
}

function visualReport(asset: CharacterAsset): VisualReport {
  const lods = CHARACTER_VISUAL_LODS.map((lod) => {
    const description = buildCharacterVisual(asset, lod);
    return {
      lod,
      parts: description.parts.length,
      vertices: description.vertices,
      indices: description.indices,
      gpuBytes: description.gpuBytes,
      drawCalls: description.drawCalls,
      materialGroups: description.materials.map((material) => material.group),
    };
  });
  const inventory = characterAssetInventory(asset);
  const budget = characterAssetBudget(asset, 'MEDIUM');
  admitCharacterAssets(asset, 'MEDIUM');
  return {
    lods,
    alignmentIssues: characterVisualAlignment(asset),
    inventoryEntries: inventory.length,
    inventoryBytes: inventory.reduce((total, entry) => total + entry.costBytes, 0),
    budgetAccepted: budget.accepted,
    budgetDiagnostics: budget.diagnostics.length,
  };
}

function buildReport(): Omit<CharacterReport, 'determinism'> {
  const reference = realWorldReference();
  const asset = createCharacterAsset();
  const compatibility = checkCharacterCompatibility(asset, reference);
  requireCharacterCompatibility(asset, reference);
  const clips = CHARACTER_CLIP_IDS.map((clipId) => clipReport(asset, clipId));
  const authority = authorityProof(asset);
  const refusals = [
    refusalReport(
      'Asset supradimensionat (×1.45, 2.58 m)',
      createCharacterAsset({ id: 'oversized-probe', scale: 1.45 }),
      reference,
    ),
    refusalReport('Trotuar îngust de 0.90 m', asset, {
      ...reference,
      sidewalkWidthM: 0.9,
    } as CharacterWorldReference),
    refusalReport(
      'Declarație mincinoasă de scară (înălțime 2.40 m)',
      createCharacterAsset({ id: 'lying-declaration-probe', declared: { heightM: 2.4 } }),
      reference,
    ),
  ];
  const visual = visualReport(asset);
  const compatibilityPassed = compatibility.checks.filter((entry) => entry.pass).length;
  const clipsPassed = clips.filter((clip) => clip.verdict === 'PASS').length;
  const authorityFrames = authority.clips.reduce((total, clip) => total + clip.framesSampled, 0);
  const pass =
    compatibility.accepted &&
    compatibilityPassed === compatibility.checks.length &&
    clipsPassed === clips.length &&
    authority.clips.every((clip) => clip.identical) &&
    authority.positionIndependentOfAuthority &&
    authority.refusals.every((entry) => entry.refused && entry.positionBitsUnchanged) &&
    refusals.every((entry) => entry.refused) &&
    visual.alignmentIssues.length === 0 &&
    visual.budgetAccepted;
  return {
    generatedBy: 'scripts/run-v3-character-report.mjs',
    command: CHARACTER_COMMAND,
    contract: CHARACTER_CONTRACT,
    samplingHz: CHARACTER_SAMPLING_HZ,
    reference,
    asset: {
      id: asset.id,
      version: asset.version,
      scale: asset.scale,
      declared: asset.declared,
      measured: asset.measured,
      scaleTable: characterScaleTable(asset),
    },
    compatibility,
    clips,
    authority,
    refusals,
    visual,
    summary: {
      compatibilityPassed,
      compatibilityChecks: compatibility.checks.length,
      clipsPassed,
      clips: clips.length,
      authorityFrames,
      refusedCases: refusals.filter((entry) => entry.refused).length,
      refusedCasesTotal: refusals.length,
      visualIssues: visual.alignmentIssues.length,
      pass,
    },
    limitations: [
      'Verificarea este headless: contractul de asset, animațiile și contactul cu solul sunt dovedite numeric, fără browser. Proba vizuală WebGPU/WebGL2 rămâne pentru integrarea personajului în 192.',
      'Reprezentarea este un contract de cutii pe pivoturi, nu un skin/GLB final; înlocuirea mesh-urilor nu schimbă contractul.',
      'Viteza nominală a clipurilor este derivată din pas și faza de sprijin; deplasarea autoritară, coliziunile și camera personajului aparțin PBI 192.',
      `Toleranța de contact este ${CHARACTER_GROUND_CONTACT_TOLERANCE_M} m; ea acoperă eroarea numerică a solverului, nu o alegere vizuală.`,
    ],
  };
}

/** Stable SHA-256 over the report payload, excluding the digest field itself. */
export function characterReportDigest(report: Omit<CharacterReport, 'determinism'>): string {
  const payload = {
    generatedBy: report.generatedBy,
    command: report.command,
    contract: report.contract,
    samplingHz: report.samplingHz,
    reference: report.reference,
    asset: report.asset,
    compatibility: report.compatibility,
    clips: report.clips,
    authority: report.authority,
    refusals: report.refusals,
    visual: report.visual,
    summary: report.summary,
    limitations: report.limitations,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function runCharacterReport(): CharacterReport {
  const first = buildReport();
  const second = buildReport();
  const identical = JSON.stringify(first) === JSON.stringify(second);
  return { ...first, determinism: { runs: 2, identical, digest: characterReportDigest(first) } };
}
