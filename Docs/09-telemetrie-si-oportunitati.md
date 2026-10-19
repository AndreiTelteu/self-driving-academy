# Telemetrie și oportunități

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Date înregistrate și extragerea contextului

Telemetria este colectată la fiecare pas fix, cu compactare propusă la 20 de eșantioane pe secundă pentru analiză și păstrarea timpilor de eveniment la rezoluția simulării. Sunt înregistrate tick, poziție, orientare, viteză, accelerație longitudinală și laterală, input brut, comandă efectivă, clasa vehiculului, capacități mecanice, bandă, tip de drum, limită de viteză, curbură, lider și spații, semnal aplicabil, linie de oprire, conflicte și etapa cursei.

Evenimentele includ MANUAL_START, MANUAL_END, LEADER_ACQUIRED, SIGNAL_CHANGED, STOP_APPROACH, STOP_LINE_CROSSED, FULL_STOP, LANE_CHANGE_STARTED, LANE_CHANGE_COMPLETED, COLLISION, PICKUP și DROPOFF. Fiecare oportunitate are un ID și un rezultat; un singur STOP nu este numărat de zeci de ori pentru că a fost observat în multe cadre.

Segmentul păstrează motivul închiderii, versiunea motorului, versiunea hărții și tipul inputului, playerId, profileId, learningEpoch și learningEligible fixat la deschidere. Datele din AUTO și MANUAL nu sunt folosite ca demonstrații; numai LEARNING este eligibil. O cursă poate conține mai multe segmente manuale și autonome.

Recorderul de eșantioane la tick este implementat în 085: `createTickSampleRecorder` din `src/telemetry/tick-samples.ts` scrie pentru fiecare pas fix inputul brut, comanda filtrată, mărimile fizice SI, banda și semnalul autoritativ plus clasa vehiculului în buffere coloană cu capacitate finită (4096 eșantioane × 114 B, retenție maximum 8 segmente / 8 MiB, politică explicită DROP_OLDEST ori DROP_NEWEST). Identitatea segmentului, inclusiv profileId, learningEpoch și learningEligible, este fixată la deschidere și nu se schimbă la mijloc de segment; un toggle de mod ori o schimbare de mașină deschide un segment nou. Eșantioanele MANUAL și AUTO rămân disponibile pentru metrici și istoric, dar nu devin demonstrații prin construcție. Contractul public, capacitățile și probele native sunt în [telemetry-samples](telemetry-samples.md) și [Evidence/085-telemetry-samples](Evidence/085-telemetry-samples/README.md).

Coliziunile sunt păstrate ca dovezi despre consecințe și decizii anterioare impactului. Impulsul fizic al coliziunii nu este interpretat ca frânare sau direcție intenționată. Recuperările, teleportările, pauzele și intervalele cu pierdere de focus sunt marcate și excluse din estimarea comenzilor. Segmentele parțiale pot contribui doar la evenimentele finalizate și observațiile valide.

## Stări de date și integritate

Un segment poate fi OPEN, CLOSED sau INCOMPLETE. O oportunitate poate fi ENTERED, RESOLVED sau TRUNCATED. Rezultatele eligibile se calculează după context; toate cadrele unei apropieri STOP împart același opportunityId. Timpul unui stimul se păstrează la rezoluția tick-ului chiar dacă eșantioanele continue sunt compactate.

Registrul de oportunități din 086 (`createOpportunityRegistry` din `src/telemetry/opportunities.ts`) este proprietarul unic al identității, ciclului de viață și denominatorilor pentru cele cinci tipuri enumerate STOP, RED, GREEN, YIELD și LANE_CHANGE. Identitatea se derivă din contractul 006 plus contextul autoritativ (sesiune, worldEpoch, vehicul, incarnation, bandă/intersecție/semnal/mișcare) și un ordinal de apariție, deci **nu** depinde de cadrul de observare, de numărul de cadre sau de tick-ul observației: aceeași apariție fizică observată la 60 Hz și la cadența de decizie de 10 Hz produce exact o oportunitate și un ID, cu condiția ca fluxurile producătorilor (036/037/053) să fie drenate, nu eșantionate. ENTERED acoperă starea deschisă, RESOLVED poartă un singur rezultat cert (succes sau eșec), iar TRUNCATED este subsetul incomplet, cu motiv explicit din vocabularul închis SUPERSEDED, SEGMENT_CLOSED, OBSERVATION_LOST, SUSPENDED, DISPOSED. Denominatorii expun totalul, subsetul cert (succes plus eșec), subsetul incomplet și împărțirea pe tipuri, astfel încât un estimator ulterior nu poate trata tacit un rezultat incomplet ca succes: `truncated` nu are outcome, o a doua concluzie contrară este numărată ca `contradictionTotal` fără a suprascrie primul rezultat, iar un ID nu este niciodată refolosit, inclusiv după o reapropiere sau o reintrare pe aceeași bandă. Eligibilitatea de învățare este fixată la segmentul de deschidere, ca la 085, deci MANUAL și AUTO rămân în afara denominatorului de învățare prin construcție. Magazia este mărginită (4096 înregistrări implicite, plafon derivat ≈16,75 MiB, sub bugetul `recorderRamBytes`), refuză explicit peste capacitate în loc să elimine dovezi, iar contoarele cumulative supraviețuiesc eliminării și `dispose()`. Contractul complet, tabelele și limitele sunt în [opportunity-ids](opportunity-ids.md), cu testele și proba nativă în [Evidence/086-opportunity-ids](Evidence/086-opportunity-ids/README.md).

Validatorul verifică monotonia tick-urilor, entityId, contexte, input source și completitudinea. Bufferul are limite măsurate; retenția nu elimină automat dovezile agregate. Datele brute și agregările au versiuni distincte de transformare.

## Fluxuri separate de înregistrare

Telemetria intervențiilor MANUAL și LEARNING păstrează sursa și eligibilitatea; replay-ul lumii înregistrează separat toate taxiurile și civilele, inclusiv în AUTO. Nici replay-ul, nici review-urile sau KPI-urile nu sunt convertite în demonstrații de driving. Contractul recorderului și retenția sunt în [experimente](14-experimente-si-indicatori.md).

Pentru timpi de reacție, stimulul trebuie să fie observabil din perspectiva jucătorului: fereastră de vizibilitate sau fixture controlat, cu tick de debut. Un pericol ascuns în spatele unei clădiri nu justifică o reacție personală lentă. Nu se introduce percepție LiDAR sau camere AI; este o regulă de eligibilitate a demonstrației.

## Capacități și transferuri

090/222 folosesc chunkuri și buffere numerice cu plafon în bytes, păstrând timpii evenimentelor. Intervențiile lungi pot avea rollover cu continuitate declarată; oportunitățile nu sunt dublate sau eliminate tacit. Transferul de buffer are ownership explicit și nu detașează datele live. Limitele RAM/coadă și pressure policy sunt definite în [modulul 25](25-performanta-contracte-si-benchmark.md); replay-ul opțional este primul candidat la retenție, nu dovezile de learning.

## Proveniența reglajelor și a sesiunii

InterventionSegment include sessionId, worldEpoch și controlPreferencesVersion. Schimbarea asistențelor închide segmentul la tick și păstrează comenzile brute/efective. Resetul sau schimbarea Academie/Haos închide segmentele și invalidează joburile lumii vechi. Distrugerea și driftul au evenimente pentru provocări și replay, fără a fi convertite în parametri de driving. Contractele sunt în [modulele 26](26-joaca-libera-haos-si-distrugere.md) și [27](27-reglaje-hud-si-camera.md).
