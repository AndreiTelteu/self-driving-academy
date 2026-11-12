import { compareArtifacts, exportSessionDocuments } from '../../e2e/session-e2e';
import type { ArtifactComparison, SessionArtifacts } from '../../e2e/session-e2e';

/**
 * PBI 152 browser harness.
 *
 * The page is a real browser session, not a screenshot of a Node run: it walks the whole session in
 * Chromium, writes the 133/215 documents to IndexedDB, and after a full page reload it re-reads them
 * and compares the XP, daily, KPI and fleet fingerprints. The new browser context is the new
 * profile; the reload is the restart.
 */

const DATABASE = 'sda-152-session';
const STORE = 'documents';
const KEY = 'session';

interface DocumentRow {
  readonly profile: string;
  readonly economy: string;
  readonly expected: SessionArtifacts['expected'];
  readonly summary: SessionArtifacts['summary'];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function persist(row: DocumentRow): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(row, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    database.close();
  }
}

async function load(): Promise<DocumentRow | null> {
  const database = await openDatabase();
  try {
    return await new Promise<DocumentRow | null>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as DocumentRow | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
    });
  } finally {
    database.close();
  }
}

const status = document.querySelector<HTMLParagraphElement>('#status');
const stepsBody = document.querySelector<HTMLTableSectionElement>('#steps');
const detail = document.querySelector<HTMLPreElement>('#detail');

function renderStep(id: string, checks: number, verdict: string): void {
  if (stepsBody === null) return;
  const row = document.createElement('tr');
  const cells = [id, String(checks), verdict];
  for (const [index, value] of cells.entries()) {
    const cell = document.createElement('td');
    cell.textContent = value;
    if (index === 2) cell.className = value === 'PASS' ? 'pass' : 'fail';
    row.append(cell);
  }
  stepsBody.append(row);
}

async function phase1(): Promise<{
  readonly pass: boolean;
  readonly summary: SessionArtifacts['summary'];
  readonly bytes: Readonly<{ profile: number; economy: number }>;
}> {
  const artifacts = await exportSessionDocuments();
  await persist({
    profile: artifacts.profile,
    economy: artifacts.economy,
    expected: artifacts.expected,
    summary: artifacts.summary,
  });
  renderStep(
    'sesiune (AUTO→MANUAL→LEARNING→AUTO)',
    artifacts.summary.checks,
    artifacts.summary.pass ? 'PASS' : 'FAIL',
  );
  if (status !== null) {
    status.textContent = `Sesiune parcursă: ${artifacts.summary.checks} verificări, export scris în IndexedDB.`;
    status.className = artifacts.summary.pass ? 'pass' : 'fail';
  }
  if (detail !== null) {
    detail.textContent = JSON.stringify(
      { summary: artifacts.summary, expected: artifacts.expected },
      null,
      2,
    );
  }
  return {
    pass: artifacts.summary.pass,
    summary: artifacts.summary,
    bytes: { profile: artifacts.profile.length, economy: artifacts.economy.length },
  };
}

async function phase2(): Promise<{
  readonly pass: boolean;
  readonly comparison: ArtifactComparison | null;
  readonly reason: string | null;
}> {
  const row = await load();
  if (row === null) {
    if (status !== null) status.textContent = 'Nu există documente persistate pentru restart.';
    return { pass: false, comparison: null, reason: 'NO_PERSISTED_DOCUMENTS' };
  }
  const comparison = compareArtifacts({
    profile: row.profile,
    economy: row.economy,
    expected: row.expected,
    summary: row.summary,
  });
  for (const check of comparison.checks) {
    renderStep(check.name, 1, check.pass ? 'PASS' : 'FAIL');
  }
  if (status !== null) {
    status.textContent = comparison.pass
      ? `Restart verificat: ${comparison.numbers.xpBalance} XP, nivel ${comparison.numbers.xpLevel}, ${comparison.numbers.dailyRewarded}/${comparison.numbers.dailyInstances} daily, ${comparison.numbers.kpiRevenueMinorUnits} unități minore.`
      : 'Restartul nu a păstrat starea.';
    status.className = comparison.pass ? 'pass' : 'fail';
  }
  if (detail !== null) {
    detail.textContent = JSON.stringify(
      { numbers: comparison.numbers, checks: comparison.checks },
      null,
      2,
    );
  }
  return { pass: comparison.pass, comparison, reason: null };
}

declare global {
  var __sessionReady: boolean;
  var __sessionPhase1: () => Promise<unknown>;
  var __sessionPhase2: () => Promise<unknown>;
}

globalThis.__sessionReady = false;
globalThis.__sessionPhase1 = phase1;
globalThis.__sessionPhase2 = phase2;
globalThis.__sessionReady = true;
