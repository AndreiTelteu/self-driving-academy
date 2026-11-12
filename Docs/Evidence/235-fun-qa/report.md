# 235 — regresii și playtest pentru distracție și revenire

Raport determinist generat de `scripts/run-fun-qa-report.mjs` cu `npm run qa:fun`.
Machine-readable: [report.json](report.json); măsurătorile reale ale sondelor: [probes.json](probes.json).

Fiecare verdict este derivat din raportul real al probei citate, nu din copierea unei valori observate; mecanismul dovedit și ipoteza de retenție sunt coloane separate, iar `NOT_RUN` nu se transformă niciodată în procent.

## Verdictul agregat

**6 criterii: 4 PASS, 1 FAIL, 1 NOT_RUN.**
**16 sonde: 15 PASS, 1 FAIL, 0 NOT_RUN.**

Nivel de validare: `soak`; playtest `NOT_RUN`; retenție `NOT_RUN`; frame `NOT_VALIDATED`.
Politica de validare 2026-10-08: PBI-ul cere soak pentru stabilitate, dar playtestul uman și retenția nu pot fi executate de un agent. Gate-ul 224 păstrează FPS-ul pe hardware real `NOT_VALIDATED`.

| ID | Verdict | Criteriu | Sonde |
| --- | --- | --- | ---: |
| C1 | PASS | Scenariile combinate Academie/Haos, learning/slidere, R/reset, distrugere, provocări/daily și savefile trec fără contaminarea progresului | 12 |
| C2 | PASS | XP/nivel nu scad prin accidente/KPI/eșec; evenimente duplicate, joburi stale, schimbarea zilei și importul nu dublează credite | 7 |
| C3 | FAIL | HUD/camera first-person și sliderele sunt confortabile în două clase și accesibile la 1280×720; feedbackul destructibil este verificat vizual/audio | 6 |
| C4 | PASS | Benchmarkul 224 include toate noile sisteme și 20 de cicluri reset/sesiune; păstrează măsurători reale, plafoane și limitări | 7 |
| C5 | NOT_RUN | Playtest cu minimum cinci participanți acoperă condus liber, prima schimbare de stil, distrugere și reluarea unei provocări; consemnează cine reîncearcă spontan și de ce | 0 |
| C6 | PASS | Eșecurile/limitările de experiență sunt explicite; rezultatele nu declară return rate fără sesiuni de revenire măsurate | 1 |

## Sondele executate

| Sondă | PBI | Ce acoperă | Comandă | Verdict | Trecute | Rezultat real |
| --- | --- | --- | --- | --- | --- | --- |
| qa-216 | 216 | Regresia V1: moduri, KPI, daily, XP, replay | `npm run qa:v1-regression` | PASS | 27/29 | 29 rânduri, 27 PASS, 0 FAIL, 2 NOT_RUN; XP 200.5 → 200.5, pierderi 0, debitări 0 |
| scenarios-151 | 151 | Suita de scenarii V1 pe patru familii | `npm run scenarios:v1` | PASS | 12/12 | 13 scenarii, 12 executate, 12 PASS, 0 FAIL, 1 NOT_RUN; seed fix, fără ceas de perete |
| e2e-152 | 152 | Sesiunea integrală: profil → cursă → learning → KPI → daily → XP → export → restart | `npm run e2e:session` | PASS | 104/104 | 11 pași, 104 verificări, 0 FAIL; restart XP 200.5 → 200.5, nivel 2 → 2 |
| gate-224 | 224 | Gate de performanță și soak: toate sistemele noi | `npm run perf:gate` | PASS | 16/17 | 17 rânduri, 16 PASS, 0 FAIL, 1 NOT_VALIDATED; structural PASS, release NOT_VALIDATED; soak 60.001 min / 20 cicluri |
| session-kinds-225 | 225 | Academie și Haos: două sesiuni separate | `npm run session:kinds` | PASS | 45/45 | 20 tranziții (10 Academie / 10 Haos), 20 checkpointuri comise, lumi orfane 0, joburi orfane 0 |
| world-recovery-226 | 226 | R, resetul orașului și restaurarea stilului | `npm run world:recovery` | PASS | 65/65 | RECOVERED în 0 tick-uri; 20 reseturi, 0 eșuate, corpuri 64, XP 500000 micro-XP neschimbat |
| destructible-227 | 227 | Decor destructibil și zone de joacă | `npm run world:destructibles` | PASS | 24/24 | 3 zone, 35 obiecte, 20 cicluri de reset cu 1 checksum distinct |
| destruction-feedback-228 | 228 | Feedback audio-vizual și replay al distrugerii | `npm run world:destruction-feedback` | PASS | 20/20 | 6 profiluri de material, 24 reacții/incident, 4 voci impact; replay 3/3 evenimente, 0 inventate, 0 pași de simulare |
| challenge-233 | 233 | Reluare, recorduri, recompense și daily pentru provocări | `npm run missions:challenge-experience` | PASS | 55/55 | 2 credit, 1 duplicat cu 0 XP, 4 rânduri de record, reluare RESTARTED la încercarea 2 |
| savefile-234 | 234 | Savefile cu checksum și încărcare atomică | `npm run save:file` | PASS | 84/84 | 84 verificări, 174732 B din 12285272 B, checksum 64 caractere, 2 sesiuni, 35 obiecte de decor |
| control-sliders-229 | 229 | Sliderele de control și camera first-person | `npm run ui:control-sliders` | PASS | 53/53 | 53 verificări, camera FIRST_PERSON, două clase (sedan + compact), layout 1280×720, contrast minim 11.13:1 |
| style-sliders-230 | 230 | Sliderele de stil, publicare, stale și separarea sesiunilor | `npm run ui:style-sliders` | PASS | 70/70 | 70 verificări, 2 versiuni Academie / 2 Haos, draft invalidat la schimbarea sesiunii |
| daily-212 | 212 | Daily: ofertă, refuzuri și schimbarea zilei | `npm run missions:daily-progress` | PASS | 26/26 | 26 verificări, 1 recompense reținute, 5 refuzuri, 0 XP acordat |
| responsive-084 | 084 | Layout responsive la 1280×720 și 1920×1080 | `npm run ui:responsive` | PASS | 42/42 | 42 verificări de layout responsive, 42 trecute |
| accessibility-083 | 083 | Contractul de accesibilitate al suprafețelor UI | `npm run ui:accessibility` | PASS | 53/53 | 53 verificări pe 7 scenarii; contrast, focus, tab, Escape |
| ui-qa-153 | 153 | QA vizual și accesibilitate pe componentele reale din Chromium | `npm run qa:ui` | FAIL | 300/308 | 308 verificări în Chromium 156.0.8078.4, 5 verificări de contract eșuate, verdict FAIL |

## Verdict per criteriu

### C1 — PASS

Scenariile combinate Academie/Haos, learning/slidere, R/reset, distrugere, provocări/daily și savefile trec fără contaminarea progresului

  - **PASS** Academie/Haos fără contaminare: 20 tranziții (10 Academie / 10 Haos), lumi orfane 0, joburi orfane 0, 1 copie de profil
  - **PASS** R/reset separate de stil: RECOVERED la tick-ul cererii (0 tick-uri până la mobilitate), 1 închidere de scenă la 20 reseturi
  - **PASS** Learning/slidere fără schimbarea mașinii: 53 + 70 verificări; mașina, frânarea, aderența și stilul AI rămân neschimbate
  - **PASS** Distrugere și replay: 35 obiecte în 3 zone; aceeași amprentă pentru MANUAL/LEARNING/AUTO; replay 3/3 evenimente din înregistrare
  - **PASS** Provocări și daily: 55 verificări de provocări, 3 șabloane/zi în 3 familii; daily 26 verificări
  - **PASS** Savefile fără coruperea sesiunii: 84 verificări, 174732 B, 2 sesiuni, 35 obiecte de decor; al doilea import 0 XP
  - **PASS** Sesiunea integrală și regresia V1: e2e 11 pași/104 verificări, XP 200.5 → 200.5; regresie 29 rânduri, 0 FAIL; scenarii 12/12 executate în 4 familii

Progresul este citit prin amprente reale (profil, XP, daily, recompense, misiuni, dovezi) înainte și după fiecare tranziție.

### C2 — PASS

XP/nivel nu scad prin accidente/KPI/eșec; evenimente duplicate, joburi stale, schimbarea zilei și importul nu dublează credite

  - **PASS** XP fără pierderi: pierderi 0, debitări 0, amprentă identică true
  - **PASS** Resetul nu scade XP: XP 500000 micro-XP după 20 reseturi, scădere false, profil true
  - **PASS** Recompense duplicate refuzate: duplicat de provocare 0 XP; daily 5 refuzuri, 1 recompense
  - **PASS** Schimbarea zilei și rollback-ul nu dublează: rollback de calendar SKIPPED; recompensa rămâne pe identitatea familie/zi
  - **PASS** Joburi stale și importuri repetate: stale respins fără scriere true; 2 joburi invalidate la reset; al doilea import 0 XP

Amprenta XP și contoarele de refuz sunt separate: un duplicat refuzat poate crește un contor fără să plătească sau să scadă XP.

### C3 — FAIL

HUD/camera first-person și sliderele sunt confortabile în două clase și accesibile la 1280×720; feedbackul destructibil este verificat vizual/audio

  - **PASS** Două clase și camera first-person: 2/2 clase la extreme, camera FIRST_PERSON, stabilă true
  - **PASS** Layout 1280×720: încape true, derulează true; responsive 42 verificări
  - **PASS** Contrast: minim 11.13:1 din 4.5:1
  - **PASS** Feedback destructibil vizual/audio: 6 profiluri acustice, plafon 24 reacții/incident, 4 voci impact
  - **FAIL** Text lizibil la 1280×720 (153): 5 verificări de contract eșuate în npm run qa:ui: D4/camera/1280x720/text-legible, D5/kpis/1280x720/text-legible, D6/kpis/1280x720/text-not-clipped, D7/kpis/1920x1080/text-legible, D8/kpis/1920x1080/text-not-clipped

Confortul subiectiv rămâne neexecutat (vezi C5). Verificările de contract ale 153 sunt citite din dovezile comise: 5 eșecuri reale de text (11,52 px pe panoul camerei, 11 px și 4 etichete tăiate în pop-up-ul KPI).

### C4 — PASS

Benchmarkul 224 include toate noile sisteme și 20 de cicluri reset/sesiune; păstrează măsurători reale, plafoane și limitări

  - **PASS** Rândurile sistemelor noi în gate: rânduri cerute: destruction-effects-audio, challenge-director, savefile-integrity, academy-chaos-cycles, soak-60min, gameplay-systems-max-v1, fps-hardware; lipsă 0, neconforme 0
  - **PASS** Raportul gate se verifică: contractul 224 acceptă raportul (16 PASS, 0 FAIL, 1 NOT_VALIDATED)
  - **PASS** Soak 60 de minute și 20 de cicluri: 60.001 min din 60, 20 cicluri din 20, verdict SOAK_PASS
  - **PASS** Baseline neschimbat: manifest 203-initial-1, modificat false
  - **PASS** Sistemele noi reexecutate în acest raport: 20 cicluri de distrugere (1 checksum), 55 verificări de provocări, 84 de savefile, 20 tranziții, 20 reseturi

Gate-ul 224 rămâne cu release `NOT_VALIDATED`: FPS pe hardware real este `NOT_VALIDATED` și este raportat ca atare, nu dedus.

### C5 — NOT_RUN

Playtest cu minimum cinci participanți acoperă condus liber, prima schimbare de stil, distrugere și reluarea unei provocări; consemnează cine reîncearcă spontan și de ce

  - **NOT_RUN** Playtest cu minimum 5 participanți: 0/5 participanți: niciun jucător real nu a fost observat în acest PBI
  - **NOT_RUN** Condus liber, prima schimbare de stil, distrugere, reluarea unei provocări: fluxurile sunt acoperite mecanic (225–233), dar nu au fost jucate de oameni
  - **NOT_RUN** Cine reîncearcă spontan și de ce: nu există observație de sesiune umană; nu se inventează motive sau procente

Nu se pretinde playtest: 0 participanți. Ce ar fi nevoie este în secțiunea „Playtest” a raportului.

### C6 — PASS

Eșecurile/limitările de experiență sunt explicite; rezultatele nu declară return rate fără sesiuni de revenire măsurate

  - **PASS** Eșecuri de experiență explicite: 8 findings din 153, inclusiv 5 de contract, raportate cu captură și reproducere
  - **PASS** Fără return rate inventat: toate motivele de rejucare au `retention: NOT_RUN`; raportul nu conține procente sau rata de revenire
  - **PASS** Limitările neacoperite sunt enumerate: 4 limitări declarate; vezi secțiunea „Ce nu s-a măsurat”

Motivele de rejucare au două coloane separate: mecanismul dovedit și ipoteza de retenție `NOT_RUN`.

## Motive de rejucare: mecanism dovedit vs. retenție nemăsurată

Coloana „mecanism” este ce au dovedit probele. Coloana „retenție” este ce **nu** s-a măsurat: nu există
sesiuni de revenire, deci nu există procent, rată sau număr de jucători care să fie raportat.

| Motiv | Mecanism | Dovada mecanismului | Retenție |
| --- | --- | --- | --- |
| HAOS_DESTRUCTION | TESTED | 20 tranziții Academie/Haos fără lumi orfane; 35 obiecte în 3 zone, 20 cicluri de reset cu 1 checksum; 6 profiluri de material și 24 reacții/incident cu 4 voci | NOT_RUN |
| CHALLENGES | TESTED | 55 verificări de provocări, 2 credit XP, 3 șabloane exprimabile în daily; panoul are 0 listeners globali și o citire pe deschidere | NOT_RUN |
| DAILY | TESTED | 3 șabloane pe zi în 3 familii, determinist pe dată; 26 verificări daily, 1 recompense, 5 refuzuri | NOT_RUN |
| RECORDS | TESTED | 4 rânduri de record: o rulare mai rapidă îmbunătățește recordul (true), una mai lentă sau egală nu îl scade (true) | NOT_RUN |
| QUICK_RESTART | TESTED | reluarea unei provocări eșuate produce `RESTARTED` la încercarea 2, același șablon true, identitate nouă true, 0 XP; o provocare neeșuată este refuzată cu `NOT_FAILED` | NOT_RUN |

- **HAOS_DESTRUCTION**: Ipoteză neverificată: distrugerea oferă o sesiune scurtă de joacă liberă după o cursă serioasă. *Ce ar fi nevoie:* Minimum cinci participanți în Haos, cu observarea primei distrugeri și a revenirii în Academie, plus o sesiune de revenire la 24 de ore pentru a putea vorbi despre revenire.
- **CHALLENGES**: Ipoteză neverificată: o provocare scurtă oferă un punct de intrare pentru o sesiune de cinci minute. *Ce ar fi nevoie:* Playtest cu ofertă reală de provocare și măsurarea alegerii voluntare, nu doar existența catalogului.
- **DAILY**: Ipoteză neverificată: cele trei misiuni zilnice aduc jucătorul înapoi a doua zi. *Ce ar fi nevoie:* Sesiuni de revenire măsurate la 24 de ore și la 7 zile, cu același participant și aceeași ofertă zilnică.
- **RECORDS**: Ipoteză neverificată: recordul personal îl determină pe jucător să reîncerce aceeași provocare. *Ce ar fi nevoie:* Observarea reluărilor spontane după un record, cu numărul de încercări per participant; nu se deduce din existența clasamentului.
- **QUICK_RESTART**: Ipoteză neverificată: reluarea în doi pași reduce abandonul după un eșec. *Ce ar fi nevoie:* Măsurarea abandonului și a reluării într-un playtest cu eșec provocat, nu doar apelul de restart al directorului.

## Playtest — NOT_RUN

Obiectivul cere minimum 5 participanți. Rularea a avut
**0**. Fluxurile cerute sunt: condus liber în Academie și Haos; prima schimbare de stil din popup-ul de reglaje; distrugere în zonele de joacă; reluarea unei provocări eșuate.

Ce ar fi nevoie:

- Minimum cinci participanți, fiecare cu o sesiune de minimum 20 de minute.
- Un observator care notează prima schimbare de stil, prima distrugere și decizia de a relua o provocare.
- O sesiune de revenire la 24 de ore (și ideal la 7 zile) pentru orice afirmație despre revenire.
- Consimțământ și stocare locală a notițelor; fără telemetrie de identificare personală.

## Eșecuri de experiență raportate

- **D1** (STRESS) hud/zoom-200-720, `surface-inside-viewport`: A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).)
- **D2** (STRESS) fleet/zoom-200-720, `surface-inside-viewport`: A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).)
- **D3** (STRESS) profile/zoom-200-720, `surface-inside-viewport`: A surface is positioned outside the viewport. (Surfaces outside the viewport: fleet (bottom 476 > 360), notifications (bottom 384 > 360).)
- **D4** (CONTRACT) camera/1280x720, `text-legible`: Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11.52 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.)
- **D5** (CONTRACT) kpis/1280x720, `text-legible`: Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.)
- **D6** (CONTRACT) kpis/1280x720, `text-not-clipped`: Visible text overflows or is clipped by its own box. (4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".)
- **D7** (CONTRACT) kpis/1920x1080, `text-legible`: Visible text falls below the 12 CSS px / 1.4 line-height floor. (smallest visible text is 11 px with a 1.4 line-height ratio; the floor is 12 px and 1.4.)
- **D8** (CONTRACT) kpis/1920x1080, `text-not-clipped`: Visible text overflows or is clipped by its own box. (4 text nodes overflow their box: kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri", kpis:span.kpi-history__chart-group-value "fără review-uri".)

## Gate-ul 224 citat

Raportul gate-ului (commit `757e7168dfd6`, manifest `203-initial-1`,
modificat false): **structural PASS, release NOT_VALIDATED** —
16 PASS, 0 FAIL, 1 NOT_VALIDATED. Soak:
60.001 min din 60, 20 cicluri din
20, verdict `SOAK_PASS`.

| Rând | Verdict | Detaliu |
| --- | --- | --- |
| bundle-critical-transfer | PASS | 5.84 MiB (6125279 B) din 8.00 MiB; JS 3478683 B + WASM 2646596 B, gzip 1769518 B, 130 artefacte |
| bundle-regression | PASS | baseline 5.84 MiB (f5fb79fd07c7); 0/5 repetări peste >10% și >5.00 MiB; prag de confirmare 3/5 |
| capacity-render | PASS | draw calls 48/128, instanțe thin 78/8192, batchuri 40/512, obiecte Babylon 12/4096, 923 elemente randate |
| determinism | PASS | 5 builduri, 5 probe de randare; digesturi distincte: 1 build / 1 randare |
| soak-60min | PASS | 60.001 min, 20 cicluri (20 curate), 7/7 tendințe PLATEAU, heap +1.82 MiB din 5.00 MiB, coadă max 1 joburi / 4 B, throttling OBSERVED |
| fps-hardware | NOT_VALIDATED |  |
| probe-render-budget | PASS | 157: 17 PASS, 0 FAIL, 2 NOT_MEASURED; --check exit 0, captura 546fa29e5ac6 |
| probe-simulation-budget | PASS | 158: decizii PASS, estimare PASS, transferuri PASS, 3 echivalențe IDENTICAL; --check exit 0 |
| probe-traffic-benchmark | PASS | 156: 36 PASS, 0 FAIL, 12 STRESS, 60 REPORTED; --check exit 0 |
| probe-hardware-budget | PASS | 155: 85 PASS, 0 FAIL, 6 NOT_MEASURED declarate; --check exit 0 |
| probe-soak-integrity | PASS | 159: SOAK_PASS, 60.002 min, 20 cicluri, commit 917a7de9; --check exit 0 |
| gameplay-systems-max-v1 | PASS | workload maxim V1 30/40: 12 rânduri de gate, sisteme BASELINE, LEARNING, RECORDER_AUTOSAVE, XP, tick p95 maxim 7.00 ms din 8 ms |
| destruction-effects-audio | PASS | 227: 24/24 verificări, 20 cicluri de reset cu 35 corpuri; 228: 20/20, max 4 voci impact și 24 reacții/incident; 149: 32/32, 1/14 voci active. Frame: NOT_MEASURED declarat |
| challenge-director | PASS | 232: 56/56, istoric 24/24 intrări și 1071/4096 unități; 233: 55/55, 1 rând de ledger din 32, 0 listeners globali |
| savefile-integrity | PASS | 234: 84/84 verificări, fișier 174732 B din 12285272 B, payload 174113 B din ingress 16777216 B, checksum 64 B; encode/hash fără ceas de perete (declarat) |
| academy-chaos-cycles | PASS | 225: 20 tranziții (10 Academie / 10 Haos), 20 checkpointuri comise, 773 B total (max 40 B), 0 lumi/joburi orfane; 226: 20 reseturi, 0 eșuate, corpuri 64, 1 listener, lumi vii 1 |
| backend-matrix | PASS | 154: 9/9 combinații reale, 11/11 verificări deterministe, 11 combinații declarate NOT_RUN; backenduri acoperite: WEBGPU și WEBGL 2 |

## Ce nu s-a măsurat

- Playtest uman cu minimum cinci participanți: condus liber, prima schimbare de stil, distrugere și reluarea unei provocări — `NOT_RUN`, 0/5.
- Cine reîncearcă spontan și de ce — `NOT_RUN`; nu există observație de sesiune.
- Return rate / retenție la 24 de ore și 7 zile — `NOT_RUN`; nu se raportează niciun procent.
- FPS, frame p95/p99 și lucrul GPU pe hardware real, ambele backenduri — `NOT_VALIDATED` în gate-ul 224 (release `NOT_VALIDATED`).
- Memoria exactă a paginii și a GPU — `totalHeapBytes` este `null`; probele raportează contoare de ownership.
- Latența audio reală și plăcerea sunetului — 228 dovedește planul de reacție și plafoanele, nu mixerul pe hardware.
- Confortul subiectiv al camerei (motion sickness) și senzația de condus — fără jucător uman.
- Textul din 153 nu a fost recapturat aici: worktree-ul nu are Playwright, deci findings-urile D4–D8 sunt citite din dovezile comise.

## Limitări

- Nivel `soak` declarat de PBI, dar playtestul uman și retenția rămân `NOT_RUN`: niciun jucător real nu a fost observat.
- FPS/frame p95/p99 pe hardware real rămân `NOT_VALIDATED` în gate-ul 224; capturile 220 sunt pe alt build.
- Textul și contrastul din 153 sunt măsurate pe capturile comise de 153, nu recapturate aici (fără Playwright în worktree).
- Costurile de memorie sunt contoare de ownership, nu heap total; `totalHeapBytes` este `null` în manifest.
