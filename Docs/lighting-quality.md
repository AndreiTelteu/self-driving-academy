# Iluminare de zi și calitate (PBI016)

223 completează presetările cu limite LOD/texturi/transparență/efecte și `checkVisualResources`, documentate în [contractul de bugete](render-asset-budgets.md). Adaptarea016 păstrează aceleași ferestre, histerezis și override manual; nu există port de modificare a stării autoritare.

`createDaylight(scene, QualityPreferences, { width, height, dpr })` instalează două lumini Babylon (ambient hemisferic și soare direcțional), șapte materiale Standard și o singură hartă de umbre când presetul o cere. Este compoziție explicită pentru o scenă reală, la fel ca adaptorul013 și presenterul014; scena bootstrap goală nu construiește artificial un oraș. Nu deține RAF, listeners, corpuri fizice sau autoritate asupra simulării.

Materialele `road`, `marking`, `vehicle`, `signalHousing`, `red`, `amber`, `green` folosesc aceeași paletă în toate presetările. Marcajele și lămpile sunt emissive/unlit pentru lizibilitate independentă de umbre. Procesarea ACES, exposure 1 și contrast 1 este locală materialelor, identică pentru WebGPU/WebGL2; nu rescrie procesarea materialelor altor owneri. Lumina zilei rămâne constantă la schimbarea presetului. Nu înghețăm global active meshes/transformări.

| Preset | DPR maxim | Hartă umbre | Extindere umbre | Casters randate / plafon retenție |
| --- | --- | --- | --- | --- |
| LOW | 1 | dezactivată | 0 | 0 / 96 |
| MEDIUM | 1,5 | 1024² PCF low | 60m lățime, clip max120m | 48 / 96 |
| HIGH | 2 | 2048² PCF low | 100m lățime, clip max200m | 96 / 96 |

Casters se înregistrează explicit prin `addShadowCaster(mesh)` numai din aceeași scenă. Selecția stabilă este ordinea înregistrării; eliminarea unuia activ umple imediat locul din cele reținute. La capacity 96 metoda întoarce false, callerul decide prezentarea; nu scoate entități din lumea fizică. Mesh-urile disposed sunt eliminate la sincronizarea registry-ului. Mesh-ul primitor setează explicit `receiveShadows=true`. Frustumul de lumină este finit, cu soare fix; urmărirea camerei/sesiunea extinsă se compune separat. Materialele/casters nu reprezintă un collider.

Rezoluția internă este explicit `floor(cssDimension * min(deviceDpr, maxDpr) * resolutionScale)`. Scala provine din setările009 (0,5–1). `getQuality()` raportează CSS, DPR fizic, DPR efectiv, scale, dimensiuni interne și preset. `resize(viewport)` aplică engine.setSize fără recrearea umbrelor/materialelor; callerul furnizează dimensiunile CSS și DPR actuale prin listenerul existent. `applyPreferences` validează candidata înaintea schimbării și recreează numai harta umbrelor, păstrând materialele. Callerul păstrează setările persistente; acest owner nu le modifică.

`createAdaptiveQuality` / `daylight.observe(sample, nowMs)` formează portul automat de prezentare. Eșantioanele au frameMs/cpuMs/gpuMs; timestampurile sunt monotone. O fereastră are 30 samples, fără istoric nelimitat. Două ferestre GPU-bound cu frame p95 >22 ms și GPU p95 >12 ms coboară un nivel. Patru ferestre cu frame p95 <15 ms, CPU/GPU p95 <8 ms ridică un nivel. Între schimbări trec minimum 5 s. GPU necunoscut sau workload CPU-bound nu schimbă rezoluția. Manualul (`adaptive=false`, sau `setManual`) oprește ajustarea; nu presupunem timp GPU0 atunci când timerul lipsește. Probele principale fixează presetul; verificarea histerezisului este separată.

Compoziția poate apela observe din portul de randare existent, folosind metricile disponibile, fără o a doua buclă. Adaptorul nu schimbă dt, numărul vehiculelor, profilul, economia, XP sau regulile; importul QualityPreferences este numai de tip, iar dependențele runtime sunt de randare. Fizica nu există încă în acest fixture, deci nu pretindem un playtest al fizicii viitoare.

`dispose()` este idempotent și eliberează umbre, materiale, lumini și caster registry; mesh-urile callerului rămân deținute de caller. Dispose trebuie făcut înaintea scenei/backendului. Folosirea ulterioară ori scene/mesh-uri disposed sunt respinse. Materialele aparțin acestui owner și nu sunt cache-uri globale. Callerul eliberează reprezentările înaintea ownerului de materiale.

Limitele asseturilor finale pentru texturi/LOD/transparență/efecte și bugetele hardware sunt în 223/203; 016 aplică rezoluția, lumina, materiale simple și umbrele. Nu declară un enforcement inexistent pentru asseturi viitoare.

[Verificarea](Evidence/016-lighting/verification.md) include 6 teste, 20 switch-uri cu resource cleanup, ambele backenduri reale în LOW/MEDIUM, patru capturi și baseline/cost nou separat. API-ul de umbre a fost verificat în sursa instalată9.29.0 și [documentația Babylon pentru umbre direcționale](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/lights/mathShadows.md).

## Bugetul explicit de umbre după 157 (12 noiembrie 2026)

PBI 157 păstrează plafoanele și harta de umbre din tabelul de mai sus, dar schimbă **ce** intră în ele când plafonul nu încape tot. Casters se înregistrează în continuare explicit cu `addShadowCaster(mesh)`, care acceptă acum o prioritate: `essential` (vehiculul selectat), `standard` (traficul simulat) și `optional` (decor mic). Lista de randare se compune pe prioritate, iar în interiorul aceleiași priorități ordinea rămâne cea a înregistrării; `removeShadowCaster` și re-înregistrarea păstrează aceeași stabilitate.

Consecința practică: la MEDIUM (48 de locuri) cu 71 de casters înregistrați, taxiul selectat intră în hartă chiar dacă este înregistrat ultimul, iar iese ultimul caster `standard`. Baseline-ul dinainte de 157 tăia lista în ordinea înregistrării, deci taxiul selectat putea lipsi complet din shadow map — comportamentul este raportat ca defect în dovezi, nu păstrat.

(Lista de mai jos este cea de la 157; PBI 244 a înlocuit-o, vezi secțiunea de la final.) Nu intră în shadow map, declarat explicit în `SHADOW_MAP_CONTENT`: layout-ul static 042 (doar `receiveShadows`), decorul 146, marcajele și lămpile emisive (materiale unlit), precum și orice mesh neînregistrat. `getShadowBudget()` întoarce starea citibilă: preset, plafon, dimensiunea hărții, admiși/respinși, esențiali lipsă (`essentialDropped`), distribuția pe priorități și lista de incluse/excluse. La LOW harta este dezactivată prin contract, deci `essentialDropped` rămâne 0 și `essentialExcluded` numără casters esențiali care nu au unde intra.

Verificare: `node --import ./scripts/register-typescript.mjs --test tests/rendering/lighting.test.ts` (inclusiv cazul 48 standard + 1 esențial) și proba structurală `npm run perf:render-budget -- --check`.

## Umbre pe toată scena după 244 (16 noiembrie 2026)

PBI 244 înlocuiește harta unică de 1024² / 2048² cu un nivel de umbre pe preset: **HIGH** Cascaded Shadow Maps (4 × 2048², `stabilizeCascades`, PCF calitate mare, 140 m), **MEDIUM** o hartă de 1024² PCF care urmărește camera și este aliniată pe texeli, **LOW** umbre de contact (fără hartă). Tabelul de mai sus rămâne valabil pentru plafoanele de retenție (`maxShadowCasters`); dimensiunile și distanțele reale sunt în `SHADOW_PRESETS` din `quality-policy.ts`.

**Contractul 157 (`SHADOW_MAP_CONTENT`) — schimbat intenționat.** Intră în hartă: vehiculul urmărit (`essential`), traficul și personajul (`standard`), clădirile 042, semafoarele și decorul 146 din raza hărții (`optional`). Nu intră: carosabil, trotuar, bordură și teren (doar primesc umbre), marcajele și lămpile emisive, roțile vehiculelor și orice mesh neînregistrat. Prioritatea `essential` este neatinsă (aceleași teste 157, neschimbate, trec): plafonul de 96 se aplică în continuare casterilor esențiali și standard, iar cei statici (`optional`) au un plafon propriu de 192 în registru; lista de randare scoate casterii statici aflați dincolo de raza hărții + 90 m față de cameră. Detalii, măsurători și limite: [documentul 30](30-calitate-vizuala-v4.md).

Resurse: `getResourceCounts()` păstrează aceleași câmpuri; `getShadowStats()` adaugă modul, cascadele, randările și cadrele sărite ale cache-ului și motivele invalidărilor. HIGH folosește o cameră-proxy (`daylight-shadow-camera`) pentru cascade; 20 de cicluri de preset lasă scena identică (verificat în browser).
