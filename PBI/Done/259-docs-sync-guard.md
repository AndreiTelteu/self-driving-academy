---
id: "259"
title: "Gardă de sincronizare pentru documentația de stare și board"
status: "Done"
release: "V1"
module: "Documentație"
depends_on: []
owner: "loop-pbi/deepseek-259"
started_at: "2026-11-25T23:36:52.531Z"
completed_at: "2026-11-26T00:17:09.047Z"
---

# 259 Gardă de sincronizare pentru documentația de stare și board

## Obiectiv

Un check executabil care eșuează atunci când documentația curentă, indexul PBI, matricea de acoperire și boardul nu mai descriu aceeași stare.

## Starea actuală și ce lipsește

- README-ul rădăcină și Docs/README conțin încă numere și afirmații din generația 001–258.
- Nu există un check care să compare numărul de taskuri, etapele, titlurile și dependențele din PBI/README cu fișierele reale.
- Docs/21 și noul Docs/31 pot rămâne în urmă fără ca cineva să observe.
- Manualul și documentele de release pot descrie funcții care nu sunt montate în joc.
- Linkurile locale din Docs și PBI nu sunt verificate într-o singură comandă de proiect.
- Nu există o regulă clară pentru ID-urile retrase 001–258 și pentru ID-urile noi 259+.

## Context și plan

- [Validare și release](../../Docs/18-validare-si-release.md)
- [Contracte de performanță](../../Docs/25-performanta-contracte-si-benchmark.md)
- [Politica de validare](../../Docs/validation-policy.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- Niciuna.

## Criterii de acceptare

- [x] O comandă `npm run docs:check` verifică boardul, PBI/README, Docs/21, Docs/31, counturile din README și Docs/README și linkurile locale.
- [x] `npm run docs:check -- --check` nu scrie nimic și iese cu cod 1 cu un mesaj care numește fișierul și câmpul divergent.
- [x] Checkul este inclus în `npm run check` și în configurația loop-pbi, fără a executa comenzi nerevizuite.
- [x] Un task nou sau mutat fără actualizarea indexului produce eșec, nu un raport verde.
- [x] Documentația explică explicit că 001–258 sunt istorice și că boardul curent începe la 259.

## Verificare

- `npm run docs:check` și `npm run docs:check -- --check`.
- `bun "<skill>/scripts/loop-pbi.ts" validate --root . --allow-project-commands`.
- Test negativ: modifică un titlu în PBI/README fără să modifici fișierul și confirmă eșecul.

## Dovezi de finalizare

Rezultat implementare: `scripts/check-docs-sync.mjs` compară boardul fizic cu `PBI/README.md`, `Docs/21`, `Docs/31`, `README.md` și `Docs/README.md`. Verifică frontmatter-ul, indexul, tabelul de progres, counturile de taskuri/module/etape, intervalul 259–287, identitatea dintre Docs/21 și Docs/31, linkurile locale și regula 001–258 istoric. `npm run docs:check -- --check` este read-only și întoarce mesaje `fișier: câmp: detaliu`; `npm run docs:check` este forma de verificare/scriere controlată. Verificarea este inclusă în `npm run check` și în lista `validate` din `.loop-pbi.json`, cu excepția `--pending-task={id}` pentru tranziția loop-pbi.

Verificări executate și rezultat: `npm run docs:check -- --check` PASS (29 taskuri 259–287, 32 documente, 1.755 linkuri, index 29, coverage 29, gaps 29). Test țintit `tests/qa/docs-sync-guard.test.ts` 11/11 PASS, inclusiv mutația unui titlu, task mutat fără progres, task nou fără rânduri, count/etapă divergentă, modul complet cu `Completed` și 100%, link rupt, ID retras și dovada că `--check` nu scrie. `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS. `npm run check` a avut o singură eșuare de timing la testul 229 (`600 identical frames cost 273.5 ms`), iar rularea țintită imediat următoare a testului 229 a trecut 14/14; nu este o regresie a acestui PBI. În worktree-ul copilului, `npm run check` a trecut cu 3.558 teste, 3.544 pass, 0 fail, 14 skip-uri istorice. `loop-pbi validate --allow-project-commands` PASS cu toate cele trei comenzi.

Fișiere și documente actualizate: `scripts/check-docs-sync.mjs`, `scripts/check-docs-sync.d.mts`, `tests/qa/docs-sync-guard.test.ts`, `package.json`, `.loop-pbi.json`, `README.md`, `PBI/README.md`, `Docs/README.md`, `Docs/18-validare-si-release.md`, `Docs/31-stare-implementare-si-lacune.md`. Taskul și documentația de stare sunt actualizate în același commit de integrare.

Limitări sau follow-up: Node-ul local este 24.19.0, sub versiunea declarată `>=24.21.0`; toate verificările au trecut, dar mediul exact rămâne o diferență de infrastructură. `--pending-task={id}` este o excepție îngustă pentru tranziția loop-pbi, documentată în Docs/18; fără ID, garda este strictă. `npm run check` a avut flake-ul de timing 229 descris mai sus, nu o eroare de contract. La integrare, primul modul complet a expus o etichetă `Completed` pe care garda o trata ca `-`; a fost corectată și acoperită de testul 11, iar `docs:check` a revenit PASS.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '259'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-259`; integrat, verificat și mutat în Done.
