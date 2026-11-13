# 183 — politică extinsă pentru pietoni și pericole

Contract: `183-hazard-policy-v2` din [`src/autonomy/hazard-policy-v2.ts`](../../../src/autonomy/hazard-policy-v2.ts).
PBI: [183](../../../PBI/Done/183-v2_policy_9.md). Contractul de catalog: [11 § Politică extinsă pentru pietoni și pericole](../../11-catalog-parametri.md).

Raportul determinist (`report.json` / `report.md`) din acest director este generat de
`npm run hazard:policy`; `npm run hazard:policy -- --check` refuză un raport neactualizat. Toate
numerele de mai jos sunt cele din raportul generat.

## Ce s-a implementat

`evaluateHazardPolicyV2` primește faptele observabile ale tick-ului și decide cedarea la o traversare
reală, spațiul păstrat față de un pieton și față de un obstacol, reacția la un stimul de pericol,
intensitatea frânării de urgență, disponibilitatea de a ocoli prin viraj, viteza de apropiere de o
trecere și folosirea claxonului. Nu există un al doilea sistem de pietoni, pericole sau coliziuni:
traversarea și starea vin din `164-pedestrians-v1`, stimulul, cutia obstacolului și oportunitatea de
claxon din `165-hazards-v1`, geometria din clasa livrată `023` („sedan" 1,80 m ecartament, frânare
8 m/s², priză 1,3; „compact" 1,60 m, 9 m/s², priză 1,5), iar aderența din suprafețele `026`
(`dry-asphalt`, `reduced-adhesion` cu `tireGripScale` 0,35). `compileHazardPolicyProfile` citește
valorile, unitățile și proveniența din `parsePublishableDrivingProfile`; `Docs/driving-parameters.json`
nu este modificat.

Fixture-ul nu inventează fapte de hazard: rulează modulul real 164 până când un pieton al hărții
autorate ajunge la bordură și pornește traversarea (10,00 m la 1,463935 m/s, adică 6,830903 s până
eliberează calea), iar obstacolul și stimulul sunt cele pe care le parsează, respectiv le creează
modulul real 165. Poziția și viteza ego-ului sunt ale scenariului de politică, ca la celelalte
straturi V2.

## Efectul izolat al fiecărei chei (opt chei, opt efecte)

Cheia scenariului este dusă la minimul și la maximul din catalog în aceeași scenă; celelalte șapte
rămân la valorile implicite. Rezultatul măsurat este cel al canalului cheii.

| Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `pedestrian_yield_probability` | traversarea reală `cw:0-1:E`, marjă 3,169 s peste timpul de traversare | 0 | 0,000 (nu cedează) | 1 | 1,000 (cedează) | 1,000 | decizie |
| `pedestrian_clearance` | același pieton la bordură, la 12 m, viteză 6 m/s | 0,1 | 6,229 m/s | 6 | 4,899 m/s | −1,330 | m/s |
| `hazard_reaction_delay` | stimulul real 165 apărut la 38,000 m cu 8,000 m/s | 0 | 28,000 m marjă | 3 | 4,000 m marjă | −24,000 | m |
| `obstacle_clearance` | conul real (jumătate de lățime 0,30 m) la 12 m | 0,1 | 6,325 m/s | 4 | 5,550 m/s | −0,775 | m/s |
| `emergency_brake_intensity` | același stimul, suprafața `dry-asphalt` | 0 | 0,000 m/s² | 1 | 8,000 m/s² | 8,000 | m/s² |
| `evasive_steer_willingness` | bariera reală la 20 m, 4,50 m spațiu lateral, 0,6 s | 0 | 0,000 m | 1 | 0,450 m | 0,450 | m |
| `crosswalk_approach_speed` | trecerea reală la 25 m, limita autorată 15 m/s | 0,5 | 0,500 m/s | 15 | 15,000 m/s | 14,500 | m/s |
| `horn_use_probability` | oportunitate reală de claxon, claxonul permis | 0 | 0,000 (nu folosește) | 1 | 1,000 (folosește) | 1,000 | decizie |

Spațiul față de pieton și cel față de obstacol sunt plafoane de viteză, nu valori de sine stătătoare:
`sqrt(2 · comfort_deceleration · cameră)`, adică viteza maximă de la care vehiculul mai poate opri în
camera rămasă la decelerația M de confort. O cheie mai mare cere mai mult spațiu, deci o viteză
comandată mai mică.

## Separarea cheilor: 56 de perechi inerte

Fiecare cheie este testată în toate cele opt scenarii (56 de perechi), cu cheia scenariului la
valoarea implicită din catalog. **56/56 perechi au diferența 0,000**: nicio cheie nu se amestecă în
canalul alteia. Separarea este construită, nu întâmplătoare: canalul de cedare există numai când
pietonul traversează, canalul de spațiu al pietonului numai când există un pieton, cel de obstacol
numai când există o cutie declarată, cel de reacție și cel de frânare numai când există un stimul 165,
ocolirea numai când lumea declară spațiu lateral, iar claxonul numai când există oportunitate.

## Cele patru limite de siguranță

| Limită | Situație | Cheie joasă | Cheie ridicată | Verdict |
| --- | --- | ---: | ---: | --- |
| Cedare obligatorie | pieton real la 12 m, marjă −4,831 s (sub `yield_time_gap` 3 s) | 1,000 (cedează) | 1,000 (cedează) | cheia este inertă: cedarea nu este opțională |
| Minim de spațiu (pieton) | pieton la 1,0 m, sedan de 1,80 m | 0,10 m → **2,300 m** (ridicat), viteză 0 | 6 m → 6,000 m, viteză 0 | nicio valoare nu avansează prin pieton |
| Minim de spațiu (obstacol) | bariera autorată la 2,50 m, marjă fizică 3,40 m | 0,10 m → **3,400 m** (ridicat), viteză 0 | 4 m → 4,000 m, viteză 0 | marja cutiei late nu poate fi coborâtă |
| Plafon de reacție | stimul real la 14,000 m, 8 m/s, capacitate 8 m/s² | 0 s → 0,500 s, marjă 4,000 m | 3 s → **1,000 s saturat**, marjă 0,000 m | întârzierea nu depășește ce permite spațiul |
| Plafon de aderență | `reduced-adhesion`, aderență 4,463550 m/s² | 0,5 → 4,000 m/s² | 1 → **4,464 m/s²** din 8 cerute | frânarea se oprește la limita anvelopei |
| Subordonarea ocolirii | bariera la 20 m, doar 3,00 m spațiu (sub 3,40 m) | 0,000 m | 0,000 m | fără spațiu, cheia este inertă |
| Subordonarea claxonului | oportunitate reală, claxonul interzis | 0 (fără eșantion) | 0 (fără eșantion) | eșantionul nici nu se trage |

Formulele celor patru limite, cu constantele din contract:

1. **Minim de spațiu** — `max(cheie, trackM + 0,5 m)` pentru pieton și
   `max(cheie, trackM / 2 + halfWidth + 0,5 m)` pentru obstacol. Pentru sedan: 2,30 m față de un
   pieton, 1,70 m față de un con de 0,30 m, 3,40 m față de bariera de 2,00 m. Un hazard deja în marjă
   produce `roomM = 0`, deci plafon de viteză 0 și `action = BRAKE`.
2. **Plafon de reacție** — `min(M brake_reaction_delay + cheie, (cameră − v² / (2 · capability)) / v)`.
   Pentru stimulul de la 14 m: camera 12 m, oprire 4 m, plafon 1,000 s, 60 de tick-uri. Marja de
   oprire rămasă este `cameră − v · întârziere − v² / (2 · capability)` și nu coboară sub 0.
3. **Plafon de aderență** — `min(cheie · brakeAcceleration, grip · tireGripScale · g)`. Pe uscat
   aderența este 12,753 m/s² (sedan) și 14,715 m/s² (compact), peste capacitatea de frânare, deci
   limita este frâna; pe `reduced-adhesion` aderența este 4,463550 m/s², sub capacitatea de 8 m/s²,
   deci limita este anvelopa.
4. **Subordonarea** — ocolirea cere `lateralSpaceM ≥ trackM / 2 + halfWidth + 0,5 m`, altfel
   `EVASION_NO_SPACE` fără eșantion; claxonul cere permisiunea lumii, altfel `HORN_FORBIDDEN` fără
   eșantion.

## Compatibilitate cu cheile M

Patru chei M livrate sunt citite fără să fie rescrise; valorile moștenite sunt raportate separat de
contribuția R.

| `comfort_deceleration` (m/s²) | Plafon de viteză la pieton (m/s) |
| ---: | ---: |
| 2 | 6,228965 |
| 2,5 | 6,964194 |
| 8 | 12,457929 |

| `brake_reaction_delay` (s) | Moștenit (s) | Cerut cu 0,5 s R (s) | Tick-uri |
| ---: | ---: | ---: | ---: |
| 0 | 0 | 0,5 | 30 |
| 0,5 | 0,5 | 1,0 | 60 |
| 3 | 3 | 3,5 | 210 |

| `curve_lateral_accel` (m/s²) | Accelerație folosită | Deplasare realizabilă (m) | Deplasare commitată (m) |
| ---: | ---: | ---: | ---: |
| 2,5 | 2,5 | 0,45 | 0,45 |
| 8 | 8 | 1,44 | 1,10 |

| `yield_time_gap` (s) | Marjă reală (s) | Cedare obligatorie | Cedare la 0 | Cedare la 1 |
| ---: | ---: | --- | --- | --- |
| 3 | 3,169097 | nu | nu | da |
| 8 | 3,169097 | da | da | da |

Un `comfort_deceleration` mai mare permite o viteză de apropiere mai mare la același spațiu (oprirea
este mai scurtă), `brake_reaction_delay` se adună cu cheia R fără să fie înlocuit, `curve_lateral_accel`
mărește deplasarea realizabilă până la spațiul liber, iar `yield_time_gap` mută granița dintre cedarea
discreționară și cea obligatorie. Unitățile rămân cele ale catalogului: M `m/s²`, `s`; R
`probability`, `m`, `s`, `ratio`, `m/s`.

## Eșantioane per oportunitate

Un singur eșantion determinist per oportunitate și per canal: `deriveOpportunitySeed(seed,
opportunityKey)` cu cheile fixe `pedestrian-yield`, `evasion` și `horn`. Reevaluarea aceleiași
oportunități dă exact aceleași eșantioane; altă oportunitate și alt seed le schimbă. Unde canalul nu
există (pieton care doar așteaptă, fără spațiu lateral, claxon interzis) eșantionul este `null`, deci
cheia este inertă prin construcție.

## Comenzi executate și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 avertismente |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!" |
| `npm run check:architecture` | exit 0, importuri PASS (386 fișiere TypeScript, inclusiv probele negative) |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized." |
| `npm test` | **3 168 teste, 3 168 trecute, 0 eșuate** (629,4 s) |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/hazard-policy-v2.test.ts` | **15 teste, 15 trecute, 0 eșuate** (fișierul țintă) |
| `npm run hazard:policy` | **15/15 verificări PASS**, 8 efecte, 56 perechi de separare, 0 cuplaje, 7 rânduri de siguranță, digest `fnv1a32:76d1c68d` |
| `npm run hazard:policy -- --check` | „Hazard policy report is current", „Hazard policy markdown is current" |

Digest de determinism: 16 decizii (cele opt scenarii, la minim și la maxim) → `fnv1a32:76d1c68d`,
identic la rulare repetată.

## Fișiere atinse

- Creat: `src/autonomy/hazard-policy-v2.ts` (contractul `183-hazard-policy-v2`).
- Modificat: `src/autonomy/index.ts` (un export nou, adăugat la finalul listei).
- Creat: `tests/autonomy/hazard-policy-v2-reference.ts` (traversarea reală 164, obstacolul și stimulul real 165, scenariile).
- Creat: `tests/autonomy/hazard-policy-v2.test.ts` (15 teste).
- Creat: `tests/autonomy/hazard-policy-v2-report.ts` (raportul determinist).
- Creat: `scripts/run-v2-hazard-policy-report.mjs`.
- Modificat: `package.json` (scriptul `hazard:policy`, ultima intrare din blocul `scripts`).
- Modificat: `Docs/11-catalog-parametri.md` (secțiunea contractului, la final).
- Creat: `Docs/Evidence/183-v2-hazard-policy/` (`README.md`, `report.json`, `report.md`).
- Mutat: `PBI/To Do/183-v2_policy_9.md` → `PBI/Done/183-v2_policy_9.md`.

## Limitări

- Nivel determinist în Node: fără browser, GPU, fizică live sau input uman. Comenzile sunt calculate
  din faptele declarate ale tick-ului; contractul nu este încă legat la un consumator din joc, ca și
  PBI-urile 167–181.
- Politica tratează cel mult **un** pieton și **un** obstacol pe tick: compoziția îi predă pe cei mai
  apropiați din cale, iar decizia este a unui singur tick. Un grup de pietoni ori un câmp de obstacole
  cere un consumator care agregă candidații, nu o schimbare a acestui contract.
- Distanțele și viteza ego-ului sunt fapte ale apelantului: traversarea, starea, timpul rămas,
  cutia obstacolului și stimulul sunt reale (164/165), dar plasarea ego-ului este a scenariului.
- Jumătatea de lățime a unui pieton este o constantă de politică documentată (0,25 m), pentru că 164
  modelează pietonul ca punct; marja de 0,5 m este tot o constantă de politică, mai mare decât
  marginea de 0,2 m a politicii laterale, pentru că un pieton poate intra în marjă.
- Claxonul rămâne un fapt de oportunitate: `165` declară explicit că nu există canal live de input, iar
  politica decide folosirea, nu creează canalul audio sau de input.
- Un hazard deja în interiorul marjei fizice nu poate fi „reparat" de politică: comanda este 0 m/s, dar
  spațiul pierdut nu este recreat. Marja este doar limita de la care vehiculul nu mai avansează.
- Timpul de reacție este plafonat de capacitatea fizică de frânare, nu de o distanță de oprire
  garantată: dacă nici cu întârzierea zero oprirea nu încape, comanda rămâne frânarea maximă și
  motivul este `HAZARD_STOPPING_DISTANCE_EXCEEDED`, fără promisiunea unei opriri.
