---
id: "022"
title: "Adaptor fizică și conversii de coordonate"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["021","005","013"]
owner: "Codex implementation sub-agent PBI022"
started_at: "2026-10-05T12:11:05.6426054+03:00"
completed_at: "2026-10-05T14:22:26.2207744+03:00"
performance_checks: ["simulation", "frame", "memory"]
---

# 022 Adaptor fizică și conversii de coordonate

## Obiectiv

Conectează corpurile Rapier la entityId și convențiile de axe/unități.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 021 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 013 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Pozițiile, rotațiile și vitezele se convertesc consistent în Babylon.
- [x] Corpurile eliminate nu lasă mapări sau callbacks active.

## Verificare

Verifică un corp rotit și deplasat și un ciclu create/dispose.

Scope022: mapping real pentru maximum110 vehicule addCar, SI Y-up/+Z înainte/+X dreapta și quaternionxyzw fără mirror. Caps fizice021 rămân207bodies/256colliders; addBox rămâne helper anonim de fixture, fără entity mapping/destructible gameplay. Maximum8subscriptions/body,880total, token generation-fenced și remove complet controller/body/collider map.

Probe executate: Rapier real + Babylon Matrix pentru +90°Y translatat și velocity; remove/recreate/stale token, callbacks same-tick reentrant per-body și worldbatch, unsubscribe vechi;20cycles110vehicule/880subscriptions Node. Chrome headed WebGPU/WebGL2: calibrare vizuală și pose/velocity/remove/recreate confirmate;5pairs/backend30s/120s direct/bridge pe aceeași fixture70cars, readback/dispatch separat și20cycles/backend cleanup. [Dovezi](../../Docs/Evidence/022-physics-adapter/verification.md).

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: adaptor real entityId↔Rapierbodyhandle, API pose/velocity/remove/lookup/subscriptions, conversii SI fără mirror și sink injectat Babylon; fencing de generație/identitate și publication/batch pentru callbacks reentrant. Admitere finite înainte de alocare și disposal idempotent.

Verificări executate și rezultat: npm run check PASS (316tests,0fail/skip,typecheck/lint/format/architecture); typecheck după corecția fixturecanvas PASS. Verifier istoric021 PASS fără rescrierea raportului/hashes originale. ProducțieVite și calibrare Chrome headed WebGPU/WebGL2 PASS; protocolfull5pairs30/120/backend,20cleanupcycles/backend, consoleclean; verifierfullPASS142artefacts/sourcebytes/caps/absolutebudgets/relative regressions. Bridge medianp95 WebGPU/WebGL2:frame7/7ms,main3.2/2.8ms,tick2.3/2.3ms,step1.7/1.7ms,readback0.1/0.1ms,dispatch0.1/0.1ms. Source40c307245299faed0f40636791974b7a52af94253978a4271131001132382a7e; artifactd031a823a05ab66ea08108bda16a5d2bd2d992ca867ab92fd95bd0c901f9a711; baselinecommit3006d72,budget203-initial-1,AMD RX7900XTX real. Rapoarte/loguri/capturi/hardware: [verification](../../Docs/Evidence/022-physics-adapter/verification.md), [summary](../../Docs/Evidence/022-physics-adapter/summary.json).

Fișiere și documente actualizate: src/vehicles/body-port.ts,body-registry.ts,physics.ts,index.ts,rapier/index.ts; tests/vehicles/body-registry.test.ts,physics-adapter.test.ts; tests/browser/physics-adapter; scripts/physics-adapter-server.mjs,verify-physics-adapter-evidence.mjs; Docs/physics-adapter.md,05,README,Evidence/022. Sursele istorice021 byte-exact arhivate explicit și verifier021 reconciliat, cu originalele brute neschimbate.

Limitări sau follow-up: adaptor timpuriu desktop, caps provizorii; addBox anonim021 nu are entity mapping. Ownership counts/buffere bounded, memoria exactă WASM/GPU/heap și GPUtimer unavailable/null, fără coldOS/drivercache controlate. Jocul complet, laptopul și gate220/224 NOT_VALIDATED. Fără limitări restante pentru criteriile022.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '022' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-05: implementare022 autorizată; performance_checks adăugate înainte de cod, owner/started_at real și mutare fizică validată. Cod și probe pregătite fără rulări pe hardware-ul rezervat223; verificarea și închiderea rămân coordonate ulterior.

- 2026-10-05T14:22:26.2367409+03:00: probe și contracte022 verificate; task mutat fizic în Done; RequireDone022 și Validate-Plan sunt rulate după mutare, rezultatul păstrat în dovezi.
