---
id: "092"
title: "Schema celor 80 de parametri și stări de suport"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["005"]
owner: "Codex gpt-6.1-sol (implementation sub-agent PBI092)"
started_at: "2026-10-05T00:30:46.6488314+03:00"
completed_at: "2026-10-05T00:35:34.2579896+03:00"
---

# 092 Schema celor 80 de parametri și stări de suport

## Obiectiv

Încarcă independent de telemetrie catalogul în registry tipizat: chei, unități, intervale, default, implementat și estimabil.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toate cele 80 de chei au unități, intervale și default validate.
- [x] Cheile încă neimplementate nu pot fi publicate drept învățate.

## Verificare

Verifică 80 de chei unice și cele 24 de ținte M.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Registry tipizat cu 80 chei unice, 24 ținte M, unități/default/intervale validate; catalog TS generat determinist din JSON. implemented/estimable false pentru toate cheile. Gate parsePublishableDrivingProfile respinge LEARNED/MANUAL_TUNING nesuportat și chei/unități/valori invalide, fără schimbarea parserului structural 005.

Verificări executate și rezultat: npm run check PASS (59/59 teste, inclusiv 8 registry; typecheck/lint/format/arhitectură), npm run build PASS, generator --check PASS; detalii și output în Docs/Evidence/092-parameter-registry/dovezi.txt, tests.txt și catalog-sync.txt. Validatorul final -RequireDone 092 este păstrat în board-validation.txt.

Fișiere și documente actualizate: src/profiles/parameter-registry.ts, parameter-catalog.generated.ts, index.ts; tests/parameters/registry.test.ts; scripts/generate-parameter-catalog.mjs; Docs/parameter-registry.md, Docs/data-contracts.md; Docs/Evidence/092-parameter-registry; acest PBI.

Limitări sau follow-up: Fără controller/estimatori/serviciu de activare. Viitorii writeri trebuie să folosească gate-ul și să adauge validarea engine/bază/epoch și activarea atomică. Activarea capabilităților cere implementarea și verificarea politicii/estimatorului. Nu s-a executat commit/push.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane. Confirmat pe disk după mutare.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '092' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-05T00:35:34.2579896+03:00: Implementat și verificat PBI092; mutare fizică în Done și validare obligatorie, cu dovezi în Docs/Evidence/092-parameter-registry.
