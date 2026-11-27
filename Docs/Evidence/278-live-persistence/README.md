# 278 — persistența live: autosave, checkpoint, savefile și recuperare

Dovezile implementării `278-live-persistence-v1` și `278-live-save-v1`:

- [`report.json`](report.json) / [`report.md`](report.md) — raportul determinist (31/31).
- [`browser.json`](browser.json) / [`browser.md`](browser.md) — proba de browser (PASS, 26/26).
- [`probe.sdasave`](probe.sdasave) — fișierul real produs în Chrome și reimportat.
- [`screenshots/`](screenshots/) — înainte de salvare, preview-ul de încărcare, după import și după reload.

## Ce s-a măsurat

Raportul determinist folosește owner-ii reali: `createLiveDailyProgress` (212/213), harness-ul 232/233
al provocărilor, `createLiveCompanyFinance`/`createLiveCompanyEvolution` (268/269) și economia 209
din fixture-ul live. El demonstrează:

- autosave la 900 tick-uri (3 în raport), cu `tick`/`lastSavedTick`/`unsavedTicks` separate de
  `lastAttemptAt`/`lastSuccessAt`/`lastCommitMs`;
- exportul unui fișier cu checksum SHA-256, preview cu aceeași identitate și confirmare explicită;
- refuz `CHECKSUM_MISMATCH` pentru fișierul editat și `LIVE_SAVE_PREVIEW_REQUIRED` fără confirmare;
- importul readuce XP, daily, compania și profilul, cu ΔXP negativ față de starea modificată;
- al doilea import are ΔXP 0, Δ daily 0 și același fingerprint de companie;
- reload-ul restaurează aceeași generație, `PAUSED_AUTO`, segment anterior `INCOMPLETE`,
  `offlineIncome: 0` și `offlineXp: 0`;
- fișierul are 24 137 de unități de cod (corp 225 23 220) din bugetul de 1 048 576.

## Proba de browser

Chrome 157 headless/WEBGL2, viewport 1024×640, `?capture=1&debug=1&nofocuspause`:

- compania live a produs revenue real (540 SDA) înainte de salvare;
- XP-ul a fost creditat prin fereastra reală de timp activ a ledgerului 213 (aproximativ 1,835 XP);
- export: peste 70 KB (corp 225 aproximativ 69,8 KB), generația 9; checksum-ul, tick-ul și valorile exacte sunt în [browser.json](browser.json);
- după export XP a fost modificat la 2,00145 și compania la o cursă AI suplimentară; importul a
  readus XP-ul de dinainte de export și revenue 540;
- al doilea import: ΔXP 0, Δ daily 0, companie neschimbată;
- reload: aceeași generație, `PAUSED_AUTO`, XP-ul din fișier, companie 540, KPI păstrat, offline income 0;
- butoanele native „Salvează”/„Încarcă” sunt prezente, iar shell-ul raportează 0 listeneri globali.

## Comenzi

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run save:live
npm run save:live -- --check
$env:PLAYWRIGHT_MODULE='C:/Users/aandr/Sites/exim-pilot/web/node_modules/playwright'
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run save:live:probe
npm run check:architecture
npm run composition:report -- --check
npm run docs:check -- --check
npm run build
npm test
```

## Limite

- Snapshotul complet 206 al lumii și reluarea fizică nu sunt incluse; PBI 278 acoperă verticalul live
  al owner-ilor montați.
- KPI-ul 209 este păstrat ca slot read-only și verificat prin fingerprint; ledgerul live 209 nu este
  rehidratat fiindcă owner-ul 266 nu expune `restore`.
- Compania este reconstruită prin replay real în 268/269, nu printr-un al doilea ledger; un snapshot
  care nu se reproduce este refuzat.
- Autosave-ul folosește `localStorage` pentru rândul durabil al tabului; adaptorul IndexedDB și
  lock-ul de scriitor între taburi rămân contractele 127/234.
- Shutdownul nu forțează o generație finală; ultimul commit periodic sau importat este punctul de
  recuperare.
- Proba de browser este headless și nu înlocuiește un playtest uman sau o măsurătoare FPS/GPU.
