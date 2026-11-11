---
id: "140"
title: "Snapshot complet pentru experiment"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["138","139","136","206"]
owner: "loop-pbi/experiment-140-01"
started_at: "2026-11-11T21:21:47+02:00"
completed_at: "2026-11-11T21:34:58+02:00"
---

# 140 Snapshot complet pentru experiment

## Obiectiv

Folosește SessionCheckpoint complet pentru experiment: fizică, memorie FSM/controller, oportunități, RNG, semnale, vehicule și dispecer; izolează ledger-ele live.

## Context și plan

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 138 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Snapshotul poate fi validat și încărcat la același tick.
- [x] Compatibilitatea engine/physics/map este verificată.

## Verificare

Compară starea înainte și după roundtrip.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/experiments/experiment-snapshot.ts` (contract `140-experiment-snapshot-v1`) și `src/experiments/experiment-ledger-isolation.ts` (`140-experiment-ledger-isolation-v1`). Experimentul consumă exact documentul 206 prin porturi injectate (`captureWorldSnapshot`, `readWorldSnapshot`, `decodeWorldCheckpoint`), fără un al doilea format și fără un al doilea envelope. Snapshotul de 70 de vehicule are 64 378 bytes și checksum-ul determinist `c5a0738c…d24d8bcb5`. Roundtrip-ul compară 287 de intrări de secțiune și 3 080 de câmpuri frunză (poziții, rotații, viteze, FSM, memoria controllerului, oportunități, cursorii fiecărui stream RNG, semnale, joburi pending și rezultate acceptate, pasageri) cu 0 diferențe. Încărcarea are `tick: 60`, `expectedTick: 60`, `ticksAdvanced: 0`; un alt tick este refuzat cu `TICK_MISMATCH`. Compatibilitatea este refuzată pe câmp: `ENGINE_VERSION_MISMATCH`, `PHYSICS_BACKEND_MISMATCH`, `MAP_VERSION_MISMATCH`. Ledger-ele 093/125/137 sunt izolate structural (handle fără mutator, `write` → `REFUSED`/`LIVE_LEDGER_READ_ONLY`) și comportamental (scrierea în copie este `ACCEPTED_IN_COPY` cu `appliedToLive: false`, amprentele `SHA-256` rămân identice, `liveWrites: 0`, iar o probă de control scrie în KPI și schimbă doar amprenta KPI). Lumea restaurată rulează încă 60 de tickuri identic cu originalul (digest `c1347393…643f8a6a`).

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 erori, 0 warning-uri); `npm run format:check` PASS; `npm run check:architecture` PASS (345 fișiere TypeScript, toate probele negative trec); `npm run check:parameter-catalog` PASS; `npm test` 2 501 teste, 2 501 trecute, 0 eșuate, 0 sărite (65,4 s); testul țintă `tests/experiments/experiment-snapshot.test.ts` 9/9 trecute; `npm run experiment:snapshot` 43/43 verificări, 7 probe de refuz, PASS; `npm run experiment:snapshot -- --check` raportează raportul curent.

Fișiere și documente actualizate: `src/experiments/experiment-snapshot.ts`, `src/experiments/experiment-ledger-isolation.ts`, `src/experiments/index.ts`, `tests/experiments/experiment-snapshot-fixture.ts`, `tests/experiments/experiment-snapshot.test.ts`, `tests/experiments/experiment-snapshot-report.ts`, `scripts/run-experiment-snapshot-report.mjs`, `package.json` (intrarea `experiment:snapshot`, ultima din bloc), `Docs/14-experimente-si-indicatori.md` (secțiunea contractului) și `Docs/Evidence/140-experiment-snapshot/` (`README.md`, `report.json`, `report.md`).

Limitări sau follow-up: porturile 206 sunt injectate de compoziție (teste și raport); `src/app` nu face parte din ownership-ul acestui PBI, iar politica de arhitectură interzice unui modul de domeniu să importe adaptorul de persistență. Nu există un store propriu pentru experiment: documentul rămâne cel al lui 206, în `checkpoints`. Validarea este funcțional izolată, fără browser, GPU sau măsurători de cost; nu se pretinde identitate bit cu bit între browsere sau GPU-uri. Amprenta KPI exclude contorul `snapshotCalls` al read model-ului 137. Proba de continuare rulează simularea deterministă a fixture-ului 206, nu pipeline-ul complet Babylon.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '140' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-11: Implementat contractul `140-experiment-snapshot-v1` și izolarea `140-experiment-ledger-isolation-v1`; roundtrip 287 intrări / 3 080 câmpuri cu 0 diferențe, 43/43 verificări în raportul determinist și 2 501/2 501 teste. Mutat în Done.
