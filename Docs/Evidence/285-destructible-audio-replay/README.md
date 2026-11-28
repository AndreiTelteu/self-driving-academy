# 285 — Decor destructibil, feedback audio și replay în joc

Implementare locală verificată de sub-agent la 28 noiembrie 2026. Boardul canonic, mutarea PBI în
Done și publicarea rămân ale orchestratorului.

## Ce s-a livrat

- **Decor destructibil live:** `src/app/live-chaos.ts` (`285-live-chaos-v1`) compune planul real
  227 (3 zone, 35 de obiecte, 6 arhetipuri) peste lumea Rapier 282. Clădirile, carosabilul,
  intersecțiile, liniile STOP și semafoarele rămân structurale; `verifyStructuralBoundary` raportează
  467 ID-uri structurale, zero suprapuneri și layout neschimbat după 20 de cicluri.
- **Impact real:** fiecare incident 028 al lui 282 este publicat ca `COLLISION` și introdus în 227 cu
  impulsul și instigatorul real. Obiectele ușoare se mișcă sau se rup; sursa MANUAL/LEARNING/AUTO este
  doar numărată, lanțul păstrează instigatorul fizic, iar reluarea aceluiași incident este deduplicată.
  Testul `tests/destructibles/live-physics-integration.test.ts` conduce o mașină într-un con legat în
  aceeași lume Rapier și verifică distrugerea.
- **Feedback audio și vizual:** 228 derivă materialul, intensitatea, playback rate-ul și gain-ul din
  arhetip și prag; 148 folosește cue-ul `impact` și pool-ul de 4 voci. Motorul, frâna și anvelopele
  folosesc aceleași plafoane 148 (6 engine, 4 impact, 4 UI, 14 total, 8 buffere). Înainte de gest nu
  există context audio, dar HUD-ul, fragmentele/inelele și textul „efect vizual” rămân. Vizualul
  Babylon are 35 de mesh-uri, un pool de 192 de fragmente cu viață de 120 tick-uri și 4 inele de șoc.
- **Reset fără progres:** resetul publică `WORLD_RESET` în epoch-ul următor, readuce 35 de obiecte, 35
  de corpuri, 35 de collidere și 0 fragmente, iar XP-ul și checksum-ul profilului rămân identice
  (delta 0, zero retrageri). Nu scrie daily, rewards, XP sau profil.
- **Replay:** 207 înregistrează `COLLISION`, `DESTRUCTIBLE_BROKEN` și `WORLD_RESET`; 228 citește
  chunk-ul sigilat, păstrează distrugerile și reseturile în ordine și raportează 0 pași de simulare,
  0 pași de fizică, 0 reevaluări de politică, 0 recompense și 0 artefacte de învățare.
- **Plafoane:** 96 de obiecte, 192 de fragmente, 24 de reacții/incident, 256 de identități, 4096
  evenimente de replay, 4 voci impact/14 total/8 buffere și cel mult 6 collidere fizice simultane
  (registry-ul 028 are 96 de obstacole, dintre care 90 sunt clădiri).

## Dovezi

- [report.json](report.json) / [report.md](report.md) — 13/13 verificări deterministe: 35 de obiecte,
  6 profiluri de material, paritate MANUAL/LEARNING/AUTO, deduplicare, lanț cu instigator real,
  plafon de 4 voci, pool de fragmente, 20 de reseturi, replay cu reset + distrugere în ordine.
- [cost.json](cost.json) / [cost.md](cost.md) — 2 000 de pași: 0,2 ms p95 pentru pasul live,
  0,6 ms p95 pentru un impact injectat, 1,6 ms per reset; memoria este raportată în contoare de
  proprietate, iar heap-ul exact este `null` în raport.
- [browser.json](browser.json) / [browser.md](browser.md) — Chrome 157, 11/11 verificări: audio
  `RUNNING`, material `PLASTIC`, intensitate `HEAVY`, variant `FRAGMENT_BURST`, 2 fragmente active,
  reset cu 35 de obiecte restaurate, XP/profil neschimbate, replay `REPLAYED` cu 1 distrugere + 1 reset.
  Capturi: [inițial](screenshots/initial.png), [impact](screenshots/impact.png),
  [reset](screenshots/reset.png), [replay](screenshots/replay.png).

## Comenzi

```powershell
npm run destructibles:live
npm run destructibles:live -- --check
npm run destructibles:live:cost
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run destructibles:live:probe
node --import ./scripts/register-typescript.mjs --test tests/destructibles/*.test.ts
```

## Limite declarate

- Fereastra fizică este de 6 obiecte logice simultan, din cauza celor 96 de obstacole numite 028
  partajate cu 90 de clădiri. Celelalte obiecte rămân vizuale și logice; un obiect rupt eliberează
  slotul imediat. Raportul nu pretinde 35 de collidere simultane.
- Audio ambiental nu există în tabelul 148; nu s-a creat un al doilea sistem audio.
- Proba de browser injectează contactul prin aceeași cale 227/228/207 și este marcată
  `PROBE_INJECTED`; contactul solver 282 este dovedit de testul de integrare, nu de pagină.
- FPS, GPU, heap-ul exact și hardware-ul nu sunt pretinse; costul este software, iar soak-ul rămâne
  287.
