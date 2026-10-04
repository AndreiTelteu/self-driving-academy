# Verificare bootstrap 001

Executată la 2026-10-04, în Windows/PowerShell, din rădăcina proiectului. Agent: Codex gpt-6.1-sol / pbi001_bootstrap.

## Comenzi și rezultate

- `node --version`: `v24.21.0`; `npm --version`: `11.19.0`.
- `npm install`: exit 0, 20 pachete adăugate, 21 auditate, 0 vulnerabilități; generat lockfile.
- `npm ci`: instalare curată din lockfile, exit 0, 20 pachete adăugate, 21 auditate, 0 vulnerabilități.
- `npm run build`: exit 0; TypeScript verificat fără erori; Vite 8.3.2 a transformat 249 module și generat 22 fișiere în dist.
- Repetat `npm run build`, apoi comparat fiecare cale și SHA256 cu buildul anterior prin `Get-FileHash` și `Compare-Object`: 22 fișiere identice. Reproductibilitatea este verificată pe runtime-ul documentat și aceeași mașină.
- `npm ls --depth=0`: core/loaders 9.29.0, TypeScript 7.0.2, Vite 8.3.2, fără dependențe invalide.
- `git diff --check`: exit 0.
- `PBI/Validate-Board.ps1 -RequireDone '001'`, după mutarea fizică: exit 0, Valid true, 235 total, 234 To Do / 0 In Progress / 1 Done; RequiredDonePaths: PBI/Done/001-bootstrap.md. Fișierul lipsește din To Do și In Progress.

npm afișează avertismentul `Unknown env config "msvs-version"` din mediul gazdă; instalarea și buildul au trecut. Proiectul nu definește această setare.

## Browser real

Folosit browserul colaborativ T3, tab `tab_1`. `preview_status` a raportat inițial lipsa tabului, apoi `preview_open` a creat tab disponibil. Navigare cu `preview_navigate` către porturile mediului; așteptare text cu `preview_wait_for`; verificare vizuală și diagnostic prin `preview_snapshot`.

- Dezvoltare: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`; ready în 201 ms. La `http://localhost:5173/`, în 2026-10-04T20:52:23Z: titlu `Self Driving Academy`, status `Bootstrap pregătit`, text `Babylon.js 9.29.0 · TypeScript · Vite`. Console: numai `[vite] connecting...` și `[vite] connected.`, fără erori. [Captură dezvoltare](dev.png).
- Producție: `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`; la `http://localhost:4173/`, în 2026-10-04T20:52:32Z: aceleași titlu/status/versiune. Snapshot ulterior: consoleEntries și networkEntries de erori goale. [Captură producție](production.png).
- `preview_evaluate` a confirmat un script `type=module` din `/assets/index-JYsbzNLg.js` și resursele încărcate exclusiv de la `http://localhost:4173/`: bundle principal, engineStore, logger și CSS. Nicio resursă CDN.

Capturile sunt păstrate în repo, copiate din artefactele T3. Bootstrapul verifică importul real Babylon ES module prin `Engine.Version`. Nu creează engine GPU, scenă, fizică sau gameplay; acestea sunt scope-ul PBI-urilor ulterioare, inclusiv 011-render_boot.

## Limitări

Niciuna pentru scope-ul bootstrapului. Nu reprezintă un benchmark hardware sau un playtest de gameplay.
