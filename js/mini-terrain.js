// Mini terrain for inner page header
const canvas = document.getElementById('mini-terrain');
if (canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xF8F6F1);

  const camera = new THREE.PerspectiveCamera(45, 80/50, 0.1, 100);
  camera.position.set(0, 2.5, 4);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(80, 50);
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
    terrain.rotation.y -= 0.008;  // Clockwise
    renderer.render(scene, camera);
  }
  animate();
}

// Drawer toggle
const menuToggle = document.querySelector('.menu-toggle');
const drawer = document.querySelector('.drawer');
const overlay = document.querySelector('.drawer-overlay');

menuToggle?.addEventListener('click', () => {
  drawer.classList.toggle('open');
  overlay.classList.toggle('active');
});

overlay?.addEventListener('click', () => {
  drawer.classList.remove('open');
  overlay.classList.remove('active');
});
