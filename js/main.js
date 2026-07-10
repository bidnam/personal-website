// Bidnam Lee - Strategic Terrain Navigation
// Three.js 3D terrain with interactive peaks
//
// The scene runs on a real sun: its position follows the visitor's local
// time (dev override: ?sun=13.5), light warms as it drops toward the
// horizon, peaks self-shadow via an analytic raymarch, and fog behaves
// like weather. The GLSL height function below mirrors dynamicHeight() —
// if one changes, change both.

import * as THREE from 'three';

// Keep legacy (r128-era) color behavior: hex colors pass to the custom
// shader untransformed.
THREE.ColorManagement.enabled = false;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Touch device detection (also drives quality tier)
const isTouchDevice = 'ontouchstart' in window;

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xF8F6F1);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 4.0, 7.5);
camera.lookAt(0, 0, 0);

// Responsive camera and terrain positioning (continuous scaling)
let targetCameraY = 4.0;
let targetCameraZ = 7.5;
let targetTerrainOffsetY = 0;
let currentTerrainOffsetY = 0;

function updateCameraTargetForViewport() {
  const width = window.innerWidth;

  // Define range: 320px (smallest mobile) to 1200px (comfortable desktop)
  const minWidth = 320;
  const maxWidth = 1200;

  // Clamp and normalize to 0-1 (0 = small screen, 1 = large screen)
  const t = Math.max(0, Math.min(1, (width - minWidth) / (maxWidth - minWidth)));

  // Lerp camera position: small screen pulls back, large screen closer
  targetCameraY = 6.0 + (4.0 - 6.0) * t;   // 6.0 → 4.0
  targetCameraZ = 13.0 + (7.5 - 13.0) * t; // 13.0 → 7.5

  // Push terrain down on smaller screens to make room for header
  targetTerrainOffsetY = -2.0 + (0 - (-2.0)) * t;  // -2.0 → 0 (more offset on mobile)
}

updateCameraTargetForViewport();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Simplex-like noise function for organic variation
function noise2D(x, z, seed = 0) {
  const n = Math.sin(x * 1.7 + seed) * Math.cos(z * 2.3 + seed * 0.7) +
            Math.sin(x * 3.1 + z * 1.9 + seed * 1.3) * 0.5 +
            Math.sin(x * 5.3 - z * 4.1 + seed * 2.1) * 0.25;
  return n / 1.75;  // Normalize roughly to -1 to 1
}

// Main labeled peaks - Work in center, others distributed around
const mainPeaks = {
  about: { x: -1.5, z: -1.2, height: 1.4, radius: 0.65 },    // Back-left (larger radius)
  work: { x: 0.0, z: 0.0, height: 2.15, radius: 0.7 },        // Center (tallest)
  explorations: { x: 1.5, z: -1.0, height: 1.3, radius: 0.6 },    // Back-right
  contact: { x: -1.2, z: 1.4, height: 1.1, radius: 0.55 }    // Front-left
};

// Smaller peaks scattered across terrain
const smallPeaks = [
  { x: 1.3, z: 1.2, height: 0.6, radius: 0.35 },    // Front-right
  { x: -0.3, z: -1.6, height: 0.5, radius: 0.32 },  // Back-center
  { x: 1.7, z: 0.3, height: 0.45, radius: 0.3 },    // Right edge
  { x: -1.7, z: -0.2, height: 0.4, radius: 0.28 },  // Left edge
  { x: 0.6, z: 1.6, height: 0.35, radius: 0.26 }    // Front edge
];

const allPeaks = [...Object.values(mainPeaks), ...smallPeaks];
const peakNames = ['about', 'work', 'explorations', 'contact'];

// Competitor peaks — ambient small peaks that rise/fall over time
const competitorSeeds = [
  { x: -0.9, z: 0.9,  baseH: 0.18, maxH: 0.55, phase: 0.0, radius: 0.26 },
  { x:  0.8, z: -1.7, baseH: 0.12, maxH: 0.45, phase: 1.3, radius: 0.24 },
  { x:  2.0, z: 1.4,  baseH: 0.08, maxH: 0.42, phase: 2.1, radius: 0.22 },
  { x: -2.0, z: 1.2,  baseH: 0.15, maxH: 0.50, phase: 3.4, radius: 0.24 }
];

// Terrain mesh — denser grid for finer silhouettes and shadow detail,
// still flat-shaded facets. Touch devices get a lighter grid.
const terrainSize = 5.0;
const segments = isTouchDevice ? 48 : 96;
const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
geometry.rotateX(-Math.PI / 2);

const positions = geometry.attributes.position.array;

// Add vertex jitter to break uniform grid pattern for authentic low-poly look
const jitterAmount = 0.08 * (32 / segments);  // scale with density
const halfSize = terrainSize / 2;
const edgeThreshold = halfSize * 0.85;
// Preserve base (x,z) after jitter so we can recompute heights each frame
const baseXZ = new Float32Array(positions.length / 3 * 2);
for (let i = 0; i < positions.length; i += 3) {
  const x = positions[i];
  const z = positions[i + 2];
  if (Math.abs(x) < edgeThreshold && Math.abs(z) < edgeThreshold) {
    positions[i] += (Math.random() - 0.5) * jitterAmount;
    positions[i + 2] += (Math.random() - 0.5) * jitterAmount;
  }
  baseXZ[(i/3)*2]     = positions[i];
  baseXZ[(i/3)*2 + 1] = positions[i + 2];
}

// ---- Range construction (mirrored in GLSL terrainH) ----
// Mountains are a SYSTEM, not placed cones:
//   1. uplift masses around each anchor (smooth gaussians)
//   2. ridged relief — folded noise whose creases are colliding slopes —
//      scaled by uplift, so crags live on the ranges and plains stay calm
//   3. summits as elongated arête segments: high points ON ridges

// Folded noise: creases along the zero-contours read as arêtes
function ridgedField(x, z) {
  const n1 = Math.sin(x * 1.6 + 0.8) * Math.cos(z * 1.3 - 0.4);
  const n2 = Math.sin(x * 2.9 - 1.2 + z * 0.8) * Math.cos(z * 2.5 + 0.6 - x * 0.5);
  return 0.6 * Math.pow(1.0 - Math.abs(n1), 1.6)
       + 0.4 * Math.pow(1.0 - Math.abs(n2), 1.6);
}

function upliftAt(x, z, cx, cz, R) {
  const dx = x - cx, dz = z - cz;
  return Math.exp(-(dx * dx + dz * dz) / (R * R));
}

// Elongated summit crest along a per-peak azimuth
function summitCrest(x, z, peak, h) {
  const dx = x - peak.x;
  const dz = z - peak.z;
  const theta = peak.x * 3.7 + peak.z * 2.3 + 0.9;
  const ct = Math.cos(theta), st = Math.sin(theta);
  const u = dx * ct + dz * st;    // along the crest
  const v = -dx * st + dz * ct;   // across it
  const rA = peak.radius * 1.6, rC = peak.radius * 0.55;
  const d = Math.sqrt((u * u) / (rA * rA) + (v * v) / (rC * rC));
  const t = 1.0 - d;
  if (t <= 0) return 0;
  return h * Math.pow(t, 1.35);
}

// Hover ripple state
const ripple = { active: false, x: 0, z: 0, radius: 0, fade: 0, startTime: 0 };

// Combined height function (living terrain + competitors + ripple)
function dynamicHeight(x, z, t) {
  let h = baseNoise(x, z) * 0.55;
  h += valley(x, z) * 0.7;

  // Uplift masses: main anchors, hills, breathing competitors
  let U = 0;
  U += 1.00 * upliftAt(x, z, 0.0, 0.0, 1.15);
  U += 0.72 * upliftAt(x, z, -1.5, -1.2, 1.05);
  U += 0.66 * upliftAt(x, z, 1.5, -1.0, 1.0);
  U += 0.56 * upliftAt(x, z, -1.2, 1.4, 0.92);
  U += 0.30 * upliftAt(x, z, 1.3, 1.2, 0.75);
  U += 0.25 * upliftAt(x, z, -0.3, -1.6, 0.7);
  U += 0.22 * upliftAt(x, z, 1.7, 0.3, 0.66);
  U += 0.20 * upliftAt(x, z, -1.7, -0.2, 0.62);
  U += 0.17 * upliftAt(x, z, 0.6, 1.6, 0.57);
  for (let i = 0; i < competitorSeeds.length; i++) {
    const c = competitorSeeds[i];
    const osc = 0.5 + 0.5 * Math.sin(t * 0.25 + c.phase);
    U += (c.baseH + (c.maxH - c.baseH) * osc) * 0.9 * upliftAt(x, z, c.x, c.z, 0.55);
  }

  // Mass + crags: relief scales with uplift
  h += U * 0.5;
  h += U * ridgedField(x, z) * 0.62;

  // Summits as arête segments, breathing like before
  Object.entries(mainPeaks).forEach(([name, peak]) => {
    const phase = peak.x * 1.3 + peak.z * 0.7;
    const crestH = peak.height * 0.58 + Math.sin(t * 0.4 + phase) * 0.08;
    h += summitCrest(x, z, peak, crestH);
  });

  // Connecting ridgelines — the masses read as one system
  h += ridgeline(x, z, mainPeaks.work, mainPeaks.about, 0.18);
  h += ridgeline(x, z, mainPeaks.work, mainPeaks.explorations, 0.15);
  h += ridgeline(x, z, mainPeaks.work, mainPeaks.contact, 0.12);
  if (ripple.active) {
    const dx = x - ripple.x, dz = z - ripple.z;
    const d = Math.sqrt(dx*dx + dz*dz);
    const ringWidth = 0.45;
    const dist = Math.abs(d - ripple.radius);
    if (dist < ringWidth) {
      const fall = 1 - (dist / ringWidth);
      h += Math.cos((dist / ringWidth) * Math.PI * 0.5) * 0.32 * fall * ripple.fade;
    }
  }
  return h;
}

// Ridgeline connecting two peaks
function ridgeline(x, z, peak1, peak2, ridgeHeight) {
  const dx = peak2.x - peak1.x;
  const dz = peak2.z - peak1.z;
  const len = Math.sqrt(dx * dx + dz * dz);

  // Project point onto line segment
  const t = Math.max(0, Math.min(1, ((x - peak1.x) * dx + (z - peak1.z) * dz) / (len * len)));
  const projX = peak1.x + t * dx;
  const projZ = peak1.z + t * dz;

  // Distance from point to ridge line
  const distToRidge = Math.sqrt((x - projX) * (x - projX) + (z - projZ) * (z - projZ));

  // Ridge profile — falloff perpendicular to the line
  const ridgeWidth = 0.3;
  const ridge = ridgeHeight * Math.exp(-(distToRidge * distToRidge) / (2 * ridgeWidth * ridgeWidth));

  // Taper at endpoints
  const endTaper = Math.sin(t * Math.PI);

  return ridge * endTaper;
}

// Rugged base terrain with angular variation
function baseNoise(x, z) {
  let n = 0;
  // Multiple frequencies for rugged textured feel
  n += Math.sin(x * 0.9) * Math.cos(z * 0.8) * 0.22;
  n += Math.sin(x * 1.8 + 0.5) * Math.cos(z * 1.5) * 0.14;
  n += Math.sin(x * 2.5 - 0.3) * Math.cos(z * 2.2 + 0.7) * 0.1;
  // Higher frequency detail for texture
  n += Math.sin(x * 4.0 + 1.2) * Math.cos(z * 3.8 - 0.5) * 0.06;
  n += Math.sin(x * 5.5 - 0.8) * Math.cos(z * 5.2 + 1.1) * 0.04;
  return n;
}

// Multiple valley depressions for rugged landscape
function valley(x, z) {
  let v = 0;
  // Main valleys
  v += Math.max(0, -Math.sin(x * 0.9 + 0.3) * Math.cos(z * 0.7) * 0.35);
  v += Math.max(0, -Math.sin(x * 1.3 - 0.5) * Math.cos(z * 1.1 + 0.4) * 0.25);
  v += Math.max(0, -Math.cos(x * 0.6 + 0.8) * Math.sin(z * 0.8) * 0.2);
  // Deeper gorges
  v += Math.max(0, -Math.sin(x * 1.8) * Math.cos(z * 1.6) * 0.15);
  return -v;
}

// Apply heights (same system as the per-frame loop, at t=0)
for (let i = 0; i < positions.length; i += 3) {
  positions[i + 1] = dynamicHeight(positions[i], positions[i + 2], 0);
}

// Store target heights for intro animation, then reset to flat
const targetHeights = [];
for (let i = 0; i < positions.length; i += 3) {
  targetHeights.push(positions[i + 1]);  // Store target Y
  positions[i + 1] = 0;  // Start flat
}
geometry.attributes.position.needsUpdate = true;

// Intro animation state
let introProgress = 0;
const introDuration = prefersReducedMotion ? 0.001 : 1.8;  // seconds
const introStartTime = performance.now();
let introComplete = false;
let labelsRevealed = false;

// Normals unused — the shader derives true face normals per fragment

// ----- The sun -----
// Anchored to the visitor's local time, clamped to a dawn–dusk band so
// night visitors get long evening light rather than darkness.
// Dev override: ?sun=14.25 (hours).
const sunParams = new URLSearchParams(window.location.search);
const devSunHours = sunParams.has('sun') ? parseFloat(sunParams.get('sun')) : null;

const sunState = {
  dirWorld: new THREE.Vector3(0.5, 1.0, 0.3).normalize(),
  dirLocal: new THREE.Vector3(0.5, 1.0, 0.3).normalize(),
  color: new THREE.Color(1, 1, 1),
  warmth: 0
};

const SUN_WARM = new THREE.Color(1.0, 0.80, 0.60);   // low-angle gold
const SUN_NEUTRAL = new THREE.Color(1.0, 0.985, 0.955);

function updateSun(t) {
  let hours;
  if (devSunHours != null) {
    hours = devSunHours;
  } else {
    const now = new Date();
    hours = now.getHours() + now.getMinutes() / 60;
  }

  // Map 5:30–18:30 onto the arc; clamp so night reads as late dusk
  const dayT = Math.max(0.05, Math.min(0.95, (hours - 5.5) / 13.0));

  // Azimuth sweeps east → west across the back of the scene, with a slow
  // drift so the light never fully stills
  const azimuth = (dayT - 0.5) * Math.PI * 1.15 + Math.sin(t * 0.03) * 0.1;

  // Elevation: low at the band edges, capped below ~47° at midday so
  // the relief never flattens under an overhead sun
  const elevAngle = 0.14 + Math.sin(dayT * Math.PI) * 0.68;  // radians

  const y = Math.sin(elevAngle);
  const r = Math.cos(elevAngle);
  const x = Math.sin(azimuth) * r;
  const z = Math.cos(azimuth) * r * 0.5 + 0.4;  // bias toward camera side

  sunState.dirWorld.set(x, y, z).normalize();

  // Warmth rises as the sun drops
  sunState.warmth = 1.0 - THREE.MathUtils.smoothstep(elevAngle, 0.32, 0.78);
  sunState.color.copy(SUN_NEUTRAL).lerp(SUN_WARM, sunState.warmth);
}
updateSun(0);

// Green (peaks) to Yellow (valleys) gradient
const terrainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uColorLow: { value: new THREE.Color(0x8FBC8F) },       // Pale sage (lowest)
    uColorLowMid: { value: new THREE.Color(0x5A9E5A) },   // Medium green
    uColorMid: { value: new THREE.Color(0x3D7A3D) },      // Forest green
    uColorHigh: { value: new THREE.Color(0x1A4D2E) },     // Deep dark green (peaks)
    uColorAccent: { value: new THREE.Color(0xC17F59) },   // Terracotta for hover
    uMinHeight: { value: -0.3 },
    uMaxHeight: { value: 1.8 },
    uHoveredPeak: { value: new THREE.Vector3(999, 999, 999) },
    uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },  // terrain-local
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunWarmth: { value: 0.0 },
    uColorFog: { value: new THREE.Color(0xF8F6F1) },
    uFog: { value: 0.0 },
    uFogHeight: { value: 0.8 },
    uFogDensity: { value: 1.3 },
    uTime: { value: 0.0 },
    uIntro: { value: 0.0 },
    uGlintStart: { value: -10.0 },
    uRipple: { value: new THREE.Vector4(0, 0, 0, 0) },   // x, z, radius, fade
    uShadowSteps: { value: isTouchDevice ? 6 : 12 }
  },
  vertexShader: `
    varying vec3 vPosition;
    varying float vHeight;

    void main() {
      vPosition = position;
      vHeight = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorLow;
    uniform vec3 uColorLowMid;
    uniform vec3 uColorMid;
    uniform vec3 uColorHigh;
    uniform vec3 uColorAccent;
    uniform float uMinHeight;
    uniform float uMaxHeight;
    uniform vec3 uHoveredPeak;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uSunWarmth;
    uniform vec3 uColorFog;
    uniform float uFog;
    uniform float uFogHeight;
    uniform float uFogDensity;
    uniform float uTime;
    uniform float uIntro;
    uniform float uGlintStart;
    uniform vec4 uRipple;
    uniform float uShadowSteps;

    varying vec3 vPosition;
    varying float vHeight;

    // Hash function for procedural grain
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Value noise + fbm for weather fog
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      v += vnoise(p) * 0.5;
      v += vnoise(p * 2.03) * 0.25;
      v += vnoise(p * 4.11) * 0.125;
      return v / 0.875;
    }

    // ---- Analytic terrain height (mirrors dynamicHeight in JS) ----
    float ridgedF(vec2 p) {
      float n1 = sin(p.x * 1.6 + 0.8) * cos(p.y * 1.3 - 0.4);
      float n2 = sin(p.x * 2.9 - 1.2 + p.y * 0.8) * cos(p.y * 2.5 + 0.6 - p.x * 0.5);
      return 0.6 * pow(1.0 - abs(n1), 1.6) + 0.4 * pow(1.0 - abs(n2), 1.6);
    }

    float upliftD(vec2 p, vec2 c, float R) {
      vec2 d = p - c;
      return exp(-dot(d, d) / (R * R));
    }

    float crestSeg(vec2 p, vec2 c, float radius, float height) {
      vec2 dv = p - c;
      float theta = c.x * 3.7 + c.y * 2.3 + 0.9;
      float ct = cos(theta), st = sin(theta);
      float u = dv.x * ct + dv.y * st;
      float v = -dv.x * st + dv.y * ct;
      float rA = radius * 1.6, rC = radius * 0.55;
      float d = sqrt((u * u) / (rA * rA) + (v * v) / (rC * rC));
      float t = 1.0 - d;
      if (t <= 0.0) return 0.0;
      return height * pow(t, 1.35);
    }

    float ridgeH(vec2 p, vec2 a, vec2 b, float h) {
      vec2 ab = b - a;
      float len2 = dot(ab, ab);
      float t = clamp(dot(p - a, ab) / len2, 0.0, 1.0);
      vec2 proj = a + t * ab;
      float d = length(p - proj);
      float w = 0.3;
      return h * exp(-(d * d) / (2.0 * w * w)) * sin(t * 3.14159265);
    }

    float terrainH(vec2 p) {
      float x = p.x, z = p.y;
      float h = 0.0;
      // base + valley, toned down so the ranges dominate
      h += (sin(x * 0.9) * cos(z * 0.8) * 0.22
          + sin(x * 1.8 + 0.5) * cos(z * 1.5) * 0.14
          + sin(x * 2.5 - 0.3) * cos(z * 2.2 + 0.7) * 0.1
          + sin(x * 4.0 + 1.2) * cos(z * 3.8 - 0.5) * 0.06
          + sin(x * 5.5 - 0.8) * cos(z * 5.2 + 1.1) * 0.04) * 0.55;
      h -= (max(0.0, -sin(x * 0.9 + 0.3) * cos(z * 0.7) * 0.35)
          + max(0.0, -sin(x * 1.3 - 0.5) * cos(z * 1.1 + 0.4) * 0.25)
          + max(0.0, -cos(x * 0.6 + 0.8) * sin(z * 0.8) * 0.2)
          + max(0.0, -sin(x * 1.8) * cos(z * 1.6) * 0.15)) * 0.7;
      // uplift masses (main, hills, breathing competitors)
      float U = 0.0;
      U += 1.00 * upliftD(p, vec2( 0.0,  0.0), 1.15);
      U += 0.72 * upliftD(p, vec2(-1.5, -1.2), 1.05);
      U += 0.66 * upliftD(p, vec2( 1.5, -1.0), 1.00);
      U += 0.56 * upliftD(p, vec2(-1.2,  1.4), 0.92);
      U += 0.30 * upliftD(p, vec2( 1.3,  1.2), 0.75);
      U += 0.25 * upliftD(p, vec2(-0.3, -1.6), 0.70);
      U += 0.22 * upliftD(p, vec2( 1.7,  0.3), 0.66);
      U += 0.20 * upliftD(p, vec2(-1.7, -0.2), 0.62);
      U += 0.17 * upliftD(p, vec2( 0.6,  1.6), 0.57);
      U += (0.18 + 0.37 * (0.5 + 0.5 * sin(uTime * 0.25)))       * 0.9 * upliftD(p, vec2(-0.9,  0.9), 0.55);
      U += (0.12 + 0.33 * (0.5 + 0.5 * sin(uTime * 0.25 + 1.3))) * 0.9 * upliftD(p, vec2( 0.8, -1.7), 0.55);
      U += (0.08 + 0.34 * (0.5 + 0.5 * sin(uTime * 0.25 + 2.1))) * 0.9 * upliftD(p, vec2( 2.0,  1.4), 0.55);
      U += (0.15 + 0.35 * (0.5 + 0.5 * sin(uTime * 0.25 + 3.4))) * 0.9 * upliftD(p, vec2(-2.0,  1.2), 0.55);
      // mass + crags: relief scales with uplift
      h += U * 0.5;
      h += U * ridgedF(p) * 0.62;
      // summit crests (breathing) — phase = x*1.3 + z*0.7
      h += crestSeg(p, vec2(-1.5, -1.2), 0.65, 1.4 * 0.58 + sin(uTime * 0.4 + (-1.5*1.3 + -1.2*0.7)) * 0.08);
      h += crestSeg(p, vec2( 0.0,  0.0), 0.70, 2.15 * 0.58 + sin(uTime * 0.4) * 0.08);
      h += crestSeg(p, vec2( 1.5, -1.0), 0.60, 1.3 * 0.58 + sin(uTime * 0.4 + (1.5*1.3 + -1.0*0.7)) * 0.08);
      h += crestSeg(p, vec2(-1.2,  1.4), 0.55, 1.1 * 0.58 + sin(uTime * 0.4 + (-1.2*1.3 + 1.4*0.7)) * 0.08);
      // connecting ridgelines
      h += ridgeH(p, vec2(0.0, 0.0), vec2(-1.5, -1.2), 0.18);
      h += ridgeH(p, vec2(0.0, 0.0), vec2( 1.5, -1.0), 0.15);
      h += ridgeH(p, vec2(0.0, 0.0), vec2(-1.2,  1.4), 0.12);
      // hover ripple
      if (uRipple.w > 0.0) {
        float d = length(p - uRipple.xy);
        float dist = abs(d - uRipple.z);
        if (dist < 0.45) {
          float fall = 1.0 - dist / 0.45;
          h += cos((dist / 0.45) * 1.5707963) * 0.32 * fall * uRipple.w;
        }
      }
      return h * uIntro;
    }

    // Soft shadow: march from the fragment toward the sun through the
    // analytic heightfield
    float sunShadow(vec3 p, vec3 sunDir) {
      float shadow = 1.0;
      // Dithered march start breaks step banding into imperceptible noise
      float t = 0.12 + hash(p.xz * 23.7) * 0.09;
      const int MAX_STEPS = 16;
      for (int i = 0; i < MAX_STEPS; i++) {
        if (float(i) >= uShadowSteps) break;
        vec3 sample_ = p + sunDir * t;
        if (sample_.y > 2.4) break;  // above any possible terrain
        float h = terrainH(sample_.xz);
        float gap = sample_.y - h;
        shadow = min(shadow, max(0.0, gap) * 3.5 / t);
        if (shadow < 0.02) break;
        t += 0.22;
      }
      return clamp(shadow, 0.0, 1.0);
    }

    void main() {
      // True face normal from screen-space derivatives — honest flat
      // shading at any mesh density (terrain-local space)
      vec3 n = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
      if (n.y < 0.0) n = -n;

      // 4-color elevation gradient
      float t = smoothstep(uMinHeight, uMaxHeight, vHeight);

      vec3 baseColor;
      if (t < 0.25) {
        baseColor = mix(uColorLow, uColorLowMid, t / 0.25);
      } else if (t < 0.5) {
        baseColor = mix(uColorLowMid, uColorMid, (t - 0.25) / 0.25);
      } else {
        baseColor = mix(uColorMid, uColorHigh, (t - 0.5) / 0.5);
      }

      // Slope tint — steeper faces read slightly rockier
      float slope = 1.0 - clamp(n.y, 0.0, 1.0);
      float rock = smoothstep(0.45, 0.8, slope) * 0.22;
      baseColor = mix(baseColor, vec3(0.42, 0.45, 0.38), rock);

      // Subtle contour lines based on elevation
      float contour = abs(fract(vHeight / 0.2) - 0.5) * 2.0;
      float contourLine = smoothstep(0.88, 0.95, contour);
      baseColor = mix(baseColor, baseColor * 0.85, contourLine * 0.2);

      // Subtle grain texture
      float grain = hash(vPosition.xz * 12.0);
      baseColor = baseColor * (1.0 - grain * 0.06);

      // ---- Sunlight: local-space diffuse + raymarched soft shadow ----
      vec3 sunDir = normalize(uSunDir);
      float diffuse = max(dot(n, sunDir), 0.0);

      float shadow = 1.0;
      if (diffuse > 0.01 && uIntro > 0.85) {
        shadow = sunShadow(vec3(vPosition.x, vHeight + 0.02, vPosition.z), sunDir);
      }
      float lit = diffuse * shadow;

      // Alpenglow: low warm sun catches the high ground
      float alpen = uSunWarmth * smoothstep(uMaxHeight * 0.45, uMaxHeight, vHeight) * lit;
      baseColor = mix(baseColor, vec3(0.98, 0.62, 0.48), alpen * 0.28);

      // Ambient cools slightly inside shadow (sky light, no sun)
      vec3 ambientTint = mix(vec3(0.94, 0.97, 1.0), vec3(1.0), shadow * 0.5 + 0.5);
      vec3 lighting = ambientTint * 0.52 + uSunColor * lit * 0.48;

      // Hover: quiet persistent lift + a light-catch that sweeps once
      float distToHover = length(vPosition.xz - uHoveredPeak.xz);
      float hoverLift = smoothstep(0.6, 0.0, distToHover) * 0.22;
      vec3 shaded = mix(baseColor, uColorAccent, hoverLift) * lighting;

      float glintT = clamp((uTime - uGlintStart) / 1.4, 0.0, 1.0);
      float sweep = smoothstep(0.2, 0.0, abs(distToHover - glintT * 1.1)) * (1.0 - glintT);
      shaded += uSunColor * sweep * 0.22;

      vec3 finalColor = shaded;

      // Valley fog — weather-shaped mist pooling in the low ground
      if (uFog > 0.0) {
        float fogBand = 1.0 - smoothstep(-0.3, uFogHeight, vHeight);
        vec2 wind = vec2(uTime * 0.045, uTime * 0.018);
        float shape = fbm(vPosition.xz * 0.9 + wind);
        float weather = 0.62 + 0.38 * sin(uTime * 0.016 + fbm(vPosition.xz * 0.13) * 3.0);
        float fogAmount = fogBand * uFog * mix(0.35, 1.3, shape) * weather;
        vec3 fogCol = mix(uColorFog, vec3(1.0, 0.87, 0.72), uSunWarmth * 0.22);
        finalColor = mix(finalColor, fogCol, clamp(fogAmount * uFogDensity, 0.0, 0.95));
      }

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
  side: THREE.DoubleSide,
  flatShading: true
});

const terrain = new THREE.Mesh(geometry, terrainMaterial);

const terrainGroup = new THREE.Group();
terrainGroup.add(terrain);
scene.add(terrainGroup);

// Calculate actual peak heights (same logic as terrain generation)
const peakData = {};
function getHeightAt(x, z) {
  return dynamicHeight(x, z, 0);
}

Object.entries(mainPeaks).forEach(([name, peak]) => {
  const actualHeight = getHeightAt(peak.x, peak.z);
  peakData[name] = { ...peak, actualHeight };
});

// Interaction state
const mouse = { x: 0, y: 0 };
const baseRotation = { x: 0, y: -0.35 };  // Start rotated 20° clockwise
const mouseOffset = { x: 0, y: 0 };       // Subtle parallax from mouse
const currentRotation = { x: 0, y: 0 };
let isDragging = false;
let hasMouseMoved = false;  // Don't check hover until mouse actually moves
let dragStart = { x: 0, y: 0 };
let dragRotationStart = { x: 0, y: 0 };
let lastInteractionTime = Date.now();
let selectedPeakIndex = -1;

// Drag inertia — released momentum settles like mass
let spinVelocity = 0;
let lastDragY = 0;
let lastDragTime = 0;

const dragSensitivityX = isTouchDevice ? 0.008 : 0.005;  // Looser on mobile
const dragSensitivityY = isTouchDevice ? 0.005 : 0.003;

// Initial faster auto-rotate (slows after first interaction)
let initialPhase = true;
const initialAutoRotateSpeed = -0.002;
const normalAutoRotateSpeed = isTouchDevice ? -0.0012 : -0.0006;  // Faster on mobile

// Track manual peak selection via arrows (prevents hover clearing)
let manualPeakSelection = false;

function onDragStart(clientX, clientY) {
  isDragging = true;
  dragStart = { x: clientX, y: clientY };
  dragRotationStart = { x: baseRotation.x, y: baseRotation.y };
  document.body.classList.add('dragging');
  lastInteractionTime = Date.now();
  manualPeakSelection = false;  // Clear manual selection when dragging
  spinVelocity = 0;
  lastDragY = baseRotation.y;
  lastDragTime = performance.now();
}

function onDragMove(clientX, clientY) {
  hasMouseMoved = true;
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = (clientY / window.innerHeight) * 2 - 1;

  if (!isDragging) {
    // Subtle parallax effect on top of base rotation
    mouseOffset.x = mouse.y * 0.06;
    mouseOffset.y = mouse.x * 0.08;
  } else {
    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;
    baseRotation.y = dragRotationStart.y + deltaX * dragSensitivityX;
    // Vertical rotation with ±20° constraint
    const verticalRotation = dragRotationStart.x + deltaY * dragSensitivityY;
    baseRotation.x = Math.max(-0.35, Math.min(0.35, verticalRotation));
    lastInteractionTime = Date.now();
    initialPhase = false;  // End initial fast rotation after first interaction

    // Track angular velocity for release inertia
    const nowT = performance.now();
    const dt = Math.max(1, nowT - lastDragTime);
    const v = (baseRotation.y - lastDragY) / dt * 16.7;  // per-frame velocity
    spinVelocity = spinVelocity * 0.7 + v * 0.3;
    lastDragY = baseRotation.y;
    lastDragTime = nowT;
  }
}

function onDragEnd() {
  isDragging = false;
  document.body.classList.remove('dragging');
  // Momentum carries only from a genuinely recent movement
  if (performance.now() - lastDragTime > 120) spinVelocity = 0;
}

document.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
document.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY));
document.addEventListener('mouseup', onDragEnd);
document.addEventListener('mouseleave', onDragEnd);

document.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) onDragStart(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1) onDragMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
document.addEventListener('touchend', onDragEnd);

const peakLabels = {};
document.querySelectorAll('.peak-label').forEach(el => {
  peakLabels[el.dataset.peak] = el;
});

const peakLines = {};
document.querySelectorAll('.peak-line').forEach(el => {
  peakLines[el.dataset.peak] = el;
});

// Mobile peak navigation arrows
const prevBtn = document.querySelector('.peak-nav-prev');
const nextBtn = document.querySelector('.peak-nav-next');
let mobilePeakIndex = -1;  // -1 = none selected

// Rotate terrain so selected peak faces the viewer
function rotateToPeak(peakName) {
  const peak = mainPeaks[peakName];
  if (!peak) return;

  // Calculate angle to rotate terrain so peak faces viewer (toward +z camera)
  const targetRotationY = -Math.atan2(peak.x, peak.z);
  baseRotation.y = targetRotationY;
}

// Left arrow → rotate counter-clockwise (increment through peaks)
prevBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  mobilePeakIndex = (mobilePeakIndex + 1) % peakNames.length;
  manualPeakSelection = true;
  const selectedPeak = peakNames[mobilePeakIndex];
  setHoveredPeak(selectedPeak);
  rotateToPeak(selectedPeak);
  lastInteractionTime = Date.now();
  initialPhase = false;
});

// Right arrow → rotate clockwise (decrement through peaks)
nextBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (mobilePeakIndex === -1) {
    mobilePeakIndex = peakNames.length - 1;  // Start at last
  } else {
    mobilePeakIndex = (mobilePeakIndex - 1 + peakNames.length) % peakNames.length;
  }
  manualPeakSelection = true;
  const selectedPeak = peakNames[mobilePeakIndex];
  setHoveredPeak(selectedPeak);
  rotateToPeak(selectedPeak);
  lastInteractionTime = Date.now();
  initialPhase = false;
});

// Make labels clickable on touch devices
if (isTouchDevice) {
  Object.entries(peakLabels).forEach(([name, el]) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToPeak(name);
    });
  });
}

const raycaster = new THREE.Raycaster();
let hoveredPeak = null;

function revealLabels() {
  labelsRevealed = true;
  document.querySelectorAll('.peak-label').forEach(el => {
    el.classList.add('visible');
  });
  document.querySelectorAll('.peak-line').forEach(el => {
    el.classList.add('visible');
  });
}

function updateLabelPositions() {
  // Ensure world matrix is up to date after rotation
  terrainGroup.updateMatrixWorld(true);

  // Collect peak screen data for z-sorting
  const peakScreenData = [];

  Object.entries(peakData).forEach(([name, peak]) => {
    const peakPos = new THREE.Vector3(peak.x, peak.actualHeight + 0.05, peak.z);
    peakPos.applyMatrix4(terrainGroup.matrixWorld);

    const peakScreen = peakPos.clone().project(camera);
    const peakX = (peakScreen.x * 0.5 + 0.5) * window.innerWidth;
    const peakY = (-peakScreen.y * 0.5 + 0.5) * window.innerHeight;
    const depth = peakScreen.z;  // Depth for z-sorting (closer = smaller)

    peakScreenData.push({ name, peakX, peakY, depth });
  });

  // Sort by depth (further away = higher z value = lower z-index)
  peakScreenData.sort((a, b) => b.depth - a.depth);

  // Apply positions and z-index based on depth order
  peakScreenData.forEach((data, index) => {
    const { name, peakX, peakY } = data;
    const labelEl = peakLabels[name];
    const lineEl = peakLines[name];
    if (!labelEl) return;

    // Label positioned with responsive line length
    const labelHeight = 28;
    const isMobile = window.innerWidth <= 480;
    const lineLength = isMobile ? 24 : 40;
    const labelY = peakY - lineLength - labelHeight;

    // Line connects bottom of label to peak
    const lineTop = labelY + labelHeight;
    const lineBottom = peakY;

    const zIndex = 20 + index;  // Further peaks get lower z-index

    labelEl.style.left = peakX + 'px';
    labelEl.style.top = labelY + 'px';
    labelEl.style.zIndex = zIndex;

    // Line between label and peak
    if (lineEl) {
      lineEl.setAttribute('x1', peakX);
      lineEl.setAttribute('y1', lineTop);
      lineEl.setAttribute('x2', peakX);
      lineEl.setAttribute('y2', lineBottom);
      lineEl.style.zIndex = zIndex;
    }
  });
}

function checkPeakHover() {
  // Skip hover check on touch devices with manual peak selection
  if (isDragging || !introComplete || !hasMouseMoved || manualPeakSelection) return;

  // Note: mouse.y needs to be negated for Three.js coordinate system
  raycaster.setFromCamera({ x: mouse.x, y: -mouse.y }, camera);
  const intersects = raycaster.intersectObject(terrain);

  if (intersects.length > 0) {
    // Transform intersection point from world space to local space
    const worldPoint = intersects[0].point.clone();
    const localPoint = worldPoint.clone();
    terrainGroup.worldToLocal(localPoint);

    let closestPeak = null;
    let closestDist = Infinity;

    Object.entries(mainPeaks).forEach(([name, peak]) => {
      const dx = localPoint.x - peak.x;
      const dz = localPoint.z - peak.z;
      const dist = Math.max(Math.abs(dx), Math.abs(dz));

      // Expanded radius + height check for better detection with jittered geometry
      const expandedRadius = peak.radius * 1.4;
      const isElevated = localPoint.y > 0.3;

      if (dist < expandedRadius && isElevated && dist < closestDist) {
        closestDist = dist;
        closestPeak = name;
      }
    });

    if (closestPeak) {
      if (hoveredPeak !== closestPeak) {
        setHoveredPeak(closestPeak);
        selectedPeakIndex = peakNames.indexOf(closestPeak);
      }
      document.body.style.cursor = 'pointer';
    } else {
      clearHover();
    }
  } else {
    clearHover();
  }
}

function setHoveredPeak(peakName) {
  const isNew = hoveredPeak !== peakName;
  hoveredPeak = peakName;
  const peak = peakData[peakName];

  terrainMaterial.uniforms.uHoveredPeak.value.set(peak.x, peak.actualHeight, peak.z);

  if (isNew && introComplete) {
    ripple.active = true;
    ripple.x = peak.x;
    ripple.z = peak.z;
    ripple.radius = 0.15;
    ripple.fade = 1.0;
    ripple.startTime = performance.now();
    // Light-catch sweep across the hovered peak
    terrainMaterial.uniforms.uGlintStart.value = time;
  }

  Object.entries(peakLabels).forEach(([name, el]) => {
    el.classList.toggle('active', name === peakName);
  });
  Object.entries(peakLines).forEach(([name, el]) => {
    el.classList.toggle('active', name === peakName);
  });
  document.querySelectorAll('.nav-label').forEach(el => {
    el.classList.toggle('active', el.dataset.peak === peakName);
  });
}

function clearHover() {
  if (hoveredPeak) {
    hoveredPeak = null;
    terrainMaterial.uniforms.uHoveredPeak.value.set(999, 999, 999);
    Object.values(peakLabels).forEach(el => el.classList.remove('active'));
    Object.values(peakLines).forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-label').forEach(el => el.classList.remove('active'));
  }
  if (!isDragging) document.body.style.cursor = 'grab';
}

document.querySelectorAll('.nav-label').forEach(btn => {
  btn.addEventListener('click', () => {
    const peakName = btn.dataset.peak;
    navigateToPeak(peakName);
  });
  btn.addEventListener('mouseenter', () => {
    const peakName = btn.dataset.peak;
    setHoveredPeak(peakName);
    selectedPeakIndex = peakNames.indexOf(peakName);
  });
  btn.addEventListener('mouseleave', () => {
    clearHover();
  });
});

// Click on peaks for navigation
function onPeakClick(e) {
  if (isDragging) return;

  const clickMouse = {
    x: (e.clientX / window.innerWidth) * 2 - 1,
    y: -(e.clientY / window.innerHeight) * 2 + 1
  };

  raycaster.setFromCamera(clickMouse, camera);
  const intersects = raycaster.intersectObject(terrain);

  if (intersects.length > 0) {
    const worldPoint = intersects[0].point.clone();
    const localPoint = worldPoint.clone();
    terrainGroup.worldToLocal(localPoint);

    let clickedPeak = null;
    let closestDist = Infinity;

    Object.entries(mainPeaks).forEach(([name, peak]) => {
      const dx = localPoint.x - peak.x;
      const dz = localPoint.z - peak.z;
      const dist = Math.max(Math.abs(dx), Math.abs(dz));
      const expandedRadius = peak.radius * 1.4;
      const isElevated = localPoint.y > 0.3;

      if (dist < expandedRadius && isElevated && dist < closestDist) {
        closestDist = dist;
        clickedPeak = name;
      }
    });

    if (clickedPeak) {
      navigateToPeak(clickedPeak);
    }
  }
}

document.addEventListener('click', onPeakClick);

let time = prefersReducedMotion ? 3.0 : 0;  // frozen at a good breathing pose
const idleThreshold = 3000;
const invQuat = new THREE.Quaternion();

function animate() {
  requestAnimationFrame(animate);

  if (!prefersReducedMotion) time += 0.01;

  // Intro animation: terrain grows from flat
  if (!introComplete) {
    const elapsed = (performance.now() - introStartTime) / 1000;
    introProgress = Math.min(elapsed / introDuration, 1);

    // Ease-out curve for natural deceleration
    const eased = 1 - Math.pow(1 - introProgress, 3);

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const targetY = targetHeights[i / 3];
      positions[i + 1] = targetY * eased;
    }
    geometry.attributes.position.needsUpdate = true;
    terrainMaterial.uniforms.uIntro.value = eased;

    // Show labels at 80%
    if (introProgress >= 0.8 && !labelsRevealed) {
      revealLabels();
    }

    if (introProgress >= 1) {
      introComplete = true;
      terrainMaterial.uniforms.uIntro.value = 1.0;
    }
  } else if (!prefersReducedMotion) {
    // Post-intro dynamic effects
    if (ripple.active) {
      const dt = (performance.now() - ripple.startTime) / 1000;
      ripple.radius = 0.15 + dt * 0.75;
      ripple.fade = Math.max(0, 1 - dt / 2.2);
      if (ripple.fade <= 0) ripple.active = false;
    }
    terrainMaterial.uniforms.uRipple.value.set(
      ripple.x, ripple.z, ripple.radius, ripple.active ? ripple.fade : 0
    );

    const pos = geometry.attributes.position.array;
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
      const x = baseXZ[j], z = baseXZ[j + 1];
      pos[i] = x; pos[i + 2] = z;
      pos[i + 1] = dynamicHeight(x, z, time);
    }
    geometry.attributes.position.needsUpdate = true;

    Object.entries(mainPeaks).forEach(([name, peak]) => {
      peakData[name].actualHeight = dynamicHeight(peak.x, peak.z, time);
    });
  }

  // The sun: local-time position, warm at low angles. The terrain
  // rotates under a world-fixed sun, so light and shadows hold their
  // bearing while you drag.
  updateSun(time);
  invQuat.copy(terrainGroup.quaternion).invert();
  sunState.dirLocal.copy(sunState.dirWorld).applyQuaternion(invQuat);
  terrainMaterial.uniforms.uSunDir.value.copy(sunState.dirLocal);
  terrainMaterial.uniforms.uSunColor.value.copy(sunState.color);
  terrainMaterial.uniforms.uSunWarmth.value = sunState.warmth;

  // Soft valley fog (target driven by tweak)
  const curFog = terrainMaterial.uniforms.uFog.value;
  const target = (window.fogSettings && typeof window.fogSettings.strength === 'number') ? window.fogSettings.strength : 0;
  terrainMaterial.uniforms.uFog.value = curFog + (target - curFog) * 0.04;
  terrainMaterial.uniforms.uTime.value = time;

  // Released drag momentum settles with damping
  if (!isDragging && Math.abs(spinVelocity) > 0.00004) {
    baseRotation.y += spinVelocity;
    spinVelocity *= 0.94;
  }

  const timeSinceInteraction = Date.now() - lastInteractionTime;
  if (!prefersReducedMotion && timeSinceInteraction > idleThreshold && !isDragging) {
    // Observer's drift, not a turntable: speed swells and eases, and the
    // viewpoint breathes vertically a little
    const rotateSpeed = initialPhase ? initialAutoRotateSpeed : normalAutoRotateSpeed;
    baseRotation.y += rotateSpeed * (0.55 + 0.45 * Math.sin(time * 0.05));
    const sway = 0.03 * Math.sin(time * 0.04);
    baseRotation.x += (sway - baseRotation.x) * 0.002;
  }

  // Combine base rotation (from drag) with mouse parallax offset
  const targetX = baseRotation.x + mouseOffset.x;
  const targetY = baseRotation.y + mouseOffset.y;

  currentRotation.x += (targetX - currentRotation.x) * 0.05;
  currentRotation.y += (targetY - currentRotation.y) * 0.05;

  terrainGroup.rotation.x = currentRotation.x;
  terrainGroup.rotation.y = currentRotation.y;

  // Smooth camera position interpolation, with a slow dolly breath
  const dolly = prefersReducedMotion ? 0 : Math.sin(time * 0.045) * 0.18;
  camera.position.y += (targetCameraY - camera.position.y) * 0.05;
  camera.position.z += ((targetCameraZ + dolly) - camera.position.z) * 0.05;

  // Smooth terrain offset interpolation (pushes terrain down on small screens)
  currentTerrainOffsetY += (targetTerrainOffsetY - currentTerrainOffsetY) * 0.05;

  // Combine gentle float animation with responsive offset
  const float = prefersReducedMotion ? 0 : Math.sin(time * 0.4) * 0.06;
  terrainGroup.position.y = float + currentTerrainOffsetY;

  updateLabelPositions();
  checkPeakHover();

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCameraTargetForViewport();
});

// Info panel toggle
const infoPanel = document.querySelector('.info-panel');
const infoPanelTab = document.querySelector('.info-panel-tab');
const infoPanelClose = document.querySelector('.info-panel-close');

infoPanelTab.addEventListener('click', (e) => {
  e.stopPropagation();
  infoPanel.classList.toggle('open');
});

infoPanelClose.addEventListener('click', (e) => {
  e.stopPropagation();
  infoPanel.classList.remove('open');
});

// Close when clicking outside
document.addEventListener('click', (e) => {
  if (infoPanel.classList.contains('open') &&
      !infoPanel.contains(e.target)) {
    infoPanel.classList.remove('open');
  }
});

// Page navigation with zoom + fade transition
function navigateToPeak(peakName) {
  const peak = peakData[peakName];
  if (!peak) return;

  // Create transition overlay
  const overlay = document.createElement('div');
  overlay.className = 'page-transition-overlay';
  document.body.appendChild(overlay);

  // Trigger camera zoom toward peak
  const zoomTarget = { x: peak.x * 0.5, y: peak.actualHeight + 2, z: peak.z * 0.5 };
  const zoomSpeed = 0.15;

  function animateZoom() {
    camera.position.x += (zoomTarget.x - camera.position.x) * zoomSpeed;
    camera.position.y += (zoomTarget.y - camera.position.y) * zoomSpeed;
    camera.position.z += (zoomTarget.z - camera.position.z) * zoomSpeed;
  }

  // Start zoom animation
  const zoomInterval = setInterval(animateZoom, 16);

  // Fade overlay in, then navigate
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    setTimeout(() => {
      clearInterval(zoomInterval);
      window.location.href = `${peakName}.html`;
    }, 400);
  });
}

// Reload page when restored from bfcache (back button) to ensure terrain initializes
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

// ----- Tweaks panel (fog sliders) -----
window.fogSettings = { ...(window.TWEAK_DEFAULTS || { fog_strength: 0, fog_height: 0.4, fog_density: 0.7 }) };
// Normalize key names
window.fogSettings = {
  strength: window.fogSettings.fog_strength,
  height:   window.fogSettings.fog_height,
  density:  window.fogSettings.fog_density
};

function applyFogSettings() {
  terrainMaterial.uniforms.uFogHeight.value = window.fogSettings.height;
  terrainMaterial.uniforms.uFogDensity.value = window.fogSettings.density;
  // strength is applied each frame via animate loop target
}
applyFogSettings();

function hydrateTweakUI() {
  document.querySelectorAll('.tweak-row input[type="range"]').forEach(input => {
    const key = input.dataset.key;
    const defaults = window.TWEAK_DEFAULTS || {};
    const initial = defaults[key];
    if (initial != null) input.value = initial;
    const label = document.querySelector(`[data-val="${key}"]`);
    if (label) label.textContent = Number(input.value).toFixed(2);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (label) label.textContent = v.toFixed(2);
      if (key === 'fog_strength') window.fogSettings.strength = v;
      if (key === 'fog_height')   window.fogSettings.height   = v;
      if (key === 'fog_density')  window.fogSettings.density  = v;
      applyFogSettings();
      // Persist
      try {
        window.parent.postMessage({
          type: '__edit_mode_set_keys',
          edits: {
            fog_strength: window.fogSettings.strength,
            fog_height:   window.fogSettings.height,
            fog_density:  window.fogSettings.density
          }
        }, '*');
      } catch (e) {}
    });
  });
}
hydrateTweakUI();

// Edit-mode protocol
window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || !d.type) return;
  const panel = document.getElementById('tweaks-panel');
  if (!panel) return;
  if (d.type === '__activate_edit_mode')   panel.classList.add('visible');
  if (d.type === '__deactivate_edit_mode') panel.classList.remove('visible');
});
try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
