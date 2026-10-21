# Dovezi 147 — pasageri simplificați și markers

Contractul este [Docs/passenger-visual.md](../../passenger-visual.md). Implementarea este în
`src/ui/passenger-visual-format.ts` (contract, parser, semnătură), `src/ui/passenger-visual.ts`
(adaptor de comenzi pentru portul de markeri) și `src/app/passenger-visual.ts` (citirea reală 061/032
și bridge-ul pur). Nu au fost modificate contractele 032, 061, 062, 063, 064, 074, 075 sau 076.

## Ce conține

- [report.json](report.json) — transcriptul determinist: 7 scenarii, 40 de verificări, comenzile
  exacte ale portului și statisticile presenterului. Nu conține ceas de perete, valori aleatorii sau
  stare de browser.
- [report.md](report.md) — tabelul fazelor, markerii, omisiunile, textul accesibil și verificările.

## Comenzi executate

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check:architecture
npm test
npm run passenger:visual
npm run passenger:visual -- --check
```

Rezultatele exacte sunt consemnate în PBI și în mesajul de livrare al agentului. Raportul este
regenerabil; `--check` compară JSON-ul comis cu ieșirea curentă, iar `npm test` include aceeași
comparație.

## Scenarii

| Scenariu | Ce demonstrează |
| --- | --- |
| `waiting` | `TO_PICKUP` → `WAITING_PICKUP`, ocupare 0, marker `PICKUP` la ancora reală |
| `boarding` | `PICKUP` → `BOARDING`, pasager vizibil la aceeași ancoră, încă la bord 0 |
| `onboard` | `TO_DROPOFF` → `ONBOARD`, ocupare 1, marker `DROPOFF` real |
| `dropping off` | `DROPOFF` → `DROPPING_OFF`, ocupare 1, fără finalizare implicită |
| `completed reset` | `COMPLETED` → `NONE` și `lifecycle.reset` real: `clear`, zero markere |
| `mixed taxi` | două taxiuri cu curse proprii, o cursă străină și un taxi liber |
| `missing anchor` | ancoră și zonă lipsă → omisiune cu motiv, fără coordonată inventată |

## Limitări

- Nu există captură de browser, screenshot sau model 3D. Verificarea este funcțională și deterministă;
  nu certifică aspectul final al pasagerului ori integrarea într-o scenă Babylon live.
- V1 nu creează pietoni, actori de trafic, coliziuni sau dovezi de comportament. Pietonii autonomi V2
  și personajul V3 rămân contracte separate.
- Modulul nu măsoară FPS, GPU, memorie sau hardware și nu închide vreun gate de performanță.
- Nu persistă nimic în savefile și nu deține epoch-ul lumii; `sessionId`/`worldEpoch` sunt furnizate de
  composition root.
