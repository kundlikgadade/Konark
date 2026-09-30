import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const MODEL = './public/model/DS_Kornak_Sun_Temple.gltf';

let scene, camera, renderer, controls, templeRoot;
let teleportCursor, teleportCursorGlow, gazeRayLine;
let groundPlane;
let xrActive = false;
let desktopMode = false;
let xrInitialised = false;
let lastTeleport = 0;
let modelBox = new THREE.Box3();
let modelCenter = new THREE.Vector3();
let modelSize = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const gazeOrigin = new THREE.Vector3();
const gazeDirection = new THREE.Vector3();
const teleportPoint = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const tmpQuat = new THREE.Quaternion();

const $ = id => document.getElementById(id);
const loading = $('loading');
const menu = $('menu');
const enterButton = $('enterImmersive');
const desktopButton = $('exploreDesktop');
const hud = $('hud');
const desktopHelp = $('desktopHelp');
const infoPanel = $('infoPanel');
const errorScreen = $('error');

init();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081722);
  scene.fog = new THREE.FogExp2(0x081722, 0.0015);

  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 2000);
  camera.position.set(0, 2.2, 210);

  const hemi = new THREE.HemisphereLight(0xe8f5ff, 0x24301e, 2.4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d4, 3.2);
  sun.position.set(90, 150, 80);
  sun.castShadow = false;
  scene.add(sun);

  // Large invisible navigation floor. It is intentionally separate from the
  // model so gaze teleporting remains predictable even where the model has gaps.
  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = 0;
  scene.add(groundPlane);

  // Subtle ground for desktop preview only.
  const groundVisual = new THREE.Mesh(
    new THREE.CircleGeometry(240, 96),
    new THREE.MeshStandardMaterial({ color: 0x17251e, roughness: 1 })
  );
  groundVisual.rotation.x = -Math.PI / 2;
  groundVisual.position.y = -0.01;
  scene.add(groundVisual);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 500;
  controls.target.set(0, 20, 0);

  createTeleportCursor();
  setupXR();
  setupUI();
  loadTemple();

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointermove', onDesktopPointerMove);
  renderer.domElement.addEventListener('pointerdown', onDesktopClick);
  renderer.setAnimationLoop(render);
}

function createTeleportCursor() {
  const ring = new THREE.RingGeometry(1.25, 1.65, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x50c7ff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthTest: false
  });
  teleportCursor = new THREE.Mesh(ring, mat);
  teleportCursor.rotation.x = -Math.PI / 2;
  teleportCursor.renderOrder = 50;
  teleportCursor.visible = false;
  scene.add(teleportCursor);

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 64),
    new THREE.MeshBasicMaterial({ color: 0x50c7ff, transparent: true, opacity: 0.12, depthTest: false })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.renderOrder = 49;
  teleportCursor.add(inner);
  teleportCursorGlow = inner;
}

function setupXR() {
  const vrButton = VRButton.createButton(renderer, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hand-tracking', 'bounded-floor', 'dom-overlay'],
    domOverlay: { root: document.body }
  });
  vrButton.id = 'realXRButton';
  vrButton.style.display = 'none';
  document.body.appendChild(vrButton);

  renderer.xr.addEventListener('sessionstart', () => {
    xrActive = true;
    desktopMode = false;
    controls.enabled = false;
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    desktopHelp.classList.add('hidden');
    $('locationName').textContent = 'Look at the ground and pinch to teleport';
    infoPanel.classList.add('hidden');

    // WebXR owns the headset camera. The desktop camera position above is NOT
    // used as the user's XR starting position. Instead, place the temple in
    // front of the user's floor-space origin when the immersive session starts.
    // This prevents the user from spawning inside/behind the model.
    placeTempleInFrontOfUser();
  });

  renderer.xr.addEventListener('sessionend', () => {
    xrActive = false;
    xrInitialised = false;
    controls.enabled = true;
    hud.classList.add('hidden');
    teleportCursor.visible = false;
    menu.classList.remove('hidden');
  });

  // Vision Pro's natural gaze + pinch is delivered as WebXR select input.
  // Listen at the XR session level so transient-pointer input sources work too.
  renderer.xr.addEventListener('sessionstart', () => {
    const session = renderer.xr.getSession();
    session.addEventListener('select', onXRSelect);
  });

  if (navigator.xr?.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (supported) {
        enterButton.disabled = false;
        enterButton.textContent = 'Enter Immersive Experience';
      } else {
        enterButton.disabled = true;
        enterButton.textContent = 'Immersive mode requires Vision Pro';
      }
    }).catch(() => {
      enterButton.disabled = true;
      enterButton.textContent = 'Immersive mode requires Vision Pro';
    });
  } else {
    enterButton.disabled = true;
    enterButton.textContent = 'Immersive mode requires Vision Pro';
  }
}

function setupUI() {
  enterButton.addEventListener('click', () => {
    const b = $('realXRButton');
    if (b && !b.disabled) b.click();
  });

  desktopButton.addEventListener('click', () => {
    desktopMode = true;
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    desktopHelp.classList.remove('hidden');
    $('locationName').textContent = 'Desktop preview: point at the ground and click';
  });

  $('infoToggle').addEventListener('click', () => {
    $('infoTitle').textContent = 'Konark Sun Temple';
    $('infoText').textContent = 'Look around the temple. In immersive mode, look at the ground to position the teleport cursor, then pinch once to move there. There are no fixed teleport buttons.';
    infoPanel.classList.remove('hidden');
  });

  $('closeInfo').addEventListener('click', () => infoPanel.classList.add('hidden'));
  $('exitExperience').addEventListener('click', exitExperience);
}

function placeTempleInFrontOfUser() {
  if (!templeRoot || !renderer.xr.isPresenting || xrInitialised) return;

  const xrCamera = renderer.xr.getCamera(camera);
  const viewerPosition = new THREE.Vector3();
  const viewerDirection = new THREE.Vector3();
  xrCamera.getWorldPosition(viewerPosition);
  xrCamera.getWorldDirection(viewerDirection);

  // Ignore pitch so the temple is placed on the floor, directly ahead.
  viewerDirection.y = 0;
  if (viewerDirection.lengthSq() < 0.001) viewerDirection.set(0, 0, -1);
  viewerDirection.normalize();

  // Keep the user comfortably outside the monument. The model is roughly
  // 179 units deep, so put its centre about one model-depth ahead of the user.
  // This gives a clear exterior starting view rather than spawning inside it.
  const startDistance = Math.max(modelSize.z * 1.05, 185);
  const targetCenter = viewerPosition.clone().addScaledVector(viewerDirection, startDistance);
  targetCenter.y = 0;

  // The model was recentered at the origin during loading. Shift the whole
  // environment so the temple's centre is now in front of the headset.
  templeRoot.position.x = targetCenter.x;
  templeRoot.position.z = targetCenter.z;
  xrInitialised = true;
}

function loadTemple() {
  const loader = new GLTFLoader();
  loader.load(
    MODEL,
    gltf => {
      templeRoot = gltf.scene;

      // The source asset is already authored around the origin. Do not invent
      // an arbitrary rotation or scale; preserve its architecture and materials.
      modelBox.setFromObject(templeRoot);
      modelBox.getCenter(modelCenter);
      modelBox.getSize(modelSize);

      // Put the model's lowest point on the navigation floor and center it horizontally.
      templeRoot.position.x -= modelCenter.x;
      templeRoot.position.z -= modelCenter.z;
      templeRoot.position.y -= modelBox.min.y;

      scene.add(templeRoot);

      // Start at a sensible human-scale exterior distance.
      camera.position.set(0, 2.2, Math.max(modelSize.z * 1.15, 160));
      controls.target.set(0, Math.min(modelSize.y * 0.25, 22), 0);
      controls.update();

      loading.classList.add('hidden');
      enterButton.disabled = false;
    },
    xhr => {
      if (xhr.total) $('loadProgress').textContent = Math.round(xhr.loaded / xhr.total * 100) + '%';
    },
    err => {
      console.error(err);
      loading.classList.add('hidden');
      errorScreen.classList.remove('hidden');
      $('errorText').textContent = 'The Konark model could not be loaded. Keep the public/model folder intact and run the project from a web server.';
    }
  );
}

function updateGazeTeleport() {
  if (!xrActive) return;

  const xrCamera = renderer.xr.getCamera(camera);
  xrCamera.getWorldPosition(gazeOrigin);
  xrCamera.getWorldDirection(gazeDirection);

  // Ray from the user's current view direction to the floor.
  if (Math.abs(gazeDirection.y) < 0.045 || gazeDirection.y >= -0.005) {
    teleportCursor.visible = false;
    return;
  }

  const distance = -gazeOrigin.y / gazeDirection.y;
  if (distance < 0.8 || distance > 55) {
    teleportCursor.visible = false;
    return;
  }

  teleportPoint.copy(gazeOrigin).addScaledVector(gazeDirection, distance);

  // Keep the user within the model/exhibition area.
  const maxRadius = Math.max(modelSize.x, modelSize.z) * 0.72;
  const radial = Math.hypot(teleportPoint.x, teleportPoint.z);
  if (radial > maxRadius) {
    teleportCursor.visible = false;
    return;
  }

  teleportCursor.visible = true;
  teleportCursor.position.copy(teleportPoint);

  // Small animated pulse communicates that this is the active gaze target.
  const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
  teleportCursor.scale.setScalar(pulse);
}

function onXRSelect(event) {
  if (!xrActive || !teleportCursor.visible) return;
  if (performance.now() - lastTeleport < 650) return;

  lastTeleport = performance.now();
  teleportToPoint(teleportCursor.position);
}

function teleportToPoint(worldPoint) {
  // Move the world relative to the user's current floor-space position.
  const target = new THREE.Vector3(worldPoint.x, 0, worldPoint.z);
  const current = new THREE.Vector3();
  if (renderer.xr.isPresenting) {
    const xrCamera = renderer.xr.getCamera(camera);
    xrCamera.getWorldPosition(current);
  } else {
    current.copy(camera.position);
  }

  const deltaX = target.x - current.x;
  const deltaZ = target.z - current.z;

  // Move temple/environment opposite to the desired user movement.
  if (templeRoot) {
    templeRoot.position.x -= deltaX;
    templeRoot.position.z -= deltaZ;
  }

  // Ground remains fixed, so instead shift the camera rig only in desktop mode.
  // In XR, the viewer pose controls the camera; moving the scene is the portable method.
  if (!renderer.xr.isPresenting) {
    camera.position.x += deltaX;
    camera.position.z += deltaZ;
    controls.target.x += deltaX;
    controls.target.z += deltaZ;
    controls.update();
  }
}

function onDesktopPointerMove(event) {
  if (!desktopMode || xrActive) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(groundPlane, false)[0];
  if (hit) {
    teleportCursor.visible = true;
    teleportCursor.position.copy(hit.point);
    teleportCursor.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.08);
  } else {
    teleportCursor.visible = false;
  }
}

function onDesktopClick(event) {
  if (!desktopMode || xrActive || event.button !== 0 || !teleportCursor.visible) return;
  teleportToPoint(teleportCursor.position);
}

function exitExperience() {
  const session = renderer.xr.getSession();
  if (session) session.end();
  else {
    desktopMode = false;
    hud.classList.add('hidden');
    desktopHelp.classList.add('hidden');
    teleportCursor.visible = false;
    menu.classList.remove('hidden');
  }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function render() {
  clock.getDelta();
  if (!xrActive) controls.update();
  updateGazeTeleport();
  renderer.render(scene, camera);
}
