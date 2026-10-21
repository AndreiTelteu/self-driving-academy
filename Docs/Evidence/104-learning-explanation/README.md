# Evidence 104 — Explicația modificărilor și „no change”

Validare funcțională locală pentru PBI 104. Dovezile acoperă contractul pur, adaptorul DOM,
compunerea cu rezultatele reale 103, regulile pentru non-schimbare/dovezi lipsă/erori și raportul
determinist. Nu există captură de browser și nu se revendică FPS, GPU sau măsurătoare hardware.

## Ce s-a livrat

- `src/ui/learning-explanation-format.ts` — `104-learning-explanation-v1`: snapshot strict, parser
  care cere `versionId` real numai pentru `CHANGED`, motiv închis pentru `NO_CHANGE` și
  `INSUFFICIENT_EVIDENCE`, motiv/detail real pentru `ERROR`/`REJECTED`, dovezi efective și context
  obligatorii pe fiecare schimbare, chei unice/ordonate, proiecție cu rânduri, delta cu unitate,
  texte de non-schimbare și semnătură deterministă.
- `src/ui/learning-explanation.ts` — `createLearningExplanationPanel`: header cu legarea jobului și
  badge de stare, linie de versiune explicită, rânduri stabile `li > dl`, bloc de non-schimbare,
  listă de contexte lipsă, detaliu de eroare, scriere doar la text schimbat, plafon 10 Hz cu bypass,
  `getStats`, `dispose` idempotent, fără listener global de tastatură.
- `src/app/learning-explanation.ts` — `readLearningExplanation`, `learningExplanationJobKey`,
  `learningExplanationGenerationKey`, `learningExplanationCurrentJob` și
  `LEARNING_EXPLANATION_READ_ERRORS`; agregare multi-cheie, motiv derivat din starea 100, `STALE_JOB`
  închis și refuzul cheilor R.
- `src/ui/index.ts`, `src/app/index.ts` — exporturi publice aditive.
- `src/style.css` — stil pentru panou, stările de non-schimbare/eroare prin text și simbol,
  `box-sizing`, `[hidden]`, layout compact și focus vizibil.
- `tests/ui/learning-explanation-fixture.ts`, `tests/ui/learning-explanation.test.ts` — job 103 real,
  compuneri validate de poarta 102, read model 093 cu breakdown real și **20 de teste**.
- `tests/app/learning-explanation-report.ts`, `scripts/run-learning-explanation-report.mjs`,
  `npm run learning:explanation` — 7 scenarii deterministe și **48 de verificări**.
- `Docs/learning-explanation.md`, paragrafe aditive în `Docs/10-invatarea-stilului.md`,
  `Docs/learning-notifications.md` și `Docs/README.md`, plus acest folder.

## Reguli demonstrate

| Regulă | Dovadă |
| --- | --- |
| `composed` cu valoare schimbată → `CHANGED` cu versiunea reală | scenariul `single change` |
| valori egale → `NO_CHANGE`, `versionId: null`, motiv închis | scenariul `no-change` |
| două chei se agregă determinist, ordonate după cheie | scenariul `multi-key` |
| context lipsă → `INSUFFICIENT_EVIDENCE`, fără rând inventat | scenariul `insufficient evidence / missing context` |
| zero real `1 → 0` păstrat și marcat `ZERO` | scenariul `real zero` |
| eroare cu motiv/detail real, niciodată versiune sau publicare | scenariul `error` |
| 60 de cadre la 16 ms rămân sub plafonul de 10 Hz și păstrează un rând | scenariul `60-frame ceiling` |
| job târziu/străin → `STALE_JOB`; cheie R refuzată | testele `stale or foreign job`, `reserved R key` |

## Comenzi și rezultate

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check:architecture
npm test
npm run learning:explanation
npm run learning:explanation -- --check
```

Rezultatele exacte sunt păstrate în raportul PBI. `npm run learning:explanation` scrie `report.json`
și `report.md`; `-- --check` compară transcriptul comis și eșuează dacă este învechit. `npm test`
include comparația cu raportul comis.

## Limitări

- Fără captură de browser și fără măsurătoare de frame/FPS/GPU: adaptorul este verificat pe un DOM
  determinist, nu într-o sesiune live.
- Contextul afișat vine exclusiv din read model-ul 093; un breakdown gol este raportat ca lipsă, nu
  completat din catalogul 092.
- Explicația nu publică și nu înlocuiește 100/101/102/103; publicarea rămâne a 110/112, iar mesajele
  tranzitorii rămân ale 079.
- Un cadru agregat arată versiunea capului epocii; istoricul complet rămâne al 078/109.
