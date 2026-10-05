# Baseline desktop real — 5 octombrie 2026

[Raport complet](desktop-baseline.json), [sumar calculat](desktop-summary.json), [identificare CIM](desktop-identification.json). Build de producție din1044d0f, cu surse și artefacte SHA256 în raport. Chrome154, WebGPU, adaptor raportat AMD/rdna-3; desktopul local are Ryzen9 7950X3D și RX7900XTX, driver32.0.31041.1004, Windows11Pro26200. Displayul activ este3840×2160/144Hz; canvas CSS/intern1920×1080, DPR1. Alimentare Balanced, fără baterie. Este un desktop high-end de referință, fără extrapolare la un desktop mediu generic.

Pornit prin `./scripts/Run-HardwareProbe.ps1 -Profile desktop`, apoi butonul „Rulează proba completă” în Chrome. Captură finală2026-10-05T01:49:07Z. Au trecut toate cele cinci perechi colector oprit/pornit, fiecare cu30s warmup și cel puțin120s RAF măsurate. Cele10 faze au durate120002,5–120002,8ms și17275–17280 intervale fiecare. Focusul a rămas valid, fără tab ascuns, pierdere GPU sau overflow. Rendererul și colectorul au fost dispuse la final, înaintea reluării verificărilor CPU ale altor taskuri.

| Metrică | Colector oprit: mediană (min–max) | Colector pornit: mediană (min–max) |
| --- | --- | --- |
| CPU per render p50 |0,10ms (0,10–0,10)|0,10ms (0,10–0,10)|
| CPU per render p95 |0,20ms (0,20–0,20)|0,20ms (0,20–0,30)|
| CPU per render p99 |0,30ms (0,30–0,30)|0,30ms (0,30–0,30)|
| Interval de cadru p95 |7,00ms (7,00–7,00)|7,00ms (7,00–7,00)|
| Interval de cadru p99 |7,10ms (7,10–7,10)|7,10ms (7,10–7,10)|

Valorile sunt medianele percentililor celor cinci repetări, rotunjite pentru citire, nu percentile reconstruite pentru toate cadrele. Diferențele CPU p95 pornit–oprit sunt0/0/0/+0,10/0ms; p50/p99 nu diferă la rezoluția raportată. Nu concluzionăm că observatorul are cost matematic zero. Timerul GPU este indisponibil în acest backend, deci GPU rămâne null. Long Tasks este suportat și a raportat0 intrări în fereastra observată. Contoarele de final de fază pentru meshes/nodes/materials/textures/geometries sunt0; draw calls este0 cu colectorul pornit și indisponibil când este oprit. Acestea nu sunt memorie GPU exactă sau maxime ale resurselor între snapshoturi. Bufferul colectorului este131072bytes, maximum4096 mostre.

Scena are numai cameră/clear, fără vehicule, fizică, materiale sau UI de gameplay. Nu există cap software de60FPS: cadența reflectă displayul144Hz și RAF. CPU p95 de0,20ms descrie doar costul bootstrapului, nu bugetul complet de10ms al jocului. Pornirea backendului a durat120ms în această navigare locală; este o singură observație, fără throttling de rețea și fără controlul cache-urilor OS/driver, deci nu este cold p95.

Pe durata celor25minute am suspendat testele/buildurile și benchmarkurile Node ale agenților. Au continuat editări/review-uri și verificări administrative scurte ale stării browserului; mediul Windows nu este un runner dedicat izolat de toate procesele OS. Nu am schimbat buildul sau profilul în timpul probei.

Proba validează baseline-ul desktop și costul observatorului. Nu închide PBI203 singură: raportul laptopului și fixarea manifestului inițial rămân necesare; gate-urile de gameplay, cold-start, memorie și flotă rămân distincte.
