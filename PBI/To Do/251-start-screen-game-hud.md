---
id: "251"
title: "Ecran de start, HUD de joc și eliminarea layoutului de debug"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["240"]
performance_checks: ["ui","frame"]
owner: null
started_at: null
completed_at: null
---

# 251 Ecran de start, HUD de joc și eliminarea layoutului de debug

## Obiectiv

Pagina arată acum ca o pagină de test: titlul HTML „Self Driving Academy” uriaș deasupra jocului, linia de status „Bootstrap pregătit · Babylon.js · WEBGPU”, butoane gri implicite („Pornește”, „Pauză”, „Reîncarcă”), un `<details>` „Diagnostic” și un panou text de debug în colț. Înlocuiește-le cu un ecran de start și un HUD de joc.

## Context și plan

Layoutul este bootstrap-ul din `index.html` și `src/style.css`; HUD-ul 236 este minimal (text cu modul, viteza și tick-ul). Componentele UI existente (meniuri, minimap 074, setări 009, accesibilitate 084) rămân și sunt stilizate unitar. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 15. Folosește skill-ul `impeccable` pentru designul UI.

## Dependențe

- PBI 240 trebuie să fie în Done (canvas pe tot ecranul).

## Criterii de acceptare

- [ ] Un ecran de start peste scena randată (cu orașul în fundal, cameră cinematică lentă) conține titlul jocului, „Joacă”, „Setări” și indicatorul de încărcare. Backendul, tick-ul și textele de bootstrap nu sunt vizibile jucătorului.
- [ ] Meniul de pauză (Esc) are aceleași stiluri și include Reia, Setări, Reîncarcă și Ieși.
- [ ] HUD-ul de condus are un vitezometru clar (km/h), indicatorul de mod sau vehicul și pictograme de acțiune contextuale („G — Intră în taxi” numai lângă o mașină); HUD-ul de mers este minimal.
- [ ] Panoul Diagnostic și citirile tick/backend sunt disponibile numai în dev sau cu un flag explicit (de exemplu `?debug=1`).
- [ ] Un sistem de design unitar (tokeni de culoare, tipografie, spațiere, colțuri și umbre) pentru toate panourile; contrast WCAG AA; lizibil la 1280×720 și 2560×1440.
- [ ] Testele UI existente (084, `qa:ui`, `ui:responsive`, `ui:accessibility`) trec sau sunt actualizate cu motivul schimbării.

## Verificare

Capturi 239 (UI/HUD, start, pauză) înainte/după. `npm run qa:ui`, `npm run ui:responsive -- --check` și `npm run ui:accessibility -- --check`. Playtest de la pornire la condus.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '251' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: layout de pagină de test, butoane implicite, HUD de debug.
