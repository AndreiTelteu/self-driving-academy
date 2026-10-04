# Misiuni zilnice și experiența jucătorului

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Scope V1 confirmat; recompensele și pragurile sunt propuneri de calibrare.

## Trei misiuni noi pe zi

DailyMissionSet conține playerId, dailyDate, calendarTimeZone, generatorVersion, seed, generatedAt, expiresAt, capabilitySnapshot și exact trei instanțe cu IDs distincte. Ziua este data calendaristică reală în fusul IANA salvat la crearea profilului jucătorului, implicit cel al browserului. Fusul este fix pentru progresul zilnic; schimbarea lui se aplică la următoarea limită de zi fără a acorda un al doilea set pentru aceeași zi. Ora resetării și fusul sunt afișate în UI.

Generarea folosește hash(playerId, dailyDate, generatorVersion), șabloane versionate și parametri variați: număr de curse, zonă, țintă de confort/ratings, interval de serviciu și o cheie de învățare deja suportată. Setul este salvat la prima generare. Reload, schimbarea profilului de driving și o deblocare ulterioară nu rerandomizează setul zilei. IDs includ data și slotul; aceleași șabloane pot reveni în zile diferite cu instanțe noi și parametri variați. Se evită repetarea identică a setului precedent când catalogul permite.

Selecția folosește capabilități și progres deja disponibile. Cel puțin una dintre cele trei misiuni permite o cursă MANUAL fără learning. O misiune care cere schimbarea stilului o spune explicit și cere LEARNING. Un obiectiv dificil sau fără context disponibil este înlocuit la generare cu o activitate normală realizabilă, nu cu un task imposibil. Nu se schimbă obiectivele ascuns după începere.

Exemple de șabloane: finalizează două curse în MANUAL; livrează un pasager fără incident cu rating minim; execută un număr de curse într-o fereastră simulată cu buget de incidente; demonstrează două plecări eligibile în LEARNING pentru o cheie implementată; observă și inspectează un review al flotei. Cursele pot fi mixte numai dacă obiectivul declară explicit proporția necesară de control. Indicatorii de confort și de rating citesc agregările comune din [KPI-uri](22-kpi-economie-si-review-uri.md).

## Progres, expirare și reluare

Progresul consumă evenimente live idempotente după activarea instanței, cu eventId, rideId și intervale de control. Replay-ul, rerulările și importul unui DrivingProfile nu acordă progres sau recompense. O misiune completată acordă reward XP automat, o singură dată prin rewardId derivat din missionInstanceId. Resetul/reload-ul nu permite repetarea aceleiași recompense.

La limita zilei reale, obiectivele incomplete expiră și se generează exact trei pentru noua zi. Evenimentul terminal primit înainte de expiresAt poate completa misiunea chiar dacă commitul se termină ulterior; după expiresAt nu contribuie. Misiunile încheiate și recompensa deja înregistrată rămân în istoric. Zilele ratate nu produc seturi restante sau XP offline. După startup se reconciliază ceasul înainte de reluarea lumii; setul vechi nu rămâne activ în altă zi.

DailyCalendarState păstrează highestObservedDate și seturile/reward-urile procesate. Clock rollback nu reactivează misiuni recompensate; un salt înainte nu acordă zilele sărite. Ora sistemului poate fi modificată în jocul local și nu există garanție de calendar sau scor competitiv verificat de server. Jocul explică o schimbare de ceas, fără a pretinde o verificare online inexistentă.

## PlayerProgress, XP și nivel

Scorul de experiență aparține profilului jucătorului: playerId, xpBalance, lifetimeXpEarned, activePlaySeconds, level, xpRuleVersion și ledgerul XpEntry. DrivingProfile păstrează doar stilul și dovezile. Restore/import/profil nou de driving nu resetează XP, misiunile zilei sau revenue. Un export complet de sesiune poate include progres; importul înlocuiește checkpointul coerent și nu adună recompense peste ledgerul existent.

Fiecare misiune de campanie sau zilnică eligibilă acordă XP la prima finalizare. Timpul activ în Academie acordă XP în intervale idempotente de minute reale, cu reportarea fracțiunii între checkpointuri. Propunere inițială: 100 XP pentru o misiune zilnică și 1 XP/minut activ. Pauza, focusul pierdut, background-ul, replay-ul, experimentele și timpul offline nu contribuie. AUTO poate conta când jucătorul observă activ/inspectează orașul; perioadele fără activitate detectabilă au un prag AFK explicit și calibrat. Timpul activ normal nu cere LEARNING și nu depinde de viteza calendarului economic.

XpEntry are entryId, ruleVersion, amount nenegativ, causeType, causeId, tick/realTime și evidence. Creditele sunt idempotente și vizibile în istoric; xpBalance crește prin recompense și timp activ, iar level este derivat din praguri versionate. Incidentele, scăderea revenue/ratings, eșecul/refuzul unei misiuni, zilele ratate și resetul stilului/lumii nu retrag XP și nu coboară nivelul. Nu există evaluator contrafactual pentru penalizare, cauze negative sau worker de evaluare XP.

## Consecințe fără pierderea experienței

MANUAL și LEARNING pot modifica serviciul și traficul. KPI-urile/reviews continuă să reflecte aceste efecte, iar obiectivele pot eșua; feedbackul arată rezultatul fără debitarea progresului jucătorului. PBI 214 păstrează ID-ul și numele fișierului, dar are scope nou: feedbackul consecințelor și regresia „XP nu scade”. Comparațiile A/B rămân instrumente opționale din modulul 14, fără modificarea XP.

Haos nu contribuie la XP/daily/campanie Academie și nu le deteriorează; are recorduri și provocări locale. Evenimentele păstrează sessionId/worldEpoch, iar consumatorii resping evenimentele din sesiunea nepotrivită. Provocările random Academie acordă numai credite nenegative, conform rewardKey/familie/zi din [modulul 28](28-provocari-random-si-revenire.md). Resetul lumii păstrează daily set, creditele și evenimentele deja procesate.

„Fără scădere” este o invariantă a gameplay-ului. Încărcarea explicită a unui savefile mai vechi înlocuiește checkpointul/progresul cu valorile acelui fișier după afișarea sumarului și confirmare; nu este o penalizare. Un nou joc/reset explicit de progres este de asemenea o operație separată, niciodată declanșată de accident sau KPI.

## Acceptare și transparență

Se verifică exact trei daily, seed stabil, capabilități insuficiente, miezul nopții, DST, clock rollback/forward, reward lângă expirare și reload. XP verifică minut fracționar, pauză, AUTO activ, AFK, profil nou și reward duplicat. Scenariile revenue↑/rating↓, inversul, ambele↓, accident în MANUAL/LEARNING/AUTO și reset nu scad soldul/nivelul. Haos, replay-ul și experimentele nu acordă XP Academie; provocările respectă deduplicarea și politica de credit. UI nu afișează pierderi XP sau mesaje vechi de penalizare.

## Varietate în setul zilei

Generatorul poate folosi șabloanele realizabile din [modulul 28](28-provocari-random-si-revenire.md), păstrând exact trei instanțe și cel puțin una MANUAL fără learning. Familiile diferă când capabilitățile permit; directorul random este separat și nu rerandomizează daily. Provocările Haos/distrugere nu sunt cerințe pentru daily Academie.
