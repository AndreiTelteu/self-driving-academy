# Iluminare de zi și calitate (PBI016)

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
