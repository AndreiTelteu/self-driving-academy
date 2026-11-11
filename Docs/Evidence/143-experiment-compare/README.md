# 143 — comparație A/B cu distribuții și dovezi

Contract: `143-experiment-compare-v1` ([src/experiments/experiment-compare.ts](../../../src/experiments/experiment-compare.ts)) și panoul `143-experiment-compare-panel-v1` ([src/ui/experiment-compare-panel.ts](../../../src/ui/experiment-compare-panel.ts)).

## Ce s-a implementat

Comparația A/B este un **read model peste rezultatele 142**, nu o recalculare. `readExperimentComparison` primește rezultate `142-experiment-rerun-v1` încheiate și copiază divergențele raportate de 142 (oportunitate, tick, ambele decizii, cauză, parametru) împreună cu `causeCounts`, `parameterCounts` și `profileDifferences`. Rezultatul declară structural `sources.policiesEvaluated: 0`; numărul de diferențe este identic cu suma `comparison.divergent` a rerulărilor citite (43), iar un test compară rând cu rând fiecare divergență cu cea din 142.

Stratul adaugă exact ce raportul de experiment are nevoie și rerularea nu deține:

1. **Distribuție pe cauze, parametri și categorii** — cauzele rămân separate (`PROBABILITY_THRESHOLD`, `GEOMETRY_PARAMETER`, `SEED_DIVERGENCE`, `UNCLASSIFIED`), parametrii sunt numărați separat, iar `dominantParameter` arată ponderea celui mai frecvent. Un caz de tip complex în care toate diferențele ar numi un singur parametru apare explicit în `singleParameterOnlyCases`, iar `criterionSatisfied` devine `false`.
2. **Coexistență de cauze** — diferențele sunt grupate pe oportunitate; aceeași oportunitate explicată de două cauze în cohorte controlate diferite este raportată cu ambele intrări.
3. **Expunere cu numere** — fiecare oportunitate evaluată are un fapt de vizibilitate legat de tickul deciziei (`CAMERA` în joc, `CONTROLLED_FIXTURE` în fixture). Un set incomplet sau un tick care nu se potrivește este refuzat, nu completat.
4. **Mărimea eșantionului și incertitudinea** — seed-uri distincte de bază/scenariu/oportunitate, numărătoarea diferențelor pe seed cu minim și maxim real, status `SINGLE_SEED_SAMPLE`/`MULTI_SEED_SAMPLE` și un text care declară ce nu se poate concluziona.
5. **Scenarii izolate** — o cohortă `ISOLATED_PARAMETER` este acceptată numai dacă exact o cheie diferă și este ținta; rezultatul raportează parametrii numiți de 142 și `foreignParameters`.
6. **Indicatori 138/139** — perechi opționale legate de o cohortă și de perechea reală de profiluri; diferența apare numai când ambele valori sunt `AVAILABLE`, altfel `UNAVAILABLE` cu motiv închis.

## Cum funcționează

- **Comparația peste 142 fără re-derivare.** `readExperimentComparison` nu importă 050/051 și nu are nicio cale de evaluare a politicilor; citește `comparisons`, `runs`, `addressing`, `scenario` și `seed` din rezultatul 142. Diferențele afișate sunt exact obiectele `ExperimentRerunDivergence` produse de 142, cu cauza și parametrul lui.
- **Distribuția cauzelor.** Se agregă `causes`, `parameters` (cu pondere `count/divergent`), `categories` (SIGNAL/STOP, oportunități, evaluări, diferențe), `unattributed` (UNCLASSIFIED), `seedDivergences` și `distinctParameters`. Pe suita de referință: 43 diferențe, 37 de prag și 6 de geometrie, 4 parametri (20/17/4/2), 22 pe Semafoare și 21 pe STOP, 0 neatribuite; cel mai frecvent parametru acoperă 46,5%, deci nu toate diferențele sunt atribuite unui singur parametru. Exemplul cu două cauze: `opportunity-15` este `PROBABILITY_THRESHOLD`/`red_stop_probability` în cohorta izolată de probabilitate și `GEOMETRY_PARAMETER`/`red_stop_line_offset` în cohorta izolată de offset; `opportunity-20` este `stop_full_probability` pe seed-urile 142 000 și 142 001 și `stop_dwell_time` pe 142 002. 3 din 20 de oportunități cu diferențe au două cauze.
- **Expunerea.** `evaluatedOpportunities` numără instanțele autorate (144 pe cele 6 cohorte), `evaluations` numără oportunitate × profil (288), `visible`/`invisible` numără faptele declarate (96/192), iar fereastra este cea reală a rerulării (tick 61–84, 24 de tickuri). Fracția vizibilă este `visible / evaluations` și este `null` când nu există evaluări.
- **Seed-uri și incertitudine.** 3 seed-uri de bază (142 000, 142 001, 142 002), 3 seed-uri de scenariu (`51107408`, `620e6961`, `75183992`), 72 de seed-uri de oportunitate; diferențe pe seed 20, 13, 10 → minim 10, maxim 20, spread 10. Textul declară: eșantionul descrie exact aceste rulări, nu este o estimare pentru alte seed-uri, alte profiluri sau orașul live, nu se raportează interval de încredere, iar reproductibilitatea este promisă numai pe aceeași platformă, cu același snapshot și același seed de bază.
- **Scenariul izolat.** `red_stop_probability` 1 → 0 produce 10 diferențe numite exclusiv de țintă; `red_stop_line_offset` 1,2 → 5 m produce 2 diferențe, tot exclusiv de țintă. O cohortă cu două chei schimbate este refuzată cu `ISOLATED_PARAMETER_NOT_ISOLATED`. Controlul cu profil identic are 0 diferențe din 24 de decizii.
- **Panoul.** Buton nativ, dialog cu rol și nume accesibil, focus mutat la deschidere și readus la închidere, Tab ținut în dialog, `Escape` închide, zero listeners globali, o singură citire la deschidere și `refresh()` sărit când semnătura nu s-a schimbat. Tabelele au `scope` pe capete și rânduri; barele au înălțimi calculate din valorile reale.

## Comenzi executate și rezultat real

Toate comenzile au rulat în worktree-ul `compare-143-01`, cu Node 24.19.0.

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`), fără erori |
| `npm run lint` | PASS, 0 erori și 0 warnings |
| `npm run format:check` | PASS, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS (351 fișiere TypeScript, 6 + 4 + 3 sonde negative) |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | PASS, **2554 teste, 2554 trecute, 0 eșuate**, 1 suită, 81 047 ms |
| `node --import ./scripts/register-typescript.mjs --test tests/experiments/experiment-compare.test.ts` | PASS, **14/14** |
| `node --import ./scripts/register-typescript.mjs --test tests/ui/experiment-compare.test.ts` | PASS, **15/15** |
| `npm run experiment:compare` | **49/49 verificări, 5 probe de refuz, PASS**; a scris `report.json` și `report.md` |
| `node --import ./scripts/register-typescript.mjs scripts/run-experiment-compare-report.mjs --check` | PASS, „Experiment compare report is current” |

Rezumatul scriptului: `SUMMARY checks 49/49, refusals 5, cohorts 6, decisions 144, divergent 43, causes 37/6, parameters 4, visible 96, invisible 192, seeds 3, coexisting 3, overall PASS`.

## Numerele suitei de referință

Suita are 6 cohorte reale: un control cu profil identic, două scenarii izolate și perechea reală PRUDENT/IMPULSIVE pe trei seed-uri de bază.

| Măsură | Valoare |
| --- | --- |
| cohorte | 6 |
| evaluări (oportunitate × profil) | 288 |
| decizii comparate | 144 |
| diferențe | 43 |
| decizii identice | 101 |
| cauze: prag / geometrie | 37 / 6 |
| divergențe din seed / neatribuite | 0 / 0 |
| parametri distincți | 4 (`red_stop_probability` 20, `stop_full_probability` 17, `stop_dwell_time` 4, `red_stop_line_offset` 2) |
| categorii: Semafoare / STOP | 22 / 21 |
| oportunități cu diferențe / cu două cauze | 20 / 3 |
| expunere: evaluate / vizibile / invizibile | 144 / 96 / 192 |
| fereastră | tick 61–84 (24 de tickuri) |
| seed-uri de bază / scenariu / oportunitate | 3 / 3 / 72 |
| diferențe pe seed | 20, 13, 10 (min 10, max 20, spread 10) |
| control cu profil identic | 0 diferențe din 24 de decizii |
| izolat `red_stop_probability` 1 → 0 | 10 diferențe, doar ținta |
| izolat `red_stop_line_offset` 1,2 → 5 m | 2 diferențe, doar ținta |
| 138 `overall.violationRate` | 0 → 50 (+50) |
| 139 `overall.meanAccelerationAbsMps2` | 1,2 → 2,1 (+0,9) |

## Fișiere atinse

- `src/experiments/experiment-compare.ts` (nou) — read model-ul, tipurile, refuzurile.
- `src/experiments/index.ts` — un `export *` adăugat la finalul listei.
- `src/ui/experiment-compare-format.ts` (nou) — proiecția în text, tabele și bare.
- `src/ui/experiment-compare-panel.ts` (nou) — panoul accesibil.
- `src/ui/index.ts` — exporturile adăugate la final.
- `tests/experiments/experiment-compare-fixture.ts` (nou) — cele 6 cohorte reale, vizibilitatea declarată, perechile 138/139.
- `tests/experiments/experiment-compare.test.ts` (nou) — 14 teste.
- `tests/experiments/experiment-compare-report.ts` (nou) — transcriptul determinist.
- `tests/ui/experiment-compare.test.ts` (nou) — 15 teste de accesibilitate și proiecție.
- `scripts/run-experiment-compare-report.mjs` (nou) — raportul cu `--check`.
- `package.json` — `"experiment:compare"` adăugat ca ultima intrare din `"scripts"`.
- `Docs/14-experimente-si-indicatori.md` — secțiunea contractului, la finalul fișierului.
- `Docs/08-interfata-camera-si-control.md` — secțiunea panoului, la finalul fișierului.
- `Docs/Evidence/143-experiment-compare/README.md`, `report.json`, `report.md` (noi).
- `PBI/To Do/143-compare_profiles.md` → `PBI/Done/143-compare_profiles.md` (mutare fizică, status și dovezi completate).

## Limitări

- Vizibilitatea este un fapt declarat de apelant (camera reală sau fixture controlat), nu o rază trasată de acest modul; fixture-ul declară camera vede `taxi-01`..`taxi-08`.
- Agregatele 138/139 din fixture sunt construite prin API-ul incremental real, dar sunt fixture-uri controlate, nu o măsurare a rerulării.
- Eșantionul are 3 seed-uri și un singur scenariu; numerele sunt exacte pentru aceste rulări și nu sunt o rată pentru populație. Nu se raportează interval de încredere.
- Diferențele sunt cele raportate de 142 pentru oportunitățile scenariului; traiectoriile divergente pot produce oportunități diferite în lumea reală, deci rezultatul nu este o demonstrație că un parametru a cauzat tot orașul.
- Panoul nu a fost verificat într-un browser real în acest PBI: testele folosesc DOM-ul determinist al proiectului, iar adaptorul nu are cale pe tick și nici listener global.
