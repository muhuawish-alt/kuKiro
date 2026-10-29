import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLSL_NOISE, mulberry32, gaussian } from './util.js';
import { buildShip } from './ship.js';

// ---------------------------------------------------------------------------
// SPACE SET: starfield, nebula, the signal beacon, planet + atmosphere, sun,
// lens flares and the Daybreak.
// ---------------------------------------------------------------------------

export const PLANET_R = 1000;
export const SUN_DIST = 30000;
export const SUN_DIR = new THREE.Vector3(-0.8, 0.15, -1.0).normalize();
export const GALAXY_N = new THREE.Vector3(0.5, 0.8, 0.2).normalize();
export const BEACON_DIR = new THREE.Vector3(0.29, 0.1, -0.95).normalize();

// Orthonormal frame around the sun direction
const _up = new THREE.Vector3(0, 1, 0);
export const SUN_U = _up.clone().sub(SUN_DIR.clone().multiplyScalar(_up.dot(SUN_DIR))).normalize();
export const SUN_W = new THREE.Vector3().crossVectors(SUN_DIR, SUN_U).normalize();

// Build a camera frame (up n, forward f, left l) whose components of the sun
// direction are (a, b, c). Used to place the flyover with a controlled light angle.
export function frameFromSun(a, b, c) {
  const col = new THREE.Vector3(a, b, c).normalize();
  const helper = Math.abs(col.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const c2 = new THREE.Vector3().crossVectors(col, helper).normalize();
  const c3 = new THREE.Vector3().crossVectors(col, c2).normalize();
  // rows of [col c2 c3] expressed in (SUN_DIR, SUN_U, SUN_W)
  const E = [SUN_DIR, SUN_U, SUN_W];
  const row = (i) => new THREE.Vector3().addScaledVector(E[0], col.getComponent(i)).addScaledVector(E[1], c2.getComponent(i)).addScaledVector(E[2], c3.getComponent(i));
  const n = row(0);
  const f = row(1);
  let l = row(2);
  if (new THREE.Vector3().crossVectors(n, f).dot(l) < 0) l.negate();
  return { n, f, l };
}

const STAR_VS = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aPhase;
uniform float uTime, uPR, uBright;
varying vec3 vColor;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.8 + 0.2 * sin(uTime * (1.3 + aPhase * 2.7) + aPhase * 40.0);
  gl_PointSize = aSize * uPR;
  vColor = aColor * tw * uBright;
}`;
const STAR_FS = /* glsl */ `
varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d2 = dot(c, c);
  float a = exp(-d2 * 40.0) + 0.12 * exp(-d2 * 9.0);
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

function createStars(rand) {
  const N = 22000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const phase = new Float32Array(N);
  const a = new THREE.Vector3(1, 0, 0).cross(GALAXY_N).normalize();
  const b = new THREE.Vector3().crossVectors(GALAXY_N, a);
  const v = new THREE.Vector3();
  const temps = [
    [0.62, 0.72, 1.0],
    [0.85, 0.9, 1.0],
    [1.0, 1.0, 1.0],
    [1.0, 0.92, 0.78],
    [1.0, 0.75, 0.5],
  ];
  for (let i = 0; i < N; i++) {
    if (i < N * 0.55) {
      const th = rand() * Math.PI * 2;
      v.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th)).addScaledVector(GALAXY_N, gaussian(rand) * 0.12).normalize();
    } else {
      v.set(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
    }
    v.multiplyScalar(9000);
    pos.set([v.x, v.y, v.z], i * 3);
    const tc = temps[Math.min(4, Math.floor(Math.pow(rand(), 0.8) * 5))];
    const br = 0.25 + Math.pow(rand(), 6) * 6.0;
    col.set([tc[0] * br, tc[1] * br, tc[2] * br], i * 3);
    size[i] = 1.6 + Math.pow(rand(), 10) * 7.0;
    phase[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uBright: { value: 1 } },
    vertexShader: STAR_VS,
    fragmentShader: STAR_FS,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}

function createNebula() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uG: { value: GALAXY_N }, uIntensity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uG; uniform float uIntensity, uTime; varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float band = exp(-pow(dot(d, uG) / 0.32, 2.0));
        float n1 = fbm(d * 2.4 + vec3(0.0, 0.0, uTime * 0.002));
        float n2 = fbm(d * 5.0 + 3.1);
        float neb = smoothstep(-0.25, 0.75, n1) * (0.25 + band);
        vec3 c1 = vec3(0.015, 0.05, 0.10);
        vec3 c2 = vec3(0.22, 0.05, 0.20);
        vec3 c3 = vec3(0.65, 0.32, 0.14);
        vec3 col = mix(c1, c2, smoothstep(-0.3, 0.6, n2));
        col = mix(col, c3, smoothstep(0.45, 0.9, n1) * band * 0.7);
        float dust = smoothstep(0.0, 0.45, fbm(d * 8.0 + 9.0));
        col *= neb * (1.0 - 0.8 * dust * band);
        col += vec3(0.6, 0.55, 0.5) * band * 0.035 * (0.6 + 0.4 * n2); // unresolved star glow
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9500, 64, 32), m);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// The pulsing signal source seen in the opening shot
function createBeacon() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uAge: { value: 10 }, uIntensity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAge, uIntensity, uTime; varying vec2 vUv;
      void main(){
        vec2 c = vUv * 2.0 - 1.0; float r = length(c);
        float pulse = 1.0 + 4.0 * exp(-uAge * 2.5);
        float core = exp(-r * r * 1800.0) * 30.0 + exp(-r * r * 120.0) * 1.2;
        float halo = exp(-r * 7.0) * 0.18;
        float spikes = (exp(-abs(c.y) * 260.0) * exp(-abs(c.x) * 3.5) + exp(-abs(c.x) * 260.0) * exp(-abs(c.y) * 3.5)) * 0.9;
        float ringR = uAge * 0.45;
        float ring = exp(-pow((r - ringR) / 0.012, 2.0)) * exp(-uAge * 1.2) * 1.5;
        float ring2 = exp(-pow((r - ringR * 0.6) / 0.008, 2.0)) * exp(-uAge * 1.8) * 0.8;
        vec3 col = vec3(0.45, 0.75, 1.0) * (core + halo + spikes) * pulse + vec3(0.4, 0.7, 1.0) * (ring + ring2);
        col *= smoothstep(1.0, 0.7, r);
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.renderOrder = -8;
  mesh.frustumCulled = false;
  return mesh;
}

// Bake planet albedo + clouds/veins into equirect textures once (GPU), so the
// planet itself is cheap to shade.
function bakePlanet(renderer) {
  const W = 4096;
  const H = 2048;
  const opts = { type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtA = new THREE.WebGLRenderTarget(W, H, opts);
  const rtB = new THREE.WebGLRenderTarget(W, H, opts);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMode: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform int uMode; varying vec2 vUv;
      ${GLSL_NOISE}
      void main(){
        float lon = (vUv.x - 0.5) * 6.2831853; float lat = (vUv.y - 0.5) * 3.1415926;
        vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
        float c = fbm(p * 1.3 + vec3(3.1, 1.7, 0.4)) + 0.45 * fbm(p * 3.7 + 11.0);
        float land = smoothstep(0.05, 0.09, c);
        if (uMode == 0) {
          float coast = smoothstep(-0.12, 0.07, c);
          vec3 ocean = mix(vec3(0.004, 0.016, 0.035), vec3(0.01, 0.07, 0.085), coast);
          float n1 = fbm(p * 6.0 + 5.0) * 0.5 + 0.5;
          float n2 = fbm(p * 2.2 + 21.0) * 0.5 + 0.5;
          vec3 lc = mix(vec3(0.36, 0.2, 0.1), vec3(0.13, 0.095, 0.075), smoothstep(0.35, 0.65, n1));
          lc = mix(lc, vec3(0.06, 0.085, 0.065), smoothstep(0.55, 0.78, n2) * 0.85);
          float ridge = 1.0 - abs(snoise(p * 11.0));
          lc *= 0.7 + 0.45 * ridge * ridge;
          float ice = smoothstep(0.8, 0.88, abs(p.y) + 0.08 * fbm(p * 5.0));
          vec3 col = mix(ocean, lc, land);
          col = mix(col, vec3(0.72, 0.75, 0.78), ice);
          gl_FragColor = vec4(sqrt(col), land);
        } else {
          vec3 q = p + 0.28 * vec3(fbm(p * 2.0 + 1.0), fbm(p * 2.0 + 7.0), fbm(p * 2.0 + 13.0));
          float cl = fbm(q * 3.2 + vec3(0.0, 4.0, 0.0)) * 0.65 + fbm(q * 10.0) * 0.35;
          cl = smoothstep(0.04, 0.5, cl + 0.12 * sin(p.y * 9.0));
          float v1 = 1.0 - smoothstep(0.0, 0.03, abs(snoise(p * 7.0 + 2.0)));
          float v2 = 1.0 - smoothstep(0.0, 0.025, abs(snoise(p * 16.0 + 9.0)));
          float region = smoothstep(-0.1, 0.3, fbm(p * 1.8 + 40.0));
          float vein = clamp(v1 + 0.6 * v2, 0.0, 1.0) * region * land;
          float node = v1 * v2 * region * land;
          gl_FragColor = vec4(cl, vein, node, clamp(c * 0.5 + 0.5, 0.0, 1.0));
        }
      }`,
  });
  const quad = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  mat.uniforms.uMode.value = 0;
  renderer.setRenderTarget(rtA);
  quad.render(renderer);
  mat.uniforms.uMode.value = 1;
  renderer.setRenderTarget(rtB);
  quad.render(renderer);
  renderer.setRenderTarget(prev);
  quad.dispose();
  mat.dispose();
  return { texA: rtA.texture, texB: rtB.texture };
}

function createPlanet(renderer) {
  const { texA, texB } = bakePlanet(renderer);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTexA: { value: texA },
      uTexB: { value: texB },
      uSunDir: { value: SUN_DIR },
      uSunColor: { value: new THREE.Color(1.0, 0.96, 0.9) },
      uTime: { value: 0 },
      uVein: { value: 1 },
      uCloudRot: { value: 0 },
      uExposure: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObjN; varying vec3 vWorldPos; varying vec3 vWorldN;
      void main(){
        vObjN = normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz; vWorldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexA, uTexB; uniform vec3 uSunDir, uSunColor; uniform float uTime, uVein, uCloudRot, uExposure;
      varying vec3 vObjN; varying vec3 vWorldPos; varying vec3 vWorldN;
      ${GLSL_NOISE}
      vec2 sphUv(vec3 p){ return vec2(atan(p.z, p.x) / 6.2831853 + 0.5, asin(clamp(p.y, -1.0, 1.0)) / 3.1415926 + 0.5); }
      void main(){
        vec3 p = normalize(vObjN);
        vec2 uv = sphUv(p);
        vec4 A = texture2D(uTexA, uv);
        vec4 B = texture2D(uTexB, uv);
        float cloud = texture2D(uTexB, uv + vec2(uCloudRot, 0.0)).r;
        vec3 albedo = A.rgb * A.rgb;
        // close-range detail
        float camD = length(cameraPosition - vWorldPos);
        float near = 1.0 - smoothstep(150.0, 900.0, camD);
        if (near > 0.0) {
          float dn = snoise(p * 140.0) * 0.5 + snoise(p * 330.0) * 0.25;
          albedo *= 1.0 + dn * 0.45 * near * A.a;
          cloud = clamp(cloud + snoise(p * 180.0 + 3.0) * 0.25 * near * smoothstep(0.05, 0.4, cloud), 0.0, 1.0);
        }
        vec3 N = normalize(vWorldN);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = uSunDir;
        float ndl = dot(N, L);
        float diff = max(ndl, 0.0);
        vec3 tint = mix(vec3(1.0, 0.38, 0.15), vec3(1.0), smoothstep(0.0, 0.32, ndl));
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 120.0) * (1.0 - A.a) * (1.0 - cloud) * step(0.0, ndl);
        vec3 col = albedo * diff * (1.0 - 0.45 * cloud) * 1.6;
        col = mix(col, vec3(0.92, 0.94, 0.97) * (diff * 1.25 + 0.01), cloud * 0.9);
        col = col * tint * uSunColor + spec * uSunColor * 1.4 * tint;
        // atmospheric haze toward the limb
        float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        float lit = smoothstep(-0.15, 0.35, ndl);
        col = mix(col, vec3(0.18, 0.38, 0.9) * lit * 1.2, fres * 0.7 * lit);
        col += vec3(1.0, 0.42, 0.16) * fres * (smoothstep(-0.25, 0.0, ndl) - smoothstep(0.02, 0.3, ndl)) * 0.9;
        // night side: the glowing network
        float night = 1.0 - smoothstep(-0.18, 0.04, ndl);
        float pulse = 0.7 + 0.3 * sin(uTime * 1.7 + p.x * 30.0 + p.z * 21.0);
        vec3 veinCol = vec3(0.18, 0.62, 1.0) * (B.g * 0.9 + B.b * 5.0) * pulse;
        col += veinCol * night * uVein * (1.0 - 0.75 * cloud);
        gl_FragColor = vec4(col * uExposure, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 256, 128), m);
  return mesh;
}

function createAtmosphere() {
  const Ra = PLANET_R * 1.06;
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uR: { value: PLANET_R },
      uRa: { value: Ra },
      uH: { value: PLANET_R * 0.013 },
      uSunDir: { value: SUN_DIR },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `varying vec3 vPos; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uR, uRa, uH, uIntensity; uniform vec3 uSunDir; varying vec3 vPos;
      void main(){
        vec3 ro = cameraPosition; vec3 rd = normalize(vPos - ro);
        float tca = -dot(ro, rd);
        vec3 pc = ro + rd * tca; float h = length(pc);
        float dens = exp(-max(h - uR, 0.0) / uH);
        float chord = sqrt(max(uRa * uRa - h * h, 0.0)) / uRa;
        vec3 n = pc / max(h, 1e-3);
        float mu = dot(n, uSunDir);
        float lit = smoothstep(-0.3, 0.25, mu);
        float cosT = dot(rd, uSunDir);
        float mie = pow(max(cosT, 0.0), 10.0) * 1.1 + pow(max(cosT, 0.0), 300.0) * 5.0;
        vec3 rayleigh = vec3(0.22, 0.5, 1.0);
        vec3 sunset = vec3(1.0, 0.42, 0.14);
        vec3 col = mix(sunset, rayleigh, smoothstep(-0.02, 0.35, mu)) * lit * dens * chord * 2.4;
        col += mix(sunset, vec3(1.0, 0.85, 0.6), smoothstep(0.0, 0.3, mu)) * mie * dens * smoothstep(-0.4, 0.05, mu);
        col *= smoothstep(uRa, uRa - (uRa - uR) * 0.5, h);
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(Ra, 192, 96), m);
}

function createSun() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uIntensity: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity; varying vec2 vUv;
      void main(){
        vec2 c = vUv * 2.0 - 1.0; float r = length(c);
        float core = smoothstep(0.036, 0.03, r) * 80.0;
        float corona = exp(-r * 30.0) * 10.0 + exp(-r * 8.0) * 1.6;
        float rays = pow(abs(cos(atan(c.y, c.x) * 7.0)), 40.0) * exp(-r * 6.0) * 1.2;
        vec3 col = vec3(1.0, 0.93, 0.84) * (core + corona + rays);
        col *= smoothstep(1.0, 0.55, r);
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), m);
  mesh.frustumCulled = false;
  return mesh;
}

// Screen-space lens ghosts + halo, positioned each frame from the sun's projection.
function createFlares() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const ghostFS = /* glsl */ `
    uniform vec3 uColor; uniform float uI; uniform float uRing; varying vec2 vUv;
    void main(){ vec2 c = vUv * 2.0 - 1.0; float r = length(c);
      float a = atan(c.y, c.x); float hex = cos(3.14159/6.0) / cos(mod(a, 3.14159/3.0) - 3.14159/6.0);
      float rr = r / hex;
      float disc = smoothstep(1.0, 0.55, rr);
      float ring = smoothstep(0.6, 0.95, rr) * smoothstep(1.0, 0.92, rr);
      gl_FragColor = vec4(uColor * (disc * (1.0 - uRing) * 0.5 + ring * uRing) * uI, 1.0); }`;
  const haloFS = /* glsl */ `
    uniform float uI; varying vec2 vUv;
    void main(){ vec2 c = vUv * 2.0 - 1.0; float r = length(c);
      float ring = exp(-pow((r - 0.8) / 0.05, 2.0));
      vec3 rainbow = vec3(smoothstep(0.86, 0.78, r), exp(-pow((r-0.8)/0.04,2.0)), smoothstep(0.74, 0.82, r));
      gl_FragColor = vec4(rainbow * ring * uI * 0.35, 1.0); }`;
  const spec = [
    { k: 0.22, s: 0.03, c: [0.5, 0.8, 1.0], ring: 0.1, a: 0.16 },
    { k: 0.38, s: 0.055, c: [1.0, 0.65, 0.35], ring: 0.25, a: 0.07 },
    { k: 0.55, s: 0.016, c: [0.6, 1.0, 0.7], ring: 0.0, a: 0.2 },
    { k: 0.72, s: 0.1, c: [0.45, 0.4, 1.0], ring: 0.3, a: 0.04 },
    { k: 0.88, s: 0.04, c: [1.0, 0.5, 0.4], ring: 0.1, a: 0.09 },
    { k: 1.15, s: 0.16, c: [0.3, 0.6, 1.0], ring: 0.35, a: 0.025 },
    { k: 1.32, s: 0.024, c: [1.0, 0.9, 0.6], ring: 0.0, a: 0.12 },
  ];
  const ghosts = spec.map((g) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(...g.c) }, uI: { value: 0 }, uRing: { value: g.ring } },
      vertexShader: VS,
      fragmentShader: ghostFS,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    scene.add(mesh);
    return { mesh, ...g };
  });
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } },
    vertexShader: VS,
    fragmentShader: haloFS,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), haloMat);
  scene.add(halo);
  return {
    scene,
    camera,
    update(sunNdc, intensity, aspect) {
      for (const g of ghosts) {
        const x = sunNdc.x * (1 - 2 * g.k);
        const y = sunNdc.y * (1 - 2 * g.k);
        g.mesh.position.set(x, y, 0);
        g.mesh.scale.set(g.s, g.s * aspect, 1);
        g.mesh.material.uniforms.uI.value = g.a * intensity;
      }
      halo.position.set(sunNdc.x, sunNdc.y, 0);
      halo.scale.set(0.5, 0.5 * aspect, 1);
      haloMat.uniforms.uI.value = intensity * 0.06;
    },
  };
}

// Faint dust motes around the camera for parallax
export function createDust(rand, count = 3000, box = 900, color = new THREE.Color(0.5, 0.6, 0.8), sunDir = SUN_DIR) {
  const pos = new Float32Array(count * 3);
  const ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(rand() - 0.5) * box, (rand() - 0.5) * box, (rand() - 0.5) * box], i * 3);
    ph[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uPR: { value: 1 }, uColor: { value: color }, uI: { value: 1 }, uSunDir: { value: sunDir } },
    vertexShader: /* glsl */ `
      attribute float aPhase; uniform vec3 uCam; uniform float uBox, uPR; uniform vec3 uSunDir; varying float vA; varying float vF;
      void main(){
        vec3 p = uCam + mod(position - uCam + uBox * 0.5, uBox) - uBox * 0.5;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(260.0 / d, 0.6, 5.0) * uPR * (0.6 + aPhase);
        vA = smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(2.0, 12.0, d);
        vF = pow(max(dot(normalize(p - cameraPosition), uSunDir), 0.0), 6.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uI; varying float vA; varying float vF;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4((uColor + vec3(1.0, 0.8, 0.6) * vF * 3.0) * a * vA * uI, 1.0); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

function createSpaceEnv(renderer, planetDir) {
  // Simple environment for ship reflections: black space, planet-shine below, hot sun.
  const scene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, uPlanet: { value: planetDir } },
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uPlanet; varying vec3 vD;
      void main(){ vec3 d = normalize(vD);
        float pl = smoothstep(0.35, 0.6, dot(d, uPlanet));
        vec3 col = vec3(0.006, 0.008, 0.014);
        col += vec3(0.16, 0.2, 0.26) * pl * (0.6 + 0.4 * dot(d, uSun));
        col += vec3(1.0, 0.95, 0.85) * (exp((dot(d, uSun) - 1.0) * 300.0) * 60.0 + exp((dot(d, uSun) - 1.0) * 12.0) * 0.4);
        gl_FragColor = vec4(col, 1.0); }`,
    side: THREE.BackSide,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), m));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 100);
  pmrem.dispose();
  return rt.texture;
}

export function createSpace(renderer) {
  const rand = mulberry32(2187);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);

  const stars = createStars(rand);
  const nebula = createNebula();
  const beacon = createBeacon();
  const planet = createPlanet(renderer);
  const atmosphere = createAtmosphere();
  const sun = createSun();
  const dust = createDust(rand);
  const flares = createFlares();
  scene.add(nebula, stars, beacon, planet, atmosphere, sun, dust);

  // Flyover frame: low orbit, sun low and to the front-left of the camera
  const fly = frameFromSun(0.3, 0.55, 0.78);
  fly.camPos = fly.n.clone().multiplyScalar(PLANET_R * 1.085);

  const env = createSpaceEnv(renderer, fly.n.clone().negate());
  scene.environment = null;
  const ship = buildShip({ envMap: env });
  scene.add(ship);

  const sunLight = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.88), 3.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -190; sc.right = 190; sc.top = 190; sc.bottom = -190; sc.near = 10; sc.far = 1200;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.6;
  const shine = new THREE.DirectionalLight(new THREE.Color(0.42, 0.56, 0.8), 1.7);
  const ambient = new THREE.AmbientLight(0x2a3a52, 0.35);
  scene.add(sunLight, sunLight.target, shine, shine.target, ambient);

  const sunWorld = SUN_DIR.clone().multiplyScalar(SUN_DIST);
  const tmp = new THREE.Vector3();
  const ndc = new THREE.Vector3();

  // How much of the sun is visible past the planet limb (0..1), analytic.
  function sunVisibility(camPos) {
    const toSun = tmp.copy(sunWorld).sub(camPos).normalize();
    const tca = -camPos.dot(toSun);
    if (tca < 0) return 1; // planet behind the camera
    const h = Math.sqrt(Math.max(camPos.lengthSq() - tca * tca, 0));
    const discR = 0.0054 * tca + 1; // sun disc radius projected to the planet's distance
    return THREE.MathUtils.smoothstep(h, PLANET_R - discR, PLANET_R + discR * 1.5);
  }

  const state = {
    camera: null,
    sunNdc: new THREE.Vector2(),
    sunOnScreen: 0,
    sunVis: 0,
  };

  function update(t, camera, o) {
    camera.updateMatrixWorld(true);
    const pr = renderer.getPixelRatio();
    stars.position.copy(camera.position);
    nebula.position.copy(camera.position);
    stars.material.uniforms.uTime.value = t;
    stars.material.uniforms.uPR.value = pr;
    stars.material.uniforms.uBright.value = o.starBright ?? 1;
    nebula.material.uniforms.uIntensity.value = o.nebula ?? 1;
    nebula.material.uniforms.uTime.value = t;

    beacon.visible = !!o.beacon;
    if (beacon.visible) {
      beacon.position.copy(camera.position).addScaledVector(BEACON_DIR, 8000);
      beacon.quaternion.copy(camera.quaternion);
      beacon.scale.setScalar(o.beaconSize ?? 2600);
      beacon.material.uniforms.uAge.value = o.pingAge ?? 10;
      beacon.material.uniforms.uIntensity.value = o.beacon;
    }

    planet.visible = atmosphere.visible = !!o.planet;
    planet.rotation.y = t * 0.004;
    planet.material.uniforms.uTime.value = t;
    planet.material.uniforms.uVein.value = o.vein ?? 1;
    planet.material.uniforms.uCloudRot.value = t * 0.0006;
    atmosphere.material.uniforms.uIntensity.value = o.atmo ?? 1;

    sun.visible = !!o.sun;
    sun.position.copy(sunWorld);
    sun.quaternion.copy(camera.quaternion);
    let vis = 0;
    if (sun.visible) {
      vis = sunVisibility(camera.position);
      sun.material.uniforms.uIntensity.value = (o.sunIntensity ?? 1) * (0.25 + 0.75 * vis);
    }
    ndc.copy(sunWorld).project(camera);
    const inFront = tmp.copy(sunWorld).sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0;
    state.sunNdc.set(ndc.x, ndc.y);
    const onScreen = inFront ? 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ndc.x), Math.abs(ndc.y)), 0.9, 1.5) : 0;
    state.sunVis = vis;
    state.sunOnScreen = onScreen;
    flares.update(state.sunNdc, sun.visible ? vis * onScreen * (o.flare ?? 1) * (o.sunOcclusion ?? 1) : 0, camera.aspect);

    dust.visible = !!o.dust;
    dust.material.uniforms.uCam.value.copy(camera.position);
    dust.material.uniforms.uPR.value = pr;
    dust.material.uniforms.uI.value = o.dust ?? 0;

    ship.visible = !!o.ship;
    if (ship.visible) {
      ship.userData.update(t);
      sunLight.position.copy(ship.position).addScaledVector(SUN_DIR, 600);
      sunLight.target.position.copy(ship.position);
      shine.position.copy(ship.position).addScaledVector(ship.position.clone().normalize(), -300);
      shine.target.position.copy(ship.position);
    }
  }

  return { scene, flares, ship, planet, update, state, fly, sunWorld, env };
}
