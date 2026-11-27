import type { DailyProgressRead } from '../missions';
import {
  parseDailyProgressSnapshot,
  projectDailyProgressPanel,
  type DailyProgressPanelView,
  type DailyProgressSnapshot,
} from './daily-progress-format';

/**
 * PBI 276 — projection of the player's XP, level, history and the three daily objectives.
 *
 * The projection reads one composed snapshot and never counts an event, grants a reward, advances a
 * day or touches the XP ledger. The daily half is the delivered 212 projection; the XP half is a
 * bounded view of the 213 balance, level and append-only credits.
 */

export const LIVE_PROGRESS_UI_VERSION = '276-live-progress-panel-v1' as const;
export const LIVE_PROGRESS_READ_VERSION = '276-live-progress-read-v1' as const;
export const LIVE_PROGRESS_HISTORY_LIMIT = 16 as const;
export const LIVE_PROGRESS_FORBIDDEN_FRAGMENTS = Object.freeze([
  '-XP',
  'pierdere',
  'penalizare',
  'xp negativ',
  'scădere xp',
] as const);

export const LIVE_PROGRESS_CAUSE_LABELS = Object.freeze({
  MISSION_REWARD: 'Misiune de campanie',
  DAILY_REWARD: 'Misiune zilnică',
  ACTIVE_TIME: 'Timp activ în Academie',
});

export type LiveProgressCause = keyof typeof LIVE_PROGRESS_CAUSE_LABELS;

export const LIVE_PROGRESS_KINDS = ['ACADEMY', 'CHAOS'] as const;
export type LiveProgressKind = (typeof LIVE_PROGRESS_KINDS)[number];

export interface LiveProgressXpEntry {
  readonly entryId: string;
  readonly causeType: LiveProgressCause;
  readonly amountXp: number;
  readonly balanceAfterXp: number;
  readonly realTimeMs: number;
  readonly tick: number | null;
}

export interface LiveProgressPlayer {
  readonly playerId: string;
  readonly xpBalance: number;
  readonly xpBalanceMicroXp: number;
  readonly level: number;
  readonly nextLevelXp: number | null;
  readonly levelProgress: number;
  readonly activePlaySeconds: number;
  readonly entries: readonly LiveProgressXpEntry[];
  readonly credits: number;
  readonly duplicates: number;
  readonly debits: 0;
  readonly balanceIsSumOfEntries: true;
}

export interface LiveProgressSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof LIVE_PROGRESS_READ_VERSION;
  readonly playerId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly kind: LiveProgressKind;
  readonly observedAtMs: number;
  readonly daily: DailyProgressRead;
  readonly player: LiveProgressPlayer;
  readonly xpFingerprint: string;
}

/** The validated projection: the 212 parser normalises the daily read to the panel version. */
export interface ParsedLiveProgressSnapshot extends Omit<LiveProgressSnapshot, 'daily'> {
  readonly daily: DailyProgressSnapshot;
}

export interface LiveProgressHistoryRow {
  readonly entryId: string;
  readonly causeLabel: string;
  readonly amountLabel: string;
  readonly balanceLabel: string;
  readonly timeLabel: string;
}

export interface LiveProgressPanelView {
  readonly signature: string;
  readonly heading: string;
  readonly description: string;
  readonly summary: string;
  readonly empty: boolean;
  readonly ariaLabel: string;
  readonly xpLabel: string;
  readonly levelLabel: string;
  readonly nextLevelLabel: string;
  readonly levelPercent: number;
  readonly activeTimeLabel: string;
  readonly historySummary: string;
  readonly history: readonly LiveProgressHistoryRow[];
  readonly daily: DailyProgressPanelView;
  readonly note: string;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${label} must be plain data`);
  return value as Record<string, unknown>;
}

function field(data: Record<string, unknown>, key: string, label: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(data, key))
    throw new Error(`${label} is missing the field: ${key}`);
  return data[key];
}

function text(value: unknown, label: string, maximum = 256): string {
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximum
  )
    throw new Error(`${label} is invalid`);
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new Error(`${label} is invalid`);
  return value;
}

function number(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error(`${label} is invalid`);
  return value;
}

function closed<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value))
    throw new Error(`${label} is invalid`);
  return value as T;
}

function readEntry(value: unknown): LiveProgressXpEntry {
  const entry = record(value, 'XP entry');
  const causeType = closed(
    field(entry, 'causeType', 'XP entry'),
    Object.keys(LIVE_PROGRESS_CAUSE_LABELS) as LiveProgressCause[],
    'XP cause',
  );
  const amountXp = number(field(entry, 'amountXp', 'XP entry'), 0, 1_000_000_000, 'XP amount');
  const balanceAfterXp = number(
    field(entry, 'balanceAfterXp', 'XP entry'),
    0,
    1_000_000_000,
    'XP balance',
  );
  const tickValue = field(entry, 'tick', 'XP entry');
  return Object.freeze({
    entryId: text(field(entry, 'entryId', 'XP entry'), 'XP entry id'),
    causeType,
    amountXp,
    balanceAfterXp,
    realTimeMs: integer(
      field(entry, 'realTimeMs', 'XP entry'),
      0,
      Number.MAX_SAFE_INTEGER,
      'XP instant',
    ),
    tick: tickValue === null ? null : integer(tickValue, 0, Number.MAX_SAFE_INTEGER, 'XP tick'),
  });
}

function readPlayer(value: unknown): LiveProgressPlayer {
  const player = record(value, 'player progress');
  const entries = field(player, 'entries', 'player progress');
  if (!Array.isArray(entries) || entries.length > LIVE_PROGRESS_HISTORY_LIMIT)
    throw new Error('player progress entries are invalid');
  const nextLevel = field(player, 'nextLevelXp', 'player progress');
  const xpBalance = number(
    field(player, 'xpBalance', 'player progress'),
    0,
    1_000_000_000,
    'XP balance',
  );
  const playerId = text(field(player, 'playerId', 'player progress'), 'player id');
  if (field(player, 'debits', 'player progress') !== 0) throw new Error('XP debits must be zero');
  if (field(player, 'balanceIsSumOfEntries', 'player progress') !== true)
    throw new Error('XP balance must be the sum of its entries');
  return Object.freeze({
    playerId,
    xpBalance,
    xpBalanceMicroXp: integer(
      field(player, 'xpBalanceMicroXp', 'player progress'),
      0,
      Number.MAX_SAFE_INTEGER,
      'XP micro balance',
    ),
    level: integer(field(player, 'level', 'player progress'), 1, 50, 'level'),
    nextLevelXp: nextLevel === null ? null : number(nextLevel, 0, 1_000_000_000, 'next level XP'),
    levelProgress: number(
      field(player, 'levelProgress', 'player progress'),
      0,
      1,
      'level progress',
    ),
    activePlaySeconds: number(
      field(player, 'activePlaySeconds', 'player progress'),
      0,
      1_000_000_000,
      'active play seconds',
    ),
    entries: Object.freeze(entries.map(readEntry)),
    credits: integer(
      field(player, 'credits', 'player progress'),
      0,
      Number.MAX_SAFE_INTEGER,
      'credits',
    ),
    duplicates: integer(
      field(player, 'duplicates', 'player progress'),
      0,
      Number.MAX_SAFE_INTEGER,
      'duplicates',
    ),
    debits: 0 as const,
    balanceIsSumOfEntries: true as const,
  });
}

export function parseLiveProgressSnapshot(value: unknown): ParsedLiveProgressSnapshot {
  const snapshot = record(value, 'live progress snapshot');
  if (
    field(snapshot, 'schemaVersion', 'live progress snapshot') !== 1 ||
    field(snapshot, 'units', 'live progress snapshot') !== 'SI' ||
    field(snapshot, 'version', 'live progress snapshot') !== LIVE_PROGRESS_READ_VERSION
  )
    throw new Error('Live progress snapshot contract version');
  const playerId = text(field(snapshot, 'playerId', 'live progress snapshot'), 'player id');
  const sessionId = text(field(snapshot, 'sessionId', 'live progress snapshot'), 'session id');
  const daily = parseDailyProgressSnapshot(field(snapshot, 'daily', 'live progress snapshot'));
  if (daily.playerId !== playerId || daily.sessionId !== sessionId)
    throw new Error('Live progress daily read belongs to another player or session');
  const player = readPlayer(field(snapshot, 'player', 'live progress snapshot'));
  if (player.playerId !== playerId)
    throw new Error('Live progress XP read belongs to another player');
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    version: LIVE_PROGRESS_READ_VERSION,
    playerId,
    sessionId,
    worldEpoch: integer(
      field(snapshot, 'worldEpoch', 'live progress snapshot'),
      0,
      Number.MAX_SAFE_INTEGER,
      'world epoch',
    ),
    kind: closed(
      field(snapshot, 'kind', 'live progress snapshot'),
      LIVE_PROGRESS_KINDS,
      'session kind',
    ),
    observedAtMs: integer(
      field(snapshot, 'observedAtMs', 'live progress snapshot'),
      0,
      Number.MAX_SAFE_INTEGER,
      'observed instant',
    ),
    daily,
    player,
    xpFingerprint: text(
      field(snapshot, 'xpFingerprint', 'live progress snapshot'),
      'XP fingerprint',
      64,
    ),
  });
}

function formatXp(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function formatInstant(epochMs: number): string {
  return `${new Date(epochMs).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

function signatureOf(snapshot: ParsedLiveProgressSnapshot, daily: DailyProgressPanelView): string {
  const entries = snapshot.player.entries
    .map((entry) => `${entry.entryId}:${entry.amountXp}:${entry.balanceAfterXp}`)
    .join('|');
  return [
    snapshot.version,
    snapshot.playerId,
    snapshot.sessionId,
    String(snapshot.worldEpoch),
    snapshot.xpFingerprint,
    formatXp(snapshot.player.xpBalance),
    String(snapshot.player.level),
    daily.signature,
    entries,
  ].join('::');
}

export function projectLiveProgressPanel(
  snapshot: ParsedLiveProgressSnapshot,
): LiveProgressPanelView {
  const daily = projectDailyProgressPanel(snapshot.daily);
  const nextLevel =
    snapshot.player.nextLevelXp === null
      ? 'Nivel maxim atins'
      : `${formatXp(Math.max(0, snapshot.player.nextLevelXp - snapshot.player.xpBalance))} XP până la nivelul ${snapshot.player.level + 1}`;
  const history = [...snapshot.player.entries]
    .reverse()
    .slice(0, 12)
    .map((entry) =>
      Object.freeze({
        entryId: entry.entryId,
        causeLabel: LIVE_PROGRESS_CAUSE_LABELS[entry.causeType],
        amountLabel: `+${formatXp(entry.amountXp)} XP`,
        balanceLabel: `${formatXp(entry.balanceAfterXp)} XP`,
        timeLabel: formatInstant(entry.realTimeMs),
      }),
    );
  return Object.freeze({
    signature: signatureOf(snapshot, daily),
    heading: 'Progres și misiuni zilnice',
    description:
      'Soldul XP, nivelul, istoricul și cele trei obiective ale zilei. XP nu scade niciodată.',
    summary:
      `${snapshot.player.level} · ${formatXp(snapshot.player.xpBalance)} XP · ` +
      `${snapshot.daily.instances.filter((entry) => entry.state === 'COMPLETED').length}/3 obiective`,
    empty: false,
    ariaLabel: 'Progres și misiuni zilnice',
    xpLabel: `${formatXp(snapshot.player.xpBalance)} XP`,
    levelLabel: `Nivel ${snapshot.player.level}`,
    nextLevelLabel: nextLevel,
    levelPercent: Math.round(snapshot.player.levelProgress * 100),
    activeTimeLabel: `${snapshot.player.activePlaySeconds.toFixed(1).replace('.', ',')} s timp activ`,
    historySummary:
      `${snapshot.player.credits} intrări · ${history.length} afișate · ` +
      `${snapshot.player.duplicates} duplicate`,
    history: Object.freeze(history),
    daily,
    note:
      'XP se acordă o singură dată pe identitate de recompensă și nu scade la KPI, accident, ' +
      'misiune eșuată sau zi ratată. Pauza, background-ul, focusul pierdut, AFK și Haos nu acordă XP Academie.',
  });
}

export function emptyLiveProgressView(): LiveProgressPanelView {
  return Object.freeze({
    signature: '',
    heading: 'Progres și misiuni zilnice',
    description: 'Numărul de ordine al zilei nu este încă disponibil.',
    summary: 'Fără date',
    empty: true,
    ariaLabel: 'Progres și misiuni zilnice',
    xpLabel: '0 XP',
    levelLabel: 'Nivel 1',
    nextLevelLabel: '100 XP până la nivelul 2',
    levelPercent: 0,
    activeTimeLabel: '0,0 s timp activ',
    historySummary: '0 intrări',
    history: Object.freeze([]),
    daily: Object.freeze({
      signature: '',
      heading: 'Misiunile zilei',
      description: 'Fără date',
      summary: 'Fără date',
      empty: true,
      ariaLabel: 'Misiunile zilei',
      phase: 'PENDING',
      phaseLabel: 'În așteptare',
      dayLabel: 'Fără zi',
      timeZoneLabel: '',
      resetLabel: '',
      windowLabel: '',
      xpLabel: '0 XP',
      rejectionLabel: '',
      counts: Object.freeze({
        instances: 0,
        active: 0,
        completed: 0,
        expired: 0,
        ineligible: 0,
        rides: 0,
        manualRides: 0,
        learningRides: 0,
        autoRides: 0,
        mixedRides: 0,
        modeMismatches: 0,
        rejections: 0,
        rewards: 0,
      }),
      instances: Object.freeze([]),
    }),
    note: 'XP nu scade niciodată.',
  });
}
