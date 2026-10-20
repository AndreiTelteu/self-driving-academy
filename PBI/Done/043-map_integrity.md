---
id: "043"
title: "Validarea integrității întregii hărți"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["042","041","036"]
owner: "Codex gpt-6-luna medium map-integrity-01"
started_at: "2026-10-20T03:05:00+03:00"
completed_at: "2026-10-20T03:20:00+03:00"
---

# 043 Validarea integrității întregii hărți

## Obiectiv

Verifică conectivitate, zone, linii și acoperirea scenariilor.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 042 trebuie să existe în Done înainte de începere.
- PBI 041 trebuie să existe în Done înainte de începere.
- PBI 036 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare pickup/dropoff planificat este rutabil.
- [x] Erorile de hartă sunt raportate cu IDs și poziții.

## Verificare

Rulează matricea de conectivitate și punctele de serviciu.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/world/map-integrity.ts` (exportat prin `src/world/index.ts`) expune `checkMapIntegrity(input, options?)` cu un vocabular închis de 20 de motive și 13 verificări: schemă/limite, id-uri duplicate, referințe geometrice, referințe de bandă, geometrie/lățime/coridor de bandă, intersecții/mișcări, semafoare, linii de oprire, treceri, zone de serviciu (ancoră, acces, suprapunere de amprentă), puncte de recuperare, componente tare/slab conectate plus reachability inversă și matricea statică de rute. Raportul conține `ok`, `issueCount`, `truncated`, `errorsByReason`, `schemaError` și un obiect `coverage`; nu aruncă pentru conținut de hartă și păstrează constatările structurale chiar când parserul respinge documentul. Fără Babylon/DOM/tick; ~0,17 s pentru auditul complet al cartierului.

Cartierul real: **PASS, 0 probleme** — 96 benzi, 25 intersecții (4 signalized / 4 STOP / 17 uncontrolled), 296 mișcări, 4 semafoare, 234 linii de oprire, 80 treceri, 16 zone de serviciu, 6 puncte de recuperare; 6.047 referințe verificate, 0 nerezolvate; 1 componentă tare conectată și 1 slab conectată, cea mai mare 96/96; **2.880/2.880 rute TAXI+CIVIL bandă→zonă READY**, 16/16 zone de pickup/dropoff rutabile. CLI-ul de corupție arată **FAIL, 45 probleme pe 9 motive, exit non-zero** (126 prin shim-ul Volta/Windows; Node întoarce 1). Cele 11 teste de corupție acoperă bandă suspendată, semafor lipsă, zonă suprapusă, id duplicat, lățime de 6 m, succesori goliți, schemă 2, bandă through inversată și input non-obiect.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (180 fișiere + probe negative), `check:parameter-catalog` exit 0; `npm test` 1154/1154 PASS (1143 baseline + 11); suita țintă 11/11; `node scripts/map-integrity-report.mjs` PASS, exit 0, 0 probleme. Dovezi în [Evidence/043-map-integrity](../../Docs/Evidence/043-map-integrity/README.md) (`report.md`, `report.json`, `corruption-gate.txt`, teste și checks).

Fișiere și documente actualizate: `src/world/map-integrity.ts` (nou), `src/world/index.ts`, `scripts/map-integrity-report.mjs` (nou), `tests/world/map-integrity.test.ts` (nou), [Docs/map-integrity.md](../../Docs/map-integrity.md) (nou), documentația de hartă afectată, `Docs/Evidence/043-map-integrity/`.

Limitări sau follow-up: audit static la încărcare; suprapunerea benzilor folosește centrele autorate și lățimile declarate (fără narrow-phase fizic); suprapunerea zonelor folosește bounding box-uri X/Z; matricea de rute este statică (033/041), fără trafic sau stare blocată; lista de detalii este plafonată la 512 cu contoare complete și flag `truncated`; nu este un gate de performanță sau gameplay.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '043' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `ee7474d0`): validator de integritate cu 13 verificări și 20 de motive, raport de acoperire, matrice 2.880/2.880 rute și 11 teste de corupție. Integrat prin fast-forward; verificat de orchestrator cu 1154/1154 teste.
