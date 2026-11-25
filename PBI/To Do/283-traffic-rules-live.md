---
id: "283"
title: "Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi"
status: "To Do"
release: "V1"
module: "Trafic"
depends_on: ["260","262","282"]
performance_checks: ["simulation","frame"]
owner: null
started_at: null
completed_at: null
---

# 283 Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi

## Obiectiv

Semaforii, STOP-ul, prioritatea, yield-ul, schimbările de bandă și recuperarea din blocaj funcționează în lumea live pentru AI, iar încălcările jucătorului sunt observabile.

## Starea actuală și ce lipsește

- `civil-traffic` trimite `signals: []` și `completeness.signals: false`; niciun vehicul nu oprește la roșu.
- Semnele STOP sunt decorative, nu reguli de intersecție.
- Nu există prioritate, yield, conflict de intersecție sau blocaj de rețea în joc.
- Nu există schimbări de bandă, depășiri sau cooldown în traficul live.
- Nu există încălcări observabile pentru jucător și nici consecințe în review.
- Nu există o probă de browser cu roșu, STOP și conflict.

## Context și plan

- [Autonomie și trafic](../../Docs/06-autonomie-si-trafic.md)
- [Semaforare](../../Docs/signals.md)
- [Politica STOP](../../Docs/stop-policy.md)
- [Regulile STOP](../../Docs/stop-rules.md)
- [Prioritate](../../Docs/priority-rules.md)
- [Yield](../../Docs/yield-policy.md)
- [Schimbarea benzii](../../Docs/lane-change-policy.md)
- [Blocaj și reintrare](../../Docs/blocked-recovery.md)
- [Conflictele intersecțiilor](../../Docs/intersection-conflicts.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 262 trebuie să fie Done înainte de începere.
- 282 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Un controller de semafoare avansează fazele la tick și toate vehiculele live respectă culoarea.
- [ ] STOP-ul distinge oprirea completă, rolling stop-ul și linia de oprire; o oprire din trafic nu este încălcare.
- [ ] Prioritatea și yield-ul folosesc regulile hărții și observațiile reale, nu textura sau ordinea de randare.
- [ ] Schimbarea de bandă cere gap față/spate, avantaj și cooldown; blocajul produce recuperare explicită.
- [ ] Încălcările jucătorului devin evenimente observabile pentru review/metrici, fără dovezi fabricate.
- [ ] Traficul rămâne fluent, iar costul este raportat separat.

## Verificare

- Probe pe intersecții reale cu roșu/verde, STOP, yield și blocaj.
- Probă în browser: AI oprește la roșu, jucătorul trece pe roșu și consecința apare.
- Verifică absența deadlock-urilor și costul pe tick.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '283'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
