# PBI 126 — panoul misiunilor și obiective live

Generat de `npm run missions:panel`; contract panou `126-mission-panel-v1`.
Plafoane 116/125: 32 misiuni, 8 obiective, 8 încercări; 1 citire per deschidere, 0 listeners globali.

## Parcurgerea campaniei

| Stare | Acțiune | Misiune | Stare campanie | Stare încercare | Progres | Încercări | Motiv | Reluare |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AVAILABLE | catalog proaspăt, nicio încercare | campaign-1-first-taxi | AVAILABLE | NONE | Nicio încercare înregistrată | 0 din 8 încercări încheiate | NONE | true |
| LOCKED | prerechizitele nu sunt finalizate | campaign-4-stops-and-signals | LOCKED | NONE | Nicio încercare înregistrată | 0 din 8 încercări încheiate | NONE | false |
| ACTIVE | încercarea 1 a primei misiuni a pornit | campaign-1-first-taxi | AVAILABLE | ACTIVE | 0 din 1 obiective îndeplinite | 0 din 8 încercări încheiate | NONE | true |
| COMPLETED | cursa MANUAL a încheiat misiunea 1 | campaign-1-first-taxi | COMPLETED | COMPLETED | 1 din 1 obiective îndeplinite | 1 din 8 încercări încheiate | NONE | true |
| FAILED | bugetul de incidente a fost depășit | campaign-8-fleet-challenge | AVAILABLE | FAILED | 0 din 1 obiective îndeplinite | 0 din 8 încercări încheiate | Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED) | true |
| CAMPAIGN_COMPLETE | toate cele 8 misiuni au fost încheiate | campaign-8-fleet-challenge | COMPLETED | COMPLETED | 1 din 1 obiective îndeplinite | 1 din 8 încercări încheiate | NONE | true |

- campania mixtă: 8 încercări, 8 instanțe 116, 14 recompense; final 7 încheiate, 1 disponibilă, 1 eșuată
- campania completă: 8 încercări, 8 instanțe 116, 16 recompense; reseturi: 0
- final: 8 finalizate, 0 disponibile, 0 blocate; obiective evaluate 8/8

## Motive de eșec închise

- motive: INCIDENT_BUDGET_EXCEEDED, EVALUATION_WINDOW_EXPIRED, SCENARIO_RESET, PLAYER_ABANDONED
- încercări: 1, 2, 3, 4
- tick-uri de eșec: 183, 18194, 18214, 18234
- etichete: Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED) | Fereastra de evaluare a expirat (EVALUATION_WINDOW_EXPIRED) | Scenariul a fost resetat (SCENARIO_RESET) | Misiunea a fost abandonată (PLAYER_ABANDONED)

## Versiunea aplicată

- aplicată: Versiunea 2 — „Primul taxi (versiunea 2)”
- obiectiv: „Finalizează o cursă cu intervenție MANUAL (versiunea 2)”
- catalog vechi refuzat: Mission panel definition campaign-1-first-taxi is version 1, not the applied version 2

## Inspectarea unei misiuni blocate

- misiuni inspectate: 3; citiri la deschidere/redeschidere: 1/2
- progres neschimbat: true; tracker neschimbat: true; instanțe create: 0

## Panoul

- elemente/noduri text: 172/111
- listeners: 11 (globali: 0)
- deschideri/închideri/randări/citiri: 1/1/1/1
- inspectări: 0; Escape: 1; Tab wrap: 2
- focus mutat/restaurat: 1/1; apeluri de suprafață: 2
- traseu de focus (deschidere/Tab/Shift+Tab/wrap/wrap/restaurare): true/true/true/true/true/true/true
- obiective randate: 0; noduri de motiv: 8

## Citiri

- refresh închis: SKIPPED_CLOSED; citiri la deschidere: 1
- refresh neschimbat: SKIPPED_UNCHANGED (1 citire); redeschidere: 1
- randări totale: 2; după închidere: SKIPPED_CLOSED

## Verificări

| Rezultat | Verificare | Real | Așteptat | Notă |
| --- | --- | --- | --- | --- |
| PASS | eight-mission-campaign | 8/1/7 | 8/1/7 | Catalogul 116 are 8 misiuni: una disponibilă și șapte blocate în lanțul de prerechizite. |
| PASS | available-state | AVAILABLE/NONE/Nicio încercare înregistrată | AVAILABLE/NONE/Nicio încercare înregistrată | Misiunea disponibilă arată zero încercări și obiective neevaluate, fără verdict inventat. |
| PASS | active-state | ACTIVE/1/0 din 1 obiective îndeplinite | ACTIVE/1/0 din 1 obiective îndeplinite | Încercarea pornită în 116 apare ca „În desfășurare”, cu progresul real al evaluării. |
| PASS | completed-state | COMPLETED/COMPLETED/1/1 | COMPLETED/COMPLETED/1/1 | Finalizarea vine din instanța 116 terminală: obiectivul evaluat este îndeplinit, nu inventat. |
| PASS | attempts-and-next-attempt | 1 din 8 încercări încheiate · Următoarea încercare: 2 | 1 din 8 încercări încheiate · Următoarea încercare: 2 | Numărul de încercări și următoarea încercare sunt copiate din progresul 125. |
| PASS | failed-with-reason | FAILED/Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED)/true | FAILED/Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED)/true | Eșecul afișează motivul închis al instanței 116 și păstrează reluarea disponibilă. |
| PASS | closed-failure-vocabulary | INCIDENT_BUDGET_EXCEEDED,EVALUATION_WINDOW_EXPIRED,SCENARIO_RESET,PLAYER_ABANDONED | INCIDENT_BUDGET_EXCEEDED,EVALUATION_WINDOW_EXPIRED,SCENARIO_RESET,PLAYER_ABANDONED | Toate cele patru motive închise vin din instanțe reale, fiecare cu încercarea lui. |
| PASS | failure-ticks-increase | 183,18194,18214,18234 | strict crescător | Fiecare eșec păstrează tick-ul real, deci motivele nu sunt rescrise de panou. |
| PASS | locked-state | LOCKED/NONE/false | LOCKED/NONE/false | Obiectivul blocat arată prerechizitele lipsă și nu promite reluare. |
| PASS | locked-inspection-preserves-progress | 3/true/true/0/1 | 3/true/true/0/1 | Inspectarea nu consumă încercări, nu resetează și nu citește contractele din nou. |
| PASS | text-follows-applied-version | Versiunea 2/Versiunea 1/Mission panel definition campaign-1-first-taxi is version 1, not the applied version 2 | Versiunea 2/Versiunea 1/catalogul vechi este refuzat | Textul vine din versiunea aplicată a definiției; catalogul vechi este refuzat, nu afișat. |
| PASS | evaluated-objectives-match | 8/8 | 8/8 | Fiecare obiectiv afișat provine din evaluarea reală: 8 evaluate, 8 îndeplinite. |
| PASS | replay-offered-after-failure | 0 din 8 încercări încheiate · Următoarea încercare: 1 · Reluare disponibilă: încercarea 1 din 8, profil CURRENT (profilul curent). Eșecul păstrează profilurile învățate. | 0 din 8 încercări încheiate · Următoarea încercare: 1 · reluare disponibilă | După eșec, panoul copiază exact 125 (slotul de finalizare nu e consumat) și oferă reluarea 116, fără să o pornească. |
| PASS | campaign-reaches-eight-completions | 8/8/8/0 | 8/8/8/0 | Campania completă: 8 finalizări, 8 încercări, 8 instanțe 116, zero reseturi. |
| PASS | mixed-campaign-keeps-failure | 7/1/1/8 | 7/1/1/8 | Campania mixtă: 7 încheiate, ultima disponibilă cu o încercare reală eșuată. |
| PASS | full-campaign-rewards | 16/16 | egale și pozitive | Recompensele afișate sunt exact cele acordate de ledgerul 125. |
| PASS | native-trigger-and-dialog | button/true/false | button/true/false | Butonul este nativ, cu `aria-expanded` sincronizat la deschidere și închidere. |
| PASS | focus-escape-and-tab-trap | true/true/true/true/true/true/true · escapes 1 · restores 1 · wraps 2 | true/true/true/true/true/true/true · escapes 1 · restores 1 · wraps 2 | Focusul intră în panou, Tab/Shift+Tab rămân înăuntru, Escape închide și readuce focusul. |
| PASS | no-global-listeners | 0/11 | 0/11 | Toate listeners sunt pe buton, pe Închide, pe dialog și pe cele 8 butoane de misiune. |
| PASS | reads-once-per-open | SKIPPED_CLOSED/1/SKIPPED_UNCHANGED/SKIPPED_CLOSED/1/2 | SKIPPED_CLOSED/1/SKIPPED_UNCHANGED/SKIPPED_CLOSED/1/2 | O citire per deschidere; panoul închis nu citește, iar o re-citire neschimbată nu randează. |
| PASS | empty-source-explicit | true/0/true | true/0/true | Fără campanie citită, panoul spune explicit că nu există misiuni. |
| PASS | fresh-catalog-shows-no-verdict | 8/0/8/Neevaluat | 8/0/8/Neevaluat | Un catalog proaspăt are 8 rânduri „Motiv: Niciuna”, zero obiective evaluate și niciun verdict. |
| PASS | deterministic-transcript | equal | equal | Două parcurgeri identice produc același traseu de stări și aceleași numere. |

Rezumat: 23/23 verificări, overall PASS.
Determinism: 2 rulări, equal=true.

## Limitări

- Nivel `targeted`: dovezile sunt deterministe (DOM propriu, fără browser real, fără ceas de perete); nu există captură Playwright sau măsurătoare FPS/GPU.
- Panoul nu pornește reluarea: afișează opțiunea, iar hostul o execută prin contractul 116.
- Stilurile sunt inline, ca să nu modifice foaia globală în afara ownership-ului PBI 126.
- Butonul „Misiuni” nu este montat încă în HUD-ul din `src/app`: fișierul nu a fost atins, pentru că montarea cere un host cu citirea 125, care rămâne a integrării.