---
id: "031"
title: "Calibrare și paritate manual autonom"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["026","027","028"]
owner: "Codex gpt-6.1-sol medium physics-calibration-031"
started_at: "2026-10-11T22:57:37.902Z"
completed_at: "2026-10-12T02:10:04.1877231+03:00"
---

# 031 Calibrare și paritate manual autonom

## Obiectiv

Finalizează presetul de fizică realistă și fixture-urile pentru ambele clase.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 026 trebuie să existe în Done înainte de începere.
- PBI 027 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Distanțele și răspunsurile sunt documentate ca măsurători ale jocului.
- [x] Aceleași comenzi produc rezultate echivalente din surse manual și AI.

## Verificare

Rulează matricea de frânare, viraj și contact pentru ambele clase.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: presetul empiric 023/026/027 este fixat și documentat fără retunarea runtime-ului. Matricea 031 execută frânare 10/20/30 m/s, viraj geometric de 17 m la 8/20 m/s, manevră laterală, bordură și contact între două vehicule, pentru sedan/compact pe dry/reduced. Captura finală r4 conține 120 lumi Rapier: 32 perechi PLAYER/AUTONOMY, 32 repetări PLAYER și 24 referințe fizice 026. Comenzile efective, drivetrain-ul și întreaga stare fizică/contactele coincid exact pe fiecare tick. Cleanup-ul celor 96 lumi compuse prin controller este verificat.

Verificări executate și rezultat: Volta Node 24.21.0/npm 11.19.0; `npm run check` PASS (693/693 teste, ambele TypeScript, lint, format, arhitectură); `npm run build` PASS. `node scripts/verify-physics-final.mjs Docs/Evidence/031-physics-calibration/capture-20261012-r4 --current` PASS independent, cu sursa, native, raw, rolurile și terminalul verificate. Testele negative ale cititorului trec 4/4 (inclusiv trei scenarii adverse). Loguri integrate: [check](../../Docs/Evidence/031-physics-calibration/parent-check-r1.txt), [build](../../Docs/Evidence/031-physics-calibration/parent-build-r1.txt), [cititor](../../Docs/Evidence/031-physics-calibration/parent-reader-r1.json), [teste adverse](../../Docs/Evidence/031-physics-calibration/parent-reader-tests-r1.txt). Verificările scoped și istoricul sunt în [indexul dovezilor](../../Docs/Evidence/031-physics-calibration/README.md). Validarea boardului și planului după mutare este consemnată în istoric.

Fișiere și documente actualizate: `tests/vehicles/physics-calibration-fixture.ts`, testele native și ale cititorului, `scripts/calibrate-physics-final.mjs`, `scripts/verify-physics-final.mjs`, [contractul și măsurătorile](../../Docs/physics-calibration.md), Docs/05, Docs/README, PBI/README și arhivele Docs/Evidence/031-physics-calibration. `.loop-pbi.json` configurează indexul real; `.gitattributes` păstrează bytes-urile dovezilor. Implementarea 026 deja finalizată a fost publicată separat ca prerequisite în commit 997bedd, fără retunare sau includerea altor PBI-uri în lucru.

Limitări sau follow-up: calibrare empirică a jocului pe material plat uniform, fără model complet de anvelopă/ABS/transmisie. Virajul de 17 m este comandă geometrică, nu rază impusă; manevra laterală nu certifică achiziția centrului unei benzi. Bordura joasă produce contact raycast al roților, fără impact de șasiu. Comenzile sunt livrate identic la 60 Hz; politica AI și tastatura umană nu sunt echivalate artificial. Nivel funcțional, fără modificări de produs pe tick/frame: probele browser 026 neafectate sunt reutilizate, fără playtest sau benchmark hardware nou revendicat. Jocul integrat și memoria/GPU/input latency exactă rămân necertificate. Istoricul r1–r3 și eșecul lint r2 sunt păstrate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '031' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `functional`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

- 2026-10-12T02:10:04.1877231+03:00: Matricea funcțională r4 și review-ul independent PASS; check 693/693, teste adverse 4/4 și build PASS. Fără schimbări ale mecanicii runtime. Dependența 026 publicată separat în 997bedd; 031 pregătit pentru mutarea obligatorie și validarea finală.

- 2026-10-12: Mutarea fizică în Done este confirmată; taskul lipsește din To Do/In Progress. Validate-Board.ps1 -RequireDone '031' PASS: 235 PBI, 181 To Do/3 In Progress/51 Done. Validate-Plan.ps1 PASS: 1380 linkuri locale, 29 module/80 parametri. Indexul de progres este recalculat din coloanele reale. Wrapperul inițial a interpretat eronat LASTEXITCODE rămas de la o comandă anterioară; ieșirea validatorului era Valid=true și a fost reverificată direct, fără modificarea boardului sau a criteriilor.

- 2026-10-12: Integrarea Git verifică byte-exact toate cele 45 fișiere din closure-ul măsurat și artifactul Rapier în tree-ul staged; source d7687581 și matrix e844d83d. Dovadă: Docs/Evidence/031-physics-calibration/parent-git-source-binding-r1.json. Sursele măsurate păstrează LF la checkout, iar dovezile nu sunt convertite. Validatorul intern loop-pbi PASS, 235 taskuri; boardul și planul au fost verificate separat cu validatorii proiectului. Delegarea shared-checkout este închisă, fără servere sau worktree nou; cele patru worktree-uri preexistente sunt păstrate.
