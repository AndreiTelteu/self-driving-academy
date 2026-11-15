import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Poarta de execuție a artefactului de release V3 (PBI 202).
 *
 * Testul nu rescrie nimic: rulează generatorul cu `--check` și verifică invariantele care fac
 * artefactul onest — 11/11 dependențe, nivel de livrare derivat, controale reale, verdictul de
 * release care nu poate fi `PASS` cu rânduri deschise și documentația fără promisiunea de XP.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));

const readText = (path: string): string => readFileSync(join(root, path), 'utf8');
const readJson = <T>(path: string): T => JSON.parse(readText(path)) as T;

interface ChecklistRow {
  readonly id: string;
  readonly verdict: 'PASS' | 'FAIL' | 'NOT_RUN' | 'PENDING';
  readonly owner: string | null;
}

interface Checklist {
  readonly verdict: 'PASS' | 'NOT_VALIDATED';
  readonly ready: boolean;
  readonly dependencies: readonly { readonly id: string; readonly verdict: string }[];
  readonly rows: readonly ChecklistRow[];
  readonly summary: {
    readonly pass: number;
    readonly fail: number;
    readonly notRun: number;
    readonly open: number;
    readonly release: 'PASS' | 'NOT_VALIDATED';
    readonly ready: boolean;
  };
}

interface Capabilities {
  readonly composition: { readonly verdict: string };
  readonly capabilities: readonly { readonly level: string }[];
  readonly notDelivered: readonly {
    readonly id: string;
    readonly state: string;
    readonly owner: string;
  }[];
  readonly verdict: 'PASS' | 'FAIL';
}

interface Controls {
  readonly keyboard: readonly {
    readonly action: string;
    readonly state: 'CONSUMED' | 'DECLARED_ONLY';
    readonly remappable: boolean;
  }[];
  readonly pointer: readonly { readonly id: string; readonly state: string }[];
  readonly verdict: 'PASS' | 'FAIL';
}

test('release:v3 regenerates byte-identical artifacts', () => {
  execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/register-typescript.mjs',
      'scripts/run-v3-release-artifact.mjs',
      '--check',
    ],
    { cwd: root, encoding: 'utf8' },
  );
});

test('all eleven V3 dependencies are proven from disk', () => {
  const checklist = readJson<Checklist>('Docs/Evidence/202-v3-release/release-checklist.json');
  assert.equal(checklist.dependencies.length, 11);
  assert.deepEqual(
    checklist.dependencies.map((entry) => entry.id),
    ['191', '192', '193', '194', '195', '196', '197', '198', '199', '200', '201'],
  );
  for (const dependency of checklist.dependencies) {
    assert.equal(dependency.verdict, 'PASS', `dependency ${dependency.id} is not proven`);
  }
});

test('capability level is derived from the real composition, not claimed', () => {
  const artifact = readJson<Capabilities>('Docs/Evidence/202-v3-release/capabilities.json');
  assert.equal(artifact.verdict, 'PASS');
  assert.equal(artifact.composition.verdict, 'NOT_COMPOSED');
  assert.equal(artifact.capabilities.length, 12);
  assert.ok(artifact.capabilities.every((entry) => entry.level === 'HEADLESS_CONTRACT'));
});

test('what is not delivered is declared with an owner', () => {
  const artifact = readJson<Capabilities>('Docs/Evidence/202-v3-release/capabilities.json');
  const ids = artifact.notDelivered.map((entry) => entry.id);
  assert.ok(ids.includes('extended-keys-reserved'));
  assert.ok(ids.includes('walking-time-xp'));
  assert.ok(ids.includes('visual-streaming'));
  assert.ok(ids.includes('hardware-fps'));
  assert.ok(ids.includes('in-game-composition'));
  for (const entry of artifact.notDelivered) {
    assert.ok(entry.owner.length > 0, `not-delivered row ${entry.id} has no owner`);
  }
  const walkingXp = artifact.notDelivered.find((entry) => entry.id === 'walking-time-xp');
  assert.equal(walkingXp?.state, 'NOT_IMPLEMENTED');
});

test('controls are real bindings with real consumers', () => {
  const controls = readJson<Controls>('Docs/Evidence/202-v3-release/controls.json');
  assert.equal(controls.verdict, 'PASS');
  assert.equal(controls.keyboard.length, 15);
  assert.equal(controls.keyboard.filter((entry) => entry.state === 'CONSUMED').length, 10);
  assert.equal(controls.keyboard.filter((entry) => entry.state === 'DECLARED_ONLY').length, 5);
  assert.ok(controls.keyboard.every((entry) => entry.remappable));
  assert.equal(
    controls.keyboard.some((entry) => entry.action === 'sprint'),
    false,
    'sprint has no 009 binding and must not appear as a keyboard action',
  );
  const orbit = controls.pointer.find((entry) => entry.id === 'character-orbit-mouse');
  assert.equal(orbit?.state, 'NOT_AVAILABLE');
});

test('release verdict cannot be PASS while rows are open', () => {
  const checklist = readJson<Checklist>('Docs/Evidence/202-v3-release/release-checklist.json');
  const open = checklist.rows.filter((entry) => entry.verdict !== 'PASS');
  assert.equal(checklist.summary.open, open.length);
  assert.ok(open.length > 0, 'inherited FAIL/NOT_RUN rows must stay visible');
  for (const entry of open) {
    assert.ok(entry.owner !== null && entry.owner.length > 0, `open row ${entry.id} has no owner`);
  }
  assert.equal(checklist.verdict, open.length === 0 ? 'PASS' : 'NOT_VALIDATED');
  assert.equal(checklist.verdict, 'NOT_VALIDATED');
  assert.equal(checklist.ready, false);
  assert.equal(
    checklist.summary.pass + checklist.summary.fail + checklist.summary.notRun,
    checklist.rows.length,
  );
});

test('Docs/20 publishes the release section without the walking-XP promise', () => {
  const doc = readText('Docs/20-extensii-si-mers-pe-jos.md');
  assert.ok(doc.includes('<!-- release:v3:begin -->'));
  assert.ok(doc.includes('<!-- release:v3:end -->'));
  assert.ok(doc.includes('Evidence/202-v3-release/release-checklist.md'));
  assert.equal(doc.includes('Mersul activ poate contribui la XP de timp'), false);
  assert.ok(doc.includes('walkingTimeXp = NOT_IMPLEMENTED'));
});
