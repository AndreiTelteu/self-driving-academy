# Dovezi 119 — comparația stilurilor de urmărire

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform
[politicii proporționale](../../validation-policy.md). Nu se revendică FPS, GPU, Rapier, soak sau
hardware; contractul este de domeniu, fără UI, DOM sau efect în `main.ts`, deci proba de browser nu
este necesară.

## Ce s-a livrat

- `src/missions/follow.ts` — contractul `119-mission-follow-v1`: etapa 3 a campaniei
  (`campaign-3-following-distance`, definiție 116) ca comparație măsurată între exact două stiluri
  de urmărire. Contexturile sunt patru scenarii autorate (4/8/12/20 m/s, distanțe 12/14/16/30 m), iar
  coeficienții vin exclusiv din estimatorul real 096.
- `src/missions/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-follow-fixture.ts` — fixture care măsoară `desiredGapM` cu politica reală
  048 și duce fiecare observație prin lanțul real 086 → 087 → 088 → 093 → 096. Nu scrie o a doua
  lege de urmărire: singurul număr preluat din politică este gap-ul raportat.
- `tests/missions/mission-follow.test.ts` — 7 teste deterministe (contract, separare pe headway,
  separare pe distanța minimă, stiluri identice, refuzul pe o singură viteză, context străin/scenariu
  lipsă, matricea porții).
- `tests/missions/mission-follow-report.ts` + `scripts/run-mission-follow-report.mjs` — raport
  determinist cu 48 de verificări, 5 scenarii și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat în
  V1 (PBI 119): comparația stilurilor de urmărire".
- `package.json` — scriptul `missions:follow`, adăugat la finalul blocului `scripts`.
- `Docs/Evidence/119-mission-follow/report.json` și `report.md` — transcriptul real.
- `PBI/Done/119-mission_follow.md` — taskul mutat fizic în Done.

## Cum se disting stilurile prin fapte reale

1. **048 măsoară, nu misiunea.** Pentru fiecare scenariu, profilul este compilat de
   `compileFollowingProfile`, iar `evaluateFollowingTarget` raportează `desiredGapM` pentru exact
   contextul autorat (viteză ego, viteză lider, identitate lider). Misiunea citește acel număr.
2. **087/093 păstrează faptele.** O oportunitate STOP reală 086 (deschisă de `STOP_APPROACH`,
   închisă de `FULL_STOP`) este clasificată de 087 cu faptul real de lider (etichetă `LEADER`,
   clasă `EXTERNAL_CONSTRAINT`), filtrată de 088 și înregistrată de ledgerul 093 cu observația de
   headway.
3. **096 derivează coeficienții.** `estimateFollowingParameters` primește observațiile reale și
   întoarce candidații pentru `following_time_headway` (panta) și `following_min_gap` (intersecția).
   Contractul nu potrivește nimic singur.
4. **Aceleași condiții pentru ambele stiluri.** Comparația cere exact două profiluri cu ID-uri
   distincte, aceleași ID-uri de scenariu și verifică pentru fiecare observație că viteza ego, viteza
   liderului și identitatea liderului coincid cu scenariul autorat; un context străin este refuzat.
5. **Separarea este a coeficientului, nu a etichetei.** `HEADWAY` înseamnă că diferă doar panta,
   `MINIMUM_GAP` că diferă doar intersecția, `BOTH` ambele. Toleranțele sunt 0,1 s și 0,5 m.

## Numere reale (din `report.json`)

| Profil | Headway (s) | Distanța minimă (m) | Gap-uri măsurate la 4/8/12/20 m/s (m) |
| --- | --- | --- | --- |
| `profile:119:prudent` | 2.4 | 4 | 13.6, 23.2, 32.8, 52 |
| `profile:119:headway_twin` | 0.6 | 4 | 6.4, 8.8, 11.2, 16 |
| `profile:119:gap_twin` | 2.4 | 10 | 19.6, 29.2, 38.8, 58 |

| Caz | Rezultat |
| --- | --- |
| PRUDENT vs HEADWAY_TWIN | `SEPARATED` / `HEADWAY`, delta headway 1.8 s, delta gap 0 m |
| PRUDENT vs GAP_TWIN | `SEPARATED` / `MINIMUM_GAP`, delta gap 6 m la fiecare viteză, delta headway 0 s |
| PRUDENT vs PRUDENT_TWIN | `IDENTICAL` / `NONE`, motiv `PROFILE_VALUES_MATCH`, poartă `NO_PROGRESS` |
| PRUDENT vs HEADWAY_TWIN la 8 m/s | `UNIDENTIFIED`, motiv `SINGLE_SPEED_CANNOT_IDENTIFY`, poartă `NO_PROGRESS` |
| PRUDENT vs RECKLESS | `SEPARATED` / `BOTH`, delta headway 1.8 s, delta gap 3 m |

Diferența reală dintre PRUDENT și HEADWAY_TWIN crește cu viteza: 7,2 m la 4 m/s și 36 m la 20 m/s,
deși distanța minimă este identică. Diferența dintre PRUDENT și GAP_TWIN este constantă 6 m la toate
cele patru viteze. Exact aceste două semnături opuse arată că separarea vine din coeficientul corect,
nu din faptul că stilurile sunt etichetate diferit.

## Refuzul pe o singură viteză

La un singur context (8 m/s) distanțele măsurate diferă real — 23,2 m vs 8,8 m — dar estimatorul 096
refuză identificarea, iar contractul raportează `UNIDENTIFIED`, `headwayS: null`, `minGapM: null`,
`headwayDeltaS: null` și motivul real `SINGLE_SPEED_CANNOT_IDENTIFY`. Deci jucătorul nu poate
„ghici" coeficienții dintr-o singură observație, iar poarta rămâne `NO_PROGRESS`.

## Comenzi rulate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npx tsc --noEmit` | exit 0, fără output |
| `npm run lint` | exit 0, fără avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (300 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2081 teste, 2081 pass, 0 fail, 72,8 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-follow.test.ts"` | 7 teste, 7 pass, 0 fail |
| `npm run missions:follow` | `SUMMARY checks 48/48, scenarios 5, overall PASS` |
| `npm run missions:follow -- --check` | `Mission follow report is current`, exit 0 |

## Limite

- Rulare Node deterministă: stilurile trec prin politica reală 048 și lanțul real
  086/087/088/093/096, dar nu există browser, renderer sau sesiune umană.
- Identitatea ferestrei 087 și cea a ferestrei 088 folosesc încă două scheme; fixture-ul leagă
  fereastra reală 088 de fereastra reală 087 a aceleiași oportunități, ca fixture-ul 118, și nu
  inventează nicio valoare, tick sau estimare.
- Faptele de lider autorate sunt un set de calibrare controlat, nu o reluare a traficului înregistrat.
- Nu se revendică FPS, frame, GPU sau măsurători de hardware.
