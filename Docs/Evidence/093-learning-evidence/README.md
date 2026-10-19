# PBI 093 — dovezi parametru

API: `parameterEvidenceSpecs`, `createParameterEvidenceLedger()`, `observe(input)`, `read(key)` și
`readAll()`. Registrul ia datele 086/087/088 și, pentru canale numerice, rezultatul 089. Read model
imutabil, descriptiv, fără valoare/delta. Testele și ieșirile comenzilor sunt păstrate aici.

## De ce testele prind implementări greșite

- Acoperirea exactă și compararea unităților/limitelor prind o cheie M omisă, o cheie extension,
  duplicate sau o limită care a deviat de la 092.
- Demonstrația goală fără rezultat STOP prinde fallback-ul plauzibil `stop_full_probability = 0`;
  modelul trebuie să rămână NO_EVIDENCE, fără value/delta.
- Testul de imuabilitate prinde API-uri care expun direct mapurile sau array-urile ledger-ului.
- Contextul străin prinde implementarea care ghicește eligibilitatea/identitatea în loc să respingă
  o intrare incompletă.
- Douăzeci de apeluri pentru același STOP, repetarea aceleiași perechi id/occurrence și apoi o nouă
  occurrence prind deduplicarea după frame/call sau lipsa unei noi apariții.
- Zece secunde, contextul LEADER, viteza variată în urmărire, prefixul TRUNCATED și cazul suprimat
  prind pragurile și canalele aplicate contextului greșit ori lipsa filtrării prefixului.

## Deduplicare

Cheia internă este `opportunity.id + NUL + opportunity.occurrence`, indiferent de 086
`observationCount`. Astfel, aceeași oprire repetată în 20 de cadre rămâne un singur map entry;
aceeași identitate cu occurrence nou primește un entry nou. Testul folosește fapte structurale cu
contractele 086–088 și simulează 20 de observații asupra aceluiași fapt.

## Limitări

În acest milestone viteza/valorile relaționale sunt sumarizate doar când callerul furnizează probele
potrivite cu 086–088. Catalogul runtime continuă să aibă `estimable=false`; READY nu publică și nu
estimează. Nu există integrare live, persistență sau probe browser/FPS. `npm ci` nu s-a încheiat în
mediul curent; typecheck, lint și format:check nu au putut porni din cauza binarelor lipsă.
