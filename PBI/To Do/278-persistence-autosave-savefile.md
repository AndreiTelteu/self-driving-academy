---
id: "278"
title: "Persistență live: autosave, checkpoint, savefile și recuperare"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["260","266","276"]
performance_checks: ["storage","frame"]
owner: null
started_at: null
completed_at: null
---

# 278 Persistență live: autosave, checkpoint, savefile și recuperare

## Obiectiv

Sesiunea, profilul, economia, daily-ul, XP-ul și decorul se salvează coerent și se pot exporta/importa cu checksum, preview și confirmare.

## Starea actuală și ce lipsește

- Nu există autosave sau checkpoint periodic în shell.
- Nu există meniu „Salvează jocul în fișier” / „Încarcă jocul din fișier”.
- Nu există reluare după reload în pauză/AUTO, cu segment incomplet.
- Nu există preview, confirmare și înlocuire atomică a sesiunii.
- Nu există includerea companiei, daily-ului, XP-ului și profilului în același checkpoint.
- Nu există probă de browser pentru export, import și al doilea import fără duplicate.

## Context și plan

- [Salvare și import/export](../../Docs/15-salvare-si-import-export.md)
- [Savefile și integritate](../../Docs/29-savefile-si-integritate.md)
- [Contracte de performanță](../../Docs/25-performanta-contracte-si-benchmark.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 266 trebuie să fie Done înainte de începere.
- 276 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Autosave-ul comite o generație coerentă și raportează separat timpul simulat de timpul salvării.
- [ ] Reload-ul pornește în pauză/AUTO, cu segmentul anterior marcat incomplet și fără venit offline.
- [ ] Exportul produce un fișier cu checksum; importul cere preview și confirmare înainte de înlocuire.
- [ ] Un import invalid sau un checksum greșit păstrează sesiunea curentă.
- [ ] Al doilea import nu dublează XP, recompensele daily sau revenue-ul.
- [ ] Compania, daily-ul, XP-ul și profilul se restaurează împreună, nu parțial.

## Verificare

- Teste pentru checksum, preview, import invalid, dublu import și rollback.
- Probă în browser: export, reload, import, verifică XP/KPI/companie.
- Verifică bugetul de bytes și timpul de commit.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '278'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
