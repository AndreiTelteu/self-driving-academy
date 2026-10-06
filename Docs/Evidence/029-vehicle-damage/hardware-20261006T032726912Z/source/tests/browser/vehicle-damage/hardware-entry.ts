import { runHardwareBackend } from './hardware-runner';
import { runHardwareFunctional } from './hardware-functional';
const status = document.getElementById('status')!;
const steady = document.getElementById('steady') as HTMLButtonElement;
const functional = document.getElementById('functional') as HTMLButtonElement;
let busy = false;
async function start(mode: 'STEADY' | 'FUNCTIONAL') {
  if (busy) return;
  busy = true;
  steady.disabled = true;
  functional.disabled = true;
  const preference = (document.getElementById('backend') as HTMLSelectElement).value as
    'AUTO' | 'WEBGL2';
  try {
    const progress = (text: string) => {
      status.textContent = text;
    };
    if (mode === 'STEADY') await runHardwareBackend(preference, progress);
    else await runHardwareFunctional(preference, progress);
  } catch (error) {
    status.textContent = String(error);
  } finally {
    busy = false; /* One attempt per frozen server. No automatic restart or selective resume. */
  }
}
steady.onclick = () => start('STEADY');
functional.onclick = () => start('FUNCTIONAL');
