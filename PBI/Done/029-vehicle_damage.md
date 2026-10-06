---
id: "029"
title: "Avarie și stare de vehicul blocat"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["028","024"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium vehicle-damage-01"
started_at: "2026-10-05T18:17:24.734Z"
completed_at: "2026-10-06T11:56:55.219Z"
---

# 029 Avarie și stare de vehicul blocat

## Obiectiv

Modelează consecințe simple de avarie și disponibilitate pentru flotă.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un vehicul avariat are stare explicită și efect documentat asupra mișcării.
- [x] Recuperarea nu șterge istoricul incidentului.

## Verificare

Testează praguri de avarie și imposibilitate de deplasare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: AVAILABLE/DAMAGED/IMMOBILIZED cu praguri calibrate echivalente 2/8m/s, plafon de propulsie 0,5/0 și frână minimă 1 la imobilizare. Recuperarea etichetată păstrează prefixul incidentelor; controllerul comun respectă sensul și frâna027.

Verificări executate și rezultat: 38 teste native/controller combinate PASS; comparația CPU cronologică actuală după027 are 0/5 regresii. Chrome WEBGPU și WEBGL2: fiecare 12 cazuri funcționale +20 cicluri ownership și 20 brațe complete de 30s warmup/120s măsurare, 580 checkpointuri exacte, criterii obligatorii CPU/frame/memorie JS agregată PASS. npm run check pe main: typecheck/lint/format/arhitectură și 522/522 teste PASS. Auditul delivery-portable-proof.mjs: arhive main, 71 surse din index exact egale, 58 artefacte, 22 referințe publicate, ambele capturi complete și funcționale PASS. [Index detaliat](../../Docs/Evidence/029-vehicle-damage/current-delivery-summary.md), [audit integrare](../../Docs/Evidence/029-vehicle-damage/delivery-portable-proof.mjs).

Fișiere și documente actualizate: src/vehicles/damage-state.ts, damage-port.ts, controller.ts/controller-port.ts/index.ts; teste native și harnessuri browser cu verifiers; Docs/vehicle-damage.md, Docs/05-vehicule-si-fizica.md și Docs/Evidence/029-vehicle-damage. Copia instrumentată de diagnostic păstrează bytes fixați prin derivation.json și este exclusă explicit din formatare; producția rămâne verificată.

Limitări sau follow-up: GPU și latența inputului NOT_MEASURED; verdictul opțional/global al collectorului rămâne UNVALIDATED. Heap JS este proxy cu peak observat inferior, fără RAM nativ/WASM/totală, laptop sau joc complet. Perechile individuale de heap eșuate rămân în dovezi: WEBGPU ON 2/5, WEBGL2 OFF 2/5 și ON 1/5; agregatele trec pragul neschimbat de trei perechi. Eșecurile v2–v5 și probele funcționale inițiale rămân imuabile; succesele actuale nu dovedesc cauza eșecurilor istorice. Working tree main are diferență CRLF/LF pentru bugete; indexul Git corespunde exact capturii, fără afirmație CURRENT byteexact a working tree.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '029' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- BEFORE cronologic executat înainte de damage029:10lumi70mașini024,180warm/600ticks, surse/native/checksums/cleanup PASS, source5d848563c377b3cad492d61757e9e5af5e873ed2d4c68c2c1d255eeff9f4cd82. Calibrare native028-v2 în8impacturi1/3/6/12m/s sedan/compact PASS; erorile inițiale/sursele sunt păstrate în worktree. Impulsurile reale bracket candidatele mass-normalized2m/s damaged și8m/s immobilized; efectul fizic029 trebuie încă verificat. Autorul pregătește light algoritmul în worktree, fără CPU/probe în timpul FULL026.

- 2026-10-05:22teste native/controller și typecheck/lint PASS; AFTER-v2 păstrează exact10physical/input/intermediate traces. Gate relativ CPU eșuat în5/5perechi: tickp95 BEFORE1.65–1.82ms, AFTER3.10–3.32ms, delta>10% și>1ms. Pragul absolut5.5ms trece, dar nu înlocuiește regresia. Optimizare și recaptură necesare; browser029 nu este încă acceptat.

- 2026-10-05: Revizia independentă r1 CHANGES_REQUIRED: CPUcronologicv4FAIL4/5; controlul alternat0/5 nu înlocuieștebaseline-ul. EndpointheapAfterMeasured +5.62–7.27MB în5/5perechi necesită atribuirea retenției/alocărilor/GC; postdisposeGC~40KB nu este runtimeheapPASS. DiagnosticGC/liveworld separat în curs, fără acceptare ori modificare de prag.

- 2026-10-05: ReviziaGC r2 CHANGES_REQUIRED: live-worldpostGC deltasON +6,776/-600/+37,376/-25,976/+45,120bytes, fără exces reținut multiMiB. Endpointraw/transientpresiune și CPUcronologicFAIL4/5 rămân neclarificate. Captura originală include333evenimenteGC în ferestre și contor232 în afară, fără232rawdetails. V5 în pregătire elimină callbackperread fără schimbarea fences; verificări și revizia r3 în curs, fără Done.

- 2026-10-05: Review independent r3 CHANGES_REQUIRED; chronological CPU v5 FAIL5/5 rămâne obligatoriu. Runda unică diagnostică20lumi source79834d78157c94919adeb7cfa92489ec6bfce992282e80447fa55c90197eedd7 a păstrat536GC și12000tick-uri nesortați, paritate fizică și cleanup PASS. Stacks aliniate semantic: costuri native partajate și GC mixt, site mic Math.min repetabil dar fără cauză demonstrată pentru regresia >1ms. Blocaj de verificare; fără optimizare speculativă, baseline înlocuit sau nou AFTER orb. Dovezi în worktree vehicle-damage-01/Docs/Evidence/029-vehicle-damage/allocation-diagnostic-disposition.md și aligned-summary; nu sunt încă integrate. Următor: dovezi cauzale acționabile, integrarea semnului027 după livrare și probe foreground curente; server5199 este stale și neacceptat.

- 2026-10-06: Integrarea izolată a semnului027 în bf78ad85bb0b32e63d065e663829c6aa8cad2fb1 a trecut 38 teste focalizate, inclusiv frână/reverse/availability nativ pentru ambele clase. Nu închide eșecul CPU cronologic v5 5/5. Auditul static a găsit clone suplimentare în noua etapă finală după027; acestea nu existau în v5 și nu reprezintă o cauză demonstrată a regresiei originale. O singură probă diagnostică limitată OFF/ON pe copia instrumentată este pregătită și revizuită, încă NEEXECUTATĂ: final-stage-probe-plan.md, vehicle-damage-final-stage-diagnostic.mjs și derivation.json în worktree. Grantul exclusiv CPU urmează după probele066; fără modificarea producției, inspector suplimentar, baseline înlocuit sau acceptare AFTER.

- 2026-10-06: Singura probă diagnostică final-stage executată source d4d7309cd45995ff2f6dda0ae16cda36cd33fcfcad6ff162cd384c2ebf2a6ced:10 lumi/210000 ferestre temporale finite, paritate fizică/input/checkpoint față de original, arhive/native/cleanup PASS; parent a reverificat independent36 surse și toate capturile parțiale. Etapa locală p95 .0202–.0319ms/tick, variații OFF/ON fără cost cauzal izolat; nu justifică optimizare și nu înlocuiește v5FAIL5/5. Producția bf78ad85 a fost schimbată legitim prin integrarea semnului027 și cere o singură validare AFTER curentă încă absentă: vehicle-damage-after-current027.mjs, controller real, protocol v5 default fără opt-in, baseline și praguri originale intacte. Grant CPU exclusiv pentru această validare; nu este o afirmație că diagnosticul a reparat cauza, iar istoricul heap/browser rămâne obligatoriu.

- 2026-10-06: Validarea unică AFTER a producției actuale bf78 după027 PASS, source241fa88eb95b7f770e549ee831961ad9fb8062918752854718d8cae22282251e. Aceleași10 lumi default70/180warm/600ticks păstrează exact input/fizică/checkpoint și zero cleanup. Original BEFOREp95 1.6536/1.7294/1.7618/1.7402/1.8233ms; AFTERcurent1.7731/1.8500/1.8696/1.8990/1.9033ms, delta+.0800–.1588ms,4.39–9.13%;0/5 regresii confirmate și toate sub5.5ms. Native02dc4,340,292bytes și sursele au fost arhivate înaintea primei lumi și reverificate după. Captura curentă nu suprascrie v2–v5FAIL și nu dovedește cauza lor; verificatorul independent, analiza memoriei și probele browser curente rămân înainte de integrare/Done.
- 2026-10-06: Harnessul browser nou a trecut10 teste pure, format/typecheck/lint; erorile inițiale sunt păstrate. Review independent de surse înainte de build a identificat7 probleme: răspuns static după antete, mascarea erorii originale/dublu dispose, ownership neprotejat la scene ready, caz eșuat neexportat, probe funcționale lipsă din validator, failure marker ignorat și gate opțional disponibil ignorat. Se repară numai harnessul și testele afectate; producția241/native și eșecurile istorice rămân neschimbate. Niciun build sau capture browser nou nu este executat.

- 2026-10-06: Cele7 probleme din harness au fost corectate și închise prin review independent readonly. Verificări scoped:16/16 teste pure PASS, faze finale1/1 PASS, format/typecheck/lint PASS; erorile inițiale păstrate. Unicul build nou PASS hardware-20261006T032726912Z:71 surse/47 artefacte, source83aecf5bcda8fbda03bacc2822d51b076dd01fd5f3b48bf4e2d980aef85c3370, artifactff09439b0853190dd9fb0acfab0ba9fdff82cd3fbf196736aa58650f93aee520, native02dc4,340,292bytes. Arhivele buildului sunt în review independent; nu s-au executat probe browser/native noi și acceptarea memoriei rămâne nevalidată. Un eșec de setup anterior inițializării cazului păstrează dovada terminală și ordinalul, fără a pretinde un caz numit complet.

- 2026-10-06: Prima probă Chrome AUTO a buildului83aec/ff094 a eșuat înainte de tick0: importul Babylon StandardMaterial necesar randării lipsește din harness. Captura funcțională20261006T033201784Z păstrează start/case-0/failure; backendWEBGPU real, toate6 resurse eliberate o singură dată, cleanup zero. Dimensiunile1920x1080/DPR1 au fost aplicate temporar prin emulare CDP pentru contractul probei și restaurate; serverul propriu5199 este oprit. Buildul/captura originale rămân imuabile; se repară numai integrarea randării înainte de alt build, fără acceptare hardware/Done.

- 2026-10-06: Buildul nou ff7f/7d7687 a executat și salvat32 cazuri funcționale WebGPU în captura20261006T033725315Z, dar finish a eșuat în verifier: prima tentativă de repaus1/2/3 tickuri este întreruptă de mișcarea nativă a suspensiei peste0.2m/s; raw păstrează și secvența completă ulterioară1..6 (sedan373..378, compact375..380; recovery781..786). Captura rămâne FAILED cu toate32 fișierele și markerul failure, fără ignorarea pragurilor ori acceptare. Se repară selectarea/verificarea secvenței complete și reseturilor reale, cu teste negative; producția/fizica sunt intacte. Serverul propriu67729 este oprit, emularea CDP restaurată, hardware eliberat.

- 2026-10-06: Harnessul corectat verifică dwell nativ complet1..6 și reseturile reale; reset-pose y folosește valoarea Float32 exactă Math.fround(0.8). Capturile eșuate rămân imuabile. Buildul final hardware-20261006T034626897Z sourcebd02a51853838ad2a9375d044699bd604082518538ee09360b2a5dca0fbd2c4a/artifact7d7687d2447c4bac2b3f4d8e703f8229dd54460032291cd0a31910ca3b25a1f4/native02dc a trecut verificarea CURRENT. Chrome funcțional WEBGPU20261006T034738523Z și WEBGL220261006T035249070Z: fiecare12 cazuri native+20 cicluri ownership,34 fișiere fără markere de eșec, cleanup zero și toate resursele încercate o singură dată; verifiers CURRENT exit0. Comparații528bytes SHA d60f6838ea6ef56a4b021d81fe8ffb968eb2c6e8c349cc340f1cc29a67214c43 și1f7b6ef43679ec55ad279e6dfdec0dd6771ca3a2debc2d19ba6482cdec2c4b76. Emularea temporară1920x1080/DPR1 a fost restaurată, serverul propriu24719 oprit după terminal. Performanța50minute/backend și RAM rămân NEVALIDATE; nu este Done.
- 2026-10-06: Full WEBGPU capture 20261006T093158558Z verified CURRENT independently (exit 0): 20 runs, 580 exact checkpoint comparisons, 202 files, all cleanup counters zero. Required CPU/frame/JS proxy memory PASS; ON heap endpoint pairs 1 and 2 fail individually, aggregate passes unchanged three-of-five threshold. GPU/input NOT_MEASURED; optional/global UNVALIDATED. Comparison SHA256 ba36fcd9822224180cd84ec2e0cae946ca3695701df23fb7cc8b805607ae2590; additive inspection hardware-webgpu-full-independent-01.json. Full WEBGL2 capture 20261006T102935092Z started after explicit additional foreground availability; PBI remains In Progress.

- 2026-10-06: Full WEBGL2 capture 20261006T102935092Z passed strict CURRENT independent verification (exit 0): 20 runs, 580 checkpoints, 202 files/1,289,303 bytes, 70 absolute verdicts PASS, zero cleanup counters. Heap endpoints OFF pairs 1/2 and ON pair 0 fail individually; aggregates remain PASS under unchanged three-of-five threshold. Optional GPU/input and global verdict remain UNVALIDATED. Comparison SHA256 4a89930630a0a8b471f50038d14c88a1b305fe46ed244b38a1ab9e15acfda281; hardware-webgl2-full-independent-01.json retains every raw pair. Both backend full captures are now verified CURRENT; server PID76004 stopped after terminal and verification, temporary viewport restored. Final integration/DoD pending; no Done claim.



- 2026-10-06: Integrarea în main a trecut 522/522 teste și toate verificările proiectului. Proof portabil din arhivele canonice: toate cele patru capturi PASS, 71/71 bloburi din index exact egale, 70/71 fișiere locale exacte plus un manifest de bugete CRLF/LF. Helper finish a executat CPU historical și prooful portabil cu exit0. Mutare fizică Done confirmată; Validate-Board -RequireDone 029 și Validate-Plan PASS (235 taskuri, 47 Done).
