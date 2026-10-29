import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

// Screen-space light shafts: radial blur of bright pixels toward the sun.
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uThreshold: { value: 1.5 },
    uDensity: { value: 0.9 },
    uDecay: { value: 0.965 },
    uTint: { value: new THREE.Color(1.0, 0.75, 0.5) },
  },
  vertexShader: VS,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uStrength, uThreshold, uDensity, uDecay; uniform vec3 uTint;
    varying vec2 vUv;
    #define SAMPLES 48
    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (uStrength <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 delta = (vUv - uSun) * uDensity / float(SAMPLES);
      vec2 c = vUv; float w = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        c -= delta;
        vec3 s = texture2D(tDiffuse, clamp(c, 0.0, 1.0)).rgb;
        float l = max(max(s.r, max(s.g, s.b)) - uThreshold, 0.0);
        acc += s * (l / (l + 2.0)) * w;
        w *= uDecay;
      }
      gl_FragColor = vec4(base + acc * uTint * uStrength / float(SAMPLES), 1.0);
    }`,
};

// Anamorphic horizontal lens streaks (threshold -> wide horizontal blur -> add tinted)
class StreakPass extends Pass {
  constructor() {
    super();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, opts);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, opts);
    this.quad = new FullScreenQuad();
    this.strength = 0.5;
    this.threshold = 3.0;
    this.tint = new THREE.Color(0.35, 0.55, 1.0);
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 3 } },
      vertexShader: VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold * 4.0, l), 1.0); }`,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 } },
      vertexShader: VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uStep; varying vec2 vUv;
        void main(){ vec3 c = vec3(0.0); float ws = 0.0;
          for (int i = -5; i <= 5; i++) { float fi = float(i); float w = exp(-fi * fi / 10.0);
            c += texture2D(tDiffuse, vUv + vec2(fi * uStep * uTexel.x, 0.0)).rgb * w; ws += w; }
          gl_FragColor = vec4(c / ws, 1.0); }`,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tStreak: { value: null }, uStrength: { value: 0 }, uTint: { value: this.tint } },
      vertexShader: VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, tStreak; uniform float uStrength; uniform vec3 uTint; varying vec2 vUv;
        void main(){ vec3 b = texture2D(tDiffuse, vUv).rgb; vec3 s = texture2D(tStreak, vUv).rgb;
          float l = dot(s, vec3(0.33));
          gl_FragColor = vec4(b + (uTint * l * 1.6 + s * 0.25) * uStrength, 1.0); }`,
    });
  }
  setSize(w, h) {
    this.rtA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 1));
    this.rtB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 1));
  }
  render(renderer, writeBuffer, readBuffer) {
    const w = this.rtA.width;
    this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.brightMat.uniforms.uThreshold.value = this.threshold;
    this.quad.material = this.brightMat;
    renderer.setRenderTarget(this.rtA);
    this.quad.render(renderer);
    this.blurMat.uniforms.uTexel.value.set(1 / w, 0);
    let src = this.rtA, dst = this.rtB;
    for (const step of [1, 3, 9, 27]) {
      this.blurMat.uniforms.tDiffuse.value = src.texture;
      this.blurMat.uniforms.uStep.value = step;
      this.quad.material = this.blurMat;
      renderer.setRenderTarget(dst);
      this.quad.render(renderer);
      [src, dst] = [dst, src];
    }
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.compMat.uniforms.tStreak.value = src.texture;
    this.compMat.uniforms.uStrength.value = this.strength;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// Display-space finishing: aberration, grade, vignette, grain, fades.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uCA: { value: 0.6 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.045 },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uRes: { value: new THREE.Vector2(1920, 800) },
  },
  vertexShader: VS,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uFade, uFlash, uCA, uVignette, uGrain, uContrast, uSaturation;
    uniform vec3 uLift, uGain; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(uRes.x / uRes.y, 1.0), d * vec2(uRes.x / uRes.y, 1.0));
      vec2 off = d * uCA * 0.012 * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      // grade (display space)
      col = col * uGain + uLift * (1.0 - col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      // vignette (elliptical, matched to scope)
      float v = smoothstep(1.25, 0.25, length(d * vec2(1.25, 1.9)));
      col *= mix(1.0, v, uVignette);
      // flash then fade
      col = mix(col, vec3(1.0, 0.98, 0.95), clamp(uFlash, 0.0, 1.0));
      col *= 1.0 - clamp(uFade, 0.0, 1.0);
      // grain (luma-weighted, animated)
      float g = hash(floor(vUv * uRes) + fract(uTime * 7.31) * 517.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - l));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(renderer, width, height, pixelRatio) {
  const target = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  const scenePass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const overlayPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  overlayPass.clear = false;
  const godRays = new ShaderPass(GodRaysShader);
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.8, 0.6, 1.0);
  const streak = new StreakPass();
  const output = new OutputPass();
  const final = new ShaderPass(FinalShader);

  composer.addPass(scenePass);
  composer.addPass(overlayPass);
  composer.addPass(godRays);
  composer.addPass(bloom);
  composer.addPass(streak);
  composer.addPass(output);
  composer.addPass(final);

  return {
    composer,
    scenePass,
    overlayPass,
    godRays,
    bloom,
    streak,
    final,
    setSize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      final.uniforms.uRes.value.set(w * pr, h * pr);
    },
  };
}
