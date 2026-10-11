# Profil Chrome Performance — 491ff4dd

Trace original salvat manual la 11 octombrie 2026: 55.843.616 bytes, SHA256 48ED9BFEBC0DBBB25AB5F479A3C602C23B6302A7900A1853DAB9EA02759BDC37. Captura diagnostică folosește source63a9c01e/artifact6370ef50, WebGPU, șase brațe 15s warmup/30s measure. Nu reprezintă acceptare hardware.

Analiza offline a threadului CrRendererMain pid21380/tid1496 este în performance-491ff4dd-tasks.json și performance-491ff4dd-attribution.json. Cele șase intervale măsurate nu conțin LongTask; task-urile58/66ms din full de054736 nu s-au reprodus. Task-ul istoric129ms rămâne fără atribuire demonstrată.

Pregătirea meshurilor are task-uri106–151ms dominate de createVertexBuffer/createIndexBuffer/setVerticesData Babylon. Prima randare/pas nativ include156,925ms în warmup; profilul arată Rapier WASM step. Taskul61,615ms înaintea intervalului măsurat al brațului3 include aproximativ44ms StackGuard/GC și este dominat de sample-uri garbage collector. Taskul700ms de la început aparține CpuProfiler::StartProfiling, înaintea lansării scenariului. Taskul98ms final include destroy/dispose și serializarea, după măsurare. Aceste observații nu atribuie retroactiv pauzele full.

Pentru full de054736, reconstrucția brută validată pentru toate10brațe este în optimized-webgpu-stall-r1.json. Task58ms: cadru54,9ms, tick3,7ms, proiecție35ms, rest16,2ms. Task66ms în BEFORE: cadru64,2ms,2tick-uri16ms, proiecție0,5ms, rest47,7ms. Restul include randare/loop/boundaries; nu este timerGPU. Cauza GC/driver/OS pentru aceste două task-uri nu este demonstrată.

Pragurile, clock-ul, workloadul70vehicule/64debris și rapoartele fullFAIL rămân neschimbate. Noul preflightWebGL2 9e8add48 a trecut10brațe, verificarea arhivei brute și cleanupzero; urmeazăfull pe aceeași identitate optimizată.

Full WebGL2 95ac4107 s-a încheiat: FAIL57ms current arm9. Raportul optimized-webgl2-stall-r1.json păstrează reconstrucția main55,7ms/tick9,3ms/proiecție2,4ms/rest44ms, fără atribuire GC/driver/OS. Urmează validarea sursei cu aplicare scalară a roților fără alocarea pose-urilor intermediare.
