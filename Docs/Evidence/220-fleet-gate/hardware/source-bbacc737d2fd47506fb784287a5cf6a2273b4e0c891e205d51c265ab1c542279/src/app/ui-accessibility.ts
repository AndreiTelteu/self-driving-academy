import {
  ACCESSIBILITY_TOKENS,
  ACCESSIBILITY_VERSION,
  PANEL_SURFACES,
  auditPanelAccessibility,
  drivingBlockReason,
  panelDescriptor,
  planPanelTraversal,
  type AccessibilityAudit,
  type AccessibilityContrastMeasurement,
  type AccessibilityIssueCode,
  type AccessibilityMode,
  type AccessibilityTokens,
  type PanelSurfaceDescriptor,
  type PanelTraversalPlan,
} from '../ui';
import type { PauseFocusOwner, PauseFocusSurface } from './pause-focus';

/**
 * 083 accessibility composition. See Docs/ui-accessibility.md.
 *
 * `readAccessibilityReport` audits the real panel descriptors and returns the evidence object; the
 * bridge maps panel open/close to the 070 pause/focus owner without claiming PLAYER. Nothing here
 * drives, changes a profile, moves a camera or writes physics: the bridge only reports surfaces and
 * resets held commands through an injected port.
 */
export const UI_ACCESSIBILITY_REPORT_VERSION = '083-ui-accessibility-report-v1';

/** Every closed issue code blocks the report; there is no advisory tier. */
export const UI_ACCESSIBILITY_BLOCKING_CODES: readonly AccessibilityIssueCode[] = Object.freeze([
  'MISSING_NAME',
  'NO_FOCUSABLE',
  'MISSING_VISIBLE_FOCUS',
  'GLOBAL_KEY_LISTENER',
  'COLOR_ONLY_STATE',
  'LOW_CONTRAST',
  'NOT_KEYBOARD_OPERABLE',
  'MISSING_TYPE_BUTTON',
]);

const MODES: readonly AccessibilityMode[] = ['AUTO', 'MANUAL', 'LEARNING'];

export interface AccessibilityContrastRow {
  readonly pairId: string;
  readonly foreground: string;
  readonly background: string;
  readonly panels: readonly string[];
  readonly ratio: number;
  readonly required: number;
  readonly target: AccessibilityContrastMeasurement['target'];
  readonly pass: boolean;
}

export interface UiAccessibilityPanelReport {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly landmark: string;
  readonly surface: string;
  readonly modal: boolean;
  readonly openKey: string | null;
  readonly closeKey: string | null;
  readonly interactive: boolean;
  readonly focusables: number;
  readonly focusSelector: string;
  readonly traversal: PanelTraversalPlan;
  /** Driving keys blocked while the surface is open, per 070 control mode. */
  readonly drivingWhenOpen: Readonly<Record<AccessibilityMode, boolean>>;
  readonly drivingWhenClosed: boolean;
  readonly contrast: readonly Readonly<{
    pairId: string;
    foreground: string;
    background: string;
    ratio: number;
    required: number;
    pass: boolean;
  }>[];
}

export interface UiAccessibilityReport {
  readonly version: typeof UI_ACCESSIBILITY_REPORT_VERSION;
  readonly contractVersion: typeof ACCESSIBILITY_VERSION;
  readonly pass: boolean;
  readonly tokens: AccessibilityTokens;
  readonly audit: AccessibilityAudit;
  readonly panels: readonly UiAccessibilityPanelReport[];
  readonly contrast: readonly AccessibilityContrastRow[];
  readonly failures: readonly string[];
}

function contrastRows(audit: AccessibilityAudit): AccessibilityContrastRow[] {
  const rows = new Map<
    string,
    { measurement: AccessibilityContrastMeasurement; panels: string[] }
  >();
  for (const panel of audit.panels) {
    for (const measurement of panel.contrast) {
      const key = `${measurement.pairId}|${measurement.foreground}|${measurement.background}`,
        existing = rows.get(key);
      if (existing === undefined) rows.set(key, { measurement, panels: [panel.id] });
      else existing.panels.push(panel.id);
    }
  }
  return [...rows.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, entry]) =>
      Object.freeze({
        pairId: entry.measurement.pairId,
        foreground: entry.measurement.foreground,
        background: entry.measurement.background,
        panels: Object.freeze(entry.panels),
        ratio: entry.measurement.ratio,
        required: entry.measurement.required,
        target: entry.measurement.target,
        pass: entry.measurement.pass,
      }),
    );
}

/**
 * The real audit: every descriptor in `panels` is inspected, and any closed issue makes the report
 * fail. Passing `panels` is the injection point used to prove a broken surface cannot pass.
 */
export function readAccessibilityReport(
  options: Readonly<{ panels?: readonly PanelSurfaceDescriptor[] }> = {},
): UiAccessibilityReport {
  const panels = options.panels ?? PANEL_SURFACES;
  if (!Array.isArray(panels)) throw new Error('Panel descriptors must be an array');
  const audit = auditPanelAccessibility(panels, ACCESSIBILITY_TOKENS),
    failures: string[] = audit.issues.map(
      (issue) => `${issue.code}: ${issue.panelId}: ${issue.detail}`,
    );
  if (panels.length === 0) failures.push('NO_PANELS: no panel descriptor supplied');
  const reportPanels: UiAccessibilityPanelReport[] = audit.panels.map((panel) => {
    const descriptor = panels.find((candidate) => candidate.id === panel.id)!,
      drivingWhenOpen: Record<AccessibilityMode, boolean> = {
        AUTO: drivingBlockReason(panel.id, true, 'AUTO') !== null,
        MANUAL: drivingBlockReason(panel.id, true, 'MANUAL') !== null,
        LEARNING: drivingBlockReason(panel.id, true, 'LEARNING') !== null,
      };
    return Object.freeze({
      id: panel.id,
      name: panel.name,
      role: descriptor.role,
      landmark: descriptor.landmark,
      surface: descriptor.surface,
      modal: descriptor.modal,
      openKey: descriptor.openKey,
      closeKey: descriptor.closeKey,
      interactive: descriptor.interactive,
      focusables: panel.focusables,
      focusSelector: descriptor.focusVisible.selector,
      traversal: planPanelTraversal(panel.id),
      drivingWhenOpen: Object.freeze(drivingWhenOpen),
      drivingWhenClosed: drivingBlockReason(panel.id, false, 'MANUAL') !== null,
      contrast: Object.freeze(
        panel.contrast.map((entry) =>
          Object.freeze({
            pairId: entry.pairId,
            foreground: entry.foreground,
            background: entry.background,
            ratio: entry.ratio,
            required: entry.required,
            pass: entry.pass,
          }),
        ),
      ),
    });
  });
  return Object.freeze({
    version: UI_ACCESSIBILITY_REPORT_VERSION,
    contractVersion: ACCESSIBILITY_VERSION,
    pass: failures.length === 0,
    tokens: ACCESSIBILITY_TOKENS,
    audit,
    panels: Object.freeze(reportPanels),
    contrast: Object.freeze(contrastRows(audit)),
    failures: Object.freeze(failures),
  });
}

/** Throws unless the audit passed; the message is the closed list of real failures. */
export function requireAccessibleUi(report: UiAccessibilityReport): void {
  if (!report.pass) throw new Error(`UI accessibility audit failed: ${report.failures.join('; ')}`);
}

export interface PanelAccessibilityBridgeOptions {
  /** The single 070 pause/focus owner of the session. */
  readonly pauseFocus: PauseFocusOwner;
  /** Host close port, used by `close(panelId)` to hide/close the real panel. */
  readonly closePanel: (panelId: string) => void;
  /** 025 reset port; called when a closing panel releases a suspension. */
  readonly resetHeldCommands?: () => void;
}

export interface PanelAccessibilityBridgeState {
  readonly version: typeof UI_ACCESSIBILITY_REPORT_VERSION;
  readonly openPanels: readonly string[];
  /** The bridge never claims the PLAYER seat; 066 remains the only authority arbiter. */
  readonly claimedPlayer: false;
  readonly lastClosed: string | null;
  readonly disposed: boolean;
}

export interface PanelAccessibilityBridgeStats {
  readonly version: typeof UI_ACCESSIBILITY_REPORT_VERSION;
  readonly opens: number;
  readonly closes: number;
  readonly surfaceCalls: number;
  readonly heldResets: number;
  readonly diagnosticOpens: number;
  readonly claimedPlayer: false;
  readonly disposed: boolean;
}

export interface PanelAccessibilityBridge {
  open(panelId: string): boolean;
  close(panelId: string): boolean;
  isOpen(panelId: string): boolean;
  openPanels(): readonly string[];
  shouldSuspendDriving(mode: AccessibilityMode): boolean;
  getState(): PanelAccessibilityBridgeState;
  getStats(): PanelAccessibilityBridgeStats;
  dispose(): void;
}

/**
 * Maps a panel lifecycle to the 070 owner. Panel/menu surfaces call only `setSurface`; read-only
 * diagnostics are tracked but never touch the owner, so AUTO observation stays live. Closing a
 * suspending surface resets held driving keys through the injected port and never sends a command.
 */
export function createPanelAccessibilityBridge(
  options: PanelAccessibilityBridgeOptions,
): PanelAccessibilityBridge {
  const pauseFocus = options.pauseFocus;
  if (!pauseFocus || typeof pauseFocus.setSurface !== 'function')
    throw new Error('Panel accessibility bridge needs the 070 pause/focus owner');
  if (typeof options.closePanel !== 'function')
    throw new Error('Panel accessibility bridge needs a close panel port');
  const open = new Set<string>();
  let disposed = false,
    opens = 0,
    closes = 0,
    surfaceCalls = 0,
    heldResets = 0,
    diagnosticOpens = 0,
    lastClosed: string | null = null;

  const surfaceOf = (panelId: string): PauseFocusSurface | null => {
    const surface = panelDescriptor(panelId).surface;
    return surface === 'diagnostic' ? null : surface;
  };
  const surfaceStillOpen = (surface: PauseFocusSurface): boolean =>
    [...open].some((panelId) => surfaceOf(panelId) === surface);
  const release = (surface: PauseFocusSurface): void => {
    if (surfaceStillOpen(surface)) return;
    surfaceCalls += 1;
    pauseFocus.setSurface(surface, false);
  };

  return Object.freeze({
    open(panelId: string): boolean {
      if (disposed) throw new Error('Panel accessibility bridge disposed');
      const id = panelDescriptor(panelId).id;
      if (open.has(id)) return false;
      open.add(id);
      opens += 1;
      const surface = surfaceOf(id);
      if (surface === null) diagnosticOpens += 1;
      else {
        surfaceCalls += 1;
        pauseFocus.setSurface(surface, true);
      }
      return true;
    },
    close(panelId: string): boolean {
      if (disposed) throw new Error('Panel accessibility bridge disposed');
      const id = panelDescriptor(panelId).id;
      if (!open.has(id)) return false;
      open.delete(id);
      closes += 1;
      lastClosed = id;
      options.closePanel(id);
      const surface = surfaceOf(id);
      if (surface === null) return true;
      const suspended = drivingBlockReason(id, true, pauseFocus.getState().mode) !== null;
      release(surface);
      if (suspended && options.resetHeldCommands !== undefined) {
        options.resetHeldCommands();
        heldResets += 1;
      }
      return true;
    },
    isOpen: (panelId: string) => open.has(panelDescriptor(panelId).id),
    openPanels: () => Object.freeze([...open]),
    shouldSuspendDriving(mode: AccessibilityMode): boolean {
      if (!MODES.includes(mode)) throw new Error(`Unsupported driving mode: ${String(mode)}`);
      return [...open].some((panelId) => drivingBlockReason(panelId, true, mode) !== null);
    },
    getState: () =>
      Object.freeze({
        version: UI_ACCESSIBILITY_REPORT_VERSION,
        openPanels: Object.freeze([...open]),
        claimedPlayer: false as const,
        lastClosed,
        disposed,
      }),
    getStats: () =>
      Object.freeze({
        version: UI_ACCESSIBILITY_REPORT_VERSION,
        opens,
        closes,
        surfaceCalls,
        heldResets,
        diagnosticOpens,
        claimedPlayer: false as const,
        disposed,
      }),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const surfaces = new Set<PauseFocusSurface>();
      for (const panelId of open) {
        const surface = surfaceOf(panelId);
        if (surface !== null) surfaces.add(surface);
      }
      open.clear();
      if (pauseFocus.getStats().disposed) return;
      for (const surface of surfaces) {
        surfaceCalls += 1;
        pauseFocus.setSurface(surface, false);
      }
    },
  });
}

/** The bridge never claims the PLAYER seat; 066 remains the only authority arbiter. */
export const PANEL_ACCESSIBILITY_BRIDGE_CLAIMS_PLAYER = false as const;
