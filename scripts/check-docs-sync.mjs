#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PBI 259: documentation/board synchronization guard.
 *
 * The authoritative validators stay PBI/Validate-Board.ps1 (physical board, metadata, dependencies)
 * and PBI/Validate-Plan.ps1 (index, matrix, counts, catalog, local links). This script does not
 * replace them; it fails when the human-facing state documents drift from the board they describe:
 * PBI/README, Docs/21, Docs/31, root README and Docs/README.
 *
 * The script is read-only in every mode. `--check` is the CI form used by `npm run check` and by the
 * loop-pbi validate configuration; a divergence is reported as `file: field: detail` with exit 1.
 */

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COLUMNS = [
  { directory: 'To Do', status: 'To Do' },
  { directory: 'In Progress', status: 'In Progress' },
  { directory: 'Done', status: 'Done' },
];
const STAGES = ['V1', 'V2', 'V3', 'V4'];
const REQUIRED_FILES = [
  'README.md',
  'AGENTS.md',
  'Docs/README.md',
  'Docs/21-acoperire-functionalitati.md',
  'Docs/31-stare-implementare-si-lacune.md',
  'PBI/README.md',
  'PBI/AGENTS.md',
];
const INDEX_FILE = 'PBI/README.md';
const COVERAGE_FILE = 'Docs/21-acoperire-functionalitati.md';
const GAPS_FILE = 'Docs/31-stare-implementare-si-lacune.md';
const ROOT_README = 'README.md';
const DOCS_README = 'Docs/README.md';

function error(file, field, detail) {
  return `${file}: ${field}: ${detail}`;
}

function readText(root, file, errors) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) {
    errors.push(error(file, 'file', 'missing'));
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

function normalizeDashes(text) {
  return text.replaceAll('\u2013', '-').replaceAll('\u2014', '-');
}

function normalizeSpace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function readField(header, field) {
  const match = new RegExp(`^${field}: (.+)$`, 'm').exec(header);
  return match ? parseScalar(match[1]) : null;
}

function readDependencies(header, file, errors) {
  const match = /^depends_on: (\[.*\])$/m.exec(header);
  if (!match) {
    errors.push(error(file, 'depends_on', 'missing or not a JSON array'));
    return null;
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
      errors.push(error(file, 'depends_on', 'must be an array of ID strings'));
      return null;
    }
    return parsed;
  } catch {
    errors.push(error(file, 'depends_on', 'invalid JSON array'));
    return null;
  }
}

function listMarkdown(root, directory, skip = []) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const normalized = relative(root, absolute).replaceAll('\\', '/');
    if (skip.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
      continue;
    }
    if (entry.isDirectory()) result.push(...listMarkdown(root, absolute, skip));
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(absolute);
  }
  return result;
}

function collectLinks(root, model) {
  const files = [
    join(root, 'README.md'),
    join(root, 'AGENTS.md'),
    ...listMarkdown(root, join(root, 'Docs'), ['Docs/Evidence', 'Docs/Archive']),
    ...listMarkdown(root, join(root, 'PBI')),
  ];
  const filesWithText = new Set(model.texts.keys());
  let checked = 0;
  for (const absolute of files) {
    const file = relative(root, absolute).replaceAll('\\', '/');
    let text = filesWithText.has(file) ? model.texts.get(file) : undefined;
    if (text === undefined) {
      if (!existsSync(absolute)) {
        model.errors.push(error(file, 'file', 'missing'));
        continue;
      }
      text = readFileSync(absolute, 'utf8');
      model.texts.set(file, text);
    }
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      let target = match[1].trim();
      if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
      target = target.split(/\s+"/)[0];
      if (/^(https?:|mailto:|tel:|#|app:|codex:|\/\/)/i.test(target)) continue;
      target = target.split('#')[0];
      if (!target) continue;
      try {
        target = decodeURI(target);
      } catch {
        // Keep the raw target; the existence check below reports it precisely.
      }
      checked += 1;
      if (!existsSync(resolve(dirname(absolute), target))) {
        model.errors.push(
          error(file, 'link', `local target "${target}" does not resolve (expected from ${file})`),
        );
      }
    }
  }
  return checked;
}

function loadBoard(root, model) {
  const configFile = 'PBI/BOARD.json';
  const configPath = join(root, configFile);
  if (!existsSync(configPath)) {
    model.errors.push(error(configFile, 'file', 'missing'));
    model.firstId = null;
    model.retiredThrough = null;
  } else {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      model.firstId = Number(config.firstId);
      model.retiredThrough = Number(config.retiredThrough);
      if (!Number.isInteger(model.firstId)) {
        model.errors.push(error(configFile, 'firstId', 'must be an integer'));
        model.firstId = null;
      }
      if (!Number.isInteger(model.retiredThrough)) {
        model.errors.push(error(configFile, 'retiredThrough', 'must be an integer'));
        model.retiredThrough = null;
      }
      if (
        model.firstId !== null &&
        model.retiredThrough !== null &&
        model.firstId <= model.retiredThrough
      ) {
        model.errors.push(
          error(
            configFile,
            'firstId',
            `must be greater than retiredThrough (${model.firstId} <= ${model.retiredThrough})`,
          ),
        );
      }
    } catch (cause) {
      model.errors.push(error(configFile, 'json', `invalid JSON: ${String(cause)}`));
      model.firstId = null;
      model.retiredThrough = null;
    }
  }

  const byId = new Map();
  for (const column of COLUMNS) {
    const directory = join(root, 'PBI', column.directory);
    if (!existsSync(directory)) {
      model.errors.push(error(`PBI/${column.directory}`, 'directory', 'missing'));
      continue;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const file = `PBI/${column.directory}/${entry.name}`;
      const text = readFileSync(join(directory, entry.name), 'utf8');
      model.texts.set(file, text);
      const headerMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      if (!headerMatch) {
        model.errors.push(error(file, 'frontmatter', 'missing'));
        continue;
      }
      const header = headerMatch[1].replaceAll('\r', '');
      const id = readField(header, 'id');
      const title = readField(header, 'title');
      const module = readField(header, 'module');
      const release = readField(header, 'release');
      const status = readField(header, 'status');
      const dependencies = readDependencies(header, file, model.errors);
      if (!/^\d{3,}$/.test(id ?? '')) {
        model.errors.push(error(file, 'id', 'missing or not a three-digit string'));
        continue;
      }
      if (!entry.name.startsWith(`${id}-`)) {
        model.errors.push(error(file, 'file name', `must start with "${id}-"`));
      }
      if (status !== column.status) {
        model.errors.push(
          error(file, 'status', `is "${status}" but the file is in PBI/${column.directory}`),
        );
      }
      if (!STAGES.includes(release ?? '')) {
        model.errors.push(error(file, 'release', `must be one of ${STAGES.join(', ')}`));
      }
      if (!title) model.errors.push(error(file, 'title', 'missing'));
      if (!module) model.errors.push(error(file, 'module', 'missing'));
      if (dependencies === null) continue;
      if (byId.has(id)) {
        model.errors.push(error(file, 'id', `duplicate board ID ${id}`));
        continue;
      }
      if (model.firstId !== null && Number(id) < model.firstId) {
        model.errors.push(
          error(file, 'id', `retired ID ${id}; the current board starts at ${model.firstId}`),
        );
      }
      byId.set(id, {
        id,
        title: title ?? '',
        module: module ?? '',
        release: release ?? '',
        dependencies,
        status: status ?? '',
        column: column.directory,
        file,
      });
    }
  }

  const tasks = [...byId.values()].sort((left, right) => Number(left.id) - Number(right.id));
  if (tasks.length === 0) {
    model.errors.push(error('PBI', 'board', 'no task files found'));
  }
  if (model.firstId !== null) {
    tasks.forEach((task, index) => {
      const expected = String(model.firstId + index);
      if (task.id !== expected) {
        model.errors.push(
          error(
            task.file,
            'id',
            `board numbering is not continuous: expected ${expected}, found ${task.id}`,
          ),
        );
      }
    });
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!byId.has(dependency)) {
        model.errors.push(
          error(task.file, 'depends_on', `dependency ${dependency} has no board file`),
        );
      } else if (model.firstId !== null && Number(dependency) < model.firstId) {
        model.errors.push(
          error(
            task.file,
            'depends_on',
            `retired dependency ${dependency} (board starts at ${model.firstId})`,
          ),
        );
      }
    }
  }
  model.tasks = tasks;
}

function parseDependencyCell(cell) {
  const value = cell.trim();
  if (!/\d/.test(value)) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function columnCounts(tasks) {
  const counts = { 'To Do': 0, 'In Progress': 0, Done: 0 };
  for (const task of tasks) counts[task.column] += 1;
  return counts;
}

function stageCounts(tasks) {
  const counts = {};
  for (const stage of STAGES) counts[stage] = tasks.filter((task) => task.release === stage).length;
  return counts;
}

function stageRanges(tasks) {
  const ranges = {};
  for (const stage of STAGES) {
    const ids = tasks
      .filter((task) => task.release === stage)
      .map((task) => Number(task.id))
      .sort((left, right) => left - right);
    if (ids.length === 0) {
      ranges[stage] = '\u2014';
    } else {
      const contiguous = ids.every((id, index) => index === 0 || id === ids[index - 1] + 1);
      ranges[stage] =
        ids.length === 1
          ? String(ids[0])
          : contiguous
            ? `${ids[0]}\u2013${ids[ids.length - 1]}`
            : ids.join(', ');
    }
  }
  return ranges;
}

function progressRows(text) {
  const start = text.indexOf('<!-- loop-pbi:progress:start -->');
  const end = text.indexOf('<!-- loop-pbi:progress:end -->');
  if (start < 0 || end < start) return null;
  return text
    .slice(start + '<!-- loop-pbi:progress:start -->'.length, end)
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 8 && cells[1] !== 'Module' && !cells[1].startsWith('---'));
}

function expectedPhaseLabel(group) {
  if (group.phases.size > 0) return [...group.phases].sort().join(', ');
  if (group.done > 0 && group.done === group.total) return 'Completed';
  return '-';
}

function expectedPercent(done, total) {
  if (total === 0) return 0;
  if (done === total) return 100;
  return Math.min(99, Math.round((done / total) * 100));
}

function progressErrors(indexText, tasks) {
  const rows = progressRows(indexText);
  const errors = [];
  if (rows === null) {
    errors.push(error(INDEX_FILE, 'progress block', 'missing loop-pbi:progress start/end markers'));
    return { rowCount: 0, errors };
  }
  const groups = new Map();
  for (const task of tasks) {
    const group = groups.get(task.module) ?? {
      todo: 0,
      progress: 0,
      done: 0,
      phases: new Set(),
    };
    if (task.column === 'To Do') group.todo += 1;
    else if (task.column === 'In Progress') group.progress += 1;
    else group.done += 1;
    if (task.column !== 'Done') group.phases.add(task.release);
    groups.set(task.module, group);
  }
  const seen = new Set();
  let total = null;
  for (const cells of rows) {
    const [, module, phaseLabel, todoRaw, progressRaw, doneTotalRaw, progressCell] = cells;
    if (module === 'Total') {
      total = { cells };
      continue;
    }
    const group = groups.get(module);
    if (!group) {
      errors.push(
        error(INDEX_FILE, `progress.${module}`, 'row for a module that has no board task'),
      );
      continue;
    }
    seen.add(module);
    const todo = Number(todoRaw);
    const progress = Number(progressRaw);
    const doneTotal = /^(\d+) \/ (\d+)$/.exec(doneTotalRaw);
    const done = doneTotal ? Number(doneTotal[1]) : NaN;
    const totalTasks = doneTotal ? Number(doneTotal[2]) : NaN;
    const expected = {
      todo: group.todo,
      progress: group.progress,
      done: group.done,
      total: group.todo + group.progress + group.done,
    };
    if (!Number.isInteger(todo) || todo !== expected.todo) {
      errors.push(
        error(
          INDEX_FILE,
          `progress.${module}.toDo`,
          `board has ${expected.todo}, progress row has ${todoRaw}`,
        ),
      );
    }
    if (!Number.isInteger(progress) || progress !== expected.progress) {
      errors.push(
        error(
          INDEX_FILE,
          `progress.${module}.inProgress`,
          `board has ${expected.progress}, progress row has ${progressRaw}`,
        ),
      );
    }
    if (!Number.isInteger(done) || done !== expected.done || totalTasks !== expected.total) {
      errors.push(
        error(
          INDEX_FILE,
          `progress.${module}.doneTotal`,
          `board has ${expected.done} / ${expected.total}, progress row has ${doneTotalRaw}`,
        ),
      );
    }
    if (phaseLabel !== expectedPhaseLabel(group)) {
      errors.push(
        error(
          INDEX_FILE,
          `progress.${module}.phases`,
          `board expects "${expectedPhaseLabel(group)}", progress row has "${phaseLabel}"`,
        ),
      );
    }
    const percentMatch = /(\d+)%$/.exec(progressCell);
    const percent = percentMatch ? Number(percentMatch[1]) : NaN;
    const expectedValue = expectedPercent(expected.done, expected.total);
    if (percent !== expectedValue) {
      errors.push(
        error(
          INDEX_FILE,
          `progress.${module}.percent`,
          `board expects ${expectedValue}%, progress row has ${percentMatch?.[1] ?? '?'}%`,
        ),
      );
    }
  }
  for (const module of groups.keys()) {
    if (!seen.has(module)) {
      errors.push(
        error(INDEX_FILE, `progress.${module}`, 'missing progress row for a board module'),
      );
    }
  }
  if (!total) {
    errors.push(error(INDEX_FILE, 'progress.Total', 'missing Total row'));
  } else {
    const [, , , todoRaw, progressRaw, doneTotalRaw] = total.cells;
    const counts = columnCounts(tasks);
    const taskTotal = tasks.length;
    if (Number(todoRaw) !== counts['To Do']) {
      errors.push(
        error(
          INDEX_FILE,
          'progress.Total.toDo',
          `board has ${counts['To Do']}, progress row has ${todoRaw}`,
        ),
      );
    }
    if (Number(progressRaw) !== counts['In Progress']) {
      errors.push(
        error(
          INDEX_FILE,
          'progress.Total.inProgress',
          `board has ${counts['In Progress']}, progress row has ${progressRaw}`,
        ),
      );
    }
    if (doneTotalRaw !== `${counts.Done} / ${taskTotal}`) {
      errors.push(
        error(
          INDEX_FILE,
          'progress.Total.doneTotal',
          `board has ${counts.Done} / ${taskTotal}, progress row has ${doneTotalRaw}`,
        ),
      );
    }
  }
  return { rowCount: rows.length, errors };
}

function verifyProgress(indexText, model, pendingTaskId) {
  const candidates = [model.tasks];
  const pending = pendingTaskId ? model.tasks.find((task) => task.id === pendingTaskId) : undefined;
  if (pending) {
    // loop-pbi runs project validators after the physical move but before it regenerates the
    // progress table. Accept the table for the pre-move or post-move column of exactly this task,
    // so `finish`/`claim` can pass while a genuinely stale table still fails the standalone check.
    for (const column of ['To Do', 'In Progress', 'Done']) {
      candidates.push(
        model.tasks.map((task) => (task.id === pendingTaskId ? { ...task, column } : task)),
      );
    }
  }
  let best = null;
  for (const tasks of candidates) {
    const result = progressErrors(indexText, tasks);
    if (result.errors.length === 0) return result.rowCount;
    if (!best || result.errors.length < best.errors.length) best = result;
  }
  model.errors.push(...best.errors);
  return best.rowCount;
}

function verifyStageTable(indexText, model) {
  const counts = stageCounts(model.tasks);
  const ranges = stageRanges(model.tasks);
  const rows = new Map();
  for (const match of indexText.matchAll(/^\| (V[1-4]) \| ([^|]+) \| (\d+) \|/gm)) {
    rows.set(match[1], { ids: match[2].trim(), count: Number(match[3]) });
  }
  for (const stage of STAGES) {
    const row = rows.get(stage);
    if (!row) {
      model.errors.push(error(INDEX_FILE, `stage.${stage}`, 'missing stage table row'));
      continue;
    }
    if (row.count !== counts[stage]) {
      model.errors.push(
        error(
          INDEX_FILE,
          `stage.${stage}.count`,
          `board has ${counts[stage]}, stage row has ${row.count}`,
        ),
      );
    }
    if (row.ids !== ranges[stage]) {
      model.errors.push(
        error(
          INDEX_FILE,
          `stage.${stage}.ids`,
          `board expects "${ranges[stage]}", stage row has "${row.ids}"`,
        ),
      );
    }
  }
}

function verifyIndex(indexText, model) {
  const rows = new Map();
  for (const match of indexText.matchAll(
    /^\| (\d{3,}) \| ([^|]+) \| ([^|]+) \| (V[1-4]) \| ([^|]+) \|$/gm,
  )) {
    const id = match[1];
    if (rows.has(id)) {
      model.errors.push(error(INDEX_FILE, `index.${id}`, 'duplicate index row'));
      continue;
    }
    rows.set(id, {
      title: match[2].trim(),
      module: match[3].trim(),
      release: match[4],
      dependencies: parseDependencyCell(match[5]),
    });
  }
  for (const task of model.tasks) {
    const row = rows.get(task.id);
    if (!row) {
      model.errors.push(error(INDEX_FILE, `index.${task.id}`, 'missing index row for board task'));
      continue;
    }
    if (row.title !== task.title) {
      model.errors.push(
        error(
          INDEX_FILE,
          `index.${task.id}.title`,
          `expected "${task.title}" from ${task.file}, found "${row.title}"`,
        ),
      );
    }
    if (row.module !== task.module) {
      model.errors.push(
        error(
          INDEX_FILE,
          `index.${task.id}.module`,
          `expected "${task.module}" from ${task.file}, found "${row.module}"`,
        ),
      );
    }
    if (row.release !== task.release) {
      model.errors.push(
        error(
          INDEX_FILE,
          `index.${task.id}.release`,
          `expected "${task.release}" from ${task.file}, found "${row.release}"`,
        ),
      );
    }
    const boardDependencies = task.dependencies.map(String);
    if (boardDependencies.join(',') !== row.dependencies.join(',')) {
      model.errors.push(
        error(
          INDEX_FILE,
          `index.${task.id}.dependencies`,
          `expected "${boardDependencies.join(', ') || '\u2014'}" from ${task.file}, found "${row.dependencies.join(', ') || '\u2014'}"`,
        ),
      );
    }
  }
  for (const id of rows.keys()) {
    if (!model.tasks.some((task) => task.id === id)) {
      model.errors.push(
        error(INDEX_FILE, `index.${id}`, `index row has no board task (retired or unknown ID)`),
      );
    }
  }
  if (rows.size !== model.tasks.length) {
    model.errors.push(
      error(
        INDEX_FILE,
        'index.count',
        `index has ${rows.size} rows, board has ${model.tasks.length} tasks`,
      ),
    );
  }
  return rows.size;
}

function extractSection(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const next = text.indexOf('\n## ', start + 1);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

function detailSections(text) {
  const section = extractSection(text, 'Detalii pe task');
  const matches = [...section.matchAll(/^### (\d{3,}) \u2014 (.+)$/gm)];
  const details = new Map();
  matches.forEach((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : section.length;
    const id = match[1];
    if (details.has(id)) return;
    details.set(id, { title: match[2].trim(), text: section.slice(start, end) });
  });
  return { details, headings: matches.map((match) => match[1]) };
}

function verifyCoverage(coverageText, gapsText, model) {
  const gaps = detailSections(gapsText);
  const rows = new Map();
  for (const match of coverageText.matchAll(
    /^\| ([^|]+) \| ([^|]+) \| (\d{3,}) \| ([^|]+) \|$/gm,
  )) {
    const id = match[3];
    if (rows.has(id)) {
      model.errors.push(error(COVERAGE_FILE, `row.${id}`, 'duplicate coverage row'));
      continue;
    }
    rows.set(id, { gap: match[2].trim(), documentation: match[4].trim() });
  }
  for (const task of model.tasks) {
    const row = rows.get(task.id);
    if (!row) {
      model.errors.push(
        error(COVERAGE_FILE, `row.${task.id}`, 'missing coverage row for board task'),
      );
      continue;
    }
    const detail = gaps.details.get(task.id);
    if (!detail) {
      model.errors.push(error(GAPS_FILE, `detail.${task.id}`, 'missing task detail section'));
      continue;
    }
    const gapText = /\*\*Ce lipse\u0219te:\*\* ([^\n]+)/.exec(detail.text)?.[1];
    if (!gapText) {
      model.errors.push(error(GAPS_FILE, `detail.${task.id}.gap`, 'missing "Ce lipsește" line'));
    } else if (normalizeSpace(gapText) !== normalizeSpace(row.gap)) {
      model.errors.push(
        error(
          COVERAGE_FILE,
          `row.${task.id}.gap`,
          `differs from ${GAPS_FILE}: expected "${normalizeSpace(gapText)}", found "${normalizeSpace(row.gap)}"`,
        ),
      );
    }
    const detailDocumentation = /\*\*Documenta\u021bie:\*\* ([^\n]+)/.exec(detail.text)?.[1] ?? '';
    const coverageLinks = [...row.documentation.matchAll(/\]\(([^)]+)\)/g)]
      .map((link) => link[1].trim())
      .sort();
    const detailLinks = [...detailDocumentation.matchAll(/\]\(([^)]+)\)/g)]
      .map((link) => link[1].trim())
      .sort();
    if (coverageLinks.join('|') !== detailLinks.join('|')) {
      model.errors.push(
        error(
          COVERAGE_FILE,
          `row.${task.id}.documentation`,
          `links differ from ${GAPS_FILE}: expected [${detailLinks.join(', ')}], found [${coverageLinks.join(', ')}]`,
        ),
      );
    }
  }
  for (const id of rows.keys()) {
    if (!model.tasks.some((task) => task.id === id)) {
      model.errors.push(
        error(COVERAGE_FILE, `row.${id}`, 'coverage row has no board task (retired or unknown ID)'),
      );
    }
  }
  if (rows.size !== model.tasks.length) {
    model.errors.push(
      error(
        COVERAGE_FILE,
        'matrix.count',
        `matrix has ${rows.size} rows, board has ${model.tasks.length} tasks`,
      ),
    );
  }
  return rows.size;
}

function verifyGaps(gapsText, model) {
  const matrix = new Map();
  for (const match of gapsText.matchAll(/^\| (\d{3,}) \| ([^|]+) \| (V[1-4]) \| ([^|]+) \|$/gm)) {
    const id = match[1];
    if (matrix.has(id)) {
      model.errors.push(error(GAPS_FILE, `matrix.${id}`, 'duplicate gap matrix row'));
      continue;
    }
    matrix.set(id, {
      title: match[2].trim(),
      release: match[3],
      dependencies: parseDependencyCell(match[4]),
    });
  }
  const { details, headings } = detailSections(gapsText);
  for (const task of model.tasks) {
    const row = matrix.get(task.id);
    if (!row) {
      model.errors.push(error(GAPS_FILE, `matrix.${task.id}`, 'missing gap matrix row'));
    } else {
      if (row.title !== task.title) {
        model.errors.push(
          error(
            GAPS_FILE,
            `matrix.${task.id}.title`,
            `expected "${task.title}" from ${task.file}, found "${row.title}"`,
          ),
        );
      }
      if (row.release !== task.release) {
        model.errors.push(
          error(
            GAPS_FILE,
            `matrix.${task.id}.release`,
            `expected "${task.release}" from ${task.file}, found "${row.release}"`,
          ),
        );
      }
      const boardDependencies = task.dependencies.map(String);
      if (boardDependencies.join(',') !== row.dependencies.join(',')) {
        model.errors.push(
          error(
            GAPS_FILE,
            `matrix.${task.id}.dependencies`,
            `expected "${boardDependencies.join(', ') || '\u2014'}", found "${row.dependencies.join(', ') || '\u2014'}"`,
          ),
        );
      }
    }
    const detail = details.get(task.id);
    if (!detail) {
      model.errors.push(error(GAPS_FILE, `detail.${task.id}`, 'missing task detail heading'));
      continue;
    }
    const expectedHeading = `### ${task.id} \u2014 ${task.title}`;
    if (!detail.text.startsWith(expectedHeading)) {
      model.errors.push(
        error(
          GAPS_FILE,
          `detail.${task.id}.title`,
          `expected heading "${expectedHeading}", found "### ${task.id} \u2014 ${detail.title}"`,
        ),
      );
    }
    const dependencyLine = /\*\*Dependen\u021be:\*\* ([^\n]+)/.exec(detail.text)?.[1];
    if (!dependencyLine) {
      model.errors.push(
        error(GAPS_FILE, `detail.${task.id}.dependencies`, 'missing "Dependențe" line'),
      );
    } else {
      const documented = parseDependencyCell(dependencyLine.replace(/\.\s*$/, ''));
      if (documented.join(',') !== task.dependencies.map(String).join(',')) {
        model.errors.push(
          error(
            GAPS_FILE,
            `detail.${task.id}.dependencies`,
            `expected "${task.dependencies.join(', ') || 'niciuna'}", found "${documented.join(', ') || 'niciuna'}"`,
          ),
        );
      }
    }
  }
  for (const id of matrix.keys()) {
    if (!model.tasks.some((task) => task.id === id)) {
      model.errors.push(
        error(
          GAPS_FILE,
          `matrix.${id}`,
          'gap matrix row has no board task (retired or unknown ID)',
        ),
      );
    }
  }
  if (matrix.size !== model.tasks.length) {
    model.errors.push(
      error(
        GAPS_FILE,
        'matrix.count',
        `gap matrix has ${matrix.size} rows, board has ${model.tasks.length} tasks`,
      ),
    );
  }
  for (const id of headings) {
    if (!model.tasks.some((task) => task.id === id)) {
      model.errors.push(
        error(GAPS_FILE, `detail.${id}`, 'task detail for an unknown or retired ID'),
      );
    }
  }
  return matrix.size;
}

function verifyCounts(model) {
  const count = model.tasks.length;
  const indexText = model.texts.get(INDEX_FILE) ?? '';
  const rootText = model.texts.get(ROOT_README) ?? '';
  const docsText = model.texts.get(DOCS_README) ?? '';
  const firstId = model.firstId;
  const lastId = model.tasks.at(-1)?.id ?? '';
  const moduleCount = model.moduleFiles.length;

  const indexCount = /Boardul curent con\u021bine \*\*(\d+) taskuri\*\*/.exec(indexText);
  if (!indexCount) {
    model.errors.push(
      error(
        INDEX_FILE,
        'task count',
        `missing canonical sentence "Boardul curent conține **${count} taskuri**"`,
      ),
    );
  } else if (Number(indexCount[1]) !== count) {
    model.errors.push(
      error(INDEX_FILE, 'task count', `document says ${indexCount[1]}, board has ${count}`),
    );
  }

  if (!new RegExp(`(?<!\\d)${count} task-uri`).test(rootText)) {
    model.errors.push(
      error(ROOT_README, 'task count', `missing "${count} task-uri" for the current board`),
    );
  }
  if (!new RegExp(`(?<!\\d)${moduleCount} de documente`).test(rootText)) {
    model.errors.push(
      error(
        ROOT_README,
        'module count',
        `missing "${moduleCount} de documente" for ${moduleCount} numbered Docs files`,
      ),
    );
  }
  if (!new RegExp(`(?<!\\d)${count} de taskuri`).test(docsText)) {
    model.errors.push(
      error(DOCS_README, 'task count', `missing "${count} de taskuri" for the current board`),
    );
  }
  const rangePattern = new RegExp(`de la \\*\\*${firstId}\\*\\* la \\*\\*${lastId}\\*\\*`);
  if (!rangePattern.test(docsText)) {
    model.errors.push(
      error(DOCS_README, 'task range', `missing "de la **${firstId}** la **${lastId}**"`),
    );
  }

  const moduleTable = [...docsText.matchAll(/^\| \[[^\]]+\]\((\d{2}-[^)]+)\)/gm)].map(
    (match) => match[1],
  );
  for (const file of model.moduleFiles) {
    if (!moduleTable.includes(file)) {
      model.errors.push(
        error(DOCS_README, 'module table', `numbered module "${file}" is not indexed`),
      );
    }
  }
  for (const file of moduleTable) {
    if (!model.moduleFiles.includes(file)) {
      model.errors.push(
        error(DOCS_README, 'module table', `row "${file}" has no numbered module file in Docs`),
      );
    }
  }
  if (moduleTable.length !== model.moduleFiles.length) {
    model.errors.push(
      error(
        DOCS_README,
        'module table count',
        `table has ${moduleTable.length} numbered rows, Docs has ${model.moduleFiles.length} numbered modules`,
      ),
    );
  }

  const retiredRange = `001-${model.retiredThrough}`;
  for (const file of [ROOT_README, DOCS_README, INDEX_FILE, COVERAGE_FILE, GAPS_FILE]) {
    const text = normalizeDashes(model.texts.get(file) ?? '');
    if (!text.includes(retiredRange)) {
      model.errors.push(
        error(
          file,
          'historical range',
          `missing retired range "${retiredRange.replace('-', '\u2013')}"`,
        ),
      );
    }
    if (!/(istoric|istorice|retras|retrase)/i.test(text)) {
      model.errors.push(
        error(
          file,
          'historical note',
          `must state that ${retiredRange.replace('-', '\u2013')} are historical/retired`,
        ),
      );
    }
    const startPattern = new RegExp(
      `(?:de la|începe la|incepe la|încep la|incep la|continuă de la|continua de la|boardul curent are)[^.\\n]{0,80}${firstId}|${firstId}-${lastId}`,
    );
    if (!startPattern.test(text)) {
      model.errors.push(
        error(
          file,
          'current board start',
          `must state explicitly that the current board starts at ${firstId}`,
        ),
      );
    }
  }
}

export function loadDocsModel(root = PROJECT_ROOT) {
  const resolvedRoot = resolve(root);
  const model = {
    root: resolvedRoot,
    errors: [],
    texts: new Map(),
    tasks: [],
    moduleFiles: [],
    firstId: null,
    retiredThrough: null,
  };
  for (const file of REQUIRED_FILES) {
    model.texts.set(file, readText(resolvedRoot, file, model.errors));
  }
  const docsDirectory = join(resolvedRoot, 'Docs');
  if (existsSync(docsDirectory)) {
    model.moduleFiles = readdirSync(docsDirectory)
      .filter((name) => /^\d{2}-.*\.md$/.test(name))
      .sort();
  } else {
    model.errors.push(error('Docs', 'directory', 'missing'));
  }
  loadBoard(resolvedRoot, model);
  model.checkedLocalLinks = collectLinks(resolvedRoot, model);
  return model;
}

export function checkDocsSync(options = {}) {
  const root = options.root ? resolve(options.root) : PROJECT_ROOT;
  const model = loadDocsModel(root);
  const progressRowCount = verifyProgress(
    model.texts.get(INDEX_FILE) ?? '',
    model,
    options.pendingTaskId,
  );
  verifyStageTable(model.texts.get(INDEX_FILE) ?? '', model);
  const indexRows = verifyIndex(model.texts.get(INDEX_FILE) ?? '', model);
  const matrixRows = verifyCoverage(
    model.texts.get(COVERAGE_FILE) ?? '',
    model.texts.get(GAPS_FILE) ?? '',
    model,
  );
  const gapRows = verifyGaps(model.texts.get(GAPS_FILE) ?? '', model);
  verifyCounts(model);
  const uniqueErrors = [...new Set(model.errors)].sort();
  const counts = columnCounts(model.tasks);
  return {
    errors: uniqueErrors,
    summary: {
      taskCount: model.tasks.length,
      firstId: model.firstId,
      lastId: model.tasks.at(-1)?.id ?? null,
      moduleCount: model.moduleFiles.length,
      columnCounts: counts,
      stageCounts: stageCounts(model.tasks),
      checkedLocalLinks: model.checkedLocalLinks,
      progressRows: progressRowCount,
      indexRows,
      matrixRows,
      gapRows,
    },
  };
}

function parseArguments(argv) {
  let root;
  let checkOnly = false;
  let pendingTaskId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      checkOnly = true;
    } else if (argument === '--root') {
      if (!argv[index + 1]) throw new Error('--root requires a directory');
      root = argv[++index];
    } else if (argument.startsWith('--pending-task=')) {
      pendingTaskId = argument.slice('--pending-task='.length) || null;
    } else {
      throw new Error(`unknown argument "${argument}"`);
    }
  }
  return { root, checkOnly, pendingTaskId };
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (cause) {
    console.error(`docs-sync: ${String(cause.message ?? cause)}`);
    process.exitCode = 1;
    return;
  }
  const result = checkDocsSync({ root: options.root, pendingTaskId: options.pendingTaskId });
  if (result.errors.length > 0) {
    console.error(`docs-sync: FAIL (${result.errors.length} divergences)`);
    for (const message of result.errors) console.error(message);
    process.exitCode = 1;
    return;
  }
  const { summary } = result;
  console.log(
    `docs-sync: PASS (${summary.taskCount} tasks ${summary.firstId}-${summary.lastId}, ` +
      `${summary.moduleCount} module docs, ${summary.checkedLocalLinks} local links, ` +
      `index ${summary.indexRows}, coverage ${summary.matrixRows}, gaps ${summary.gapRows})` +
      (options.checkOnly ? ' [check-only, no writes]' : ''),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
