# 182 — învățare extinsă pentru trasee și recuperare

Dovezile PBI 182 pentru contractul `182-route-estimator-v1` din
[`src/learning/route-v2-estimator.ts`](../../../src/learning/route-v2-estimator.ts).

Estimatorul inversează aritmetica deja livrată de `181-route-policy-v2`: cele opt chei R se măsoară
numai din faptele pe care comanda 181 reală le raportează în tick-ul ei, niciodată din profil și
niciodată din scor. Este candidat-only: nu publică profile, nu scrie în store, nu schimbă semantica
181 și nu flipă flagurile `implemented` din catalogul 092.

Alternativele nu sunt numere scrise de mână: fiecare coridor al fixture-ului este planificat de
planificatorul livrat 041 peste geometria autorată, iar fiecare decizie este produsă de stratul 181
real cu un set de chei cunoscut. Estimatorul măsoară exact comportamentul emis.

## Tabelul celor opt chei

Sursa numerelor: `Docs/Evidence/182-v2-route-learning/report.json`, generat determinist cu seed 182
din 28 de episoade reale (comenzi 041 + 181), 0 refuzate, împărțite de același split în estimare și
validare fără suprapunere.

| Cheie | Scenariu | Cum se măsoară (faptul din comanda 181) | Estimare | Incertitudine / prag | Validare independentă |
| --- | --- | --- | ---: | ---: | --- |
| `route_time_weight` | `TIME_VERSUS_DISTANCE` | pereche reală timp/distanță, cu viraje, semafoare și congestie identice: inegalitatea `rho · dt + dd ≤ 0` | **0,0724** | ±0,0050 / 0,03 | VALIDATED, 4 episoade, eroare 0,0001 |
| `route_distance_weight` | `DISTANCE_VERSUS_TIME` | aceeași pereche citită de cealaltă parte: reciproca lui `rho` | **0,0354** | ±0,0050 / 0,03 | VALIDATED, 4 episoade, eroare 0,0001 |
| `route_turn_penalty` | `TURN_VERSUS_LENGTH` | pereche de aceeași viteză liberă: `kappa_viraj · Δviraje + Δdistanță ≤ 0` | **0,2357** | ±0,0164 / 0,04 | VALIDATED, 2 episoade, eroare 0,0004 |
| `route_signal_penalty` | `SIGNAL_VERSUS_LENGTH` | pereche de aceeași viteză liberă, cu semafoare declarate în opoziție cu lungimea | **0,5891** | ±0,0221 / 0,06 | VALIDATED, 2 episoade, eroare 0,0012 |
| `route_congestion_penalty` | `CONGESTION_VERSUS_LENGTH` | pereche de aceeași viteză liberă, cu 12 s de congestie declarată în opoziție cu lungimea | **0,0674** | ±0,0126 / 0,03 | VALIDATED, 2 episoade, eroare 0,0002 |
| `reroute_patience` | `KEEP_TO_SWITCH` | tranziția WAIT → COMMIT: `P = 1200` tick-uri ⇒ `cheie ∈ (19,9833, 20]` | **19,9917 s** | ±0,0500 / 0,5 | VALIDATED, 2 episoade, eroare 0,0083 |
| `u_turn_willingness` | `U_TURN_OPPORTUNITY` | intersecția eșantioanelor deterministe: admitere `cheie > u`, refuz `cheie ≤ u` | **0,1042** | ±0,0434 / 0,15 | VALIDATED, 2 episoade, eroare 0,0218 |
| `reverse_recovery_duration` | `RECOVERY_COMMIT` | durata commitată `max(cheie, 2,5 s)` peste podea | **4,0000 s** | ±0,0500 / 0,5 | VALIDATED, 2 episoade, eroare 0,0000 |

Fiecare cheie are propriul context eligibil, propriul prag de incertitudine și propria validare pe
episoade ținute deoparte. Un segment fără faptul cerut nu produce estimare pentru cheia respectivă.

## Ce este identificabil din cotele normalizate

181 împarte fiecare pondere la suma celor cinci, `share_k = w_k / Σw`, cuantizat la 1e-12. Orice
profil scris la altă scară produce exact aceiași coeficienți și aceeași politică, deci familia
`λ · w` este indistinguibilă din comportament: **scalele absolute nu sunt identificabile**. Din
alegeri se pot citi doar rapoarte între cote, iar estimatorul raportează reprezentantul canonic cu
sumă 1, `w_k := share_k`, pe care 181 îl normalizează înapoi la exact aceiași coeficienți. Nu există
nicio inversare a scorului brut într-o pondere, pentru că acea inversare ar presupune o scală pe care
181 a eliminat-o.

Coeficienții demonstrați (singurele mărimi pe care comportamentul le relevă):

| Coeficient | Definiție | Valoare estimată | Valoare autorată |
| --- | --- | ---: | ---: |
| `rho` | `share_timp / share_distanță` | 2,0467 | 2,0000 |
| `kappa_viraj` | `share_viraj / (share_timp + share_distanță)` | 2,1854 | 2,2222 |
| `kappa_semafor` | `share_semafor / (share_timp + share_distanță)` | 5,4636 | 5,5556 |
| `kappa_congestie` | `share_congestie / (share_timp + share_distanță)` | 0,6250 | 0,5556 |

Reprezentantul cu sumă 1, comparat cu cotele pe care le calculează 181 din profilul autorat:

| Cotă | Estimare | Cotă autorată |
| --- | ---: | ---: |
| `route_time_weight` | 0,072435989183 | 0,071428571429 |
| `route_distance_weight` | 0,035392271105 | 0,035714285714 |
| `route_turn_penalty` | 0,235651164867 | 0,238095238095 |
| `route_signal_penalty` | 0,589127912166 | 0,595238095238 |
| `route_congestion_penalty` | 0,067392662680 | 0,059523809524 |

Suma cotelor raportate este **1**, iar 181 le renormalizează la ele însele (5/5 cote, aceleași cifre
la 1e-9). Cu aceste valori, 181 alege exact aceeași rută ca profilul autorat în **12/12** decizii
demonstrate, iar profilul autorat scris la factorii 1 și 10 (aceleași cote) dă aceeași alegere în
**12/12** decizii.

## Cazuri neidentificabile (demonstrații `UNOBSERVED`)

| Demonstrație | Cheie | Motiv raportat |
| --- | --- | --- |
| întoarcere în U interzisă (`FORBIDDEN`) | `u_turn_willingness` | `U_TURN_PERMISSION_NOT_DECLARED` — 181 nu trage niciun eșantion |
| recuperare commitată pe podeaua de 2,5 s | `reverse_recovery_duration` | `RECOVERY_FLOOR_SATURATED` — banda 0–2,5 s este ascunsă |
| recuperare fără spațiu liber declarat | `reverse_recovery_duration` | `RECOVERY_BLOCKED_NO_COMMAND` — nicio comandă, nicio dovadă |
| fereastră închisă înainte de commit | `reroute_patience` | `PATIENCE_UPPER_BOUND_UNOBSERVED` — doar limita inferioară |
| raport timp/distanță pe o singură parte | `route_time_weight`, `route_distance_weight` | `TIME_DISTANCE_UPPER_BOUND_UNOBSERVED` |
| o penalizare pe o singură parte | toate cele cinci cote | `TURN_TRADE_OFF_UPPER_BOUND_UNOBSERVED` pentru viraj, `SHARE_BUDGET_INCOMPLETE` pentru celelalte patru |
| doi șoferi contrazicători | `route_time_weight`, `route_distance_weight` | `CONTRADICTORY_TIME_DISTANCE_BOUNDS`; penalizările rămân `CANDIDATE` |
| episoade `MANUAL` | toate cele opt chei | `NO_ELIGIBLE_EPISODES` (refuzate `NOT_LEARNING_ELIGIBLE`) |
| fereastră fără prefix utilizabil | toate cele opt chei | `NO_ELIGIBLE_EPISODES` (refuzate `NO_USABLE_PREFIX`) |

Două lecții de identificabilitate ies direct din tabel. O penalizare demonstrată doar pe o singură
parte blochează toate cele cinci cote, pentru că numitorul comun `1 + Σκ` nu poate fi format; în
schimb `rho` cenzat lasă neobservate doar timpul și distanța, iar cele trei penalizări rămân
identificate din perechile lor de aceeași viteză. Iar o contradicție între doi șoferi nu este
mediată: timpul și distanța rămân `UNOBSERVED`, în timp ce penalizările demonstrate consistent
rămân candidate.

## Zerouri demonstrate

| Demonstrație | Cheie | Rezultat |
| --- | --- | --- |
| U refuzat la fiecare oportunitate, eșantioane sub prag | `u_turn_willingness` | `CANDIDATE` cu valoarea **0**, incertitudine 0,0282 sub pragul de 0,15 |
| răbdarea demonstrată la podeaua catalogului (commit la 120 de tick-uri) | `reroute_patience` | `CANDIDATE` cu valoarea **2 s** (`clamped`), adică exact `ceil(2 · 60)` |

Un zero demonstrat rămâne candidat, nu `UNOBSERVED`. Pentru răbdare, valoarea raportată este
minimul catalogului 092 (2 s), pentru că 120 de tick-uri este chiar commit-ul pe care îl produce
`reroute_patience = 2`; o răbdare literală de 0 s ar ieși din intervalul catalogului și ar fi
refuzată de `compileRoutePolicyProfile`.

## Constrângeri de grup explicate

1. `SHARE_SCALE_UNIDENTIFIABLE` — familia `λ · w` dă aceeași politică; doar rapoartele sunt
   identificabile, iar estimatorul raportează reprezentantul cu sumă 1.
2. `TIME_AND_DISTANCE_SHARE_ONE_TRADE_OFF` — o singură pereche în care timpul și distanța se opun
   dovedește `rho` și reciproca lui; pe o pereche de aceeași viteză ele sunt coliniari.
3. `SHARE_BUDGET_COUPLES_THE_FIVE_WEIGHTS` — cota unei penalizări este `κ / (1 + Σκ)`; o penalizare
   cenzată lasă toate cele cinci cote neidentificabile, dar `rho` cenzat nu le atinge.
4. `PENALTY_MAGNITUDE_NEEDS_A_LENGTH_TRADE_OFF` — o pereche cu geometrie identică și doar
   numărătoarea diferită este ordinală: mărimea cere un ocol declarat.
5. `U_TURN_PERMISSION_SHADOWS_WILLINGNESS` — o întoarcere interzisă sau nedeclarată nu trage
   eșantion și nu spune nimic despre disponibilitate.
6. `RECOVERY_FLOOR_HIDES_SHORT_DURATIONS` — `max(cheie, 2,5 s)` ascunde toată banda 0–2,5 s.
7. `PATIENCE_ONLY_BETWEEN_ADMISSIBLE_ROUTES` — o rerutare forțată și o primă decizie fără rută
   curentă nu observă răbdarea.
8. `ROUTE_KEYS_FROM_ONE_DECISION` — o decizie 181 oferă cel mult o pereche punctată, o tranziție, un
   eșantion sau o recuperare; nicio cheie nu este dedusă din alta.

## Compatibilitate cu 181 (citire fără schimbare de semantică)

- Versiune politică `181-route-policy-v2`, candidate-only `true`, semantică schimbată `false`, rată
  60 Hz, podea de recuperare 2,5 s, cuantizare a cotelor 1e-12.
- Eșantionul de dovezi nu poartă nici pondere, nici scor: `tick`, `policyActive`, `reason`,
  `action`, `referenceSeconds`, `referenceMetres`, `currentRouteId`, `candidateRouteId`,
  `selectedRouteId`, `reroute`, `uTurn`, `recovery`, `routes`. O probă cu profilul scris la o zecime
  din ponderi produce un eșantion identic bit cu bit.
- Estimările sunt în intervalele catalogului 092 și pot fi citite direct de
  `compileRoutePolicyProfile`: 12/12 decizii rejucate aleg exact ce alege profilul autorat, iar
  cotele raportate se renormalizează la ele însele.
- Cheile M `speed_delta_urban` și `speed_delta_residential` sunt citite de 181 și nu sunt estimate
  aici; timpul de stil al fiecărei alternative rămâne cel raportat de politică.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`, fără erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (385 fișiere TypeScript, 6 + 4 + 3 probe negative respinse) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | PASS: 3153 teste, 3153 trecute, 0 eșecuri, 82660,16 ms |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/route-v2-estimator.test.ts` | PASS: 20 teste, 20 trecute, 0 eșecuri |
| `npm run route:learning` | 22/22 verificări PASS, 8 chei candidate, 0 chei neobservate, digest `fnv1a32:e438ed74`, overall PASS |
| `npm run route:learning -- --check` | PASS: `report.json` și `report.md` sunt actuale, cod de ieșire 0 |

## Fișiere atinse

- Creat: `src/learning/route-v2-estimator.ts` (contractul `182-route-estimator-v1`).
- Creat: `tests/learning/route-v2-estimator-reference.ts` (harta reală a fan-ului, faptele 041 și
  scenariile deterministe).
- Creat: `tests/learning/route-v2-estimator-report.ts` (raportul determinist și tabelul din
  `report.md`).
- Creat: `tests/learning/route-v2-estimator.test.ts` (20 de teste deterministe).
- Creat: `scripts/run-v2-route-learning-report.mjs` (scriptul de raport cu `--check`).
- Creat: `Docs/Evidence/182-v2-route-learning/report.json`, `report.md`, `README.md`.
- Modificat: `src/learning/index.ts` (export nou la finalul listei).
- Modificat: `package.json` (intrarea `route:learning` la finalul blocului `scripts`).
- Modificat: `Docs/10-invatarea-stilului.md` (secțiune nouă la final).
- Mutat: `PBI/In Progress/182-v2_learn_8.md` → `PBI/Done/182-v2_learn_8.md` (mutare fizică).

## Limitări

- Valorile din fixture sunt demonstrații plauzibile, nu date măsurate pe jucători: dovezile validează
  contractul de context, identificabilitate, incertitudine, împărțire și refuz, nu calibrarea finală
  a stilului.
- Cotele raportate sunt reprezentantul canonic cu sumă 1 al familiei identificate, nu ponderile
  autorate: o valoare de 0,2357 pentru `route_turn_penalty` nu este „0,2357 s/viraj”, ci cota din
  bugetul normalizat al lui 181. Orice altă scară a aceleiași cote produce aceeași politică.
- `turns` și `signals` rămân fapte declarate de proprietarul hărții, ca în 181: planul livrat 041 nu
  expune aceste numărători, iar fixture-ul le declară explicit în scenariile lor.
- Banda de incertitudine a congestiei este cea mai largă dintre cote (±0,0126), pentru că perechea
  de congestie are cel mai mic raport de lungime util (1,2–1,3); o demonstrație reală cu ocoluri mai
  mari ar îngusta-o.
- Disponibilitatea de U are nevoie de oportunități cu eșantioane de ambele părți ale pragului; un set
  cu eșantioane doar mari lasă banda prea largă și cheia `UNOBSERVED`.
- Răbdarea nu poate fi demonstrată sub 2 s: catalogul nu are o valoare mai mică, iar 120 de tick-uri
  este chiar commit-ul pentru 2 s.
