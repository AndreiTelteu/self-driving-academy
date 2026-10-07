---
id: "052"
title: "Politica de prioritate și gap acceptat"
status: "In Progress"
release: "V1"
module: "Autonomie"
depends_on: ["045","038"]
performance_checks: ["simulation", "memory"]
parameter_role: "policy"
parameter_keys: ["yield_time_gap"]
owner: "Codex gpt-6.1-sol medium yield-policy-01"
started_at: "2026-10-05T19:57:50.574Z"
completed_at: null
---

# 052 Politica de prioritate și gap acceptat

## Obiectiv

Aplică yield time gap în conflictele eligibile.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 045 trebuie să existe în Done înainte de începere.
- PBI 038 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Praguri diferite schimbă momentul traversării.
- [ ] Încălcările și coliziunile rămân posibile când stilul este riscant.

## Verificare

Compară gap-uri acceptate și refuzate în scenarii controlate.

Arhivează baseline înaintea algoritmului, apoi aceeași probă AFTER conform Docs/25-performanta-contracte-si-benchmark.md și manifestului203; raportează separat costul nou și ownership-ul plafonat. Criteriile de traversare și coliziune necesită fizică reală și probe browser, fără corector ascuns al profilului riscant și fără FPS hardware dedus din Node.

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

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '052' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-06: Runtime-ul publicat029/ad32db9 a fost integrat numai în worktree-ul052 (ddc35dc). Două teste pure și unica probă native AFTER-main029 au trecut: source0091ea29, 34 lumi, paritate exactă cu BEFORE original, cleanup zero; normal70 p95 maxim2.039ms sub5.5ms, regresii comune0/5 pentru70 și110. Verifierul strict a trecut și independent în parent. Coliziunea compactă22m rămâne raportată pentru ambele praguri. Build-ul browser v2 distinct5206 este autorizat; acceptarea browser rămâne neexecutată, PBI rămâne In Progress.

- 2026-10-06: Unicul build browser-v2 source9992f05e/artifact44b7912d/ZIPa232b19c a trecut strict BUILD_ONLY și verificarea independentă. AUTO SMOKE a salvat terminalul WebGPU; WEBGL2 SMOKE a eșuat12:27:35Z la observed simulation/wall ratio, după9 brațe salvate și rawparts pentru brațul9. failure/rejected și toate datele rămân imuabile; proba completă nu a pornit. Se investighează cauza fără relaxarea pragului0.98 ori relansare identică. Viewportul temporar Chrome a fost restaurat.

- 2026-10-06: Varianta distinctă v3 a trecut build/scoped3teste și BUILD_ONLY independent (sourcef4a11b93/artifactecf4ee13/ZIP96e8a27b). AUTO SMOKE a eșuat din nou la braț9:180tickuri,275intervaleRAF/3069.5ms, ratio .977358. Metadata wx este acum completă, inclusiv cleanupnative/backendzero;9brațe complete, fără WEBGL2 sau FULL. Review independent confirmă nepotrivirea ferestrelor:20.1ms înainte de limita warm și49.4ms după capătul nominal intră în numitorul RAF; lipsesc timestampurile native active, deci nu se poate deduce un PASS corectat. Originalele v2/v3 rămân FAIL. Se proiectează doar în surse o variantă v4 cu timestampuri native reale și contoare native la ambele capete RAF, prag0.98 pentru ambele ceasuri și toate intervalele/bugetele frame/debt păstrate. Nicio relansare sau relaxare a gate-ului.

- 2026-10-06: Protocolul browser v4 distinct a trecut review-ul independent și 11/11 teste pure adverse, typecheck, lint, format și 4 verificări de sintaxă. Conține ceasul efectiv al citirii contoarelor, cronologia fazei native, RAF final real și salvarea parțială INCOMPLETE. Testul transportului a păstrat 132 părți ordonate și a respins overflow-ul fără acceptarea probei incomplete. Primele erori structurale sunt arhivate; source710b7af6 pentru cele 11 fișiere verificate. Toate intrările și ZIP-urile v2/v3/native rămân byte-identice. Aceste rezultate nu sunt probe hardware; build-ul v4 și browserul rămân neexecutate.

- 2026-10-06: Build-ul v4 source273ead91/artifactbbb5ce53/ZIPfc1d1216 (88 intrări sursă, 142 artefacte, 233 intrări ZIP) a trecut strict și independent în parent după corectarea launcherului cu loaderul existent; primul ERR_MODULE_NOT_FOUND este păstrat. AUTO SMOKE a eșuat13:29:14.639Z la comparația RAF/readclock în braț1, după braț0 salvat: 1872 eșantioane, trei diferențe -2.3843313e-8ms, nativephase1.000962/matchedRAF.998695, cleanupzero. Originalul rămâne FAIL (failureSHA8aa5d958, submitted1SHA7c04ba0d). Fără WEBGL2/FULL; viewport restaurat. Review-ul independent confirmă o corecție de validare numerică distinctă v5, cu collectorul v4 byte-exact, allowance-ul existent1e-6ms numai între reprezentările RAF/readclock; cronologia aceluiași ceas și toate gate-urile rămân neschimbate. Nicio acceptare hardware dedusă retroactiv.

- 2026-10-06: V5 a trecut 8/8 teste pure, verificările scoped și BUILD_ONLY independent (source81e52111/artifact8bae3733/ZIP571ca6ad,90 intrări). AUTO SMOKE a eșuat13:44:20.535Z după12 brațe complete, la REFERENCE pereche4 warmtick6: Simulation overload debt after RAF before render >250ms. Ultimul RAF bun94228.6ms; native186/tick6 și cleanupzero. RAF-ul declanșator și datoria exactă nu au fost păstrate, deci durata și cauza întârzierii rămân necunoscute. Captura ef455e62 și failureSHAe29a5a37 rămân imuabile; fără WEBGL2/FULL, viewport restaurat. V6 adaugă numai diagnostic bounded în surse, fără modificarea mecanicii sau gate-urilor. Review-ul a corectat root-ul Vite înainte de orice build; testele/build-ul V6 și probele hardware sunt încă neexecutate.

- 2026-10-06: Diagnosticul V6 a trecut5/5 teste pure și scoped checks, păstrând primul TS6133; build-ul unic source42c5e047/artifactb9e052ac/ZIPc4f6116f a trecut independent89 surse/142 artefacte/234 intrări ZIP. AUTO și WEBGL2 SMOKE au salvat fiecare14 brațe; verifierul suplimentar strict BOTH a trecut în parent cu performanceAcceptance=false/hardwareFullAcceptance=false. Capturi4ce31f84 și604fb471; toate gate-urile și failure-urile istorice sunt păstrate, viewport restaurat. Probele complete rămân neexecutate, fără mutare în Done.

- 2026-10-06: Proba completă AUTO V6 a pornit efectiv14:08:09.508Z, captura0760154a-973b-4a07-9b53-07494e6f98fd, după confirmarea actuală a utilizatorului pentru26minute în prim-plan. Monitorul delegat T3 r1 urmărește numai această probă, cu wake automat și deadline14:43:15Z; toate celelalte execuții CPU/native/build sunt oprite. Niciun PASS/FULL ori Done nu este încă declarat.

- 2026-10-06: Proba completă AUTO V6 a eșuat14:10:07.870Z în REFERENCE braț4, tick3801 (2001tickuri măsurate/3204frame-uri). Diagnosticul păstrează waitStart599198.2ms, callbackRead600856.8ms, debt1657.2ms și contoarele native3981/controller3801 neschimbate în așteptare. Cleanupnative/renderer/backendzero; viewport restaurat, fără terminal/report/PASS. Captura0760154a și raw-ul rămân imuabile. Cauza întârzierii RAF rămâne necunoscută; se inspectează probele, fără relansare identică sau relaxarea gate-urilor. CPU este eliberat pentru verificările scoped068.

- 2026-10-06: Diagnostic RAF separat, nu acceptare de performanță, pregătit5215 după8/8teste pure/type/lint/sintaxă/format. DTO24000waits maximal15952213B/16MiB; original30000oversizeFAIL păstrat, nicio pierdere ascunsă raw. Build unicsource2ab43394/artifact2e637296/ZIP419ef24882surse141artefacte strict BUILD_ONLY PASS. V2–V6 surse/capturi originale hash-exact; browserRun așteaptă confirmarea fizică a prim-planului.

- 2026-10-06: Diagnosticul separat AUTO4912b69e și WEBGL2f741ebce a încheiat3faze×40s/backend,17279/17282waits și2400tickuri native. Parentul a reverificat rawSHA/source/native/artifact/actualzero cleanup/ordine read/countere; maxawait38.9/12.7ms, warm/nativemax13.3/12.3ms. LongtaskAUTO0/WGL1×62ms la setup, fără atribuireGC/OS. Pauza V6nu s-a reprodus; cauza rămâne necunoscută și nicio acceptare performance/full. Raport parent-raf-diagnostic-results.json, rawuri păstrate.

- 2026-10-07T21:28:29.4629221+03:00: Review independent SOURCE (resume-source-review-01.md în checkout yield-policy-01): limita RAF anterioară are controller1789/native1969, ENTRY1800/native1980; diferența11 încalcă predicatul existent +/-4, separat de pauza efectivă RAF1658.6ms. Parentul a citit raw submitted-arm-4 și clock-proof.ts; nicio cauză GC/OS demonstrată. Captura V6 și pragurile rămân intacte. SOURCE-only v7 predicat exact/test adverse autorizat, fără execuții sau acceptare hardware; PBI rămâne In Progress.

- 2026-10-07T21:45:57.8505527+03:00: V7 boundary helper6teste + clockproof8 + diagnostics5 =19/19PASS; staticstrictTS/lintmax0/formatPASS. MODULE_NOT_FOUND inițial și TS5112 păstrate; căile absolute și --ignoreConfig corectează numai comenzile. V6/clockproof/capturile imuabile. SOURCE distinctV7 diagnostic autorizat pentru callback/readclock, boundary fail-fast și longtaskpartial bounded; fără build/hardware/schedulingfix sau Done. Dovezi v7-boundary-scoped-checks-01/02 în checkoutyield-policy-01.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.
