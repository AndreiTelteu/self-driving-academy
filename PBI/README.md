<!-- loop-pbi:progress:start -->
| Module | Remaining phases | To Do | In Progress | Done / Total | Progress |
|---|---|---:|---:|---:|---|
| Companie | V1 | 2 | 0 | 0 / 2 | `░░░░░░░░░░` 0% |
| Documentație | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Economie | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Fizică | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Flotă și curse | V1 | 3 | 0 | 0 / 3 | `░░░░░░░░░░` 0% |
| Haos | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Integrare joc | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Interfață | V1 | 7 | 0 | 0 / 7 | `░░░░░░░░░░` 0% |
| Misiuni | V1 | 2 | 0 | 0 / 2 | `░░░░░░░░░░` 0% |
| Moduri și learning | V1 | 3 | 0 | 0 / 3 | `░░░░░░░░░░` 0% |
| Persistență | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Pietoni și pericole | V2 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Progres | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Release | V4 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Sesiuni | V1 | 1 | 0 | 0 / 1 | `░░░░░░░░░░` 0% |
| Trafic | V1 | 2 | 0 | 0 / 2 | `░░░░░░░░░░` 0% |
| Total | - | 29 | 0 | 0 / 29 | `░░░░░░░░░░` 0% |
<!-- loop-pbi:progress:end -->

# Backlog Kanban Self Driving Academy

**Resetat la 26 noiembrie 2026.** Taskurile 001–258 au fost retrase din board; istoricul și dovezile lor rămân în Git și în `Docs/Evidence/`. Boardul curent conține **29 taskuri** pentru tot ce lipsește din jocul jucabil, cu ID-uri noi care continuă de la **259**. Nu reutiliza ID-urile 001–258.

Toate taskurile sunt în **To Do**. Nu s-a implementat niciunul; crearea planului nu este livrare. Fiecare task are obiectiv, ce lipsește, documentația completă, dependențe, criterii, verificare și dovadă.

## De ce a fost resetat boardul

Boardul vechi avea 257/258 taskuri Done, dar majoritatea erau **contracte izolate**, nu funcționalități montate în joc. `src/main.ts` compunea doar randarea V3, iar Academie, flota, cursele, LEARNING, KPI, misiunile, XP, salvarea și compania nu erau în bucla jucabilă. Noul board tratează exact această diferență: fiecare task cere comportament observabil în joc, nu doar un modul testat.

Starea completă, pe zone și cu linkuri, este în [Docs/31 — Starea implementării și lacunele](../Docs/31-stare-implementare-si-lacune.md).

## Etape

| Etapă | IDs | Număr | Livrabil |
| --- | --- | --- | --- |
| V1 | 259–285 | 27 | Integrarea jocului jucabil: shell, sesiuni, flotă, curse, economie, companie, moduri, learning, misiuni, XP, persistență, UI, fizică, trafic, destructibile |
| V2 | 286 | 1 | Pietoni, treceri și pericole în lumea live |
| V3 | — | 0 | Mersul pe jos este deja livrat; integrarea lui rămâne în taskurile V1 |
| V4 | 287 | 1 | Gate vizual, QA final, playtest, hardware și release |

## Index

| ID | Titlu | Modul | Etapă | Dependențe |
| --- | --- | --- | --- | --- |
| 259 | Gardă de sincronizare pentru documentația de stare și board | Documentație | V1 | — |
| 260 | Shell-ul jocului și composition root pentru Academia jucabilă | Integrare joc | V1 | — |
| 261 | Sesiuni Academie și Haos, schimbare, reset și recuperare | Sesiuni | V1 | 260 |
| 262 | Flota live: 20–30 taxiuri și 20–40 civili, nu doar date în registry | Flotă și curse | V1 | 260 |
| 263 | Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER | Interfață | V1 | 262 |
| 264 | Cereri de curse live, coadă și dispecerizare către flota reală | Flotă și curse | V1 | 262 |
| 265 | Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD | Flotă și curse | V1 | 264 |
| 266 | Economia live: revenue, review-uri, KPI și ceasul economic | Economie | V1 | 265 |
| 267 | Panoul KPI, tabloul orașului și feedbackul consecințelor în joc | Interfață | V1 | 266 |
| 268 | Modelul financiar al companiei: costuri, profit, cash și P&L | Companie | V1 | 266 |
| 269 | Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri | Companie | V1 | 268 |
| 270 | Panoul companiei: profit, costuri, cash, flotă și investiții | Interfață | V1 | 268,269 |
| 271 | Cele trei moduri live: AUTO, MANUAL, LEARNING și toate tranzițiile | Moduri și learning | V1 | 260,263 |
| 272 | Telemetrie, oportunități și eligibilitate din condusul live | Moduri și learning | V1 | 271 |
| 273 | Pipeline-ul de learning live: dovezi, worker, profil și activare | Moduri și learning | V1 | 272 |
| 274 | Interfața de learning și profil: notificări, explicații, istoric și restore | Interfață | V1 | 273 |
| 275 | Campania, tutorialul și panoul de misiuni în jocul live | Misiuni | V1 | 260,265,271 |
| 276 | Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc | Progres | V1 | 260,265,271 |
| 277 | Provocările random, directorul, panoul și reluarea în joc | Misiuni | V1 | 260,265,271 |
| 278 | Persistență live: autosave, checkpoint, savefile și recuperare | Persistență | V1 | 260,266,276 |
| 279 | Setări, remapare taste și slidere de control/stil în joc | Interfață | V1 | 260 |
| 280 | Camera first-person din poziția șoferului | Interfață | V1 | 260,263 |
| 281 | Minimapa, harta de flotă și HUD-ul complet de joc | Interfață | V1 | 260,263 |
| 282 | Fizica Rapier live pentru jucător și AI | Fizică | V1 | 260,262 |
| 283 | Regulile de trafic live: semafoare, STOP, prioritate, yield și benzi | Trafic | V1 | 260,262,282 |
| 284 | Traficul civil complet autonom și preluarea oricărei mașini | Trafic | V1 | 262,283 |
| 285 | Decor destructibil, feedback audio și replay în joc | Haos | V1 | 282,283 |
| 286 | Pietoni, treceri și pericole V2 în lumea live | Pietoni și pericole | V2 | 282,283 |
| 287 | Gate V4, QA final, playtest și release verificat | Release | V4 | 259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,281,282,283,284,285,286 |

## Ordinea de lucru

1. **Fundația:** 259 (docs sync) și 260 (game shell).
2. **Lumea live:** 261 (sesiuni), 262 (flotă), 263 (selecție), 264–265 (curse).
3. **Economie și companie:** 266–270.
4. **Moduri și learning:** 271–274.
5. **Progres:** 275–277.
6. **Persistență și UI:** 278–281.
7. **Fizică, trafic, distracție:** 282–285.
8. **V2:** 286.
9. **Release:** 287.

Dependențele din fișiere sunt sursa de adevăr; ordinea de mai sus este o recomandare, nu o a doua matrice.

## Documentație pe zone

- [Starea implementării și lacunele](../Docs/31-stare-implementare-si-lacune.md)
- [Companie: profit și evoluție](../Docs/32-companie-profit-si-evolutie.md)
- [Produs și scope](../Docs/01-produs-si-scope.md)
- [Flotă și curse](../Docs/07-flota-si-curse.md)
- [Interfață, cameră și control](../Docs/08-interfata-camera-si-control.md)
- [Învățarea stilului](../Docs/10-invatarea-stilului.md)
- [Misiuni și progres](../Docs/13-misiuni-si-progres.md)
- [KPI-uri, economie și review-uri](../Docs/22-kpi-economie-si-review-uri.md)
- [Misiuni zilnice și XP](../Docs/23-misiuni-zilnice-si-experienta.md)
- [Persistență](../Docs/15-salvare-si-import-export.md)
- [Performanță](../Docs/25-performanta-contracte-si-benchmark.md)
- [Validare](../Docs/18-validare-si-release.md)

## Validare

Din rădăcină:

```powershell
& './PBI/Validate-Board.ps1'
& './PBI/Validate-Plan.ps1'
bun "$HOME/.agents/skills/loop-pbi/scripts/loop-pbi.ts" validate --root . --allow-project-commands
```

`Validate-Board.ps1` verifică plasarea fizică, statusul, owner-ul, dependențele și ciclurile. `Validate-Plan.ps1` verifică indexul, counturile, matricea Docs/21, acoperirea Docs/31 și linkurile locale. `loop-pbi validate` rulează aceleași comenzi prin configurația proiectului.

## Reguli

- Un task are un singur fișier; mută-l, nu îl copia.
- Statusul din frontmatter trebuie să corespundă folderului.
- Nu marca Done fără criterii, dovezi, verificări și mutare fizică.
- Nu declara release-ul închis cât timp 287 are criterii deschise.
- Nu folosi vechiul board ca dovadă că jocul este complet; folosește comportamentul observabil din buildul curent.

[Regulile complete pentru agenți](AGENTS.md) rămân obligatorii.
