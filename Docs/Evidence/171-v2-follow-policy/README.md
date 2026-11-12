# 171 — politică extinsă pentru urmărire și distanțe

Contractul `171-follow-policy-v1` din [`src/autonomy/follow-policy.ts`](../../../src/autonomy/follow-policy.ts)
activează cele patru chei R ale categoriei „Urmărire și distanțe” ca strat de politică peste
rezultatul livrat de 048: `cutin_brake_response` (ratio), `closing_ttc_threshold` (s),
`leader_change_delay` (s) și `following_hysteresis` (m). Raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare tick primește exact rezultatul `048-following-v1` (cu ținta 046 pe care o poartă) și întoarce
o comandă înghețată cu ținta commitată, episodul activ, constrângerea care a decis-o și starea pentru
tick-ul următor. Stratul nu recalculează urmărirea: preferința 048 rămâne ținta sigură a fiecărui
episod. Valorile, unitățile și proveniența celor patru chei se citesc prin
`parsePublishableDrivingProfile`, deci intervalele rămân exact cele ale catalogului 092:
`cutin_brake_response` 0–1 ratio, `closing_ttc_threshold` 0,3–8 s, `leader_change_delay` 0–2 s,
`following_hysteresis` 0–5 m. Catalogul nu este modificat.

- `cutin_brake_response` coboară ținta commitată spre preferința 048 cu acea fracțiune din diferența
  față de angajamentul anterior, pe tick-ul în care observația declară `cutIn`. 0 înseamnă nicio
  reacție (angajamentul anterior este ținut), 1 înseamnă exact ținta 048.
- `closing_ttc_threshold` plafonează ținta la `vitezaLiderului + (decalaj − 5 m) / prag` cât timp
  există viteză de apropiere, deci marja rămasă până la podeaua de 5 m durează cel puțin pragul.
- `leader_change_delay` ține angajamentul anterior `ceil(întârziere · 60)` tick-uri când un lider nou
  apare fără cut-in și adopția ar însemna accelerare; o reducere se adoptă pe loc.
- `following_hysteresis` ține angajamentul anterior cât timp `|decalaj − decalajDorit|` rămâne sub
  toleranță, deci comanda nu oscilează cu decalajul.

**Episoade separate.** Cut-in-ul este declarat de observație și este adoptat imediat, deci cheia de
întârziere nu îl poate amâna; schimbarea de lider fără cut-in este singurul episod al întârzierii;
plafonul de contact acționează numai cu viteză de apropiere; histerezisul acționează numai în banda
din jurul decalajului dorit. Tabelul de separare are 12 perechi, câte trei chei inerte în fiecare
episod, și toate diferențele sunt 0,000 m/s.

**Siguranța.** Plafoanele se aplică după deciziile de stil: o cerere de oprire sau un lider în
interiorul podelei de 5 m comandă 0 m/s, indiferent de chei, iar plafonul timpului până la contact
este aplicat ultimul, peste cut-in și peste histerezis. Întârzierea de lider nu amână niciodată o
reducere și nu poate ridica ținta peste preferința 048; reacția de cut-in nu coboară niciodată sub
preferința 048; ținta commitată rămâne în `[0, 30]` m/s.

## Tabelul cheie → episod → valoare joasă → valoare ridicată → diferență

| Cheie | Episod | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `cutin_brake_response` | cut-in la 18 m, ego 15 m/s, angajament anterior 12 m/s | 0,2 | 9,940 m/s | 1 | 1,700 m/s | **−8,240 m/s** |
| `closing_ttc_threshold` | apropiere 6 m/s la 36 m de un lider de 8 m/s | 0,3 | 15,260 m/s | 8 | 11,875 m/s | **−3,385 m/s** |
| `leader_change_delay` | lider nou la 60 m și mai rapid, fără cut-in | 0 | tick 1 | 2 | tick 121 | **120 tick-uri** |
| `following_hysteresis` | decalaj oscilând ±2 m în jurul decalajului dorit, 12 tick-uri | 0 | variație 30,800 m/s | 5 | variație 0,000 m/s | **−30,800 m/s** |

Numerele suplimentare din raport: preferința 048 a episodului de cut-in este 1,700 m/s, iar reacția
0,2 dă 9,940 m/s; plafonul de contact este 111,333 m/s la pragul 0,3 s și 11,875 m/s la pragul 8 s,
cu preferința 048 de 15,260 m/s; noul lider este adoptat la tick-ul 1 cu întârziere 0 și la tick-ul
121 cu întârziere 2 (60 Hz); variația totală a comenzii scade de la 30,800 m/s la 0 când banda crește
de la 0 la 5 m.

## Separarea cheilor

| Cheie | Episod | Rezultat | Diferență |
| --- | --- | ---: | ---: |
| `closing_ttc_threshold` | cut-in | 4,790 m/s | 0,000 |
| `leader_change_delay` | cut-in | 4,790 m/s | 0,000 |
| `following_hysteresis` | cut-in | 4,790 m/s | 0,000 |
| `cutin_brake_response` | timp până la contact | 15,260 m/s | 0,000 |
| `leader_change_delay` | timp până la contact | 15,260 m/s | 0,000 |
| `following_hysteresis` | timp până la contact | 15,260 m/s | 0,000 |
| `cutin_brake_response` | schimbarea liderului | 16,000 m/s | 0,000 |
| `closing_ttc_threshold` | schimbarea liderului | 16,000 m/s | 0,000 |
| `following_hysteresis` | schimbarea liderului | 16,000 m/s | 0,000 |
| `cutin_brake_response` | histerezis | 10,000 m/s | 0,000 |
| `closing_ttc_threshold` | histerezis | 10,000 m/s | 0,000 |
| `leader_change_delay` | histerezis | 10,000 m/s | 0,000 |

## Siguranță: limitele 048 și podeaua de 5 m rămân dominante

| Verificare | Scenariu | Rezultat |
| --- | --- | ---: |
| oprire cerută | toate cheile la valoarea cea mai permisivă | 0,000 m/s, `STOP_REQUIRED` |
| lider la 3 m | toate cheile la valoarea cea mai permisivă | 0,000 m/s, `CONTACT_FLOOR` |
| marja de contact | prag 8 s, 1 m în afara podelei | 0,125 m/s, marjă 8,000 s |
| confort la pragul maxim | 12 m/s la 40 m cu lider oprit | plafon 4,375 m/s, 1,784 m/s² ≤ `comfort_deceleration` 2 m/s² |
| reducere în timpul ținerii | întârziere 2 s, lider nou care frânează | 3,700 m/s adoptat imediat, 0 tick-uri rămase |
| cut-in la reacție maximă | prag 8 s, reacție 0 vs 1 | 9,625 m/s vs 1,700 m/s, exact preferința 048 |

## Compatibilitate cu cheile M

Un profil poartă simultan cheile M ale lui 046, cele patru chei M ale lui 047 și cele patru chei M
ale lui 048 (`following_time_headway` 1,8 s, `following_min_gap` 3 m, `queue_standstill_gap` 2 m,
`following_speed_gain` 0,7 1/s) plus cele patru chei 171. Stratul 048 real rulează 60 de tick-uri cu
cheile R neutre și cu ele active: **60/60 rezultate 048 identice** (țintă, motiv, lider, decalaj,
decalaj dorit). Cu cheile neutre (`cutin_brake_response` 1, prag 0,3 s, întârziere 0, histerezis 0),
stratul returnează **exact ținta 048 pe 60/60 tick-uri**; cu cheile active, **40 de tick-uri diferă**
doar în ținta commitată de 171, cu până la **4,200 m/s**.

Unitățile rămân cele ale catalogului: `cutin_brake_response` în ratio, `closing_ttc_threshold` și
`leader_change_delay` în s, `following_hysteresis` în m; cheile M păstrează m/s, s, m și 1/s.

## Determinism

Aceleași intrări și aceeași stare anterioară produc exact aceeași comandă. Seria de 6 tick-uri care
parcurge cele patru episoade are amprenta `fnv1a32:d746186b`, identică la o a doua rulare. Nu există
ceas, aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (374 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/follow-policy.test.ts` | 10 teste, 10 PASS, 0 fail |
| `npm test` | 3003 teste, 3003 PASS, 0 fail (88,1 s) |
| `npm run follow:policy` | 20/20 verificări PASS, raport scris |
| `npm run follow:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), inerția fiecărei chei în
celelalte trei episoade, plafonul de contact și marja lui, dominanța opririi și a podelei de 5 m,
adoptarea imediată a reducerilor, limita reacției de cut-in la preferința 048, compatibilitatea M pe
stratul 048 real, refuzul valorilor din afara intervalului și al unității greșite, refuzul profilului
incomplet, diagnosticile pentru profil/observație/rezultat străin sau vechi, determinismul și
înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/follow-policy.ts` — contractul `171-follow-policy-v1`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/follow-policy-reference.ts`, `tests/autonomy/follow-policy.test.ts`,
  `tests/autonomy/follow-policy-report.ts` — fixture-uri, teste și oracolul raportului.
- `scripts/run-v2-follow-policy-report.mjs`, `package.json` — raportul determinist `follow:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/171-v2-follow-policy/` — acest document, `report.json`, `report.md`.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele patru chei au încă `implemented: false`, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI-urile de învățare și la actualizarea registrului.
- Ca și 046/047/048/167/169, stratul este un contract de politică neexecutat încă în bucla live de
  simulare; montarea lui în compoziție și proba de browser rămân pași separați.
- Cut-in-ul și identitatea liderului vin din observație: stratul nu face percepție. Lumea trebuie să
  declare interpunerea, exact ca `stopRequired`/`overtaking` la 167, iar observația trebuie să
  descrie același lider și același decalaj ca rezultatul 048, altfel este refuzată.
- Configurația „neutră” este cea mai permisivă valoare admisă a fiecărei chei (prag 0,3 s), nu o
  identitate absolută: plafonul de contact rămâne finit, dar nu se activează în scena de integrare.
- Histerezisul poate ține angajamentul anterior peste preferința 048 cu cel mult banda de toleranță
  (maximum 5 m de eroare de decalaj), mărginită de plafonul de contact și de podeaua de 5 m.
- Podeaua de 5 m este o constantă de politică documentată în contract (aceeași ca la 167/169), nu o
  cheie de catalog.
