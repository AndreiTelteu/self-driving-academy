---
id: "261"
title: "Sesiuni Academie și Haos, schimbare, reset și recuperare"
status: "In Progress"
release: "V1"
module: "Sesiuni"
depends_on: ["260"]
performance_checks: ["frame","simulation"]
owner: "loop-pbi/deepseek-261"
started_at: "2026-11-26T01:01:55.924Z"
completed_at: null
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

- [ ] Meniul oferă Academie și Haos; fiecare are propriul checkpoint, ledger și profil de lucru.
- [ ] Schimbarea sesiunii închide segmentul, comite checkpointul, anulează joburile lumii vechi și pornește în pauză/AUTO.
- [ ] O salvare eșuată păstrează lumea curentă și nu avansează epoca.
- [ ] Resetul păstrează stilul, XP, daily-ul și recompensele deja acordate; nu creează finalizări artificiale.
- [ ] Un rezultat târziu din altă sesiune este refuzat cu motiv închis.
- [ ] Douăzeci de tranziții repetate nu lasă lumi, joburi sau listeners orfane.

## Verificare

- Teste de contract pentru tranziții, salvare eșuată, reset și job târziu.
- Probă în browser: Academie → Haos → Academie cu checkpoint și reluare.
- Verifică `sessionId`, `worldEpoch`, `learningEpoch` și amprenta XP/KPI înainte/după.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '261'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
