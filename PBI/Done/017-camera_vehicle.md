---
id: "017"
title: "Camere din spate și first-person"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["014","009"]
owner: "Codex6.1-Sol medium /root/pbi014"
started_at: "2026-10-05T03:02:21.8387087+03:00"
completed_at: "2026-10-05T03:28:25.4417286+03:00"
performance_checks: ["frame", "memory", "ui"]
---

# 017 Camere din spate și first-person

## Obiectiv

Implementează urmărire amortizată, adaptare la viteză și evitare de obstacole.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 014 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Camera urmărește entityId selectat și poate schimba ținta fără mutarea vehiculului.
- [x] Intensitatea mișcării și distanța sunt reglabile.

- [x] Camera first-person din poziția șoferului și camera din spate sunt disponibile în V1 prin C; nu se rezumă la vedere pe capotă.
- [x] FOV/mișcare reglabilă, mouse look/recenter și captură explicită/Escape funcționează fără clipping la viraj/impact sau transfer de autoritate.

## Verificare

Verifică viraj, frânare, obstacol și schimbare de țintă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: VehicleCameraController readonly și BabylonVehicleCamera cu chase amortizat/viteză, seat eye first-person, FOV60–100°, motion0–100/distance2–15m, sphere sweep AABB după damping, shell/cabin ownership/restaurare. Input C, captură explicită/recenter/Escape și callback cameraMode separat de autoritate. Implementarea verificată; captura reală, privirea, recenter și Escape trec în Chrome autorizat, pe WebGL2 și WebGPU.

Verificări executate și rezultat: 6/6 teste dedicate PASS; npm run check PASS185, architecture64 +6 probes; npm run build PASS; Validate-Plan PASS. Browser real frozen production fixture5177 tab_b, WebGL2 și WebGPU PASS pentru pose/cabin/turn/impact/obstacles/selection; C real și sliders/controls reale PASS. Captura inițială T3 a fost respinsă WrongDocumentError; verificarea finală Chrome autorizat PASS pentru trusted capture, mouse look, recenter, Escape și autoritate neschimbată pe WebGL2/WebGPU. JSON-uri/capturi și 6/6 teste repetate de părinte în Docs/Evidence/017-camera.

Fișiere și documente actualizate: src/rendering/vehicle-camera.ts, camera-collision.ts; src/rendering/babylon/vehicle-camera.ts și vehicle-camera-input.ts; tests/rendering/vehicle-camera.test.ts; tests/browser/vehicle-camera și config build dedicat; Docs/vehicle-camera.md și Docs/Evidence/017-camera. Entry points coordonate cu părintele.

Limitări sau follow-up: hostul T3 refuză pointer lock; Chrome real verifică integral criteriul. AABB conservator și trei obstacole fixture nu validează întregul oraș; seat metadata/exterior/cabin și broad-phase aparțin ownerului reprezentării. Calibrarea finală hardware și lumea extinsă rămân în PBI-urile lor. Niciun blocaj pentru scope017.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '017' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.


- 2026-10-05T03:16:15.0101478+03:00: implementare/probe camere GL+GPU și gate185 PASS; pointer lock real respins WrongDocumentError pe fresh frozen tab_b; task păstrat In Progress, criteriul captură/look/Escape deschis.

- 2026-10-05T03:28:25.4417286+03:00: Părintele a verificat Chrome autorizat, ambele backenduri, trusted capture→look→Escape→recenter, autoritate neschimbată și capturi inspectate; toate criteriile sunt îndeplinite. Mutare fizică în Done urmată de validator obligatoriu.
- Verificare finală a indexului izolat: check 186/186, build, Validate-Board RequireDone017 și Validate-Plan PASS; loguri arhivate în Docs/Evidence/017-camera.
