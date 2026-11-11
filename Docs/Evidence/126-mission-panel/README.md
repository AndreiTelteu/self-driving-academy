# PBI 126 — panoul misiunilor și obiective live

Implementare livrată în `src/ui/mission-panel-format.ts` (`126-mission-panel-v1`) și
`src/ui/mission-panel.ts`, cu exporturi aditive prin `src/ui/index.ts`. Panoul este o proiecție
read-only peste contractele 116 (tracker + evaluare) și 125 (progres, recompense, deblocări): nu
recalculează progresul, nu inventează verdicte și nu ține o a doua stare de adevăr.

## Contract

- `composeMissionPanelSnapshot({ sessionId, worldEpoch, tick, catalog, progress, instances })`
  compune snapshotul din read model-ele reale. Fiecare câmp este copiat: campania din
  `CampaignProgress` (125), evaluarea din cea mai recentă instanță 116, textul autorat și pragurile
  din versiunea definiției pe care o raportează instanța. Rezultatul trece prin
  `parseMissionPanelSnapshot`, deci o compoziție inconsistentă eșuează în loc să fie afișată.
- `parseMissionPanelSnapshot(value)` refuză: un `satisfied` care contravine pragului real, un
  `nextAttempt` care nu respectă regula 125 (`attempts + 1`), o misiune `COMPLETED` fără finalizare
  reală, o încercare care nu aparține misiunii sau versiunii declarate, un `target` care nu este
  pragul dificultății încercării, un câmp necunoscut.
- `projectMissionPanel(snapshot, { selectedMissionId? })` produce vederea deterministă (etichete,
  bare procentuale, semnătură stabilă) fără DOM.
- `createMissionPanel(host, { read, setSurface?, open?, idPrefix? })` montează butonul nativ și
  dialogul. `read` este portul compus de host; `setSurface` este portul 070
  (`pauseFocus.setSurface('panel', open)`), apelat o dată la deschidere și o dată la închidere.
  API: `open`, `close`, `toggle`, `refresh`, `isOpen`, `selectMission`, `getSelectedMissionId`,
  `getView`, `getSnapshot`, `getTrigger`, `getPanel`, `getStats`, `dispose`.
- `refresh()` este singura re-citire: închis întoarce `SKIPPED_CLOSED` fără citire și fără randare;
  semnătură neschimbată întoarce `SKIPPED_UNCHANGED`; altfel `RENDERED`.

## Cum arată fiecare stare

| Stare | Sursa reală | Ce scrie panoul |
| --- | --- | --- |
| Disponibil | `AVAILABLE`, fără instanță | „Nicio încercare înregistrată”, obiective `Neevaluat`, „Următoarea încercare: 1” |
| În desfășurare | instanța 116 `ACTIVE` | „În desfășurare”, progresul real („0 din 1 obiective îndeplinite”) |
| Finalizat cu succes | instanța 116 `COMPLETED` | „Finalizat” + „Finalizat cu succes”, „1 din 1”, „1 din 8 încercări încheiate”, „Următoarea încercare: 2” |
| Eșuat cu motiv | instanța 116 `FAILED` | motivul închis, de exemplu „Bugetul de incidente a fost depășit (INCIDENT_BUDGET_EXCEEDED)”, plus „incidente 3 din 2” |
| Blocat | `LOCKED` + prerechizite lipsă | „Blocat”, „Lipsesc: campaign-3-following-distance”, „Reluare indisponibilă: misiunea este blocată” |
| Inspectat | `selectMission` | detaliile misiunii, fără nicio scriere în contracte |
| Reluare disponibilă | `playable` + `nextAttempt` (125) | „Reluare disponibilă: încercarea n din 8” + politica de profil a definiției |

Fiecare element de misiune are `data-state`, `data-attempt-state`, `data-failure` și `data-replay`,
deci starea este verificabilă fără a citi culoarea. Dialogul are `data-tick`, `data-missions`,
`data-locked`, `data-available`, `data-completed`, `data-active`, `data-failed`, `data-replayable`,
`data-empty` și `data-reads`.

## Textul corespunde evaluării reale și versiunii aplicate

1. Nicio valoare afișată nu este calculată de panou: `progress`, `target`, `satisfied`,
   `failureReason`, `attempts`, `nextAttempt`, `rewardsGranted`, `resets` sunt copiate din 116/125.
2. Parserul refuză snapshoturi forjate: `satisfied = false` pe un progres peste prag, o
   `missionVersion` diferită de versiunea aplicată, un `nextAttempt` care nu urmează regula 125, o
   misiune `AVAILABLE` cu prerechizite lipsă.
3. Cu două versiuni în catalog, panoul afișează versiunea aplicată: testul construiește definiția
   v2 (titlu și etichetă de obiectiv schimbate), o aplică, iar compunerea cu catalogul v1 este
   refuzată cu „… is version 1, not the applied version 2”. Raportul păstrează aceeași dovadă.

## Inspectarea unui obiectiv blocat nu pierde progres

`selectMission` mută doar pointerul de selecție și re-proiectează snapshotul deja citit: nu apelează
`read`, trackerul, ledgerul sau `resetMission`. Dovada din raport: 3 misiuni inspectate
(`campaign-4`, `campaign-8`, `campaign-6`), `progress` și starea trackerului identice înainte/după,
zero instanțe create, iar citirile cresc doar la redeschiderea panoului (1 → 2).

## Focus, Escape, Tab și costul

- Buton nativ `<button type="button">Misiuni</button>` cu `aria-haspopup="dialog"`,
  `aria-expanded` sincronizat și `aria-controls`; dialog `role="dialog"`, `aria-modal="true"`, nume
  din titlu și descriere.
- La deschidere focusul intră pe butonul misiunii selectate; `Tab`/`Shift+Tab` rămân în panou
  (închidere → misiuni → corp), `Escape` închide, focusul anterior este restaurat.
- Toate listeners sunt pe elemente deținute: 11 listeners (buton, Închide, dialog, 8 butoane de
  misiune) și zero listeners pe `window`/`document`, deci tastele de condus rămân ale jocului.
- O citire per deschidere, zero citiri/randări cât timp panoul este închis; fără cale per tick,
  fără intrare în bucla 3D.

## Rezultate reale

`npm run missions:panel` (determinist, fără browser real, fără ceas de perete): **23/23 verificări,
overall PASS**, `determinism 2 rulări, equal=true`.

| Mărime | Rezultat |
| --- | --- |
| misiuni în catalog | 8 (1 disponibilă, 7 blocate la început) |
| campania mixtă | 8 încercări, 8 instanțe 116, 14 recompense; 7 încheiate, 1 disponibilă cu eșec real |
| campania completă | 8 încercări, 8 instanțe 116, 16 recompense, 8 finalizate, 0 reseturi |
| obiective evaluate / îndeplinite | 8 / 8 |
| motive de eșec închise | 4 (`INCIDENT_BUDGET_EXCEEDED`, `EVALUATION_WINDOW_EXPIRED`, `SCENARIO_RESET`, `PLAYER_ABANDONED`) |
| încercări / tick-uri de eșec | 1, 2, 3, 4 / 183, 18194, 18214, 18234 |
| versiune afișată | Versiunea 2 (catalogul v1 refuzat) |
| inspectare blocată | 3 misiuni, progres și tracker neschimbate, 0 instanțe, citiri 1 → 2 (doar redeschidere) |
| panou | 172 elemente, 111 noduri text, 11 listeners, 0 globali |
| citiri | închis `SKIPPED_CLOSED`, deschidere 1, neschimbat `SKIPPED_UNCHANGED`, redeschidere 1, randări 2 |
| focus / Escape / Tab | focus mutat 1, restaurat 1, Escape 1, Tab wrap 2 |

Nivel `targeted`: raportul dovedește costul structural (zero citiri/randări când panoul este închis,
o citire per deschidere) și randarea deterministă; nu este o probă FPS/GPU pe hardware real.

## Comenzi executate și rezultat

```powershell
npm run typecheck                 # exit 0 (src + tests)
npm run lint                      # exit 0, 0 warnings
npm run format:check              # exit 0, All matched files use Prettier code style!
npm run check:architecture        # exit 0, 329 fișiere TS, toate probele PASS
npm run check:parameter-catalog   # exit 0, Parameter catalog is synchronized.
npm test                          # 2336 teste, 2336 pass, 0 fail, 1 suite, ~67 s
node --import ./scripts/register-typescript.mjs --test "tests/ui/mission-panel.test.ts"
                                  # 13 teste, 13 pass, 0 fail
npm run missions:panel            # 23/23 verificări, report.json + report.md scrise
npm run missions:panel -- --check # exit 0, raportul committed este curent
```

## Fișiere atinse

- `src/ui/mission-panel-format.ts` (nou), `src/ui/mission-panel.ts` (nou), `src/ui/index.ts`
  (exporturi aditive).
- `tests/ui/mission-panel-fixture.ts` (nou), `tests/ui/mission-panel.test.ts` (nou),
  `tests/ui/mission-panel-report.ts` (nou).
- `scripts/run-mission-panel-report.mjs` (nou), `package.json` (`missions:panel`, ultima intrare).
- `Docs/13-misiuni-si-progres.md` (secțiunea contractului 126), `Docs/08-interfata-camera-si-control.md`
  (pointer), `Docs/Evidence/126-mission-panel/` (acest README, `report.json`, `report.md`).
- `PBI/In Progress/126-mission_ui.md` → `PBI/Done/126-mission_ui.md`.

## Limitări

- Nivel `targeted`: dovezi deterministe pe DOM propriu; nu există captură Playwright, măsurătoare
  FPS/GPU sau probă de cadru pe hardware. Gate-urile integrate rămân 155/159/220/224.
- Panoul nu pornește reluarea și nu montează butonul în HUD: afișează opțiunea și expune `open()`
  pentru host, care deține citirea 125 și bindingul de input. `src/app/` nu a fost atins.
- Stilurile sunt inline, intenționat, ca să nu modifice foaia globală în afara ownership-ului 126.
- Un eșec nu consumă slotul de finalizare din 125 (`attempts` numără finalizările încheiate), deci
  după un eșec panoul arată simultan `FAILED` cu motivul lui și `0 din 8 încercări încheiate`, exact
  cum raportează contractul; nu inventează un al doilea număr de încercări.
