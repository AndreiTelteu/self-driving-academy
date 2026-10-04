# Dovezi PBI 003

Runtime: Node.js 24.21.0, npm 11.19.0, Windows PowerShell. Verificările au fost executate din `F:\Sites\self-driving-academy` în 4–5 octombrie 2026 (Europe/Bucharest).

## Probe controlate

Fișierul temporar `src/__pbi003-quality-probe.ts` a fost scris înaintea fiecărei verificări și eliminat în `finally`.

| Probă | Conținut | Comandă | Rezultat |
| --- | --- | --- | --- |
| TypeScript | `export const speedMps: number = 'invalid';` | `npm run typecheck` | exit 1, TS2322 string incompatibil cu number |
| Lint | `export const externalData: any = 'invalid';` | `npm run lint` | exit 1, project/no-explicit-any la 1:28 |
| Format | `export const speedMps=1` fără newline | `npm run format:check` | exit 1, fișier raportat de Prettier |

Logurile complete sunt [typecheck-negative.txt](typecheck-negative.txt), [lint-negative.txt](lint-negative.txt) și [format-negative.txt](format-negative.txt). Nu s-a păstrat fișierul eronat în proiect.

## Validarea regulii de tip necunoscut

Prin `ESLint.lintText(code, { filePath: 'src/__pbi003-lint-syntax.ts' })` s-au verificat opt cazuri în memorie, fără fișier temporar pe disk. Fiecare rezultat a fost comparat cu numărul așteptat de erori și verificat pentru absența erorilor fatale de parsare:

| Caz | Cod verificat | Erori așteptate |
| --- | --- | --- |
| Interface/generic/unknown | `export interface Box<T> { readonly value: T; } export const box: Box<unknown> = { value: null };` | 0 |
| Import de tip | `import type { Scene } from "@babylonjs/core"; export type SceneFactory = () => Scene;` | 0 |
| Narrowing/satisfies | `export function speed(value: unknown): number { if (typeof value !== "number") { throw new Error("Invalid"); } return value; } export const limits = { speedMps: 12 } satisfies Record<string, number>;` | 0 |
| Proprietate/string any | `export const config = { any: "any", many: 1 };` | 0 |
| Annotation any | `export const data: any = null;` | 1 |
| Generic imbricat any | `export type Unsafe = Promise<Array<any>>;` | 1 |
| Assertion any | `export const data = null as any;` | 1 |
| Return any | `export function read(): any { return null; }` | 1 |

Toate opt au trecut; [lint-syntax-cases.txt](lint-syntax-cases.txt) păstrează rezultatul exact, exit 0.

## Verificări finale fără probe

- `npm ci`: exit 0, 138 pachete instalate, audit 139 pachete, zero vulnerabilități; [npm-ci.txt](npm-ci.txt). Prima încercare a primit EPERM din cauza DLL-ului rolldown ținut de serverele Vite existente; după oprirea proceselor proiectului instalarea a trecut. Încercarea nereușită este păstrată în [npm-ci-locked-attempt.txt](npm-ci-locked-attempt.txt).
- `npm run format:check` înaintea probei negative finale: exit 0, toate fișierele potrivite respectă Prettier; [format-baseline.txt](format-baseline.txt). Proba finală raportează numai fișierul temporar; după eliminare check-ul agregat trece din nou.
- `npm run check`: exit 0 pentru typecheck, lint, format:check și check:architecture; checkerul 002 verifică 23 fișiere TS, șase dependențe interzise și exemplul renderer/persistence/lifecycle; [check-positive.txt](check-positive.txt).
- `npm run build`: exit 0; Vite 8.3.2 transformă 255 module și generează dist; [build-positive.txt](build-positive.txt).
- `PBI/Validate-Board.ps1 -RequireDone '003'`: verificare după mutarea fizică în Done, rezultat păstrat în [board-final.txt](board-final.txt).

Comenzile npm afișează un warning din configurația globală existentă `msvs-version`, iar checkerul 002 afișează avertismentul Node pentru stripTypeScriptTypes experimental. Verificările și buildul încheie cu exit 0.

## Limite

Lintul TypeScript folosește parserul de sintaxă Babel și șase reguli de proiect, fără analiză semantică/type-aware. TypeScript strict verifică separat tipurile, scope-ul și declarațiile nefolosite. Motivația compatibilității cu TypeScript 7 și convențiile SI/unknown sunt explicate în [development-conventions.md](../../development-conventions.md). Nu s-a implementat gameplay și nu sunt necesare probe vizuale pentru acest scope static.
