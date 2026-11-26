import { createLiveCompanyFinance } from '../../src/economy';
import { createLiveEconomyFixture } from './live-economy-fixture';

export const COMPANY_FINANCE_COST_VERSION = '268-company-finance-cost-v1' as const;

export interface CompanyFinanceCostReport {
  readonly version: typeof COMPANY_FINANCE_COST_VERSION;
  readonly protocol: Readonly<{
    warmupTicks: number;
    measuredTicks: number;
    repetitions: number;
    tickHz: number;
    budgetMs: number;
    baselineReference: string;
    note: string;
  }>;
  readonly fixture: Readonly<{
    seed: number;
    dwellTicks: number;
    civilians: number;
    terminalTick: number;
  }>;
  readonly companyStep: Readonly<{
    samples: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }>;
  readonly amortizedPerTickMs: number;
  readonly budgetShare: number;
  readonly pass: boolean;
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index]!;
}

function rounded(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Headless subsystem cost of the new company port: the company is stepped once per authoritative
 * tick, most ticks carrying no settlement. This is not an FPS/GPU/hardware certificate; it is the
 * additional simulation work the company ledger adds to the existing 155/266 baseline.
 */
export function measureCompanyFinanceCost(): CompanyFinanceCostReport {
  const fixture = createLiveEconomyFixture({ dwellTicks: 24, civilianCount: 20, seed: 268 }),
    company = createLiveCompanyFinance({
      namespace: 'cost:company:268',
      clock: fixture.economy.clock,
    });
  try {
    fixture.runTo(60);
    const target = fixture.firstTarget();
    fixture.board(target);
    fixture.complete(target);
    const terminal = fixture.economyResult();
    if (terminal === null) throw new Error('Company cost fixture produced no terminal step');
    company.step({ atTick: terminal.tick, settlements: terminal.settlements });

    const warmupTicks = 30,
      measuredTicks = 900,
      repetitions = 3,
      samples: number[] = [];
    let atTick = terminal.tick + 1;
    for (let index = 0; index < warmupTicks; index += 1)
      company.step({ atTick: atTick++, settlements: [] });

    const measuredStartedAt = nowMs();
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      for (let index = 0; index < measuredTicks; index += 1) {
        const started = nowMs();
        company.step({ atTick: atTick++, settlements: [] });
        samples.push(nowMs() - started);
      }
    }
    const measuredElapsedMs = nowMs() - measuredStartedAt,
      sorted = [...samples].sort((left, right) => left - right),
      meanMs = samples.reduce((sum, value) => sum + value, 0) / samples.length,
      p95Ms = percentile(sorted, 0.95),
      budgetMs = 8;
    return Object.freeze({
      version: COMPANY_FINANCE_COST_VERSION,
      protocol: Object.freeze({
        warmupTicks,
        measuredTicks: measuredTicks * repetitions,
        repetitions,
        tickHz: fixture.economy.clock.tickHz,
        budgetMs,
        baselineReference:
          'PBI 155 laptop tick p95 0.081 ms/tick (driving baseline, no renderer); the company cost is reported separately and never subtracted from that baseline.',
        note: 'Headless Node subsystem step on the real 265/266 fixture; no renderer, GPU, browser frame or hardware claim.',
      }),
      fixture: Object.freeze({
        seed: 268,
        dwellTicks: 24,
        civilians: 20,
        terminalTick: terminal.tick,
      }),
      companyStep: Object.freeze({
        samples: samples.length,
        meanMs: rounded(meanMs),
        p50Ms: rounded(percentile(sorted, 0.5)),
        p95Ms: rounded(p95Ms),
        maxMs: rounded(sorted.at(-1) ?? 0),
      }),
      amortizedPerTickMs: rounded(measuredElapsedMs / samples.length),
      budgetShare: rounded(p95Ms / budgetMs),
      pass: p95Ms < budgetMs,
    });
  } finally {
    company.dispose();
    fixture.dispose();
  }
}

export function companyFinanceCostMarkdown(report: CompanyFinanceCostReport): string {
  return `# 268 — costul de simulare al companiei

Generat de \`npm run company:finance:cost\`. Nu este un certificat FPS/GPU/hardware.

| Metric | Value |
| --- | ---: |
| Samples | ${report.companyStep.samples} |
| Mean | ${report.companyStep.meanMs} ms |
| p50 | ${report.companyStep.p50Ms} ms |
| p95 | ${report.companyStep.p95Ms} ms |
| Max | ${report.companyStep.maxMs} ms |
| Tick budget | ${report.protocol.budgetMs} ms |
| Budget share (p95) | ${(report.budgetShare * 100).toFixed(3)}% |
| Pass | ${report.pass ? 'PASS' : 'FAIL'} |

Baseline de referință: ${report.protocol.baselineReference}

${report.protocol.note}
`;
}
