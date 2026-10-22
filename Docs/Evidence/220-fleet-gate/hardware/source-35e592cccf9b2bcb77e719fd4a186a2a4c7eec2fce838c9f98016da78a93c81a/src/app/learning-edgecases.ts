import { admitLearningEdgeCaseObservation, evaluateLearningEdgeCases } from '../experiments';
import type {
  LearningEdgeCaseAdmission,
  LearningEdgeCaseAdmissionInput,
  LearningEdgeCasePorts,
  LearningEdgeCaseReport,
} from '../experiments';

/**
 * 107 composition root for the learning edge-case regressions.
 *
 * It is a thin, side-effect-free adapter over the pure 107 harness: it owns no UI, no store, no
 * profile publication and no fleet mutation. The only export that touches real state is the
 * admission adapter, and even that only produces a frozen 093 observation.
 */
export const LEARNING_EDGECASES_APP_VERSION = '107-learning-edgecases-app-v1' as const;

/**
 * Turns one real 088 window plus its real 087 eligibility record into a 093 observation **only**
 * when the window is usable and evidence-bearing. Every refusal carries an explicit closed reason;
 * a fully suppressed span, an excluded/manual window, a blocked-green constraint, an unresolved or
 * ineligible opportunity and an observation outside the usable prefix are never passed to 093.
 */
export function admitLearningWindowForRegression(
  input: LearningEdgeCaseAdmissionInput,
): LearningEdgeCaseAdmission {
  return admitLearningEdgeCaseObservation(input);
}

/** Runs the closed 107 case set; optional injected ports keep the tests deterministic. */
export function runLearningEdgeCaseRegressions(
  ports: LearningEdgeCasePorts = {},
): LearningEdgeCaseReport {
  return evaluateLearningEdgeCases(ports);
}
