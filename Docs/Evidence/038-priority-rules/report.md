# Dovezi PBI038 — priorități și spații

Implementarea CPU world oferă sidecar strict exhaustiv, TTC în SI, gapuri și context de prioritate, dovadă singulară de cedare fizică și traversare swept continuă. Contract: [priority-rules.md](../../priority-rules.md). Nu există trafic live integrat, refuz juridic, callback de recompensă sau contribuție learning automată.

## Verificări executate

[Tests](tests.txt):17teste proprii PASS. Sunt acoperite roundtrip JSON și query reciprocal, politica exhaustivă pe CROSS și T/turn, malformed/foreign/omitted/duplicate policies, distanță/viteză/timp SI, stationary/occupying/cleared, trafic absent/inactiv și niciun refuz, yield continuu exact o dată, available gap fără dovadă, EQUAL fără regulă inventată, missing coverage/distance/route/ticks, actori activi neobservabili și ordine independentă, entry0 fără pre-entry yield, crossing cu clearance complet într-un tick, teleport/rută schimbată fără interpolare, mai mulți oponenți/perechi fără duplicare, exposure set change fără dwell moștenit, drift cumulativ, incarnation/epoch/tombstones/dispose, limite și getters neexecutați.

[Check](check.txt): `npm run check` exit0, typecheck/lint/format/architecture și279teste PASS. Architecture82TypeScript files plus6dependency negative probes și4inspector exception negative probes PASS. [Build](build.txt): `npm run build` exit0, production PASS; warningul existent pentru chunk>500kB este păstrat, fără a-l ascunde. [Board](board.txt) păstrează validatorul obligatoriu RequireDone038 după mutarea fizică. [Plan](plan.txt) păstrează validatorul documentelor.

## Baseline și cost suplimentar

[Before](before.json) a fost executat înaintea implementării: Node24.21.0, Ryzen9 7950X3D, win32 10.0.26200, intersection-CROSS-v1,10000interogări035, o warmup+5repetări. Revision parent cunoscut e573338 plus037/WIP independent. [After](after.json) repetă aceeași probă după implementare; parent revision1044d0f plus038WIP și evidențe203 independente, fără checkout Git izolat. Execuția finală a avut loc numai după încheierea baseline-ului hardware203 și releaseCPU la2026-10-05T01:49:07UTC; nu a concurat cu acel benchmark. [Stderr](benchmark-stderr.txt) păstrează warningul experimental al loaderului TypeScript. Acestea sunt batchuri algoritmice Node CPU, fără browser/GPU/driver/preset/power/refresh/FPS ori hardwaregameplay.

Median10000lookups035=2,4581ms înainte /2,2245ms după, checksum10000 în fiecare repetare. Algoritmul035 nu a fost modificat; scăderea nu este atribuită unei optimizări. Nu actualizăm baseline-ul pentru a accepta regresii.

Cost nou separat: fixture cu17reguli/perechi,1subject,1oponent și1datum/actor. Politica și geometria sunt construite/validate înaintea observațiilor; fiecare observație trece parserul strict și reține o singură istorie bounded. Constructor median0,9236ms (checksum17). Batch10000observații preconstruite: median115,5808ms fără observator, checksum10000expuneri. Inputul sintetic repetă o poziție de apropiere și o viteză declarată; nu este replay fizic/live și nu măsoară întregul tick de trafic. Media batch este aproximativ0,01156ms/observație pe acest fixture, nu p95/p99 și nu plafon pentru toate capacitățile configurabile.

Observatorul prealocat Float64Array are80000bytes, înregistrează elapsedCPU sincron per observe. Batchul identic cu observator median124,2309ms, incluzând timer+collector overhead: diferență de median8,6501ms/10000observații, aproximativ7,48%. Nu tratăm diferența batch ca overhead exact pentru fiecare query ori FPS. Nu se măsoară overhead UI/RAF deoarece acest modul nu are UI/RAF.

20cicluri create/10000observe/dispose cu GC explicit sunt păstrate integral în after.json. Înaintea fiecărui dispose:17reguli/1vehicul/1incarnation/716codeunits reținute. După fiecare dispose:0vehicule/0incarnations/0codeunits și disposed=true;17reguli statice readonly rămân până când ownerul elimină controllerul. Nu există timers/listeners/queues/ledger. HeapV8 dupăGC variază15.679.408..15.769.640bytes, primul15.679.408 și ultimul15.704.616; include runtimeul, fixtureul și batchul preconstruit păstrate de benchmark, nu RAM exact pe controller și nu certificare absență oricărei creșteri în workload viitor.

## Reproducere și limite

`node --import ./scripts/register-typescript.mjs scripts/benchmark-priority-rules.mjs --before`; final `node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-priority-rules.mjs`. Testele specifice: `node --import ./scripts/register-typescript.mjs --test tests/world/priority-rules.test.ts`.

Capacitățile, inclusiv envelope aggregate de fingerprint și tombstones JSON escaped, sunt explicite în contract. Testele validează admission/rejection înainte de mutație și cleanup; heapul nu este confundat cu plafonul derivat. Constructorul include geometria bounded035, care păstrează limitarea conservatoare de înălțime/false positives documentată acolo. Distanțele de rută și clearance-ul trebuie furnizate de autoritatea fizică viitoare, cu aceeași bază de coordonate. Predicția constant-velocity, minGap2s, hold0,25s și motionTolerance0,05m sunt provizorii și cer calibrare reală.

Bugete provizorii preînchiderea203; acest microprobe nu certifică bugetul complet5,5ms al tickului autoritar și nu închide gate-urile220/224. Nu există criteriu vizual/driving în acest PBI semantic; nu inventăm playtest sau trafic live. Proba folosește observații sintetice explicit observabile, iar lipsa traficului este verificată fără falsă dovadă de refuz.

Integrarea finală izolată din indexul Git: [check](staged-check.txt) PASS279, [build](staged-build.txt) PASS, Validate-Board -RequireDone038 și Validate-Plan PASS. Dependențele sunt Done și boardul păstrează203 In Progress.
