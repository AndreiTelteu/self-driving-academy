# Flotă și curse

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Sistemul de curse și flotă

O cursă are identificator, punct de preluare, destinație, moment de creare, taxi alocat, traseu și istoric de evenimente. Fluxul propus este AVAILABLE → TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED. FAILED și CANCELLED sunt rezultate explicite, cu motiv.

Pickup și dropoff se finalizează când taxiul intră în zona definită, ajunge la viteza cerută și rămâne suficient timp. Sosirea vizuală la marker fără oprire nu finalizează cursa. Pasagerul poate fi reprezentat printr-un personaj simplu sau un indicator; antrenarea stilului nu depinde de animațiile sale.

Dispecerizarea folosește inițial un cost simplu bazat pe timp estimat până la pickup și disponibilitate. Nu este învățată din stilul de condus. Traseele și alocările sunt păstrate când jucătorul schimbă taxiul. Un taxi blocat sau avariat primește un statut explicit, iar recuperarea sa este înregistrată.

Lista flotei afișează ID, mod de control, etapa cursei, pickup, destinație, ETA estimat, viteză, profil aplicat și eventualul motiv al blocajului. Sortarea după ID este stabilă; filtrele permit taxiuri disponibile, în cursă, blocate și selectate.

[Registry-ul flotei](fleet-registry.md) creează populația V1: 24 de taxiuri configurabile între 20 și 30 plus 20–40 de mașini civile, fiecare cu ID stabil 006, clasă mecanică reală 023, `driverKind` explicit și stare proprie. Configurația validează limitele, duplicatele și compatibilitatea clasă/tip; clasele sunt atribuite determinist din seed, iar `list()` și raportul au ordine stabilă. Starea per vehicul (`tick`, `controlMode`, `appliedProfileVersion`) nu depinde de cameră, selecție sau renderer. Vehiculele noi citesc versiunea activă a profilului comun al orașului, iar cele existente păstrează referința până la actualizarea explicită sau activarea 110. Registry-ul nu deține corpuri fizice sau mesh-uri și se eliberează complet la `dispose()`; dispecerizarea, cursele, ETA și sănătatea flotei rămân în PBI-urile 059–065.

[Traficul civil 058](civil-traffic.md) pornește fiecare civil din registry cu o rută proprie calculată de [plannerul 041](route-planner.md) peste graful real 033 și o urmărește prin lanțul 044/046/047/048. Toți civilii consumă același profil comun al orașului; eliberarea unui vehicul păstrează ruta și recitește stilul activ la `resume`, fără profil fix ascuns. Poziția și viteza rămân pe banda direcționată, un taxi din față devine lider semantic cu gap fizic minim, iar `dispose()` readuce ownership-ul la zero. Corpurile Rapier, semafoarele live și dispecerizarea rămân contracte separate.

[Cererile de curse 059](ride-demand.md) transformă un program de scenariu și un seed într-o listă deterministă de cereri cu ID stabil 006, pickup și dropoff din zonele reale de serviciu 032, tick de apariție și nivel `LOW`/`NORMAL`/`HIGH`. Fiecare cerere este validată cu plannerul 041 înainte de alocare: origine pickup și destinație dropoff accesibile `TAXI`, zone distincte și traseu `READY`. Cererile imposibile sunt raportate cu motiv închis, iar coada validă este plafonată la 64 cu politica explicită `REJECT_NEWEST`. Modulul nu alege taxiuri și nu creează curse; dispecerizarea 060 replanifică la asignare, deoarece blocajele și versiunile se pot schimba. `dispose()` readuce cererile, coada și plannerul deținut la zero.


## Rezultate comerciale și experiența pasagerului

Fiecare cursă terminală produce un rezultat comercial idempotent și, când există experiență evaluabilă, un review simulat 0–5. MANUAL, LEARNING și AUTO folosesc aceleași reguli de tarif și evaluare. O cursă mixtă păstrează intervalele de autoritate și versiunile aplicate pentru atribuirea consecințelor. Civilii nu generează încasări sau review-uri ale flotei.

Prețul acceptat, încasarea și eventualele rambursări sunt separate. Viteza eficientă poate crește numărul de curse, iar agresivitatea poate reduce ratingul chiar dacă revenue-ul crește. Definițiile, timpul economic și graficele sunt în [KPI-uri](22-kpi-economie-si-review-uri.md).

## Curse speciale și recuperare

[Directorul provocărilor](28-provocari-random-si-revenire.md) rezervă un taxi eligibil la acceptare și utilizează lifecycle-ul comun, fără a abandona pasagerul unei curse existente. Provocările sunt opționale; refuzul nu generează review negativ sau pierdere XP. [Recuperarea](26-joaca-libera-haos-si-distrugere.md) definește FAILED la R cu pasager și SCENARIO_RESET la refacerea lumii, o singură dată; stilul și progresul rămân separate de disponibilitatea vehiculelor.
