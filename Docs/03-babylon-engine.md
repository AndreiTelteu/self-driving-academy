# Babylon.js și integrarea engine-ului

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Decizia de engine

Babylon.js este alegerea confirmată pentru joc. Folosim pachetele ES modules pentru a controla bundle-ul și încărcarea. @babylonjs/core acoperă funcțiile scenei; @babylonjs/loaders este inclus pentru formatele folosite; inspectorul este disponibil în dezvoltare și exclus din buildul de producție. API-urile exacte se verifică față de versiunea fixată în bootstrap.

Babylon documentează scene, camere, materiale, animații, asseturi, audio, picking, instanțiere și niveluri de detaliu. [Specificațiile engine-ului](https://www.babylonjs.com/specifications/)

## Inițializare WebGPU și fallback

1. Creează canvas-ul și starea LOADING, cu mesaj de progres.
2. Verifică disponibilitatea și încearcă WebGPUEngine cu inițializare asincronă.
3. La succes, creează scena și resursele ei pe acel engine.
4. La eșec, eliberează resursele tentative și încearcă backendul WebGL 2.
5. Verifică backendul efectiv înainte de pornirea sesiunii. Dacă niciun backend acceptat nu este disponibil, afișează eroarea și păstrează accesul la exporturile locale.

WebGPUEngine folosește initAsync; documentația proiectului arată și selecția între WebGPU și Engine. [Suport WebGPU](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU.md) și [Diferențe WebGPU](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUBreakingChanges.md)

Contractul aplicației este createRenderingBackend(canvas, preference) → backend cu rendererKind, scene, render, resize și dispose. Acesta este un contract propriu. Nu presupunem că un obiect de scenă cu resurse create pentru WebGPU poate fi reutilizat direct pe WebGL. La schimbarea backendului reconstruim reprezentarea din snapshotul simulării.

PBI011 implementează [bootstrapul asincron și lifecycle-ul](rendering-backend.md): WebGPU preferat, context WebGL2 și versiune efectivă verificate, cleanup la inițializare/scene failed, LOADING/ERROR și retry. Backendul expune suplimentar `canvas`, deoarece fiecare tentativă înlocuiește canvasul pentru a evita contextul incompatibil. Scena bootstrap are numai cameră fixă și clear; reprezentările din snapshot, camerele de vehicul, registry-ul și recuperarea unei sesiuni după device loss aparțin PBI-urilor ulterioare. Compilatoarele provin din pachetul local Babylon 9.29.0.

## Scene și obiecte

O scenă Babylon reprezintă lumea vizuală. Fiecare vehicul are un nod rădăcină legat de entityId, mesh pentru caroserie, reprezentări ale roților, lumini și efecte. Starea fizică alimentează transformările interpolate; animația roților citește starea vehiculului. Constructorul vizual nu creează o a doua simulare de trafic.

PBI013 implementează [adaptorul de scenă](scene-adapter.md): scene root și TransformNode stabil per entityId, înlocuire atomică după validarea candidatei, ownership separat pentru noduri/materiale/texturi și remove/dispose idempotente. Convenția concretă este Y-up, metri, left-handed, +Z înainte/+X dreapta; pivotul domeniului rămâne zero, pivoturile assetului rămân în copil. Adaptorul copiază forma publică VehicleState.transform fără scrieri în domeniu, verifică sessionId/worldEpoch/tick și păstrează istoric plafonat pentru ID-uri reutilizate. Maparea descendenților pentru picking nu implementează selecția UI 014. Backendul bootstrap nu creează resurse de gameplay.

Sectorizarea organizează clădirile, străzile și vegetația. Asseturile repetate pot folosi instanțiere; alegerea între instanțe obișnuite și thin instances se măsoară și ține cont de picking și bounding volumes. Nu folosim un mesh distinct pentru fiecare decor identic fără evaluarea costului. [Thin instances](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/copies/thinInstances.md)

PBI014 adaugă [interpolarea snapshoturilor](render-sync.md): poziții, orientări și roți proiectate readonly prin alpha din bucla fixă. Presenterul Babylon actualizează reprezentările existente, respinge tickurile/epochurile expirate și păstrează autoritatea fizicii.

## Cameră și picking

Camera din spate este un controller propriu peste camerele Babylon, cu amortizare, distanță dependentă de viteză și evitare a obstacolelor. Controllerul urmărește vehiculul selectat, nu autoritatea inputului. Schimbarea taxiului păstrează ID-ul și direcția acestuia și mută doar camera.

PBI017 implementează [camera din spate și first-person](vehicle-camera.md), cu poziția șoferului calibrată, FOV/mișcare reglabile, obstacole și ownership al vizibilității caroseriei. Captura explicită a mouse-ului, privirea, recenter și Escape au fost verificate în Chrome pe WebGL2 și WebGPU; limitarea pointer lock a hostului T3 este păstrată în dovezi.

Pickingul mapează mesh sau instance la entityId. Clickul pe o mașină produce SELECT_VEHICLE; preluarea manuală este o comandă separată. UI nu poate trimite selecții în timp ce un dialog modal consumă pointerul. Selectarea din lista flotei folosește direct ID-ul și nu depinde de vizibilitatea mesh-ului.

PBI018 implementează [selecția prin picking](vehicle-picking.md), cu registry de identități pentru meshuri, instanțe obișnuite și batchuri thin-instance. Ray pickingul verifică obiectul vizibil cel mai apropiat; decorul poate obtura un vehicul. Modalul blochează selecția, iar mișcarea pointerului nu scanează scena implicit. Intenția de selecție nu transferă controlul manual.

## Materiale iluminare și asseturi

Direcția inițială folosește materiale simple sau PBR moderat, lumină ambientală și direcțională, umbre limitate și niveluri de calitate. Orașul este stilizat cu atmosferă americană; fizica realistă nu obligă fotorealismul. Tonemappingul și spațiul de culoare rămân coerente între backenduri.

PBI016 implementează [iluminarea de zi și presetările de calitate](lighting-quality.md), cu materiale semantice lizibile, umbre plafonate și rezoluție internă/DPR explicite. Ajustarea automată folosește ferestre limitate, histerezis și metrici GPU disponibile; setările afectează numai prezentarea.

Formatul de asset principal propus este glTF/GLB; loaderul, registry-ul, cache-ul și eliberarea resurselor sunt tratate explicit. Asseturile necesare pornirii au prioritate; decorul poate veni ulterior. O lipsă de decor permite placeholder, iar lipsa datelor de hartă sau a mașinii de bază blochează pornirea cu explicație. [Încărcarea formatelor](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/loadingFileTypes.md)

PBI015 implementează [registry-ul GLB2](asset-registry.md), cu PNG/JPEG embedded, cache comun și lease-uri pentru instanțe, încărcare critică prioritară, placeholder opțional și limite explicite pentru transferuri/resurse. Materialele și texturile partajate supraviețuiesc până la eliberarea ultimului lease; rapoartele separă transferul, decode/upload CPU și pregătirea shaderelor.

## Integrarea fizicii

Baza planificată este Rapier 3D cu adaptor propriu. Babylon oferă integrare Havok, dar aceasta nu este aleasă automat pentru vehiculele deja planificate pe Rapier. Mesh picking și scene graph rămân Babylon. Controllerul manual și autonom livrează aceeași VehicleCommand către același vehicul fizic. [Rapier vehicle controller](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html)

Transformările trec prin convenția unică aleasă în proiect: Y în sus, metru ca unitate și sistem de coordonate declarat. Conversiile, pivoturile, scara și axele roților sunt testate cu un asset de calibrare. Datele motorului fizic sunt sursa de adevăr; nici animația și nici interpolarea nu rescriu corpul.

## Lifecycle și diagnostic

PBI012 implementează [lifecycle-ul aplicației](app-lifecycle.md), folosit în composition root: loading, ready, playing, pauză manuală/background/suprasarcină, eroare și disposal. Un singur owner coordonează RAF, bucla 008 și listeners; numai playing admite timp simulat. Proiecția interpolată poate fi livrată prin portul `present(frame)` înainte de randare.

Bucla de render primește snapshoturile și alpha de interpolare. Resize, modificarea rezoluției interne și pauza sunt gestionate separat de timpul fizicii. Disposal eliberează observers, mesh-uri, materiale, texturi, audio, cache și engine. Reîncărcarea unei hărți nu dublează listeners sau corpuri fizice.

La pierderea dispozitivului se suspendă sesiunea și se salvează starea înainte de recuperare; resursele vizuale se recreează din registry și snapshot. [GPUDevice lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)

PBI020 implementează [recuperarea GPU din checkpoint RAM](gpu-recovery.md): pierderea nativă suspendă bucla existentă, reconstruiește registry-ul și reprezentările pe un backend nou și păstrează tick-ul și starea autoritară. Retry după eșec folosește același checkpoint; reluarea este explicită. Probe separate verifică 20 de cicluri reale WebGL2/WebGPU și integrarea în bootstrap. Persistența durabilă rămâne în PBI-urile de salvare.

Un panou de diagnostic arată backendul, tick, draw calls, FPS și timpi CPU, număr de entități, versiunea profilului și starea workerului. Datele de profiler nu sunt actualizate în fiecare componentă UI. Inspectorul este o unealtă de dezvoltare; nu este parte din fluxul de joc.

PBI019 conectează [diagnosticele Babylon](render-diagnostics.md) în bootstrap: colector cu memorie plafonată, CPU și interval de cadru separate de GPU, contoare disponibile și panou actualizat la cel mult 5 Hz. Valorile fără instrumentare reală sunt indisponibile. Inspectorul se încarcă numai în dezvoltare și este exclus din graful buildului de producție; limitarea internă de cleanup a versiunii 9.29.0 este documentată în dovezi.

## Acceptare

Bootstrapul, resize-ul, încărcarea, selecția, camera și disposal funcționează pe WebGPU și WebGL 2. Un scenariu păstrează aceleași reguli și comenzi la schimbarea backendului. Aspectul poate varia în limitele nivelului de calitate declarat; învățarea și cursele nu depind de un shader specific.

## Contractul de randare și asseturi

Bugetele și setările DPR/rezoluție internă sunt fixate înainte de asseturile finale prin 203/223. Decorul repetat folosește batchuri locale; vehiculele dinamice păstrează pickingul/entityId și actualizările vizuale. Materialele/transformările sunt înghețate numai dacă sunt statice; nu se îngheață global lista orașului dinamic. Startup-ul, prima utilizare a shaderelor, uploadul GPU și disposal repetat au probe distincte. Calitatea adaptivă afectează numai prezentarea. [Contractul și sursele](25-performanta-contracte-si-benchmark.md) definesc comparația și limitele.

## Camere și decor interactiv în V1

Camera din spate și first-person din poziția șoferului sunt obligatorii în 017, cu FOV/mișcare reglabile, privire/recenter și captură de mouse explicită conform [modulului 27](27-reglaje-hud-si-camera.md). Decorul destructibil are entityId și stări independente de mesh; tranzițiile/pool-urile din [modulul 26](26-joaca-libera-haos-si-distrugere.md) păstrează pickingul și disposal-ul după reset.
