---
id: "154"
title: "Matrice browsere WebGPU și WebGL 2"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["153","020"]
owner: "loop-pbi/compat-154-01"
started_at: "2026-11-12T05:48:42+02:00"
completed_at: "2026-11-12T05:50:18+02:00"
---

# 154 Matrice browsere WebGPU și WebGL 2

## Obiectiv

Validează gameplay-ul pe dispozitive și browsere de referință.

## Context și plan

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 153 trebuie să existe în Done înainte de începere.
- PBI 020 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Backendul efectiv și combinația browser/OS/GPU sunt în raport.
- [x] Un browser fără suport nu produce ecran gol.

## Verificare

Rulează fallback forțat și recuperare pe matricea stabilită.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `npm run qa:compat` raportează **9 combinații reale, 9 PASS, 0 FAIL**, **11 verificări deterministe fără GPU, 11 PASS** și **11 combinații declarate NOT_RUN** cu motiv. Backendul efectiv vine din `rendererKind` (`src/rendering`), iar browser/OS/GPU din versiunea Chromium, `navigator.userAgent` și driverul expus de `navigator.gpu` / `WEBGL_debug_renderer_info`. Matricea: producție Chromium 156 headed pe AMD Radeon Graphics (RDNA-2) → **WebGPU**; aceeași intrare cu `navigator.gpu` eliminat → **WebGL 2** (ANGLE/Direct3D11); Chromium headless → **WebGL 2** pe **SwiftShader**; WebGPU + WebGL 2 lipsă și doar WebGL 1 → mesaj explicit „Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca.” cu butonul **Reîncearcă** vizibil, fără ecran gol. Recuperarea folosește pierderi native (`GPUDevice.destroy()` pe WebGPU, `WEBGL_lose_context.loseContext()` pe WebGL 2): generația 1 → 2, tick 417 păstrat, scenă reconstruită din același checkpoint; două eșecuri injectate → `ERROR` cu mesaj și reîncercare, bucla de cadre activă (6 cadre), apoi `READY` cu același tick. Constatare neblocantă: view-ul real dublează prefixul mesajului de eroare; `src/` nu a fost modificat, defectul este raportat cu captură.

Verificări executate și rezultat:
- `npm run typecheck` — PASS (exit 0, `src` + `tests`).
- `npm run lint` — PASS (exit 0, 0 erori, 0 warning-uri).
- `npm run format:check` — PASS („All matched files use Prettier code style!”).
- `npm run check:architecture` — PASS (360 fișiere TypeScript, probe negative 6+4+3, lifecycle).
- `npm run check:parameter-catalog` — PASS („Parameter catalog is synchronized.”).
- `npm test` — 2 749 teste, 2 749 trecute, 0 eșuate, 0 sărite, 93 548 ms.
- `node --import ./scripts/register-typescript.mjs --test tests/harness/compat-matrix.test.ts` — 7 teste, 7 trecute, 0 eșuate.
- `npm run qa:compat` — rows 9, pass 9, fail 0, NOT_RUN 11, determinist 11/11, verdict PASS.
- `npm run qa:compat -- --check` — „Compat matrix report is current” + „Compat matrix markdown is current”.
- `npm run qa:compat -- --browser` — Chromium 156.0.8078.4; 9 combinații capturate, 13 PNG, `browser.json` scris.
- `pwsh ./PBI/Validate-Board.ps1` — `Valid: true`, 235 PBI-uri, In Progress 1.
- `pwsh ./PBI/Validate-Board.ps1 -RequireDone '154'` — rezultatul exact este păstrat în raportul final.

Fișiere și documente actualizate:
- `tests/harness/compat-matrix.ts`, `tests/harness/compat-deterministic.ts`, `tests/harness/compat-matrix.test.ts` (noi).
- `tests/browser/compat-154/index.html`, `tests/browser/compat-154/main.ts` (noi).
- `scripts/run-compat-matrix-report.mjs` (nou), `package.json` (`qa:compat`, ultima intrare).
- `Docs/18-validare-si-release.md` (secțiune nouă la final).
- `Docs/Evidence/154-compat-matrix/` (README, `report.json`, `report.md`, `browser.json`, 13 PNG).
- `PBI/To Do/154-compat_matrix.md` → `PBI/In Progress/154-compat_matrix.md` → `PBI/Done/154-compat_matrix.md`.

Limitări sau follow-up: un singur GPU real (AMD Radeon Graphics / RDNA-2, iGPU Ryzen 7 7735U) și un singur OS (Windows 11 Home 10.0.26300); NVIDIA, Intel, macOS/Metal, Linux/Vulkan, Firefox, WebKit/Safari, Edge/Chrome stable separat, Android și iOS sunt `NOT_RUN` cu motiv. Chromium headless rulează WebGL 2 pe SwiftShader, deci fallback-ul și mesajele sunt dovedite, nu FPS-ul sau senzația de condus. Pierderea de dispozitiv este injectată, nu o defectare hardware observată, iar timpul de recompilare a shader-elor nu este măsurat. Scena de probă este un cub iluminat, nu gameplay complet. Gate-urile 220/224/235 rămân responsabile de hardware-ul de referință, soak și paritatea vizuală. Follow-up neblocant: dublarea prefixului mesajului de eroare în `src/ui/rendering-view.ts`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '154' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: implementare completă în `loop-pbi/compat-154-01`; matrice 9/9 PASS, determinist 11/11, 11 NOT_RUN; fallback forțat și recuperare dovedite pe WebGPU și WebGL 2; dovezi în `Docs/Evidence/154-compat-matrix/`.
