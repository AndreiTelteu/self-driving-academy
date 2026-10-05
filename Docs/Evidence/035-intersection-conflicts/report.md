# Dovezi PBI035

Implementare CPU pură a relațiilor geometrice și semantice între mișcările permise032/033; fără import Babylon, texture sau mesh și fără prioritate implicită. IDs stabile canonice, witness geometric și zone authored identificate separat. Contractul este în [intersection-conflicts.md](../../intersection-conflicts.md).

[Tests](tests.txt):10teste PASS pentru T/cruce, traversare vs paralel, viraje separate, shared entry/exit/zone, symmetric IDs, date readonly, tangency/collinear/bridge, invalid data, geometrybudget și paircapacity. Testul pathological constructor cu ~3000noduri ajunge la2mcomparisons și respinge explicit în~0,67s; acesta este loading/authoring failure, nu un buget de tick acceptat. Nu este introdus în loop. Testul9junctions×128movements depășește65536relații și este respins înainte de geometry. Shared geometry păstrează aceleași array identities fără multiplicarea pathurilor.

[Check global exact](check.txt): ultima execuție are typecheck/lint PASS, format blocat numai de scripts/benchmark-stop-rules.mjs al037 în lucru independent. Prima execuție globală înainte de modificarea scriptului de benchmark a trecut234teste (output tool). [Check scoped final](scoped-check.txt): toate fișierele035 lint/format, architecture și10teste PASS; parent verifică snapshotul exact integrat. [Build](build.txt) păstrează rezultatul production. [Board](board.txt) este validatorul final RequireDone035.

## Cost CPU și memorie

[Before](before.json), capturat înaintea implementării, și [after](after.json) rulează aceleași parser1000/laneConnections10000 pe minimal-road-v1, o warmup +5repetări. Node24.21.0, Ryzen9 7950X3D, Windows10.0.26200 identificat prin Node OS. GPU/browser/driver/preset/FPS nu sunt implicați sau măsurați; sunt probe de algoritmi, nu gate hardware gameplay. Sursa baseline: parentafd217a plus019/020/018WIP independent; final parentf902555 plus020/018/035WIP, etichetat după identificarea parent. Procese browser ale altor agenți pot rula; variația loturilor submilisecundă nu este prezentată drept regresie FPS. Power/refresh necunoscute.

Baseline parser1000median136,9702ms, laneConnections10000median0,2470ms. Final parser1000median127,7284ms și laneConnections10000median0,2121ms; toate cele5repetări sunt în after.json; diferențele nu schimbă semantica grafului existent. Regresia provizorie pre203 ar necesita >10% și >1ms pe p95 și confirmare în3/5probe; aici raportăm durate de lot, nu pretindem aplicarea acelui gate la gameplay.

Cost nou intersection-CROSS-v1 (7mișcări,1zonă,21relații/17incompatibile,37comparații de segmente,7pathuri și1polygon unic): construction median0,8203ms;10000query lookup neobservate median4,2712ms. Observatorul10000Float64=80000bytes, fixed, costă separat:10000query observate median4,6590ms; queryCPU p50=0,0004ms/p95=0,0007ms/p99=0,0011ms în ultima repetare. Aceste percentile sunt probe Node cu precision/JIT/allocations, nu întregul tick.

20cicluri create/drop cu `--expose-gc` păstrează heapV8 în after.json: înainte9.807.584bytes, interval după9.803.776..9.964.528bytes, ultim9.964.528bytes. Nu crește un cache de query; stats/identity rămân constante în10000querytest. Nu pretindem garbagecollection identică, zeroleak absolut sau totalRAM din V8heap. Relațiile sunt plafonate65536, comparisons2m, arrays reutilizate per geometryId și liste bounded128mișcări per intersecție. Garbagecollector decide momentul eliberării după drop.

## Reproducere și limite

`node --import ./scripts/register-typescript.mjs scripts/benchmark-intersection-conflicts.mjs --before` reproduce workloadul de baseline; fișierul before.json original este păstrat. `node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-intersection-conflicts.mjs` produce finalul/costul suplimentar. Scriptul nu citește Git și etichetează revisionul furnizat de parent.

Geometria este swept corridor polyline conservator în X/Z cu height ranges, nu footprint3D/CCD. Pantele pot produce false positives; există witness exact X/Z și motive semantic/geometric distincte. Nu decide ordinea de trecere, semafoare/STOP, intervale temporale sau controlvehicul. Bugetele sunt provizorii pre203;035 nu închide220/224 și nu măsoară gameplay. Nu există criteriu vizual/browser de validat pentru modulul CPU pur.

Parent exact-index validation: check226/226PASS, productionbuildPASS, RequireDone035 and Validate-PlanPASS. [Check](staged-check.txt), [build](staged-build.txt).
