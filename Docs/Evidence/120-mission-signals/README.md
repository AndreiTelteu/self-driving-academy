# Dovezi 120 — misiunea STOP/roșu/verde

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform
[politicii proporționale](../../validation-policy.md). Nu se revendică FPS, GPU, Rapier, soak sau
hardware; contractul este de domeniu, fără UI, DOM sau efect în `main.ts`, deci proba de browser nu
este necesară.

## Ce s-a livrat

- `src/missions/signals.ts` — contractul `120-mission-signals-v1`: etapa 4 a campaniei
  (`campaign-4-stops-and-signals`, definiție 116) ca misiune în care încălcarea este învățată și
  consecința este observabilă. Obiectivul este **2 opriri complete de minimum 1,5 s** și zero
  încălcări imputabile.
- `src/missions/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-signals-fixture.ts` — fixture care duce fiecare scenariu prin lanțul real
  086 → 087 → 088 → 093 → 097/098. Scenariul autorat spune doar care fază este roșie, care linie de
  STOP este abordată, dacă șoferul a oprit și cât a ținut oprirea; fiecare clasificare, numitor,
  candidat și refuz este output-ul modulelor livrate.
- `tests/missions/mission-signals.test.ts` — 7 teste deterministe (contract, run conform, verde blocat
  și oprire din trafic, run cu încălcări, dwell sub prag, refuzul contradicțiilor, imutabilitate).
- `tests/missions/mission-signals-report.ts` + `scripts/run-mission-signals-report.mjs` — raport
  determinist cu 53 de verificări, 3 runuri și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat în
  V1 (PBI 120): misiunea STOP/roșu/verde".
- `package.json` — scriptul `missions:signals`, adăugat la finalul blocului `scripts`.
- `Docs/Evidence/120-mission-signals/report.json` și `report.md` — transcriptul real.
- `PBI/Done/120-mission_signals.md` — taskul mutat fizic în Done.
- `tests/missions/mission-follow-report.ts` — eliminarea a două declarații nefolosite semnalate de
  `tsc -p tsconfig.tests.json`; nicio valoare sau verificare 119 nu s-a schimbat.

## Cum se învață încălcarea și cum este observabilă consecința

1. **086 decide faptul cert.** O oportunitate `RED` se rezolvă `HELD`/`CROSSED`, una `STOP` se
   rezolvă `STOPPED`/`CROSSED_WITHOUT_STOP`. O încălcare are întotdeauna `result: FAILURE`.
2. **087 decide dacă șoferul era liber.** Fereastra `FREE_TRAFFIC` este singura `ELIGIBLE`; o oprire
   în spatele unui lider este `EXTERNAL_CONSTRAINT`/`LEADER`, iar un verde blocat este
   `EXTERNAL_CONSTRAINT`/`BLOCKED_GREEN`.
3. **093/097/098 învață din exact aceleași episoade.** Ledgerul primește faptele reale, iar
   estimatoarele întorc candidații `red_stop_probability` și `stop_full_probability`.
4. **Misiunea leagă cele două jumătăți.** `SignalConsequence` raportează `opportunityResult: FAILURE`
   și valoarea candidatului real: `RED_CROSSED` → `red_stop_probability`, `STOP_LINE_CROSSED` →
   `stop_full_probability`. Nu există o a doua socoteală în misiune.
5. **Un candidat contrazis este refuzat.** Raportul forțează `red_stop_probability = 0.99` pe runul cu
   `1/3` și contractul aruncă eroare; misiunea nu poate explica o învățare care nu există.

## De ce oprirea din trafic și verdele blocat nu sunt încălcări

- **Oprirea din trafic** are `cause: LEADER` și fereastra 087 `EXTERNAL_CONSTRAINT`. Oportunitatea 086
  este real `FAILURE` (`CROSSED_WITHOUT_STOP`), dar misiunea raportează `TRAFFIC_STOP` cu explicația
  `TRAFFIC_STOP_NOT_VIOLATION` și `consequence: null`. În runul conform, numitorul
  `stop_full_probability` este `3` (STOP_LINE libere), nu `4`, iar `trafficInducedStopsExcluded` este
  `1`: raportul este `3/3`, nu `3/4`.
- **Verdele blocat** are `BLOCKED_GREEN` cu sursa reală `FOLLOWING_QUEUE`; `respond` îl refuză cu
  `EXTERNAL_CONSTRAINT`, deci `reaction.applicable` este `false` și nu se cere nicio reacție. Delay-ul
  lui nu intră în `green_start_delay`: ledgerul are un singur episod (verdele liber), sub minimul de
  două, deci candidatul rămâne `null` — exact comportamentul real 097.
- Ambele rămân vizibile în raport cu `outcome`/`opportunityResult`, deci jucătorul vede că faptul cert
  a fost un eșec, dar înțelege de ce nu i se impută.

## Numere reale (din `report.json`)

| Run | Rezultat | Motiv | Încălcări | Opriri complete | `red_stop_probability` | `stop_full_probability` |
| --- | --- | --- | --- | --- | --- | --- |
| conform | `PROGRESS` | — | 0 | 3 | `1` (`CANDIDATE`) | `1` (`CANDIDATE`) |
| cu încălcări | `NO_PROGRESS` | `VIOLATIONS_AND_INSUFFICIENT_FULL_STOPS` | 4 | 1 | `0.333333` (`CANDIDATE`) | `0.333333` (`CANDIDATE`) |
| dwell scurt | `NO_PROGRESS` | `INSUFFICIENT_FULL_STOPS` | 0 | 1 | `1` (`CANDIDATE`) | `UNOBSERVED` |

| Run | RED certe | STOP certe | STOP_LINE libere | Opriri din trafic excluse |
| --- | --- | --- | --- | --- |
| conform | 3 | 4 | 3 | 1 |
| cu încălcări | 3 | 4 | 3 | 1 |
| dwell scurt | 3 | 2 | 2 | 0 |

Runul cu încălcări are două roșuri trecute și două linii de STOP trecute; fiecare poartă
`opportunityResult: FAILURE` și valoarea reală `1/3`. Runul cu dwell scurt are două opriri complete
reale, dar una ține `0,5 s`, sub pragul de `1,5 s`, deci obiectivul nu este îndeplinit fără nicio
încălcare.

## Comenzi rulate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, fără avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (301 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2088 teste, 2088 pass, 0 fail, 76,4 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-signals.test.ts"` | 7 teste, 7 pass, 0 fail |
| `npm run missions:signals` | `SUMMARY checks 53/53, runs 3, overall PASS` |
| `node --import ./scripts/register-typescript.mjs scripts/run-mission-signals-report.mjs --check` | `Mission signals report is current`, exit 0 |

## Limite

- Rulare Node deterministă: faptele trec prin lanțul real 086/087/088/093/097/098, dar nu există
  browser, renderer sau sesiune umană.
- Scenariul autorat alege faza, linia de STOP și durata reală a evenimentului `FULL_STOP`; restul
  (clasificare, numitori, candidați, refuzuri) este output-ul modulelor livrate.
- Identitatea ferestrei 087 și cea a ferestrei 088 folosesc încă două scheme; fixture-ul leagă
  fereastra reală 088 de fereastra reală 087 a aceleiași oportunități, ca fixture-urile 118/119, și nu
  inventează nicio valoare, tick sau estimare.
- Un candidat cere trei episoade distincte, deci raportul demonstrează identificarea și refuzul exact
  la acel minim, nu pe un eșantion mare de trafic înregistrat.
- Nu se revendică FPS, frame, GPU sau măsurători de hardware.
