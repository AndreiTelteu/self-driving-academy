---
id: "083"
title: "Accesibilitate contrast și tastatură"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["075","078","081","082"]
owner: "opencode deepseek-v4.1-flash ui-accessibility-01"
started_at: "2026-10-21T09:20:12.641Z"
completed_at: "2026-10-21T12:55:58+03:00"
---

# 083 Accesibilitate contrast și tastatură

## Obiectiv

Verifică focus, text, simboluri, contrast și navigarea panelurilor.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 075 trebuie să existe în Done înainte de începere.
- PBI 078 trebuie să existe în Done înainte de începere.
- PBI 081 trebuie să existe în Done înainte de începere.
- PBI 082 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Panelurile pot fi operate cu tastatura și au focus vizibil.
- [x] Nicio acțiune UI nu conduce accidental mașina.

## Verificare

Parcurge fluxurile principale fără mouse și verifică modurile.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: A fost adăugat un contract de accesibilitate `083-ui-accessibility-v1` cu tokenuri reale de culoare, calcul WCAG al contrastului, praguri 4.5:1 pentru text normal și 3:1 pentru text mare/indicatori non-text, descriptori pentru zece suprafețe reale (fleet, profile, profile history, setări, city dashboard, remapare taste, notificări, minimap, markeri hartă, HUD) și un audit determinist cu coduri închise pentru nume lipsă, lipsa unui control focalizabil, focus vizibil lipsă, listener global de tastatură, stare doar prin culoare, contrast scăzut, operare fără tastatură și buton fără `type="button"`. Toate cele 18 perechi unice de contrast (77 măsurători) trec pragurile, cu minim 7.17:1. Toate cele 28 de butoane reale au `type="button"`, niciun panou nu instalează listener global, iar starea este purtată de text/simbol, nu doar de culoare. Au fost adăugate reguli `:focus-visible` pentru filtrul/sortarea listei de taxiuri și pentru `summary`-ul HUD și un inel de focus comun. `createPanelFocusController` mută focusul pe primul control, ciclizează Tab/Shift+Tab în panou, închide pe Escape prin portul injectat și restaurează focusul anterior; toate listenerele sunt pe elementul panoului, niciodată pe window/document. Matricea de blocare compune 070: panourile de observare rămân live în AUTO și suspendă în MANUAL/LEARNING, meniurile suspendă în toate modurile, diagnosticul read-only nu suspendă niciodată; bridge-ul nu trimite comenzi și nu revendică locul PLAYER.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (224 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1477/1477 pass, 0 fail; `npm run ui:accessibility` 53/53 verificări, 7 scenarii, overall PASS; `npm run ui:accessibility -- --check` „UI accessibility report is current”. Testele țintite 083: 25/25 pass. Raportul parcurge cele șapte scenarii de panouri, tabelul de contrast, ordinea de focus, matricea de blocare a condusului și DOM-ul serializat. Dovezi: [report.json](../../Docs/Evidence/083-ui-accessibility/report.json), [report.md](../../Docs/Evidence/083-ui-accessibility/report.md), [README](../../Docs/Evidence/083-ui-accessibility/README.md).

Fișiere și documente actualizate: `src/ui/accessibility-format.ts`, `src/ui/panel-focus.ts`, `src/app/ui-accessibility.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/accessibility.test.ts`, `tests/app/ui-accessibility-report.ts`, `scripts/run-ui-accessibility-report.mjs`, `package.json`, `Docs/ui-accessibility.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/27-reglaje-hud-si-camera.md`, `Docs/README.md` și `Docs/Evidence/083-ui-accessibility/`.

Limitări sau follow-up: Nu există captură browser, playtest cu tastatură/mouse real sau certificare cu cititor de ecran (NVDA/VoiceOver). Nu au fost testate daltonismul, `forced-colors`, zoom-ul/text scaling 200% sau atingerea; acestea rămân pentru 235. Bridge-ul este pregătit pentru compunere, dar nu este legat în hostul live; 070 rămâne singurul proprietar al suspendării, iar controllerul de focus trebuie deschis de host după randare. Nu se pretinde FPS, memorie sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '083' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: audit de contrast/focus/tastatură pentru zece suprafețe, controller de focus modal cu restaurare, matrice de blocare a condusului compusă cu 070, corecții vizibile de focus și 25 de teste; raport cu 53 de verificări. Mutat fizic în Done după validare.
