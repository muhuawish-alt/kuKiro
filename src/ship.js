import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mulberry32 } from './util.js';

// ---------------------------------------------------------------------------
// Procedural capital ship "启明号 / DAYBREAK". Forward = -Z, length ~300 units.
// ---------------------------------------------------------------------------

// Loft a closed cross-section (CCW when viewed from +Z) through a list of stations.
function loft(profile, stations) {
  const pos = [];
  const ring = (st) => profile.map(([x, y]) => new THREE.Vector3(x * st.sx + (st.x || 0), y * st.sy + (st.y || 0), st.z));
  const rings = stations.map(ring);
  const push = (...vs) => vs.forEach((v) => pos.push(v.x, v.y, v.z));
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k];
    const B = rings[k + 1];
    for (let i = 0; i < profile.length; i++) {
      const j = (i + 1) % profile.length;
      push(A[i], A[j], B[i]);
      push(A[j], B[j], B[i]);
    }
  }
  const cap = (R, front) => {
    const c = R.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / R.length);
    for (let i = 0; i < R.length; i++) {
      const j = (i + 1) % R.length;
      if (front) push(c, R[j], R[i]);
      else push(c, R[i], R[j]);
    }
  };
  cap(rings[0], true);
  cap(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

// Triplanar texturing (object space) for MeshStandardMaterial so long hull pieces
// get correctly scaled panel detail without UV unwrapping.
export function triplanar(mat, scale, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    s.uniforms.uTriScale = { value: scale };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos; varying vec3 vTriNrm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vTriPos = (instanceMatrix * vec4(position, 1.0)).xyz; vTriNrm = mat3(instanceMatrix) * normal;
        #else
          vTriPos = position; vTriNrm = normal;
        #endif`
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTriPos; varying vec3 vTriNrm; uniform float uTriScale;
        vec4 triSample(sampler2D t){
          vec3 n = abs(normalize(vTriNrm)); n = pow(n, vec3(6.0)); n /= (n.x + n.y + n.z);
          vec3 p = vTriPos * uTriScale;
          return texture2D(t, p.zy) * n.x + texture2D(t, p.xz) * n.y + texture2D(t, p.xy) * n.z;
        }`
      )
      .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = triSample(map); diffuseColor *= sampledDiffuseColor;')
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = roughness * (0.75 + 0.5 * (1.0 - sampledDiffuseColor.g));'
      );
  };
  mat.customProgramCacheKey = () => 'triplanar-' + (key || 'a');
  return mat;
}

function makePanelTexture(rand) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#8c9096';
  g.fillRect(0, 0, S, S);
  const panel = (x, y, w, h, depth) => {
    if (depth > 0 && (w > 36 || h > 36) && rand() < 0.88) {
      if (w > h) {
        const s = Math.round(w * (0.25 + rand() * 0.5));
        panel(x, y, s, h, depth - 1);
        panel(x + s, y, w - s, h, depth - 1);
      } else {
        const s = Math.round(h * (0.25 + rand() * 0.5));
        panel(x, y, w, s, depth - 1);
        panel(x, y + s, w, h - s, depth - 1);
      }
      return;
    }
    const v = 128 + (rand() - 0.5) * 60;
    g.fillStyle = `rgb(${v | 0},${(v + 2) | 0},${(v + 6) | 0})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(18,20,24,0.9)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    const r = rand();
    if (r < 0.12 && h > 20) {
      g.fillStyle = 'rgba(25,27,30,0.85)';
      for (let i = 4; i < h - 4; i += 6) g.fillRect(x + 5, y + i, w - 10, 2);
    } else if (r < 0.16 && w > 30) {
      g.save();
      g.beginPath();
      g.rect(x + 3, y + 3, w - 6, Math.min(14, h - 6));
      g.clip();
      for (let i = -20; i < w + 20; i += 12) {
        g.fillStyle = 'rgba(190,120,40,0.85)';
        g.beginPath();
        g.moveTo(x + i, y + 3);
        g.lineTo(x + i + 6, y + 3);
        g.lineTo(x + i - 8, y + 18);
        g.lineTo(x + i - 14, y + 18);
        g.fill();
      }
      g.restore();
    } else if (r < 0.3) {
      g.fillStyle = 'rgba(30,32,36,0.6)';
      for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * 6, y + 4, 2, 2);
    } else if (r < 0.36) {
      g.fillStyle = 'rgba(60,64,70,0.9)';
      g.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6);
    }
  };
  panel(0, 0, S, S, 10);
  // grime
  for (let i = 0; i < 2500; i++) {
    const a = rand() * 0.06;
    g.fillStyle = `rgba(20,18,16,${a})`;
    const s = 4 + rand() * 40;
    g.fillRect(rand() * S, rand() * S, s, s * (0.2 + rand()));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeNameTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 384;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(235,236,232,0.92)';
  g.textBaseline = 'middle';
  g.font = '600 190px "Echo Serif SC", "Noto Serif SC", serif';
  g.fillText('启明', 40, 200);
  g.font = '700 150px "Echo Cinzel", Cinzel, serif';
  g.fillText('DAYBREAK', 520, 205);
  g.font = '700 54px "Echo Cinzel", Cinzel, serif';
  g.fillText('ED-01   ·   DEEP RANGE VESSEL', 530, 330);
  g.fillRect(40, 40, 1960, 10);
  // weathering
  g.globalCompositeOperation = 'destination-out';
  const rand = mulberry32(99);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.5})`;
    g.fillRect(rand() * 2048, rand() * 384, 2 + rand() * 18, 1 + rand() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function radialSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const plumeVS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const plumeFS = /* glsl */ `
uniform float uTime, uPower; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float t = 1.0 - vUv.y;               // 0 at nozzle, 1 at tail
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 3.5);
  float fall = pow(1.0 - t, 3.0) * smoothstep(0.0, 0.03, t);
  float diamonds = 0.65 + 0.35 * sin(t * 46.0 - uTime * 28.0);
  float flick = 0.9 + 0.1 * sin(uTime * 61.0 + t * 17.0);
  vec3 col = mix(vec3(0.9, 0.95, 1.2) * 1.6, uColor, smoothstep(0.0, 0.25, t));
  gl_FragColor = vec4(col * core * fall * diamonds * flick * uPower * 0.4, 1.0);
}`;

export function buildShip({ envMap = null } = {}) {
  const rand = mulberry32(7);
  const ship = new THREE.Group();
  ship.name = 'Daybreak';
  const panelTex = makePanelTexture(rand);

  const hullMat = triplanar(
    new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.5, roughness: 0.5, map: panelTex, envMap, envMapIntensity: 1.0 }),
    1 / 26,
    'hull'
  );
  const darkMat = triplanar(
    new THREE.MeshStandardMaterial({ color: 0x4a4e56, metalness: 0.65, roughness: 0.45, map: panelTex, envMap, envMapIntensity: 1.0 }),
    1 / 14,
    'dark'
  );
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, metalness: 0.3, roughness: 0.6, envMap });
  const glowWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 2.6, 1.4) });
  const glowBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 3.4, 7.0) });

  const parts = [];
  const add = (geo, mat, parent = ship) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    parts.push(m);
    return m;
  };

  // Flattened hexagon cross-section, CCW from +Z
  const hex = [[1, 0], [0.62, 0.5], [-0.62, 0.5], [-1, 0], [-0.62, -0.5], [0.62, -0.5]];
  const oct = [[1, 0.2], [0.7, 0.5], [-0.7, 0.5], [-1, 0.2], [-1, -0.2], [-0.7, -0.5], [0.7, -0.5], [1, -0.2]];
  const flat = (z, sx, sy) => ({ z, sx, sy, y: -5 + sy / 2 }); // keeps a flat belly at y = -5

  // Forward hull (wedge)
  const fwd = add(
    loft(hex, [
      { z: -152, sx: 1.5, sy: 0.8, y: -2.6 },
      { z: -130, sx: 9, sy: 3.5, y: -3.0 },
      flat(-100, 19, 8),
      flat(-66, 25, 11),
      flat(-44, 23, 10),
      flat(-36, 12, 8),
    ]),
    hullMat
  );
  // Upper deck stack
  const deck = add(loft(hex, [{ z: -96, sx: 6, sy: 2, y: 6 }, { z: -80, sx: 13, sy: 4, y: 7.5 }, { z: -50, sx: 14, sy: 4, y: 7.5 }, { z: -44, sx: 9, sy: 3, y: 7 }]), darkMat);
  const greebleTargets = [fwd, fwd, fwd, deck];
  // Bridge tower
  add(loft(oct, [{ z: -74, sx: 4, sy: 2, y: 11 }, { z: -68, sx: 6.5, sy: 3.4, y: 12 }, { z: -58, sx: 6.5, sy: 3.4, y: 12 }, { z: -54, sx: 4, sy: 2.4, y: 11.5 }]), hullMat);
  const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 0.3), glowWarm);
  bridgeWin.position.set(0, 12.6, -68.4);
  ship.add(bridgeWin);
  // antennae
  for (const [x, h] of [[-2.5, 9], [1.8, 14], [3.2, 6]]) {
    const a = add(new THREE.CylinderGeometry(0.12, 0.2, h, 5), darkMat);
    a.position.set(x, 13.5 + h / 2, -62);
  }

  // Spine
  const spine = add(new THREE.BoxGeometry(12, 9, 140), darkMat);
  spine.position.set(0, 0, 22);
  greebleTargets.push(spine, spine);
  add(new THREE.BoxGeometry(5, 3, 128), hullMat).position.set(0, 5.6, 22);
  add(new THREE.BoxGeometry(5, 3, 128), hullMat).position.set(0, -5.6, 22);

  // Rotating habitat ring
  const ringGroup = new THREE.Group();
  ringGroup.position.set(0, 0, -6);
  ship.add(ringGroup);
  const RING_R = 38;
  add(new THREE.CylinderGeometry(11, 11, 18, 16).rotateX(Math.PI / 2), hullMat).position.set(0, 0, -6);
  add(new THREE.TorusGeometry(RING_R, 4.4, 12, 128), hullMat, ringGroup);
  add(new THREE.TorusGeometry(RING_R, 5.2, 4, 128).scale(1, 1, 0.45), darkMat, ringGroup);
  for (let i = 0; i < 4; i++) {
    const spoke = add(new THREE.BoxGeometry(2.4, RING_R - 10, 2.4), darkMat, ringGroup);
    const a = (i / 4) * Math.PI * 2;
    spoke.position.set(Math.cos(a) * (RING_R / 2 + 5), Math.sin(a) * (RING_R / 2 + 5), 0);
    spoke.rotation.z = a - Math.PI / 2;
  }
  // ring windows (outer surface)
  {
    const n = 360;
    const win = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.5, 0.5), glowWarm, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const row = i % 3;
      const lit = rand() < 0.7;
      const z = (row - 1) * 1.6;
      const r = RING_R + 4.45;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2);
      m.compose(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z), q, new THREE.Vector3(lit ? 1 : 0, 1, 1));
      win.setMatrixAt(i, m);
    }
    ringGroup.add(win);
  }

  // Cargo containers
  {
    const n = 40;
    const geo = new THREE.BoxGeometry(7, 7, 20);
    const cargo = new THREE.InstancedMesh(geo, triplanar(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.6, map: panelTex, envMap }), 1 / 12, 'cargo'), n);
    cargo.castShadow = cargo.receiveShadow = true;
    const palette = [0x9a5a2c, 0x6d7278, 0xb7b9b4, 0x3d5566, 0x8c7a4a];
    const m = new THREE.Matrix4();
    let k = 0;
    for (let slot = 0; slot < 5; slot++) {
      for (const [x, y] of [[-9.6, 4], [9.6, 4], [-9.6, -4], [9.6, -4], [0, 9.6], [0, -9.6], [-9.6, 0], [9.6, 0]]) {
        if (k >= n) break;
        if (rand() < 0.2) continue;
        m.makeTranslation(x, y, 30 + slot * 12.5);
        cargo.setMatrixAt(k, m);
        cargo.setColorAt(k, new THREE.Color(palette[Math.floor(rand() * palette.length)]));
        k++;
      }
    }
    cargo.count = k;
    ship.add(cargo);
  }

  // Radiator wings (faintly glowing hot panels)
  {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 256; i += 8) {
      g.fillStyle = `rgba(255,${80 + Math.random() * 40},30,${0.5 + 0.5 * Math.sin(i * 0.05)})`;
      g.fillRect(i + 2, 4, 4, 56);
    }
    const em = new THREE.CanvasTexture(c);
    em.colorSpace = THREE.SRGBColorSpace;
    const radMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.4, emissive: 0xff5520, emissiveIntensity: 0.9, emissiveMap: em, envMap });
    for (const s of [-1, 1]) {
      const r = add(new THREE.BoxGeometry(56, 0.7, 22), radMat);
      r.position.set(s * 35, 0, 66);
      r.rotation.z = s * 0.12;
      const strut = add(new THREE.BoxGeometry(10, 1.6, 3), darkMat);
      strut.position.set(s * 8, 0, 66);
    }
  }

  // Engine section
  const engineBlock = add(
    loft(oct, [
      { z: 88, sx: 10, sy: 10 },
      { z: 96, sx: 20, sy: 22 },
      { z: 124, sx: 22, sy: 24 },
      { z: 130, sx: 18, sy: 20 },
    ]),
    hullMat
  );
  greebleTargets.push(engineBlock, engineBlock);
  const bellProfile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    bellProfile.push(new THREE.Vector2(3.6 + Math.pow(t, 1.6) * 5.6, t * 14));
  }
  const bellGeo = new THREE.LatheGeometry(bellProfile, 28).rotateX(Math.PI / 2);
  const plumeMats = [];
  const plumeGeo = new THREE.CylinderGeometry(5.6, 1.2, 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const engines = [
    [0, 5.5, 130, 1.15],
    [-11, -5, 130, 1],
    [11, -5, 130, 1],
  ];
  for (const [x, y, z, s] of engines) {
    const bell = add(bellGeo, new THREE.MeshStandardMaterial({ color: 0x2b2522, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide, envMap }));
    bell.position.set(x, y, z);
    bell.scale.setScalar(s);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.5, 24), glowBlue);
    disc.position.set(x, y, z + 0.6);
    ship.add(disc);
    const pm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 1.6 }, uColor: { value: new THREE.Color(0.25, 0.45, 1.6) } },
      vertexShader: plumeVS,
      fragmentShader: plumeFS,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    plumeMats.push(pm);
    const plume = new THREE.Mesh(plumeGeo, pm);
    plume.position.set(x, y, z + 13 * s);
    plume.scale.set(s, s, 120 * s);
    plume.renderOrder = 5;
    ship.add(plume);
  }

  // Greebles sampled across major surfaces
  {
    const meshes = greebleTargets;
    const total = 2600;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const greebles = new THREE.InstancedMesh(geo, darkMat, total);
    greebles.castShadow = greebles.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let k = 0;
    const samplers = meshes.map((mesh) => {
      mesh.updateMatrix();
      return { s: new MeshSurfaceSampler(mesh).build(), mesh };
    });
    while (k < total) {
      const { s, mesh } = samplers[k % samplers.length];
      s.sample(p, nrm);
      p.applyMatrix4(mesh.matrix);
      nrm.transformDirection(mesh.matrix);
      q.setFromUnitVectors(up, nrm);
      const big = rand() < 0.08;
      const sx = big ? 3 + rand() * 6 : 0.4 + rand() * 2.2;
      const sz = big ? 3 + rand() * 9 : 0.4 + rand() * 3;
      const sy = big ? 0.6 + rand() * 1.4 : 0.2 + rand() * 1.0;
      const rot = new THREE.Quaternion().setFromAxisAngle(up, Math.round(rand() * 4) * (Math.PI / 2) + (rand() < 0.3 ? rand() : 0));
      q.multiply(rot);
      m.compose(p, q, new THREE.Vector3(sx, sy, sz));
      greebles.setMatrixAt(k, m);
      k++;
    }
    ship.add(greebles);

    // Hull windows: sample side faces of the forward hull
    const sampler = new MeshSurfaceSampler(fwd).build();
    const nWin = 700;
    const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.45), glowWarm, nWin);
    let w = 0;
    let guard = 0;
    while (w < nWin && guard++ < 40000) {
      sampler.sample(p, nrm);
      if (Math.abs(nrm.y) > 0.75 && rand() < 0.85) continue; // mostly on sides
      if (rand() < 0.3) continue;
      // quantize along rows for orderly window lines
      p.y = Math.round(p.y / 1.6) * 1.6;
      p.z = Math.round(p.z / 1.4) * 1.4;
      p.addScaledVector(nrm, 0.06);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      win.setMatrixAt(w++, m);
    }
    win.count = w;
    ship.add(win);
  }

  // Belly name decal
  {
    const tex = makeNameTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -4, envMap });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(27, 5.06), mat);
    decal.rotation.set(Math.PI / 2, 0, 0); // face -Y; reads left-to-right when seen from below
    decal.position.set(0, -5.06, -78);
    decal.receiveShadow = true;
    ship.add(decal);
  }

  // Navigation lights
  const navTex = radialSprite();
  const navs = [];
  const nav = (pos, color, period, phase, size) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: navTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(pos);
    s.scale.setScalar(size);
    ship.add(s);
    navs.push({ s, period, phase, base: color.clone() });
  };
  nav(new THREE.Vector3(-25.5, -0.5, -66), new THREE.Color(8, 0.4, 0.3), 1.6, 0, 4);
  nav(new THREE.Vector3(25.5, -0.5, -66), new THREE.Color(0.3, 8, 1.2), 1.6, 0, 4);
  nav(new THREE.Vector3(0, -5.4, -150), new THREE.Color(8, 8, 8), 1.1, 0.3, 3);
  nav(new THREE.Vector3(0, 13.5, 110), new THREE.Color(9, 9, 9), 2.2, 0.8, 4);
  nav(new THREE.Vector3(0, -13.5, 110), new THREE.Color(9, 9, 9), 2.2, 1.1, 4);
  nav(new THREE.Vector3(-63, 3.5, 66), new THREE.Color(8, 0.4, 0.3), 2.0, 0.5, 3);
  nav(new THREE.Vector3(63, 3.5, 66), new THREE.Color(0.3, 8, 1.2), 2.0, 0.5, 3);

  ship.userData.update = (t) => {
    ringGroup.rotation.z = t * 0.16;
    for (const pm of plumeMats) pm.uniforms.uTime.value = t;
    for (const n of navs) {
      const ph = ((t + n.phase) % n.period) / n.period;
      const on = ph < 0.08 ? 1 : 0.06;
      n.s.material.color.copy(n.base).multiplyScalar(on);
    }
  };
  ship.userData.setPower = (p) => {
    for (const pm of plumeMats) pm.uniforms.uPower.value = p;
  };
  return ship;
}
