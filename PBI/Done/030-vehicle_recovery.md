---
id: "030"
title: "Recuperare la punct valid"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["029","007"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium vehicle-recovery-01"
started_at: "2026-10-06T11:59:06.113Z"
completed_at: "2026-10-07T20:45:08.9902438+03:00"
---

# 030 Recuperare la punct valid

## Obiectiv

Implementează ultimul punct valid, intenția R și evidența teleportării.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 029 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Recuperarea este explicită și nu apare automat ca acțiune învățată.
- [x] Nu plasează mașina în alt corp sau într-un punct rutier invalid.

## Verificare

Testează răsturnare, drum blocat și lipsa unui punct valid.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Recuperare explicită R/HUD pentru vehiculul controlat în MANUAL/LEARNING, cu ultimul punct rutier valid și verificare nativă proaspătă a ocupării. Generația, contextul și serialul fizic sunt verificate înaintea mutării. Operația păstrează prefixul incidentelor, închide segmentul005 și publică evenimentul007 o singură dată; retry-ul unei livrări parțiale nu repetă teleportarea. Diagnosticele de eroare nu inspectează valori arbitrare aruncate.

Verificări executate și rezultat: Probele native BEFORE/AFTER4 și cele fizice V5 pe AUTO/WebGPU și WEBGL2 au trecut cititorii independenți. Probele complete V5: câte10runs/backend,30s warm/120s measure,1160comparații totale; gate-urile obligatorii absolute, relative și JS proxy au trecut, cu cleanup zero. Rapoartele originale și eșecurile anterioare sunt păstrate în Docs/Evidence/030-vehicle-recovery. Corecția integrată a diagnosticelor a trecut18/18teste pure, ambele configurații TypeScript, lint, format și arhitectură în integrated-cold-checks-01, apoi10/10teste native în integrated-cold-native-01, cu arhiva143intrări înaintea procesului. Verificările generale integrate au trecut lint, format, arhitectură, catalogul de parametri și658/658teste TypeScript seriale în integrated-general-checks-01. Review-ul independent nu are blocaje materiale; dovezile hardware originale rămân HISTORICAL pentru versiunea capturată.

Fișiere și documente actualizate: src/vehicles recovery și adaptor Rapier, src/app adaptoare recovery, src/input/recovery-input.ts, src/ui adaptor HUD, teste pure/native/browser, Docs/vehicle-recovery.md, Docs/05-vehicule-si-fizica.md și Docs/Evidence/030-vehicle-recovery/current-delivery-summary.md.

Limitări sau follow-up: Capturile hardware sunt HISTORICAL pentru versiunea înghețată V5; corecția ulterioară schimbă numai descrierea erorilor pe ramurile de excepție și este verificată separat. overallUNVALIDATED păstrează metricile opționale GPU/input, memoria nativă reținută, laptopul și jocul complet nemăsurate. Aceste rezultate nu declară acceptarea integrală a jocului și nu schimbă baseline-ul sau pragurile.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '030' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-07T20:45:08+03:00: Integrat cu068 păstrat; corecția rece a diagnosticelor a trecut18teste pure și10native, ambeleTS, apoi658teste generale și toate gate-urile statice. Review independent fără blocaje materiale. Fișierul a fost mutat fizic în Done după verificări; capturile hardware V5/AFTER4 și toate eșecurile rămân neschimbate, HISTORICAL pentru închiderea nouă de surse.

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-06: Preluat după publicarea029 ad32db9 și007 Done. Scope-ul de tracking recoveryPoint/query nativ și dovezi de teleportare introduce lucru pe tick și stare reținută; simulation/memory sunt declarate înainte de implementare, conform contractului25. Baseline cronologic, plan de capacitate și verificări native/browser necesare; nu este implementat.

- 2026-10-06: Baseline-ul nativ BEFORE distinct sourcee7e5241c/124intrări a trecut20lumi și verifierul CURRENT, reverificat independent de parent. Native02dc/4,340,292bytes a fost arhivat12:30:26.120Z înainte de prima lume12:30:26.131Z; final12:31:16.006Z.70p95 2.928–3.111ms sub5.5,110stress3.377–3.882ms; toate780ticks/10checkpoint păstrează paritatea input/control/fizică și cleanupzero. Heapurile brute rămân cu variația GC reală, fără acceptare RAM/retention sau AFTER. Fixture-ul rutier folosește032/033 reale;3teste adverse și typecheck au trecut după repararea parametrului nefolosit, primul eșec păstrat. Aceasta este probă CPU suplimentară; urmează referința browser și review-ul seamului recovery, producția030 rămâne absentă.

- 2026-10-06: Draftul browser BEFORE reparat a trecut 12/12 teste pure adverse, typecheck, lint, 8 verificări de sintaxă și format; primul eșec al căii formatterului este păstrat. Parentul a citit logurile reale. Cele 124 intrări BEFORE rămân byte-identice (e7e5241c); fără build, server, probe native/browser sau implementare recovery. Review-ul peer și baseline-ul hardware rămân necesare.

- 2026-10-06: Referința browser BEFORE AUTO a pornit efectiv15:36:34.427Z, capture20261006T153634426Z, după confirmarea fizică actuală5208/25min. Source6c203fb9/artifact00309f0f înghețate; T3monitorr1 urmărește singura probă10runs30/120, deadline16:12Z. Hardware exclusiv/CPUcheck și build suspendate. Implementarea030/seams încă absentă până la ambelebackenduri BEFORE acceptate.

- 2026-10-06: BEFORE AUTO/WebGPU capture20261006T153634426Z a încheiat10/10 efectiv16:01:35.475Z. Verifierul parentCURRENT a trecut EXIT0:136surse/artefacte/native/ZIP/raw/paritate580checkpoints și cleanupzero; requiredAbsolutePASS, optionalNOT_MEASURED/overallUNVALIDATED, JSproxyBASELINE_ONLY și relativeAFTER_PENDING raportate onest. WEBGL2 este selectat5208, așteaptă disponibilitate nouă25min; producția030 rămâne absentă până la ambeleBEFORE acceptate.

- 2026-10-06: BEFORE WEBGL2 a pornit efectiv16:21:25.098Z capture20261006T162125098Z după disponibilitatea actuală5208/25min. AUTO original verificatstrict rămâne imuabil; T3r2 urmărește numaiWEBGL2 cu deadline16:57Z. Hardware exclusiv, alteCPUcheck/build/native oprite. BOTHstrict inventory și producția030 încă pending.

- 2026-10-06: BEFORE WEBGL2 capture20261006T162125098Z a încheiat10/10 efectiv16:46:25.876Z. Parent verify-browser-set CURRENT EXIT0 PASS exactBOTH20runs/1160checkpointcomparisons/source/native/artefacte/ZIP/raw/cleanupzero; requiredAbsolutePASS, optionalNOT_MEASURED/overallUNVALIDATED, memoryRAW_JS_PROXY_BASELINE_ONLY și relativeAFTER_PENDING. Baselineoriginal păstrat. Ownerwheel026 preia SOURCEimplementare030 învehicle-recovery-01 dupăacceptare; CPUverificări așteaptă068v3 finitechecks. FărăDone sauprobeAFTER încă.

- 2026-10-06: Draft SOURCE 26files/17testcases handed off (fingerprint96eb418b). Parent critical review completed for owner/ledger/app/input/native placement/admission seams; finite serial format/type/lint/architecture/syntax/13pure checks granted to same wheel026 agent after068v3 hardware terminal. Native calibration, extended physical recovery/history and both AFTER hardware remain pending. No test PASS or completion claimed from source draft.

- 2026-10-06: Parent read actual implementation-checks-01 commands/exits/logs: 13pure PASS, scopedformat/lint/architecture/3MJSsyntax EXIT0, source tsc --noEmit EXIT0 after preserved initial13annotation/nullnarrowing errors. Package second testsconfig typecheck not yet evidenced and explicitly pending; no fulltypecheck claim. CPU released to068v4 finitechecks;030 native functional extensions remain SOURCE-only, no native/browser/build acceptance.

- 2026-10-06: Missing tsc -p tsconfig.tests.json --noEmit now actual EXIT0, parent read metadata; initial one injected-test CollisionIdentity annotation failure preserved. Bothsource/test typechecks PASS plus13runtimepure PASS. Four extended nativefunctional cases drafted unexecuted; parent identified frozencontroller instrumentation mutation to repair before execution. Native and browser AFTER remain pending.

- 2026-10-06: First actual native unit/functional round reports3/8 PASS and5structuralFAIL preserved: strict plain-data recovery crossing receives real Rapier Vector3; trusted bridge needs scalar copy, without relaxing guard. Anonymous fixed addBox is an unparented collider, so adverse fixture must move actualcollider rather than assumeRigidBody. One bounded affected rerun allowed after proven fixes; physical support/occupancy/history/order gates unchanged. No benchmark/browser acceptance.

- 2026-10-06: Corrected native unit round actual18:21:39.412–18:21:40.499Z EXIT0 8/8 PASS; scalarcopy bridge+actualfixedcollider fixture corrections, first3/8FAILpreserved. BothTypeScript/affectedlint/format EXIT0; protected archives exact perchild. Numeric supportcurve/manualtrustedR/nativebenchmark/browserAFTER remainpending. Samewheel026 authors distinctAFTERbrowserSOURCE5218 while068fullhardwareactive; noCPU/world/build.

- 2026-10-07 local: NewAFTER SOURCE peer found4blockers (requiredmemoryUNVALIDATED propagation, RAFtriggerretentionbeforeguards, cleanupDOMfailure/readbacks, overallFAIL propagation). Owner25filedraft16cfc112 reportsclosures andconcretetrustedRruntime/rawstore/BOTHfunctionalreader, allUNEXECUTED. Peer219reviewsclosure andownerwheel026extends matrix/calibration/transportworstshape SOURCEonly while068WEBGL2hardwareactive. No newtype/lint/pure/native/build/browseracceptance.

- 2026-10-07: Transportul funcțional AFTER a eșuat pe forma escapedJSON:2595247bytes depășesc2MiB, logul original pure-affected-06 păstrat. Codec SOURCE UTF16LE/base64 păstrează exact unitățile mesajelor diagnostice și toate394ticks/cauzele; raportul maximal rămâne pending. Parentul a identificat getter accesat înaintea validării descriptorilor și a cerut repararea decoderului/parserului plus teste adverse. CPU scoped/pure exclusiv030 după eliberarea069; fără benchmark/native nou/build/browserAFTER/commit.

- 2026-10-07: Exportul030 scoped08/affected10 a trecut ambeleTS/lint/architecture/15syntax și16pure; parentul a citit logul efectiv. Forma legală maximală cu12readbacks/caz+4backend, mesaje UTF16LElossless, ID-uri derivate din contextul real și stop-on-failed verificat:2,015,829bytes<2,097,152. Toate394ticks/canalele rămân; primeleFAIL2,595,247 și3,348,553bytes păstrate. Verificările native unit/functional și calibrare0/4/6 urmează; benchmarkAFTERafter-01 este autorizat condiționat dePASS structural, încăneexecutat. BrowserAFTER/Donepending.

- 2026-10-07: Actualnative10/10PASS01:05:31.835–01:05:34.580Z, sursele405inputs/native02dc arhivate înainteaprocesului. Sedan/compact observații0/4/6/contact4/querySAFE șiimpulsuri62664.693/49234.721Ns, helperpartial2/1 și cleanupzero; unghiulcerut6° s-a redus dinamic sub5°, fărăpretinderearespingerii6°. LansareaAFTER a eșuat01:07:03Z înainteaarhivei/primelumi: --import cu F:Windows path. Firststderr și comenzi păstrate native-after-checks-01; parentautorizează corecțiepathToFileURL și prima capturăefectivăafter-01, fără schimbarefixture/gate/producție. BrowserAFTER/Donepending.

- 2026-10-07: CapturaAFTERafter-01 source261733c5/native02dc a începutprima lume01:08:58.192Z dupăarhivă01:08:58.175Z și a eșuat01:10:47.614Z la pragulnormal70p95<=5.5ms. Toate20lumi brute păstrate; normal70p956.441–6.730ms/110stress8.905–9.324ms; fărăcomplete/comparison/verifierPASS. CPUeliberat. AnalizaSOURCE vizează getStatscare scaneazăflota înfences și conversii/exporturigeometrie la fiecarecollider; optimizaretrebuiepăstreze querycomplet/prospețime/praguri/paritate. Nu se repetă capturafărăschimbarecauză; browserAFTER/Donepending.

- 2026-10-07: Optimizarea O(1) a boundary-ului și intersecția pe colliderul nativ live au trecut verificările finite: 31/31 pure și 10/10 native, fără reducerea acoperirii fizice. Captura distinctă AFTER2 source b15f1890bbae9a099eadeebfa3a9557263cace422551a7105458a8b1f1cd7977/native02dc a arhivat sursele 01:29:32.061Z înainte de prima lume 01:29:32.082Z; terminal FAILED 01:30:54.102Z după toate20 lumile. Limita absolută normal70 a trecut (p95 4.7852–4.9722ms <=5.5), dar gate-ul relativ original70 a eșuat: 5/5 perechi, delta1.7991–2.0071ms; analiza numerică suplimentară110 arată5/5 regresii, delta2.5956–3.3629ms. Captura și primul AFTER eșuat rămân imuabile, fără PASS reconstruit, noubaseline ori browserbuild. CPU eliberat; urmează diagnostic SOURCE al costului rămas înainte de o altă probă.

- 2026-10-07: Cele două optimizări de alocare au trecut39/39pure și10/10native, inclusiv21injectări de getter nefinite (toate citirile/traversările/query-urile păstrate); archive405source612a7f87 înainte de lumi. Proba unică AFTER3 source563fee8d39bfe67b674b77a6abd6a64b37248f05880c896b34fce67ff0f20ca1/native02dc a eșuat02:03:11.916Z după20lumi: normal70p954.8280–5.0752ms trece5.5, dar70și110 au fiecare5/5regresii față deBEFORE original (delta70 1.7432–2.0105ms,110 2.8936–3.3034ms). Analiza suplimentară strictă verifică paritate exactă și5owneri cleanupzero; nu schimbăFAIL înPASS. CPU eliberat, fărăAFTER4/build/browser/Git. Urmează doar reviewSOURCE al reutilizării resurselor query-ului în aceeași inspecție, păstrând fiecareinterogare fizică și toatefence-urile.

- 2026-10-07: Reutilizarea lazy a celor trei buffere raw per inspecție a trecut44/44pure, ambeleTypeScript/lint/architecture/format EXIT0; parentul a citit logurile efective raw-query-buffer-checks-01. Fiecare collider/query/fence rămâne; cleanup independent și identități erori verificate pur. Sursa scoped507bf427dfb95170d4d8bccfb2357e2e4503d795494387320a11427b816af2c3; toate treiAFTERfailed șiBEFORE păstrate. Probele native de echivalență/APIpublic/21getter/full4count sunt autorizate separat după arhivarea surselor înainteaprimei lumi; fărăAFTER4 ori beneficiuCPU declarat.


- 2026-10-07: Actualnative05 EXIT0/10PASS verifică bufferreuse/querypublic/full4count/21getternefinite/finallyrestore;407inputs source031a7827677577d88cc8427b62cbeff139ad1dd9dd3cc9e17327e3f8ed6197ba și native02dc arhivate înaintealansării, timestamps02:13:28.770Z au granularitate1ms fărăinventarestrictgap. Calibrarea fizică douăclase este byte-identică04, cleanupzero. Proba unicăAFTER4 cupragurile originale este autorizată separat; capturileBEFORE și3FAIL rămân imuabile, performanță/browserpending.


- 2026-10-07: AFTER4 distinct803cde501e63e44c786a6a4e942a0a10cd2c4a6fe1ded8d14e40b13c64ba5cd5/native02dc PASS20lumi și readerCURRENT/HISTORICAL EXIT0. Arhivă02:18:04.208Z înainteaprimalume.228Z, terminal02:19:03.586Z. Normal70p953.2715–3.5774ms/delta.1942–.491/0din5regresii;110p954.3123–4.5302ms/delta.4307–1.1533/1din5, sub3din5 pragrelativoriginal. Cele3FAIL/baseline originale păstrate. CPUeliberat; browserAFTER SOURCE binding/etichete/closure înpregătire, fărăacceptarehardware/Done.


- 2026-10-07: Readiness browser030 a trecut34/34pure/ambeleTS/lint/format/architecture/5syntax EXIT0, source23cc0cc4; parentactualstdout citit. Actualbinding124prodrows079ea5a4 și toate148AFTER4current/archive/native02dc nemodificate. Buildulunic browser-after-01 cuverificarea strictăBUILD_ONLY esteautorizat separat; nicioserver/captură/playtest/acceptareChrome încă.


- 2026-10-07T05:47:25.0939514+03:00 : Buildul unic browser-after-01 a trecut verificarea strictă BUILD_ONLY la autor și independent la parent: 410 inputs source76ce55cb2c26022c9846746435e1090737aaf71449fccbdf46d2b3a528ac7b5a; 56 artifacts eead4bbb90c9c79b6c0ea81c71c45b08acbe11899b06ff71f1c0965b9a261b2a; ZIP9f486429648d23770c7e98e1147d87fc07d04662e9584d9a805022be9dd6acb0. Server5218/session98863/PID80156 servește buildul înghețat, fără rebuild/capturi. Chrome tab1242656242 AUTO este pregătit la1920x1080; proba trusted-R așteaptă disponibilitatea fizică a utilizatorului, tastele fiind exclusiv manuale. Nicio acceptare browser/performance/Done încă.

- 2026-10-07T10:28:21.1506089+03:00 : User confirmed physical foreground/keyboard readiness at5218. CPU069released before intendedRun. CUA originaltab stale, actualselectedtab1242656252 URL5218 identified, then nativepipeclosed/browser1unavailable; browser inventory empty. No Run or gamekeys performed. Connection recovery requested; functional acceptance remains pending.

- 2026-10-07T10:31:07.5063196+03:00 : Chrome Computer Use reconnected browser2, newtab1242658342 URL5218 AUTO. Actualfunctional capture20261007T072936077Z FAILED before userkeys atNO_POINT: firstRAF gap1000.1ms >250ms, native tick1/serial181 unchanged. Submitted3549B SHAc81890da5240dfc8ad1c4d8c658f96ad11a3de0331c684b4b6ba4a2d8da909d5 preserved with rejection/failure raw. Report400 incomplete is secondary. Case15 androot4 cleanup attempted once, zeroresources. Fresh physicalforeground newtab requested before any rerun; no gatewaiver/Done. Prior shell windowlaunch rejected bypolicy; supportedCUA openedtestpage successfully.

- 2026-10-07T10:35:56.3863596+03:00 : Fresh user physicalforeground/canvas confirmation received. Root attempted functionalAUTO relaunch without checking one-attempt namespace; server rejected BEFOREworld with One immutable functional attempt/backend. Root acknowledged mistake. No keys/native run/acceptance. Distinct diagnostic fixture SOURCE-only preparation assigned sameauthor; original410/archive/failure/attemptpolicy250ms thresholds immutable, no retry through bypass.

- 2026-10-07T11:53:31.5117598+03:00 : V2 overlay SOURCE14paths fingerprintedbf77d344258687184295de9531ee0c38b98cb87f7baf6765607600655f2ed8 reviewed runtime diff/diagnostic/store/buildbinding/strictreader. Separate browser-after-02/buildUUID fresh immutable attempt; original410/captures preserved,250ms/native/trusted/gates unchanged. Root requires guarded bounded primary display preserving falsy/original refs (new String conversion removed), then soleCPU serial finite pure/static checks. No actualbuild/server/browser/native authorized yet.

- 2026-10-07T12:26:41.8347186+03:00 : ActualV2finitePASS22pure/BOTHtypes/lintformat9syntaxarchitecture, source15fingerprint917b5fb681de22b225e3634879c23d2d9b1a6403ff3bfa75fbdb035ad4b06ee7. Hostile/falsy primaryexactrefs testsPASS,original410+10rawunchanged. Root reviewedbuildcommand and authorized ONE distinctbuild-only+strictarchiveverify; no newnativeworld/server/browser/Done.

- 2026-10-07T12:54:44.9304362+03:00 : ONEV2build strictCURRENT PASS426inputs/3271191B source28604a77,56artifacts9180311B artifact81b2dd58,ZIP5789016B/483entries f79a9622 UUID681cf4e3-ebb0-4b7b-993d-b83e02278333. Original410+10raw exact,emptycaptures. Root reviewedresults/launchedsamebuild server5219session64677PID59532 ready;Chrome1242658637 AUTO Notstarted. Freshphysicalforeground/keys questionpending, noacceptance/Done.

- 2026-10-07T12:59:09.1156531+03:00 : V2AUTO capture20261007T095532925Z INCOMPLETE: trustedR90s wait09:55:32.914–09:57:03.221Z,zero keys1row; RAFhealthy6.9ms focusvisibletrue stickyfalse priorrender0.1ms. All15cleanupzero. Userreportedinputafterterminal; noPASS. DistinctV3SOURCE humanprotocolRomanianvisibleguide/manualRun preparation authorized without90s/250ms/physicsgatechanges; noblindretry/frozen426mutations.

- 2026-10-07T13:13:44.3569530+03:00 : V3SOURCE12fingerprintf847d35de99a10fa6461b6e6fb7c0ee6fa8dbe862708217d4352ff1d15e3b4a2 reviewed guide/ack-beforeallocation/runtimediff/countdown. Same90s/250ms/native/trusted/gates preserved,original426V2inputs/failures exact. SoleCPU scopedserialfinite authorized, nobuild/server/browser/Done yet.

- 2026-10-07T13:31:10.8405996+03:00 : V3finite actualPASS24pure/BOTHtypes/lintformat7syntaxarchitecture,source12fingerprint8220f45d9018257db30644b341a53180d55662e666e32dc1d65fafee59a58040;original426+26rawexact. Root reviewedbuilderdiff and authorizedONEbuild-after-03+strictCURRENTverify, waitsactualterminal; no server/browser yet.

- 2026-10-07T13:33:59.1829096+03:00 : V3ONEbuild strictCURRENT EXIT0 UUID4dca6047-e014-48c2-86c1-98a00720f881 source1acc2a88/438inputs3371938B artifactd7340b3d/56files9185647B ZIPbbab1174/5823020B495entries. Original426+26rawexact emptynewcaptures. Rootreviewedactualsummary launchedserver5221session77220PID109068;Chrome1242658653 AUTO completeRomanianguide/ack visible Notstarted. RoothandsmanualSTART userafterguideandforeground,firstclickcanvasR announcedbeforeSTART; exclusiveCPUreserved untilterminal. Noacceptance/Done.

- 2026-10-07T13:38:21.3194565+03:00 : ActualV3AUTO20261007T103530434Z FAILED open005contract atBLOCKEDRtick391;19trustedkeys R/W+D/RECOVER observed391rows/native571, eventVEHICLE_RECOVERED at390 delivery027025005007. Primary005CLOSEDsegment reused byfixtureafteracceptedretry;productionguardcorrect. RAFhealthy6.9ms focusvisible,15cleanupzero. Rootreadraw+runtime segmentread/write andappboundary; V4SOURCEonly freshOPEN005boundary afterclosedproof+neutralstep authorized preservingoldclosedrecord/ticks/gates/frozen438/raw. No furtherkeys/oldretry/Done.

- 2026-10-07: Probele fizice V5 pe AUTO/WebGPU (20261007T131805741Z, raw7982d4fc) și WEBGL2 (20261007T132411491Z, raw684b3a17) au trecut cititorul strict independent EXIT0, sedan și compact, cu inputuri trusted și câte394tickuri/caz. Corecțiile fixture-ului păstrează noul boundary OPEN005 după recuperare, înregistrarea ambilor participanți029 și candidata upright din rezultatul RECOVERED doar pentru cazurile standalone; readback-ul nativ pentru obstacolul mobil rămâne brut. Diagnosticele sintetice sunt separate și nu substituie tastele fizice.

- 2026-10-07: Buildul fizic V5 UUIDc2bc0f6c-3d95-44f9-8f5e-a3c200379e94 source21bc4963/artifact84620784/native02dc, 568inputs/56artefacte/ZIP759e44d8, a trecut build-only CURRENT EXIT0/0. Hardware AFTER AUTO20261007T152711164Z a încheiat15:52:12.195Z, WEBGL2 20261007T165106225Z17:16:07.320Z; fiecare10runs30s/120s. Parent verify-after-set.mjs EXIT0 requiredPASS BOTH:20runs/1160comparisons, absolute/relative față de BEFOREoriginal și JSproxy agregat, cleanupzero și nativeAFTER4 exactbound. Metricile opționale GPU/input, memoria nativă/retainedRAM și jocul complet rămân nemăsurate; overallUNVALIDATED este păstrat. Capturile failed și baseline-urile originale rămân intacte. Integrarea în main, review-ul independent final, verificările integrate, mutarea Done și commit/push sunt încă pending.
