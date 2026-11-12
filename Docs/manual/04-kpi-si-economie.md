# 4. KPI-uri, economie și review-uri

## Ce măsoară jocul

Două KPI-uri principale, plus serii secundare:

- **Revenue** — încasările flotei de taxiuri din curse, **după rambursări**. Nu este profit: nu se scad
  costuri de operare, combustibil sau salarii. Moneda jocului este `SDA`, iar sumele se păstrează în
  unități monetare întregi (unități minore).
- **Rating mediu** — media notelor clienților pe scara **0–5**. Media este exact
  `ratingSum / reviewCount`; la zero review-uri este **indisponibilă**, nu `0` și nu `5`.
- **Serii secundare** — curse executate pe zi, review-uri primite pe zi, distribuția notelor 0–5 și
  media zilnică.

Civilii influențează congestia și incidentele, dar **nu** intră niciodată în revenue, curse sau
review-uri. Doar taxiurile contează comercial.

## Cele trei ceasuri (nu le amesteca)

| Ceas | Ce măsoară | Valori reale |
| --- | --- | --- |
| Tick-ul fizicii | simularea, la pas fix | 60 Hz |
| Calendarul economic | zile și luni **simulate** pentru rapoarte | 1 zi = 1 200 s simulați; 1 lună = 30 de zile |
| Calendarul zilnic | misiunile zilei, pe **ziua reală** | zi locală în fusul IANA al jucătorului |

Consecințe practice:

- Calendarul economic este comprimat doar pentru raportare: **nu** schimbă timpul frânării, al cursei
  sau al controllerului.
- Pauza și focusul pierdut suspendă și calendarul economic. Offline nu se generează curse, revenue sau
  review-uri.
- UI etichetează mereu „zi/lună simulată” pentru KPI și „misiunile zilei” pentru daily. Când vezi o
  creștere de revenue „într-o zi”, ea aparține zilei simulate, nu celei de calendar.

## Cum se formează tariful și revenue-ul

- Tariful este **fixat la acceptarea cursei** din distanța planificată și durata de referință, nu din
  cât durează efectiv: `baseFare + distanceRate × plannedDistance + timeRate × referenceTripDuration`.
  Deci un ocol sau o așteptare deliberată nu pot crește devizul aceleiași curse.
- O cursă `COMPLETED` încasează tariful complet **o singură dată**.
- `FAILED` și `CANCELLED` fără pasager nu încasează nimic.
- `CANCELLED` cu pasager păstrează doar taxa de serviciu versionată.
- Excepțiile sunt **rambursări explicite**, care referă încasarea și cursa; nu se rescrie tariful.
- Un eveniment livrat a doua oară este raportat `DUPLICATE` și nu schimbă nimic; un reload nu dublează
  încasarea.
- O recuperare cu pasager produce o consecință de serviciu inspectabilă, cu `revenue = 0` pe acea
  închidere.

## Cum se formează nota

Un client produce **cel mult un review per cursă**. Formula reală este:

```
rating = clamp(round(5 − delayPenalty − comfortPenalty − incidentPenalty − failurePenalty + preferenceAdjustment), 0, 5)
```

- Întârzierea vine din durata reală a cursei, confortul din modelul de confort, incidentele din
  coliziunile reale, iar eșecul din starea cursei.
- Preferința clientului este derivată determinist dintr-un seed, deci aceeași cursă produce aceeași notă.
- Motivele sunt un vocabular închis: `ON_TIME`, `SMOOTH_DRIVE`, `EFFICIENT_DELIVERY`, `LATE_ARRIVAL`,
  `HARD_BRAKING`, `COLLISION`, `RIDE_FAILED`, `RIDE_CANCELLED`.
- Nota individuală este întreagă; **media poate fi fracționară**.
- Un al doilea eveniment pentru aceeași cursă nu rescrie review-ul. Singura rescriere este o
  `reissueReview` explicită, cu confirmarea schimbării de model, care păstrează un singur review și
  aplică doar diferența în KPI.
- Clienții sunt simulați; jocul nu sugerează review-uri de la oameni reali.

## Pop-up-ul KPIs

Butonul se numește **„KPIs”** și are ca tastă implicită `K`. Deschide un dialog cu titlul „KPIs și
istoricul flotei”. Ce este adevărat despre el:

- Fereastra implicită este de **12 luni simulate**; maximum 24 de luni.
- Lunile fără date au textul **„fără date”** și valori `null` — niciodată `0` și niciodată o medie
  inventată. O lună care există cu revenue `0` este un zero real și își păstrează eșantionul.
- Luna curentă este marcată **`PARTIAL`** și poartă textul „Lună parțială: arată doar intervalul observat
  și nu se compară cu o lună încheiată”. Bara proiectată este separată de încasarea realizată.
- Proiecția lunară apare numai peste eșantionul minim: **10 curse terminale** și **300 s de expunere**.
  Sub aceste praguri scrie **„Date insuficiente”**, cu motivul închis (`FEW_RIDES`, `SHORT_EXPOSURE`,
  `NO_MONTH`) și minimumul afișat. Încasarea realizată nu este înlocuită cu proiecția.
- Media este mereu `ratingSum / reviewCount` peste sumele exacte. Totalurile adună `ratingSum` și
  `reviewCount`; **nu** se face media mediilor lunare.
- Histograma 0–5 însumează exact aceleași review-uri.
- Graficul este plafonat vizual la 60 de puncte (maximum 90), dar zilele exacte rămân disponibile până la
  capacitatea de 4096; un grup de zile păstrează sumele exacte ale membrilor.
- Tabelele au `<caption>` și capete de coloană cu `scope`, deci sunt citibile cu tastatura și cu
  cititoare de ecran.
- Deschiderea citește read model-ul **o singură dată** și nu rescanează ledgerul (`historyScans = 0`).
  Cât timp panoul este închis, un refresh este sărit fără citire.
- `Escape` închide și readuce focusul la buton; `Tab` rămâne în dialog; panoul nu instalează listeneri
  globali, deci nu fură tastele de condus.

## Ce înseamnă rezultatul pentru tine

- Condusul eficient și confortabil **poate** îmbunătăți ambii KPI în condiții comparabile; condusul
  agresiv **poate** crește throughput-ul și revenue-ul, reducând în același timp nota. Acestea sunt
  consecințe posibile, nu o relație garantată cu un „parametru de agresivitate”.
- Nu există un KPI de „stil corect” și nu se modifică stilul flotei ca să iasă un grafic mai bun.
- Feedbackul consecințelor păstrează trei planuri separate — rezultatul misiunii, fidelitatea stilului
  și consecințele de serviciu — și **nu** afișează niciodată un mesaj de pierdere de XP. Textele
  generate sunt verificate împotriva fragmentelor interzise (`-XP`, „pierdere”, „penalizare”,
  „penalty”).
- HUD-ul de consecințe citește cel mult o dată la 6 tick-uri (10 Hz) și scrie doar planul care s-a
  schimbat, nu reconstruiește istoricul.

## Ce rămâne nevalidat aici

- **FPS-ul și costul GPU pe hardware real** nu sunt măsurate de contractele KPI. Ele aparțin gate-ului
  de performanță și rămân `NOT_VALIDATED`.
- **Plăcerea și lizibilitatea** graficelor pentru oameni cer playtest. Mecanismul este testat; reacția
  jucătorilor este `NOT_RUN`.
- Un singur GPU real și un singur sistem de operare au fost probate pentru backend; NVIDIA, Intel,
  macOS, Linux, Firefox, Safari și dispozitivele mobile sunt `NOT_RUN`, cu motiv, nu presupuse.
