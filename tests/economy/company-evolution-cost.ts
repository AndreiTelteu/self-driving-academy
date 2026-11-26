import {
  COMPANY_UPGRADES,
  COMPANY_VEHICLE_OFFERS,
  ECONOMY_CLOCK,
  createCompanyEvolution,
  createCompanyLedger,
  ticksPerMonth,
} from '../../src/economy';
import { createFleetRegistry } from '../../src/fleet';

export const COMPANY_EVOLUTION_COST_VERSION = '269-company-evolution-cost-v1' as const;

export interface CompanyEvolutionCostReport {
  readonly version: typeof COMPANY_EVOLUTION_COST_VERSION;
  readonly protocol: Readonly<{
    warmupIterations: number;
    readIterations: number;
    rideIterations: number;
    tickHz: number;
    budgetMs: number;
    baselineReference: string;
    note: string;
  }>;
  readonly read: Readonly<{
    samples: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }>;
  readonly rideWithModifier: Readonly<{
    samples: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }>;
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

function ride(ledger: ReturnType<typeof createCompanyLedger>, id: string, atTick: number): void {
  const outcome = ledger.postRide({
    rideId: id,
    requestId: `request:${id}`,
    taxiId: 'taxi-269-cost',
    tick: atTick,
    terminalState: 'COMPLETED',
    passengerAboard: true,
    plannedDistanceMeters: 5_000,
    revenueMinorUnits: 1_000,
    revenueSettlementId: `settlement:${id}`,
  });
  if (outcome.status !== 'ACCEPTED') throw new Error(`Cost ride ${id} was not accepted`);
}

/**
 * Headless subsystem cost of the 269 evolution: the read model PBI 270 will call and the
 * with-modifier ride path. It is not an FPS/GPU/hardware certificate; it is the additional company
 * work measured on the same deterministic 268 ledger.
 */
export function measureCompanyEvolutionCost(): CompanyEvolutionCostReport {
  const fleet = createFleetRegistry({
      schemaVersion: 1,
      units: 'SI',
      sessionId: 'session-269-cost',
      worldEpoch: 1,
      scenarioId: 'scenario-269-cost',
      seed: 269,
      namespace: 'cost:company:evolution:fleet',
      taxiCount: 20,
      civilianCount: 20,
      profile: { profileId: 'v3-city-style', versionId: 'v3-city-style-v1' },
    }),
    ledger = createCompanyLedger({ namespace: 'cost:company:evolution' }),
    evolution = createCompanyEvolution({ ledger, fleet, namespace: 'cost:company:evolution' });
  try {
    for (let index = 0; index < 12; index += 1)
      ride(ledger, `ride-269-cost-profit-${index}`, 100 + index);
    const purchase = evolution.purchase(COMPANY_VEHICLE_OFFERS[0]!.offerId, 350),
      upgrade = evolution.upgrade(
        COMPANY_UPGRADES.find((entry) => entry.upgradeId === 'upgrade-service-contract')!.upgradeId,
        400,
      );
    if (purchase.status !== 'ACCEPTED' || upgrade.status !== 'ACCEPTED')
      throw new Error('Company evolution cost fixture was not prepared');

    const warmupIterations = 100,
      readIterations = 3_000,
      rideIterations = 900,
      monthTicks = ticksPerMonth(ECONOMY_CLOCK),
      readSamples: number[] = [],
      rideSamples: number[] = [];
    for (let index = 0; index < warmupIterations; index += 1) evolution.read(monthTicks + index);
    for (let index = 0; index < readIterations; index += 1) {
      const started = nowMs();
      evolution.read(monthTicks + index);
      readSamples.push(nowMs() - started);
    }
    for (let index = 0; index < rideIterations; index += 1) {
      const started = nowMs();
      ride(ledger, `ride-269-cost-effect-${index}`, monthTicks + index);
      rideSamples.push(nowMs() - started);
    }
    const sortedRead = [...readSamples].sort((left, right) => left - right),
      sortedRide = [...rideSamples].sort((left, right) => left - right),
      readP95 = percentile(sortedRead, 0.95),
      rideP95 = percentile(sortedRide, 0.95),
      budgetMs = 8,
      pass = readP95 < budgetMs && rideP95 < budgetMs;
    return Object.freeze({
      version: COMPANY_EVOLUTION_COST_VERSION,
      protocol: Object.freeze({
        warmupIterations,
        readIterations,
        rideIterations,
        tickHz: ECONOMY_CLOCK.tickHz,
        budgetMs,
        baselineReference:
          'PBI 268 company step p95 0.0157 ms/tick on the real fixture; this report adds the 269 read and modified-ride costs separately and never subtracts them from that baseline.',
        note: 'Headless Node subsystem measurement on a deterministic ledger and real 057 registry; no renderer, GPU, browser frame or hardware claim.',
      }),
      read: Object.freeze({
        samples: readSamples.length,
        meanMs: rounded(readSamples.reduce((sum, value) => sum + value, 0) / readSamples.length),
        p50Ms: rounded(percentile(sortedRead, 0.5)),
        p95Ms: rounded(readP95),
        maxMs: rounded(sortedRead.at(-1) ?? 0),
      }),
      rideWithModifier: Object.freeze({
        samples: rideSamples.length,
        meanMs: rounded(rideSamples.reduce((sum, value) => sum + value, 0) / rideSamples.length),
        p50Ms: rounded(percentile(sortedRide, 0.5)),
        p95Ms: rounded(rideP95),
        maxMs: rounded(sortedRide.at(-1) ?? 0),
      }),
      budgetShare: rounded(Math.max(readP95, rideP95) / budgetMs),
      pass,
    });
  } finally {
    evolution.dispose();
    ledger.dispose();
    fleet.dispose();
  }
}

export function companyEvolutionCostMarkdown(report: CompanyEvolutionCostReport): string {
  return `# 269 — costul de simulare al evoluției companiei

Generat de \`npm run company:evolution:cost\`. Nu este un certificat FPS/GPU/hardware.

| Metric | Read model | Ride with active modifier |
| --- | ---: | ---: |
| Samples | ${report.read.samples} | ${report.rideWithModifier.samples} |
| Mean | ${report.read.meanMs} ms | ${report.rideWithModifier.meanMs} ms |
| p50 | ${report.read.p50Ms} ms | ${report.rideWithModifier.p50Ms} ms |
| p95 | ${report.read.p95Ms} ms | ${report.rideWithModifier.p95Ms} ms |
| Max | ${report.read.maxMs} ms | ${report.rideWithModifier.maxMs} ms |

Buget de tick: ${report.protocol.budgetMs} ms; share (p95 maxim) ${(report.budgetShare * 100).toFixed(3)}%; ${report.pass ? 'PASS' : 'FAIL'}.

Baseline de referință: ${report.protocol.baselineReference}

${report.protocol.note}
`;
}
