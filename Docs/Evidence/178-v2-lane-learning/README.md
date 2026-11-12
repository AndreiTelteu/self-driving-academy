# 178 — învățare extinsă pentru schimbare de bandă și depășire

Contractul `178-lane-estimator-v2` din
[`src/learning/lane-v2-estimator.ts`](../../../src/learning/lane-v2-estimator.ts)
estimează cele patru chei R ale politicii 177 — `lane_change_duration` (s), `signal_lead_time` (s),
`signal_use_probability` (probabilitate) și `pass_on_right_probability` (probabilitate) — din patru
scenarii separate: durata mișcării laterale, avansul de semnalizare, folosirea indicatorului pe
oportunitate și depășirea prin dreapta. Estimarea rămâne candidat-only: nu publică profiluri, nu
scrie în store, nu schimbă semantica 177 și nu modifică flagurile `implemented` ale catalogului 092.
Raportul determinist este [report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare episod admis este o demonstrație în mod `LEARNING`, cu fereastră `PREFIX_ELIGIBLE` și
identitate 086/088 validă. Estimatorul nu reconstruiește manevra: inversează aritmetica deja livrată
de `177-lane-policy-v2`, folosind exact faptele pe care comanda politicii le raportează — motivul
177, durata efectivă și progresul lateral observat, zăvorul indicatorului și tick-ul de pornire a
manevrei, rezultatul eșantionului `signal-use` per oportunitate, eșantionul `pass-on-right` și
rezultatul lui — plus cheile M ale rezultatului `053-lane-change-v1` din același tick. Citește lista
cheilor, rata de 60 Hz și podeaua explicită de o secundă direct din 177, iar intervalele și unitățile
din registrul 092. Nicio valoare nu este citită din profilul care a produs demonstrația.

- `lane_change_duration` se măsoară numai dintr-o manevră în care progresul lateral este observat:
  durata efectivă `D = ceil(max(cheie, 1 s) · 60)` se inversează în `cheie ∈ ((D − 1)/60, D/60]`, iar
  valoarea raportată este mijlocul acelui interval. Podeaua explicită de 1 s face `D = 60` ambiguu
  pentru toată banda 0,5–1 s a catalogului, deci acele manevre sunt numărate, nu mediiate.
- `signal_lead_time` cere o manevră semnalizată care a pornit efectiv: numărul de tick-uri dintre
  pornirea indicatorului și prima mișcare laterală inversează același plafon, iar `L = 0` înseamnă
  exact `0 s`. Fără indicator manevra pornește în tick-ul validării, deci nu există avans de măsurat.
- `signal_use_probability` se măsoară pe oportunități distincte care au ajuns la decizia
  indicatorului: numitorul este numărul de oportunități, niciodată numărul de cadre, iar numărătorul
  este oportunitățile cu indicatorul pornit. Rata este pooled, iar incertitudinea este maximul dintre
  eroarea standard binomială și dispersia între episoadele cu suficiente oportunități pentru o rată
  proprie.
- `pass_on_right_probability` cere o oportunitate de depășire prin dreapta în care harta permite
  manevra și spațiul declarat acoperă pragul M `lane_change_front_gap`, deci 177 a extras eșantionul:
  acceptarea dovedește `cheie > eșantion`, refuzul dovedește `cheie ≤ eșantion`, iar estimarea este
  mijlocul intersecției.

Incertitudinea duratei și a avansului este eroarea standard a medianei aproximată prin MAD
(1,4826·MAD/√n), cu podea de 0,05 s; pentru depășirea prin dreapta este jumătatea lățimii
intersecției limitelor. Pragurile sunt 0,5 s, 0,5 s, 0,15 probabilitate și 0,15 probabilitate; peste
prag cheia rămâne `UNOBSERVED` cu motivul `UNCERTAINTY_ABOVE_THRESHOLD`, iar incertitudinea măsurată
rămâne în rezultat.

Împărțirea estimare/validare este explicită și deterministă: identitățile episoadelor sunt ordonate
după hash-ul seed-ului 178, iar fiecare al doilea episod merge în validare. Nicio identitate nu apare
în ambele seturi. Pentru durată și avans, valoarea de validare este mediana episoadelor ținute
deoparte; pentru rata indicatorului este rata pooled a oportunităților ținute deoparte; pentru
depășirea prin dreapta, limitele ținute deoparte trebuie să admită estimarea. Un set mai mic de două
episoade raportează `TOO_SMALL`.

## Tabelul cheie → scenariu → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Estimare | Incertitudine | Prag | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `lane_change_duration` | `MANOEUVRE_DURATION` | 1,9917 s | ±0,0500 s | 0,5 s | `VALIDATED`, 2 episoade ținute deoparte, valoare 1,9917, eroare 0,0000 ≤ 0,5 |
| `signal_lead_time` | `SIGNAL_LEAD` | 1,9917 s | ±0,0500 s | 0,5 s | `VALIDATED`, 2 episoade, valoare 1,9917, eroare 0,0000 ≤ 0,5 |
| `signal_use_probability` | `INDICATOR_USE` | 0,3846 probabilitate | ±0,0954 probabilitate | 0,15 probabilitate | `VALIDATED`, 8 episoade, valoare 0,4231, eroare 0,0385 ≤ 0,15 |
| `pass_on_right_probability` | `RIGHT_SIDE_PASS` | 0,3377 probabilitate | ±0,0880 probabilitate | 0,15 probabilitate | `VALIDATED`, 2 episoade, valoare 0,3377, eroare 0,0000 ≤ 0,15 |

Setul pozitiv are 16 episoade admise, împărțite 2+2, 3+2, 8+8 și 2+2 pe chei. Fixturile sunt
sintetice și deterministe, dar nu sunt scrise de mână: fiecare episod este produs prin rularea
straturilor `053-lane-change-v1` și `177-lane-policy-v2` reale cu un set de chei cunoscut, iar
estimatorul măsoară comanda rezultată. Ele dovedesc contractul de context, incertitudine, split și
refuz, nu calibrarea finală pe date reale.

Demonstrațiile pozitive folosesc un singur profil: durată 2 s, avans 2 s, indicator 0,4 și depășire
prin dreapta 0,3. Durata raportată este **1,9917 s**, mijlocul intervalului de inversare pentru cele
120 de tick-uri efective, nu cheia care a produs demonstrația; avansul este tot **1,9917 s** pentru
aceleași 120 tick-uri dintre indicator și prima mișcare. Indicatorul raportează **0,3846** pe cele 26
de oportunități distincte ale setului de estimare, iar depășirea prin dreapta raportează **0,3377**,
mijlocul intervalului dintre eșantioanele 0,2498 (acceptare) și 0,4257 (refuz).

## Cazuri fără dovezi identificabile

| Cheie | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `lane_change_duration` | manevre care ating podeaua de 1 s (chei 0,5–1 s) | `UNOBSERVED`, valoare `null` | `DURATION_FLOOR_SATURATED` | — |
| `lane_change_duration` | manevre care pretind simultan podeaua și o durată exactă | `UNOBSERVED`, valoare `null` | `DURATION_FLOOR_INCONSISTENT` | `DURATION_FLOOR_INCONSISTENT`×1 |
| `lane_change_duration` | durate reale împrăștiate între 1,5 și 4,5 s | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,6570 > 0,5) | — |
| `lane_change_duration` | demonstrații `MANUAL` | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |
| `signal_lead_time` | manevre fără indicator: avansul nu există | `UNOBSERVED`, valoare `null` | `SIGNAL_LEAD_WITHOUT_INDICATOR` | `SIGNAL_LEAD_WITHOUT_INDICATOR`×4 |
| `signal_lead_time` | manevre semnalizate a căror mișcare nu a pornit | `UNOBSERVED`, valoare `null` | `SIGNAL_LEAD_CENSORED` | `SIGNAL_LEAD_CENSORED`×4 |
| `signal_lead_time` | avansuri reale împrăștiate între 1,5 și 4,5 s | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,6570 > 0,5) | — |
| `signal_use_probability` | episoade contradictorii, fără indicator în unele și mereu în altele | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,6570 > 0,15) | — |
| `signal_use_probability` | prea puține oportunități distincte pentru o rată | `UNOBSERVED`, valoare `null` | `INDICATOR_TRIALS_BELOW_MINIMUM` | — |
| `pass_on_right_probability` | hartă care interzice, nu declară sau nu acoperă spațiul | `UNOBSERVED`, valoare `null` | `RIGHT_PASS_PRECONDITION` | `RIGHT_PASS_PRECONDITION`×4 |
| `pass_on_right_probability` | doar acceptări | `UNOBSERVED`, valoare `null` | `RIGHT_PASS_UPPER_BOUND_UNOBSERVED` | — |
| `pass_on_right_probability` | doar refuzuri | `UNOBSERVED`, valoare `null` | `RIGHT_PASS_LOWER_BOUND_UNOBSERVED` | — |
| `pass_on_right_probability` | acceptare peste un refuz | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_RIGHT_PASS_BOUNDS` | `CONTRADICTORY_RIGHT_PASS_BOUNDS`×4 |
| `pass_on_right_probability` | limită reală, dar prea largă (0,05–0,47) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,2088 > 0,15) | — |
| `pass_on_right_probability` | set fără episoade | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |

Un zero demonstrat rămâne distinct de „fără dovezi": un avans care pornește mișcarea în același tick
produce `CANDIDATE` cu valoarea `0` și validare `VALIDATED`, iar patruzeci de oportunități fără
niciun indicator produc tot `CANDIDATE` cu valoarea `0`. O intrare malformată (progres lateral `NaN`,
motiv necunoscut, tick invalid, seed negativ) este refuzată cu excepție. Un episod `MANUAL` este
raportat `NOT_LEARNING_ELIGIBLE`, o fereastră suprimată `NO_USABLE_PREFIX`, iar aceeași identitate de
episod de două ori `DUPLICATE_EPISODE`; niciuna nu produce valoare.

## Constrângeri de grup

1. `DURATION_FLOOR_HIDES_SUB_SECOND` — podeaua explicită `minimumManoeuvreDurationS = 1 s` face ca
   orice cheie din banda 0,5–1 s a catalogului să producă aceleași 60 de tick-uri: `D = 60` dovedește
   doar `cheie ≤ 1 s`, deci banda nu este identificabilă din comportament.
2. `MANOEUVRE_TIMELINE_SHARED` — avansul și durata sunt segmente ale aceleiași cronologii de tick-uri;
   o fereastră trunchiată înainte de pornire cenzează avansul, iar una tăiată în timpul mișcării
   cenzează durata.
3. `SIGNAL_LEAD_DEPENDS_ON_INDICATOR` — avansul există numai când indicatorul este folosit, iar cele
   două chei împart aceeași oportunitate: eșantionul `signal-use` decide indicatorul, iar avansul se
   numără numai după el. Niciuna nu se deduce din cealaltă.
4. `RIGHT_PASS_REFUSAL_PRECEDES_SAMPLE` — declarația de siguranță a lumii precede eșantionul: o
   depășire interzisă, o permisiune `UNKNOWN` sau un spațiu declarat sub `lane_change_front_gap`
   refuză manevra înainte de orice extragere, deci nu spune nimic despre probabilitate.
5. `LANE_KEYS_FROM_ONE_MANOEUVRE` — ordinea ramurilor 177 dă fiecărui tick un singur fapt: refuz 053,
   refuz de permisiune ori spațiu, eșantion de depășire prin dreapta, eșantion de indicator, avans de
   semnalizare sau progres lateral. Un set cu un singur tip de demonstrație lasă celelalte trei chei
   neobservate.

## Compatibilitate cu 177 și catalogul 092

Cele patru valori candidate sunt în intervalele catalogului (0,5–5 s, 0–5 s, 0–1 probabilitate, 0–1
probabilitate), cu unitatea reală a registrului și fără clampare. Trecute prin
`compileLanePolicyProfile` și `evaluateLanePolicyV2`, politica 177 citește exact aceste valori, fără
schimbare de semantică:

- durata estimated produce **120 de tick-uri** de mișcare laterală, cu progres **0,2500** după 30 de
  tick-uri (`CHANGE_WITHOUT_SIGNAL`); podeaua de 1 s dă 60 de tick-uri, iar plafonul de 5 s dă 300;
- avansul estimated ține mișcarea exact **120 de tick-uri** (`SIGNAL_LEAD` →
  `SIGNAL_LEAD_COMPLETE`), cu progres lateral **0** la pornire;
- indicatorul estimated pornește indicatorul la eșantionul **0,3248** și îl lasă oprit la **0,5529**;
- depășirea prin dreapta estimated acceptă eșantionul **0,2498** (`CHANGE_WITHOUT_SIGNAL`, granted) și
  refuză eșantionul **0,4257** (`RIGHT_OVERTAKE_REFUSED`).

Niciun fișier din `src/autonomy` nu a fost editat; semantica 177 rămâne neschimbată, iar cheile M
(`lane_change_front_gap`, `lane_change_back_gap`, `lane_change_speed_gain`, `lane_change_cooldown`)
sunt doar citite, niciodată estimate aici.

## Determinism

Aceleași episoade și seed 178 produc aceeași estimare, aceeași împărțire și aceleași refuzuri.
Amprenta rezultatului este `fnv1a32:61224c01`, identică la a doua rulare. Nu există ceas, aleatorism
ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`, 0 erori |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (381 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/lane-v2-estimator.test.ts` | 13 teste, 13 PASS, 0 fail |
| `npm test` | 3087 teste, 3087 PASS, 0 fail |
| `npm run lane:learning` | 24/24 verificări PASS, 4 chei candidate, 15 demonstrații neobservate, raport scris |
| `npm run lane:learning -- --check` | `report.json` și `report.md` actuale |

## Fișiere atinse

- `src/learning/lane-v2-estimator.ts` — contractul `178-lane-estimator-v2`.
- `src/learning/index.ts` — export adăugat la finalul listei (append-only).
- `tests/learning/lane-v2-estimator.test.ts`, `tests/learning/lane-v2-estimator-reference.ts`,
  `tests/learning/lane-v2-estimator-report.ts` — teste, fixturi produse de straturile 053/177 reale și
  oracolul raportului.
- `scripts/run-v2-lane-learning-report.mjs`, `package.json` — raportul determinist `lane:learning`,
  adăugat ca ultima intrare din blocul `scripts`.
- `Docs/10-invatarea-stilului.md` — secțiunea contractului, la final.
- `Docs/Evidence/178-v2-lane-learning/` — acest document, `report.json`, `report.md`.

## Limitări

- Fixturile sunt sintetice și deterministe, produse prin straturile 053/177 reale. Conectarea la o
  captură reală de telemetrie cere un adaptor care să furnizeze faptele comenzii 177 (motiv, durata
  efectivă și progresul lateral, zăvorul indicatorului și tick-ul de pornire, rezultatul eșantionului
  `signal-use`, eșantionul `pass-on-right` și rezultatul lui) plus cheile M din 053; estimatorul nu
  pretinde calibrare pe date reale.
- `lane_change_duration` este identificabilă numai peste podeaua de 1 s a lui 177: banda 0,5–1 s a
  catalogului produce aceleași 60 de tick-uri pentru orice cheie și rămâne neobservată. Valorile
  raportate sunt mijlocul intervalului de inversare `((D − 1)/60, D/60]`, cu o eroare de cel mult
  jumătate de tick față de cheia care a produs demonstrația.
- `signal_lead_time` este identificabilă numai din manevre semnalizate care pornesc efectiv; un avans
  întrerupt, o manevră abandonată în timpul avansului ori un segment fără indicator lasă cheia
  neobservată cu motiv explicit.
- `signal_use_probability` este o rată pe oportunități, nu o calibrare a eșantionului: incertitudinea
  binomială domină la puține oportunități, iar pragul de 0,15 cere dovezi consistente înainte ca rata
  să devină candidat.
- `pass_on_right_probability` este identificabilă numai ca interval între eșantioanele acceptate și
  refuzate; o singură latură rămâne o limită, iar un interval mai lat de 0,3 rămâne sub pragul de
  incertitudine. Un zero demonstrat pentru această cheie ar cere un eșantion egal cu 0, pe care fluxul
  determinist al oportunitații nu îl produce, deci refuzurile pure rămân o limită superioară.
- Pragurile de incertitudine, numărul minim de episoade și oportunități și toleranțele de validare
  sunt inițiale, documentate în `LANE_V2_ESTIMATOR_LIMITS`; ele trebuie revizuite pe date reale
  înainte de activarea învățării pentru aceste chei.
- Catalogul 092 rămâne fail-closed: cele patru chei R au încă `implemented: false`, deci estimările
  sunt candidate și nu pot deveni `LEARNED` sau `MANUAL_TUNING` prin acest contract.
- Estimatorul este un contract neexecutat încă în bucla live de simulare; montarea lui în pipeline-ul
  de învățare și proba de browser rămân pași separați.
