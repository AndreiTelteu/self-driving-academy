---
id: "078"
title: "Istoric și restaurare profil în UI"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["077"]
owner: "opencode deepseek-v4.1-flash profile-history-01"
started_at: "2026-10-21T01:19:14.549Z"
completed_at: "2026-10-21T05:01:57+03:00"
---

# 078 Istoric și restaurare profil în UI

## Obiectiv

Construiește selecția versiunilor și previewul schimbărilor.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 077 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Istoricul folosește versionId și nu editează o versiune existentă.
- [x] Acțiunea de restaurare este explicită și poate raporta incompatibilitatea.

## Verificare

Verifică istoric gol, versiuni multiple și incompatibilitate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Panoul 078 listează istoricul real 109 ca o secvență imutabilă ordonată bază→vârf, cu un singur nod DOM per `versionId`, refolosit la schimbarea selecției sau a versiunii curente. Selectarea unei versiuni doar o marchează și construiește preview-ul diferențelor dintre cele două snapshoturi înghețate; nu editează, nu renumerotează și nu rescrie nicio versiune. Restaurarea este explicită în doi pași: primul click deschide confirmarea vizibilă, al doilea emite intenția `restore(versionId)` către portul injectat. Planificatorul `planProfileRestore` blochează cu motive închise lipsa versiunii, aceeași versiune, profilul străin, engine-ul incompatibil și duplicatele, iar motivul este afișat textual și butonul este dezactivat. Istoricul gol afișează „Istoric gol” fără intrări inventate. Cheile rezervate R sunt omise consecvent din preview-ul învățabil, iar parserul respinge un cadru care le-ar include ca schimbare.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (209 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1368/1368 pass, 0 fail; `npm run profile:history` 58/58 verificări, 7 scenarii, overall PASS; `npm run profile:history -- --check` „Profile history report is current”. Raportul acoperă istoric gol, lanț cu mai multe versiuni, preview de deltă, cheie rezervată, engine incompatibil, restaurare confirmată și 60 de cadre plafonate. Dovezi: [report.json](../../Docs/Evidence/078-profile-history/report.json), [report.md](../../Docs/Evidence/078-profile-history/report.md), [README](../../Docs/Evidence/078-profile-history/README.md).

Fișiere și documente actualizate: `src/ui/profile-history-format.ts`, `src/ui/profile-history.ts`, `src/app/profile-history.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/profile-history-fixture.ts`, `tests/ui/profile-history.test.ts`, `tests/app/profile-history-report.ts`, `scripts/run-profile-history-report.mjs`, `package.json`, `Docs/profile-history.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/README.md` și `Docs/Evidence/078-profile-history/`.

Limitări sau follow-up: Hostul live de istoric/restaurare nu este încă legat; contextul local este documentat și se poate suprascrie. Modulul doar citește versiuni și cere restaurarea: 109 deține stocarea, 110 publicarea, iar 114 activarea/restaurarea efectivă. Cheile R sunt omise din preview, nu marcate separat. `DUPLICATE_VERSION_ID` este o apărare a planificatorului, imposibilă într-un cadru valid. Nu se pretinde captură browser, FPS sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '078' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: istoric imutabil pe `versionId`, preview de deltă, restaurare explicită în doi pași cu incompatibilități raportate, 19 teste, raport cu 58 de verificări și documentație; mutat fizic în Done după validare.
