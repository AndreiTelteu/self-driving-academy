# 280 — proba de browser first-person

Generată de `npm run camera:first-person:probe`. Status general: **PASS**.

## WEBGL2 — PASS

  - `chase-before`: PASS — mode CHASE, visible car meshes 15, minZ 0.1
  - `first-person-driver-anchor`: PASS — mode FIRST_PERSON, anchor {"x":9.857600000000012,"y":1.46,"z":2.3932}, distance 0
  - `first-person-fov`: PASS — scene 75.0000°, frame 75.0000°
  - `no-car-body-in-first-person`: PASS — visible car meshes 0/15, minZ 0.05
  - `camera-only-switch`: PASS — authority VEHICLE:taxi-01, segment 271-live-three-modes:segment:1, speed 0
  - `back-to-chase`: PASS — mode CHASE, visible car meshes 15
  - `first-person-driving`: PASS — speed 5.726 m/s, fov 77.290°, visible car meshes 0
  - `chase-driving-body-visible`: PASS — visible car meshes 15/15
  - `exit-keeps-camera-coherent`: PASS — mode CHASE, camera player-character
  - `re-enter-first-person`: PASS — re-entry returned to the driver seat
  - `reload-restores-first-person`: PASS — store FIRST_PERSON, camera FIRST_PERSON
  - `browser-errors`: PASS — page errors 0

Capturi: [screenshots/webgl2-01-chase-rest.png](screenshots/webgl2-01-chase-rest.png), [screenshots/webgl2-02-first-person-rest.png](screenshots/webgl2-02-first-person-rest.png), [screenshots/webgl2-03-first-person-driving.png](screenshots/webgl2-03-first-person-driving.png), [screenshots/webgl2-04-chase-driving.png](screenshots/webgl2-04-chase-driving.png), [screenshots/webgl2-05-walking-after-exit.png](screenshots/webgl2-05-walking-after-exit.png), [screenshots/webgl2-06-first-person-reenter.png](screenshots/webgl2-06-first-person-reenter.png), [screenshots/webgl2-07-first-person-reload.png](screenshots/webgl2-07-first-person-reload.png)

## WEBGPU — PASS

  - `chase-before`: PASS — mode CHASE, visible car meshes 15, minZ 0.1
  - `first-person-driver-anchor`: PASS — mode FIRST_PERSON, anchor {"x":9.857600000000012,"y":1.46,"z":2.3932}, distance 0
  - `first-person-fov`: PASS — scene 75.0000°, frame 75.0000°
  - `no-car-body-in-first-person`: PASS — visible car meshes 0/15, minZ 0.05
  - `camera-only-switch`: PASS — authority VEHICLE:taxi-01, segment 271-live-three-modes:segment:1, speed 0
  - `back-to-chase`: PASS — mode CHASE, visible car meshes 15
  - `first-person-driving`: PASS — speed 5.649 m/s, fov 77.260°, visible car meshes 0
  - `chase-driving-body-visible`: PASS — visible car meshes 15/15
  - `exit-keeps-camera-coherent`: PASS — mode CHASE, camera player-character
  - `re-enter-first-person`: PASS — re-entry returned to the driver seat
  - `reload-restores-first-person`: PASS — store FIRST_PERSON, camera FIRST_PERSON
  - `browser-errors`: PASS — page errors 0

Capturi: [screenshots/webgpu-01-chase-rest.png](screenshots/webgpu-01-chase-rest.png), [screenshots/webgpu-02-first-person-rest.png](screenshots/webgpu-02-first-person-rest.png), [screenshots/webgpu-03-first-person-driving.png](screenshots/webgpu-03-first-person-driving.png), [screenshots/webgpu-04-chase-driving.png](screenshots/webgpu-04-chase-driving.png), [screenshots/webgpu-05-walking-after-exit.png](screenshots/webgpu-05-walking-after-exit.png), [screenshots/webgpu-06-first-person-reenter.png](screenshots/webgpu-06-first-person-reenter.png), [screenshots/webgpu-07-first-person-reload.png](screenshots/webgpu-07-first-person-reload.png)

## Limitări

- The probe uses Chrome headless and a procedural vehicle fixture; it is not a human playtest and does not measure FPS/GPU/hardware budgets.
- The live car has no modelled cabin interior, so first person hides the driven exterior shell; the road, city, traffic and lights stay rendered.
- Mouse look/recenter and pointer capture are still the 017 fixture contract; PBI 280 mounts C, the driver anchor and the saved preference.
