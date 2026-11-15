---
id: "237"
title: "Virarea walker-ului în partea scurtă și simetrică"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["236"]
performance_checks: ["simulation"]
owner: "orchestrator/loop-pbi"
started_at: "2026-11-15T18:06:10+02:00"
completed_at: "2026-11-15T18:16:40+02:00"
---

# 237 Virarea walker-ului în partea scurtă și simetrică

## Obiectiv

Repară `turnToward` din walker-ul 192: diferența unghiulară era calculată cu `%`, care în JavaScript
păstrează semnul, așa că o țintă aflată „în spate" producea o diferență de −3π/2 și walker-ul vira în
partea lungă, până la o rotație completă. Simptomul jucabil: la schimbarea direcției, personajul se
întorcea în partea greșită, iar în compunerea 236 virajul părea că revine spre poziția inițială.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie contractul de mers
(191–200) și compunerea în browser (236). Walker-ul 192 deține poziția autoritară, iar `turnToward`
este singurul loc care apropie yaw-ul de țintă. Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 236 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Diferența unghiulară este cea mai scurtă, cu semnul corect, pentru orice pereche de unghiuri, inclusiv când ținta diferă printr-o rotație completă (2π).
- [x] Virajul este simetric: aceeași comandă la stânga și la dreapta produce rotații egale în modul, din taste reale, în compunerea 236.

## Verificare

Teste deterministe pe walker-ul real (fără browser) pentru cazurile de wrap (−π/π, 2π, unghiuri mici)
și un test de compunere care apasă `A` și `D` din portul de input real și compară yaw-ul după 30 de
tick-uri. Rulează `npm test` integral și păstrează rezultatul exact.

## Dovezi de finalizare

Rezultat implementare: `turnToward` din `src/character/walker.ts` calculează acum diferența unghiulară cu `Math.atan2(Math.sin(d), Math.cos(d))`, care întoarce întotdeauna diferența cea mai scurtă în `(−π, π]`, cu semnul corect, și apropie cu `currentYaw + delta` în loc de `targetYaw`, ca o țintă aflată la un multiplu de `2π` să nu mai producă o rotație completă. Formula veche (modulo, care în JavaScript păstrează semnul) dădea `−3π/2` pentru o țintă la `−π` și vira în partea lungă; simptomul jucabil era oscilația la virajul dreapta din compunerea 236.

Criteriul 1 — `PASS`. Diferența este cea mai scurtă pentru orice pereche de unghiuri, inclusiv când ținta diferă printr-o rotație completă: `tests/character/walker-turn.test.ts` acoperă ținta la `−π`, ținta la `0`, simetria celor două și cazul în care yaw-ul a ajuns deja la `π` și nu mai trebuie să sară la `−π` (60 și 61 de tick-uri). Testele au dinți: rulate pe formula veche dau **1/4**, pe cea reparată **4/4**.

Criteriul 2 — `PASS`. `tests/character/walking-composition.test.ts` apasă `steerRight` și `steerLeft` prin portul real de input al compunerii timp de 30 de tick-uri: yaw-ul crește cu peste 1 rad la dreapta, scade cu peste 1 rad la stânga, iar cele două rotații sunt egale în modul la `1e-9`. Deci reparația se vede din comanda jucătorului, nu doar din apelul direct al walker-ului.

Verificări executate și rezultat: `node --import ./scripts/register-typescript.mjs --test tests/character/walker-turn.test.ts` 4/4 pass; `"tests/character/*.test.ts"` 117/117 pass; `npm test` **3428 teste, 3428 trecute, 0 eșuate**; `npm run typecheck` exit 0; `npm run lint` exit 0, 0 warnings; `npm run format:check` PASS; `pwsh ./PBI/Validate-Board.ps1 -RequireDone '237'` `Valid: true`. Dovezile 216 și 163 au fost regenerate în același commit, pentru că graful de board are acum 237 de noduri, iar 163 încorporează checksum-ul raportului 216.

Fișiere și documente actualizate: `src/character/walker.ts` (reparația), `tests/character/walker-turn.test.ts` (nou), `tests/character/walking-composition.test.ts` (test de taste reale `A`/`D`), `Docs/Evidence/237-walker-turn/README.md` (nou), `Docs/20` (secțiune nouă), `Docs/Evidence/216-v1-regression/report.{json,md}` și `Docs/Evidence/163-v2-contexts/report.{json,md}` (regenerate), `PBI/README.md`, `README.md`, `Docs/README.md` și `PBI/Validate-Plan.ps1` (PBI 237 devine poarta de închidere a liniei V3).

Limitări sau follow-up: reparația schimbă doar regula de apropiere unghiulară — rata de viraj, coliziunea și pașii rămân neschimbați; testul de compunere rulează headless, deci proba vizuală a virajului rămâne cea din browserul lui 236; o modificare separată de layout a canvasului (coloana până la `min(1500px, 96vw)`, canvas `min(70vh, 780px)`) a fost propusă în timpul verificării dar **nu** este inclusă aici, ca PBI-ul să rămână strict despre viraj.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '237' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-15: PBI creat după 236, dintr-un defect real observat la jucarea compunerii în browser (virajul pornea în partea lungă a cercului).
- 2026-11-15: Reparat și verificat. `atan2` pentru diferența cea mai scurtă, `currentYaw + delta` în loc de `targetYaw`; 4 teste noi pe walker și unul pe tastele reale, 3428/3428 teste, formula veche pică 3 din 4. Mutat fizic în Done.
