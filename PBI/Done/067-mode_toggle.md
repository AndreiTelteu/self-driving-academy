---
id: "067"
title: "Hotkey-uri M/L și cele trei moduri vizibile"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["066","009"]
performance_checks: ["simulation", "memory", "frame"]
owner: "Codex gpt-6.1-sol medium mode-controls-01"
started_at: "2026-10-06T01:47:43.728Z"
completed_at: "2026-10-06T03:05:03.781Z"
---

# 067 Hotkey-uri M/L și cele trei moduri vizibile

## Obiectiv

Implementează AUTO, MANUAL fără învățare și LEARNING cu învățare, plus comenzile M/L remapabile.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 066 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] M comută AUTO↔MANUAL și LEARNING→AUTO; L comută AUTO/MANUAL→LEARNING și LEARNING→MANUAL.
- [x] Textul/simbolul HUD arată modul real și eligibilitatea; focusul UI și key repeat nu produc tranziții accidentale.

## Verificare

Testează cele șase tranziții, toggle rapid, key repeat, focus și pauză.

Înaintea implementării adaptorului de intenții/HUD, păstrează un BEFORE pe fixture-ul disponibil066/025 și compară același protocol după schimbare. Costul067, intențiile și listeners/nodurile UI au limite explicite; aplicarea la tick și afișarea respectă manifestul203. Probele scurte Chrome pe ambele backenduri verifică hotkey/focus/pauză și modul fizic acceptat; nu certifică FPS-ul flotei sau laptopul.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

## Dovezi de finalizare

Rezultat implementare: Adaptoare M/L remapabile cu maximum16 intenții și un ticket exact pentru066/024; șase tranziții, mod/tick fizic acceptat, eligibilitate explicită, protecții pentru repeat/focus/pauză și HUD cu vehicul controlat separat de ținta butoanelor.

Verificări executate și rezultat: 488 teste globale în checkoutul de implementare, BEFORE34 lumi/117inputs și AFTER34/121 cu paritate fizică exactă și0/5 regresii pentru70/110. Chrome final format-v3 WebGPU și WebGL2 PASS; review independent48 checkpointuri, zero regresii, RAFp95≤8,5ms, cleanup. Parent strict CURRENT surse/arhivă144ZIP PASS înainte de integrare; formatter HTML LF PASS. Verificarea globală în main a trecut488/488 teste, typecheck/lint/format/arhitectură; [log](../../Docs/Evidence/067-mode-controls/main-check.log). Dovada Git-index PASS186 runtime rows/710 evidence rows/92 preservation rows;184 working bytes exact și numai2 apariții EOL ale bugetului, toate bytes Git exact. RequireDone067 și ValidatePlan PASS; [audit](../../Docs/Evidence/067-mode-controls/integration-source-audit.json).

Fișiere și documente actualizate: src/input/mode-controls.ts, mode-keyboard.ts, mode-boundary.ts, src/ui/control-mode-hud.ts și exports; teste de contract/DOM, fixtures browser/reference, benchmarkuri native, [contract](../../Docs/mode-controls.md), modul08, index Docs și [dovezi067](../../Docs/Evidence/067-mode-controls/).

Limitări sau follow-up: Fixture timpuriu cu două mașini; evenimente DOM sintetice, fără dovadă de tastatură fizică trusted, flotă/joc complet/laptop sau memorie totală exactă. Segmentele și joburile LEARNING au integrare separată. Încercarea inițială HUD și layout-v2 numeric PASS cu eroarea ulterioară CRLF sunt păstrate; build-ul final format-v3 nu schimbă logica sau pragurile.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '067' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
- 2026-10-06: BEFORE nativ34worlds/117inputs7c924b9 și Chrome WEBGPU/WebGL2 source1255868/artifact5eadec/ZIP34e40 trecute înaintea celor3fișiere067 de producție. Parent a executat verifierul CURRENT pentru ambele backenduri; T3 independent29/29 și31/31, Run enabled terminal. Distribuții RAF fără timpi individuali exportați; nu dovadă tastatură trusted/flotă/joc complet. Implementarea067 autorizată în același subagent, review înainte de AFTER.
- 2026-10-06: Implementarea067 a trecut17 teste de contract și DOM, typecheck, lint, format și verificarea arhitecturii. Review-ul părintelui a verificat ticket-ul bounded, publicarea modului/tick-ului fizic acceptat inclusiv la fault, eligibilitatea explicită și protecțiile tastaturii/HUD. Urmează verificarea globală, apoi comparația AFTER nativă și Chrome; PBI rămâne In Progress.
- 2026-10-06: Verificarea globală a trecut487 teste înaintea review-ului independent. Acesta a găsit diferența dintre vehiculul afișat în HUD și ținta selectată pentru butoanele M/L. Se repară afișarea și legarea țintei clickului, cu test integrat; nicio probă AFTER nu a fost executată.
- 2026-10-06: HUD-ul separă vehiculul controlat de ținta vizibilă a butoanelor și respinge clickul dacă selecția s-a schimbat. Review independent rezolvat, verificare globală488 teste PASS. Unicul AFTER nativ5ce4456/121inputs/34worlds a trecut cu rezultate fizice exacte față de BEFORE,0/5 regresii confirmate pentru70 și110, tickp95 normal3,09–3,23ms și cost067p95 0,0256–0,0347ms. Parent a executat verifierul CURRENT pentru surse/native/cronologie/date brute/cleanup. Chrome AFTER este încă neexecutat.
- 2026-10-06: Prima probă Chrome AFTER WebGPU a exportat PASS numeric pe source11b703/artifacte9cdeb. Verificarea vizuală reală a găsit câmpuri HUD lipite; se păstrează încercarea inițială și se corectează numai CSS-ul fixture-ului înaintea unui build distinct și a ambelor probe finale. WebGL2 inițial neexecutat; sursele121 și AFTER nativ rămân neschimbate.
- 2026-10-06: Corecția vizuală layout-v2 a trecut ambele probe Chrome și review-ul independent fără regresii. Verificarea ulterioară a formatterului a respins CRLF în HTML; rezultatul și capturile v2 sunt păstrate integral. Se normalizează numai EOL la LF conform configurației proiectului și se pregătește build-ul distinct format-v3, cu surse121/native/protocol/praguri neschimbate. Commitul rămâne neexecutat până la validarea finală.




- 2026-10-06: Integrat commitul e514cd75; main488/488 și typecheck/lint/format/arhitectură PASS. Mutare fizică Done, RequireDone067 și ValidatePlan PASS. Auditul Git-index186/710/92 PASS, fără schimbări semantice între captură și livrare. Publicarea urmează commitului de integrare.
