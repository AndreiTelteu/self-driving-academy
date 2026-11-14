---
id: "190"
title: "Închiderea release-ului V2"
status: "Done"
release: "V2"
module: "Release V2"
depends_on: ["189"]
owner: "loop-pbi/v2-release-190-01"
started_at: "2026-11-14T05:15:50+02:00"
completed_at: "2026-11-14T05:35:52+02:00"
---

# 190 Închiderea release-ului V2

## Obiectiv

Pregătește artefactul cu 80 de parametri și note de compatibilitate.

## Context și plan

[19-roadmap-si-decizii.md](../../Docs/19-roadmap-si-decizii.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 189 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toate dependențele V2 au dovezi și sunt în Done.
- [x] Documentația și catalogul descriu suportul real.

## Verificare

Checklist release și demonstrație a transferului stilului extins.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `npm run release:v2` (script nou `scripts/run-v2-release-artifact.mjs`, ultima intrare din `package.json`) generează determinist șase fișiere în `Docs/Evidence/190-v2-release/`: artefactul celor 80 de chei (JSON + Markdown), notele de compatibilitate (JSON + Markdown) și checklist-ul de release (JSON + Markdown). Artefactul este derivat, nu scris de mână: catalogul `Docs/driving-parameters.json` + `src/profiles/parameter-capabilities.ts`, verificate cu aceeași funcție fail-closed a porții 187, legate de provocările 188 prin `learningKeys` și de rezervare prin `reservedParameterKeys`. Rezultat: 80/80 chei (24 CORE + 56 V2), 80 de politici și 80 de estimatori (0 `NONE`), 56 de efecte măsurate + 24 de consecințe M păstrate, 8 convenții canonice, 15 chei cu provocare 188 și 41 fără, **56 de chei certificate dar rezervate de etapa de plan**. Demonstrația transferului stilului extins: **10/10 familii** au valoare candidată estimată și efect măsurat în politică, iar 10/10 sunt blocate înainte de flotă (`KEY_EXTENSION_STAGE`, `reservedParameters`). Notele au 15 afirmații (5 schimbări, 3 identice, 3 noutăți, 4 deschise), fiecare cu dovada care o susține. Checklist-ul are 17 rânduri: 10 `PASS`, 2 `FAIL`, 5 `NOT_RUN`, verdict `NOT_VALIDATED`, fiecare rând deschis cu owner. Dependențele V2 163–189: 27/27 în Done, cu dovezi fără placeholder. A fost corectată în `Docs/11` afirmația falsă „estimarea și publicarea LEARNED rămân dezactivate", contrazisă de cei 80 de estimatori certificați, și a fost adăugată secțiunea „Suport real după 187".

Verificări executate și rezultat: `npm run release:v2` exit 0 (11/11 verificări `PASS`, verdict `PASS`); `npm run release:v2 -- --check` exit 0 („Release artifacts V2 are current."); `npm run typecheck` exit 0; `npm run lint` exit 0 (0 warnings); `npm run format:check` exit 0; `npm run check:architecture` exit 0 (PASS, 391 fișiere TypeScript, probe negative 6 + 4 + 3 respinse); `npm run check:parameter-catalog` exit 0; `npm test` exit 0 (**3 250 teste, 3 250 trecute, 0 eșuate**, 0 sărite, 109,8 s); `npm run profile:v2 -- --check` exit 0; `npm run learning:gate24 -- --check` exit 0; `pwsh ./PBI/Validate-Board.ps1` → `Valid: true`, 235 task-uri, In Progress 1; `pwsh ./PBI/Validate-Board.ps1 -RequireDone '190'` → `Valid: true`, 235 task-uri (12 To Do, 0 In Progress, 223 Done), `RequiredDonePaths` = `PBI/Done/190-release_v2.md`. `PBI/Validate-Plan.ps1` eșuează preexistent la PBI 188 (index `Provocări` cu caracterul 259 vs frontmatter `Provocari` cu 97), nu din cauza acestui PBI.

Fișiere și documente actualizate: create `scripts/run-v2-release-artifact.mjs`, `Docs/Evidence/190-v2-release/README.md`, `parameter-artifact.json|md`, `compatibility-notes.json|md`, `release-checklist.json|md`; modificate `package.json` (o singură intrare nouă, ultima: `release:v2`), `Docs/11-catalog-parametri.md` (corectarea afirmației false despre `LEARNED` și secțiunea „Suport real după 187"), `Docs/19-roadmap-si-decizii.md` (secțiune nouă la final); mutat `PBI/To Do/190-release_v2.md` → `PBI/In Progress/` → `PBI/Done/`. `src/`, `Docs/driving-parameters.json`, `Docs/performance-budgets.json`, `Docs/18`, bugetele și celelalte dovezi comise nu au fost modificate.

Limitări sau follow-up: checklist-ul rămâne `NOT_VALIDATED`, cu 5 rânduri `NOT_RUN` cu owner (hardware FPS — operator + 224; harness V2 — 220/224; soak V2 — 159/224; playtest uman — 216/235; re-măsurare 224 — 224, pentru că `perf:gate -- --check` iese cu exit 1) și 2 rânduri `FAIL` moștenite (regula V1 din `Docs/parameter-registry.md`, în afara ownership-ului 190, și gate-urile V1 153/235 din checklist-ul 162). Cele 56 de chei V2 rămân certificate, dar rezervate de etapa de plan; 41 nu au provocare dedicată. Generatorul citește dovezile comise și nu reexecută gate-urile grele.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '190' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14: Implementare completă în `loop-pbi/v2-release-190-01`: artefact derivat pentru cele 80 de chei, note de compatibilitate cu dovezi per afirmație, checklist `NOT_VALIDATED` (10 PASS / 2 FAIL / 5 NOT_RUN) și demonstrația transferului stilului extins (10/10 familii până la politică, blocate înainte de flotă); corectată afirmația falsă din `Docs/11`; mutat în Done.
