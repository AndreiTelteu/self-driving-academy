---
id: "148"
title: "Audio motor frâne anvelope și impact"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["145","028","009"]
performance_checks: ["memory", "frame"]
owner: "loop-pbi/audio-148-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: '2026-10-22T15:05:12.6619031+03:00'
completed_at: '2026-10-22T15:57:20.7862494+03:00'
---

# 148 Audio motor frâne anvelope și impact

## Obiectiv

Leagă sunetele de viteza, sarcina și contactele fizice.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 145 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Audio pornește după gestul jucătorului și are volume separate.
- [x] Mute nu afectează simularea sau informațiile esențiale vizuale.

- [x] Vocile și bufferele audio au plafon și ownership; vehiculele neaudibile nu consumă toate aceeași procesare audio.

## Verificare

Testează start audio, mute, impact și disposal.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: motorul audio real este în `src/audio/` (fostul stub `src/audio/index.ts`
a fost înlocuit cu implementarea completă): `contracts.ts` (categorii, cue-uri, `AUDIO_LIMITS`
`148-audio-v1`), `ports.ts` (portul de backend), `engine.ts` (mixaj, pool de voci, ownership,
audibilitate, mute, disposal), `fake-backend.ts` (driver fals determinist pentru Node),
`web-audio-backend.ts` (adaptor Web Audio izolat, context creat doar la `resume()`),
`procedural.ts` (sinteză deterministă a bufferelor placeholder) și `collision-bridge.ts`
(puntea cu evenimentele `COLLISION` din 028). Sunetele sunt legate de viteză (`speedMps`),
sarcină (`loadFactor`), frână (`brakeFactor`), anvelope (`slipFactor`) și contactele fizice
(impulsul din evenimentul 028); distanța față de ascultător decide audibilitatea. Contextul audio
nu există înainte de `startFromUserGesture`, iar înainte de gest motorul este `IDLE` și refuză
cue-urile. Mixerul are `master` + trei bus-uri independente (`engine`, `impact`, `ui`), persistate
prin setările 009 în grupul nou `RuntimeSettings.audio` (niveluri 0–1 și `muted`), fără revizie
nouă a preferințelor de control. Mute pune câștigul de ieșire pe zero și lasă neatins tick-ul,
fizica, telemetria, evenimentele și HUD-ul. Plafoanele sunt explicite (6/4/4/14 voci, 6 vehicule
audibile, 8 buffere, 1 MiB), furtul de voce este determinist, ownership-ul se eliberează prin
`releaseVehicle` și `dispose`, iar vehiculele neaudibile nu primesc voce și nu generează buffere.
Nicio dependență nouă în `package.json` (doar scriptul `audio:engine`).

Verificări executate și rezultat: `npm run typecheck` PASS (exit 0); `npm run lint` PASS (exit 0);
`npm run format:check` PASS (exit 0); `npm run check:architecture` PASS (275 fișiere TypeScript,
probele negative 6+4+3); `npm test` PASS — **1918 teste, 1918 pass, 0 fail**; teste țintate
`node --import ./scripts/register-typescript.mjs --test "tests/audio/*.test.ts"` — **13 teste,
13 pass, 0 fail** (start după gest, mute izolat, volume separate, impact 028, plafon de voci cu
furt determinist, inaudibil vs audibil, disposal/ownership, expirare one-shot, adaptor Web Audio,
persistența nivelurilor în 009); `npm run audio:engine` — raport 26/26 verificări PASS, 6 scenarii,
plus măsurătorile scrise în `Docs/Evidence/148-audio-engine/measurements.json`. Logul complet cu
ieșirile reale este în `Docs/Evidence/148-audio-engine/commands.txt`.

Cost suplimentar măsurat (memory + frame, nivel `targeted`): metodă de cost local pe fixture
determinist în Node (`148-audio-fixture-v1`, 70 vehicule = 30 taxiuri + 40 civili, 24 în raza
audibilă), 600 tick-uri × 5 repetări, mediana: baseline 2,19 µs/tick fără audio, 39,86 µs/tick cu
audio, deci **+37,67 µs/tick** (0,7% din bugetul de tick autoritar p95 5,5 ms și 0,4% din bugetul
de fir principal p95 10 ms din manifestul 203-initial-1); heap reținut cu motorul viu: +23 888 B
în ultima rulare (zgomot GC între 24 KB și 733 KB între rulări, explicat în Doveze); buffere audio
deținute: 44 100 B, adică 4,2% din plafonul explicit de 1 MiB. Alți agenți rulează în paralel pe
aceeași mașină, deci cronometrarea este zgomotoasă: se raportează ordinea de mărime, nu o valoare
exactă. Nu s-a folosit FPS headless ca dovadă hardware.

Fișiere și documente actualizate: `src/audio/{contracts,ports,engine,fake-backend,web-audio-backend,procedural,collision-bridge,index}.ts`;
`src/settings/{contracts,store}.ts` (grupul `audio` al setărilor 009, cu valoare implicită pentru
snapshoturile legacy); `src/ui/{game-settings-format,control-sliders-format}.ts` (candidatele de
setări păstrează grupul `audio`); `tests/audio/{audio-engine.test.ts,audio-settings.test.ts,audio-engine-report.ts,audio-performance.ts,audio-fixture.ts}`;
`scripts/run-audio-engine-report.mjs`; `package.json` (scriptul `audio:engine`);
`Docs/16-asseturi-vizual-si-audio.md` (secțiunea „Contractul audio 148”);
`Docs/runtime-settings.md` (grupul audio al setărilor); `Docs/Evidence/148-audio-engine/{README.md,report.json,report.md,measurements.json,commands.txt}`;
`tests/app/{game-settings,key-remapping}.test.ts` (lista de câmpuri a setărilor include acum `audio`).

Limitări sau follow-up: (1) bufferele audio sunt **placeholder-uri procedurale** generate
determinist, identificate explicit ca atare, nu asseturile finale înregistrate ale modulului 16 —
înlocuirea cu înregistrările reale nu schimbă contractul motorului; (2) măsurătorile sunt un cost
local pe fixture, nu un gate hardware de FPS, și sunt afectate de concurența altor procese de pe
mașină; (3) integrarea motorului în composition root-ul browserului (buton de pornire audio,
legarea buclelor de tick și a pozițiilor vehiculelor) nu este făcută în acest PBI — contractul
modulului este complet și testat, dar declanșatorul din UI rămâne follow-up; (4) manifestul 203
nu are o capacitate calibrată pentru audio, așa că plafonul provine din contractul propriu
`AUDIO_LIMITS`, conform `nullCapacityPolicy`; (5) grupul `audio` al setărilor 009 este tolerat
la citire pentru snapshoturile legacy, fără migrare implicită a celorlalte câmpuri.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '148' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22T15:05:12+03:00: PBI preluat de `loop-pbi/audio-148-01`; implementarea motorului audio,
  testele țintate, raportul determinist și măsurătorile de cost local au fost executate.

- 2026-10-22T15:57:20+03:00: implementarea, testele țintate (13/13), suite completă (1918/1918),
  raportul determinist (26/26) și măsurătorile de cost local au trecut; status Done, mutat fizic
  în PBI/Done; `Validate-Board.ps1 -RequireDone '148'` executat după mutare, rezultatul în
  `Docs/Evidence/148-audio-engine/commands.txt`.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

Scenarii afectate și rezultat: pornirea audio după gest, mute izolat, impactul din 028, plafonul de
voci, disposal-ul, vehiculul neaudibil vs audibil și persistența volumelor în 009 — toate
acoperite de testele țintate și de raportul `npm run audio:engine` (26/26 PASS). Probe full/soak
nu au fost rulate: schimbarea nu atinge rendererul, fizica, schedulerul sau copierile mari, iar
costul suplimentar a fost măsurat local pe fixture; performanța jocului integrat rămâne
nevalidată până la gate-urile 220/224.
