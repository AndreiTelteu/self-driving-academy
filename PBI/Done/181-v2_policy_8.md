---
id: "181"
title: "Politică extinsă pentru trasee și recuperare"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","041"]
parameter_role: "policy"
parameter_keys: ["route_time_weight","route_distance_weight","route_turn_penalty","route_signal_penalty","route_congestion_penalty","reroute_patience","u_turn_willingness","reverse_recovery_duration"]
owner: "loop-pbi/v2-policy-181-01"
started_at: "2026-11-13T02:04:23+02:00"
completed_at: "2026-11-13T02:34:19+02:00"
---

# 181 Politică extinsă pentru trasee și recuperare

## Obiectiv

Implementează utilizarea cheilor R: route_time_weight, route_distance_weight, route_turn_penalty, route_signal_penalty, route_congestion_penalty, reroute_patience, u_turn_willingness, reverse_recovery_duration. Folosește alternative de traseu comparabile și normalizează ponderile pentru a elimina ambiguitatea scării.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 041 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `181-route-policy-v2` din `src/autonomy/route-policy-v2.ts` activează cele opt chei R ca politică peste alternativele comparabile livrate de planificatorul 041 (aceeași origine, aceeași destinație). Ponderile sunt normalizate ca cote dintr-un buget comun, `share_k = w_k / Σw`, cuantizate la 1e-12, iar fiecare metrică devine adimensională față de aceeași mulțime comparabilă; referințele se calculează pe mulțimea declarată, nu pe cea admisă. Fiecare cheie are un efect izolat dovedit pe aceeași scenă: timp 113,295 → 60,656 s (`route-short` vs `route-fast`), distanță 1 094,427 → 666,476 m, viraje 4 → 1, semafoare 3 → 0, congestie 20 → 0 s, răbdare 60 → 7 140 tick-uri rămase, întoarcere în U 66,056 → 40,049 s, recuperare 2,5 → 8 s. Separarea măsoară 56 de perechi: 54 inerte cu diferența 0,000 și 2 cuplaje explicite (timp ↔ distanță, cele două fețe ale aceleiași decizii). Invarianța la scalare este dovedită cu un test real: aceleași cinci ponderi la factorii 0,5/1/2/5/10 dau coeficienți identici și aceeași alegere în 8/8 scenarii (40 de decizii), iar perechea explicită `0,6/0,3/2/5/0,5` vs `0,06/0,03/0,2/0,5/0,05` dă coeficienți și scoruri identice; testul are dinți, pentru că o regulă naivă cu epsilon absolut 0,01 se schimbă între cele două scări pe o probă de 12 ms, în timp ce politica alege aceeași rută și ia aceeași decizie. Siguranță: o întoarcere în U `FORBIDDEN` sau `UNKNOWN` nu este admisă la nicio valoare a cheii (eșantionul nu se trage), iar `reverse_recovery_duration` are podeaua explicită `max(cheie, 2,5 s)` = 3 m / 1,2 m/s, deci minimul de catalog de 0 s dă 150 de tick-uri și 3,0 m, iar fără spațiu liber declarat în spate manevra este ținută (`RECOVERY_BLOCKED`). Compatibilitate M: `speed_delta_urban`/`speed_delta_residential` (m/s) nu rescriu timpul livrat de 041 (113,295230 s rămâne 113,295230 s), ci doar termenul de preferință (113,295230 → 31,915306 s la delta 15 m/s) și schimbă alegerea pe perechea timp/distanță. Alternativele sunt reale: identitatea costului 041 (`costSeconds − timp de bandă = 0,5 s × legături`) este verificată pentru 9/9 coridoare.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0 (0 erori, 0 avertismente); `npm run format:check` exit 0 („All matched files use Prettier code style”); `npm run check:architecture` exit 0 (importuri PASS, inclusiv probele negative); `npm run check:parameter-catalog` exit 0 („Parameter catalog is synchronized”); `node --import ./scripts/register-typescript.mjs --test tests/autonomy/route-policy-v2.test.ts` 15 teste, 15 trecute, 0 eșuate; `npm test` **3 133 teste, 3 133 trecute, 0 eșuate** (108,5 s); `npm run route:policy` **15/15 verificări PASS**, 8 efecte, 56 perechi de separare, 2 cuplaje, 4 rânduri de siguranță, 8/8 scenarii cu alegere identică la toate scările, digest `fnv1a32:919aebb7`; `npm run route:policy -- --check` raport și markdown actuale.

Fișiere și documente actualizate: `src/autonomy/route-policy-v2.ts` (nou), `src/autonomy/index.ts` (export nou la finalul listei), `tests/autonomy/route-policy-v2-reference.ts`, `tests/autonomy/route-policy-v2.test.ts`, `tests/autonomy/route-policy-v2-report.ts` (noi), `scripts/run-v2-route-policy-report.mjs` (nou), `package.json` (scriptul `route:policy` la finalul blocului `scripts`), `Docs/11-catalog-parametri.md` (secțiune nouă la final), `Docs/Evidence/181-v2-route-policy/` (README, report.json, report.md), fișierul PBI mutat în `PBI/Done`.

Limitări sau follow-up: `turns` și `signals` sunt fapte declarate de proprietarul hărții (planul 041 nu le expune, iar o linie `SIGNAL` cere o intersecție autorată cu program de semafor); virajele sunt derivate din geometrie și folosite implicit, iar în scenariul virajelor (geometrie identică) și al semafoarelor numărătoarea este declarată explicit. `Docs/11` indică 2–8 pentru `reverse_recovery_duration`, iar catalogul machine-readable dă 0–8; politica respectă registrul și își apără minimul cu podeaua de 2,5 s. Delta M se aplică vitezei libere medii a rutei, nu fiecărei benzi. Registry-ul 092 rămâne fail-closed (cele opt chei au `implemented: false`), iar contractul nu este încă montat în bucla live de simulare; performanța jocului integrat nu este validată de acest PBI (nivel „funcțional izolat”).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '181' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: Implementare completă în worktree-ul `v2-policy-181-01`; contract `181-route-policy-v2` cu opt efecte izolate pe alternative reale 041, ponderi normalizate cu invarianță la scalare dovedită (8/8 scenarii, 40 de decizii), interzicția de U și podeaua de 2,5 s la recuperare, 15/15 verificări ale raportului, 15 teste țintă și 3 133 teste ale suitei complete; fișier mutat fizic în Done după validare.
