---
id: "278"
title: "Persistență live: autosave, checkpoint, savefile și recuperare"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["260","266","276"]
performance_checks: ["storage","frame"]
owner: "loop-pbi/deepseek-278"
started_at: "2026-11-27T18:20:31.197Z"
completed_at: "2026-11-27T20:53:00.980Z"
---

# 278 Persistență live: autosave, checkpoint, savefile și recuperare

## Obiectiv

Sesiunea, profilul, economia, daily-ul, XP-ul și decorul se salvează coerent și se pot exporta/importa cu checksum, preview și confirmare.

## Starea actuală și ce lipsește

- Nu există autosave sau checkpoint periodic în shell.
- Nu există meniu „Salvează jocul în fișier” / „Încarcă jocul din fișier”.
- Nu există reluare după reload în pauză/AUTO, cu segment incomplet.
- Nu există preview, confirmare și înlocuire atomică a sesiunii.
- Nu există includerea companiei, daily-ului, XP-ului și profilului în același checkpoint.
- Nu există probă de browser pentru export, import și al doilea import fără duplicate.

## Context și plan

- [Salvare și import/export](../../Docs/15-salvare-si-import-export.md)
- [Savefile și integritate](../../Docs/29-savefile-si-integritate.md)
- [Contracte de performanță](../../Docs/25-performanta-contracte-si-benchmark.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 266 trebuie să fie Done înainte de începere.
- 276 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Autosave-ul comite o generație coerentă și raportează separat timpul simulat de timpul salvării.
- [x] Reload-ul pornește în pauză/AUTO, cu segmentul anterior marcat incomplet și fără venit offline.
- [x] Exportul produce un fișier cu checksum; importul cere preview și confirmare înainte de înlocuire.
- [x] Un import invalid sau un checksum greșit păstrează sesiunea curentă.
- [x] Al doilea import nu dublează XP, recompensele daily sau revenue-ul.
- [x] Compania, daily-ul, XP-ul și profilul se restaurează împreună, nu parțial.

## Verificare

- Teste pentru checksum, preview, import invalid, dublu import și rollback.
- Probă în browser: export, reload, import, verifică XP/KPI/companie.
- Verifică bugetul de bytes și timpul de commit.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/live-savefile.ts` (`278-live-save-v1`) și `src/app/live-persistence.ts` (`278-live-persistence-v1`) leagă autosave-ul periodic de 900 tick-uri la un checkpoint 225 real și la un fișier `.sdasave` cu SHA-256 `SDA-CJSON-1`. Generația cuprinde identitatea sesiunii, profilul 109 activ, checkpoint-ul 276 daily/XP, checkpoint-ul 277 al provocărilor, compania 268/269 și snapshot-ul read-only 209/KPI; timpul simulat (`tick`, `lastSavedTick`, `unsavedTicks`, `nextDueTick`) este raportat separat de timpul salvării (`lastAttemptAt`, `lastSuccessAt`, `lastCommitMs`). Exportul produce fișierul cu checksum, importul cere preview și confirmarea exactă a checksum-ului, iar înlocuirea aplică owner-ii într-un rollback complet dacă orice pas e refuzat. Reload-ul pornește `PAUSED_AUTO`, numește segmentele deschise `INCOMPLETE` și are `offlineIncome: 0`, `offlineXp: 0`. Compania este reconstruită prin replay real în ledgerul 268 și jurnalul 269; un al doilea import are ΔXP 0, Δ daily 0 și același revenue. Shell-ul are butoanele native „Salvează”/„Încarcă”, cu focus, Tab și Escape în suprafața de fișier și zero listeneri globali.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (483 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run save:live -- --check` — PASS. Teste țintă 13/13. `npm test` integrat: 3.780 teste, 3.766 pass, 0 fail, 14 skip-uri istorice. Raport 31/31: generația 2, checksum `fa2e99b8…fdf2`, fișier 24.137 B / body 23.220 B, commit 3 ms; primul import ΔXP −1.000.000 micro-XP, al doilea ΔXP 0 și Δ daily 0; refuzuri `CHECKSUM_MISMATCH` și `LIVE_SAVE_PREVIEW_REQUIRED`; amprente XP `fnv1a32:02819bd4`, KPI `456fac1a…`, companie `ff9a7a5c…`, daily `0e9b0df1…`. Browser probe 26/26 PASS, Chrome 157/WEBGL2, 1024×640: generația 9, checkpoint tick 6.749, fișier 70.758 B / body 69.812 B, commit 0,8 ms, checksum `2350daab…1496`; XP 1,83485 → mutat 2,001516 → restaurat 1,83485, amprentă `fnv1a32:15e819ec`; KPI 1 zi, amprentă `67084090…`; companie revenue 540 → 540, amprentă `0315fbb4…`; reload `PAUSED_AUTO`, segment anterior `INCOMPLETE`, `offlineIncome: 0`, XP și companie identice; al doilea import ΔXP 0, Δ daily 0; capturi în `Docs/Evidence/278-live-persistence/screenshots/`.

Fișiere și documente actualizate: `src/persistence/live-savefile.ts`, `src/persistence/index.ts`, `src/app/live-persistence.ts`, `src/app/live-company-persistence.ts`, `src/app/live-daily-progress.ts`, `src/app/live-challenges.ts`, `src/app/index.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/main.ts`, tests persistence/UI, `scripts/run-live-persistence-report.mjs`, `scripts/run-live-persistence-probe.mjs`, `package.json`, `Docs/15`, `Docs/21`, `Docs/29`, `Docs/31`, `Docs/Evidence/278-live-persistence/`.

Limitări sau follow-up: Snapshot-ul complet 206 al lumii și rehidratarea fizică rămân în afara acestui PBI. KPI 209 este păstrat și verificat ca slot read-only, dar ledgerul live 209 nu este rehidratat pentru că owner-ul 266 nu expune un `restore`. Rândul durabil folosește `localStorage` pentru tab; adaptorul IndexedDB cu writer-lock rămâne contractul 127/234. Shutdown-ul nu forțează o generație finală. Proba de browser este Chrome headless/WEBGL2, fără playtest uman sau pretenție FPS/GPU/hardware. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '278'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-278`; integrat, verificat și mutat în Done.
