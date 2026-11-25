---
id: "285"
title: "Decor destructibil, feedback audio și replay în joc"
status: "To Do"
release: "V1"
module: "Haos"
depends_on: ["282","283"]
performance_checks: ["simulation","assets","memory","frame"]
owner: null
started_at: null
completed_at: null
---

# 285 Decor destructibil, feedback audio și replay în joc

## Obiectiv

Obiectele ușoare se mișcă sau se rup la impact, feedbackul vizual/audio este clar, iar replay-ul reconstituie evenimentele fără a inventa scor.

## Starea actuală și ce lipsește

- Decorul destructibil 227 nu este conectat la compunerea live.
- Nu există impact, fragmente, sunet sau reset al decorului.
- Nu există audio de motor, coliziune, frânare sau mediu în joc.
- Nu există replay pentru distrugeri și reseturi.
- Nu există plafoane pentru fragmente, voci și obiecte.
- Nu există o probă vizuală/audio pentru distrugere și reset.

## Context și plan

- [Joacă liberă, Haos și distrugere](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [Asseturi vizual și audio](../../Docs/16-asseturi-vizual-si-audio.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 282 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Gardurile, conurile, lăzile și mobilierul ușor se mișcă sau se rup la impact; clădirile și drumul rămân structurale.
- [ ] Feedbackul vizual și audio este legat de material și intensitate, cu alternativă vizuală.
- [ ] Fragmentele, vocile și obiectele au plafoane și sunt eliberate după durata de viață.
- [ ] Replay-ul păstrează evenimentele și reseturile în ordine, fără reevaluare de politică sau recompense.
- [ ] Resetul readuce decorul la starea inițială și nu atinge XP-ul sau profilul.
- [ ] Costul de simulare, memorie și asseturi este raportat.

## Verificare

- Teste pentru material, prag, deduplicare, replay și reset.
- Probă în browser: impact, sunet, fragmente, reset.
- Verifică plafoanele și cleanup-ul.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '285'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
