# Executed verification commands

Worktree: `C:\Users\aandr\Sites\self-driving-academy\.worktrees\204-stage2`
Branch: `loop-pbi/204-stage2`
Runtime: Node 24.21.0 / npm 11.19.0

| Command | Result |
| --- | --- |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run lint` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check` | PASS |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture` | PASS; architecture imports and negative probes pass |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog` | PASS; catalog synchronized |
| `volta run --node 24.21.0 --npm 11.19.0 -- npm test` | PASS; 1050/1050 |
| `volta run --node 24.21.0 --npm 11.19.0 -- node --import ./scripts/register-typescript.mjs --test tests/learning/early-loop.test.ts` | PASS; 3/3 |

The first direct benchmark attempts omitted `--import ./scripts/register-typescript.mjs` and failed with `ERR_UNSUPPORTED_DIR_IMPORT`; no benchmark result was taken from those attempts. See `probe.md` for the correctly registered runs and their limited scope.
