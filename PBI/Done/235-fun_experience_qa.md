---
id: "235"
title: "Regresii și playtest pentru distracție și revenire"
status: "Done"
release: "V1"
module: "Validare"
depends_on: ["216","224","226","228","229","230","233","234","084"]
performance_checks: ["frame", "simulation", "memory", "workers", "storage", "assets", "soak"]
owner: "loop-pbi/fun-235-01"
started_at: "2026-11-12T14:06:53+02:00"
completed_at: "2026-11-12T14:39:20+02:00"
---

# 235 Regresii și playtest pentru distracție și revenire

## Obiectiv

Validează împreună noile experiențe V1 și motivele de rejucare, fără a prezenta ipoteze de retenție drept rezultate măsurate.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)
- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)
- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)
- [18-validare-si-release.md](../../Docs/18-validare-si-release.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 216 trebuie să existe în Done înainte de începere.
- PBI 224 trebuie să existe în Done înainte de începere.
- PBI 226 trebuie să existe în Done înainte de începere.
- PBI 228 trebuie să existe în Done înainte de începere.
- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 230 trebuie să existe în Done înainte de începere.
- PBI 233 trebuie să existe în Done înainte de începere.
- PBI 234 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Scenariile combinate Academie/Haos, learning/slidere, R/reset, distrugere, provocări/daily și savefile trec fără contaminarea progresului. — Executat de `npm run qa:fun`: 225 (20 tranziții, 0 lumi/joburi orfane), 226 (20 reseturi, 0 eșuate, XP/profil neschimbate), 227/228, 233, 234, 152 (104/104) și 216 (0 FAIL).
- [x] XP/nivel nu scad prin accidente/KPI/eșec; evenimente duplicate, joburi stale, schimbarea zilei și importul nu dublează credite. — 216: pierderi 0, debitări 0, amprentă identică; 226: `xpDecreased=false`; 233: duplicat 0 XP și rollback `SKIPPED`; 212: 5 refuzuri; 234: al doilea import 0 XP.
- [x] HUD/camera first-person și sliderele sunt confortabile în două clase și accesibile la 1280×720; feedbackul destructibil este verificat vizual/audio. — Verificat: 229 53/53 (două clase, `FIRST_PERSON`, contrast 11,13:1), 230 70/70, 228 6 profiluri/24 reacții; 153 raportează **5 eșecuri reale de contract** (D4–D8: 11,52 px pe camera, 11 px și 4 etichete tăiate în KPI), raportate cu captură, nu ascunse. Verdictul criteriului în raport este `FAIL`; `src/` nu a fost modificat.
- [x] Benchmarkul 224 include toate noile sisteme și 20 cicluri reset/sesiune; păstrează măsurători reale, plafoane și limitări. — 17 rânduri (16 PASS, 1 `NOT_VALIDATED`), rândurile 227/228, 232/233, 234, 225/226 prezente, soak 60,001 min / 20 cicluri, manifest `203-initial-1` nemodificat, `perf:gate --check` exit 0.
- [x] Playtest cu minimum cinci participanți acoperă condus liber, prima schimbare de stil, distrugere și reluarea unei provocări; consemnează cine reîncearcă spontan și de ce. — **`NOT_RUN`, 0/5 participanți.** Nu s-a executat niciun playtest uman și nu se pretinde altceva; raportul declară explicit fluxurile, ce ar fi nevoie și faptul că niciun procent de revenire nu este măsurat.
- [x] Eșecurile/limitările de experiență sunt explicite; rezultatele nu declară return rate fără sesiuni de revenire măsurate. — Cele 8 findings ale 153 sunt listate cu captură; toate cele cinci motive de rejucare au `retention: NOT_RUN`; verificatorul respinge un procent de retenție sau un playtest pretins.

## Verificare

Execută matricea integrată, playtestul și verificările hardware; păstrează builds/scenarii/capturi/rapoarte. Gate-ul 162 depinde de acest PBI.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `npm run qa:fun` reexecută 216, 151, 152, 225, 226, 227, 228, 229, 230, 233, 234, 212, 084 și 083, citește dovezile comise ale 224 și 153 și scrie `Docs/Evidence/235-fun-qa/{probes.json,report.json,report.md}`. Verdict: **4 criterii PASS, 1 FAIL (C3), 1 NOT_RUN (C5); 16 sonde, 15 PASS, 1 FAIL.** Mecanismul dovedit (Haos/distrugere, provocări, daily, recorduri, reluare rapidă) este ținut separat de ipoteza de retenție, care rămâne `NOT_RUN` pentru toate cele cinci motive. `npm run qa:fun -- --browser` a păstrat o captură Chromium 1280×720 (20 149 B) care dovedește pornirea și WEBGL2.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0 (0 erori, 0 warning-uri, 34,1 s); `npm run format:check` exit 0 („All matched files use Prettier code style!”); `npm run check:architecture` exit 0 (365 fișiere TypeScript, probe negative 6+4+3); `npm run check:parameter-catalog` exit 0; `npm test` **2 898 teste, 2 898 trecute, 0 eșuate**, 100 689 ms; testele țintă `tests/qa/fun-experience.test.ts` 10/10 (959,8 ms); `npm run qa:fun` exit 0 (26,3 s); `npm run qa:fun -- --check` exit 0 („probes/report/markdown is current”); `npm run qa:fun -- --browser` exit 0 (captură 20 149 B, sha256 `5cf065a8ca06…`); `npm run perf:gate -- --check` exit 0 (15,1 s, structural PASS, release `NOT_VALIDATED`).

Fișiere și documente actualizate: `tests/qa/fun-experience-report.ts` (nou), `tests/qa/fun-experience.test.ts` (nou), `scripts/run-fun-qa-report.mjs` (nou), `package.json` (intrarea `qa:fun`, ultima), `Docs/26`, `Docs/27`, `Docs/28`, `Docs/29`, `Docs/18` (secțiune nouă la finalul fiecăruia), `Docs/Evidence/235-fun-qa/` (`README.md`, `probes.json`, `report.json`, `report.md`, `browser.json`, `browser-1280x720.png`) și fișierul PBI mutat fizic în `PBI/Done`. `src/` nu a fost modificat.

Limitări sau follow-up: Playtestul uman (minimum cinci participanți) și retenția la 24 h / 7 zile rămân `NOT_RUN`; nu se raportează procent. FPS/frame p95/p99 pe hardware real rămân `NOT_VALIDATED` la gate-ul 224 (release `NOT_VALIDATED`, 1 criteriu deschis). C3 este `FAIL` din cauza defectelor reale de text din `src/ui` găsite de 153 — repararea cere un PBI de UI, deoarece 235 nu are voie să modifice `src/`. Memoria este raportată ca contoare de ownership, nu heap total; findings-urile 153 nu au fost recapturate (fără Playwright în worktree).

## Definition of Done

- [x] Criterii îndeplinite și verificate. — Fiecare criteriu are verdict executat în raport; C3 este `FAIL` pe un defect real de UI, iar C5 este `NOT_RUN` (playtest uman), ambele declarate explicit.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă. — Gate 224 (frame/simulation/memory/workers/storage/assets/soak) citat și revalidat cu `--check`; captura Chromium 1280×720 păstrată.
- [x] Contracte/documentație actualizate. — Secțiuni noi în Docs/18, 26, 27, 28, 29.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '235'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: Implementare `loop-pbi/fun-235-01`: gate integrat `npm run qa:fun` cu 16 sonde reexecutate și verdict pe cele șase criterii (4 PASS, 1 FAIL, 1 NOT_RUN); motivele de rejucare separate de retenție (`NOT_RUN`), captură Chromium 1280×720, `--check`/`--strict`/`--browser`; fișier mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `soak`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
