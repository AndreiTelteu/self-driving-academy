---
id: "058"
title: "Trafic civil cu rute proprii și stilul comun al orașului"
status: "In Progress"
release: "V1"
module: "Flotă și curse"
depends_on: ["057","041"]
owner: "Codex gpt-6-luna medium loop-058"
started_at: "2026-10-20T14:17:39+03:00"
completed_at: null
---

# 058 Trafic civil cu rute proprii și stilul comun al orașului

## Obiectiv

Generează rute civile și reluarea lor în AUTO cu profilul comun, explicată ca imitație a stilului taxiurilor.

## Context și plan

[07-flota-si-curse.md](../../Docs/07-flota-si-curse.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 057 trebuie să existe în Done înainte de începere.
- PBI 041 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Civilii interacționează fizic și semantic cu taxiurile și folosesc aceiași parametri de stil.
- [x] Eliberarea unei mașini civile păstrează ruta și reia profilul comun; nu revine la un profil fix ascuns.

## Verificare

Rulează intersecții mixte și reluarea unei rute civile.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/civil-traffic.ts` creează 40 de actori din civilii registry-ului 057, fiecare cu rută proprie `READY` produsă exclusiv de plannerul 041 peste graful real 033. Urmărirea folosește lanțul real 044 → 046 → 047 → 048; un taxi observat în față devine lider 044, iar avansul este plafonat la gap-ul fizic rămas (cu așteptare la capătul benzii dacă banda următoare este ocupată). Toți civilii consumă același `DrivingProfile` comun al orașului; `setAuthority(..., 'MANUAL')` îngheață doar actorul adresat, iar `resume` păstrează exact ruta și recitește versiunea activă. Pozițiile/vitezele sunt deterministe, fără cameră, renderer, mesh sau corpuri Rapier; `dispose()` readuce ownership-ul la zero. Detaliile sunt în [Docs/civil-traffic.md](../../Docs/civil-traffic.md).

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!” exit 0; `npm run check:architecture` PASS (182 fișiere, negative 6+4+3); `npm run check:parameter-catalog` „Parameter catalog is synchronized.” exit 0; `npm test` 1179/1179 pass, 0 fail (baseline 1168/1168); `npm run civil:traffic -- --check` SUMMARY checks 30/30, mixed 7200 on-lane frames, overall PASS. Logul exact este în [checks.txt](../../Docs/Evidence/058-civil-traffic/checks.txt), testele 058 în [tests.txt](../../Docs/Evidence/058-civil-traffic/tests.txt), raportul în [report.json](../../Docs/Evidence/058-civil-traffic/report.json).

Fișiere și documente actualizate: `src/fleet/civil-traffic.ts`, `src/fleet/index.ts`, `tests/fleet/civil-traffic.test.ts`, `tests/fleet/civil-traffic-fixture.ts`, `tests/fleet/civil-traffic-report.ts`, `scripts/run-civil-traffic-report.mjs`, `package.json`; [Docs/civil-traffic.md](../../Docs/civil-traffic.md), [Docs/06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), [Docs/README.md](../../Docs/README.md); [Docs/Evidence/058-civil-traffic/README.md](../../Docs/Evidence/058-civil-traffic/README.md) cu `checks.txt`, `tests.txt`, `report.json` și `report.md`.

Limitări sau follow-up: Nu creează corpuri Rapier, mesh-uri sau materiale; legarea la 022/024 și randarea rămân composition root. Semafoarele live, prioritățile de intersecție, STOP/yield și dispecerizarea rămân contractele 036/037/038/045/050–054/059–065. Rularea mixtă verifică prin-intersecție, aderența la bandă, liderul taxi și gap-ul fizic, nu certifică toate regulile de prioritate și nici FPS/GPU/hardware.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '058' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-20: Implementare și validare funcțională locală finalizate; 11 teste noi, 1179/1179 teste, raport 30/30 PASS, dovezi în Docs/Evidence/058-civil-traffic. Boardul și mutarea în Done rămân părintelui.
