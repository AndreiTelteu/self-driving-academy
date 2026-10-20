---
id: "075"
title: "Lista taxiurilor filtre și sortare"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["073","057","064","068"]
performance_checks: ["ui"]
owner: "opencode deepseek-v4.1-flash fleet-panel-01"
started_at: "2026-10-20T23:16:38.728Z"
completed_at: "2026-10-21T02:52:36+03:00"
---

# 075 Lista taxiurilor filtre și sortare

## Obiectiv

Afișează toate taxiurile cu stare, cursă, ETA și profil.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 057 trebuie să existe în Done înainte de începere.
- PBI 064 trebuie să existe în Done înainte de începere.
- PBI 068 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Lista este stabilă și poate selecta orice taxi din hartă.
- [x] Filtrele nu ascund implicit taxiul urmărit sau un blocaj important.

- [x] Actualizările/sortarea sunt plafonate și păstrează identitatea rândurilor; panoul închis nu reconstruiește lista.

## Verificare

Inspectează 30 de taxiuri și combinații de filtre.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Panoul 075 listează toate taxiurile reale 057 (30 în fixture, până la capacitatea 110) cu slot semantic, clasă, profil și versiunea aplicată, modul de control acceptat, etapa cursei 061 și ETA 064 certificată. Contractul pur `075-fleet-panel-v1` validează strict cadrul, respinge duplicatele și contradicțiile și proiectează filtrele `ALL`/`BUSY`/`FREE`/`BLOCKED` plus sortările `SLOT`/`STATE`/`ETA`. Taxiul urmărit și primul taxi blocat rămân mereu vizibili, indiferent de filtru. Adaptorul DOM păstrează un singur rând per `vehicleId`, îl refolosește și îl mută la sortare; scrierile/reordonările sunt plafonate la 10 Hz, iar schimbarea taxiului urmărit, a filtrului, a sortării sau a blocajului ocolește plafonul. `close()` doar ascunde lista reținută, fără golire sau reconstrucție. Un click sau Enter/Space pe un rând emite o singură intenție `FLEET` prin portul injectat către 068; panoul nu mută, nu teleportează și nu preia vehicule.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (200 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1321/1321 pass, 0 fail; `npm run fleet:panel` 44/44 verificări, 7 scenarii, overall PASS; `npm run fleet:panel -- --check` „Fleet panel report is current”. Raportul determinist inspectează 30 de taxiuri, toate combinațiile de filtre, cele trei sortări, panoul închis/redeschis și 60 de cadre plafonate. Dovezi: [report.json](../../Docs/Evidence/075-fleet-panel/report.json), [report.md](../../Docs/Evidence/075-fleet-panel/report.md), [README](../../Docs/Evidence/075-fleet-panel/README.md).

Fișiere și documente actualizate: `src/ui/fleet-panel-format.ts`, `src/ui/fleet-panel.ts`, `src/app/fleet-panel.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/fleet-panel-fixture.ts`, `tests/ui/fleet-panel.test.ts`, `tests/ui/hud-dom.ts`, `tests/app/fleet-panel-report.ts`, `scripts/run-fleet-panel-report.mjs`, `package.json`, `Docs/fleet-panel.md`, `Docs/README.md`, `Docs/27-reglaje-hud-si-camera.md` și `Docs/Evidence/075-fleet-panel/`.

Limitări sau follow-up: Hostul de condus nu este încă legat: `readFleetPanelSnapshot` și `createFleetPanelSelectPort` sunt seam-ul pregătit, iar legarea tastei Tab, comportamentul de pauză 070 și integrarea live rămân pentru 153. Sunt listate numai taxiurile; civilele rămân 076. `blocked` provine din serviciul certificat 064, nu din `routeBlocked` 045. Nu a fost produsă o captură de browser; DOM-ul serializat este dovada vizuală. Nu se pretinde FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '075' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-21: Implementare finalizată prin contractul 075, adaptorul DOM, compunerea 057/061/064, 18 teste, raportul determinist cu 44 de verificări și documentația aferentă; mutat fizic în Done după validare.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
