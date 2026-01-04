// Bidnam Lee - Strategic Terrain Navigation
// Three.js 3D terrain with interactive peaks

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
  targetTerrainOffsetY = -1.0 + (0 - (-1.0)) * t;  // -1.0 → 0
}

updateCameraTargetForViewport();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Lighting for flat shading
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(3, 8, 5);
scene.add(directionalLight);

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
  work: { x: 0.0, z: 0.0, height: 2.0, radius: 0.7 },        // Center (tallest)
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

// Create terrain with very low segments for chunky angular facets
const terrainSize = 5.0;
const segments = 11;  // Chunky Firewatch-style triangles
const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
geometry.rotateX(-Math.PI / 2);

const positions = geometry.attributes.position.array;

// Add vertex jitter to break uniform grid pattern for authentic low-poly look
const jitterAmount = 0.18;
const halfSize = terrainSize / 2;
const edgeThreshold = halfSize * 0.85;
for (let i = 0; i < positions.length; i += 3) {
  const x = positions[i];
  const z = positions[i + 2];
  // Skip edge vertices to maintain clean terrain boundary
  if (Math.abs(x) < edgeThreshold && Math.abs(z) < edgeThreshold) {
    positions[i] += (Math.random() - 0.5) * jitterAmount;     // X jitter
    positions[i + 2] += (Math.random() - 0.5) * jitterAmount; // Z jitter
  }
}

// Square pyramid peak - Chebyshev distance for flat-faced geometry
function mountainPeak(x, z, peak) {
  const dx = x - peak.x;
  const dz = z - peak.z;
  const dist = Math.max(Math.abs(dx), Math.abs(dz));  // Square base
  const radius = peak.radius;

  if (dist > radius) return 0;

  // Linear falloff creates sharp pyramid shape
  const h = peak.height * (1 - dist / radius);

  return Math.max(0, h);
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
  const ridgeWidth = 0.25;
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

// Apply heights
for (let i = 0; i < positions.length; i += 3) {
  const x = positions[i];
  const z = positions[i + 2];

  let height = baseNoise(x, z);
  height += valley(x, z);

  // Add all peaks with organic mountain shape
  allPeaks.forEach(peak => {
    height += mountainPeak(x, z, peak);
  });

  // Add ridgelines connecting to central Work peak
  height += ridgeline(x, z, mainPeaks.work, mainPeaks.about, 0.12);
  height += ridgeline(x, z, mainPeaks.work, mainPeaks.explorations, 0.1);
  height += ridgeline(x, z, mainPeaks.work, mainPeaks.contact, 0.08);

  positions[i + 1] = height;
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
const introDuration = 1.8;  // seconds
const introStartTime = performance.now();
let introComplete = false;
let labelsRevealed = false;

// Compute normals for geometric look
geometry.computeVertexNormals();

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
    uHoveredPeak: { value: new THREE.Vector3(999, 999, 999) }
  },
  vertexShader: `
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vHeight;

    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
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

    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vHeight;

    // Hash function for procedural grain
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      // 4-color elevation gradient: yellow -> tan -> sage -> forest
      float t = smoothstep(uMinHeight, uMaxHeight, vHeight);

      vec3 baseColor;
      if (t < 0.25) {
        // Pale sage to medium green
        baseColor = mix(uColorLow, uColorLowMid, t / 0.25);
      } else if (t < 0.5) {
        // Medium green to forest green
        baseColor = mix(uColorLowMid, uColorMid, (t - 0.25) / 0.25);
      } else {
        // Forest green to deep dark green
        baseColor = mix(uColorMid, uColorHigh, (t - 0.5) / 0.5);
      }

      // Subtle contour lines based on elevation
      float contour = abs(fract(vHeight / 0.2) - 0.5) * 2.0;
      float contourLine = smoothstep(0.88, 0.95, contour);
      baseColor = mix(baseColor, baseColor * 0.85, contourLine * 0.2);

      // Subtle grain texture
      float grain = hash(vPosition.xz * 12.0);
      baseColor = baseColor * (1.0 - grain * 0.06);

      // Clean flat shading lighting
      vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
      float diffuse = max(dot(vNormal, lightDir), 0.0);
      float ambient = 0.55;
      float lighting = ambient + diffuse * 0.45;

      // Hover glow
      float distToHover = length(vPosition.xz - uHoveredPeak.xz);
      float glow = smoothstep(0.6, 0.0, distToHover) * 0.7;
      vec3 glowColor = mix(baseColor, uColorAccent, glow);

      gl_FragColor = vec4(glowColor * lighting, 1.0);
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
  let height = baseNoise(x, z);
  height += valley(x, z);
  allPeaks.forEach(p => {
    height += mountainPeak(x, z, p);
  });
  height += ridgeline(x, z, mainPeaks.work, mainPeaks.about, 0.12);
  height += ridgeline(x, z, mainPeaks.work, mainPeaks.explorations, 0.1);
  height += ridgeline(x, z, mainPeaks.work, mainPeaks.contact, 0.08);
  return height;
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

function onDragStart(clientX, clientY) {
  isDragging = true;
  dragStart = { x: clientX, y: clientY };
  dragRotationStart = { x: baseRotation.x, y: baseRotation.y };
  document.body.classList.add('dragging');
  lastInteractionTime = Date.now();
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
    baseRotation.y = dragRotationStart.y + deltaX * 0.005;
    // Vertical rotation with ±20° constraint
    const verticalRotation = dragRotationStart.x + deltaY * 0.003;
    baseRotation.x = Math.max(-0.35, Math.min(0.35, verticalRotation));
    lastInteractionTime = Date.now();
  }
}

function onDragEnd() {
  isDragging = false;
  document.body.classList.remove('dragging');
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

    // Label positioned so line is ~40px
    const labelHeight = 28;
    const lineLength = 40;
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
  if (isDragging || !introComplete || !hasMouseMoved) return;

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
  hoveredPeak = peakName;
  const peak = peakData[peakName];

  terrainMaterial.uniforms.uHoveredPeak.value.set(peak.x, peak.actualHeight, peak.z);

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

let time = 0;
const autoRotateSpeed = -0.0006;
const idleThreshold = 3000;

function animate() {
  requestAnimationFrame(animate);

  time += 0.01;

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
    geometry.computeVertexNormals();

    // Show labels at 80%
    if (introProgress >= 0.8 && !labelsRevealed) {
      revealLabels();
    }

    if (introProgress >= 1) {
      introComplete = true;
    }
  }

  const timeSinceInteraction = Date.now() - lastInteractionTime;
  if (timeSinceInteraction > idleThreshold && !isDragging) {
    baseRotation.y += autoRotateSpeed;
  }

  // Combine base rotation (from drag) with mouse parallax offset
  const targetX = baseRotation.x + mouseOffset.x;
  const targetY = baseRotation.y + mouseOffset.y;

  currentRotation.x += (targetX - currentRotation.x) * 0.05;
  currentRotation.y += (targetY - currentRotation.y) * 0.05;

  terrainGroup.rotation.x = currentRotation.x;
  terrainGroup.rotation.y = currentRotation.y;

  // Smooth camera position interpolation for responsive sizing
  camera.position.y += (targetCameraY - camera.position.y) * 0.05;
  camera.position.z += (targetCameraZ - camera.position.z) * 0.05;

  // Smooth terrain offset interpolation (pushes terrain down on small screens)
  currentTerrainOffsetY += (targetTerrainOffsetY - currentTerrainOffsetY) * 0.05;

  // Combine gentle float animation with responsive offset
  terrainGroup.position.y = Math.sin(time * 0.4) * 0.06 + currentTerrainOffsetY;

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
