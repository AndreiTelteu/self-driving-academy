# Raport determinist PBI 227 — decor destructibil și zone de joacă

Fixture: `227-destructible-decor-v1` · mapă: `neighbourhood-compact-v1` · contract: `227-destructible-decor-v1`.

## Zone de joacă (date derivate din layout)

- Zone: 3 (DRIFT_PAD 1, RAMP 1, DEMOLITION_ALLEY 1)
- Intrări: 6, rute: 6, intrări accesibile fără mers pe jos: 6
- Repere: 3, destructibile: 35, arhetipuri: 6
- Rampă: 12 m lungime, 3.2 m lățime, 0.6 m înălțime
- Alee: zone:alley:walk:blk:3-0:N
- Probleme de verificare: 0

## Calibrare provizorie (impuls = masă × viteză a obiectului)

| Arhetip | Masă (kg) | Prag deplasare (N·s) | Prag rupere (N·s) | Clasă |
| --- | --- | --- | --- | --- |
| FENCE_LIGHT | 26 | 15.6 | 117 | LARGE |
| CONE | 5 | 1.25 | 37.5 | LIGHT |
| CRATE | 18 | 7.2 | 99 | LIGHT |
| BIN | 22 | 7.7 | 110 | LIGHT |
| DECOR_SIGN | 12 | 3.6 | 72 | LIGHT |
| STREET_FURNITURE | 45 | 22.5 | 180 | LARGE |

## Tranziții

- Impact slab: INTACT (0.5 N·s), eveniment: false
- Impact continuu: INTACT → MOVED → MOVED
- Impact puternic: BROKEN (42 N·s), eveniment: DESTRUCTIBLE_BROKEN
- Terminal după rupere: true, duplicate: 1

## Aceeași fizică pentru toate sursele de control

- Surse: MANUAL, LEARNING, AUTO, identice: true
- Amprentă comună: `{"state":"BROKEN","damageNs":120,"eventId":"id-v1:19:destructible-broken24:session-227-destructible1:21:046:destructible:zone:alley:walk:blk:3-0:N:crate:3","payload":{"objectId":"destructible:zone:alley:walk:blk:3-0:N:crate:3","instigatorId":"taxi-227","impulseNs":120},"reaction":{"impulseNs":120,"blocking":false,"vehicleDeltaVMps":0.085714}}`

## Lanț și deduplicare

- Lanț: destructible:zone:alley:walk:blk:3-0:N:cone:1 → destructible:zone:alley:walk:blk:3-0:N:crate:2 (BROKEN), instigator real: destructible:zone:alley:walk:blk:3-0:N:cone:1
- 4 impacturi, 1 evenimente, bus păstrează 1, reluare: duplicate

## Obiecte ușoare și obstacole mari

- Reacție con: 60 N·s → 0.042857 m/s pe 1400 kg, blocant: false
- Gard deplasat: 1.6909 m, bandă: lane:31E0, raportat: true, cameră acceptată: false

## Structural, checkpoint și reset

- IDs structurale: 467, destructibile: 35, suprapuneri: 0, layout neatins: true
- Snapshot: 6152 bytes, fnv1a32:fb2bccd1; refăcute: 1 BROKEN, 1 MOVED
- Reset: corpuri 33 → 35
- 20 cicluri: corpuri 35, collidere 35, fragmente 0, evenimente distincte 20, amprente 1
- Preseturi: LOW BROKEN (1 fragmente) vs HIGH BROKEN (3), gameplay identic: true

## Performanță structurală

- simulation: 35 obiecte, 33 corpuri, 33 collidere, 1 obiecte evaluate, 40 intrări în index (17 celule)
- assets: 0 texturi, 0 meshuri
- memory: snapshot 6152 bytes, heap null
- frame: NOT_MEASURED
- buget destructionBodies: null (lacună raportată); plafon propriu: 96

## Verificări

| Verificare | Așteptat | Real | Rezultat |
| --- | --- | --- | --- |
| playground zones | 3 | 3 | PASS |
| every zone entry is drivable without walking | 6 | 6 | PASS |
| playground verification issues | [] | [] | PASS |
| destructible archetypes | 6 | 6 | PASS |
| weak impact leaves the object intact | "INTACT" | "INTACT" | PASS |
| continuous impact reaches MOVED deterministically | "MOVED" | "MOVED" | PASS |
| strong impact breaks once | "BROKEN" | "BROKEN" | PASS |
| BROKEN is terminal inside a generation | [null,1] | [null,1] | PASS |
| MANUAL/LEARNING/AUTO produce one identical outcome | ["fnv1a32:e7b5561e","fnv1a32:e7b5561e","fnv1a32:e7b5561e"] | ["fnv1a32:e7b5561e","fnv1a32:e7b5561e","fnv1a32:e7b5561e"] | PASS |
| chain instigator is the real object | "destructible:zone:alley:walk:blk:3-0:N:cone:1" | "destructible:zone:alley:walk:blk:3-0:N:cone:1" | PASS |
| chain event references both objects | true | true | PASS |
| one DESTRUCTIBLE_BROKEN per object and generation | 1 | 1 | PASS |
| a repeated publication is a duplicate | "duplicate" | "duplicate" | PASS |
| light object cannot act as an invisible wall | [false,true] | [false,true] | PASS |
| a large object yields but stays an obstacle | ["MOVED",true] | ["MOVED",true] | PASS |
| the displaced obstacle lands on the drivable surface | true | true | PASS |
| the obstacle query accepts no camera input | "REFUSED" | "REFUSED" | PASS |
| buildings, lanes and STOP/signal rules stay structural | [0,true] | [0,true] | PASS |
| reload restores moved and broken decor exactly | [1,1] | [1,1] | PASS |
| reset rebuilds the baseline body count | 35 | 35 | PASS |
| twenty reset cycles keep bodies, colliders and fragments at the baseline | [1,1,1,1,20] | [1,1,1,1,20] | PASS |
| reset returns to one baseline decor fingerprint | 1 | 1 | PASS |
| presentation presets change fragments only | [true,true] | [true,true] | PASS |
| invalid input is refused | 6 | 6 | PASS |

Rezumat: 24/24 verificări, PASS.
