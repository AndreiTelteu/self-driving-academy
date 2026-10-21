import {
  CITY_STYLE_ENGINE_VERSION,
  cityStyleReportMarkdown,
  runCityStyleScenario,
} from '../../src/app';
import type { CityStyleScenarioReport, CityStyleScenarioServices } from '../../src/app';
import { crossClassStyleTarget } from '../../src/experiments';
import { createLearningQueueHarness } from '../harness/learning-queue-harness';
import { pipelineSegment } from '../harness/profile-pipeline-fixture';

/**
 * 208 evidence driver.
 *
 * It injects the real 103 queue (with the synthetic transport used by the 112 harness) and three
 * closed 069-shaped segments. Everything else — the 057 registry, the 110 activation, the 058 civil
 * traffic and the 109 store — is created by the real composition under test.
 */
export const CITY_STYLE_REPORT_VERSION = '208-city-style-report-v1' as const;

export function cityStyleSegmentValues(): Readonly<{
  baseValue: number;
  candidateValue: number;
}> {
  return Object.freeze({
    baseValue: crossClassStyleTarget('CAUTIOUS', 'speed_delta_urban'),
    candidateValue: crossClassStyleTarget('ASSERTIVE', 'speed_delta_urban'),
  });
}

export function createCityStyleServices(): CityStyleScenarioServices {
  const { baseValue, candidateValue } = cityStyleSegmentValues();
  const key = 'speed_delta_urban' as const;
  return Object.freeze({
    createQueue: () => createLearningQueueHarness({ engineVersion: CITY_STYLE_ENGINE_VERSION }),
    learningSegment: pipelineSegment({
      segmentId: 'segment-208-fleet',
      order: 1,
      key,
      baseValue,
      candidateValue,
      episodeCount: 16,
      reason: 'fleet observation of the common city style',
    }),
    civilLearningSegment: pipelineSegment({
      segmentId: 'segment-208-civilian',
      order: 1,
      key,
      baseValue,
      candidateValue,
      episodeCount: 16,
      interventionId: 'civilian-208-imitation',
      reason: 'civilian imitates the common city style',
    }),
    civilManualSegment: pipelineSegment({
      segmentId: 'segment-208-manual',
      order: 1,
      key,
      baseValue,
      candidateValue,
      episodeCount: 16,
      mode: 'MANUAL',
      reason: 'civilian manual segment',
    }),
  });
}

export function runCityStylePropagationReport(): Promise<CityStyleScenarioReport> {
  return runCityStyleScenario(createCityStyleServices());
}

export function cityStylePropagationReportMarkdown(report: CityStyleScenarioReport): string {
  return cityStyleReportMarkdown(report);
}
