import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAutonomyScenarios } from './scenario-suite-autonomy';
import { runRideScenarios } from './scenario-suite-rides';
import { runLearningScenarios } from './scenario-suite-learning';
import { runCampaignScenarios } from './scenario-suite-campaign';
import {
  SCENARIO_SUITE_COMMAND,
  SCENARIO_SUITE_GENERATED_BY,
  SCENARIO_SUITE_SEED,
  SCENARIO_SUITE_VERSION,
  absoluteTolerance,
  checkExact,
  checkNumber,
  checkTrue,
  digest,
  familySummaries,
  notRunScenario,
  reuseEntry,
} from './scenario-suite-support';
import type { ScenarioSuiteReport, SuiteReuse, SuiteScenario } from './scenario-suite-support';

/**
 * The PBI 151 V1 scenario suite.
 *
 * It links the four V1 families — autonomy, rides, learning and campaign — behind one reproducible
 * transcript: every executed scenario carries a fixed seed, an explicit input, an expected result
 * and declared tolerances, and a scenario that cannot run is `NOT_RUN` with a reason.
 *
 * Evidence already delivered by other suites is quoted, not copied: the 056 autonomy suite covers
 * the red/green stop-line matrix and its guards, while the 216 regression matrix owns the daily and
 * XP regressions. Those rows are listed as reuse with the committed transcript as the source.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface SerializedReport {
  readonly summary: Readonly<Record<string, unknown>>;
  readonly rows?: readonly Readonly<Record<string, unknown>>[];
  readonly scenarios?: readonly Readonly<Record<string, unknown>>[];
  readonly negativeCases?: readonly Readonly<Record<string, unknown>>[];
  readonly mutationProbes?: readonly Readonly<Record<string, unknown>>[];
  readonly xp?: Readonly<Record<string, unknown>>;
  readonly dependencies?: Readonly<Record<string, unknown>>;
}

function readEvidence(relativePath: string): SerializedReport {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8')) as SerializedReport;
}

export function reuseRegression216(): SuiteReuse {
  const evidence = 'Docs/Evidence/216-v1-regression/report.json';
  const report = readEvidence(evidence);
  const rows = report.rows ?? [];
  const notRun = rows.filter((row) => row.verdict === 'NOT_RUN');
  const summary = report.summary as { rows: number; fail: number; notRun: number };
  const xp = report.xp as { losses: number; fingerprintBefore: string; fingerprintAfter: string };
  const dependencies = report.dependencies as { cycles: readonly unknown[] };
  const referenced = rows
    .filter((row) => ['B5', 'B6', 'B7', 'B8'].includes(String(row.id)))
    .map((row) => String(row.id));
  const checks = [
    checkNumber(
      '216 rows',
      29,
      summary.rows,
      absoluteTolerance(0, 'rânduri', 'matricea 216 are 29 de rânduri'),
      'matricea comisă are 29 de rânduri',
    ),
    checkNumber(
      '216 failures',
      0,
      summary.fail,
      absoluteTolerance(0, 'eșecuri', 'matricea comisă nu are eșecuri'),
      'niciun rând 216 nu este FAIL',
    ),
    checkNumber(
      '216 not-run rows',
      2,
      summary.notRun,
      absoluteTolerance(0, 'rânduri', 'doar playtestul și frame-ul sunt NOT_RUN'),
      'cele două rânduri neexecutate sunt declarate',
    ),
    checkTrue(
      '216 not-run rows carry a reason',
      notRun.every((row) => String(row.notRunReason ?? '').length > 20),
      notRun.length,
      'un rând NOT_RUN are motiv explicit',
    ),
    checkNumber(
      '216 xp losses',
      0,
      xp.losses,
      absoluteTolerance(0, 'pierderi', 'nicio cale de scădere nu pierde XP'),
      'XP fără pierderi în matricea 216',
    ),
    checkExact(
      '216 xp fingerprint unchanged',
      xp.fingerprintBefore,
      xp.fingerprintAfter,
      'amprenta XP este identică înainte/după',
    ),
    checkNumber(
      '216 dependency cycles',
      0,
      dependencies.cycles.length,
      absoluteTolerance(0, 'cicluri', 'graful boardului este aciclic'),
      'nicio dependență ciclică',
    ),
    checkExact(
      '216 daily and XP rows referenced',
      ['B5', 'B6', 'B7', 'B8'],
      referenced,
      'rândurile daily/XP refolosite sunt cele patru rânduri publice',
    ),
  ];
  return reuseEntry({
    source: '216-v1-regression',
    contract: 'Docs/18 (regresia V1) + Docs/Evidence/216-v1-regression/report.json',
    scenarioIds: referenced,
    evidence,
    what: 'Daily 211/212 pozitiv și negativ, XP 213 pozitiv și negativ, amprenta XP fără pierderi și graful boardului. Suita 151 nu reexecută aceste verificări.',
    checks,
  });
}

export function reuseAutonomy056(): SuiteReuse {
  const evidence = 'Docs/Evidence/056-auto-scenarios/report.json';
  const report = readEvidence(evidence);
  const summary = report.summary as {
    scenarios: number;
    scenariosPassed: number;
    negativeCases: number;
    negativeCasesPassed: number;
    mutationProbes: number;
    mutationProbesPassed: number;
    pass: boolean;
  };
  const scenarios = report.scenarios ?? [];
  const negatives = report.negativeCases ?? [];
  const checks = [
    checkExact(
      '056 suite summary',
      true,
      summary.pass,
      'suita 056 este raportată integral trecută',
    ),
    checkNumber(
      '056 scenarios',
      12,
      summary.scenarios,
      absoluteTolerance(0, 'scenarii', 'suita 056 are 12 scenarii'),
      'cele 12 comportamente de autonomie',
    ),
    checkNumber(
      '056 scenarios passed',
      12,
      summary.scenariosPassed,
      absoluteTolerance(0, 'scenarii', 'toate cele 12 scenarii au trecut'),
      'nicio scenă de autonomie nu este declarată fără execuție',
    ),
    checkNumber(
      '056 negative cases',
      10,
      summary.negativeCases,
      absoluteTolerance(0, 'cazuri', 'suita 056 are 10 cazuri negative'),
      'refuzurile explicite de autonomie',
    ),
    checkNumber(
      '056 negative cases passed',
      10,
      summary.negativeCasesPassed,
      absoluteTolerance(0, 'cazuri', 'toate cele 10 cazuri negative au trecut'),
      'fiecare refuz este dovedit',
    ),
    checkExact(
      '056 negative reasons are explicit',
      true,
      negatives.every((entry) => String(entry.actual ?? '').length > 0),
      'fiecare caz negativ raportează rezultatul real',
    ),
    checkExact(
      '056 scenarios have checks',
      true,
      scenarios.every((entry) => Array.isArray(entry.checks) && entry.checks.length > 0),
      'fiecare scenariu 056 are cel puțin o verificare',
    ),
    checkNumber(
      '056 mutation probes',
      5,
      summary.mutationProbesPassed,
      absoluteTolerance(0, 'probe', 'cele 5 probe de mutație sunt respinse'),
      'oracolul 056 respinge implementările plauzibile greșite',
    ),
  ];
  return reuseEntry({
    source: '056-auto-scenarios',
    contract: 'Docs/18 (strategia de validare) + Docs/Evidence/056-auto-scenarios/report.json',
    scenarioIds: scenarios.map((entry) => String(entry.id)),
    evidence,
    what: 'Matricea roșu/verde a semaforului, STOP, urmărire, cedare, schimbare de bandă, recuperare blocată și cele 10 refuzuri explicit. Suita 151 adaugă doar green_start_delay și fereastra de observație, care nu sunt acoperite de 056.',
    checks,
  });
}

export function runScenarioSuite(): ScenarioSuiteReport {
  const scenarios: SuiteScenario[] = [
    ...runAutonomyScenarios(),
    ...runRideScenarios(),
    ...runLearningScenarios(),
    ...runCampaignScenarios(),
    notRunScenario({
      id: 'integration-browser-playtest',
      family: 'AUTONOMY',
      polarity: 'POSITIVE',
      title: 'Playtest în browser: explicații, senzație de condus și HUD',
      contract: 'Docs/18 (QA vizual) + Docs/validation-policy.md',
      input: { browser: 'real', input: 'uman', viewports: ['1280x720', '1920x1080'] },
      reason:
        'Necesită browser real, GPU, input uman și focus fizic. Nivelul suitei este determinist în Node, fără renderer; playtestul rămâne al gate-urilor 153/235 și nu este declarat trecut.',
    }),
  ];
  const families = familySummaries(scenarios);
  const reuse = Object.freeze([reuseRegression216(), reuseAutonomy056()]);
  const executed = scenarios.filter((scenario) => scenario.executed);
  const pass = scenarios.filter((scenario) => scenario.verdict === 'PASS').length;
  const fail = scenarios.filter((scenario) => scenario.verdict === 'FAIL').length;
  const notRun = scenarios.filter((scenario) => scenario.verdict === 'NOT_RUN').length;
  const everyFamilyPositiveAndNegative = families.every(
    (family) => family.positive > 0 && family.negative > 0,
  );
  const allFamiliesCovered = families.every((family) => family.scenarios > 0);

  return Object.freeze({
    version: SCENARIO_SUITE_VERSION,
    generatedBy: SCENARIO_SUITE_GENERATED_BY,
    command: SCENARIO_SUITE_COMMAND,
    oracleRule:
      'Fiecare rezultat așteptat este contractul livrat (oracolul 050, formula 101, tabelul 061 și identitatea 125), nu o copie a valorii observate. Seed fix 151, zero ceas de perete, zero aleator în transcript.',
    seeds: Object.freeze([SCENARIO_SUITE_SEED]),
    scenarios: Object.freeze(scenarios),
    reuse,
    families,
    summary: Object.freeze({
      scenarios: scenarios.length,
      executed: executed.length,
      passed: pass,
      fail,
      notRun,
      positive: scenarios.filter((scenario) => scenario.polarity === 'POSITIVE').length,
      negative: scenarios.filter((scenario) => scenario.polarity === 'NEGATIVE').length,
      families: families.length,
      reuse: reuse.filter((entry) => entry.verdict === 'PASS').length,
      allFamiliesCovered,
      everyFamilyPositiveAndNegative,
      pass:
        fail === 0 &&
        allFamiliesCovered &&
        everyFamilyPositiveAndNegative &&
        reuse.every((entry) => entry.verdict === 'PASS'),
    }),
    reproducibility: Object.freeze({
      runs: 2 as const,
      digest: digest(scenarios),
      rule: 'Două rulări independente ale aceleiași funcții produc același JSON; testul compară cele două transcripturi, iar scriptul compară fișierul comis prin --check.',
    }),
    limitations: Object.freeze([
      'Nivel determinist în Node: fără browser real, GPU, input uman, FPS sau hardware de referință; playtestul este NOT_RUN.',
      'Condusul de autonomie este politica 050 evaluată pe observații authorează, nu fizica Babylon/Rapier live.',
      'Cursa folosește fixture-ul real 057/059/060 din tests/fleet, nu o hartă generată în browser.',
      'Învățarea este pasul candidat 101; publicarea profilului și joburile worker rămân ale modulelor 109/112, nefiind republicate aici.',
      'Campania folosește catalogul authorează 116/125; misiunile zilnice 211 și XP 213 sunt refolosite din transcriptul 216, nu reexecutate.',
      'Suita nu a fost comparată cu un playtest uman și nu pretinde performanță de cadru; gate-urile 153/220/224/235 rămân obligatorii.',
    ]),
  });
}
