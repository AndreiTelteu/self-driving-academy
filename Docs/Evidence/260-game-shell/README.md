# Dovezi 260 — shell-ul jocului și composition root

Status: implementat și verificat pe 26 noiembrie 2026. Nivel de validare: `targeted` — teste
deterministe, cost local și probă de browser pe WebGL2 (SwiftShader) și WebGPU (GPU real). Playtestul
uman și un gate hardware complet rămân în afara scope-ului acestui task.

## Ce s-a livrat

- `src/app/game-shell.ts` — composition root-ul: tick autoritar unic, ordinea declarată a
  sistemelor 261–286, porturi injectabile, raportare explicită `ABSENT`, owner 070 pentru
  pauză/focus/panouri, o singură lume activă și costuri separate tick/prezentare.
- `src/ui/game-shell-host.ts` — gazda UI: Start/Pauză/Reia, panoul de integrare, focus/Escape,
  Tab ținut în panou și zero listeneri globali.
- `src/main.ts` — atașează compunerea V3 existentă ca lume autoritară, rulează un singur `step`
  prin shell, leagă focusul și expune diagnostice read-only.
- `src/ui/rendering-view.ts` — un panou deschis suspendă fără să afișeze meniul de pauză.
- `tests/app/game-shell.test.ts` — 7 teste pentru ordine, porturi, tick, pauză/focus, lume și cost.
- `tests/ui/game-shell-host.test.ts` — 4 teste pentru controale, panou, focus, throttling și cleanup.
- `scripts/run-game-shell-probe.mjs` — proba reală WebGL2 + WebGPU, inclusiv reload.
- `Docs/game-shell.md` — contractul shell-ului.

Nu au fost implementate flota, cursele, economia, learning-ul, misiunile, persistența, setările,
camera first-person, minimapa, fizica Rapier, regulile de trafic, distrugerea sau pietonii. Porturile
lor sunt declarate și raportate ca absente.

## Verificări executate

```text
npm run typecheck                      PASS
npm run lint                           PASS (0 warnings)
npm run format:check                   PASS
npm run check:architecture             PASS (449 fișiere TS)
npm test                               PASS (3559 teste, 3545 trecute, 0 eșuate, 14 skipped)
npm run build                          PASS (Vite 8.3.2, 1346 module, „built in 1.54s”)
npm run composition:report -- --check  PASS (raportul 236/257 neschimbat)
npm run shell:probe                    PASS WebGL2 + PASS WebGPU
```

### Teste

```text
tests/app/game-shell.test.ts          7/7 PASS
tests/ui/game-shell-host.test.ts      4/4 PASS
suite completă                        3559 teste, 3545 PASS, 0 FAIL, 14 skipped (252,6 s)
```

`shell:probe` a rulat cu `PLAYWRIGHT_MODULE` către modulul Playwright local și
`PLAYWRIGHT_CHANNEL=chrome`; fără Playwright scrie `NOT_RUN` cu motivul real.

Prima rulare completă a avut un singur eșec de timing în `tests/workers/protocol.test.ts`
(`cancel 183,88ms` față de limita de 100 ms), sub încărcarea suitei. Testul izolat a trecut
(`cancelMs 5,08ms`), iar a doua rulare completă a trecut fără eșecuri. Eșecul nu atinge shell-ul și
nu a fost mascat.

## Proba de browser

Sursa: [browser.json](browser.json) · raport generat: [report.md](report.md).

Secvența reală, aceeași pentru ambele backenduri: start → `G` intră în taxi → `W` conduce → panou
deschis din butonul shell-ului → tick înghețat → închidere → reluare → `W` conduce din nou → reload
real. Fixture: `260-game-shell-v1`, seed trafic 256, taxi-01 + civil-01 + 24 AI, modele procedurale,
preset MEDIUM, 1440×900.

| Rulare | Backend real | Verdict | Deplasare | Tick panou | Tick după | Reload | Start/pauză/reluare | Erori |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WebGL2 | WEBGL2, ANGLE/SwiftShader | **PASS** | 9,676 m / 16,209 m | 194 → 194 | 214 | PASS (293 → 1) | PASS (17 → 17 → 21) | 0/0 |
| WebGPU | WEBGPU, AMD RDNA-2 | **PASS** | 9,995 m / 16,004 m | 334 → 334 | 373 | PASS (490 → 1) | PASS (77 → 77 → 115) | 0/0 |

Ambele rulări au raportat **16 sisteme declarate**, **0 porturi prezente**, **15 absente**, o
singură atașare de lume și `maxActiveWorlds = 1`. Panoul a avut 16 rânduri, iar gazda UI a raportat
0 listeneri globali. După reload a rămas o singură gazdă, o singură lume și un singur owner de tick.
Controalele gazdei (Start → Pauză → Reia) au suspendat tick-ul pentru 350 ms și l-au reluat.

Capturi: [start WebGL2](screenshots/01-start-webgl2.png),
[conducere WebGL2](screenshots/02-driving-webgl2.png),
[panou WebGL2](screenshots/03-panel-webgl2.png),
[reluare WebGL2](screenshots/04-resumed-webgl2.png),
[reload WebGL2](screenshots/05-reload-webgl2.png),
[start WebGPU](screenshots/01-start-webgpu.png),
[conducere WebGPU](screenshots/02-driving-webgpu.png),
[panou WebGPU](screenshots/03-panel-webgpu.png),
[reluare WebGPU](screenshots/04-resumed-webgpu.png),
[reload WebGPU](screenshots/05-reload-webgpu.png).

## Cost tick și frame

Aceeași probă raportează separat costul compunerii V3 („before”) și costul shell-ului care o
învelește („after”), în aceeași rulare:

| Backend | Tick compunere p50/p95 | Tick shell p50/p95 | Overhead shell | Frame p50/p95 | Buget laptop frame p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| WebGL2 (software) | 3,7 / 5,6 ms | 3,8 / 5,6 ms | **0,1 / 0 ms** | 1169,8 / 3119,6 ms | peste (nu este probă FPS) |
| WebGPU (AMD RDNA-2) | 2,7 / 4,8 ms | 2,8 / 5,0 ms | **0,1 / 0,2 ms** | 16,7 / 21,1 ms | **în buget** (35 ms) |

Tick-ul shell rămâne sub bugetul provizoriu de **8 ms** pe ambele backenduri. Baseline-ul comis
anterior (257: tick p50 5,40 / p95 7,70 ms, SwiftShader + GLB, preset HIGH) este păstrat în
[Docs/Evidence/257-mode-hud-collision](../257-mode-hud-collision/README.md); proba 260 folosește
modele procedurale și preset MEDIUM, deci nu îl înlocuiește și nu se compară ca FPS hardware.
WebGL2 rulează pe SwiftShader, deci intervalele de cadru sunt software și nu sunt un gate FPS.

## Limitări

- WebGL2 este randare software (SwiftShader); frame p95 nu este o măsurătoare GPU hardware.
- WebGPU a rulat pe GPU-ul real al mașinii, dar fără timer GPU și fără soak; gate-ul hardware
  complet rămâne la 287.
- Nu există încă porturi reale pentru 261–286; panoul dovedește raportarea absentă, nu sistemele.
- Panoul este singura suprafață UI montată; setările, KPI, misiunile, profilul și flota au nevoie
  de panourile lor în taskurile dependente.
- Reload-ul este verificat de proba de browser; recuperarea GPU refolosește aceeași cale de
  detașare/atașare, dar nu are o probă separată de pierdere de dispozitiv în acest task.
- Nu au fost modificate bugetele din `Docs/performance-budgets.json`.
