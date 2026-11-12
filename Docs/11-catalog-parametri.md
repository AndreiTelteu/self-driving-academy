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
