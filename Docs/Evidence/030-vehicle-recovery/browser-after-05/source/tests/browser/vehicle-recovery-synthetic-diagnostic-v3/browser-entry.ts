import '@babylonjs/core/Materials/standardMaterial';
import { runTrustedFunctional } from './functional-runtime';
const button = document.getElementById('functional') as HTMLButtonElement;
const status = document.getElementById('status')!;
let started = false;
button.addEventListener('click', async () => {
  if (started) return;
  started = true;
  button.disabled = true;
  try {
    (document.getElementById('canvas') as HTMLCanvasElement).focus();
    await runTrustedFunctional(
      (document.getElementById('backend') as HTMLSelectElement).value as 'AUTO' | 'WEBGL2',
      (text) => {
        status.textContent = 'SYNTHETIC DIAGNOSTIC ONLY: ' + text;
      },
    );
    status.textContent =
      'AUTOMATED DIAGNOSTIC SAVED — isTrusted=false; physical acceptance=false; independent gameplay verification pending.';
  } catch (error) {
    status.textContent = 'AUTOMATED DIAGNOSTIC TERMINAL FAILED ' + String(error);
  }
  // Persistent terminal latch. A fresh backend/page still requires server once-attempt admission.
});
