---
id: "028"
title: "Contacte fizice și incidente"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["022","007"]
owner: "Codex gpt-6.1-sol medium PBI028"
started_at: "2026-10-05T15:23:55.8971630+03:00"
completed_at: "2026-10-05T17:21:03.2828544+03:00"
performance_checks: ["simulation", "memory"]
---

# 028 Contacte fizice și incidente

## Obiectiv

Traduce contactele în incidente cu perechi, tick și intensitate.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 022 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un contact persistent nu este numărat la fiecare frame.
- [x] Separarea și recontactul pot crea un incident nou după cooldown.

## Verificare

Verifică impact singular, contact persistent și recontact.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: identități canonice de collider pentru vehicule și obstacole numite, readback Rapier real contactDist/contactImpulse pe numContacts (impuls normal SI N*s), episoade bounded și compoziție simulation→vehicles pentru exact007 COLLISION. Persistența nu repetă incidentul; separarea/recontactul respectă cooldown60tick inclusiv. Snapshot-uri consecutive, cozi atomic admise și retry cu prefix acceptat, token stale/remove/reuse/world-fence, diagnostic listener bounded, serial native pentru o singură avansare admisă. Ground/senzor/anonim/obstacle-only nu produc incidente.

Verificări executate și rezultat: scoped formatter PASS;41/41 teste relevante PASS (15 pure,9 native,10 composition,7 existing007), typecheck PASS, architecture PASS. BEFORE20lumi/14000ticks înainte de algoritm, AFTER20lumi/14000ticks cu checksums native identice înainte/după și între observer off/on; toate resursele proprii eliminate. Probe supplemental onset5×100warm/600measure PASS cu snapshot real replay explicit. Chrome headed WebGPU și WebGL2 lifecycle PASS:602pași/run,234contactticks,maxstreak113, exact2incidente positive la221/462,61separationticks, staleidentity și20fullworldlifecycles fără ownership rămas. Console0errors/0warnings. Dovezi exacte: [progress](../../Docs/Evidence/028-collision-events/progress.md), [protocol](../../Docs/Evidence/028-collision-events/protocol.md), before.json/after.json/onset-cpu.json, browser-webgpu.json/browser-webgl2.json, logs integration-* și browser-*. npm run check PASS:400/400 teste, typecheck/lint/format/architecture; log global-check.txt. Verificatorul arhivelor/artifactelor PASS, screenshot inspectat și păstrat în Evidence.

Fișiere și documente actualizate: src/vehicles/collision-port.ts,collision-episodes.ts,physics.ts,rapier/index.ts; src/simulation/collision-events.ts și metadate EventBusStats.sessionId; barrels vehicles/simulation (coordonator); teste vehicles collision baseline/pure/native și events collision/existing007; scripts benchmark-collision-events.mjs,benchmark-collision-events-after.mjs,benchmark-collision-onsets.mjs,collision-events-server.mjs; tests/browser/collision-events; Docs/Evidence/028-collision-events și Docs/event-bus.md. Contractele comune05/README leagă documentul collision-events.md; scriptul verify-collision-events-evidence.mjs verifică sursele/arhivele și buildul capturat.

Limitări sau follow-up: scanare native numai de la vehicule; counters obstacle-only0 înseamnă perechi neenumerate, sensor0 nu demonstrează absența intersecțiilor native. Admitere physicalinteraction prin toleranța nativă OR impuls pozitiv include CCD predictiv la gap pozitiv, nu exclusiv penetrare. Obstacole vechi anonime nu primesc ID inventat. ID vehicul/sesiune≤256codeunits este un contract finit nou explicit. Costuri NodeCPU supplemental, fără120s wall/FPS/fulltickgate; busp95=0 în segmentul persistent măsurat nu reprezintă cost de livrare, probă onset separată. Heap forced-GC diagnostic; allocator WASM exact indisponibil. Snapshot capacity/readback failure după avansare este terminal partialtick cu recuperare owner explicită; nu se reexecută fizica și nu se inventează epoch.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '028' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T15:23:55.8971630+03:00: dependențe022/007 fizicDone; performance_checks simulation/memory înainte de tick/resurse. Pregătire baseline light în fișiere noi, fără modificarea Rapier/barrels înghețate023. Algoritmul și probele CPU așteaptă baseline și grant exclusiv.

- 2026-10-05T17:21:03.2828544+03:00: criterii și probe native/CPU/headed ambele backenduri PASS; npm run check400PASS, arhive/hashuri/build validate, contracte actualizate. Mutat fizic în Done și verificare RequireDone înainte de publicare.
