---
id: "040"
title: "Zone de pickup dropoff și puncte valide"
status: "In Progress"
release: "V1"
module: "Oraș"
depends_on: ["033","030"]
performance_checks: ["loading", "simulation", "memory"]
owner: "Codex gpt-6.1-sol medium service-zones-01"
started_at: "2026-10-07T17:51:56.143Z"
completed_at: null
---

# 040 Zone de pickup dropoff și puncte valide

## Obiectiv

Definește accesul și spațiul pentru opriri de serviciu și recuperări.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 033 trebuie să existe în Done înainte de începere.
- PBI 030 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Zonele sunt accesibile din graf și au condiții explicite.
- [ ] Punctele de recuperare sunt validate împotriva obstacolelor.

## Verificare

Arhivează baseline-ul catalogului/grafului și al query-ului030 înaintea algoritmului040; raportează separat construcția, costul query-ului explicit și ownership-ul finit. Nu introduce polling per tick, cache de obstacole sau teleport implicit. Compară aceeași probă disponibilă conform Docs/25, păstrând pragurile și limitele de acceptare ale fixture-ului timpuriu.

Testează zonă accesibilă, inaccesibilă și ocupată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '040' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-07T21:38:12.7502422+03:00: BEFORE cronologic acceptat după captură20lumi și cititori CURRENT/HISTORICAL EXIT0, source13224224/native02dc;2600queryreadonly/paritate/cleanupzero. Normal70p953.3928–3.6239ms;110stress4.3900–4.5332ms. ProfilCIM arhivat înainte de first-world. Static7/7/BOTHtypes/lint/format/syntaxPASS; primele erori păstrate. SOURCE produs autorizat; AFTER/browser/performance-relative neexecutate, fără Done. Dovezi în checkoutservice-zones-01/Docs/Evidence/040-service-zones.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.
