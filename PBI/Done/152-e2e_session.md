---
id: "152"
title: "Test integral de sesiune și progres"
status: "Done"
release: "V1"
module: "Validare și release"
depends_on: ["151"]
owner: "loop-pbi/e2e-152-01"
started_at: "2026-11-12T03:36:30+02:00"
completed_at: "2026-11-12T04:14:14+02:00"
---

# 152 Test integral de sesiune și progres

## Obiectiv

Parcurge AUTO/MANUAL/LEARNING, activare taxi/civil, KPIs, daily missions, XP, export și restart.

## Context și plan

[18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 151 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Profilul flotei și progresul sunt păstrate după restart.
- [x] Schimbarea vehiculului nu pierde cursa sau istoricul intervenției.

## Verificare

Rulează sesiunea în browser din profil nou.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `npm run e2e:session` parcurge o singură sesiune în 11 pași și 104 verificări (11 PASS, 0 FAIL): profil nou (30 taxiuri + 40 civile pe o versiune de bază) → AUTO → cursă reală 059/060/061 → MANUAL cu segment 005 → schimbarea vehiculului la mijlocul cursei (`VEHICLE_SWITCH`, cursa rămâne `TO_DROPOFF`, assignment și amprenta călătoriei neschimbate) → terminarea cursei cu o singură eliberare → LEARNING prin 112 și activarea `segment-152-learning~112` pe toate taxiurile și civilele → KPI 209 (551 unități minore, 1 recenzie, nota 5) → daily 211/212 (3 misiuni, 1 recompensă, 100 XP) → XP 213 (200,5 XP, nivel 2, 3 intrări, dubluri refuzate) → export 133 (5 851 unități) și 215 (13 362 unități) → restart cu aceleași amprente XP/daily/KPI/flotă. În plus, `--browser` a rulat aceleași 104 verificări în Chromium 156, cu documentele scrise în IndexedDB și re-citite după reload: 8/8 comparații de restart, 0 erori de pagină.

Verificări executate și rezultat: `npm run typecheck` PASS (exit 0); `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS; `npm run check:architecture` PASS (356 fișiere TypeScript); `npm run check:parameter-catalog` PASS; `npm test` 2 647 teste, 2 647 trecute, 0 eșuate, 86 903 ms; testele țintă `tests/e2e/e2e-session.test.ts` 6/6; `npm run e2e:session` overall PASS; `npm run e2e:session -- --check` raportează JSON și Markdown curente; `npm run e2e:session -- --browser` PASS în Chromium 156 cu 0 erori de pagină.

Fișiere și documente actualizate: `tests/e2e/{session-support,session-world,session-e2e,e2e-session.test}.ts`, `scripts/run-e2e-session-report.mjs`, `tests/browser/session-e2e/{index.html,main.ts}`, `package.json` (`e2e:session`, ultima intrare), `Docs/18-validare-si-release.md`, `Docs/Evidence/152-e2e-session/{README.md,report.json,report.md,browser.json,browser-session.png}`. `src/` nu a fost modificat.

Limitări sau follow-up: nivel determinist în Node, fără GPU/renderer/input uman; fizica nativă este dublul contorizat al testelor 068, iar browserul real este o probă separată care nu măsoară frame-ul. Segmentele 005 au boundary real fără eșantioane de telemetrie. Misiunea de campanie creditată este settlement-ul real 116/125 al fixture-ului, nu o misiune jucată în harta sesiunii. Exportul 133 nu publică telemetrie brută, iar bundle-ul 215 nu conține starea lumii (206); profilul flotei este dovedit prin versiunea activă și histograme. Playtestul vizual și frame-ul rămân gate-urilor 153/220/224/235.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '152' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-12: Implementat și verificat: `tests/e2e/`, raport determinist `e2e:session`, probă reală în Chromium; 11 pași, 104 verificări PASS; mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
