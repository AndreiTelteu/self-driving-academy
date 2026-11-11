# Dovezi 123 — schimbarea unui obicei

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform
[politicii proporționale](../../validation-policy.md). Nu se revendică FPS, GPU, Rapier, soak sau
hardware; contractul este de domeniu, fără UI, DOM sau efect în `main.ts`, deci proba de browser nu
este necesară.

## Ce s-a livrat

- `src/missions/habit.ts` — contractul `123-mission-habit-v1`: etapa 7 a campaniei
  (`campaign-7-changing-a-habit`, definiție 116) ca obiectiv de actualizare a profilului prin
  demonstrații repetate, cu regula „treptat" explicită, versiuni intermediare inspectabile și
  refuzuri cu cod închis.
- `src/missions/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-habit-fixture.ts` — fixture real: fiecare demonstrație este un segment
  069 LEARNING închis, cu mostre 085, oportunități 086, ferestre 087, filtru 088, evidență 093 și
  estimatoare 097/098, trecut apoi prin pipeline-ul real 112 (coadă 103, poartă 102, store 109,
  activare 110). Fixture-ul autoră doar câte abordări de linie de stop s-au încheiat cu oprire
  completă și câte au fost trecute.
- `tests/missions/mission-habit.test.ts` — 9 teste deterministe (contract, schimbare repetată,
  inspecția versiunilor intermediare, contradicție singulară absorbită, contradicții repetate,
  zero demonstrații, refuzuri cu cod închis, determinism/imutabilitate, transcriptul raportului).
- `tests/missions/mission-habit-report.ts` + `scripts/run-mission-habit-report.mjs` — raport
  determinist cu 59 de verificări, 4 rulări și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 123): schimbarea unui obicei".
- `package.json` — scriptul `missions:habit`, adăugat la finalul blocului `scripts`.
- `Docs/Evidence/123-mission-habit/report.json` și `report.md` — transcriptul real.
- `PBI/Done/123-mission_habit.md` — taskul mutat fizic în Done.

## Cum definești „treptat" (pragul și de ce)

Regula stă în misiune, nu în modulele de learning, și este publicată ca `HABIT_POLICY`:

- `stepsToReplace = 3` — trei demonstrații consecutive în aceeași direcție stabilesc tendința nouă.
  Trei este cea mai mică serie în care o singură demonstrație contradictorie lasă o majoritate
  strictă (două din trei) în direcția originală; cu două, o singură eșantionare zgomotoasă ar putea
  produce un egal, iar „înlocuit" ar deveni indecidabil.
- `stepsToReverse = 2` — două contradicții consecutive răstoarnă tendința. Doi este cea mai mică
  serie **repetată** contrarie și este strict mai mare decât o demonstrație singulară, deci o
  contradicție singură nu poate răsturna niciodată o tendință stabilită.
- Tendința inversată pornește cu cele două pasuri deja numărate, deci atinge pragul de 3 după încă o
  demonstrație consecventă. Nu există o a doua metodă de versionare: pașii sunt versiunile 109.

## Cum este absorbită o contradicție singulară

Rularea `single-contradiction` demonstrează de trei ori oprirea completă, apoi o dată o combinație
(4 opriri complete și 1 trecere). Valorile reale ale profilului devin
**0,6 → 0,8 → 0,9 → 0,95 → 0,8667**: a patra demonstrație chiar mută valoarea în jos cu **−0,0833**,
dar direcția raportată rămâne `INCREASE`, seria consecventă rămâne **3**, iar pasul este marcat
`absorbed: true`. Rezultatul rămâne `REPLACED`, iar capul (**0,8667**) este încă deasupra bazei
(**0,6**), deci tendința nouă nu a fost răsturnată.

Abia două contradicții consecutive schimbă direcția: rularea `repeated-contradictions` arată
**0,6 → 0,8 → 0,9 → 0,95 → 0,8667 → 0,8296 → 0,8132**, cu un singur pas `reversal` (al cincilea),
`reversals: 1`, `absorbedContradictions: 1` și direcția `DECREASE`. După al treilea pas consecvent
descrescător, tendința inversă este ea însăși stabilită (`REPLACED`).

## Cum arată versiunile intermediare și ce poate inspecta jucătorul

Fiecare pas din `result.steps` este o versiune reală 109, în ordinea reală a lanțului:

- `order` = adâncimea reală `depth` (1, 2, 3…), `parentVersionId` continuă lanțul, iar baza are
  adâncimea 0;
- `checksum` este hash-ul de conținut `fnv1a64` al versiunii, verificat în contract cu
  `verifyProfileVersionChecksum` și egal cu cel din store-ul 109;
- `segmentId`, `interventionId` și `sourceSegmentIds` păstrează proveniența 109 acumulată;
- `previousValue`, `newValue`, `change` și `totalChange` arată exact ce a schimbat fiecare
  demonstrație față de versiunea anterioară și față de bază;
- `direction`, `trendDirection`, `consecutiveSteps`, `absorbed` și `reversal` arată efectul fiecărei
  demonstrații asupra tendinței.

Jucătorul poate deci compara două versiuni (baza și capul, prin `HabitComparison`) și poate coborî în
oricare versiune intermediară pentru a vedea ce a produs-o. Raportul listează toate cele 14 versiuni
intermediare ale celor trei rulări cu demonstrații, fiecare cu checksum-ul ei, iar coloana `Store`
confirmă că fiecare checksum este cel din store-ul 109 (**14/14 `match`**).

## Numere reale (din `report.json`)

| Rulare | Demonstrații | Valori | Stare | Direcție | Consecutive | Absorbite | Răsturnări | Poartă |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| repeated | 4 | 0,6 → 0,8 → 0,9 → 0,95 → 0,975 | `REPLACED` | `INCREASE` | 4 | 0 | 0 | `PROGRESS` |
| single-contradiction | 4 | 0,6 → 0,8 → 0,9 → 0,95 → 0,8667 | `REPLACED` | `INCREASE` | 3 | 1 | 0 | `PROGRESS` |
| repeated-contradictions | 6 | 0,6 → 0,8 → 0,9 → 0,95 → 0,8667 → 0,8296 → 0,8132 | `REPLACED` | `DECREASE` | 3 | 1 | 1 | `PROGRESS` |
| no-demonstrations | 0 | 0,6 | `NO_DEMONSTRATIONS` | `NONE` | 0 | 0 | 0 | `NO_PROGRESS` |

Candidații 098 ai demonstrațiilor sunt **1 / 1 / 1 / 1** în rularea repetată și
**1 / 1 / 1 / 0,8** în cea cu contradicție singulară, adică exact proporția de opriri complete
măsurată de estimator, nu o valoare scrisă de fixture. Fiecare versiune a fost activată pe tick-ul
comun următor (1, 2, 3, 4…), cu **64 de vehicule** actualizate (24 taxiuri + 40 civili).

## Comenzi rulate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, fără avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `PASS (320 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2234 teste, 2234 pass, 0 fail, 68,07 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-habit.test.ts"` | 9 teste, 9 pass, 0 fail |
| `npm run missions:habit` | `SUMMARY checks 59/59, runs 4, overall PASS` |
| `node --import ./scripts/register-typescript.mjs scripts/run-mission-habit-report.mjs --check` | `Mission habit report is current`, exit 0 |

## Limite

- Rulare Node deterministă: demonstrațiile sunt segmente reale închise și versiuni reale 109, dar nu
  există browser, renderer sau sesiune umană.
- Partea autorată este câte abordări de linie de stop ale unei demonstrații s-au încheiat cu oprire
  completă și câte au fost trecute; candidatul, blending-ul 101 și fiecare versiune sunt calculate de
  estimatoarele și pipeline-ul livrate.
- Misiunea este un contract de domeniu: nu are HUD, panou sau compoziție în `main.ts`. Inspecția
  jucătorului este read model-ul `steps` + `HabitComparison`, nu o interfață.
- Pragurile 3/2 sunt o regulă de design documentată, nu o calibrare statistică pe jucători reali; ele
  pot fi revizuite printr-un contract ulterior fără a schimba versionarea 109.
- Nu se revendică FPS, frame, GPU, Rapier sau măsurători de hardware.
