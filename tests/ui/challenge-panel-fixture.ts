import {
  challengeDailyVariety,
  challengeReaction,
  createChallengeTemplateCatalog,
} from '../../src/missions';
import type {
  ChallengeCreditResult,
  ChallengeDirectorInstance,
  ChallengeRecordOutcome,
} from '../../src/missions';
import { composeChallengePanelSnapshot, createChallengePanel } from '../../src/ui';
import type { ChallengePanel, ChallengePanelAction, ChallengePanelSnapshot } from '../../src/ui';
import {
  EXPERIENCE_FIRST_DAY,
  createExperienceHarness,
} from '../missions/challenge-experience-fixture';
import { HudElement, type HudDocument, type HudEventInit } from './hud-dom';

/**
 * 233 challenge panel fixture.
 *
 * The panel never owns a challenge: this fixture drives the real 232 director, records with the real
 * 233 experience and the real 213 ledger, then composes the read-only snapshot the panel displays.
 * Every value on screen therefore comes from the delivered contracts.
 */

export interface ChallengeElement extends HudElement {
  tabIndex: number;
  focusCount: number;
  focus(): void;
  send(type: string, init?: HudEventInit): void;
}

export interface ChallengePanelDocument extends HudDocument {
  activeElement: ChallengeElement | null;
  createElement(tagName: string): ChallengeElement;
}

class PanelElement extends HudElement {
  tabIndex = -1;
  focusCount = 0;
  focus(): void {
    this.focusCount += 1;
    (this.ownerDocument as ChallengePanelDocument).activeElement = this as ChallengeElement;
  }
  send(type: string, init: HudEventInit = {}): void {
    let node: ChallengeElement | null = this as ChallengeElement;
    while (node !== null) {
      const event = node.dispatchEvent(type, init);
      if (event.propagationStopped) return;
      node = node.parent as ChallengeElement | null;
    }
  }
}

export function createChallengePanelDocument(): ChallengePanelDocument {
  const document: ChallengePanelDocument = {
    activeElement: null,
    createElement(tagName: string): ChallengeElement {
      const element = new PanelElement(tagName) as ChallengeElement;
      element.ownerDocument = document as unknown as HudDocument;
      return element;
    },
  };
  return document;
}

export function byChallengeClass(root: HudElement, className: string): ChallengeElement[] {
  const matches: ChallengeElement[] = [];
  for (const child of root.children) {
    if (child.className.split(' ').includes(className)) matches.push(child as ChallengeElement);
    matches.push(...byChallengeClass(child, className));
  }
  return matches;
}

export interface ChallengePanelHarness {
  readonly document: ChallengePanelDocument;
  readonly host: ChallengeElement;
  readonly panel: ChallengePanel;
  readonly director: ReturnType<typeof createExperienceHarness>['director'];
  readonly ledger: ReturnType<typeof createExperienceHarness>['ledger'];
  readonly experience: ReturnType<typeof createExperienceHarness>['experience'];
  readonly surface: boolean[];
  readonly actions: ChallengePanelAction[];
  readonly reads: () => number;
  offer(seed?: number): ChallengeDirectorInstance;
  accept(instanceId: string): ChallengeDirectorInstance;
  activate(instanceId: string): ChallengeDirectorInstance;
  complete(instanceId: string, offsetTicks?: number): ChallengeDirectorInstance;
  fail(instanceId: string): ChallengeDirectorInstance;
  decline(instanceId: string): ChallengeDirectorInstance;
  credit(instance: ChallengeDirectorInstance): ChallengeCreditResult;
  record(instance: ChallengeDirectorInstance): ChallengeRecordOutcome;
  creditLast(): ChallengeCreditResult | null;
  recordLast(): ChallengeRecordOutcome | null;
  snapshot(options?: { readonly offersEnabled?: boolean }): ChallengePanelSnapshot;
  trigger(): ChallengeElement;
  dialog(): ChallengeElement;
  actionButton(action: ChallengePanelAction): ChallengeElement;
  closeByEscape(): void;
  openAnotherPanelWith(snapshot: ChallengePanelSnapshot | null): ChallengePanel;
  dispose(): void;
}

export interface ChallengePanelHarnessOptions {
  readonly offersEnabled?: boolean;
}

export function createChallengePanelHarness(
  options: ChallengePanelHarnessOptions = {},
): ChallengePanelHarness {
  const document = createChallengePanelDocument();
  const host = document.createElement('div') as unknown as ChallengeElement;
  const surface: boolean[] = [];
  const actions: ChallengePanelAction[] = [];
  const session = createExperienceHarness();
  const catalog = createChallengeTemplateCatalog();
  let readCount = 0;
  const offered = options.offersEnabled ?? true;
  let lastCredit: ChallengeCreditResult | null = null;
  let lastRecord: ChallengeRecordOutcome | null = null;
  const state: {
    offer: ChallengeDirectorInstance | null;
    active: ChallengeDirectorInstance | null;
    result: ChallengeDirectorInstance | null;
  } = { offer: null, active: null, result: null };

  const templates = (): readonly {
    templateId: string;
    controlRequirement: 'MANUAL' | 'LEARNING' | 'ANY';
    premise: string;
  }[] => {
    const ids = new Set(
      [state.offer?.templateId, state.active?.templateId, state.result?.templateId].filter(
        (entry): entry is string => entry !== undefined,
      ),
    );
    return Object.freeze(
      [...ids].map((templateId) => {
        const template = catalog.templates.find((entry) => entry.templateId === templateId);
        if (template === undefined) throw new Error(`Unknown template ${templateId}`);
        return Object.freeze({
          templateId,
          controlRequirement: template.controlRequirement,
          premise: template.dialogue.find((entry) => entry.trigger === 'OFFER')!.text,
        });
      }),
    );
  };

  const current = (): ChallengeDirectorInstance | null =>
    state.offer ?? state.active ?? state.result;

  const snapshot = (composeOptions: { offersEnabled?: boolean } = {}): ChallengePanelSnapshot => {
    const instance = current();
    const daily = challengeDailyVariety({ catalog, dailyDate: EXPERIENCE_FIRST_DAY, seed: 4_242 });
    return composeChallengePanelSnapshot({
      tick: session.tick(),
      sessionKind: session.sessionKind,
      offersEnabled: composeOptions.offersEnabled ?? offered,
      offer: state.offer,
      active: state.active,
      result: state.result,
      reaction:
        instance === null
          ? null
          : challengeReaction({ instance, ...(lastCredit === null ? {} : { credit: lastCredit }) }),
      records: session.experience.records(),
      daily,
      creditedXp: lastCredit?.creditedXp ?? 0,
      recordComparison: lastRecord?.comparison ?? 'NOT_ELIGIBLE',
      templates: templates(),
    });
  };

  const read = (): ChallengePanelSnapshot | null => {
    readCount += 1;
    return snapshot();
  };

  const panel = createChallengePanel(host as unknown as HTMLElement, {
    read,
    onAction: (action) => {
      actions.push(action);
    },
    setSurface: (open) => {
      surface.push(open);
    },
  });

  const offer = (seed?: number): ChallengeDirectorInstance => {
    const result = session.offer(seed);
    state.offer = result;
    return result;
  };
  const accept = (instanceId: string): ChallengeDirectorInstance => {
    const result = session.accept(instanceId);
    state.active = result;
    state.offer = null;
    return result;
  };
  const activate = (instanceId: string): ChallengeDirectorInstance => {
    const result = session.activate(instanceId);
    state.active = result;
    return result;
  };
  const complete = (instanceId: string, offsetTicks = 600): ChallengeDirectorInstance => {
    const result = session.complete(instanceId, offsetTicks);
    state.active = null;
    state.result = result;
    return result;
  };
  const fail = (instanceId: string): ChallengeDirectorInstance => {
    const result = session.fail(instanceId);
    state.active = null;
    state.result = result;
    return result;
  };
  const decline = (instanceId: string): ChallengeDirectorInstance => {
    const result = session.decline(instanceId);
    state.offer = null;
    state.result = result;
    return result;
  };
  const credit = (instance: ChallengeDirectorInstance): ChallengeCreditResult => {
    lastCredit = session.credit(instance, EXPERIENCE_FIRST_DAY);
    return lastCredit;
  };
  const record = (instance: ChallengeDirectorInstance): ChallengeRecordOutcome => {
    lastRecord = session.record(instance, EXPERIENCE_FIRST_DAY);
    return lastRecord;
  };

  return {
    document,
    host,
    panel,
    director: session.director,
    ledger: session.ledger,
    experience: session.experience,
    surface,
    actions,
    reads: () => readCount,
    offer,
    accept,
    activate,
    complete,
    fail,
    decline,
    credit,
    record,
    creditLast: () => lastCredit,
    recordLast: () => lastRecord,
    snapshot,
    trigger: () => host.children[0]?.children[0] as unknown as ChallengeElement,
    dialog: () => host.children[0]?.children[1] as unknown as ChallengeElement,
    actionButton: (action) => {
      const button = byChallengeClass(
        host.children[0] as unknown as ChallengeElement,
        'challenge-panel__action',
      ).find((candidate) => candidate.getAttribute('data-action') === action);
      if (button === undefined) throw new Error(`Missing challenge action ${action}`);
      return button;
    },
    closeByEscape: () => {
      const dialog = host.children[0]?.children[1] as unknown as ChallengeElement;
      dialog.send('keydown', { key: 'Escape' });
    },
    openAnotherPanelWith(snapshotValue) {
      const otherHost = document.createElement('div') as unknown as ChallengeElement;
      return createChallengePanel(otherHost as unknown as HTMLElement, {
        read: () => snapshotValue,
      });
    },
    dispose: () => {
      panel.dispose();
    },
  };
}
