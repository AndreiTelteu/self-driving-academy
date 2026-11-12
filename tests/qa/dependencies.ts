import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QaCheck, QaRow } from './v1-regression-support';
import { qaCheck, qaRow } from './v1-regression-support';

/**
 * Criterion 5's second half: the 225-234 extension set has its own gate (235) and no inverse
 * dependency can close a cycle.
 *
 * The check reads the real PBI board on disk (frontmatter `id`/`status`/`depends_on`) and builds the
 * dependency graph. Missing external ids are reported, never ignored silently, and the graph is
 * checked for cycles with a deterministic depth-first walk.
 */

export const EXTENSION_IDS = [
  '225',
  '226',
  '227',
  '228',
  '229',
  '230',
  '231',
  '232',
  '233',
  '234',
] as const;
export const GATE_ID = '235' as const;
export const REGRESSION_ID = '216' as const;

export interface BoardEntry {
  readonly id: string;
  readonly status: string;
  readonly column: string;
  readonly file: string;
  readonly dependsOn: readonly string[];
}

export interface DependencySection {
  readonly rows: readonly QaRow[];
  readonly checks: readonly QaCheck[];
  readonly graph: Readonly<{
    nodes: number;
    edges: number;
    external: readonly string[];
    cycles: readonly (readonly string[])[];
    gateCoversExtensions: boolean;
    inverseDependencies: readonly string[];
    duplicates: readonly string[];
  }>;
}

interface Frontmatter {
  readonly id: string | null;
  readonly status: string | null;
  readonly dependsOn: readonly string[];
}

function frontmatterOf(text: string): Frontmatter {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (block === null) return { id: null, status: null, dependsOn: [] };
  const body = block[1] ?? '';
  const id = /^id:\s*"([^"]+)"/m.exec(body)?.[1] ?? null;
  const status = /^status:\s*"([^"]+)"/m.exec(body)?.[1] ?? null;
  const raw = /^depends_on:\s*\[([^\]]*)\]/m.exec(body)?.[1] ?? '';
  const dependsOn = [...raw.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]!);
  return { id, status, dependsOn };
}

export function readBoard(root: string): readonly BoardEntry[] {
  const entries: BoardEntry[] = [];
  for (const column of ['To Do', 'In Progress', 'Done']) {
    const directory = join(root, 'PBI', column);
    const files = readdirSync(directory)
      .filter((file) => file.endsWith('.md'))
      .sort();
    for (const file of files) {
      const text = readFileSync(join(directory, file), 'utf8');
      const frontmatter = frontmatterOf(text);
      if (frontmatter.id === null || frontmatter.status === null) continue;
      entries.push(
        Object.freeze({
          id: frontmatter.id,
          status: frontmatter.status,
          column,
          file,
          dependsOn: Object.freeze([...frontmatter.dependsOn]),
        }),
      );
    }
  }
  return Object.freeze(entries);
}

interface Graph {
  readonly nodes: readonly string[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly external: readonly string[];
  readonly duplicates: readonly string[];
}

function buildGraph(board: readonly BoardEntry[]): Graph {
  const byId = new Map<string, readonly string[]>();
  const duplicates: string[] = [];
  for (const entry of board) {
    if (byId.has(entry.id)) duplicates.push(entry.id);
    else byId.set(entry.id, entry.dependsOn);
  }
  const external = new Set<string>();
  let edges = 0;
  for (const dependsOn of byId.values()) {
    for (const dependency of dependsOn) {
      edges += 1;
      if (!byId.has(dependency)) external.add(dependency);
    }
  }
  return Object.freeze({
    nodes: Object.freeze([...byId.keys()].sort()),
    edges: Object.freeze(byId),
    external: Object.freeze([...external].sort()),
    duplicates: Object.freeze(duplicates.sort()),
  });
}

function closure(graph: Graph, start: string): readonly string[] {
  const seen = new Set<string>();
  const stack = [...(graph.edges.get(start) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const dependency of graph.edges.get(next) ?? []) {
      if (!seen.has(dependency)) stack.push(dependency);
    }
  }
  return Object.freeze([...seen].sort());
}

/** Deterministic DFS; the stack of the current path is the reported cycle. */
function findCycles(graph: Graph): readonly (readonly string[])[] {
  const state = new Map<string, 'VISITING' | 'DONE'>();
  const path: string[] = [];
  const cycles: string[][] = [];
  const seenCycles = new Set<string>();

  function visit(node: string): void {
    const current = state.get(node);
    if (current === 'DONE') return;
    if (current === 'VISITING') {
      const start = path.indexOf(node);
      const cycle = [...path.slice(start), node];
      const key = [...cycle].sort().join(',');
      if (!seenCycles.has(key)) {
        seenCycles.add(key);
        cycles.push(cycle);
      }
      return;
    }
    state.set(node, 'VISITING');
    path.push(node);
    for (const dependency of graph.edges.get(node) ?? []) {
      if (graph.edges.has(dependency)) visit(dependency);
    }
    path.pop();
    state.set(node, 'DONE');
  }

  for (const node of graph.nodes) visit(node);
  return Object.freeze(cycles.map((cycle) => Object.freeze(cycle)));
}

export function runDependencyCheck(root: string): DependencySection {
  const board = readBoard(root);
  const graph = buildGraph(board);
  const cycles = findCycles(graph);
  const gateClosure = closure(graph, GATE_ID);
  const missingFromGate = EXTENSION_IDS.filter((id) => !gateClosure.includes(id));
  const inverseDependencies = EXTENSION_IDS.filter((id) => closure(graph, id).includes(GATE_ID));
  const regression = board.find((entry) => entry.id === REGRESSION_ID);
  const ownDependencies = regression?.dependsOn ?? [];
  const ownUndone = ownDependencies.filter(
    (id) => board.find((entry) => entry.id === id)?.status !== 'Done',
  );

  const gateChecks: QaCheck[] = [
    qaCheck('gate exists', true, graph.nodes.includes(GATE_ID), '235 is on the board'),
    qaCheck(
      'gate covers the extension set',
      [],
      [...missingFromGate],
      'every extension id is in the transitive closure of 235',
    ),
    qaCheck(
      'no inverse dependency',
      [],
      [...inverseDependencies],
      'no extension depends on its own gate',
    ),
    qaCheck(
      'gate depends on the V1 regression',
      true,
      (graph.edges.get(GATE_ID) ?? []).includes(REGRESSION_ID),
      '235 names 216 explicitly',
    ),
  ];
  const cycleChecks: QaCheck[] = [
    qaCheck('cycles', [], [...cycles], 'the dependency graph is acyclic'),
    qaCheck('duplicate ids', [], [...graph.duplicates], 'an id appears in exactly one column'),
  ];
  const ownChecks: QaCheck[] = [
    qaCheck(
      'own dependencies done',
      [],
      [...ownUndone],
      '215, 141, 108, 208, 217 and 205 are Done before 216',
    ),
    qaCheck(
      'own dependency count',
      6,
      ownDependencies.length,
      'the frontmatter lists six prerequisites',
    ),
  ];

  const rows: QaRow[] = [
    qaRow({
      id: 'D1',
      category: 'DEPENDENCIES',
      contract: 'PBI/235 + 225-234',
      scenario: 'Gate separat pentru extensii, fără dependență inversă',
      polarity: 'DOCUMENT',
      actual: {
        gate: GATE_ID,
        gateDependencies: graph.edges.get(GATE_ID) ?? [],
        extensionClosure: gateClosure.filter((id) =>
          (EXTENSION_IDS as readonly string[]).includes(id),
        ).length,
        missing: missingFromGate,
        inverse: inverseDependencies,
      },
      checks: gateChecks,
      note: '235 este gate-ul extensiilor 225–234, iar niciuna nu depinde de el.',
    }),
    qaRow({
      id: 'D2',
      category: 'DEPENDENCIES',
      contract: 'PBI board',
      scenario: 'Graful complet de dependențe nu are cicluri',
      polarity: 'DOCUMENT',
      actual: {
        nodes: graph.nodes.length,
        edges: graph.edges.size,
        cycles: cycles.length,
        duplicates: graph.duplicates.length,
        external: graph.external.length,
      },
      checks: cycleChecks,
      note: 'Un ciclu sau un id duplicat ar bloca planul, deci este raportat explicit.',
    }),
    qaRow({
      id: 'D3',
      category: 'DEPENDENCIES',
      contract: 'PBI/216',
      scenario: 'Dependențele regresiei V1 sunt în Done',
      polarity: 'DOCUMENT',
      actual: {
        dependencies: ownDependencies,
        undone: ownUndone,
      },
      checks: ownChecks,
      note: 'Regresia pornește numai după contractele pe care le verifică.',
    }),
  ];

  return Object.freeze({
    rows: Object.freeze(rows),
    checks: Object.freeze([...gateChecks, ...cycleChecks, ...ownChecks]),
    graph: Object.freeze({
      nodes: graph.nodes.length,
      edges: graph.edges.size,
      external: graph.external,
      cycles,
      gateCoversExtensions: missingFromGate.length === 0,
      inverseDependencies,
      duplicates: graph.duplicates,
    }),
  });
}
