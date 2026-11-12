import '../../../src/style.css';
import {
  contrastRatio,
  createCityDashboard,
  createControlSlidersPanel,
  createFleetPanel,
  createGameSettingsPanel,
  createKpiHistoryPanel,
  createLearningNotifications,
  createMinimap,
  createPanelFocusController,
  createProfilePanel,
  createTaxiHud,
  requiredContrast,
} from '../../../src/ui';
import { notificationFromOutcome } from '../../../src/app';
import {
  UI_QA_LINE_HEIGHT_MAX_FONT_PX,
  UI_QA_SCREEN_READER_MAX_PX,
  UI_QA_SURFACES,
} from '../../ui/ui-qa';
import type {
  UiQClippedText,
  UiQaContrastFailure,
  UiQaControlMeasurement,
  UiQaEssentialMeasurement,
  UiQaKeyboardResult,
  UiQaMeasurement,
  UiQaOverlap,
  UiQaRect,
  UiQaSurfaceMeasurement,
  UiQaTextMeasurement,
  UiQaTextOverlap,
} from '../../ui/ui-qa';
import { thirtyTaxiSnapshot } from '../../ui/fleet-panel-fixture';
import { realSnapshot } from '../../ui/profile-panel-fixture';
import { cityIncident, sevenMetricSnapshot } from '../../ui/city-dashboard-fixture';
import { frame as minimapFrame, readyRoute, sceneOf, twoZoneMap } from '../../ui/minimap-fixture';
import { createKpiHistoryScenario } from '../../ui/kpi-history-fixture';
import { defaultGameDraft } from '../../ui/game-settings-fixture';
import { controlSlidersDraft } from '../../ui/control-sliders-fixture';
import {
  composedOutcome,
  failedOutcome,
  learningJob,
} from '../../ui/learning-notifications-fixture';

/**
 * PBI 153 browser QA stage.
 *
 * The page mounts the **real** components from `src/ui` with the real `src/style.css`: it does not
 * re-create the HUD, the panels or the notifications as static markup. It then measures the real
 * rectangles, fonts, scroll boxes, contrast pairs and focus rings, and returns one
 * `UiQaMeasurement` per scenario. `scripts/run-ui-qa-report.mjs --browser` drives it in Chromium
 * with real Tab/Escape presses and writes the screenshots; nothing here is simulated.
 *
 * `src/` is not modified: every defect the stage reveals is reported, never patched here.
 */

const status = document.querySelector<HTMLParagraphElement>('#qa-status');

// ---------------------------------------------------------------------------------------------
// Real components.
// ---------------------------------------------------------------------------------------------

const hud = createTaxiHud(document.body);
hud.update(
  {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session:153',
    worldEpoch: 1,
    version: '073-taxi-hud-v1',
    tick: 120,
    speedMps: 12.5,
    mode: 'AUTO',
    taxi: {
      vehicleId: 'taxi:153:07',
      slot: 7,
      classId: 'sedan',
      profileId: 'style:153',
      profileVersion: 'style-v4',
    },
    ride: {
      rideId: 'ride:153:7',
      taxiId: 'taxi:153:07',
      state: 'TO_PICKUP',
      pickupZoneId: 'zone:pickup',
      dropoffZoneId: 'zone:dropoff',
      eta: {
        status: 'ESTIMATED',
        reason: null,
        serviceState: 'FREE_FLOW',
        seconds: 125,
        minSeconds: 110,
        maxSeconds: 140,
        remainingDistanceM: 1320,
        progressFraction: 0.42,
      },
    },
  },
  0,
);

const minimapScene = sceneOf(twoZoneMap());
const minimap = createMinimap(document.body, minimapScene.geometry, {
  widthPx: 240,
  heightPx: 240,
});
minimap.update(
  minimapFrame({
    taxi: { vehicleId: 'taxi:153:07', slot: 7 },
    positionM: { x: 15, y: 0, z: -4 },
    headingRad: 0,
    ride: {
      rideId: 'ride:153:7',
      taxiId: 'taxi:153:07',
      state: 'TO_PICKUP',
      pickupZoneId: 'service',
      dropoffZoneId: 'service-2',
    },
    route: readyRoute(['lane-a', 'lane-b']),
  }),
  0,
);

const fleet = createFleetPanel(document.body, { open: false });
fleet.update(thirtyTaxiSnapshot(), 0);

const notifications = createLearningNotifications(document.body, {
  maxActive: 3,
  dismissible: true,
});
const notificationJob = learningJob();
notifications.push(
  notificationFromOutcome(notificationJob, composedOutcome(notificationJob, 1.5), {
    eventId: 'qa:153:result',
    tick: 10,
  }),
  0,
);
notifications.push(
  notificationFromOutcome(notificationJob, failedOutcome(notificationJob, 'error'), {
    eventId: 'qa:153:error',
    tick: 20,
  }),
  100,
);
notifications.push(
  notificationFromOutcome(
    learningJob({ segmentId: 'segment:079:second' }),
    composedOutcome(learningJob({ segmentId: 'segment:079:second' }), 2.1),
    { eventId: 'qa:153:result-second', tick: 30 },
  ),
  200,
);
notifications.update(200);

const profile = createProfilePanel(document.body, { open: false });
profile.update(realSnapshot(), 0);

const city = createCityDashboard(document.body);
city.update(
  sevenMetricSnapshot({
    incidents: [
      cityIncident(),
      cityIncident({
        incidentId: 'blockage:082:2',
        kind: 'BLOCKAGE',
        severity: 'MINOR',
        tick: 120,
        label: 'Blocaj · taxi:082:04',
        detail: '07:00 fără progres pe lane-a',
      }),
      cityIncident({
        incidentId: 'violation:082:3',
        kind: 'VIOLATION',
        severity: 'SEVERE',
        tick: 200,
        vehicleId: 'taxi:082:07',
        label: 'Încălcare · taxi:082:07',
        detail: 'trecere pe roșu',
      }),
      cityIncident({
        incidentId: 'comfort:082:4',
        kind: 'COMFORT',
        severity: 'MINOR',
        tick: 260,
        vehicleId: 'taxi:082:12',
        label: 'Confort · taxi:082:12',
        detail: 'frânare bruscă',
      }),
    ],
  }),
  0,
);

const settingsDraft = defaultGameDraft();
const settings = createGameSettingsPanel(document.body, settingsDraft, {});
settings.update(settingsDraft, 0);

const camera = createControlSlidersPanel(document.body, controlSlidersDraft(), {
  close: () => {
    // 229 routes Escape and „Închide” through the host port; the QA host owns visibility.
    surfaceElement('camera').hidden = true;
  },
});
camera.update(controlSlidersDraft(), 0);

const kpiScenario = createKpiHistoryScenario();
const kpis = createKpiHistoryPanel(document.body, { read: () => kpiScenario.selection() });
const kpiTrigger = kpis.getTrigger();
kpiTrigger.hidden = true;
kpis.getPanel().setAttribute('data-qa-surface', 'kpis');

/** 083 owns the focus trap; the QA host is the one that shows and hides the panels. */
const focus = createPanelFocusController(document.body, {
  close: () => closeModals(),
});

// ---------------------------------------------------------------------------------------------
// Visibility of the centre surfaces.
// ---------------------------------------------------------------------------------------------

function surfaceElement(id: string): HTMLElement {
  const definition = UI_QA_SURFACES.find((surface) => surface.id === id);
  if (definition === undefined) throw new Error(`Unknown QA surface: ${id}`);
  const element = document.querySelector<HTMLElement>(definition.selector);
  if (element === null) throw new Error(`QA surface is not mounted: ${id}`);
  return element;
}

const modalElements = new Map<string, HTMLElement>([
  ['profile', surfaceElement('profile')],
  ['city', surfaceElement('city')],
  ['settings', surfaceElement('settings')],
  ['camera', surfaceElement('camera')],
]);

function hideModals(): void {
  for (const [id, element] of modalElements) {
    if (id === 'profile') profile.close();
    if (id === 'camera') camera.closePanel();
    element.hidden = true;
  }
}

hideModals();

function closeModals(): void {
  hideModals();
  kpis.close();
}

function prepare(scenarioId: string): { trapExpected: boolean; scenario: string } {
  hideModals();
  fleet.close();
  kpis.close();
  notifications.update(1000);
  // The real driving layout always shows the fleet column in the left lane (084); the `fleet`
  // scenario adds the keyboard focus of the open list on top of it.
  fleet.open();
  let trapExpected = false;
  switch (scenarioId) {
    case 'fleet':
      focus.open('fleet', surfaceElement('fleet'));
      break;
    case 'profile':
      modalElements.get('profile')!.hidden = false;
      profile.open();
      focus.open('profile', surfaceElement('profile'));
      trapExpected = true;
      break;
    case 'city':
      modalElements.get('city')!.hidden = false;
      focus.open('cityDashboard', surfaceElement('city'));
      trapExpected = true;
      break;
    case 'settings':
      modalElements.get('settings')!.hidden = false;
      focus.open('gameSettings', surfaceElement('settings'));
      trapExpected = true;
      break;
    case 'camera':
      modalElements.get('camera')!.hidden = false;
      camera.openPanel();
      trapExpected = true;
      break;
    case 'kpis':
      kpis.open();
      trapExpected = true;
      break;
    default:
      break;
  }
  if (status !== null) status.textContent = `Scenariu ${scenarioId} pregătit.`;
  return { trapExpected, scenario: scenarioId };
}

// ---------------------------------------------------------------------------------------------
// Measurement helpers.
// ---------------------------------------------------------------------------------------------

const round = (value: number): number => Math.round(value * 100) / 100;

function rectOf(element: Element): UiQaRect {
  const rect = element.getBoundingClientRect();
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
    right: round(rect.right),
    bottom: round(rect.bottom),
  };
}

function isRendered(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden) return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)
    return false;
  return element.getClientRects().length > 0;
}

interface MountedSurface {
  readonly id: string;
  readonly element: HTMLElement;
  readonly kind: string;
}

const mounted: MountedSurface[] = UI_QA_SURFACES.map((definition) => ({
  id: definition.id,
  element: surfaceElement(definition.id),
  kind: definition.kind,
}));

function surfaceOf(node: Element | null): string | null {
  if (node === null) return null;
  for (const surface of mounted) if (surface.element.contains(node)) return surface.id;
  return null;
}

function openDialogElement(): HTMLElement | null {
  for (const surface of mounted) {
    if (surface.kind !== 'dialog') continue;
    if (isRendered(surface.element)) return surface.element;
  }
  return null;
}

function descriptorOf(element: Element): string {
  const className =
    typeof element.className === 'string' && element.className.trim() !== ''
      ? `.${element.className.trim().split(/\s+/)[0]}`
      : '';
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  const suffix = text === '' ? '' : ` "${text.length > 32 ? `${text.slice(0, 29)}…` : text}"`;
  return `${element.tagName.toLowerCase()}${className}${suffix}`;
}

function directText(element: Element): string {
  let text = '';
  for (const node of element.childNodes)
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

function parseColour(value: string): { r: number; g: number; b: number; a: number } | null {
  const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (match === null) return null;
  const parts = match[1]!.split(/[,/ ]+/).filter((part) => part !== '');
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map((part) => Number.parseFloat(part));
  const a = parts.length > 3 ? Number.parseFloat(parts[3]!) : 1;
  if (![r, g, b, a].every((part) => part !== undefined && Number.isFinite(part))) return null;
  return { r: r!, g: g!, b: b!, a };
}

const toHex = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');

/** Composite every ancestor background over the page backdrop, the way the browser paints it. */
function backgroundOf(element: Element): string {
  const chain: Element[] = [];
  for (let node: Element | null = element; node !== null; node = node.parentElement)
    chain.push(node);
  let colour = parseColour(getComputedStyle(document.documentElement).backgroundColor) ?? {
    r: 19,
    g: 37,
    b: 31,
    a: 1,
  };
  for (const node of chain.reverse()) {
    const layer = parseColour(getComputedStyle(node).backgroundColor);
    if (layer === null || layer.a === 0) continue;
    colour = {
      r: layer.r * layer.a + colour.r * (1 - layer.a),
      g: layer.g * layer.a + colour.g * (1 - layer.a),
      b: layer.b * layer.a + colour.b * (1 - layer.a),
      a: 1,
    };
  }
  return `#${toHex(colour.r)}${toHex(colour.g)}${toHex(colour.b)}`;
}

function textColourOf(element: Element): string {
  const colour = parseColour(getComputedStyle(element).color);
  if (colour === null) return '#f3f7fb';
  return `#${toHex(colour.r)}${toHex(colour.g)}${toHex(colour.b)}`;
}

function lineHeightRatioOf(element: Element): number | null {
  const style = getComputedStyle(element);
  const fontSize = Number.parseFloat(style.fontSize);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return null;
  return round(lineHeight / fontSize);
}

function measureSurfaces(): UiQaSurfaceMeasurement[] {
  return mounted.map((surface) => {
    const visible = isRendered(surface.element);
    // The fleet column caps the panel and scrolls the inner list; everything else scrolls its own box.
    const scroller =
      surface.id === 'fleet'
        ? (surface.element.querySelector('.fleet-panel__rows') ?? surface.element)
        : surface.element;
    const scroll = visible
      ? {
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          overflowY: getComputedStyle(scroller).overflowY,
          maxHeight: getComputedStyle(surface.element).maxHeight,
        }
      : null;
    return {
      id: surface.id,
      visible,
      hidden: surface.element.hidden !== false,
      rect: visible ? rectOf(surface.element) : null,
      scroll,
      rows:
        surface.id === 'fleet'
          ? surface.element.querySelectorAll('.fleet-panel__item').length
          : null,
    };
  });
}

function measureText(visibleSurfaceIds: readonly string[]): {
  text: UiQaTextMeasurement;
  clipped: UiQClippedText[];
  contrastFailures: UiQaContrastFailure[];
} {
  const textElements: Element[] = [];
  for (const surface of mounted) {
    if (!visibleSurfaceIds.includes(surface.id)) continue;
    for (const element of [surface.element, ...surface.element.querySelectorAll('*')]) {
      if (directText(element) === '') continue;
      if (!isRendered(element)) continue;
      textElements.push(element);
    }
  }
  let minFontPx = Number.POSITIVE_INFINITY;
  let minFontDescriptor = '';
  let minLineHeightRatio = Number.POSITIVE_INFINITY;
  let minLineHeightDescriptor = '';
  const clipped: UiQClippedText[] = [];
  const contrastFailures: UiQaContrastFailure[] = [];
  for (const element of textElements) {
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    const surfaceId = surfaceOf(element) ?? 'body';
    // A decorative, aria-hidden glyph (the notification symbol) carries no information: colour and
    // text already say it. It is excluded from the typography floor, never from the contrast check.
    const decorative = element.getAttribute('aria-hidden') === 'true';
    if (!decorative && Number.isFinite(fontSize) && fontSize < minFontPx) {
      minFontPx = fontSize;
      minFontDescriptor = descriptorOf(element);
    }
    const ratio = lineHeightRatioOf(element);
    if (
      !decorative &&
      ratio !== null &&
      fontSize < UI_QA_LINE_HEIGHT_MAX_FONT_PX &&
      ratio < minLineHeightRatio
    ) {
      minLineHeightRatio = ratio;
      minLineHeightDescriptor = descriptorOf(element);
    }
    const overflowX = style.overflowX;
    if (
      element.clientWidth > UI_QA_SCREEN_READER_MAX_PX &&
      element.clientHeight > UI_QA_SCREEN_READER_MAX_PX &&
      element.scrollWidth > element.clientWidth + 1 &&
      style.textOverflow !== 'ellipsis' &&
      (overflowX === 'visible' || overflowX === 'hidden' || overflowX === 'clip')
    )
      clipped.push({
        surface: surfaceId,
        descriptor: descriptorOf(element),
        text: directText(element).slice(0, 80),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX,
      });
    const foreground = textColourOf(element);
    const background = backgroundOf(element);
    let measured: number;
    try {
      measured = contrastRatio(foreground, background);
    } catch {
      continue;
    }
    const weight = Number.parseInt(style.fontWeight, 10) || 400;
    const required = requiredContrast(Number.isFinite(fontSize) ? fontSize : 16, weight);
    if (measured < required)
      contrastFailures.push({
        surface: surfaceId,
        descriptor: descriptorOf(element),
        foreground,
        background,
        ratio: measured,
        required,
        fontPx: round(Number.isFinite(fontSize) ? fontSize : 0),
      });
  }
  return {
    text: {
      minFontPx: Number.isFinite(minFontPx) ? round(minFontPx) : null,
      minFontDescriptor,
      minLineHeightRatio: Number.isFinite(minLineHeightRatio) ? round(minLineHeightRatio) : null,
      minLineHeightDescriptor,
      textNodes: textElements.length,
    },
    clipped,
    contrastFailures,
  };
}

function inScrollContainer(element: Element, surface: Element): boolean {
  for (let node: Element | null = element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 1)
      return true;
    if (['auto', 'scroll'].includes(style.overflowX) && node.scrollWidth > node.clientWidth + 1)
      return true;
    if (node === surface) return false;
  }
  return false;
}

function measureControls(visibleSurfaceIds: readonly string[]): UiQaControlMeasurement[] {
  const controls: UiQaControlMeasurement[] = [];
  for (const surface of mounted) {
    if (!visibleSurfaceIds.includes(surface.id)) continue;
    const nodes = surface.element.querySelectorAll(
      'button, select, input, textarea, summary, a[href], [role="option"]',
    );
    for (const node of nodes) {
      if (!isRendered(node)) continue;
      const rect = rectOf(node);
      const insideViewport =
        rect.x >= -0.5 &&
        rect.y >= -0.5 &&
        rect.right <= innerWidth + 0.5 &&
        rect.bottom <= innerHeight + 0.5;
      const centreX = Math.min(Math.max(rect.x + rect.width / 2, 0), innerWidth - 1);
      const centreY = Math.min(Math.max(rect.y + rect.height / 2, 0), innerHeight - 1);
      const top = insideViewport ? document.elementFromPoint(centreX, centreY) : null;
      const scrolled = inScrollContainer(node, surface.element);
      const coveredBySurface = top === null ? null : surfaceOf(top);
      const coveredByKind =
        coveredBySurface === null
          ? null
          : (mounted.find((entry) => entry.id === coveredBySurface)?.kind ?? null);
      // A modal dialog over a background control is the declared behaviour of a panel, so it is not
      // a hidden action; the covering surface is still recorded for the report.
      const behindModal = coveredByKind === 'dialog';
      const hitTest =
        !insideViewport ||
        scrolled ||
        behindModal ||
        (top !== null && (top === node || node.contains(top)));
      controls.push({
        surface: surface.id,
        descriptor: descriptorOf(node),
        role: node.tagName.toLowerCase(),
        visible: rect.width > 0 && rect.height > 0,
        enabled: !(node as HTMLButtonElement).disabled,
        rect,
        insideViewport,
        hitTest,
        insideScrollable: scrolled,
        coveredBy:
          top === null || top === node || node.contains(top)
            ? null
            : `${coveredBySurface ?? 'page'}:${descriptorOf(top)}`,
      });
    }
  }
  return controls;
}

function measureTextOverlaps(visibleSurfaceIds: readonly string[]): UiQaTextOverlap[] {
  const overlaps: UiQaTextOverlap[] = [];
  for (const surface of mounted) {
    if (!visibleSurfaceIds.includes(surface.id)) continue;
    const groups = new Map<Element, Element[]>();
    for (const element of [surface.element, ...surface.element.querySelectorAll('*')]) {
      if (directText(element) === '') continue;
      if (!isRendered(element)) continue;
      // Sticky headers and absolute badges are laid out on purpose; only flow text can collide.
      if (getComputedStyle(element).position !== 'static') continue;
      const parent = element.parentElement;
      if (parent === null) continue;
      const siblings = groups.get(parent) ?? [];
      siblings.push(element);
      groups.set(parent, siblings);
    }
    for (const [parent, siblings] of groups) {
      if (siblings.length < 2) continue;
      const display = getComputedStyle(parent).display;
      if (!['grid', 'inline-grid', 'flex', 'inline-flex'].includes(display)) continue;
      for (let left = 0; left < siblings.length; left += 1)
        for (let right = left + 1; right < siblings.length; right += 1) {
          const a = siblings[left]!;
          const b = siblings[right]!;
          const first = a.getBoundingClientRect();
          const second = b.getBoundingClientRect();
          const widthPx = round(
            Math.min(first.right, second.right) - Math.max(first.left, second.left),
          );
          const heightPx = round(
            Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
          );
          if (widthPx <= 1 || heightPx <= 1) continue;
          const areaPx = round(widthPx * heightPx);
          const smallest = Math.min(first.width * first.height, second.width * second.height);
          if (areaPx < 4 || areaPx <= smallest * 0.3) continue;
          overlaps.push({
            surface: surface.id,
            a: descriptorOf(a),
            b: descriptorOf(b),
            widthPx,
            heightPx,
            areaPx,
          });
        }
    }
  }
  return overlaps;
}

function measureOverlaps(visibleSurfaceIds: readonly string[]): UiQaOverlap[] {
  const overlaps: UiQaOverlap[] = [];
  const visible = mounted.filter(
    (surface) => visibleSurfaceIds.includes(surface.id) && isRendered(surface.element),
  );
  for (let left = 0; left < visible.length; left += 1)
    for (let right = left + 1; right < visible.length; right += 1) {
      const a = visible[left]!;
      const b = visible[right]!;
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
      const first = rectOf(a.element);
      const second = rectOf(b.element);
      const widthPx = round(Math.min(first.right, second.right) - Math.max(first.x, second.x));
      const heightPx = round(Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y));
      if (widthPx <= 0 || heightPx <= 0) continue;
      overlaps.push({
        a: a.id,
        b: b.id,
        // A modal covers the background by design, and 084 declares notifications transient; a
        // collision between two permanent surfaces is the only critical case.
        severity:
          a.kind === 'dialog' ||
          b.kind === 'dialog' ||
          a.kind === 'transient' ||
          b.kind === 'transient'
            ? 'transient'
            : 'critical',
        widthPx,
        heightPx,
      });
    }
  return overlaps;
}

const ESSENTIAL_SELECTORS: readonly {
  readonly id: string;
  readonly selector: string | null;
  readonly reason: string | null;
}[] = Object.freeze([
  Object.freeze({ id: 'speed-output', selector: '.taxi-hud__speed output', reason: null }),
  Object.freeze({
    id: 'mode-buttons',
    selector: '.taxi-hud__mode',
    reason:
      'Butoanele M/L sunt compuse de 067 și poziționate de host: componenta nu are reguli în src/style.css.',
  }),
  Object.freeze({ id: 'minimap-status', selector: '.minimap__status', reason: null }),
  Object.freeze({
    id: 'pause-control',
    selector: null,
    reason:
      'Pauza este a meniului de aplicație (src/main.ts + rendering-view), nu o suprafață din src/ui.',
  }),
  Object.freeze({
    id: 'recovery-control',
    selector: null,
    reason:
      'Recuperarea este montată de host în containerul ei (createRecoveryHud nu are stiluri proprii).',
  }),
]);

function measureEssentials(): UiQaEssentialMeasurement[] {
  return ESSENTIAL_SELECTORS.map((entry) => {
    const element = entry.selector === null ? null : document.querySelector(entry.selector);
    const visible = element !== null && isRendered(element);
    return {
      id: entry.id,
      descriptor: element === null ? (entry.selector ?? entry.id) : descriptorOf(element),
      visible,
      rect: element !== null && visible ? rectOf(element) : null,
      owner: entry.reason === null ? ('HARNESS' as const) : ('OWNER_OUTSIDE_QA_HARNESS' as const),
      reason: entry.reason,
    };
  });
}

function focusSnapshot(): {
  descriptor: string;
  surface: string | null;
  native: boolean;
  outlineStyle: string;
  outlineWidthPx: number;
  insideDialog: boolean;
  dialogOpen: boolean;
} {
  const active = document.activeElement;
  const dialog = openDialogElement();
  const style = active === null ? null : getComputedStyle(active);
  return {
    descriptor: active === null || active === document.body ? 'body' : descriptorOf(active),
    surface: surfaceOf(active),
    native:
      active !== null &&
      active.matches('button, select, input, textarea, summary, a[href], [role="option"]'),
    outlineStyle: style?.outlineStyle ?? 'none',
    outlineWidthPx: round(Number.parseFloat(style?.outlineWidth ?? '0') || 0),
    insideDialog: dialog !== null && active !== null && dialog.contains(active),
    dialogOpen: dialog !== null,
  };
}

interface QaStage {
  scenario: string;
  trapExpected: boolean;
}

let current: QaStage = { scenario: 'hud', trapExpected: false };

interface DeclaredViewport {
  readonly id: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly zoom: number;
}

function buildMeasurement(
  keyboard: UiQaKeyboardResult,
  viewport: DeclaredViewport,
): UiQaMeasurement {
  const visibleSurfaceIds = mounted
    .filter((surface) => isRendered(surface.element))
    .map((surface) => surface.id);
  const text = measureText(visibleSurfaceIds);
  return {
    version: '153-ui-qa-measurement-v1',
    browser: navigator.userAgent,
    scenario: current.scenario,
    viewport: {
      id: viewport.id,
      widthPx: viewport.widthPx,
      heightPx: viewport.heightPx,
      zoom: viewport.zoom,
    },
    effectiveWidthPx: round(innerWidth),
    effectiveHeightPx: round(innerHeight),
    region: matchMedia('(min-width: 1920px) and (min-height: 1080px)').matches
      ? 'LARGE'
      : matchMedia('(max-width: 1279px), (max-height: 719px)').matches
        ? 'COMPACT'
        : 'STANDARD',
    mediaQueries: {
      compact: matchMedia('(max-width: 1279px), (max-height: 719px)').matches,
      large: matchMedia('(min-width: 1920px) and (min-height: 1080px)').matches,
    },
    surfaces: measureSurfaces(),
    controls: measureControls(visibleSurfaceIds),
    text: text.text,
    clipped: text.clipped,
    overlappingText: measureTextOverlaps(visibleSurfaceIds),
    contrastFailures: text.contrastFailures,
    overlaps: measureOverlaps(visibleSurfaceIds),
    essentials: measureEssentials(),
    keyboard,
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Public API driven by the Playwright runner.
// ---------------------------------------------------------------------------------------------

declare global {
  var __qaReady: boolean;
  var __qaPrepare: (scenario: string) => { trapExpected: boolean; scenario: string };
  var __qaFocus: () => ReturnType<typeof focusSnapshot>;
  var __qaScenarios: readonly string[];
  var __qaMeasure: (keyboard: UiQaKeyboardResult, viewport: DeclaredViewport) => UiQaMeasurement;
}

globalThis.__qaScenarios = Object.freeze([
  'hud',
  'fleet',
  'notifications',
  'profile',
  'city',
  'settings',
  'camera',
  'kpis',
]);
globalThis.__qaPrepare = (scenario: string) => {
  const prepared = prepare(scenario);
  current = { scenario: prepared.scenario, trapExpected: prepared.trapExpected };
  return prepared;
};
globalThis.__qaFocus = focusSnapshot;
globalThis.__qaMeasure = buildMeasurement;
globalThis.__qaReady = true;

// Keep the first paint deterministic: the runner never waits on animations or timers.
if (status !== null) {
  status.textContent = 'Suprafețele reale sunt montate.';
  // The status line is harness chrome, not a game surface: it never appears in a capture.
  status.hidden = true;
}
