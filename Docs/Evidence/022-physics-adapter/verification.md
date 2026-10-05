# PBI022 — verificare adaptor fizic

Protocolul complet desktop este verificat PASS pe ambele backenduri. Tranziția finală fizică și validatorul sunt consemnate la finalul acestui document.

## Implementare și verificări executate

Port SI pur și registry pentru entityId↔handle Rapier, tokenuri cu generație și identitate exactă, pose/velocity, remove complet și subscriptions bounded. Limite:110vehicule,207bodies,256colliders,8subscriptions/body,880total. Conversia Y-up/+Zforward/+Xright și quaternionxyzw nu aplică mirror. addBox rămâne helper anonim021.

`npm run check`: PASS,316teste,0fail/skip, typecheck/lint/format/architecture. Testele includ Rapier real90°Y la(7,3,-11), velocity(12,-2,4), Babylon Matrix +Z≈(8,3,-11), stale token/remove/recreate, unsubscribe vechi, reentrancy same-tick per-body și world batch,20cycles la110vehicule/880subscriptions. Log: [check.log](check.log).

După corecția fixture-ului care recreează canvasul înainte de inițializarea backendului, `npm run typecheck`: PASS; format local PASS. Log: [final-typecheck.log](final-typecheck.log). Corecția evită utilizarea canvasului zeroed/context released de backend.dispose; nicio modificare a rendererului223.

`node scripts/verify-physics-evidence.mjs`: PASS, identitate/hashuri originale021, surse byte-exact păstrate în Evidence/021/source-at-capture. Raportul brut021 nu este rescris. Log: [021-historical-verifier.log](021-historical-verifier.log).

## Browser și identitate

Production build Vite, Babylon9.29.0, Rapier0.21.0, commit de bază3006d726c70495f0fb024f803c25baa113c1da66. SourceHash40c307245299faed0f40636791974b7a52af94253978a4271131001132382a7e;142artefacte emise, hashuri byte-exact și artifactHash în [build-manifest.json](build-manifest.json). Sursele/artefactele capturate rămân fixe pe durata ambelor protocoale.

Chrome local explicit headed, viewport/CSS/internal1920×1080, DPR1, inspector închis, document.hasFocus=true și visibilityState=visible observate; guards per-arm invalidează blur/visibility/device loss/overload. Launch: [headed-launch.txt](headed-launch.txt), procese: [chrome-processes.json](chrome-processes.json), observații: [browser-verification.json](browser-verification.json). CIM curent, GPU/driver/RAM/OS/powerScheme: [hardware.json](hardware.json). Actual WebGPU renderer amd/rdna-3; identificarea exactă WebGL2 este în raportul backendului.

Calibrarea Rapier→port injectat→Babylon este inspectată vizual și citită din HUD în ambele backenduri: rotație90°Y, translație(7,3,-11), velocity(12,-2,4), local+Zworldpoint≈(8,3,-11). Remove/recreate respinge tokenul vechi, callbackul vechi rămâne la1, noul mapping este activ cu1subscription. Capturi: [WebGPU](webgpu-calibration.png), [WebGL2](webgl2-calibration.png); stări: [WebGPU](webgpu-calibration-state.txt), [WebGL2](webgl2-calibration-state.txt).

## Protocol comparativ

Aceeași lume Rapier manyContacts:70cars,64debris,3barriers+ground,134bodies/138colliders. Direct și bridge folosesc același readBody și sink Babylon; bridge adaugă70subscriptions. Costurile step/readback/dispatch sunt măsurate separat.5pairs/backend, ordine alternată,30s warmup+120s măsurare/arm, fără alte sarcini CPUheavy/hardware concurente.6×60000Float64 sample slots=2.880.000bytes/arm; overflow respins, LongTasks filtrate prin startTime în intervalul măsurat și drain după taskul final.

Smoke explicit1s/3s/1pair pentru ambele backenduri: PASS source/artifactbytes/caps/cleanup/20cycles, console GPU clean. Log: [smoke-verifier.log](smoke-verifier.log). Smoke nu substituie protocolul complet.

WebGPU full10arms salvat la2026-10-05T13:54:02+03; framep95=7ms, mainp95=3–3,4ms, stepp95=1,7–1,8ms. Raport brut: [webgpu.json](webgpu.json). WebGL2 full început13:54:37+03 și salvat14:19:37+03, renderer real ANGLE AMD Radeon RX7900XTX D3D11. Raport: [webgl2.json](webgl2.json). `node scripts/verify-physics-adapter-evidence.mjs`: PASS,142artefacte, protocol/bugete/regresii/caps/cleanup/20cycles în ambele backenduri. [summary](summary.json), [full-verifier.log](full-verifier.log), [browser-console.txt](browser-console.txt) fără errors/warnings. Medianele bridge p95 WebGPU/WebGL2:frame7/7ms, main3,2/2,8ms, tick2,3/2,3ms, step1,7/1,7ms, readback0,1/0,1ms, dispatch0,1/0,1ms. Nicio regresie confirmată3/5 după pragul>10% și>1ms; toate caps absolute trecute.

Cleanup per-arm și20cycles verifică scene resources la baseline,0entity/0subscription după remove,0vehicle/64anonymousbodies/68colliders înainte de world.dispose, apoi world disposed. Ciclurile verifică remove/recreate/stalecallback și unsubscribe vechi care nu atinge noua subscription.

## Limite

Fixture timpuriu, fără certificare a jocului complet, laptopului sau gate220/224. Caps sunt admitere finită provizorie, nu calibrare gameplay. Ownership counts și buffere sunt bounded; memoria exactă WASM/GPU și GPUtimer sunt indisponibile și raportate null, nu zero. Warm module/HTTPno-store, fără control cold OS/driver cache. Baseline-ul este direct pe aceeași fixture, nu schimbat pentru acceptarea unei regresii.

Tranziție finală:2026-10-05 14:23+03, fișierul există numai în PBI/Done/022-physics_adapter.md; Validate-Board -RequireDone '022' PASS (235total,201ToDo,0InProgress,34Done) și Validate-Plan PASS1069localLinks. Rezultate: [board-validation](board-validation.txt), [plan-validation](plan-validation.txt). DedicatedChrome/serverclosed; hardware released.
