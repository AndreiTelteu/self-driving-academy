---
id: "239"
title: "Direcția vizuală V4 și harness de capturi înainte/după"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["238"]
performance_checks: ["frame"]
owner: null
started_at: null
completed_at: null
---

# 239 Direcția vizuală V4 și harness de capturi înainte/după

## Obiectiv

Fixează direcția vizuală V4 („realism stilizat curat”) și construiește harnessul de capturi pe care îl folosesc toate PBI-urile 240–253 ca dovadă înainte/după. Fără acest harness, îmbunătățirile vizuale nu pot fi comparate obiectiv.

## Context și plan

Citește [Calitate vizuală V4](../../Docs/30-calitate-vizuala-v4.md) și [auditul din 16 noiembrie](../../Docs/Evidence/visual-audit-2026-11-16/README.md). Auditul a fost făcut manual, cu un agent care a jucat jocul, deci cadrele nu se pot repeta. Harnessul trebuie să poziționeze camera determinist, fără input de jucător.

## Dependențe

- PBI 238 trebuie să fie în Done.

## Criterii de acceptare

- [ ] `Docs/03-babylon-engine.md` și `Docs/16-asseturi-vizual-si-audio.md` trimit la decizia din 16 noiembrie 2026 din documentul 30; textul vechi rămâne vizibil ca istoric, nu este șters pe ascuns.
- [ ] Un mod de cameră numai pentru capturi, activat explicit (de exemplu `?capture=1`), fixează seed-ul, ora și pozițiile vehiculelor și expune `window.__visualCapture.go(viewId)`. Nu este accesibil în build-ul normal fără flag.
- [ ] Cel puțin 12 cadre numite acoperă: personaj aproape, taxi aproape (3/4 față), taxi din spate în mers, stradă la nivelul ochilor, intersecție cu trecere de pietoni, fațade aproape, oraș de sus, orizont, decor (copac, bancă, stâlp, adăpost), mașini civile, marginea hărții și UI/HUD.
- [ ] `npm run visual:capture -- --out <dir> --preset <LOW|MEDIUM|HIGH>` pornește `vite preview`, randează toate cadrele la 1920×1080 și scrie PNG-uri plus un `manifest.json` (commit, backend, renderer, preset, viewport, timp de cadru per vedere).
- [ ] `npm run visual:compare -- <before> <after>` produce o pagină HTML cu perechi alăturate și diferența procentuală de pixeli per cadru.
- [ ] Baseline-ul V4 pe codul de la începutul PBI-ului este salvat în `Docs/Evidence/239-visual-baseline/` pentru HIGH și LOW.

## Verificare

Rulează harnessul de două ori pe același commit: aceleași cadre trebuie să difere sub 0,5% din pixeli (pragul pentru zgomotul de animație). Rulează `npm test`, `npm run typecheck` și `npm run lint`. Atașează pagina de comparație baseline-vs-baseline.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '239' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual al compunerii V3, la cererea utilizatorului ca jocul să arate realist, curat și HD.
