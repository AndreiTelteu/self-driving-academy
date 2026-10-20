---
id: "058"
title: "Trafic civil cu rute proprii și stilul comun al orașului"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["057","041"]
owner: "Codex gpt-6-luna medium loop-058"
started_at: "2026-10-20T14:17:39+03:00"
completed_at: "2026-10-20T04:25:00+03:00"
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

Rezultat implementare: `src/fleet/civil-traffic.ts` (exportat prin `src/fleet/index.ts`) oferă `createCivilTraffic` peste registry-ul 057, harta 032, graful 033 și planner-ul real 041: `list/get/step/setAuthority/resume/refreshStyle/report/getStats/dispose`. Fiecare civil primește ruta din planner-ul real (`findRoute({ origin, destination, access: 'CIVIL' })`), cu origine/destinație derivate determinist din seed și benzi de origine fără duplicate la spawn; ruta păstrează `status/path/costSeconds/costVersion/graphVersion` și este raportată cu `source: '041-route-planner'`. Stilul este unul singur, comun orașului (`style`/`styleSource`), cu `profileId` identic cu al flotei; nu există stil per jucător sau per vehicul. Following folosește lanțul real 044 → 046 → 047 → 048: un taxi din aceeași bandă devine lider 044, 048 reduce ținta, iar gap-ul fizic limitează mișcarea. `MANUAL` îngheață doar civilul adresat, iar `resume` păstrează exact ruta, recitește versiunea stilului comun și restaurează AUTO în registry. Fiecare actor are propria stare de progres/viteză/lider; doar bundle-urile de stil compilate sunt partajate imutabil. Fără cameră, renderer, DOM, mesh, Rapier sau ceas de perete.

Rulare mixtă: 40 civili din registry, **40/40 rute READY**, **30/30 verificări de raport**, **7200/7200 cadre actor-pe-bandă**, gap-ul minim de lider peste limita fizică dură, iar viteza de urmărire a scăzut sub controlul fără taxi. `dispose` readuce la zero actorii, actorii longitudinali, vehiculele de road-context și căutările deținute de planner. Determinism: același seed/scenariu/registry produce snapshots de spawn identice și cadre identice după 20 tick-uri; spawn-ul se bazează pe id-uri stabile sortate, nu pe ordinea array-ului.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (182 fișiere), `check:parameter-catalog` exit 0; `npm test` 1179/1179 PASS (1168 baseline + 11); `npm run civil:traffic -- --check` 30/30, overall PASS. Dovezi în [Evidence/058-civil-traffic](../../Docs/Evidence/058-civil-traffic/README.md).

Fișiere și documente actualizate: `src/fleet/civil-traffic.ts` (nou), `src/fleet/index.ts`, `scripts/civil-traffic-report.mjs` (nou), testele aferente, [Docs/civil-traffic.md](../../Docs/civil-traffic.md) (nou), [Docs/06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md), [Docs/07-flota-si-curse.md](../../Docs/07-flota-si-curse.md), `Docs/README.md`, `Docs/Evidence/058-civil-traffic/`.

Limitări sau follow-up: fără corpuri Rapier, mesh-uri sau resurse de renderer; pozițiile/vitezele și gap-urile în spațiul benzii sunt ieșiri de simulare pe care composition root le poate lega la 022/024. Semnalele live, prioritatea în intersecție, acționarea STOP/yield, cursele, ETA și dispatch rămân contracte separate (036/037/038/045/050–054/059–065). Rularea mixtă verifică urmărirea pe bandă prin intersecție, interacțiunea cu liderul taxi și non-suprapunerea, nu sistemul complet de prioritate. Fără browser, FPS, soak, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '058' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-20: Implementare și validare funcțională locală finalizate; 11 teste noi, 1179/1179 teste, raport 30/30 PASS, dovezi în Docs/Evidence/058-civil-traffic. Boardul și mutarea în Done rămân părintelui.
- 2026-10-20: Implementare în worktree izolat (commit `7110ec9b`): trafic civil cu rute reale 041, stil comun unic, following 044–048, autoritate MANUAL/resume și 11 teste noi; 40/40 rute, 30/30 verificări, 7200/7200 cadre pe bandă. Integrat prin fast-forward; verificat de orchestrator cu 1179/1179 teste.
