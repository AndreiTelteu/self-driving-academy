---
id: "024"
title: "Controller auto și comenzi comune"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["023","008"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium PBI024"
started_at: "2026-10-05T16:33:09.5664234+03:00"
completed_at: "2026-10-05T15:06:32.219Z"
---

# 024 Controller auto și comenzi comune

## Obiectiv

Aplică throttle, brake, steering, handbrake și semnalizare printr-un singur controller.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 023 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Manual și autonom pot utiliza exact aceeași VehicleCommand.
- [x] Comenzile simultane sau invalide au reguli determinate.

- [x] Comenzile/controllerul sunt realizate la fiecare tick fizic, chiar dacă deciziile de nivel înalt au 10 Hz.

## Verificare

Compară aceeași comandă din două surse în scenariu identic.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `createVehicleController` și `VehicleActuationPort` aplică aceeași VehicleCommand pentru PLAYER/AUTONOMY. Autoritatea precede selecția în același tick; malformed/duplicate/world/tick/token sunt respinse atomic înainte de fizică. Brake/handbrake anulează throttle, țintele AUTO expiră după șase tick-uri, PLAYER cere tick-ul curent. Indicatorul este autoritar și derivat din tick; suspend/resume eliberează țintele. Retenția are limite110vehicule/220packeturi/110schimbări și niciun istoric. Rapier primește handbrake pe roțile spate cu maximum(service,handbrake), fără însumare, plus readback wheelBrakeImpulseLimitNs.

Verificări executate și rezultat: Reluarea a rerulat13teste controller și57teste combinate Rapier/controller/clase/contacte/lifecycle, toate PASS; typecheck, architecture, lint și format scoped PASS (`checks-resumed-*.txt`). Testele verifică traiectorii identice pentru cele două surse/ambele clase,10Hz→60Hz la30/60/144Hz de prezentare, takeover, invalidbatch fără efecte, token/epoch/fault și20cicluri110mașini/880subscriptions fără retenție după dispose. BEFORE/AFTER originale au10lumi70mașini, cinci perechi observerON/OFF,180warmup/600measurementticks; checksumurile input/fizică și trace-urile coincid exact. Mediană tickp95 ON1,6785→2,0215ms (+0,343ms/+20,4%); controller incremental p95median0,3206ms; observer samples28800→33600bytes (+4800bytes bounded). Aceste probe Node nu sunt FPS/heap total/gameplay gate. Primele drive-uri Chrome154 WebGPU/WebGL2 au trecut, păstrate istoric în `initial-capture-with-scheduling-barrel`; capturile finale independente de219 au fost executate manual de utilizator pe Chrome154/AMD și verificate current-source PASS prin verify.mjs. Ambele backenduri au sedan/compact961ticks/~16s, parity sub0,000077, takeoverIgnored1, resumedNeutraltrue, overload0, semnaleLEFT/HAZARD/RIGHT și16checkpointuri per clasă. SourceHash6b559f9972525b994d7370ea35784a0965ea29ccff5688c175a70436d6c0abcf/artifactf50d3f55f5736fa855fcc82706f67ed4d601972979fb6f90924dd61be87a823e; arhiva exactă46inputs nu include draft219. [Recovery](../../Docs/Evidence/024-vehicle-controller/progress.md).

Fișiere și documente actualizate: src/vehicles/controller.ts, controller-port.ts, index.ts, physics.ts, rapier/index.ts; tests/vehicles/controller.test.ts și controller-reference.ts; harnessurile tests/browser/vehicle-controller-baseline.mjs, vehicle-controller-after.mjs și vehicle-controller/; Docs/vehicle-controller.md și Docs/Evidence/024-vehicle-controller. Fixtureul de driving folosește canvasul deținut de backend, rezoluția internă fixată1920×1080 și import direct fixed-tick008; nu include implementarea219 nepublicată.

Limitări sau follow-up: Calibrarea handbrake/reverse/stabilitate027, input filtering025, learning și FPS/heap gameplay aparțin PBI-urilor dedicate. Browserul este un playtest funcțional real pe două mașini; nu este benchmarkul flotei finale sau validare laptop. Computer Use a fost oprit automat la reload din cauza identității URL; utilizatorul a executat manual capturile finale, păstrând guardul de focus real. Mutarea fizică/validatorulDone și publicarea sunt responsabilitatea coordinatorului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '024' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05T16:33:09.5664234+03:00: dependențe023/008 fizicDone/publicate; cel mai mic ID eligibil. Memory adăugat înainte de retenția controllerului. Pregătire light referință/baseline; fără algoritm înainte de baseline și fără Rapier edits în ownership028.

- 2026-10-05T18:05:14+03:00: Reluare după pauză autorizată. Controller și handbrake verificate prin57testePASS, typecheck/architecture/scopedlint/formatPASS și BEFORE/AFTER exact compatibile. Capturi finale Chrome154/AMD WebGPU+WebGL2 realizate manual de utilizator după oprirea automată Computer Use; verifier current-sourcePASS. Criteriile îndeplinite; mutarea/validatorulDone și publicarea revin coordinatorului.

- 2026-10-05T18:06:51.1953046+03:00: Coordonatorul a verificat independent rapoartele current-source PASS, a mutat fizic fișierul în Done și a completat checklistul după mutare. Validate-Board -RequireDone 024 este verificarea finală de integrare.
