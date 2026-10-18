---
id: "048"
title: "Urmărirea liderului și distanțe"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["047","044"]
parameter_role: "policy"
performance_checks: ["simulation", "memory"]
parameter_keys: ["following_time_headway","following_min_gap","queue_standstill_gap","following_speed_gain"]
owner: "Codex gpt-6.1-sol medium following-048"
started_at: "2026-10-12T07:48:24.613Z"
completed_at: "2026-10-12T12:58:54.447Z"
---

# 048 Urmărirea liderului și distanțe

## Obiectiv

Aplică headway, minimum gap, queue gap și following speed gain.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 047 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Ținta de distanță depinde de viteză și de profil.
- [x] Un lider schimbat sau dispărut nu lasă o țintă invalidă.

## Verificare

Nivel declarat înainte de producție: targeted-validation-v1. Baseline cronologic pe fixture044/045/046/047/024 cu Rapier real, apoi aceeași probă locală pentru70/110evaluări, trei perechi observer OFF/ON (180warmup/600samples), serial pe CPU. Se măsoară separat costul politicii048 și resursele bounded; nu se certifică FPS sau gate-ul jocului integrat. Integrarea fizică și browser scurt verifică viteze variate, coadă, leader switch/disappearance și cleanup. Nu sunt modificate mecanica, schedulerul ori bugetele. Regresia >10% și >1ms în2/3perechi sau >10% și >5MiB escaladează la full; eșecurile rămân păstrate.

Rulează viteze variate, coadă oprită și schimbare de lider.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Politica stateless048 aplică cele patru chei, snapshot044 actual, compilare bounded/provenance, formulă SI cu orizont tehnic1s și țintă046 consumată de047/024. Profilul, authority, scope/epoch, incarnation și sourceTick sunt legate explicit. Fără cache de lider/istoric ori corecție ascunsă de siguranță. Comparația full pentru sursa curentă PASS; implementarea este mutată fizic în Done.

Verificări executate și rezultat: Ultima modificare de provenance are36teste048/046/044 PASS, typecheck și scoped lint PASS. Native-driving-v3 și browser-v6 verifică sursa lor exactă,600ticks fizice/clasă, scalar/held-target/identity/native contact/cleanup, scratch zero. Parent check-v2:736PASS și build-v2 PASS. Full-before-v1 este acceptat; full-after-v1 și full-after-v2 au fiecare5/5confirmări de regresie >10% AND1ms, cu celelalte porți integrity/raw/parity/cleanup/power/deadlines/budgets absolute PASS. Capturile și eșecurile rămân păstrate. Noua optimizare păstrează validarea completă a inputurilor publice și folosește numai proveniența slabă a rezultatelor044/046 imuabile autentice. Diagnostic103→65descriptor captures/evaluare nu constituie acceptare. Modificarea sursei comune044/046 cere un BEFORE nou: full-before-v4/full-after-v4 au common overlays identice, runner neschimbat și provenance origine explicită. Preflight-before-v2/after-v3 PASS tehnic. Full-before-v2/full-after-v3 PASS cu0/5confirmări, p95 BEFORE3.3236/3.3295/3.2644/3.2532/3.2424ms și AFTER3.7305/3.7996/3.6935/3.7279/3.7175ms; deltas0.4069/0.4701/0.4291/0.4747/0.4751ms. Integrity/origin/common closure/raw/native/deadline/power/parity/checkpoints/cleanup/bugete absolute și hashurile întregii producții actuale PASS. Summary full-comparison-summary-v3.json; following SHA c14c21d6bb8b38017eb7b29da3805502f3e514b5fcf89568ca3bb2d53715cb07. Native-driving-v4 --current PASS,29scratch slots/zero reținut. Browser-v7 manual --current PASS, run740cae8d-6830-42a2-a755-8e5d29d00498 și cleanup904e2f8a-0cec-4d41-8ab5-d7365adb4a4d. Parent check-v3:737PASS/build-v3 PASS. Toate procesele proprii sunt închise. Dovezi/comenzi: [index048](../../Docs/Evidence/048-following/README.md).

Fișiere/documente: following policy/export/registry,047 reason/helper,048 fixtures/oracol/teste/readere/adaptoare native/browser, contracte/dovezi. Ultima integrare044 adaugă WeakSet pentru outputuri engine autentice;046 adaugă WeakMap target→context admis. Fără count fals pentru containere weak neenumerabile, fără target/actor/time cache ori schimbare a schemei046. Părintele deține verificările integrate, board și Git.

Limitări: Nicio acceptare FPS/flotă/full memory/hardware release; workload local un corp Rapier și70/110evaluări, nu70/110vehicule. Gap044 folosește radii circulare1.2m. Contactele reale sunt instrumentate: sedan4741.5995Ns/47ticks și compact3940.2532Ns/45ticks; liderii ating2.2182/1.8834m/s. Preferința2m se încheie cu gap≈1.63m și contact, fără garanție exactă ori contact-free. Baseline comparabil retrospectiv explicit. Praguri/eșecuri/workload nu sunt relaxate.110 rămâne diagnostic istoric, fără certificare de overload pentru sursa nouă. Criteriile și checklistul sunt verificate; completed_at reflectă mutarea fizică.
## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '048' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-12: Implementare048 și verificări izolate/native; FAIL comparativ targeted cere full, browser FAIL/refuz UI împiedică acceptarea. Capturile istorice rămân păstrate; task-ul rămâne fizic In Progress.


- 2026-10-12: Sursa finală verificată: 737 teste/build, native-driving-v4 și browser-v7 PASS, full local 5 perechi PASS (zero confirmări). Mutare fizică în Done; loopul se oprește după livrarea 048 la cererea utilizatorului.
