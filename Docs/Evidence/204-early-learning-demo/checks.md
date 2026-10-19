# Executed verification commands

## Stage 4 — interactive playtest page

Worktree: `C:\Users\aandr\Sites\self-driving-academy\.worktrees\204-playtest`
Branch: `loop-pbi/204-playtest`
Runtime: Volta Node 24.21.0 / npm 11.19.0

| Command | Result |
| --- | --- |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run lint` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture` | PASS; 169 TypeScript files and all negative probes |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog` | PASS; catalog synchronized |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm test` | PASS; 1062/1062 (1055 baseline + 7 playtest tests) |
| `volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-playtest-session.test.ts` | PASS; 7/7 |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` | PASS; served `/tests/browser/early-learning-playtest.html` |
| Chrome 155.0.8059.84 at `?selftest=1`, LEARNING run | PASS; 3943 ticks, 3 keys changed, AUTO engaged, 0 page exceptions |
| Chrome 155.0.8059.84 at `?selftest=1`, MANUAL run | PASS; 0 evidence, delta 0, profile unchanged, LEARNING tokens null |

The LEARNING run produced `speed_delta_urban 0 → 0.749022 → 0.187255`, `desired_acceleration 1.5 → 4.519165 → 2.254791` and `stop_full_probability 0.6 → 1.0 → 0.7` at quality 1.00. AUTO then drove the same car and the real 051 policy returned `APPROACH / STOP_APPROACH` and `HOLD / STOP_HOLD` at the next STOP. The MANUAL run drove the same three stops but produced zero evidence episodes, zero delta and no tokens. Exact numbers and the developer-only label are in `playtest-dev/summary.md` and the two JSON exports.

The first Vite startup after a cold cache spent several minutes in `[optimizer] scanning/bundling dependencies`; the page itself then loaded normally. This is a cache warm-up, not a page measurement.

Board validators were not run and PBI 204 was not moved or marked Done in this subagent stage. No participant file was created.

## Stage 3 history

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
