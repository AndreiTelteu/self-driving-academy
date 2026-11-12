import {
  buildSaveFile,
  canonicalizeJson,
  readSaveFile,
  saveFileName,
} from '../../../src/persistence/index';
import {
  SAVEFILE_CREATED_AT,
  createSaveFileSessions,
  createSaveFileTarget,
} from '../../persistence/savefile-fixture';
import { ARCHIVE_VERSIONS } from '../../persistence/session-archive-fixture';

/**
 * Real-browser proof for PBI 234.
 *
 * The page builds the same two-session savefile as the deterministic report from the real
 * 135/215/227 fixtures, writes it through a browser `Blob`/`File` and a real download, verifies the
 * SHA-256 again with WebCrypto, reads it back with the delivered reader and replaces a fresh target
 * through the delivered store. The runner then reloads the file written by the browser from disk and
 * imports exactly those bytes.
 *
 * The repository is the in-memory 127 double, which is the same transport the deterministic tests
 * use. What is real here is the browser file, the browser crypto, the browser `File` API and the
 * browser execution of the whole encode/checksum/import path.
 */

interface RunResult {
  readonly status: 'PASS' | 'FAIL';
  readonly fileName: string;
  readonly bytes: number;
  readonly checksum: string;
  readonly webCryptoChecksum: string;
  readonly webCryptoMatch: boolean;
  readonly blobMatch: boolean;
  readonly fileMatch: boolean;
  readonly readStatus: string;
  readonly sessionsPresent: number;
  readonly summaryXp: number;
  readonly importStatus: string;
  readonly launch: string;
  readonly xpAfter: number;
  readonly rewardsGranted: number;
  readonly detail: string;
}

interface VerifyResult {
  readonly status: 'PASS' | 'FAIL';
  readonly readStatus: string;
  readonly checksum: string;
  readonly fileSha256: string;
  readonly sessionsPresent: number;
  readonly decorObjects: number;
  readonly importStatus: string;
  readonly xpAfter: number;
  readonly launch: string;
  readonly detail: string;
}

interface SaveFileBrowserApi {
  run(): Promise<RunResult>;
  verifyFile(text: string): Promise<VerifyResult>;
}

declare global {
  interface Window {
    __savefile234: SaveFileBrowserApi;
  }
}

const statusElement = document.getElementById('status');
const resultElement = document.getElementById('result');

function show(value: unknown): void {
  if (resultElement !== null) resultElement.textContent = JSON.stringify(value, null, 2);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

let catalog: unknown = null;
let documentChecksum = '';

async function run(): Promise<RunResult> {
  if (statusElement !== null) statusElement.textContent = 'Se construiesc două sesiuni reale…';
  try {
    const sessions = await createSaveFileSessions();
    catalog = sessions.academy.harness.catalog;
    const built = buildSaveFile({
      createdAt: SAVEFILE_CREATED_AT,
      activeSession: 'ACADEMY',
      versions: ARCHIVE_VERSIONS,
      catalog,
      sessions: {
        ACADEMY: sessions.academy.archive.document,
        CHAOS: sessions.chaos.archive.document,
      },
      decor: { ACADEMY: sessions.academy.decor, CHAOS: sessions.chaos.decor },
      replays: [{ replayId: 'replay:234', encoding: 'base64', data: 'U0RBLTIzNA==', bytes: 7 }],
    });
    if (built.status === 'REJECTED') {
      throw new Error(`Build refused: ${built.rejection.code}`);
    }
    const text = JSON.stringify(built.document);
    const fileName = saveFileName(built.document.createdAt);
    const blob = new Blob([text], { type: 'application/json' });
    const file = new File([blob], fileName, { type: 'application/json' });
    const blobText = await blob.text();
    const fileText = await file.text();

    // The browser computes the checksum itself over the canonical envelope without the checksum
    // field; the module's own SHA-256 must agree with WebCrypto.
    const canonical = canonicalizeJson({
      format: built.document.format,
      formatVersion: built.document.formatVersion,
      integrityVersion: built.document.integrityVersion,
      schemaVersion: built.document.schemaVersion,
      createdAt: built.document.createdAt,
      payload: built.document.payload,
    });
    if (canonical.status === 'REJECTED') throw new Error(canonical.rejection.message);
    const webCryptoChecksum = await sha256Hex(canonical.text);
    const webCryptoMatch = webCryptoChecksum === built.checksum;
    documentChecksum = built.checksum;

    const read = readSaveFile(fileText, { catalog });
    if (read.status === 'REJECTED') throw new Error(`Read refused: ${read.rejection.code}`);

    // Trigger a real browser download; the runner saves this exact file to disk.
    if (statusElement !== null) statusElement.textContent = 'Se descarcă fișierul .sdasave…';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    const target = await createSaveFileTarget({ dbName: '234-savefile-browser-run' });
    const preview = await target.store.preview({ document: fileText });
    if (preview.status === 'REJECTED')
      throw new Error(`Preview refused: ${preview.rejection.code}`);
    const imported = await target.store.import({
      document: fileText,
      confirmation: { previewId: preview.previewId },
    });
    if (imported.status === 'REJECTED')
      throw new Error(`Import refused: ${imported.rejection.code}`);

    const result: RunResult = {
      status: 'PASS',
      fileName,
      bytes: read.summary.bytes,
      checksum: built.checksum,
      webCryptoChecksum,
      webCryptoMatch,
      blobMatch: blobText === text,
      fileMatch: fileText === text,
      readStatus: read.status,
      sessionsPresent: read.summary.sessionsPresent,
      summaryXp: read.summary.totalXp,
      importStatus: imported.status,
      launch: imported.launch.mode,
      xpAfter: imported.replacement.ACADEMY?.xp ?? 0,
      rewardsGranted: imported.rewards.granted,
      detail: 'Blob, File, WebCrypto, reader and replacement ran in Chromium.',
    };
    show(result);
    if (statusElement !== null) {
      statusElement.textContent = 'PASS — fișierul a fost produs și reîncărcat.';
    }
    return result;
  } catch (error) {
    const result: RunResult = {
      status: 'FAIL',
      fileName: '',
      bytes: 0,
      checksum: '',
      webCryptoChecksum: '',
      webCryptoMatch: false,
      blobMatch: false,
      fileMatch: false,
      readStatus: 'ERROR',
      sessionsPresent: 0,
      summaryXp: 0,
      importStatus: 'ERROR',
      launch: '',
      xpAfter: 0,
      rewardsGranted: 0,
      detail: error instanceof Error ? error.message : 'unknown error',
    };
    show(result);
    if (statusElement !== null) statusElement.textContent = `FAIL — ${result.detail}`;
    return result;
  }
}

/** Verifies the exact bytes the browser wrote to disk and replaces a fresh target with them. */
async function verifyFile(text: string): Promise<VerifyResult> {
  try {
    if (catalog === null) throw new Error('Run the page before verifying the file');
    const diskChecksum = await sha256Hex(text);
    const read = readSaveFile(text, { catalog });
    if (read.status === 'REJECTED') throw new Error(`Read refused: ${read.rejection.code}`);
    if (read.summary.checksum !== documentChecksum) {
      throw new Error('The saved file does not carry the checksum of the produced document');
    }
    const target = await createSaveFileTarget({ dbName: '234-savefile-browser-file' });
    const preview = await target.store.preview({ document: text });
    if (preview.status === 'REJECTED')
      throw new Error(`Preview refused: ${preview.rejection.code}`);
    const imported = await target.store.import({
      document: text,
      confirmation: { previewId: preview.previewId },
    });
    if (imported.status === 'REJECTED')
      throw new Error(`Import refused: ${imported.rejection.code}`);
    const result: VerifyResult = {
      status: 'PASS',
      readStatus: read.status,
      checksum: read.summary.checksum,
      fileSha256: diskChecksum,
      sessionsPresent: read.summary.sessionsPresent,
      decorObjects: read.decor.ACADEMY?.objects.length ?? 0,
      importStatus: imported.status,
      xpAfter: imported.replacement.ACADEMY?.xp ?? 0,
      launch: imported.launch.mode,
      detail: 'The file written by Chromium was read from disk and replaced a fresh target.',
    };
    show(result);
    return result;
  } catch (error) {
    const result: VerifyResult = {
      status: 'FAIL',
      readStatus: 'ERROR',
      checksum: '',
      fileSha256: '',
      sessionsPresent: 0,
      decorObjects: 0,
      importStatus: 'ERROR',
      xpAfter: 0,
      launch: '',
      detail: error instanceof Error ? error.message : 'unknown error',
    };
    show(result);
    return result;
  }
}

window.__savefile234 = { run, verifyFile };
