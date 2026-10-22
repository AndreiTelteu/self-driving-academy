# Experimente și indicatori

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Indicatori și comparații

Indicatorii de serviciu sunt curse finalizate, rată de finalizare, durată până la pickup, durată de cursă, întârziere față de referință și timpul total blocat. ETA este o estimare și poate varia cu traficul și stilul.

Indicatorii de comportament sunt distribuții de viteză față de limita din hartă, headway la viteze eligibile, reacție la verde, opriri complete și probabilități de încălcare. Indicatorii de confort folosesc accelerație, accelerație laterală și jerk în intervale cu pasager, pentru toate taxiurile în AUTO, MANUAL și LEARNING, inclusiv în afara camerei. Colectarea acestor indicatori este independentă de eligibilitatea pentru învățare.

Încălcările se raportează per oportunitate relevantă: roșu per apropiere eligibilă, STOP per traversare STOP, prioritate per conflict eligibil. Coliziunile se raportează atât ca număr brut, cât și per 100 de kilometri-vehicul ai flotei; la expunere zero rata este indisponibilă. Durata de depășire a vitezei se raportează la timpul cu o limită validă.

Coliziunile continue între aceeași pereche nu sunt numărate la fiecare cadru. O regulă de separare și cooldown definește un incident nou. Evenimentele păstrează vehiculele implicate, cauza de simulare cunoscută și consecința fizică; atribuirea vinei nu este prezentată ca adevăr dacă nu poate fi stabilită.

### Comparație între două profiluri

Un scenariu salvează harta, vehiculele, starea fizicii, stările semafoarelor, cererile de curse, starea dispecerului și seed-urile. Două rulări pornesc din același snapshot și folosesc profiluri diferite. Pentru oportunitățile probabilistice se folosesc numere aleatoare asociate stabil cu taxiul și evenimentul, reducând variația care nu ține de profil.

Traiectoriile divergente pot produce oportunități diferite; rezultatul nu este prezentat ca demonstrație că un singur parametru a cauzat toate diferențele. Pentru izolarea unui parametru se folosesc scenarii dedicate. Pentru efectele asupra orașului se rulează mai multe seed-uri și se afișează distribuțiile, expunerea și mărimea eșantionului.

Replay-ul vizual citește stări înregistrate. Rerularea simulează din nou comenzile sau politica. Sunt funcții distincte. Reproductibilitatea este o țintă pentru aceeași combinație de versiuni și platformă verificată; identitatea bit cu bit între orice browser și GPU nu este presupusă.

Jucătorul poate observa flota cu profilul nou, compara înainte și după și deschide istoricul unei încălcări. Instrumentele de analiză extind progresul prin misiuni fără să schimbe automat profilul ales.

## Recorder pentru replay-ul lumii

WorldReplayChunk include schemaVersion, engine/physics/mapVersion, startTick/endTick, checkpointId, entități și evenimente. Înregistrează toate taxiurile și civilele, fazele semafoarelor, crearea/eliminarea entităților, cursele, modurile și versiunile aplicate, indiferent de cameră. Transformările au inițial 20 Hz cu interpolare; evenimentele păstrează tick-ul exact. Replay-ul vizual nu pretinde fidelitate fizică la rezoluție mai mică.

Un buffer circular propus de două minute păstrează lumea recentă; la incident se fixează o fereastră de 15 secunde înainte și după, când există date. Închiderea înaintea celor 15 secunde marchează clipul parțial. Limitele de memorie/DB, prioritatea segmentelor fixate și lipsa istoricului sunt explicite. Bufferul în RAM nu supraviețuiește unui crash; numai chunkurile salvate pot fi redate după restart. Replay-ul nu modifică stilul, KPI-urile, review-urile, misiunile sau XP.

Snapshotul pentru rerulare folosește checkpointul complet al lumii din [persistență](15-salvare-si-import-export.md), plus o țintă izolată pentru profil. Nu reconstituie lumea doar din transformări vizuale. Pentru comparația profilurilor, aceeași versiune alternativă se aplică atât taxiurilor, cât și civililor; variantele cu trafic civil fix sunt experimente de control etichetate, nu comportamentul live.

## KPI-uri și atribuirea schimbărilor

Revenue-ul, review-urile și istoricul lor sunt în [economia flotei](22-kpi-economie-si-review-uri.md). Comparațiile sunt experimente opționale, fără acordare sau retragere XP. Dashboardul distinge corelația temporală de rezultatul comparabil, fără să atribuie un accident jucătorului dacă dovezile nu permit. Confortul comenzilor exclude impulsurile de impact; ratingul include incidentul real.

## Serviciul de indicatori 137

[Contractul indicatorilor de serviciu](metric-service.md) implementează agregările incrementale pentru curse terminale, durate, kilometri-vehicul, timp blocat, coliziuni și încălcări. Numitorii folosesc întreaga flotă din `counts()` (inclusiv vehiculele ascunse), expunerea zero produce indisponibil, iar un zero real rămâne disponibil. Evenimentele sunt idempotente după `eventId`, snapshotul nu rescanează istoricul, iar adaptorul 082 expune doar indicatorii deținuți de 137; încălcările și confortul rămân pentru 138/139. [Dovezile 137](Evidence/137-metric-service/README.md) păstrează cele 20 de teste și raportul determinist 44/44, cu proba de debit locală marcată provizorie.

## Indicatorii de comportament 138

[Contractul indicatorilor de comportament](behavior-metrics.md) calculează conformarea și încălcările **per oportunitate eligibilă**, nu per cadru: cheia de idempotență este `(opportunityId, occurrence)`, deci fluxul acelorași oportunități la 10 Hz și la 60 Hz produce același numitor și aceiași numărători, iar cadrele duplicate nu schimbă nimic. `STOP` și `RED` sunt raportate separat, cu rate în procente; `YIELD`/`LANE_CHANGE` la fel, iar un eșec care nu este încălcare (verde ratat, bandă abandonată) nu crește `violations`. Sunt incluse opririle complete cu dwell, reacția la verde, distribuția de viteză față de o limită reală, durata/fracția peste limită numai pe eșantioane cu limită și headway-ul numai la viteză eligibilă. Un numitor zero este `UNAVAILABLE` cu `value: null`, niciodată o rată perfectă; un zero real rămâne `AVAILABLE`. Histogramele sunt mărginite, `historyScans` este structural `0`, iar adaptorul 082 expune doar `violations`. [Dovezile 138](Evidence/138-behavior-metrics/README.md) păstrează cele 21 de teste și raportul determinist 58/58.

## Indicatorii de confort 139

[Contractul indicatorilor de confort](comfort-metrics.md) calculează accelerația, accelerația laterală și jerkul **doar în intervalele cu pasager**, pentru toate taxiurile, în `AUTO`, `MANUAL` și `LEARNING`, inclusiv pentru taxiurile din afara camerei. Prezența pasagerului este derivată din ciclul de cursă real 061, iar eligibilitatea pentru învățare a segmentului 069 este înregistrată ca fapt, nu ca filtru: colecția indicatorilor este independentă de cameră și de learning.

Unica sursă de excludere este filtrul 088: un eșantion dintr-un span suprimat și orice interval care traversează un span sunt eliminate, deci teleportările 030 și impulsurile de impact nu devin confort al comenzii. Impactul real rămâne consecință separată a experienței pasagerului: este numărat într-un agregat propriu și intră distinct în review, alături de termenul de confort și niciodată amestecat cu el.

Agregările sunt incrementale per pasager (`historyScans` structural `0`), cu cheie de idempotență pe identitatea evenimentului și limite explicite. Misiunea 121, tabloul 082 și modelul de review citesc aceleași agregate dintr-un singur read model: 139 este singurul proprietar al confortului și singura formulă de derivare a intervalelor, deci nu există calcule paralele. Pragurile sunt valorile implicite ale catalogului de parametri (`comfort_deceleration` 2 m/s², `acceleration_jerk` 2 m/s³), iar limita laterală este capacitatea reală a clasei vehiculului măsurată de 085. [Dovezile 139](Evidence/139-metric-comfort/README.md) păstrează cele 16 teste, raportul determinist 36/36 și proba de cost local marcată provizorie.

## Resurse pentru comparații și evaluări

Experimentele folosesc admiterea comună 221: lumi și seed-uri rulate secvențial, felii măsurate, anulare și progres plafonat. Learning-ul interactiv poate întrerupe un lot secundar. Recorderul/capturile au limite în bytes prin 222. Nu există A/B automat pentru penalizare XP. [Protocolul de performanță](25-performanta-contracte-si-benchmark.md).

## Replay pentru distrugere și provocări

Recorderul include stările decorului, DESTRUCTIBLE_BROKEN și tranzițiile de provocare, cu sessionId/worldEpoch. Resetul marchează o discontinuitate explicită. Scorul provine numai din evenimente live autoritare; vizionarea unei filmări de influencer sau replay-ul unui carambol nu acordă recompense. [Modulul 26](26-joaca-libera-haos-si-distrugere.md) și [modulul 28](28-provocari-random-si-revenire.md) definesc aceste extensii.
