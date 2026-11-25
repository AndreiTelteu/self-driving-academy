---
id: "269"
title: "Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri"
status: "To Do"
release: "V1"
module: "Companie"
depends_on: ["268"]
performance_checks: ["simulation"]
owner: null
started_at: null
completed_at: null
---

# 269 Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri

## Obiectiv

Profitul reinvestit crește nivelul companiei și permite achiziții/upgrade-uri cu cost, efect și stare explicite, fără a atinge XP-ul.

## Starea actuală și ce lipsește

- Nu există praguri de nivel de companie sau valoare de companie.
- Nu există achiziție de vehicule noi în flotă și nici capacitate de flotă.
- Nu există upgrade-uri cu efecte măsurabile și versionate.
- Nu există refuz pentru fonduri insuficiente sau upgrade deja deținut.
- Nu există persistență pentru nivel, achiziții și upgrade-uri.
- Nu există o regulă care să împiedice un upgrade să modifice ascuns stilul învățat.

## Context și plan

- [Companie: profit și evoluție](../../Docs/32-companie-profit-si-evolutie.md)
- [Misiuni și progres](../../Docs/13-misiuni-si-progres.md)
- [Misiuni zilnice și XP](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 268 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Nivelul companiei este o funcție monotonă de profitul reinvestit, separat de nivelul XP.
- [ ] O achiziție adaugă un vehicul real în flotă, cu cost scăzut din cash și slot respectat.
- [ ] Un upgrade are cost, efect declarat și versionat; efectul este vizibil în perioada următoare.
- [ ] Cash-ul nu poate deveni negativ; o achiziție refuzată nu schimbă nimic.
- [ ] Nivelul companiei, achizițiile și upgrade-urile se salvează și se restaurează.
- [ ] Un upgrade nu produce o versiune de profil fără o cale explicită și nu atinge XP-ul.

## Verificare

- Teste pentru praguri, cash insuficient, upgrade duplicat și efectul din perioada următoare.
- Scenariu de achiziție urmat de reload și de import de sesiune.
- Verifică independența față de XP și profilul de driving.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '269'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
