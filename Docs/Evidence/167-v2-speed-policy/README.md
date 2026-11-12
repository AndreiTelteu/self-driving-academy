# 167 — politică extinsă pentru viteză și ritm

Contractul `167-speed-policy-v1` din [`src/autonomy/speed-policy.ts`](../../../src/autonomy/speed-policy.ts)
activează cele patru chei R de tempo ca strat de politică peste rezultatul livrat de 046 (țintă de
viteză), 047 (control longitudinal) și 048 (urmărire). Raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare tick produce o comandă înghețată cu ținta commitată, cererea de accelerație și constrângerea
care a limitat rezultatul. Valorile, unitățile și proveniența celor patru chei se citesc prin
`parsePublishableDrivingProfile`, deci intervalul și unitatea rămân exact cele ale catalogului 092;
catalogul nu este modificat.

- `speed_delta_arterial` (m/s) este o cheie de stil, de aceeași clasă cu delta urbană/rezidențială:
  pe un drum `ARTERIAL` ținta de drum este limita postată plus delta, iar consecința este raportată
  ca `postedDeviationMps`. Pe drumurile urbane/rezidențiale cheia nu are efect, pentru că acolo ținta
  vine din 046.
- `cruise_speed_variability` (m/s) este amplitudinea unei unde deterministe în jurul țintei de stil:
  faza derivă din seed-ul explicit și din identitatea actorului, unda urmează tick-ul autoritar, iar
  o perioadă completă durează 600 de tick-uri (10 s la 60 Hz).
- `overtake_speed_bonus` (m/s) se aplică numai când observația declară o depășire în curs.
- `cruise_accel_deadband` (m/s) ține ținta commitată cât timp diferența față de valoarea cerută
  rămâne în bandă și transformă eroarea de urmărire sub bandă în `HOLD`.

**Separarea de trafic.** Cheile de tempo nu pot depăși bugetul de stil
(`styleCeilingMps = min(max(țintaDeStil, limitaPostată), 30)`), iar peste ele se aplică o anvelopă
dură calculată independent de chei: semaforul cere 0, curba și apropierea păstrează plafoanele 046,
iar traficul impune `leadSpeed + (gap − 5 m) / 2 s` și comandă 0 m/s în interiorul a 5 m. Commit-ul
este mereu limitat la anvelopă, deci deadband-ul nu poate întârzia o frânare cerută de semafor.

## Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `speed_delta_arterial` | arterial, limită postată 13,9 m/s, fără lider, tempo neutru | -10 | 3,90 m/s | 20 | 30,00 m/s | **26,10 m/s** |
| `cruise_speed_variability` | țintă urbană 10,9 m/s, 600 tick-uri, deadband 0,05 m/s | 0,3 | amplitudine 0,57 m/s | 3 | amplitudine 5,94 m/s | **5,38 m/s** |
| `overtake_speed_bonus` | țintă urbană 10,9 m/s, depășire observată | 0 | 10,90 m/s | 2 | 12,90 m/s | **2,00 m/s** |
| `cruise_accel_deadband` | țintă 10,9 m/s, viteză 9,6 m/s, commit anterior 10,5 m/s | 0,05 | 10,90 m/s, `ACCELERATE` | 2 | 10,50 m/s, `HOLD` | **0,40 m/s** |

Amplitudinea de variație este peak-to-peak-ul țintei commitate: 22 de schimbări la 0,3 m/s față de
199 de schimbări la 3 m/s, cu maximul 13,87 m/s sub limita postată de 13,9 m/s. Bonusul de 10 m/s
saturează la 13,90 m/s (limita legală), iar fără depășire cheia rămâne 10,90 m/s.

## Separarea de constrângerile traficului

| Constrângere | Scenariu | Cheie minimă | Cheie maximă | Diferență |
| --- | --- | ---: | ---: | ---: |
| spațiu trafic | lider 9 m/s, 8 m spațiu | 10,50 m/s | 10,50 m/s | 0,00 |
| spațiu trafic | lider 9 m/s, 3 m (sub minimul de 5 m) | 0,00 m/s | 0,00 m/s | 0,00 |
| semafor | oprire cerută, commit anterior 12 m/s, deadband 2 m/s | 0,00 m/s | 0,00 m/s | 0,00 |
| curbă | preferință 046 de 8 m/s | 8,00 m/s | 8,00 m/s | 0,00 |
| plafon legal | țintă 10,9 m/s, postată 13,9 m/s, bonus maxim | 10,90 m/s | 13,90 m/s | 3,00 |

## Compatibilitate cu cheile M

Un profil poartă simultan cele patru chei M ale lui 046 și cele patru chei de tempo. Ținta 046 este
**10 m/s** cu cheile 167 neutre și tot **10 m/s** cu cheile 167 active (arterial 20, variabilitate 3,
bonus 10, deadband 2), deci 046 citește doar cheile lui. Unitățile rămân `m/s` pentru toate cele opt
chei, cu excepția `curve_lateral_accel` (`m/s²`). Cu cheile de tempo neutre, stratul 167 returnează
exact ținta 046 (10 m/s) și aceeași consecință de stil (`postedDeviationMps`).

## Determinism

Aceleași intrări, seed și tick produc exact aceeași comandă. Seria de 60 de tick-uri cu seed 7 are
amprenta `fnv1a32:6a605666`, identică la o a doua rulare. Nu există ceas, aleatorism ascuns sau
istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (370 fișiere TypeScript) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/speed-policy.test.ts` | 9 teste, 9 PASS, 0 fail |
| `npm test` | 2965 teste, 2965 PASS, 0 fail (100,0 s) |
| `npm run speed:policy` | 16/16 verificări PASS, raport scris |
| `npm run speed:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), saturarea la limita legală,
separarea de trafic/curbă/semafor, compatibilitatea M pe o țintă 046 reală, refuzul valorilor din
afara intervalului și al unității greșite, refuzul profilului incomplet, diagnosticile pentru
observație/țintă străină sau veche, drum necunoscut și drum arterial cu țintă 046, determinismul și
înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/speed-policy.ts` — contractul `167-speed-policy-v1`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/speed-policy.test.ts`, `tests/autonomy/speed-policy-reference.ts`,
  `tests/autonomy/speed-policy-report.ts` — teste, fixture-uri și oracolul raportului.
- `scripts/run-v2-speed-policy-report.mjs`, `package.json` — raportul determinist `speed:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/167-v2-speed-policy/` — acest document, `report.json`, `report.md`.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele patru chei au încă `implemented: false` în catalog, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI 168 și la actualizarea registrului.
- Ca și 046/047/048, stratul este un contract de politică neexecutat încă în bucla live de simulare;
  montarea lui în compoziție și proba de browser rămân pași separați.
- Drumul `ARTERIAL` nu are fapte 046 (politica 046 cunoaște doar `URBAN`/`RESIDENTIAL`), deci pe
  artere apelantul nu trimite țintă 046, iar 167 construiește ținta de drum din limita postată plus
  delta. O țintă 046 trimisă pe un drum arterial este refuzată explicit.
- Deadband-ul este relativ la ținta de stil: la amplitudini mici de variație, o bandă mare filtrează
  aproape toată unda. Este comportamentul cerut de „bandă de toleranță”, nu un defect.
