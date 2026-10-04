---
id: "003"
title: "Typecheck lint și convenții de cod"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["001"]
owner: "Codex /root/pbi003_quality"
started_at: "2026-10-04T23:56:19.5632121+03:00"
completed_at: "2026-10-05T00:05:31.0605685+03:00"
---

# 003 Typecheck lint și convenții de cod

## Obiectiv

Configurează verificarea statică și formatarea fără a amesteca implementarea gameplay-ului.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 001 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Comenzile rulează pe proiectul inițial și returnează cod nenul la o eroare demonstrată.
- [x] Convețiile de unități și tipuri necunoscute sunt explicate pentru dezvoltatori.

## Verificare

Introduce o eroare temporară controlată, verifică detecția și elimin-o.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Typecheck strict, ESLint flat config și Prettier configurate; comenzile typecheck, lint, format, format:check și check sunt disponibile. TypeScript 7 păstrat; parser Babel 8 pentru sintaxă TS, regulă locală no-explicit-any și separare explicită de analiza semantică tsc. Convențiile SI, timp/tick și validare unknown sunt documentate.

Verificări executate și rezultat: npm ci exit 0, audit zero vulnerabilități; npm run check exit 0 (typecheck/lint/format:check/arhitectură); npm run build exit 0, 255 module. Probe controlate separate: typecheck exit 1 TS2322, lint exit 1 project/no-explicit-any, format:check exit 1 numai fișierul temporar după baseline exit 0. Toate probele fizice eliminate în finally; opt cazuri AST valide/invalide au trecut cu numărul exact de erori așteptat. Loguri și scenarii exacte: [Dovezi 003](../../Docs/Evidence/003-quality/README.md). Prima încercare npm ci EPERM DLL ocupat, reluare trecută după oprirea Vite. Validator final -RequireDone 003 după mutarea fizică: Valid true; rezultat în board-final.txt.

Fișiere și documente actualizate: package.json, package-lock.json, tsconfig.json, eslint.config.js, .prettierrc.json, .prettierignore, README.md, Docs/development-conventions.md, Docs/Evidence/003-quality/* și acest PBI. Linkul din Docs/02 a fost adăugat coordonat de agentul 002; formatul surselor 002 a fost aplicat de proprietarul lor.

Limitări sau follow-up: Lintul TS nu este type-aware; tsc strict/noUnused* acoperă separat analiza semantică. typescript-eslint 8.71 declară TypeScript <6.1, deci migrarea lui se reevaluează când suportă TS7. Warning npm global msvs-version și warning Node stripTypeScriptTypes în checkerul 002; exit final 0. Fără implementare gameplay sau probe de randare necesare acestui scope.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '003' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T00:05:31.0639846+03:00: 003 implementat și verificat; probe negative exit 1 și cleanup, check/build/ci exit 0; mutare fizică în Done și validare -RequireDone 003.
