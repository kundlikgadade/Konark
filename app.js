import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const MODEL = './public/model/DS_Kornak_Sun_Temple.gltf';

const LOCATIONS = [
  { id:'entrance', name:'Grand Entrance', short:'Approach the temple from the eastern side.', pos:[105,0,0], info:'Start outside the temple and take in the full axial composition.' },
  { id:'nata', name:'Nata Mandap', short:'The dance hall area.', pos:[68,0,0], info:'A dedicated transition point near the Nata Mandap. Use this as a staging point before moving toward the main temple.' },
  { id:'jagamohan', name:'Jagamohan', short:'Main audience hall viewpoint.', pos:[15,0,0], info:'Move closer to the Jagamohan and explore the monumental architecture around the central hall.' },
  { id:'interior', name:'Temple Interior', short:'Enter the central temple zone.', pos:[-28,0,0], info:'This teleport point takes you into the central temple area for a closer architectural view.' },
  { id:'wheel', name:'Temple Wheel', short:'Inspect the wheel sculptures.', pos:[-88,2,26], info:'A close-up viewpoint for the sculptural wheel details along the temple base.' },
  { id:'north', name:'North Exterior', short:'Wide exterior view.', pos:[0,4,108], info:'Step back from the monument and see the overall silhouette from the north.' },
  { id:'south', name:'South Exterior', short:'Wide exterior view.', pos:[0,4,-108], info:'A corresponding wide exterior viewpoint from the south.' },
  { id:'rear', name:'Rear Exterior', short:'View the western side.', pos:[-116,3,0], info:'Explore the rear side of the reconstructed monument.' }
];

let scene, camera, renderer, controls, player, templeRoot;
let raycaster = new THREE.Raycaster();
let clock = new THREE.Clock();
let teleportMeshes = [];
let selectedLocation = LOCATIONS[0];
let xrControllers = [];
let xrActive = false;

const $ = id => document.getElementById(id);
const loading = $('loading');
const menu = $('menu');
const errorScreen = $('error');
const errorText = $('errorText');
const loadProgress = $('loadProgress');
const enterButton = $('enterImmersive');
const desktopButton = $('exploreDesktop');
const hud = $('hud');
const desktopHelp = $('desktopHelp');
const teleportPanel = $('teleportPanel');
const teleportButtons = $('teleportButtons');
const infoPanel = $('infoPanel');

init();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071723);
  scene.fog = new THREE.FogExp2(0x071723, 0.0016);

  player = new THREE.Group();
  scene.add(player);

  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 2000);
  camera.position.set(0, 1.7, 220);
  player.add(camera);

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x273018, 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d2, 3.0);
  sun.position.set(80, 160, 70);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(180, 96),
    new THREE.MeshStandardMaterial({ color:0x15231c, roughness:1, metalness:0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  const grid = new THREE.GridHelper(360, 36, 0x39514a, 0x263831);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.16;
  scene.add(grid);

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 22, 0);
  controls.maxDistance = 500;
  controls.minDistance = 20;

  setupUI();
  setupXR();
  loadTemple();

  window.addEventListener('resize', onResize);
  renderer.setAnimationLoop(render);
}

function loadTemple() {
  const loader = new GLTFLoader();
  loader.load(
    MODEL,
    gltf => {
      templeRoot = gltf.scene;

      // Recenter the model horizontally around the experience origin.
      const box = new THREE.Box3().setFromObject(templeRoot);
      const center = box.getCenter(new THREE.Vector3());
      templeRoot.position.x = -center.x;
      templeRoot.position.z = -center.z;

      // Keep the ground close to y=0.
      const centeredBox = new THREE.Box3().setFromObject(templeRoot);
      templeRoot.position.y -= centeredBox.min.y;

      // Preserve the authored scale. The supplied model is already in a useful architectural scale.
      scene.add(templeRoot);

      createTeleportMarkers();
      loading.classList.add('hidden');
      enterButton.disabled = false;
      desktopButton.disabled = false;
    },
    xhr => {
      if (xhr.total) loadProgress.textContent = Math.round(xhr.loaded / xhr.total * 100) + '%';
    },
    err => {
      console.error(err);
      loading.classList.add('hidden');
      errorScreen.classList.remove('hidden');
      errorText.textContent = 'The Konark model could not be loaded. Run the project through an HTTP/HTTPS server and keep the public/model folder intact.';
    }
  );
}

function createTeleportMarkers() {
  teleportMeshes.forEach(m => scene.remove(m));
  teleportMeshes = [];

  const ringGeo = new THREE.RingGeometry(1.8, 2.5, 48);
  const discGeo = new THREE.CircleGeometry(1.8, 48);

  for (const loc of LOCATIONS) {
    const group = new THREE.Group();
    group.position.set(loc.pos[0], 0.06, loc.pos[2]);
    group.userData.location = loc;

    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color:0x48b8ff, transparent:true, opacity:.82, side:THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const disc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({ color:0x48b8ff, transparent:true, opacity:.13, side:THREE.DoubleSide })
    );
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);

    scene.add(group);
    teleportMeshes.push(group);
  }
}

function setupUI() {
  desktopButton.addEventListener('click', () => {
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    desktopHelp.classList.remove('hidden');
    updateLocationLabel(selectedLocation);
  });

  $('teleportMenu').addEventListener('click', () => teleportPanel.classList.toggle('hidden'));
  $('closeTeleport').addEventListener('click', () => teleportPanel.classList.add('hidden'));
  $('infoToggle').addEventListener('click', () => openInfo(selectedLocation));
  $('closeInfo').addEventListener('click', () => infoPanel.classList.add('hidden'));
  $('exitExperience').addEventListener('click', exitExperience);

  teleportButtons.innerHTML = '';
  for (const loc of LOCATIONS) {
    const b = document.createElement('button');
    b.innerHTML = `<strong>${loc.name}</strong><small>${loc.short}</small>`;
    b.addEventListener('click', () => {
      teleportTo(loc);
      teleportPanel.classList.add('hidden');
    });
    teleportButtons.appendChild(b);
  }

  // Desktop mouse picking.
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
}

function setupXR() {
  const vrButton = VRButton.createButton(renderer, {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
    domOverlay: { root: document.body }
  });

  // Use our own button while keeping Three.js' XR session management.
  vrButton.style.display = 'none';
  document.body.appendChild(vrButton);

  renderer.xr.addEventListener('sessionstart', () => {
    xrActive = true;
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    desktopHelp.classList.add('hidden');
    controls.enabled = false;

    for (let i = 0; i < 4; i++) {
      const controller = renderer.xr.getController(i);
      controller.userData.index = i;
      controller.addEventListener('select', () => selectFromXR(controller));
      if (!controller.userData.line) {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0,0,0),
            new THREE.Vector3(0,0,-8)
          ]),
          new THREE.LineBasicMaterial({ color:0x48b8ff, transparent:true, opacity:.65 })
        );
        controller.add(line);
        controller.userData.line = line;
      }
      xrControllers[i] = controller;
      player.add(controller);
    }
  });

  renderer.xr.addEventListener('sessionend', () => {
    xrActive = false;
    controls.enabled = true;
    hud.classList.add('hidden');
    teleportPanel.classList.add('hidden');
    infoPanel.classList.add('hidden');
  });

  // The actual immersive button is still generated by Three.js so Safari's WebXR
  // permission flow is preserved. Our visible button programmatically activates it.
  enterButton.addEventListener('click', () => {
    if (vrButton.click) vrButton.click();
  }, { once: true });

  // Detect support for immersive-vr and update the UI.
  if (navigator.xr?.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr')
      .then(ok => {
        if (!ok) {
          enterButton.textContent = 'Immersive WebXR not available';
          enterButton.disabled = true;
        }
      })
      .catch(() => {});
  } else {
    enterButton.textContent = 'Open on Vision Pro for Immersive Mode';
  }
}

function selectFromXR(controller) {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  controller.matrixWorld.decompose(origin, new THREE.Quaternion(), new THREE.Vector3());
  direction.set(0,0,-1).transformDirection(controller.matrixWorld);

  raycaster.set(origin, direction);
  const hits = raycaster.intersectObjects(teleportMeshes, true);
  if (!hits.length) return;

  let obj = hits[0].object;
  while (obj && !obj.userData.location) obj = obj.parent;
  if (obj?.userData.location) {
    teleportTo(obj.userData.location);
  }
}

function onPointerDown(event) {
  if (xrActive || event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(teleportMeshes, true);
  if (!hits.length) return;
  let obj = hits[0].object;
  while (obj && !obj.userData.location) obj = obj.parent;
  if (obj?.userData.location) teleportTo(obj.userData.location);
}

function teleportTo(loc) {
  selectedLocation = loc;
  player.position.set(-loc.pos[0], 0, -loc.pos[2]);
  updateLocationLabel(loc);
  openInfo(loc);
}

function updateLocationLabel(loc) {
  $('locationName').textContent = loc.name;
}

function openInfo(loc) {
  $('infoTitle').textContent = loc.name;
  $('infoText').textContent = loc.info;
  infoPanel.classList.remove('hidden');
}

function exitExperience() {
  const session = renderer.xr.getSession();
  if (session) session.end();
  else {
    hud.classList.add('hidden');
    desktopHelp.classList.add('hidden');
    menu.classList.remove('hidden');
  }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function render() {
  const dt = clock.getDelta();
  controls.update();

  const t = performance.now() * 0.001;
  teleportMeshes.forEach((g, i) => {
    const pulse = 1 + Math.sin(t * 2.5 + i * .35) * .06;
    g.scale.setScalar(pulse);
    g.rotation.y += dt * 0.15;
  });

  renderer.render(scene, camera);
}
