# KPI-uri, economie și review-uri

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Scope V1 confirmat; formulele și valorile numerice sunt propuneri de calibrare, nu rezultate implementate.

## Experiența jucătorului

Butonul KPIs din panoul flotei, disponibil de la început, deschide un pop-up detaliat. Cele două KPI-uri principale sunt revenue-ul lunar al flotei și ratingul mediu al clienților pe scara 0–5. Grafice secundare arată curse executate pe zi, review-uri primite pe zi, distribuția notelor 0–5 și media zilnică. Fiecare grafic are perioadă, unitate, număr de observații, tooltip și tabel accesibil prin tastatură.

MANUAL schimbă experiența cursei conduse și poate afecta indirect alte curse prin trafic, fără schimbarea stilului comun. LEARNING poate modifica stilul tuturor taxiurilor și civililor, amplificând indirect rezultatele flotei. Civilii influențează congestia și incidentele, dar nu intră în revenue, curse sau review-uri ale taxiurilor. Modul AUTO produce aceleași evenimente comerciale.

Condusul mai eficient și confortabil poate îmbunătăți ambii KPI în condiții comparabile. Condusul agresiv poate crește throughput-ul și revenue-ul, reducând ratings; accidentele și blocajele pot reduce ambii. Nu se forțează o relație monotonă cu un parametru de agresivitate și nu se modifică stilul pentru a obține un scor mai bun.

## Trei ceasuri distincte

Tick-ul fizicii avansează la pas fix. Calendarul economic folosește ticks și epoch-ul economic salvat: propunere inițială 1 zi economică = 1.200 secunde simulate, 1 lună = 30 zile economice. Calendarul comprimat este doar pentru raportare; nu schimbă timpul fizic al frânării, al cursei sau al controllerului. Pauza/focusul oprit suspendă și calendarul economic. Offline nu se generează curse, revenue sau review-uri. Configurația timpului este versionată; o schimbare începe o nouă serie de raportare și nu rescrie istoricul.

Misiunile zilnice se schimbă după zi calendaristică reală, conform [modulului 23](23-misiuni-zilnice-si-experienta.md). XP de timp se măsoară în minute reale active, fără bonus prin accelerarea unui experiment. UI etichetează întotdeauna „zi/lună simulată”, respectiv „misiunile zilei”.

## Revenue și tarife

Revenue înseamnă încasări din curse, după rambursări; nu este profit după costuri de operare. Tariful este afișat și fixat când se acceptă cursa: baseFare + distanceRate × plannedDistance + timeRate × referenceTripDuration. Valoarea se stochează în unități monetare întregi, cu cod de monedă fictivă a jocului și pricingVersion. Tarifele exacte se calibrează. Distanța și durata planificate previn creșterea încasării prin ocoluri sau așteptare deliberată; viteză mai mare crește potențialul de a executa mai multe curse, nu prețul aceleiași curse.

COMPLETED produce o încasare o singură dată. FAILED/CANCELLED nu primesc tariful complet; regulile de rambursare sunt versionate, iar o recuperare cu pasager este o consecință de serviciu inspectabilă. Ajustările referă transactionId și rideId originale. O închidere și un reload nu dublează încasarea. Ledgerul păstrează tarif acceptat, suma încasată, rambursări, tick economic și cauze.

KPI-ul lunar arată separat: încasarea efectivă a lunii curente, lunile încheiate și venitul lunar proiectat. Proiecția = revenue din fereastra activă / durata economică observată × durata lunii; precizează fereastra și limitele eșantionului. Propunere de minimum pentru proiecție: 10 curse terminale și 300 secunde simulate de expunere. Până atunci apare „Date insuficiente”. Încasarea realizată nu este înlocuită cu proiecția; o lună parțială nu este comparată ca total cu o lună completă.

Cererea inițială rămâne un schedule de scenariu controlat. Feedbackul rating→cerere este rezervat unei revizii ulterioare; nu introduce în V1 o spirală ascunsă de scădere a cererii. În V1 ratings și revenue sunt rezultate independente ale acelorași curse și trafic.

## Review-uri simulate 0–5

RideReview conține reviewId, rideId, customerId, rating 0–5, reasonCodes, tick, reviewModelVersion, exposure, controlIntervals și profileVersions. Clienții sunt simulați; jocul nu sugerează existența unor review-uri de la oameni reali. Un client cu experiență evaluabilă produce cel mult un review per rideId. Versiunea modelului descrie formula folosită la emitere; actualizarea modelului nu dublează review-ul și nu recalculează tacit istoricul. Cursa finalizată cu pasager este eligibilă; eșecul cu pasager și anularea după o așteptare eligibilă pot primi review cu motiv. Cererea anulată înainte de asignare sau fără experiență relevantă nu produce o notă inventată.

Propunere explicabilă: rating = clamp(5 − delayPenalty − comfortPenalty − incidentPenalty − failurePenalty + preferenceAdjustment, 0, 5). Ratingul individual este rotunjit la o notă întreagă; media poate fi fracționară. Preferințele clienților și variația au seed-uri legate de rideId/customerId, refolosite în comparații. Coeficienții, pragurile și rotunjirea sunt versionate și testați; indicatorul UI se bazează numai pe review-uri efectiv produse.

Confortul comenzilor exclude teleportările și impulsurile de impact din estimarea stilului. incidentPenalty include impactul real, intensitatea, blocajele și recuperarea cu pasager; aceste consecințe nu dispar prin filtrarea accelerației. Motivele review-ului explică punctual întârzierea, frânarea bruscă, virajele, incidentul sau livrarea eficientă.

## Agregări și grafice istorice

FleetKpiBucket are periodId, start/endTick, economyClockVersion, currency, revenueMinorUnits, completedRides, failedRides, reviewCount, ratingSum, ratingHistogram, exposureSeconds, profileActivationMarkers și completeness. Media = ratingSum / reviewCount; la zero review-uri este indisponibilă. Totalurile pe mai multe zile însumează ratingSum și reviewCount, fără medie a mediilor zilnice. O zi fără curse poate avea revenue 0 și rating indisponibil; lipsa datelor este diferită de zero.

Revenue se agregă pe luna simulată; cursele, numărul de review-uri, media și distribuția notelor pe zi simulată. Fiecare cursă terminală intră în bucketul tick-ului terminal; rambursările sunt ajustări înregistrate, cu referința tranzacției. UI permite zi/lună și fereastră recentă, marchează perioada curentă parțială și nu unește golurile din istoric cu rezultate fictive.

Graficele marchează intervențiile MANUAL/LEARNING și activările de profil, cu posibilitatea de a inspecta cursele/review-urile sursă. O linie temporală sugerează asocierea, fără a pretinde atribuirea exactă; modificările KPI nu retrag XP. Replay-ul și experimentele izolate nu scriu ledgerul live.

## Persistență și acceptare

Ledgerul, review-urile, bucketurile și configurațiile sunt salvate împreună cu checkpointul și au migrare explicită. Exportul unei sesiuni poate include aceste date; exportul unui DrivingProfile nu include revenue sau progres. Resetul stilului nu șterge istoria comercială. Resetul explicit al scenariului economic începe un epoch nou și nu rescrie seria precedentă.

Scenariile verifică: taxiuri nevizibile; curse mixte de control; finalizare duplicată; anulare înainte/după experiență; impact filtrat din stil dar prezent în review; medii ponderate; perioadă fără review-uri; graniță de zi/lună; lună parțială; reload și rambursare. Un scenariu comparabil demonstrează eficiență cu ratings bune și unul throughput mai mare cu ratings mai slabe. Sunt necesare rezultate din simulare, nu ajustări UI pentru a forța exemplul.

## Costul istoricului și al popup-ului

209 actualizează ledgerul și bucketurile incremental. 210 citește agregări/pagini, plafonează punctele graficului la rezoluția afișată și păstrează datele exacte pentru tabel/tooltip. Un panou închis nu reconstruiește grafice, iar refresh-ul HUD nu rescanează ledgerul. Probe: 12 luni sintetice de istoric, review-uri paginate, trafic AUTO cu popup/recorder/autosave și reluarea condusului după închiderea popup-ului în MANUAL/LEARNING, conform [modulului 25](25-performanta-contracte-si-benchmark.md).

## Economie și sesiuni în revizia 0.5

Ledgerul comercial live aparține Academiei. Haos are statistici separate și nu modifică revenue/ratings Academie. R cu pasager și resetul lumii produc rezultate comerciale explicite conform [modulului 26](26-joaca-libera-haos-si-distrugere.md), fără ștergerea istoricului sau XP negativ. Review-urile pot include replici comice bazate pe reasonCodes reale; umorul nu falsifică ratingul.

## Contract implementat în V1 (PBI 209)

Economia trăiește în `src/economy/` cu schema `209-fleet-economy-v1`, exportată aditiv prin `src/economy/index.ts`. Modulul nu are ceas de perete, DOM, renderer sau store: primește o cursă terminală 061 reală plus `LaneGraph` real, iar confortul vine din read model-ul 139 (`comfortReviewModel`). `createFleetEconomy` compune un singur ledger comercial (`209-fleet-ledger-v1`), un singur ledger de review-uri (`209-review-v1`) și un singur agregator KPI (`209-fleet-kpi-v1`); `readRideEconomicOutcome` este singurul adaptor 061 → fapte economice.

Tariful `209-tariff-v1` este `baseFare + distanceRate × plannedDistance + timeRate × referenceTripDuration`, în unități monetare întregi, cu moneda `SDA` și `pricingVersion`. Distanța planificată se calculează din `tripRouteLaneIds`, iar durata de referință din `tripCostSeconds`, deci un ocol sau o așteptare nu pot crește devizul aceleiași curse. Un tarif nou este o versiune nouă de schedule: settle-urile deja înregistrate își păstrează tariful, iar `quote` rămâne stabil pe toată durata cursei.

Settle-ul este o singură intrare pe `ride-settled:<rideId>`, cu cheie explicită și memorie mărginită. COMPLETED încasează tariful complet; FAILED și CANCELLED fără pasager nu încasează nimic; CANCELLED cu pasager păstrează doar taxa de serviciu versionată. Excepțiile sunt rambursări explicite care referă încasarea și `rideId`-ul, nu tarife rescrise, iar un `vehicleKind: 'CIVILIAN'` este respins înainte de orice deviz — civilii nu ajung niciodată în revenue, curse sau review-uri. Reluarea unui eveniment este `DUPLICATE` și nu schimbă nimic.

Review-ul este `ride-review:<rideId>` și există cel mult unul per cursă și pasager evaluabil. Formula este `rating = clamp(round(5 − delayPenalty − comfortPenalty − incidentPenalty − failurePenalty + preferenceAdjustment), 0, 5)`, cu întârzierea din durata reală a cursei, confortul din `comfortReviewModel`, incidentele 028 reale și un vocabular închis de motive (`ON_TIME`, `SMOOTH_DRIVE`, `EFFICIENT_DELIVERY`, `LATE_ARRIVAL`, `HARD_BRAKING`, `COLLISION`, `RIDE_FAILED`, `RIDE_CANCELLED`). Preferința clientului este derivată determinist din `preferenceSeed`. Un al doilea `eventId` pentru aceeași cursă este `EXISTING` și nu rescrie review-ul; schimbarea modelului nu recalculează tacit istoricul. Singura rescriere este `reissueReview`, explicită, cu `acknowledgeModelChange: true`, care păstrează un singur review, crește `revision` și aplică doar delta în KPI.

Bucketurile KPI se actualizează în același apel cu settle-ul și review-ul: ziua și luna simulată primesc `revenueMinorUnits`, `completedRides`, `failedRides`, `cancelledRides`, `reviewCount`, `ratingSum`, histograma 0–5 și `exposureSeconds`. Media este `ratingSum / reviewCount`, indisponibilă la zero review-uri; totalurile însumează `ratingSum` și `reviewCount`, fără media mediilor. Ceasul economic este `209-economy-clock-v1` (1200 s/zi, 30 zile/lună, 60 Hz) și este versionat separat de tick-ul fizic. `snapshot` întoarce `historyScans: 0` structural: citirea KPI nu replays-uiește ledgerul. Proiecția lunară cere minimum 10 curse terminale și 300 s de expunere, altfel raportează `INSUFFICIENT_DATA`; încasarea realizată nu este înlocuită cu proiecția.

Limitele sunt fixe: 4096 settle-uri FIFO, 4096 review-uri FIFO cu 8192 chei de idempotență, 512 zile și 24 luni, cu motive de refuz închise. `reset` golește cele trei structuri împreună. Nu fac parte din acest contract: feedbackul rating→cerere (revizie ulterioară), persistarea în savefile, popup-ul KPI, paginarea review-urilor și downsampling-ul graficelor (210).

Dovezile reale sunt în [Evidence/209-fleet-economy-reviews](Evidence/209-fleet-economy-reviews/README.md): `npm run fleet:economy` produce un raport determinist cu 10/10 verificări, deviz 551 neschimbat de un ocol de 300 s, settle-uri 551/0/0/165, rating mediu 5 pentru stilul eficient și 1,333333 pentru cel agresiv, iar bucketul zilei raportează 4 curse terminale, 3 review-uri și `historyScans: 0`.
