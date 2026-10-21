# Notificări de analiză și publicare — PBI 079

Status: implementare și validare funcțională locală. Contractul pur este
`src/ui/learning-notification-format.ts` (`079-learning-notifications-v1`), adaptorul DOM este
`src/ui/learning-notifications.ts`, iar compunerea cu coada reală 103 și cu publicarea explicită
110/112 este `src/app/learning-notification.ts`. Modulul afișează exact evenimentele primite: nu
estimează, nu publică, nu inventează dovezi și nu decide dacă un profil trebuie aplicat.

## Ce afișează

Fiecare notificare are un simbol, un text și `data-*`; culoarea doar întărește starea.

| Stare | Simbol | Text principal | Sunet | Publicat |
| --- | --- | --- | --- | --- |
| `ANALYZING` | `◌` | Analiză în curs | `NONE` | nu |
| `RESULT` | `✓` | Candidat validat, nepublicat | `SUCCESS` | nu |
| `NO_CHANGE` | `=` | Nicio modificare justificată | `NONE` | nu |
| `INSUFFICIENT_EVIDENCE` | `?` | Dovezi insuficiente + „Lipsesc dovezi: …” | `WARNING` | nu |
| `ERROR` | `✕` | Eroare de analiză (motiv real) | `ERROR` | nu |
| `REJECTED` | `⊘` | Candidat respins (motiv real) | `WARNING` | nu |
| `CANCELLED` | `—` | Analiză anulată | `NONE` | nu |
| `INVALIDATED` | `↺` | Analiză invalidată (motiv real) | `WARNING` | nu |
| `STALE` | `⌛` | Rezultat întârziat ignorat | `NONE` | nu |
| `PUBLISHED` | `★` | Profil publicat | `SUCCESS` | da |

`RESULT` este singurul mod în care un rezultat `composed` al workerului apare: „Candidat validat,
nepublicat”, cu valoarea veche și nouă din compunerea reală. Numai `PUBLISHED`, construit de
`notificationFromPublication` dintr-un payload explicit 110/112 (`published: true` și un
`publicationVersionId` real), poate spune „Profil publicat”. Un `ERROR`, `REJECTED`, `CANCELLED` sau
`INVALIDATED` nu este niciodată succes și nu poate deveni publicare.

## Identitate și legare

Fiecare eveniment poartă `eventId`, `sessionId`, `worldEpoch`, `segmentId`, `jobKey`,
`generationKey`, `profileId`, `learningEpoch`, `tick`, `mode`, `key` și `order`. `jobKey` este
`job:103:<segment>:<order>`, iar `generationKey` este `gen:103:<profile>:<learningEpoch>:<baseVersion>`.
Textul include segmentul și jobul, iar rândul DOM are `data-segment`, `data-job`, `data-generation`,
`data-profile`, `data-learning-epoch`, `data-session`, `data-world-epoch`, `data-key`, `data-order`,
`data-mode` și `data-tick`. Parserul respinge chei în plus/lipsă, identități peste limită, `tick`
nefinit sau negativ și o listă `missing` duplicată sau peste patru intrări.

Un eveniment al cărui `segmentId`, `jobKey`, `learningEpoch`, `sessionId` sau `worldEpoch` nu mai
corespunde jobului curent (`current` injectat de host) este reclasificat `STALE` și afișat discret,
„Rezultat întârziat ignorat”. El nu înlocuiește niciodată rezultatul curent și expiră mai repede.
Aceeași reclasificare se aplică și unui rând deja afișat când jobul curent se schimbă. Rezultatul
târziu primește un `eventId` derivat (sufix `:stale`), ca să nu fie confundat cu rândul original.

## Dovezi lipsă

`INSUFFICIENT_EVIDENCE` listează cel mult patru observații concrete, ordonate după cheie, fiecare cu
cheia, eticheta, starea `UNOBSERVED`/`WEAK` și numărul real de episoade distincte:
`Lipsesc dovezi: following_time_headway (2 episoade, WEAK); stop_full_probability (0 episoade,
UNOBSERVED); …`. Numărul provine din read model-ul 093 sau din evaluarea 100; un zero real rămâne
`0 episoade`, nu dispare și nu este inventat. `missingObservationsFromEvidence` sare peste cheile
necunoscute și peste stările suficiente; `notificationFromMissingEvidence` refuză o listă vidă.

## Fără spam

- Cel mult **3** notificări vizibile; a patra o înlocuiește pe cea mai veche.
- Același `segmentId + jobKey + kind` este deduplicat într-o fereastră de 30 s (configurabilă);
  duplicatele nu adaugă rânduri și nu rescriu DOM-ul.
- Un `eventId` repetat nu adaugă și nu rescrie niciun rând.
- Notificările expiră cu ceasul injectat (15 s; `STALE` 4 s), iar memoria este mărginită: 3 rânduri,
  48 chei de deduplicare, 48 `eventId`.
- Scrierile sunt plafonate la 10 Hz; un tip nou sau o schimbare de segment ocolește plafonul, iar o
  stare identică nu scrie nimic.

## API

```ts
import { createLearningNotifications, parseLearningNotificationEvent } from './ui';
import { notificationFromOutcome, notificationFromAdmission } from './app';

const notifications = createLearningNotifications(host, {
  current: () => notificationCurrentJob(job), // opțional; altfel nu se reclasifică STALE
  announce: (cue, item) => audio.play(cue),   // opțional; vizualul nu depinde de el
  dismissible: false,                          // butoanele, dacă există, au tabindex="-1"
});
notifications.push(event, nowMs); // ACCEPTED | STALE | DEDUPED | UNCHANGED | THROTTLED | REJECTED
notifications.update(nowMs);      // expiră cu ceasul injectat
notifications.dismiss(eventId);   // true dacă rândul exista
notifications.getStats();         // rows, writes, skipped, deduped, expired, listeners, keyListeners
notifications.dispose();
```

Adaptorul construiește o singură `section[aria-label]` cu `role="status"` și `aria-live="polite"`,
un `ol` cu rânduri stabile per `eventId` și un rezumat text. Nu are listener global de tastatură;
butoanele de închidere sunt opționale și nu intră în ordinea Tab (`tabindex="-1"`), ca să nu fure
focusul de la condus. Sunetul este un port opțional: dacă lipsește, este blocat sau aruncă, textul și
simbolul rămân afișate.

## Compunerea cu 103 și 110/112

```ts
notificationFromOutcome(job, outcome, { eventId, tick }, current);
notificationFromAdmission(admission, job, { eventId, tick });
notificationFromPublication(publication, { eventId });
```

`composed` + candidat acceptat → `RESULT` (sau `NO_CHANGE` când valoarea nu s-a schimbat); `error` →
`ERROR` cu `reason`/`detail` reale; `rejected`/`invalidated`/`cancelled` → tipul corespunzător.
`QUEUED` → `ANALYZING`; `REJECTED`/`BACKPRESSURE` → `REJECTED` cu motivul închis. Contextul de sesiune
și lume trebuie să corespundă jobului, altfel compunerea eșuează explicit.

## Ce NU este

- Nu este 103: nu rulează estimatorul, nu compune ledger-ul și nu anulează joburi.
- Nu este 110/112: nu publică și nu propagă profile; `PUBLISHED` reflectă doar un payload explicit.
- Nu este 093/100: nu calculează dovezi sau încredere, doar afișează read model-ul primit.
- Nu este sistem audio: `soundCue` este un descriptor, iar alternativa vizuală este obligatorie.
- Nu certifică FPS, GPU sau captură de browser.

## Verificare

`tests/ui/learning-notifications.test.ts` acoperă parserul strict, rezultatul valid nepublicat,
`NO_CHANGE`, eroarea cu motiv, respingerea/anularea/invalidarea, rezultatul târziu `STALE`, legarea
segment/job în text și atribute, dovezile lipsă concrete, deduplicarea, plafonul de 3, expirarea,
vizualul fără sunet, plafonul 10 Hz cu bypass, starea identică, cadrele malformate, dispose-ul și
publicarea explicită. `npm run learning:notifications` scrie raportul determinist cu 7 scenarii și
49 de verificări în [Evidence/079-learning-notifications](Evidence/079-learning-notifications/README.md).
