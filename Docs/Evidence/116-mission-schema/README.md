# Dovezi 116 — definiții și lifecycle de misiuni

Status: implementare și validare funcțională locală PASS. Nivel de validare: `targeted` conform
[politicii proporționale](../../validation-policy.md) — corectitudine izolată, cost local și
integrarea cu transportul real 007 plus lanțul real 057/059/060/061/063. Nu se revendică browser,
FPS, Rapier, soak sau hardware.

## Ce s-a livrat

- `src/missions/contracts.ts` — schema `116-mission-schema-v1`, limite fixe și cititoare de contract.
- `src/missions/definitions.ts` — definiții, catalog, identități stabile 006, vocabular închis de
  obiective/recompense/stări/motive și catalogul campaniei cu opt misiuni.
- `src/missions/lifecycle.ts` — tracker sincron care consumă evenimente 007 validate, ține progresul
  pe obiective, închide starea prin completare/eșec, acordă recompense idempotent, creează reluări,
  face snapshot/restore și reset de scenariu.
- `src/missions/index.ts` — export public al modulului.
- `tests/missions/mission-fixture.ts` — evenimente 007 valide, catalog de test și lanțul real de
  curse completate de modulul 063.
- `tests/missions/mission-schema.test.ts`, `tests/missions/mission-lifecycle.test.ts` — 27 de teste.
- `tests/missions/mission-schema-report.ts` + `scripts/run-mission-schema-report.mjs` — raport
  determinist cu 23 de verificări, `report.json`/`report.md` și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 116)”: definiție, obiective, lifecycle, idempotență, reluare și limite.

## Rezultat

- Catalogul are exact opt misiuni de campanie, fiecare cu ID stabil, versiune `1`, obiective,
  recompense XP/deblocare, politică de reluare, fereastră de evaluare, buget de incidente și
  prerechizite. Ordinea campaniei este derivată din graful de prerechizite, nu din poziția în array.
- Fiecare dintre cele opt tipuri de obiectiv consumă numai evenimentul 007 real și valoarea lui:
  `DROPOFF`, `MANUAL_START`, `COLLISION`, `PROFILE_ACTIVATE`, `FULL_STOP`,
  `LANE_CHANGE_COMPLETED`, `LEADER_ACQUIRED`. Proba `objectives` din raport pornește o misiune cu
  toate cele opt obiective și le închide pe toate din evenimente reale.
- Startul creează prima încercare cu ID stabil; un al doilea start identic este `duplicate`, iar un
  start după un rezultat terminal este refuzat cu cerința de `replay`.
- Progresul prin bus-ul 007 real duce misiunea 1 din `ACTIVE` în `COMPLETED` la tick-ul 12, cu
  două recompense acordate o singură dată.
- Deduplicarea: `MANUAL_START` → `IGNORED`, repetarea lui → `DUPLICATE`, `DROPOFF` → `ACCEPTED`,
  repetarea ei → `DUPLICATE`. Progresul rămâne 1, starea rămâne `COMPLETED`, iar registrul de
  recompense rămâne la 2. Reutilizarea aceluiași `eventId` cu alt payload este refuzată.
- Eșecul prin fereastră (`advance` peste termen) produce `FAILED/EVALUATION_WINDOW_EXPIRED` la
  tick-ul 101 și un eveniment terminal târziu nu mai completează misiunea. Depășirea bugetului de
  incidente produce `FAILED/INCIDENT_BUDGET_EXCEEDED` fără recompensă.
- Reluarea creează încercarea 2 cu ID stabil, progres 0 și politica declarată `SNAPSHOT` +
  `snapshot:report-replay`, scenariul și profilele de comparație. După completare recompensele
  rămân 2; o a treia încercare completă raportează 0 recompense acordate și 2 duplicate refuzate.
- Identitățile sunt 006 stabile: `missionInstanceId(namespace, missionId, attempt)` și
  `missionRewardId(namespace, missionId, version, rewardId)`. Aceeași misiune cu versiunea `2` are
  altă identitate de recompensă.
- Snapshot/restore păstrează progresul și registrele; evenimentul deja procesat rămâne `DUPLICATE`
  după restore, iar continuarea completează misiunea. ID-urile forjate și versiunea care nu
  corespunde catalogului sunt refuzate. O instanță terminală restaurată permite reluarea.
- `reset` curăță instanțele și încercările, dar păstrează evenimentele procesate și recompensele:
  a doua completare a aceleiași misiuni nu mai acordă recompense.
- Simularea reală: trei curse din flota 057, programul 059, asignările 060, lifecycle-ul 061 și
  deciziile 063 (toate `COMPLETED`) publică trei evenimente `DROPOFF` pe bus-ul 007 real și duc o
  misiune cu prag 3 în `COMPLETED` cu 3 evenimente acceptate și 2 recompense.
- Muncă mărginită: 8256 evenimente ingerate, 4462 identități reținute (1.048.570 unități UTF-16),
  3794 eliminate FIFO, 16 ID-uri recente pe instanță și progres 8256. Un duplicat foarte vechi,
  ieșit din fereastră, este respins ca `Stale mission tick`, deci nu poate acorda progres a doua oară.
- Sursa nu conține `Date`, `performance.now`, timere, `Math.random`, DOM, Babylon sau Rapier.

Raportul complet are [23/23 verificări](report.json), tabelul uman este în [report.md](report.md),
ieșirea țintită a testelor în [tests.txt](tests.txt), iar jurnalul comenzilor în
[checks.txt](checks.txt).

## Reguli verificate

- **Evenimente reale:** trackerul nu acceptă scoruri, text HUD sau valori de frame; fiecare eveniment
  trece prin `parseSimulationEvent`, iar obiectivele citesc numai payload-ul validat.
- **Idempotență explicită:** registru mărginit de evenimente pentru progres și registru separat pentru
  recompense; duplicatul nu schimbă progresul, starea sau recompensele.
- **Recompense versionate:** identitatea include `missionId`, versiunea definiției și `rewardId`;
  o versiune nouă este o recompensă nouă, o reluare a aceleiași versiuni nu plătește din nou.
- **Rezultate terminale imuabile:** o instanță `COMPLETED`/`FAILED` nu mai primește progres; singura
  continuare este `replay`, care creează încercarea următoare.
- **Fereastră și incidente:** ambele sunt câmpuri declarate în definiție, nu reguli ascunse; tick-ul
  este cel autoritar al simulării, iar bugetul de incidente numără `COLLISION`.
- **Reluare transparentă:** definiția declară `CURRENT`/`SNAPSHOT`, snapshot-ul, scenariul și
  profilele de comparație; trackerul nu încarcă și nu modifică profiluri.
- **Restart sigur:** `restore` cere un tracker gol și validează identitatea stabilă, versiunea,
  obiectivele, țintele, declarația de reluare și recompensele.
- **Fără muncă pe frame:** trackerul nu are buclă proprie; costul apare doar la eveniment și la
  `advance(tick)`, peste cel mult 16 instanțe active.

## Comenzi și rezultate exacte

Toate verificările au rulat cu engine-ul fixat al proiectului. `npm ci` a fost executat o singură
dată la început cu Node 24.19.0 din shell (avertisment `EBADENGINE`, fără eroare); verificările de
mai jos au folosit Node 24.21.0 / npm 11.19.0 prin Volta.

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (263 TypeScript files); negative probes 6+4+3; exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1884, suites 1, pass 1884, fail 0, duration_ms 67626.61

volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test "tests/missions/*.test.ts"
# tests 26, pass 26, fail 0

volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-mission-schema-report.mjs
# SUMMARY checks 23/23, missions 8, real rides 3, overall PASS

volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-mission-schema-report.mjs --check
# Mission schema report is current: Docs/Evidence/116-mission-schema/report.json
```

## Limite

- Nu există UI/HUD de misiuni și nicio legare la `main.ts` sau la compoziția aplicației; un root de
  compoziție trebuie să apeleze `attachBus` pe transportul 007. PBI-ul livrează contractul, nu ecranul.
- Obiectivele de confort, rating, ETA și fidelitate a imitației lipsesc: agregatele KPI (022/023/209)
  nu există încă. Misiunea 5 folosește „cursă fără incident”, iar misiunea 3 numără `LEADER_ACQUIRED`,
  nu analiza diferenței dintre profiluri; acestea rămân follow-up de calibrare.
- Recompensele sunt înregistrate în registrul misiunilor, dar nu sunt aplicate în XP/nivel: modulele
  `economy`/`progression` sunt încă goale, iar ledgerul XP aparține contractului 23 (`PlayerProgress`).
- Registrele de idempotență sunt doar în memorie și mărginite (8192 identități / 1.048.576 unități
  UTF-16, 4096 recompense). Un eveniment foarte vechi iese din fereastră, dar este respins ca stale
  datorită tick-ului monoton; teoretic, un duplicat cu același tick, livrat după peste 8192 evenimente
  cu același tick, ar putea scăpa, scenariu nemenționat de transportul 007.
- `snapshot` este o valoare pură; persistarea în savefile și migrarea aparțin PBI-urilor 127–136.
- Pragurile, ferestrele de tick, bugetele de incidente și sumele XP sunt propuneri; nu există playtest
  uman, captură browser, FPS sau măsurători hardware în acest PBI.
- Trackerul nu validează semantica de business a profilurilor din `PROFILE_ACTIVATE` (de exemplu dacă
  versiunea a fost într-adevăr aplicată flotei); consumă evenimentul publicat de pipeline-ul real.
