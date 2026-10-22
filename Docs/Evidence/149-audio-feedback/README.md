# Doveze PBI 149 — feedback pentru moduri și învățare

Implementarea feedbackului audio distinct pentru preluarea controlului, publicarea profilului și
stările misiunilor, pe motorul audio 148: contract pur în `src/audio/feedback.ts`, composition root
în `src/app/audio-feedback.ts` și echivalent vizual în `src/ui/audio-feedback-indicator.ts`. Nimic
din PBI 148 nu este modificat: 149 nu adaugă cue, buffer, voce sau limită, iar toate sunetele trec
prin `playOneShot` al motorului 148.

## Conținut

| Fișier | Descriere |
| --- | --- |
| `report.json` | Raportul determinist al scenariilor și verificărilor (32 verificări, 7 scenarii). |
| `report.md` | Același raport în Markdown, pentru citire umană. |
| `commands.txt` | Comenzile executate și ieșirea lor reală (cod de ieșire și durată). |

## Ce demonstrează

- **Legarea de evenimentul real**: `TAKEOVER` vine din evenimentul 007 `MANUAL_START` (seatul
  066/068), `PUBLICATION` din evenimentul 007 `PROFILE_ACTIVATE` și din payloadul explicit 110/112
  cu `published: true`, `MISSION` din starea instancei citită din trackerul real 116, `LEARNING`
  din notificarea reală 079. Un candidat validat dar nepublicat (`RESULT` 079) sună `ui-tick`, nu
  `profile-notice`: în raport, înaintea publicării întârziate există **0** cue-uri
  `profile-notice`.
- **Fără dublare**: cheile explicite de idempotență (`takeover:<eventId>`,
  `publication:<versionId>`, `mission:<instanceId>:<state>`, `learning:<eventId>`) sunt păstrate
  într-un registru FIFO mărginit la 256 chei. Evenimentul reluat de releu este refuzat de busul
  007 (`duplicate`) și refuzat din nou de cheie (`DUPLICATE`); activarea 007 și notificarea 079
  `PUBLISHED` a aceleiași versiuni împart o cheie și produc **o singură voce**.
- **Rezultat întârziat**: o publicare primită după un eveniment mai nou este marcată `late` și
  sună propriul rezultat real (`profile-notice`); notificarea 079 reclasificată `STALE` are
  descriptor `NONE` și rămâne mută.
- **Toggle rapid**: 60 de comutări mute/categorie și un burst de 10 preluări nu creează nicio voce
  suplimentară și nu lasă nicio voce orfană; vocile `ui` rămân sub plafonul de 4, buferele sub
  plafonul de 8, iar răspunsurile sunt contorizate în `cooldownSkips` și `droppedCues`.
- **Echivalent vizual**: fiecare sunet acceptat are o pereche vizuală cu simbol, text și atribute
  `data-*`. Indicatorul 149 este o linie de stare mărginită (un rând, fără listă, fără istoric), nu
  un sistem paralel de notificări: mesajele detaliate rămân pe rândurile reale 079
  (`★ Profil publicat`), iar preluarea rămâne pe indicatorul de mod 067. Indicatorul este desenat
  și când motorul refuză sunetul (`AWAITING_GESTURE`), deci informația nu depinde de sunet.

## Comenzi executate și rezultat

Ieșirea completă, cu codurile de ieșire, este în `commands.txt`. Rezumatul ultimei rulări:

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | exit 0 (5 921 ms) |
| `npm run lint` | exit 0 (26 999 ms) |
| `npm run format:check` | exit 0 (27 117 ms) |
| `npm run check:architecture` | exit 0 — `Architecture imports: PASS (294 TypeScript files)` |
| `npm run check:parameter-catalog` | exit 0 — `Parameter catalog is synchronized.` |
| `node --import ./scripts/register-typescript.mjs --test tests/audio/audio-feedback.test.ts` | exit 0 — 7 teste, 7 pass, 0 fail (918 ms) |
| `npm run audio:feedback` | exit 0 — `SUMMARY checks 32/32, scenarios 7, overall PASS` (1 027 ms) |
| `npm test` | exit 0 — 2021 teste, 2021 pass, 0 fail (73 664 ms) |

## Fișiere atinse

| Fișier | Schimbare |
| --- | --- |
| `src/audio/feedback.ts` | Nou: contractul pur 149 (chei de idempotență, cue-uri, perechi vizuale, registru mărginit). |
| `src/app/audio-feedback.ts` | Nou: composition root-ul (busul 007, trackerul 116, notificările 079, motorul 148). |
| `src/ui/audio-feedback-indicator.ts` | Nou: indicatorul vizual mărginit al ultimului feedback. |
| `src/audio/index.ts`, `src/app/index.ts`, `src/ui/index.ts` | Exporturile publice ale modulelor noi. |
| `tests/audio/audio-feedback.test.ts` | Nou: 7 teste deterministe (eveniment duplicat, rezultat întârziat, toggle rapid, preluare, publicare, misiune, echivalent vizual). |
| `tests/audio/audio-feedback-fixture.ts` | Nou: fixture cu motorul 148 pe backendul fals, busul 007 și indicatorul real. |
| `tests/audio/audio-feedback-report.ts` | Nou: generatorul raportului determinist. |
| `scripts/run-audio-feedback-report.mjs` | Nou: scriptul raportului (`npm run audio:feedback`). |
| `package.json` | Scriptul `audio:feedback` adăugat la finalul blocului `scripts`. |
| `Docs/16-asseturi-vizual-si-audio.md` | Secțiunea „Contractul audio 149”. |

## Limitări

- Sunetele 149 folosesc cele șapte cue-uri placeholder ale motorului 148: misiunile și rezultatele
  de analiză 079 folosesc același cue `ui-tick` (diferența este cântată de câștigul documentat
  0,45 / 1 / 0,7 / 0,6 și de perechea vizuală), pentru că 149 nu adaugă cue-uri și nu atinge
  plafonul de 8 buffere al lui 148. Un cue distinct pentru misiuni este o extindere a contractului
  148, deci nu a fost făcută aici.
- Cooldown-ul de 0,4 s al motorului 148 este pe familie, deci un al doilea sunet al aceleiași
  familii în acea fereastră este abandonat de motor (`droppedCues`); perechea vizuală este desenată
  oricum, deci informația nu se pierde.
- PBI 149 nu adaugă `package.json` dependințe noi și nu modifică niciun fișier al PBI 148.
- Testul `tests/workers/protocol.test.ts` (worker real, anulare) a eșuat o dată pe o aserțiune de
  cronometrare (119,64 ms peste pragul de 100 ms) înaintea ultimei rulări complete, iar
  `tests/ui/control-sliders.test.ts` (229) a eșuat o dată pe aserțiunea „600 identical frames cost
  … ms”; ambele sunt aserțiuni de perete de timp din module fără legătură cu audio-ul și au trecut
  în rulările izolate (4/4 pentru `tests/workers/protocol.test.ts`) și în rularea completă finală
  (2021/2021). Sunt instabile doar când mașina este saturată de alte procese.
- Verificarea este izolată, pe backendul fals determinist: nu există captură de browser și nu se
  certifică performanța hardware sau calitatea audio în browser.
