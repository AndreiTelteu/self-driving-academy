# 260 — proba de browser a shell-ului jocului

Generată de `npm run shell:probe` pe 2026-11-26T00:49:07.596Z. Fiecare backend este o rulare separată
a aceleiași secvențe reale: start, intrare în taxi cu `G`, conducere cu `W`, panou deschis din
butonul shell-ului, verificarea suspendării tick-ului, închidere, reluare și un reload real.

| Rulare | Cerut | Real | Verdict | Deplasare | Tick shell p95 |
| --- | --- | --- | --- | --- | --- |
| webgl2 | WEBGL2 | WEBGL2 | PASS | 9.676 m / 16.209 m | 5.6 ms |
| webgpu | WEBGPU | WEBGPU | PASS | 9.995 m / 16.004 m | 5 ms |

### webgl2 — WEBGL2

- Browser: **157.0.8103.51 (chrome)**, viewport 1440x900, preset `MEDIUM`, fixture `260-game-shell-v1` (seed trafic 256, taxi-01 + civil-01 + 24 ambient AI, modele procedural).
- GPU: vendor `Google Inc. (Google)`, renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`, engine `WebGL2`, rezoluție internă 1440×900.
- Start: tick 21, autoritate `CHARACTER:player-character`, mod `MANUAL`, porturi 0/15.
- Conducere: taxi intrat **da**, deplasare 9.676 m, apoi 16.209 m după panou.
- Panou: deschis true, suspendat true (panel), 16 rânduri, 15 absente; tick 194 → 194 → 214.
- Lume: 1 atașări, 1/1 lumi active.
- Reload: PASS — tick 293 → 1 la READY, 1 atașare, 1/1 lumi, 1 gazdă, 8 tick-uri după start. Controale gazdă: start→pauză→reluare PASS (cauză menu, tick 17 → 17 → 21).
- Gazda UI: 0 listeneri globali, 6 listeneri de element.
- Cost tick shell p50/p95: 3.8/5.6 ms (buget 8 ms, în buget); compunere p50/p95: 3.7/5.6 ms; overhead shell p50/p95: 0.1/0 ms.
- Cost prezentare shell p50/p95: 0.4/0.6 ms; interval cadru compunere p50/p95: 1169.8/3119.6 ms (buget laptop p95 35 ms, peste buget).
- Erori pagină/consolă: 0/0.
- Capturi: [screenshots/01-start-webgl2.png](screenshots/01-start-webgl2.png), [screenshots/02-driving-webgl2.png](screenshots/02-driving-webgl2.png), [screenshots/03-panel-webgl2.png](screenshots/03-panel-webgl2.png), [screenshots/04-resumed-webgl2.png](screenshots/04-resumed-webgl2.png), [screenshots/05-reload-webgl2.png](screenshots/05-reload-webgl2.png).

### webgpu — WEBGPU

- Browser: **157.0.8103.51 (chrome)**, viewport 1440x900, preset `MEDIUM`, fixture `260-game-shell-v1` (seed trafic 256, taxi-01 + civil-01 + 24 ambient AI, modele procedural).
- GPU: vendor `amd`, renderer `rdna-2`, engine `WebGPU1`, rezoluție internă 1440×900.
- Start: tick 41, autoritate `CHARACTER:player-character`, mod `MANUAL`, porturi 0/15.
- Conducere: taxi intrat **da**, deplasare 9.995 m, apoi 16.004 m după panou.
- Panou: deschis true, suspendat true (panel), 16 rânduri, 15 absente; tick 334 → 334 → 373.
- Lume: 1 atașări, 1/1 lumi active.
- Reload: PASS — tick 490 → 1 la READY, 1 atașare, 1/1 lumi, 1 gazdă, 12 tick-uri după start. Controale gazdă: start→pauză→reluare PASS (cauză menu, tick 77 → 77 → 115).
- Gazda UI: 0 listeneri globali, 6 listeneri de element.
- Cost tick shell p50/p95: 2.8/5 ms (buget 8 ms, în buget); compunere p50/p95: 2.7/4.8 ms; overhead shell p50/p95: 0.1/0.2 ms.
- Cost prezentare shell p50/p95: 0.2/0.4 ms; interval cadru compunere p50/p95: 16.7/21.1 ms (buget laptop p95 35 ms, în buget).
- Erori pagină/consolă: 0/0.
- Capturi: [screenshots/01-start-webgpu.png](screenshots/01-start-webgpu.png), [screenshots/02-driving-webgpu.png](screenshots/02-driving-webgpu.png), [screenshots/03-panel-webgpu.png](screenshots/03-panel-webgpu.png), [screenshots/04-resumed-webgpu.png](screenshots/04-resumed-webgpu.png), [screenshots/05-reload-webgpu.png](screenshots/05-reload-webgpu.png).

## Limitări

- WebGL2 rulează pe SwiftShader (randare software); intervalele de cadru nu sunt FPS hardware.
- WebGPU este încercat pe browser headed cu GPU-ul real; dacă nu este disponibil, rularea este
  `NOT_RUN` cu motivul real, nu un PASS simulat.
- Proba acoperă shell-ul și compunerea V3 existentă. Flota live, cursele, economia, learning-ul,
  misiunile și persistența rămân dependențe ale taskurilor 261–286 și sunt raportate ca absente.
