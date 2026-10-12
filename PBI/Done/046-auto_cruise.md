---
id: "046"
title: "Ținte de viteză și curbe"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["045","031"]
parameter_role: "policy"
parameter_keys: ["speed_delta_urban","speed_delta_residential","curve_lateral_accel","intersection_approach_speed"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium cruise-targets-046"
started_at: "2026-10-11T23:26:29.006Z"
completed_at: "2026-10-12T03:08:02.8639528+03:00"
---

# 046 Ținte de viteză și curbe

## Obiectiv

Folosește parametrii M de viteză urbană/rezidențială, curbe și apropiere.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 045 trebuie să existe în Done înainte de începere.
- PBI 031 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Țintele sunt adaptate contextului și limitelor mecanice.
- [x] Modificarea unui parametru schimbă comportamentul într-un scenariu izolat.

## Verificare

Compară două profiluri pe drum liber, curbă și intersecție.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: politica stateless 046 compilează profile validate și produce ținte urbane/rezidențiale, de curbă și apropiere, cu toate cele patru chei M. Contextul 044, decizia 045, autoritatea, identitatea/incarnarea, epoch-ul, tick-ul și versiunea profilului sunt validate; faptele explicite de drum păstrează banda și tick-ul sursei. Plafonul de acoperire 031 de 30 m/s și raza geometrică a clasei sunt constrângeri explicite. Preferința care depășește limita afișată sau recomandarea 049 rămâne vizibilă; nu se introduce o corecție legală ascunsă. Numai cele patru politici sunt activate în registry pentru MANUAL_TUNING; toate estimările LEARNED rămân dezactivate.

Verificări executate și rezultat: Node 24.21.0/npm 11.19.0 prin Volta. `npm run check` PASS: 704/704 teste, ambele TypeScript, lint, format și arhitectură. `npm run build` PASS. Cele 11 teste 046 includ 31.104 cazuri ale oracle-ului independent, modificarea individuală a fiecărei chei, două profile pe drum liber/curbă/intersecție, integrarea reală 044/045/049 și cazuri adverse de snapshot/capacitate/metadata/lifecycle. Testul separat al cititorului PASS, cu refuzul modificărilor executabile ale runnerului. [Check integrat](../../Docs/Evidence/046-cruise-targets/parent-check-r1.txt), [build](../../Docs/Evidence/046-cruise-targets/parent-build-r1.txt), [cititor curent independent](../../Docs/Evidence/046-cruise-targets/parent-reader-r1.json), [test cititor](../../Docs/Evidence/046-cruise-targets/parent-reader-tests-r1.txt).

Performanță targeted: BEFORE-v3 este capturat cronologic înaintea producției, source b596b329; AFTER-v1 source a035d5ad trece cititorul current/historical cu 12 lumi native pe fiecare captură, 70 normal/110 overload, trei perechi alternante OFF/ON, 180 tick-uri warmup/600 măsurate. Hardware/backend/preset: AMD Ryzen 7 7735U, Windows 10.0.26300, Node/Rapier nativ fără renderer; clasele 023 și suprafața dry-asphalt 026, fără retunare. Bugete provizorii laptop din 203-initial-1: tick normal 8 ms/Rapier 5 ms. P95 tick normal BEFORE 5,6781/5,7811/5,5054 ms; AFTER 7,2384/6,5255/5,4687 ms. P95 Rapier AFTER 0,2612/0,2432/0,1767 ms. Regresie relativă >10% și >1 ms: 1/3 normal și 0/3 overload, sub pragul targeted 2/3; cazul real nu este eliminat sau reclasificat. Overload AFTER 10,6589/8,3836/9,2730 ms este raportat separat. Cost suplimentar al evaluatorului: medie 0,01888–0,02650 ms/apel, fără pretenția unui p95. Trace-urile scalare și hash-urile fizice finale coincid cu baseline-ul; cleanup-ul trece. Buffere: trei canale de 600 doubles, 14.400 bytes ON/0 OFF; tokenuri cu patru valori și fără istoric/cache de decizii.

Fișiere și documente actualizate: `src/autonomy/cruise-targets.ts` și exportul public, registry-ul parametrilor și testele lui, testele/reference-ul 046, adaptorul de benchmark și cititorul/comparatorul independent. [Contract și rezultate](../../Docs/cruise-targets.md), [indexul dovezilor](../../Docs/Evidence/046-cruise-targets/README.md), Docs/06, Docs/11, Docs/README și Docs/parameter-registry, PBI/README și atributele Git pentru bytes-urile arhivate și LF ale surselor măsurate. Catalogul de proiectare și bugetele numerice nu sunt modificate.

Limitări sau follow-up: 046 produce ținte; actuația longitudinală este PBI 047, urmărirea distanței este 048. Tipul drumului, raza și apropierea sunt fapte authored explicite; schema 032/contextul 044 nu le inventează. Limita 30 m/s este domeniul de calibrare, nu top speed sau garanție de aderență. Recomandarea 049 de 3,5 m/s² nu înlocuiește preferința de stil 0,5–8: testele reale ale contractului 049 urmăresc profilul prudent și raportează REQUESTED_OVERSPEED pentru ținta agresivă de circa 11,31 m/s. Benchmarkul nativ folosește comenzi fizice brake=1 independente de ținte și un caller în șase faze, fără a pretinde integrare 219 sau condus longitudinal. Nu există schimbări vizuale/input în aplicație și nu se revendică browser/playtest nou, FPS, memorie JS/WASM exactă ori validarea jocului integrat. Memoria callerilor care păstrează tokenuri/rezultate este separată de ownership-ul politicii. Istoricul și eșecurile de pregătire/teste/statice rămân păstrate; singura diferență admisă a runnerului este comentariul lint revizuit pentru agregarea cauzei primare și a erorilor de cleanup.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '046' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

## Nivel de validare — înainte de implementare

Nivel: targeted. 046 introduce calcul de politică pe decizie și ownership plafonat; simulation/memory sunt declarate înaintea algoritmului. Se păstrează baseline cronologic pe fixture-ul disponibil, apoi comparație locală nativă pe aceeași sursă fizică/scenarii și verificări de capacitate/cleanup. Modulul 046 produce ținte, iar actuația longitudinală este scope 047; nu se retunează fizica, rendererul sau schedulerul. Integrarea cu 045/context și limitele mecanice este verificată prin scenarii reale ale contractelor existente. Browserul este necesar dacă implementarea introduce efect vizual/input; fără astfel de schimbări, probele pure/native nu pretind playtest, FPS ori acceptare hardware a jocului integrat. Eșecurile și rapoartele istorice rămân păstrate, fără relaxarea bugetelor.

- 2026-10-12T03:08:02.8639528+03:00: Implementarea și review-ul independent sunt acceptate în scope targeted: patru chei de politică, 31.104 cazuri oracle, 704/704 teste globale, build și cititor current/historical PASS. BEFORE-v3 este cronologic; AFTER-v1 păstrează fizica și scalar trace, cu o confirmare relativă din trei normale și bugete absolute neschimbate. Fără actuație 047 sau revendicare browser/FPS. Mutarea fizică și validatorii obligatorii urmează mai jos.

- 2026-10-12: Mutarea fizică în Done este verificată; fișierul lipsește din To Do/In Progress. Validate-Board.ps1 -RequireDone '046' PASS: 235 taskuri, 180 To Do/3 In Progress/52 Done. Validate-Plan.ps1 PASS: 1393 linkuri locale, 29 module/80 parametri și 92 taskuri cu performance_checks. Indexul de progres este recalculat din coloanele reale. Loguri finale în Docs/Evidence/046-cruise-targets/parent-board-done-r1.json și parent-plan-r1.txt.

- 2026-10-12: Source binding Git PASS pentru toate fișierele măsurate și artifactul Rapier. Prima verificare a identificat conversia CRLF→LF a manifestului în indexul Git; se păstrează acum bytes-urile reale cu -text, fără schimbarea datelor JSON ori a bugetelor numerice (egalitate JSON verificată). Dovadă: Docs/Evidence/046-cruise-targets/parent-git-source-binding-r1.json. Delegarea shared-checkout este închisă, fără servere sau worktree nou; cele patru worktree-uri preexistente sunt păstrate.
