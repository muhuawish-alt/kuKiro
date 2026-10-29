import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLSL_NOISE, mulberry32, createNoise2D, smoothstep, lerp, clamp } from './util.js';
import { buildShip } from './ship.js';
import { createDust } from './space.js';
import { BEAM_TIME } from './timeline.js';

// ---------------------------------------------------------------------------
// SURFACE SET: golden-hour sky, carved valley terrain, height fog, cloud deck,
// the monolith with its floating debris, and the beam.
// ---------------------------------------------------------------------------

export const SURF_SUN = new THREE.Vector3(-1.0, 0.16, 0.12).normalize();
export const MONO = new THREE.Vector3(0, 0, -5200);
export const MONO_H = 780;

const VALLEY_PTS = [
  [1500, 3200], [1100, 1800], [500, 600], [-300, -600], [150, -1900], [-150, -3300], [0, -4500],
];
export const valleyCurve2D = new THREE.CatmullRomCurve3(VALLEY_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');

// Shared uniforms for the custom height fog (patched into every fogged material)
export const FOG = {
  uFogSunDir: { value: SURF_SUN },
  uFogSunColor: { value: new THREE.Color(1.0, 0.62, 0.32) },
  uFogDensity: { value: 0.00013 },
  uFogFalloff: { value: 0.0011 },
  uFogBase: { value: 0 },
};

function patchFog(s) {
  Object.assign(s.uniforms, FOG);
  s.vertexShader = s.vertexShader
    .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 vFogWorld;\n#endif')
    .replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      #ifdef USE_FOG
        #ifdef USE_INSTANCING
          vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
      #endif`
    );
  s.fragmentShader = s.fragmentShader
    .replace(
      '#include <fog_pars_fragment>',
      `#include <fog_pars_fragment>
      #ifdef USE_FOG
        varying vec3 vFogWorld;
        uniform vec3 uFogSunDir, uFogSunColor; uniform float uFogDensity, uFogFalloff, uFogBase;
      #endif`
    )
    .replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        vec3 fogRay = vFogWorld - cameraPosition;
        float fogDist = length(fogRay);
        vec3 fogDir = fogRay / max(fogDist, 1e-3);
        float fb = uFogFalloff;
        float k = fogDist * fogDir.y * fb;
        float term = abs(k) < 1e-4 ? fogDist * fb : (1.0 - exp(-k)) / fogDir.y;
        float od = (uFogDensity / fb) * exp(-(cameraPosition.y - uFogBase) * fb) * term;
        float sunAmt = pow(max(dot(fogDir, uFogSunDir), 0.0), 6.0);
        vec3 fc = mix(fogColor, uFogSunColor, sunAmt);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fc, 1.0 - exp(-max(od, 0.0)));
      #endif`
    );
}

export function withFog(mat, key, extra) {
  mat.onBeforeCompile = (s) => {
    patchFog(s);
    if (extra) extra(s);
  };
  mat.customProgramCacheKey = () => 'fog-' + key;
  return mat;
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const T_SIZE = 16000;
const T_SEG = 640;
const T_CX = 0;
const T_CZ = -2500;

function buildHeightfield() {
  const rand = mulberry32(42);
  const n2 = createNoise2D(rand);
  const n2b = createNoise2D(rand);

  // coarse distance-to-valley grid
  const G = 200;
  const gstep = T_SIZE / G;
  const samples = valleyCurve2D.getSpacedPoints(400);
  const dist = new Float32Array((G + 1) * (G + 1));
  for (let j = 0; j <= G; j++) {
    for (let i = 0; i <= G; i++) {
      const x = T_CX - T_SIZE / 2 + i * gstep;
      const z = T_CZ - T_SIZE / 2 + j * gstep;
      let best = 1e9;
      for (let k = 0; k < samples.length; k++) {
        const dx = samples[k].x - x;
        const dz = samples[k].z - z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      dist[j * (G + 1) + i] = Math.sqrt(best);
    }
  }
  const valleyDist = (x, z) => {
    const fx = clamp((x - (T_CX - T_SIZE / 2)) / gstep, 0, G - 1e-3);
    const fz = clamp((z - (T_CZ - T_SIZE / 2)) / gstep, 0, G - 1e-3);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = dist[j * (G + 1) + i];
    const b = dist[j * (G + 1) + i + 1];
    const c = dist[(j + 1) * (G + 1) + i];
    const d = dist[(j + 1) * (G + 1) + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };

  const raw = (x, z) => {
    // ridged multifractal for the crests, blended with smooth fbm for massing
    let sum = 0;
    let amp = 1;
    let freq = 1 / 3600;
    let prev = 1;
    let norm = 0;
    for (let o = 0; o < 7; o++) {
      let n = 1 - Math.abs(n2(x * freq + o * 17.3, z * freq - o * 9.1));
      n = Math.pow(n, 1.6);
      sum += n * amp * prev;
      norm += amp;
      prev = clamp(n * 1.1);
      amp *= 0.48;
      freq *= 2.07;
    }
    let smooth = 0;
    let a2 = 1;
    let f2 = 1 / 5200;
    for (let o = 0; o < 4; o++) {
      smooth += a2 * n2b(x * f2 + 3.7 * o, z * f2 - 1.3 * o);
      a2 *= 0.5;
      f2 *= 2.1;
    }
    const r = sum / norm;
    let h = Math.pow(r, 1.35) * 1250 + (smooth * 0.5 + 0.5) * 520;
    h += n2b(x / 11000, z / 11000) * 240;
    return h;
  };

  const height = (x, z) => {
    let h = raw(x, z);
    const dv = valleyDist(x, z);
    const floor = 28 + n2b(x / 650, z / 650) * 14 + n2(x / 160, z / 160) * 3;
    const v = Math.pow(smoothstep(110, 1150, dv), 1.25);
    h = lerp(floor, h, v);
    const dmx = x - MONO.x;
    const dmz = z - MONO.z;
    const dm = Math.sqrt(dmx * dmx + dmz * dmz);
    const pm = smoothstep(520, 1500, dm);
    h = lerp(40 + n2(x / 300, z / 300) * 4, h, pm);
    return h;
  };
  return { height, valleyDist, n2 };
}

function makeDetailTexture() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const n = createNoise2D(mulberry32(5));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // tileable via torus mapping
      const a = (x / S) * Math.PI * 2;
      const b = (y / S) * Math.PI * 2;
      let v = 0;
      let amp = 0.5;
      let f = 1;
      for (let o = 0; o < 5; o++) {
        v += amp * n(Math.cos(a) * f * 1.6 + Math.sin(b) * f * 0.7 + o * 3.1, Math.sin(a) * f * 1.6 + Math.cos(b) * f * 1.6 - o * 1.7);
        amp *= 0.5;
        f *= 2;
      }
      const k = 150 + v * 90;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(k, 0, 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(T_SIZE / 60, T_SIZE / 60);
  t.anisotropy = 8;
  return t;
}

function createTerrain() {
  const { height, n2 } = buildHeightfield();
  const geo = new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SEG, T_SEG);
  geo.rotateX(-Math.PI / 2);
  geo.translate(T_CX, 0, T_CZ);
  const pos = geo.attributes.position;
  const N1 = T_SEG + 1;
  const H = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const h = height(pos.getX(i), pos.getZ(i));
    H[i] = h;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const step = T_SIZE / T_SEG;
  const sampleH = (x, z) => {
    const fx = clamp((x - (T_CX - T_SIZE / 2)) / step, 0, T_SEG - 1e-3);
    const fz = clamp((z - (T_CZ - T_SIZE / 2)) / step, 0, T_SEG - 1e-3);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    return lerp(lerp(H[j * N1 + i], H[j * N1 + i + 1], u), lerp(H[(j + 1) * N1 + i], H[(j + 1) * N1 + i + 1], u), v);
  };

  // vertex colours: slope / height based palette + horizon AO
  const colors = new Float32Array(pos.count * 3);
  const dirs = [];
  for (let k = 0; k < 7; k++) dirs.push([Math.cos((k / 7) * Math.PI * 2), Math.sin((k / 7) * Math.PI * 2)]);
  const c = new THREE.Color();
  const sand = new THREE.Color(0.42, 0.22, 0.11);
  const rock = new THREE.Color(0.15, 0.12, 0.1);
  const darkRock = new THREE.Color(0.075, 0.062, 0.055);
  const ash = new THREE.Color(0.55, 0.5, 0.46);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = H[i];
    const ny = nrm.getY(i);
    const vnoise = n2(x / 240, z / 240) * 0.5 + 0.5;
    c.copy(rock).lerp(darkRock, smoothstep(0.75, 0.45, ny) * 0.8);
    c.lerp(sand, smoothstep(0.82, 0.95, ny) * smoothstep(500, 120, h) * (0.6 + 0.4 * vnoise));
    c.lerp(ash, smoothstep(0.7, 0.9, ny) * smoothstep(700, 1100, h));
    c.multiplyScalar(0.8 + 0.4 * vnoise);
    let occ = 0;
    for (const [dx, dz] of dirs) {
      let m = 0;
      for (const r of [70, 220]) {
        const e = (sampleH(x + dx * r, z + dz * r) - h) / r;
        if (e > m) m = e;
      }
      occ += m / Math.sqrt(1 + m * m);
    }
    const ao = clamp(1 - (occ / dirs.length) * 1.3, 0.25, 1);
    c.multiplyScalar(ao);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const detail = makeDetailTexture();
  const uni = {
    uMono: { value: MONO },
    uGlow: { value: 0 },
    uWaveR: { value: -1000 },
    uShockR: { value: -1000 },
    uShock: { value: 0 },
  };
  const mat = withFog(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, map: detail, bumpMap: detail, bumpScale: 2.2 }),
    'terrain',
    (s) => {
      Object.assign(s.uniforms, uni);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos; uniform vec3 uMono; uniform float uGlow, uWaveR, uShockR, uShock;
          float th(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            vec2 dm = vWPos.xz - uMono.xz; float r = length(dm); float ang = atan(dm.y, dm.x);
            const float NS = 28.0;
            float fa = ang * NS / 6.2831853 + sin(r * 0.006) * 0.12;
            float idx = floor(fa);
            float arc = abs(fract(fa) - 0.5) * 6.2831853 * r / NS;
            float len = 380.0 + th(vec2(idx, 3.0)) * 1100.0;
            float spoke = (1.0 - smoothstep(0.6, 2.8, arc)) * smoothstep(len, len * 0.6, r) * smoothstep(80.0, 140.0, r) * step(0.35, th(vec2(idx, 7.0)));
            float rings = (1.0 - smoothstep(0.5, 2.5, abs(r - 230.0))) + (1.0 - smoothstep(0.5, 2.0, abs(r - 410.0))) * step(0.5, fract(ang * 3.0));
            float wave = exp(-pow((r - uWaveR) / 70.0, 2.0));
            float glyph = (spoke + rings * 0.8);
            vec3 cyan = vec3(0.25, 0.72, 1.0);
            totalEmissiveRadiance += cyan * glyph * (uGlow * 0.8 + wave * 5.0);
            float shock = exp(-pow((r - uShockR) / 45.0, 2.0)) * uShock;
            totalEmissiveRadiance += vec3(0.7, 0.9, 1.0) * shock * (1.5 + glyph * 6.0);
          }`
        );
    }
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return { mesh, sampleH, uni };
}

// ---------------------------------------------------------------------------
// Clouds: camera-facing soft puffs, sorted back-to-front each frame
// ---------------------------------------------------------------------------
function makeCloudAtlas() {
  // 2x2 atlas of irregular, domain-warped fbm cloud shapes (no round blobs)
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = mulberry32(11);
  const n = createNoise2D(rand);
  const fbm = (x, y) => {
    let v = 0;
    let a = 0.5;
    for (let o = 0; o < 5; o++) {
      v += a * n(x, y);
      x = x * 2.03 + 5.1;
      y = y * 2.03 - 3.7;
      a *= 0.5;
    }
    return v;
  };
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cell = (x >= 256 ? 1 : 0) + (y >= 256 ? 2 : 0);
      const lx = ((x % 256) - 128) / 128;
      const ly = ((y % 256) - 128) / 128;
      const sx = lx * 1.6 + cell * 7.3;
      const sy = ly * 1.6 - cell * 3.1;
      const wx = fbm(sx + 1.7, sy + 9.2) * 0.9;
      const wy = fbm(sx - 4.3, sy + 2.8) * 0.9;
      const dn = fbm(sx + wx, sy + wy);
      const fall = clamp(1 - (lx * lx + ly * ly * 1.6));
      const d = fall * 1.15 + dn * 0.9 - 0.42;
      const a = Math.pow(smoothstep(-0.1, 0.8, d), 1.4) * smoothstep(0.0, 0.45, fall);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function createClouds() {
  const rand = mulberry32(77);
  const puffs = [];
  // main deck over the dive area: clustered banks with clear gaps between them
  const cn = createNoise2D(mulberry32(78));
  let placed = 0;
  let guard = 0;
  while (placed < 760 && guard++ < 40000) {
    const x = -1200 + rand() * 5600;
    const z = -2200 + rand() * 9000;
    const cover = cn(x / 2200, z / 2200) * 0.6 + cn(x / 800, z / 800) * 0.4;
    if (cover < 0.12 + rand() * 0.3) continue;
    puffs.push({
      p: new THREE.Vector3(x, 1650 + rand() * 380 + cover * 420, z),
      s: 380 + rand() * 700,
      r: rand() * Math.PI * 2,
      v: Math.floor(rand() * 4),
      o: 0.18 + rand() * 0.3,
      deck: true,
    });
    placed++;
  }
  // low banks drifting along the far valley walls
  for (let i = 0; i < 70; i++) {
    const u = 0.25 + rand() * 0.7;
    const p = valleyCurve2D.getPointAt(u);
    const side = rand() < 0.5 ? -1 : 1;
    puffs.push({
      p: new THREE.Vector3(p.x + side * (1100 + rand() * 1600), 350 + rand() * 550, p.z + (rand() - 0.5) * 900),
      s: 300 + rand() * 500,
      r: rand() * Math.PI * 2,
      v: Math.floor(rand() * 4),
      o: 0.18 + rand() * 0.22,
    });
  }
  const N = puffs.length;
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  aData.setUsage(THREE.DynamicDrawUsage);
  aMisc.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aData', aData);
  geo.setAttribute('aMisc', aMisc);
  geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: makeCloudAtlas() },
      uRight: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3() },
      uBack: { value: new THREE.Vector3() },
      uSunDir: { value: SURF_SUN },
      uLit: { value: new THREE.Color(3.2, 2.1, 1.25) },
      uShadow: { value: new THREE.Color(0.42, 0.48, 0.66) },
      uFogColor: { value: new THREE.Color(0.5, 0.45, 0.48) },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aData; attribute vec3 aMisc;
      uniform vec3 uRight, uUp; uniform float uTime;
      varying vec2 vUv; varying vec2 vQ; varying vec3 vWorld; varying float vO;
      void main(){
        float c = cos(aMisc.x + uTime * 0.01), s = sin(aMisc.x + uTime * 0.01);
        vec2 q = mat2(c, -s, s, c) * position.xy;
        vec3 wp = aData.xyz + (uRight * q.x + uUp * q.y * 0.75) * aData.w;
        vWorld = wp; vQ = position.xy * 2.0; vO = aMisc.z;
        float cell = aMisc.y;
        vUv = (uv + vec2(mod(cell, 2.0), floor(cell / 2.0))) * 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uRight, uUp, uBack, uSunDir, uLit, uShadow, uFogColor; uniform float uOpacity;
      varying vec2 vUv; varying vec2 vQ; varying vec3 vWorld; varying float vO;
      void main(){
        float a = texture2D(uTex, vUv).a * vO * uOpacity;
        float d = length(vWorld - cameraPosition);
        a *= smoothstep(60.0, 520.0, d) * (1.0 - smoothstep(9000.0, 14000.0, d));
        if (a < 0.003) discard;
        float z = sqrt(max(1.0 - dot(vQ, vQ), 0.0));
        vec3 n = normalize(uRight * vQ.x + uUp * vQ.y + uBack * (z + 0.2));
        float lam = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        // world-space height inside the bank: tops catch the sun, bellies go blue-grey
        float top = clamp((vWorld.y - 1650.0) / 700.0, 0.0, 1.0);
        float dens = texture2D(uTex, vUv).a;
        vec3 col = mix(uShadow, uLit, clamp(pow(lam, 1.3) * (0.35 + 0.75 * top) + (1.0 - dens) * 0.25, 0.0, 1.0));
        vec3 vd = normalize(vWorld - cameraPosition);
        float fwd = pow(max(dot(vd, uSunDir), 0.0), 5.0);
        col += uLit * fwd * (1.0 - dens) * 1.2;
        col = mix(col, uFogColor, smoothstep(1500.0, 12000.0, d) * 0.7);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  const order = puffs.map((_, i) => i);
  const dists = new Float32Array(N);
  const update = (camera, t, deck = 1) => {
    const e = camera.matrixWorld.elements;
    mat.uniforms.uRight.value.set(e[0], e[1], e[2]);
    mat.uniforms.uUp.value.set(e[4], e[5], e[6]);
    mat.uniforms.uBack.value.set(e[8], e[9], e[10]);
    mat.uniforms.uTime.value = t;
    for (let i = 0; i < N; i++) dists[i] = puffs[i].p.distanceToSquared(camera.position);
    order.sort((a, b) => dists[b] - dists[a]);
    for (let k = 0; k < N; k++) {
      const p = puffs[order[k]];
      aData.setXYZW(k, p.p.x + t * 6, p.p.y, p.p.z, p.s);
      aMisc.setXYZ(k, p.r, p.v, p.o * (p.deck ? deck : 1));
    }
    aData.needsUpdate = true;
    aMisc.needsUpdate = true;
  };
  return { mesh, update, mat };
}

// ---------------------------------------------------------------------------
// Monolith, debris, particles, beam
// ---------------------------------------------------------------------------
function createMonolith(env, groundY) {
  const group = new THREE.Group();
  group.position.set(MONO.x, groundY, MONO.z);
  const TW = 0.55;
  let geo = new THREE.CylinderGeometry(38, 60, MONO_H, 6, 90, false).translate(0, MONO_H / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = (y / MONO_H) * TW;
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const uni = { uPingAge: { value: 10 }, uCharge: { value: 0 }, uMonoGlow: { value: 1 }, uTime: { value: 0 } };
  const mat = withFog(
    new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.9, roughness: 0.26, envMap: env, envMapIntensity: 1.2 }),
    'monolith',
    (s) => {
      Object.assign(s.uniforms, uni);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vObj; uniform float uPingAge, uCharge, uMonoGlow, uTime;
          float mh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float y = vObj.y;
            float ang = atan(vObj.z, vObj.x) - (y / ${MONO_H.toFixed(1)}) * ${TW.toFixed(3)};
            float face = (ang + 3.14159265) / (6.2831853 / 6.0) + 0.5;
            float fi = floor(face); float fu = fract(face);
            vec2 g = vec2(fu * 9.0, y / 8.0);
            vec2 cell = floor(g); vec2 f = fract(g);
            float h = mh(cell + fi * 31.0);
            float t = fract(h * 7.0);
            float glyph = 0.0;
            if (h > 0.45) {
              if (t < 0.3) glyph = step(abs(f.y - 0.5), 0.09) * step(0.18, f.x) * step(f.x, 0.82);
              else if (t < 0.55) glyph = step(abs(f.x - 0.5), 0.09) * step(0.18, f.y) * step(f.y, 0.82);
              else if (t < 0.8) glyph = step(abs(f.x - 0.5), 0.32) * step(abs(f.y - 0.5), 0.32) - step(abs(f.x - 0.5), 0.2) * step(abs(f.y - 0.5), 0.2);
              else glyph = step(length(f - 0.5), 0.3) - step(length(f - 0.5), 0.18);
            }
            float colMask = step(0.4, mh(vec2(cell.x, fi + 9.0)));
            float band = step(0.25, mh(vec2(floor(y / 64.0), fi)));
            glyph *= colMask * band * step(0.04, fu) * step(fu, 0.96) * step(12.0, y);
            float edge = 1.0 - smoothstep(0.0, 0.01, min(fu, 1.0 - fu));
            float front = uPingAge * 560.0;
            float pulse = exp(-pow((y - front) / 55.0, 2.0)) * exp(-uPingAge * 0.5);
            float flick = 0.85 + 0.15 * sin(uTime * 3.0 + cell.y * 1.7 + fi);
            float e = glyph * (0.22 * flick + 2.6 * pulse + 1.6 * uCharge) + edge * (0.3 + 3.0 * pulse + 2.2 * uCharge);
            totalEmissiveRadiance += vec3(0.25, 0.72, 1.0) * e * uMonoGlow;
          }`
        );
    }
  );
  const mono = new THREE.Mesh(geo, mat);
  mono.castShadow = true;
  mono.receiveShadow = true;
  group.add(mono);

  // floating capstone
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.9, roughness: 0.2, envMap: env, emissive: new THREE.Color(0.25, 0.72, 1.0), emissiveIntensity: 0.6 });
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(30, 0), withFog(capMat, 'cap'));
  cap.scale.set(1, 1.7, 1);
  cap.position.y = MONO_H + 85;
  cap.castShadow = true;
  group.add(cap);
  return { group, mono, cap, capMat, uni };
}

function rockGeometry(seed) {
  const rand = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const ph = [rand() * 9, rand() * 9, rand() * 9, rand() * 9];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = 1 + 0.22 * Math.sin(x * 3.1 + ph[0]) * Math.cos(y * 2.7 + ph[1]) + 0.14 * Math.sin(z * 5.3 + ph[2]) + 0.08 * Math.sin((x + y) * 9.1 + ph[3]);
    p.setXYZ(i, x * d, y * d * 0.8, z * d);
  }
  g.computeVertexNormals();
  return g;
}

function createDebris(groundY) {
  const rand = mulberry32(31);
  const N = 150;
  const mat = withFog(new THREE.MeshStandardMaterial({ color: 0x75655a, roughness: 0.92, metalness: 0.05, flatShading: true }), 'rock');
  const mesh = new THREE.InstancedMesh(rockGeometry(3), mat, N);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const rocks = [];
  for (let i = 0; i < N; i++) {
    const big = i < 6;
    rocks.push({
      r: big ? 200 + rand() * 160 : 110 + Math.pow(rand(), 0.8) * 420,
      a: rand() * Math.PI * 2,
      y: big ? 60 + rand() * 300 : 40 + rand() * 720,
      w: (0.015 + rand() * 0.05) * (rand() < 0.5 ? 1 : -1) * (big ? 0.4 : 1),
      s: big ? 18 + rand() * 18 : 1.5 + Math.pow(rand(), 3) * 16,
      rx: rand() * 6, ry: rand() * 6, spin: (rand() - 0.5) * 0.3,
      bob: rand() * 6,
    });
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const update = (t, lift = 0) => {
    for (let i = 0; i < N; i++) {
      const r = rocks[i];
      const a = r.a + t * r.w;
      v.set(MONO.x + Math.cos(a) * r.r, groundY + r.y + Math.sin(t * 0.4 + r.bob) * 6 + lift * (40 + r.y * 0.2), MONO.z + Math.sin(a) * r.r);
      e.set(r.rx + t * r.spin, r.ry + t * r.spin * 0.7, 0);
      q.setFromEuler(e);
      sc.setScalar(r.s);
      m.compose(v, q, sc);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

function createMotes(groundY) {
  const rand = mulberry32(8);
  const N = 2600;
  const a = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) a.set([60 + Math.pow(rand(), 0.6) * 650, rand() * Math.PI * 2, rand() * 1000, 10 + rand() * 40], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aP', new THREE.BufferAttribute(a, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBase: { value: new THREE.Vector3(MONO.x, groundY, MONO.z) }, uPR: { value: 1 }, uI: { value: 1 }, uCharge: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aP; uniform float uTime, uPR, uCharge; uniform vec3 uBase; varying float vA;
      void main(){
        float y = mod(aP.z + uTime * aP.w * (1.0 + uCharge * 6.0), 1000.0);
        float ang = aP.y + uTime * 0.05 + y * 0.002;
        float r = aP.x * (1.0 - uCharge * 0.5 * smoothstep(0.0, 1000.0, y));
        vec3 p = uBase + vec3(cos(ang) * r, y, sin(ang) * r);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(900.0 / -mv.z, 1.0, 7.0) * uPR;
        vA = smoothstep(0.0, 80.0, y) * smoothstep(1000.0, 700.0, y) * smoothstep(3500.0, 1400.0, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uI; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.35, 0.8, 1.0) * a * vA * uI * 2.0, 1.0); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

function glowSprite(color) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uColor: { value: color } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uI; uniform vec3 uColor; varying vec2 vUv;
      void main(){ vec2 c = vUv * 2.0 - 1.0; float r = length(c);
        float g = exp(-r * r * 90.0) * 5.0 + exp(-r * r * 12.0) * 0.25;
        float sp = exp(-abs(c.y) * 120.0) * exp(-abs(c.x) * 3.0) * 1.2;
        gl_FragColor = vec4(uColor * (g + sp) * smoothstep(1.0, 0.6, r) * uI, 1.0); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false;
  return mesh;
}

function createBeam(groundY) {
  const VS = /* glsl */ `
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vY = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const FS = /* glsl */ `
    uniform float uPower, uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float core = pow(facing, 2.5);
      float flick = 0.85 + 0.15 * sin(uTime * 45.0 + vY * 900.0);
      float scroll = 0.75 + 0.25 * sin(vY * 2400.0 - uTime * 60.0);
      vec3 col = mix(uColor, vec3(1.0), core * 0.7) * core * flick * scroll * uPower;
      col *= smoothstep(1.0, 0.6, vY);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const make = (r, color, power) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uPower: { value: 0 }, uTime: { value: 0 }, uColor: { value: color } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0), m);
    mesh.position.set(MONO.x, groundY + MONO_H + 85, MONO.z);
    mesh.userData = { r, power };
    mesh.frustumCulled = false;
    return mesh;
  };
  const core = make(16, new THREE.Color(0.55, 0.85, 1.0), 5);
  const outer = make(80, new THREE.Color(0.15, 0.45, 1.0), 0.55);
  // expanding dust wall for the shockwave
  const wallMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uI; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.6 + 0.4 * sin(vUv.x * 380.0)); gl_FragColor = vec4(vec3(0.55, 0.75, 1.0) * a * uI, 1.0); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true).translate(0, 0.5, 0), wallMat);
  wall.position.set(MONO.x, groundY - 5, MONO.z);
  wall.frustumCulled = false;
  const flash = glowSprite(new THREE.Color(0.6, 0.85, 1.0));
  flash.position.set(MONO.x, groundY + MONO_H + 85, MONO.z);
  return { core, outer, wall, wallMat, flash };
}

// Daytime gas giant with rings hanging over the horizon
function createGiant() {
  const dir = new THREE.Vector3(0.62, 0.2, -1).normalize();
  const group = new THREE.Group();
  group.position.copy(dir.multiplyScalar(42000));
  const m = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SURF_SUN }, uI: { value: 1 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vO; void main(){ vO = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uI; varying vec3 vN; varying vec3 vO;
      ${GLSL_NOISE}
      void main(){
        vec3 p = normalize(vO);
        float lat = p.y + 0.06 * fbm(p * 4.0);
        float bands = sin(lat * 26.0) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.75, 0.62, 0.5), vec3(0.95, 0.88, 0.78), bands);
        col = mix(col, vec3(0.6, 0.45, 0.4), smoothstep(0.6, 0.9, sin(lat * 9.0 + 1.0)) * 0.5);
        float lit = smoothstep(-0.05, 0.4, dot(normalize(vN), uSun));
        gl_FragColor = vec4(col * lit * 0.32 * uI, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(6500, 96, 48), m);
  const rm = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uI; varying vec2 vP;
      void main(){ float r = length(vP) / 6500.0;
        float b = (sin(r * 60.0) * 0.5 + 0.5) * (sin(r * 23.0 + 1.3) * 0.5 + 0.5);
        float a = smoothstep(1.35, 1.45, r) * smoothstep(2.4, 2.2, r) * (0.35 + 0.65 * b) * (1.0 - 0.8 * smoothstep(1.85, 1.9, r) * smoothstep(1.97, 1.92, r));
        gl_FragColor = vec4(vec3(0.9, 0.82, 0.7) * a * 0.16 * uI, 1.0); }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(6500 * 1.3, 6500 * 2.5, 160, 1), rm);
  ring.rotation.set(-1.25, 0.3, 0.35);
  group.add(body, ring);
  group.renderOrder = -5;
  body.renderOrder = -5;
  ring.renderOrder = -4;
  return { group, body, ring };
}

export function createSurface(renderer) {
  const scene = new THREE.Scene();

  const sky = new Sky();
  sky.scale.setScalar(60000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4.0;
  su.rayleigh.value = 2.2;
  su.mieCoefficient.value = 0.0025;
  su.mieDirectionalG.value = 0.9;
  su.sunPosition.value.copy(SURF_SUN);
  su.cloudCoverage.value = 0.35;
  su.cloudDensity.value = 0.5;
  su.cloudElevation.value = 0.6;
  scene.add(sky);

  // environment from the sky for metallic reflections
  const envScene = new THREE.Scene();
  const skyEnv = new Sky();
  skyEnv.scale.setScalar(80);
  skyEnv.material.uniforms.turbidity.value = 4.5;
  skyEnv.material.uniforms.rayleigh.value = 2.0;
  skyEnv.material.uniforms.mieCoefficient.value = 0.004;
  skyEnv.material.uniforms.mieDirectionalG.value = 0.92;
  skyEnv.material.uniforms.sunPosition.value.copy(SURF_SUN);
  skyEnv.material.uniforms.cloudCoverage.value = 0;
  envScene.add(skyEnv);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.035, 0.025) }));
  ground.position.y = -2;
  envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.03, 0.1, 200).texture;
  pmrem.dispose();

  scene.fog = new THREE.FogExp2(new THREE.Color(0.42, 0.42, 0.48), 0);

  const terrain = createTerrain();
  scene.add(terrain.mesh);
  const groundY = terrain.sampleH(MONO.x, MONO.z);

  const clouds = createClouds();
  scene.add(clouds.mesh);

  const mono = createMonolith(env, groundY);
  scene.add(mono.group);
  const debris = createDebris(groundY);
  scene.add(debris.mesh);
  const motes = createMotes(groundY);
  scene.add(motes);
  const beam = createBeam(groundY);
  scene.add(beam.core, beam.outer, beam.wall, beam.flash);
  const giant = createGiant();
  scene.add(giant.group);
  const dust = createDust(mulberry32(3), 2500, 700, new THREE.Color(0.35, 0.28, 0.22), SURF_SUN);
  scene.add(dust);

  const ship = buildShip({ envMap: env });
  ship.scale.setScalar(0.14);
  scene.add(ship);

  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.72, 0.46), 4.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -2600; sc.right = 2600; sc.top = 2600; sc.bottom = -2600; sc.near = 10; sc.far = 16000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 3;
  const hemi = new THREE.HemisphereLight(new THREE.Color(0.42, 0.52, 0.72), new THREE.Color(0.2, 0.13, 0.09), 1.5);
  scene.add(sun, sun.target, hemi);

  const tmp = new THREE.Vector3();
  const state = { sunNdc: new THREE.Vector2(), sunOnScreen: 0 };

  function update(t, camera, o) {
    camera.updateMatrixWorld(true);
    const pr = renderer.getPixelRatio();
    su.time.value = t;
    // shadow focus
    const focus = o.shadowFocus || MONO;
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SURF_SUN, 8000);
    const ext = o.shadowExtent || 2600;
    if (sc.right !== ext) {
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
      sc.updateProjectionMatrix();
    }

    clouds.mesh.visible = (o.clouds ?? 0) > 0;
    if (clouds.mesh.visible) {
      clouds.mat.uniforms.uOpacity.value = o.clouds;
      clouds.update(camera, t, o.deck ?? 1);
    }

    // monolith
    const pa = o.pingAge ?? 10;
    mono.uni.uPingAge.value = pa;
    mono.uni.uCharge.value = o.charge ?? 0;
    mono.uni.uTime.value = t;
    mono.cap.rotation.y = t * 0.25;
    mono.cap.position.y = MONO_H + 85 + Math.sin(t * 0.8) * 6;
    mono.capMat.emissiveIntensity = 0.4 + 2.5 * Math.exp(-pa * 2.0) + 2.5 * (o.charge ?? 0) + (BEAM_TIME < t ? 3 : 0);
    debris.update(t, o.lift ?? 0);
    motes.material.uniforms.uTime.value = t;
    motes.material.uniforms.uPR.value = pr;
    motes.material.uniforms.uCharge.value = o.charge ?? 0;
    motes.visible = o.motes ?? true;

    // ground glyphs and shock
    terrain.uni.uGlow.value = 0.25 + (o.charge ?? 0) * 2.5 + Math.exp(-pa * 1.5) * 0.6;
    terrain.uni.uWaveR.value = pa * 900;
    const bt = t - BEAM_TIME;
    terrain.uni.uShockR.value = bt > 0 ? bt * 2600 : -1000;
    terrain.uni.uShock.value = bt > 0 ? Math.exp(-bt * 0.6) * 3 : 0;

    // beam
    const on = bt > 0 ? 1 : 0;
    const grow = THREE.MathUtils.clamp(bt / 0.5, 0, 1);
    for (const b of [beam.core, beam.outer]) {
      b.visible = on > 0;
      const r = b.userData.r * (0.2 + 0.8 * Math.min(1, bt / 0.2)) * (1 + 0.05 * Math.sin(t * 30));
      b.scale.set(r, 22000 * (1 - Math.pow(1 - grow, 3)) + 1, r);
      b.material.uniforms.uPower.value = b.userData.power * (1 + 2.5 * Math.exp(-bt * 3));
      b.material.uniforms.uTime.value = t;
    }
    beam.wall.visible = on > 0;
    if (beam.wall.visible) {
      const R = 20 + bt * 2600;
      beam.wall.scale.set(R, 110 + bt * 60, R);
      beam.wallMat.uniforms.uI.value = Math.exp(-bt * 0.9) * 1.6;
    }
    beam.flash.visible = true;
    beam.flash.quaternion.copy(camera.quaternion);
    const flashI = (bt > 0 ? 1.6 * Math.exp(-bt * 3) + 0.25 : 0) + (o.charge ?? 0) * 0.35 + Math.exp(-pa * 3) * 0.35;
    beam.flash.material.uniforms.uI.value = flashI;
    beam.flash.scale.setScalar(420 + (bt > 0 ? 700 * Math.exp(-bt * 2) : 0));

    // ship
    ship.visible = !!o.ship;
    if (ship.visible) {
      ship.userData.update(t);
      if (o.shipPower != null) ship.userData.setPower(o.shipPower);
    }

    dust.visible = (o.dust ?? 0) > 0;
    dust.material.uniforms.uCam.value.copy(camera.position);
    dust.material.uniforms.uPR.value = pr;
    dust.material.uniforms.uI.value = o.dust ?? 0;

    giant.group.position.copy(camera.position).add(tmp.set(0.08, 0.2, -1).normalize().multiplyScalar(42000));

    // sun screen position (for god rays)
    tmp.copy(camera.position).addScaledVector(SURF_SUN, 50000);
    const ndc = tmp.project(camera);
    state.sunNdc.set(ndc.x, ndc.y);
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    state.sunOnScreen = fwd.dot(SURF_SUN) > 0 ? 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ndc.x), Math.abs(ndc.y)), 0.85, 1.1) : 0;
  }

  return { scene, update, state, terrain, groundY, ship, mono, env, clouds, sky };
}
