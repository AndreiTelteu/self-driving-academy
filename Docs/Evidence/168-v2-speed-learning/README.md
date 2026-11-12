# 168 — învățare extinsă pentru viteză și ritm

Contractul `168-tempo-estimator-v1` din [`src/learning/tempo-estimator.ts`](../../../src/learning/tempo-estimator.ts)
estimează cele patru chei de tempo ale politicii 167 și păstrează separat variația ritmului,
deadband-ul, bonusul de depășire și constrângerile traficului. Estimarea rămâne candidat-only: nu
publică profiluri, nu scrie în store, nu schimbă semantica 167 și nu modifică flagurile `implemented`
ale catalogului 092. Raportul determinist este [report.json](report.json), iar varianta umană
[report.md](report.md).

## Cum funcționează

Fiecare episod admis este un fapt demonstrat în mod `LEARNING`, cu fereastră `PREFIX_ELIGIBLE` și
identitate 086/088 validă. Estimatorul citește lista cheilor și intervalul fiecăreia direct de la 167
și de la registrul 092, iar probele sunt filtrate cu exact anvelopa de trafic a politicii
(`speedPolicyTrafficLimitMps`): o probă la mai puțin de 0,5 m/s sub anvelopă este dominată de trafic,
nu de stil.

- `speed_delta_arterial` se estimează numai din probe arteriale `FREE_TRAFFIC`/`ELIGIBLE` fără lider,
  ca mediană pe episod a diferenței viteză − limita postată.
- `cruise_speed_variability` cere cicluri de croazieră complete de minimum 600 tick-uri, fără
  depășiri și fără lider; intervalul robust p10–p90 se împarte la 1,902, cât acoperă un ciclu sinusoidal
  complet, ca rezultatul să fie amplitudinea undei 167.
- `overtake_speed_bonus` compară viteza probelor de depășire reală, neconstrânse de trafic, cu linia
  de croazieră a aceluiași episod.
- `cruise_accel_deadband` se estimează dintr-un interval de pași de țintă: cel mai mare pas ținut dă
  limita inferioară, cel mai mic pas mișcat dă limita superioară, iar valoarea este mijlocul
  intervalului. Dispersia de croazieră nu este folosită niciodată pentru deadband.

Incertitudinea cheilor continue este eroarea standard a medianei aproximată prin MAD
(1,4826·MAD/√n), cu podea per cheie; la deadband este jumătate din lățimea intervalului de limite.
Pragurile sunt 1 m/s (arterial), 0,5 m/s (variabilitate), 1,5 m/s (bonus) și 0,4 m/s (deadband).
Peste prag cheia rămâne `UNOBSERVED`, cu incertitudinea măsurată păstrată în rezultat.

Împărțirea estimare/validare este explicită și deterministă: identitățile episoadelor sunt ordonate
după hash-ul seed-ului 168, iar fiecare al doilea episod merge în validare. Nicio identitate nu apare
în ambele seturi.

## Tabelul cheie → context → estimare → incertitudine → validare independentă

| Cheie | Context eligibil | Estimare | Incertitudine | Prag | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `speed_delta_arterial` | probe arteriale `FREE_TRAFFIC`/`ELIGIBLE` fără lider, viteză − limita postată | 4,075 m/s | ±0,100 m/s | 1 m/s | `VALIDATED`, 2 episoade ținute deoparte, valoare 3,950 m/s, eroare 0,125 m/s |
| `cruise_speed_variability` | cicluri de croazieră `FREE_TRAFFIC`/`ELIGIBLE` de minimum 600 tick-uri, fără depășiri și fără lider | 1,200 m/s | ±0,050 m/s | 0,5 m/s | `VALIDATED`, 2 episoade, valoare 1,200 m/s, eroare 0,000 m/s |
| `overtake_speed_bonus` | depășiri reale, neconstrânse de trafic, față de linia de croazieră a episodului | 2,000 m/s | ±0,200 m/s | 1,5 m/s | `VALIDATED`, 2 episoade, valoare 2,000 m/s, eroare 0,000 m/s |
| `cruise_accel_deadband` | pași de țintă ținuți (limită inferioară) și mișcați (limită superioară) | 0,325 m/s | ±0,075 m/s | 0,4 m/s | `VALIDATED`, 2 episoade ținute deoparte, toți cei 4 pași sunt consistenți cu intervalul |

Fixturile sunt sintetice și deterministe, nu capturi reale: ele dovedesc contractul de context,
incertitudine, split și refuz, nu calibrarea finală. Valorile reale ale raportului sunt în
[report.json](report.json).

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `speed_delta_arterial` | probe arteriale plafonate de un lider lent | `UNOBSERVED`, valoare `null` | `TRAFFIC_DOMINATED` | `TRAFFIC_CONSTRAINED` ×3 |
| `cruise_speed_variability` | porțiuni de croazieră mai scurte de 600 tick-uri | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | `SHORT_CRUISE_CYCLE` ×3 |
| `overtake_speed_bonus` | depășiri la anvelopa de trafic 167 | `UNOBSERVED`, valoare `null` | `TRAFFIC_DOMINATED` | `TRAFFIC_DOMINATED` ×2 |
| `cruise_accel_deadband` | banda ține toți pașii observați | `UNOBSERVED`, valoare `null` | `DEADBAND_UPPER_BOUND_UNOBSERVED` | — |
| `cruise_accel_deadband` | un pas ținut de 0,5 m/s și unul mișcat de 0,3 m/s | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_STEP_BOUNDS` | — |

O intrare malformată (viteză `NaN`, fapte de lider incomplete, seed negativ) este refuzată cu
excepție. Un episod `MANUAL` este raportat `NOT_LEARNING_ELIGIBLE`, iar aceeași identitate de episod
de două ori este raportată `DUPLICATE_EPISODE`; niciuna nu produce valoare.

## Constrângeri de grup

1. `CRUISE_DISPERSION_SHARED` — variabilitatea și deadband-ul acționează asupra aceleiași serii de
   viteză. Dispersia de croazieră poate fi explicată fie de unda de ritm, fie de o bandă care o
   filtrează, deci deadband-ul se estimează doar din pași de țintă. Un set doar cu croazieră produce
   variabilitate și lasă deadband-ul `NO_TARGET_STEPS`.
2. `OVERTAKE_ADVANTAGE_UNDER_LEAD` — avantajul de viteză este bonus numai când liderul nu plafonează
   viteza; depășirile la anvelopă sunt excluse.
3. `ARTERIAL_DELTA_UNDER_LEAD` — delta arterială cere trafic liber; probele arteriale cu lider sunt
   plafonate și nu devin preferință.
4. `TEMPO_FROM_ONE_TRAJECTORY` — cele patru chei pot apărea în aceeași călătorie, dar nu din aceleași
   fapte; un singur tip de fapt lasă celelalte chei neobservate.

## Compatibilitate cu 167 și catalogul 092

Cele patru valori candidate sunt în intervalele catalogului (arterial −10–20 m/s, variabilitate
0–3 m/s, bonus 0–10 m/s, deadband 0,05–2 m/s), cu unitatea `m/s` și fără clampare. Trecute prin
`compileSpeedPolicyProfile` și `evaluateSpeedPolicy`, politica 167 citește exact aceste valori:
pentru limita postată de 13,9 m/s și delta 4,075 m/s, baza și plafonul de stil sunt 17,975 m/s,
deadband-ul este 0,325 m/s, iar commit-ul rămâne sub plafon (16,808 m/s la tick-ul de probă, din cauza
fazei undei de variabilitate). Semantica 167 nu este modificată; singura schimbare în acel fișier este
exportarea formulei de anvelopă de trafic pentru reutilizare.

## Determinism

Aceleași episoade și seed 168 produc aceeași estimare, aceeași împărțire și aceleași refuzuri.
Amprenta rezultatului este `fnv1a32:60f0a4cf`, identică la a doua rulare. Nu există ceas, aleatorism
ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`, 0 erori |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (371 fișiere TypeScript) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/tempo-estimator.test.ts` | 8 teste, 8 PASS, 0 fail |
| `npm test` | 2973 teste, 2973 PASS, 0 fail |
| `npm run speed:learning` | 19/19 verificări PASS, raport scris |
| `npm run speed:learning -- --check` | `report.json` și `report.md` actuale |

## Fișiere atinse

- `src/learning/tempo-estimator.ts` — contractul `168-tempo-estimator-v1`.
- `src/learning/index.ts` — export adăugat la finalul listei (append-only).
- `src/autonomy/speed-policy.ts` — export pentru `speedPolicyTrafficLimitMps`, fără schimbare de semantică.
- `tests/learning/tempo-estimator.test.ts`, `tests/learning/tempo-estimator-reference.ts`,
  `tests/learning/tempo-estimator-report.ts` — teste, fixturi și oracolul raportului.
- `scripts/run-v2-speed-learning-report.mjs`, `package.json` — raportul determinist `speed:learning`.
- `Docs/10-invatarea-stilului.md` — secțiunea contractului, la final.
- `Docs/Evidence/168-v2-speed-learning/` — acest document, `report.json`, `report.md`.

## Limitări

- Fixturile sunt sintetice și deterministe; conectarea la o captură reală de telemetrie cere un
  adaptor care să producă faptele de tempo (probe de viteză, pași de țintă, flag de depășire) din
  086–089. Estimatorul nu pretinde calibrare pe date reale.
- Pragurile de incertitudine, numărul minim de episoade și toleranțele de validare sunt inițiale,
  documentate în `TEMPO_ESTIMATOR_LIMITS`; ele trebuie revizuite pe date reale înainte de activarea
  învățării pentru aceste chei.
- Catalogul 092 rămâne fail-closed: cele patru chei R au încă `implemented: false`, deci estimările
  sunt candidate și nu pot deveni `LEARNED` sau `MANUAL_TUNING` prin acest contract.
- Deadband-ul este identificabil doar când există atât pași ținuți, cât și pași mișcați; o bandă mare
  sau un stil foarte constant lasă cheia neobservată, conform politicii „nu inventa o valoare”.
