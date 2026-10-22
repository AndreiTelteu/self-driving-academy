# Dovezi 118 — demonstrația primei misiuni cu dovezi

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform
[politicii proporționale](../../validation-policy.md). Nu se revendică FPS, GPU, Rapier, soak sau
hardware; proba de browser nu este necesară pentru acest contract, pentru că obiectivul este un
contract de domeniu fără UI, fără DOM și fără efect în `main.ts`.

## Ce s-a livrat

- `src/app/mission-demo.ts` — contractul `118-mission-demo-v1`: etapa 2 a campaniei
  (`campaign-2-first-demonstration`, definiție 116) ca traseu real de learning. Rulează segmentul
  LEARNING prin coada 103, poarta 102, compoziția 112, versiunea 109 și activarea 110, citește
  explicația 104 din același job/outcome și produce acțiunea „Vezi un exemplu" etichetată.
- `src/app/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-demo-fixture.ts` — fixture care construiește dovezile reale: recorderul
  real 085, registrul real 086, ferestrele reale 087, filtrul real 088, ledgerul real 093 și
  estimatoarele reale 097/098.
- `tests/missions/mission-demo.test.ts` — 10 teste deterministe (dovezi suficiente, segment fără
  dovezi, etichetarea exemplului, exemple 105, refuzul misiunii străine, refuzul exemplului live
  invalid, segment MANUAL, segment neeligibil, versiune publicată fără activare observată,
  transcript determinist).
- `tests/missions/mission-demo-report.ts` + `scripts/run-mission-demo-report.mjs` — raport
  determinist cu 66 de verificări, 5 scenarii și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat în
  V1 (PBI 118): demonstrația primei misiuni".
- `package.json` — scriptul `missions:demo`, adăugat la finalul blocului `scripts`.
- `PBI/Done/118-mission_demo.md` — taskul mutat fizic în Done.

## Traseul cu dovezi suficiente: contractele reale din lanț

Lanțul este executat cap la cap, fără nicio valoare fabricată:

1. **069** — segment LEARNING eligibil, închis explicit.
2. **085** — recorderul real de mostre de tick înregistrează segmentul (300 de eșantioane reale,
   `RIDE_COMPLETED`).
3. **086** — registrul real de oportunități produce 4 oportunități STOP reale, fiecare deschisă de
   un eveniment `STOP_APPROACH` și închisă de un `FULL_STOP`; numitorii 086 sunt cei reali.
4. **087** — ferestrele reale de eligibilitate clasifică fiecare oportunitate: etichetă `FREE_TRAFFIC`,
   clasă `ELIGIBLE`, mod `LEARNING`, expunere reală de 40 de tick-uri pe fereastră.
5. **088** — filtrul real de artefacte produce fereastra `PREFIX_ELIGIBLE` a segmentului închis.
6. **093** — ledgerul real de dovezi este hrănit cu aceleași fapte și întoarce read model-ul real:
   `READY`, 4 episoade distincte pentru `stop_full_probability`.
7. **097/098** — estimatoarele reale rulează pe aceleași fapte. **098** produce candidatul real
   `CANDIDATE` cu valoarea `1` (4 opriri complete din 4 opriri la linie, numitorul 086 fiind 4).
   **097** rulează și el și **refuză** în mod real, pentru că nu a fost observată nicio oportunitate
   RED: statut `REFUSED`, motiv `ZERO_CERTAIN_RED_DENOMINATOR`.
8. **103** — coada reală primește jobul, estimatorul real propune valoarea, compoziția serială
   produce `stop_full_probability = 0.8` pornind de la baza `0.6`.
9. **102** — poarta numerică acceptă delta (valoare finită, intervalul 092 respectat, cheie de
   învățare, versiune de bază și versiune de engine corecte).
10. **112** — pipeline-ul real derivează versiunea `segment-118-demo~112` din părintele
    `city-profile-118-base` și publică activarea 110 pentru tickul comun următor.
11. **109** — magazinul real păstrează istoricul `city-profile-118-base -> segment-118-demo~112`.
12. **110** — activarea reală este aplicată la tickul 1 și actualizează toate cele 64 de vehicule
    (24 de taxiuri și 40 de civili); versiunea flotă devine `segment-118-demo~112`.
13. **104** — cadrul explicației este `CHANGED`, cu `versionId` = compoziția 103
    (`city-profile-118-base~103.1`), context `FREE_TRAFFIC` și 4 episoade efective.

Numerele raportate (nu valori țintă, ci rezultate reale):

| Măsurătoare | Valoare |
| --- | --- |
| Eșantioane 085 în segment | 300 |
| Oportunități 086 STOP | 4 |
| Ferestre 087 | 4 |
| Fereastră 088 | `PREFIX_ELIGIBLE` |
| Read model 093 | `READY`, 4 episoade distincte |
| Candidat 098 | `CANDIDATE`, valoare 1 |
| Candidat 097 | `REFUSED`, `ZERO_CERTAIN_RED_DENOMINATOR` |
| Valoare de bază → valoare publicată | 0.6 → 0.8 (delta 0.2) |
| Versiune 109 | `segment-118-demo~112` (părinte `city-profile-118-base`) |
| Activare 110 | `APPLIED` la tickul 1, 64 de vehicule actualizate |
| Explicație 104 | `CHANGED` |

## Segmentul fără dovezi: no-change explicat

Cu zero cicluri STOP, ledgerul real 093 întoarce `NO_EVIDENCE` (0 episoade), estimatorul real 098
refuză în mod real (`ZERO_ELIGIBLE_STOP_DENOMINATOR`), iar estimarea 101 ține valoarea de bază:

- pipeline 112: `NO_CHANGE`, **fără** versiune 109 și **fără** comandă 110 (magazinul are doar
  versiunea de bază, controllerul are 0 comenzi);
- explicația 104: `NO_CHANGE`, `versionId: null`, motiv închis `NO_NEW_EVIDENCE` și contextele lipsă
  enumerate (`stop_full_probability: NO_NEW_EVIDENCE (0 episoade efective, 0 distincte)`);
- rezultatul misiunii: `NO_CHANGE`, cu `justifiedDelta: false` și `observedActivation: false`.

Segmentul MANUAL și segmentul LEARNING neeligibil sunt respinse înainte de coadă (`SKIPPED_MANUAL`,
respectiv `SKIPPED_INELIGIBLE`), fără job, fără versiune și fără activare. O versiune publicată fără
activare observată (o comandă 110 pendingă blochează publicarea) nu este o demonstrație: rezultatul
este `REJECTED` cu motivul închis `ACTIVATION_NOT_OBSERVED`, delta rămâne justificat, dar
`observedActivation` este fals.

## Acțiunea „Vezi un exemplu": etichetarea

| Situație | Etichetă | Origine | Efect al jucătorului |
| --- | --- | --- | --- |
| Versiune publicată | `LIVE` — „Exemplu live" | `109-profile-store-v1` | da (`isPlayerEffect: true`) |
| Fără versiune publicată | `EXPERIMENT` — „Exemplu din experimentul 105" | `105-inverse-learning-v1` | nu (`isPlayerEffect: false`) |

Exemplul `LIVE` poartă proveniența 109: versiune, versiune de bază, checksum, adâncime, segment
sursă și schimbările de parametri. Exemplul `EXPERIMENT` folosește profilurile cunoscute din
experimentul invers 105 (`PRUDENT`, `IMPULSIVE`, `RECKLESS`, `MIXED`), cu descrierea explicită că
este o referință de calibrare și nu efectul jucătorului.

## Verificări executate și rezultat

Toate comenzile au fost rulate în worktree-ul `missions-118-120-01` (Node 24.19.0, npm 11.17.0):

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | EXIT 0 (fără erori `tsc` în `src` și `tests`) |
| `npm run lint` | EXIT 0 (`eslint . --max-warnings 0`) |
| `npm run format:check` | EXIT 0 („All matched files use Prettier code style!") |
| `npm run check:architecture` | EXIT 0 (281 fișiere TypeScript, 13 sonde negative PASS) |
| `npm run check:parameter-catalog` | EXIT 0 („Parameter catalog is synchronized.") |
| `npm test` | **1986 teste, 1986 pass, 0 fail** (73,5 s) |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-demo.test.ts"` | 10 teste, 10 pass, 0 fail |
| `npm run missions:demo` | 66/66 verificări PASS, 5 scenarii, `overall PASS`; a scris `report.json` și `report.md` |

Transcrierea deterministă a raportului este în [report.json](report.json) și
[report.md](report.md).

Notă de mediu: worktree-ul a fost livrat fără `node_modules` (indexul git și fișierele erau
incomplete, cu un `index.lock` rămas), așa că `node_modules` a fost legat ca director-joncțiune la
`node_modules` din checkout-ul canonic. Nicio comandă `npm install`/`npm ci` nu a fost rulată în
niciun checkout; sucul de dependențe al proiectului nu a fost modificat.

## Fișiere atinse

- `src/app/mission-demo.ts` (nou), `src/app/index.ts` (exporturi).
- `tests/missions/mission-demo-fixture.ts` (nou), `tests/missions/mission-demo.test.ts` (nou),
  `tests/missions/mission-demo-report.ts` (nou).
- `scripts/run-mission-demo-report.mjs` (nou), `package.json` (scriptul `missions:demo`).
- `Docs/13-misiuni-si-progres.md` (contractul 118), `Docs/Evidence/118-mission-demo/` (dovezi).
- `PBI/To Do/118-mission_demo.md` → `PBI/In Progress/118-mission_demo.md` → `PBI/Done/118-mission_demo.md`.

## Limitări

- Cele două scheme de identitate de fereastră ale contractelor actuale diferă: 087 produce
  `eligibility-entry:*`, iar 088 produce `telemetry-window:*`, în timp ce 093 și 098 cer aceeași
  identitate pe ambele înregistrări. Fixture-ul leagă fereastra reală 088 de fereastra reală 087 a
  aceleiași oportunități; nu se inventează nicio valoare, oportunitate, tick sau estimare. Reconcilierea
  este limitată la câmpul de identitate și este documentată în fixture.
- Transportul workerului 103 este un port injectat care răspunde cu rezultatul real 101
  `blendProfileValue`; coada, guvernorul 221, poarta 102, pipeline-ul 112, magazinul 109, activarea
  110 și explicația 104 rulează real. Nu este implicat niciun fir `worker_threads` și niciun browser.
- Lumea demonstrației este flota deterministă (24 de taxiuri și 40 de civili); raportul nu certifică
  bucla de joc integrată, continuitatea fizică sau o sesiune cu un om.
- Segmentul demonstrează valoarea de bază a profilului curent (`baseValue`). Un segment ulterior
  trebuie să declare valoarea de bază curentă a capului acceptat, altfel pipeline-ul 112 compară
  valoarea compusă cu valoarea capului și derivează o versiune; contractul 118 nu schimbă această
  regulă a 112.
- Nu se măsoară FPS, frame, GPU sau hardware.
- Nu sunt în contract: UI-ul de misiuni, XP-ul, persisterea și compoziția cu `main.ts`.
