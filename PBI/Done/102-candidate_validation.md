---
id: "102"
title: "Validarea numerică a unui delta"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["101","092"]
owner: "Codex gpt-6-luna medium candidate-validation-01"
started_at: "2026-10-20T01:15:00+03:00"
completed_at: "2026-10-20T01:28:00+03:00"
---

# 102 Validarea numerică a unui delta

## Obiectiv

Validează numere, intervale, suport și compatibilitate ale unui candidat.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 101 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Valorile invalide sunt respinse cu motiv; nu se publică delta parțial ascuns.
- [x] Coliziunile sau încălcările posibile nu constituie singure motiv de respingere.

## Verificare

Testează NaN, cheie R și un profil riscant dar numeric valid.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/learning/candidate-validation.ts` (exportat prin `src/learning/index.ts`) validează atomic un delta: `validateCandidateDelta` întoarce `ACCEPTED` cu un delta înghețat sau `REJECTED` cu `delta: null`, `acceptedKeyCount: 0` și toate problemele colectate. Verificările sunt: cheie cunoscută, etapă M (cheile R sunt refuzate cu `KEY_EXTENSION_STAGE`), unitatea canonică 092, număr finit, interval 092 inclusiv, cheie unică și delta nevid, plus compatibilitatea schemei/versiunii de profil, a versiunii de bază și a motorului. Codurile de respingere sunt închise: `DELTA_EMPTY`, `VALUE_ENTRY_INVALID`, `DUPLICATE_KEY`, `KEY_UNKNOWN`, `KEY_EXTENSION_STAGE`, `VALUE_NOT_FINITE`, `VALUE_OUT_OF_RANGE`, `UNIT_MISMATCH`, `PROFILE_VERSION_MISSING`, `PROFILE_VERSION_SELF_PARENT`, `PROFILE_SCHEMA_MISMATCH`, `BASE_VERSION_MISMATCH`, `ENGINE_VERSION_MISMATCH`. Un profil riscant dar numeric valid este acceptat fără clampare; coliziunile sau încălcările posibile nu sunt motiv de respingere. Rezultatul are `published: false`, `learned: false`, `behaviour: 'NOT_EVALUATED'` și nu atinge flagurile 092.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (172 fișiere), `check:parameter-catalog` exit 0; `npm test` 1098/1098 PASS (1084 baseline + 14); suita țintă `tests/learning/candidate-validation.test.ts` 14/14. Dovezi verbatim în [Evidence/102-candidate-validation](../../Docs/Evidence/102-candidate-validation/README.md).

Fișiere și documente actualizate: `src/learning/candidate-validation.ts` (nou), `src/learning/index.ts`, `tests/learning/candidate-validation.test.ts` (nou), [Docs/candidate-validation.md](../../Docs/candidate-validation.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/102-candidate-validation/`.

Limitări sau follow-up: nu există worker, persistență, publicare, `LEARNED`, checksum, `learningEpoch` sau propagare la tick; fără browser sau probă de performanță. Flagurile 092 rămân neatinse, iar `implemented` este metadată, nu o poartă. `yield_time_gap` este cheie M cu `implemented=false` și rămâne o decizie de publicare 092.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '102' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `044f7696`): validare atomică a delta-ului cu motiv închis, chei M-only, interval/unitate 092, compatibilitate profil/motor și acceptarea valorilor riscante numeric valide. Integrat prin fast-forward; verificat de orchestrator cu 1098/1098 teste.
