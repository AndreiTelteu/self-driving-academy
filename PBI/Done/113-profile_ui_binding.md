---
id: "113"
title: "Conectarea UI la profiluri reale"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["112","077","078","104"]
owner: "opencode deepseek-v4.1-flash profile-ui-binding-01"
started_at: "2026-10-21T18:00:49.009Z"
completed_at: "2026-10-21T21:22:53+03:00"
---

# 113 Conectarea UI la profiluri reale

## Obiectiv

Înlocuiește datele de preview cu proiecții reale ale serviciului.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 112 trebuie să existe în Done înainte de începere.
- PBI 077 trebuie să existe în Done înainte de începere.
- PBI 078 trebuie să existe în Done înainte de începere.
- PBI 104 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] UI și politica raportează aceeași versiune și aceleași valori.
- [x] Rezervat și neobservat rămân distincte în istoric.

## Verificare

Compară UI, delta și reason code în același scenariu.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Binding-ul `113-profile-ui-binding-v1` citește versiunea reală 109 (sau ținta 110), construiește proiecțiile 077 și 078 din aceleași snapshoturi imutabile și validează explicația 104 a ultimului rezultat 112. Versiunea din panou, istoric, părintele selectat și ținta activă trebuie să fie identice; fiecare dintre cele 24 de chei M este comparată valoare-cu-valoare între panou, istoric și delta, nu doar presupusă. Cheile R rămân `RESERVED`/`null`, niciodată learnabile și niciodată în delta, chiar dacă recordul versiunii conține un număr; cheile absente rămân `UNOBSERVED`/`null`, iar un zero real rămâne `OBSERVED`/`0`. Delta folosește baza reală părinte→copil, iar codurile de motiv trebuie să corespundă explicației 104 (`CHANGED`, `EVIDENCE_APPLIED`, `ZERO_OBSERVED`, `NO_CHANGE` cu motivul închis). O versiune 109 simplă nu are evidence record, deci numărul de dovezi, incertitudinea și calitatea sunt explicit `0`/`NO_EVIDENCE_RECORD`, fără valori inventate. Când nu există versiune reală, binding-ul este gol și raportează `MISSING_VERSION`, fără fallback la preview-ul ilustrativ 077. Verificatorul returnează nouă coduri închise (`VERSION_MISMATCH`, `PANEL_VALUE_MISMATCH`, `HISTORY_VALUE_MISMATCH`, `ACTIVE_TARGET_MISMATCH`, `DELTA_BASE_MISMATCH`, `RESERVED_TREATED_AS_OBSERVED`, `UNOBSERVED_TREATED_AS_ZERO`, `REASON_CODE_MISMATCH`, `MISSING_VERSION`) și `pass` numai cu zero nepotriviri; nimic nu este reparat automat.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (244 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1683/1683 pass, 0 fail; `npm run profile:ui-binding` 54/54 verificări, 7 scenarii, overall PASS; `npm run profile:ui-binding -- --check` „Profile UI binding report is current”. Testele țintite 113: 21/21 pass. Raportul acoperă versiunea curentă, delta părinte→copil, cheia rezervată, cheia neobservată, zero real, `NO_CHANGE` și nepotrivirile injectate. Dovezi: [report.json](../../Docs/Evidence/113-profile-ui-binding/report.json), [report.md](../../Docs/Evidence/113-profile-ui-binding/report.md), [README](../../Docs/Evidence/113-profile-ui-binding/README.md).

Fișiere și documente actualizate: `src/app/profile-ui-binding.ts`, `src/app/index.ts`, `tests/app/profile-ui-binding.test.ts`, `tests/app/profile-ui-binding-fixture.ts`, `tests/app/profile-ui-binding-report.ts`, `scripts/run-profile-ui-binding-report.mjs`, `package.json`, `Docs/profile-ui-binding.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/README.md` și `Docs/Evidence/113-profile-ui-binding/`.

Limitări sau follow-up: Store-ul 109 păstrează valorile, dar nu proveniența/dovezile per cheie, deci rândurile 077 folosesc sursa închisă `PROFILE_VALUE_BASE` cu `NO_EVIDENCE_RECORD`; aceasta nu este o afirmație că valoarea a fost învățată. Explicația 104 este furnizată de host și validată față de ultimul rezultat 112; binding-ul nu o recalculează din jobul 103. Pipeline-ul și activarea sunt porturi injectate; nu este adăugată legarea live. Nu se pretinde captură browser, FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '113' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: proiecții reale 109/110 pentru panou, istoric și delta, verificare versiune/valori, rezervat vs neobservat distinct, zero real, coduri de motiv 104 și nouă coduri de nepotrivire; 21 teste, raport cu 54 de verificări și documentație. Mutat fizic în Done după validare.
