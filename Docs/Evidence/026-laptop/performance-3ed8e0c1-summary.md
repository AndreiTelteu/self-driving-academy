# Profil Chrome Performance — 3ed8e0c1

Trace salvat manual și analizat la 12 octombrie 2026: 62.086.363 bytes, SHA256 079E52134E430B94D82FB5B89733046498747EF9555656FE880F47A895724113. Source072448e3/artifactfa5f3bc4, WebGPU, profil Chrome existent cu extensii. Durate30s warmup/120s measure, DevTools CPU/Memory activ. Captura este diagnostică, nu acceptare.

CrRendererMain pid21380/tid1496 confirmat din metadata. Analiza reproductibilă: analyze-performance-3ed8e0c1.py, extract-profile-3ed8e0c1.py, attribute-tasks-3ed8e0c1.py; rezultate performance-3ed8e0c1-tasks.json și performance-3ed8e0c1-attribution.json. Sunt șase RunTask de minimum50ms în trace. CPU profile conține11.227 înregistrări; numărul de sample-uri nu este un timer exact pentru funcții.

| Task elapsed ms | Thread CPU ms | Atribuire observată |
| --- | --- | --- |
| 664,129 | 621,680 | Pornirea CpuProfiler, înainte de Run |
| 140,499 | 125,807 | Pregătire Babylon vertex/index buffers; sample-uri GC |
| 51,475 | 41,080 | Prima randare: WebGPU uniform buffers și bind groups |
| 178,646 | 162,942 | Prima integrare nativă Rapier WASM step, înainte de steady-state |
| 124,930 | 116,038 | Pregătirea brațului current, Babylon buffers |
| 104,983 | 98,942 | Pregătirea următorului braț, Babylon buffers |

Prima pereche este completă, fără LongTask steady: BEFORE7174cadre/7201tick, mainmax31,2ms; current7168cadre/7201tick, mainmax34,2ms/tickmax18,9ms/solvermax6,5ms. Task-urile52ms din full2f66510a și129ms istoric nu sunt reproduse și nu primesc atribuire retroactivă. Timestamp-ul prep140ms corespunde raw startTime3581681,3ms, cu offset trace≈528565412646µs (rotunjirea LongTask limitează precizia).

Oprirea și procesarea trace-ului au întrerupt warmup-ul brațului2 prin fixed-tick overload. Terminalul rămâne INCOMPLETE, cu cleanupzero. Pauzele observate după Stop nu sunt incluse în trace-ul oprit. Nu transformăm această pereche diagnostică în PASS full.

Următoarea investigație schimbă condiția profilului: utilizatorul a deschis manual Chrome Guest, verificat vizual în fereastra32507982, un singur tab127.0.0.1:5220, DevTools închis. Nivel Full justificat prin gate-ul026 și FAIL52ms WebGPU; înainte de Full rulează Smoke/preflight și citire strictă. Nicio schimbare de workload, prag, sursă sau rezultat istoric. Probele locale native și WebGL2 din profilul anterior rămân dovezi valide pentru condițiile lor; dacă profilul Guest validează WebGPU, BOTH trebuie verificat în condiții comparabile, inclusiv WebGL2 Guest.
