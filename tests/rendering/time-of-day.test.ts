import assert from 'node:assert/strict';
import test from 'node:test';
import { DAYLIGHT_INPUT, createAtmosphereState } from '../../src/rendering/atmosphere';
import {
  TIME_OF_DAY_HOURS,
  TIME_OF_DAY_NAMES,
  atmosphereAt,
  atmosphereAtHour,
  atmosphereInputAtHour,
  nearestTimeOfDay,
  nextTimeOfDay,
} from '../../src/rendering/time-of-day';

test('252: cele patru momente au ore fixe și stări de atmosferă distincte', () => {
  assert.deepEqual(TIME_OF_DAY_NAMES, ['morning', 'noon', 'sunset', 'night']);
  assert.deepEqual(Object.keys(TIME_OF_DAY_HOURS), [...TIME_OF_DAY_NAMES]);
  const states = TIME_OF_DAY_NAMES.map((name) => atmosphereAt(name));
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]!;
    assert.equal(state.night, nameNight(index), TIME_OF_DAY_NAMES[index]);
    assert.ok(state.sun.lightIntensity > 0);
    assert.ok(state.exposure > 0);
    assert.equal(state.fog.mode, 'EXP2');
    // Fiecare moment diferă de celelalte prin luminanța orizontului.
    for (let other = 0; other < states.length; other += 1) {
      if (other === index) continue;
      const delta = states[other]!.horizon.reduce(
        (total, value, channel) => total + Math.abs(value - state.horizon[channel]!),
        0,
      );
      assert.ok(delta > 0.001, `${TIME_OF_DAY_NAMES[index]} vs ${TIME_OF_DAY_NAMES[other]}`);
    }
  }
  assert.equal(atmosphereAt('noon').night, 0);
  assert.equal(atmosphereAt('night').night, 1);
  assert.ok(atmosphereAt('night').exposure > atmosphereAt('noon').exposure);
});

function nameNight(index: number): number {
  return index === 1 ? 0 : index === 0 ? 0 : index === 2 ? 0.32 : 1;
}

test('252: orbita de 24 h este continuă, fără ore lipsă sau sărituri de culoare', () => {
  let previous = atmosphereAtHour(0);
  for (let step = 1; step <= 24 * 30; step += 1) {
    const hour = step / 30;
    const state = atmosphereAtHour(hour);
    assert.ok(Number.isFinite(state.sun.lightIntensity) && state.sun.lightIntensity >= 0);
    assert.ok(state.night >= 0 && state.night <= 1);
    assert.ok(state.exposure >= 1 && state.exposure <= 2);
    // Tranziția lină: niciun canal nu sare peste 0,08 dintr-un pas de 2 minute.
    for (let channel = 0; channel < 3; channel += 1)
      assert.ok(
        Math.abs(state.horizon[channel]! - previous.horizon[channel]!) < 0.08,
        `hour ${hour}: ${state.horizon} vs ${previous.horizon}`,
      );
    previous = state;
  }
  // Capetele se închid: 0 și 24 sunt aceeași stare.
  const start = atmosphereInputAtHour(0);
  const end = atmosphereInputAtHour(24);
  assert.deepEqual(start, end);
  assert.equal(nearestTimeOfDay(11.8), 'noon');
  assert.equal(nearestTimeOfDay(23.4), 'night');
  assert.equal(nearestTimeOfDay(5.6), 'morning');
});

test('252: amiaza păstrează exact baseline-ul 239, iar noaptea aprinde luna și stinge soarele', () => {
  const noon = atmosphereAtHour(12);
  const baseline = createAtmosphereState({
    ...DAYLIGHT_INPUT,
    sunDirection: atmosphereInputAtHour(12).sunDirection,
  });
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(Math.abs(noon.horizon[channel]! - baseline.horizon[channel]!) < 0.02);
    assert.ok(Math.abs(noon.zenith[channel]! - baseline.zenith[channel]!) < 0.02);
  }
  assert.equal(noon.sun.lightIntensity, baseline.sun.lightIntensity);
  for (let channel = 0; channel < 3; channel += 1)
    assert.ok(Math.abs(noon.sunToward[channel]! - baseline.sunToward[channel]!) < 1e-9);
  const night = atmosphereAtHour(23);
  assert.equal(night.night, 1);
  assert.ok(night.sun.lightIntensity < 0.25);
  assert.ok(night.sun.lightColor[2] > night.sun.lightColor[0], 'lumina nopții este rece');
  assert.ok(night.legacyAmbient.intensity < 0.2);
  assert.ok(night.environment.intensity < 0.6);
  // Ordinea ciclului și refuzul unui moment necunoscut.
  assert.equal(nextTimeOfDay('morning'), 'noon');
  assert.equal(nextTimeOfDay('night'), 'morning');
  assert.throws(() => nextTimeOfDay('dawn' as never));
});
