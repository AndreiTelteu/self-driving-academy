# WebGPU și performanță

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## WebGPU și compatibilitate

WebGPU oferă randare și calcule paralele pe GPU, cu shadere WGSL. Pentru prima versiune îl folosim în primul rând pentru oraș și vehicule. Compute pentru efecte, culling sau simulare se introduce numai când măsurătorile arată un beneficiu. Învățarea statistică inițială și logica rutieră pot rula pe CPU. Acestea sunt alegeri de arhitectură. [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

Compatibilitatea depinde de combinația browser/OS/GPU/driver și de funcțiile disponibile efectiv. Se detectează la runtime și se testează matricea reală aleasă în 203; lista de implementări este o referință actualizabilă, nu o garanție pentru orice dispozitiv. [Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)

Aplicația publicată folosește HTTPS. Bootstrapul verifică suportul și inițializarea reală a engine-ului. Propunere: dacă WebGPU nu este disponibil sau inițializarea eșuează, reconstruiește scena pe WebGL 2 înainte de începerea sesiunii. Paritatea urmărită privește gameplay-ul; nivelul de efecte vizuale poate diferi.

Funcțiile de compute nu sunt acoperite automat de fallbackul rendererului. Pentru orice funcție obligatorie de gameplay bazată ulterior pe GPU, se implementează o cale CPU sau se schimbă explicit cerințele hardware. Babylon.js documentează compute shaders ca funcție exclusiv WebGPU. [Compute shaders](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/)

Pierderea dispozitivului GPU suspendă randarea, păstrează starea de simulare și încearcă reinițializarea resurselor. Dacă restaurarea nu reușește, sesiunea este salvată și se oferă reluare cu backendul disponibil. GPUDevice.lost și recrearea resurselor sunt mecanisme documentate; strategia de recuperare a sesiunii este propunerea proiectului. [GPUDevice lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)

## Bucla de simulare și performanța

Propunere inițială: fizică la 60 Hz cu pas fix; decizii de trafic la 10 Hz și reevaluare la evenimente urgente; randare cu interpolare; HUD și lista flotei la 5–10 Hz. Semaforul, comenzile și evenimentele sunt raportate în tick-uri ale simulării. Pauza oprește timpul simulat și nu lasă fizica să recupereze o pauză de browser printr-un pas foarte mare.

Indexul spațial limitează vecinii consultați de fiecare vehicul. Meshe-urile repetate folosesc instanțiere și niveluri de detaliu; coliziunile folosesc forme simplificate. Toate taxiurile rămân simulate chiar când nu sunt vizibile. Dacă se introduce ulterior simplificarea vehiculelor îndepărtate, impactul asupra indicatorilor trebuie verificat explicit.

Ținte propuse, fără rezultate măsurate: 60 FPS la 1080p pe un desktop mediu ales ca referință; cel puțin 30 FPS pe un laptop cu GPU integrat ales ca referință; 24 de taxiuri și 40 de mașini civile; analiză și publicare după o intervenție uzuală în aproximativ două secunde, fără blocarea inputului. Hardware-ul exact și durata maximă a intervenției trebuie fixate înainte de acceptarea acestor ținte.

Măsurăm separat timp CPU de fizică, decizii, UI, colectare și estimare; timp GPU și costul cadrelor; memoria; încărcarea inițială; percentilele timpului de cadru. Flotele de 20, 24 și 30 de taxiuri și densități diferite de trafic fac parte din matricea de benchmark. Nu estimăm scalarea la sute de taxiuri dintr-un test cu 24.

Experimentele automate rulează în loturi într-un worker cu anulare și progres. Un model de trafic simplificat pentru experimente rapide este etichetat separat și nu substituie măsurarea fizicii complete.

## Bugete înainte de extindere

PBI 203 fixează configurațiile și metoda de măsurare înaintea prototipului de fizică și a extinderii orașului; hardware-ul exact nu este inventat în documentație. [Manifestul inițial 203](performance-budgets.json) păstrează baseline-ul desktop real și bugete gameplay provizorii; testul laptopului din 203 a fost omis prin derogarea explicită a utilizatorului din 5 octombrie 2026. PBI 155 verifică bugetul pe jocul complet și raportează abaterile; derogarea 203 nu omite gate-urile hardware ulterioare. Recorderul întregii lumi, graficele KPI, generarea zilnică, directorul provocărilor și distrugerea au bugete separate; comparațiile opționale rulează cu progres, anulare și limite de resurse în worker.

## Contract obligatoriu în procesul PBI

[Modulul 25](25-performanta-contracte-si-benchmark.md) detaliază auditul, bugetele numerice propuse, workload-urile, frecvențele, admiterea worker-elor, capturile coerente, asseturile și probele de regresie. 218 furnizează harness-ul devreme; 219 schedulerul; 220 validează flota înainte de campanie/asseturi; 221 controlează worker-ele; 222 datele și autosave; 223 randarea/asseturile; 224 închide regresiile înainte de livrare. PBI-urile relevante declară performance_checks și păstrează probe înainte/după.

Țintele FPS sunt completate cu p95/p99 frame time, latență de input și raport timp simulat/timp real. Rezoluția internă și calitatea sunt parte din rezultat. Optimizarea nu reduce populația simulată, fizica sau regulile KPI/XP; se amână mai întâi lucrul secundar și se ajustează grafica. Un renderer mai rapid nu garantează că experimentele A/B și serializarea checkpointului sunt în buget.

## Rezultat măsurat la gate-ul 220 (22 octombrie 2026)

Pe laptopul cu GPU integrat (Ryzen 7 7735U / Radeon 680M, 1920×1080 CSS și intern, DPR 1, preset LOW fix), 20/24/30 de taxiuri cu până la 40 de civili au intrat în bugetele coloanei `laptop` pe ambele backenduri, cu build de producție și cinci repetări: frame p95 16,8 ms, p99 16,9–17,0 ms, tick autoritar p95 3,1–5,5 ms, Rapier p95 0,3–0,4 ms, input p95 1,6–2,5 ms, learning 17,3–17,8 ms și raport timp simulat/timp real 1,0001. WebGL2 a raportat timer GPU (p95 ≈ 1,09 ms); WebGPU a raportat timerul indisponibil, deci valoarea GPU este `null`, nu zero. Proba de suprasarcină 30/80 a rămas separată, fără gate FPS normal. Detaliile, corecțiile și limitele sunt în [raportul gate-ului](Evidence/220-fleet-gate/README.md). Paritatea de gameplay dintre backenduri rămâne de verificat în workload-ul integrat 155; acest rezultat acoperă costul de cadru, simulare, input și learning, nu efectele vizuale finale.
