---
id: "261"
title: "Sesiuni Academie și Haos, schimbare, reset și recuperare"
status: "Done"
release: "V1"
module: "Sesiuni"
depends_on: ["260"]
performance_checks: ["frame","simulation"]
owner: "loop-pbi/deepseek-261"
started_at: "2026-11-26T01:01:55.924Z"
completed_at: "2026-11-26T01:57:00.754Z"
---

# 261 Sesiuni Academie și Haos, schimbare, reset și recuperare

## Obiectiv

Jucătorul alege Academie sau Haos, fiecare sesiune are checkpoint și ledger separat, iar schimbarea sau resetul păstrează exact ce declară contractul.

## Starea actuală și ce lipsește

- Nu există meniu de alegere a sesiunii; `sessionId`, `playerId` și `profileId` sunt fixe în compunere.
- Nu există checkpoint propriu pentru Academie și Haos, nici izolarea daily/XP/KPI.
- Nu există „Oraș proaspăt, păstrează stilul” sau reset cu `worldEpoch`/`learningEpoch` nou.
- Nu există recuperare după salvare eșuată și nici reluare în pauză/AUTO.
- Nu există anularea joburilor lumii părăsite sau verificarea identității rezultatelor târzii.
- Nu există o probă de browser pentru două sesiuni și două checkpointuri.

## Context și plan

- [Joacă liberă, Haos și distrugere](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [Salvare și import/export](../../Docs/15-salvare-si-import-export.md)
- [Savefile și integritate](../../Docs/29-savefile-si-integritate.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Meniul oferă Academie și Haos; fiecare are propriul checkpoint, ledger și profil de lucru.
- [x] Schimbarea sesiunii închide segmentul, comite checkpointul, anulează joburile lumii vechi și pornește în pauză/AUTO.
- [x] O salvare eșuată păstrează lumea curentă și nu avansează epoca.
- [x] Resetul păstrează stilul, XP, daily-ul și recompensele deja acordate; nu creează finalizări artificiale.
- [x] Un rezultat târziu din altă sesiune este refuzat cu motiv închis.
- [x] Douăzeci de tranziții repetate nu lasă lumi, joburi sau listeners orfane.

## Verificare

- Teste de contract pentru tranziții, salvare eșuată, reset și job târziu.
- Probă în browser: Academie → Haos → Academie cu checkpoint și reluare.
- Verifică `sessionId`, `worldEpoch`, `learningEpoch` și amprenta XP/KPI înainte/după.

## Dovezi de finalizare

Rezultat implementare: `src/app/session-flow.ts` (`261-session-flow-v1`) compune host-ul și poarta de izolare 225 peste shell-ul 260. Meniul oferă Academie și Haos cu identități, profiluri, checkpointuri și ledger-e separate. Schimbarea suspendă shell-ul, capturează lumea, comite un checkpoint, anulează joburile vechi și pornește `PAUSED_AUTO`. Resetul comite `SCENARIO_RESET` înainte de a avansa `worldEpoch`/`learningEpoch`, păstrează stilul/XP/daily/recompensele/KPI și nu inventează finalizări sau recompense. O salvare eșuată păstrează lumea și epocile. Rezultatele târzii sunt refuzate prin identitatea 225. Shell-ul adoptă contextul numai la limita tick-ului.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (450 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check` — PASS. Teste țintă `tests/app/session-flow.test.ts` 9/9, `tests/app/game-shell.test.ts` 8/8 și `tests/ui/game-shell-host.test.ts` 5/5 — 22/22 PASS. `npm test` în worktree-ul copilului: 3.567 pass, 0 fail, 14 skip-uri istorice. `npm run session:probe` PASS pe WebGL2 și WebGPU (Chrome 157, Playwright 1.55): Academie → reset (epoch 1→2, learning 0→1) → Haos → Academie (epoch 3, learning 2, 2 checkpointuri), port `sessions` PRESENT, o singură lume, `PAUSED` după fiecare tranziție, 0 erori de pagină/consolă.

Fișiere și documente actualizate: `src/app/session-flow.ts`, `src/app/game-shell.ts`, `src/main.ts`, `src/app/index.ts`, `src/ui/game-shell-host.ts`, `src/persistence/session-kinds.ts`, `tests/app/session-flow.test.ts`, `tests/app/game-shell.test.ts`, `tests/ui/game-shell-host.test.ts`, `scripts/run-session-flow-probe.mjs`, `package.json`, `Docs/26`, `Docs/31`, `Docs/game-shell.md`, `Docs/README.md`, `README.md`, `Docs/Evidence/261-session-flow/`.

Limitări sau follow-up: Checkpointul live folosește store-ul determinist în memorie al 225; adaptarea IndexedDB durabilă rămâne 278. Rehidratarea fizică completă a scenei nu este pretinsă: `restore` adoptă checkpointul și pornește `PAUSED_AUTO`, iar compunerea V3 este readusă la spawn, nu restaurată din snapshot. Segmentele și joburile live nu există încă (271/272), deci portul raportează 0 închideri/anulări în producție; contractul este dovedit cu duble deterministe, iar 271/272 vor cabla proprietarii reali. Trafficul și decorul destructibil rămân 262/285. `npm run session:probe` a rulat în worktree-ul copilului; în părinte Playwright nu este instalat, deci dovada măsurată a fost păstrată, nu simulată.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '261'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-261`; integrat, verificat și mutat în Done.
