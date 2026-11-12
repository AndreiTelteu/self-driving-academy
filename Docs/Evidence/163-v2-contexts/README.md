# 163 — scenarii și telemetrie pentru parametrii V2

PBI 163 închide legătura dintre catalogul celor 56 de chei R și telemetria reală: fiecare cheie are un
context observabil, o etichetă în română și un scenariu reprezentativ, cu date de manual verificabile.
Contractul este [`163-v2-contexts-v1`](../../../src/telemetry/v2-contexts.ts); raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

Regula oracolului: fiecare context este **numărat** din faptele reale ale contractelor 085/069
(eșantion de telemetrie), 007 (flux de evenimente), 030 (observație de pericol), 033/219 (fapt de
rutare) și 061 (fapt de serviciu). Nicio valoare nu este afirmată fără un cadru care o conține.

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Chei R acoperite | **56/56** |
| Categorii reprezentative | **10/10** |
| Scenarii reprezentative | **10/10** |
| Cadre evaluate | **60** (10 × 6) |
| Chei observabile în controlul negativ | **0** |
| Chei V1 protejate | **24** |
| Amprenta SHA-256 a raportului | `d224cf567f54ac9d0846b78986657ecc320c4712eaf05b8e4c9be96169cf4243` |
| Verdict | **PASS** |

## Scenarii reprezentative

| Scenariu | Categorie | Cadre | Chei observabile | Triggeri | Reprezentativ |
| --- | --- | ---: | ---: | ---: | --- |
| speed-arterial-rhythm | SPEED | 6 | 4/4 | 2/2 | da |
| longitudinal-coast-brake | LONGITUDINAL | 6 | 4/4 | 2/2 | da |
| following-leader-gap | FOLLOWING | 6 | 4/4 | 2/2 | da |
| signals-red-green-cycle | SIGNALS | 6 | 4/4 | 2/2 | da |
| stop-priority-conflict | STOP_PRIORITY | 6 | 4/4 | 2/2 | da |
| lane-change-overtake | LANE_CHANGE | 6 | 4/4 | 2/2 | da |
| lateral-curve-tracking | LATERAL | 6 | 8/8 | 2/2 | da |
| routing-blocked-reroute | ROUTING | 6 | 8/8 | 3/3 | da |
| hazards-crosswalk-obstacle | HAZARDS | 6 | 8/8 | 3/3 | da |
| service-pickup-dropoff | SERVICE | 6 | 8/8 | 2/2 | da |

Controlul negativ `control-flat-cruise` (croazieră urbană uniformă, fără lider, fără semnal, fără
linie de oprire, fără pericol) produce **0 chei observabile** și **0** categorii reprezentative, deci
verificarea nu este tautologică: un scenariu fără faptele cerute nu poate pretinde acoperire.

## Ce înseamnă „reprezentabil" și cum este demonstrat

Un scenariu este reprezentativ pentru categoria lui numai dacă **ambele** condiții sunt numărate ca
îndeplinite:

1. **Toate cheile categoriei sunt observabile** — fiecare fapt cerut de context apare în cadre, iar
   contextul se completează la cadrul ultimului fapt lipsă. Numărul de chei observabile este comparat
   cu numărul real de chei al categoriei (4 sau 8).
2. **Toate declanșatoarele categoriei sunt observate** — declanșatoarele sunt fapte numerice, nu text:

| Scenariu | Trigger | Observat | Dovada numerică |
| --- | --- | --- | --- |
| speed-arterial-rhythm | CRUISING_ON_TWO_ROAD_TYPES | DA | 3 tipuri de drum fără lider: ARTERIAL, RESIDENTIAL, URBAN |
| speed-arterial-rhythm | SPEED_ABOVE_AND_BELOW_LIMIT | DA | 1 eșantion peste limită, 5 sub limită |
| longitudinal-coast-brake | ACCELERATION_AND_DECELERATION | DA | accelerație maximă 0,80 m/s², minimă −3,20 m/s² |
| longitudinal-coast-brake | BRAKE_ONSET_BEHIND_LEADER | DA | 3 eșantioane cu frână și lider |
| following-leader-gap | LEADER_GAP_SEQUENCE | DA | 6 eșantioane cu lider, 5 pași de scădere |
| following-leader-gap | LEADER_CHANGE_OBSERVED | DA | 2 eșantioane cu LEADER_ACQUIRED |
| signals-red-green-cycle | RED_TO_GREEN_CYCLE | DA | 3 roșu, 2 verde, 6 cu linie de oprire |
| signals-red-green-cycle | SIGNAL_PHASE_CHANGE_EVENT | DA | 1 eveniment SIGNAL_PHASE_CHANGED |
| stop-priority-conflict | STOP_APPROACH_AND_FULL_STOP | DA | 1 STOP_APPROACH, 1 FULL_STOP |
| stop-priority-conflict | PRIORITY_CONFLICT_SERIES | DA | 2 eșantioane cu conflict |
| lane-change-overtake | LANE_CHANGE_START_AND_COMPLETE | DA | 1 începută, 1 finalizată, 1 pereche |
| lane-change-overtake | TURN_SIGNAL_BEFORE_MANOEUVRE | DA | semnalizare la index 0, manevră la index 2 |
| lateral-curve-tracking | CURVATURE_WITH_STEERING | DA | 6 cu curbură, 6 cu viraj, 6 cu accelerație laterală |
| lateral-curve-tracking | SUSTAINED_LATERAL_LOAD | DA | 6 eșantioane cu accelerație laterală |
| routing-blocked-reroute | COMPARABLE_ALTERNATIVES | DA | 3 alternative evaluate |
| routing-blocked-reroute | BLOCKED_THEN_REROUTE | DA | blocat true, rerutare true |
| routing-blocked-reroute | REVERSE_RECOVERY_OBSERVED | DA | 1 eșantion în recuperare, 6 cu viteză |
| hazards-crosswalk-obstacle | PEDESTRIAN_OBSERVABLE | DA | 4 eșantioane cu pieton observabil |
| hazards-crosswalk-obstacle | OBSTACLE_OBSERVABLE | DA | 2 eșantioane cu obstacol observabil |
| hazards-crosswalk-obstacle | HAZARD_RESPONSE | DA | 5 eșantioane cu pericol și răspuns |
| service-pickup-dropoff | PICKUP_AND_DROPOFF_EVENTS | DA | 1 PICKUP, 1 DROPOFF |
| service-pickup-dropoff | PASSENGER_ONBOARD_SEGMENT | DA | 2 eșantioane cu pasager la bord |

## Cheie → context → scenariu → etichetă

| Cheie | Categorie | Context | Etichetă | Scenariu | Oportunitate 086 |
| --- | --- | --- | --- | --- | --- |
| `speed_delta_arterial` | Viteză și ritm | v2c-arterial-cruise | Croazieră pe arteră, fără lider | speed-arterial-rhythm | — |
| `cruise_speed_variability` | Viteză și ritm | v2c-cruise-variability | Variație naturală a vitezei de croazieră | speed-arterial-rhythm | — |
| `overtake_speed_bonus` | Viteză și ritm | v2c-overtake-bonus | Bonus de viteză la depășire | speed-arterial-rhythm | — |
| `cruise_accel_deadband` | Viteză și ritm | v2c-accel-deadband | Bandă moartă a accelerației de croazieră | speed-arterial-rhythm | — |
| `braking_jerk` | Accelerație și frânare | v2c-braking-jerk | Jerk la intrarea în frână | longitudinal-coast-brake | — |
| `throttle_release_delay` | Accelerație și frânare | v2c-throttle-release | Întârzierea ridicării accelerației | longitudinal-coast-brake | — |
| `launch_intensity` | Accelerație și frânare | v2c-launch-intensity | Intensitatea plecării de pe loc | longitudinal-coast-brake | — |
| `coasting_bias` | Accelerație și frânare | v2c-coasting-bias | Preferința pentru coasting | longitudinal-coast-brake | — |
| `cutin_brake_response` | Urmărire și distanțe | v2c-cutin-brake | Reacția la un vehicul care se bagă în față | following-leader-gap | — |
| `closing_ttc_threshold` | Urmărire și distanțe | v2c-closing-ttc | Prag de închidere a timpului până la coliziune | following-leader-gap | — |
| `leader_change_delay` | Urmărire și distanțe | v2c-leader-change | Întârzierea la schimbarea liderului | following-leader-gap | — |
| `following_hysteresis` | Urmărire și distanțe | v2c-following-hysteresis | Histerezisul distanței de urmărire | following-leader-gap | — |
| `yellow_stop_probability` | Semafoare | v2c-yellow-stop | Decizia de oprire pe galben | signals-red-green-cycle | — |
| `red_run_gap_acceptance` | Semafoare | v2c-red-run-gap | Acceptarea unui interval de trecere pe roșu | signals-red-green-cycle | RED |
| `yellow_commit_time` | Semafoare | v2c-yellow-commit | Timpul de angajare pe galben | signals-red-green-cycle | — |
| `green_launch_acceleration` | Semafoare | v2c-green-launch | Accelerația la plecarea pe verde | signals-red-green-cycle | GREEN |
| `rolling_stop_speed` | STOP și prioritate | v2c-rolling-stop | Viteza la un STOP rostogolit | stop-priority-conflict | STOP |
| `priority_assertiveness` | STOP și prioritate | v2c-priority-assertiveness | Asertivitatea la cedarea de prioritate | stop-priority-conflict | YIELD |
| `allway_stop_patience` | STOP și prioritate | v2c-allway-patience | Răbdarea la o intersecție cu prioritate din toate direcțiile | stop-priority-conflict | STOP |
| `blocked_intersection_entry_probability` | STOP și prioritate | v2c-blocked-entry | Intrarea într-o intersecție blocată | stop-priority-conflict | STOP |
| `lane_change_duration` | Schimbare de bandă și depășire | v2c-lane-change-duration | Durata manevrei de schimbare a benzii | lane-change-overtake | LANE_CHANGE |
| `signal_lead_time` | Schimbare de bandă și depășire | v2c-signal-lead-time | Timpul dintre semnalizare și manevră | lane-change-overtake | LANE_CHANGE |
| `signal_use_probability` | Schimbare de bandă și depășire | v2c-signal-use | Probabilitatea de a semnaliza | lane-change-overtake | LANE_CHANGE |
| `pass_on_right_probability` | Schimbare de bandă și depășire | v2c-pass-on-right | Depășirea prin dreapta | lane-change-overtake | LANE_CHANGE |
| `lane_center_offset` | Control lateral și viraje | v2c-lane-center-offset | Offsetul față de centrul benzii | lateral-curve-tracking | — |
| `steering_response_time` | Control lateral și viraje | v2c-steering-response | Timpul de răspuns al direcției | lateral-curve-tracking | — |
| `steering_rate_limit` | Control lateral și viraje | v2c-steering-rate | Limita vitezei de bracare | lateral-curve-tracking | — |
| `turn_entry_speed` | Control lateral și viraje | v2c-turn-entry-speed | Viteza de intrare în viraj | lateral-curve-tracking | — |
| `turn_exit_acceleration` | Control lateral și viraje | v2c-turn-exit-accel | Accelerația la ieșirea din viraj | lateral-curve-tracking | — |
| `corner_cutting_bias` | Control lateral și viraje | v2c-corner-cutting | Tendința de a tăia virajul | lateral-curve-tracking | — |
| `lateral_clearance` | Control lateral și viraje | v2c-lateral-clearance | Distanța laterală față de un obstacol | lateral-curve-tracking | — |
| `lateral_correction_deadband` | Control lateral și viraje | v2c-lateral-deadband | Banda moartă a corecțiilor laterale | lateral-curve-tracking | — |
| `route_time_weight` | Trasee și recuperare | v2c-route-time | Ponderea timpului în alegerea traseului | routing-blocked-reroute | — |
| `route_distance_weight` | Trasee și recuperare | v2c-route-distance | Ponderea distanței în alegerea traseului | routing-blocked-reroute | — |
| `route_turn_penalty` | Trasee și recuperare | v2c-route-turn-penalty | Penalizarea virajelor în costul traseului | routing-blocked-reroute | — |
| `route_signal_penalty` | Trasee și recuperare | v2c-route-signal-penalty | Penalizarea semafoarelor în costul traseului | routing-blocked-reroute | — |
| `route_congestion_penalty` | Trasee și recuperare | v2c-route-congestion | Penalizarea congestiei în costul traseului | routing-blocked-reroute | — |
| `reroute_patience` | Trasee și recuperare | v2c-reroute-patience | Răbdarea înainte de rerutare | routing-blocked-reroute | — |
| `u_turn_willingness` | Trasee și recuperare | v2c-u-turn | Disponibilitatea pentru întoarcere | routing-blocked-reroute | — |
| `reverse_recovery_duration` | Trasee și recuperare | v2c-reverse-recovery | Durata recuperării prin mers înapoi | routing-blocked-reroute | — |
| `pedestrian_yield_probability` | Pietoni și pericole | v2c-pedestrian-yield | Cedarea către un pieton | hazards-crosswalk-obstacle | — |
| `pedestrian_clearance` | Pietoni și pericole | v2c-pedestrian-clearance | Distanța de siguranță față de pieton | hazards-crosswalk-obstacle | — |
| `hazard_reaction_delay` | Pietoni și pericole | v2c-hazard-reaction | Întârzierea de reacție la pericol | hazards-crosswalk-obstacle | — |
| `obstacle_clearance` | Pietoni și pericole | v2c-obstacle-clearance | Distanța față de un obstacol | hazards-crosswalk-obstacle | — |
| `emergency_brake_intensity` | Pietoni și pericole | v2c-emergency-brake | Intensitatea frânei de urgență | hazards-crosswalk-obstacle | — |
| `evasive_steer_willingness` | Pietoni și pericole | v2c-evasive-steer | Disponibilitatea pentru viraj de evitare | hazards-crosswalk-obstacle | — |
| `crosswalk_approach_speed` | Pietoni și pericole | v2c-crosswalk-approach | Viteza de apropiere de trecerea de pietoni | hazards-crosswalk-obstacle | — |
| `horn_use_probability` | Pietoni și pericole | v2c-horn-use | Folosirea claxonului într-o oportunitate | hazards-crosswalk-obstacle | — |
| `pickup_approach_speed` | Pickup și confortul pasagerilor | v2c-pickup-approach | Viteza de apropiere de pickup | service-pickup-dropoff | — |
| `pickup_curb_distance` | Pickup și confortul pasagerilor | v2c-pickup-curb | Distanța la bordură la pickup | service-pickup-dropoff | — |
| `pickup_stop_precision` | Pickup și confortul pasagerilor | v2c-pickup-precision | Precizia opririi la pickup | service-pickup-dropoff | — |
| `pickup_dwell_time` | Pickup și confortul pasagerilor | v2c-pickup-dwell | Timpul de staționare la pickup | service-pickup-dropoff | — |
| `dropoff_approach_speed` | Pickup și confortul pasagerilor | v2c-dropoff-approach | Viteza de apropiere de dropoff | service-pickup-dropoff | — |
| `dropoff_curb_distance` | Pickup și confortul pasagerilor | v2c-dropoff-curb | Distanța la bordură la dropoff | service-pickup-dropoff | — |
| `occupied_acceleration_scale` | Pickup și confortul pasagerilor | v2c-occupied-accel | Scalarea accelerației cu pasager | service-pickup-dropoff | — |
| `occupied_lateral_accel_scale` | Pickup și confortul pasagerilor | v2c-occupied-lateral | Scalarea accelerației laterale cu pasager | service-pickup-dropoff | — |

## Date de manual per context

Ce trebuie să facă jucătorul ca să întâlnească fiecare context, determinist și verificabil:

| Cheie | Pregătire | Acțiune | Dovadă observabilă |
| --- | --- | --- | --- |
| `speed_delta_arterial` | Pornește un taxi în LEARNING pe o arteră cu limită ridicată și fără trafic în față. | Menține 20–30 s o viteză constantă, fără frână și fără schimbare de bandă. | Eșantioane cu roadType ARTERIAL, viteza peste 5 m/s și leaderId null. |
| `cruise_speed_variability` | Rulează în LEARNING pe același drum drept, cu banda liberă. | Lasă accelerația să varieze natural câteva secunde, apoi ridică piciorul de pe accelerație. | Cel puțin un eșantion cu throttle 0 și brake 0 la viteză peste 1 m/s, plus accelerație longitudinală nenulă. |
| `overtake_speed_bonus` | Așază-te în spatele unui vehicul mai lent, pe o bandă cu a doua bandă liberă. | Semnalizează, schimbă banda și depășește vehiculul din față. | Eșantion cu lider măsurat, eveniment LANE_CHANGE_STARTED și throttle peste 0 în aceeași fereastră. |
| `cruise_accel_deadband` | Rulează în LEARNING la viteză de croazieră pe drum drept. | Ține accelerația aproape constantă, cu mici corecții sub 10 %. | Eșantioane consecutive cu throttle peste 0, viteză peste 5 m/s și accelerație longitudinală mică, dar nenulă. |
| `braking_jerk` | Abordează o intersecție cu semafor roșu, la viteză de oraș. | Apasă frâna progresiv până la oprire, fără să eliberezi brusc pedala. | Eșantioane cu brake peste 0 și accelerație longitudinală negativă în aceeași fereastră. |
| `throttle_release_delay` | Intră în urmărirea unui vehicul mai lent, cu spațiu de 15–25 m. | Ridică accelerația când spațiul scade, apoi rulează în coasting înainte de a frâna. | Eșantion cu lider măsurat, throttle 0 și brake 0 la viteză peste 1 m/s. |
| `launch_intensity` | Oprește complet la o linie STOP sau la un semafor verde. | Pleacă de pe loc cu accelerație moderată, fără patinare. | Eșantioane cu linie de oprire măsurată, throttle peste 0 și accelerație longitudinală pozitivă. |
| `coasting_bias` | Rulează pe un drum drept, cu o coborâre ușoară sau o apropiere de intersecție. | Eliberează complet accelerația și lasă mașina să încetinească singură câteva secunde. | Cel puțin două eșantioane cu throttle 0, brake 0 și viteză peste 1 m/s. |
| `cutin_brake_response` | Rulează în urmărirea unui lider, cu un al doilea vehicul pe banda alăturată. | Lasă vehiculul lateral să intre în față și frânează ca să refaci spațiul. | Eveniment LEADER_ACQUIRED, lider măsurat în eșantion și brake peste 0 imediat după. |
| `closing_ttc_threshold` | Apropie-te de un lider care merge cu 3–5 m/s mai încet. | Menține apropierea fără să frânezi până când spațiul devine incomod, apoi reglează. | Eșantioane consecutive cu lider, viteză peste 5 m/s și spațiu în scădere. |
| `leader_change_delay` | Urmează un lider care părăsește banda (virează) și lasă loc unui al doilea lider. | Continuă fără să accelerezi până când noul lider este confirmat. | Două evenimente LEADER_ACQUIRED cu id-uri diferite și lider măsurat în eșantionul din aceeași fereastră. |
| `following_hysteresis` | Urmează un lider care își variază ușor viteza, pe o bandă dreaptă. | Lasă spațiul să oscileze și corectează doar când se atinge limita de confort. | Cel puțin trei eșantioane cu lider și accelerație longitudinală atât pozitivă, cât și negativă. |
| `yellow_stop_probability` | Abordează o intersecție semaforizată la 40–60 m, cu semaforul verde. | Continuă până când semaforul devine galben, apoi decide oprirea sau trecerea. | Eșantioane cu signalState YELLOW și distanță la linia de oprire măsurată. |
| `red_run_gap_acceptance` | Stai la roșu, cu un vehicul care traversează pe direcția conflictuală. | Așteaptă roșul și evaluează dacă intervalul dintre vehicule permite trecerea. | Oportunitate RED cu linie de oprire măsurată și conflict activ în aceeași fereastră. |
| `yellow_commit_time` | Apropie-te de intersecție cu 8–12 m/s, la 30 m de linie. | Menține viteza când apare galbenul, fără frână bruscă. | Eșantioane cu signalState YELLOW, viteză peste 5 m/s și linie de oprire măsurată. |
| `green_launch_acceleration` | Fii primul în coadă la un semafor roșu, în LEARNING. | Pleacă imediat ce semaforul devine verde, cu accelerație constantă. | Oportunitate GREEN urmată de eșantioane cu throttle peste 0 și accelerație longitudinală pozitivă. |
| `rolling_stop_speed` | Abordează o intersecție fără semafor, cu linie STOP marcată. | Ridică accelerația devreme și rulează prin zonă fără oprire completă. | Oportunitate STOP cu viteză peste 0,5 m/s la linie și brake peste 0 în apropiere. |
| `priority_assertiveness` | Ajunge la o intersecție cu prioritate din toate direcțiile, cu un vehicul care are prioritate. | Alege să insiști sau să cedezi, în funcție de intervalul disponibil. | Stimul YIELD cu id-uri de relație și lider măsurat în aceeași fereastră. |
| `allway_stop_patience` | Ajunge al doilea la o intersecție cu prioritate din toate direcțiile. | Așteaptă oprirea liderului din față înainte de a intra în intersecție. | Oportunitate STOP cu lider oprit în față, sub pragul de standstill. |
| `blocked_intersection_entry_probability` | Intersecție aglomerată, cu coadă care blochează ieșirea. | Hotărăște dacă intri în intersecție sau aștepți eliberarea ei. | Linie de oprire măsurată, conflict activ și lider în aceeași fereastră. |
| `lane_change_duration` | Rulează pe un bulevard cu două benzi pe sens, banda din dreapta liberă. | Semnalizează și schimbă banda o singură dată, lin, fără corecții. | Evenimente LANE_CHANGE_STARTED și LANE_CHANGE_COMPLETED pentru aceeași bandă sursă și destinație. |
| `signal_lead_time` | Pregătește o depășire pe un drum cu două benzi. | Semnalizează cu câteva secunde înainte de a începe virajul de bandă. | Eșantion cu turnSignal LEFT/RIGHT înainte de LANE_CHANGE_STARTED și viraj peste 0. |
| `signal_use_probability` | Ai de făcut o schimbare de bandă pe un drum liber. | Alege conștient dacă semnalizezi sau nu înainte de manevră. | Eveniment LANE_CHANGE_STARTED cu turnSignal LEFT/RIGHT în eșantionul din aceeași fereastră. |
| `pass_on_right_probability` | Un vehicul lent ocupă banda din stânga pe un drum cu două benzi. | Continuă pe banda din dreapta și depășește prin dreapta. | Lider măsurat, LANE_CHANGE_STARTED în aceeași fereastră și throttle peste 0. |
| `lane_center_offset` | Intră într-o curbă de rază medie, pe o bandă marcată. | Parcurge curba cu corecții mici, fără să atingi marcajul. | Eșantioane cu curbură nenulă, viraj nenul și accelerație laterală măsurată. |
| `steering_response_time` | Rulează pe un drum drept, apoi intră într-o curbă ușoară. | Aplică o corecție scurtă de direcție și observă când apare accelerația laterală. | Eșantioane cu viraj nenul și accelerație laterală nenulă în aceeași fereastră. |
| `steering_rate_limit` | Abordează o curbă strânsă la 50–60 km/h. | Braciază rapid la intrare și menține direcția prin curbă. | Eșantioane cu viteză peste 5 m/s, viraj nenul și accelerație laterală măsurată. |
| `turn_entry_speed` | Apropie-te de un viraj de 90 de grade, cu vizibilitate bună. | Frânează înainte de viraj și intră cu viteză constantă. | Eșantioane cu curbură peste prag, viteză peste 5 m/s și viraj nenul. |
| `turn_exit_acceleration` | Ieși dintr-un viraj de 90 de grade pe un drum drept. | Accelerează progresiv după ce direcția este stabilizată. | Eșantioane cu curbură măsurată, throttle peste 0 și accelerație longitudinală pozitivă. |
| `corner_cutting_bias` | Virează la stânga într-o intersecție fără trafic. | Alege traiectoria: arcuiește larg sau taie colțul. | Eșantioane cu curbură mare, viraj susținut și accelerație laterală măsurată. |
| `lateral_clearance` | Treacă pe lângă un vehicul oprit pe marginea benzii. | Alege cât de aproape treci și corectează direcția. | Conflict activ în eșantion, viraj nenul și accelerație laterală măsurată. |
| `lateral_correction_deadband` | Rulează pe un drum drept, cu derivă mică spre marginea benzii. | Lasă deriva să crească și corectează doar când este vizibilă. | Eșantioane cu viraj mic, curbură măsurată și accelerație laterală nenulă. |
| `route_time_weight` | Pornește o cursă cu două trasee comparabile, unul cu mai puține semafoare. | Lasă planificatorul să aleagă și repetă cursa de trei ori. | Fapt de rutare cu cel puțin două alternative și semafoare numărate pe traseu. |
| `route_distance_weight` | Pornește o cursă cu un traseu scurt cu viraje și unul lung drept. | Compară cele două alegeri în două curse identice. | Fapt de rutare cu alternative multiple și viraje numărate. |
| `route_turn_penalty` | Alege între un traseu cu două viraje și unul drept, de lungime apropiată. | Rulează ambele variante și compară timpii. | Alternative comparabile cu număr de viraje măsurat pe fiecare. |
| `route_signal_penalty` | Alege între un traseu cu trei semafoare și unul cu unul singur. | Rulează traseul cu semafoare și oprește la roșu, apoi compară. | Alternative cu semafoare numărate și cel puțin un eșantion cu semafor roșu. |
| `route_congestion_penalty` | Pornește într-o zonă cu trafic, cu o alternativă liberă. | Observă dacă planificatorul ocolește zona congestionată. | Alternative cu congestie raportată și conflict activ în aceeași fereastră. |
| `reroute_patience` | Intră pe o bandă blocată de un vehicul oprit, cu alternativă disponibilă. | Așteaptă fără să ocolești până când decizia de rerutare apare. | Fapt de rutare BLOCKED urmat de etapa REROUTE în aceeași fereastră. |
| `u_turn_willingness` | Ratează intrarea pe destinație și primește o alternativă cu întoarcere. | Alege între întoarcere și un ocol lung. | Fapt de rutare cu întoarcere disponibilă și alternative multiple. |
| `reverse_recovery_duration` | Blochează-te într-o fundătură îngustă, fără spațiu de întoarcere. | Execută manevra de recuperare prin mers înapoi până la ieșire. | Fapt de recuperare în etapa RECOVERY și eșantioane cu viteză măsurată. |
| `pedestrian_yield_probability` | Apropie-te de o trecere de pietoni cu un pieton observabil pe trotuar. | Decide dacă oprești sau continui când pietonul intră în zonă. | Observație de pericol PEDESTRIAN activă și observabilă, plus brake peste 0. |
| `pedestrian_clearance` | Treacă pe lângă un pieton care așteaptă la marginea trecerii. | Alege viteza și traiectoria de trecere. | Pericol PEDESTRIAN observabil și viteză măsurată în aceeași fereastră. |
| `hazard_reaction_delay` | Pietonul apare la 25 m, pe o trecere fără semafor. | Frânează cât de repede consideri necesar. | Pericol observabil, brake peste 0 și accelerație longitudinală negativă imediat după. |
| `obstacle_clearance` | Un obstacol oprește banda la 30 m. | Alege dacă încetinești sau ocolești. | Pericol OBSTACLE observabil și viteză măsurată în aceeași fereastră. |
| `emergency_brake_intensity` | Obstacolul apare brusc la 15 m, fără timp de ocolire. | Apasă frâna la maximum. | Pericol observabil, brake peste 0 și decelerație măsurată în aceeași fereastră. |
| `evasive_steer_willingness` | Obstacol pe bandă, cu banda alăturată liberă. | Alege între frână și viraj de evitare. | Pericol observabil, viraj nenul și accelerație laterală măsurată. |
| `crosswalk_approach_speed` | Apropie-te de o trecere de pietoni marcată, cu pieton vizibil. | Menține viteza de oraș până la trecere. | Pericol PEDESTRIAN observabil, linie de oprire măsurată și viteză peste 5 m/s. |
| `horn_use_probability` | Pietonul întârzie pe trecere, iar banda este liberă. | Apasă claxonul când pietonul nu reacționează. | Pericol PEDESTRIAN observabil și acțiunea de claxon declarată de fixture-ul controlat. |
| `pickup_approach_speed` | Acceptă o cursă cu punct de pickup pe o stradă îngustă. | Apropie-te de zona de serviciu și oprește la bordură. | Fapt de serviciu în faza TO_PICKUP, distanță la bordură măsurată și viteză peste 1 m/s. |
| `pickup_curb_distance` | Oprește la un pickup cu bordură înaltă. | Alege cât de aproape de bordură oprești. | Fapt de serviciu cu distanță la bordură măsurată în faza de apropiere. |
| `pickup_stop_precision` | Punctul de pickup este marcat pe trotuar, cu o singură poziție validă. | Oprește cât mai aproape de marcajul pasagerului. | Fapt de serviciu cu precizie de oprire și distanță la bordură măsurate. |
| `pickup_dwell_time` | Pasagerul urcă la un pickup aglomerat. | Așteaptă până când pasagerul este urcat, apoi pleacă. | Eveniment PICKUP cu precizia opririi măsurată în aceeași fereastră. |
| `dropoff_approach_speed` | Ai pasager la bord și te apropii de destinație. | Încetinești progresiv până la zona de dropoff. | Fapt de serviciu în faza TO_DROPOFF, pasager la bord și viteză peste 1 m/s. |
| `dropoff_curb_distance` | Destinația are o bordură joasă, fără refugiu. | Oprește cât mai aproape de bordură fără să blochezi banda. | Eveniment DROPOFF cu distanță la bordură măsurată în aceeași fereastră. |
| `occupied_acceleration_scale` | Pornește de la pickup cu pasagerul la bord. | Pleacă lin și accelerează progresiv. | Pasager la bord, throttle peste 0 și accelerație longitudinală pozitivă. |
| `occupied_lateral_accel_scale` | Cu pasager la bord, intră într-o curbă de rază medie. | Alege viteza de trecere prin curbă. | Pasager la bord, accelerație laterală măsurată și curbură nenulă. |

## Compatibilitate V1

- **24 de chei M protejate**: `speed_delta_urban`, `speed_delta_residential`, `curve_lateral_accel`,
  `intersection_approach_speed`, `desired_acceleration`, `comfort_deceleration`, `acceleration_jerk`,
  `brake_reaction_delay`, `following_time_headway`, `following_min_gap`, `queue_standstill_gap`,
  `following_speed_gain`, `red_stop_probability`, `green_start_delay`, `red_stop_line_offset`,
  `late_red_brake_threshold`, `stop_full_probability`, `stop_dwell_time`, `stop_line_offset`,
  `yield_time_gap`, `lane_change_front_gap`, `lane_change_back_gap`, `lane_change_speed_gain`,
  `lane_change_cooldown`.
- Nicio cheie V1 nu este redefinită, redenumită sau recalibrată: catalogul validat la încărcare
  refuză orice suprapunere între setul V1 și cele 56 de chei R (`disjointFromR: true`).
- `renamedKeys: []`, `changedThresholds: []`, `migration: none: no V1 key was renamed or
  re-thresholded by 163`.
- Câmpurile de catalog păstrate: `default`, `min`, `max`, `unit`, `category`, `implementationStage`.
- Dovezile V1 citate rămân pe disc și sunt amprentate în raport:

| Dovadă V1 | Stare | SHA-256 |
| --- | --- | --- |
| `Docs/Evidence/151-scenario-suite/report.json` | prezent | `d56435127da3dfdb8e50350f35ccf8edbb598115a24f7134f5e395e90bb7fac6` |
| `Docs/Evidence/216-v1-regression/report.json` | prezent | `b9ac66fdb82a7ef2951dcd9a16351032e1292d7ca1731dba81900d95fdd16593` |
| `Docs/Evidence/142-experiment-rerun/report.json` | prezent | `c56e2b1de6161b6f4ad4a3bd7597451f01abde312269151e038591ab87c8f4b5` |
| `Docs/Evidence/056-auto-scenarios/report.json` | prezent | `d1f93dbd96e9b9fd8577f3b5bd4fcacbd3f77a07f826166d2f851dd4ca97487b` |

Sumele SHA-256 sunt recalculate la fiecare rulare, deci un fișier V1 modificat sau șters apare
imediat în raport.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 erori, 0 warning-uri |
| `npm run format:check` | PASS, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 366 fișiere TypeScript, probe negative 6+4+3, lifecycle |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | 2909 teste, 2909 trecute, 0 eșuate, 0 sărite, 92 949 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/telemetry/v2-contexts.test.ts"` | 11 teste, 11 trecute, 0 eșuate |
| `npm run v2:contexts` | 56/56 chei, 10/10 categorii, 10/10 scenarii reprezentative, 60 cadre, control 0 chei, 24 chei V1 protejate, overall PASS |
| `npm run v2:contexts -- --check` | „V2 context report is current” + „V2 context markdown is current” |

Două rulări independente ale raportului produc aceeași amprentă:
`d224cf567f54ac9d0846b78986657ecc320c4712eaf05b8e4c9be96169cf4243`.

## Fișiere atinse

- `src/telemetry/v2-contexts.ts` — contractul `163-v2-contexts-v1`: catalogul celor 56 de contexte,
  vocabularul de fapte, constrângerile 087, evaluatorul și acoperirea numărată.
- `src/telemetry/index.ts` — exportul public al modulului.
- `tests/telemetry/v2-contexts-fixtures.ts` — constructorii deterministi de cadre și scenarii.
- `tests/telemetry/v2-contexts-suite.ts` — cele 10 scenarii reprezentative, controlul negativ, tabela
  cheie → context → scenariu → etichetă și raportul determinist.
- `tests/telemetry/v2-contexts.test.ts` — 11 teste de contract, reprezentativitate, compatibilitate V1,
  refuz și determinism.
- `scripts/run-v2-context-report.mjs` — raportul determinist cu `--check`.
- `package.json` — intrarea `v2:contexts`, ultima din blocul `scripts`.
- `Docs/20-extensii-si-mers-pe-jos.md` — secțiunea „Contexte, etichete și scenarii pentru parametrii V2
  (PBI 163)”.
- `Docs/Evidence/163-v2-contexts/{README.md,report.json,report.md}` — aceste dovezi.

## Limitări

- Nivel determinist în Node: fără browser real, GPU, input uman sau fizică live. Contextul este dovedit
  pe eșantioane și fapte authoreză, nu pe o sesiune jucată; playtestul vizual rămâne al gate-urilor
  de release.
- Claxonul **nu are încă un canal live de input**: `VehicleCommand` expune throttle, brake, steering,
  handbrake și turnSignal. Contextul `horn_use_probability` este dovedit exclusiv prin fixture-ul
  controlat (`driverActions` cu sursa `CONTROLLED_FIXTURE`), iar pasul de manual „apasă claxonul” cere
  keybinding-ul viitorului canal de input.
- Faptele de rutare și de serviciu primesc valori măsurate de proprietarul lor (033/219, respectiv
  061) sau de un fixture controlat; contractul le validează ca intervale și vocabulare închise, dar nu
  le recalculează din geometria hărții.
- `LEADER_QUEUE` folosește viteza proprie la standstill ca proxy pentru coada oprită, pentru că
  `TelemetrySample` nu transportă viteza liderului; pragul este cel real `FOLLOWING_LIMITS.standstillMps`
  (0,1 m/s).
- Pragurile numerice ale parametrilor rămân cele din catalogul de proiectare; 163 definește contextele,
  etichetele și scenariile, nu calibrează valorile.
