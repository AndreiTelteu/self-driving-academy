---
id: "076"
title: "Selectarea vehiculelor prin hartă"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["074","068","058"]
owner: "opencode deepseek-v4.1-flash map-selection-01"
started_at: "2026-10-20T23:53:54.037Z"
completed_at: "2026-10-21T03:13:27+03:00"
---

# 076 Selectarea vehiculelor prin hartă

## Obiectiv

Adaugă markers și selectarea taxiurilor și mașinilor civile.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 074 trebuie să existe în Done înainte de începere.
- PBI 068 trebuie să existe în Done înainte de începere.
- PBI 058 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Markerul se mapează la ID stabil chiar după actualizarea reprezentării.
- [x] Selectarea hărții nu teleportează vehiculele.

## Verificare

Testează civil distant, taxi și marker eliminat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Overlay-ul 076 proiectează toate taxiurile 057 și mașinile civile 058 cu poziție reală prin transformarea minimapului 074 și creează un singur `<button>` per `vehicleId`. Identitatea markerului este ID-ul stabil al flotei, nu indexul, mesh-ul sau handle-ul: schimbarea poziției, etichetei sau tipului TAXI/CIVIL actualizează același element, iar un vehicul dispărut își elimină markerul. Hit-test-ul pur 2D alege cel mai apropiat marker selectabil din rază, cu tie-break determinist pe ID. Un click sau Enter/Space emite exact o intenție `WORLD` prin portul 068; adaptorul nu mută, nu teleportează, nu schimbă camera și nu preia autoritatea. Simbolurile T/C și textele accesibile disting taxiurile de civile fără a se baza doar pe culoare.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (203 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1334/1334 pass, 0 fail; `npm run map:selection` 43/43 verificări, 8 scenarii, overall PASS; `npm run map:selection -- --check` „Map selection report is current”. Raportul acoperă 30 de taxiuri și 41 de civile, un civil distant, schimbarea urmăritului, eliminarea unui marker, identitatea stabilă la schimbarea reprezentării și 60 de cadre plafonate. Dovezi: [report.json](../../Docs/Evidence/076-map-selection/report.json), [report.md](../../Docs/Evidence/076-map-selection/report.md), [README](../../Docs/Evidence/076-map-selection/README.md).

Fișiere și documente actualizate: `src/ui/map-selection-format.ts`, `src/ui/map-selection.ts`, `src/app/map-selection.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/map-selection-fixture.ts`, `tests/ui/map-selection.test.ts`, `tests/app/map-selection-report.ts`, `scripts/run-map-selection-report.mjs`, `package.json`, `Docs/map-selection.md`, `Docs/minimap.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/README.md` și `Docs/Evidence/076-map-selection/`.

Limitări sau follow-up: Hostul live nu este încă legat; bootstrap-ul nu are încă o sesiune de flotă/curse, iar seam-ul este pregătit pentru integrarea 068/070/minimap. Overlay-ul cere un host poziționat care acoperă exact zona hărții; adaptorul scrie procente și nu măsoară canvasul/DPR. Pozițiile civililor sunt citiri injectate din 057, nu actori 058 simulați live. Hit-test-ul este 2D și nu înlocuiește picking-ul cu ocluziune Babylon 018. Nu se pretinde captură browser, FPS, GPU, memorie sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '076' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: overlay stabil pe `vehicleId`, hit-test determinist, intenție `WORLD` prin 068, 13 teste, raport cu 43 de verificări și documentație; mutat fizic în Done după validare.
