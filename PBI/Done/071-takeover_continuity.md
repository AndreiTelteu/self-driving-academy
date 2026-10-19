---
id: "071"
title: "Continuitatea fizică la preluare și revenire"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["069","054","070"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium takeover-continuity-01"
started_at: "2026-10-19T11:29:24+03:00"
completed_at: "2026-10-19T12:05:00+03:00"
---

# 071 Continuitatea fizică la preluare și revenire

## Obiectiv

Verifică viteza, comanda și traiectoria la tranziția dintre surse.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 054 trebuie să existe în Done înainte de începere.
- PBI 070 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Revenirea în autonomie păstrează starea fizică și caută reintrare validă.
- [x] Un vehicul fără reintrare devine BLOCKED cu motiv.

## Verificare

Testează tranziție în viraj, în afara drumului și în coliziune.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/autonomy/takeover-continuity.ts` (`071-takeover-continuity-v1`), stratul de continuitate peste 054, nu o a doua copie a lui: decizia de reintrare rămâne `evaluateAuthorityReentry` a lui 054, re-expusă verbatim, iar 071 adaugă măsurarea și mărginirea continuității fizice (poză, viteză, stare unghiulară, direcția drivetrain-ului, daune) și a diferenței de comandă dintre ultima comandă MANUAL și prima comandă AUTONOMY peste exact un pas autoritar (`after.tick === decisionTick && before.tick + 1 === after.tick`). Modulul nu scrie, nu limitează, nu repară și nu teleportează nimic (`teleportsVehicle: false`, nicio cale de scriere către poza autoritativă) și nu deține ceas, corp, planner sau istoric. `takeoverContinuityBehaviorFacts` ridică doar `routeBlocked`, deci starea BLOCKED și setul închis de motive ale 045 rămân intacte; un vehicul fără reintrare devine BLOCKED cu motivul 054 (`RECOVERY_DISALLOWED`, `NO_RECOVERY_TARGET`, `ROUTE_NOT_PROVEN`), iar o cerere validă 030 este oferită împreună cu blocajul. Exportat prin `src/autonomy/index.ts`.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **970 teste / 970 pass / 0 fail**, de la 961; include cele 9 teste noi din `tests/autonomy/takeover-continuity.test.ts`), plus `npm run build` EXIT 0 și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei (`node --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 071 --before|--after`, la commit-ul integrat) și a reprodus concluzia în marjă de zgomot: cost adăugat p50/p95/p99 **+0,0135 / +0,0308 / +0,0709 ms per decizie** la 10 Hz (raportat de subagent +0,0139 / +0,0232 / +0,0070), cu memorie zero pe toate cele 20 de cicluri (`retainedActors`/`retainedHandovers`/`retainedHistory` = 0, `disposed: true`). Cheia de non-perturbare rămâne checksum-ul de decizie identic între brațe și `statePreserved` 200/200 din raportul măsurat. Acoperire: tranziție în viraj cu stare fizică păstrată și fără scriere de poză; reintrare off-lane `DRIVE_TO_LANE` din geometria reală 033 cu `lateralOffsetM` egal cu proiecția reală; reintrare imposibilă → BLOCKED determinist și mărginit pe 100 de apeluri, cu escaladarea 030 având dovada de drum exactă; tranziție în coliziune fără reparație sau recuperare fabricată; limita de pas de comandă raportată explicit când este depășită, fără limitare silențioasă; abstinență fără graf ori observație; respingere atomică a unui handover malformat; compoziție reală 066/070/069 (autoritate, suspendare cu zero pași fizici, un singur loc eliberat, tick-uri contigue, `RETURN_TO_AUTO` acceptat și aplicat de lifecycle-ul real 069).

Fișiere și documente actualizate: `src/autonomy/takeover-continuity.ts` (nou), `src/autonomy/index.ts`, `tests/autonomy/takeover-continuity.test.ts` (nou), `scripts/benchmark-autonomy-policies.mjs` (brațul 071, aditiv), `Docs/takeover-continuity.md` (nou), `Docs/08-interfata-camera-si-control.md`, `Docs/README.md`, `Docs/Evidence/071-takeover-continuity/` (README, ambele brațe JSON și transcripturi, checks, tests).

Limitări sau follow-up: **brațul UI/frame nu este măsurat** (nu există browser vizibil în acest mediu, iar Docs/25 interzice declararea ca acceptat a unui cost nemăsurabil) și rămâne datorat la 153/224/235. Fixture-ul este Node CPU validate-only cu o adevărare fizică autorată, deci **nu** se exercită o lume Rapier nativă, plasarea fizică 030 ori condusul efectiv înapoi pe bandă (046–049/024); limitele de continuitate și limita de pas de comandă sunt constante înghețate provizorii, necalibrate pe harta reală; excepția de coliziune depinde de flagul real 028 raportat de apelant; brațul BEFORE este același commit fără stratul 071 (054 este dependență finalizată, nu o revizie istorică).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '071' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia Control manual (066–070). Nu s-a declarat `frame` pentru că proba de frame/UI nu poate fi măsurată în acest mediu. Owner `opencode deepseek-v4.1-flash medium takeover-continuity-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat contractul de continuitate, testele, brațul de probă și documentația, cu commit-uri incrementale (`b8c3e836`, `98a61ceb`, `f5536108`, `d9282bdd`); integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (`npm run check` EXIT 0, 970/970; `npm run build` EXIT 0; catalog sincronizat) și ambele brațe ale sondei 071 (cost și memorie reproduse în marjă de zgomot); criterii bifate, dovezi completate, mutare fizică In Progress → Done.
