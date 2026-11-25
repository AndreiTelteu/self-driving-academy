# Dovezi 256 — trafic AI vizibil în compunerea de browser

Status: implementare și verificare finalizate pe 25 noiembrie 2026. Nivel de validare: `targeted`
(politica din 8 octombrie 2026) — corectitudine izolată, cost local și integrare browser scurtă;
playtestul uman și frame-ul pe GPU real rămân `NOT_RUN`.

## Ce s-a livrat

- `src/app/ambient-traffic.ts` — composition root-ul 256: registry 057 (20 taxiuri + 24 civili),
  stil comun din valorile implicite 092, trafic 058 cu rute 041, spawn determinist lângă jucător și
  eliberare completă.
- `src/app/walking-composition.ts` — opțiunea `traffic`, pașii 058 înaintea arbitrajului, publicarea
  actorilor în `CompositionFrame.vehicles`, conversia headingului graf → compunere, refuzul intrării
  în mașinile AI și păstrarea compunerii fără trafic neschimbate.
- `src/app/composition-world.ts` — expune harta 032 și graful 033 deja derivate din layout.
- `src/fleet/civil-traffic.ts` — opțiunile backward-compatible `spawnLanes`/`spawnOffsetsM`, folosite
  pentru primele mașini vizibile; ruta rămâne exclusiv `findRoute` 041.
- `src/main.ts` — creează trafic proaspăt pentru fiecare backend și îl eliberează împreună cu
  registry-ul; recuperarea GPU nu refolosește `lastTick`.
- `src/rendering/babylon/v3-browser-composition.ts` — pasează contractul 058 compunerii.
- `scripts/run-v3-composition-report.mjs` — proba de browser citește starea READY, folosește
  butonul 251 „Joacă”, reia pauza de overload și verifică deplasarea AI.
- `tests/app/ambient-traffic.test.ts` — 4 teste noi.
- `tests/fleet/civil-traffic.test.ts` — test nou pentru `spawnLanes`.
- Documentație: `Docs/browser-ai-traffic.md` (nou), `Docs/civil-traffic.md`, `Docs/06-autonomie-si-trafic.md`,
  `Docs/20-extensii-si-mers-pe-jos.md`, `Docs/README.md`.
- Board: `PBI/README.md` (index 256) și `Docs/README.md` (contoare 256/V3 16).

## Verificări executate

```text
npm run typecheck                     PASS (app + tests)
npm run lint                          PASS (0 warnings)
npm run format:check                  PASS
npm run check:architecture            PASS (443 fișiere TypeScript + probe negative)
npm test                              3535 teste, 3535 trecute, 0 eșuate
npm run build                         PASS (typecheck + Vite, 1339 module)
npm run composition:report -- --check PASS (report.json și report.md curente)
npm run composition:report -- --browser
                                      PASS, backend WEBGL2 (ANGLE/SwiftShader)
```

Testele țintite:

```text
node --import ./scripts/register-typescript.mjs --test tests/app/ambient-traffic.test.ts
  ✔ 256: compunerea publică cel puțin 20 de mașini AI cu rute READY și spawn vizibil
  ✔ 256: mașinile AI se deplasează pe tick-uri consecutive, cu heading coerent
  ✔ 256: o mașină AI nu poate fi preluată și nu își schimbă autoritatea
  ✔ 256: același seed produce aceleași poziții AI, iar stilul este comun și BASE
  4/4 PASS

node --import ./scripts/register-typescript.mjs --test tests/fleet/civil-traffic.test.ts
  ✔ 058 optional spawn lanes/offsets place the first stable actors on the requested CIVIL lanes
  12/12 PASS (inclusiv suita 058 existentă)
```

## Proba de browser

Sursa: [Evidence/236-browser-composition/browser.json](../236-browser-composition/browser.json).

- Chromium **156.0.8078.4**, viewport 1440×900, backend **WEBGL2** (ANGLE/SwiftShader,
  `WebGL 2.0 (OpenGL ES 3.0 Chromium)`).
- **26 de vehicule** în scenă (taxi + civil static + 24 AI), 599 mesh-uri de vehicule, 42 draw calls.
- **24/24 mașini AI** s-au deplasat peste 1 m în timpul probei; 0 erori de pagină și 0 erori de
  consolă.
- Secvențele reale 236 rămân PASS: mers, alergare, intrare în taxi, conducere, frânare până la
  oprire, ieșire și revenire la mers.
- Capturi curente: `01-start.png` … `08-revenire.png` în
  [Evidence/236-browser-composition/screenshots](../236-browser-composition/screenshots) (proba a
  fost extinsă cu pașii AUTO/MANUAL în 257).

Cost măsurat în browser (600 eșantioane de tick):

| Metrică | Baseline 236 (2 vehicule) | 256 (24 AI) | Buget provizoriu |
| --- | ---: | ---: | ---: |
| Tick p50 | 0,50 ms | **3,70 ms** | 8 ms |
| Tick p95 | 1,10 ms | **5,50 ms** | 8 ms |
| Tick max | 17,9 ms | 53,7 ms | — |
| Prezentare p95 | 1,20 ms | 0,60 ms | — |

Costul suplimentar al traficului este de aproximativ **3,2 ms/tick**. Intervalele de cadru
(p50 ≈ 1,27 s) sunt ale randării software SwiftShader și **nu** sunt raportate ca FPS hardware.

## Limitări

- 058 nu acționează semafoare, prioritatea în intersecție, STOP sau yield; acestea rămân
  036/037/038/045/050–054. Mașinile AI urmăresc ruta și liderul, dar nu opresc la roșu.
- Mașinile AI nu sunt preluabile; reconcilierea poziției la `resume` este un follow-up.
- Personajul pe jos nu este injectat ca obstacol pentru AI, iar contactul fizic dintre taxiul condus
  și o mașină AI nu este rezolvat de compunere; AI frânează semantic în spatele taxiului.
- Proba de browser este pe SwiftShader. Pe acest backend jocul intră corect în pauză de overload;
  scriptul reia pauza și retrimite tastele ținute pentru a putea măsura tick-uri reale. Gate-ul 224
  rămâne responsabil pentru hardware real.
- Frame-ul, playtestul uman și soak-ul nu sunt certificate de acest PBI.
