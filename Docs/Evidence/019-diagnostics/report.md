# Dovezi PBI019 — diagnostic Babylon

Colectorul bounded, adaptorul real Babylon și panoul separat sunt conectate în bootstrap. Panoul închis nu colectează și nu scrie DOM; deschis agregă maximum5Hz. Ring implicit240×4Float64=7680bytes; fixture64=2048bytes; plafon4096samples. Memoria JS exactă și memoria GPU exactă nu sunt măsurate prin numărarea obiectelor.

## Baseline și overhead

Artifactul `before` a fost congelat înaintea implementării, sursă0d4d003 plus modificările independente017/018 aflate atunci în working tree. [Baseline T3 inițial](before.json) și [baseline Chrome pe același artifact](chrome-before.json) folosesc013-empty-v1, WebGL2 real,640×360/DPR1,5repetări×30warmup+120frames. [După implementare](chrome-after.json), aceeași probă Chrome: median CPU p95=0,20ms înainte și0,20ms după. Artifactele sunt builduri production fără HMR. Timer5ms este pacing al fixture-ului, nu FPS de display. Precizia performance.now este aproximativ0,1ms; diferența nedetectabilă nu dovedește overheadzero.

Hardware browser real: RX7900XTX, ANGLE/D3D11 WebGL2; WebGPU raportează amd/rdna-3. Chrome154 headed, Windows. Identificare suplimentară CIM de la parent: Ryzen9 7950X3D, RAM50.337.325.056bytes, RX7900XTX driver32.0.31041.1004, Windows11Pro10.0.26200. Power plan/refresh rate necunoscute. Probele Chrome au rulat în foreground izolat; agenții016/017 încheiaseră,020 a amânat build/probe pe intervalul măsurat.

Cost nou separat, [WebGL2](chrome-webgl2.json) și [WebGPU](chrome-webgpu.json):5repetări fiecare disabled/enabled, același fixture019-empty-v1. CPU total extern include backend.render+collector.record+panel.refresh. Percentilele CPU din raportul adaptorului măsoară numai renderul sincron, deci nu le confundăm cu overheadul total.

| Backend | CPU total p95 median disabled | enabled | UI refresh max per repetare enabled | Actualizări / scrieri DOM enabled |
| --- | --- | --- | --- | --- |
| WebGL2 |0,20ms|0,20ms|0,20/0,20/0,10/0,20/0,10ms|22 /36|
| WebGPU |0,30ms|0,30ms|0,20/0,10/0,10/0,10/0,10ms|23 /33|

UI p95 este0ms fiindcă majoritatea apelurilor ies prin gate; max de mai sus include apelurile care agregă la5Hz. Disabled are0updates/0writes.1000refresh-uri rapide produc cel mult o actualizare. Ambele backenduri trec cele6assertions reale: bounded ring, gate5Hz, closed-no-writes, CPU/GPU separate, proiecții sintetice copiate, resurse și observers revenite exact la baseline după disposal. Scena goală are0mesh/material/texture/geometry, măsurate, nu mock.

WebGL2:26rezultate GPU proaspete, asincrone; p50=0,00252ms/p95=p99=0,00260ms. WebGPU pe acest browser/dispozitiv: `unavailable: timer query unsupported`, GPU=null. Primul rezultat după activare este omis pentru a evita query-ul întârziat din sesiunea anterioară. Nici GPU pending și nici unsupported nu devin0. Intervalele frame sunt pacingul real al fixture-ului, nu performanța gameplay-ului. CPUtick/bytes/cozi/entități/profil/worker lipsesc în bootstrap; fixture-ul etichetează explicit tick123/debt10/bytes2048/jobs2/CPUtick0,25 drept proiecții sintetice, nu gameplay măsurat.

## Inspector și UI reale

[Aplicația production](chrome-app.json): interacțiuni reale Diagnostic și Pornește în Chrome, backendWEBGPU, tick/debt afișate din bucla aplicației; Inspector absent. [DEV](chrome-dev.json) folosește un build explicit DEV=true, nu distribuția production. Butonul Inspector Babylon a fost apăsat în browser; [screenshot](inspector.png) arată Inspectorul real9.29.0. Wrapperul final folosește API-ul modern ShowInspector/token și weak ownership; nu recreează ownerul încă activ. [Retest final](chrome-inspector-ownership.json): observer8→8 la repetarea deschiderii, după disposal0; scenă disposed refuzată. [Console exactă](inspector-console.txt) păstrează warning CSS Babylon și eroarea internă asincronă ModularBridgeContainer la cleanup, emisă de Inspector9.29.0 inclusiv cu token.dispose; cleanup-ul observerelor scenei și refuzul redeschiderii au trecut. Nu declarăm consoleclean sau memorie internă Inspector măsurată.

[Bundle scan](bundle.json) cere sourcemaps nenule, graph-ul adaptorului și main.ts production; numără sursele efectiv emise. Production nu include @babylonjs/inspector și nici dev-inspector.ts nefolosit. Fixture production exclude pachetul; fixture DEV include7surse Inspector. DEV este lazy și neminificat (~42MB totalJS), production application ~3,29MB totalJS. Inspector este devDependency exact9.29.0. Excepția arhitecturală permite exclusiv importul din dev-inspector.ts; probele negative păstrează blocarea altor imports.

## Verificări și limite

[Build application](build.txt), [fixture final](fixture-build.txt), [fixture DEV](dev-build.txt), [check global exact](check.txt), [check scoped](scoped-check.txt), [typecheck scoped](scoped-typecheck.txt). Globalcheck a fost blocat de039lint în acel moment, iar ultima încercare typecheck global-tests de imports DOM din018vehicle-picking-input în lucru; nu sunt declarate PASS. Source/application typecheck și compilarea izolată a testelor019, ESLint/Prettier pentru toate fișierele019, architecture și testele019 sunt PASS. Parent verifică și snapshotul exact al commitului integrat. Patru teste pure verifică capacitatea, null/zero, resetul și copiile defensive. Browserul verifică ownership/resources real GL/GPU, nu numai doubles. RequireDone019 este în [board.txt](board.txt).

Preview T3: după baseline, tab_c a devenit nefocalizat și hostul a emis erori Electron preload; proba timer incompletă a fost abandonată, tabul închis. Nu folosim acea durată drept FPS/rezultat. Chrome headed este fallbackul autorizat; browserul a fost închis după dovezi. Bugetele rămân provizorii înainte de203: proba bootstrap nu închide gate-urile gameplay220/224 și nu măsoară CPUtick complet, RAM/GPUbytes exacte sau Inspector overhead în producție.


Reproducere scoped typecheck: `npx tsc --noEmit`, apoi un config temporar care extinde tsconfig.tests.json cu include exclusiv tests/rendering/diagnostics.test.ts și exclude=[]; `npx tsc -p .pbi-validation-019/tsconfig-tests.json --noEmit`. Ambele comenzi au exit0. Artifactele chrome-inspector.json/disposed.json sunt încercări intermediare ale wrapperului legacy; rezultatul final de ownership este exclusiv chrome-inspector-ownership.json după trecerea la ShowInspector/token. Screenshotul arată interfața reală deschisă înaintea schimbării wrapperului; pachetul/UI sunt aceleași.

Parent: indexul exact al commitului a trecut într-un checkout izolat: `npm run check` 209/209, build production cu sourcemaps, fixture production/DEV, scan de excludere Inspector, Validate-Plan și RequireDone019. [Check](staged-check.txt), [build](staged-build.txt), [scan](staged-bundle.json). Main.ts din019 a fost păstrat separat înainte de integrarea020 pentru a verifica exact această revizie.
