# 261 — proba de browser a sesiunilor Academie și Haos

Generată de `npm run session:probe` pe 2026-11-26T01:46:06.621Z. Secvența reală este Academie →
„Oraș proaspăt, păstrează stilul” → Haos → Academie, citită din `__v3Composition.session()`,
`sessionMenu()`, `shell()` și `shellHost()`.

| Rulare | Cerut | Real | Verdict | Traseu |
| --- | --- | --- | --- | --- |
| webgl2 | WEBGL2 | WEBGL2 | PASS | ACADEMY → CHAOS → ACADEMY |
| webgpu | WEBGPU | WEBGPU | PASS | ACADEMY → CHAOS → ACADEMY |

### webgl2 — WEBGL2

- Browser: **157.0.8103.51 (chrome)**, viewport 1440x900, preset `MEDIUM`.
- Meniu: Academie / Joacă liberă / Haos; sesiuni `session-261-academy`, `session-261-chaos`.
- Reset: `reset:session-261-academy:2`, epoch 1 → 2, learning 0 → 1, stare PAUSED, reseturi 1.
- Haos: live `CHAOS`, epoch 1, learning 0, checkpointuri 0, stare PAUSED.
- Înapoi în Academie: epoch 3, learning 2, checkpointuri 2, stare PAUSED.
- Shell: porturi 1/15, sistem `sessions` PRESENT, lumi 1/1.
- Gazda UI: 8 listeneri de element, 0 globali; notificare `niciuna`.
- Erori pagină/consolă: 0/0.
- Capturi: [screenshots/01-academy-webgl2.png](screenshots/01-academy-webgl2.png), [screenshots/02-reset-webgl2.png](screenshots/02-reset-webgl2.png), [screenshots/03-haos-webgl2.png](screenshots/03-haos-webgl2.png), [screenshots/04-academy-back-webgl2.png](screenshots/04-academy-back-webgl2.png).

### webgpu — WEBGPU

- Browser: **157.0.8103.51 (chrome)**, viewport 1440x900, preset `MEDIUM`.
- Meniu: Academie / Joacă liberă / Haos; sesiuni `session-261-academy`, `session-261-chaos`.
- Reset: `reset:session-261-academy:2`, epoch 1 → 2, learning 0 → 1, stare PAUSED, reseturi 1.
- Haos: live `CHAOS`, epoch 1, learning 0, checkpointuri 0, stare PAUSED.
- Înapoi în Academie: epoch 3, learning 2, checkpointuri 2, stare PAUSED.
- Shell: porturi 1/15, sistem `sessions` PRESENT, lumi 1/1.
- Gazda UI: 8 listeneri de element, 0 globali; notificare `niciuna`.
- Erori pagină/consolă: 0/0.
- Capturi: [screenshots/01-academy-webgpu.png](screenshots/01-academy-webgpu.png), [screenshots/02-reset-webgpu.png](screenshots/02-reset-webgpu.png), [screenshots/03-haos-webgpu.png](screenshots/03-haos-webgpu.png), [screenshots/04-academy-back-webgpu.png](screenshots/04-academy-back-webgpu.png).

## Limitări

- WebGL2 rulează pe SwiftShader (randare software); proba nu este un FPS hardware.
- WebGPU este încercat pe browser headed cu GPU-ul real; dacă nu este disponibil, rularea este
  `NOT_RUN` cu motivul real.
- Checkpointul live este magazinul determinist 225 din memorie; adaptorul durabil rămâne al lui
  278, deci un reload de pagină nu promite reluarea fizică a snapshotului.
- Restaurarea fizică a pozițiilor din snapshot rămâne la 278; proba verifică identitatea,
  checkpointul comis, epocile, PAUSED_AUTO, un singur tick owner și un singur port.
