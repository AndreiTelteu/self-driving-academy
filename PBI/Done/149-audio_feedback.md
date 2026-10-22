---
id: "149"
title: "Feedback pentru moduri și învățare"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["148","079","112"]
owner: "loop-pbi/audio-149-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T16:18:35+03:00"
completed_at: "2026-10-22T16:59:34+03:00"
---

# 149 Feedback pentru moduri și învățare

## Obiectiv

Adaugă feedback distinct pentru preluare, publicare și misiuni.

## Context și plan

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 148 trebuie să existe în Done înainte de începere.
- PBI 079 trebuie să existe în Done înainte de începere.
- PBI 112 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Sunetele corespund evenimentelor reale și nu se dublează.
- [x] Informația importantă are și echivalent vizual.

## Verificare

Testează toggle rapid, rezultat întârziat și eveniment duplicat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: feedback audio distinct pentru preluare, publicare și misiuni, construit pe
motorul audio 148 fără al doilea sistem audio și fără modificări la PBI 148. Contractul pur este
`src/audio/feedback.ts` (`149-audio-feedback-v1`): cheie de idempotență explicită per eveniment
(`takeover:<eventId 007>`, `publication:<versionId 110/112>`, `mission:<instanceId 116>:<state>`,
`learning:<eventId 079>`), registru FIFO mărginit la 256 chei, decizie de cue derivată doar din
payloadul evenimentului real și pereche vizuală cu simbol, text și atribute `data-*`.
Composition root-ul `src/app/audio-feedback.ts` (`149-audio-feedback-app-v1`) leagă evenimentul 007
`MANUAL_START` (preluare, seatul 066/068) → `takeover-notice`, evenimentul 007 `PROFILE_ACTIVATE`
și payloadul explicit 110/112 cu `published: true` → `profile-notice`, starea instancei citită din
trackerul real 116 → `ui-tick`, și notificarea reală 079 → `ui-tick` (descriptorul de sunet al
notificării). Toate sunetele trec prin `playOneShot` al motorului 148: plafonul de voci, cooldown-ul
pe familie, furtul determinist de voce, bufferele și mute-ul rămân în vigoare, iar 149 nu adaugă cue,
buffer, voce sau limită. Publicarea 007 și notificarea 079 `PUBLISHED` a aceleiași versiuni împart
cheia `publication:<versionId>` și produc o singură voce; un rezultat de învățare validat dar
nepublicat (`RESULT` 079) sună ca analiză, nu ca publicare. O publicare întârziată este marcată
`late` și sună propriul rezultat real, iar o notificare 079 `STALE` rămâne mută. Echivalentul
vizual este `src/ui/audio-feedback-indicator.ts` (`149-audio-feedback-indicator-v1`): o linie de
stare mărginită (un rând, fără listă, fără istoric) care arată simbolul, textul și atributele
ultimului feedback acceptat, desenată inclusiv când motorul refuză sunetul; mesajele detaliate de
învățare și publicare rămân pe rândurile reale ale infrastructurii 079 (`★ Profil publicat`), iar
preluarea rămâne pe indicatorul de mod 067 — nu există un sistem paralel de notificări.

Verificări executate și rezultat (ieșirea completă în
`Docs/Evidence/149-audio-feedback/commands.txt`):

- `npm run typecheck` → exit 0 (5 921 ms).
- `npm run lint` → exit 0 (26 999 ms).
- `npm run format:check` → exit 0 (27 117 ms).
- `npm run check:architecture` → exit 0, `Architecture imports: PASS (294 TypeScript files)`.
- `npm run check:parameter-catalog` → exit 0, `Parameter catalog is synchronized.`
- `node --import ./scripts/register-typescript.mjs --test tests/audio/audio-feedback.test.ts` →
  exit 0, 7 teste / 7 pass / 0 fail (918 ms). Testele acoperă: eveniment duplicat (relat de releu
  și repetat direct), rezultat întârziat, toggle rapid (mute + categorii + burst), preluare,
  publicare, misiune și echivalentul vizual.
- `npm run audio:feedback` → exit 0, `SUMMARY checks 32/32, scenarios 7, overall PASS` (1 027 ms);
  `npm run audio:feedback -- --check` → raportul este curent.
- `npm test` → exit 0, 2021 teste / 2021 pass / 0 fail (73 664 ms).

Fișiere și documente actualizate: `src/audio/feedback.ts` (nou), `src/app/audio-feedback.ts` (nou),
`src/ui/audio-feedback-indicator.ts` (nou), `src/audio/index.ts`, `src/app/index.ts`, `src/ui/index.ts`
(exporturi), `tests/audio/audio-feedback.test.ts` (nou), `tests/audio/audio-feedback-fixture.ts`
(nou), `tests/audio/audio-feedback-report.ts` (nou), `scripts/run-audio-feedback-report.mjs` (nou),
`package.json` (scriptul `audio:feedback` la finalul blocului `scripts`),
`Docs/16-asseturi-vizual-si-audio.md` (secțiunea „Contractul audio 149”),
`Docs/Evidence/149-audio-feedback/README.md` (nou), `Docs/Evidence/149-audio-feedback/report.json`
și `report.md` (generate), `Docs/Evidence/149-audio-feedback/commands.txt` (nou).

Limitări sau follow-up:

- Misiunile și rezultatele de analiză 079 folosesc același cue `ui-tick` al setului 148; diferența
  este cântată de câștigul documentat (0,45 / 1 / 0,7 / 0,6) și de perechea vizuală. Un cue distinct
  pentru misiuni ar fi o extindere a contractului 148 și ar depăși plafonul de 8 buffere, deci nu a
  fost făcută în acest PBI.
- Cooldown-ul de 0,4 s al motorului 148 este pe familie: un al doilea sunet al aceleiași familii în
  acea fereastră este abandonat de motor și contorizat în `droppedCues`; perechea vizuală este
  desenată oricum, deci informația nu se pierde.
- `tests/workers/protocol.test.ts` (worker real, anulare) a eșuat o dată pe o aserțiune de
  cronometrare (119,64 ms peste pragul de 100 ms) înaintea ultimei rulări complete, iar
  `tests/ui/control-sliders.test.ts` (229) a eșuat o dată pe aserțiunea „600 identical frames cost
  … ms”; ambele sunt aserțiuni de perete de timp din module fără legătură cu audio-ul, au trecut în
  rulările izolate (4/4 pentru `tests/workers/protocol.test.ts`) și în rularea completă finală
  (2021/2021), și sunt instabile doar când mașina este saturată de alte procese.
- Verificarea este izolată, pe backendul fals determinist: fără captură de browser, fără certificat
  de performanță hardware și fără calitatea audio în browser.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '149' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22: Implementare începută în In Progress (owner `loop-pbi/audio-149-01`).
- 2026-10-22: Implementare finalizată: contract pur 149, composition root pe motorul 148,
  indicator vizual, 7 teste deterministe, raport determinist 32/32 și suite completă 2021/2021.
  Status Done, fișier mutat fizic în PBI/Done și validat cu `Validate-Board.ps1 -RequireDone '149'`.
