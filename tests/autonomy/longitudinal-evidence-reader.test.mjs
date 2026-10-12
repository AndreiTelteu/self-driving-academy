import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateLongitudinalDriving } from '../../scripts/longitudinal-driving-validation.mjs';
const capture = JSON.parse(
  await readFile(
    new URL(
      '../../Docs/Evidence/047-longitudinal-control/native-driving-v1/report.json',
      import.meta.url,
    ),
  ),
);
test('047 independent reader accepts eight native episodes and rejects finite/units/delay/contact/cleanup tampering', () => {
  for (const episode of capture.episodes)
    validateLongitudinalDriving(episode.result, episode.cleanup);
  const mutations = [
    (episode) => {
      episode.result.trace[0].velocity.x = Infinity;
    },
    (episode) => {
      episode.result.trace[0].command.units = 'km';
    },
    (episode) => {
      episode.result.trace[0].brakeEventTick = 2;
    },
    (episode) => {
      episode.result.trace[12].command.brake = 0;
    },
    (episode) => {
      episode.result.collisionImpulseNs = 1;
    },
    (episode) => {
      episode.cleanup.body.entities = 1;
    },
    (episode) => {
      episode.result.mechanics.surface.id = 'reduced-adhesion';
    },
    (episode) => {
      episode.result.trace[0].targetDecisionTick = 3;
    },
  ];
  for (const mutate of mutations) {
    const episode = structuredClone(capture.episodes[0]);
    mutate(episode);
    assert.throws(() => validateLongitudinalDriving(episode.result, episode.cleanup));
  }
  const risky = structuredClone(capture.episodes[1]);
  risky.result.collisionImpulseNs = 0;
  assert.throws(() => validateLongitudinalDriving(risky.result, risky.cleanup));
});
