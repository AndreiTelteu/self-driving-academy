# 181 — politică extinsă pentru trasee și recuperare

Contract: `181-route-policy-v2` din [`src/autonomy/route-policy-v2.ts`](../../../src/autonomy/route-policy-v2.ts).
PBI: [181](../../../PBI/Done/181-v2_policy_8.md). Contractul de catalog: [11 § Politică extinsă pentru trasee și recuperare](../../11-catalog-parametri.md).

Raportul determinist (`report.json` / `report.md`) din acest director este generat de
`npm run route:policy`; `npm run route:policy -- --check` refuză un raport neactualizat. Toate
numerele de mai jos sunt cele din raportul generat.

## Ce s-a implementat

`evaluateRoutePolicyV2` primește alternativele comparabile ale tick-ului (aceeași origine, aceeași
destinație) și decide ce preferă șoferul, când commită o rerutare, dacă acceptă o întoarcere în U și
cât durează o recuperare prin marșarier. Nu există un al doilea planificator: lungimea, timpul liber
și viteza liberă a fiecărei alternative vin din planificatorul livrat 041 peste harta reală a
fixture-ului, iar virajele percepute sunt derivate din geometria reală (schimbări de direcție peste
45°). `compileRoutePolicyProfile` citește valorile, unitățile și proveniența din
`parsePublishableDrivingProfile`; `Docs/driving-parameters.json` nu este modificat.

Ponderile sunt normalizate ca **cote dintr-un buget comun**:
`share_k = w_k / (w_timp + w_distanță + w_viraj + w_semafor + w_congestie)`, cuantizate la 1e-12.
Fiecare metrică devine adimensională față de aceeași mulțime comparabilă: timpul de stil față de cel
mai mic timp de stil declarat, distanța față de cea mai mică lungime declarată, congestionarea față
de același timp de referință, virajele și semafoarele ca numărători. Referințele se calculează pe
mulțimea declarată, nu pe cea admisă, ca poarta de întoarcere în U să nu rescaleze scorurile.

## Efectul izolat al fiecărei chei (opt chei, opt efecte)

Cheia scenariului este dusă la minim și la maxim în aceeași scenă; celelalte șapte rămân la valorile
implicite din catalog. Rezultatul măsurat este faptul rutei câștigătoare (sau durata recuperării).

| Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `route_time_weight` | două coridoare reale: `route-short` 666,476 m / 113,295 s, `route-fast` 1 094,427 m / 60,656 s | 0 | 113,295 (`route-short`) | 1 | 60,656 (`route-fast`) | −52,639 | s |
| `route_distance_weight` | aceeași pereche, preferința de distanță la extrem | 0 | 1 094,427 (`route-fast`) | 1 | 666,476 (`route-short`) | −427,951 | m |
| `route_turn_penalty` | geometrie identică 600 m / 60 s, 4 respectiv 1 viraj declarat | 0 | 4 (`route-turn-heavy`) | 20 | 1 (`route-turn-light`) | −3 | viraje |
| `route_signal_penalty` | coridoare simetrice 620,951 m / 62,095 s, 3 respectiv 0 semafoare | 0 | 3 (`route-north`) | 60 | 0 (`route-south`) | −3 | semafoare |
| `route_congestion_penalty` | aceeași pereche, 20 s de întârziere reală pe `route-north` (10 s de trafic pe fiecare din cele două benzi) | 0 | 20 (`route-north`) | 2 | 0 (`route-south`) | −20 | s |
| `reroute_patience` | `route-slow` dominată de `route-direct`, alternativa mai bună văzută de 60 de tick-uri | 2 | 60 de tick-uri rămase | 120 | 7 140 de tick-uri rămase | 7 080 | tick-uri |
| `u_turn_willingness` | `route-direct` 660,555 m / 66,056 s față de `route-uturn` 600,975 m / 40,049 s, U permis | 0 | 66,056 (`route-direct`) | 1 | 40,049 (`route-uturn`) | −26,007 | s |
| `reverse_recovery_duration` | recuperare cerută, spațiu din spate liber | 0 | 2,5 s | 8 | 8 s | 5,5 | s |

Cele două perechi simetrice (`route-turn-heavy`/`route-turn-light`, `route-north`/`route-south`) au
lungime și timp liber **identice** în raportul livrat al lui 041, deci singura diferență măsurată este
faptul declarat al scenariului. Perechea timp/distanță are exact un viraj perceput pe fiecare rută,
deci doar timpul și distanța se opun.

## Separarea cheilor: 54 de perechi inerte, 2 cuplaje explicite

Fiecare cheie este testată în toate cele opt scenarii (56 de perechi), cu cheia scenariului la
valoarea implicită din catalog. **54 de perechi au diferența 0,000**. Singurele două cuplaje sunt
schimbul explicit dintre preferința de timp și cea de distanță — cele două ponderi sunt fețele
aceleiași decizii:

| Cheie variată | Scenariu | Efect |
| --- | --- | --- |
| `route_distance_weight` | ponderea timpului | 1 094,427 m → 666,476 m |
| `route_time_weight` | ponderea distanței | 666,476 m → 1 094,427 m |

## Dovada invarianței la scalare

Aceleași cinci ponderi, scrise la cinci scări (`0,5`, `1`, `2`, `5`, `10` pornind de la un profil de
bază de zece ori mai mic decât valorile implicite), produc **exact aceiași coeficienți**:

| Factor | timp | distanță | viraj | semafor | congestie |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0,5 | 0,071428571429 | 0,035714285714 | 0,238095238095 | 0,595238095238 | 0,059523809524 |
| 1 | 0,071428571429 | 0,035714285714 | 0,238095238095 | 0,595238095238 | 0,059523809524 |
| 2 | 0,071428571429 | 0,035714285714 | 0,238095238095 | 0,595238095238 | 0,059523809524 |
| 5 | 0,071428571429 | 0,035714285714 | 0,238095238095 | 0,595238095238 | 0,059523809524 |
| 10 | 0,071428571429 | 0,035714285714 | 0,238095238095 | 0,595238095238 | 0,059523809524 |

Suma cotelor este 1. **40 de decizii** (8 scenarii × 5 scări) aleg aceeași rută: **8/8 scenarii
identice**. Perechea explicită din cerință — `0,6 / 0,3 / 2 / 5 / 0,5` (valoarea implicită) față de
`0,06 / 0,03 / 0,2 / 0,5 / 0,05` (de zece ori mai mică) — dă coeficienți și scoruri identice și
aceeași alegere.

Testul are dinți: pe o probă de aproape-egalitate (două coridoare identice, cu **12 ms** diferență de
congestie declarată), o regulă naivă care compară totalul brut cu un epsilon absolut de `0,01`
**se schimbă** când profilul este scris ×10, iar politica **nu**:

| Măsură | Scara de bază | ×10 |
| --- | ---: | ---: |
| Îmbunătățirea brută (unități amestecate) | 0,006 | 0,06 |
| Regula naivă cu epsilon 0,01 | KEEP | SWITCH (**se schimbă**) |
| Ruta aleasă de politică | `route-south` | `route-south` |
| Decizia de rerutare a politicii | WAIT | WAIT |

Politica folosește o toleranță adimensională (`scoreTolerance = 1e-6`) și departajare după id-ul
rutei, deci o diferență reală de 12 ms este detectată la orice scară, iar o egalitate rămâne
egalitate la orice scară.

## Cele două limite de siguranță

| Situație | Cheie 0 | Cheie 1 (U) / 8 (recuperare) | Verdict |
| --- | ---: | ---: | --- |
| Întoarcere în U **interzisă** (`FORBIDDEN`) | 66,056 s (`route-direct`) | 66,056 s (`route-direct`) | cheia este inertă, ruta cu U nu este admisă |
| Întoarcere în U **nedeclarată** (`UNKNOWN`) | 66,056 s (`route-direct`) | 66,056 s (`route-direct`) | o permisiune nedeclarată este tratată ca interdicție |
| Recuperare cu spațiu liber | 2,5 s / 150 de tick-uri / 3,0 m | 8 s / 480 de tick-uri / 9,6 m | podeaua `max(cheie, 2,5 s)`, minimul de catalog 0 s nu poate fi instantaneu |
| Recuperare fără spațiu liber | 0 (fără manevră) | 0 (fără manevră) | `RECOVERY_BLOCKED`, nicio valoare nu comandă marșarierul |

Podeaua de 2,5 s este derivată din geometria manevrei: `minimumReverseDistanceM (3 m) /
reverseSpeedMps (1,2 m/s)`. Cu întoarcerea în U interzisă, eșantionul nici nu se mai trage
(`uTurn.sample = null`); cu ea permisă, un singur eșantion determinist per oportunitate
(`deriveOpportunitySeed(seed, opportunityKey)` + cheia fixă `u-turn`) decide admiterea.

## Compatibilitate cu cheile M

Cheile M `speed_delta_urban` și `speed_delta_residential` (m/s) nu rescriu rezultatul livrat de 041:
timpul liber al fiecărei rute rămâne neschimbat, iar delta se aplică numai termenului de preferință,
`timpStil = lungime / (vitezăLiberă + delta)`.

| Rută | Clasă | Delta M | Timp livrat 041 | Timp de stil |
| --- | --- | ---: | ---: | ---: |
| `route-short` | URBAN | 0 m/s | 113,295230 s | 113,295230 s |
| `route-short` | URBAN | 15 m/s | 113,295230 s | 31,915306 s |
| `route-slow` | RESIDENTIAL | 0 m/s | 133,137085 s | 133,137085 s |
| `route-slow` | RESIDENTIAL | 12 m/s | 133,137085 s | 43,134520 s |

Cu delta 0 timpul de stil este exact timpul livrat. Consecința de stil schimbă alegerea pe perechea
timp/distanță (`0 m/s → route-fast`, `15 m/s → route-short`), iar unitățile rămân cele ale
catalogului: M `m/s`, R `weight`/`s`/`ratio`/`probability` exact ca în tabelul de parametri.

## Alternativele comparabile vin din planificatorul livrat 041

Nouă coridoare reale între aceeași origine și aceeași destinație, fiecare izolată prin blocarea
celorlalte (planificatorul rămâne responsabil de traseu). Identitatea costului 041 este verificată
numeric pe fiecare rută: `costSeconds − timpul de bandă livrat = 0,5 s × legături`, adică
`penalizările` din tabel sunt exact cele ale modelului livrat.

| Rută | Lungime (m) | Timp livrat (s) | Viteză liberă (m/s) | Viraje derivate | Cost 041 (s) | Penalizări 041 (s) | Benzi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `route-short` | 666,476152 | 113,295230 | 5,882650 | 1 | 104,795230 | 1,5 | 4 |
| `route-fast` | 1 094,427191 | 60,655781 | 18,043246 | 1 | 52,155781 | 1,5 | 4 |
| `route-turn-heavy` | 600,000000 | 60,000000 | 10,000000 | 0 | 51,500000 | 1,5 | 4 |
| `route-turn-light` | 600,000000 | 60,000000 | 10,000000 | 0 | 51,500000 | 1,5 | 4 |
| `route-north` | 620,950973 | 62,095097 | 10,000000 | 0 | 53,595097 | 1,5 | 4 |
| `route-south` | 620,950973 | 62,095097 | 10,000000 | 0 | 53,595097 | 1,5 | 4 |
| `route-slow` | 765,685425 | 133,137085 | 5,751106 | 3 | 125,637085 | 2,5 | 6 |
| `route-direct` | 660,555128 | 66,055513 | 10,000000 | 0 | 58,055513 | 2,0 | 5 |
| `route-uturn` | 600,975326 | 40,048766 | 15,006088 | 0 | 32,048766 | 2,0 | 5 |

**9/9** rute respectă identitatea. Întârzierea de congestie din scenariul de congestie este reală:
diferența dintre aceeași căutare 041 cu și fără 10 s de trafic declarat pe fiecare din cele două benzi
ale coridorului (20 s).

## Comenzi executate și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 avertismente |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, importuri PASS (inclusiv probele negative) |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm test` | **3 133 teste, 3 133 trecute, 0 eșuate** (108,5 s) |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/route-policy-v2.test.ts` | **15 teste, 15 trecute, 0 eșuate** (fișierul țintă) |
| `npm run route:policy` | **15/15 verificări PASS**, 8 efecte, 56 perechi de separare, 2 cuplaje, 4 rânduri de siguranță, 8/8 scenarii cu alegere identică la toate scările, digest `fnv1a32:919aebb7` |
| `npm run route:policy -- --check` | „Route policy report is current”, „Route policy markdown is current” |

Digest de determinism: 16 decizii (cele opt scenarii, la minim și la maxim) → `fnv1a32:919aebb7`,
identic la rulare repetată.

## Fișiere atinse

- Creat: `src/autonomy/route-policy-v2.ts` (contractul `181-route-policy-v2`).
- Modificat: `src/autonomy/index.ts` (un export nou, adăugat la finalul listei).
- Creat: `tests/autonomy/route-policy-v2-reference.ts` (harta reală, faptele 041, scenariile).
- Creat: `tests/autonomy/route-policy-v2.test.ts` (15 teste).
- Creat: `tests/autonomy/route-policy-v2-report.ts` (raportul determinist).
- Creat: `scripts/run-v2-route-policy-report.mjs`.
- Modificat: `package.json` (scriptul `route:policy`, ultima intrare din blocul `scripts`).
- Modificat: `Docs/11-catalog-parametri.md` (secțiunea contractului, la final).
- Creat: `Docs/Evidence/181-v2-route-policy/` (`README.md`, `report.json`, `report.md`).
- Mutat: `PBI/To Do/181-v2_policy_8.md` → `PBI/Done/181-v2_policy_8.md`.

## Limitări

- `turns` și `signals` sunt **fapte declarate de proprietarul hărții**: planul livrat 041 nu expune
  aceste numărători, iar o linie de oprire `SIGNAL` cere o intersecție autorată cu program de semafor,
  lucru care nu face parte din scope-ul acestui PBI. Fixture-ul derivează virajele din geometria reală
  (schimbări de direcție peste 45°) și le folosește implicit; în scenariul virajelor, unde cele două
  alternative au geometrie identică, numărătoarea (4 vs 1) este declarată explicit, iar semafoarele
  (3 vs 0) sunt declarate în scenariul lor. Restul scenariilor folosesc valorile derivate (0 sau 1).
- `Docs/11` și catalogul machine-readable (`Docs/driving-parameters.json`) sunt de acord asupra lui
  `reverse_recovery_duration`: interval 0–8 s, cu **valoarea implicită 2**. (Cifra `2` din tabelul de
  proiectare este defaultul, nu limita inferioară.) Politica respectă registrul — acceptă 0–8 — și își
  apără minimul cu podeaua explicită de 2,5 s, deci valoarea de catalog 0 nu produce o recuperare
  instantanee.
- Delta M se aplică vitezei libere medii a rutei (lungime / timp liber), nu fiecărei benzi: o rută
  care traversează clase diferite este agregată de proprietarul hărții, la fel ca restul faptelor.
- Politica nu planifică și nu validează geometric un traseu; primește alternative deja valide de la
  planificatorul 041 și nu inventează rute. Nu este conectată încă la un consumator din joc: PBI-ul
  livrează contractul de politică și dovezile lui, ca și PBI-urile 167–179.
