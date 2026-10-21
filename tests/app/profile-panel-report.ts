import { readProfilePanelSnapshot } from '../../src/app';
import { parameterDefinitions, parameterRegistry } from '../../src/profiles';
import type { DrivingProfile, ProfileVersionDelta } from '../../src/profiles';
import {
  PROFILE_PANEL_ILLUSTRATIVE_BANNER,
  PROFILE_PANEL_LIMITS,
  PROFILE_PANEL_VERSION,
  parseProfilePanelSnapshot,
  projectProfilePanel,
} from '../../src/ui';
import type { ProfilePanelCounts, ProfilePanelSnapshot, ProfilePanelView } from '../../src/ui';
import {
  PROFILE_PANEL_EPOCH,
  PROFILE_PANEL_SESSION,
  createProfilePanelHarness,
  illustrativeSnapshot,
  realProfile,
  realProfileDelta,
  realSnapshot,
} from '../ui/profile-panel-fixture';
import type { ProfilePanelHarness } from '../ui/profile-panel-fixture';

export interface ProfilePanelReportRow {
  readonly key: string;
  readonly status: string;
  readonly value: number | null;
  readonly display: string;
  readonly uncertainty: string;
  readonly evidence: string;
  readonly source: string;
  readonly learnable: boolean;
  readonly reason: string;
}

export interface ProfilePanelReportDeltaRow {
  readonly key: string;
  readonly change: string;
  readonly reason: string;
  readonly evidence: string;
}

export interface ProfilePanelReportScenario {
  readonly name: string;
  readonly illustrative: boolean;
  readonly profileVersion: string;
  readonly counts: ProfilePanelCounts;
  readonly summary: string;
  readonly banner: string | null;
  readonly rows: readonly ProfilePanelReportRow[];
  readonly delta: readonly ProfilePanelReportDeltaRow[];
  readonly dom: string | null;
  readonly stats: Readonly<Record<string, number | boolean | string>>;
}

export interface ProfilePanelCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProfilePanelReport {
  readonly version: typeof PROFILE_PANEL_VERSION;
  readonly contract: Readonly<{
    states: readonly string[];
    rules: readonly string[];
    banner: string;
    limits: Readonly<Record<string, number | string>>;
  }>;
  readonly scenarios: readonly ProfilePanelReportScenario[];
  readonly checks: readonly ProfilePanelCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const FOCUS_KEYS: readonly string[] = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'following_time_headway',
  'speed_delta_arterial',
  'lane_center_offset',
]);

function check(
  name: string,
  expected: string | number | boolean,
  actual: string | number | boolean,
  detail: string,
): ProfilePanelCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function frameOf(
  profile: DrivingProfile | null,
  delta: ProfileVersionDelta | null = null,
  tick = 10,
): ProfilePanelSnapshot {
  return readProfilePanelSnapshot(
    { catalog: parameterDefinitions },
    { tick, profile, delta, sessionId: PROFILE_PANEL_SESSION, worldEpoch: PROFILE_PANEL_EPOCH },
  );
}

function rowsOf(view: ProfilePanelView, keys: readonly string[]): ProfilePanelReportRow[] {
  const rows: ProfilePanelReportRow[] = [];
  for (const key of keys) {
    const row = view.rows.find((entry) => entry.key === key);
    if (row === undefined) continue;
    rows.push(
      Object.freeze({
        key: row.key,
        status: row.status,
        value: row.value,
        display: row.displayValue,
        uncertainty: row.uncertaintyLabel,
        evidence: row.evidenceLabel,
        source: row.sourceLabel,
        learnable: row.learnable,
        reason: row.reasonLabel,
      }),
    );
  }
  return rows;
}

function scenarioOf(
  name: string,
  snapshot: ProfilePanelSnapshot,
  harness: ProfilePanelHarness,
  keys: readonly string[] = FOCUS_KEYS,
  withDom = false,
): ProfilePanelReportScenario {
  const view = projectProfilePanel(snapshot, parameterDefinitions);
  return Object.freeze({
    name,
    illustrative: view.illustrative,
    profileVersion: view.profile?.versionId ?? '—',
    counts: view.counts,
    summary: view.summary,
    banner: view.banner,
    rows: Object.freeze(rowsOf(view, keys)),
    delta: Object.freeze(
      (view.delta?.rows ?? []).map((row) =>
        Object.freeze({
          key: row.key,
          change: row.changeLabel,
          reason: row.reason,
          evidence: row.evidenceLabel,
        }),
      ),
    ),
    dom: withDom ? harness.dom() : null,
    stats: harness.panel.getStats(),
  });
}

export function runProfilePanelReport(): ProfilePanelReport {
  const illustrativeHarness = createProfilePanelHarness({ open: true }),
    realHarness = createProfilePanelHarness({ open: true }),
    deltaHarness = createProfilePanelHarness({ open: true }),
    reservedHarness = createProfilePanelHarness(),
    identicalHarness = createProfilePanelHarness(),
    throttledHarness = createProfilePanelHarness(),
    rejectedHarness = createProfilePanelHarness();
  try {
    const illustrative = illustrativeSnapshot(),
      realProfileValue = realProfile({ omit: ['speed_delta_residential'] }),
      real = frameOf(realProfileValue),
      versioned = realSnapshot(),
      reservedProfile = realProfile({ values: { speed_delta_arterial: 12 } }),
      reserved = frameOf(reservedProfile);
    illustrativeHarness.panel.update(illustrative, 0);
    realHarness.panel.update(real, 0);
    deltaHarness.panel.update(versioned, 0);
    reservedHarness.panel.update(reserved, 0);

    identicalHarness.panel.update(versioned, 0);
    const identicalWrites = identicalHarness.panel.getStats().writes,
      identicalUpdates = identicalHarness.panel.getStats().updates,
      identicalDom = identicalHarness.dom();
    identicalHarness.panel.update(versioned, 500);
    const identicalAfterWrites = identicalHarness.panel.getStats().writes,
      identicalSkipped = identicalHarness.panel.getStats().skipped,
      identicalDomAfter = identicalHarness.dom();

    throttledHarness.panel.update(versioned, 0);
    const firstWrites = throttledHarness.panel.getStats().writes;
    for (let index = 0; index < 60; index += 1) {
      throttledHarness.panel.update(
        {
          ...versioned,
          tick: 11 + index,
          parameters: Object.freeze(
            versioned.parameters.map((parameter) =>
              parameter.key === 'speed_delta_urban'
                ? Object.freeze({ ...parameter, uncertainty: 0.25 + index / 1000 })
                : parameter,
            ),
          ),
        },
        16 * (index + 1),
      );
    }
    const throttledStats = throttledHarness.panel.getStats(),
      throttledScenario = scenarioOf('60 cadre · plafon 10 Hz', versioned, throttledHarness),
      bypassBefore = throttledStats.updates as number;
    throttledHarness.panel.update(
      frameOf(
        realProfile({ versionId: 'style:077:v9', parentVersionId: 'style:077:v2' }),
        null,
        100,
      ),
      961,
    );
    const bypassAfter = throttledHarness.panel.getStats().updates as number;

    rejectedHarness.panel.update(versioned, 0);
    const rejectedDom = rejectedHarness.dom(),
      rejectedWrites = rejectedHarness.panel.getStats().writes;
    let rejectedCount = 0;
    for (const attempt of [
      () =>
        rejectedHarness.panel.update(
          { ...versioned, version: '076-map-selection-v1' } as unknown as ProfilePanelSnapshot,
          10,
        ),
      () => rejectedHarness.panel.update({ ...versioned, tick: 9 }, 20),
      () => rejectedHarness.panel.update({ ...versioned, tick: 11 }, -1),
    ]) {
      try {
        attempt();
      } catch {
        rejectedCount += 1;
      }
    }
    const rejectedDomAfter = rejectedHarness.dom(),
      rejectedWritesAfter = rejectedHarness.panel.getStats().writes;

    const illustrativeView = projectProfilePanel(illustrative, parameterDefinitions),
      realView = projectProfilePanel(real, parameterDefinitions),
      deltaView = projectProfilePanel(versioned, parameterDefinitions),
      reservedView = projectProfilePanel(reserved, parameterDefinitions),
      urban = realView.rows.find((row) => row.key === 'speed_delta_urban')!,
      unobserved = realView.rows.find((row) => row.key === 'speed_delta_residential')!,
      curve = realView.rows.find((row) => row.key === 'curve_lateral_accel')!,
      arterial = reservedView.rows.find((row) => row.key === 'speed_delta_arterial')!,
      arterialRaw = reserved.parameters.find(
        (parameter) => parameter.key === 'speed_delta_arterial',
      )!,
      zeroDelta = deltaView.delta?.rows.find((row) => row.key === 'speed_delta_urban'),
      categories = illustrativeView.sections.map((section) => section.category),
      reservedProbe = Object.freeze(
        versioned.parameters.map((parameter) =>
          parameter.key === 'speed_delta_arterial'
            ? Object.freeze({
                ...parameter,
                status: 'OBSERVED' as const,
                value: 5,
                source: 'BASE' as const,
                reason: 'PROFILE_VALUE_BASE' as const,
                learnable: true,
              })
            : parameter,
        ),
      );

    let reservedParserRejected = false;
    try {
      parseProfilePanelSnapshot({ ...versioned, parameters: reservedProbe }, parameterDefinitions);
    } catch {
      reservedParserRejected = true;
    }
    let baseMismatchRejected = false;
    try {
      frameOf(
        reservedProfile,
        realProfileDelta(
          reservedProfile,
          [{ key: 'following_time_headway', previous: 4, next: 1.4 }],
          { baseVersionId: 'style:077:v0' },
        ),
      );
    } catch {
      baseMismatchRejected = true;
    }
    const reservedDelta = realProfileDelta(reservedProfile, [
        { key: 'speed_delta_arterial', previous: 5, next: 12 },
        { key: 'following_time_headway', previous: 1.8, next: 1.4 },
      ]),
      reservedDeltaFrame = frameOf(reservedProfile, reservedDelta);
    const stableHarness = createProfilePanelHarness();
    stableHarness.panel.update(versioned, 0);
    const stableRow = stableHarness.rowFor('curve_lateral_accel'),
      stableCreated = stableHarness.panel.getStats().createdRows;
    stableHarness.panel.update(
      frameOf(realProfile({ evidence: { curve_lateral_accel: { uncertainty: 0.4 } } })),
      2_000,
    );
    const stableSame = stableHarness.rowFor('curve_lateral_accel') === stableRow,
      stableAfter = stableHarness.panel.getStats().createdRows;
    stableHarness.panel.dispose();

    const scenarios = Object.freeze([
      scenarioOf(
        'ilustrativ · fără profil publicat',
        illustrative,
        illustrativeHarness,
        FOCUS_KEYS,
        true,
      ),
      scenarioOf(
        'profil real · zero, incertitudine, neobservat',
        real,
        realHarness,
        FOCUS_KEYS,
        true,
      ),
      scenarioOf('delta · versiune derivată', versioned, deltaHarness, FOCUS_KEYS, true),
      scenarioOf('rezervat · valoare numerică în record', reserved, reservedHarness),
      scenarioOf('cadru identic · nicio scriere', versioned, identicalHarness),
      throttledScenario,
      scenarioOf('cadru respins · DOM neatins', versioned, rejectedHarness),
    ]);

    const checks = [
      check('contract-version', PROFILE_PANEL_VERSION, PROFILE_PANEL_VERSION, '077 contract'),
      check(
        'catalog-coverage',
        80,
        illustrativeView.counts.total,
        'every real catalog key has exactly one row',
      ),
      check(
        'illustrative-banner',
        PROFILE_PANEL_ILLUSTRATIVE_BANNER,
        illustrativeView.banner ?? 'missing',
        'the preview states that no profile version was published',
      ),
      check(
        'illustrative-no-profile',
        true,
        illustrative.profile === null && illustrative.illustrative,
        'no published identity is claimed',
      ),
      check(
        'illustrative-no-observed',
        0,
        illustrativeView.counts.observed,
        'catalog defaults are never marked as observed or learned',
      ),
      check('illustrative-unobserved', 24, illustrativeView.counts.unobserved, '24 M keys'),
      check('illustrative-reserved', 56, illustrativeView.counts.reserved, '56 R keys'),
      check(
        'illustrative-zero-not-value',
        'Neobservat',
        illustrativeView.rows.find((row) => row.key === 'speed_delta_urban')?.valueLabel ??
          'missing',
        'a catalog default of 0 is not displayed as an observed zero',
      ),
      check(
        'counts-sum',
        80,
        illustrativeView.counts.observed +
          illustrativeView.counts.unobserved +
          illustrativeView.counts.reserved,
        'every row has exactly one state',
      ),
      check(
        'real-clears-illustrative',
        false,
        realView.illustrative,
        'a published profile is never marked illustrative',
      ),
      check('real-banner-null', true, realView.banner === null, 'the banner is absent'),
      check('real-zero-observed', 'OBSERVED', urban.status, 'a real zero is observed'),
      check('real-zero-value', 0, urban.value ?? -1, 'value 0 is kept'),
      check('real-zero-label', '0', urban.valueLabel, 'a real zero is formatted as 0'),
      check('real-zero-display', '0 m/s', urban.displayValue, 'the unit is explicit'),
      check(
        'registry-catalog',
        80,
        projectProfilePanel(
          readProfilePanelSnapshot(
            { catalog: parameterRegistry },
            {
              tick: 10,
              profile: realProfile(),
              sessionId: PROFILE_PANEL_SESSION,
              worldEpoch: PROFILE_PANEL_EPOCH,
            },
          ),
          parameterDefinitions,
        ).counts.total,
        'parameterRegistry is accepted as the catalog source',
      ),
      check(
        'unobserved-explicit-null',
        true,
        unobserved.status === 'UNOBSERVED' && unobserved.value === null,
        'an absent record value is null, not 0',
      ),
      check('unobserved-label', 'Neobservat', unobserved.valueLabel, 'explicit unobserved text'),
      check('uncertainty-display', '±0.25', curve.uncertaintyLabel, 'uncertainty is shown'),
      check('evidence-display', '4 dovezi', curve.evidenceLabel, 'evidence count is shown'),
      check('source-display', 'Învățat', curve.sourceLabel, 'learned provenance is shown'),
      check(
        'reserved-record-value',
        12,
        reservedProfile.parameters.speed_delta_arterial ?? -1,
        'the record carries a number for the R key',
      ),
      check('reserved-status', 'RESERVED', arterial.status, 'an R key is always RESERVED'),
      check('reserved-value-null', true, arterial.value === null, 'the R value is not published'),
      check('reserved-not-learnable', false, arterial.learnable, 'an R key is not learnable'),
      check('reserved-source-null', true, arterialRaw.source === null, 'no provenance is claimed'),
      check('reserved-reason', 'RESERVED_V1', arterialRaw.reason, 'closed V1 reason'),
      check(
        'reserved-parser-rejects',
        true,
        reservedParserRejected,
        'a frame that marks an R key observed is rejected',
      ),
      check('delta-changed', 2, deltaView.counts.changed, 'the derived version changes two keys'),
      check(
        'delta-zero-change',
        '0.5 m/s → 0 m/s',
        zeroDelta?.changeLabel ?? 'missing',
        'a real zero is a change',
      ),
      check(
        'delta-reason',
        'Distanță mai mică în mers',
        zeroDelta?.reason ?? 'missing',
        'the reason is kept verbatim',
      ),
      check(
        'delta-reserved-excluded',
        1,
        reservedDeltaFrame.delta?.changes.length ?? -1,
        'the R change is excluded from learned changes',
      ),
      check('delta-base-rejected', true, baseMismatchRejected, 'a foreign base is a closed error'),
      check('stable-rows', stableCreated, stableAfter, 'content updates reuse the same nodes'),
      check('stable-node-identity', true, stableSame, 'the row element is the exact same object'),
      check(
        'identical-frame-writes',
        identicalWrites,
        identicalAfterWrites,
        'an identical frame writes nothing',
      ),
      check(
        'identical-frame-updates',
        identicalUpdates,
        identicalHarness.panel.getStats().updates,
        'an identical frame does not count as a render',
      ),
      check('identical-frame-skipped', 1, identicalSkipped, 'the repeated frame is skipped'),
      check('identical-frame-dom', identicalDom, identicalDomAfter, 'the DOM stays byte-identical'),
      check(
        'throttled-updates',
        true,
        (throttledStats.updates as number) <= 10,
        `60 frames at 16 ms produced ${throttledStats.updates as number} updates`,
      ),
      check(
        'throttled-skipped',
        true,
        (throttledStats.skipped as number) >= 45,
        'the ceiling skips the frames it cannot write',
      ),
      check(
        'version-bypass',
        bypassBefore + 1,
        bypassAfter,
        'a version change is not delayed by the ceiling',
      ),
      check(
        'throttled-writes',
        true,
        (throttledHarness.panel.getStats().writes as number) > (firstWrites as number),
        'the accepted frames did write text',
      ),
      check('rejected-frames', 3, rejectedCount, 'three malformed/stale frames throw'),
      check(
        'rejected-dom',
        rejectedDom,
        rejectedDomAfter,
        'a rejected frame never touches the DOM',
      ),
      check(
        'rejected-writes',
        rejectedWrites,
        rejectedWritesAfter,
        'a rejected frame writes nothing',
      ),
      check(
        'no-listeners',
        0,
        illustrativeHarness.panel.getStats().listeners,
        'no global or local key listener',
      ),
      check(
        'no-controls',
        false,
        illustrativeHarness
          .rows()
          .some((row) => row.children.some((child) => child.tagName === 'button')),
        'the panel cannot mutate a profile',
      ),
      check(
        'category-order',
        'Viteză și ritm → Pickup și confortul pasagerilor',
        `${categories[0] ?? 'missing'} → ${categories.at(-1) ?? 'missing'}`,
        'sections follow the catalog order',
      ),
      check(
        'dom-row-count',
        80,
        (illustrativeHarness.dom().match(/class="profile-panel__row"/g) ?? []).length,
        'all 80 catalog keys are rendered',
      ),
      check(
        'deterministic-dom',
        deltaHarness.dom(),
        (() => {
          const repeat = createProfilePanelHarness({ open: true });
          repeat.panel.update(versioned, 0);
          const dom = repeat.dom();
          repeat.panel.dispose();
          return dom;
        })(),
        'the same frame renders byte-identical DOM',
      ),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return Object.freeze({
      version: PROFILE_PANEL_VERSION,
      contract: Object.freeze({
        states: Object.freeze([
          'OBSERVED - the published record has a value for the key; a real 0 is displayed as 0',
          'UNOBSERVED - no value in the record; value is null and displayed as Neobservat',
          'RESERVED - an R/extension key; always null, not learnable in V1, even with a numeric record value',
        ]),
        rules: Object.freeze([
          'illustrative frames use the real catalog defaults and never claim a publication',
          'reserved keys never appear as learned delta changes',
          'a delta must use the exact parent of the rendered version',
          'evidence is shown only from the record; a missing count is 0',
          'the panel has no controls and never mutates, publishes or activates a profile',
        ]),
        banner: PROFILE_PANEL_ILLUSTRATIVE_BANNER,
        limits: Object.freeze({
          maximumHz: PROFILE_PANEL_LIMITS.maximumHz,
          parameters: PROFILE_PANEL_LIMITS.parameters,
          deltaChanges: PROFILE_PANEL_LIMITS.deltaChanges,
          idCodeUnits: PROFILE_PANEL_LIMITS.idCodeUnits,
          decimals: PROFILE_PANEL_LIMITS.decimals,
        }),
      }),
      scenarios,
      checks: Object.freeze(checks),
      summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
    });
  } finally {
    illustrativeHarness.panel.dispose();
    realHarness.panel.dispose();
    deltaHarness.panel.dispose();
    reservedHarness.panel.dispose();
    identicalHarness.panel.dispose();
    throttledHarness.panel.dispose();
    rejectedHarness.panel.dispose();
  }
}

export function profilePanelReportMarkdown(report: ProfilePanelReport): string {
  const scenarioSections = report.scenarios
      .map(
        (entry) => `### ${entry.name}

| Value | Result |
| --- | --- |
| Illustrative | ${entry.illustrative} |
| Version | ${entry.profileVersion} |
| Observed / unobserved / reserved | ${entry.counts.observed} / ${entry.counts.unobserved} / ${entry.counts.reserved} |
| Changed | ${entry.counts.changed} |
| Banner | ${entry.banner ?? '—'} |
| Summary | ${entry.summary} |

| # | Key | State | Value | Uncertainty | Evidence | Source | Learnable |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${entry.rows
  .map(
    (row, index) =>
      `| ${index + 1} | ${row.key} | ${row.status} | ${row.display} | ${row.uncertainty} | ${row.evidence} | ${row.source} | ${row.learnable ? 'yes' : 'no'} |`,
  )
  .join('\n')}

${entry.delta.length === 0 ? 'No learned delta rows.' : ''}
${entry.delta
  .map((row) => `- ${row.key}: ${row.change}; ${row.reason}; ${row.evidence}`)
  .join('\n')}

${
  entry.dom === null
    ? ''
    : `\`\`\`html
${entry.dom}
\`\`\`
`
}
`,
      )
      .join('\n'),
    checkRows = report.checks
      .map(
        (entry) =>
          `| ${entry.name} | ${String(entry.expected)} | ${String(entry.actual)} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.detail} |`,
      )
      .join('\n');
  return `# 077 profile panel report

Machine-readable transcript: [report.json](report.json). Generated by \`npm run profile:panel\`; it
contains no wall-clock value, random value or browser-only state.

Version: \`${report.version}\`. The report drives the real \`createProfilePanel\` adapter over the
real catalog defaults and a real 109-style \`DrivingProfile\`.

## Contract

States: ${report.contract.states.join('; ')}.

Rules: ${report.contract.rules.join('; ')}.

Banner: \`${report.contract.banner}\`.

Limits: ${report.contract.limits.maximumHz} Hz write ceiling, ${report.contract.limits.parameters} catalog keys, ${report.contract.limits.deltaChanges} delta changes and ${report.contract.limits.decimals} decimals.

${scenarioSections}
## Checks

| Check | Expected | Actual | Result | Detail |
| --- | --- | --- | --- | --- |
${checkRows}

## Summary

- Checks: ${report.summary.passed}/${report.summary.checks}
- Overall: ${report.summary.pass ? 'PASS' : 'FAIL'}
`;
}
