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

- [x] Zonele sunt accesibile din graf și au condiții explicite.
- [x] Punctele de recuperare sunt validate împotriva obstacolelor.

## Verificare

Arhivează baseline-ul catalogului/grafului și al query-ului030 înaintea algoritmului040; raportează separat construcția, costul query-ului explicit și ownership-ul finit. Nu introduce polling per tick, cache de obstacole sau teleport implicit. Compară aceeași probă disponibilă conform Docs/25, păstrând pragurile și limitele de acceptare ale fixture-ului timpuriu.

Testează zonă accesibilă, inaccesibilă și ocupată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Produsul 040 este livrat în worktree-ul `service-zones-01` (branch `loop-pbi/service-zones-01` la 0853a4d): `src/world/service-zones.ts` (catalog din poligon întreg și coridor coliniar dirijat, cu condiții explicite), `src/app/service-zones.ts` (compune contracte publice world/vehicles/sessions și împrumută portul 030 fără a elibera resurse străine), export aditiv în `src/world/index.ts`, teste world/app/native/after-proof, collector și reader browser, `Docs/service-zones.md`.

Verificări executate și rezultat: Pe această mașină (Ryzen 7 7735U, win32 10.0.26300), cu node v24.21.0 din `.node-version`, `npm ci` din lock-ul pinuit (neschimbat) și Rapier nativ byte-identic cu `02dc6a4e…`, la HEAD 0853a4d:
- `node --import ./scripts/register-typescript.mjs --test-concurrency=1 --test tests/world/service-zones.test.ts tests/app/service-zones.test.ts tests/world/service-zones-after-proof.test.mjs` → EXIT0, 16/16 pass, 0 fail (1850,4 ms).
- `node --import ./scripts/register-typescript.mjs --test-concurrency=1 --test tests/app/service-zones-native.test.ts` → EXIT0, 2/2 pass (sedan și compact, Rapier real), 1957,5 ms.
Dovezi: `Docs/Evidence/040-service-zones/correctness-current-01/` (loguri și `result.json`). Baseline-ul `before-01` (sourceHash `13224224…`) rămâne neatins.

Fișiere și documente actualizate: `Docs/service-zones.md`; `Docs/Evidence/040-service-zones/product-source-handoff-01.md`, `product-source-review-response-02.md`, `product-scoped-checks-01/`, `correctness-current-01/`; acest fișier PBI (criterii bifate, istoric).

Limitări sau follow-up: Proba de performanță AFTER NU este acceptată pe această mașină. Re-baseline-ul a fost încercat efectiv și a fost respins de propriul gate: captura BEFORE de referință (aceleași 20 de lumi) a picat la normal70 p95 6,91–7,15 ms > 5,5 ms și stress110 p95 8,62–9,35 ms, față de 3,3928–3,6239 ms și 4,3900–4,5332 ms pe AMD Ryzen 9 7950X3D. Captura eșuată este păstrată ca `Docs/Evidence/040-service-zones/before-02-mobile-failed-01` (sourceHash `d9d2fdc9…`, cpu Ryzen 7 7735U, runtime v24.21.0). Cauză suplimentară de mediu: laptop pe baterie 27%, plan Balanced, ~2,7 GHz fără boost. Deci gate-ul absolut de 5,5 ms nu este atins nici de referința pre-040 aici, iar compararea pe alt hardware este interzisă de Docs/25. Acceptarea de performanță rămâne pe mașina de baseline sau, de retestat, pe AC cu plan High performance. Proba browser pe ambele backenduri rămâne de asemenea neexecutată.

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

- 2026-10-18T15:42:28+03:00 : Probe de corectitudine re-executate pe o a doua mașină (Ryzen 7 7735U/win3210.0.26300), node24.21.0 din.node-version și npmci din lock-ul pinuit (neschimbat), Rapier nativ hash02dc6a4e byte-identic, HEAD0853a4d: 16/16pure + 2/2nativ (sedan/compact, Rapier real) EXIT0; dovezi correctness-current-01, before-01 neatins. Criteriile funcționale 040 sunt bifate. Proba AFTER de performanță rămâne NEEXECUTATĂ: baseline-ul e pe Ryzen97950X3D/win3210.0.26200/rootF:, iar collectorul pinuit asumă F: și rg (lipsă); comparația hardware relativă se reia pe mașina de baseline sau printr-o re-baseline explicită. PBI rămâne In Progress.

- 2026-10-18T16:12:00+03:00 : Re-baseline încercat pe această mașină și RESPINS de propriul gate: BEFORE de referință (aceleași20lumi) a picat la normal70p95 6.91–7.15ms>5.5 și stress110p95 8.62–9.35ms, față de3.3928–3.6239/4.3900–4.5332 pe Ryzen97950X3D; captura e păstrată ca before-02-mobile-failed-01(sursad9d2fdc9/cpu Ryzen77735U/runtime24.21.0). Cauză de mediu suplimentară: laptop pe baterie27%, planBalanced, ~2.7GHz fără boost. Concluzie executată: gate-ul absolut5.5ms nu e atins nici de referința pre-040 aici, deci o re-baseline pe această mașină nu poate produce un BEFORE acceptabil; acceptarea de performanță rămâne pe mașina de baseline sau pe AC+High performance (de retestat). Căile absoluteF: din harness-urile executabile au fost corectate la root-ul real (102fișiere în main+3worktree-uri; arhiveleDocs/Evidence neatinse) și rg15.2.0 instalat. PBI rămâne In Progress.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.
