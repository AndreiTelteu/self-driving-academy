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

- 2026-10-07T21:57:00+03:00 : SOURCE produs040 review handoff: 11cai noi (src/world/service-zones.ts, src/app/service-zones.ts, 7+4+2teste pure, 2cazuri native, collector/proof/reader browser, Docs/service-zones.md); world = poligon întreg + coridor coliniar dirijat, app compune contracte publice fără edit pe calea de succes a fizicii și împrumută portul030; 16pure+2native draft neexecutate; before184/profilCIM/raw20 neschimbate.

- 2026-10-07T22:17:00+03:00 : răspuns review02 040 închide două contracte la SOURCE: coridorul cere heading exact atan2(dz,dx) al regiunii coliniare dirijate (fără toleranță unghiulară sau shortcut pozitiv), iar envelope-ul orizontal e exact cuboid(.85,.3,2) cu geometria reală de roți (max(.85,track/2+r), max(2,wheelbase/2+r)); 9world+5app+2after-proof=16 pure + 2 native, toate neexecutate; 6cai noi schimbate.

- 2026-10-07T22:29:23+03:00 : product-scoped-checks-01 PASS: 16teste, 14cai(sursa9d5ef89f), terminalul FAILED anterior(5060c342) păstrat; primul eșec 08-pure = aserțiune greșită pe respingerea032 deja existentă a poligonului degenerat, reparată fără schimbare de produs; baseline8/before184 neschimbate; nativ neexecutat. Barrelul world/index.ts are deja linia aditivă; lipsesc numai nativAFTER + browserAFTER.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.
