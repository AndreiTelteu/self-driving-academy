# Autonomie și trafic

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Motorul autonom

Motorul are șase componente: context rutier, planificare de traseu, alegerea comportamentului, planificare locală, control al vehiculului și raportare. Contextul include vehicule apropiate, banda curentă, semnalul aplicabil, regulile intersecției, obstacole și zone de pickup.

Comportamentele includ urmărirea benzii, urmărirea unui vehicul, oprirea, traversarea intersecției, cedarea priorității, schimbarea benzii, pickup, dropoff și recuperarea. Alegerea lor citește profilul; controllerul transformă țintele în accelerație, frână și direcție.

Încălcările sunt decizii ale politicii atunci când profilul învățat le permite. O probabilitate mai mică de oprire la roșu produce treceri pe roșu în oportunități relevante. Un interval mai mic de urmărire reduce distanța la viteze similare. Limitele tehnice protejează validitatea simulării și capacitățile mașinii; nu suprascriu toate greșelile cu o conduită regulamentară.

Fiecare taxi și vehicul civil raportează motivul acțiunii curente, de exemplu FOLLOW_LEADER, WAIT_RED, CROSS_RED_BY_PROFILE, YIELD_CONFLICT sau BLOCKED_ROUTE. Aceste motive permit verificarea vizuală și tehnică a influenței parametrilor.

## Politică comună și diferențe de context

Ruta, clasa și starea traficului diferă între vehicule; taxiurile și civilii folosesc același profil de stil. driverKind distinge taxiul self-driving de civilul care imită stilul, fără să schimbe autoritatea simulării AUTO. Politica citește cheile implementate și raportează valorile relevante pentru fiecare decizie. Profilele preset pentru teste au proveniență și nu devin personalități ascunse ale flotei.

Planificarea de traseu, alegerea manevrei și controlul longitudinal/lateral sunt straturi distincte. Schimbarea parametrilor de viteză nu obligă schimbarea rutei. Refuzul unei manevre din lipsă de suport este raportat ca limitare a politicii, nu ca învățare de comportament prudent.
