---
id: "068"
title: "Schimbare rapidă între taxiuri și civile"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["067","018","017"]
performance_checks: ["simulation", "memory", "frame"]
owner: "Codex gpt-6.1-sol medium vehicle-switch-01"
started_at: "2026-10-06T03:07:33.815Z"
completed_at: "2026-10-07T03:30:09.4429158+03:00"
---

# 068 Schimbare rapidă între taxiuri și civile

## Obiectiv

Leagă selectarea din lume și din flotă de vehiculul urmărit.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 067 trebuie să existe în Done înainte de începere.
- PBI 018 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Selecția schimbă doar ținta camerei; vehiculul nou rămâne AUTO până la M/L explicit.
- [x] Vehiculul părăsit în MANUAL/LEARNING închide segmentul și reia AUTO, cu ruta/cursa păstrată.
- [x] Nu există teleportare și maximum un vehicul primește inputul jucătorului.

## Verificare

Testează selectare în AUTO, MANUAL și LEARNING, taxi–taxi, taxi–civil și entitate nevizibilă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

## Dovezi de finalizare

Rezultat implementare: Ownerul public068 leagă pickingul018 și lista de taxiuri de camera017 la tick fizic acceptat. Noua selecție rămâne AUTO; plecarea MANUAL/LEARNING este eliberată prin066 și închide segmentul005 cu VEHICLE_SWITCH, păstrând ruta/cursa. Intențiile, ticketul și proiecția sunt plafonate, cu fencing pentru identități native și fault terminal fără rollback fictiv.

Verificări executate și rezultat: npm run check în main PASS,577/577 teste, ambele configurații TypeScript/lint/format/architecture. Referința nativă cronologică34lumi și AFTER34lumi/640cicluri, browser BEFORE și SHORTv2 ambele backenduri, STEADYv4 ambele20arms+20lifecycle/backend trec reader-ele originale în modul istoric din main. Arhivele/source/native/ZIP/raw/checkpoint/paritate/cleanup sunt verificate;2740 blobs de dovezi au bytes exact identici cu indexul Git. Importul public și codul runtime după corecția importului de tip sunt verificate. Dovezi: [rezumat](../../Docs/Evidence/068-vehicle-switch/current-delivery-summary.md), [verificări main](../../Docs/Evidence/068-vehicle-switch/parent-integration-checks-01/results.json), [audit raw](../../Docs/Evidence/068-vehicle-switch/parent-integration-checks-01/raw-index-proof.json).

Fișiere și documente actualizate: src/input/vehicle-selection.ts și index.ts, teste pure/native/browser, scripts de benchmark și verificare, Docs/vehicle-switch.md, Docs/README.md, Docs/Evidence/068-vehicle-switch și regula .gitattributes pentru arhive byte-exact.

Limitări sau follow-up: Scope timpuriu desktop AMD Chrome1920×1080/DPR1. Comparatorul steady istoric PRE068 a fost colectat după implementare și shared029; referința nativă cronologică rămâne distinctă. Proxy JS heap cu perechi2/5 WEBGPU și1/5 WEBGL2 depășite, aggregatePASS la pragul neschimbat3/5. GPU timing/input latency/RAM totală/WASM exact/laptop/joc complet/training neobservate. Intențiile de selecție sunt scriptate; nu se pretinde tastatură fizică. Segmentele reale005 folosesc samples goale; recorderul069 și dispecerul complet rămân task-uri ulterioare. Importul type-only public/export API este delta ulterioară capturilor, cu cod transform identic; arhivele sunt validate istoric, nu CURRENT. Toate încercările eșuate rămân păstrate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '068' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-06: Prerequisite017/018/067 fizic Done și RequireDone PASS. Designul introduce selecție plafonată, țintă camera fără preluare implicită, eliberare la tick acceptat și port obligatoriu de segment cu readback CLOSED real; lipsa serviciului respinge înainte de fizică. Selecția în pauză rămâne pending până la resume. Se pregătesc34 lumi BEFORE și referința browser pe contractele publicate, fără implementare068 sau execuție încă.

- 2026-10-06: Referința BEFORE unică sourcee8d9c7cd249f3633a58ad077632d72e2c0c55cdb86cb5a1dedec08dd3fd5afd5 a eșuat în prima lume110 OFF la tick584, gardă0.7m/tick;10 lumi70 au trecut numeric3.33–3.52ms, dar nu există PASS34lumi. Captura și arhivele sunt imuabile. Diagnosticul separat unic source8e1827f95d2fffce2f5f447ea02dfc4f5fd15ec9119774962eb231fe03435b24 a reprodus car-100/.700704m la42.0337m/s, mișcare nativă susținută, fără acțiune de selecție la584 (camera revine la581), scrieri driving pose/velocity0, cleanupzero. Review independent a reverificat121 intrări/native/contoare și arată că limita numerică provine din fixture-ul browser cu2 corpuri, fără cerință universală în contractul068. Se pregătește numai în surse o referință distinctă cu guard pentru toate căile de mutație ale hostului și egalitate fizică exactă în jurul settlement-ului selecției, fără schimbarea fizicii/pragurilor de performanță ori acceptare a capturii eșuate. Producția068 rămâne absentă.

- 2026-10-06: Review independent al referinței distincte v2 a închis problema de ownership la achiziție: cleanup se înregistrează înainte de auditul suprafeței native; testul adversarial păstrează cauza originală și contoarele reale când dispose eșuează. Guardul interceptează toate căile de mutație și verifică exact pointerul, transformarea și viteza tuturor corpurilor, cu serial nativ neschimbat în settlement. Protocolul34lumi/180warm/600ticks/5perechi și bugetele rămân intacte. Sunt autorizate verificările scoped și6 teste pure înainte de o captură v2 distinctă; captura nativă și producția068 nu sunt încă executate.
- 2026-10-06: Referința cronologică distinctă BEFORE-v2 sourcefcb9a71661d7630cfbb137ba08b176fef1a6ed0927ed50c4e438b0d12809cace a trecut34 lumi (20 flotă+12 clasă/mod/tip+2 guards) și verifierul CURRENT, inclusiv review independent122 surse/native/hashuri. Native02dc4,340,292bytes arhivat04:00:34.003Z înainte de prima lume04:00:34.073Z; captura s-a încheiat04:01:36.313Z.834 probe selecție și264 probe mod păstrează exact identitate/transform/viteză/serial; input/fizică/checkpoint identice OFF/ON, guardviolations0 și cleanupzero. Normal70p95 3.816–4.223ms sub5.5; stress110p95 5.508–6.326ms raportat overload, fără afirmație de PASS absolut. Maxima nativă110 .912332m/tick la54.729129m/s rămâne raportată fără clamp. Originalele e8dFAILED și8e18diagnosticFAILED rămân hash-exact. Urmează numai autorarea harnessului browser BEFORE cu017/018 reale; producția068 rămâne absentă până la review-ul capturilor.
- 2026-10-06: Browser BEFORE a trecut efectiv pe WEBGPU și WEBGL2; arhiva source0e215d02/artifact3c3200b8 și ZIP e99ea932 rămân imuabile. Verifierul inițial a respins reprezentarea Vector3 serializată; readerul aditiv wire-v2, trei teste adversariale și verifierul CURRENT distinct au trecut fără modificarea capturilor sau gate-urilor. Runtime-ul029/ad32 a fost integrat izolat (8a8e4aa), typecheck și16 teste de producție068 au trecut. Harness-ul AFTER este încă în review pentru dovada generației vechi prin068 real și păstrarea datelor parțiale la eșec; nicio probă AFTER executată, PBI rămâne In Progress.

- 2026-10-06: Unica probă nativă AFTER source0f1c5376/132surse a trecut34lumi și validatorul complet CURRENT, reverificat independent de parent. Native02dc arhivat12:50:29.702Z înainte de prima lume12:50:29.784Z, final12:51:40.870Z.102fișiere per-world și640cicluri de owner păstrează datele brute, paritatea exactă cu fcb9 original și cleanupzero.70tickp95 4.585–4.863ms sub5.5, cost068 p95 .0203–.0245ms; regresii comune1/5, păstrate.110stress6.211–6.868ms și2/5regresii comune, fără PASS absolut normal. Pragul blocant rămâne3/5. Probe scurte/native sunt suplimentare; performance_checks frame/simulation/memory cer încă steady hardware. Planul pentru referința PRE068 istorică auditată și tratamentul actual este în surse, fără reinterpretarea originalului ca probă steady și fără mutare Done.

- 2026-10-06: Review-ul independent al browserului SHORT/STEADY a închis corecțiile de cauze/cleanup unic/heap real/ceasuri native și checkpoint-uri300..8700. După limita de utilizare a ownerului, parentul a continuat scoped checks:7/7 teste pure, typecheck/lint/format/sintaxă PASS; primele loguri și erori TS sunt păstrate, guard132 surse native CURRENT/archive exact. Build-ul scurt unic5205 (sourcec3081133/artifact7c6f2952/ZIP678419d0,144 intrări ZIP) a trecut strict; sursele sunt înghețate. Browserul și STEADY rămân neexecutate; PBI rămâne In Progress.

- 2026-10-06: SHORTv1 AUTO a eșuat14:21:35.483Z după BEGIN și înaintea admisiei native: Response body stream already read. Error-ul și cleanuprendererzero sunt păstrate (failureSHA26418b21); toate sursele originale CURRENT/archive rămân identice. V2 distinct citește corpul HTTP o singură dată, fără schimbarea mecanicii, gates sau baseline;3/3 teste Response200/409/malformedJSON și type/lint/format/sintaxă PASS. Build-ul unic5213 sourceb97f4e4e/artifacta692397d/ZIPa56becbd144 intrări a trecut strict. Hardwarev2 și steady rămân neexecutate; status In Progress.

- 2026-10-06: SHORTv2 AUTO și WEBGL2 au afișat PASS; verifierul independent CURRENT a trecut cu14 lumi/backend, comparațiile originale raw/paritate/control/cameră și cleanup. Textul scope moștenit al verifierului spune BEFORE, dar acestea sunt probe AFTER; această etichetă nu schimbă cronologia ori raw-ul. STEADY istoric distinct de329df6/artifact1183243b/ZIP9a1c8525144 intrări a trecut BUILD_ONLY după verificarea derivării originale0e/fcb9 și shared029 explicit. HardwareSTEADY încă neexecutat, fără acceptare de performanță completă sau Done.

- 2026-10-06: STEADY AUTO a pornit efectiv14:34:04.613Z, capturede329df6-webgpu, după confirmarea actuală a utilizatorului pentru50minute. Subagentul T3 r1 urmărește numai această captură cu wake automat/deadline15:39:12Z. Hardware exclusiv; alte verificări/world/build oprite. Niciun rezultat de performanță ori Done încă declarat.

- 2026-10-06: STEADY AUTO s-a încheiat FAILED14:41:36.281Z după3/20 brațe complete. Al patrulea CURRENT068ON a încălcat Warm actual RAF debt bound la prima așteptare RAF, tick0 și zero pași nativi; failureSHAaff0fde8 și partialSHAd0e2d2fd sunt păstrate. Cleanup nativ/renderer/listeners zero, viewport restaurat; drive-webgpu absent și nicio probă STEADY WEBGL2. Cauza scheduling rămâne necunoscută; pregătim diagnostic bounded separat înainte de o relansare lungă, fără schimbarea gate-urilor. SHORTv2 ambele PASS rămâne suplimentar; PBI In Progress.

- 2026-10-06: Verificarea parentului a reconstruit lossless toate4 world records și SHA/bytes exacte. Brațele0/2 trec validateArm; brațul1 este respins de cronologia strictă heapBeforeWarmup.readEnded282743.90000009537 > warmStarted282737.966 (+5.934ms), deși UI l-a etichetat PASS. Raportul parent-steady-partial-verification.json declară FAILED_FULL_CAPTURE/hardwareFullAccepted false; exit0 al scriptului înseamnă numai scrierea raportului. Review SOURCE separat în curs; nicio relaxare a verifierului înghețat.

- 2026-10-06: STEADYv2 distinct fixează numai dovada same-clock heap/request/callback și păstrează prima așteptare warm/4costuri anterioare înainte de guard.9/9 teste pure/type/lint TS/sintaxă9MJS/format PASS; original132surse+V1captură/ZIP/4raw exacte. Build unic5214 sourcefada7e2b/artifactef25deb1/ZIP90cb1f6a144entries3460928B strict BUILD_ONLY PASS. Hardwarev2 neexecutat. Diagnosticul separat5215 este pregătit82surse/141artefacte și8/8teste; așteptăm prim-planul fizic pentru4minute, fără Run încă.

- 2026-10-06: Diagnosticul separat5215 a încheiat ambelebackenduri și verificarea parentraw/provenance/counters/cleanup PASS, maxawait38.9/12.7ms; stallul full nu s-a reprodus, cauza necunoscută. Versiunea distinctă068v2fada este pregătită5214, cu cronologie corectă și capturewarmgap înainte de gardă; așteptăm disponibilitate nouă50min, Run încă neexecutat.

- 2026-10-06: STEADYv2 AUTO a pornit efectiv15:19:41.992Z după confirmarea actuală5214/50min. Capturefada7e2b-webgpu/sourcefada7e2b/artifactef25deb1; subagentul T3r1 urmărește această singură probă cu wake automat/deadline16:24:50Z. Hardware exclusiv, CPU/build/native oprite. Niciun rezultat complet sau Done încă declarat.

- 2026-10-06: STEADYv2 AUTO FAILED15:22:12.810Z după1/20 complete; parent rawintegrity/numericarm0 PASS9000ticks. REFON ordinal1 prima așteptare warm a primit din nou timestamp220598.588 (gap0ms), request220603/callback220603.2, serial/tick0, clockdebt0/overload0. FailureSHA007d96cb/partialSHA85c11176 păstrate. Acesta nu dovedește pauză250ms; mesajul gardă comună este imprecis. Cleanupzero/overridecleared; fără WEBGL2full, relansare identică sau Done. Review SOURCE separat pentru semantica callbackurilor duplicate și rawlossless înainte de următoarea versiune.

- 2026-10-06: V3 distinctă permite cel multun callbackduplicat doar la intrarea warm cu native/controller0/debt0, păstrat separat și urmat deun await250ms bounded cu cancelonce. Originea30/120 și gates rămân exacte; latestmeasuredcallback capturat înainte de toate guards, Windowwrappers revizuitepeer.19/19teste pure/type/lint TS/11MJSsyntax/format PASS; primulreaderinventarFAIL și4metadatafix păstrate. V1/V2/native132 hash-exact. Build unic5216 source08ece12f/artifactbff64143/ZIP4bafdee8 144entries3461611B strict BUILD_ONLYPASS. HardwareV3 încă neexecutat; așteptăm disponibilitate nouă50min, PBI In Progress.

- 2026-10-06: V3 AUTO a pornit efectiv17:06:18.985Z capture08ece12f-webgpu după disponibilitatea actuală5216/50min. T3r1 urmărește numaiaceastăcaptură cu wakeautomat/deadline18:11:40Z;1920DPR1 și hardwareexclusiv.030 continuăSOURCEizolat fărăCPUchecks; nicio acceptarefull/Done încă.

- 2026-10-06: STEADY v3 AUTO terminated FAILED at 17:56:26.804Z after 20/20 complete arms. Parent raw reconstruction validates all 20 and numeric comparisons PASS (all relative violations 0/5), but mandatory lifecycle cycle 1 failed before world acquisition: detached predecessor canvas CSS 0/internal 100. No drive-webgpu.json; full acceptance remains false. Original failure/raw/archive preserved. Distinct v4 source repair and bounded real lifecycle preflight are in progress; no completion or long retry authorized by this evidence.

- 2026-10-06: Distinct v4 SOURCE draft handed off by same resume219 agent (fingerprint742f1e65). Parent review reads actual canvas advancement, exact surface guard, acquisition-aware cleanup and strict separate 20-cycle per-backend lifecycle preflight; initial objections addressed. All v4 checks/build/browser remain unexecuted and queued after030 scopedCPU release. FULL still requires its own20arms+20lifecycle cycles; preflight does not substitute acceptance.

- 2026-10-06: V4 actual33pure/BOTHTypeScript/lint/14MJSsyntax/preservation EXIT0 independently read by parent. ONEbuild5217/session6755 and archive/CURRENTbuild verifier EXIT0: sourceeb7afa021bba156a4d926c89818aaec3b6899bfec4af4397311c41dde840e81d, artifactb22ff762e340e717b1f118f90fd681d48505239dd1eeea6130779e1115273be9, ZIPed61f31a58b4418294a6f7f4f3e8f604e7bafb91a3466b61bdf4f21aaee62390/143entries. Chrome5217 actualpage Notrun/AUTO ready; fresh physicalforeground4min availability pending for separate BOTH20cycle preflight. No actualworld/preflight/full acceptance yet.

- 2026-10-06: Actual v4 lifecycle preflight BOTH PASS: AUTO/WebGPU18:19:28.125–18:19:30.895Z and WEBGL2 18:19:48.633–18:19:53.090Z, exact20cycles/20worlds each, native/control0 and everyownerreadback/cleanup verified. Parent verify-lifecycle-preflight-v4.mjs CURRENT EXIT0 (sourceeb7afa02/artb22ff762/ZIPed61f31a). Scope PREFLIGHT_ONLY/fullAcceptancefalse. Chrome5217 AUTOprepared, temporaryviewportcleared; new50minavailabilitypendingbeforeFULL. Native030unitchecksgrantedserialwhilewaiting.

- 2026-10-06: V4 AUTO FULL actually started18:26:08.578Z afterfresh5217/50minphysicalreadiness and030CPUreleased. Captureeb7afa02-webgpu sourceeb7afa02/artb22ff762/native02dc/ZIPed61f31a immutable; actualUIRUNNINGWEBGPU1/20 after1920DPR1 setup. T3r1 asynchronousmonitor deadline19:31:15Z followsonlythis20arms+20lifecyclecapture; allCPU/build/nativeparallel suspended,030AFTERbrowserSOURCEonly. No fullacceptance untilterminalstrictverification.

- 2026-10-06: V4 AUTO/WebGPU actualFULLPASS19:16:17.124Z, terminal19:16:17.279Z,20arms20lifecycle40worlds/cleanupzero. Parent additive single-backend derivative of unchangedstrictBOTHreader EXIT0 raw103839529B/all20SHA-parity/native/mechanics/source/artifact/ZIP/lifecycle; frame/work/allobserverviolations0/5, JSproxy memory2/5 aggregatePASS unchanged3/5gate, TRACKED_NONSTANDARD_HEAP_ONLY. Report4f014308...390KiB preserved; originalBOTHfullverifier notexecuted untilWEBGL2. Chrome5217 WEBGL2selected; fresh50minavailabilitypending. PBI remainsIP.

- 2026-10-07 local: V4 WEBGL2 FULL actually started2026-10-06T23:29:08.238Z afterfresh5217/50minavailability. Samefrozen sourceeb7afa02/artb22ff762/native02dc/ZIPed61f31a, captureeb7afa02-webgl2; actualUIRUNNINGWEBGL2 1/20. AUTO strictsingle-backend PASS and allraw preserved. T3r2 asynchronousmonitor deadline2026-10-07T00:34:20Z; originalBOTH verifier grantedonlyaftergenuineterminalsuccess. Temporary1920DPR1 applied; CPU/build/nativeparallel suspended,030 SOURCEclosure only. No Done/fullBOTHacceptance yet.

- 2026-10-07: WEBGL2 FULL a trecut efectiv la00:19:20.063Z (terminal00:19:20.199Z),20arms20lifecycle40worlds, reportSHAce88702a; verifierul original BOTH CURRENT EXIT0 verifică raw/source/native/artifact/ZIP/paritate/gates/cleanup. WEBGPU și WEBGL2 frame/work/observer0/5, heapproxy2/5 și1/5 aggregatePASS; GPU/input/exactRAM neobservate explicit. Verificările finale577/577teste, ambeleTypeScript/lint/format PASS; architecture FAIL import de tip direct între module. Corecția îngustă a importului public și exportului API este în curs, cu dovada identității codului runtime și păstrarea capturilor ca arhive istorice; fără Done ori commit final încă.

- 2026-10-07: Implementare0bf31b3 integrată serial în main; toate verificările proiectului577teste și cele4readere originale istorice PASS. Auditul2740blobs de dovezi este exact, inclusiv arhivele eșuate; corecția type-only păstrează codul runtime. Criteriile sunt închise în scope timpuriu, cu limitele documentate și fără relaxarea gates. Mutare fizică Done și verificare RequireDone068 urmează în aceeași tranzacție de livrare.

- 2026-10-07: Fișierul mutat fizic în Done, RequireDone068 PASS; ValidatePlan235/1254links PASS după includerea explicită a179loguri ignorate global. Toate probele și erorile istorice sunt păstrate, iar boardul are48Done/3InProgress/184ToDo. Publicarea urmează commitului de integrare.

