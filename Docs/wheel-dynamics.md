# Dinamica roților — PBI 026

Implementarea este integrată și verificată. Probe Full pe WebGPU și WebGL2 reale în Chrome Guest trec cititorul strict și revizuirea fizică. [Raportul final](Evidence/026-laptop/current-delivery-summary.md) fixează sursa, artifactul, condițiile și limitele. Istoricul FAIL/INCOMPLETE rămâne păstrat în dovezi și PBI.

Catalogul versionat ROAD_SURFACES separă materialul de mecanica vehiculului și preferințele șoferului. Dry asphalt păstrează mecanica implicită: ground friction0,8 și frictionSlip al clasei. Reduced adhesion folosește ground friction0,35 și multiplică frictionSlip cu0,35. Valorile sunt parametri empirici ai controllerului Rapier raycast, fără pretenția unui coeficient µ calibrat. Materialul este uniform într-o lume plată; contactul mixt nu este implementat.

Suspensia nativă păstrează rest length0,35m, stiffness35, compression4,4, relaxation5,2, travel0,2m și plafon mass×9,81N. Solver8, CCD4 și pas60Hz rămân neschimbate. Roțile pot contacta vehicule și decor dinamic; senzorii sunt excluși.

CarProjection.wheels copiază și îngheață profund poziția locală, raza, suspensia/forța, steering/spin și contact point/normal. Contactele sunt null în aer. Nu există istoric de roți reținut. projectPhysicalWheels publică pose-uri readonly; applyPhysicalWheels transmite scalari unui callback stabil cu storage deținut de renderer. Query-ul readonly projectVisual păstrează exact valorile vizuale native, omite numai vitezele/contactele neconsumate și respinge accesul după dispose. Testul compară proiecțiile pe30tick-uri, păstrează snapshoturile vechi și verifică izolarea inputurilor mutabile. Babylon aplică pose-urile fără a controla fizica.

wheelLateralSpeedsMps proiectează viteza centrului roții, v_body+angularVelocity×rotate(q,localWheelCentre), în axa laterală a anvelopei bracate. Roțile fără contact raportează zero. Diagnosticul nu adaugă forțe și nu reprezintă un model complet de anvelopă.

[Calibrarea curentă](Evidence/026-wheel-dynamics/calibration-visual-query-20261011-r1/calibration.json) verifică28scenarii sedan/compact: frânare10/20/30m/s, viraj rapid/lent, bordură și airborne/recontact pe două suprafețe. La20m/s, sedan se oprește în24,235m dry/28,889m reduced, compact21,582m/26,714m. Virajul dry8→20m/s crește viteza laterală la roată1,068→2,965m/s sedan și0,923→2,616m/s compact. Suspensia rămâne finită și cele patru contacte revin.

[BEFORE cronologic](Evidence/026-wheel-dynamics/before/node.json) rămâne immutable. [AFTER curent](Evidence/026-wheel-dynamics/after-visual-query-20261011-r1/node.json) păstrează toate checksumurile fizice/input implicite în10lumi. Câmpurile readonly noi sunt excluse numai din checksumul legacy. Cleanup-ul construcției parțiale și normaldispose păstrează ownership-ul și cauza inițială; recuperarea030 rămâne integrată.

[Cinci perechi native locale](Evidence/026-wheel-dynamics/laptop-visual-query-paired-20261011-r1/summary.json), alternante180tickwarmup/600măsurate, trec pe Node24.21.0/npm11.19.0: tickcurrentp954,409–4,939ms sub8ms, cost suplimentar project completp950,305–0,521ms. Fizica/inputurile și cleanup-ul sunt verificate. Runtime Rapier0.21.0/Babylon9.29.0; check689/689teste, TypeScript/lint/format/arhitectură PASS.

[Full browser comun](Evidence/026-laptop/guest-both-full-20261012-r1.json) și [revizuirea parent](Evidence/026-laptop/guest-parent-review-20261012-r1.json) trec în ChromeGuest single-tab, alimentat, DevTools închis și focus continuu:5perechi30swarmup/120smăsurare/backend,70vehicule/64debris/3obstacole. Source072448e3/artifactfa5f3bc4. WebGPUcurrent mainp9511,8–12,7ms/tick5,0–5,3ms; WebGL2main10,1–10,6ms/tick5,3–5,5ms. ZeroLongTaskssteady în20brațe; confirmări frame/main/heap0/0/1 pe fiecare backend, sub3/5. Bugetele nu sunt relaxate.

[Istoricul profilului cu extensii](Evidence/026-laptop/current-status-20261011-r2.md) păstrează FAIL52msWebGPU și precedentele regresii. [Trace-ul nou](Evidence/026-laptop/performance-3ed8e0c1-summary.md) identifică pregătirea Babylon și prima utilizare WebGPU/Rapier; pauzele istorice52/129ms nu sunt reproduse sau atribuite. PASSGuest este valabil pentru condițiile măsurate, fără afirmația că extensiile sunt cauza demonstrată.

Limite: fixture timpuriu de calibrare/randare; jocul integrat, manualdriving final, presetulLOW, inputlatency, timerGPU, coldnavigation controlat și memoria totală/WASM exactă nu sunt certificate. Instrumentarea este inclusă conservator în timpi; costul exact al observatorului browser nu este izolat.
