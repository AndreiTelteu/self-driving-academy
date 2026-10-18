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

- 2026-10-07T22:14:00+03:00 : handoff sursă V7 R4 (source-only/neexecutat): 9fișiere noi tests/browser/yield-policy-v7/ (main/runtime/diagnostics/observations/observations.test/protocol/index.html/server.mjs/verify.mjs); agregat manual 92intrări fingerprint90de66c8; boundary one-shot cu predicat strict ±4, split callback/continuation-start și contorul de citire, longtask bounded1024 cu export înainte de disconnect; 11teste adverse autorate neexecutate; V6 rămâne FAIL (gap1658.6ms), fără build/native/browser/PASS/Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.

- 2026-10-18T22:14:00+03:00: Reluare la cererea utilizatorului. V7 collector scoped-checks-01 execută batch-ul finit propus de R4: 30/30 teste pure PASS (boundary6+clockproof8+diagnostics5+observations11), tsc strict pentru teste și pentru colector PASS, ESLint max-warnings0 PASS, prettier PASS după ce eșecul inițial pe 6 surse a fost păstrat și corectat numai prin formatare; runtime.ts/boundary*/index.html/verify.mjs rămân byte-exact, iar agregatul manual R4 90de66c8 devine stale. Fără build/native/server/browser/hardware; V6 rămâne FAIL/INCOMPLETE (gap1658.6ms), niciun criteriu bifat, PBI rămâne In Progress. Dovezi: Docs/Evidence/052-yield-policy/v7-collector-scoped-checks-01 în checkout yield-policy-01.

- 2026-10-18T22:34:22+03:00: Smoke scurt V7 cerut de utilizator, 3 sesiuni distincte cu același build (source7e0ae331/artifactf427ed4e, AMD Ryzen 7 7735U + Radeon 680M, Windows 11, High performance, Chrome 155 CDP, DPR1, 1920x1080, 70 mașini): WEBGL2 a salvat 14/14 brațe de două ori (native1.0031-1.0092, RAF0.9982-1.0040, debtRAF maxim14.5ms, cleanup zero); WEBGPU/AUTO a eșuat de două ori în gate-uri diferite - sesiunea192001 arm10 respins de ratio0.976181/0.976805 (180tickuri/3073.2ms, celelalte nouă brațe0.9984-1.0086, warmBoundaryWITHIN_EXISTING_BOUNDARY deci fail-fast-ul V7 a trecut), sesiunea193106 arm11 oprit de garda "Simulation overload debt after RAF before render" cu rafDebt524.6ms (cele zece brațe anterioare sub16.3ms). Verificatorul comun V7 cere sesiune full (WEBGPU-full+WEBGL2-full), iar derivata smoke-only în stil V6 cere ambele smoke-uri complete în același folder; niciuna nu e îndeplinită, deci capturile rămân dovezi diagnostic, fără PASS de performanță/hardware sau acceptare. Fără modificări de sursă de produs; V6 rămâne FAIL; PBI rămâne In Progress. Dovezi: browser-v7-20261018T192001395Z/192656329Z/193106239Z și v7-smoke-sessions-20261018 în checkout yield-policy-01.

- 2026-10-18T22:38:40+03:00: Investigare stall WEBGPU la cererea utilizatorului, read-only peste capturile de mai sus plus jurnale Windows, fără probe noi. Atribuire: eșecul de 524.6ms este integral latență de livrare RAF (stamp96549.1 față de beforeNative96017.7/waitStart96019.3), cu stamp→callback2.5ms, costuri native1.6-2.4ms/tick, contor nativ neschimbat în pauză și zero longtask în timpul stall-ului; al doilea eșec este frame max217ms. Cadence normală (meanGap16.693ms, max≤17.8ms) pe 10 brațe WEBGPU curate și 28 WEBGL2, deci stall izolat, nu throttling cronic. main/tick/step/policy p95 sunt 6.5/2.7/0.2/0.1ms, iar warmBoundary este WITHIN_EXISTING_BOUNDARY. Mediu: High performance pe alimentare, fără evenimente TDR/Display, fără Application Error/Hang pentru Chrome, fără evenimente de power, deci fără dovadă de reset de driver. Cauza ultimă rămâne nedeterminată (driversauChrome-Dawnsau memorie GPU); următorul discriminator propus este proba reutilizabilă raf-scheduling-diagnostic, faza RAF_ONLY fără renderer/native. Fără modificare de sursă de produs; V6 rămâne FAIL; PBI rămâne In Progress. Dovezi: Docs/Evidence/052-yield-policy/v7-smoke-sessions-20261018/stall-attribution.md.

- 2026-10-18T22:52:43+03:00: Discriminator RAF_ONLY rulat cu fixtura reutilizată raf-scheduling-diagnostic (3faze×40s, port5215, viewport real1920x1080 DPR1), la cererea utilizatorului. Trei sesiuni: 194259673Z AUTO INCOMPLETE (0 waits, dimensions changed), 194430232Z AUTO/WebGPU COMPLETE 7183 waits, 194902703Z WEBGL2 COMPLETE 7194 waits; ambele complete au trecut verify.mjs --build-only (sourcecc147f36/artifact37c91fd7/native02dc6a4e). Rezultat: RAF_ONLY este curat pe ambele backenduri (maxWait19.0/18.9ms, gap17.3/17.6ms), EMPTY_RENDERER cu scenă goală are maxWait214.0ms/gap200.2ms doar pe WebGPU (WEBGL2 17.8/17.6ms), NATIVE70 curat (16.9-17.2ms), longtasks0 pe WebGPU și 1×51ms pe WEBGL2. Deci browserul livrează corect frame-urile fără canvas GPU, iar stall-ul apare pe canvas-ul WebGPU cu scenă goală și zero longtask: întârziere de prezentare WebGPU (swap-chain), nu cost de aplicație, nu simulare, nu browser/compositor general. Fixura adaugă overhead de observare și e doar diagnostică; intermitent, faza variază; cauza ultimă rămâne nedeterminată. Fără modificare de sursă de produs; V6 rămâne FAIL; PBI rămâne In Progress. Dovezi: Docs/Evidence/052-yield-policy/raf-scheduling-20261018* și raf-scheduling-20261018-analysis/report.md.

- 2026-10-18T23:27:32+03:00: Pasul 1, integrare pe main: branch-ul de lucru (bază ad32db9) a fost adus pe main actual prin branch-ul de integrare integration/052-yield-policy-01, apoi fast-forward. Publicate: src/autonomy/yield-policy.ts, export din src/autonomy/index.ts, tests/autonomy/yield-policy* (7), tests/browser/yield-policy plus v2-v7 și raf-scheduling-diagnostic (79), scripts/benchmark-yield-policy* și verify-yield-policy-browser.mjs, Docs/yield-policy.md și Docs/Evidence/052-yield-policy (5524 fișiere). Verificarea de arhitectură (apărută după baza branch-ului) a impus rescrierea importurilor cross-modul din yield-policy.ts pe barrel-urile publice ../profiles și ../world; semantică runtime neschimbată. Verificat pe main: typecheck, lint, format:check, check:architecture, check:parameter-catalog și 792/792 teste. Fișierele scratch .pbi-052-*.txt nu au fost publicate. Commits f6b5fdfa (cod) și 459ec3f5 (dovezi). Criteriile de acceptare și Dovezi de finalizare rămân necompletate; PBI rămâne In Progress.

- 2026-10-18T23:44:46+03:00: Pasul 2, dovezi browser pe sursa publicată. Integrarea a expus o regresie: după baza branch-ului, createRapierProbe().project() returnează și angularVelocityRadps plus wheels, deci rândul de trace a crescut 1057→4266B și arm metadata 491→936KB (calibrare), respectiv 63→193KB (măsurat), iar raportul a depășit limita de transport de 4MiB (prima sesiune browser-v7-20261018T203144981Z: toate 14 brațe înregistrate, /export respins HTTP413, fără report.json). Fix în fixtura 052 (commit 4aee1dd0): se înregistrează doar câmpurile stabile de traversare citite efectiv. A doua sesiune browser-v7-20261018T204011941Z (sourceaf3fbf38/artifactea28fef1) a completat WEBGL2 cu report.json 2.79MB, terminal SAVED_PENDING_VERIFICATION, 14 brațe, foreground/DPR1/1920x1080, cleanup zero. Dovezi de criteriu în browser cu fizică reală, aceleași lumi, doar pragul diferă: sedan0.2s acceptă tick1, intră103, contact115 cu8964.39N*s; sedan3s refuză până tick30, intră213, fără contact; compact0.2s intră98, contact103 cu5424.85N*s; compact3s intră208, fără contact; minGap1.497s explică acceptul (peste0.2) și refuzul (sub3). Cele10 brațe măsurate (70 mașini) curate: native1.0032-1.0093, RAF0.9984-1.0039, overload0. WEBGPU nu a fost rerulat pe revizia publicată (schimbarea e doar rezolvare de module plus proiecția de body; WEBGPU are deja două eșecuri documentate și localizate). verify.mjs nu poate verifica o sesiune smoke-only (cere inventar full pe ambele backenduri), deci rezultatul rămâne COMPLETE_SMOKE_ONLY fără acceptare de performanță/hardware. Criteriile nu se bifează; PBI rămâne In Progress. Dovezi: Docs/Evidence/052-yield-policy/v7-smoke-published-20261018 și browser-v7-20261018T203144981Z/204011941Z.

- 2026-10-19T00:24:15+03:00: Testul adaptorului WebGPU, rezultat NEGATIV. Scop: scoaterea căii WebGPU de pe D3D12 pentru a testa ipoteza stall-ului de prezentare. Metodă read-only: flag candidat la pornirea Chrome, apoi citirea „Dawn Info“ din chrome://gpu prin CDP (parcurgere shadow-DOM) și a adaptorului din navigator.gpu. Rezultate: implicit, --use-webgpu-adapter=vulkan, --use-webgpu-adapter=d3d11 și --enable-features=Vulkan raportează toate „<Integrated GPU> D3D12 backend - AMD Radeon(TM) Graphics“; adaptorul rămâne amd/rdna-2. Pe Chrome 155.0.8059.84 backend-ul Dawn nu poate fi schimbat din aceste flag-uri, deci ipoteza nu poate fi testată astfel; nu s-a rulat nicio probă, configurația fiind identică. chrome://gpu listează feature-ul webgpu_on_vk_via_gl_interop (WebGPU-pe-Vulkan doar prin interop GL). Următori discriminatori nescanați: alt build Chromium (Edge 155.0.4283.62 e instalat), HAGS on/off (necesită reboot), driver AMD 680M, altă mașină/CI. Fără modificare de produs; PBI rămâne In Progress. Dovezi: Docs/Evidence/052-yield-policy/v7-adapter-probe-01.

- 2026-10-19T00:30:39+03:00: Edge ca diagnostic, la cererea utilizatorului. Același smoke WebGPU într-un build Chromium independent (Edge 155.0.4283.62, profil temporar curat cu extensii/sync dezactivate, același stack Dawn/D3D12 și același driver AMD) a eșuat identic: captura browser-v7-20261018T212619137Z (sourcesaf3fbf38/artifactca729dca) a fost respinsă la brațul 12 (pair 4) cu „052 native phase simulation/wall ratio“, nativePhaseRatio0.948586/matchedRafRatio0.946138, beforeDebt171.2ms, rafDebt180.6ms, muncă în callback1.3ms și costuri native1.7-2.3ms pe tick, warmBoundary WITHIN_EXISTING_BOUNDARY. Semnătura e identică cu eșecurile Chrome (ratio0.9762; debt524.6ms): timpul se duce în livrarea/prezentarea frame-ului, nu în aplicație. Reproducerea într-un build independent elimină ipoteza „regresie Chrome 155/Dawn“ și indică calea D3D12/WebGPU pe iGPU-ul AMD Radeon 680M (driver sau planificare GPU). Edge a fost folosit doar ca diagnostic, nu ca mediu de acceptare. Rămân: HAGS on/off (necesită utilizator/reboot), driver AMD 680M, altă mașină/CI. Fără modificare de produs; PBI rămâne In Progress. Dovezi: Docs/Evidence/052-yield-policy/v7-edge-probe-01 și browser-v7-20261018T212619137Z.
