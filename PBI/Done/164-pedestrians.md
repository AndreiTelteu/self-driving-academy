---
id: "164"
title: "Pietoni autonomi și traversări"
status: "Done"
release: "V2"
module: "Extindere V2"
depends_on: ["163","039","022"]
owner: "loop-pbi/pedestrians-164-01"
started_at: "2026-11-12T16:58:17+02:00"
completed_at: "2026-11-12T17:32:37+02:00"
---

# 164 Pietoni autonomi și traversări

## Obiectiv

Adaugă pietoni cu deplasare pe trotuar și traversări cu conflict.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 163 trebuie să existe în Done înainte de începere.
- PBI 039 trebuie să existe în Done înainte de începere.
- PBI 022 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Pietonii au ID, stare și oportunități de cedare reale.
- [x] Coliziunile și opririle pot fi inspectate fără denominatoare fictive.

## Verificare

Rulează trecere liberă, pieton prezent și conflict cu vehicul.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `164-pedestrians-v1` din `src/world/pedestrians.ts` livrează pietoni ca
entități reale, cu ID stabil derivat din sesiune, epocă, hartă, trecere și slot, și cu un vocabular
închis de stare `ON_SIDEWALK → WAITING → CROSSING → CROSSED → WITHDRAWN`. Tranzițiile sunt o tabelă
explicită, fiecare schimbare emite un eveniment `STATE_CHANGED` cu motiv închis, iar retragerea are
motiv `ROUTE_COMPLETE` sau `IMPACT`; nu există respawn sau dispariție fără urmă. Traseul este derivat
din geometria reală: axa de traversare este perpendiculara pe banda de referință măsurată din linia
de trecere 039, capetele sunt proiecțiile poligonului trecerii, iar apropierea este ancorată în banda
`SIDEWALK` a layout-ului 042. Pe harta reală rezultă 80 de treceri, 48 de legături de pietoni (32 de
treceri de margine nu au trotuar derivat și sunt refuzate cu `NO_SIDEWALK`, raportat ca lacună),
96 de pietoni în configurația implicită și traversări de 10,00–17,40 m. Traversarea cu conflict:
pietonul evaluează vehiculele observabile, așteaptă cât timp timpul până la linie este sub timpul de
eliberare plus marjă, apoi se angajează (`ASSERTED`) după `patienceTicks`; conflictul poartă distanța
semnată până la linie, viteza, timpul până la conflict și timpul de traversare rămas, iar un vehicul
care frânează în timpul traversării produce o oprire reală și conflictul devine `YIELDED`. Numărătorile
sunt evenimente reale: fiecare traversare finalizată intră exact într-o clasă (`FREE`, `YIELDED`,
`WITHOUT_YIELD`, `UNOBSERVED`), suma claselor este egală cu traversările finalizate, iar rata de
cedare are ca numitor doar traversările cu acoperire completă și conflict observat; când numitorul
lipsește, valoarea este `null` cu status `MISSING` și lacună declarată (`NO_COMPLETE_CONFLICT_EPISODE`,
`INCOMPLETE_VEHICLE_COVERAGE`, `REFUSED_CROSSWALK_LINK`, `MISSING_CROSSING_LINE`,
`PEDESTRIAN_CAPACITY_TRUNCATED`, `NO_CROSSWALK`). Contactele sunt fapte autoritare ale proprietarului
coliziunilor: sunt validate, înregistrate cu starea de la impact și retrag pietonul cu `IMPACT`, fără
ca traversarea întreruptă să fie numărată ca finalizată. Scenariile rulează trecere liberă (48/48
finalizate, zero conflicte, rată `MISSING`), conflict cu cedare (oprire reală la 7,20 m în timpul
traversării, `YIELDED`), conflict fără cedare (distanță minimă 0,10 m, zero opriri), contact autoritar
(1 contact, 1 traversare întreruptă), acoperire incompletă (45 traversări neobservate, zero „libere”)
și densitatea implicită (96 de pietoni).

Verificări executate și rezultat: `npm run typecheck` PASS (exit 0); `npm run lint` PASS (0 erori, 0
warning-uri); `npm run format:check` PASS („All matched files use Prettier code style!”);
`npm run check:architecture` PASS (367 fișiere TypeScript, probe negative 6+4+3, lifecycle);
`npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` 2924 teste,
2924 trecute, 0 eșuate, 0 sărite, 93 720 ms; `node --import ./scripts/register-typescript.mjs --test
"tests/world/pedestrians.test.ts"` 15 teste, 15 trecute; `npm run pedestrians:report` 6/6 scenarii
PASS, 336 traversări pornite, 323 finalizate, 276 libere, 1 cu cedare, 1 fără cedare, 45 neobservate,
4 conflicte, 1 oprire (în timpul traversării), 1 contact, determinism identic (SHA-256
`aee3db57b40c8b3e480506dee567cf7d6b86928517f8b67dae9e279706322ff8`), overall PASS; `npm run
pedestrians:report -- --check` „Pedestrian report is current” + „Pedestrian markdown is current”.
Dovezile complete sunt în [Evidence/164-pedestrians](../../Docs/Evidence/164-pedestrians/README.md).

Fișiere și documente actualizate: `src/world/pedestrians.ts` (nou, contractul), `src/world/index.ts`
(export public), `tests/world/pedestrians-fixture.ts`, `tests/world/pedestrians-suite.ts`,
`tests/world/pedestrians.test.ts` (noi), `scripts/run-pedestrian-report.mjs` (nou), `package.json`
(intrarea `pedestrians:report`, ultima din blocul `scripts`), `Docs/20-extensii-si-mers-pe-jos.md`
(secțiunea „Pietoni autonomi și traversări (PBI 164)”), `Docs/Evidence/164-pedestrians/{README.md,
report.json,report.md}` (noi).

Limitări sau follow-up: validare deterministă în Node, fără browser, GPU, fizică live sau input uman;
mișcarea vehiculelor este scriptată de fixture, iar playtestul vizual rămâne al gate-urilor de release.
Contactele sunt fapte autoritare ale proprietarului coliziunilor — modulul nu detectează fizic
impactul. Trotuarul este banda derivată de layout-ul 042, iar apropierea este un segment drept, nu un
graf de trotuare. Cele 32 de treceri de la marginea hărții nu au trotuar derivat și rămân fără
pietoni, raportate ca lacună. Pragurile (viteză de mers, răbdare, marjă) sunt seedate și raportate
per pieton, nu calibrate pentru gameplay. Costul raportat este structural, nu o măsurare de FPS sau
hardware (PBI-ul nu are `performance_checks`).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '164' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare începută în worktree-ul `pedestrians-164-01` (owner `loop-pbi/pedestrians-164-01`).
- 2026-11-12: Contract `164-pedestrians-v1` livrat cu pietoni, traversări cu conflict, inspecție fără
  numitori ficși, 6 scenarii deterministe și 15 teste; toate verificările au trecut, fișierul este mutat
  fizic în `PBI/Done`.
