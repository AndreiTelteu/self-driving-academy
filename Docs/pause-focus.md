# Pause, focus and input modality (070)

PBI 070 exports `createPauseFocusOwner` from `src/app/pause-focus.ts` (versioned
`070-pause-focus-v1`) and the browser focus adapter `bindPauseFocusInput` from `src/input`. The
owner arbitrates a **single** suspension decision for panels, menus and focus loss; it never touches
the clock, the authority, physics or the DOM. The authoritative clock stays with 012
(`createApplicationLifecycle`), the fixed-step accumulator stays with 008 (`createFixedTickLoop`) and
held driving commands stay with 025 (`bindKeyboardDriveInput` + the 025 filter). There is no second
clock and no second pause mechanism.

## Ownership

| Component | Owns | Must not |
| --- | --- | --- |
| 070 `createPauseFocusOwner` | the decision *whether* to suspend, the documented cause and precedence, edge-triggered transitions, the held-command/held-panel-action reset on resume, the frozen observable state | touch the clock, authority, physics, DOM or the 025 filter directly |
| 012 `createApplicationLifecycle` | the pause/resume of the authoritative loop, the `load`/`ready`/`playing`/`paused` state and its `reason` | decide why a UI surface demands suspension |
| 008 `createFixedTickLoop` | the accumulator, "lost time" accounting and the `manual`/`background` wording | know about panels, menus or DOM focus |
| 025 keyboard adapter/filter | the held-key set, ramps and the filtered command | pause the simulation |
| composition root | supplies the actuators, reports mode/surface/focus facts, wires the DOM events, gates its own resume button through `requestResume()` | infer suspensions from render state |

The caller must supply three ports: `suspend(cause)` (pause the authoritative loop), `resume(cause)`
(resume it, excluding all suspended wall time) and — whenever the session composes a held-command
source — `resetHeldCommands()` (clear held keys and ramps). A session that composes none may omit the
third port; `getStats().heldResetPort` then reports `false` so a reader can tell. The owner performs
`resetHeldCommands()` strictly **before** `resume(cause)`, on every resume edge.

`pause(reason)` on 012 now accepts the host causes `'focus' | 'menu' | 'panel'` in addition to
`'manual' | 'background' | 'overload'`. Every host cause maps onto 008's authoritative `manual` pause
(only `'background'` keeps its own wording), so 008's contract is unchanged while 012's observable
`state.reason` still tells a reader *why* the world is suspended.

## Surface rules

`setSurface(surface, open)` is the only entry point a UI surface needs; `setMode(mode)` reports the
control authority (`AUTO` / `MANUAL` / `LEARNING`).

| Surface | MANUAL / LEARNING | AUTO observation | What "live" means |
| --- | --- | --- | --- |
| `panel` — fleet, profile, missions, KPI popup | **suspends** the authoritative loop, cause `panel` | **stays live**, cause `null` | the panel reads a running world: AUTO decisions continue every tick and **no PLAYER seat is claimed**; closing the panel is not what starts the world |
| `menu` — pause menu, settings popup | **suspends**, cause `menu` | **suspends**, cause `menu` | the world is frozen in every mode; the menu *is* the pause, so it never observes live data |
| `diagnostic` — read-only diagnostics overlay | stays live | stays live | pure observation: it never suspends and never takes authority |

Precedence is fixed and documented so a reader can always name one cause: **`focus` > `menu` >
`panel`**. Changing only the winning cause (for example a panel is already suspending and the window
then loses focus) is **not** a new suspension edge: no `resume`/`suspend` pair is issued, the
`revision` counter does not move, and only `cause` is republished.

## Focus rules: browser event versus authoritative decision

Window `blur`, `document.hidden` on `visibilitychange` and `pagehide` are **browser facts**. The
`bindPauseFocusInput` adapter only *reports* them; notifications are edge-triggered, so a repeated
`blur`, a repeated `visibilitychange` or a `sync()` before a tick never flaps the owner. The adapter
never pauses anything by itself.

The owner converts the reported fact into the authoritative decision (cause `focus`) and asks 012 to
pause; 012 is the only component that stops the loop. Focus loss suspends in **every** mode (the
single-player rule). A backgrounded tab is a **distinct** scenario: 012 already maps
`visibilitychange` to its own `background` pause, and Docs/25 keeps background as a separate
scenario, so whichever wins the race keeps its own reason. `pagehide` never restores focus.

## Resume contract

Resume happens only through the owner, either because the last demanding condition cleared (a surface
closed, focus regained) or through an explicit `requestResume()`. An explicit resume is **refused**
(returns `false`, counted in `refusedResumes`) while any surface or focus loss still demands
suspension, so a Resume button cannot silently override an open panel.

On every resume edge the owner:

1. clears its own bounded held-command set and the held panel action;
2. calls the host `resetHeldCommands()` port, so a key held before the suspension (or a key held
   while a panel was open, where no blur occurred) is not still held, and the first post-resume
   command is a clean neutral state;
3. calls `resume(cause)`, and 012/008 re-anchor the clock at the resume instant.

No suspended wall time is converted into simulated ticks: the first frame after resume admits only
the elapsed active `dt`, no `dt` is inflated, and no tick is skipped or fabricated. The authoritative
tick sequence therefore stays contiguous across any number of suspensions, which is exactly the
sequence a 085 tick recorder observes (`tickGaps` stays 0 because the loop produces no tick at all
while suspended).

## Observability

`getState()` returns a frozen projection: `version`, `mode`, `surfaces`, `focusLost`,
`heldCommands`, `heldPanelAction`, `suspended`, `cause` and `revision` (which increments only on a
real suspension change). `getStats()` adds `suspensions`, `resumes`, `refusedResumes`, `heldResets`,
`noopReconciles`, `surfacesOpen`, `heldResetPort` and `disposed`. `dispose()` is idempotent, clears
the held state and never calls the ports: the caller owns clock teardown, so disposal does not resume
a suspended world. A reader can tell *why* the simulation is suspended from this contract alone; it
is never inferable only from render state.

## What it is NOT

- No panel, menu, KPI, profile or settings UI is implemented here: 074/075/229 own those surfaces and
  only call `setSurface`.
- No camera, pointer-lock or mouse-capture release: 017/018 own camera input; 070 resets held
  *driving commands* and the held panel action only.
- No change to authority: 066 remains the only PLAYER-seat arbiter, 024 the only physical command
  arbiter and 025 the only held-key owner. A live AUTO panel never claims a seat.
- No second clock, no pause outside 012/008, no tick fabrication or gap, no accelerated catch-up.
- No success/XP/KPI/learning effect from a suspension, and no persistence.
- No per-tick work: the owner reacts to events only, so it adds cost per suspension edge and per
  state read, not per frame.

## Verification

`tests/app/pause-focus.test.ts` (10 tests) composes the real 012 lifecycle, the real 008 loop and the
real 066/024 authority: MANUAL panel suspends with no tick advance and resumes without lost time,
AUTO observation stays live with zero PLAYER seats and continuing AUTONOMY commands, focus loss
suspends in both modes and refocusing advances exactly one tick, resume clears a really held 025 key,
precedence keeps one edge while the cause changes, menu/rapid blur never flap, an explicit resume is
refused while a surface holds, and disposal leaves no listeners. Measured before/after cost, the
suspended arm and the owned-memory envelope are in [Evidence/070-pause-focus](Evidence/070-pause-focus/README.md).
No headed browser/frame probe is included: it stays owed to 153/224/235.
