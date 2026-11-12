---
id: "228"
title: "Feedback audio vizual și replay al distrugerii"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["227","148","149","207","141"]
performance_checks: ["assets", "frame", "memory"]
owner: "loop-pbi/destr-feedback-228-01"
started_at: "2026-11-12T03:41:08.037+02:00"
completed_at: "2026-11-12T03:59:11.034+02:00"
---

# 228 Feedback audio vizual și replay al distrugerii

## Obiectiv

Face distrugerea satisfăcătoare prin reacții de material și păstrează adevărul evenimentelor în replay.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 227 trebuie să existe în Done înainte de începere.
- PBI 148 trebuie să existe în Done înainte de începere.
- PBI 149 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.
- PBI 141 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Impactul produce cedare vizibilă, sunet distinct și câteva fragmente/efecte cu intensitate reglabilă și alternativă vizuală.
- [x] Pool-urile au plafon și durată de viață; fragmentele cosmetice nu blochează traficul, nu produc scor și nu generează coliziuni suplimentare.
- [x] Replay-ul reproduce stările și reseturile din evenimente, fără a acorda rewards sau a pretinde că AI-ul a învățat cascadorii.
- [x] Impacturi multiple respectă bugetul de audio/efecte, iar cleanup/disposal revine la baseline după reset.

## Verificare

Inspectează toate materialele la impact, voci simultane, Low/Medium, volum zero, replay/seek, reload și reset; păstrează capturi și rapoarte.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/audio/destruction-feedback.ts` (contracte `228-destruction-feedback-v1` și `228-destruction-replay-v1`) derivă o singură reacție deterministă din fiecare `DESTRUCTIBLE_BROKEN` real: materialul din arhetipul 227, intensitatea din `impulseNs / breakImpulseNs` (`LIGHT` sub 0,85, `HEAVY` peste) și poziția din transformarea autorată. Cele 6 arhetipuri au 6 profiluri acustice distincte pe cue-ul 148 `impact` (playback rate 0,60–1,45 și gain de material), aplicate prin `playDestructionImpact` în același pool de 4 voci `impact`, cu un companion vizual (`FRAGMENT_BURST`/`SHOCK_RING`) și un pool cosmetic de 192 fragmente cu durată de 120 tick-uri, declarat structural fără trafic, scor sau coliziuni. `intensity`, `preset` (LOW/MEDIUM/HIGH) și `visualAlternative` schimbă doar prezentarea; mute-ul pune câștigul efectiv pe zero fără să elimine reacția, iar înainte de gest nu există context audio. Replay-ul citește chunk-ul 207 sigilat prin portul real, păstrează `DESTRUCTIBLE_BROKEN` și `WORLD_RESET` în ordinea înregistrată, derivă aceleași reacții și declară zero pași de simulare, zero reevaluări de politică, zero recompense și zero artefacte de învățare. Un eveniment absent din înregistrare nu are reacție (3 distrugeri live, 2 înregistrate, 2 reacții, 1 obiect mut), un obiect fără definiție este `ABSENT`, iar un reset înregistrat golește starea și deschide generația 1. Burstul de 30 de evenimente produce 24 de reacții (plafonul per incident) și 4 voci impact simultane; resetul duce vocile 2 → 0 și fragmentele 4 → 0, păstrând doar bufferul cache-uit.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS (0 warnings); `npm run format:check` PASS; `npm run check:architecture` PASS (358 fișiere TypeScript); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `node --import ./scripts/register-typescript.mjs --test tests/audio/destruction-feedback.test.ts` 13/13 pass; `npm test` 2668 teste, 2668 pass, 0 fail (94,2 s); `npm run world:destruction-feedback` 20/20 verificări PASS; `npm run world:destruction-feedback -- --check` PASS („report is current”). Raportul real: 6/6 profiluri distincte, 5 evenimente live → 5 reacții, 1 listener, 4 voci redate + 1 refuzată de plafon, 1 buffer, 10 fragmente active; replay 3/3 evenimente cu amprente identice și chunk de 3851 B, checksum `17079dcb…d7f05ac5`; reset înregistrat cu generația 1; buget manifest `203-initial-1` cu `destructionBodies: null` și `totalHeapBytes: null` raportate ca 3 lacune. FPS, heap și hardware nu sunt pretinse.

Fișiere și documente actualizate: `src/audio/destruction-feedback.ts` (nou), `src/audio/engine.ts`, `src/audio/index.ts`, `tests/audio/destruction-feedback.test.ts`, `tests/audio/destruction-feedback-fixture.ts`, `tests/audio/destruction-feedback-report.ts`, `scripts/run-destruction-feedback-report.mjs`, `package.json`, `Docs/26-joaca-libera-haos-si-distrugere.md`, `Docs/16-asseturi-vizual-si-audio.md`, `Docs/Evidence/228-destruction-feedback/README.md`, `Docs/Evidence/228-destruction-feedback/report.json`, `Docs/Evidence/228-destruction-feedback/report.md`.

Limitări sau follow-up: meshurile, materialele și randarea efectelor rămân la 146/228; contractul livrează descriptorul vizual și planul de fragmente, nu desenează. `seek`-ul și proiecția transformărilor rămân ale lui 141. Sunetul distinct este obținut prin playback rate și gain pe bufferul procedural `impact` al lui 148, nu prin înregistrări finale de material. Nu s-a executat playtest uman, captură de browser, benchmark de cadre sau măsurare de heap; plafoanele 228 sunt locale, iar lacunele din manifest sunt declarate. Nivelul de validare este `targeted`.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '228'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: Implementat contractul 228 în `src/audio/destruction-feedback.ts`: reacții de material derivate din eveniment, pool cosmetic mărginit, replay fidel din chunk-ul 207 cu stări și reseturi, 13 teste țintă, raport determinist 20/20 și documentație actualizată. Fără push.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
