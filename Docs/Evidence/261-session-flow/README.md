# 261 — Sesiuni Academie și Haos: dovezi

Contract: `261-session-flow-v1` în [`src/app/session-flow.ts`](../../../src/app/session-flow.ts),
peste `225-session-kinds-v1` și shell-ul `260-game-shell-v1`.

## Ce s-a livrat

- Meniul explicit Academie / Joacă liberă / Haos în `src/ui/game-shell-host.ts`
  (`data-shell-action="session"`) și butonul „Oraș proaspăt, păstrează stilul”
  (`data-shell-action="reset-world"`).
- `main.ts` adoptă identitatea sesiunii în `GameShell.setSessionContext` și înregistrează portul
  `sessions`, care verifică la fiecare tick `sessionId`/`worldEpoch`/`learningEpoch`.
- Schimbarea folosește hostul 225: segment închis, un checkpoint, joburi anulate cu
  `SESSION_SWITCH`, input eliberat, `PAUSED_AUTO`. Un commit refuzat păstrează lumea și epocile.
- Resetul comite `SCENARIO_RESET` în același `SessionKindCheckpointStore`, apoi avansează
  `worldEpoch` și `learningEpoch`, anulează joburile cu `WORLD_RESET` și repornește în
  `PAUSED_AUTO`; profilul, XP, daily-ul, recompensele și KPI-ul sunt comparate prin amprentă.
- Rezultatele târzii sunt refuzate cu motivele închise 225; 20 de tranziții nu lasă lumi, joburi
  sau listeners orfane.

## Verificări executate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run build` | PASS |
| `npm test` | 3567 PASS, 0 FAIL, 14 skipped |
| `npm run check:architecture` | PASS |
| `npm run docs:check -- --check` | PASS |
| `powershell -NoProfile -ExecutionPolicy Bypass -File PBI/Validate-Board.ps1` | Valid, 29 taskuri |
| `powershell -NoProfile -ExecutionPolicy Bypass -File PBI/Validate-Plan.ps1` | Valid, 29 taskuri, 1761 linkuri |
| `node scripts/check-docs-sync.mjs --check --pending-task=261` | PASS |
| `node --import ./scripts/register-typescript.mjs --test tests/app/session-flow.test.ts` | 9/9 PASS |
| `node --import ./scripts/register-typescript.mjs --test tests/app/game-shell.test.ts tests/ui/game-shell-host.test.ts tests/persistence/session-kinds.test.ts` | PASS (fără regresii 225/260) |
| `npm run session:probe` | **PASS** pe WEBGL2 și WEBGPU (Chrome 157, Playwright 1.55) |

Testele de contract acoperă: meniul și identitățile distincte, schimbarea cu checkpoint și
`PAUSED_AUTO`, salvare eșuată fără avans de epocă, reset cu `SCENARIO_RESET` și amprentă
XP/daily/recompense/KPI neschimbată, reset eșuat, rezultat târziu refuzat, 20 de tranziții fără
orfani, restore/reload în pauză/AUTO și poarta de izolare 225.

## Proba de browser

`npm run session:probe` a produs [browser.json](browser.json) și [report.md](report.md). Rularea a
trecut pe **WEBGL2** (headless, SwiftShader) și **WEBGPU** (headed, GPU real), în Chrome 157 cu
Playwright 1.55, cu zero erori de pagină sau consolă. Secvența reală a fost:

1. pornire în Academie și citirea meniului cu două sesiuni (`Academie`, `Joacă liberă / Haos`);
2. deschiderea panoului și apăsarea butonului „Oraș proaspăt, păstrează stilul”;
3. verificarea `lastReset` (`reset:session-261-academy:2`, epoch 1→2, learning 0→1), stării
   `PAUSED` și a portului `sessions` prezent;
4. schimbarea în Haos (epoch 1, learning 0, 0 checkpointuri) și înapoi în Academie (epoch 3,
   learning 2, 2 checkpointuri), ambele în `PAUSED_AUTO`;
5. verificarea unei singure lumi active, a unui singur tick owner și a zero listeneri globali.

Capturile sunt în [screenshots](screenshots/).

## Limitări

- Checkpointul live este magazinul determinist în memorie al lui 225; adaptorul durabil IndexedDB
  rămâne la 278.
- Reluarea fizică a pozițiilor din snapshot rămâne la 278; `restore` adoptă checkpointul și
  pornește în pauză/AUTO, iar scena este readusă la starea inițială.
- Segmentul și joburile live nu există încă (271/272), deci compoziția live raportează 0 pentru
  închideri/anulări; contractul este dovedit cu dubluri deterministe în teste.
- KPI-ul, daily-ul și XP-ul live rămân ale taskurilor 266/276; poarta de izolare și amprenta sunt
  dovedite cu instanțele reale 212/213/125 din fixture.
- Proba de browser dovedește fluxul de sesiuni; frame-ul/FPS-ul rămân ale gate-urilor de performanță,
  iar nivelul de validare este `targeted`.
