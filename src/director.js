import * as THREE from 'three';
import { SHOTS, pingAge, drumEnergy, BEAM_TIME, TITLE_TIME, DURATION } from './timeline.js';
import { clamp, lerp, smoothstep, easeInOutCubic, easeInOutSine, easeOutCubic, easeInCubic, shake } from './util.js';
import { SUN_DIR, SUN_U, SUN_W, SUN_DIST, PLANET_R, BEACON_DIR } from './space.js';
import { MONO, MONO_H, SURF_SUN, valleyCurve2D, FOG } from './surface.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;

export function createDirector({ space, surface, post, camera, renderer }) {
  const tmp = V();
  const tmp2 = V();
  const ray = new THREE.Raycaster();
  const occluders = [];
  space.ship.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.material && o.material.isMeshStandardMaterial) occluders.push(o);
  });

  function place(pos, target, fov, roll = 0, up = V(0, 1, 0)) {
    camera.position.copy(pos);
    camera.up.copy(up);
    camera.lookAt(target);
    if (roll) camera.rotateZ(roll);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
  function addShake(t, amp, rot = 0) {
    if (amp <= 0) return;
    camera.translateX(shake(t * 1.7, 1) * amp);
    camera.translateY(shake(t * 1.9, 2) * amp);
    if (rot) {
      camera.rotateX(shake(t * 2.3, 3) * rot);
      camera.rotateY(shake(t * 2.1, 4) * rot);
      camera.rotateZ(shake(t * 1.3, 5) * rot * 0.6);
    }
  }
  function setNear(near, far) {
    if (camera.near !== near || camera.far !== far) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  // ---------------- per-set post defaults ----------------
  function postSpace() {
    renderer.toneMappingExposure = 1.0;
    post.bloom.strength = 0.85;
    post.bloom.radius = 0.55;
    post.bloom.threshold = 0.9;
    post.streak.strength = 0.32;
    post.streak.threshold = 5.0;
    post.streak.tint.setRGB(0.35, 0.55, 1.0);
    post.godRays.uniforms.uStrength.value = 0;
    const f = post.final.uniforms;
    f.uGain.value.set(1.0, 1.0, 1.02);
    f.uLift.value.set(0.0, 0.004, 0.012);
    f.uSaturation.value = 1.0;
    f.uContrast.value = 1.06;
    f.uVignette.value = 0.55;
  }
  function postSurface() {
    renderer.toneMappingExposure = 0.62;
    post.bloom.strength = 0.5;
    post.bloom.radius = 0.6;
    post.bloom.threshold = 2.6;
    post.streak.strength = 0.2;
    post.streak.threshold = 10.0;
    post.streak.tint.setRGB(1.0, 0.7, 0.45);
    const f = post.final.uniforms;
    f.uGain.value.set(1.04, 1.0, 0.94);
    f.uLift.value.set(0.0, 0.008, 0.02);
    f.uSaturation.value = 0.95;
    f.uContrast.value = 1.08;
    f.uVignette.value = 0.6;
  }
  function godRays(state, strength) {
    const g = post.godRays.uniforms;
    g.uSun.value.set(state.sunNdc.x * 0.5 + 0.5, state.sunNdc.y * 0.5 + 0.5);
    g.uStrength.value = strength * state.sunOnScreen;
    g.uThreshold.value = 2.5;
    g.uDensity.value = 0.9;
    g.uDecay.value = 0.962;
    g.uTint.value.setRGB(1.0, 0.72, 0.45);
  }

  // ---------------- shots ----------------
  const shots = [];
  const shot = (name, fn) => {
    const [a, b] = SHOTS[name];
    shots.push({ name, a, b, fn });
  };

  // Studio card: pure black
  shot('studio', () => ({ set: 'black', fade: 1 }));

  // 1. Deep space: drift toward the pulsing beacon
  shot('deepSpace', (t, lt, p) => {
    setNear(1, 40000);
    const pos = BEACON_DIR.clone().multiplyScalar(lt * 45);
    const d0 = BEACON_DIR.clone().add(V(-0.16, 0.07, 0.02)).normalize();
    const k = easeInOutSine(clamp(lt / 9.5));
    const dir = d0.lerp(BEACON_DIR, k).normalize();
    const fovPush = easeInCubic(smoothstep(13.6, 16.0, t));
    const fov = lerp(50, 30, easeInOutSine(p)) - fovPush * 8;
    place(pos, pos.clone().add(dir), fov, lerp(-0.32, -0.12, easeInOutSine(p)));
    addShake(t, 0.15, 0.0006);
    postSpace();
    post.streak.strength = 0.5;
    space.update(t, camera, {
      beacon: smoothstep(5.0, 7.5, t),
      beaconSize: 2800,
      pingAge: pingAge(t),
      dust: 0.7,
      starBright: 1.0,
      nebula: 1.0,
    });
    const fade = Math.max(1 - smoothstep(5.0, 7.0, t), smoothstep(15.1, 15.95, t));
    return { set: 'space', fade };
  });

  // 2. Planet sunrise: the sun slips out from behind the limb
  shot('sunrise', (t, lt, p) => {
    setNear(1, 40000);
    const D = lerp(1850, 1700, easeInOutSine(p));
    const b = lerp(0.984, 1.03, p) * PLANET_R;
    const h = (b * (SUN_DIST + D)) / SUN_DIST;
    const pos = SUN_DIR.clone().multiplyScalar(-D).addScaledVector(SUN_U, h).addScaledVector(SUN_W, lerp(-90, 70, easeInOutSine(p)));
    const sunFromCam = space.sunWorld.clone().sub(pos).normalize();
    const target = pos.clone().add(sunFromCam.addScaledVector(SUN_U, 0.075).normalize());
    place(pos, target, lerp(36, 32, easeInOutSine(p)), lerp(0.05, -0.03, p), SUN_U);
    addShake(t, 0.12, 0.0004);
    postSpace();
    const rise = smoothstep(21.4, 23.5, t);
    renderer.toneMappingExposure = lerp(1.3, 0.95, rise);
    post.streak.strength = 0.42;
    space.update(t, camera, {
      planet: 1,
      vein: lerp(1.3, 0.9, rise),
      atmo: 1,
      sun: 1,
      flare: 1,
      dust: 0,
      starBright: lerp(1.0, 0.55, rise),
      nebula: lerp(0.7, 0.35, rise),
    });
    const fade = 1 - smoothstep(16.0, 17.6, t);
    return { set: 'space', fade, overlay: true };
  });

  // 3. Flyover: the Daybreak passes overhead, camera tilts down to the planet
  // ship path in the camera's frame: s = distance ahead, u = height above
  const shipS = (lt) => -250 + 40 * lt + 0.55 * lt * lt;
  const shipU = (lt) => 74 - Math.pow(Math.max(0, lt - 6.5), 2) * 1.15;
  shot('flyover', (t, lt, p) => {
    setNear(0.5, 40000);
    const { n, f, l } = space.fly;
    const pos = space.fly.camPos.clone().addScaledVector(f, lt * 2.0);
    // look up at the belly as it passes, then follow the engines down toward the planet
    const sEng = shipS(lt) - 140 - lt * 2.0;
    const follow = THREE.MathUtils.radToDeg(Math.atan2(shipU(lt), sEng)) - 6;
    const tiltUp = lerp(-6, 27, easeInOutSine(smoothstep(0.8, 5.5, lt)));
    // smooth min of "tilt up to meet the ship" and "follow the engines away"
    const kS = 8;
    const hS = clamp(0.5 + (0.5 * (follow - tiltUp)) / kS);
    const pitchDeg = Math.max(lerp(follow, tiltUp, hS) - kS * hS * (1 - hS), -8);
    const pitch = deg(pitchDeg);
    const yaw = deg(lerp(5, -1, easeInOutSine(p)));
    const dir = f.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(n, Math.sin(pitch)).addScaledVector(l, Math.sin(yaw)).normalize();
    place(pos, pos.clone().add(dir), 60, deg(lerp(-3, 4, p)), n);
    const rumble = smoothstep(32, 37, t) * (1 - smoothstep(41, 44, t));
    addShake(t, 0.05 + rumble * 0.3, 0.0004 + rumble * 0.0014);

    // ship
    const ship = space.ship;
    const s = shipS(lt);
    const u = shipU(lt);
    const ds = shipS(lt + 0.05) - s;
    const du = shipU(lt + 0.05) - u;
    const shipPos = space.fly.camPos.clone().addScaledVector(f, s).addScaledVector(n, u).addScaledVector(l, 18);
    ship.position.copy(shipPos);
    const m = new THREE.Matrix4().makeBasis(l.clone().negate(), n, f.clone().negate());
    ship.quaternion.setFromRotationMatrix(m);
    ship.rotateX(Math.atan2(du, ds));
    ship.rotateZ(deg(lerp(-1, 3, p)));
    ship.userData.setPower(0.45 + smoothstep(38, 42, t) * 0.35);

    postSpace();
    renderer.toneMappingExposure = 1.05;
    // soft occlusion of the sun by the hull for the flare ghosts
    let vis = 0;
    const toSun = space.sunWorld.clone().sub(camera.position).normalize();
    const side = V().crossVectors(toSun, n).normalize();
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 1.2;
      tmp.copy(camera.position).addScaledVector(side, o).addScaledVector(n, (i % 2) * 1.2 - 0.6);
      ray.set(tmp, toSun);
      ray.far = 2000;
      space.ship.updateMatrixWorld(true);
      vis += ray.intersectObjects(occluders, false).length ? 0 : 0.2;
    }
    space.update(t, camera, {
      planet: 1,
      vein: 0.25,
      atmo: 1,
      sun: 1,
      flare: 1.2,
      sunOcclusion: vis,
      ship: 1,
      dust: 0.35,
      starBright: 0.45,
      nebula: 0.25,
    });
    const flash = smoothstep(42.4, 44.0, t);
    return { set: 'space', overlay: true, flash: easeInCubic(flash) };
  });

  // 4. Cloud dive: through the deck, revealing the land
  const divePath = new THREE.CatmullRomCurve3([V(2900, 3600, 5900), V(2450, 2500, 4500), V(1900, 1500, 3200), V(1450, 700, 2150), V(1250, 420, 1600)]);
  shot('clouds', (t, lt, p) => {
    setNear(2, 90000);
    const u = easeInOutSine(p) * 0.92 + p * 0.08;
    const pos = divePath.getPointAt(u * 0.95);
    const look = MONO.clone().setY(surface.groundY + 420);
    const fwd = look.clone().sub(pos).normalize();
    const pitch = deg(lerp(-46, -9, easeInOutCubic(smoothstep(0.08, 0.95, p))));
    const flat = V(fwd.x, 0, fwd.z).normalize();
    const dir = flat.clone().multiplyScalar(Math.cos(pitch)).add(V(0, Math.sin(pitch), 0));
    place(pos, pos.clone().add(dir), lerp(54, 48, p), deg(lerp(6, -2, easeInOutSine(p))));
    addShake(t, 0.6 + 1.2 * envelopeLocal(p, 0.25, 0.4, 0.55, 0.7), 0.0012);
    // ship descending ahead of us
    const su = clamp(u * 0.95 + 0.16, 0, 1);
    const sp = divePath.getPointAt(su).add(V(-120, -120, 0));
    const sp2 = divePath.getPointAt(clamp(su + 0.02, 0, 1)).add(V(-120, -120, 0));
    surface.ship.position.copy(sp);
    surface.ship.lookAt(tmp.copy(sp).sub(sp2).add(sp));
    surface.ship.rotateZ(deg(-8));
    postSurface();
    renderer.toneMappingExposure = 0.6;
    surface.update(t, camera, {
      clouds: 1,
      deck: 1,
      ship: 1,
      shipPower: 1.1,
      dust: 0,
      pingAge: pingAge(t),
      shadowFocus: V(1200, 0, -400),
      shadowExtent: 3600,
    });
    godRays(surface.state, 0.8);
    const flash = 1 - smoothstep(44.0, 45.4, t);
    return { set: 'surface', flash: easeOutCubic(flash) };
  });

  // 5. Valley run: low and fast, the monolith on the horizon
  const vh = (x, z) => {
    let s = 0;
    for (const [dx, dz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60]]) s += surface.terrain.sampleH(x + dx, z + dz);
    return s / 5;
  };
  shot('valley', (t, lt, p) => {
    setNear(2, 90000);
    const u0 = 0.17;
    const u1 = 0.61;
    const u = lerp(u0, u1, p);
    const c = valleyCurve2D.getPointAt(u);
    const pos = V(c.x, vh(c.x, c.z) + 68 + Math.sin(lt * 0.9) * 6, c.z);
    const a = valleyCurve2D.getPointAt(Math.min(u + 0.03, 1));
    const ahead = V(a.x, vh(a.x, a.z) + 70, a.z);
    const monoLook = MONO.clone().setY(surface.groundY + 500);
    const k = smoothstep(0.55, 1.0, p) * 0.55;
    const target = ahead.clone().lerp(monoLook.clone().sub(pos).normalize().multiplyScalar(ahead.distanceTo(pos)).add(pos), k);
    // bank into the turns
    const t0 = valleyCurve2D.getTangentAt(u);
    const t1 = valleyCurve2D.getTangentAt(Math.min(u + 0.02, 1));
    const turn = t0.x * t1.z - t0.z * t1.x;
    place(pos, target, 46, clamp(turn * 9, -0.2, 0.2));
    const e = drumEnergy(t);
    addShake(t, 0.35 + e * 1.3, 0.0008 + e * 0.004);

    // ship leads the way
    const su = Math.min(u + 0.052, 1);
    const sc = valleyCurve2D.getPointAt(su);
    const sn = valleyCurve2D.getPointAt(Math.min(su + 0.01, 1));
    const sPos = V(sc.x, vh(sc.x, sc.z) + 120 + Math.sin(t * 1.3) * 5, sc.z);
    surface.ship.position.copy(sPos);
    surface.ship.lookAt(tmp.copy(sPos).sub(V(sn.x, sPos.y, sn.z)).add(sPos));
    const st0 = valleyCurve2D.getTangentAt(su);
    const st1 = valleyCurve2D.getTangentAt(Math.min(su + 0.02, 1));
    surface.ship.rotateZ(clamp((st0.x * st1.z - st0.z * st1.x) * 14, -0.5, 0.5));

    postSurface();
    const fwd = camera.getWorldDirection(V());
    surface.update(t, camera, {
      clouds: 1,
      deck: 0,
      ship: 1,
      shipPower: 1.2,
      dust: 1,
      pingAge: pingAge(t),
      shadowFocus: pos.clone().addScaledVector(fwd, 1700).setY(0),
      shadowExtent: 2600,
    });
    godRays(surface.state, 1.0);
    const fade = smoothstep(62.65, 62.98, t);
    return { set: 'surface', fade };
  });

  // 6. The monolith: crane up its face, it charges, the beam erupts
  shot('monolith', (t, lt, p) => {
    setNear(2, 90000);
    const sXZ = V(SURF_SUN.x, 0, SURF_SUN.z).normalize();
    const base = Math.atan2(-sXZ.z, -sXZ.x) + 1.7; // sun off to the side: raking light on the faces
    const pre = clamp((t - 63) / (BEAM_TIME - 63));
    const th = base + lerp(0.0, -0.42, easeInOutSine(pre));
    const bt = t - BEAM_TIME;
    const blow = bt > 0 ? easeOutCubic(clamp(bt / 1.6)) : 0; // shockwave shoves the camera back
    const R = lerp(600, 430, easeInOutSine(pre)) + blow * 520;
    const gy = surface.groundY;
    const H = lerp(26, 360, easeInOutCubic(pre)) + blow * 60;
    const pos = V(MONO.x + Math.cos(th) * R, gy + H, MONO.z + Math.sin(th) * R);
    const lookY = lerp(260, 600, easeInOutCubic(pre)) + blow * 520;
    const target = V(MONO.x, gy + lookY, MONO.z);
    const fov = 44 + blow * 16;
    place(pos, target, fov, deg(lerp(-3, 2, pre)));
    const charge = Math.pow(smoothstep(63.6, BEAM_TIME, t), 2);
    const beamShake = bt > 0 ? Math.exp(-bt * 1.3) * 5 + 0.6 : 0;
    addShake(t, 0.2 + charge * 0.8 + beamShake, 0.0006 + charge * 0.002 + beamShake * 0.004);

    surface.ship.position.set(MONO.x - 160, gy + 1150, MONO.z + 520);
    surface.ship.lookAt(V(MONO.x - 160, gy + 1150, MONO.z + 2000));
    surface.ship.rotateZ(deg(-4 + Math.sin(t) * 1.5));

    postSurface();
    // the "camera" stops down as the monolith charges and the beam fires
    renderer.toneMappingExposure = 0.62 - charge * 0.12 - (bt > 0 ? 0.2 * easeOutCubic(clamp(bt / 0.6)) : 0);
    post.bloom.strength = 0.5 + charge * 0.15;
    post.bloom.radius = bt > 0 ? 0.35 : 0.6;
    surface.update(t, camera, {
      clouds: 0,
      ship: 1,
      shipPower: 1.0,
      dust: 0.45,
      pingAge: pingAge(t),
      charge,
      lift: smoothstep(BEAM_TIME, BEAM_TIME + 2.2, t),
      shadowFocus: MONO,
      shadowExtent: 1800,
    });
    godRays(surface.state, 0.6);
    const flash = Math.max(bt > 0 ? Math.exp(-bt * 7) * 0.6 : 0, easeInCubic(smoothstep(71.2, 71.92, t)));
    const fade = t > 71.94 ? 1 : 0;
    return { set: 'surface', flash, fade };
  });

  shot('black', () => ({ set: 'black', fade: 1 }));

  // Title: a slow drift through dim stars behind the type
  shot('title', (t, lt) => {
    setNear(1, 40000);
    const pos = V(0, 0, -lt * 8);
    const dir = V(0.05, 0.02, -1).normalize();
    place(pos, pos.clone().add(dir), 40, deg(-8 + lt * 0.3));
    postSpace();
    post.streak.strength = 0.2;
    space.update(t, camera, { starBright: 0.4 * smoothstep(TITLE_TIME, TITLE_TIME + 3, t), nebula: 0.3 * smoothstep(TITLE_TIME, TITLE_TIME + 4, t), dust: 0.25 });
    const flash = Math.exp(-(t - TITLE_TIME) * 3.5) * 0.25;
    const fade = Math.max(smoothstep(85.6, 87.6, t), 0);
    return { set: 'space', flash, fade };
  });

  function envelopeLocal(x, a, b, c, d) {
    if (x <= a || x >= d) return 0;
    if (x < b) return smoothstep(a, b, x);
    if (x <= c) return 1;
    return 1 - smoothstep(c, d, x);
  }

  function apply(t) {
    t = clamp(t, 0, DURATION - 1e-3);
    let s = shots[shots.length - 1];
    for (const sh of shots) {
      if (t >= sh.a && t < sh.b) {
        s = sh;
        break;
      }
    }
    const lt = t - s.a;
    const p = lt / (s.b - s.a);
    const r = s.fn(t, lt, p) || {};
    camera.updateMatrixWorld(true);
    return { name: s.name, set: r.set || 'black', fade: r.fade || 0, flash: r.flash || 0, overlay: !!r.overlay };
  }

  return { apply, shots };
}
