/**
 * PBI 154 — contractul determinist al matricei de compatibilitate WebGPU / WebGL 2.
 *
 * Modulul nu atinge DOM-ul, ceasul de perete sau GPU-ul: derivă raportul din observațiile reale
 * consemnate în `browser.json` plus verificările pure de fallback/recuperare. Este folosit de teste,
 * de scriptul de raport și de pagina de harness (doar pentru tipuri).
 */

export const COMPAT_MATRIX_VERSION = 'compat-matrix-v1';
export const COMPAT_COMMAND = 'npm run qa:compat';
/** Gate-urile care rămân responsabile de hardware-ul real și de livrare. */
export const COMPAT_PENDING_GATES = ['220', '224', '235'] as const;

export type CompatBackend = 'WEBGPU' | 'WEBGL2' | 'NONE';
export type CompatPreference = 'AUTO' | 'WEBGPU' | 'WEBGL2';
export type CompatEntry = 'production' | 'compat-harness';
export type CompatVerdict = 'PASS' | 'FAIL';
export type CompatScenario =
  | 'AUTO'
  | 'FORCED_WEBGL2'
  | 'WEBGPU_UNAVAILABLE'
  | 'NO_BACKEND'
  | 'WEBGL1_ONLY'
  | 'RECOVERY_LOSS'
  | 'RECOVERY_FAILURE';

export interface CompatAdapterInfo {
  readonly vendor: string | null;
  readonly architecture: string | null;
  readonly device: string | null;
  readonly description: string | null;
}

export interface CompatGpuInfo {
  readonly source: 'webgpu-adapter' | 'webgl-debug-renderer' | 'unknown';
  /** Eticheta afișată în raport; `unknown` când driverul ascunde numele. */
  readonly label: string;
  readonly webgpu: CompatAdapterInfo | null;
  readonly webglRenderer: string | null;
}

export interface CompatCapabilities {
  readonly userAgent: string;
  readonly browser: string;
  readonly browserVersion: string;
  readonly headless: boolean;
  readonly platform: string;
  readonly secureContext: boolean;
  readonly devicePixelRatio: number;
  readonly webgpu: {
    readonly available: boolean;
    readonly adapter: CompatAdapterInfo | null;
    readonly error: string | null;
  };
  readonly webgl2: {
    readonly available: boolean;
    readonly vendor: string | null;
    readonly renderer: string | null;
  };
  readonly webgl1: { readonly available: boolean };
}

export interface CompatRenderEvidence {
  readonly contextAlive: boolean;
  readonly activeMeshes: number | null;
  readonly framesAdvanced: boolean | null;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface CompatRecoveryObservation {
  readonly preference: CompatPreference;
  readonly backend: CompatBackend;
  readonly lossSignal: 'GPUDevice.destroy' | 'WEBGL_lose_context.loseContext' | 'none';
  readonly stateSequence: readonly string[];
  readonly generationBefore: number;
  readonly generationAfterLoss: number;
  readonly generationAfterRetry: number;
  readonly tickBefore: number;
  readonly tickAfterLoss: number;
  readonly tickAfterRetry: number;
  readonly framesWhileReady: number;
  readonly framesWhileError: number;
  readonly activeMeshes: number;
  readonly framesAdvanced: boolean;
  readonly errorMessage: string | null;
  readonly retryAvailable: boolean;
  readonly rendererReleasedOnError: boolean;
  readonly retryRestored: boolean;
  /** Diagnostic de harness: scena nu e gameplay, dar dovedește că mesh-ul de probă trăiește. */
  readonly diagnostics: {
    readonly meshes: number;
    readonly camera: boolean;
    readonly canvasConnected: boolean;
  } | null;
  readonly pass: boolean;
}

export interface CompatObservation {
  readonly id: string;
  readonly title: string;
  readonly entry: CompatEntry;
  readonly scenario: CompatScenario;
  readonly preference: CompatPreference;
  readonly capabilities: CompatCapabilities;
  readonly backend: CompatBackend;
  readonly statusText: string | null;
  readonly visibleContent: boolean;
  readonly retryVisible: boolean;
  readonly errorMessage: string | null;
  readonly renderEvidence: CompatRenderEvidence;
  readonly recovery: CompatRecoveryObservation | null;
  readonly screenshots: readonly string[];
  readonly pageErrors: readonly string[];
}

export interface CompatCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CompatRow {
  readonly id: string;
  readonly title: string;
  readonly entry: CompatEntry;
  readonly scenario: CompatScenario;
  readonly preference: CompatPreference;
  readonly browser: string;
  readonly channel: 'headed' | 'headless';
  readonly os: string;
  readonly gpu: CompatGpuInfo;
  readonly expectedBackend: CompatBackend;
  readonly backend: CompatBackend;
  readonly verdict: CompatVerdict;
  readonly checks: readonly CompatCheck[];
  readonly recovery: CompatRecoveryObservation | null;
  readonly screenshots: readonly string[];
}

export interface CompatDeclaredRow {
  readonly id: string;
  readonly browser: string;
  readonly os: string;
  readonly gpu: string;
  readonly status: 'NOT_RUN';
  readonly reason: string;
  readonly owner: string;
}

export interface CompatDeterministicCheck {
  readonly id: string;
  readonly title: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CompatHost {
  readonly os: string;
  readonly cpu: string;
  readonly threads: number;
  readonly memoryGiB: number;
  readonly node: string;
  readonly chromium: string;
}

export interface CompatReport {
  readonly version: string;
  readonly generatedBy: string;
  readonly command: string;
  readonly capturedAt: string;
  readonly host: CompatHost;
  readonly method: readonly string[];
  readonly matrix: readonly CompatRow[];
  readonly declared: readonly CompatDeclaredRow[];
  readonly deterministic: {
    readonly fallback: readonly CompatDeterministicCheck[];
    readonly recovery: readonly CompatDeterministicCheck[];
  };
  readonly summary: {
    readonly rows: number;
    readonly pass: number;
    readonly fail: number;
    readonly declaredNotRun: number;
    readonly deterministicChecks: number;
    readonly deterministicPass: number;
    readonly covered: readonly string[];
    readonly pendingGates: readonly string[];
  };
  readonly gateStatement: string;
  readonly limitations: readonly string[];
}

/** Ordinea reală a politicii din `src/rendering/backend-policy.ts`, proiectată pe capabilități. */
export function expectedBackend(
  capabilities: CompatCapabilities,
  preference: CompatPreference,
): CompatBackend {
  if (preference === 'WEBGL2') return capabilities.webgl2.available ? 'WEBGL2' : 'NONE';
  if (capabilities.webgpu.available && capabilities.webgpu.adapter !== null) return 'WEBGPU';
  return capabilities.webgl2.available ? 'WEBGL2' : 'NONE';
}

export function gpuInfoOf(capabilities: CompatCapabilities): CompatGpuInfo {
  const adapter = capabilities.webgpu.adapter;
  const webglRenderer = capabilities.webgl2.renderer;
  if (adapter !== null) {
    const parts = [
      adapter.vendor,
      adapter.architecture,
      adapter.device,
      adapter.description,
    ].filter((part): part is string => typeof part === 'string' && part.length > 0);
    const adapterLabel = parts.length > 0 ? parts.join(' · ') : 'unknown';
    return {
      source: 'webgpu-adapter',
      label: webglRenderer === null ? adapterLabel : `${adapterLabel} · ${webglRenderer}`,
      webgpu: adapter,
      webglRenderer,
    };
  }
  if (webglRenderer !== null && webglRenderer.length > 0)
    return {
      source: 'webgl-debug-renderer',
      label: webglRenderer,
      webgpu: null,
      webglRenderer,
    };
  return {
    source: 'unknown',
    label: 'unknown',
    webgpu: null,
    webglRenderer: null,
  };
}

function check(name: string, pass: boolean, detail: string): CompatCheck {
  return { name, pass, detail };
}

export function evaluateObservation(observation: CompatObservation): CompatCheck[] {
  const expected = expectedBackend(observation.capabilities, observation.preference);
  const checks: CompatCheck[] = [];
  checks.push(
    check(
      'backend-efectiv',
      observation.backend === expected,
      `așteptat ${expected}, observat ${observation.backend}`,
    ),
  );
  if (expected === 'NONE') {
    const explicit =
      observation.errorMessage !== null && observation.errorMessage.trim().length > 0;
    checks.push(
      check(
        'fara-ecran-gol',
        observation.visibleContent && explicit && observation.retryVisible,
        `conținut vizibil ${observation.visibleContent}, mesaj explicit ${explicit}, reîncercare vizibilă ${observation.retryVisible}`,
      ),
    );
  } else {
    checks.push(
      check(
        'fara-ecran-gol',
        observation.visibleContent && observation.renderEvidence.contextAlive,
        `conținut vizibil ${observation.visibleContent}, context activ ${observation.renderEvidence.contextAlive}`,
      ),
    );
    if (observation.entry === 'compat-harness')
      checks.push(
        check(
          'randare-activa',
          (observation.renderEvidence.activeMeshes ?? 0) > 0 &&
            observation.renderEvidence.framesAdvanced === true,
          `mesh-uri active ${observation.renderEvidence.activeMeshes}, cadre avansate ${observation.renderEvidence.framesAdvanced}`,
        ),
      );
  }
  checks.push(
    check(
      'erori-de-pagina',
      observation.pageErrors.length === 0,
      observation.pageErrors.length === 0
        ? 'nicio eroare de pagină'
        : observation.pageErrors.join(' | '),
    ),
  );
  if (observation.scenario === 'RECOVERY_LOSS' || observation.scenario === 'RECOVERY_FAILURE')
    checks.push(
      check(
        'recuperare',
        observation.recovery !== null && observation.recovery.pass,
        observation.recovery === null
          ? 'lipsă observație de recuperare'
          : `semnal ${observation.recovery.lossSignal}, generații ${observation.recovery.generationBefore}→${observation.recovery.generationAfterLoss}→${observation.recovery.generationAfterRetry}, tick ${observation.recovery.tickBefore}/${observation.recovery.tickAfterLoss}/${observation.recovery.tickAfterRetry}`,
      ),
    );
  return checks;
}

export interface CompatReportInput {
  readonly capturedAt: string;
  readonly host: CompatHost;
  readonly observations: readonly CompatObservation[];
  readonly declared: readonly CompatDeclaredRow[];
  readonly fallback: readonly CompatDeterministicCheck[];
  readonly recovery: readonly CompatDeterministicCheck[];
}

const METHOD: readonly string[] = [
  'Backendul efectiv este raportat de contractele reale din `src/rendering` (`rendererKind`), nu dedus din user-agent.',
  'Combinația browser/OS/GPU vine din `navigator.userAgent`, versiunea raportată de Chromium și driverul expus de `navigator.gpu` / `WEBGL_debug_renderer_info`; când driverul ascunde numele, valoarea este `unknown`.',
  '`production` înseamnă intrarea reală `src/main.ts` (lifecycle 012 + recuperare 020 + view-ul real); `compat-harness` înseamnă aceleași contracte apelate direct, pentru probe de backend și pierdere de dispozitiv.',
  'Fallback forțat: `navigator.gpu` este eliminat înainte de încărcarea modulelor, apoi `AUTO` trebuie să aleagă WebGL 2; cazul fără niciun backend cere un mesaj explicit și buton de reîncercare.',
  'Recuperarea este declanșată nativ: `GPUDevice.destroy()` pe WebGPU și `WEBGL_lose_context.loseContext()` pe WebGL 2, apoi reconstrucția din același checkpoint RAM.',
  'Verificările deterministe (fără GPU) rulează pe contractele pure de politică a backendului și de recuperare; `--check` compară raportul derivat cu fișierele comise.',
];

const LIMITATIONS: readonly string[] = [
  'Un singur GPU real (AMD Radeon Graphics / RDNA-2, iGPU-ul Ryzen 7 7735U) și un singur OS (Windows 11). NVIDIA, Intel, macOS/Metal și Linux/Vulkan rămân NOT_RUN.',
  'Chromium 156 este singurul runtime Playwright instalat; Firefox, WebKit/Safari și Edge stable nu au fost rulate.',
  'Chromium headless rulează WebGL 2 pe SwiftShader (software); rezultatul dovedește fallback-ul și mesajele, nu FPS sau senzația de condus pe GPU.',
  'Pierderea de dispozitiv este injectată deliberat (destroy / lose-context), nu o defectare hardware observată; recuperarea nu măsoară timpul de recompilare a shader-elor.',
  'Scena de probă este un cub iluminat, nu gameplay-ul complet; paritatea vizuală și costul de cadru rămân ale gate-urilor 220, 224 și 235.',
];

/**
 * Combinațiile de referință care nu pot fi rulate pe mașina aceasta. Fiecare are motiv explicit,
 * ca un NOT_RUN să nu fie confundat cu un PASS.
 */
export const COMPAT_DECLARED_MATRIX: readonly CompatDeclaredRow[] = Object.freeze([
  {
    id: 'firefox-stable',
    browser: 'Firefox stable',
    os: 'oricare',
    gpu: 'oricare',
    status: 'NOT_RUN',
    reason:
      'Runtime Firefox nu este instalat în ms-playwright (există doar chromium-1248); nu a fost rulat.',
    owner: '154 (mașină separată sau instalare Playwright Firefox)',
  },
  {
    id: 'webkit-safari',
    browser: 'WebKit / Safari',
    os: 'oricare',
    gpu: 'oricare',
    status: 'NOT_RUN',
    reason: 'Runtime WebKit nu este instalat, iar Safari nu există pe Windows.',
    owner: '154 (hardware macOS)',
  },
  {
    id: 'edge-stable',
    browser: 'Microsoft Edge stable',
    os: 'Windows 11',
    gpu: 'oricare',
    status: 'NOT_RUN',
    reason:
      'Canalul Edge stable nu este instalat; Chromium de test acoperă motorul, nu integrarea Edge.',
    owner: '154 (instalare Edge)',
  },
  {
    id: 'chrome-stable',
    browser: 'Google Chrome stable',
    os: 'Windows 11',
    gpu: 'oricare',
    status: 'NOT_RUN',
    reason:
      'Nu există o instalare Chrome stable separată; Chromium 156 din Playwright este singurul runtime.',
    owner: '154 (instalare Chrome)',
  },
  {
    id: 'windows-nvidia',
    browser: 'Chromium 156',
    os: 'Windows 11',
    gpu: 'NVIDIA (GeForce)',
    status: 'NOT_RUN',
    reason: 'Mașina are un iGPU AMD; nu există GPU NVIDIA pentru proba driverului proprietar.',
    owner: '220 / 224',
  },
  {
    id: 'windows-intel',
    browser: 'Chromium 156',
    os: 'Windows 11',
    gpu: 'Intel (Arc / Iris Xe)',
    status: 'NOT_RUN',
    reason: 'Nu există GPU Intel pe mașină.',
    owner: '220 / 224',
  },
  {
    id: 'macos-metal',
    browser: 'Safari / Chromium',
    os: 'macOS',
    gpu: 'Apple Metal',
    status: 'NOT_RUN',
    reason:
      'Nu există hardware macOS; WebGPU pe Metal și fallback-ul WebGL 2 nu pot fi rulate aici.',
    owner: '224 / 235',
  },
  {
    id: 'linux-vulkan',
    browser: 'Chromium / Firefox',
    os: 'Linux',
    gpu: 'AMD / Intel Vulkan',
    status: 'NOT_RUN',
    reason: 'Nu există hardware Linux; driverul Vulkan și compozitorul nu pot fi verificate aici.',
    owner: '224 / 235',
  },
  {
    id: 'android-chrome',
    browser: 'Chrome Android',
    os: 'Android',
    gpu: 'SoC mobil',
    status: 'NOT_RUN',
    reason: 'Nu există dispozitiv Android; suportul WebGPU mobil rămâne nevalidat.',
    owner: '224 / 235',
  },
  {
    id: 'ios-safari',
    browser: 'Safari iOS',
    os: 'iOS / iPadOS',
    gpu: 'Apple Metal',
    status: 'NOT_RUN',
    reason: 'Nu există dispozitiv iOS; WebGPU și fallback-ul pe WebKit mobil rămân nevalidate.',
    owner: '224 / 235',
  },
  {
    id: 'chromium-headless-webgpu',
    browser: 'Chromium 156 headless',
    os: 'Windows 11',
    gpu: 'SwiftShader',
    status: 'NOT_RUN',
    reason:
      'Chromium headless nu expune un adapter WebGPU utilizabil; pe această configurație se verifică doar fallback-ul WebGL 2 software.',
    owner: '154 (flag-uri headless sau GPU real)',
  },
]);

export function buildCompatReport(input: CompatReportInput): CompatReport {
  const matrix = input.observations.map((observation): CompatRow => {
    const checks = evaluateObservation(observation);
    return {
      id: observation.id,
      title: observation.title,
      entry: observation.entry,
      scenario: observation.scenario,
      preference: observation.preference,
      browser: observation.capabilities.browser,
      channel: observation.capabilities.headless ? 'headless' : 'headed',
      os: observation.capabilities.platform,
      gpu: gpuInfoOf(observation.capabilities),
      expectedBackend: expectedBackend(observation.capabilities, observation.preference),
      backend: observation.backend,
      verdict: checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL',
      checks,
      recovery: observation.recovery,
      screenshots: observation.screenshots,
    };
  });
  const fallback = input.fallback;
  const recovery = input.recovery;
  const deterministic = [...fallback, ...recovery];
  const pass = matrix.filter((row) => row.verdict === 'PASS').length;
  const covered = [
    ...new Set(
      matrix.map(
        (row) => `${row.browser} · ${row.channel} · ${row.os} · ${row.gpu.label} · ${row.backend}`,
      ),
    ),
  ];
  const gateStatement = [
    `Acoperit acum: ${matrix.length} combinații reale (${pass} PASS, ${matrix.length - pass} FAIL), ${covered.length} medii distincte, pe ${input.host.os}.`,
    `Verificări deterministe fără GPU: ${deterministic.filter((entry) => entry.pass).length}/${deterministic.length} trecute.`,
    `Rămâne pentru gate-urile ${COMPAT_PENDING_GATES.join('/')}: hardware de referință NVIDIA/Intel și macOS/Linux, Firefox/WebKit/Safari/Edge, FPS și senzația de condus, soak-ul de 60 de minute și paritatea vizuală completă.`,
  ].join(' ');
  return {
    version: COMPAT_MATRIX_VERSION,
    generatedBy: 'scripts/run-compat-matrix-report.mjs',
    command: COMPAT_COMMAND,
    capturedAt: input.capturedAt,
    host: input.host,
    method: METHOD,
    matrix,
    declared: input.declared,
    deterministic: { fallback, recovery },
    summary: {
      rows: matrix.length,
      pass,
      fail: matrix.length - pass,
      declaredNotRun: input.declared.length,
      deterministicChecks: deterministic.length,
      deterministicPass: deterministic.filter((entry) => entry.pass).length,
      covered,
      pendingGates: [...COMPAT_PENDING_GATES],
    },
    gateStatement,
    limitations: LIMITATIONS,
  };
}

export function verifyCompatReport(report: CompatReport): string[] {
  const issues: string[] = [];
  if (report.version !== COMPAT_MATRIX_VERSION)
    issues.push(`version ${report.version} ≠ ${COMPAT_MATRIX_VERSION}`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(report.capturedAt))
    issues.push(`capturedAt invalid: ${report.capturedAt}`);
  if (report.matrix.length === 0) issues.push('matricea nu conține nicio combinație rulată');
  for (const row of report.matrix) {
    if (row.browser.trim().length === 0) issues.push(`${row.id}: browser lipsă`);
    if (row.os.trim().length === 0 || row.os === 'unknown') issues.push(`${row.id}: OS lipsă`);
    if (row.gpu.label.trim().length === 0) issues.push(`${row.id}: GPU lipsă`);
    if (row.checks.length === 0) issues.push(`${row.id}: nicio verificare`);
    if (row.verdict === 'PASS' && row.checks.some((entry) => !entry.pass))
      issues.push(`${row.id}: verdict PASS cu verificări picate`);
    if (row.scenario.startsWith('RECOVERY') && row.recovery === null)
      issues.push(`${row.id}: scenariu de recuperare fără observație`);
  }
  for (const row of report.declared) {
    if (row.reason.trim().length === 0) issues.push(`${row.id}: NOT_RUN fără motiv`);
    if (row.status !== 'NOT_RUN') issues.push(`${row.id}: combinație declarată trebuie NOT_RUN`);
  }
  for (const entry of [...report.deterministic.fallback, ...report.deterministic.recovery])
    if (entry.detail.trim().length === 0) issues.push(`${entry.id}: verificare fără detaliu`);
  if (report.summary.pass !== report.matrix.filter((row) => row.verdict === 'PASS').length)
    issues.push('summary.pass nu corespunde matricei');
  if (report.summary.rows !== report.matrix.length)
    issues.push('summary.rows nu corespunde matricei');
  if (report.summary.declaredNotRun !== report.declared.length)
    issues.push('summary.declaredNotRun nu corespunde listei declarate');
  if (report.summary.deterministicChecks === 0) issues.push('nicio verificare deterministă');
  return issues;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${row.map(escapeCell).join(' | ')} |`);
  return lines;
}

export function compatReportMarkdown(report: CompatReport): string {
  const lines: string[] = [
    '# Matricea de compatibilitate WebGPU și WebGL 2 (PBI 154)',
    '',
    `Generat de \`${report.generatedBy}\` la \`${report.capturedAt}\`. Comanda: \`${report.command}\`.`,
    '',
    `Gazdă: **${report.host.os}**, ${report.host.cpu}, ${report.host.threads} fire, ${report.host.memoryGiB} GiB RAM, Node ${report.host.node}, Chromium ${report.host.chromium}.`,
    '',
    '## Matricea executată',
    '',
    ...table(
      [
        'ID',
        'Scenariu',
        'Intrare',
        'Browser',
        'Canal',
        'OS',
        'GPU raportat de driver',
        'Backend efectiv',
        'Verdict',
      ],
      report.matrix.map((row) => [
        row.id,
        row.scenario,
        row.entry,
        row.browser,
        row.channel,
        row.os,
        row.gpu.label,
        row.backend,
        row.verdict,
      ]),
    ),
    '',
    '### Verificările fiecărei combinații',
    '',
  ];
  for (const row of report.matrix) {
    lines.push(`- **${row.id}** — ${row.title}`);
    for (const entry of row.checks)
      lines.push(`  - ${entry.pass ? 'PASS' : 'FAIL'} \`${entry.name}\`: ${entry.detail}`);
  }
  lines.push('', '## Fallback și recuperare, determinist (fără GPU)', '');
  lines.push(
    ...table(
      ['ID', 'Verificare', 'Rezultat', 'Detaliu'],
      [...report.deterministic.fallback, ...report.deterministic.recovery].map((entry) => [
        entry.id,
        entry.title,
        entry.pass ? 'PASS' : 'FAIL',
        entry.detail,
      ]),
    ),
  );
  lines.push('', '## Combinații declarate, neexecutate (NOT_RUN)', '');
  lines.push(
    ...table(
      ['ID', 'Browser', 'OS', 'GPU', 'Motiv', 'Responsabil'],
      report.declared.map((row) => [row.id, row.browser, row.os, row.gpu, row.reason, row.owner]),
    ),
  );
  lines.push('', '## Gate de release', '', report.gateStatement, '', '## Metodă', '');
  for (const entry of report.method) lines.push(`- ${entry}`);
  lines.push('', '## Limitări', '');
  for (const entry of report.limitations) lines.push(`- ${entry}`);
  lines.push('');
  return lines.join('\n');
}
