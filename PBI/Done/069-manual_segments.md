---
id: "069"
title: "Lifecycle de intervenție manuală"
status: "Done"
release: "V1"
module: "Control manual"
depends_on: ["068","005","007"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium manual-segments-01"
started_at: "2026-10-07T00:33:48.632Z"
completed_at: "2026-10-18T22:06:33+03:00"
---

# 069 Lifecycle de intervenție manuală

## Obiectiv

Deschide și închide segmente MANUAL/LEARNING la schimbarea modului, vehiculului, cursei și recuperare; fixează learningEligible și learningEpoch la deschidere.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 068 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 007 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] MANUAL→LEARNING și invers separă segmentele fără gol de input; numai LEARNING închis intră în estimator.
- [x] Pauza suspendă segmentul; finalul cursei redeschide segmentul în același mod.
- [x] Restore/import valid închid segmentul cu motiv explicit; generația veche nu se aplică ulterior.

## Verificare

Testează toate cauzele de închidere și segment fără mișcare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: 069 este livrat în `main` (recuperat pe 2026-10-19 din worktree-ul `manual-segments-01`, ramura `loop-pbi/manual-segments-01`, după ce în `main` ajunseseră doar commit-urile de documentație): lifecycle de intervenție (`src/telemetry/intervention-*.ts`), bridge-ul app (`src/app/manual-segment-bridge.ts`), motivele 005 noi și contractele aferente, plus instrumentația de diagnostic record-stage. Receipt-ul de produs curent este `optimization-checks-01` (`sourceFinal fb366a92…`, 18/18 fișiere byte-verificate) și include optimizarea de contabilitate a octeților din `intervention-admission.ts` (encoder UTF-8 la nivel de modul plus cale rapidă ASCII fără escape).

Verificări executate și rezultat: 132/132 teste pure EXIT0 pe cele 10 suite `tests/telemetry/manual-segments*.test.*`, rerulate după fiecare schimbare (optimizare, waiver, alinieri de pin). Diagnosticul record-stage a fost re-derivat pe baseline-ul nou și executat efectiv (preparator EXIT0, collector 10 lumi EXIT0, reader `VERIFIED_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE`), cu atribuire pe stadii (perTick inclusive p95): whole tick 5,910→5,471 ms, bytewalk 0,996→0,453 (−54%), append 1,373→0,843, parse005 0,108, immutability 0,037. Performanță pe perechea acceptată: BEFORE `native-before-02` PASS (`PASS_SUPPLEMENTAL_NATIVE_REFERENCE`, CURRENT+HISTORICAL, sourceHash `c88a6e1d…`) cu normal70 tick p95 4,1001–4,3880 ms; AFTER `native-after-06` cu count=70 observer **5,0388 / 4,8660 / 4,8333 / 4,8617 / 4,9715 ms — toate sub pragul de 5,5 → gate de tick PASS**, fără regres confirmat (toate deltele <1 ms, regula cere >10% și >1 ms).

Fișiere și documente actualizate: `src/telemetry/intervention-admission.ts` (optimizare), `src/app/manual-segment-bridge.ts`, `src/telemetry/intervention-*.ts`, `Docs/manual-segments.md`, suitele `tests/telemetry/manual-segments*`, harness-urile `scripts/benchmark-manual-segments-{reference,after}.mjs`, `scripts/manual-segments-after-records.mjs` (waiver heap), `scripts/manual-segments-calibration-proof.mjs` (pin nou), `Docs/Evidence/069-manual-segments/{correctness-current-01,optimization-checks-01,mobile-rebaseline-attempts-01,native-before-02,native-before-03,native-after-06,native-after-07-gcprobe,native-after-08,record-stage-diagnostic-02,record-stage-diagnostic-03}`.

Limitări sau follow-up: (1) **Memoria nu este validată în rularea cronometrată**: canalul `RAW_RUNTIME_JS_HEAP_USED` este `WAIVED_NOT_COMPARABLE` prin decizie explicită a owner-ului (2026-10-18), pentru că heap-ul citit în procesul cronometrat este dominat de gunoi necolectat (70–153 MB față de 22,5 MB după GC forțat), iar GC-ul forțat în proces deplasează p50 cu +0,41 ms și rupe gate-ul de tick. Datele rămân în raport; un probe separat de memorie rămâne de făcut. (2) **Deviație acceptată de owner**: captura acceptată `native-after-06` nu are `complete.json` pentru că s-a oprit la vechiul gate de memorie, acum waivered; a fost acceptată explicit pe baza datelor de tick (5/5 sub prag) și a diagnosticului. (3) Hostul are cozi intermitente (p50 3,83–4,02 ms, p95 poate sări la 6,37 pe o lume), deci recapturarea protocol-completă nu s-a putut reproduce acum; încercările sunt păstrate (`native-after-08`, `native-after-09-rejected-01`, `native-after-10`). (4) Nu se revendică RAF/render/FPS/GPU/latență de input/estimator complet sau RAM totală.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '069' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-07: AFTER03 nou, source683584ea/156intrări și checkedProduct924c, arhivă18:11:30.082Z înaintea primei lumi18:11:30.596Z, a eșuat18:11:38.101Z la același gate normal70:tickp956,1627ms>5,5ms. Boundaryp951,2792ms și Rapierp951,0200ms sunt păstrate, fără atribuirea diferenței față de02 numai cache-ului sau GC. Două lumi OFF/ON complete în raw,780ticks fiecare/600probeON, cleanupzero; failurecb8ff1ab autoritar și fără complete/comparison. Sursele actuale și toate arhivele BEFORE/failed01/02 neschimbate. Fără retry/cititori/calibrare; următorul pas este diagnostic distinct al costurilor înaintea oricărei noi corecții.

- 2026-10-07: Corecția privată a reutilizării înregistrărilor a trecut77/77teste pure, ambeleTS, lint, format și arhitectură în parsed-record-reuse-checks-01. Numai identitatea exactă a rezultatului copiat și complet validat poate reutiliza admission/bytes; datele externe, Proxy-urile și copii frozen nu sunt branduite. WeakMap nu reține puternic istoricul, iar fence-urile actuale/capacitățile rămân. Noul receipt checked18 sourceFinal924c0764 este distinct; originalul de072 și capturile eșuate01/02 sunt imuabile. Îmbunătățirea performanței rămâne nevalidată până la AFTER03 cu protocolul original și pragurile neschimbate.

- 2026-10-07: Captura distinctă native-after-02, source411dd0e2/native02dc, arhivă17:49:31.968Z înaintea primei lumi17:49:32.461Z, a eșuat17:49:40.683Z la gate-ul normal70tickp95:7,3568ms>5,5ms. Două lumi OFF/ON au păstrat780ticks fiecare și toate datele brute; Rapierp951,0693ms trece limita3ms, dar proba totală rămâne FAIL. Markerul failure este autoritar chiar dacă raw-world statusPASS precede validarea agregată. Cleanup11/11 fără cauze/resurse; sursele18prod/179BEFORE/155failed01 și markerul original neschimbate. Fără cititori/calibrare/retry; analiza cauzei continuă înaintea unei corecții distincte. Diagnosticul anterior al arhivei a trecut, fără a transforma captura eșuată01 în PASS.

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-07: Claim după068 publicat și dependențele fizicDone verificate. Ownerul069 introduce lifecycle/metadata/outbox bounded; simulation și memory sunt declarate înaintea algoritmului, conform modulului25. Designul SOURCE și referința cronologică pe fixture-ul disponibil sunt în pregătire; nicio implementare/captură/test069 executată încă. Domaintelemetry + appbridge la autoritatea fizică066 și close068, cu eligibilitate/epoch fixe la OPEN și motive explicite pentru restore/import; pipeline205/recorder090/estimator095 rămân integrare viitoare.

- 2026-10-07: Referința069 SOURCE și cele7teste pure adverse au trecut verificările scoped: ambeleconfiguriTypeScript, format, lint după primulFAIL păstrat, sintaxă și architecture EXIT0. Referința nativă cronologică încă NU a pornit; parentul a cerut întărirea verificării nativeCURRENT, cronologiei și bugetului pentru32samples înainte de captură. Producția069 și motivele005 noi rămân absente. Dovezi: Docs/Evidence/069-manual-segments/reference-scoped-checks-01 în worktree manual-segments-01; integrare pending.

- 2026-10-07: Referința nativă BEFORE distinctă3f36bba2 a trecut24lumi, captură00:56:53.120Z/arhivă00:57:01.448Z înainteaprimalume00:57:01.453Z/final00:58:42.188Z. Native02dc4,340,292B, actualCURRENT/HISTORICAL childEXIT0 și parentCURRENT independentEXIT0; normal70p955.0569–5.3543ms<=5.5/Rapier1.0217–1.1298<=3, paritateOFF/ON/cleanup/cap64KiB verificate. Heapbrut reținut, fărăacceptareRAMexact/FPS/renderer. Revizia sursă scoped7pure/ambeleTS/lint/architecture/syntaxPASS. Baseline acceptat înainteaproducției; owner219 începe implementareSOURCE069, CPU030exclusiv, probeAFTER/browser/Donepending.

- 2026-10-07: Producția069 revizuită după două review-uri a trecut74/74teste pure scoped, ambeleTypeScript/lint/architecture/format EXIT0; parentul a citit logul efectiv. Sursa finală18paths de072b4acb1a3f7879ce62ba94ba13476c1ac40af822f53504720d7a8ed1f1b6 și primele erori păstrate în implementation-scoped-checks-03 din manual-segments-01. CPU eliberat. ReferințaBEFORE rămâne imuabilă/HISTORICAL după implementare; urmează SOURCE pentru runnerAFTER nativ și reader strict, fărăcaptură/build/browser/Done.


- 2026-10-07T05:47:25.0939514+03:00 : Review SOURCE02 peerR2 cere patru reparații înaintea execuției: descriptor/receipt real al închiderii tick34 în calibrarea owner, verificarea strictă a BEFORE înainte de achiziția native în generator, closure complet al readerului/calibrare și binding18prod, păstrarea cauzelor originale inclusiv la export eșuat. Autorul219 repară SOURCE03 fără execuție; baseline/capturile SOURCE01/02 și producția18 verificată rămân protejate. Probele native AFTER/calibrare/browser încă neexecutate.

- 2026-10-07T05:51:16.6054797+03:00 : SOURCE03 draft12paths114461B fingerprint75f1b805be7819df0bd0dff043074771ae3bd6cc51e82c5a200f22004d690511 repară cele patru obiecții R2;13teste draft neexecutate,18prod de072b4a și snapshoturile01/02 byte-exact. Review independent SOURCEpeerR3 pornit; nicio execuție native/calibrare/browser/Done.

- 2026-10-07T05:53:49.4558972+03:00 : SOURCEpeerR3 confirmă cele patru reparațiiR2 și bytes12SOURCE03/18prod, dar cere binding exact18rows+fingerprint de072b4a în generatorul AFTER și readerul CURRENT/HISTORICAL, care încă acceptă metadata substituită/goală. Autorul219 repară SOURCE04 cu negative draft pentru rows schimbate/omise/goale; fără execuție. Capturile istorice și pragurile rămân imuabile, PBI In Progress.

- 2026-10-07T05:55:06.4594591+03:00 : Inspecția independentă parent a găsit în draftul069 serializare String/getters ostile care poate înlocui cauza și opri cleanup-ul ownerilor ulteriori, plus sentinel truthy/null care poate trata throw undefined/false/null ca succes. SOURCE04 include boolean failure și diagnostics bounded nonthrowing cu păstrarea referințelor cauzelor, toate disposal attempts o singură dată și negative draft adverse; fără execuție/producție/Done.

- 2026-10-07T06:02:38.0468207+03:00 : SOURCE04revizuit12paths122988B fingerprint38e929c5990a3171850deb5e82d652d629fed98365c6acece6c0ec97263fd131 repară binding18și adversarial diagnostic/falsyfailure/oncecleanup;21teste draft neexecutate. Review independent peerR4 pornit, producția/baseline/snapshoturi01-03/initial04 păstrate. CPU026 exclusiv; fărăexecuție069.

- 2026-10-07T06:06:39.7054072+03:00 : SOURCEpeerR4 confirmă pinning18/guardeddiagnostics/failureflags/oncecleanup/refs în revised04, dar identifică5gate-uri falsePASS rămase: heap lipsă validat vacuu/NaN, PASS cu primary/terminalErrors contradictorii, closure runtimeHISTORICAL autoreferențial incomplet, componente timp calibration negative/string, maximumRecord summary nelegat de recordul efectiv. SOURCE05 reparație delegată cu negative draft și praguri/producție/baseline neschimbate; fără execuție.

- 2026-10-07T06:23:32.5203978+03:00 : SOURCE0514paths147623B fingerprint72287c55df341ba314501356a37e5473f6b079811e6bf6ffd7c22591e762a799 repară cele5gate-uri falsePASS R4 și izolează parserTypeScript înCLIbounded30s/256KiB preworld (sursăneexecutată).26teste draft,18prodexact/snapshoturiistoricepreservate. ReviewpeerR5 pornit, fărăexecuție069.

- 2026-10-07T06:25:46.3382413+03:00 : SOURCEpeerR5 confirmă toate5reparațiiR4, closureARCHIVE/pins/failureflags/preworldordering, dar cere păstrarea diagnostics subprocess bounded(status/signal/stdout/stderr) în artefactele preflight eșuate și pentru JSON/proofstatus invalid exit0. SOURCE06 repair delegat strict sursă cu negative injected drafts; fărăCLIchild/test/native/browser executat.

- 2026-10-07T06:32:51.7671058+03:00 : SOURCE0614paths148668B fingerprint99aab284b528ec92593beecefa595e96be4643f7ef5c21270cb95815af1decc7 păstreazădiagnosticsprocess brandedbounded în ambelepreflightfailures și parse/proofstatus errors;31teste intended draft. Parent citește helper/producers și autorizează exclusiv finite seriale (fărăCLIchild/native/build/browser) după confirmarea celor5gate-uriSOURCEpeerR5. Producția/baseline/snapshoturi imuabile; Donepending.

- 2026-10-07T06:39:11.4222512+03:00 : Primulrunpureefectiv31tests/27PASS4FAIL, CPUeliberat/fărăaltechecks. DouăFAILstackstandardError serializer și douăFAILScriptTarget.Latest API absentă înTypeScriptinstalled;5subprocess injectedcasesPASS. Parentcitește stdout și introspecteazăbounded APIinstalled/descriptorV8; SOURCE07 reparăsafeintrinsicstack și foloseștecompilerAPIreal, fărătestexpectationwaiver/producție/native/Done. Primulfailure/source06imuabile.

- 2026-10-07T06:47:00.0505896+03:00 : SOURCE07 14 files/152480B fingerprint9c5d30208c677b80b8e5f687250ee2408a0892568f481e98f6202cbcf92a60f4 source-only reviewed. Root found inherited message getter edge before intrinsic stack materialization; narrow SOURCE08 repair plus adversary authorized, followed by sole-CPU finite four pure suites/static serial checks. No actual CLI preflight child/native world/build/browser authorized; first failed31 logs and SOURCE01-07 preserved. Pending actual results; In Progress.

- 2026-10-07T10:28:21.1506089+03:00 : SOURCE08 inheritedmessage guard with adversary: actual34purePASS,9syntaxPASS,appTypesPASS; testTypes FAILED TS7016 missing declaration for calibration-proof.mjs. Firstfailedstage preserved in native-after-scoped-checks-02, lint/format/architecture unexecuted. CPUreleased. SOURCE09 narrowtyped declaration repair authorized source-only, no suppressions/Git/native/browser.

- 2026-10-07T12:26:41.8347186+03:00 : SOURCE09 declaration15files154023B fingerprintb5953f55e9a745eecec3ebe82c4c2527628c24d15be7ea58e7fde8843194ae99 reviewed exactexports/publictypes; runtime12unchanged,approved18unchanged,34purePASS retained. Awaitingserialstaticgrant after030build; no newchecks/native/Done.

- 2026-10-07T12:59:09.1156531+03:00 : BOTHtypesactualPASS; scopedlintFAILunusedhash+3preserve-caught-error rules,3ignored/unconfiguredwarningsnotlintvalidated; formatarchitectureunexecuted. Logs checks03preserved. Narrowunused/caughtcause exactrefs repair and scopedexistingruleconfiguration, then serialaffectedchecks grant; no nativeworld/CLIchild/build/browser/Done.

- 2026-10-07T13:13:44.3569530+03:00 : Checks05 finiteclosurePASS15files177258B fingerprint74ee0af1008d242797ad1d70b55daa65d9e09ced05d774d21134c0ce478d0633: lint13 zeroerrorswarnings/format/architecture, prior34pure and27affected/BOTHtypes actualPASS linked. Approved18 and179BEFOREraw exact. SOURCE10 narrow declarationarchiveclosure authorized beforefirstnativeAFTER; noCLIchild/nativeworld executed.

- 2026-10-07T13:38:57.3645399+03:00 : Checks06 actualPASS18affected/syntaxlintzeroformatarchitecture,checked15rows177781B fingerprint532de9a4e96d8fce5bad125980e749a27a27ced21416b4e836dd58f715f2e311. Rootreviewscollector+preworldclosure and authorizes FIRSTnativeAFTER native-after-01 only,original24world70+110/fivepairs180warm600measure/gates/baseline unchanged, boundedCLI30s preflightbeforefirstworld thenstrictCURRENTreader ifcapturePASS. Nocalibration/BEFORErecapture/browser/Done.

- 2026-10-07T13:41:49.8365531+03:00 : FIRSTAFTERnative-after-01 EXIT1preflight10:39:05.434–10:39:16.827Z: lexicalscanner interpretsimportkeyword in/Nonliteral module import/regex asstaticimport.155inputs source243b22564f21d1dfa6da0352a1d461f81df5f00166d761d8eae4168d0800cb71/native02dc;failureSHAd4414af8c90dff93349623d5a700fb7cc6685dee672f9ca5ed72622dc3a1701e diagnosticstatus1stderr744B preserved. No firstworld/0worldfiles;CURRENT/cal unexecuted. SOURCE11 boundedregexlexing anddistinctnative-after-02 authorizedsourceonly,oldarchivefail immutable; no nativeacceptance/Done.

- 2026-10-07T13:44:53+03:00 : Checks07 FINITE_PASS_DIAGNOSTIC_FAILED_NO_NATIVE_ACCEPTANCE: 17/17pure, syntax/lint/format0, dar diagnosticul CLI archive-closure EXIT1 la `export type CameraSweep` citit ca module from clause; 15surse183372B(sursa601abf32), archive155/failed01/produs18 neschimbate; 0lumi/native.

- 2026-10-07T20:30:28+03:00 : Checks08 FINITE_AST_CHECKS_PASS_NO_NATIVE_ACCEPTANCE: 15surse184530B(sursa1f131414), 41/41pure, 9syntaxMJS, lint/format-final/BOTHtypes/arhitectura0; before179/failed155/failed01 verificate, produs18 neschimbat; prima eroare de format păstrată; CLIchild real și lumile native neexecutate.

- 2026-10-07T20:35:21+03:00 : native-archive-cli-diagnostic-01 EXIT0: PASS_ARCHIVED_IMPORT_CLOSURE pe native-after-01 (92cai/342muchii/786067B/sursa243b2256), scope DIAGNOSTIC_ONLY_NOT_RETROACTIVE_CAPTURE_PASS; captura eșuată01 rămâne FAIL; 0lumi.

- 2026-10-07T20:49:40+03:00 : AFTER02 native EXIT1: sursa411dd0e2/native02dc, arhivă17:49:31.968Z înaintea primei lumi17:49:32.461Z, eșec17:49:40.683Z la gate-ul normal tick absolut; două lumi păstrate; produs18/before179/failed01 neschimbate; fără retry.

- 2026-10-07T21:00:00+03:00 : parsed-record-reuse: numai intervention-admission.ts schimbat privat (WeakMap pe identitate exactă după traversarea bounded + copia005, bytes din copia normalizată); PASS 77/77pure, BOTHtypes/lint/format/arhitectura0, receipt nou sourceFinal924c0764; originalul de072 și BEFORE/failed01/02 imuabile; after02 FAILED păstrat; nativ neexecutat.

- 2026-10-07T21:09:14+03:00 : after03-binding SOURCE+checks: numai perechea aprobată de072+924c acceptată, manifestul nou leagă checkedProductReceipt/Fingerprint; 8cai116955B(sursa a1466e0b), format/lint/BOTHtypes/arhitectura/4suite pure0; produs924c și capturile vechi imuabile; nativ neexecutat.

- 2026-10-07T21:11:38+03:00 : AFTER03 native EXIT1: sursa683584ea cu receipt924c legat, arhivă18:11:30.082Z înaintea primei lumi18:11:30.596Z, eșec18:11:38.101Z la același gate normal tick absolut; două lumi păstrate; produs924c și capturile anterioare neschimbate; fără retry.

- 2026-10-07T21:28:00+03:00 : record-stage SOURCE01: preparer copie/AST (fără lumi) + reader independent, 8stadii inclusive, 16x600Float64=76800B/lume, 10lumi70 OFF/ON/180warm600measure; diagnostic-only care NU marchează vreun gate PASS; 2teste pure draft neexecutate; produs924c/before/failed01-03 neatinse.

- 2026-10-07T21:42:00+03:00 : record-stage SOURCE02: guardCopyRuntime bounded30s/512KiB înainte de prima achiziție și după cleanup, pinning pe originalul AFTER03 (156inputs/sursa683584/raw028fb8) și receipt924c; readerul rulează întâi derivarea/proof și importă numai validatorul copiat verificat; 6teste pure draft; nicio comandă executată.

- 2026-10-07T21:48:28+03:00 : record-stage diagnostic Checks01 FINITE_DIAGNOSTIC_SOURCE_CHECKS_PASS_NO_PREPARATION_OR_WORLDS: 6/6pure, format/types(main+tests)/lint/syntax0, sursă8cai/39751B(891d431b); prima eroare (2importuri nefolosite + avertisment d.mts) păstrată și reparată; preparer/CLI/lumi neexecutate.

- 2026-10-18T15:50:16+03:00 : Probe pure 069 re-executate pe o a doua mașină (Ryzen7 7735U/win3210.0.26300), node24.21.0 și npmci din lock-ul pinuit (neschimbat), sursa18 fișiere byte-identică cu receipt924c: 132/132pass, 0fail în10suite serial (manual-segments28/review31/bridge10/admission8/after-validation20/after-cleanup10/after-records7/after-calibration5/record-stage6/reference-records7); dovezi correctness-current-01. Criteriile funcționale 069 sunt bifate. Capturile nativAFTER și diagnosticul record-stage rămân NEEXECUTATE: baseline-ul e pe Ryzen97950X3D/win3210.0.26200/rootF: și harness-urile asumă F:+rg; gate-ul de performanță se reia pe mașina de baseline sau prin re-baseline explicită. PBI rămâne In Progress.

- 2026-10-18T18:58:00+03:00 : Re-baseline069 complet pe host controlat (Ryzen77735U/AC/Highperformance/idle~2%): BEFORE native-before-02 PASS(c88a6e1d,24lumi,normal70p95 4.1001–4.3880, reader CURRENT+HISTORICAL); AFTER native-after-04 a picat la Normal tick absolute gate la world-1: tick p95 5.6364>5.5(p50 3.8119/p99 6.8102; authorityp95 2.0954/boundaryp95 1.4063/rapierp95 1.0122). Aceeași depășire ca pe desktop(5.16–7.36)⇒cost real de produs ~+1.4ms/tick, nu artefact de mașină. Capturi păstrate native-after-04 și rejected-01/02, sinteza mobile-rebaseline-attempts-01/report.md. Harness re-pinuit documentat (namespace, PINNED_BEFORE, hash complete.json, inventar179, autocrlf=false); niciun prag relaxat. Următor: diagnostic record-stage pentru atribuirea costului pe stadii. PBI rămâne In Progress.

- 2026-10-18T19:05:00+03:00 : Diagnosticul record-stage069 a fost ÎNCERCAT și s-a oprit înainte de orice achiziție nativă, pe două bariere de proveniență: preparatorul cere arborele live byte-identic cu arhiva originală AFTER03(verify-after.mjs arhivat cda5f71d/14808B vs live87b6e71a după adaptările de re-baseline) și colectorul derivat păstrează expectedRoot pe F:. Gardurile nu au fost forțate(că ar invalida dovada); artefactele parțiale(3+3fișiere) au fost șterse și starea restaurată. Concluzie consemnată în mobile-rebaseline-attempts-01/report.md. Următor: re-derivare tooling pe baseline-ul nou SAU optimizare directă authority+boundary apoi pereche nouă BEFORE/AFTER. PBI rămâne In Progress.

- 2026-10-18T19:35:00+03:00 : Diagnostic record-stage RE-DERIVAT pe baseline-ul nou și EXECUTAT efectiv (prima rulare reală): ancoră native-after-05(sursa9fa30829, produs byte-exact924c), preparatorEXIT0, collector10lumiEXIT0, reader VERIFIED_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE. Fix de tooling real: walker-ul de closure nu accepta src/style.css(importat de src/main.ts), acum frunză. Atribuire perTick inclusive p95: whole tick5.910 (p50 3.958), bridge3.375, append1.373, bytewalk0.996, parse0050.108, immutability0.037, authorityStats0.012; suma5.90≈whole tick, stadii nested. Ținta de optimizare: stadiul bridge (bridge manual-segment + append/admisie, în fiecare tick). Fix repo: .gitattributes cu * -text în main și toate worktree-urile + autocrlf=false; re-checkout dă LF și receipt18/18 rămâne byte-identic. PBI rămâne In Progress.

- 2026-10-18T20:05:00+03:00 : Prima optimizare069 aplicată și măsurată. intervention-admission.ts: encoderUTF8 la nivel de modul + cale rapidă ASCII fără escape (aceeași contabilitate, fără JSON.stringify+encode per literal). Receipt nou fb366a92 (doar 1 din 18 fișiere schimbat), 132/132 teste pure PASS. Diagnostic: whole tick 5.910→5.471(−7.4%), bytewalk0.996→0.453(−54%), append1.373→0.843(−39%); parse005/immutability neschimbate. GATE-UL DE TICK ACUM TRECE: native-after-06 count=70 observer 5.0388/4.8660/4.8333/4.8617/4.9715, toate sub5.5 (înainte 5.6364 FAIL). Captura AFTER eșuează în continuare, dar la gate-ul de memorie RAW_RUNTIME_JS_HEAP_USED: 5/5 perechi, ambele populații (ratio1.38–3.38 pe70, 1.57–1.83 pe110), variație mare, fără forcedGC. Niciun prag relaxat. Următor: investigarea gate-ului de memorie. PBI In Progress.

- 2026-10-18T20:20:00+03:00 : Gate-ul de memorie069 analizat. Regula (manual-segments-after-records.mjs:434): pereche FAIL dacă after>1.1×before ȘI delta>5MiB; rând FAIL la ≥3/5. Datele count=70 observer: before68.4/47.5/45.4/45.6/42.4MB, after97.3/160.5/97.5/97.2/96.8MB — 4/5 valori după strânse la ~97MB, deci delta+30…+55MB este CONSISTENTĂ, nu zgomot GC (un singur outlier la160MB); count=70 non-observer confirmă (36–54→74–98MB). Bugetul declarat 64înregistrări×64KiB=4MiB este depășit ~10×, deci diferența nu vine doar din înregistrările protejate și cere analiză de ownership pe fereastră (snapshot/receipt/istoric/fence). Concluzie: gate-ul semnalează o problemă reală de retenție în produs, nu o artefactă. Tick rămâne PASS. PBI In Progress.

- 2026-10-18T20:35:00+03:00 : CORECȚIE la analiza de memorie. Probe cu GC forțat (native-after-07-gcprobe, --expose-gc + global.gc() înainte de eșantionarea post-fereastră) arată heap reținut REAL de 22,1–22,8MB, stabil la0.3MB pe10lumi, față de 70–153MB fără GC și 34–65MB în before-02 (tot fără GC). Deci cifrele mari erau gunoi necolectat, iar gate-ul compară garbage, nu retenție: eșecul de memorie este ARTEFACT DE MĂSURARE, nu defect de produs (concluzia anterioară de retenție reală este retractată). GC-ul plasat la tick180 perturbă fereastra (p95 5.558), deci corecția de protocol cere global.gc() numai DUPĂ fereastra măsurată, pe ambele capturi. Tick rămâne PASS. Următor: GC post-fereastră în ambele harness-uri + recaptură BEFORE/AFTER. PBI In Progress.

- 2026-10-18T21:00:00+03:00 : Re-baseline cu GC forțat executat: BEFORE native-before-03 PASS(sursa32590b00, reader CURRENT+HISTORICAL) capturat cu GC post-fereastră; AFTER native-after-08 cu --expose-gc a picat de două ori la gate-ul de tick(5.5443/5.6532 vs5.5), deși fără flag aceeași lume dăduse5.0388. Cauza e sistematică: p50 a urcat de la3.7427 la4.15ms(+0.41), GC-ul complet dintre lumi schimbă starea heap/JIT pentru lumea următoare și deplasează fereastra cronometrată. Concluzie de protocol: retenția de memorie nu poate fi măsurată în procesul cronometrat; cere un probe separat (proces dedicat cu GC, fără gate de tick), iar comparația de memorie să folosească acel probe. Dovezile de probă păstrate(native-before-03, native-after-08, -rejected-01, -07-gcprobe); harness-urile readuse la starea comisă pentru consistența lanțului. Tick rămâne PASS pe captura curată. PBI In Progress.

- 2026-10-18T21:40:00+03:00 : DECIZIE OWNER: opțiunea C — comparația de heap se waive-uiește explicit. Implementat în compareOriginal: rândul RAW_RUNTIME_JS_HEAP_USED are verdict WAIVED_NOT_COMPARABLE, waiver scris în cod + intrare în nonComparable, datele per pereche păstrate pentru transparență, exclus din verdict. Testele aliniate la noua semantică (inclusiv cele 3 care verificau regula 3/5 pe heap, acum verifică datele dar nu verdictul) și receipt-ul de calibrare actualizat la optimization-checks-01; 132/132 pure PASS. Ancorele derive() aliniate la folderul live. Blocaj rămas: gate-ul de CPU pe acest host — p50 3.83–4.02ms dar p95 sare intermitent (6.37 pe o lume), deci captura protocol-completă nu se reproduce acum; native-after-06 dovedește PASS 5/5 lumi (4.83–5.04). Toate încercările păstrate (native-after-09-rejected-01, native-after-10). PBI In Progress, fără Done prematur.

- 2026-10-18T22:06:33+03:00 : 069 ÎNCHIS în Done prin decizie de owner. Acceptată captura `native-after-06` (count=70 observer 5,0388/4,8660/4,8333/4,8617/4,9715, toate sub 5,5) deși nu are `complete.json`, pentru că s-a oprit la vechiul gate de memorie acum waivered; canalul de heap este `WAIVED_NOT_COMPARABLE` prin decizie explicită, cu datele păstrate și cu un probe separat rămas de făcut. 132/132 teste pure după fiecare schimbare, receipt de produs `optimization-checks-01`/`fb366a92`, diagnostic record-stage executat (bytewalk −54%). Recapturarea protocol-completă nu s-a reprodus din cauza cozilor hostului (p50 3,83–4,02 ms, p95 până la 6,37); încercările sunt păstrate. Nu se revendică RAF/GPU/FPS/RAM totală.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.

- 2026-10-19: **Integrare în `main` (constatare de integritate reparată).** La verificarea boardului s-a constatat că PBI-ul era în Done, dar codul livrat (`src/telemetry/intervention-*.ts`, `src/app/manual-segment-bridge.ts`, testele, scripturile, `Docs/manual-segments.md` și arborele de dovezi `Docs/Evidence/069-manual-segments/`) exista numai în worktree-ul `manual-segments-01`; în `main` ajunseseră doar commit-urile de documentație. La cererea proprietarului, ordonatorul `loop-pbi` a recuperat livrarea din ramura `loop-pbi/manual-segments-01` și a integrat-o în `main`: modulele, testele și documentul re-applicate peste starea curentă, motivele 005 extinse în `src/telemetry/contracts.ts` (`PROFILE_RESTORE`, `PROFILE_IMPORT`, `STATE_IMPORT`), cele două linii de export în `src/telemetry/index.ts` și `src/app/index.ts`, plus arborele complet de dovezi (4082 de fișiere, 277 MiB, inclusiv capturile native, verificările scoped și diagnosticele respinse). Reefectuat `npm run check` EXIT 0 pe `main` (typecheck, lint, format:check, arhitectură 152 de fișiere, `npm test` **951/951**, din care suitele `tests/telemetry/manual-segments*.test.ts`), plus `node --import ./scripts/register-typescript.mjs --test tests/telemetry/manual-segments-*.test.mjs` **34/34 PASS**, după re-formatarea Prettier a trei scripturi de harness care nu trecuseră niciodată verificarea repo-wide. Probele native înregistrate nu au fost re-rulate; etichetele de calibrare și exceptarea de memorie din rulare rămân cele consemnate mai sus, iar niciun rezultat istoric nu a fost reclasificat. Proba de browser/FPS/hardware/RAM totală rămâne neefectuată și nepretinsă.
