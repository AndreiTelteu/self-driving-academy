# Telemetrie și oportunități

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Date înregistrate și extragerea contextului

Telemetria este colectată la fiecare pas fix, cu compactare propusă la 20 de eșantioane pe secundă pentru analiză și păstrarea timpilor de eveniment la rezoluția simulării. Sunt înregistrate tick, poziție, orientare, viteză, accelerație longitudinală și laterală, input brut, comandă efectivă, clasa vehiculului, capacități mecanice, bandă, tip de drum, limită de viteză, curbură, lider și spații, semnal aplicabil, linie de oprire, conflicte și etapa cursei.

Evenimentele includ MANUAL_START, MANUAL_END, LEADER_ACQUIRED, SIGNAL_CHANGED, STOP_APPROACH, STOP_LINE_CROSSED, FULL_STOP, LANE_CHANGE_STARTED, LANE_CHANGE_COMPLETED, COLLISION, PICKUP și DROPOFF. Fiecare oportunitate are un ID și un rezultat; un singur STOP nu este numărat de zeci de ori pentru că a fost observat în multe cadre.

Segmentul păstrează motivul închiderii, versiunea motorului, versiunea hărții și tipul inputului. Datele din AUTO nu sunt folosite ca demonstrații ale jucătorului. O cursă poate conține mai multe segmente manuale și autonome.

Coliziunile sunt păstrate ca dovezi despre consecințe și decizii anterioare impactului. Impulsul fizic al coliziunii nu este interpretat ca frânare sau direcție intenționată. Recuperările, teleportările, pauzele și intervalele cu pierdere de focus sunt marcate și excluse din estimarea comenzilor. Segmentele parțiale pot contribui doar la evenimentele finalizate și observațiile valide.

## Stări de date și integritate

Un segment poate fi OPEN, CLOSED sau INCOMPLETE. O oportunitate poate fi ENTERED, RESOLVED sau TRUNCATED. Rezultatele eligibile se calculează după context; toate cadrele unei apropieri STOP împart același opportunityId. Timpul unui stimul se păstrează la rezoluția tick-ului chiar dacă eșantioanele continue sunt compactate.

Validatorul verifică monotonia tick-urilor, entityId, contexte, input source și completitudinea. Bufferul are limite măsurate; retenția nu elimină automat dovezile agregate. Datele brute și agregările au versiuni distincte de transformare.
