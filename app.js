import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const MODEL = './public/model/DS_Kornak_Sun_Temple.gltf';

let scene, camera, renderer, controls, templeRoot;
let teleportCursor, cursorInner, cursorValid = false;
let groundPlane, groundVisual;
let xrActive = false, desktopMode = false;
let xrSession = null;
let navigationMode = 'teleport'; // teleport | fly
let pinchAiming = false;
let lastTeleport = 0;
let modelBox = new THREE.Box3();
let modelCenter = new THREE.Vector3();
let modelSize = new THREE.Vector3();
let initialTemplePosition = new THREE.Vector3();
let initialTempleQuaternion = new THREE.Quaternion();
let initialTempleScale = new THREE.Vector3(1,1,1);
let lastSurfacePoint = new THREE.Vector3();
let lastSurfaceNormal = new THREE.Vector3(0,1,0);

const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const gazeOrigin = new THREE.Vector3();
const gazeDirection = new THREE.Vector3();
const hitNormal = new THREE.Vector3();
const targetPoint = new THREE.Vector3();
const worldUp = new THREE.Vector3(0,1,0);
const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

const $ = id => document.getElementById(id);
const loading = $('loading');
const menu = $('menu');
const enterButton = $('enterImmersive');
const desktopButton = $('exploreDesktop');
const hud = $('hud');
const desktopHelp = $('desktopHelp');
const infoPanel = $('infoPanel');
const navModePanel = $('navModePanel');

init();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081722);
  scene.fog = new THREE.FogExp2(0x081722, 0.0015);

  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 2000);
  camera.position.set(0, 2.2, 210);

  scene.add(new THREE.HemisphereLight(0xe8f5ff, 0x24301e, 2.4));
  const sun = new THREE.DirectionalLight(0xfff0d4, 3.2);
  sun.position.set(90,150,80);
  scene.add(sun);

  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1400,1400),
    new THREE.MeshBasicMaterial({ visible:false, side:THREE.DoubleSide })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  groundVisual = new THREE.Mesh(
    new THREE.CircleGeometry(260,96),
    new THREE.MeshStandardMaterial({ color:0x17251e, roughness:1 })
  );
  groundVisual.rotation.x = -Math.PI / 2;
  groundVisual.position.y = -0.01;
  scene.add(groundVisual);

  renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 500;
  controls.target.set(0,20,0);

  createTeleportCursor();
  setupUI();
  setupXR();
  loadTemple();

  window.addEventListener('resize',onResize);
  renderer.domElement.addEventListener('pointermove',onDesktopPointerMove);
  renderer.domElement.addEventListener('pointerdown',onDesktopClick);
  renderer.setAnimationLoop(render);
}

function createTeleportCursor() {
  teleportCursor = new THREE.Mesh(
    new THREE.RingGeometry(0.9,1.35,64),
    new THREE.MeshBasicMaterial({ color:0x39d98a, transparent:true, opacity:.95, side:THREE.DoubleSide, depthTest:false })
  );
  teleportCursor.rotation.x = -Math.PI/2;
  teleportCursor.renderOrder = 50;
  teleportCursor.visible = false;
  scene.add(teleportCursor);

  cursorInner = new THREE.Mesh(
    new THREE.CircleGeometry(.9,64),
    new THREE.MeshBasicMaterial({ color:0x39d98a, transparent:true, opacity:.16, side:THREE.DoubleSide, depthTest:false })
  );
  cursorInner.rotation.x = -Math.PI/2;
  teleportCursor.add(cursorInner);
}

function setupXR() {
  const vrButton = VRButton.createButton(renderer, {
    requiredFeatures:['local-floor'],
    optionalFeatures:['hand-tracking','bounded-floor','dom-overlay'],
    domOverlay:{ root:document.body }
  });
  vrButton.id='realXRButton';
  vrButton.style.display='none';
  document.body.appendChild(vrButton);

  renderer.xr.addEventListener('sessionstart',() => {
    xrActive=true;
    desktopMode=false;
    controls.enabled=false;
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    desktopHelp.classList.add('hidden');
    navModePanel.classList.remove('hidden');
    infoPanel.classList.add('hidden');
    navigationMode='teleport';
    setModeUI();
    resetExperience(true);
    xrSession=renderer.xr.getSession();
    xrSession.addEventListener('selectstart',onXRSelectStart);
    xrSession.addEventListener('selectend',onXRSelectEnd);
    xrSession.addEventListener('select',onXRSelect);
  });

  renderer.xr.addEventListener('sessionend',() => {
    xrActive=false;
    pinchAiming=false;
    xrSession=null;
    controls.enabled=true;
    hud.classList.add('hidden');
    navModePanel.classList.add('hidden');
    teleportCursor.visible=false;
    menu.classList.remove('hidden');
  });

  if (navigator.xr?.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok=>{
      enterButton.disabled=!ok;
      enterButton.textContent=ok?'Enter Immersive Experience':'Immersive mode requires Vision Pro';
    }).catch(()=>{
      enterButton.disabled=true;
      enterButton.textContent='Immersive mode requires Vision Pro';
    });
  } else {
    enterButton.disabled=true;
    enterButton.textContent='Immersive mode requires Vision Pro';
  }
}

function setupUI() {
  enterButton.addEventListener('click',()=>$('realXRButton')?.click());
  desktopButton.addEventListener('click',()=>{
    desktopMode=true;
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    desktopHelp.classList.remove('hidden');
    $('locationName').textContent='Desktop: point at a surface and click';
  });

  $('teleportMode').addEventListener('click',()=>{ navigationMode='teleport'; setModeUI(); });
  $('flyMode').addEventListener('click',()=>{ navigationMode='fly'; setModeUI(); });
  $('resetExperience').addEventListener('click',()=>resetExperience(false));
  $('exitExperience').addEventListener('click',exitExperience);
  $('infoToggle').addEventListener('click',()=>{
    $('infoTitle').textContent='Navigation';
    $('infoText').textContent=navigationMode==='teleport'
      ? 'Teleport mode: pinch to aim at the surface you are looking at. A valid landing surface is highlighted. Release the pinch to teleport there. Steps and sloped architectural surfaces are considered when their surface faces upward.'
      : 'Fly mode: pinch and hold to aim, then release to move forward through the temple in the direction of the pinch target. Use this for aerial exploration.';
    infoPanel.classList.remove('hidden');
  });
  $('closeInfo').addEventListener('click',()=>infoPanel.classList.add('hidden'));
}

function setModeUI() {
  $('teleportMode').classList.toggle('active',navigationMode==='teleport');
  $('flyMode').classList.toggle('active',navigationMode==='fly');
  $('locationName').textContent=navigationMode==='teleport' ? 'Teleport: pinch to aim, release to move' : 'Fly: pinch to aim, release to fly';
  teleportCursor.visible=false;
}

function loadTemple() {
  new GLTFLoader().load(MODEL,gltf=>{
    templeRoot=gltf.scene;
    modelBox.setFromObject(templeRoot);
    modelBox.getCenter(modelCenter);
    modelBox.getSize(modelSize);

    templeRoot.position.x -= modelCenter.x;
    templeRoot.position.z -= modelCenter.z;
    templeRoot.position.y -= modelBox.min.y;
    templeRoot.updateMatrixWorld(true);

    initialTemplePosition.copy(templeRoot.position);
    initialTempleQuaternion.copy(templeRoot.quaternion);
    initialTempleScale.copy(templeRoot.scale);
    scene.add(templeRoot);
    createKonarkEnvironment();

    camera.position.set(0,2.2,Math.max(modelSize.z*1.15,160));
    controls.target.set(0,Math.min(modelSize.y*.25,22),0);
    controls.update();

    loading.classList.add('hidden');
    enterButton.disabled=false;
  },xhr=>{
    if(xhr.total) $('loadProgress').textContent=Math.round(xhr.loaded/xhr.total*100)+'%';
  },err=>{
    console.error(err);
    loading.classList.add('hidden');
    $('error').classList.remove('hidden');
    $('errorText').textContent='The Konark model could not be loaded. Keep public/model intact and run through HTTP/HTTPS.';
  });
}

function createKonarkEnvironment() {
  // The environment is parented to the temple so it behaves as one virtual
  // world during teleport/fly navigation.
  const environment = new THREE.Group();
  environment.name = 'KonarkEnvironment';

  // Large low-poly ground platform with a subtle warm stone/sand appearance.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(420, 128),
    new THREE.MeshStandardMaterial({
      color: 0x8a7357,
      roughness: 1,
      metalness: 0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  environment.add(ground);

  // Concentric subtle rings add visual depth without expensive terrain geometry.
  const terrace = new THREE.Mesh(
    new THREE.RingGeometry(55, 190, 96),
    new THREE.MeshStandardMaterial({
      color: 0x6f604d,
      roughness: 1,
      transparent: true,
      opacity: 0.34
    })
  );
  terrace.rotation.x = -Math.PI / 2;
  terrace.position.y = 0.005;
  environment.add(terrace);

  // Distant low-poly dunes / vegetation silhouettes around the horizon.
  const horizonMat = new THREE.MeshStandardMaterial({
    color: 0x3f5142,
    roughness: 1,
    flatShading: true
  });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const radius = 250 + (i % 3) * 22;
    const width = 85 + (i % 4) * 18;
    const height = 10 + (i % 5) * 4;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(width, height, 8),
      horizonMat
    );
    hill.scale.z = 0.55;
    hill.position.set(Math.cos(angle) * radius, height * 0.5 - 0.05, Math.sin(angle) * radius);
    hill.rotation.y = -angle + Math.PI * 0.5;
    environment.add(hill);
  }

  // A lightweight procedural sky dome avoids a large HDR texture download.
  const skyTexture = createSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(650, 48, 24),
    new THREE.MeshBasicMaterial({
      map: skyTexture,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  sky.renderOrder = -10;
  environment.add(sky);

  // Soft sun disc to reinforce the golden-hour direction.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffd98a,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  );
  sunDisc.position.set(170, 145, -250);
  sunDisc.lookAt(0, 30, 0);
  sunDisc.renderOrder = -5;
  environment.add(sunDisc);

  // A few distant, low-cost tree clusters provide scale at the horizon.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3a2b, roughness: 1 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x314738, roughness: 1, flatShading: true });
  for (let i = 0; i < 28; i++) {
    const angle = ((i * 137.5) % 360) * Math.PI / 180;
    const radius = 135 + (i % 6) * 17;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 5, 6), trunkMat);
    trunk.position.y = 2.5;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(4.5 + (i % 3), 9 + (i % 4), 7), canopyMat);
    canopy.position.y = 9;
    tree.add(trunk, canopy);
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tree.scale.setScalar(0.7 + (i % 4) * 0.12);
    environment.add(tree);
  }

  templeRoot.add(environment);

  // Keep the old hidden floor as the navigation fallback, but use the new
  // visible environment ground as the visual floor.
  groundVisual.visible = false;
}

function createSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#163b63');
  gradient.addColorStop(0.34, '#5d8db0');
  gradient.addColorStop(0.62, '#d7a879');
  gradient.addColorStop(0.78, '#e7c59a');
  gradient.addColorStop(1, '#7f765e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft cloud bands near the horizon.
  for (let i = 0; i < 12; i++) {
    const x = (i * 73) % canvas.width;
    const y = 80 + (i % 4) * 22;
    const w = 70 + (i % 5) * 28;
    const h = 12 + (i % 3) * 5;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, w);
    cloud.addColorStop(0, 'rgba(255,255,255,0.22)');
    cloud.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(x - w, y - h, w * 2, h * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = 2;
  return texture;
}

function getXRViewCamera() {
  return renderer.xr.getCamera(camera);
}

function updateXRTarget(forceShow=false) {
  if(!xrActive) return;
  const xrCamera=getXRViewCamera();
  xrCamera.getWorldPosition(gazeOrigin);
  xrCamera.getWorldDirection(gazeDirection);

  if(navigationMode==='fly') {
    // During a Vision Pro transient-pointer pinch, the target ray becomes available.
    // We visualize a forward target only while aiming.
    if(!pinchAiming && !forceShow) { teleportCursor.visible=false; return; }
    const distance=7;
    targetPoint.copy(gazeOrigin).addScaledVector(gazeDirection,distance);
    setCursor(targetPoint,true);
    return;
  }

  // Teleport: first test the actual architectural model so steps, platforms and
  // other upward-facing surfaces can become valid landing surfaces. If nothing
  // suitable is hit, test the virtual ground plane.
  raycaster.set(gazeOrigin,gazeDirection);
  raycaster.far=500;
  const hits=[];
  if(templeRoot) raycaster.intersectObject(templeRoot,true,hits);

  let validHit=null;
  for(const h of hits) {
    if(!h.face) continue;
    hitNormal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    if(hitNormal.y < 0.38) continue; // reject walls/roofs/near-vertical surfaces
    if(h.point.y < -0.5) continue;
    validHit=h;
    break;
  }

  if(validHit) {
    targetPoint.copy(validHit.point);
    lastSurfaceNormal.copy(hitNormal);
    setCursor(targetPoint,true);
    return;
  }

  // Fallback to the floor if the gaze is below the horizon.
  if(Math.abs(gazeDirection.y)>0.015 && gazeDirection.y<0) {
    const d=-gazeOrigin.y/gazeDirection.y;
    if(d>0.7 && d<500) {
      targetPoint.copy(gazeOrigin).addScaledVector(gazeDirection,d);
      lastSurfaceNormal.set(0,1,0);
      setCursor(targetPoint,true);
      return;
    }
  }

  teleportCursor.visible=false;
  cursorValid=false;
}

function setCursor(point,valid) {
  cursorValid=valid;
  teleportCursor.visible=valid;
  teleportCursor.position.copy(point);
  const pulse=1+Math.sin(performance.now()*.008)*.07;
  teleportCursor.scale.setScalar(pulse);
  const color=valid?0x39d98a:0xff5c6c;
  teleportCursor.material.color.setHex(color);
  cursorInner.material.color.setHex(color);
}

function onXRSelectStart(event) {
  if(!xrActive) return;
  pinchAiming=true;
  // On visionOS transient-pointer, the target ray represents gaze at pinch start.
  // Recalculate immediately so the target is based on what the user was looking at.
  updateXRTarget(true);
}

function onXRSelect(event) {
  // Some WebXR implementations emit select without a useful selectend; keep
  // this as a compatibility path but do not double-trigger a recent action.
  if(!xrActive || performance.now()-lastTeleport<350) return;
}

function onXRSelectEnd(event) {
  if(!xrActive) return;
  pinchAiming=false;
  if(performance.now()-lastTeleport<650) return;

  if(navigationMode==='teleport') {
    if(cursorValid) {
      lastTeleport=performance.now();
      teleportToSurface(targetPoint,lastSurfaceNormal);
    }
  } else {
    // Fly a comfortable amount in the gaze direction from the pinch target.
    flyForward();
  }
  teleportCursor.visible=false;
}

function teleportToSurface(point,normal) {
  if(!templeRoot) return;

  // The user's physical floor stays at y=0. Move the virtual environment so
  // the selected architectural surface is exactly under the user's feet.
  const destination=point.clone();
  const verticalOffset=destination.y;

  const xrCamera=getXRViewCamera();
  const viewer=new THREE.Vector3();
  xrCamera.getWorldPosition(viewer);

  const dx=destination.x-viewer.x;
  const dz=destination.z-viewer.z;
  templeRoot.position.x-=dx;
  templeRoot.position.z-=dz;
  templeRoot.position.y-=verticalOffset;
}

function flyForward() {
  if(!templeRoot) return;
  const xrCamera=getXRViewCamera();
  xrCamera.getWorldDirection(gazeDirection);
  const distance=6.0;
  // Move the virtual world opposite the viewing direction. Keep the virtual
  // floor at the user's feet by not introducing a vertical component.
  const move=gazeDirection.clone().multiplyScalar(distance);
  templeRoot.position.x-=move.x;
  templeRoot.position.y-=move.y;
  templeRoot.position.z-=move.z;
}

function resetExperience(recenterToCurrentView) {
  if(!templeRoot) return;

  templeRoot.position.copy(initialTemplePosition);
  templeRoot.quaternion.copy(initialTempleQuaternion);
  templeRoot.scale.copy(initialTempleScale);
  templeRoot.updateMatrixWorld(true);

  if(renderer.xr.isPresenting && recenterToCurrentView) {
    const xrCamera=getXRViewCamera();
    const viewer=new THREE.Vector3();
    const dir=new THREE.Vector3();
    xrCamera.getWorldPosition(viewer);
    xrCamera.getWorldDirection(dir);
    dir.y=0;
    if(dir.lengthSq()<.001) dir.set(0,0,-1);
    dir.normalize();

    const startDistance=Math.max(modelSize.z*1.05,185);
    const center=viewer.clone().addScaledVector(dir,startDistance);
    center.y=0;
    // initialTemplePosition is the model's centered origin. Put that origin at
    // the desired center point in front of the user.
    templeRoot.position.x=center.x;
    templeRoot.position.z=center.z;
  }

  setModeUI();
  teleportCursor.visible=false;
}

function onDesktopPointerMove(event) {
  if(!desktopMode || xrActive) return;
  const rect=renderer.domElement.getBoundingClientRect();
  const ndc=new THREE.Vector2(
    ((event.clientX-rect.left)/rect.width)*2-1,
    -((event.clientY-rect.top)/rect.height)*2+1
  );
  raycaster.setFromCamera(ndc,camera);

  const hits=[];
  if(templeRoot) raycaster.intersectObject(templeRoot,true,hits);
  let best=null;
  let n=new THREE.Vector3();
  for(const h of hits) {
    if(!h.face) continue;
    n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    if(n.y>=.38 && h.point.y>=-.5) { best=h; break; }
  }
  if(best) {
    setCursor(best.point,true);
    return;
  }
  const floorHit=raycaster.intersectObject(groundPlane,false)[0];
  if(floorHit) setCursor(floorHit.point,true);
  else teleportCursor.visible=false;
}

function onDesktopClick(event) {
  if(!desktopMode || xrActive || event.button!==0 || !teleportCursor.visible) return;
  if(navigationMode==='teleport') teleportToSurface(teleportCursor.position,new THREE.Vector3(0,1,0));
  else flyForward();
}

function exitExperience() {
  const session=renderer.xr.getSession();
  if(session) session.end();
  else {
    desktopMode=false;
    hud.classList.add('hidden');
    desktopHelp.classList.add('hidden');
    teleportCursor.visible=false;
    menu.classList.remove('hidden');
  }
}

function onResize() {
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
}

function render() {
  clock.getDelta();
  if(!xrActive) controls.update();
  if(xrActive && pinchAiming) updateXRTarget();
  renderer.render(scene,camera);
}
