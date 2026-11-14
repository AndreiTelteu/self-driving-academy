import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  directory = join(root, 'Docs', 'Evidence', '193-v3-authority'),
  defaultOutput = join(directory, 'report.json'),
  reportMarkdown = join(directory, 'report.md');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function markdown(report) {
  const scenarios = report.scenarios
    .map(
      (entry) =>
        `| \`${entry.id}\` | ${entry.label} | \`${entry.authority}\` | ${entry.held.length === 0 ? '—' : entry.held.join(', ')} | \`${entry.consumer}\` | \`${entry.command}\` | ${entry.empty ? 'vidă' : 'activă'} | ${entry.verdict} |`,
    )
    .join('\n');
  const exhaustive = report.exhaustive;
  const delivery = report.delivery;
  const transitions = report.transitions
    .map(
      (entry) =>
        `| ${entry.direction} | ${entry.held.join(', ')} | \`${entry.beforeCommand}\` | ${entry.beforeEmpty ? 'vidă' : 'activă'} | \`${entry.afterCommand}\` | **${entry.afterEmpty ? 'vidă' : 'ACTIVĂ'}** | \`${entry.rearmedCommand}\` | \`${entry.controlCommand}\` | ${entry.verdict} |`,
    )
    .join('\n');
  const focus = report.focus;
  const state = report.state;
  const limitations = report.limitations.map((entry) => `- ${entry}`).join('\n');
  return `# 193 — autoritate input la personaj sau mașină

Transcript determinist generat de \`${report.generatedBy}\`; comanda comisă este \`${report.command}\`.
Machine-readable: [report.json](report.json). Contract: \`${report.contract}\`, tick fix la
${report.tickHz} Hz, context \`${report.reference.context.sessionId}\` / epoca
${report.reference.context.worldEpoch}.

## Sumar

- Scenarii de arbitraj trecute: **${report.summary.scenariosPassed}/${report.summary.scenarios}**.
- Combinații exhaustive: **${exhaustive.combinationsPerAuthority} × ${exhaustive.authorities} = ${exhaustive.ticks} tick-uri**, fiecare cu exact un consumator adresat: **${exhaustive.addressed}/${exhaustive.ticks}**.
- Tick-uri în care ambele entități ar fi primit comandă non-vidă: **${exhaustive.simultaneousNonEmptyTicks}**.
- Livrări către entitatea inactivă: **${exhaustive.wrongConsumerDeliveries}**.
- Tranziții cu taste ținute, fără accelerație la primul tick: **${report.summary.transitionsPassed}/${report.summary.transitionRows}**.
- Focus într-un câmp de text: comandă vidă, personajul nemișcat (${focus.fieldWalkerDistanceM} m).
- Stare serializabilă: ${state.bytes} B JSON simplu, ${state.keys.length} câmpuri.
- Criteriul 1: **${report.summary.criterion1 ? 'PASS' : 'FAIL'}**; criteriul 2: **${report.summary.criterion2 ? 'PASS' : 'FAIL'}**; focus: **${report.summary.focus ? 'PASS' : 'FAIL'}**; serializare: **${report.summary.serializable ? 'PASS' : 'FAIL'}**.
- Verdict general: **${report.summary.pass ? 'PASS' : 'FAIL'}**.
- Determinism: ${report.determinism.runs} rulări, identice: **${report.determinism.identical ? 'DA' : 'NU'}**, SHA-256 \`${report.determinism.digest}\`.

## Vocabularul contractului

Autoritatea este una dintre \`CHARACTER:<id>\` și \`VEHICLE:<id>\`; nu există a treia stare și nu
există autoritate „amestecată”. Acțiunile sunt un vocabular închis de
${report.reference.actions.length} taste: ${report.reference.actions.join(', ')}.
Primele ${report.reference.driveActions.length} sunt exact \`KeyboardDriveAction\` din 066
(${report.reference.driveActions.join(', ')}), deci același binding fizic alimentează ambele
autorități; \`sprint\` este singura acțiune proprie mersului.

## Scenarii: autoritate → consumator → comandă → verdict

| Scenariu | Descriere | Autoritate | Taste ținute | Consumator | Comandă | Stare | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
${scenarios}

O comandă „vidă” este \`gait=NONE\`/intensitate 0 pentru personaj și throttle, brake, steering,
frână de mână și semnal toate pe zero pentru vehicul. Ea este livrată tot entității active, ca să
existe un singur canal cu o singură semantică; entitatea inactivă nu primește nimic, nici măcar vid.

## Criteriul 1 — o singură entitate primește comanda

| Dovadă | Rezultat |
| --- | ---: |
| Combinații de taste per autoritate | ${exhaustive.combinationsPerAuthority} |
| Autorități probate | ${exhaustive.authorities} |
| Tick-uri de arbitraj | ${exhaustive.ticks} |
| Tick-uri cu exact un consumator adresat | **${exhaustive.addressed}** |
| Livrări către personaj | ${exhaustive.deliveredCharacter} |
| Livrări către vehicul | ${exhaustive.deliveredVehicle} |
| Tick-uri cu comandă activă la personaj | ${exhaustive.characterNonEmptyTicks} |
| Tick-uri cu comandă activă la vehicul | ${exhaustive.vehicleNonEmptyTicks} |
| Tick-uri cu comandă vidă | ${exhaustive.emptyTicks} |
| Tick-uri cu comandă non-vidă la ambele entități | **${exhaustive.simultaneousNonEmptyTicks}** |
| Livrări greșite (entitatea inactivă) | **${exhaustive.wrongConsumerDeliveries}** |

Livrarea dublă este refuzată explicit, nu ignorată tăcut:

| Încercare | Rezultat |
| --- | --- |
| Livrare către personaj | acceptată (${delivery.characterDeliveries} livrare) |
| A doua livrare în același tick, către personaj | refuzată \`DOUBLE_DELIVERY_REFUSED\` |
| A doua livrare în același tick, către vehicul | refuzată \`DOUBLE_DELIVERY_REFUSED\` |
| Livrare către vehicul când autoritatea este personajul | refuzată \`INACTIVE_CONSUMER_REFUSED\` |
| Livrare după trecerea la tick-ul următor | refuzată \`STALE_RESULT\` |
| Contoare de refuz | dublă ${delivery.refused.doubleDelivery}, inactivă ${delivery.refused.inactiveConsumer}, învechită ${delivery.refused.staleResult} |
| Coduri în ordine | ${delivery.codes.map((code) => `\`${code}\``).join(', ')} |

## Criteriul 2 — tastele ținute la tranziție

Regula aleasă este **neutralizare până la prima eliberare**: la schimbarea autorității, fiecare
acțiune ținută în acel moment este marcată neutralizată și rămâne inactivă până când sosește o
eliberare reală. O reapăsare fără eliberare (auto-repeat-ul sistemului de operare) nu ridică
neutralizarea; eliberarea urmată de o reapăsare rearmă intenția.

| Direcție | Taste ținute | Înainte de tranziție | Stare | Primul tick după tranziție | Stare | După eliberare + reapăsare | Referință fără tranziție | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${transitions}

Fiecare rând pornește cu tastele ținute, schimbă autoritatea, rulează primul tick și abia apoi
eliberează și reapasă. Coloana „primul tick după tranziție” este **vidă în toate cele
${report.summary.transitionRows} rânduri**, deci o accelerație ținută înainte de tranziție nu
produce comandă. Coloana „după eliberare + reapăsare” este **identică cu referința fără
tranziție** în toate rândurile: aceleași taste produc aceeași comandă, doar că intenția trebuie
reconfirmată printr-o eliberare.

## Focus refolosit din 066

| Dovadă | Rezultat |
| --- | --- |
| Tastă folosită | \`${focus.throttleBinding}\` |
| Focus în câmp de text: taste ținute de arbitraj | **${focus.fieldHeldKeys}** |
| Focus în câmp de text: comandă | ${focus.fieldCommandEmpty ? 'vidă' : 'ACTIVĂ'} |
| Focus în câmp de text: distanță parcursă de personaj | **${focus.fieldWalkerDistanceM} m** |
| Focus în câmp de text: \`preventDefault\` | ${focus.fieldDefaultPrevented} |
| După ieșirea din câmp: taste ținute | ${focus.resumedHeldKeys} |
| După ieșirea din câmp: comandă | ${focus.resumedCommandEmpty ? 'vidă' : 'activă'} |
| După ieșirea din câmp: distanță parcursă | ${focus.resumedWalkerDistanceM} m |
| Listeneri după dispose | ${focus.listenersAfterDispose} |

## Starea serializabilă pentru 200

| Dovadă | Rezultat |
| --- | --- |
| Câmpuri | ${state.keys.map((key) => `\`${key}\``).join(', ')} |
| Dimensiune JSON | ${state.bytes} B |
| JSON simplu, fără identitate de obiect | ${state.plainJson ? 'DA' : 'NU'} |
| Autoritate păstrată | ${state.authorityPreserved ? 'DA' : 'NU'} |
| Tick păstrat | ${state.tickPreserved ? 'DA' : 'NU'} |
| Taste ținute păstrate | ${state.heldPreserved ? 'DA' : 'NU'} |
| Taste ținute neutralizate la reluare | ${state.neutralizedOnRestore ? 'DA' : 'NU'} |
| Primul tick după reluare | ${state.firstTickAfterRestoreEmpty ? 'vid' : 'ACTIV'} la \`${state.firstTickAfterRestoreConsumer}\` |
| Stări invalide refuzate | ${state.restoreRefusals}/4 |

## Determinism

${report.determinism.runs} rulări complete, ${report.determinism.identical ? 'identice' : 'DIFERITE'};
amprenta SHA-256 a raportului (fără câmpul de determinism) este \`${report.determinism.digest}\`.

## Limitări

${limitations}
`;
}

const suite = await import(pathToFileURL(join(root, 'tests', 'input', 'authority-suite.ts')).href),
  started = process.hrtime.bigint(),
  report = suite.runAuthorityReport(),
  json = `${JSON.stringify(report, null, 2)}\n`,
  output = argument('--output') ?? defaultOutput;

for (const entry of report.scenarios)
  console.log(
    `${entry.verdict} ${entry.id}: ${entry.authority} -> ${entry.consumer} ${entry.command} (${entry.empty ? 'empty' : 'active'})`,
  );
console.log(
  `SUMMARY scenarios ${report.summary.scenariosPassed}/${report.summary.scenarios}, combinations ${report.exhaustive.combinationsPerAuthority}x${report.exhaustive.authorities}, addressed ${report.exhaustive.addressed}/${report.exhaustive.ticks}, simultaneous ${report.exhaustive.simultaneousNonEmptyTicks}, wrong consumer ${report.exhaustive.wrongConsumerDeliveries}, transitions ${report.summary.transitionsPassed}/${report.summary.transitionRows}, criterion1 ${report.summary.criterion1 ? 'PASS' : 'FAIL'}, criterion2 ${report.summary.criterion2 ? 'PASS' : 'FAIL'}, focus ${report.summary.focus ? 'PASS' : 'FAIL'}, serializable ${report.summary.serializable ? 'PASS' : 'FAIL'}, overall ${report.summary.pass ? 'PASS' : 'FAIL'}`,
);
console.log(
  `COST local wall time ${(Number(process.hrtime.bigint() - started) / 1e6).toFixed(1)} ms (not part of the report)`,
);

if (process.argv.includes('--check')) {
  const saved = await readFile(output, 'utf8');
  if (saved !== json) {
    console.error(`Authority report is stale: ${output}`);
    process.exitCode = 1;
  } else console.log(`Authority report is current: ${output}`);
  const markdownSaved = await readFile(reportMarkdown, 'utf8');
  if (markdownSaved !== markdown(report)) {
    console.error(`Authority markdown is stale: ${reportMarkdown}`);
    process.exitCode = 1;
  } else console.log(`Authority markdown is current: ${reportMarkdown}`);
} else {
  await writeFile(output, json);
  await writeFile(reportMarkdown, markdown(report));
  console.log(`Wrote ${output}`);
  console.log(`Wrote ${reportMarkdown}`);
  if (!report.summary.pass) process.exitCode = 1;
}
