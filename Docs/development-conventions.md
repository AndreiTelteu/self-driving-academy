# Convenții de dezvoltare

PBI 003 configurează verificarea statică și formatul codului. Arhitectura și responsabilitățile modulelor sunt definite în [modulul 02](02-arhitectura-si-contracte.md).

## Comenzi și responsabilități

Din rădăcina proiectului, după `npm ci`:

| Comandă | Verificare |
| --- | --- |
| `npm run typecheck` | TypeScript strict, fără emit; nume/tipuri invalide, variabile și parametri locali nefolosiți, fallthrough în switch |
| `npm run lint` | ESLint flat config: cod TypeScript din src, scripturi Node și configurația JS; orice warning produce exit nenul |
| `npm run format:check` | Prettier verifică fără modificări sursele TS/CSS, scripturile mjs și configurațiile JSON/JS/HTML din rădăcină |
| `npm run format` | Aplică același format: două spații, single quotes, punct și virgulă, trailing commas, printWidth 100 și LF |
| `npm run check:architecture` | Verifică direcția importurilor și exemplul de injecție al PBI 002 |
| `npm run check` | Rulează succesiv typecheck, lint, format:check și check:architecture; se oprește la primul eșec |
| `npm run build` | Rulează typecheck înainte de bundle-ul Vite |

Formatul nu rescrie Docs, PBI, node_modules, dist sau lockfile-ul generat de npm. Markdown-ul și boardul se editează în scope-ul task-ului. CSS/HTML primesc verificare de format; regulile ESLint se aplică JS/TS. CLI-urile returnează cod nenul când detectează erori.

ESLint 10.12.0 și parserul Babel 8.0.6 sunt fixate ca devDependencies. Parserul citește sintaxa TypeScript; nu transformă aplicația și nu validează tipurile. Regula locală `project/no-explicit-any` raportează exclusiv noduri AST TSAnyKeyword, inclusiv în generice și assertions; cuvintele „any” din stringuri sau identificatori nu sunt erori. Lintul TS verifică explicit any, debugger, condiții constante, var, prefer-const și egalitate strictă. Pentru scripturile Node se aplică presetul ESLint recommended.

TypeScript 7.0.2 rămâne compilatorul aplicației. La verificarea din 4 octombrie 2026, [typescript-eslint documentează suportul TypeScript >=4.8.4 <6.1.0](https://typescript-eslint.io/users/dependency-versions/), iar pachetul 8.71.0 declară același peer range. Folosim [parserul Babel](https://babeljs.io/docs/babel-eslint-parser), care poate citi sintaxa TS fără acel peer dependency. Limita este explicită: lintul nu include analiza semantică/type-aware a typescript-eslint. tsc strict și noUnusedLocals/noUnusedParameters verifică separat tipurile și scope-ul; regulile JavaScript no-undef/no-unused-vars nu sunt aplicate TS deoarece pot interpreta greșit declarațiile de tip. Sintaxa TS viitoare trebuie verificată la upgrade-ul parserului; integrarea typescript-eslint poate fi reevaluată când suportă compilatorul ales.

## Unități și timp

Datele simulării folosesc SI: distanțe și poziții în metri (`distanceM`), durate în secunde (`durationS`), viteze în metri pe secundă (`speedMps`), accelerații în metri pe secundă la pătrat (`accelerationMps2`), masă în kilograme (`massKg`) și unghiuri în radiani (`headingRad`). Documentează unitatea în numele sau contractul câmpului; `number` nu previne amestecarea unităților. Conversia la km/h (`speedMps * 3.6`) și grade se face numai la limita UI/import/export explicită; starea autoritară păstrează SI. Parametrii normalizați precum throttle/brake nu au unitate și trebuie validați în intervalul contractului.

Timpul simulării și tick-urile se separă de timpul calendaristic. Un tick este un index discret, iar secunde de simulare se derivă din pasul fix configurat. Nu folosi Date.now pentru integrarea fizicii. ISO 8601 cu offset/UTC este potrivit pentru metadate de salvare și istoric; perioadele economice și calendarul daily respectă contractele lor, fără conversii implicite la tick.

## Date necunoscute și validare

Folosește `unknown` pentru JSON importat, mesaje de worker, storage și erori prinse. `strict` păstrează `useUnknownInCatchVariables`; `any` explicit este respins de lint. Înainte de acces verifică forma, schema/versiunea și valorile: obiect nenul, câmpuri necesare, typeof, Number.isFinite, intervale și unități. Narrowing-ul trebuie să demonstreze proprietățile tipului; un cast `as Contract` sau `as unknown as Contract` nu validează datele și nu înlocuiește verificarea de runtime.

```typescript
function readSpeedMps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Viteza trebuie să fie un număr finit în m/s, minimum zero.');
  }
  return value;
}
```

Validează toate câmpurile la intrarea unui contract, apoi transmite tipul validat serviciului potrivit. Pentru scheme de salvare/worker păstrează migrarea și tratamentul cheilor rezervate descrise în modulul 02. Tipurile de ID pot avea aliasuri sau branding când contractul cere diferențiere; branding-ul compile-time nu garantează integritatea datelor importate.
