import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkDocsSync } from '../../scripts/check-docs-sync.mjs';

/**
 * PBI 259: the docs-sync guard must fail on every divergence it owns, not only on the happy path.
 * Each test builds a minimal but complete board/documentation fixture in a temporary directory, then
 * mutates exactly one file and asserts the reported file and field. The last test runs the real CLI
 * with `--check` and proves the tree is untouched in both the passing and the failing case.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = join(projectRoot, 'scripts', 'check-docs-sync.mjs');

function taskFile(id: string, title: string, status: string, dependencies: string[]): string {
  return `---
id: "${id}"
title: "${title}"
status: "${status}"
release: "V1"
module: "Documentație"
depends_on: ${JSON.stringify(dependencies)}
owner: null
started_at: null
completed_at: null
---

# ${id} ${title}
`;
}

function fixtureFiles(): Record<string, string> {
  const progressRow = (module: string, phases: string, todo: number, done: number, total: number) =>
    `| ${module} | ${phases} | ${todo} | 0 | ${done} / ${total} | \`${'░'.repeat(10)}\` ${total === 0 ? 0 : Math.min(99, Math.round((done / total) * 100))}% |`;
  return {
    'PBI/BOARD.json': JSON.stringify(
      {
        schema: 'sda-pbi-board-reset-v1',
        firstId: '259',
        retiredThrough: '258',
      },
      null,
      2,
    ),
    'README.md': [
      '# Fixture',
      '',
      'Boardul curent are 2 task-uri, 259–260. Taskurile 001–258 sunt istorice.',
      '',
      '- [Documentația](Docs/README.md): 3 de documente.',
      '',
    ].join('\n'),
    'AGENTS.md': '# Agents\n',
    'PBI/AGENTS.md': '# PBI agents\n',
    'PBI/README.md': [
      '<!-- loop-pbi:progress:start -->',
      '| Module | Remaining phases | To Do | In Progress | Done / Total | Progress |',
      '|---|---|---:|---:|---:|---|',
      progressRow('Documentație', 'V1', 2, 0, 2),
      progressRow('Total', '-', 2, 0, 2),
      '<!-- loop-pbi:progress:end -->',
      '',
      '# Backlog fixture',
      '',
      'Boardul curent conține **2 taskuri**, de la **259**. Taskurile 001–258 au fost retrase.',
      '',
      '## Etape',
      '',
      '| Etapă | IDs | Număr | Livrabil |',
      '| --- | --- | --- | --- |',
      '| V1 | 259–260 | 2 | Tot |',
      '| V2 | — | 0 | — |',
      '| V3 | — | 0 | — |',
      '| V4 | — | 0 | — |',
      '',
      '## Index',
      '',
      '| ID | Titlu | Modul | Etapă | Dependențe |',
      '| --- | --- | --- | --- | --- |',
      '| 259 | Alpha task | Documentație | V1 | — |',
      '| 260 | Beta task | Documentație | V1 | 259 |',
      '',
    ].join('\n'),
    'PBI/To Do/.gitkeep': '',
    'PBI/In Progress/.gitkeep': '',
    'PBI/Done/.gitkeep': '',
    'PBI/To Do/259-alpha.md': taskFile('259', 'Alpha task', 'To Do', []),
    'PBI/To Do/260-beta.md': taskFile('260', 'Beta task', 'To Do', ['259']),
    'Docs/README.md': [
      '# Documentația fixture',
      '',
      'Boardul curent are **2 de taskuri**, de la **259** la **260**. Taskurile 001–258 sunt istorice.',
      '',
      '| Document | Conținut |',
      '| --- | --- |',
      '| [01-produs](01-produs.md) | Produs |',
      '| [21-acoperire](21-acoperire-functionalitati.md) | Acoperire |',
      '| [31-stare](31-stare-implementare-si-lacune.md) | Stare |',
      '',
    ].join('\n'),
    'Docs/01-produs.md': '# Produs\n',
    'Docs/21-acoperire-functionalitati.md': [
      '# Acoperire',
      '',
      'ID-urile 001–258 sunt istorice, iar taskurile curente încep la 259.',
      '',
      '| Domeniu | Ce lipsește | PBI | Documentație |',
      '| --- | --- | --- | --- |',
      '| Documentație | Alpha gap. | 259 | [Produs](01-produs.md) |',
      '| Documentație | Beta gap. | 260 | [Produs](01-produs.md) |',
      '',
    ].join('\n'),
    'Docs/31-stare-implementare-si-lacune.md': [
      '# Stare',
      '',
      'Boardul curent începe la 259; ID-urile 001–258 sunt istorice și nu se reutilizează.',
      '',
      '## Matricea lacunelor',
      '',
      '| PBI | Titlu | Etapă | Dependențe |',
      '| --- | --- | --- | --- |',
      '| 259 | Alpha task | V1 | — |',
      '| 260 | Beta task | V1 | 259 |',
      '',
      '## Detalii pe task',
      '',
      '### 259 — Alpha task',
      '',
      '**Ce lipsește:** Alpha gap.',
      '',
      '**Documentație:** [Produs](01-produs.md)',
      '',
      '**PBI:** [259](../PBI/README.md) · **Dependențe:** niciuna.',
      '',
      '### 260 — Beta task',
      '',
      '**Ce lipsește:** Beta gap.',
      '',
      '**Documentație:** [Produs](01-produs.md)',
      '',
      '**PBI:** [260](../PBI/README.md) · **Dependențe:** 259.',
      '',
    ].join('\n'),
  };
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'sda-docs-sync-'));
  for (const [file, content] of Object.entries(fixtureFiles())) {
    const absolute = join(root, file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
  }
  return root;
}

function withFixture(action: (root: string) => void): void {
  const root = createFixture();
  try {
    action(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function replaceInFile(root: string, file: string, from: string, to: string): void {
  const absolute = join(root, file);
  const text = readFileSync(absolute, 'utf8');
  assert.ok(text.includes(from), `fixture is missing "${from}" in ${file}`);
  writeFileSync(absolute, text.replace(from, to), 'utf8');
}

function messages(root: string): string {
  return checkDocsSync({ root }).errors.join('\n');
}

function assertDivergence(root: string, file: string, field: string): void {
  const output = messages(root);
  assert.match(
    output,
    new RegExp(`${file.replaceAll('.', '\\.')}: ${field.replaceAll('.', '\\.')}`),
  );
}

function snapshotTree(root: string): string {
  const entries: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const contents = readFileSync(absolute);
      entries.push(
        `${relative(root, absolute).replaceAll('\\', '/')}:${statSync(absolute).size}:${createHash('sha256').update(contents).digest('hex')}`,
      );
    }
  };
  walk(root);
  return entries.sort().join('\n');
}

test('259 the real board and its state documents are synchronized', () => {
  const result = checkDocsSync({ root: projectRoot });
  assert.deepEqual(result.errors, []);
  assert.ok(result.summary.taskCount > 0);
  assert.equal(result.summary.firstId, 259);
  assert.equal(result.summary.indexRows, result.summary.taskCount);
  assert.equal(result.summary.matrixRows, result.summary.taskCount);
  assert.equal(result.summary.gapRows, result.summary.taskCount);
  assert.ok(result.summary.checkedLocalLinks > 0);
});

test('259 a complete fixture passes without errors', () => {
  withFixture((root) => {
    const result = checkDocsSync({ root });
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.taskCount, 2);
    assert.equal(result.summary.moduleCount, 3);
  });
});

test('259 a changed index title fails with the file and field', () => {
  withFixture((root) => {
    replaceInFile(root, 'PBI/README.md', '| 259 | Alpha task |', '| 259 | Alpha renamed |');
    const output = messages(root);
    assert.match(output, /PBI\/README\.md: index\.259\.title: expected "Alpha task"/);
    assert.match(output, /found "Alpha renamed"/);
    assert.doesNotMatch(output, /Docs\/21-acoperire-functionalitati\.md: row\.259\.gap/);
  });
});

test('259 a moved task without a progress update fails', () => {
  withFixture((root) => {
    renameSync(join(root, 'PBI/To Do/259-alpha.md'), join(root, 'PBI/In Progress/259-alpha.md'));
    replaceInFile(root, 'PBI/In Progress/259-alpha.md', 'status: "To Do"', 'status: "In Progress"');
    assertDivergence(root, 'PBI/README.md', 'progress.Documentație.inProgress');
    assertDivergence(root, 'PBI/README.md', 'progress.Total.inProgress');
  });
});

test('259 loop-pbi transition may validate its one pending move before the overview refresh', () => {
  withFixture((root) => {
    renameSync(join(root, 'PBI/To Do/259-alpha.md'), join(root, 'PBI/In Progress/259-alpha.md'));
    replaceInFile(root, 'PBI/In Progress/259-alpha.md', 'status: "To Do"', 'status: "In Progress"');
    assert.deepEqual(checkDocsSync({ root, pendingTaskId: '259' }).errors, []);
    assert.notDeepEqual(checkDocsSync({ root, pendingTaskId: '260' }).errors, []);
  });
});

test('259 a new task without index, coverage and gap rows fails', () => {
  withFixture((root) => {
    writeFileSync(
      join(root, 'PBI/To Do/261-gamma.md'),
      taskFile('261', 'Gamma task', 'To Do', ['260']),
      'utf8',
    );
    assertDivergence(root, 'PBI/README.md', 'index.261');
    assertDivergence(root, 'Docs/21-acoperire-functionalitati.md', 'row.261');
    assertDivergence(root, 'Docs/31-stare-implementare-si-lacune.md', 'matrix.261');
    assertDivergence(root, 'Docs/31-stare-implementare-si-lacune.md', 'detail.261');
  });
});

test('259 a stage count and a coverage gap that diverge are named', () => {
  withFixture((root) => {
    replaceInFile(root, 'PBI/README.md', '| V1 | 259–260 | 2 |', '| V1 | 259–260 | 3 |');
    replaceInFile(
      root,
      'Docs/21-acoperire-functionalitati.md',
      '| Documentație | Alpha gap. | 259 |',
      '| Documentație | Alpha old gap. | 259 |',
    );
    assertDivergence(root, 'PBI/README.md', 'stage.V1.count');
    assertDivergence(root, 'Docs/21-acoperire-functionalitati.md', 'row.259.gap');
  });
});

test('259 a gap matrix title and a root task count that diverge are named', () => {
  withFixture((root) => {
    replaceInFile(
      root,
      'Docs/31-stare-implementare-si-lacune.md',
      '| 259 | Alpha task | V1 |',
      '| 259 | Alpha old task | V1 |',
    );
    replaceInFile(root, 'README.md', '2 task-uri', '3 task-uri');
    assertDivergence(root, 'Docs/31-stare-implementare-si-lacune.md', 'matrix.259.title');
    assertDivergence(root, 'README.md', 'task count');
  });
});

test('259 a retired ID in the index and a broken local link are rejected', () => {
  withFixture((root) => {
    replaceInFile(
      root,
      'PBI/README.md',
      '| 260 | Beta task | Documentație | V1 | 259 |',
      '| 260 | Beta task | Documentație | V1 | 259 |\n| 258 | Old task | Documentație | V1 | — |',
    );
    writeFileSync(
      join(root, 'README.md'),
      `${readFileSync(join(root, 'README.md'), 'utf8')}\n[broken](missing.md)\n`,
    );
    assertDivergence(root, 'PBI/README.md', 'index.258');
    assert.match(messages(root), /README\.md: link: local target "missing\.md"/);
  });
});

test('259 --check exits 0 on a valid tree and 1 on a divergence without writing', () => {
  withFixture((root) => {
    const validSnapshot = snapshotTree(root);
    const valid = spawnSync(process.execPath, [guardScript, '--check', '--root', root], {
      encoding: 'utf8',
    });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /docs-sync: PASS/);
    assert.equal(snapshotTree(root), validSnapshot);

    replaceInFile(root, 'PBI/README.md', '| 259 | Alpha task |', '| 259 | Alpha renamed |');
    const invalidSnapshot = snapshotTree(root);
    const invalid = spawnSync(process.execPath, [guardScript, '--check', '--root', root], {
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /PBI\/README\.md: index\.259\.title/);
    assert.equal(snapshotTree(root), invalidSnapshot);
  });
});
