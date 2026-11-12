---
id: "161"
title: "Instrucțiuni de utilizare și operare"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["160"]
owner: "loop-pbi/docs-161-01"
started_at: "2026-11-12T15:02:46+02:00"
completed_at: "2026-11-12T15:15:52+02:00"
---

# 161 Instrucțiuni de utilizare și operare

## Obiectiv

Documentează cele trei moduri, KPIs, timp economic/calendar zilnic, XP fără pierderi, salvare/export și recuperare.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 160 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Instrucțiunile corespund fluxurilor implementate și versiunii reale.
- [x] Indicatorii și limitările învățării sunt explicați fără promisiuni nevalidate.

- [x] Manualul descrie Academie/Haos, R/reset, slidere, first-person, provocări și savefile cu limitele checksumului; nu include fluxuri de penalizare XP.

## Verificare

Verifică documentele printr-o sesiune de onboarding.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Manual de utilizare și operare pentru jucător, în `Docs/manual/` (cuprins + 7 secțiuni: pornire/control, cele trei moduri, Academie/Haos și recuperare, KPI/economie, misiuni zilnice/XP/provocări, slidere și cameră, savefile/recuperare), plus secțiune de registru în `Docs/18-validare-si-release.md`. Fiecare afirmație a fost confruntată cu codul reviziei `cfb1e558` sau cu documentul de modul care o deține; manualul declară explicit că bootstrapul din `src/main.ts` montează doar suprafața de randare și panoul „Diagnostic”, iar HUD-ul și panourile sunt la nivel de contract/modul.

Verificări executate și rezultat: `npm run typecheck` exit 0 (fără erori); `npm run lint` exit 0 (0 avertismente); `npm run format:check` exit 0 („All matched files use Prettier code style!”); `npm run check:architecture` PASS (365 fișiere TypeScript, sonde negative 6+4+3 respinse); `npm run check:parameter-catalog` „Parameter catalog is synchronized.”; `npm test` 2898 teste, 2898 trecute, 0 eșuate, `duration_ms 90353.3339`; verificare de legături pe cele 9 fișiere atinse: 30 linkuri, 0 rupte, 0 ancore lipsă. Sesiunea de onboarding cu oameni nu a fost executată: `NOT_RUN`, zero participanți — declarată ca limitare, nu bifată. `Validate-Plan.ps1` se oprește pe datoria preexistentă din `Docs/map-integrity.md` (link spre `../Evidence/043-map-integrity/README.md`), fișier nemodificat de acest PBI; toate linkurile din fișierele atinse aici se rezolvă.

Fișiere și documente actualizate: create `Docs/manual/README.md`, `Docs/manual/01-pornire-si-control.md`, `Docs/manual/02-moduri-si-invatare.md`, `Docs/manual/03-academie-haos-recuperare.md`, `Docs/manual/04-kpi-si-economie.md`, `Docs/manual/05-misiuni-xp-si-provocari.md`, `Docs/manual/06-slidere-si-camera.md`, `Docs/manual/07-salvare-si-recuperare.md`, `Docs/Evidence/161-release-docs/README.md`; modificat `Docs/18-validare-si-release.md` (secțiune nouă la final); mutat fizic `PBI/To Do/161-release_docs.md` → `PBI/Done/161-release_docs.md`.

Limitări sau follow-up: onboarding uman `NOT_RUN` (zero participanți), deci lizibilitatea manualului nu este dovedită prin playtest; playtestul și retenția rămân `NOT_RUN`, FPS/GPU rămâne `NOT_VALIDATED` la gate-ul 224; manualul descrie contractele reviziei curente și trebuie actualizat în același PBI cu orice schimbare viitoare de taste, praguri sau nume de panouri; findings-urile de accesibilitate D4–D8 aparțin `src/ui` și sunt raportate, nu reparate aici.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '161' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-12: Implementare reluată pe branch `loop-pbi/docs-161-01` (bază `cfb1e558`); manual livrat în `Docs/manual/` plus secțiune în `Docs/18`; verificări statice și suita completă (2898/2898) trecute; onboarding uman declarat `NOT_RUN`.
