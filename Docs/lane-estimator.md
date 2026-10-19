# Estimator schimbare de bandă — V1, PBI 099

`estimateLaneChangeParameters` din `src/learning/lane-estimator.ts` consumă read model-urile 093 și observații ale oportunităților 086, cu etichete 087 și prefixe 088. Rezultatul este imutabil și numai candidat; nu scrie profil sau delta și nu activează parametri.

Faptele `routeRequired: true` sunt numărate separat și excluse înaintea oricărei măsurări de preferință. Numai oportunități LANE_CHANGE rezolvate, eligibile LEARNING, cu prefix utilizabil pot contribui. `COMPLETED` singure oferă o limită observată egală cu cel mai strâns gap/avantaj reușit, fără a pretinde un prag exact. Când există și oportunități `REJECTED`/`ABORTED`, estimatorul raportează `[max(rejected), min(completed)]` cu `value: null`; un interval inversat marchează pragul `UNIDENTIFIED`.

Front-gap, back-gap și avantajul sunt separate și folosesc probele lor respective. `lane_change_cooldown` folosește doar tick-uri măsurate între manevre opționale completate; estimatorul nu deduce timpul din numărul de cadre. Dedupe-ul este `opportunity.id + occurrence`.

## Limite

Clasificarea obligatoriu/forțat, rezultatul și măsurătorile sunt responsabilitatea callerului autoritativ; modulul nu verifică ruta sau fizica. Cu doar succese se raportează o limită, nu un prag exact. Calitatea depinde de read model 093 și de diversitatea oportunităților înregistrate. Nu există integrare worker/profil sau măsurători browser/GPU/FPS.
