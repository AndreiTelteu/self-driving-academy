# Dovezi PBI015

5 octombrie 2026. Baseline: `f80bd0a`; implementarea și buildul sunt working tree cu PBI012/014/015/016/017 lucrate concurent. Babylon 9.29.0, Node 24.21.0, Vite 8.3.2. Commitul final este gestionat de composition root după integrare.

Mutarea fizică în `PBI/Done/015-asset_registry.md` și `Validate-Board.ps1 -RequireDone '015'` sunt PASS, Valid=true,235taskuri; [rezultatul](board.txt) păstrează calea exactă din Done.

## Verificări executate

`npm run check`: PASS, 185 teste, typecheck/lint/format/architecture PASS ([log](check.txt), verificare finală executată de agent015). `npm run build`: PASS ([log](build.txt)). Testele dedicate de preflight: 4 PASS. Erorile intermediare de format/typecheck au provenit din fișierele celorlalte PBI și au fost reparate înaintea verificării complete.

Browser T3 real, tab `tab_4`, fixture Vite pe localhost:5175; toate acțiunile au țintit tab-ul explicit. [WebGL2](webgl2.json) și [WebGPU](webgpu.json) confirmă GLB valid, două instanțe/material comun, resurse supraviețuitoare după primul release, unload pinned refuzat, erori critice, placeholder, PNG/JPEG, prioritate critică, plafoane pentru bytes/cache/coadă/instanțe/rapoarte, retry concurent după HTTP503 injectat și disposal în loading/queue/decode. Fiecare backend a executat 20 cicluri load/unload cu revenire exactă a contoarelor nodes/meshes/materials/textures/geometries. Zero cleanup failures. BRDF-ul lazy Babylon este resursă comună a scenei și este creat înainte de baseline-ul lifecycle; nu este pretins drept leak al assetului.

Într-o încercare intermediară, PNG-ul fixture-ului avea CRC invalid: WebGL îl tolera, WebGPU createImageBitmap îl respingea. Fixture-ul a fost înlocuit cu PNG original cu CRC valid; rapoartele finale trec pe ambele backenduri. Nu a fost schimbat loaderul pentru a ascunde această eroare.

## Performanță și cost suplimentar

Hardware verificat de engine: AMD Radeon RX7900XTX, Windows, T3 nightly0.0.46, Chromium152/Electron44; WebGL2 prin ANGLE D3D11 și WebGPU real. Hardware suplimentar verificat de parent prin CIM: Ryzen9 7950X3D, RAM50.337.325.056bytes, Radeon driver32.0.31041.1004, Windows11Pro10.0.26200. Acesta este inventar host separat de fixture; alimentarea și refresh rate rămân necunoscute. Canvas640×360, DPR1, preset de calibrare simplu. Pagina raportează visibility visible, deși preview_open are panoul show=false. Probe scurte secvențiale; alte PBI au tabs pe aceeași mașină, deci concurența externă nu este exclusă. Nu se revendică runner hardware izolat.

[Înainte](before.json) și [după](after.json): același `013-empty-v1`, WebGL2, 5 repetări cu 30 frames warmup +120 măsurate, timer5ms. Median CPU p95 0,20ms→0,20ms; toate contoarele0→0. Nu apare regresia propusă (>10% și >1ms în3/5 repetări). After este măsurat după implementarea funcțională, înainte de optimizarea exclusivă a importului loaderului; aceasta nu schimbă bucla/proba de render. Probe de assets după această optimizare sunt cele două JSON finale.

Cost nou separat, GLB mic în cache: median render CPU p95 aproximativ0,30ms WebGL2 și0,50ms WebGPU, fără lucru per frame în registry. Primul container PNG (1028bytes transfer,72bytes geometry+texture estimate) raportează WebGL2 transfer4ms, decode/upload36,70ms, shader preparation90,20ms, total131,30ms; WebGPU1/4,80/58,50/64,50ms. Acestea sunt cache-cold pentru registry, cu runtime/browser cache deja folosite; nu sunt startup cold al jocului. Reîncărcările plain GLB și cele20 cicluri sunt păstrate individual în JSON, cu queue/transfer/decode/shader/total.

Registry-ul are limitele provizorii în raport: transfer4MiB/asset, rezident20MiB, texturi16MiB/asset și2048px, concurență2 implicit/1 în cicluri, coadă32, cache32/3 în cicluri. Gate-urile observate decode și shader≤2s trec pentru fixture. Primele shader compilation90ms au loc în loading; nu sunt ascunse prin warmup și nu sunt interpretate drept steady-state fără long tasks.

[Bundle](bundle.json): toate chunkurile JS+WASM, conservator,5.892.304bytes raw și1.683.061bytes gzip, sub propunerea8MiB critice. Importul larg glTF adăuga glTF1/toate extensiile:1146module, entry1655,26KB raw/386,58KB gzip. Entry-ul narrow glTF2:819module,1108,85KB raw/261,68KB gzip. Diferența124,90KB gzip este o reducere măsurată în aceeași sesiune; buildul conține și contribuțiile celorlalte PBI și nu izolează costul tuturor modulelor015 față de HEAD.

Nu se pretinde FPS de display, GPU time sau memorie GPU exactă; sunt null în rapoarte. Contoarele și estimările ownership sunt probele memory disponibile. Nu se închid gate-urile203/223/224, soak60min, bugetul primei curse≤20MiB sau startup≤12s cu rețea25Mbit/s/RTT40ms. Fixture-ul este dev și mic; benchmarkul final pe laptop/desktop și asseturi finale rămâne în PBI-urile dedicate.
