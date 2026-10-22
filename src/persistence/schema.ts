import { requireContract } from '../sessions';
import {
  META_SCHEMA_KEY,
  PERSISTENCE_FORMAT,
  PERSISTENCE_SCHEMA_VERSION,
  PersistenceError,
  persistenceIndexNames,
  persistenceStoreNames,
} from './contracts';
import type {
  IndexDefinition,
  PersistenceIndexName,
  PersistenceStoreName,
  SchemaStep,
  StoreDefinition,
} from './contracts';
import type { SchemaUpgrader } from './ports';

/**
 * Explicit schema history.
 *
 * Version 1 is the base layout and version 2 adds checkpoint durability plus the lifecycle
 * indexes that session resume needs (136 reads `segments.byStatus` and `progress.byStatus`).
 * Both versions stay declared: the database name is stable, so a browser that opened the
 * version-1 layout upgrades in place instead of losing local progress.
 */
export const PERSISTENCE_KEY_PATHS = Object.freeze({
  meta: 'key',
  profiles: 'versionId',
  profileActivations: 'profileId',
  segments: 'recordId',
  scenarios: 'recordId',
  progress: 'recordId',
  settings: 'playerId',
  checkpoints: 'checkpointId',
} as const satisfies Readonly<Record<PersistenceStoreName, string>>);

function index(name: PersistenceIndexName, keyPath: string, unique = false): IndexDefinition {
  return Object.freeze({ name, keyPath, unique });
}

function store(
  name: PersistenceStoreName,
  indexes: readonly IndexDefinition[] = [],
): StoreDefinition {
  return Object.freeze({
    name,
    keyPath: PERSISTENCE_KEY_PATHS[name],
    indexes: Object.freeze(indexes),
  });
}

const VERSION_1_STORES: readonly StoreDefinition[] = Object.freeze([
  store('meta'),
  store('profiles', [index('byProfile', 'profileId')]),
  store('profileActivations'),
  store('segments', [index('bySession', 'sessionId')]),
  store('scenarios', [index('bySession', 'sessionId')]),
  store('progress', [index('bySession', 'sessionId')]),
  store('settings'),
]);

const VERSION_2_STORES: readonly StoreDefinition[] = Object.freeze([
  store('checkpoints', [index('bySession', 'sessionId'), index('byGeneration', 'generation')]),
]);

export const PERSISTENCE_SCHEMA_STEPS: readonly SchemaStep[] = Object.freeze([
  Object.freeze({
    version: 1,
    id: '127-v1-base-layout',
    create: VERSION_1_STORES,
    indexes: Object.freeze([]),
    drop: Object.freeze([]),
  }),
  Object.freeze({
    version: 2,
    id: '127-v2-checkpoints-and-lifecycle-indexes',
    create: VERSION_2_STORES,
    // Index-only steps never rewrite rows: IndexedDB builds the entries from existing records.
    indexes: Object.freeze([
      { store: 'segments' as const, index: index('byStatus', 'status') },
      { store: 'progress' as const, index: index('byStatus', 'status') },
    ]),
    drop: Object.freeze([]),
  }),
]);

/** Stores visible at `version`, with index-only steps merged into their store definition. */
export function schemaStores(
  version: number = PERSISTENCE_SCHEMA_VERSION,
): readonly StoreDefinition[] {
  const byName = new Map<
    PersistenceStoreName,
    { name: PersistenceStoreName; keyPath: string; indexes: IndexDefinition[] }
  >();
  for (const step of PERSISTENCE_SCHEMA_STEPS) {
    if (step.version > version) break;
    for (const name of step.drop) byName.delete(name);
    for (const definition of step.create) {
      byName.set(definition.name, {
        name: definition.name,
        keyPath: definition.keyPath,
        indexes: [...definition.indexes],
      });
    }
    for (const entry of step.indexes) {
      byName.get(entry.store)?.indexes.push(entry.index);
    }
  }
  return Object.freeze(
    [...byName.values()].map((definition) =>
      Object.freeze({
        name: definition.name,
        keyPath: definition.keyPath,
        indexes: Object.freeze([...definition.indexes]),
      }),
    ),
  );
}

export function storeDefinition(
  name: PersistenceStoreName,
  version: number = PERSISTENCE_SCHEMA_VERSION,
): StoreDefinition | null {
  return schemaStores(version).find((entry) => entry.name === name) ?? null;
}

export function indexDefinition(
  storeName: PersistenceStoreName,
  indexName: PersistenceIndexName,
  version: number = PERSISTENCE_SCHEMA_VERSION,
): IndexDefinition | null {
  return (
    storeDefinition(storeName, version)?.indexes.find((entry) => entry.name === indexName) ?? null
  );
}

/**
 * Ordered steps needed to move a database from `fromVersion` to `toVersion`.
 *
 * `SCHEMA_TOO_NEW` is a closed rejection rather than a silent downgrade: a database written by a
 * newer build is never opened with fewer stores than it has (29 §import compatibility rule).
 */
export function planUpgrade(
  fromVersion: unknown,
  toVersion: number = PERSISTENCE_SCHEMA_VERSION,
): readonly SchemaStep[] {
  requireContract(
    typeof fromVersion === 'number' && Number.isSafeInteger(fromVersion) && fromVersion >= 0,
    'Expected a nonnegative integer schema version',
  );
  requireContract(
    Number.isSafeInteger(toVersion) && toVersion >= 1 && toVersion <= PERSISTENCE_SCHEMA_VERSION,
    'Unsupported target schema version',
  );
  if (fromVersion > toVersion) {
    throw new PersistenceError(
      'SCHEMA_TOO_NEW',
      `Local database schema ${String(fromVersion)} is newer than ${toVersion}`,
    );
  }
  const steps = PERSISTENCE_SCHEMA_STEPS.filter(
    (step) => step.version > fromVersion && step.version <= toVersion,
  );
  for (let position = 0; position < steps.length; position += 1) {
    requireContract(
      steps[position].version === fromVersion + position + 1,
      'Schema history has a gap; migrations must be contiguous',
    );
  }
  return Object.freeze(steps);
}

/** Applies one step through the port; the adapter owns the actual upgrade transaction. */
export function applySchemaStep(
  upgrader: SchemaUpgrader,
  step: SchemaStep,
  now: () => string,
): void {
  for (const name of step.drop) {
    requireContract(upgrader.hasStore(name), `Cannot drop missing store ${name}`);
    upgrader.deleteStore(name);
  }
  for (const definition of step.create) {
    requireContract(
      !upgrader.hasStore(definition.name),
      `Store ${definition.name} already exists at version ${step.version}`,
    );
    upgrader.createStore(definition);
  }
  for (const entry of step.indexes) {
    requireContract(
      upgrader.hasStore(entry.store),
      `Cannot index missing store ${entry.store} at version ${step.version}`,
    );
    upgrader.createIndex(entry.store, entry.index);
  }
  if (step.create.some((definition) => definition.name === 'meta')) {
    upgrader.put('meta', {
      key: META_SCHEMA_KEY,
      value: {
        format: PERSISTENCE_FORMAT,
        schemaVersion: step.version,
        createdAt: now(),
      },
    });
  }
}

/** Cheap consistency probe used by tests and the evidence report; never runs at import time. */
export function verifySchemaDeclaration(): readonly string[] {
  const problems: string[] = [];
  if (PERSISTENCE_SCHEMA_STEPS.length !== PERSISTENCE_SCHEMA_VERSION) {
    problems.push('Schema steps must be contiguous from version 1');
  }
  for (const [position, step] of PERSISTENCE_SCHEMA_STEPS.entries()) {
    if (step.version !== position + 1) problems.push(`Step ${step.id} is out of order`);
    for (const definition of step.create) {
      if (!(persistenceStoreNames as readonly string[]).includes(definition.name)) {
        problems.push(`Unknown store in step ${step.id}: ${definition.name}`);
      }
      if (definition.keyPath !== PERSISTENCE_KEY_PATHS[definition.name]) {
        problems.push(`Key path mismatch for ${definition.name}`);
      }
      for (const entry of definition.indexes) {
        if (!(persistenceIndexNames as readonly string[]).includes(entry.name)) {
          problems.push(`Unknown index ${entry.name} on ${definition.name}`);
        }
      }
    }
  }
  const created = schemaStores().map((definition) => definition.name);
  for (const name of persistenceStoreNames) {
    if (!created.includes(name)) problems.push(`Store ${name} is never created`);
  }
  return Object.freeze(problems);
}
