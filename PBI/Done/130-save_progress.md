---
id: "130"
title: "Persistența misiunilor și setărilor"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["127","126","081"]
owner: "loop-pbi/save-130-01"
started_at: "2026-11-11T14:35:18.192+02:00"
completed_at: "2026-11-11T14:48:21.562+02:00"
---

# 130 Persistența misiunilor și setărilor

## Obiectiv

Salvează progres, recompense, remapări și preferințe.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 127 trebuie să existe în Done înainte de începere.
- PBI 126 trebuie să existe în Done înainte de începere.
- PBI 081 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Reload păstrează recompensa unică și obiectivele terminate.
- [x] Resetul unei categorii nu șterge celelalte date.

## Verificare

Testează reload, reset de setări și reset de campanie.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/progress-save.ts` (contract `130-progress-save-v1`) salvează trei categorii separate, fiecare pe rândul ei, într-o singură tranzacție multi-store peste `progress` + `settings` din schema 127: `PROGRESS` este `MissionTrackerSnapshot` real 116, validat înainte de scriere prin `MissionTracker.restore` și restaurat la reîncărcare prin același `restore`; `CAMPAIGN` este jurnalul ordonat al operațiilor ledgerului 125 (`SETTLE`/`RESET`), reluat într-un ledger 125 proaspăt și comparat digest cu digest cu ledgerul viu; `SETTINGS` este `RuntimeSettings` real 009 (remapări, cameră, `ControlPreferences`, unități, calitate, scenariu, audio), cu valorile implicite documentate când rândul lipsește. Recompensa rămâne unică prin ciclu complet: după reload, aceeași finalizare răspunde `DUPLICATE`/`COMPLETION_ALREADY_SETTLED` cu 0 XP, iar o reluare reală 116 răspunde `NO_REWARD`/`REWARD_ALREADY_GRANTED` cu 0 XP; XP-ul rămâne 300, recompensele 6, deblocările 3. Resetul este explicit pe categorie: `SETTINGS` scrie doar setările (tracker și campanie cu digests identice), `CAMPAIGN` șterge doar rândul de campanie, `PROGRESS` șterge doar rândul de tracker; niciun reset nu atinge `profiles`/`profileActivations`. Un eșec înainte de commit lasă baza byte cu byte neschimbată.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (330 fișiere TypeScript, probe negative 6+4+3 PASS); `npm run check:parameter-catalog` „Parameter catalog is synchronized.”; `npm test` 2356/2356 pass, 0 fail; testele țintă `tests/persistence/progress-save.test.ts` 20/20 pass; `npm run save:progress` 70/70 verificări, 8 scenarii, overall PASS; `npm run save:progress -- --check` „Progress save report is current”. Dovezi: [report.json](../../Docs/Evidence/130-progress-save/report.json), [report.md](../../Docs/Evidence/130-progress-save/report.md), [README](../../Docs/Evidence/130-progress-save/README.md).

Fișiere și documente actualizate: `src/persistence/progress-save.ts` (nou), `src/persistence/repository.ts` (`commitPlayerSave`, `resetPlayerSave`, `readPlayerSave`), `src/persistence/contracts.ts` (șase coduri de refuz), `src/persistence/index.ts` (exporturi la finalul listei), `tests/persistence/progress-save-fixture.ts`, `tests/persistence/progress-save.test.ts`, `tests/persistence/progress-save-report.ts`, `scripts/run-progress-save-report.mjs`, `package.json` (`save:progress`, ultima intrare), `Docs/15-salvare-si-import-export.md` (secțiunea 130) și `Docs/Evidence/130-progress-save/`.

Limitări sau follow-up: validarea folosește dublul determinist în memorie peste porturile 127, nu IndexedDB-ul unui browser real (adaptorul real rămâne al lui 127). Un rând de tracker respectă bugetul de corp 127 (256 KiB): o sesiune cu un registru de identități de eveniment peste buget este refuzată cu `BODY_TOO_LARGE`, nu trunchiată și nu împărțită pe mai multe rânduri. Jurnalul de campanie este plafonat la 256 de operații. Nu există autosave periodic, UI de salvare sau compunere în `main.ts`; acestea rămân pașilor de integrare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '130' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11: Implementare finalizată pe `loop-pbi/save-130-01`; contract `130-progress-save-v1`, 20/20 teste țintă, 2356/2356 teste, raport 70/70 verificări în 8 scenarii.
