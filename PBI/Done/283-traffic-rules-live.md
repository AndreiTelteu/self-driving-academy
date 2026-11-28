---
id: "283"
title: "Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi"
status: "Done"
release: "V1"
module: "Trafic"
depends_on: ["260","262","282"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-283"
started_at: "2026-11-28T03:03:46.952Z"
completed_at: "2026-11-28T08:58:48.109Z"
---

# 283 Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi

## Obiectiv

Semaforii, STOP-ul, prioritatea, yield-ul, schimbările de bandă și recuperarea din blocaj funcționează în lumea live pentru AI, iar încălcările jucătorului sunt observabile.

## Starea actuală și ce lipsește

- `civil-traffic` trimite `signals: []` și `completeness.signals: false`; niciun vehicul nu oprește la roșu.
- Semnele STOP sunt decorative, nu reguli de intersecție.
- Nu există prioritate, yield, conflict de intersecție sau blocaj de rețea în joc.
- Nu există schimbări de bandă, depășiri sau cooldown în traficul live.
- Nu există încălcări observabile pentru jucător și nici consecințe în review.
- Nu există o probă de browser cu roșu, STOP și conflict.

## Context și plan

- [Autonomie și trafic](../../Docs/06-autonomie-si-trafic.md)
- [Semaforare](../../Docs/signals.md)
- [Politica STOP](../../Docs/stop-policy.md)
- [Regulile STOP](../../Docs/stop-rules.md)
- [Prioritate](../../Docs/priority-rules.md)
- [Yield](../../Docs/yield-policy.md)
- [Schimbarea benzii](../../Docs/lane-change-policy.md)
- [Blocaj și reintrare](../../Docs/blocked-recovery.md)
- [Conflictele intersecțiilor](../../Docs/intersection-conflicts.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 262 trebuie să fie Done înainte de începere.
- 282 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Un controller de semafoare avansează fazele la tick și toate vehiculele live respectă culoarea.
- [x] STOP-ul distinge oprirea completă, rolling stop-ul și linia de oprire; o oprire din trafic nu este încălcare.
- [x] Prioritatea și yield-ul folosesc regulile hărții și observațiile reale, nu textura sau ordinea de randare.
- [x] Schimbarea de bandă cere gap față/spate, avantaj și cooldown; blocajul produce recuperare explicită.
- [x] Încălcările jucătorului devin evenimente observabile pentru review/metrici, fără dovezi fabricate.
- [x] Traficul rămâne fluent, iar costul este raportat separat.

## Verificare

- Probe pe intersecții reale cu roșu/verde, STOP, yield și blocaj.
- Probă în browser: AI oprește la roșu, jucătorul trece pe roșu și consecința apare.
- Verifică absența deadlock-urilor și costul pe tick.

## Dovezi de finalizare

Rezultat implementare: `src/autonomy/live-traffic-rules.ts` (`283-live-traffic-rules-v1`) este un singur adaptor live peste owner-ii 036/037/038/050/051/052/053/054: controller-ul 036 avansează fazele la tick și citește semnalul fiecărei mișcări; 050/051/037 separă roșul, oprirea completă, rolling stop-ul și linia de oprire; 038 folosește un sidecar authored cu toate perechile incompatibile, fără inferență din randare; 052 aplică yield pe observații reale și coada de sosire all-way; 053 schimbă banda numai cu gap față/spate, avantaj și cooldown; 054 cere recuperare explicită. `civil-traffic.ts` consumă comenzile de reguli, publică semnalele/rutele în frame-ul 044, aplică continuările 041 validate și recuperarea explicită; `ambient-traffic.ts` are `liveRules` opt-in, iar `main.ts` montează `liveRules: true` și expune datele read-only de trafic/semnal și notificarea de încălcare. `stop-rules.ts` expune fereastra 037 existentă fără o a doua istorie. Încălcările jucătorului provin numai din dovezile 036/037.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (489 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run civil:traffic -- --check` — PASS. Teste țintă 13/13. `npm test` integrat: 3.828 teste, 3.814 pass, 0 fail, 14 skip-uri istorice. Raport determinist: flux 40 actori/5 min — 81 opriri la roșu, 42 opriri complete/41 treceri STOP, 4.714/5.000 yield holds/accepts, 11/11 schimbări de bandă, 0 blocați, **0 deadlock**, reguli p95 0,888 ms, wall/tick 4,656 ms; stress 56 actori/10 min — 187 opriri la roșu, 86/85 STOP, 9.418/7.718 yield, 34/34 benzi, 0 blocați, **0 deadlock**, reguli p95 1,278 ms, wall/tick 6,767 ms; 157 opriri cauzate de trafic, separate de intenția STOP; 0 rolling stop-uri pe profilul implicit, `ROLL_THROUGH` pe profilul explicit; 7 hold-uri non-semnal recuperate; 29 actori staționari >60 s în stress, max 327,5 s, din ciclurile autorate de 220–411 s, nu deadlock de 5 minute. Browser probe 5/5 PASS, Chrome 157: taxi AI `…:0016` oprit la `sig:1-2 / mv:1-2:12W0>02W0` pe `sl:1-2:12W0`, 0,00 m/s, mișcare roșie; autoritate PLAYER explicită, trecere reală pe roșu, `RED_LIGHT`/`CROSSED_RED_SIGNAL`/`036-SIGNAL-CROSSING` la tick 1007, distanță 0,10→≤0 m; notificare vizibilă „Încălcare”; capturi în `Docs/Evidence/283-live-traffic/screenshots/`.

Fișiere și documente actualizate: `src/autonomy/live-traffic-rules.ts`, `src/autonomy/index.ts`, `src/fleet/civil-traffic.ts`, `src/world/stop-rules.ts`, `src/world/neighbourhood.ts`, `src/app/ambient-traffic.ts`, `src/app/walking-composition.ts`, `src/main.ts`, tests autonomy/fleet/world/browser, `scripts/run-live-traffic-report.mjs`, `scripts/run-live-traffic-probe.mjs`, `package.json`, `Docs/06`, `Docs/21`, `Docs/31`, `Docs/README.md`, `Docs/live-traffic-rules.md`, `Docs/Evidence/283-live-traffic/`.

Limitări sau follow-up: Shell-ul Babylon complet nu a putut fi exercitat end-to-end headless în software: bucla 012 intră în pauza `overload` înainte de un ciclu de semnal de 226 s. Proba de browser folosește fixture-ul Chromium peste aceiași owner-i autoritari 032/033/058/283, dar nu este un gate de shell randat sau hardware/FPS. Ciclurile de semnal sunt conținut autorat; adaptorul nu inventează verde și nu le scurtează. 054 este cerut și executat ca rebuild de rută 058; plasarea fizică 030 rămâne un port de host ulterior. 284 autonomia civilă completă, 285 destructibilele și 286 pietonii sunt în afara scope-ului. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '283'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-283`; integrat, verificat și mutat în Done.
