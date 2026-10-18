---
id: "047"
title: "Control longitudinal accelerație și frânare"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["046","024"]
performance_checks: ["simulation","memory"]
parameter_role: "policy"
parameter_keys: ["desired_acceleration","comfort_deceleration","acceleration_jerk","brake_reaction_delay"]
owner: "Codex gpt-6.1-sol medium longitudinal-control-047"
started_at: "2026-10-12T00:40:04.582Z"
completed_at: "2026-10-12T10:10:04.1061809+03:00"
---

# 047 Control longitudinal accelerație și frânare

## Obiectiv

Aplică accelerația dorită, frânarea confortabilă, jerk și reacția la frână.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 046 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Controllerul produce comenzi comune și păstrează semnul/unitățile.
- [x] Frânarea poate fi insuficientă într-un profil riscant fără instabilitate numerică.

## Verificare

Testează oprire normală și reacție întârziată la obstacol.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Controller longitudinal 60 Hz cu profile compilate opace, semn/unități SI și comenzi comune 024. Cele patru chei 047 sunt implementate; frânarea riscantă întârziată/insuficientă păstrează starea finită. Admiterea actorilor, lifecycle-ul, cache-ul imuabil și buffer-ele private sunt bounded și validate atomic.

Verificări executate și rezultat: npm run check PASS 728/728 (Node 24.21.0/npm 11.19.0), typecheck/lint/format/architecture PASS; npm run build PASS. Cititori independenți native-driving-v3 și browser-build-v3 --current PASS; opt episoade native și patru episoade WebGPU. Comparația extinsă full-after-v4 vs full-before-v2 PASS: 5 perechi fiecare 70/110, 30 s warmup și 120 s măsurare; normal p95 7,5932–7,7927 ms, 0/5 confirmări relative normal, 2/5 overload sub pragul 3/5. Surse/native/alimentare/date brute/paritate/cleanup/throughput PASS. Teste MJS independente 6/6 PASS. Loguri și capturi: ../../Docs/Evidence/047-longitudinal-control/README.md.

Fișiere și documente actualizate: src/autonomy/longitudinal-control.ts și export, registry runtime și testele sale, testele/scenariile/fixtures 047, adaptoare și cititori de evidență, Docs/longitudinal-control.md, Docs/parameter-registry.md, Docs/06-autonomie-si-trafic.md, Docs/README.md și dovezile arhivate.

Limitări sau follow-up: Fixture local nativ și playtest AUTO scriptat; nu certifică FPS, input uman sau gate-ul jocului integrat. BEFORE extins este retrospectiv din sursele preproducție înghețate, baseline-ul cronologic și toate eșecurile rămân intacte. Targeted after-v8 rămâne FAIL overload; escaladarea este rezolvată separat prin full-after-v4 PASS. 048 perception/planner și braking_jerk rămân în afara scope-ului. Memoria totală JS/WASM, thermals și allocatorul nu sunt măsurate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '047' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

## Plan de validare înainte de implementare

Nivel targeted-validation-v1: corectitudine izolată, cost local nativ BEFORE/AFTER și integrare browser scurtă pentru oprire normală și reacție întârziată la obstacol. Se adaugă politica longitudinală peste comenzile 024; engine-ul fizic, dt, solverul, rendererul și schedulerul rămân conform contractelor existente. Se măsoară separat costul controllerului și ownership-ul bounded, cu workload normal 70 și overload 110, trei perechi comparabile. Baseline-ul precede codul de producție; regresiile și depășirile se investighează conform politicii, fără înlocuirea baseline-ului. Proba locală nu certifică FPS sau gate-ul jocului integrat.

### Escaladare după AFTER-v1

AFTER-v1 păstrează toate datele și FAIL-ul cititorului: p95 normal 8,6824 / 7,4478 / 6,9702 ms față de BEFORE 5,8258 / 5,5706 / 5,8619 ms. Trei din trei perechi depășesc simultan 10% și 1 ms, iar prima depășește plafonul local de 8 ms. Se optimizează strict admiterea repetată a țintelor imuabile, fără modificarea mecanicii sau a bugetelor, și se capturează un AFTER nou. Escaladarea rămâne obligatorie: comparație nativă extinsă pe workload normal 70, cinci perechi OFF/ON, fiecare cu 30 s warmup și 120 s măsurare reală la 60 Hz. Intrările fizice sunt fixe și costul CPU exclude așteptarea; probele nu certifică FPS. Referința extinsă folosește sursele preproducție înghețate din BEFORE-v1, cu protocol comun nou, etichetată explicit retrospectiv, fără înlocuirea baseline-ului cronologic. Overload 110 rămâne probă targeted separată de gate-ul normal. Preflight-ul și cititorul independent trebuie să treacă înainte de probele extinse.

Instrumentarea offline a comparației extinse are ownership separat și finit: trei canale de 7.200 Float64, 172.800 bytes ON și zero OFF. Sunt păstrate toate observațiile; serializarea se face în afara intervalelor cronometrate. Capacitatea diagnosticSamples=4.096 și manifestul existent rămân nemodificate; aceasta nu este o afirmație despre memoria totală JS/WASM sau collectorul jocului.

AFTER-v2 păstrează un nou FAIL: normal p95 6,2514 / 8,0389 / 6,8548 ms, cu o depășire absolută și o confirmare relativă; overload 110 are două confirmări relative. Costul propriu 047 scade aproximativ la jumătate după cache. Se optimizează cititorul schemelor fixe, păstrând validarea integrală. Comparația extinsă va include și workload-ul 110, în cinci perechi pentru fiecare workload și implementare; pragul absolut normal nu este aplicat overload-ului. Nu se înlocuiește baseline-ul și nu se modifică bugetele.

### Comparația extinsă fixture-v2

FULL BEFORE-v2 a trecut cititorul strict: 20 probe / 10 perechi, p95 normal 7,5716 / 7,0732 / 6,9206 / 7,0524 / 6,9350 ms. FULL AFTER-v2 rămâne FAIL: p95 normal 8,2451 / 8,4505 / 8,2989 / 8,4142 / 8,2753 ms, confirmări relative 4/5 normal și 5/5 overload. Cititorul agregat păstrează FAIL și verifică separat toate cele 40 de probe: surse/native, alimentare, date brute, checkpoints, cleanup și egalitatea traseelor fizice. Baseline-ul cronologic și toate tentativele sunt păstrate. Se investighează și optimizează strict alocările temporare și validarea repetată; pragurile și mecanica nu se modifică. PBI-ul rămâne In Progress.

### Închiderea validării

Comparația extinsă finală full-after-v4 trece toate pragurile nemodificate, cu sursele finale after-v8 și aceiași 79 de inputs comuni ca full-before-v2. FULL after-v2/v3 rămân eșecuri păstrate; optimizările revizuite reduc alocările și citirea repetată, fără schimbarea mecanicii. Probe finale native/browser, 728 teste și build PASS. Validatoarele board/plan și dovada exactă a octeților publicați sunt rulate după mutarea fizică, înainte de commit/push.
