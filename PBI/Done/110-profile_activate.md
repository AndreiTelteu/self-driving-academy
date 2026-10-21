---
id: "110"
title: "Activare atomică în întreaga flotă"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["109","057","008"]
owner: "opencode deepseek-v4.1-flash profile-activation-01"
started_at: "2026-10-21T12:20:26.009Z"
completed_at: "2026-10-21T15:42:49+03:00"
---

# 110 Activare atomică în întreaga flotă

## Obiectiv

Publică activarea la un tick comun tuturor taxiurilor și civililor.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 109 trebuie să existe în Done înainte de începere.
- PBI 057 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] După tick toate vehiculele existente raportează aceeași versiune, inclusiv cele nevizibile și conduse de jucător.
- [x] Vehiculele create ulterior primesc versiunea curentă; rutele și stările fizice sunt păstrate.

## Verificare

Verifică lista întregii flote înainte și după activare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Controllerul `110-profile-activation-v1` publică o singură comandă `PENDING` pentru un tick comun viitor și o aplică atomic la `tick >= activateAtTick`. La aplicare, toate vehiculele existente din registrul 057 — taxiuri și civile, inclusiv cele ascunse, selectate, conduse de jucător sau aflate în MANUAL/LEARNING — primesc aceeași `appliedProfileVersion`; se scrie exclusiv `{tick, appliedProfileVersion}`, iar `controlMode`, lista flotei, rutele, cursele și starea fizică rămân neatinse. Planul complet este validat înainte de prima scriere; dacă o scriere injectată eșuează, fiecare vehicul deja actualizat este restaurat la versiunea și modul anterior, comanda devine `REJECTED`, iar flota nu rămâne niciodată cu două versiuni. Registrul 057 refuză rescrierea `tick`-ului, deci rollback-ul raportează explicit `exact: false` pentru timestamp, fără a ascunde diferența. `createProfileActivationSource` este compatibil cu `CityProfileSource`, astfel încât un vehicul creat ulterior citește ținta pending înainte de tick și versiunea aplicată după tick. Sunt respinse cu motive închise versiunea invalidă, profilul străin, engine-ul incompatibil, versiunea veche, tick-ul care nu avansează, o a doua activare pending și utilizarea după dispose; cheia de idempotență returnează comanda existentă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (230 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1533/1533 pass, 0 fail; `npm run profile:activate` 51/51 verificări, 7 scenarii, overall PASS; `npm run profile:activate -- --check` „Profile activation report is current”. Testele țintite 110: 16/16 pass. Raportul acoperă flota completă 24+40 înainte/după tick, păstrarea MANUAL/LEARNING și a jucătorului, vehiculul creat ulterior, publicarea duplicată, engine-ul incompatibil, rollback-ul fără flotă mixtă și 60 de cadre fără reaplicare. Dovezi: [report.json](../../Docs/Evidence/110-profile-activation/report.json), [report.md](../../Docs/Evidence/110-profile-activation/report.md), [README](../../Docs/Evidence/110-profile-activation/README.md).

Fișiere și documente actualizate: `src/fleet/profile-activation.ts`, `src/app/profile-activation.ts`, `src/fleet/index.ts`, `src/app/index.ts`, `tests/fleet/profile-activation.test.ts`, `tests/app/profile-activation-report.ts`, `scripts/run-profile-activation-report.mjs`, `package.json`, `Docs/profile-activation.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/README.md` și `Docs/Evidence/110-profile-activation/`.

Limitări sau follow-up: Rollback-ul nu poate rescrie `FleetVehicleState.tick` din contractul 057; versiunea și modul sunt restaurate complet, iar `exact:false` este raportat explicit. Implementarea este în memorie: nu include persistență/recuperare după crash, bariera `learningEpoch`, publicarea unei versiuni noi sau integrarea estimator/worker. Nu există UI, captură browser, FPS sau măsurători hardware. `FleetVehicleState` nu conține poziții/viteze, deci „fizica neatinsă” este dovedită prin suprafața exactă de scriere, nu printr-un fixture de fizică.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '110' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-21: Implementare finalizată: activare la tick comun, flotă completă și vehicule ulterioare, rollback atomic fără flotă mixtă, stare fizică neatinsă, motive închise; 16 teste, raport cu 51 de verificări și documentație. Mutat fizic în Done după validare.
