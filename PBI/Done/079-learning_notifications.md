---
id: "079"
title: "Notificări de analiză și publicare"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["077","069"]
owner: "opencode deepseek-v4.1-flash learning-notifications-01"
started_at: "2026-10-21T02:03:48.462Z"
completed_at: "2026-10-21T05:41:51+03:00"
---

# 079 Notificări de analiză și publicare

## Obiectiv

Afișează analiză în curs, rezultat, lipsă dovezi și eroare.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 077 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Mesajele sunt legate de segmentul și jobul corect.
- [x] O eroare de worker nu este afișată drept profil publicat.

- [x] Mesajele indică concret observațiile lipsă și un rezultat scurt, fără dovezi inventate sau spam; alternativa vizuală însoțește sunetul.

## Verificare

Simulează rezultat valid, no-change, eroare și rezultat întârziat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Centrul de notificări 079 leagă fiecare mesaj de `segmentId`, `jobKey`/`generationKey`, profil, epoch de învățare, sesiune și world epoch, cu texte și atribute `data-*` stabile. Rezultatul `composed` al worker-ului 103 este afișat ca „Candidat validat, nepublicat”, cu valoarea scurtă și unitatea; o valoare neschimbată devine `NO_CHANGE`. Erorile, respingerile, anulările și invalidările sunt mereu non-succes și nu pot deveni „Profil publicat”; numai un payload explicit de publicare 110/112, cu `published:true` și `publicationVersionId`, produce `PUBLISHED`. Un rezultat întârziat pentru alt segment/job/epoch este reclasificat `STALE` („Rezultat întârziat ignorat”) și nu înlocuiește rezultatul curent. Observațiile lipsă sunt enumerate concret, mărginit (cheie, număr de episoade, UNOBSERVED/WEAK). Notificările sunt deduplicate pe segment+job+tip într-o fereastră de 30 s, plafonate la 3 rânduri vizibile, expiră prin ceasul injectat și nu păstrează istoric nelimitat. Fiecare notificare are text și simbol obligatoriu; sunetul este doar un descriptor opțional, apelat după randare și izolat, deci alternativa vizuală rămâne mereu prezentă.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (212 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1389/1389 pass, 0 fail; `npm run learning:notifications` 49/49 verificări, 7 scenarii, overall PASS; `npm run learning:notifications -- --check` „report is current”. Raportul acoperă rezultat valid, no-change, eroare, rezultat întârziat, dovezi insuficiente, deduplicare/anti-spam și publicare explicită. Dovezi: [report.json](../../Docs/Evidence/079-learning-notifications/report.json), [report.md](../../Docs/Evidence/079-learning-notifications/report.md), [README](../../Docs/Evidence/079-learning-notifications/README.md).

Fișiere și documente actualizate: `src/ui/learning-notification-format.ts`, `src/ui/learning-notifications.ts`, `src/app/learning-notification.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/learning-notifications-fixture.ts`, `tests/ui/learning-notifications.test.ts`, `tests/app/learning-notifications-report.ts`, `scripts/run-learning-notifications-report.mjs`, `package.json`, `Docs/learning-notifications.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/27-reglaje-hud-si-camera.md`, `Docs/README.md` și `Docs/Evidence/079-learning-notifications/`.

Limitări sau follow-up: Adaptorul este verificat pe DOM-ul determinist de test, fără captură browser sau host live; `src/main.ts` nu a fost legat. Nu se redă audio: `soundCue` este descriptor, iar `announce` un port opțional. `PUBLISHED` nu este produs niciodată de 103; reflectă exclusiv un payload explicit 110/112. Motivele/detaliile afișate sunt mărginite la 120/240 code units, textul complet rămâne în outcome-ul 103. Nu se pretinde FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '079' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-10-21: Implementare finalizată: notificări legate de segment/job, eroare niciodată publicare, rezultat întârziat marcat stale, dovezi lipsă concrete, deduplicare/plafon/expirare și alternativă vizuală pentru sunet; 21 teste, raport cu 49 de verificări și documentație. Mutat fizic în Done după validare.
