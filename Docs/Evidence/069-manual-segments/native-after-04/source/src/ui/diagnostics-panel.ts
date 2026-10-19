import type { DiagnosticReport } from '../rendering';
/** Dedicated panel, independent of the HUD; aggregation and DOM updates at <=5Hz. */
export function createDiagnosticsPanel(
  host: HTMLElement,
  options: {
    report: () => DiagnosticReport | null;
    setEnabled: (enabled: boolean) => void;
    inspector?: () => Promise<boolean>;
    now?: () => number;
    intervalMs?: number;
  },
) {
  const interval = options.intervalMs ?? 200;
  if (!Number.isFinite(interval) || interval < 200)
    throw new Error('Diagnostics UI interval must be >=200ms');
  const now = options.now ?? (() => performance.now());
  const root = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Diagnostic';
  const table = document.createElement('dl');
  table.setAttribute('aria-label', 'Diagnostic randare');
  root.append(summary, table);
  host.append(root);
  const fields = [
    'Backend',
    'CPU render p95',
    'GPU p95',
    'GPU status',
    'Frame p95',
    'Tick CPU p95',
    'Tick',
    'Debt',
    'Draw calls',
    'Meshes / nodes',
    'Materiale / texturi / geometrii',
    'Bytes în așteptare',
    'Joburi în coadă',
    'Entități',
    'Profil',
    'Worker',
    'Samples / capacitate',
  ] as const;
  const values = fields.map((field) => {
    const label = document.createElement('dt');
    label.textContent = field;
    const value = document.createElement('dd');
    value.textContent = 'Indisponibil';
    table.append(label, value);
    return value;
  });
  let last = -Infinity,
    disposed = false,
    updates = 0,
    writes = 0;
  const changed = () => {
    options.setEnabled(root.open);
    last = -Infinity;
  };
  root.addEventListener('toggle', changed);
  let inspectorButton: HTMLButtonElement | undefined;
  const inspect = () => {
    if (options.inspector)
      void options.inspector().catch(() => {
        if (inspectorButton) inspectorButton.textContent = 'Inspector indisponibil';
      });
  };
  if (options.inspector) {
    inspectorButton = document.createElement('button');
    inspectorButton.type = 'button';
    inspectorButton.textContent = 'Inspector Babylon';
    inspectorButton.addEventListener('click', inspect);
    root.append(inspectorButton);
  }
  options.setEnabled(false);
  return {
    root,
    refresh: () => {
      if (disposed || !root.open) return false;
      const time = now();
      if (time - last < interval) return false;
      last = time;
      const report = options.report();
      if (!report) return false;
      const value = (input: number | null | undefined, suffix = '') =>
        input === null || input === undefined
          ? 'Indisponibil'
          : `${Number(input.toFixed(2))}${suffix}`;
      const r = report.resources,
        c = report.counters;
      const next = [
        report.backend,
        value(report.cpuRenderMs?.p95, ' ms'),
        value(report.gpuMs?.p95, ' ms'),
        report.gpuStatus,
        value(report.frameMs?.p95, ' ms'),
        value(report.tickCpuMs?.p95, ' ms'),
        value(c.tick),
        value(c.debtMs, ' ms'),
        value(r?.drawCalls),
        r ? `${r.meshes} / ${r.nodes}` : 'Indisponibil',
        r ? `${r.materials} / ${r.textures} / ${r.geometries}` : 'Indisponibil',
        value(c.pendingBytes, ' bytes'),
        value(c.queuedJobs),
        value(c.entityCount),
        c.profileVersion ?? 'Indisponibil',
        c.workerState ?? 'Indisponibil',
        `${report.retainedSamples} / ${report.capacity}`,
      ];
      for (let index = 0; index < values.length; index++)
        if (values[index].textContent !== next[index]) {
          values[index].textContent = next[index];
          writes++;
        }
      updates++;
      return true;
    },
    get metrics() {
      return { updates, writes };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      options.setEnabled(false);
      root.removeEventListener('toggle', changed);
      inspectorButton?.removeEventListener('click', inspect);
      root.remove();
    },
  };
}
