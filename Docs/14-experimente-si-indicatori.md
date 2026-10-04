# Experimente și indicatori

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Indicatori și comparații

Indicatorii de serviciu sunt curse finalizate, rată de finalizare, durată până la pickup, durată de cursă, întârziere față de referință și timpul total blocat. ETA este o estimare și poate varia cu traficul și stilul.

Indicatorii de comportament sunt distribuții de viteză față de limita din hartă, headway la viteze eligibile, reacție la verde, opriri complete și probabilități de încălcare. Indicatorii de confort folosesc accelerație, accelerație laterală și jerk în intervale cu pasager.

Încălcările se raportează per oportunitate relevantă: roșu per apropiere eligibilă, STOP per traversare STOP, prioritate per conflict eligibil. Coliziunile se raportează atât ca număr brut, cât și per 100 de kilometri-vehicul ai flotei; la expunere zero rata este indisponibilă. Durata de depășire a vitezei se raportează la timpul cu o limită validă.

Coliziunile continue între aceeași pereche nu sunt numărate la fiecare cadru. O regulă de separare și cooldown definește un incident nou. Evenimentele păstrează vehiculele implicate, cauza de simulare cunoscută și consecința fizică; atribuirea vinei nu este prezentată ca adevăr dacă nu poate fi stabilită.

### Comparație între două profiluri

Un scenariu salvează harta, vehiculele, starea fizicii, stările semafoarelor, cererile de curse, starea dispecerului și seed-urile. Două rulări pornesc din același snapshot și folosesc profiluri diferite. Pentru oportunitățile probabilistice se folosesc numere aleatoare asociate stabil cu taxiul și evenimentul, reducând variația care nu ține de profil.

Traiectoriile divergente pot produce oportunități diferite; rezultatul nu este prezentat ca demonstrație că un singur parametru a cauzat toate diferențele. Pentru izolarea unui parametru se folosesc scenarii dedicate. Pentru efectele asupra orașului se rulează mai multe seed-uri și se afișează distribuțiile, expunerea și mărimea eșantionului.

Replay-ul vizual citește stări înregistrate. Rerularea simulează din nou comenzile sau politica. Sunt funcții distincte. Reproductibilitatea este o țintă pentru aceeași combinație de versiuni și platformă verificată; identitatea bit cu bit între orice browser și GPU nu este presupusă.

Jucătorul poate observa flota cu profilul nou, compara înainte și după și deschide istoricul unei încălcări. Instrumentele de analiză extind progresul prin misiuni fără să schimbe automat profilul ales.
