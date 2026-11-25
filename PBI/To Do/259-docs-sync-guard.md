---
id: "259"
title: "Gardă de sincronizare pentru documentația de stare și board"
status: "To Do"
release: "V1"
module: "Documentație"
depends_on: []
owner: null
started_at: null
completed_at: null
---

# 259 Gardă de sincronizare pentru documentația de stare și board

## Obiectiv

Un check executabil care eșuează atunci când documentația curentă, indexul PBI, matricea de acoperire și boardul nu mai descriu aceeași stare.

## Starea actuală și ce lipsește

- README-ul rădăcină și Docs/README conțin încă numere și afirmații din generația 001–258.
- Nu există un check care să compare numărul de taskuri, etapele, titlurile și dependențele din PBI/README cu fișierele reale.
- Docs/21 și noul Docs/31 pot rămâne în urmă fără ca cineva să observe.
- Manualul și documentele de release pot descrie funcții care nu sunt montate în joc.
- Linkurile locale din Docs și PBI nu sunt verificate într-o singură comandă de proiect.
- Nu există o regulă clară pentru ID-urile retrase 001–258 și pentru ID-urile noi 259+.

## Context și plan

- [Validare și release](../../Docs/18-validare-si-release.md)
- [Contracte de performanță](../../Docs/25-performanta-contracte-si-benchmark.md)
- [Politica de validare](../../Docs/validation-policy.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- Niciuna.

## Criterii de acceptare

- [ ] O comandă `npm run docs:check` verifică boardul, PBI/README, Docs/21, Docs/31, counturile din README și Docs/README și linkurile locale.
- [ ] `npm run docs:check -- --check` nu scrie nimic și iese cu cod 1 cu un mesaj care numește fișierul și câmpul divergent.
- [ ] Checkul este inclus în `npm run check` și în configurația loop-pbi, fără a executa comenzi nerevizuite.
- [ ] Un task nou sau mutat fără actualizarea indexului produce eșec, nu un raport verde.
- [ ] Documentația explică explicit că 001–258 sunt istorice și că boardul curent începe la 259.

## Verificare

- `npm run docs:check` și `npm run docs:check -- --check`.
- `bun "<skill>/scripts/loop-pbi.ts" validate --root . --allow-project-commands`.
- Test negativ: modifică un titlu în PBI/README fără să modifici fișierul și confirmă eșecul.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '259'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
