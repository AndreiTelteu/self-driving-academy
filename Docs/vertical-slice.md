# Vertical slice 115: orașul care copiază jucătorul

Contract: `115-vertical-slice-v1`. Codul trăiește în `src/app/vertical-slice.ts`, proba este
`npm run vertical:slice`, iar raportul comis este
[Evidence/115-vertical-slice](Evidence/115-vertical-slice/README.md).

Modulul leagă într-un singur flux determinist modulele reale deja livrate: baza 092, țintele 105,
pipeline-ul 112 (coada 103, poarta 102, store-ul 109, publicarea 110), lumea mixtă taxi/civil 208
peste registry-ul 057 și traficul 058, acumulatorii 138, explicația 104 și binding-ul UI 113.
Nu creează un al doilea profil, publisher, store sau estimator.

## Playtest simulat, nu playtest uman

Cei doi „jucători” sunt profilele 105 `PRUDENT` și `RECKLESS`. Fiecare scenariu este o rulare
deterministă, completă, în două lumi izolate:

- baza este profilul real 092, cu valoarea documentată 204 `stop_full_probability = 0.6`;
- un segment `LEARNING` închis, observat de un civil, intră în pipeline-ul real 112;
- versiunea publicată este aplicată la tickul comun tuturor taxiurilor și civililor;
- faptele de condus sunt generate de un plan de oportunități declarat, apoi introduse în 138;
- explicația 104 este derivată din jobul și outcome-ul real 103 pe care pipeline-ul le-a consumat;
- binding-ul 113 este citit pentru un taxi și un civil.

Planul de oportunități și presiunile întâlnirilor sunt intrări declarate ale harness-ului. Nu există
jucător uman, browser, captură, Rapier, renderer, FPS, GPU sau ceas de perete. Numerele nu sunt
rezultate de participant și nu certifică jocul integrat.

## Baza și segmentul

Baza folosește toate cele 80 de valori 092, cu `stop_full_probability = 0.6` (aceeași valoare de
pornire ca în bucla timpurie 204). Singura cheie învățată este `stop_full_probability`, o țintă 092
`initial_learning_target` și o cheie 105 explicită:

| Scenariu | Ținta 105 | Candidat | Valoare aplicată de 101 |
| --- | ---: | ---: | ---: |
| `PRUDENT` | 1 | 1 | 0.84 |
| `RECKLESS` | 0.2 | 0.2 | 0.36 |

Valoarea aplicată este rezultatul real al blend-ului 101 (`base + weight × (candidate - base)`,
weight plafonat la 0.6); nu este scrisă de mână. Fiecare scenariu produce exact o versiune nouă, cu
părintele explicit al bazei, deci lanțul este `city-style-base-115 → segment-115-<scenariu>~112`.

## De la LEARNING la ambele categorii

1. Civilul observator intră în `LEARNING` și își păstrează ruta reală 041.
2. Segmentul închis produce `COMPOSED` în 112; coada 103 răspunde cu un job real, iar 109 creează o
   singură versiune imuabilă.
3. 110 publică o comandă `PENDING` pentru tickul următor. Înainte de tick nu se scrie nimic.
4. La tick, 208 aplică aceeași versiune fiecărui `TAXI` și `CIVILIAN`, inclusiv vehiculelor
   `MANUAL`/`LEARNING`; suprafața scrisă rămâne `{ tick, appliedProfileVersion }`.
5. Histogramele taxiurilor și civililor au aceeași singură cheie, iar ruta și clasa mecanică a
   civilului rămân neschimbate.

Nu există profil per clasă, per tip de șofer sau personalitate ascunsă. Raportul publică
`hiddenOverrides: []`.

## Explicația 104

`readLearningExplanation` primește exact jobul și outcome-ul real 103 observate prin portul de
transport al harness-ului. Pentru fiecare schimbare, raportul păstrează:

- valoarea anterioară și nouă, delta, numărul efectiv de episoade, calitatea, incertitudinea și
  starea de încredere;
- contextele reale 093 observate (`FREE_TRAFFIC`);
- contextele declarate de politica 093 pentru cheie;
- contextele neobservate, explicit: `GREEN`, `YIELD` și `LANE_CHANGE`, cele trei tipuri 086 pe care
  planul determinist nu le exercită. Ele sunt limitări de acoperire, nu dovezi inventate.

Explicația poartă ID-ul compunerii 103 (`city-style-base-115~103.1`), în timp ce 112 stochează
versiunea derivată (`segment-115-<scenariu>~112`). Sunt identități diferite prin contract, iar
raportul le publică separat. Binding-ul 113 este citit fără explicație atașată: dacă ar fi atașată,
verificatorul 113 ar raporta corect `REASON_CODE_MISMATCH`. Raportul păstrează această separare
(`explanationBinding.attached = false`, motiv `COMPOSITION_AND_STORE_VERSION_IDS_DIFFER`) în loc să
modifice vreun ID.

## Comportament și greșeli vizibile

Faptele de condus sunt 086 reale ca formă, generate din planul declarat: 10 oportunități `STOP` și
4 `RED`, distribuite alternativ unui taxi și unui civil, plus 8 eșantioane de viteză cu limita reală
a benzii. O oportunitate este tratată cu succes când presiunea deterministă este sub probabilitatea
aplicată a stilului.

| Scenariu | Oportunități | Succese | Încălcări | Conformitate | Taxi | Civil |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `PRUDENT` | 14 | 14 | 0 | 100% | 0 | 0 |
| `RECKLESS` | 14 | 8 | 6 | 57,14% | 3 | 3 |

`PRUDENT` este curat cu oportunități reale; `RECKLESS` produce încălcări `STOP` vizibile pe ambele
categorii. Valorile provin din snapshotul înghețat 138, nu sunt recalculate în raport. Numărătorile
pe taxi/civil sunt numărători ale acelorași fapte 086; 138 agregă flota întreagă.

## MANUAL

După activarea stilului, același plan de rută este rulat în `MANUAL`:

- telemetria este înregistrată (14 oportunități, 8 eșantioane de viteză);
- pipeline-ul real răspunde `SKIPPED_MANUAL` cu `MANUAL_SEGMENT_NOT_LEARNABLE`;
- nu există job 103, versiune 109 sau comandă 110;
- versiunea activă și toate valorile rămân identice (digest identic înainte/după);
- binding-ul 113 rămâne consistent și raportează aceeași versiune/valori.

Contractul 104 refuză explicit joburile `MANUAL`, deci explicația MANUAL este rezultatul real 112
`SKIPPED_MANUAL` proiectat ca `NO_CHANGE`, cu `versionId: null`, zero schimbări și zero dovezi. Nu
este inventat un snapshot 104 și nu este fabricată o versiune.

## Verificare

```powershell
npm run vertical:slice            # scrie report.json + report.md
npm run vertical:slice -- --check # compară ambele fișiere cu originalul comis
```

Raportul are 7 rânduri de dovezi (`PRUDENT`, `RECKLESS`, `BOTH_CATEGORIES`, `MISTAKES_VISIBLE`,
`MANUAL_NO_CHANGE`, `UNOBSERVED_CONTEXTS`, `DETERMINISM`), 111 verificări și două rulări
independente identice byte cu byte. Testele sunt în `tests/app/vertical-slice.test.ts` (16 teste).

## Ce nu este

- Nu este un playtest uman sau de browser și nu produce capturi de ecran.
- Nu este o probă de FPS, GPU, fizică Rapier sau hardware.
- Nu modifică 092, 093, 101, 102, 103, 104, 109, 110, 112, 113 sau 138 și nu declară `LEARNED`.
- Nu inventează valori pentru contextele neobservate și nu ascunde separarea de identitate 103/112.
- Nu certifică performanța jocului integrat; gate-ul de release rămâne separat.
