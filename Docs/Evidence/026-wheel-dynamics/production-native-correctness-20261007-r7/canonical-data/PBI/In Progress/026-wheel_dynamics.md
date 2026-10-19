---
id: "026"
title: "Roți suspensie și aderență"
status: "In Progress"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["024","014"]
performance_checks: ["simulation","frame","memory"]
owner: "Codex gpt-6.1-sol medium wheel-dynamics-01"
started_at: "2026-10-05T15:12:11.540Z"
completed_at: null
---

# 026 Roți suspensie și aderență

## Obiectiv

Calibrează suspensia, contactul roților și pierderea aderenței.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) guvernează dinamica pe tick, proiecția roților și retenția; păstrează baseline-ul înainte de modificări.

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 024 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Virajele rapide pot produce alunecare și distanța de oprire depinde de aderență.
- [ ] Roțile vizuale reflectă starea fizică și nu o controlează.

## Verificare

Rulează curbă cu rază fixă și suprafețe de calibrare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Draft izolat wheel-dynamics-01 după baseline: catalog versionat pentru suprafețe plate, aderență aplicată nativ și proiecții readonly ale roților fizice. Nu este integrat și nu este încă validat.

Verificări executate și rezultat: BEFORE cronologic PASS în 10 lumi Rapier înainte de modificări, sourceHash 4f25789987ab81ad3bac1aa717ce11b351e9bb3860193e3772a199622e97d6e7; surse și artifact nativ arhivate immutable în worktree, Docs/Evidence/026-wheel-dynamics/before/node.json. Testele, AFTER, calibrarea de aderență/suspensie și browserul nu au fost executate.

Fișiere și documente actualizate: drafturile src/vehicles/road-surfaces.ts, physics.ts, rapier/index.ts, src/rendering/physical-wheels.ts; scripturi de benchmark/calibrare, teste și fixture-uri browser în worktree wheel-dynamics-01.

Actualizare la reluare: full check PASS, 396/396 teste; calibrarea fizică în 28 scenarii și AFTER-v2 în 10 lumi PASS. Toate cele zece checksumuri fizice și inputuri implicite corespund exact baseline-ului. Metricul corectat măsoară viteza laterală la roată în axa anvelopei bracate, inclusiv viteza unghiulară; captura inițială eșuată și sursele sale sunt păstrate. SourceHash final 35e4a4d66abb80cc779c8760b5833039c1f0f6fa3fd94955f2e3ad44c21ba0f8. Buildul fixture-ului browser PASS; serverul 5197 este pregătit.

Limitări sau follow-up: Probe browser pe ambele backenduri, integrare finală, mutare și publicare restante. Suprafețele sunt un catalog de calibrare pentru lumi plate; nu reprezintă contact mixt pe drumuri. Niciun criteriu Done nu este declarat. CPU/browser se execută exclusiv, pe rând cu 025 și 219.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '026' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T18:12:11.1556665+03:00: Scope simulation/frame/memory adăugat înaintea calibrării și proiecției roților. Dependențele 024/014 sunt Done; implementarea folosește worktree separat de captura 219.

- Proba completă WebGPU a ajuns la export după1500.561s, dar HTTP a respins salvarea. Nu este hardware PASS: metricile nu au fost păstrate. Cauza dovedită: payloadul real de calibrare443642bytes depășea limita262656bytes (HTTP400 pentru identitate mică invalidă,413 pentru aceeași identitate cu curbele reale). Captura eșuată,61surse/142artifacts și manifestul sunt păstrate byte-exact. Repararea transportului bounded și noua captură completă sunt necesare; fizica/pragurile/warmupul rămân neschimbate.

- 2026-10-05: Cauza exportului r1 confirmată HTTP: payload443642bytes respins413, control mic400. Transport reparat cu limită finită4MiB, teste HTTP reale incluzând limita exactă/+1 PASS în TEMP. Noul build source1025f9ac/artifactb0a5ff60 arhivat; probele complete trebuie repetate, fără acceptare hardware până la rapoarte valide.

- 2026-10-06: Runda r3 full AUTO/WebGPU a expirat la 01:19 UTC fără export terminal; raportul independent original TIMEOUT este păstrat. Ulterior, pagina Chrome și raportul failed-1791249623806-WEBGPU.json (createdAt 01:20:23.775Z, SHA256 765de8efc35beb8c8ff82e2431ad5f6a535b0cb4607bbb8ee41c5c8f8b19505d) au confirmat Fixed-tick overload: pauză RAF 1,875,822.7ms la armIndex2/tick456. Identitatea source52671c780d666e6b563ae7e12256a26e3e1b1dfa434175617c5471531df4ad45/artifactd4eb36a7f2c215812f71d6f23be8ec27ec3cf9476b65186ec8a83b9a237b69df și exportul funcționează. Două arms complete sunt INCOMPLETE pentru protocolul complet; cauza pauzei rămâne neconfirmată. Blocaj de mediu/verificare: necesară disponibilitatea fizică a ferestrei Chrome foreground pe durata unei noi probe complete. Nu există hardware PASS și WebGL2 nu a fost lansat de parent în r3; CPU eliberat după confirmarea stării terminale. AFTER-main-027 și arhiva diagnostică au fost reverificate read-only PASS; pragurile și fizica rămân neschimbate.

- 2026-10-06: R4 AUTO Full pornit de parent în Chrome08:53:16Z după confirmarea fizică25minute; source52671/d4eb/0512 neschimbate. Captura failed-1791278505852-WEBGPU.json09:21:45.822Z,23504bytes SHA6435f6b7f6511b0d7edd8fb6332fb201e2a7083a300e55b81079d4a72e5e9dce: Fixed-tick overload în ultimul braț9 după9 brațe complete, RAF281951.2ms/debt281.958s/tick4418; foregroundtrue la export nu dovedește focus continuu ori cauza pauzei. Monitorul R4 a ratat acest fișier și a raportat TIMEOUT09:28:26Z. O a doua captură distinctă09:28:52.170Z failed-1791278932179-WEBGPU.json10554bytes SHAa019d89665bb3c6cd2a5eef681a0764791a7ef3e940fc86aecf464c64decd81a: Foregroundlost la braț2 după2 complete, origine lansare neidentificată. Exporturile au reușit; niciun PASS nu se reconstruiește. Review finit026-webgpu-full-r4-independent-inspection.json păstrează datele; parent a confirmat UIterminal Runenabled și a restaurat CDP1920/DPR1. Probe hardware eliberate; cauza stallului rămâne neprobată, fără rerun sau waiver.
- 2026-10-07: Protocolul distinct browser-v2 a trecut25/25 teste pure (lifecycle13,ledger5,capacity2,numericreader4,device-loss1), ambeleTypeScript, format/lint/sintaxă/arhitectură; primele erori de format/lint și corecțiile scoped sunt păstrate în v2-finite-checks-20261007-r3. SOURCE-only aggregate d91a8d4b208397a3811ff0e7922838b765076941745c10d656b6a546de903fbe, fără buildidentity. Worst-shape raw13229880B/terminal12617226B/terminal-error13438060B se păstrează lossless în părți, maxrequest705549B sub4MiB, fiecarelogical sub16MiB. 139căi istorice rehash-exact, HTTPtemporar închis și CPU eliberat. Probe native/build/Chrome/performanceacceptance rămân neexecutate; urmează corecții SOURCE pentru cleanup-ul pre-return/partial care pot pierde resurse ori cauze. Nu atribuie cauza stallului și nu schimbă gate-urile.

- 2026-10-07: După reviewSOURCE, cleanup-ul026 acoperă independent backend/partialWebGPU/canvas, pre-returnRapier și normaldispose cu once-fence/identități erori/rezervare păstrată dacăfree eșuează. DoveziSOURCE production-ownership-source-20261007-r1 și production-disposal-source-20261007-r2 în wheel-dynamics-01;16draftpure/2draftnative încăNEEXECUTATE. Cele139originale și21fișierev2 păstrate. Nicioacceptarehardware/beneficiu/Done; urmeazăstatic/pure dupăCPU030, apoinative și binding laAFTERnou (b696 rămâneHISTORICAL).


- 2026-10-07: Cleanup-ul026 a trecut22/22pure, ambeleTypeScript/lint10paths/format/architecture EXIT0 în production-static-pure-20261007-r6. Primulpreferconst și formatFAIL păstrate; revizia1256a2441becc63a7d8765236a0772fd4bc0570721f1bef7fb666d1ff3c00cd0,1052fișiereprotected/139originale/21v2 nemodificate. CPUeliberat; parentautorizează separatnativefactory2tests10scenarios și physics suites dupăarhivă, fărăbenchmark/build/browser/Done.

