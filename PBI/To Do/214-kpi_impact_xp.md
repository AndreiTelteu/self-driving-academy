---
id: "214"
title: "Feedbackul consecințelor fără pierdere XP"
status: "To Do"
release: "V1"
module: "Progres"
depends_on: ["213","209","073"]
performance_checks: ["ui", "frame"]
owner: null
started_at: null
completed_at: null
---

# 214 Feedbackul consecințelor fără pierdere XP

## Obiectiv

Arată consecințele comerciale ale MANUAL/LEARNING și verifică invarianta că XP/nivelul nu scad prin gameplay. Nu implementează evaluare contrafactuală sau worker pentru penalizare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 213 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Revenue/ratings și reviews reflectă incidentele reale; feedbackul scurt arată efectele fără mesaje de pierdere XP.
- [ ] Scăderea unuia sau ambilor KPI, accidentele și eșecul/refuzul obiectivelor nu debitează XP și nu coboară nivelul.
- [ ] PlayerProgress/ledger acceptă numai credite nenegative; nicio cale AUTO/MANUAL/LEARNING nu lansează evaluări negative sau joburi contrafactuale.
- [ ] UI separă rezultatul misiunii, fidelitatea stilului și consecințele de serviciu; reset/import de profil nu resetează XP.
- [ ] Actualizarea HUD este plafonată, fără reconstruirea istoricului pe frame.

## Verificare

Testează revenue↑/rating↓, inversul, ambele↓, impact MANUAL/LEARNING/AUTO, reward duplicat și restore de profil. Păstrează soldul/nivelul înainte și după, inclusiv feedbackul vizual.


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

Verificare finală: Validate-Board.ps1 -RequireDone '214'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 elimină pierderea XP și evaluatorul A/B; ID-ul/fișierul rămân stabile, scope-ul este feedback și regresie, status To Do.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
