---
id: "153"
title: "QA vizual și accesibilitate V1"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["152","084"]
owner: "loop-pbi/qa-ui-153-01"
started_at: "2026-11-12T04:28:22+02:00"
completed_at: "2026-11-12T05:04:39+02:00"
---

# 153 QA vizual și accesibilitate V1

## Obiectiv

Inspectează HUD, paneluri, notificări, camera și comparațiile.

## Context și plan

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 152 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Rezoluțiile țintă au texte și controls vizibile. Toate cele 874 de controale măsurate au dreptunghi nenul și hit-test valid la 1280×720 și 1920×1080, iar textul pornește de la 12 px. Excepțiile reale de contract (11,52 px în 229, 11 px și valoare de grafic suprapusă în 210) sunt raportate ca findings D4–D8, cu captură și reproducere, fiindcă 153 nu are voie să modifice `src/`.
- [x] Tastatura și zoomul nu provoacă acțiuni ascunse sau layout rupt. Tab rămâne în dialog, Escape închide și readuce focusul în toate cele 6 scenarii modale, iar la 150% (853×480) și 200% (960×540) nicio suprafață nu iese din viewport. Cazul 640×360 iese din banda documentată de 084 și este raportat ca defect D1–D3, nu ascuns.

## Verificare

Capturi și playtest la rezoluțiile și zoomurile documentate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: harness QA real pentru HUD, panouri, notificări și suprafețele camerei, pe componentele reale din `src/ui` cu CSS-ul real, în Chromium 156.0.8078.4. Matrice: 5 viewport-uri (1280×720, 1920×1080, 150% pe 1280×720 → 853×480, 200% pe 1920×1080 → 960×540, 200% pe 1280×720 → 640×360 marcat `STRESS`) × 8 scenarii (HUD + minimapă + flotă cu 30 de taxiuri + 3 notificări, lista flotei, notificările, profilul, tabloul orașului, setările, reglajele camerei 229, pop-up-ul KPI 210). Fiecare captură are 14 verificări reale: mapare viewport/regiune, text ≥ 12 px și line-height ≥ 1,4, text netăiat, text nesuprapus, contrast WCAG AA pe fundal compus, controale cu dreptunghi și hit-test, controale esențiale, suprapunere critică, politică de scroll, suprafață în viewport, ordine de tab, focus vizibil 3 px și Escape. Rezultat: **22 capturi, 308 verificări, 300 trecute, 8 eșuate, 8 findings**; 9 538 de noduri text măsurate pentru contrast cu **0** abateri de la AA și 874 de controale măsurate. Defecte raportate (nu reparate, `src/` e în afara ownership-ului): D1–D3 flota și notificările ies sub viewport la 640×360; D4 text de 11,52 px în `.control-sliders__ends`/`__note`; D5–D8 etichete de 11 px și valoarea „fără review-uri” (36 px text în 14 px) care se suprapune peste grupurile vecine în pop-up-ul KPI.

Verificări executate și rezultat:
- `npm run typecheck` → exit 0 (src + tests).
- `npm run lint` → exit 0, 0 erori, 0 warning-uri.
- `npm run format:check` → „All matched files use Prettier code style!”.
- `npm run check:architecture` → PASS (358 fișiere TypeScript, probe negative 6+4+3, lifecycle).
- `npm run check:parameter-catalog` → „Parameter catalog is synchronized.”.
- `npm test` → 2 696 teste, 2 696 trecute, 0 eșuate, 0 sărite, 90 407 ms.
- `node --import ./scripts/register-typescript.mjs --test "tests/ui/ui-qa.test.ts"` → 22 teste, 22 trecute, 0 eșuate.
- `npm run qa:ui` → 22 capturi, 308 verificări, 300 trecute, 8 eșuate, 8 findings, verdict CONTRACT FAIL (5 findings CONTRACT).
- `npm run qa:ui -- --check` → „UI QA report is current” + „UI QA markdown is current”.
- `npm run qa:ui -- --browser` → Chromium 156.0.8078.4, 22 capturi scrise, 3 203 570 octeți de PNG.
- `npm run qa:ui -- --strict` → exit 1, exact cum e documentat pentru gate-ul viitor.

Fișiere și documente actualizate:
- `tests/ui/ui-qa.ts` (contractul 153: matrice, suprafețe, 14 verificări, raport, comparații, findings), `tests/ui/ui-qa.test.ts` (22 de teste).
- `tests/browser/qa-ui-153/index.html`, `tests/browser/qa-ui-153/main.ts` (pagina reală cu componentele din `src/ui`).
- `scripts/run-ui-qa-report.mjs` (`qa:ui`, `--check`, `--browser`, `--strict`).
- `package.json` (intrarea `qa:ui`, ultima din `"scripts"`).
- `Docs/18-validare-si-release.md` (secțiune nouă la final), `Docs/Evidence/153-ui-qa/` (README, `report.json`, `report.md`, `measurements.json`, 22 PNG).
- `src/` nu a fost modificat.

Limitări sau follow-up:
- Chromium headless fără GPU: dovezile acoperă layout, text, focus și scroll pe CSS-ul real, nu FPS, senzația de condus sau camera 3D randată; playtestul și frame-ul rămân ale gate-urilor 159/224/235.
- Zoomul este reprodus prin viewport-ul CSS efectiv (`width / zoom`), singurul lucru pe care îl văd media query-urile; Playwright nu are comutator de zoom de browser.
- Trei controale esențiale sunt ale hostului, nu ale `src/ui` (butoanele M/L 067 fără reguli în `src/style.css`, pauza meniului, recuperarea montată de host) și sunt declarate `OWNER_OUTSIDE_QA_HARNESS` cu motiv în fiecare măsurătoare.
- Findings-urile D1–D8 cer PBI-uri proprietare (layout 084/flotă pentru D1–D3, 229 pentru D4, 210 pentru D5–D8); `npm run qa:ui -- --strict` este gate-ul care le va închide.
- Observație neblocantă: la COMPACT minimapa reală (~227 px) depășește offsetul de 240 px al notificărilor cu ~3 px (`transient`, conform modelului 084).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '153' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Preluat pe `loop-pbi/qa-ui-153-01`; construit harness-ul QA (contract determinist, pagina reală în Chromium, script cu `--check`/`--browser`/`--strict`), rulat matricea de 22 de capturi la 1280×720, 1920×1080, 150% și 200% și raportat 8 findings reale fără a modifica `src/`; mutat în Done după validator.
