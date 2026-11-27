# Telemetria live, oportunități și eligibilitate — PBI 272

`createLiveTelemetry` din `src/telemetry/live-telemetry.ts` și adaptorul
`createLiveTelemetryComposition` din `src/app/live-telemetry.ts` compun writer-ul live peste
contractele deja livrate 085, 086, 087 și 088. Modulul nu are ceas, renderer, DOM sau fizică
proprie: fiecare tick fix este furnizat de compunerea V3 și de owner-ul 271.

## Ce înregistrează

- **Segmentele 069 MANUAL/LEARNING** deschid un segment 085 la exact `startTick`-ul acceptat de 271
  și îl închid cu același motiv 069. Fiecare sample conține inputul brut, comanda filtrată, viteza,
  banda, semnalul autoritativ și clasa vehiculului; `learningEligible` este fixat la deschidere.
- **Toată flota** — toate taxiurile și civilii, indiferent de cameră, selecție sau autoritate —
  scrie câte un rând într-un inel columnar mărginit. Un vehicul din afara camerei nu este filtrat:
  camera este doar o sursă de observabilitate pentru fereastra jucătorului, niciodată un filtru de
  simulare. Un vehicul fără `laneId` în compunere este atribuit benzii celei mai apropiate din graful
  033, fără să modifice starea compunerii. Pentru AI, 058 nu publică un cadru de input brut, deci
  `raw`/`command` sunt proiecția normalizată a accelerației și vitezei unghiulare autoritare; pentru
  jucător, ambele sunt exact intenția și comanda filtrată ale tick-ului.
- **Oportunitățile 086** provin din contextul real: linia STOP a benzii, mișcarea semaforului 036
  pentru banda de intrare și schimbarea reală între benzi vecine. Urmărirea (leader/follower) este
  contextul `LEADER` al ferestrelor 087, așa cum contractul 108 o declară purtător (`CARRIER`), nu un
  tip nou de oportunitate. Fiecare apariție fizică are un singur `opportunity.id` și un singur
  `occurrence`; cadrele repetate nu schimbă numitorul.
- **Ferestrele 087** sunt clasificate din faptele live: suspensiune 070, lider/queue 048, semnal 036,
  ieșire verde blocată, cererea mecanică față de capacitatea clasei 023 și impactul 028/030. Pentru
  segmentul jucătorului, observabilitatea folosește conul camerei 017; pentru celelalte vehicule,
  contextul local este declarat observabil, iar `AUTO` rămâne exclus prin construcție. MANUAL rămâne
  în metrici, dar fereastra lui este `MANUAL_SEGMENT`/`EXCLUDED` și nu produce demonstrație.
- **Artefactele 088** sunt evaluate la suspendare, la pierderea focusului, la recuperare/teleport și
  la închiderea segmentului. Pauza și focusul nu devin reacții lente; teleportul taie prefixul și
  păstrează dovada 030 (`operationId`, punct, hartă, bandă, mod, tick validat). O fereastră
  `PREFIX_ELIGIBLE` rămâne utilizabilă doar înaintea primului artefact.

## Deduplicare

Cheia este `opportunity.id + opportunity.occurrence`. `seenOccurrences` este mărginit
(`dedupeEntries`, implicit 4096) și numără separat aparițiile unice de cadrele duplicate. Un segment
închis expune `eligibleOccurrences` calculate pe această cheie, nu pe numărul de eșantioane. Același
flux observat la 10 Hz și la 60 Hz produce același număr de apariții; diferă doar
`duplicateObservations`.

## Buffer, memorie și hot path

| Limită | Valoare implicită |
| --- | --- |
| Eșantioane per segment 085 | 4096 × 114 B |
| Segmente 085 reținute | 8 |
| Rânduri inel world | 65 536 (minimum 1 024, maximum 262 144) |
| Identități internate în inel | 4096 |
| Oportunități / ferestre / artefacte | 4096 fiecare (contractele 086–088) |
| Buget RAM raportat | 33 554 432 B (`recorderRamBytes`) |

Hot path-ul scrie doar array-uri prealocate; nu serializează JSON per tick. Cheile stabile ale 086
sunt atinse numai când contextul real se schimbă, nu la fiecare cadru. `getStats().memory` raportează
separat bytes typed-array, identități, oportunități, ferestre și artefacte, plus `withinBudget`.
Costul local măsurat este în [Evidence/272-live-telemetry/cost.json](../Docs/Evidence/272-live-telemetry/cost.json).

## Expunere către 273

`read()` întoarce segmentul activ, segmentele închise, oportunitățile, ferestrele, evidența agregată
și `learning: { workspace: 'TELEMETRY_272', profilePublications: 0, jobs: 0 }`.
`readClosedSegment(segmentId)` materializează la cerere sample-urile 085, oportunitățile, ferestrele
și fereastra 088. `readWorldSamples(query)` expune inelul whole-fleet. `readFollowEpisodes()` expune
episoadele de urmărire deduplicate pe vehicul + lider + achiziție, nu pe cadre.

Modulul **nu** rulează estimatoare, nu creează joburi, nu publică profiluri și nu scrie XP. Acelea
rămân 273/274.

## Ce NU este

- Nu este un al doilea model de simulare, segment, oportunitate sau ledger: refolosește 085–088.
- Nu impune reguli de trafic live (283) și nu înlocuiește fizica (282). Semnalul este cel al
  controller-ului 036 construit din harta reală; traficul live încă nu este oprit de el.
- Nu are proprietar de ocluzie live; conul camerei este conservator, iar un stimul foarte apropiat
  de linia de oprire nu mai este reevaluat în ultimele 4 m pentru a nu transforma apropierea deja
  observată într-un `NOT_OBSERVABLE` târziu.
- Nu pretinde FPS, GPU sau hardware; costul este local, software, `PROVISIONAL_UNCALIBRATED`.

## Verificare

```powershell
npm run telemetry:live
npm run telemetry:live -- --check
npm run telemetry:live:cost
node --import ./scripts/register-typescript.mjs --test tests/telemetry/live-telemetry.test.ts
node --import ./scripts/register-typescript.mjs --test tests/app/live-telemetry.test.ts
```
