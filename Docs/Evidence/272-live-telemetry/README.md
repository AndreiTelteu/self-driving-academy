# 272 — telemetry, opportunities and eligibility from live driving

Implementarea locală a writer-ului live peste contractele 085–088 și segmentele 069 ale 271.
Owner-ul de contract este `src/telemetry/live-telemetry.ts`; adaptorul de compunere este
`src/app/live-telemetry.ts`. Compunerea V3 rămâne singurul owner al tick-ului, fizicii și
vehiculelor, iar 271 rămâne singurul owner al segmentelor.

## Ce s-a livrat

- `createLiveTelemetry` scrie eșantioane 085 la 60 Hz pentru segmentele MANUAL/LEARNING, cu input
  brut, comandă filtrată, viteză, bandă, semnal și clasă, și un inel columnar mărginit pentru toate
  taxiurile și civilii, indiferent de cameră sau selecție.
- Oportunitățile 086 se deschid din linia STOP a benzii, mișcarea reală a semnalului 036 construit din
  harta 032 și schimbarea reală între benzi vecine din graful 033. Urmărirea este contextul `LEADER`
  al ferestrelor 087 (contractul 108 nu are un tip 086 dedicat).
- Ferestrele 087 folosesc suspensiunea 070, liderul/queue 048, semnalul 036, ieșirea verde blocată,
  cererea mecanică 023 și impactul 028/030. Camera 017 este folosită doar pentru observabilitatea
  stimulului jucătorului.
- Artefactele 088 sunt evaluate la pauză, focus pierdut, teleport/recuperare și închiderea
  segmentului; prefixul utilizabil rămâne separat de partea suprimată.
- Deduplicarea este pe `opportunity.id + occurrence`; `duplicateObservations` numără cadrele
  repetate, iar `eligibleOccurrences` numără aparițiile unice.
- `readClosedSegment`, `readWorldSamples` și `readFollowEpisodes` expun datele către 273. Nu se
  creează joburi, estimatoare, profiluri sau XP.

## Dovezi deterministe

`npm run telemetry:live` scrie [report.json](report.json) și [report.md](report.md). Rezultatul este
**12/12 PASS**:

- 58/58 taxiuri și civili contribuie, 10 440 de rânduri world pentru 180 tick-uri, fără cameră sau
  selecție, plus un episod de urmărire deduplicat pe vehicul + lider + achiziție;
- 90 eșantioane MANUAL, 0 demonstrații; 60 eșantioane LEARNING, un segment închis și 61 eșantioane
  citibile prin `readClosedSegment`;
- o oportunitate STOP rezolvată `STOPPED`, o singură apariție și 5 cadre duplicate; fereastră
  `ELIGIBLE/FREE_TRAFFIC`;
- o oportunitate de semnal real `GREEN`, fereastră `ELIGIBLE/FREE_TRAFFIC`;
- artefacte `SUSPENSION_FOCUS_LOST` și `RECOVERY_TELEPORT`, prefix de 39 tick-uri;
- inel world 1024/1024 cu 176 rânduri aruncate, memorie 86 030 B;
- amprenta profilului `4ec212b3…e518`, 0 publicări, 0 joburi, 0 schimbări XP.

## Cost și memorie

`npm run telemetry:live:cost` scrie [cost.json](cost.json). Pe AMD Ryzen 7 7735U / Node 24.19.0,
58 vehicule și un segment MANUAL:

- writer p50 **0,35 ms**, p95 **0,51 ms**, p99 **0,77 ms**, max **1,39 ms** per tick;
- compunerea V3 p95 **5,58 ms** per tick, măsurată separat;
- memorie deținută **1 882 706 B** din bugetul **33 554 432 B**, `withinBudget: true`;
- heap măsurat cu `--expose-gc` este raportat separat, nu ca total exact.

Eticheta este `PROVISIONAL_UNCALIBRATED`; nu este o măsurătoare FPS/GPU/hardware.

## Teste țintă

- `tests/telemetry/live-telemetry.test.ts` — 6 teste: eșantioane 60 Hz + whole fleet, STOP real și
  deduplicare, semnal 036, MANUAL în metrici, artefacte pauză/focus/teleport, buffer mărginit și
  hot path fără JSON.
- `tests/app/live-telemetry.test.ts` — 3 teste de integrare: 58/58 vehicule, MANUAL→LEARNING→AUTO
  cu segment închis expus, teleport cu prefix utilizabil.

## Limitări

- Regulile live de trafic 283 nu opresc încă vehiculele la semnal; semnalul este cel al
  controller-ului 036 construit din harta reală, nu o regulă de conducere live.
- Pentru AI, 058 nu expune un cadru de input brut; rândurile world pentru AI folosesc proiecția
  normalizată a accelerației și vitezei unghiulare, nu o intenție de pedală publicată de controller.
- Nu există owner de ocluzie live; conul camerei este conservator, iar ultimele 4 m dinaintea liniei
  de oprire nu mai sunt reevaluate pentru a nu transforma un stimul deja observat în
  `NOT_OBSERVABLE`.
- Recuperarea/teleportarea este dovedită prin faptul 030 injectat de host; producătorul live rămâne
  282.
- Proba de browser este **NOT_RUN**: `PLAYWRIGHT_MODULE` nu este setat și Playwright nu este
  instalat în acest checkout. Nu se pretinde captură sau FPS.
- Costul este software, pe un singur laptop; nu certifică hardware-ul jocului integrat.

## Verificări

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
| `npm run check:architecture` | PASS |
| `npm run composition:report -- --check` | PASS |
| `npm run docs:check -- --check` | PASS |
| `npm run telemetry:live` | 12/12 PASS |
| `npm run telemetry:live -- --check` | PASS |
| `npm run telemetry:live:cost` | p95 0.51 ms, 1.88 MB |
