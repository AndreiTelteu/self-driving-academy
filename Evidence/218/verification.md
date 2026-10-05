# Verificare PBI218 — scope minim și colector propriu

Commit de bază: bf37fd9 (203 Done, pushed). Modificările218 sunt încă necomise; raportul identifică acest commit și sourceHash e3b3abbe23c9d8f610e7a271a74afabae374e39bae33304ab093d5d107196ff4. Manifest bugete203-initial-1, nemodificat. Hardware/CPU și probele browser au roluri distincte, fără aprobarea gate-ului gameplay.

## Verificări executate

- npm run check: PASS, typecheck/lint/format/architecture și284 teste. check.txt și final-check.txt.
- npm run build: PASS; warning Vite pentru bundle>500kB, fără eroare. build.txt.
- Proba CPU: cinci perechi reale cu20.000 de cadre deterministe per braț și un pass identic de warmup. Raport portable-cpu.json, rezumat portable-summary.json, comandă portable-command.txt.
- Sumarizatorul CPU și browser: PASS. Percentile pe date sintetice1..100: p50=50,p95=95,p99=99. Testele resping overflow/short hardware/identitate invalidă și păstrează GPU/memorie lipsă ca unavailable/null. Testele sintetice nu sunt hardware evidence.
- Chrome154 headed smoke: cinci perechi, marcat218-browser-counter-v1-SMOKE, export real și sumarizare PASS; browser-smoke.json și chrome-smoke-command.txt.
- Chrome full: cinci perechi30s warmup/120s measure, finalizare și export real după toate fazele. desktop-webgpu.json, desktop-summary.json, chrome-full-start.txt, chrome-full-finish.json și screenshot desktop-full.png.
- verify-performance-evidence.mjs: PASS; verifică sursele curente, hashul manifestului și129 artefacte efective byte cu byte, cinci cold/cinci warm, protocolul celor10 faze, limite/ownership/throughput și absența valorilor input/memorie fictive. hardware-evidence-validation.json.

## Măsurare hardware reală

Utilizatorul a autorizat explicit Chrome local după blocajul T3. Serverul5190 existent (PID49012) a fost reutilizat, fără rebuild în timpul probei. Playwright CLI a deschis Chrome headed, session pbi218, PID14524. Snapshotul paginii a confirmat butoanele înainte de click. Focusul real a fost true și visibility visible; fără falsificarea hasFocus/visibility/RAF. Proba full a început09:28:18+03 și exportul după finalizare a avut loc09:54:05+03. Timestampul exact al raportului este capturedAt din desktop-webgpu.json. Root și agentul nu au rulat alte benchmarks/builduri în timpul măsurării.

Identificare: Ryzen9 7950X3D, Radeon RX7900XTX în inventarul CIM, Windows11 Pro, driver32.0.31041.1004, RAM disponibilă sistemului50.337.325.056bytes. Adaptorul real al browserului este Babylon WebGPU vendor=amd, renderer=rdna-3; Chrome154.0.0.0. CSS/internal1920×1080 și DPR1, display raportat144Hz. Preset context Medium; scena goală nu verifică asseturi dependente de preset. CIM/power snapshot de la pornirea serverului05:18:33+03 este anterior probei09:28+03; nu reprezintă monitorizare continuă. power-after-probe.json păstrează un snapshot după probă, separat.

Fiecare warmup efectiv:30.000,5–30.000,8ms; fiecare durată măsurată:120.002,3–120.002,9ms. Cinci repetări oprit/pornit cu ordine alternată. CPU p95 median0,2000000477ms în ambele brațe, frame p95 median7ms în ambele brațe. Toate diferențele CPU p95 sunt0 la precizia raportului: cost indistinct la rezoluția ceasului browserului, fără afirmație de overhead zero. Diferențele wall și distribuțiile complete sunt păstrate per pereche. Raportul simulare/ceas RAF este0,9999758–0,9999808, fără overload. Acesta este debitul counterului cu kernel fixed-tick real; nu dovedește fizică sau flotă.

Startup fresh backend:27,9–37,5ms; primul render CPU:0–0,3ms și al doilea render warm:0–0,3ms. Valorile0 sunt observații cuantizate la rezoluția ceasului, fără afirmația de muncă absentă. Cold/first-use local folosește no-store HTTP, OS/driver cache necontrolat și rețea locală nelimitată; nu certifică cold navigation25Mbit/s/RTT40ms sau first accepted driving command.

Colector:5.280.044bytes activ și44bytes oprit, separat de bufferul diagnostic4096/131.072bytes și observerul comun960.000bytes. Zero mostre pierdute, toate complete=true. Snapshoturile reale înainte/dupădispose sunt2/0. Resurse Babylon au contoare în raport; acestea nu sunt RAM/GPU exacte. Memorie exactă pagină/GPU null. GPU timer unsupported în toate brațele active, distribuții null. Long Tasks suportat, count0 și overflow=false în fiecare fază steady-state; nu se extrapolează la loading/gameplay.

## Istoric și limite

T3 preview a fost descoperit și utilizat prioritar: available/visible=true, tab_1, dar hasFocus=false după open/show/click/window.focus. Smoke a fost respins corect; t3-preview-focus.json și t3-smoke-rejected.json păstrează blocajul anterior. Fallbackul Chrome a fost folosit numai după autorizarea explicită a utilizatorului.

Scope neimplementat: Rapier, vehicule, input driving, learning, checkpoint/recorder. tickCpuMs autoritar complet rămâne unavailable; simulationCpuMs măsoară kernelul fixed-loop per cadru, cu snapshot/interpolare. CPU portabil are clock synthetic și admittedClockSeconds distinct de measuredWallSeconds. Laptopul nu este măsurat; gate-urile hardware viitoare rămân deschise. Bugetele gameplay și capacitățile manifestului203 rămân provizorii, iar gameplayGate=NOT_VALIDATED este explicit.
Finalizare board:218 mutat fizic în PBI/Done, absent din To Do și In Progress. Validate-Board.ps1 -RequireDone218 PASS; board-done.txt. git diff --check PASS. Documentul taskului păstrează limitările reale și completed_at. Niciun commit/push făcut de subagent.
