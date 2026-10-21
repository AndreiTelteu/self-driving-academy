---
id: "082"
title: "Tablou oraș și drilldown de evenimente"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["073","028","061"]
owner: "opencode deepseek-v4.1-flash city-dashboard-01"
started_at: "2026-10-21T03:15:03.007Z"
completed_at: "2026-10-21T06:39:17+03:00"
---

# 082 Tablou oraș și drilldown de evenimente

## Obiectiv

Creează componente pentru metrici, expunere și evenimente pe hartă.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 061 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Datele indisponibile sunt distincte de zero.
- [x] Incidentul selectat poate fi localizat fără schimbarea profilului.

## Verificare

Inspectează scenarii fără expunere și cu incidente.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Tabloul 082 compune metrici și expunere din surse reale: cursele terminale 061 pentru curse finalizate și timpul mediu, jurnalul de incidente 028 pentru coliziuni, istoricul 065 pentru blocaje/imobilizări și un provider opțional de metrici 137 pentru încălcări/confort. Fiecare metrică are stare explicită: `UNAVAILABLE` cu `value:null` și motiv închis (`NO_EXPOSURE`, `SOURCE_MISSING`, `NOT_CERTIFIED`) sau `AVAILABLE` cu valoare reală, inclusiv zero real afișat „0”; parserul respinge o metrică indisponibilă cu valoare sau una disponibilă fără valoare. Expunerea urmează aceeași regulă. Incidentele păstrează ID-ul real 028/065, tick-ul, vehiculul, cursa și poziția când sursa le oferă; ordinea este deterministă (tick desc, apoi ID). Selectarea unui incident este pură și produce o intenție de focus pe hartă cu poziția reală; fără poziție afișează „Poziție indisponibilă” și nu emite focus. Modulul nu importă `src/profiles/*`, nu citește versiunea de profil și nu schimbă profilul, autoritatea, camera sau fizica.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (218 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1427/1427 pass, 0 fail; `npm run city:dashboard` 47/47 verificări, 7 scenarii, overall PASS; `npm run city:dashboard -- --check` „City dashboard report is current”. Testele țintite 082: 16/16 pass. Raportul acoperă scenariul fără expunere, zero real, incidente, poziție lipsă, incident selectat, metrică indisponibilă și 60 de cadre plafonate. Dovezi: [report.json](../../Docs/Evidence/082-city-dashboard/report.json), [report.md](../../Docs/Evidence/082-city-dashboard/report.md), [README](../../Docs/Evidence/082-city-dashboard/README.md).

Fișiere și documente actualizate: `src/ui/city-dashboard-format.ts`, `src/ui/city-dashboard.ts`, `src/app/city-dashboard.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/city-dashboard-fixture.ts`, `tests/ui/city-dashboard.test.ts`, `tests/app/city-dashboard-world.ts`, `tests/app/city-dashboard-report.ts`, `scripts/run-city-dashboard-report.mjs`, `package.json`, `Docs/city-dashboard.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/README.md` și `Docs/Evidence/082-city-dashboard/`.

Limitări sau follow-up: 137 nu este încă Done, deci încălcările și confortul rămân `SOURCE_MISSING` până la injectarea unui provider real. 028 și 065 nu conțin coordonate, deci poziția este `null` dacă hostul nu oferă o citire reală; fixture-ul localizează doar taxiul cu coliziune. 028 nu are asociere de cursă, deci `rideId` rămâne `null` pentru coliziuni; blocajele păstrează ID-ul real al cursei închise. Distanța totală cere o citire injectată. Ferestrele mărginite 028/065/061 raportează `NOT_CERTIFIED` când sunt trunchiate. Nu există montare live, captură browser, FPS, GPU sau măsurători hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '082' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: metrici/expunere cu indisponibil distinct de zero, incidente reale 028/065 ordonate determinist, focus pe hartă fără atingerea profilului, 16 teste, raport cu 47 de verificări și documentație. Mutat fizic în Done după validare.
