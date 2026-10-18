import { runScenario } from '../harness/runner';
import { seededCounter } from '../scenarios/seeded-counter';
import { verifyCounter } from '../scenarios/verify-counter';

const form = document.querySelector<HTMLFormElement>('#scenario');
const status = document.querySelector<HTMLElement>('#status');
const output = document.querySelector<HTMLElement>('#capture');
if (!form || !status || !output) throw new Error('Missing harness controls');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const input = new FormData(form);
    const ticks = Number(input.get('ticks'));
    if (ticks > 10_000) throw new RangeError('Browser harness: maximum 10000 tick-uri');
    const capture = runScenario(seededCounter, Number(input.get('seed')), ticks);
    verifyCounter(capture);
    output.textContent = JSON.stringify(capture, null, 2);
    status.textContent = `PASS: ${capture.ticks} tick-uri, ${capture.states.length} stări, ${capture.events.length} evenimente`;
    status.dataset.result = 'pass';
  } catch (error: unknown) {
    output.textContent = '';
    status.textContent = error instanceof Error ? error.message : String(error);
    status.dataset.result = 'fail';
  }
});
