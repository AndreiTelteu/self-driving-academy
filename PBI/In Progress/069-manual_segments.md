---
id: "069"
title: "Lifecycle de intervenție manuală"
status: "In Progress"
release: "V1"
module: "Control manual"
depends_on: ["068","005","007"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium manual-segments-01"
started_at: "2026-10-07T00:33:48.632Z"
completed_at: null
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

Rezultat implementare: Producția 069 este livrată în worktree-ul `manual-segments-01` (branch `loop-pbi/manual-segments-01` la d8e5756): lifecycle de intervenție (`src/telemetry/intervention-*.ts`), bridge-ul app (`src/app/manual-segment-bridge.ts`), motivele 005 noi și contractele aferente, plus instrumentația de diagnostic record-stage. Cele 18 fișiere de producție corespund acum byte-cu-byte receipt-ului pinuit `924c0764…` (18/18 verificate).

Verificări executate și rezultat: Pe această mașină (Ryzen 7 7735U, win32 10.0.26300), cu node v24.21.0 din `.node-version` și `npm ci` din lock-ul pinuit (neschimbat), serial `--test-concurrency=1`, cele 10 suite `tests/telemetry/manual-segments*.test.*` au dat EXIT0, **132/132 pass, 0 fail** (17022,8 ms): manual-segments 28, review 31, bridge 10, admission 8, after-validation 20, after-cleanup 10, after-records 7, after-calibration 5, record-stage-diagnostic 6, reference-records 7. Dovezi: `Docs/Evidence/069-manual-segments/correctness-current-01/`. Nu s-a executat nicio probă nativă, CLI sau lume.

Fișiere și documente actualizate: `Docs/manual-segments.md`; `Docs/Evidence/069-manual-segments/correctness-current-01/`; acest fișier PBI (criterii bifate, dovezile și istoricul).

Limitări sau follow-up: Gate-ul de performanță 069 NU este îndeplinit, pe nicio mașină. Re-baseline-ul complet pe host controlat (Ryzen 7 7735U, AC, High performance, CPU idle ~2%) a produs BEFORE `native-before-02` — PASS, `PASS_SUPPLEMENTAL_NATIVE_REFERENCE` în CURRENT și HISTORICAL, sourceHash `c88a6e1d…`, normal70 tick p95 4,1001–4,3880 ms — și AFTER `native-after-04`, care a picat la `Normal tick absolute gate`: world-1 tick p95 **5,6364 ms** > 5,5 (p50 3,8119, p99 6,8102), cu authority p95 2,0954 și boundary p95 1,4063. Pe desktopul istoric AFTER-ul a picat la fel (5,16–7,36 ms). Costul nou al produsului (≈+1,4 ms pe tick) este deci real, nu un artefact de mediu. Captura incompletă și cele două încercări respinse sunt păstrate (`native-after-04`, `native-after-04-rejected-01/02`), cu sinteza în `Docs/Evidence/069-manual-segments/mobile-rebaseline-attempts-01/report.md`. Diagnosticul record-stage a fost re-derivat pe baseline-ul nou și **executat efectiv** (ancoră `native-after-05`, sourceHash `9fa30829…`; preparator EXIT0, collector 10 lumi EXIT0, reader `VERIFIED_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE`). A fost nevoie și de un fix de tooling real: walker-ul de closure nu accepta `src/style.css` (importat de `src/main.ts`), acum tratat ca frunză. Atribuirea pe stadii (5 lumi observer, perTick inclusive p95): whole tick 5,910 ms (p50 3,958), **bridge 3,375**, append 1,373, bytewalk 0,996, parse005 0,108, immutability 0,037, authorityStats 0,012. Stadiile sunt nested și suma lor (5,90 ms) acoperă integral tick-ul. **Următorul pas de implementare: reducerea stadiului `bridge`** (bridge-ul de manual-segment plus calea de append/admisie a înregistrării, executate în fiecare tick), apoi o nouă pereche BEFORE/AFTER cu aceeași procedură. Brief de optimizare detaliat (costuri exclusive, fișiere, bucla obligatorie de re-validare): `Docs/Evidence/069-manual-segments/mobile-rebaseline-attempts-01/report.md`, secțiunea „Brief de optimizare”. Orice schimbare de produs invalidează receipt-ul pinuit `924c` și cere receipt nou + ancoră nouă + re-derivare înainte de a putea fi măsurată. Adaptările de harness sunt documentate: namespace `native-before-02`/`native-after-04`, `PINNED_BEFORE`, hash-ul `complete.json`, inventar BEFORE nou (179 rânduri) și `core.autocrlf=false` la checkout (altfel LF→CRLF rupe identitatea byte-exactă cu receipt-ul 924c). Niciun prag nu a fost relaxat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

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

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-08T02:11:48+03:00: Testele și implementarea rămân oprite la cererea utilizatorului. Actualizarea politicii targeted-validation-v1 nu execută probe, nu bifează criterii și nu închide acest PBI; sursele și dovezile din worktree sunt păstrate pentru reluare.
