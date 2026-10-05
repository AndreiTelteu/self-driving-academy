# Reguli pentru lucrul cu PBI

Aceste reguli se aplică task-urilor de implementare din board. Citește și documentele din Docs indicate în PBI. Cerințele utilizatorului au prioritate.

## Coloanele și identitatea task-ului

- `PBI/To Do`: implementare neîncepută.
- `PBI/In Progress`: implementare începută, inclusiv task blocat.
- `PBI/Done`: implementare finalizată și verificată.

Coloana numită informal „Progress” este exact `In Progress`. Nu crea un folder separat `Progress`. Statusul frontmatterului trebuie să fie exact `To Do`, `In Progress` sau `Done` și să corespundă folderului.

Un task are un singur fișier. Mută-l, nu îl copia. Nu păstra duplicate. Prefixul numeric și numele fișierului rămân stabile. Nu șterge și nu renumerota ID-uri atribuite. Task-urile noi primesc următorul ID liber, cu minimum trei cifre.

## Alegerea și începerea

Respectă task-ul sau scope-ul cerut de utilizator. Dacă este autorizată continuarea backlogului, alege cel mai mic ID din To Do ale cărui dependențe sunt în Done. Existența codului nu înlocuiește verificarea dependențelor.

Citește integral PBI-ul, contractele și planul modulului. Implicit lucrează la un singur PBI; aceste reguli nu autorizează delegare sau executarea automată a întregului backlog.

Înaintea implementării:

1. Completează owner și started_at cu identitatea agentului și timpul real ISO 8601, cu offset.
2. Setează status `In Progress`.
3. Mută fizic fișierul din To Do în In Progress.
4. Verifică faptul că sursa nu mai există și destinația există.
5. Rulează `Validate-Board.ps1`.

Schimbarea textului status singură nu este o tranziție completă.

## Implementare și verificare

Respectă obiectivul și criteriile. Păstrează Babylon.js ca engine. Un placeholder nu îndeplinește o funcționalitate, exceptând task-urile care cer explicit prototip sau preview.

Execută verificările relevante. Completează Dovezi de finalizare cu rezultatul implementării, comenzile/scenariile și rezultatul lor, fișierele/documentele afectate și limitările. Scrie „Niciuna” când nu există limitări; nu lăsa „De completat”.

Nu pretinde că un test a trecut fără execuție. Pentru criterii vizuale sau de driving păstrează și dovada verificării în browser/playtest. Actualizează Docs și task-urile afectate când se schimbă un contract. Nu modifica pe ascuns cerințele confirmate.

## Blocaj și reluare

Un task blocat rămâne In Progress cu motiv, dovezi și următorul pas. Nu îl muta în Done. După întrerupere citește fișierul din coloana reală și inspectează modificările existente; nu recrea task-ul.

Dacă implementarea nu a început efectiv, poți returna task-ul în To Do, mutând fișierul, actualizând statusul și păstrând motivul în istoric. completed_at rămâne null; owner și started_at pot fi resetate pentru o nouă asumare.

## REGULA OBLIGATORIE MUTAREA ÎN DONE

**Un task nu este finalizat până când fișierul nu este mutat fizic în `PBI/Done`. Mutarea în Done este obligatorie înainte de mesajul final care declară task-ul finalizat.**

Ordinea obligatorie:

1. Îndeplinește criteriile și bifează-le numai după verificare.
2. Completează dovezile, rezultatele și limitările.
3. Actualizează contractele și documentația afectate.
4. Setează status `Done`, completează completed_at și adaugă în istoric rezultatul real.
5. Mută fișierul din In Progress în Done, cu același ID și nume.
6. În fișierul aflat acum în Done, bifează mutarea fizică și finalizează checklistul Definition of Done.
7. Rulează `Validate-Board.ps1 -RequireDone 'ID'`.
8. Confirmă că fișierul există numai în Done și validatorul a trecut.
9. Abia apoi trimite răspunsul de finalizare cu link la task-ul din Done și verificările efectuate.

Dacă un criteriu sau o verificare obligatorie nu este îndeplinită, task-ul rămâne In Progress. Dacă validatorul eșuează, repară boardul înainte de a declara finalizarea. Nu marca Done ca promisiune și nu lăsa task-ul în In Progress după ce ai spus că este terminat.

**Această mutare este parte din Definition of Done, nu un detaliu administrativ opțional.**

## Comenzi PowerShell

Rulează din rădăcina proiectului. Exemplele folosesc primul PBI; pentru alt task folosește numele exact observat pe disk. Actualizează metadatele înaintea mutării.

```powershell
# Începere după setarea statusului In Progress, owner și started_at.
$pbiRoot = (Resolve-Path -LiteralPath './PBI').Path
$taskSource = Join-Path $pbiRoot 'To Do/001-bootstrap.md'
$taskDestination = Join-Path $pbiRoot 'In Progress/001-bootstrap.md'
$taskBoundary = $pbiRoot.TrimEnd('\') + '\'
if (-not [IO.Path]::GetFullPath($taskSource).StartsWith($taskBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Sursă în afara PBI' }
if (-not [IO.Path]::GetFullPath($taskDestination).StartsWith($taskBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destinație în afara PBI' }
if (Test-Path -LiteralPath $taskDestination) { throw 'Destinația există deja' }
Move-Item -LiteralPath $taskSource -Destination $taskDestination
if ((Test-Path -LiteralPath $taskSource) -or -not (Test-Path -LiteralPath $taskDestination)) { throw 'Mutare incompletă' }
& './PBI/Validate-Board.ps1'
```

```powershell
# Finalizare după criterii, dovezi, status Done și completed_at.
$pbiRoot = (Resolve-Path -LiteralPath './PBI').Path
$taskSource = Join-Path $pbiRoot 'In Progress/001-bootstrap.md'
$taskDestination = Join-Path $pbiRoot 'Done/001-bootstrap.md'
$taskBoundary = $pbiRoot.TrimEnd('\') + '\'
if (-not [IO.Path]::GetFullPath($taskSource).StartsWith($taskBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Sursă în afara PBI' }
if (-not [IO.Path]::GetFullPath($taskDestination).StartsWith($taskBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destinație în afara PBI' }
if (Test-Path -LiteralPath $taskDestination) { throw 'Destinația există deja' }
Move-Item -LiteralPath $taskSource -Destination $taskDestination
if ((Test-Path -LiteralPath $taskSource) -or -not (Test-Path -LiteralPath $taskDestination)) { throw 'Mutare incompletă' }
# Bifează în fișierul din Done mutarea fizică, apoi verifică.
& './PBI/Validate-Board.ps1' -RequireDone '001'
```

Nu folosi -Force pentru a suprascrie un PBI existent. Validatorul este read-only și nu mută task-uri automat.

## Întreținerea planului

Un task nou are obiectiv, document, dependențe, criterii, verificare și dovezi. Actualizează README și matricea de acoperire când se schimbă scope-ul. Dependențele nu pot forma cicluri. Task-urile noi pornesc în To Do.

Indexul și matricea păstrează IDs, fără statusuri duplicate. Folderul și frontmatterul sunt sursa de adevăr.

Crearea documentației sau a backlogului nu implementează jocul. Pentru lucrul exclusiv la plan și organizare nu porni artificial un PBI de gameplay și nu muta task-uri de implementare în Done.

## Dependențe după extinderea backlogului

ID-ul nu este o poziție în plan. Task-uri adăugate ulterior pot fi prerequisite pentru IDs existente; nu renumerota fișierele pentru a păstra o ordine numerică topologică. Respectă graful depends_on și verifică lipsa ciclurilor. Pentru modificări de plan rulează și Validate-Plan.ps1; un audit de documentație nu mută PBI-uri de implementare în Done.

## Performanță în PBI-urile relevante

Când frontmatterul include performance_checks, citește [contractul de performanță](../Docs/25-performanta-contracte-si-benchmark.md). Înainte de 203 folosește pragurile propuse și probele de bootstrap, marcate provizorii; după 203 folosește [manifestul de bugete fixat](../Docs/performance-budgets.json), păstrând etichetele de calibrare provizorie. Testul laptop din 203 este omis prin derogarea explicită a utilizatorului; aceasta nu validează hardware-ul laptopului și nu omite gate-urile ulterioare. Păstrează un baseline pe fixture-ul disponibil înainte de schimbare; la final compară aceeași probă și completează Dovezi cu raportul, build/commit, hardware/backend/preset, metricile și bugetul. Pentru o funcționalitate nouă raportează separat costul suplimentar. Nu substitui o măsurare hardware cu FPS headless/software și nu actualiza automat baseline-ul pentru a accepta o regresie. Dacă un PBI fără performance_checks introduce lucru pe tick/frame, transferuri mari, resurse sau istoric, actualizează scope-ul/verificările înainte de implementare.

Nu este obligatoriu să rulezi jocul complet pentru un contract timpuriu, dar probele relevante ale scope-ului trebuie executate. Gate-urile 220 și 224, precum și dependențele 221–223, sunt obligatorii în ordinea indicată. Optimizările păstrează semantica fizicii, learning-ului și KPI/XP. Lucrul la acest plan nu mută task-urile în Done.
