---
id: "211"
title: "Trei misiuni noi pe zi și calendar stabil"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["116","117","006","009","209"]
owner: "loop-pbi/daily-211-01"
started_at: "2026-11-11T05:25:14+02:00"
completed_at: "2026-11-11T11:04:46+02:00"
---

# 211 Trei misiuni noi pe zi și calendar stabil

## Obiectiv

Generează exact trei misiuni zilnice realizabile, cu seed, zi/fus orar și snapshot de capabilități persistabile.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 116 trebuie să existe în Done înainte de începere.
- PBI 117 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Refresh/reload/profil nou nu rerandomizează setul; instanțele și parametrii sunt variați pe zile.
- [x] Cel puțin un obiectiv permite MANUAL fără learning; obiectivele de învățare cer LEARNING explicit.
- [x] Midnight, DST, clock rollback/forward și capabilități insuficiente au rezultate definite.

- [x] Generatorul acceptă familii de șabloane versionate; integrarea provocărilor din 231 se face în 233, fără a bloca generatorul de bază.

## Verificare

Verifică zile consecutive, aceeași zi reluată, catalog mic, miezul nopții și modificarea ceasului.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/daily.ts` livrează generatorul `211-mission-daily-v1`, calendarul `211-daily-calendar-v1` și snapshot-ul de capabilități `211-daily-capabilities-v1`, cu catalogul versionat `211-daily-templates-v1`. Setul are exact trei instanțe cu ID-uri care includ data locală și slotul, cel puțin una jucabilă în MANUAL fără learning, iar obiectivele LEARNING numesc cheia 092 concretă. Seedul este `hash(playerId, dailyDate, generatorVersion, templateCatalogVersion)`, fiecare alegere este `randomUint32(seed, cheie, index)`; modulul nu are ceas de perete, `Math.random()`, DOM sau renderer. Setul se persistă și se citește înapoi cu verificări de identitate, slot, semnătură, fereastră a zilei, digest de capabilități și invariantă MANUAL. Calendarul are decizii închise `NEW_DAY`/`SAME_DAY`/`ROLLBACK`/`FORWARD_JUMP`, fereastră `[dayStartMs, expiresAtMs)`, continuitate exactă pe zile de 23/24/25 h și recompense idempotente pe identitatea instanței.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` „PASS (322 TypeScript files)”; `npm run check:parameter-catalog` „Parameter catalog is synchronized.”; `npm test` 2268 teste, 2268 pass, 0 fail, 80,95 s; testele țintă `tests/missions/mission-daily.test.ts` 21/21 pass; `npm run missions:daily` `SUMMARY checks 73/73, runs 5, overall PASS`; `npm run missions:daily -- --check` „Mission daily report is current”. Scenarii reale: 3 zile consecutive → 3 seeduri, 3 semnături și 9 identități distincte din 9 instanțe, 0 goluri de continuitate; aceeași zi reluată la 23:59:59.999 → octeți identici, `SAME_DAY`, `regenerated: false`, 1 set; deblocare ulterioară → drift raportat, set neschimbat; catalog mic → 3 instanțe distincte, `fallbacks: 1`; miezul nopții → `ACTIVE` la `expiresAtMs - 1`, `EXPIRED` la `expiresAtMs`, `NEW_DAY`, `gapMs: 0`; DST 23 h și 25 h → `gapMs: 0`; rollback → fără set nou și cu recompensa păstrată (`duplicate: true` la al doilea grant); salt înainte → 3 zile sărite, 0 XP offline.

Fișiere și documente actualizate: `src/missions/daily.ts` (nou), `src/missions/index.ts` (append la finalul listei), `tests/missions/mission-daily-fixture.ts` (nou), `tests/missions/mission-daily.test.ts` (nou), `tests/missions/mission-daily-report.ts` (nou), `scripts/run-mission-daily-report.mjs` (nou), `package.json` (scriptul `missions:daily` la finalul blocului `scripts`), `Docs/23-misiuni-zilnice-si-experienta.md`, `Docs/28-provocari-random-si-revenire.md`, `Docs/Evidence/211-daily-generation/README.md`, `report.json`, `report.md`, `PBI/Done/211-daily_generation.md`. `Docs/13-misiuni-si-progres.md` nu a fost modificat.

Limitări sau follow-up: rulare Node deterministă, fără browser sau sesiune umană; apelantul deține baza de fusuri IANA și declară offsetul și durata reală a zilei; XP se acordă de stratul de progres prin `dailyRewardId`, PBI 211 nu scrie ledgerul XP sau KPI 209; suma de 100 XP și pragurile șabloanelor sunt propuneri de calibrare; șabloanele de provocări din 231 se conectează în 233 printr-un catalog versionat.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '211'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-11: Implementare livrată în `src/missions/daily.ts` cu 21 de teste țintă și raport determinist 73/73; task mutat în Done.
