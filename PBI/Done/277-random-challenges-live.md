---
id: "277"
title: "Provocările random, directorul, panoul și reluarea în joc"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["260","265","271"]
performance_checks: ["simulation","ui"]
owner: "loop-pbi/deepseek-277"
started_at: "2026-11-27T15:41:59.041Z"
completed_at: "2026-11-27T18:19:03.258Z"
---

# 277 Provocările random, directorul, panoul și reluarea în joc

## Obiectiv

Directorul oferă provocări fezabile, jucătorul acceptă/refuză fără penalizare, iar rezultatul, recordul și reluarea sunt vizibile.

## Starea actuală și ce lipsește

- Nu există oferte live, cooldown sau o singură instanță activă.
- Nu există rezervarea taxiului și nici refuzul când există pasager.
- Nu există evaluatori live pentru checkpoint, zonă, confort, parcare, drift, distrugere sau learning.
- Nu există panou de provocări, accept/refuz, „Mai încearcă” sau „Continuă condusul”.
- Nu există recompense idempotente și nici separarea Haos/Academie.
- Nu există o probă de browser cu o provocare completă și una refuzată.

## Context și plan

- [Provocări random și revenire](../../Docs/28-provocari-random-si-revenire.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Joacă liberă, Haos și distrugere](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Există cel mult o ofertă vizibilă și o instanță activă; cooldown-ul și deadline-ul sunt reale.
- [x] O ofertă infezabilă este refuzată înainte de afișare; refuzul nu penalizează.
- [x] Acceptarea rezervă taxiul și nu întrerupe un pasager existent.
- [x] Obiectivul este evaluat din fapte reale; un evaluator lipsă dezactivează șablonul, nu inventează succes.
- [x] Panoul arată oferta, obiectivul, deadline-ul, recompensa, recordul și acțiunile.
- [x] Haos acordă numai record local, iar Academia respectă politica XP/zi.

## Verificare

- Teste pentru cooldown, ofertă infezabilă, accept/refuz și duplicat.
- Probă în browser: o provocare de precizie și una de distrugere.
- Verifică recordurile și recompensele după reload.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-challenges.ts` (`277-live-challenges-v1`) compune 231/232/233 peste cadrul autoritar și ledgerul 213 al lui 276. Există o singură ofertă vizibilă și o singură instanță activă, cu fereastră de ofertă de 2.700 tick-uri și cooldown real de 10.800 tick-uri; refuzul este gratuit, acceptarea rezervă taxiul fără a mișca un pasager existent, iar o ofertă infezabilă este refuzată înainte de afișare. Verdictul vine din fapte reale de zonă/viteză/orientare/parcare/drift; șabloanele fără producător live (`TIMED_DROPOFF`, `COMFORT`, `DISTRUCTION`, `LEARNING`) sunt dezactivate înainte de ofertă, nu completate din HUD. Panoul nativ `Provocări` arată oferta, obiectivul, deadline-ul, recompensa, recordul și acțiunile accept/refuz/„Mai încearcă”/„Continuă condusul”. Academia creditează o singură dată prin 213/276; Haos acordă doar record local. Reload-ul de tab restaurează recordul și creditul fără dublare; fișierul durabil rămâne 278.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (480 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run challenges:live -- --check` — PASS. Teste țintă 26/26. `npm test` integrat: 3.767 teste, 3.753 pass, 0 fail, 14 skip-uri istorice. Raport 23/23: o ofertă vizibilă, a doua `OFFER_ALREADY_ACTIVE`; cooldown 10.800 tick-uri, a doua ofertă `COOLDOWN_ACTIVE`; refuz `DECLINED`, 0 XP, 0 rânduri; accept cu pasager `PASSENGER_ABOARD`, pasager păstrat; accept liber rezervă taxiul; ofertă infezabilă `NO_ELIGIBLE_TEMPLATE` cu `DEADLINE_INFEASIBLE`; demolarea refuzată cu `CAPABILITY:DESTRUCTIBLE_DECOR`; parcare 80 XP, exact 1 rând, `FIRST_RECORD`; aceeași familie din nou 0 XP și tot 1 rând; checkpoint `COMPLETED` cu 2/2 treceri reale; Haos 0 XP, 1 record local; reload păstrează recordul și 80 XP cu 1 rând; panoul are `ACCEPT,DECLINE,CONTINUE`, retry dezactivat după succes, 0 listeneri globali. Browser probe 11/11 PASS, Chrome 157/WEBGL2, 1024×640: provocare de precizie seed 300, țintă 2/2, 36 puncte de rută, deadline 12.680, completată la 10.284; 90 XP acordat o singură dată, 1 rând de recompensă, record `FIRST_RECORD`, cooldown rămas 10.583; retry după succes `NOT_FAILED`, fără duplicare; reload păstrează recordul și 90 XP cu 1 rând; distrugere `NO_ELIGIBLE_TEMPLATE` cu `CAPABILITY:DESTRUCTIBLE_DECOR`; profil `profile-261-academy@1` neschimbat, `profileWrites: 0`, `learningJobs: 0`, `xpDebits: 0`; capturi în `Docs/Evidence/277-live-challenges/screenshots/`.

Fișiere și documente actualizate: `src/app/live-challenges.ts`, `src/app/live-daily-progress.ts`, `src/app/index.ts`, `src/missions/director.ts`, `src/ui/game-shell-host.ts`, `src/main.ts`, tests missions/UI, `scripts/run-live-challenges-report.mjs`, `scripts/run-live-challenges-probe.mjs`, `package.json`, `Docs/21`, `Docs/28`, `Docs/31`, `Docs/Evidence/277-live-challenges/`.

Limitări sau follow-up: `TIMED_DROPOFF`, `COMFORT`, `DISTRUCTION` și `LEARNING` nu au încă un producător live complet și sunt excluse înainte de ofertă; 285 rămâne necesar pentru decorul destructibil, iar refuzul este real, nu un PASS fals. Persistența este `sessionStorage` peste tab reload; savefile-ul durabil rămâne 278. Drift are colector live, dar încă nu are probă de browser pentru completare. Proba este Chrome headless/WEBGL2, fără playtest uman sau pretenție FPS/GPU/hardware. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '277'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-277`; integrat, verificat și mutat în Done.
