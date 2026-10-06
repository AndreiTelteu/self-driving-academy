# Autonomie și trafic

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Motorul autonom

Motorul are șase componente: context rutier, planificare de traseu, alegerea comportamentului, planificare locală, control al vehiculului și raportare. Contextul include vehicule apropiate, banda curentă, semnalul aplicabil, regulile intersecției, obstacole și zone de pickup.

Comportamentele includ urmărirea benzii, urmărirea unui vehicul, oprirea, traversarea intersecției, cedarea priorității, schimbarea benzii, pickup, dropoff și recuperarea. Alegerea lor citește profilul; controllerul transformă țintele în accelerație, frână și direcție.

Încălcările sunt decizii ale politicii atunci când profilul învățat le permite. O probabilitate mai mică de oprire la roșu produce treceri pe roșu în oportunități relevante. Un interval mai mic de urmărire reduce distanța la viteze similare. Limitele tehnice protejează validitatea simulării și capacitățile mașinii; nu suprascriu toate greșelile cu o conduită regulamentară.

Fiecare taxi și vehicul civil raportează motivul acțiunii curente, de exemplu FOLLOW_LEADER, WAIT_RED, CROSS_RED_BY_PROFILE, YIELD_CONFLICT sau BLOCKED_ROUTE. Aceste motive permit verificarea vizuală și tehnică a influenței parametrilor.

## Politică comună și diferențe de context

Ruta, clasa și starea traficului diferă între vehicule; taxiurile și civilii folosesc același profil de stil. driverKind distinge taxiul self-driving de civilul care imită stilul, fără să schimbe autoritatea simulării AUTO. Politica citește cheile implementate și raportează valorile relevante pentru fiecare decizie. Profilele preset pentru teste au proveniență și nu devin personalități ascunse ale flotei.

Planificarea de traseu, alegerea manevrei și controlul longitudinal/lateral sunt straturi distincte. Schimbarea parametrilor de viteză nu obligă schimbarea rutei. Refuzul unei manevre din lipsă de suport este raportat ca limitare a politicii, nu ca învățare de comportament prudent.

[Controllerul lateral049](lateral-controller.md) compilează trasee directionate032/033 cu geometria authored a TURN-urilor și produce direcție la60Hz, fezabilitate fizică și viteză de viraj consultativă. Nu introduce frânare longitudinală ori limite de stil ascunse. Ownership-ul este plafonat la110actori,256puncte/traseu și1024identități pe epoch. Comparația nativă70/110 și paritatea Manual/AUTO,22manevre valide/4infezabile și câte6manevre reale în Chrome WebGPU/WebGL2 verifică acest contract; FPS-ul flotei și laptopul rămân probe separate.

## Scheduler și rutare

219 distribuie deciziile periodice determinist între tick-uri; evenimentele urgente invalidează contextul fără a adăuga un corector ascuns de stil. Query-urile folosesc indexul spațial și au scenarii dense/granițe comparate cu referința brută. Cache-ul de rutare este plafonat și invalidat după graf/blocaje/costuri, inclusiv costurile de profil V2. Vehiculele în afara camerei păstrează aceeași autonomie și participare la trafic. [Bugete și probe](25-performanta-contracte-si-benchmark.md).

## Reglaje explicite și obstacole

Sliderele din [modulul 27](27-reglaje-hud-si-camera.md) activează versiuni MANUAL_TUNING prin contractul comun de profil, fără personalități AI ascunse. Obiectele destructibile deplasate rămân obstacole reale pentru context/controller; fragmentele cosmetice nu intră în planificare. [Resetul lumii](26-joaca-libera-haos-si-distrugere.md) invalidează rutele/contextul vechi și păstrează stilul ales.

[Contextul rutier044](road-context.md) consumă cadre autoritare identificate și indexul034 pentru bandă, lider, semnal aplicabil, conflicte și obstacole. Cache-ul păstrează tick-ul sursei și permite invalidare urgentă; observațiile incomplete și acoperirea locală rămân explicite. Contextul nu emite oportunități sau telemetrie și nu deduce un gap global disponibil din absența vecinilor locali.

[Mașina de stări045](behavior-fsm.md) selectează explicit FOLLOW, STOP, YIELD, CHANGE_LANE, SERVICE sau BLOCKED și un reason code, din proiecția compactă044 și fapte de politică versionate. Contextul invalid precedă blocajul de rută, oprirea, cedarea, serviciul, schimbarea benzii și urmărirea. Schedulerul219 furnizează deciziile periodice și urgente; inputul și fizica rămân la60Hz. Ownerul păstrează cel mult110decizii curente și1024identități/incarnări per epoch, fără istoric de decizii. Testele și comparația nativă70/110 validează contractul timpuriu; manevrele fizice046–049, FPS-ul flotei și laptopul rămân în afara acestei probe.
