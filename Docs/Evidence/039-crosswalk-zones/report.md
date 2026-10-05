# PBI039 — probe semantice

Șapte teste executate verifică traversarea completă, linia de oprire, filtrul de bandă, niveluri suprapuse, forme concave, margini/staționare/deplasare coliniară, absența pietonilor, observații ascunse/inactive/irelevante, obstacole distincte, ownership readonly și capacitatea4096 fără pierderea ultimei observații. Comandă: `node --import ./scripts/register-typescript.mjs --test tests/world/crosswalk-zones.test.ts`.

Baseline [before.json](before.json) a fost capturat înaintea implementării. [after.json](after.json) folosește aceeași hartă minimal-road-v1 și probă de parser, cu100warmup și5×1000măsurători. Ryzen9 7950X3D, Windows10.0.26200, Node24.21.0; HEAD și runtime sunt în JSON. Nu există renderer, preset, FPS sau măsurare GPU în această probă CPU.

Mediana p95 parser:0,2008ms înainte,0,1969ms după; parserul nu a fost modificat. Costul nou al query-ului:0,0030ms gol,0,0042ms cu un pieton. Cazul de capacitate cu4096pietoni geometric relevanți păstrează toate IDs și are p95median1,4307ms (5×100 după100warmup). Costurile sunt separate de tick-ul complet; propunerea pre203 de5,5ms pentru tick desktop nu este un buget aprobat pentru această funcție. Multe zone suprapuse pot costa mai mult și necesită proba hărții reale.

Douăzeci de cicluri creare/query/eliberare cu GC explicit au heap aproximativ10,86–10,96MB. Modulul reține0observații și niciun istoric. Aceasta este o probă Node de retenție, nu RAM totală a browserului și nici soak-ul jocului. Comandă: `node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-crosswalk-zones.mjs after`.

Implementarea lucrează cu date geometrice, fără meshuri, NPC-uri sau rezultate de learning fabricate. Dovezile de cedare nu sunt produse de această funcție; expunerea necesită observații explicite.

Verificarea exactă a indexului într-un checkout izolat: `npm run check` PASS 205/205, `npm run build` PASS, Validate-Plan PASS și RequireDone039 PASS. [Check final](staged-check.txt), [build final](staged-build.txt), [validator](board.txt). Logul check.txt păstrează încercarea anterioară blocată doar de formatarea fișierelor018/020 în lucru.
