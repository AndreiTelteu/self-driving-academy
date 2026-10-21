---
id: "205"
title: "Barieră pentru learning la restore import și profil nou"
status: "Done"
release: "V1"
module: "Profiluri"
depends_on: ["103","109","110","069"]
owner: "opencode deepseek-v4.1-flash learning-epoch-01"
started_at: "2026-10-21T19:32:16.176Z"
completed_at: "2026-10-21T22:50:50+03:00"
---

# 205 Barieră pentru learning la restore import și profil nou

## Obiectiv

Invalidează joburi/activări nepublicate din vechea generație la schimbarea explicită a țintei de profil.

## Context și plan

- [12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 103 trebuie să existe în Done înainte de începere.
- PBI 109 trebuie să existe în Done înainte de începere.
- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] profileId și learningEpoch sunt capturate în segmente și joburi; rezultatele din altă generație sunt ignorate.
- [x] Importul invalid păstrează coada; rezultatele duplicate și cele sosite după anulare nu publică versiuni.
- [x] Segmentul curent se închide și se redeschide în generația nouă fără pierdere fizică.

## Verificare

Testează restore cu job în curs, import valid/invalid, profil nou, rezultat întârziat și duplicate.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: Bariera `205-learning-epoch-v1` tratează generația ca identitate `playerId + profileId + learningEpoch + baseVersionId` plus identitatea segmentului, purtată de segmente și joburi. O schimbare validă (restore, import valid sau profil nou) este programată pentru următorul tick: citește starea fizică, închide segmentul curent cu `PROFILE_CHANGE`, reverifică egalitatea fizică, închide o comandă 110 veche pending, publică ținta, anulează joburile 103 din generația veche, marchează vechea generație `CANCELLED_BY_PROFILE_CHANGE`, deschide un segment nou cu identitate stabilă `<profileId>:g<epoch>` și commit-ează. Epoch-ul crește strict cu unu per schimbare commit-ată. Un import invalid este `REJECTED`/`IMPORT_INVALID`, fără barieră, fără închidere/deschidere, fără anulare și fără publicare; coada, jobul și segmentul rămân neatinse. Cererile duplicate pentru aceeași țintă returnează bariera existentă, iar o a doua țintă pending este `CHANGE_PENDING`. Poarta `isCurrent` returnează `STALE_GENERATION` pentru player/profil/epoch/base/segment străin, `LATE_RESULT`/`CANCELLED_BY_PROFILE_CHANGE` pentru un segment anulat și `DUPLICATE`/`DUPLICATE_RESULT` pentru rezultate repetate; `versionId` este mereu `null`, deci niciun rezultat târziu sau duplicat nu creează versiune. Un eșec de publicare sau o nepotrivire fizică produce rollback exact, redeschide segmentul vechi și raportează `rollback.exact`, `activationPublished`, `jobsCancelled`, `segmentRestored`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (250 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1738/1738 pass, 0 fail; `npm run learning:epoch` 73/73 verificări, 7 scenarii, overall PASS; `npm run learning:epoch -- --check` „Learning epoch report is current”. Testele țintite 205: 18/18 pass. Raportul acoperă restore cu job în curs, import valid, import invalid, profil nou, rezultat târziu, rezultat duplicat și rollback. Dovezi: [report.json](../../Docs/Evidence/205-learning-epoch/report.json), [report.md](../../Docs/Evidence/205-learning-epoch/report.md), [README](../../Docs/Evidence/205-learning-epoch/README.md).

Fișiere și documente actualizate: `src/app/learning-epoch.ts`, `src/app/index.ts`, `tests/app/learning-epoch.test.ts`, `tests/app/learning-epoch-report.ts`, `tests/harness/learning-epoch-fixture.ts`, `scripts/run-learning-epoch-report.mjs`, `package.json`, `Docs/learning-epoch.md`, `Docs/12-profiluri-si-propagare.md`, `Docs/learning-worker.md`, `Docs/README.md` și `Docs/Evidence/205-learning-epoch/`.

Limitări sau follow-up: Transportul worker-ului și legarea segmentelor 069 sunt porturi deterministe injectate; coada reală 103, governorul 221, compoziția 102, store-ul 109 și activarea 110 rulează, dar nu există thread `worker_threads`, store 069 nativ, timing de cadre sau browser. Istoricul barierei și jurnalul comenzilor 110 sunt doar în RAM; nu există savefile/IndexedDB sau jurnal de recuperare după crash. O singură țintă de profil activă per barieră; un `profileId` diferit este `TARGET_PROFILE_MISMATCH`. Deduplicarea țintei este limitată la istoricul mărginit; după evicție, o țintă repetată poate deschide o barieră nouă. Nu se pretinde captură browser, FPS, GPU sau hardware.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '205'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-21: Implementare finalizată: barieră tranzacțională la schimbarea țintei, epoch monoton, invalidare joburi/activări vechi, import invalid fără efecte, rezultate târzii/duplicate fără versiuni, segment închis/redeschis fără pierdere fizică; 18 teste, raport cu 73 de verificări și documentație. Mutat fizic în Done după validare.
