---
id: "233"
title: "Interfață reluare recorduri și recompense pentru provocări"
status: "Done"
release: "V1"
module: "Misiuni și interfață"
depends_on: ["232","211","212","213","126","073","225"]
performance_checks: ["ui", "storage", "frame"]
owner: "loop-pbi/challenge-xp-233-01"
started_at: "2026-11-12T05:08:36+02:00"
completed_at: "2026-11-12T05:37:40+02:00"
---

# 233 Interfață reluare recorduri și recompense pentru provocări

## Obiectiv

Oferă reacții comice, reluare rapidă, recorduri personale și varietate daily cu credite idempotente.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)
- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 232 trebuie să existe în Done înainte de începere.
- PBI 211 trebuie să existe în Done înainte de începere.
- PBI 212 trebuie să existe în Done înainte de începere.
- PBI 213 trebuie să existe în Done înainte de începere.
- PBI 126 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 225 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Oferta discretă și rezultatul arată premise/obiectiv/reward; Acceptă/Refuză/Mai încearcă/Continuă condusul sunt accesibile și nu cer grafice.
- [x] Meniul rejucabil păstrează provocările descoperite/recordurile; încercarea are identitate nouă și nu dublează recompensa.
- [x] Academie aplică rewardKey per familie/data daily; Haos are doar scor local, iar replay/rerun/import de profil nu acordă XP.
- [x] Daily rămâne exact trei cu cel puțin unul MANUAL; integrarea catalogului adaugă familii variate fără obiective destructibile Haos obligatorii.
- [x] Decline/eșec/reset/zile ratate nu scad XP, iar recordurile/deduplicarea/calendarul supraviețuiesc reload și sunt izolate per sesiune.

## Verificare

Playtest pe fiecare familie, retentarea voluntară și repetiții; testează limite de zi, reward dublu, reset/reload, Haos și viewport mic.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/challenge-experience.ts` livrează `233-challenge-experience-v1` cu credit XP idempotent prin `PlayerProgress.creditMission` (identitate `challenge-reward(family, dailyDate)`, un singur ledger 213), recorduri personale versionate pe `(templateId, templateVersion)` cu rang lexicografic care nu scade niciodată la egalitate sau rezultat mai slab, reluare rapidă prin `232 restart` pentru o provocare eșuată (identitate nouă, aceeași identitate de recompensă), varietate daily deterministă peste catalogul 231 și reacții comice derivate din replicile autorate 231 plus replici închise pentru refuz/expirare/anulare. `src/ui/challenge-panel.ts` + `src/ui/challenge-panel-format.ts` livrează panoul `233-challenge-panel-v1`: proiecție read-only, buton nativ, focus mutat și readus, `Tab` în dialog, `Escape`, zero listeners globali, o citire per deschidere/refresh și nicio cale per tick.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (363 fișiere TypeScript); `npm run check:parameter-catalog` sincronizat; testele țintă 31/31 pass; `npm test` 2 751/2 751 pass, 0 fail, 91,2 s; `npm run missions:challenge-experience` → `SUMMARY checks 55/55, overall PASS`; `--check` raportează raportul curent. Numerele reale: 7 cereri de credit (2 credite de 80 XP, 1 duplicat, 4 refuzuri fără XP), recorduri `FIRST_RECORD/WORSE/EQUAL/BETTER` cu best `300,300,300,120`, reluare `attempt 2` cu identitate nouă și 80 XP apoi `FAMILY_REWARDED_TODAY`, 5 zile daily × 3 provocări cu familii variate și minimum un MANUAL, punte 211 cu 3 șabloane expresabile și 9 deschise, snapshot 1 116 bytes.

Fișiere și documente actualizate: `src/missions/challenge-experience.ts` (nou), `src/missions/index.ts` (exporturi la final), `src/ui/challenge-panel.ts` (nou), `src/ui/challenge-panel-format.ts` (nou), `src/ui/index.ts` (exporturi la final), `tests/missions/challenge-experience-fixture.ts`, `tests/missions/challenge-experience.test.ts`, `tests/missions/challenge-experience-report.ts`, `tests/missions/challenge-experience-report.test.ts`, `tests/ui/challenge-panel-fixture.ts`, `tests/ui/challenge-panel.test.ts`, `scripts/run-challenge-experience-report.mjs`, `package.json` (`missions:challenge-experience`), `Docs/28-provocari-random-si-revenire.md` (secțiune nouă), `Docs/Evidence/233-challenge-experience/README.md` + `report.json` + `report.md`.

Limitări sau follow-up: reluarea imediată este definită pentru eșec; după un succes, 232 închide instanța `COMPLETED` și refuză `RESTART`, deci „Mai încearcă" este dezactivat cu motivul afișat, iar o nouă încercare vine din următoarea ofertă a directorului. Panoul nu este montat în shell-ul aplicației (compunerea din `src/app` nu aparține PBI-ului, ca la 126/210). Creditul folosește calendarul explicit al terminalului, ca în 211. Măsurarea de frame este `NOT_MEASURED_DEV`, iar playtestul de retenție rămâne la 235.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '233'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: Implementare începută pe `loop-pbi/challenge-xp-233-01` (owner setat, fișier mutat în In Progress).
- 2026-11-12: Livrate creditul idempotent prin ledgerul 213, recordurile versionate, reluarea rapidă, varietatea daily, reacțiile comice, panoul read-only, raportul determinist și dovezile; toate verificările obligatorii au trecut. Fișier mutat fizic în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
