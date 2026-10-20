---
id: "109"
title: "Profile imuabile și istoric versionat"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["092","102"]
owner: "Codex gpt-6-luna medium profile-store-01"
started_at: "2026-10-20T02:35:00+03:00"
completed_at: "2026-10-20T02:55:00+03:00"
---

# 109 Profile imuabile și istoric versionat

## Obiectiv

Creează versionId, parentVersionId, engineVersion și proveniență.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 092 trebuie să existe în Done înainte de începere.
- PBI 102 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Versiunile nu sunt editate în loc; deltele păstrează baza.
- [x] Aceeași intervenție nu creează două versiuni.

## Verificare

Testează istoric, checksum și publicare duplicată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/profiles/profile-store.ts` (exportat prin `src/profiles/index.ts`) oferă `createProfileStore` cu `createBase`, `derive`, `getVersion`, `listVersions`, `getHistory`, `getInterventionVersion`, `stats`, `clear`, `dispose`, plus verificarea de checksum. `src/learning/profile-store.ts` leagă obligatoriu gate-ul 102 `validateCandidateDelta` printr-un port injectat (src/profiles nu poate importa src/learning fără ciclu de domeniu). Fiecare versiune este înghețată profund (parametri, proveniență, schimbări, liste de id-uri), iar citirile întorc copii înghețate; un copil copiază întreaga hartă a părintelui, care nu este editat niciodată. Baza este explicită: `provenance.delta.baseVersionId === parentVersionId`, fiecare schimbare păstrează `previousValue` din părinte, un delta cu altă bază este `DELTA_BASE_MISMATCH`, iar o cheie absentă din bază este `DELTA_KEY_NOT_IN_BASE`. Idempotența este pe `segmentId` în scopul `profileId`-ului: o retrimitere întoarce același `versionId` cu `deduplicated: true`, chiar cu alt id/timestamp; un payload diferit pentru același segment este `INTERVENTION_CONFLICT`. Respingerile sunt închise (părinte lipsă/străin/propriu, engine mismatch, delta/versiune/bază mismatch, delta invalid 102 cu `deltaCodes`, cheie în afara bazei, limite de proveniență/istoric/intervenții, store disposed), iar structurile invalide aruncă `ContractValidationError`. Istoricul este mărginit (implicit 256 versiuni, 128 per profil, 512 intervenții, limite configurabile validate), `clear`/`dispose` sunt idempotente cu contoare. Nu se publică profil/delta, nu se activează `PROFILE_ACTIVATE`, nu se emite `LEARNED` și nu se ating flagurile 092.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (179 fișiere + probe negative), `check:parameter-catalog` exit 0; `npm test` 1143/1143 PASS (1127 baseline + 16); suita țintă `tests/profiles/profile-store.test.ts` 16/16. Dovezi în [Evidence/109-profile-store](../../Docs/Evidence/109-profile-store/README.md).

Fișiere și documente actualizate: `src/profiles/profile-store.ts`, `src/learning/profile-store.ts` (noi), `src/profiles/index.ts`, testele aferente, [Docs/profile-store.md](../../Docs/profile-store.md) (nou), [Docs/12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md), `Docs/Evidence/109-profile-store/`.

Limitări sau follow-up: exclusiv în memorie (fără persistență/IndexedDB/autosave, 127/128); fără publicare/activare/propagare la tick/`learningEpoch` (110/205); fără worker sau integrare cu estimatorul; fără browser sau probă de performanță. Istoricul este mărginit prin respingere, nu prin arhivare, iar checksum-ul FNV-1a este o amprentă de integritate, nu o semnătură criptografică.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '109' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `a6fd8b37`): store de profiluri imuabile cu versionId/parent/engine/proveniență, delta cu bază explicită, idempotență pe segment și gate 102, limite și ciclu de viață. Integrat prin fast-forward; verificat de orchestrator cu 1143/1143 teste.
