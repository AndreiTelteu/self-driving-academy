---
id: "049"
title: "Controller lateral și urmărirea benzii"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["045","024","033"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium lateral-controller-01"
started_at: "2026-10-05T19:56:48.260Z"
completed_at: "2026-10-06T00:41:35.564Z"
---

# 049 Controller lateral și urmărirea benzii

## Obiectiv

Transformă geometria traseului în direcție și limite de viraj.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 045 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 033 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Mașina urmează viraje fezabile fără teleportare.
- [x] Controlul lateral păstrează aceeași fizică ca manualul.

## Verificare

Parcurge curbe și viraje la viteze diferite.

Înaintea algoritmului, arhivează un baseline pe fixture-ul real disponibil și verifică același protocol AFTER, conform Docs/25-performanta-contracte-si-benchmark.md și manifestului203. Raportează separat costul controllerului și ownership-ul plafonat; probele driving necesită dovezi browser pe backendurile reale, fără a substitui FPS hardware cu Node. Nu modifica mecanica024 și nu depinde de implementările026/027 încă nefinalizate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Controller lateral cu ownership plafonat, trasee directionate032/033 și TURN-uri authored, direcție normalizată și motive explicite de nefezabilitate. Fără schimbarea mecanicii024 ori scrieri de pose/viteză după setup. Contractul și limitele sunt în [lateral-controller.md](../../Docs/lateral-controller.md).

Verificări executate și rezultat: npm run check PASS457 teste în checkout-ul izolat. Baseline-ul cronologic original și refresh-v3 sunt arhivate înaintea algoritmului; AFTER-v2 are20lumi70/110 și4probe de paritate exacte, zero regresii confirmate față de ambele baseline-uri. Calibrarea-v3 PASS22manevre valide și4infezabile. Chrome real AUTO/WEBGPU și WEBGL2 PASS câte6manevre sedan/compact straight/LEFT/RIGHT, fără taste. Verificatoarele AFTER-v2, calibration-v3 și driving-v3 au trecut independent la parent. Surse browser2de345e932deba57167c61214c0c72c3d83ca76ca9684993ff1826932d7d6877; artifact88709e69f22b7a17ccc17e06d729122ba71668c4f64a7dc30193b8667a8ae1f5. [Dovezi brute și verificatoare](../../Docs/Evidence/049-lateral-controller/).

Fișiere și documente actualizate: src/autonomy/lateral-controller.ts și exportul public; teste semantice/adversariale/native, benchmarkuri, fixture browser5200, Docs/lateral-controller.md, indexul Docs și modulul06, arhivele native/surse/build și toate rapoartele în Docs/Evidence/049-lateral-controller.

Limitări sau follow-up: Envelope empiric pentru geometria/suprafața/vitezele testate, cu predictor longitudinal explicit al fixture-ului; fără certificare pentru flota completă, FPS, laptop, stil ulterior, exact heap ori toate suprafețele. Callerul deține tokenurile compilate; ownerul păstrează maximum110actori/28160puncte/1024identități pe epoch. Regresia inițială3/5, erorile de comparație Rapier/JSON și de expected-float32 sunt păstrate separat; nu au înlocuit baseline-ul ori pragurile. Costul propriu110 după optimizare p95≈0.82–0.94ms. Audit separat de GitINDEX păstrează dovezile byte-exact și diferența cunoscută CRLF/LF a bugetului; verificatoarele originale rămân stricte.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '049' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-06: AFTER-v2 și calibrarea-v3 acceptate; parent a rulat driving-ul real pe ambele backenduri Chrome și a verificat rapoartele. Implementare7197672; integrarea finală verifică fizic Done și publicarea.
- 2026-10-06: Mutare fizică în Done, npm run check integrat PASS457 teste; audit310runtime rows byte-exact în GitINDEX, cu3diferențe CRLF/LF numai în checkout-ul bugetului. Verificarea finală a boardului și planului rulează după mutare.
