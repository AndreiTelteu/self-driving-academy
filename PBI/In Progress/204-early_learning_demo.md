---
id: "204"
title: "Prototip timpuriu cu trei parametri și oraș care imită"
status: "In Progress"
release: "V1"
module: "Produs"
depends_on: ["010","017","031","033","046","049","051","066","069","085","092","203","218","219","221"]
performance_checks: ["frame", "simulation", "workers"]
owner: "Codex gpt-6-luna medium early-learning-demo-01"
started_at: "2026-10-19T18:50:00+03:00"
completed_at: null
---

# 204 Prototip timpuriu cu trei parametri și oraș care imită

## Obiectiv

Livrează pe fixture mic bucla LEARNING→estimare→profil→AUTO pentru speed_delta_urban, desired_acceleration și stop_full_probability, înainte de cartier/flota completă.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [24-milestone-timpuriu-si-contracte.md](../../Docs/24-milestone-timpuriu-si-contracte.md)
- [08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md)
- [10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.
- PBI 031 trebuie să existe în Done înainte de începere.
- PBI 033 trebuie să existe în Done înainte de începere.
- PBI 046 trebuie să existe în Done înainte de începere.
- PBI 049 trebuie să existe în Done înainte de începere.
- PBI 051 trebuie să existe în Done înainte de începere.
- PBI 066 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Trei taxiuri și două civile adoptă același stil; fiecare din cele trei chei are o demonstrație eligibilă și efect real.
- [ ] MANUAL nu învață; adaptoarele minime păstrează contractele reutilizabile și nu revendică suportul complet de 24.
- [ ] Playtestul și ținta primei schimbări în cinci minute sunt consemnate conform modulului 24; nicio dovadă nu este inventată.

- [ ] Harness-ul 218, schedulerul 219 și admiterea 221 măsoară prima buclă pe fixture mic fără a cere artificial flota completă.

## Verificare

Rulează fixture-uri prudente/riscante și fără dovezi; verifică cele trei moduri și playtest cu minimum cinci participanți.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare (parțial, integrat, PBI rămâne In Progress): `composeEarlyLoopProfile` în `src/learning/early-loop.ts` compune un profil dintr-un candidat 093/094/095/098 cu un blend limitat la `25% × quality`, păstrează proveniența (segmente, oportunități, valoare candidată, calitate), refuză o cheie fără dovezi lăsând valoarea neschimbată și nu activează `implemented`/`estimable` și nu publică `LEARNED`. Etapa a doua adaugă `compileEarlyLoopControllerProfiles(mode, baseProfile, earlyProfile)`: supraimpune valorile eligibile pe un profil de bază validat și le compilează prin limitele reale 046 cruise, 047 longitudinal și 051 stop-policy; AUTO primește token-urile, MANUAL și LEARNING întorc `null`, iar proveniența și dovezile de bază sunt păstrate. Testele adaptorului (3/3) acoperă blend-ul mărginit, refuzul fără dovezi, păstrarea provenienței și validatoarele reale. `tests/browser/early-learning-playtest.html` și `Docs/early-playtest.md` pregătesc protocolul de playtest cu export JSON anonim, fără răspunsuri precompletate; `Docs/Evidence/204-early-learning-demo/playtest/` este gol și nu conține niciun participant inventat.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture`, `check:parameter-catalog` exit 0; `npm test` 1049/1049 PASS; `git diff --check` curat. Bucla nu a fost încă măsurată cu 218/219/221 și nu există probe comportamentale.

Ce lipsește pentru închidere:
- fixture-ul comportamental cu 3 taxiuri + 2 civile care adoptă același stil, seturile prudent/riscant/fără dovezi și dovada că fiecare cheie are efect real, iar MANUAL nu învață;
- măsurătoarea primei bucle pe harness-ul 218, schedulerul 219 și admiterea 221, pe fixture-ul mic al lui 204 (probele generice 218/221 rulate nu sunt măsurători pe acest fixture, iar 219 nu a rulat);
- playtest real cu minimum cinci participanți (zero înregistrări până acum) și consemnarea țintei „prima schimbare în cinci minute".

Fișiere și documente actualizate: `src/learning/early-loop.ts`, `tests/learning/early-loop.test.ts`, `tests/browser/early-learning-playtest.html`, [Docs/early-learning-loop.md](../../Docs/early-learning-loop.md), [Docs/early-playtest.md](../../Docs/early-playtest.md), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/204-early-learning-demo/`.

Limitări sau follow-up: Adaptorul este intenționat îngust (doar cele trei chei) și nu pretinde suportul complet de 24. Nu este cablat în bucla live, nu are probe de comportament sau performanță și nu are participanți reali. Criteriul de playtest și cele trei criterii de buclă rămân deschise; PBI-ul rămâne In Progress până sunt îndeplinite cu dovezi executate.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '204'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-19: Prima etapă în worktree izolat (commit `30782be0`): blend îngust pentru cele trei chei cu proveniență și refuz fără dovezi, plus pagina și protocolul de playtest. Integrat prin fast-forward. Bucla nu este încă legată de 046/047/051, fixture-ul comportamental și măsurătoarea 218/219/221 lipsesc, iar playtest-ul are zero participanți; PBI rămâne In Progress.

- 2026-10-19: Etapa a doua (commit `219b7e61`): `compileEarlyLoopControllerProfiles` leagă profilul compus de validatoarele reale 046/047/051, AUTO primește token-urile iar MANUAL/LEARNING întorc null. `npm test` 1050/1050, toate verificările statice trec. Probele generice 218/221 au rulat, dar nu pe fixture-ul 204, iar 219 nu a rulat; fixture-ul comportamental cu 3 taxiuri + 2 civile și playtest-ul real lipsesc în continuare.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
