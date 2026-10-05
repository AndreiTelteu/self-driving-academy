---
id: "027"
title: "Frânare frână de mână și marșarier"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["024","025"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium braking-reverse-01"
started_at: "2026-10-05T18:15:53.120Z"
completed_at: "2026-10-05T23:19:30.015Z"
---

# 027 Frânare frână de mână și marșarier

## Obiectiv

Definește tranzițiile frânare–marșarier și comenzile la viteză aproape zero.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 025 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Marșarierul nu este activat instant din mers înainte.
- [x] Frâna de mână are efect fizic fără instabilitate numerică.

## Verificare

Testează oprire, inversare și frână de mână în viraj.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Extensie opt-in027 a controllerului comun și adaptor de tastatură care păstrează inputul brut025. Oprire→inversare cu viteza totală≤0,2m/s în6tick-uri fizice consecutive; autoritate, pauză și BodyIdentity fenced. Comanda efectivă rămâne magnitudine, iar propulsia fizică este semnată după sensul angajat. Frâna/frâna de mână domină propulsia fără modificarea masei, aderenței, puterii, solverului sau pasului Rapier.

Verificări executate și rezultat: npm run check în checkoutul izolat:437teste PASS; pe main integrat cu045:446teste PASS, type/lint/format/architecture PASS (Docs/Evidence/027-braking-reverse/checks-main-global.txt). Prima verificare main a expus scanarea accidentală a unui harness052 neterminat din worktree; logul este păstrat, iar ESLint ignoră acum .worktrees/** și verifică checkoutul propriu. Nu s-au eliminat verificări ale codului canonic.

BEFORE source87c79830da384dd6432be41f5ad03029c95513f99493ca696857c3c056410499 și AFTERb6d5d9957c2a64c7767ea0fc49214d42b1c35c1ef0abd24d77d0cee1a08b5165:10lumi70mașini,180warm/600measured, toate trace-urile și hashes fizice neutre exact identice. Median p95 tick1,7661→2,2392ms; stage drivetrain0,0372ms; toate5AFTER observerON≤5,5ms, zero regresii confirmate >10% și >1ms. Ownership70stări/limita110 și un adaptor, fără istoric; cleanup zero. Proba Node nu validează FPS hardware.

Calibrare source3873d3d7a19c0e29968c2806d56dfdc15e3c9888594a816c294b3286ae324fb8:6arme sedan/compact×rate0/50/100 pentru oprire/reverse/forward și4arme viraj/coasting/handbrake PASS. Dwell6ticks verificat înaintea fiecărei angajări, toate valorile finite. Din20m/s: sedan25,03–28,80m, compact22,38–26,15m oprire; viraj cu handbrake7,38m vs21,25m sedan,6,36m vs19,54m compact; plafoane native doar pe roțile spate.

Driving Chrome154 pe AMD: WebGPU2026-10-05T23:10:44.112Z și WebGL22026-10-05T23:11:32.951Z PASS, ambele clase, zerooverload, rezoluții CSS/internal1920×1080/DPR1. Source11b8ea1e7217c40397928c225c559fa673b6118d13af16370df28362d9ee7609, artifact2eba7380d3b4415784e7642b54a2f8fbb1b133722e7d7c6914f8aeeed1fa1561; ZIP144968bb3d6d54e03cdfe750fdac545b36112dfcb9b514a10e73772340dcd75c cu142artefacte byte-exact. Eșecurile anterioare1Hz sunt păstrate; noua fereastră Chrome furnizată de utilizator a permis probele PASS, fără schimbarea pragurilor/fizicii.

node Docs/Evidence/027-braking-reverse/verify.mjs --historical: PASS arhive CPU/calibrare/browser/ZIP/native02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0. Copia nativă a fost arhivată după probe, cu timestamp real, identică digests înregistrate, fără antedatare. Auditul separat verify-integration.mjs pe main:114GitINDEX/archive/native rows PASS,111current byte-exact și3rânduri ale aceluiași Docs/performance-budgets.json diferite numai prin CRLF/LF. Nu declarăm strict-current byte PASS pe main; verificarea strictă a trecut în checkoutul de captură. Scriptul de verificare ZIP folosește .NET Hash-Bytes după indisponibilitatea Get-FileHash în powershell.exe; eșecul inițial este păstrat și bytes/hashurile capturii nu sunt schimbate.

Fișiere și documente actualizate: src/vehicles/drivetrain.ts, braking-reverse-input.ts, controller/contracts/ports/exports; testele drivetrain și fixture-urile Node/browser; Docs/braking-reverse.md, Docs/05-vehicule-si-fizica.md, Docs/vehicle-controller.md, Docs/README.md; Docs/Evidence/027-braking-reverse și eslint.config.js. Commit implementare eecd40169b6dfcd97dcdd47363b7e4021e00ad6e; server5198 oprit după arhivarea rapoartelor.

Limitări sau follow-up: Scripted DOM S/W/Space, fără claim de taste fizice trusted; setup-ul brațului handbrake inițializează8m/s și nu este un drum continuu. Nu validează FPS flotă, heap exact, joc complet, ABS/transmisie completă sau laptop.027este opt-in;025legacyS rămâne frână. Disponibilitatea029 se integrează ulterior: minimumBrake înaintea dwell și plafonarea magnitudinii după realizarea sensului, cu proiecție fizică semnată consistentă;029rămâne blocat de propriul gate CPU.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '027' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- BEFORE cronologic executat înainte de algoritmul027:10lumi70mașini/controller024+input025,180warm/600ticks măsurate, surse/native byte-exact și start/end guards PASS; source87c79830da384dd6432be41f5ad03029c95513f99493ca696857c3c056410499. Implementare izolată în pregătire; CPU/testele suspendate pe durata FULL026. Alegere documentată: adaptor027 opt-in menține S frână din mers înainte și permite reverse după dwell aproape zero; v1legacy025 rămâne frână-only. Limitele propuse necesită calibrare.

- 2026-10-05: Verificare izolată027: typecheck/architecture/scoped lint și43teste PASS,6calibrări frânare/reverse+4viraje PASS,10AFTER cu neutral physical traces exactBEFORE. Build5198 pregătit; probele browser AUTO/WebGL2 și integrarea rămân neexecutate. Nu este Done.

- 2026-10-05: Douăprobe ChromeAUTO eșuate overload păstrate. Buildul reparat raportează tick0, RAFgap1000.1ms,30warmupframes21.7s; niciunpas fizic027 nu a rulat înaintea eșecului. Paginafocus=true nu dovedește fereastră neoclusă. Este necesară activarea fizică a tabului; gatezerooverload rămâne intact.

- 2026-10-06: Driving actualWebGPU/WebGL2 PASS în fereastraChrome nouă;446teste main,114rowGitINDEX/archive/EOL-only audit PASS; mutat fizic în Done, validatori BoardRequireDone027 și Plan executați după mutare.
