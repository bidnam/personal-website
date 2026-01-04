// Immediately close menu on page load (prevents flash on back button)
(function() {
  const overlay = document.querySelector('.menu-overlay');
  const toggle = document.querySelector('.menu-toggle');
  const header = document.querySelector('.inner-header');
  if (overlay) overlay.style.transition = 'none';
  overlay?.classList.remove('active');
  toggle?.classList.remove('open');
  header?.classList.remove('menu-open');
  // Add menu-ready class - menu CSS requires this to show
  document.body.classList.add('menu-ready');
  requestAnimationFrame(() => {
    if (overlay) overlay.style.transition = '';
  });
})();

// Mini terrain for inner page header
const canvas = document.getElementById('mini-terrain');
let renderer, camera;  // Expose for menu resize

if (canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xF8F6F1);

  camera = new THREE.PerspectiveCamera(50, 100/65, 0.1, 100);
  camera.position.set(0, 3.2, 4.5);  // Pull back to show full rotation
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(100, 65);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Simplified terrain geometry (fewer segments)
  const geometry = new THREE.PlaneGeometry(3, 3, 6, 6);
  geometry.rotateX(-Math.PI / 2);

  // Apply same peak logic but simplified
  const positions = geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    // Simplified height function
    let h = Math.sin(x * 0.9) * Math.cos(z * 0.8) * 0.2;
    // Central peak
    const dist = Math.sqrt(x*x + z*z);
    if (dist < 0.8) h += 0.8 * (1 - dist/0.8);
    // Side peaks
    const d1 = Math.sqrt((x+1)*(x+1) + (z+0.8)*(z+0.8));
    if (d1 < 0.5) h += 0.5 * (1 - d1/0.5);
    const d2 = Math.sqrt((x-1)*(x-1) + (z+0.6)*(z+0.6));
    if (d2 < 0.45) h += 0.45 * (1 - d2/0.45);
    positions[i + 1] = h;
  }
  geometry.computeVertexNormals();

  // Gradient shader material matching main terrain
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColorLow: { value: new THREE.Color(0x8FBC8F) },
      uColorMid: { value: new THREE.Color(0x5A9E5A) },
      uColorHigh: { value: new THREE.Color(0x1A4D2E) },
      uMinHeight: { value: 0 },
      uMaxHeight: { value: 0.8 }
    },
    vertexShader: `
      varying float vHeight;
      varying vec3 vNormal;
      void main() {
        vHeight = position.y;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorLow;
      uniform vec3 uColorMid;
      uniform vec3 uColorHigh;
      uniform float uMinHeight;
      uniform float uMaxHeight;
      varying float vHeight;
      varying vec3 vNormal;
      void main() {
        float t = smoothstep(uMinHeight, uMaxHeight, vHeight);
        vec3 color;
        if (t < 0.5) {
          color = mix(uColorLow, uColorMid, t * 2.0);
        } else {
          color = mix(uColorMid, uColorHigh, (t - 0.5) * 2.0);
        }
        // Simple lighting
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diffuse = max(dot(vNormal, lightDir), 0.0);
        float lighting = 0.55 + diffuse * 0.45;
        gl_FragColor = vec4(color * lighting, 1.0);
      }
    `,
    side: THREE.DoubleSide
  });

  const terrain = new THREE.Mesh(geometry, material);
  scene.add(terrain);

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(3, 8, 5);
  scene.add(light);

  // Auto-rotate animation
  function animate() {
    requestAnimationFrame(animate);
    terrain.rotation.y -= 0.003;  // Slow clockwise rotation
    renderer.render(scene, camera);
  }
  animate();
}

// Menu overlay toggle
const menuToggle = document.querySelector('.menu-toggle');
const menuOverlay = document.querySelector('.menu-overlay');
const innerHeader = document.querySelector('.inner-header');

function openMenu() {
  menuOverlay?.classList.add('active');
  menuToggle?.classList.add('open');
  innerHeader?.classList.add('menu-open');
}

function closeMenu() {
  menuOverlay?.classList.remove('active');
  menuToggle?.classList.remove('open');
  innerHeader?.classList.remove('menu-open');
}

menuToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (menuOverlay?.classList.contains('active')) {
    closeMenu();
  } else {
    openMenu();
  }
});

// Close menu with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuOverlay?.classList.contains('active')) {
    closeMenu();
  }
});

// Prevent reload when clicking link to current page in menu
document.querySelectorAll('.overlay-link').forEach(link => {
  link.addEventListener('click', (e) => {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const linkPage = link.getAttribute('href');
    if (currentPage === linkPage) {
      e.preventDefault();
      closeMenu();
    }
  });
});

// Close menu before page is cached (so back button shows closed menu)
window.addEventListener('pagehide', () => {
  closeMenu();
  // Remove menu-ready so cached page won't flash menu
  document.body.classList.remove('menu-ready');
});

// Close menu instantly when page restored from bfcache (no transition flash)
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Disable transition for instant close
    if (menuOverlay) menuOverlay.style.transition = 'none';
    closeMenu();
    // Re-add menu-ready so menu can work again
    document.body.classList.add('menu-ready');
    // Re-enable transition after a frame
    requestAnimationFrame(() => {
      if (menuOverlay) menuOverlay.style.transition = '';
    });
  }
});
