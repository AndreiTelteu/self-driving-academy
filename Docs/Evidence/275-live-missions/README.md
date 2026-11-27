# Evidence 275 — campania, tutorialul și panoul de misiuni live

Validare locală din 27 noiembrie 2026, în worktree-ul `t3/pbi-275-campaign-tutorial-missions`.
Boardul canonic, mutarea PBI-ului și push-ul rămân ale orchestratorului.

## Ce s-a livrat

- `src/app/live-missions.ts` (`275-live-missions-v1`): un singur tracker 116, un singur ledger 125
  și un singur tutorial 117 peste faptele live. Nu există o a doua simulare, un al doilea ledger XP
  sau un store de profil.
- `src/main.ts`: portul shell `missions`, butonul nativ `Misiuni`, panoul 126, panoul 117 separat și
  gate-ul de learning al tutorialului. Faptele vin din 265 (`PICKUP`/`DROPOFF`), 271
  (`MANUAL_START`/`MANUAL_END`), 272 (`LEADER_ACQUIRED`), 110/273 (`PROFILE_ACTIVATE`) și 028/065
  (`COLLISION`, numai cu ambele entități reale).
- `src/missions/rewards.ts`: `recordAttemptFailure` și regula de finalizare care urmează ultimei
  încercări consumate. O încercare eșuată consumă numărul de încercare, nu o finalizare și nu o
  recompensă.
- `src/ui/game-shell-host.ts`: butonul `Misiuni` și portul `onOpenMissions`, fără listener global.
- `tests/missions/live-missions.test.ts` (10 teste), `tests/ui/game-shell-host.test.ts` (testul 275),
  `tests/missions/live-missions-report.ts` și `scripts/run-live-missions-report.mjs`.
- `scripts/run-live-missions-probe.mjs`: proba de browser.

## Raport determinist

`npm run missions:live` → [report.json](report.json) și [report.md](report.md): **24/24 verificări
PASS**. Numerele principale:

- tutorial: 5/5 pași, `COMPLETED` prin `PLAY`, 0 joburi, 0 versiuni, 0 scrieri de profil;
- etapa 1: `COMPLETED`, 100 XP, 2 recompense acordate o singură dată, etapa 2 pornită;
- reluare: încercarea 2, 2 finalizări decontate, 2 recompense duplicate, XP rămas 100;
- eșec: `SCENARIO_RESET`, XP 100 → 100, `profileWrites: 0`, reluare disponibilă;
- fereastră: 18 000 tick-uri, `EVALUATION_WINDOW_EXPIRED`;
- buget: 1 incident autorat, 2 incidente reale, `INCIDENT_BUDGET_EXCEEDED`;
- panou: 8 misiuni, etichete reale pentru `COMPLETED`, fereastră/buget și reluare.

`npm run missions:live -- --check` refuză un raport neactualizat.

## Proba de browser

`npm run missions:live:probe` → [browser.json](browser.json) și [browser.md](browser.md):
**22/22 verificări PASS**, zero erori de pagină și zero erori de consolă.

Mediul măsurat: Chrome 157 headless prin `PLAYWRIGHT_MODULE`, backend WEBGL2, viewport 1024×640,
`--disable-frame-rate-limit`. Secvența reală:

1. start și etapa 1 activă cu tutorialul la `SELECT_TAXI`;
2. preluarea unui taxi revendicat prin panoul `Flotă` (`MANUAL`) satisface pașii 1–2;
3. `L` intră în LEARNING cu eligibilitate oprită de tutorial (pasul 3), `M` revine în AUTO (pasul 4);
   pipeline-ul 273 raportează apoi 1 segment ineligibil, 0 joburi și 0 versiuni;
4. actorul 058 conduce ruta reală pickup→dropoff; `boardingTick` 1997 și `completionTick` 6794;
5. `DROPOFF` completează tutorialul și etapa 1; recompensa 125 este 100 XP + 1 deblocare, o singură dată;
6. „Oraș proaspăt” real ridică `worldEpoch`; etapa 2 deschisă e închisă `FAILED/SCENARIO_RESET`;
7. panoul arată etapa 1 `COMPLETED`, etapa 2 `FAILED`, `data-replay="true"`; XP și amprenta
   profilului învățat sunt identice înainte/după eșec.

Capturi: [01-manual](screenshots/01-manual.png), [02-learning](screenshots/02-learning.png),
[03-pickup](screenshots/03-pickup.png), [04-dropoff](screenshots/04-dropoff.png),
[05-completed](screenshots/05-completed.png), [06-stage-1-complete](screenshots/06-stage-1-complete.png),
[07-panel-stage-1](screenshots/07-panel-stage-1.png), [08-failed](screenshots/08-failed.png),
[09-panel-failure](screenshots/09-panel-failure.png).

## Comenzi

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm test` | 3721 passed, 0 failed, 14 skipped (3735) |
| `npm run build` | PASS (avertismentul existent de chunk mare) |
| `npm run check:architecture` | PASS (476 fișiere) |
| `npm run composition:report -- --check` | PASS |
| `npm run docs:check -- --check` | PASS |
| `npm run missions:live` | PASS 24/24 |
| `npm run missions:live -- --check` | PASS |
| `npm run missions:live:probe` | PASS 22/22 (Chrome 157, WEBGL2) |

## Limite

1. Producătorul live 028/029 de coliziuni nu este montat; bugetul de incidente este evaluat din 007
   `COLLISION` numai când faptul are ambele entități reale. Un mark de sănătate `DAMAGED` fără
   contraentitate nu este inventat într-o coliziune.
2. Persistența după reload rămâne 278. Runtime-ul 275 trăiește cât pagina; un reload repornește
   etapa 1, fără a pretinde restaurare.
3. XP-ul efectiv în `PlayerProgress`, nivelul și misiunile zilnice rămân 276. Ledgerul 125 înregistrează
   recompensa, dar 275 nu o credită în soldul jucătorului.
4. Provocările random rămân 277; panoul 126 este read-only, iar pornirea reluării rămâne a hostului.
5. Proba de browser folosește Chrome headless/WEBGL2 și `--disable-frame-rate-limit`; nu înlocuiește un
   playtest uman și nu măsoară FPS/GPU/hardware.
6. Etapa 2 din probă eșuează prin resetul real de scenariu, nu prin fereastra de evaluare; fereastra și
   bugetul sunt dovedite determinist, nu în browser.
