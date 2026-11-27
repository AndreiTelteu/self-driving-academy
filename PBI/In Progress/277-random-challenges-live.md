---
id: "277"
title: "Provocările random, directorul, panoul și reluarea în joc"
status: "In Progress"
release: "V1"
module: "Misiuni"
depends_on: ["260","265","271"]
performance_checks: ["simulation","ui"]
owner: "loop-pbi/deepseek-277"
started_at: "2026-11-27T15:41:59.041Z"
completed_at: null
---

# 277 Provocările random, directorul, panoul și reluarea în joc

## Obiectiv

Directorul oferă provocări fezabile, jucătorul acceptă/refuză fără penalizare, iar rezultatul, recordul și reluarea sunt vizibile.

## Starea actuală și ce lipsește

- Nu există oferte live, cooldown sau o singură instanță activă.
- Nu există rezervarea taxiului și nici refuzul când există pasager.
- Nu există evaluatori live pentru checkpoint, zonă, confort, parcare, drift, distrugere sau learning.
- Nu există panou de provocări, accept/refuz, „Mai încearcă” sau „Continuă condusul”.
- Nu există recompense idempotente și nici separarea Haos/Academie.
- Nu există o probă de browser cu o provocare completă și una refuzată.

## Context și plan

- [Provocări random și revenire](../../Docs/28-provocari-random-si-revenire.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Joacă liberă, Haos și distrugere](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Există cel mult o ofertă vizibilă și o instanță activă; cooldown-ul și deadline-ul sunt reale.
- [ ] O ofertă infezabilă este refuzată înainte de afișare; refuzul nu penalizează.
- [ ] Acceptarea rezervă taxiul și nu întrerupe un pasager existent.
- [ ] Obiectivul este evaluat din fapte reale; un evaluator lipsă dezactivează șablonul, nu inventează succes.
- [ ] Panoul arată oferta, obiectivul, deadline-ul, recompensa, recordul și acțiunile.
- [ ] Haos acordă numai record local, iar Academia respectă politica XP/zi.

## Verificare

- Teste pentru cooldown, ofertă infezabilă, accept/refuz și duplicat.
- Probă în browser: o provocare de precizie și una de distrugere.
- Verifică recordurile și recompensele după reload.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '277'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
