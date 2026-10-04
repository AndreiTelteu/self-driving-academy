# Experimente și indicatori

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

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

Revenue-ul, review-urile și istoricul lor sunt în [economia flotei](22-kpi-economie-si-review-uri.md). Comparația pentru o penalizare XP folosește baseline și fereastră comparabile, conform [XP](23-misiuni-zilnice-si-experienta.md). Dashboardul distinge corelația temporală de atribuirea evaluată. Confortul comenzilor exclude impulsurile de impact; experiența pasagerului și ratingul includ distinct incidentul real, astfel încât o coliziune nu poate produce un rating bun doar fiindcă accelerațiile au fost filtrate.
