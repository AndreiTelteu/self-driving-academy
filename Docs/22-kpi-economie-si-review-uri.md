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

## Contract implementat în V1 (PBI 210)

Pop-up-ul KPI consumă exclusiv read model-ul 209: `src/economy/kpi-history.ts` expune `210-kpi-history-v1` și `selectKpiHistory(snapshot, { months?, maximumDailyPoints? })`, iar `snapshot` este validat ca `209-fleet-kpi-v1` cu `historyScans: 0`. Selectorul nu are ledger, store, renderer sau ceas propriu; `src/ui/kpi-history-format.ts` (`210-kpi-history-popup-v1`) proiectează selecția în text, tabele accesibile și bare de grafic, iar `src/ui/kpi-history.ts` montează pop-up-ul.

Fereastra implicită este de 12 luni simulate (`KPI_HISTORY_LIMITS.months`; maximum 24). Sloturile sunt umplute lună cu lună: o lună fără bucket rămâne `NO_DATA` cu valorile `null` și textul „fără date”, niciodată `0` sau o medie inventată. O lună care există cu revenue `0` este un zero real și își păstrează eșantionul. Media este mereu `ratingSum / reviewCount` peste sumele exacte, atât pe fereastră, cât și pe fiecare grup vizual; totalurile adună `ratingSum` și `reviewCount`, niciodată media mediilor. Histograma 0–5 însumează aceleași review-uri, iar o zi cu curse și fără review-uri are media indisponibilă (`NO_REVIEWS`).

Luna curentă este marcată `PARTIAL`, primește nota „Lună parțială: arată doar intervalul observat și nu se compară cu o lună încheiată” și are o bară proiectată separată. Proiecția folosește aceleași praguri 209 (10 curse terminale, 300 s de expunere), iar când nu le atinge raportează `INSUFFICIENT_DATA` cu motivul închis (`FEW_RIDES`, `SHORT_EXPOSURE`, `NO_MONTH`) și cu minimumul afișat; încasarea realizată nu este înlocuită de proiecție.

Downsampling-ul este numai vizual: plafonul implicit este 60 de puncte, maximum 90 (`KPI_HISTORY_LIMITS`), iar zilele exacte rămân disponibile până la capacitatea 209 (4096). Un grup de zile păstrează sumele exacte ale membrilor și numărul de zile acoperite (`exactPoints`), deci media grupului este tot `ratingSum / reviewCount`; tooltip-ul barei și tabelul afișează valorile exacte. Tabelul lunar are un rând stabil pentru fiecare slot (12 rânduri), tabelul zilnic are rândurile punctelor vizuale, iar distribuția are șase rânduri 0–5; toate au `<caption>`, `<th scope>` și text, nu numai culoare.

Pop-up-ul montează un `<button type="button">KPIs</button>` nativ și un `role="dialog"` cu `aria-labelledby`/`aria-describedby`. La deschidere citește read model-ul o singură dată, mută focusul pe butonul „Închide”, ține Tab/Shift+Tab în dialog și readuce focusul anterior la închidere; Escape închide. Nu instalează niciun listener pe `window`/`document`, deci tastele de condus nu sunt furate. Hotkey-ul K rămâne al hostului (binding 009/039), care apelează `open()`.

Pauza este decisă de 070, nu de pop-up: portul `setSurface` se leagă la `pauseFocus.setSurface('panel', open)`. În MANUAL și LEARNING deschiderea suspendă simularea cu cauza `panel`, iar închiderea reia exact modul anterior; în observare AUTO pop-up-ul rămâne live și nu suspendă nimic. Panoul nu are cale pe tick: cât timp este închis, `refresh()` întoarce `SKIPPED_CLOSED` fără citire și fără randare, iar deschiderea nu rescanează ledgerul (`historyScans` rămâne `0`).

Costul este raportat la nivelul `targeted` al `performance_checks: ["ui", "frame"]`: zero citiri/randări când panoul este închis, trei listeners (buton, Închide, dialog), zero listeners globali, bare și rânduri mărginite de plafonul de 12 luni și 60 de puncte. Nu se pretinde FPS sau cost GPU pe hardware real; probele integrate rămân gate-urilor 155/159/220/224. Stilurile pop-up-ului sunt inline, ca să nu modifice foaia globală în afara ownership-ului acestui PBI.

Dovezile reale sunt în [Evidence/210-kpi-history-popup](Evidence/210-kpi-history-popup/README.md): `npm run kpi:history` produce un raport determinist cu 26/26 verificări pe 12 luni sintetice (310 settle-uri, 284 review-uri), 11 luni cu date, una fără date, una parțială, 310 zile exacte → 60 de puncte vizuale, revenue 31960 SDA, media ponderată 2.552817 față de 2.5 cât ar da media mediilor lunare, distribuția 49/45/45/45/45/55 și `historyScans: 0` înainte și după deschidere.

## Contract implementat în V1 (PBI 214): feedbackul consecințelor fără pierdere de XP

Feedbackul consecințelor este un selector read-only peste agregările 209: `src/economy/kpi-impact.ts` expune schema `214-kpi-impact-v1` și `selectKpiImpact(snapshot)`. El nu are ledger, store, renderer sau ceas și nu primește decât `FleetKpiSnapshot`-ul 209, deci `historyScans` rămâne structural `0`, iar un refresh de HUD nu poate rescana istoricul comercial.

**Ce compară.** Selectorul raportează ziua simulată curentă față de ziua simulată imediat precedentă, reținută în același snapshot. Fiecare parte este o copie exactă a bucketului 209: `revenueMinorUnits`, curse `completed`/`failed`/`cancelled`, `reviewCount`, `ratingSum` și histograma 0–5. Media este mereu `ratingSum / reviewCount`, iar o zi fără review-uri rămâne `null`, niciodată un scor perfect. Incidentele de serviciu sunt cursele eșuate plus cele anulate, iar „review-urile mici” sunt notele 0–2 din histogramă, adică exact consecințele reale ale experienței pasagerului.

**Ce nu inventează.** `state` este `COMPARABLE`, `NO_BASELINE` sau `NO_EVENT`; `currentDayMatchesTick` spune dacă bucketul raportat este chiar ziua tick-ului sau ultima zi reținută. Direcțiile sunt `UP`, `DOWN`, `FLAT` și `UNKNOWN`, iar media de rating are disponibilitate explicită (`AVAILABLE`, `CURRENT_EMPTY`, `BASELINE_EMPTY`, `NO_BASELINE`). O primă zi cu date nu este prezentată ca o scădere, iar o lume fără evenimente nu produce o comparație. Read model-ul raportează structural `xp: { debits: 0, credits: 0, negativeCredits: false }`: nicio consecință comercială nu are o cale către ledgerul de XP.

**Interfața.** `src/ui/kpi-impact-format.ts` (`214-kpi-impact-feedback-v1`) validează snapshotul compus și proiectează trei planuri separate, niciodată un mesaj combinat: rezultatul misiunii (116/125), fidelitatea stilului (modul de control plus termenul de confort 139) și consecințele de serviciu (read model-ul 214). Validatorul refuză o sumă de curse care nu corespunde stărilor, o histogramă care nu corespunde numărului de review-uri, o medie diferită de `ratingSum / reviewCount`, o direcție care contrazice delta, un tick diferit de al snapshotului, o misiune eșuată sau refuzată cu XP și o livrare duplicată cu XP. Textul fiecărui plan este verificat față de fragmentele interzise (`-XP`, „pierdere”, „penalizare”, „penalty”, „xp negativ”), deci feedbackul nu promite niciodată o pierdere de progres.

**HUD-ul plafonat.** `src/ui/kpi-impact-hud.ts` este apelat o dată per tick, dar citește portul cel mult o dată la `minimumReadIntervalTicks` (implicit 6 tick-uri, adică 10 Hz la 60 Hz, în contractul 5–10 Hz din modulul 25) și scrie numai planul a cărui proiecție s-a schimbat. Are zero listeners (nu este panou), `historyRebuilds: 0` structural și un contor de mesaje de pierdere de XP care rămâne `0`. Pentru 600 de tick-uri cu o singură schimbare de KPI, dovezile arată 100 de citiri, 2 randări și 4 scrieri de plan, nu 600 de actualizări.

**Numere reale** (din [Evidence/214-kpi-impact](Evidence/214-kpi-impact/README.md), 16/16 verificări): venit +500 cu rating 5 → 2, inversul −500 cu rating 2 → 5, ambele în scădere −800 și 5 → 1 cu un incident real și un review real cu nota 1; soldul 100,5 și nivelul 2 rămân identice după KPI în scădere, accident, obiectiv eșuat și credit negativ refuzat; o recompensă duplicată acordă 0 XP; un import de stil păstrează soldul; 146 de texte generate au 0 potriviri interzise; HUD-ul face 100 de citiri, 2 randări și 4 scrieri pentru 600 de tick-uri.

**Limite.** Nivelul este `targeted`: costul UI este măsurat structural (citiri, randări, scrieri), nu prin FPS sau GPU pe hardware real. Feedbackul citește agregatele 209 și nu paginează ledgerul de review-uri, deci nu afișează motivele individuale ale unui review; acelea rămân în contractul 209. Montarea în stratul HUD al hostului și hotkey-ul rămân ale compoziției, ca la celelalte panouri.
