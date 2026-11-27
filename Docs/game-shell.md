# Shell-ul jocului și composition root

Versiune 0.1 · 26 noiembrie 2026. Contract pentru PBI 260.

## Scop

`src/main.ts` nu mai pașește direct compunerea V3. Un singur composition root —
`createGameShell` din `src/app/game-shell.ts` — deține tick-ul autoritar, pauza/focusul și ordinea
porturilor. El avansează exact o dată lumea V3 existentă și cheamă porturile sistemelor care se
integrează în 261–286. Shell-ul nu creează o a doua simulare, un al doilea renderer, un ledger sau
un store paralel și nu inventează implementări pentru porturile lipsă.

```
012 lifecycle/RAF → shell.step(tick)
                     ├─ porturi PRE_WORLD (setări, sesiuni, moduri, flotă, trafic, pietoni)
                     ├─ WORLD: compunerea V3 (aceeași lume Babylon, același pas)
                     ├─ porturi POST_WORLD (curse, economie, misiuni, telemetrie, learning,
                     │                     distrugere)
                     ├─ porturi PERSISTENCE
                     └─ porturi PRESENTATION (cameră, HUD)
```

## Ordinea declarată

`GAME_SYSTEMS` este lista publică și stabilă. Fiecare intrare are `id`, `phase`, `owner` (PBI-ul
viitor) și titlu. Ordinea urmează contractul din [Docs/02](02-arhitectura-si-contracte.md#ordinea-unui-tick):

| # | id | PBI | Fază |
| ---: | --- | --- | --- |
| 1 | `settings` | 279 | PRE_WORLD |
| 2 | `sessions` | 261 | PRE_WORLD |
| 3 | `control` | 271 | PRE_WORLD |
| 4 | `fleet` | 262–263 | PRE_WORLD |
| 5 | `traffic` | 283–284 | PRE_WORLD |
| 6 | `pedestrians` | 286 | PRE_WORLD |
| 7 | `world` | 260/282 | WORLD |
| 8 | `rides` | 264–265 | POST_WORLD |
| 9 | `economy` | 266–270 | POST_WORLD |
| 10 | `missions` | 275–277 | POST_WORLD |
| 11 | `telemetry` | 272 | POST_WORLD |
| 12 | `learning` | 273–274 | POST_WORLD |
| 13 | `destruction` | 285 | POST_WORLD |
| 14 | `persistence` | 278 | PERSISTENCE |
| 15 | `camera` | 280 | PRESENTATION |
| 16 | `hud` | 281 | PRESENTATION |

`world` este pasul autoritar existent, nu un port. Fizica 282 se integrează în lume/adaptorul de
fizică, nu ca o a doua buclă. Din 271, portul `control` este prezent: verifică la fiecare PRE_WORLD
că segmentul 069 settlează exact tick-ul anterior, că există cel mult un scaun `PLAYER` și că modul
segmentului coincide cu modul acceptat al vehiculului.

## Porturile

Un port este `{ id, version?, step(context) }`. `id` trebuie să fie exact cheia declarată, iar
`step` este sincron și primește `{ tick, dtSeconds, sessionId, worldEpoch, learningEpoch, mode }`
înghețat. Porturile se înregistrează la construcție; shell-ul copiază registrul, deci o modificare
ulterioară a obiectului de opțiuni nu schimbă compunerea.

Shell-ul are o singură identitate de sesiune activă, schimbată numai prin `setSessionContext(...)`.
O schimbare în timpul unui pas este refuzată, iar o identitate identică nu este o tranziție nouă.
`status().learningEpoch` și `status().contextSwitches` raportează ce a fost adoptat; tick-ul nu este
resetat de o schimbare de sesiune, pentru că o singură buclă rămâne autoritară.

Un port absent nu este o eroare de rulare: `status().systems` îl raportează `ABSENT`, cu zero
pași, iar panoul de integrare îl arată „Neintegrat”. Un task dependent înlocuiește absența
furnizând portul real; nu are voie să creeze o simulare paralelă în UI sau în `main.ts`.

## Invariante verificabile

- **Un singur tick:** `step(tick)` cere exact `lastTick + 1`; duplicatele, tick-urile înainte și
  re-intrarea sunt refuzate. Un port care cheamă `step` în timpul pasului produce un fault latch,
  iar shell-ul refuză pași până la atașarea unei lumi noi (reluarea după recuperare).
- **O singură lume:** `attachWorld` refuză o a doua lume activă; `detachWorld` este perechea lui.
  `status().world` raportează atașările, lumile active și maximul observat. Recuperarea GPU și
  reload-ul detașează lumea veche înainte de a o atașa pe cea nouă, iar proba de browser verifică
  că după reload există o singură gazdă, o singură lume și un singur tick owner.
- **Pauză/focus/panouri:** decizia aparține owner-ului 070. Shell-ul expune `setMode`,
  `setFocusLost`, `setMenuOpen`, `openPanel`/`closePanel` și `requestResume`; reluarea explicită
  este refuzată cât timp orice suprafață sau focusul cere suspendarea. Tick-ul nu este admis în
  timpul suspendării.
- **Fără listeners globali în gazda UI:** panoul de integrare ascultă numai pe elementul lui,
  ține Tab în panou, Escape îl închide prin portul injectat și readuce focusul. `role`/
  `aria-modal` există numai cât timp panoul este deschis, ca inputul 025 să nu blocheze tastele
  după închidere.
- **Cost separat:** shell-ul măsoară `tick` și `present` cu ceas injectat, în ferestre de 600 de
  eșantioane. Costul compunerii rămâne raportat separat de `V3BrowserComposition.costs()`.

## Gazda UI

`createGameShellHost` din `src/ui/game-shell-host.ts` montează bara Start/Pauză/Reia, meniul de
sesiune, butonul „Integrare” și un singur panou modal. Panoul listează ordinea declarată, owner-ul,
starea `Prezent`/`Neintegrat` și numărul de pași. Se actualizează la cel mult 10 Hz și numai cât timp
este deschis; închis nu citește read model-ul.

## Sesiuni Academie și Haos (261)

`src/app/session-flow.ts` compune `createSessionKindHost` (225) peste portul lumii vii și expune
`choose`, `resetWorld`, `restore`, `reload`, `acceptJobResult`, `menu`, `status` și `fingerprint`.
Meniul `select` are `data-shell-action="session"` și valorile `ACADEMY`/`CHAOS`; butonul
`data-shell-action="reset-world"` din panou cere resetul aceleiași sesiuni. Portul `sessions` este
înregistrat în shell și verifică la fiecare tick că identitatea din `GameTickContext` este cea live;
un context vechi produce un fault, nu un tick acceptat. `main.ts` adoptă identitatea în
`setSessionContext`, readuce scena în AUTO și suspendă aplicația înainte de orice captură.

Checkpointul, epocile, anularea joburilor și refuzul rezultatelor târzii rămân ale contractului 225;
resetul comite în același store un checkpoint `SCENARIO_RESET` înainte de a avansa `worldEpoch` și
`learningEpoch`. Reluarea fizică a snapshotului și adaptorul durabil rămân la 278; aici `restore`
adoptă checkpointul și pornește în `PAUSED_AUTO`.

## Diagnostice de browser

`__v3Composition.shell()` întoarce starea completă (sisteme, porturi, lume, pauză, costuri), iar
`__v3Composition.shellHost()` starea gazdei (deschideri, focus, listeneri). `__v3Composition.session()`
și `__v3Composition.sessionMenu()` expun identitatea, epocile, checkpointurile, resetul și eroarea
ultimei tranziții. Toate sunt read-only.

## Verificare

```text
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run composition:report -- --check
npm run shell:probe        # WebGL2 + WebGPU, secvență reală start→conducere→panou→reluare
npm run session:probe      # Academie → reset → Haos → Academie, dacă Playwright este instalat
```

Dovezile browser sunt în [Evidence/260-game-shell](Evidence/260-game-shell/README.md).
