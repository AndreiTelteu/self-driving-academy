import type { TaskFactory } from '../../src/workers';
import type { ParameterEvidenceReadModel } from '../../src/learning/parameter-evidence';
import {
  compileEarlyLoopControllerProfiles,
  composeEarlyLoopProfile,
} from '../../src/learning/early-loop';
import type { EarlyLoopCandidates, EarlyLoopKey } from '../../src/learning/early-loop';
import { createEarlyLoopBaseProfile } from './early-loop-204-fixture';

/**
 * 221 worker workload for the 204 first loop. The buffer carries the 094/095/098 candidates:
 * [baseSpeed, candidateSpeed, qualitySpeed, baseAccel, candidateAccel, qualityAccel,
 *  baseStop, candidateStop, qualityStop].
 * Each job composes and compiles the real early-loop profile, then returns the 046/047/051 values.
 */
export function earlyLoopTaskFactory(): TaskFactory {
  const baseProfile = createEarlyLoopBaseProfile();
  return (job) => {
    let disposed = false;
    return {
      step(deadline) {
        if (disposed) throw new Error('Disposed 204 worker task');
        if (!Number.isFinite(deadline)) throw new Error('Invalid 204 worker deadline');
        const payload = new Float64Array(job.buffer);
        if (payload.length !== 9) throw new Error('Expected nine 204 fixture values');
        const source = {
          segmentIds: [`segment-${job.segmentId}`],
          opportunityIds: [`opportunity-${job.segmentId}`],
        };
        const read = (key: EarlyLoopKey, quality: number): ParameterEvidenceReadModel =>
          ({
            key,
            status: 'READY',
            distinctEpisodes: 3,
            contextBreakdown: [],
            sampleCount: 3,
            quality,
            uncertainty: 'MODERATE',
            unchanged: true,
            noEstimate: null,
          }) as unknown as ParameterEvidenceReadModel;
        const candidates: EarlyLoopCandidates = {
          speed_delta_urban: {
            key: 'speed_delta_urban',
            status: 'CANDIDATE',
            value: payload[1]!,
            confidence: 'HIGH',
            quality: payload[2]!,
            sourceEpisodeCount: 3,
            contextBreakdown: [],
            reason: null,
          },
          desired_acceleration: {
            key: 'desired_acceleration',
            status: 'CANDIDATE',
            value: payload[4]!,
            confidence: 'HIGH',
            quality: payload[5]!,
            sourceEpisodeCount: 3,
            contextBreakdown: [],
            reason: null,
          },
          stop_full_probability: {
            key: 'stop_full_probability',
            status: 'CANDIDATE',
            value: payload[7]!,
            interval: null,
            bound: null,
            confidence: 'HIGH',
            quality: payload[8]!,
            sourceEpisodeCount: 3,
            contextBreakdown: [],
            reason: null,
          },
        };
        const composed = composeEarlyLoopProfile(
          {
            speed_delta_urban: payload[0]!,
            desired_acceleration: payload[3]!,
            stop_full_probability: payload[6]!,
          },
          [
            read('speed_delta_urban', payload[2]!),
            read('desired_acceleration', payload[5]!),
            read('stop_full_probability', payload[8]!),
          ],
          candidates,
          {
            speed_delta_urban: source,
            desired_acceleration: source,
            stop_full_probability: source,
          },
        );
        const tokens = compileEarlyLoopControllerProfiles('AUTO', baseProfile, composed);
        if (tokens === null) throw new Error('AUTO 204 compilation returned null');
        return {
          done: true,
          progress: 1,
          result: new Float64Array([
            tokens.cruise.values.speed_delta_urban,
            tokens.longitudinal.values.desired_acceleration,
            tokens.stop.stopFullProbability,
            tokens.stop.stopDwellTimeS,
          ]).buffer,
        };
      },
      dispose() {
        disposed = true;
      },
    };
  };
}
