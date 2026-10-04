# Misiuni zilnice și experiența jucătorului

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Scope V1 confirmat; recompensele și pragurile sunt propuneri de calibrare.

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

Fiecare misiune de campanie sau zilnică eligibilă acordă XP la prima finalizare. Timpul activ acordă XP în intervale idempotente de minute reale, cu reportarea fracțiunii între checkpointuri. Propunere inițială: 100 XP pentru o misiune zilnică și 1 XP/minut activ. Pauza, focusul pierdut, background-ul, replay-ul, experimentele și timpul offline nu contribuie. AUTO poate conta când jucătorul observă activ/inspectează orașul; perioadele fără activitate detectabilă au un prag AFK explicit și calibrat. Timpul activ normal nu cere LEARNING și nu depinde de viteza calendarului economic.

XpEntry are entryId, ruleVersion, amount semnat, causeType, causeId, tick/realTime, evidence și status. Câștigurile și pierderile sunt afișate separat. xpBalance = max(0, soldul anterior + amount); clampingul nu șterge suma penalizării din istoric. Nivelul este derivat din praguri versionate ale soldului și poate scădea; recompensele deja acordate și accesul la vehicule nu sunt revocate. Formulele nu comprimă KPI-urile într-un scor ascuns de stil bun.

## Pierderea XP când intervenția deteriorează un KPI

MANUAL și LEARNING pot avea consecințe negative. MANUAL produce efecte asupra cursei conduse și asupra traficului; LEARNING poate avea și efecte după publicarea profilului comun. Scăderea semnificativă și atribuibilă a oricăruia dintre revenue sau ratingul mediu produce o penalizare, inclusiv cazul revenue în creștere cu rating în scădere. Un câștig al celuilalt KPI nu anulează automat pierderea. Misiunile care arată imitația pot reuși simultan cu o penalizare economică explicită.

KpiImpactEvaluation leagă causeId, segmentIds, profileVersion, baselineCheckpoint, evaluationWindow, controlRun, treatmentRun, sampleCounts, revenueRateDelta, ratingDelta, uncertainty și status PENDING/ATTRIBUTABLE/INSUFFICIENT/INCONCLUSIVE/APPLIED. Nu se scade XP doar fiindcă media s-a mișcat imediat după un click. Scăderea la resetarea unei zile/luni, proiecțiile încă instabile, cererea diferită și review-urile fără eșantion nu sunt atribuite automat jucătorului.

Evaluarea începe din checkpointul anterior intervenției: controlul păstrează politica inițială, tratamentul reproduce comenzile intervenției și activările rezultate, cu același schedule și seed-uri. Comparația include taxiurile și civilii; reproducerea unei intervenții civile poate afecta KPI-urile indirect prin trafic. Se folosesc rate pe aceeași expunere economică, nu totaluri din perioade inegale. Propunere inițială: fereastră de 300 secunde simulate, minimum 10 curse terminale și 5 review-uri eligibile per variantă, cu praguri calibrate și distribuții pe seed-uri. Dacă datele nu permit atribuirea, evaluarea rămâne explicit INSUFFICIENT/INCONCLUSIVE fără penalizare presupusă.

În V1 intervențiile care se suprapun în aceeași fereastră sunt grupate într-o cauză compusă; nu sunt prezentate ca efecte separate precis identificate. Evaluarea acoperă efectele directe și indirecte o singură dată pentru grup; același incident/rideId nu poate fi penalizat din nou ca efect direct și ca efect de profil. Coeficienții și plafonul per cauză sunt versionați și afișați. Exemplu de formulă propusă: severity = max(0, −revenueRateDelta − revenueTolerance) × revenueWeight + max(0, −ratingDelta − ratingTolerance) × ratingWeight; loss = clamp(round(severity), 0, maxLossPerCause). RevenueRateDelta este relativă la baseline pozitiv; la baseline zero se folosește o referință absolută declarată sau rezultatul rămâne neatribuibil. Toleranțele includ incertitudinea; valorile exacte necesită playtest.

Evaluatorul folosește lumea izolată și worker cu anulare/progres; nu consumă revenue sau XP live în rulările de control. Când rezultatul ajunge după alte intervenții, causeId păstrează atribuirea inițială și ledgerul previne aplicarea dublă. Restartul reia numai evaluările neaplicate. Resetul stilului nu anulează consecințele deja demonstrate; un reset explicit al progresului este o operație separată.

## Acceptare și transparență

Sunt verificate trei misiuni per zi, seed stabil, capabilități insuficiente, tranziția la miezul nopții, DST, clock rollback/forward, reward primit lângă expirare și reload. Pentru XP se verifică minut fracționar, pauză, AUTO activ, AFK, reset de profil și reward duplicat. Pentru pierderi: rating în scădere/revenue în creștere, inversul, ambii în scădere, niciunul în scădere, eșantion insuficient, trafic divergent, grupuri suprapuse, civil în MANUAL, profil LEARNING nou și crash după aplicare. UI arată de ce s-a acordat sau scăzut fiecare sumă.
