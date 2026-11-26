# PBI 259 — garda de sincronizare a documentației

Taskul este în [PBI/Done/259-docs-sync-guard.md](../../../PBI/Done/259-docs-sync-guard.md).

## Ce livrează

- `scripts/check-docs-sync.mjs` — compară boardul fizic cu `PBI/README.md`, `Docs/21`, `Docs/31`, `README.md` și `Docs/README.md`.
- `scripts/check-docs-sync.d.mts` — tipurile pentru testul TypeScript.
- `tests/qa/docs-sync-guard.test.ts` — 10 teste, inclusiv mutații negative și dovada că `--check` nu scrie.
- `package.json` — `docs:check`, inclus în `npm run check`.
- `.loop-pbi.json` — garda este rulată de `loop-pbi validate`, cu excepția îngustă `--pending-task={id}` pentru tranziția de board.
- Documentația de stare: `README.md`, `PBI/README.md`, `Docs/README.md`, `Docs/18`, `Docs/31`.

## Verificări

- `npm run docs:check -- --check`: PASS, 29 taskuri 259–287, 32 documente, 1.755 linkuri, index 29, coverage 29, gaps 29.
- `tests/qa/docs-sync-guard.test.ts`: 11/11 PASS, inclusiv modulul complet cu `Completed` și 100%.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: PASS.
- `npm run check` în worktree-ul copilului: 3.558 teste, 3.544 pass, 0 fail, 14 skip-uri istorice.
- O rulare integrată `npm run check` a avut un flake de timing la 229; rularea țintită imediat următoare a trecut 14/14.

## Limitări

- Node local 24.19.0, sub versiunea declarată `>=24.21.0`; verificările au trecut.
- `--pending-task={id}` este o excepție documentată pentru fereastra de tranziție loop-pbi.
- Garda nu înlocuiește `Validate-Board.ps1` sau `Validate-Plan.ps1`; adaugă consistența dintre board și documentația de stare.
