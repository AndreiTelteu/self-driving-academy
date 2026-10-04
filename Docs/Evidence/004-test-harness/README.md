# Dovezi PBI 004

Executat pe Windows, Node 24.21.0/npm 11.19.0, 5 octombrie 2026 (Europe/Bucharest; browser timestamp în UTC). Nu reprezintă benchmark hardware sau gameplay.

- `npm run test:domain`: exit 0, 4 teste/4 pass/0 fail — [log](headless.txt).
- `npm run check`: exit 0; TypeScript aplicație/tests, lint, format, arhitectură (29 surse, 6 probe negative) și 4 teste — [log](check.txt). Numărul de surse reflectă contractele 005 existente la momentul verificării; 005 este verificat separat de owner.
- `npm run build`: exit 0, build Vite — [log](build.txt).
- Browser real T3: preview_status disponibil tab_1, preview_navigate la http://localhost:5173/tests/browser/, preview_snapshot, apoi preview_evaluate a trimis formularul prin requestSubmit și a verificat valorile capturate. Seed 41/ticks 12=>13 stări, final 36, event tick 4/value 12; rerun identic; seed 42=>final 12, event tick 10/value 10. [Captură JSON efectivă](browser.json), [screenshot](browser.png). Nu au apărut erori la pagina harness în snapshotul inițial.

Limită: fixture aritmetică izolată în tests; nu implementează simulatorul, RNG sau pasul fix de producție. Harnessul browser se servește în dev, separat de buildul produsului. Avertismentele npm msvs-version și Node stripTypeScriptTypes sunt vizibile în loguri; comenzile au trecut.

Browser cap: input 10001 a fost respins de validarea nativă (max 10000); submit sintetic a returnat eroarea runtime înainte de captură. Revenirea la 12 tick-uri a produs din nou PASS. Rezultatul este în browser.json.

`PBI/Validate-Board.ps1 -RequireDone 004`: exit 0, Valid: true, task existent numai în Done — [log](board.txt).
