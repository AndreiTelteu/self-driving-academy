# Evidence 083 — Accesibilitate contrast și tastatură

Validare funcțională locală pentru PBI 083. Dovezile sunt auditul determinist, DOM-ul serializat al
adaptoarelor reale și verificările de proiect. Nu există captură de browser și nicio afirmație despre
un cititor de ecran real.

## Ce a fost livrat

- `src/ui/accessibility-format.ts` — `083-ui-accessibility-v1`: tokenuri de culoare identice cu
  `src/style.css`, `contrastRatio`/`relativeLuminance`/`requiredContrast`, descriptori pentru zece
  panouri reale, `auditPanelAccessibility` cu opt coduri închise, `planPanelTraversal`,
  `drivingBlockReason`/`drivingKeysBlocked`.
- `src/ui/panel-focus.ts` — `083-panel-focus-v1`: `createPanelFocusController` cu focus pe primul
  control, Tab/Shift+Tab în panou, Escape prin portul injectat, restaurare focus, fail-closed vizibil,
  listeneri doar pe elementul panoului (`globalListeners: 0`), `dispose` idempotent.
- `src/app/ui-accessibility.ts` — `readAccessibilityReport` (raportul real + injecție pentru teste),
  `requireAccessibleUi` și `createPanelAccessibilityBridge` peste 070, fără revendicare PLAYER.
- `src/ui/index.ts`, `src/app/index.ts` — exporturi aditive.
- `src/style.css` — variabile `--ui-*`, clasele `.ui-focus-ring`/`.ui-focus-error` și cele două reguli
  de focus care lipseau (selecturile flotei, `summary`-ul HUD); valorile vizuale existente sunt
  păstrate.
- `tests/ui/accessibility.test.ts` — 25 de teste.
- `tests/app/ui-accessibility-report.ts`, `scripts/run-ui-accessibility-report.mjs`,
  `npm run ui:accessibility` — 7 scenarii, 53 de verificări, DOM serializat.
- `Docs/ui-accessibility.md`, pointeri aditivi în `Docs/08-...`, `Docs/27-...`, `Docs/README.md`.

## Constatări și reparații

| Verificare | Rezultat |
| --- | --- |
| Butoane fără `type="button"` | Niciunul în cele 10 panouri; 28 de butoane reale serializate, 0 fără atribut. `control-mode-hud`, `diagnostics-panel`, `recovery-hud` și `rendering-view` foloseau deja `type = 'button'`. |
| Listeneri `window`/`document` | Niciunul. Singurul `keydown` de panou este captura 080, pe butonul focalizat, cu `stopPropagation`; controller-ul 083 ascultă doar elementul panoului. |
| Focus vizibil | Lipsea la `.fleet-panel__filter`/`.fleet-panel__sort` și `.taxi-hud__details summary`; am adăugat contur `3px solid` cu offset 2px. Restul aveau deja `:focus-visible`. |
| Stare doar prin culoare | Niciun panou; toate folosesc text și simbol, iar `data-state` însoțește textul. |
| Contrast | 18 perechi unice, toate peste prag; minimul măsurat este 7,17:1 (`#9bb3a8` pe `#13251f`). |
| Panou fără control focalizabil | Nu există între panourile reale; controller-ul eșuează închis cu `role="alert"` și `data-focus-state="NO_FOCUSABLE"` dacă ar apărea. |

Tokenurile măsurate: text `#f3f7fb` pe `#0d1714` = 16,97:1; focus `#9edbb5` pe `#0d1714` = 11,53:1;
selecție `#7fd7ff` pe `#13251f` = 9,96:1; avertisment `#ffd27f` pe `#0d1714` = 12,85:1; eroare
`#ffb3a7` pe `#13251f` = 9,34:1. Tabelul complet este în [report.md](report.md).

## Reguli de tastatură și condus

- Tab/Shift+Tab se înfășoară în panoul deschis; Escape închide prin port și restaurează focusul;
  Enter/Space rămân native, fără click sintetic.
- `panel` (flotă, profil, istoric, tablou) blochează tastele de condus doar în MANUAL/LEARNING; în AUTO
  observarea rămâne live.
- `menu` (setări, remapare) blochează în toate modurile; `diagnostic` (HUD, minimapă, hartă,
  notificări) nu blochează niciodată.
- Închiderea unei suprafețe care suspenda apelează portul `resetHeldCommands`; bridge-ul nu trimite
  comenzi și raportează `claimedPlayer: false`.

## Comenzi și rezultate

```powershell
npm run typecheck          # exit 0
npm run lint               # exit 0
npm run format:check       # All matched files use Prettier code style!
npm run check:architecture # Architecture imports: PASS (224 TypeScript files) + 3 probe groups PASS
npm test                   # tests 1477, pass 1477, fail 0
npm run ui:accessibility   # SUMMARY checks 53/53, scenarios 7, overall PASS
npm run ui:accessibility -- --check  # UI accessibility report is current
```

## Limite

- Fără captură de browser, playtest cu tastatură fizică sau cititor de ecran real (NVDA/VoiceOver).
- Fără simulare de daltonism, `forced-colors`, zoom 200% sau text mărit; rămân pentru 235.
- Fără măsurători FPS/memorie/hardware; auditul este determinist și fără lucru per-frame.
- Nu înlocuiește 070: bridge-ul doar raportează suprafețe, iar 070 rămâne proprietarul suspendării.
