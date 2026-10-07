---
id: "026"
title: "Roți suspensie și aderență"
status: "In Progress"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["024","014"]
performance_checks: ["simulation","frame","memory"]
owner: "Codex gpt-6.1-sol medium wheel-dynamics-01"
started_at: "2026-10-05T15:12:11.540Z"
completed_at: null
---

# 026 Roți suspensie și aderență

## Obiectiv

Calibrează suspensia, contactul roților și pierderea aderenței.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) guvernează dinamica pe tick, proiecția roților și retenția; păstrează baseline-ul înainte de modificări.

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Virajele rapide pot produce alunecare și distanța de oprire depinde de aderență.
- [ ] Roțile vizuale reflectă starea fizică și nu o controlează.

## Verificare

Rulează curbă cu rază fixă și suprafețe de calibrare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Draft izolat wheel-dynamics-01 după baseline: catalog versionat pentru suprafețe plate, aderență aplicată nativ și proiecții readonly ale roților fizice. Nu este integrat și nu este încă validat.

Verificări executate și rezultat: BEFORE cronologic PASS în 10 lumi Rapier înainte de modificări, sourceHash 4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7; surse și artifact nativ arhivate immutable în worktree, Docs/Evidence/026-wheel-dynamics/before/node.json. Testele, AFTER, calibrarea de aderență/suspensie și browserul nu au fost executate.

Fișiere și documente actualizate: drafturile src/vehicles/road-surfaces.ts, physics.ts, rapier/index.ts, src/rendering/physical-wheels.ts; scripturi de benchmark/calibrare, teste și fixture-uri browser în worktree wheel-dynamics-01.

Actualizare la reluare: full check PASS, 396/396 teste; calibrarea fizică în 28 scenarii și AFTER-v2 în 10 lumi PASS. Toate cele zece checksumuri fizice și inputuri implicite corespund exact baseline-ului. Metricul corectat măsoară viteza laterală la roată în axa anvelopei bracate, inclusiv viteza unghiulară; captura inițială eșuată și sursele sale sunt păstrate. SourceHash final 35e4a4d66abb80cc779c8760b5833039c1f0f6fa3fd94955f2e3ad44c21ba0f8. Buildul fixture-ului browser PASS; serverul 5197 este pregătit.

Limitări sau follow-up: Probe browser pe ambele backenduri, integrare finală, mutare și publicare restante. Suprafețele sunt un catalog de calibrare pentru lumi plate; nu reprezintă contact mixt pe drumuri. Niciun criteriu Done nu este declarat. CPU/browser se execută exclusiv, pe rând cu 025 și 219.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '026' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T18:12:11.1556665+03:00: Scope simulation/frame/memory adăugat înaintea calibrării și proiecției roților. Dependențele 024/014 sunt Done; implementarea folosește worktree separat de captura 219.

- Proba completă WebGPU a ajuns la export după1500.561s, dar HTTP a respins salvarea. Nu este hardware PASS: metricile nu au fost păstrate. Cauza dovedită: payloadul real de calibrare443642bytes depășea limita262656bytes (HTTP400 pentru identitate mică invalidă,413 pentru aceeași identitate cu curbele reale). Captura eșuată,61surse/142artifacts și manifestul sunt păstrate byte-exact. Repararea transportului bounded și noua captură completă sunt necesare; fizica/pragurile/warmupul rămân neschimbate.

- 2026-10-05: Cauza exportului r1 confirmată HTTP: payload443642bytes respins413, control mic400. Transport reparat cu limită finită4MiB, teste HTTP reale incluzând limita exactă/+1 PASS în TEMP. Noul build source1025f9ac/artifactb0a5ff60 arhivat; probele complete trebuie repetate, fără acceptare hardware până la rapoarte valide.

- 2026-10-06: Runda r3 full AUTO/WebGPU a expirat la 01:19 UTC fără export terminal; raportul independent original TIMEOUT este păstrat. Ulterior, pagina Chrome și raportul failed-1791249623806-WEBGPU.json (createdAt 01:20:23.775Z, SHA256 765de8efc35beb8c8ff82e2431ad5f6a535b0cb4607bbb8ee41c5c8f8b19505d) au confirmat Fixed-tick overload: pauză RAF 1,875,822.7ms la armIndex2/tick456. Identitatea source52671c780d666e6b563ae7e12256a26e3e1b1dfa434175617c5471531df4ad45/artifactd4eb36a7f2c215812f71d6f23be8ec27ec3cf9476b65186ec8a83b9a237b69df și exportul funcționează. Două arms complete sunt INCOMPLETE pentru protocolul complet; cauza pauzei rămâne neconfirmată. Blocaj de mediu/verificare: necesară disponibilitatea fizică a ferestrei Chrome foreground pe durata unei noi probe complete. Nu există hardware PASS și WebGL2 nu a fost lansat de parent în r3; CPU eliberat după confirmarea stării terminale. AFTER-main-027 și arhiva diagnostică au fost reverificate read-only PASS; pragurile și fizica rămân neschimbate.

- 2026-10-06: R4 AUTO Full pornit de parent în Chrome08:53:16Z după confirmarea fizică25minute; source52671/d4eb/0512 neschimbate. Captura failed-1791278505852-WEBGPU.json09:21:45.822Z,23504bytes SHA6435f6b7f6511b0d7edd8fb6332fb201e2a7083a300e55b81079d4a72e5e9dce: Fixed-tick overload în ultimul braț9 după9 brațe complete, RAF281951.2ms/debt281.958s/tick4418; foregroundtrue la export nu dovedește focus continuu ori cauza pauzei. Monitorul R4 a ratat acest fișier și a raportat TIMEOUT09:28:26Z. O a doua captură distinctă09:28:52.170Z failed-1791278932179-WEBGPU.json10554bytes SHAa019d89665bb3c6cd2a5eef681a0764791a7ef3e940fc86aecf464c64decd81a: Foregroundlost la braț2 după2 complete, origine lansare neidentificată. Exporturile au reușit; niciun PASS nu se reconstruiește. Review finit026-webgpu-full-r4-independent-inspection.json păstrează datele; parent a confirmat UIterminal Runenabled și a restaurat CDP1920/DPR1. Probe hardware eliberate; cauza stallului rămâne neprobată, fără rerun sau waiver.
- 2026-10-07: Protocolul distinct browser-v2 a trecut25/25 teste pure (lifecycle13,ledger5,capacity2,numericreader4,device-loss1), ambeleTypeScript, format/lint/sintaxă/arhitectură; primele erori de format/lint și corecțiile scoped sunt păstrate în v2-finite-checks-20261007-r3. SOURCE-only aggregate d91a8d4b208397a3811ff0e7922838b765076941745c10d656b6a546de903fbe, fără buildidentity. Worst-shape raw13229880B/terminal12617226B/terminal-error13438060B se păstrează lossless în părți, maxrequest705549B sub4MiB, fiecarelogical sub16MiB. 139căi istorice rehash-exact, HTTPtemporar închis și CPU eliberat. Probe native/build/Chrome/performanceacceptance rămân neexecutate; urmează corecții SOURCE pentru cleanup-ul pre-return/partial care pot pierde resurse ori cauze. Nu atribuie cauza stallului și nu schimbă gate-urile.

- 2026-10-07: După reviewSOURCE, cleanup-ul026 acoperă independent backend/partialWebGPU/canvas, pre-returnRapier și normaldispose cu once-fence/identități erori/rezervare păstrată dacăfree eșuează. DoveziSOURCE production-ownership-source-20261007-r1 și production-disposal-source-20261007-r2 în wheel-dynamics-01;16draftpure/2draftnative încăNEEXECUTATE. Cele139originale și21fișierev2 păstrate. Nicioacceptarehardware/beneficiu/Done; urmeazăstatic/pure dupăCPU030, apoinative și binding laAFTERnou (b696 rămâneHISTORICAL).


- 2026-10-07: Cleanup-ul026 a trecut22/22pure, ambeleTypeScript/lint10paths/format/architecture EXIT0 în production-static-pure-20261007-r6. Primulpreferconst și formatFAIL păstrate; revizia1256a2441becc63a7d8765236a0772fd4bc0570721f1bef7fb666d1ff3c00cd0,1052fișiereprotected/139originale/21v2 nemodificate. CPUeliberat; parentautorizează separatnativefactory2tests10scenarios și physics suites dupăarhivă, fărăbenchmark/build/browser/Done.


- 2026-10-07: R7cleanup nativ PASS2factorytests/10scenarios și10physics+adaptertests, ambeleEXIT0, actualstdout cititdeparent. Arhivă02:28:18.495Z înaintealansării02:28:23.446Z; native02dc4,340,292B și source1256a244 nemodificate, protected139/1052/v2-21 păstrate. Worldfreeonce/admission/reentry/identități/subscriptions/20fullcapacitycycles verificate; nativeinternalpartialUNKNOWN rămâne. CPUeliberat; SOURCE freshAFTER/calibration/currentbinding urmează, fărăperf/build/browser/Done.


- 2026-10-07T05:51:16.6054797+03:00 : SOURCE09 a reparat în draft cele cinci obiecții provenance/calibrare/setup/erori/build-only/bounds în11paths98329B, manifest978438698c3d02c16a998a05b690434ee738f7ffeea12c3242aeccca788ac4ce. CURRENT pins rămân null/INCOMPLETE. Nicio execuție sau modificare de producție; review independent SOURCEpeerR2 pornit, verificările finite/native/build/browser rămân pending.

- 2026-10-07T05:54:30.7226777+03:00 : SOURCEpeerR2 confirmă reparațiile R1 și preservarea SOURCE09, dar cere două corecții: cele8 rezultate calibrare browser trebuie comparate strict cu outputs deterministe originale (null/0/empty wheels încă puteau trece), iar serializarea cauzelor trebuie să păstreze excepțiile originale chiar pentru valori aruncate fără prototip/getters/conversii ostile. SOURCE10 repair delegat fără execuție; native/build/browser/Done pending și pinsCURRENT null.

- 2026-10-07T05:58:58.3120251+03:00 : SOURCE10 12snapshots110132B manifest452cbff52c3a12d5522c9d4039c907ec14e4a0a38556e504b2925ca09d0a7abd păstrează originalele/producția și repară calibrarea8browser prin comparație exactă pinned d8f7d902, plus serializer native bounded cu descriptori guard. Parentul a citit codul și autorizează exclusiv verificările finite serialeR11; încă neexecutate la grant. CaptureLifetime.cause browser păstrează String(error), limitare explicită de reparat înainte de build/browser. Native/currentpins/build/performance/Done pending.

- 2026-10-07T06:02:38.0468207+03:00 : Verificările finiteR11 efective:8syntaxPASS, MJS14PASS/2FAIL, rest7neexecutate. Parent a citit SUMMARY și testele: zero-lateral muta valoarea originală0 în braking, iar helperul async returned hostileproxy și Promise resolution îi accesathen. Reparare autorizată doar2teste+reluarefiniteR12; producția/gate-urile neschimbate, primulFAIL/snapshotSOURCE10 păstrate. Fără native/build/browser/Done.

- 2026-10-07T06:05:45.5391271+03:00 : R12 efectiv16MJS+3fakefixturePASS/ambeleTypeScriptPASS; parent a citit stdout. ScopedlintFAIL preserve-caught-error la recordEvidence causeprimary în locul storage recording prins; R13 autorizat cause=recording imediat, păstrând toate instanțele originale/ordinea în AggregateError.errors, teste adverse adaptate și verificări rămase. Fără suppresslint/gatewaiver/native/build/browser/Done; primulFAIL imuabil.

- 2026-10-07T06:09:23.7187116+03:00 : R13finite actualPASS16MJS/lint12/finalformat12/BOTHtypes/architecture/historicalreader, plusR12fake3PASS. Parent a citit logurile efective; diagnostic12source2472850dd87db3ac827d1238a46b253f4ee50fed66fd8250c8e78baef790a28a și169protectedexact. Captura unică nativeAFTERcurrentcleanup R14 autorizată separat10arms/180warm600measure/originalBEFORE/praguri; calibrare/pinning/build/browser încă neautorizate și neexecutate. PBI In Progress.

- 2026-10-07T06:14:04.8971539+03:00 : NativeAFTER R14 actualPASS10arms sourcec293c6f8baa9ec4279793a53a4a1c70d920976fe3cdb1208f6678852cec146a0/report290484a09790afb731bc461917877fffaf4ff16a90b757d3e99a03d50fcf9fe8; archive03:11:08.693Z înaintefactory.782Z/terminal03:11:20.507Z. ParentactualreadNative+verifyNativeParity EXIT0, p95tick1.5153–1.5771ms<5.5,0/5regresiitick/projection, paritate/cleanupzero. Autorizează separat calibrarenative28R15; fărăpinning/build/browser/Done și fărăhardwareacceptance.

- 2026-10-07T06:18:29.8600553+03:00 : NativecalibrationR15 terminalPASS03:14:55.007Z sourcec293c6f8/report08e6eaaa2b299616bc8d03448f0950534faeb6b02ef6cacb4d634b70b084e7d3. ParentcorrectedindependentPASS03:17:10Z28exactoriginal/80closure/currentarchive/native/chronology/raw.reportcleanupzero/AFTERbinding. Primele două aserțiuni review greșite (partialprogress=fullreport, căi archive alecapturilordistincte egale) păstrate, fărăcaptură repetată. SOURCE16autorizează4pinsactualrootreviewed și reparație browserdiagnostics; fărăchecks/build/browser/Done.

- 2026-10-07T06:23:32.5203978+03:00 : SOURCE16 actual10paths68191B correctedmanifest3b5b5e566c03401baf0bfd2d1106fef5e4e6835bc8bca2a4853433500e034960 setează4pins rootreviewed și browserdiagnostics safe, explicitfalsyerrorrejection/oncecleanup. Parentcitește codul și autorizează finiteR17+offlineCURRENT dupăPASS; capturile native80inputs/producția neschimbate, fărăbuild/browser/Done.

- 2026-10-07T06:26:56.8530308+03:00 : R17actual7syntaxPASS/28purePASS+1preexisting nullpin skip/20affectedPASS/BOTHtypes/lint10format10architecture/CURRENTofflinePASS10AFTER28cal80inputs. Parentcitește stdout, logpinsb72befd8dcf6de73431e1005929ac7a4dd10eb27f49fbdeedd0881d346ee9a76. Buildunicv2 R18autorizat separat --build-only, fărăHTTPserver/Chrome/probă; istoric/nativecapturi/gate-uri imuabile, Donepending.

- 2026-10-07T06:29:29.5958984+03:00 : R18wrapper a blocat înainte de build (0invocations/noUUID/noarchive) fiindcă a tratat listenerii fixtureIDLE ca probeactive; CURRENTprebuildreaderPASS. Primulfailureguard păstrat. Parentconfirmă hardware/capturăniciuna,0265197/0525212/0305208 servereIDLE și0305218NotStarted; R19 corecteazăguardul și autorizează uniculbuild real --build-only, fărăopririservere/sourcechanges/HTTP/Chrome/Done.

- 2026-10-07T06:32:18.2222006+03:00 : R19uniculbuildactualPASSexit0/BUILD_ARCHIVED_SERVER_NOT_STARTED UUID66872ce5-696c-4c3f-9e6d-b849d38f0ee4 source7a3c2ca0c48e63ecd7b2bcc1edcb8658f2a4710b2c5203f77d775adc0230f3e8/artifact8ce69f98824feb6fe39569fc2688656518ab1cc99717750f71a0be515a29f2f4;253archivefiles/105inputs/142artifacts strictbyte/hashPASS.5220fărălistener/grantremoved. SOURCE20helper în afara105frozenpaths pregătește servire aceluiași build fărărebuild; noexecution/sourcecapturimutations/browser/Done.

- 2026-10-07T06:39:11.4222512+03:00 : SOURCE20serve-existing helper păstreazăR19UUID/105frozeninputs, sidecarauxruntimeproof și --check-only înainteledger/listen;10fișiere51693B manifest129f8b91bab5b6075a1b06d3af7e56889421fe74ba4336f252a186d42866735a neexecutate. Parent autorizeazăfiniteR21/pure7/check-only; doarformat cu proofbundleadditiv dacănecesar, fărăHTTP/build/browser/Done.

- 2026-10-07T06:47:00.0505896+03:00 : R21 PASS: 3 syntax, 7 pure, lint/format/architecture et check-only; 1255 preserved files byte-exact. SOURCE21 service proof dc97aa31d383f0247d5f62923ad55e4298254b213526d6cd0e54292eb6fda087. Root reviewed raw logs and launched SAME R19 build UUID66872ce5-696c-4c3f-9e6d-b849d38f0ee4 without rebuild: server 5220 session43160 PID44628 ready. Chrome tab1242656245 AUTO Full prepared, Not run; acceptance remains unverified, no Done move.

- 2026-10-07T21:56:38.2607819+03:00: Proba completă AUTO v2 a pornit efectiv18:55:01.948Z după confirmarea actuală a prim-planului; capture2bb1b5fd-8e9f-4ea4-923c-49f2f28e611c, sameR19UUID66872/source7a3c/artifact8ce6/native02dc. Primul progresobservat16.1s/tick965. Slot exclusiv hardware; monitor readonlyresume219 deadline19:28UTC. Fără PASS/Done înainte de terminalși verifierstrict; alte execuții CPU oprite.

- 2026-10-07T22:27:42.6595847+03:00: AUTO/WebGPU capture2bb1b5fd terminalCAPTURE_COMPLETE19:20:49UTC; strictreadPortableCapture/currentnativebinding/productionmanifest/verifyCaptureNumbers EXIT0 în parent19:26:28. Frame/main regression0/5;trackedJSproxy1/5 subconfirmare3/5;10brațe8calibrări și cleanup/raw/archive identitate verificate. SINGLE_BACKEND_NUMERIC_PASS, fără BOTH/Done. WEBGL2 fullselectat5220, așteaptă actualadisponibilitate25minute; dovadă resume-verification-20261007-r1/result.json în checkoutwheel-dynamics-01.

- 2026-10-07T22:31:50.9048848+03:00: WEBGL2full pornit efectiv aproximativ19:30UTC după confirmarea actuală25minforeground; capture6d680495-21a4-41d2-990e-4ea67248b404. ParentUI26.3s/tick1580 warmup, Run disabled. Monitorreadonlyresume219 deadline20:03UTC, toatealteCPU oprite. AUTO2bb strictPASS păstrat; fărăBOTH/Done pânălaterminal/verifiers.

## Nivel de validare — politica 2026-10-08

Nivel: `full`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: WEBGL2 capture 6d680495-21a4-41d2-990e-4ea67248b404 a rămas INCOMPLETE la 2026-10-07T19:46:28Z, după șase brațe complete, din cauza pierderii focusului. AUTO/WebGPU PASS este păstrat. La cererea utilizatorului, toate probele și serverul 5220 sunt oprite; fără retry și fără BOTH/Done. Politica targeted-validation-v1 se aplică prospectiv, fără reclasificarea capturii vechi.
