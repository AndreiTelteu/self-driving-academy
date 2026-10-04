# Telemetrie și oportunități

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Date înregistrate și extragerea contextului

Telemetria este colectată la fiecare pas fix, cu compactare propusă la 20 de eșantioane pe secundă pentru analiză și păstrarea timpilor de eveniment la rezoluția simulării. Sunt înregistrate tick, poziție, orientare, viteză, accelerație longitudinală și laterală, input brut, comandă efectivă, clasa vehiculului, capacități mecanice, bandă, tip de drum, limită de viteză, curbură, lider și spații, semnal aplicabil, linie de oprire, conflicte și etapa cursei.

Evenimentele includ MANUAL_START, MANUAL_END, LEADER_ACQUIRED, SIGNAL_CHANGED, STOP_APPROACH, STOP_LINE_CROSSED, FULL_STOP, LANE_CHANGE_STARTED, LANE_CHANGE_COMPLETED, COLLISION, PICKUP și DROPOFF. Fiecare oportunitate are un ID și un rezultat; un singur STOP nu este numărat de zeci de ori pentru că a fost observat în multe cadre.

Segmentul păstrează motivul închiderii, versiunea motorului, versiunea hărții și tipul inputului, playerId, profileId, learningEpoch și learningEligible fixat la deschidere. Datele din AUTO și MANUAL nu sunt folosite ca demonstrații; numai LEARNING este eligibil. O cursă poate conține mai multe segmente manuale și autonome.

Coliziunile sunt păstrate ca dovezi despre consecințe și decizii anterioare impactului. Impulsul fizic al coliziunii nu este interpretat ca frânare sau direcție intenționată. Recuperările, teleportările, pauzele și intervalele cu pierdere de focus sunt marcate și excluse din estimarea comenzilor. Segmentele parțiale pot contribui doar la evenimentele finalizate și observațiile valide.

## Stări de date și integritate

Un segment poate fi OPEN, CLOSED sau INCOMPLETE. O oportunitate poate fi ENTERED, RESOLVED sau TRUNCATED. Rezultatele eligibile se calculează după context; toate cadrele unei apropieri STOP împart același opportunityId. Timpul unui stimul se păstrează la rezoluția tick-ului chiar dacă eșantioanele continue sunt compactate.

Validatorul verifică monotonia tick-urilor, entityId, contexte, input source și completitudinea. Bufferul are limite măsurate; retenția nu elimină automat dovezile agregate. Datele brute și agregările au versiuni distincte de transformare.

## Fluxuri separate de înregistrare

Telemetria intervențiilor MANUAL și LEARNING păstrează sursa și eligibilitatea; replay-ul lumii înregistrează separat toate taxiurile și civilele, inclusiv în AUTO. Nici replay-ul, nici review-urile sau KPI-urile nu sunt convertite în demonstrații de driving. Contractul recorderului și retenția sunt în [experimente](14-experimente-si-indicatori.md).

Pentru timpi de reacție, stimulul trebuie să fie observabil din perspectiva jucătorului: fereastră de vizibilitate sau fixture controlat, cu tick de debut. Un pericol ascuns în spatele unei clădiri nu justifică o reacție personală lentă. Nu se introduce percepție LiDAR sau camere AI; este o regulă de eligibilitate a demonstrației.

## Capacități și transferuri

090/222 folosesc chunkuri și buffere numerice cu plafon în bytes, păstrând timpii evenimentelor. Intervențiile lungi pot avea rollover cu continuitate declarată; oportunitățile nu sunt dublate sau eliminate tacit. Transferul de buffer are ownership explicit și nu detașează datele live. Limitele RAM/coadă și pressure policy sunt definite în [modulul 25](25-performanta-contracte-si-benchmark.md); replay-ul opțional este primul candidat la retenție, nu dovezile de learning.

## Proveniența reglajelor și a sesiunii

InterventionSegment include sessionId, worldEpoch și controlPreferencesVersion. Schimbarea asistențelor închide segmentul la tick și păstrează comenzile brute/efective. Resetul sau schimbarea Academie/Haos închide segmentele și invalidează joburile lumii vechi. Distrugerea și driftul au evenimente pentru provocări și replay, fără a fi convertite în parametri de driving. Contractele sunt în [modulele 26](26-joaca-libera-haos-si-distrugere.md) și [27](27-reglaje-hud-si-camera.md).
