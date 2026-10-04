# Harness de teste și scenarii — PBI 004

`npm test` execută toate fișierele `tests/**/*.test.ts` cu runnerul Node built-in. `npm run test:domain` execută exemplul headless al harnessului. `npm run check` include testele după verificările statice și arhitectură. Orice assertion eșuată produce exit nenul.

## Runner reutilizabil

`tests/harness/runner.ts` definește `ScenarioDefinition<State, Event>` și adaptorul `snapshot()/advance()`. `runScenario(definition, seed, ticks)` construiește un adaptor nou și apelează exact N avansări, fără renderer, DOM, temporizatoare sau raf. Capturează starea inițială și fiecare stare ulterioară plus evenimentele returnate. Copiile `structuredClone` păstrează proprietatea datelor chiar când adaptorul reutilizează obiecte mutabile. Capturile sunt date de test deținute de apelant, nu snapshoturi autoritare imuabile ale jocului. Adaptorul trebuie să ofere date clonabile; `snapshot` este read-only, iar `advance` returnează numai evenimentele avansării curente.

Seed și numărul de tick-uri trebuie să fie întregi siguri nenegativi. Fiecare adaptor decide cum folosește seed-ul. Runnerul nu implementează RNG, schedulerul cu pas fix, identități sau checkpointuri ale jocului. Acestea aparțin PBI 006/008 și celor dedicate.

## Fixture și oracle

`tests/scenarios/seeded-counter.ts` este o fixture aritmetică de test: seed selectează incrementul `1 + seed % 3`, fiecare avansare crește tick/value și emite o singură dată `threshold-crossed` la atingerea pragului 10. Nu reprezintă vehicule sau gameplay. `verify-counter.ts` calculează separat așteptările pentru toate stările și evenimentul; este utilizat atât de Node, cât și de browser. Testele acoperă 12 avansări, seed repetat/schimbat, zero tick-uri, limite invalide, copiile defensive și respingerea capturilor corupte.

## Integrare browser

Pornește `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`, apoi deschide `http://localhost:5173/tests/browser/`. Formularul permite seed/tick-uri; browserul limitează captura la 10000 tick-uri pentru a evita alocări accidentale masive. Runnerul generic este pentru suite controlate și nu impune această limită UI. „Rulează și verifică” execută același runner și oracle, afișează `PASS`/eroarea și captura JSON în `#capture`. Exemplul seed 41/ticks 12 produce 13 stări, valoare finală 36 și un eveniment la tick 4/value 12. Seed 42 produce valoare 12 și eveniment la tick 10/value 10. Testul browser este o pagină Vite separată, disponibilă numai în dev; nu intră în bundle-ul produsului. `npm test` nu lansează browserul: verificarea browser se execută separat în browser real și dovezile sunt salvate.

## Loader și verificări

`scripts/register-typescript.mjs` înregistrează hooks Node 24 pentru sursele TypeScript reale, folosind `stripTypeScriptTypes`; rezolvă importuri relative explicite `.ts`, fără extensie și directory/index.ts. Este folosit și de verificarea arhitecturii, eliminând loaderul duplicat. Suportă sintaxa TS erasable; `tsc` strict verifică separat semantica, loaderul nu face typecheck. Node 24 afișează avertismentul experimental stripTypeScriptTypes.

`tsconfig.json` verifică aplicația și codul browser/scenariile cu DOM; `tsconfig.tests.json` include toate directoarele din `tests`, cu excepția `tests/browser`, folosind tipurile Node și lib ES2022. Astfel, suitele de domeniu noi intră automat în verificarea tipurilor. Lintul și Prettier includ `tests`. Tipurile Node sunt devDependency fixată și nu intră în bundle.

[Dovezi executate](Evidence/004-test-harness/README.md).
