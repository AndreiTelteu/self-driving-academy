/**
 * PBI 243 — shaderul GLSL al cerului procedural.
 *
 * Un singur cod GLSL pentru ambele backenduri: WebGL2 îl compilează direct, WebGPU îl trece prin
 * glslang/twgsl (configurate în `backend.ts`). Modelul (gradient, aureolă Mie, disc solar) este
 * oglinda lui `skyRadiance` din `rendering/atmosphere.ts`; norii există numai aici (`CLOUDS`, HIGH)
 * și nu intră în IBL. Culorile și constantele vin din „starea de atmosferă” prin uniforme.
 *
 * Imaginea se procesează exact o dată, ca la restul scenei (PBI 241): cu pipeline (MEDIUM/HIGH)
 * shaderul scrie radianță liniară HDR (`uSkyParams.z = 0`), iar `ImageProcessingPostProcess`
 * aplică expunerea și tone mappingul. Pe LOW nu există pipeline și materialele își aplică singure
 * imaginea; cerul face la fel (`uSkyParams.z = 1`): expunere, Khronos PBR Neutral, gamma și un
 * dithering de 1/255 (fără el gradientul pe 8 biți ar avea trepte vizibile).
 */

export const SKY_VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  // z = w: adâncimea 1,0 (planul îndepărtat) pe WebGL2 și WebGPU; cerul se vede doar unde nu s-a desenat nimic.
  gl_Position = vec4(clip.x, clip.y, clip.w, clip.w);
}
`;

export const SKY_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunToward;
uniform vec3 uGlowColor;
// x: radianța discului, y: cos(raza), z: cos(0,82 · raza), w: intensitatea Mie
uniform vec4 uSunParams;
// x: gradientRate, y: mieG, z: 1 = aplică imaginea (LOW), w: expunerea
uniform vec4 uSkyParams;
// x: acoperire, y: moliciune, z: scara proiecției, w: noaptea (0 = zi, 1 = noapte)
uniform vec4 uCloudParams;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

#ifdef CLOUDS
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * valueNoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    amplitude *= 0.5;
  }
  return sum;
}
#endif

vec3 neutralToneMap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, newPeak * vec3(1.0), g);
}

void main(void) {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float t = 1.0 - exp(-max(h, 0.0) * uSkyParams.x);
  vec3 color = mix(uHorizon, uZenith, t);

  float cosSun = dot(dir, uSunToward);
  float g = uSkyParams.y;
  float denominator = max(1.0 + g * g - 2.0 * g * cosSun, 1e-4);
  float lobe = (1.0 - g * g) / (12.566370614 * pow(denominator, 1.5));
  color += uGlowColor * (lobe * uSunParams.w * (0.35 + 0.65 * (1.0 - t)));
  // Discul solar: radianță HDR (peste pragul bloomului), cu margine moale (~18% din rază).
  // Se adaugă înaintea norilor, ca un nor să poată acoperi soarele.
  color += uGlowColor * (smoothstep(uSunParams.y, uSunParams.z, cosSun) * uSunParams.x);
  // Stele: numai noaptea, pe o grilă sferică stabilă la rotirea camerei. Fiecare celulă are cel
  // mult o stea, cu poziția și strălucirea din hash; dispar sub orizont și lângă cerul luminos.
  float night = uCloudParams.w;
  if (night > 0.01 && h > -0.02) {
    vec2 starUv = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0))) * 210.0;
    vec2 cell = floor(starUv);
    vec2 local = fract(starUv);
    vec2 offset = vec2(hash21(cell + 0.7), hash21(cell + 5.3));
    float distanceToStar = length(local - offset);
    float bright = step(0.975, hash21(cell + 11.1));
    float star = smoothstep(0.09, 0.0, distanceToStar) * bright;
    star *= smoothstep(-0.02, 0.16, h) * night;
    color += vec3(0.85, 0.9, 1.0) * star * (0.8 + 1.6 * hash21(cell + 2.9));
  }

#ifdef CLOUDS
  if (h > 0.0) {
    vec2 plane = dir.xz / (h + 0.18) * uCloudParams.z;
    float n = fbm(plane + vec2(3.7, 1.3));
    float cover = uCloudParams.x;
    float density = smoothstep(1.0 - cover, 1.0 - cover + uCloudParams.y, n);
    // Norii se topesc în ceața orizontului și nu apar sub unghiuri foarte joase.
    density *= smoothstep(0.03, 0.26, h);
    // Fața dinspre soare este luminată, baza norului primește lumina cerului.
    vec2 toSun = uSunToward.xz / max(uSunToward.y, 0.25);
    float shifted = fbm(plane + toSun * 0.12 + vec2(3.7, 1.3));
    float lit = clamp(0.55 + (n - shifted) * 3.2, 0.0, 1.0);
    vec3 cloudLit = mix(vec3(0.84), uHorizon * 2.2, 0.18) + uGlowColor * lobe * uSunParams.w * 0.5;
    vec3 cloudShade = mix(uHorizon, uZenith, 0.4) * 0.82;
    // Noaptea norii nu mai reflectă un soare Puternic: rămân siluete reci, abia vizibile.
    float nightDim = 1.0 - 0.86 * night;
    cloudLit *= nightDim;
    cloudShade *= nightDim;
    density *= 1.0 - 0.35 * night;
    color = mix(color, mix(cloudShade, cloudLit, lit), density * 0.94);
  }
#endif

  if (uSkyParams.z > 0.5) {
    color = neutralToneMap(color * uSkyParams.w);
    color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
    color += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  }
  gl_FragColor = vec4(color, 1.0);
}
`;
