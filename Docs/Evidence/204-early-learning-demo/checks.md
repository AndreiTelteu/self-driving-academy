# Executed verification commands

Worktree: `C:\Users\aandr\Sites\self-driving-academy\.worktrees\204-stage3`
Branch: `loop-pbi/204-stage3`
Runtime: Node 24.21.0 / npm 11.19.0

| Command | Result |
| --- | --- |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run lint` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture` | PASS; 169 TypeScript files and all negative probes |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog` | PASS; catalog synchronized |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm test` | PASS; 1055/1055 (1050 baseline + 5 behavioural tests) |
| `volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop.test.ts` | PASS; 3/3 |
| `volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop-behavior.test.ts` | PASS; 5/5 |
| `volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-204-early-loop-behavior.mjs` | PASS; wrote `behavior/driver.json` and `behavior/summary.md` |
| `volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs scripts/run-204-loop-probe.mjs` | PASS; wrote `loop-probe/probe.json` and `loop-probe/summary.md` |

The stage-2 record remains in history: the first direct benchmark attempts omitted `--import ./scripts/register-typescript.mjs` and failed with `ERR_UNSUPPORTED_DIR_IMPORT`; no result was taken from them. The generic 218/221 CLIs were not rerun for stage 3 because they use fixed workloads; the new probe imports the APIs directly. Board validators were not run and PBI 204 was not moved or marked Done in this subagent stage.
