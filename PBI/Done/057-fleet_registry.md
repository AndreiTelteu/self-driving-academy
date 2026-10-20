---
id: "057"
title: "Registry flotă și mașini civile"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["056","023"]
owner: "Codex gpt-6-luna medium loop-057"
started_at: "2026-10-20T14:03:52+03:00"
completed_at: "2026-10-20T04:05:00+03:00"
---

# 057 Registry flotă și mașini civile

## Obiectiv

Creează 24 de taxiuri configurabile între 20 și 30 și vehicule civile.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 056 trebuie să existe în Done înainte de începere.
- PBI 023 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare vehicul are ID, clasă, driverKind și stare independentă de cameră.
- [x] Taxiurile și civilele sunt legate de profilul comun al orașului; vehiculele noi primesc versiunea activă.

## Verificare

Verifică 20, 24 și 30 de taxiuri și identificatori unici.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/registry.ts` (exportat prin `src/fleet/index.ts`) oferă `parseFleetConfiguration`/`createFleetRegistry` cu `context/get/state/list/addVehicle/updateState/removeVehicle/counts/report/dispose`. Fiecare vehicul are `vehicleId` stabil din 006 (`createStableId('vehicle', namespace, [driverKind, slot 4 cifre])`, maximum 256 unități), `driverKind` TAXI/CIVILIAN, `slot`, clasa reală 023 cu `classVersion`, `profileId` comun și `createdAtTick`; starea proprie conține doar `tick`, `controlMode` (contract 024) și `appliedProfileVersion`, fără câmp de cameră, selecție, vizibilitate sau renderer. Clasa este derivată determinist din seed (`deriveScenarioSeed → deriveVehicleSeed → randomUint32(..., 'fleet-class', 0)`), astfel încât ordinea de creare și mărimea populației nu re-clasifică vehiculele existente; `classPlan` explicit este singura suprascriere. `list()` sortează după id, raportul are matrice fixă `driverKind × class` cu zerouri incluse, iar stările sunt obiecte înghețate separate: un update atinge doar vehiculul adresat și respinge tick-urile vechi. Validarea impune 20–30 taxiuri, 20–40 civile, total ≤ 70, numere întregi, seed uint32, lungimi de namespace/id, id-uri unice, clasă/tip cunoscute și perechi clasă/driver compatibile. Ownership-ul este intern; `dispose()` este idempotent și readuce vehiculele, stările, sloturile și contoarele la zero. Vehiculele noi citesc `CityProfileSource.activeProfile()` și resping un `profileId` străin; cele existente își păstrează binding-ul până la un update explicit (activarea atomică rămâne 110).

Rapoarte executate: 20/20 → 40 vehicule (20 taxiuri, 20 civile, 20 sedan, 20 compact); 24/40 → 64 (24/40, 35 sedan, 29 compact); 30/40 → 70 (30/40, 39 sedan, 31 compact). 12/12 verificări PASS: id-uri unice, ordine sortată, seed determinist, stabilitate de clasă, stare independentă, matrice completă, dispose la zero și contract exact de câmpuri.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (181 fișiere), `check:parameter-catalog` exit 0; `npm test` 1168/1168 PASS (1159 baseline + 9); `npm run fleet:registry -- --check` PASS, 3 configurații, 12/12 checks, raport curent. Dovezi în [Evidence/057-fleet-registry](../../Docs/Evidence/057-fleet-registry/README.md).

Fișiere și documente actualizate: `src/fleet/registry.ts` (nou), `src/fleet/index.ts`, `scripts/fleet-registry-report.mjs` (nou), testele aferente, [Docs/fleet-registry.md](../../Docs/fleet-registry.md) (nou), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/README.md`, `Docs/Evidence/057-fleet-registry/`.

Limitări sau follow-up: fără corpuri Rapier, poziții pe bandă, mesh-uri sau rute — compoziția lumii, 041 și 058 rămân separate. Fără dispatch, curse, ETA, fleet health sau activare atomică de profil (059–065, 110). Nu impune regula de autoritate unică MANUAL/LEARNING; aceasta aparține de 024/030. Dovada este un probe funcțional determinist, nu validare FPS/GPU/soak/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '057' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
- 2026-10-20: Implementare în worktree izolat (commit `708d1c82`): registry determinist 20–30 taxiuri + 20–40 civile, id/clasă/driver/stare independentă, raport pe matrice și 9 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1168/1168 teste. Deblochează 110.
