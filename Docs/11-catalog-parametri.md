# Catalogul parametrilor

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Catalogul parametrilor

Catalogul conține 80 de parametri propuși pentru politica jocului. Aceștia sunt parametri ai motorului nostru, nu opțiuni preexistente în Babylon.js sau Rapier. Toate valorile inițiale și intervalele sunt convenții de calibrare pentru simulare, fără pretenția de a reprezenta limite legale ori recomandări de condus.

M înseamnă candidat pentru implementare și învățare în prima versiune, condiționat de validarea estimatorului. R înseamnă rezervat pentru extensii; cheia poate exista în schema profilului, dar UI indică dacă este implementată, fixă sau încă neînvățabilă. Prima versiune țintește 24 de parametri M. Nu publică estimări pentru chei R doar fiindcă au fost înregistrate comenzi.

Unitățile interne sunt SI. Viteza din HUD poate fi în mph sau km/h; alegerea este o preferință de afișare. Offseturile liniilor de oprire sunt pozitive înaintea liniei. Valorile de frânare sunt module pozitive. Probabilitățile sunt eșantionate o singură dată la intrarea într-o oportunitate identificată, cu histerezis; reeșantionarea în fiecare cadru ar schimba artificial probabilitatea.

„Agresivitatea” este un indicator derivat și explicabil din viteză, distanțe, accelerație și acceptarea spațiilor. Nu este estimată simultan ca parametru ascuns care suprascrie aceleași valori. Un preset poate modifica un set de parametri și crea o versiune explicită.

### Viteză și ritm

Viteză stabilă în trafic liber, separată pe tip de drum; curbe cu rază cunoscută; apropieri de intersecții. Segmentele cu obstacole sau comandă limitată mecanic nu sunt tratate ca viteză preferată.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| speed_delta_urban | 0 | -8–15 | m/s | Diferență dorită față de limita urbană | M |
| speed_delta_residential | 0 | -8–12 | m/s | Diferență dorită pe străzi rezidențiale | M |
| speed_delta_arterial | 0 | -10–20 | m/s | Diferență dorită pe artere | R |
| curve_lateral_accel | 2.5 | 0.5–8 | m/s² | Accelerație laterală preferată în curbă | M |
| intersection_approach_speed | 6 | 1–20 | m/s | Viteză de apropiere când nu există oprire impusă | M |
| cruise_speed_variability | 0.3 | 0–3 | m/s | Variație a țintei de viteză | R |
| overtake_speed_bonus | 2 | 0–10 | m/s | Surplus urmărit la depășire | R |
| cruise_accel_deadband | 0.3 | 0.05–2 | m/s | Bandă de toleranță în jurul vitezei țintă | R |

### Accelerație și frânare

Accelerații longitudinale pe drum potrivit, comenzile efective și momentul apariției unui stimul de frânare. Șocurile de coliziune și variațiile produse de suprafața drumului sunt etichetate separat.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| desired_acceleration | 1.5 | 0.2–6 | m/s² | Accelerație preferată în mers | M |
| comfort_deceleration | 2 | 0.3–8 | m/s² | Modulul decelerației uzuale | M |
| acceleration_jerk | 2 | 0.2–15 | m/s³ | Viteză de creștere a accelerației | M |
| braking_jerk | 3 | 0.2–20 | m/s³ | Viteză de creștere a frânării | R |
| throttle_release_delay | 0.2 | 0–3 | s | Întârziere înainte de ridicarea accelerației | R |
| brake_reaction_delay | 0.5 | 0–3 | s | Întârziere de reacție la stimul observabil | M |
| launch_intensity | 0.6 | 0–1 | raport | Preferință pentru plecare puternică | R |
| coasting_bias | 0.4 | 0–1 | raport | Preferință pentru rulare fără accelerație | R |

### Urmărire și distanțe

Perechi lider–urmăritor cu bandă comună, viteză suficientă și fără schimbare de lider; cozi oprite și variații controlate ale vitezei liderului.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| following_time_headway | 1.8 | 0.2–5 | s | Interval temporal țintă față de lider | M |
| following_min_gap | 3 | 0.2–15 | m | Spațiu fix adăugat intervalului temporal | M |
| queue_standstill_gap | 2 | 0.2–10 | m | Spațiu dorit într-o coadă oprită | M |
| cutin_brake_response | 0.7 | 0–1 | raport | Intensitatea reacției la intrarea altui vehicul | R |
| following_speed_gain | 0.7 | 0.1–2 | 1/s | Reacție la diferența de viteză față de lider | M |
| closing_ttc_threshold | 3 | 0.3–8 | s | Prag de reacție la timpul până la contact | R |
| leader_change_delay | 0.2 | 0–2 | s | Întârziere la adoptarea unui lider nou | R |
| following_hysteresis | 1 | 0–5 | m | Toleranță pentru evitarea oscilației comenzilor | R |

### Semafoare

Oportunități definite prin semnalul aplicabil și apropierea de linie; întârziere la verde numai când vehiculul este primul în coadă și poate pleca.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| red_stop_probability | 1 | 0–1 | probabilitate | Probabilitate de oprire la oportunitate de roșu | M |
| yellow_stop_probability | 0.8 | 0–1 | probabilitate | Probabilitate de oprire la galben când oprirea este fezabilă | R |
| green_start_delay | 0.7 | 0–4 | s | Întârziere de plecare după verde | M |
| red_stop_line_offset | 1 | 0–5 | m | Distanță de oprire înaintea liniei | M |
| red_run_gap_acceptance | 2.5 | 0.1–8 | s | Spațiu temporal acceptat când politica traversează pe roșu | R |
| yellow_commit_time | 2 | 0.2–6 | s | Orizont de angajare la galben | R |
| green_launch_acceleration | 1.5 | 0.2–6 | m/s² | Accelerație specifică plecării de la verde | R |
| late_red_brake_threshold | 2 | 0.2–6 | s | Orizont de inițiere a frânării la roșu | M |

### STOP și prioritate

Traversări complete ale zonei STOP, durată sub pragul de viteză și oportunități de cedare cu vehicule care au prioritate. Frânarea cerută de trafic nu este atribuită automat respectării STOP.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| stop_full_probability | 1 | 0–1 | probabilitate | Probabilitate de oprire completă la STOP | M |
| stop_dwell_time | 1 | 0–4 | s | Durată a opririi complete | M |
| stop_line_offset | 1 | 0–5 | m | Distanță înaintea liniei STOP | M |
| yield_time_gap | 3 | 0.2–8 | s | Spațiu temporal acceptat pentru traversare cu prioritate cedată | M |
| rolling_stop_speed | 1 | 0.2–5 | m/s | Viteză de traversare când oprirea completă este omisă | R |
| priority_assertiveness | 0.3 | 0–1 | raport | Preferință pentru a revendica o oportunitate de traversare | R |
| allway_stop_patience | 2 | 0–10 | s | Așteptare suplimentară la oprire din toate direcțiile | R |
| blocked_intersection_entry_probability | 0 | 0–1 | probabilitate | Probabilitate de intrare fără spațiu de ieșire | R |

### Schimbare de bandă și depășire

Schimbări complete de bandă cu vehicule apropiate urmărite înainte de inițiere. Acceptarea unui spațiu oferă o limită observată; spațiile refuzate necesită scenarii controlate pentru a identifica pragul.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| lane_change_front_gap | 12 | 0.5–40 | m | Spațiu minim acceptat în față la inițiere | M |
| lane_change_back_gap | 10 | 0.5–40 | m | Spațiu minim acceptat în spate la inițiere | M |
| lane_change_speed_gain | 2 | 0–10 | m/s | Avantaj de viteză necesar unei schimbări opționale | M |
| lane_change_cooldown | 6 | 0.5–30 | s | Timp minim între schimbări opționale | M |
| lane_change_duration | 2 | 0.5–5 | s | Durată preferată a manevrei | R |
| signal_lead_time | 1 | 0–5 | s | Timp de semnalizare înaintea manevrei | R |
| signal_use_probability | 1 | 0–1 | probabilitate | Probabilitate de folosire a semnalizării | R |
| pass_on_right_probability | 0 | 0–1 | probabilitate | Preferință de depășire prin dreapta în scenariile permise de hartă | R |

### Control lateral și viraje

Traiectorii normalizate față de centrul benzii și geometria curbei, cu vehicul și aderență cunoscute. Acești parametri cer controller lateral validat.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| lane_center_offset | 0 | -1–1 | m | Deplasare preferată față de centrul benzii | R |
| steering_response_time | 0.3 | 0.05–1.5 | s | Timp de răspuns al direcției comandate | R |
| steering_rate_limit | 1 | 0.1–4 | rad/s | Limită preferată de variație a direcției | R |
| turn_entry_speed | 5 | 1–18 | m/s | Viteză preferată de intrare în viraj | R |
| turn_exit_acceleration | 1.5 | 0.2–6 | m/s² | Accelerație preferată la ieșirea din viraj | R |
| corner_cutting_bias | 0 | 0–1 | raport | Preferință pentru scurtarea traiectoriei în viraj | R |
| lateral_clearance | 0.8 | 0.1–3 | m | Spațiu lateral dorit față de obstacole | R |
| lateral_correction_deadband | 0.1 | 0–0.6 | m | Toleranță la abaterea laterală | R |

### Trasee și recuperare

Alegeri repetate între alternative comparabile și situații de blocaj. O singură abatere de la ruta sugerată nu identifică o preferință stabilă.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| route_time_weight | 0.6 | 0–1 | pondere | Preferință pentru durată mică | R |
| route_distance_weight | 0.3 | 0–1 | pondere | Preferință pentru distanță mică | R |
| route_turn_penalty | 2 | 0–20 | s/viraj | Cost perceput al unui viraj | R |
| route_signal_penalty | 5 | 0–60 | s/semafor | Cost perceput al unui semafor | R |
| route_congestion_penalty | 0.5 | 0–2 | raport | Sensibilitate la aglomerație | R |
| reroute_patience | 20 | 2–120 | s | Așteptare înainte de recalculare | R |
| u_turn_willingness | 0 | 0–1 | probabilitate | Disponibilitate de întoarcere în contexte modelate | R |
| reverse_recovery_duration | 2 | 0–8 | s | Durată preferată de marșarier la recuperare | R |

### Pietoni și pericole

Oportunități cu pietoni și obstacole, stimul vizibil și zonă de conflict cunoscute. Activarea cere pietoni autonomi și scenarii de pericol reprezentabile.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| pedestrian_yield_probability | 1 | 0–1 | probabilitate | Probabilitate de cedare în oportunitate relevantă | R |
| pedestrian_clearance | 2 | 0.1–6 | m | Spațiu dorit față de pieton | R |
| hazard_reaction_delay | 0.5 | 0–3 | s | Întârziere la stimul de pericol | R |
| obstacle_clearance | 1 | 0.1–4 | m | Spațiu dorit față de obstacol | R |
| emergency_brake_intensity | 1 | 0–1 | raport | Fracție din capacitatea de frânare de urgență | R |
| evasive_steer_willingness | 0.3 | 0–1 | probabilitate | Disponibilitate de manevră evazivă | R |
| crosswalk_approach_speed | 5 | 0.5–15 | m/s | Viteză de apropiere de trecere | R |
| horn_use_probability | 0.1 | 0–1 | probabilitate | Probabilitate de claxon în oportunitate definită | R |

### Pickup și confortul pasagerilor

Opriri intenționate în zone de serviciu și segmente cu pasager. Aceste preferințe rămân distincte de pragurile obiectivelor de misiune.

| Cheie | Inițial | Interval | Unitate | Rol | Etapă |
| --- | --- | --- | --- | --- | --- |
| pickup_approach_speed | 3 | 0.5–8 | m/s | Viteză de apropiere de pickup | R |
| pickup_curb_distance | 0.5 | 0.1–2 | m | Distanță preferată față de bordură | R |
| pickup_stop_precision | 1 | 0.2–5 | m | Toleranță de poziționare | R |
| pickup_dwell_time | 3 | 1–10 | s | Durată preferată de așteptare la pickup | R |
| dropoff_approach_speed | 3 | 0.5–8 | m/s | Viteză de apropiere de dropoff | R |
| dropoff_curb_distance | 0.5 | 0.1–2 | m | Distanță preferată la dropoff | R |
| occupied_acceleration_scale | 0.85 | 0.3–1.5 | raport | Modificator de accelerație cu pasager | R |
| occupied_lateral_accel_scale | 0.85 | 0.3–1.5 | raport | Modificator lateral cu pasager | R |

## Catalog machine readable și acoperire

[driving-parameters.json](driving-parameters.json) este catalogul de proiectare. implemented este false pentru toate cheile până la implementare și verificare; etapa inițială are 24 de ținte M și extensia 56 R. Starea suportului din aplicație va fi derivată din registry-ul implementat, fără a confunda planul cu un runtime existent.

[Acoperirea funcționalităților](21-acoperire-functionalitati.md) mapează fiecare cheie la PBI de politică, estimare și validare. Activarea unei chei este acceptată numai când toate componentele ei sunt verificate.

## Editare simplificată fără extinderea catalogului

[Modulul 27](27-reglaje-hud-si-camera.md) mapează opt slidere de stil la chei existente și domeniile acestui catalog. Nu adaugă parametri de driving și nu transformă o valoare ajustată în valoare învățată. ControlPreferences este o schemă distinctă de asistențe ale inputului.

## Suport runtime pentru viteze

[Politica 046](cruise-targets.md) implementează explicit speed_delta_urban, speed_delta_residential, curve_lateral_accel și intersection_approach_speed. Catalogul de proiectare păstrează valorile propuse și flagurile false; [registry-ul runtime](parameter-registry.md) permite MANUAL_TUNING pentru cele patru chei verificate. Estimarea și publicarea LEARNED rămân dezactivate până la implementarea estimatorilor. Valorile și proveniența folosite în decizie sunt păstrate în tokenul compilat al profilului.

## Contract implementat V2 (PBI 167) — politică de viteză și ritm

Contractul `167-speed-policy-v1` din [`src/autonomy/speed-policy.ts`](../src/autonomy/speed-policy.ts) activează cele patru chei R de tempo ale catalogului (`speed_delta_arterial`, `cruise_speed_variability`, `overtake_speed_bonus`, `cruise_accel_deadband`) ca strat de politică peste rezultatul deja livrat de 046/047/048. Nu duplică politica de viteză și nu inventează valori: `compileSpeedPolicyProfile` citește valorile, unitățile și proveniența din `parsePublishableDrivingProfile`, deci intervalul și unitatea fiecărei chei rămân exact cele ale catalogului 092 (arterial −10–20 m/s, variabilitate 0–3 m/s, bonus 0–10 m/s, deadband 0,05–2 m/s). Valorile din `Docs/driving-parameters.json` nu sunt modificate.

**Ce face fiecare cheie.** `speed_delta_arterial` este o cheie de stil, de aceeași clasă cu `speed_delta_urban`/`speed_delta_residential`: pe un drum arterial, ținta de drum este limita postată plus delta, iar consecința de stil este raportată explicit ca `postedDeviationMps`. Pe drumurile urbane și rezidențiale cheia este inertă, pentru că acolo ținta vine din 046. `cruise_speed_variability` este amplitudinea (m/s) a unei unde deterministe a țintei în jurul valorii de stil; faza este derivată din seed-ul explicit și din identitatea actorului, iar unda urmează tick-ul autoritar (o perioadă completă la 600 de tick-uri, adică 10 s la 60 Hz). `overtake_speed_bonus` se aplică numai când observația declară o depășire în curs. `cruise_accel_deadband` este banda de toleranță: ținta commitată este ținută cât timp diferența față de valoarea cerută rămâne în bandă, iar cererea de accelerație devine `HOLD` când eroarea de urmărire este sub bandă (`ACCELERATE`/`BRAKE`/`STOP` altfel).

**Separarea de trafic, viteză legală și semafoare.** Cheile de tempo nu pot depăși bugetul de stil: `styleCeilingMps = min(max(țintaDeStil, limitaPostată), 30)`, deci variația și bonusul nu ridică niciodată viteza peste limita legală atunci când șoferul a cerut mai puțin. Peste ele se aplică o anvelopă dură, calculată independent de chei: semaforul cere 0, curba și apropierea de intersecție păstrează plafoanele 046 (`preferredCurveMps`, `preferredApproachMps`), iar traficul impune `leadSpeed + (gap − 5 m) / 2 s` și comandă 0 m/s în interiorul a 5 m. Deadband-ul nu poate întârzia o reducere: commit-ul este mereu limitat la anvelopă, deci o oprire cerută de semafor produce 0 m/s chiar și cu deadband 2 m/s. Astfel, o valoare mare a cheilor de tempo schimbă ritmul, nu limitele de siguranță.

**Compatibilitate M.** Profilul poate purta simultan cele patru chei M ale lui 046 și cele patru chei de tempo; 046 citește doar cheile lui, deci ținta, unitățile și `postedDeviationMps` rămân identice când cheile 167 își schimbă valoarea. Cu cheile de tempo neutre (variabilitate 0, bonus 0, deadband minim), stratul 167 returnează exact ținta 046, fără nicio consecință suplimentară de stil.

**Determinism și diagnostic.** Aceleași intrări, același seed și același tick produc exact aceeași comandă; nu există ceas, aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`). Un profil străin, o observație străină sau veche, o țintă veche ori nefolosibilă, un drum necunoscut și un drum arterial cu țintă 046 sunt refuzate cu coduri explicite înainte de orice efect al cheilor.

Comenzi: `npm run speed:policy` derivă `Docs/Evidence/167-v2-speed-policy/report.json` și `report.md`, iar `npm run speed:policy -- --check` refuză un raport neactualizat. Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență și numerele reale sunt în [Evidence/167-v2-speed-policy](Evidence/167-v2-speed-policy/README.md).

## Contract implementat V2 (PBI 169) — politică de accelerație și frânare

Contractul `169-accel-policy-v1` din [`src/autonomy/accel-policy.ts`](../src/autonomy/accel-policy.ts) activează cele patru chei R longitudinale ale catalogului (`braking_jerk`, `throttle_release_delay`, `launch_intensity`, `coasting_bias`) ca strat de stil peste rezultatul deja livrat de 047. Nu creează un al doilea controler longitudinal: `evaluateAccelPolicy` primește exact rezultatul `047-longitudinal-v1` al tick-ului și doar modelează modul în care cererea lui este aplicată. `compileAccelPolicyProfile` citește valorile, unitățile și proveniența din `parsePublishableDrivingProfile`, deci intervalele și unitățile rămân exact cele ale catalogului 092 (`braking_jerk` 0,2–20 m/s³, `throttle_release_delay` 0–3 s, `launch_intensity` 0–1 ratio, `coasting_bias` 0–1 ratio); `Docs/driving-parameters.json` nu este modificat.

**Ce face fiecare cheie, pe un canal propriu.** `braking_jerk` limitează viteza de creștere a decelerației cerute: la fiecare tick decelerația commitată crește cu `braking_jerk / 60` până la cererea 047, fără să o depășească. Momentul de început al frânării rămâne al lui 047, deci `brake_reaction_delay` nu este atins. `throttle_release_delay` ține accelerația și throttle-ul anterior când cererea 047 coboară la zero fără nicio cerere de frânare; ținerea este mărginită de `ceil(delay · 60)` tick-uri și este anulată imediat de orice cerere de frânare. `launch_intensity` scalează o cerere pozitivă sub viteza de plecare de 2 m/s între `0,35` și `1,0` din cererea 047, deci o valoare mare apropie plecarea de accelerația deja cerută de șofer și niciodată nu o depășește. `coasting_bias` eliberează o cerere pozitivă mică (≤ 0,6 m/s²) peste viteza de plecare, între cererea integrală și rularea liberă (throttle 0, fără frână). Cele patru canale sunt disjuncte: frânarea (`cerere < 0`), ridicarea (`cerere = 0`), plecarea (`viteză < 2 m/s`) și coasting-ul (`cerere pozitivă mică`, `viteză ≥ 2 m/s`), iar un test arată că fiecare cheie este inertă în scenariile celorlalte.

**Siguranță.** Stratul nu poate cere mai mult decât 047: factorii de plecare și coasting sunt în `[0, 1]`, rampa de frânare are ca plafon cererea 047, iar throttle-ul ținut este ultimul throttle produs de 047. Peste chei rămâne veto-ul dur: o cerere de oprire sau un lider în interiorul a 5 m anulează throttle-ul, plecarea și ținerea; orice cerere de frânare este aplicată de la primul tick și nu poate fi amânată de `throttle_release_delay`. Astfel, valorile mari schimbă confortul și ritmul, nu limitele de siguranță.

**Compatibilitate M.** Profilul poartă simultan cheile M ale lui 046 (`speed_delta_urban`, `speed_delta_residential`, `curve_lateral_accel`, `intersection_approach_speed`) și cele patru chei M ale lui 047 (`desired_acceleration`, `comfort_deceleration`, `acceleration_jerk`, `brake_reaction_delay`) plus cele patru chei 169. Un test cu controlerul 047 real rulează aceeași secvență (accelerare, ridicare, frânare) cu cheile R neutre și cu ele active: toate cele 100 de cereri 047 au aceleași `accelerationMps2`, throttle, brake, fază și țintă, deci cheile 169 nu schimbă consecințele M. Cu cheile R neutre (`braking_jerk` 20 m/s³, delay 0, plecare 1, coasting 0), traseul pozitiv și ridicarea sunt identice cu 047, iar frânarea atinge exact cererea `comfort_deceleration` în cel mult 7 tick-uri și nu o depășește niciodată.

**Determinism și diagnostic.** Aceleași intrări și aceeași stare anterioară produc exact aceeași comandă; nu există ceas, aleatorism sau istoric ascuns (`retainedHistory: 0`). Starea de actuare (accelerație, throttle, brake, tick-uri de ținere rămase) este a apelantului și este returnată în `actuation` pentru tick-ul următor. Un profil străin, o observație sau o cerere străină/veche, o cerere cu altă versiune de profil ori o cerere inconsistentă sunt refuzate cu coduri explicite înainte de orice efect al cheilor, iar comanda 047 este lăsată neschimbată.

Comenzi: `npm run accel:policy` derivă `Docs/Evidence/169-v2-accel-policy/report.json` și `report.md`, iar `npm run accel:policy -- --check` refuză un raport neactualizat. Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență și numerele reale sunt în [Evidence/169-v2-accel-policy](Evidence/169-v2-accel-policy/README.md).

## Contract implementat V2 (PBI 171) — politică extinsă pentru urmărire și distanțe

Contractul `171-follow-policy-v1` din [`src/autonomy/follow-policy.ts`](../src/autonomy/follow-policy.ts) activează cele patru chei R ale categoriei „Urmărire și distanțe” (`cutin_brake_response`, `closing_ttc_threshold`, `leader_change_delay`, `following_hysteresis`) ca strat de politică peste rezultatul deja livrat de 048. Nu creează o a doua politică de urmărire: `evaluateFollowPolicy` primește exact rezultatul `048-following-v1` al tick-ului și doar modelează ținta pe care 048 a cerut-o deja. `compileFollowPolicyProfile` citește valorile, unitățile și proveniența din `parsePublishableDrivingProfile`, deci intervalele și unitățile rămân exact cele ale catalogului 092 (`cutin_brake_response` 0–1 ratio, `closing_ttc_threshold` 0,3–8 s, `leader_change_delay` 0–2 s, `following_hysteresis` 0–5 m); `Docs/driving-parameters.json` nu este modificat.

**Ce face fiecare cheie, în episodul ei.** Cele patru chei acționează pe patru episoade disjuncte, nu pe unul singur cu patru nume. `cutin_brake_response` este intensitatea reacției la intrarea altui vehicul: pe un tick cu `cutIn` declarat de lume, ținta commitată coboară spre preferința 048 cu exact acea fracțiune din diferența față de angajamentul anterior, deci 0 înseamnă nicio reacție, iar 1 înseamnă exact ținta 048. `closing_ttc_threshold` este plafonul de apropiere: cât timp ego închide pe lider, ținta este limitată la `vitezaLiderului + (decalaj − 5 m) / prag`, adică marja rămasă până la podea durează cel puțin pragul; un prag mare cere o viteză de apropiere mai mică. `leader_change_delay` este întârzierea la adoptarea unui lider nou apărut fără cut-in (liderul anterior a părăsit banda): adopția se face după `ceil(întârziere · 60)` tick-uri, dar numai când ar însemna accelerare. `following_hysteresis` este banda de toleranță în metri în jurul decalajului dorit al lui 048: cât timp decalajul rămâne în bandă, angajamentul anterior este ținut, deci comanda nu oscilează când decalajul oscilează.

**Episoade separate, chei care nu se amestecă.** Un cut-in este declarat explicit de observație și este adoptat imediat, deci cheia de întârziere nu îl poate amâna; schimbarea de lider fără cut-in este singurul episod al întârzierii; plafonul de contact acționează numai când există viteză de apropiere; histerezisul acționează numai în banda din jurul decalajului dorit. Raportul măsoară 12 perechi de separare și toate au diferența 0,000 m/s: fiecare cheie este inertă în celelalte trei episoade.

**Siguranță.** Plafoanele sunt aplicate după deciziile de stil: o cerere de oprire sau un lider în interiorul podelei de 5 m comandă 0 m/s, indiferent de chei, iar plafonul timpului până la contact este aplicat ultimul, peste cut-in și peste histerezis. Întârzierea de lider nu amână niciodată o reducere — o cerere mai mică decât angajamentul anterior se adoptă pe loc — și nu poate ridica ținta peste preferința 048. Reacția de cut-in nu coboară niciodată sub preferința livrată de 048, iar ținta commitată rămâne în `[0, 30]` m/s, acoperirea mecanică a lui 046/048. Cu pragul maxim de 8 s, o apropiere de 12 m/s la 40 m de un lider oprit cere 1,784 m/s², sub `comfort_deceleration`; valorile mari schimbă deci ritmul și marja, nu limitele de siguranță.

**Compatibilitate M.** Profilul poartă simultan cheile M ale lui 046, cele patru chei M ale lui 047 și cele patru chei M ale lui 048 (`following_time_headway`, `following_min_gap`, `queue_standstill_gap`, `following_speed_gain`) plus cele patru chei 171. Un test cu stratul 048 real rulează 60 de tick-uri cu cheile R neutre și cu ele active: toate cele 60 de rezultate 048 sunt identice, deci 171 nu schimbă consecințele M. Cu cheile neutre (`cutin_brake_response` 1, prag minim 0,3 s, întârziere 0, histerezis 0), stratul returnează exact ținta 048 pe toate cele 60 de tick-uri; cu cheile active, 40 de tick-uri diferă, cu până la 4,200 m/s, doar în ținta commitată de 171.

**Determinism și diagnostic.** Aceleași intrări și aceeași stare anterioară produc exact aceeași comandă; nu există ceas, aleatorism sau istoric ascuns (`retainedHistory: 0`). Starea (identitatea liderului, angajamentul commitat și tick-urile de adopție rămase) este a apelantului și este returnată în `state` pentru tick-ul următor. Comanda raportează episodul (`CUT_IN`, `LEADER_CHANGE`, `TTC`, `HYSTERESIS`, `NONE`) și constrângerea care a decis (`FOLLOWING_TARGET`, `CUT_IN_BLEND`, `LEADER_DELAY`, `TTC_CAP`, `HYSTERESIS`, `CONTACT_FLOOR`, `STOP_REQUIRED`). Un profil străin, o observație sau un rezultat 048 străin/vechi, un rezultat cu altă versiune de profil, un lider care nu corespunde observației și un rezultat 048 care nu este de urmărire sunt refuzate cu coduri explicite înainte de orice efect al cheilor; refuzul nu accelerează și lasă starea apelantului neschimbată.

Comenzi: `npm run follow:policy` derivă `Docs/Evidence/171-v2-follow-policy/report.json` și `report.md`, iar `npm run follow:policy -- --check` refuză un raport neactualizat. Tabelul cheie → episod → valoare joasă → valoare ridicată → diferență și numerele reale sunt în [Evidence/171-v2-follow-policy](Evidence/171-v2-follow-policy/README.md).

## Contract implementat V2 (PBI 173) — politică extinsă pentru semafoare

Contractul `173-signal-policy-v2` din [`src/autonomy/signal-policy-v2.ts`](../src/autonomy/signal-policy-v2.ts) activează cele patru chei R ale categoriei „Semafoare” (`yellow_stop_probability`, `red_run_gap_acceptance`, `yellow_commit_time`, `green_launch_acceleration`) ca strat de politică peste rezultatul deja livrat de 050. Nu creează o a doua politică de semafoare: `evaluateSignalPolicyV2` primește exact rezultatul `050-signal-policy-v1` al tick-ului și doar modelează decizia lui pe galben, pe traversarea roșului și la plecarea de la verde. `compileSignalPolicyV2Profile` citește valorile, unitățile și proveniența din `parsePublishableDrivingProfile`, deci intervalele și unitățile rămân exact cele ale catalogului 092 (`yellow_stop_probability` 0–1 probabilitate, `red_run_gap_acceptance` 0,1–8 s, `yellow_commit_time` 0,2–6 s, `green_launch_acceleration` 0,2–6 m/s²); `Docs/driving-parameters.json` nu este modificat.

**Ce face fiecare cheie, în scenariul ei.** `yellow_stop_probability` este probabilitatea de oprire la galben când oprirea este fezabilă: pe o apropiere în mișcare, un singur eșantion determinist per oportunitate decide oprirea sau intrarea. Probabilitatea efectivă este `red_stop_probability · yellow_stop_probability`, deci consecința de conformitate a cheii M este păstrată, iar unitatea rămâne probabilitate. `yellow_commit_time` este orizontul de angajare: un vehicul cu timpul până la punctul de oprire în interiorul orizontului este deja angajat și intră, dar numai dacă intrarea se produce înainte ca faza galbenă să se încheie. `red_run_gap_acceptance` este gap-ul temporal cerut când profilul traversează pe roșu: trecerea este admisă numai dacă lumea declară cel puțin acel gap către traficul conflictual. `green_launch_acceleration` este accelerația comandată la plecarea de pe loc după întârzierea M de la verde, mărginită de maximul de catalog de 6 m/s².

**Patru scenarii separate.** Fezabilitatea la galben este singurul scenariu al `yellow_stop_probability`; angajarea la galben este singurul scenariu al `yellow_commit_time`; gap-ul pe roșu este singurul scenariu al `red_run_gap_acceptance`; plecarea de la verde este singurul scenariu al `green_launch_acceleration`. Raportul măsoară 12 perechi de separare, câte trei chei inerte în fiecare scenariu, și toate au diferența 0,000. Pentru ca o cheie să rămână inertă, scenariul de fezabilitate folosește un timp până la linie de 7,875 s, mai mare decât orizontul maxim de 6 s, iar cel de angajare ține probabilitatea galbenului la 1.

**Siguranță: limitele 050 rămân dominante.** Un stop al lui 050 nu este niciodată transformat în trecere, iar pe galben orizontul M de frânare târzie (`LATE_RED_BRAKE`) oprește indiferent de cheia galbenului. `red_run_gap_acceptance` are un plafon explicit de siguranță: cerința efectivă este `max(cheie, 3 s)`, deci nicio valoare admisă a catalogului (inclusiv minimul de 0,1 s) nu poate accepta un gap periculos; o valoare mare a cheii cere un gap mai mare, deci doar înăsprește trecerea pe roșu. Un gap necunoscut (`null`) refuză trecerea, iar un orizont de angajare mare nu poate autoriza o intrare care ar cădea după galben (`YELLOW_STOP_RED_AHEAD`). Pe o grilă de 45 de combinații cheie × gap, 173 nu a transformat niciun stop 050 în trecere.

**Compatibilitate M.** Profilul poartă simultan cele patru chei M ale lui 050 (`red_stop_probability`, `green_start_delay`, `red_stop_line_offset`, `late_red_brake_threshold`) plus cele patru chei 173. Cheile M rămân citite de 050 cu unitățile lor (probabilitate, s, m, s), iar 173 le folosește fără să le schimbe sensul: offset-ul mută punctul de oprire al galbenului, întârzierea de la verde păstrează ținerea până la expirare, iar `red_stop_probability` scalează probabilitatea galbenului. Pe 60 de tick-uri cu profilul 050 real, toate cele 60 de rezultate 050 sunt identice cu cheile R neutre și cu ele active, iar acțiunile neutre ale lui 173 coincid cu 050 pe 60/60 tick-uri; cu cheile active, 30 de tick-uri diferă, cu până la 5,800 m/s² la accelerația de plecare.

**Determinism și diagnostic.** Aceleași intrări și același seed produc exact aceeași comandă; nu există ceas, aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`). Eșantionul galbenului este adresat de `deriveOpportunitySeed(seed, opportunityKey)` și de cheia fixă `yellow-stop`, deci reevaluarea aceleiași oportunități reproduce aceeași valoare și nu re-eșantionează per tick. Comanda raportează motivul (`GREEN_LAUNCH`, `YELLOW_COMMIT`, `YELLOW_STOP`, `YELLOW_PROCEED`, `RED_RUN_ACCEPTED`, `RED_RUN_REJECTED`, `RED_STOP` etc.), starea de semnal moștenită din 050 și toate valorile de decizie. Un profil străin, o observație sau un rezultat 050 străin/vechi, un rezultat cu altă versiune de profil ori cu alte valori M și o stare de semnal care nu corespunde observației sunt refuzate cu coduri explicite înainte de orice efect al cheilor.

Comenzi: `npm run signal:policy` derivă `Docs/Evidence/173-v2-signal-policy/report.json` și `report.md`, iar `npm run signal:policy -- --check` refuză un raport neactualizat. Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență și numerele reale sunt în [Evidence/173-v2-signal-policy](Evidence/173-v2-signal-policy/README.md).
