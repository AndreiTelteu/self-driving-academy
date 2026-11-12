# 172 — învățare extinsă pentru urmărire și distanțe

Contractul `172-follow-estimator-v1` din
[`src/learning/follow-estimator.ts`](../../../src/learning/follow-estimator.ts) estimează cele patru
chei de urmărire ale politicii 171 — `cutin_brake_response` (raport), `closing_ttc_threshold` (s),
`leader_change_delay` (s) și `following_hysteresis` (m) — din episoade separate: cut-in, apropiere
reală, schimbare de lider fără cut-in și oscilație în bandă. Estimarea rămâne candidat-only: nu
publică profiluri, nu scrie în store, nu schimbă semantica 171 și nu modifică flagurile `implemented`
ale catalogului 092. Raportul determinist este [report.json](report.json), iar varianta umană
[report.md](report.md).

## Cum funcționează

Fiecare episod admis este o demonstrație în mod `LEARNING`, cu fereastră `PREFIX_ELIGIBLE` și
identitate 086/088 validă. Estimatorul nu reconstruiește urmărirea: inversează aritmetica deja
livrată de `171-follow-policy-v1`, folosind exact faptele pe care comanda politicii le raportează —
`bindingConstraint`, ținta cerută de 048, ținta commitată și identitatea liderului din starea
apelantului. Citește lista cheilor, frecvența de 60 Hz, podeaua de lider de 5 m și acoperirea
mecanică de 30 m/s direct din 171, iar intervalele și unitățile din registrul 092.

- `cutin_brake_response` se estimează numai dintr-un tick în care observația declară cut-in, 048 cere
  o reducere sub angajamentul anterior, iar 171 raportează `CUT_IN_BLEND`. Valoarea este fracțiunea
  aplicată din diferență: `(angajament − commitat) / (angajament − cerere)`.
- `closing_ttc_threshold` cere o apropiere reală (viteză de închidere pozitivă, decalaj peste podeaua
  de 5 m) în care plafonul leagă efectiv (`TTC_CAP`); valoarea este
  `(decalaj − 5 m) / (commitat − viteza liderului)`.
- `leader_change_delay` cere un lider nou apărut fără cut-in, cu o adopție care ar însemna accelerare.
  Numărul de tick-uri ținute este `ceil(întârziere · 60)`, deci valoarea raportată este mijlocul
  intervalului de jumătate de tick; o adopție imediată demonstrează un zero real, nu lipsă de dovezi.
- `following_hysteresis` cere o oscilație reală în jurul decalajului dorit al lui 048: eșantioanele
  ținute în bandă (`HYSTERESIS`) dau limita inferioară, iar cele care ies din ea (`FOLLOWING_TARGET`)
  dau limita superioară.

Incertitudinea primelor trei chei este eroarea standard a medianei aproximată prin MAD
(1,4826·MAD/√n), cu podea per cheie (0,02 ratio, 0,05 s, o jumătate de tick pentru întârziere);
histerezisul raportează jumătatea lățimii benzii dintre cea mai mare deviație ținută și cea mai mică
deviație ieșită. Pragurile sunt 0,15 ratio, 0,5 s, 0,1 s și 0,5 m; peste prag cheia rămâne
`UNOBSERVED` cu motivul `UNCERTAINTY_ABOVE_THRESHOLD`, iar incertitudinea măsurată rămâne în rezultat.

Împărțirea estimare/validare este explicită și deterministă: identitățile episoadelor sunt ordonate
după hash-ul seed-ului 172, iar fiecare al doilea episod merge în validare. Nicio identitate nu apare
în ambele seturi, iar pentru fiecare cheie `estimateEpisodes + validation.episodes` acoperă exact
setul cu valoare (2 + 2 în setul pozitiv).

## Tabelul cheie → episod → estimare → incertitudine → validare independentă

| Cheie | Episod | Estimare | Incertitudine | Prag | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `cutin_brake_response` | `CUT_IN` | 0,7000 ratio | ±0,0200 | 0,15 | `VALIDATED`, 2 episoade ținute deoparte, valoare 0,7000, eroare 0,0000 ≤ 0,1 |
| `closing_ttc_threshold` | `CLOSING_TTC` | 3,0000 s | ±0,0500 s | 0,5 s | `VALIDATED`, 2 episoade, valoare 3,0000, eroare 0,0000 ≤ 0,5 |
| `leader_change_delay` | `LEADER_CHANGE` | 0,1917 s | ±0,0083 s | 0,1 s | `VALIDATED`, 2 episoade, valoare 0,1917, eroare 0,0000 ≤ 0,05 |
| `following_hysteresis` | `HYSTERESIS` | 1,0000 m | ±0,2000 m | 0,5 m | `VALIDATED`, 2 episoade, valoare 1,0000, eroare 0,0000 ≤ 0,2 |

Fixturile sunt sintetice și deterministe, dar nu sunt scrise de mână: fiecare episod este produs
prin rularea stratului 171 real cu un set de chei cunoscut, iar estimatorul inversează exact
comanda rezultată. Ele dovedesc contractul de context, incertitudine, split și refuz, nu calibrarea
finală pe date reale.

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `cutin_brake_response` | cut-in fără reducere oferită de 048 | `UNOBSERVED`, valoare `null` | `CUT_IN_WITHOUT_REDUCTION` | `CUT_IN_WITHOUT_REDUCTION`×4 |
| `cutin_brake_response` | patru reacții reale, dar împrăștiate (0,1–1) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,4599 > 0,15) | — |
| `closing_ttc_threshold` | apropiere reală fără plafon activ | `UNOBSERVED`, valoare `null` | `TTC_CAP_NOT_BOUND` | `TTC_CAP_NOT_BOUND`×4 |
| `leader_change_delay` | ținere tăiată de fereastra de dovezi | `UNOBSERVED`, valoare `null` | `LEADER_HOLD_CENSORED` | `LEADER_HOLD_CENSORED`×4 |
| `leader_change_delay` | ținere întreruptă de o frânare | `UNOBSERVED`, valoare `null` | `LEADER_HOLD_INTERRUPTED_BY_REDUCTION` | `LEADER_HOLD_INTERRUPTED_BY_REDUCTION`×4 |
| `leader_change_delay` | întârzieri reale, dar împrăștiate (0–2 s) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,3230 s > 0,1) | — |
| `following_hysteresis` | bandă depășită, dar nicio ieșire observată | `UNOBSERVED`, valoare `null` | `HYSTERESIS_UPPER_BOUND_UNOBSERVED` | `HYSTERESIS_UPPER_BOUND_UNOBSERVED`×4 |
| `following_hysteresis` | oscilație doar deasupra decalajului dorit | `UNOBSERVED`, valoare `null` | `NO_BAND_OSCILLATION` | `NO_BAND_OSCILLATION`×4 |
| `following_hysteresis` | două benzi incompatibile (ținut 1,4 m, ieșit 0,9 m) | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_BAND_BOUNDS` | — |
| `cutin_brake_response` | demonstrații `MANUAL` | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |
| `closing_ttc_threshold` | set fără episoade | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |

Un zero demonstrat rămâne distinct de „fără dovezi”: patru schimbări de lider adoptate fără
întârziere produc `CANDIDATE` cu valoarea `0` și validare `VALIDATED`, nu `UNOBSERVED`.

O intrare malformată (viteză `NaN`, fapte de lider incomplete, binding necunoscut, seed negativ)
este refuzată cu excepție. Un episod `MANUAL` este raportat `NOT_LEARNING_ELIGIBLE`, iar aceeași
identitate de episod de două ori este raportată `DUPLICATE_EPISODE`; niciuna nu produce valoare.

## Constrângeri de grup

1. `CUT_IN_AND_TTC_SHARE_BRAKE` — cut-in-ul și plafonul timpului până la contact împart aceeași
   frânare: pe un tick de cut-in, 171 aplică reacția și apoi plafonul peste ea, deci aceeași
   reducere poate fi explicată de oricare dintre chei. Un episod de cut-in nu este admis la
   măsurarea pragului TTC, iar un episod TTC nu declară cut-in.
2. `HYSTERESIS_DEPENDS_ON_GAP_BAND` — histerezisul este identificabil numai față de banda de decalaj a
   lui 048. O singură latură a benzii este o limită, nu o valoare; fără o oscilație reală, banda nu se
   separă de câștigul de viteză al lui 048.
3. `LEADER_CHANGE_REQUIRES_NO_CUT_IN` — întârzierea se măsoară doar la un lider nou apărut fără
   cut-in; 171 adoptă cut-in-ul imediat și adoptă pe loc orice reducere, deci un astfel de episod nu
   poate dovedi întârzierea.
4. `FOLLOW_KEYS_FROM_ONE_TRAJECTORY` — cele patru chei pot apărea în aceeași călătorie, dar nu din
   aceleași fapte: un set cu un singur tip de fapt lasă celelalte trei chei neobservate.

## Compatibilitate cu 171 și catalogul 092

Cele patru valori candidate sunt în intervalele catalogului (ratio 0–1, prag 0,3–8 s, întârziere
0–2 s, histerezis 0–5 m), cu unitatea reală a registrului și fără clampare. Trecute prin
`compileFollowPolicyProfile` și `evaluateFollowPolicy`, politica 171 citește exact aceste valori:

- ținta commitată pe episodul de cut-in este **7,9500 m/s** (așteptat 7,9500, din angajamentul 16 m/s
  și cererea 048 de 4,5 m/s);
- plafonul de contact pe episodul de apropiere este **22,3333 m/s** (așteptat 22,3333, din
  `vitezaLider + (decalaj − 5) / prag` cu lider la 4 m/s și decalaj 60 m);
- liderul nou este ținut exact **12 tick-uri** pentru valoarea 0,1917 s (`ceil(0,1917 · 60)` = 12);
- histerezisul ține la o deviație de 0,8 m și nu ține la 1,2 m, deci banda estimată de 1 m este
  citită fără schimbare de semantică.

Niciun fișier din `src/autonomy` nu a fost editat; semantica 171 rămâne neschimbată.

## Determinism

Aceleași episoade și seed 172 produc aceeași estimare, aceeași împărțire și aceleași refuzuri.
Amprenta rezultatului este `fnv1a32:3e8addc1`, identică la a doua rulare. Nu există ceas,
aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`, 0 erori |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (375 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/follow-estimator.test.ts` | 13 teste, 13 PASS, 0 fail |
| `npm test` | 3016 teste, 3016 PASS, 0 fail |
| `npm run follow:learning` | 22/22 verificări PASS, raport scris |
| `npm run follow:learning -- --check` | `report.json` și `report.md` actuale |

## Fișiere atinse

- `src/learning/follow-estimator.ts` — contractul `172-follow-estimator-v1`.
- `src/learning/index.ts` — export adăugat la finalul listei (append-only).
- `tests/learning/follow-estimator.test.ts`, `tests/learning/follow-estimator-reference.ts`,
  `tests/learning/follow-estimator-report.ts` — teste, fixturi produse de stratul 171 real și
  oracolul raportului.
- `scripts/run-v2-follow-learning-report.mjs`, `package.json` — raportul determinist
  `follow:learning`, adăugat ca ultima intrare din blocul `scripts`.
- `Docs/10-invatarea-stilului.md` — secțiunea contractului, la final.
- `Docs/Evidence/172-v2-follow-learning/` — acest document, `report.json`, `report.md`.

## Limitări

- Fixturile sunt sintetice și deterministe, produse prin stratul 171 real. Conectarea la o captură
  reală de telemetrie cere un adaptor care să furnizeze faptele comenzii 171 (`bindingConstraint`,
  cererea 048, commitatul, identitatea liderului) din 086–089; estimatorul nu pretinde calibrare pe
  date reale.
- Pragurile de incertitudine, numărul minim de episoade și toleranțele de validare sunt inițiale,
  documentate în `FOLLOW_ESTIMATOR_LIMITS`; ele trebuie revizuite pe date reale înainte de activarea
  învățării pentru aceste chei.
- Catalogul 092 rămâne fail-closed: cele patru chei R au încă `implemented: false`, deci estimările
  sunt candidate și nu pot deveni `LEARNED` sau `MANUAL_TUNING` prin acest contract.
- Întârzierea este cuantizată de politica 171 la `ceil(întârziere · 60)`; estimatorul raportează
  mijlocul intervalului de jumătate de tick și folosește aceeași jumătate de tick ca podea de
  incertitudine. O valoare exactă sub 1/120 s nu este identificabilă din această politică.
- Histerezisul este identificabil numai când decalajul oscilează efectiv în ambele sensuri; o bandă
  ținută pe o singură parte rămâne neobservată, conform politicii „nu inventa o valoare”.
- Ca și 171, estimatorul este un contract neexecutat încă în bucla live de simulare; montarea lui în
  pipeline-ul de învățare și proba de browser rămân pași separați.
