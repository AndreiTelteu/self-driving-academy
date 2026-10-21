---
id: "107"
title: "Regresii pentru intervenții și dovezi"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["106","069"]
owner: "opencode deepseek-v4.1-flash learning-edgecases-01"
started_at: "2026-10-21T15:12:42.485Z"
completed_at: "2026-10-21T18:38:56+03:00"
---

# 107 Regresii pentru intervenții și dovezi

## Obiectiv

Finalizează cazurile de pauză, recuperare, segment incomplet și multe străzi.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 106 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Nicio recuperare sau pauză nu devine comportament învățat.
- [x] O intervenție scurtă poate contribui numai la contextele observate.

## Verificare

Rulează toate cazurile negative și pozitive de telemetrie.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Harness-ul `107-learning-edgecases-v1` rulează 13 cazuri închise peste proprietarii reali 087/088/093: pauză, pierdere de focus, recuperare admisă/respinsă/parțială, segment incomplet/deschis, gol de observație, multe străzi, intervenție scurtă și trei controale pozitive. Pauza și pierderea de focus produc artefacte `PAUSE` cu sursa reală, prefixul utilizabil rămâne separat, intervalul suspendat este suprimat, iar o suspendare de la tick 1 devine `FULLY_SUPPRESSED`; nicio dovadă `READY` și nicio schimbare de profil nu rezultă. Recuperarea produce `TELEPORT` cu cauza reală (`RECOVERY_TELEPORT`, `RECOVERY_DENIED`, `RECOVERY_PARTIAL`) și dovada 030: prefixul de dinainte poate rămâne dovezi (689 tick-uri → viteză `READY`), dar intervalul teleportat și tot ce urmează sunt refuzate cu `OBSERVATION_OUTSIDE_USABLE_PREFIX`. Segmentul incomplet/deschis și golurile produc `TRUNCATED`/`PARTIAL`, fără valori fabricate. La multe străzi, trei oportunități distincte produc trei episoade, iar repetările aceluiași `opportunity.id + occurrence` rămân un singur episod; contextele `FREE_TRAFFIC`, `LEADER` și `BLOCKED_GREEN` rămân separate, fără spillover. Intervenția scurtă de 600 tick-uri eligibile în `FREE_TRAFFIC` produce `READY` doar pentru `speed_delta_urban`; cheile following/signal/lane rămân `NO_EVIDENCE`/`INSUFFICIENT`, iar MANUAL este `ELIGIBILITY_EXCLUDED` și nu adaugă niciun episod. Raportul confirmă zero schimbări de profil, candidați, publicări, scrieri în store sau mutații de flotă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (238 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1605/1605 pass, 0 fail; `npm run learning:edgecases` 56/56 verificări, 7 scenarii, overall PASS; `npm run learning:edgecases -- --check` „Learning edge-cases report is current”. Testele țintite 107: 17/17 pass. Raportul acoperă pauză, recuperare admisă, recuperare respinsă/parțială, incomplet/gol, multe străzi, intervenție scurtă și controale pozitive. Dovezi: [report.json](../../Docs/Evidence/107-learning-edgecases/report.json), [report.md](../../Docs/Evidence/107-learning-edgecases/report.md), [README](../../Docs/Evidence/107-learning-edgecases/README.md).

Fișiere și documente actualizate: `src/experiments/learning-edgecases.ts`, `src/app/learning-edgecases.ts`, `src/experiments/index.ts`, `src/app/index.ts`, `tests/experiments/learning-edgecases.test.ts`, `tests/experiments/learning-edgecases-report.ts`, `scripts/run-learning-edgecases-report.mjs`, `package.json`, `Docs/learning-edgecases.md`, `Docs/10-invatarea-stilului.md`, `Docs/README.md` și `Docs/Evidence/107-learning-edgecases/`.

Limitări sau follow-up: Oportunitățile sunt înregistrări deterministe în forma 086, nu produse de registrul live; eligibilitatea 087, filtrarea 088, ledger-ul de recuperare 030 și ledger-ul 093 sunt funcțiile reale. Statutul/cauza recuperării este input de fixture citit prin ledger-ul real; nu a fost executată o plasare 030 nativă. Adaptorul leagă fereastra 088 de `windowId`-ul 087 pentru că cei doi proprietari folosesc namespace-uri diferite; clasa, completitudinea și prefixul rămân neschimbate. Nu sunt exercitate estimatoarele 094–099, worker-ul 103, profile store, flota, captura browser, FPS/GPU sau hardware. `READY` înseamnă doar suficiență descriptivă a dovezii, niciodată estimare sau publicare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '107' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: regresii reale pentru pauză/focus, recuperare, segmente incomplete/goluri, multe străzi și intervenție scurtă, cu zero învățare din pauză/recuperare și contribuție doar pe contextele observate; 17 teste, raport cu 56 de verificări și documentație. Mutat fizic în Done după validare.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
