# Evidence 079 — Notificări de analiză și publicare

Validare funcțională locală pentru PBI 079. Dovezile acoperă contractul pur, adaptorul DOM, compunerea
cu rezultatele reale 103, regulile de publicare și raportul determinist. Nu există captură de browser
și nu se revendică redare audio; sunetul este doar un port opțional.

## Ce s-a livrat

- `src/ui/learning-notification-format.ts` — `079-learning-notifications-v1`: uniune strictă de
  evenimente cu chei exacte per tip, parser cu identități mărginite și `tick` finit, politici pentru
  plafon/deduplicare/expirare, reducer pur (fără DOM), proiecție cu texte, simboluri, atribute
  `data-*`, contoare, rezumat și semnătură.
- `src/ui/learning-notifications.ts` — `createLearningNotifications`: o `section[aria-label]` cu
  `role="status"`/`aria-live="polite"`, rânduri stabile per `eventId`, maximum trei, butoane de
  închidere opționale cu `tabindex="-1"`, plafon de scriere 10 Hz cu bypass pentru tip/segment nou,
  port de sunet opțional și `dispose` idempotent.
- `src/app/learning-notification.ts` — `notificationFromOutcome`, `notificationFromAdmission`,
  `notificationFromMissingEvidence`, `notificationFromPublication`, `isStaleNotification`,
  `missingObservationsFromEvidence`, `notificationCurrentJob` și identificatorii stabili de job și
  generație.
- `src/ui/index.ts`, `src/app/index.ts` — exporturi publice aditive.
- `src/style.css` — stil pentru notificări, simboluri per tip, stare `STALE` discretă, focus nativ și
  fără informație transmisă doar prin culoare.
- `tests/ui/learning-notifications-fixture.ts`, `tests/ui/learning-notifications.test.ts` — job 103
  real, compunere validată de poarta 102, read model 093 și **21 de teste**.
- `tests/app/learning-notifications-report.ts`, `scripts/run-learning-notifications-report.mjs`,
  `npm run learning:notifications` — 7 scenarii deterministe și **49 de verificări**.
- `Docs/learning-notifications.md`, paragrafe aditive în `Docs/08-interfata-camera-si-control.md`,
  `Docs/27-reglaje-hud-si-camera.md` și `Docs/README.md`, plus acest folder.

## Reguli demonstrate

| Regulă | Dovadă |
| --- | --- |
| `composed` + candidat acceptat → „Candidat validat, nepublicat” | scenariul `valid`, `data-published="false"` |
| compunere fără schimbare → „Nicio modificare justificată” | scenariul `no-change` |
| eroare de worker cu motiv real, niciodată publicare | scenariul `error`, text fără „Profil publicat” |
| rezultat târziu pentru alt segment/job/epoch → `STALE` | scenariul `late`, text „Rezultat întârziat ignorat” |
| dovezi lipsă concrete, maximum patru | scenariul `insufficient evidence` |
| deduplicare, plafon 3 și expirare | scenariul `dedupe/no-spam` |
| „Profil publicat” doar din payload explicit 110/112 | scenariul `explicit publication` |

## Comenzi și rezultate

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check:architecture
npm test
npm run learning:notifications
npm run learning:notifications -- --check
```

Rezultatele exacte sunt păstrate în raportul PBI și în `report.json`. `npm run learning:notifications`
scrie `report.json` și `report.md`; `-- --check` compară transcriptul comis și eșuează dacă este
învechit. `npm test` include comparația cu raportul comis.

## Limitări

- Fără captură de browser și fără măsurătoare de frame/FPS/GPU: adaptorul este verificat pe un DOM
  determinist, nu într-o sesiune live.
- Sunetul nu este redat; `soundCue` este doar un descriptor, iar portul `announce` este opțional.
- Notificarea `PUBLISHED` nu este produsă de 103; ea reflectă exclusiv un payload explicit 110/112,
  care rămâne responsabilitatea acelor module.
- Textul de detaliu este limitat la 240 de code units pentru afișare; motivul complet rămâne în
  outcome-ul 103.
