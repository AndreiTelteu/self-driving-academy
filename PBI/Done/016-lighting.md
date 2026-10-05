---
id: "016"
title: "Materiale lumină și niveluri de calitate"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["013","009"]
performance_checks: ["frame", "assets"]
owner: "Codex /root/pbi012"
started_at: "2026-10-05T03:01:06.4328688+03:00"
completed_at: "2026-10-05T03:18:14.6519649+03:00"
---

# 016 Materiale lumină și niveluri de calitate

## Obiectiv

Creează iluminarea zilei și setările de umbre/materiale cu paritate de gameplay.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 013 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Semnalele și marcajele sunt lizibile la nivelurile de calitate alese.
- [x] Schimbarea calității nu schimbă regulile sau fizica.

- [x] Rezoluția internă/DPR și presetul sunt explicite; ajustarea automată are histerezis și păstrează regulile simulării.

## Verificare

Inspectează scenele pe ambele backenduri și două niveluri de calitate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: compoziție explicită createDaylight pentru ambient/soare, materiale semantice și umbre finite, LOW/MEDIUM/HIGH, DPR/rezoluție explicite și adaptare numai cu evidență GPU, ferestre plafonate, histerezis și cooldown. Nu deține simularea sau o buclă nouă.

Verificări executate și rezultat: 6 teste lighting PASS; npm test final 186 PASS; typecheck/lint/scoped Prettier/build PASS. Browser T3 real GL/GPU × LOW/MEDIUM: semnale/marcaje lizibile, patru capturi și probe CPU cu cinci repetări; DPR sintetic 2 în MEDIUM a produs canvas real 960×540, fără resurse duplicate. Baseline înainte și după/cost suplimentar separat sunt în Docs/Evidence/016-lighting/verification.md și JSON-uri cu SHA256 surse/build. Validatorul final este păstrat în board-validation.json.

Fișiere și documente actualizate: src/rendering/quality-policy.ts, src/rendering/babylon/daylight.ts; tests/rendering/lighting.test.ts, tests/browser/lighting/*; Docs/lighting-quality.md, Docs/Evidence/016-lighting/*; acest PBI. Parentul integrează public exports și linkurile din Docs comune.

Limitări sau follow-up: fixture de calibrare, fără fizică/gameplay complet; nu închide bugete hardware/FPS/steady-state. Inputul GPU vine din portul profilerului; GPU necunoscut nu declanșează adaptare. Limitele finale asseturi/LOD/efecte rămân pentru 203/223. Ultimul check global s-a oprit pe formatul a trei fișiere PBI019 în lucru; toate fișierele 016 trec verificările scoped.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '016' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.


- 2026-10-05T03:18:14.6548276+03:00: implementare și probe completate; mutare fizică în Done urmată de RequireDone 016.
