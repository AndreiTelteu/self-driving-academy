---
id: "045"
title: "Mașina de stări comportamentale"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["044","005","219"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium behavior-fsm-01"
started_at: "2026-10-05T19:19:24.423Z"
completed_at: "2026-10-05T19:55:39.992Z"
---

# 045 Mașina de stări comportamentale

## Obiectiv

Definește stările de autonomie și prioritățile tranzițiilor.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Stările follow, stop, yield, change lane, service și blocked sunt explicite.
- [x] Fiecare decizie produce un reason code verificabil.

- [x] Deciziile periodice sunt distribuite determinist prin 219; evenimentele urgente și inputul nu sunt amânate până la slotul de 10 Hz.

## Verificare

Testează tranziții concurente și lipsă de context valid.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: FSM cu șase stări și reason codes, proiecție compactă044 și fapte explicite versionate de politică; priorități deterministe, autoritate/tick/incarnare/epoch fenced, integrare cu portul219 periodic și urgent. Maximum110actori/decizii curente și1024identități, fără istoric de decizii, admitere atomică și cleanup.

Verificări executate și rezultat: 42teste țintite, inclusiv9FSM; npm run check pe main:438/438 PASS, type/lint/format/architecture PASS (Docs/Evidence/045-behavior-fsm/checks-main-global.txt). BEFORE-v2 pre-algoritm20lumi native source4b6c6f16ca4be56e39ced100648b603fa7d5c1ad5de9887ec156a4b502b22bf7; AFTER20lumi sourcea1434f683a9e8aeb161262460c330bd3a0dded96bf938f7d0aae59ae03be8dba. Toate stările, digests fizice/input/decizii și cleanup verificat. 70vehicule: median p95 tick2.9631→3.1818ms, toate5AFTER sub5.5ms;110overload:4.9536→5.5096ms separat. Zero perechi cu regresie confirmată >10% și >1ms în ambele populații. Cost mediu suplimentar proiecție+FSM0.0195–0.0212ms/decizie; nu este p95. Ownership plafonat și zero după fiecare lume,20cicluri110actori în teste.

node Docs/Evidence/045-behavior-fsm/verify-after.mjs --historical: PASS byte-exact pentru arhivele BEFORE/AFTER și native Rapier SHA02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0. Copia nativă a fost arhivată după rulări, cu timestamp real și bytes identici digests înregistrate, fără antedatare. Verificarea strict-current trece în checkoutul de captură, dar eșuează pe main numai pentru EOL al Docs/performance-budgets.json. Verificarea separată verify-integration.mjs: PASS115GitINDEX blobs identici arhivei,114fișiere current byte-exact, un singur EOL-only CRLF/LF; toate115normalizate identic. Nu declarăm strict-current byte PASS pe main. Verifierul preproducție cu condiția absenței045 este păstrat și nu este relansat după implementare.

Fișiere și documente actualizate: src/autonomy/behavior-fsm.ts și index.ts, tests/autonomy/behavior-fsm*, scripts/benchmark-behavior-fsm.mjs, Docs/behavior-fsm.md, Docs/06-autonomie-si-trafic.md, Docs/README.md și arhive/verifiere/rapoarte/loguri Docs/Evidence/045-behavior-fsm. Commit implementare b3aee901849cf7173738f3ffb004c2d46473c536.

Limitări sau follow-up: Contract timpuriu de decizie, fără criteriu vizual/driving; faptele sintetice de politică sunt separate de comenzile fizice fixe ale benchmarkului. Baseline inițial offroad păstrat, insuficient pentru timing normal, înlocuit cronologic înaintea producției de BEFORE-v2. Contoarele ownership nu reprezintă heap exact. Manevrele046–049, flota/FPS hardware, laptopul și jocul complet nu sunt validate și nu moștenesc probele hardware219. Instantaneele returnate și păstrate de apelant rămân ownership al apelantului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '045' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05: BEFORE-v2 pre-algoritm verificat independent:20lumi70/110,114surse și native byte-exact, toate6stările pe contexte044 valide, ON/OFF determinist, cleanupzero; source4b6c6f16ca4be56e39ced100648b603fa7d5c1ad5de9887ec156a4b502b22bf7. Baselineoffroad inițial păstrat, insuficient pentru normalpolicytiming. Extins memory înaintea algoritmului pentru110stări/tombstones plafonate, fără istoric; verificările AFTER/hardware încă lipsesc.

- 2026-10-05: Integrare main verificată438teste,20lumi AFTER,115GitINDEX/archive și EOL-only audit PASS; mutat fizic în Done. Validate-Board -RequireDone045 și Validate-Plan rulează după mutare.
