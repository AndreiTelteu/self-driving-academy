# 279 — proba de browser a setărilor live

Generată de `npm run settings:live:probe`; Chrome Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36, backend WEBGPU,
viewport 1024x640, ticks 1 → 104.

- Start screen: deschis true, focus în dialog true.
- Pauză: deschis true, focus în dialog true, Tab în panou true.
- Remapare: KeyS → ArrowDown, conflict blocat true; control version
  0 → 0.
- Slider control: 50 → 80; versiune control
  1; profil fingerprint `1c4d32b2f4e3829a` → `1c4d32b2f4e3829a`
  (neschimbat true); XP `fnv1a32:76ab935a` → `fnv1a32:76ab935a`
  (neschimbat true).
- Unități: km/h → mph; HUD afișează `mph`.
- Reset cu confirmare: true; unități după reset km/h, taste păstrate
  true.
- Stil: 2.4; versiune `settings-279-session-261-academy-1`, epoch 0 → 1,
  barieră 205 1, activare 110 MANUAL_TUNING, profil
  `1c4d32b2f4e3829a` → `1598abac3d0ec678`, XP fără intrări de stil true
  (intrări noi: niciuna).
- Shell: listeneri 24, globali 0; erori de pagină 0.
- Capturi: [screenshots/01-start.png](screenshots/01-start.png), [screenshots/02-start-settings.png](screenshots/02-start-settings.png), [screenshots/03-remap.png](screenshots/03-remap.png), [screenshots/04-playing-mph.png](screenshots/04-playing-mph.png), [screenshots/05-pause-settings.png](screenshots/05-pause-settings.png), [screenshots/06-style-result.png](screenshots/06-style-result.png).

- `start screen settings opens`: PASS — the native Settings button is visible on the start screen
- `start settings open`: PASS — the dialog is open and runtime state is OPENED
- `start settings focus`: PASS — focus moves inside the modal
- `settings controls`: PASS — 21 native controls are reachable
- `conflict blocks save`: PASS — KeyW on brake marks both rows and disables Salvează
- `Escape cancels capture`: PASS — Escape cancels capture and keeps the panel open
- `remap saved`: PASS — ArrowDown is stored in input.bindings.brake
- `remap keeps control version`: PASS — a binding change never increments input.control.version
- `control slider applies`: PASS — steeringSensitivity 50 → 80
- `control version increments once`: PASS — control version 0 → 1
- `device settings leave profile`: PASS — the learned profile fingerprint/version is unchanged
- `device settings leave XP`: PASS — the XP fingerprint is unchanged
- `mph saved`: PASS — display unit km/h → mph
- `HUD presents mph`: PASS — the central HUD unit is mph
- `pause settings open`: PASS — the pause menu opens the same real settings surface
- `pause settings focus`: PASS — focus moves inside the pause-opened dialog
- `reset needs confirmation`: PASS — reset button changes to Confirmă resetarea
- `reset saves defaults`: PASS — units and comfort return to real 009 defaults
- `reset keeps bindings`: PASS — device reset never touches key bindings
- `reset leaves profile`: PASS — the learned profile is unchanged by the reset
- `style publishes MANUAL_TUNING`: PASS — profile versions 1 → 2
- `style advances epoch`: PASS — learning epoch 0 → 1
- `style uses 205 barrier`: PASS — barriers 1, epoch 1
- `style uses 110 activation`: PASS — activation applied 1, origin MANUAL_TUNING
- `style keeps XP`: PASS — no style XP entry; new causes none
- `no global listeners`: PASS — 24 shell listeners, 0 global
- `no page errors`: PASS — none
- `no console errors`: PASS — none

Limite: Chrome headless/WEBGL2, fără playtest uman. Camera FIRST_PERSON este salvată ca preferință de
prezentare; randarea first-person rămâne PBI 280. HUD-ul principal afișează mph; HUD-ul taxiului 073
rămâne în km/h până la extinderea lui proprie.
