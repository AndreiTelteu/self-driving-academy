// PBI 244: test de stabilitate a umbrelor. Se rulează în pagina `?capture=1&preset=HIGH|MEDIUM`
// (după `__visualCapture.go('street-eye-level')`), de ex. cu Playwright: `page.evaluate(<acest fișier>)`.
// Măsoară unde cade în harta de umbră un colț fix al lumii (118,37 / 41,91), în texeli, pe fiecare
// cascadă, în timp ce camera (a) se rotește 360° (pași de 3°) și (b) se translatează în pași de ~1,5 cm.
// Dacă marginea umbrei nu tremură, partea fracționară a coordonatei în texeli rămâne constantă.
async () => {
  const s = window.__v3Composition.scene();
  const cam = s.activeCamera;
  const gens = s.lights[1].getShadowGenerators();
  const gen = gens.get(cam) ?? gens.get(null);
  const csm = gen.getClassName() === 'CascadedShadowGenerator';
  const size = gen.getShadowMap().getSize().width;
  const n = csm ? gen.numCascades : 1;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const P = [118.37, 0.0, 41.91];
  const fr = (v) => v - Math.floor(v);
  const wrap = (d) => {
    d = Math.abs(d);
    return Math.min(d, 1 - d);
  };
  const read = () => {
    const o = [];
    for (let i = 0; i < n; i++) {
      const a = (csm ? gen.getCascadeTransformMatrix(i) : gen.getTransformMatrix()).m;
      const x = P[0] * a[0] + P[1] * a[4] + P[2] * a[8] + a[12];
      const y = P[0] * a[1] + P[1] * a[5] + P[2] * a[9] + a[13];
      o.push([fr((x * 0.5 + 0.5) * size), fr((y * 0.5 + 0.5) * size)]);
    }
    return o;
  };
  const sweep = async (apply, steps) => {
    const base = [];
    const worst = new Array(n).fill(0);
    const over = new Array(n).fill(0);
    for (let k = 0; k < steps; k++) {
      apply(k);
      await raf();
      await raf();
      await raf();
      const r = read();
      for (let i = 0; i < n; i++) {
        if (!base[i]) base[i] = r[i];
        const d = Math.max(wrap(r[i][0] - base[i][0]), wrap(r[i][1] - base[i][1]));
        worst[i] = Math.max(worst[i], d);
        if (d > 0.02) over[i]++;
      }
    }
    return { steps, worstDriftTexel: worst.map((v) => +v.toFixed(4)), stepsOver002: over };
  };
  const rot0 = cam.rotation.y;
  const pos0 = cam.position.clone();
  const rotation = await sweep((k) => {
    cam.rotation.y = rot0 + (k * 3 * Math.PI) / 180;
  }, 120);
  cam.rotation.y = rot0;
  const translation = await sweep((k) => {
    cam.position.x = pos0.x + k * 0.013;
    cam.position.z = pos0.z + k * 0.007;
  }, 150);
  cam.position.copyFrom(pos0);
  const stats = window.__v3Composition.daylight().getShadowStats();
  return {
    generator: gen.getClassName(),
    cascades: n,
    mapSize: size,
    rotation360: rotation,
    translation: translation,
    shadowStats: stats,
  };
};
