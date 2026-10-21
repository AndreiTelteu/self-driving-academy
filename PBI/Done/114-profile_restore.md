---
id: "114"
title: "Restaurare și profil nou de la bază"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["113","205"]
owner: "opencode deepseek-v4.1-flash profile-restore-01"
started_at: "2026-10-21T20:39:11.821Z"
completed_at: "2026-10-22T00:01:22+03:00"
---

# 114 Restaurare și profil nou de la bază

## Obiectiv

Implementează activare cu proveniență pentru versiune veche și reset de stil.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 113 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Restore, import valid și profil nou folosesc bariera learningEpoch și o activare comună nouă.
- [x] Importul invalid nu schimbă profilul/coada; resetul stilului nu resetează misiunile sau XP.

## Verificare

Testează restaurare, profil nou și sesiune activă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Orchestrarea `114-profile-restore-v1` folosește bariera 205 și activarea comună 110 pentru toate cele trei schimbări explicite de țintă. `restoreVersion` citește și verifică checksum-ul unei versiuni 109 existente, verifică profilul și engine-ul, deschide o barieră `RESTORE` și commit-ează o singură activare 110; versiunea nu este clonată sau editată, iar istoricul și checksum-urile rămân identice. Dacă ținta este deja activă, rezultatul este `ALREADY_ACTIVE`, fără barieră. `importProfile` validează prin calea reală a registrului și creează o versiune imuabilă prin `store.derive` cu părintele explicit, apoi barieră `IMPORT` + activare; un import invalid este `IMPORT_INVALID` înainte de orice efect asupra store-ului, cozii, segmentului sau activării, iar un import duplicat după checksum/versiune este idempotent. `newProfileFromBase` creează o bază 109 din valorile reale ale catalogului 092 și commit-ează o barieră `NEW_PROFILE` + activare, fără a atinge istoricul altor profiluri. `resetStyle` activează baza existentă printr-o barieră `RESTORE`, fără versiune învățată și fără niciun apel către portul de progresie: `progressionCalls` este mereu 0, deci misiunile și XP rămân identice. Bariera respectă ciclul documentat `PENDING` la tick-ul `t` și `COMMITTED` la `t+1`, cu rezultate înghețate.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (251 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1755/1755 pass, 0 fail; `npm run profile:restore` 62/62 verificări, 7 scenarii, overall PASS; `npm run profile:restore -- --check` „Profile restore report is current”. Testele țintite 114: 17/17 pass. Raportul acoperă restaurarea, ținta deja activă, importul valid, importul invalid, profilul nou, resetul de stil cu zero apeluri XP/misiuni și bariera într-o sesiune activă. Dovezi: [report.json](../../Docs/Evidence/114-profile-restore/report.json), [report.md](../../Docs/Evidence/114-profile-restore/report.md), [README](../../Docs/Evidence/114-profile-restore/README.md).

Fișiere și documente actualizate: `src/app/profile-restore.ts`, `src/app/index.ts`, `tests/app/profile-restore.test.ts`, `tests/app/profile-restore-fixture.ts`, `tests/app/profile-restore-report.ts`, `scripts/run-profile-restore-report.mjs`, `package.json`, `Docs/profile-restore.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/profile-store.md`, `Docs/README.md` și `Docs/Evidence/114-profile-restore/`.

Limitări sau follow-up: Integrarea 109/110/205 este doar în RAM; nu există savefile, recuperare după crash sau IndexedDB. Importul aplică doar cheile deja prezente în părinte și acceptate de poarta numerică 102; o cheie extension/R schimbată este `IMPORT_INVALID`, nu o extensie silențioasă de schemă. Un `profileId` nou cere un `barrierFor` pinned furnizat de host; fără o generație anterioară rezultatul este `BASE_NOT_FOUND`. Deoarece 205 se rezolvă la limita unui tick, apelanții folosesc ciclul documentat `PENDING` → `COMMITTED`. Nu se pretinde captură browser, FPS sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '114' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-22: Implementare finalizată: restore/import/profil nou prin bariera 205 + activare 110, import invalid fără efecte, reset de stil fără atingerea XP/misiunilor; 17 teste, raport cu 62 de verificări și documentație. Mutat fizic în Done după validare.
