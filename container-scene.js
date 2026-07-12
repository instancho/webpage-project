import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

var CONTAINER_COLOR = '#55677a';
var CAMERA_OFFSET = 0.2;
var MAX_CURSOR_PARALLAX = 0.5;
var CURSOR_LERP = 0.03;
var SCENE_PROGRESS_GAIN = 1.5;
var DOOR_OPEN_START = 3;
var DOOR_FULL_OPEN = 1.35;
var DOOR_FULL_OPEN_MOBILE = 2;
var PANEL_COUNT = 5;
var BASE_LIGHT_INTENSITY = 2.2 / PANEL_COUNT;
var PANEL_EMISSIVE_INTENSITY = 2.2 / PANEL_COUNT;
var CARD_PITCH_START = 1.4;
var CARD_PITCH_FULL = 0.6;
var CARD_MAX_PITCH = 1.15;

var CARD_PATHS = [
  './assets/cards/card-01.png', './assets/cards/card-02.png',
  './assets/cards/card-03.png', './assets/cards/card-04.png',
  './assets/cards/card-05.png', './assets/cards/card-06.png',
];
var CARD_LABELS = [
  'Chicken', 'Duck', 'Pork', 'Lamb',
  'Seafood', 'Frozen Vegetables', 'Canned & Packaged Foods', 'Non-Food Supplies',
];

var mobile = window.matchMedia('(max-width: 768px)').matches
  || window.matchMedia('(pointer: coarse)').matches;
var cardCount = mobile ? 4 : 8;

if (!mobile) {
  try { RectAreaLightUniformsLib.init(); } catch (e) { /* merged into core */ }
}

// ── Noise (container normal map) ─────────────────────────────────────────────

function noiseHash(x, y, seed) {
  var h = Math.sin(x * 374.234 + y * 192.733 + (seed || 0) * 71.234) * 43758.5453;
  return h - Math.floor(h);
}

function noiseSmoothstep(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed) {
  seed = seed || 0;
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  var a = noiseHash(xi, yi, seed), b = noiseHash(xi + 1, yi, seed);
  var c = noiseHash(xi, yi + 1, seed), d = noiseHash(xi + 1, yi + 1, seed);
  var u = noiseSmoothstep(xf), v = noiseSmoothstep(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, seed, octaves) {
  var value = 0, amp = 0.5, freq = 1;
  for (var i = 0; i < (octaves || 4); i++) {
    value += amp * valueNoise(x * freq, y * freq, (seed || 0) + i * 17);
    freq *= 2; amp *= 0.5;
  }
  return value;
}

function createPlasticNormalMap() {
  var size = 512;
  var canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(size, size);
  var d = imageData.data;

  function heightAt(x, y) {
    return fbm(x * 0.015, y * 0.015, 1, 3) * 0.06 + fbm(x * 0.06, y * 0.06, 7, 2) * 0.025;
  }

  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var h = heightAt(x, y);
      var nx = heightAt(x + 1, y) - h;
      var ny = heightAt(x, y + 1) - h;
      var len = Math.sqrt(nx * nx + ny * ny + 1);
      var idx = (y * size + x) * 4;
      d[idx]     = ((-nx / len) * 0.5 + 0.5) * 255;
      d[idx + 1] = ((-ny / len) * 0.5 + 0.5) * 255;
      d[idx + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  var texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

// ── Door rotation ────────────────────────────────────────────────────────────

function applyDoorRotation(door, angle, hM, sM, uM, dM) {
  if (!door) return;
  hM.makeTranslation(door.hinge.x, door.hinge.y, door.hinge.z);
  sM.makeRotationY(angle);
  uM.makeTranslation(-door.hinge.x, -door.hinge.y, -door.hinge.z);
  dM.copy(hM).multiply(sM).multiply(uM).multiply(door.originalMatrix);
  dM.decompose(door.mesh.position, door.mesh.quaternion, door.mesh.scale);
}

// ── Card label drawing ───────────────────────────────────────────────────────

function drawLabelOnCanvas(image, labelText, mirror, maxWidth) {
  if (!image || !image.width || !image.height) return null;
  var scale = maxWidth ? Math.min(1, maxWidth / image.width) : 1;
  var w = Math.round(image.width * scale);
  var h = Math.round(image.height * scale);
  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);

  var labelH = Math.round(h * 0.22);
  var padX = Math.round(w * 0.05);
  var labelTop = h - labelH - Math.round(h * 0.04);

  ctx.save();
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }

  var fontSize = Math.round(labelH * 0.5);
  ctx.font = 'bold ' + fontSize + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  var availW = w - padX * 2;
  while (fontSize > 8 && ctx.measureText(labelText).width > availW) {
    fontSize -= 2;
    ctx.font = 'bold ' + fontSize + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
  }

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(4, Math.round(fontSize * 0.14));
  ctx.fillText(labelText, padX, labelTop + labelH * 0.5);
  ctx.restore();
  return canvas;
}

// ── Card LCD material (desktop custom shader) ────────────────────────────────

function createCardMaterial(texture, seed) {
  if (mobile) {
    return new THREE.MeshBasicMaterial({
      map: texture, color: new THREE.Color(0.72, 0.72, 0.72),
      side: THREE.DoubleSide, toneMapped: true,
    });
  }

  var mat = new THREE.MeshPhysicalMaterial({
    map: texture,
    emissive: new THREE.Color(0.25, 0.27, 0.34),
    emissiveMap: texture, emissiveIntensity: 0.45,
    color: new THREE.Color(1.02, 1.04, 1.06),
    roughness: 0.2, metalness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.06,
    reflectivity: 0.6, specularIntensity: 0.85,
    specularColor: new THREE.Color(1, 1, 1),
    envMapIntensity: 0.0,
    sheen: 0.35, sheenRoughness: 0.3,
    sheenColor: new THREE.Color(0.95, 0.98, 1.0),
    toneMapped: true, side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = function(shader) {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uSeed = { value: seed };
    mat.userData.shader = shader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' +
      'uniform float uTime;\n' +
      'uniform float uSeed;\n' +
      'float cardStaticNoise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n' +
      'float cardMovingNoise(vec2 p){return fract(sin(dot(p,vec2(91.345,47.891)))*23421.631);}\n'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      '#ifdef USE_MAP\n' +
      '  vec2 pixelCount=vec2(240.0,154.0);\n' +
      '  vec2 pixelUv=(floor(vMapUv*pixelCount)+0.5)/pixelCount;\n' +
      '  vec4 sampledDiffuseColor=texture2D(map,pixelUv);\n' +
      '  vec2 cell=fract(vMapUv*pixelCount);\n' +
      '  float subPixel=floor(fract(vMapUv.x*pixelCount.x)*3.0);\n' +
      '  vec3 rgbMask=mix(mix(vec3(0.25,1.55,0.28),vec3(0.28,0.42,1.75),step(1.5,subPixel)),vec3(1.75,0.25,0.22),1.0-step(0.5,subPixel));\n' +
      '  float vertGap=smoothstep(0.9,1.0,cell.x)+smoothstep(0.0,0.08,cell.x);\n' +
      '  float horizGap=smoothstep(0.9,1.0,cell.y)+smoothstep(0.0,0.08,cell.y);\n' +
      '  float grid=clamp(max(vertGap,horizGap),0.0,1.0);\n' +
      '  float scanline=sin(vMapUv.y*850.0)*0.5+0.5;\n' +
      '  float grain=(cardStaticNoise(vMapUv*vec2(720.0,520.0))-0.5)*0.02;\n' +
      '  float localTime=uTime+uSeed*100.0;\n' +
      '  float driftPhase=localTime*0.4+uSeed*3.0;\n' +
      '  vec2 drift=vec2(cos(driftPhase),sin(driftPhase*1.3))*localTime*0.08;\n' +
      '  vec2 noiseUv=vMapUv+drift;\n' +
      '  float jitter=(cardMovingNoise(vec2(floor(vMapUv.y*200.0)+uSeed*50.0,localTime*40.0))-0.5)*0.025;\n' +
      '  float staticBlock=step(0.996,cardMovingNoise(noiseUv*(10.0+uSeed)+localTime*5.0))*0.15;\n' +
      '  sampledDiffuseColor.rgb*=mix(vec3(1.0),rgbMask,0.18);\n' +
      '  sampledDiffuseColor.rgb*=1.06+scanline*0.08;\n' +
      '  sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,sampledDiffuseColor.rgb*0.7,grid*0.5);\n' +
      '  sampledDiffuseColor.rgb+=grain+jitter+staticBlock;\n' +
      '  sampledDiffuseColor.rgb=pow(sampledDiffuseColor.rgb,vec3(0.82));\n' +
      '  diffuseColor*=sampledDiffuseColor;\n' +
      '#endif'
    );
  };
  return mat;
}

// ── Mobile container binary parser ───────────────────────────────────────────

function parseMobileContainer(buffer) {
  var view = new DataView(buffer);
  var meshCount = view.getUint32(0, true);
  var meshes = [];
  var fileOffset = 4 + meshCount * 8;

  for (var m = 0; m < meshCount; m++) {
    var offset = view.getUint32(4 + m * 8, true);
    var start = fileOffset + offset;
    var nameBytes = new Uint8Array(buffer, start, 32);
    var name = new TextDecoder().decode(nameBytes).replace(/\0/g, '');
    var vertCount = view.getUint32(start + 32, true);
    var triCount = view.getUint32(start + 36, true);
    var indexBytes = view.getUint32(start + 52, true);
    var headerSize = 64;
    var posSize = vertCount * 3 * 4;
    var normSize = vertCount * 3;
    var paddedNormSize = Math.ceil(normSize / 4) * 4;

    var positions = new Float32Array(buffer, start + headerSize, vertCount * 3);
    var normals = new Int8Array(buffer, start + headerSize + posSize, vertCount * 3);
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3, true));

    var indexOff = start + headerSize + posSize + paddedNormSize;
    if (indexBytes === 2) {
      geometry.setIndex(Array.from(new Uint16Array(buffer, indexOff, triCount * 3)));
    } else {
      geometry.setIndex(Array.from(new Uint32Array(buffer, indexOff, triCount * 3)));
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    meshes.push({ name: name, geometry: geometry });
  }
  return meshes;
}

// ── Renderer & Scene ─────────────────────────────────────────────────────────

var containerEl = document.getElementById('products-3d');
var sectionEl = document.getElementById('products');

var renderer = new THREE.WebGLRenderer({
  antialias: !mobile,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(mobile ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;
if (!mobile) {
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.enabled = true;
}
containerEl.appendChild(renderer.domElement);

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

var camera = new THREE.PerspectiveCamera(
  mobile ? 82 : 50, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 0, 12);

// ── Lights ───────────────────────────────────────────────────────────────────

var hemiLight = new THREE.HemisphereLight('#ffffff', '#ffffff', 0);
scene.add(hemiLight);

var ambientLight = new THREE.AmbientLight('#ffffff', 0);
scene.add(ambientLight);

var keyLight = new THREE.DirectionalLight('#fff4e0', 0);
keyLight.position.set(3.5, 5, 4);
if (!mobile) {
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.camera.left = -6;
  keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 6;
}
var keyTarget = new THREE.Object3D();
scene.add(keyTarget);
keyLight.target = keyTarget;
scene.add(keyLight);

// ── Environment map (desktop) ────────────────────────────────────────────────

if (!mobile) {
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#ffffff');

  var warmSphere = new THREE.Mesh(
    new THREE.SphereGeometry(20, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#fff4d6', side: THREE.BackSide })
  );
  warmSphere.position.set(-6, 4, -4);
  envScene.add(warmSphere);

  var coolSphere = new THREE.Mesh(
    new THREE.SphereGeometry(15, 16, 16),
    new THREE.MeshBasicMaterial({ color: '#f8fbff', side: THREE.BackSide })
  );
  coolSphere.position.set(7, 3, 5);
  envScene.add(coolSphere);

  var envFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  envFloor.rotation.x = -Math.PI / 2;
  envFloor.position.y = -8;
  envScene.add(envFloor);

  var envCeiling = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: '#ffffff' })
  );
  envCeiling.rotation.x = Math.PI / 2;
  envCeiling.position.y = 10;
  envScene.add(envCeiling);

  var envTarget = pmrem.fromScene(envScene, 0.02);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0;

  envScene.traverse(function(child) {
    if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
  });
  pmrem.dispose();
}

// ── Post-processing: chromatic aberration (desktop) ──────────────────────────

var composer = null;
if (!mobile) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uStrength: { value: 0.018 },
      uDistortion: { value: 0.012 },
    },
    vertexShader:
      'varying vec2 vUv;\n' +
      'void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:
      'uniform sampler2D tDiffuse;uniform float uStrength;uniform float uDistortion;varying vec2 vUv;\n' +
      'void main(){\n' +
      '  vec2 c=vec2(0.5);vec2 d=vUv-c;float r=length(d)*1.41421356;float f=pow(r,2.2);\n' +
      '  vec2 du=vUv+d*uDistortion*f;vec2 o=d*uStrength*f;\n' +
      '  float red=texture2D(tDiffuse,du+o).r;float green=texture2D(tDiffuse,du).g;float blue=texture2D(tDiffuse,du-o).b;\n' +
      '  float alpha=max(max(texture2D(tDiffuse,du+o).a,texture2D(tDiffuse,du).a),texture2D(tDiffuse,du-o).a);\n' +
      '  gl_FragColor=vec4(red,green,blue,alpha);\n' +
      '}',
  }));
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ── Hallway light panels ─────────────────────────────────────────────────────

var panelGeo = new THREE.PlaneGeometry(0.28, 0.65);
var panels = [];
var rectLights = [];

for (var pi = 0; pi < PANEL_COUNT; pi++) {
  var pMat = new THREE.MeshStandardMaterial({
    color: '#eef3ff', emissive: '#ffe8c8', emissiveIntensity: 0,
    roughness: 0.12, metalness: 0, side: THREE.DoubleSide,
    transparent: true, opacity: 0.15, toneMapped: true, depthWrite: false,
  });
  var pMesh = new THREE.Mesh(panelGeo, pMat);
  pMesh.rotation.x = -Math.PI / 2;
  scene.add(pMesh);
  panels.push({ mesh: pMesh, material: pMat });

  if (!mobile) {
    var rLight = new THREE.RectAreaLight('#fff8ee', 0.8, 3.2, 2.4);
    rLight.rotation.x = -Math.PI / 2;
    scene.add(rLight);
    rectLights.push(rLight);
  }
}

// ── State ────────────────────────────────────────────────────────────────────

var bounds = null;
var scrollProgress = 0;
var scrollDirty = true;
var lightsPhase = 0;
var isActive = false;
var assetsLoaded = false;
var lightsPositioned = false;
var cursorTarget = { x: 0, y: 0 };
var cursorCurrent = { x: 0, y: 0 };
var scrollZTarget = 12;

var doorStates = { left: null, right: null };
var _dPos = new THREE.Vector3();
var _hM = new THREE.Matrix4();
var _sM = new THREE.Matrix4();
var _uM = new THREE.Matrix4();
var _dM = new THREE.Matrix4();
var lastOpenness = null;

var cardInstances = [];
var cardLayout = null;
var lastPitch = [];
var mobileCardInit = false;
var bodyMaterials = [];

var _chM = new THREE.Matrix4();
var _cpM = new THREE.Matrix4();
var _cuM = new THREE.Matrix4();
var _cmM = new THREE.Matrix4();
var _cwP = new THREE.Vector3();
var _ctC = new THREE.Vector3();
var _pAx = new THREE.Vector3(0, 0, 1);

var clock = new THREE.Clock(false);

// ── Loaders ──────────────────────────────────────────────────────────────────

function loadFBX(url) {
  return new Promise(function(resolve, reject) {
    new FBXLoader().load(url, resolve, undefined, reject);
  });
}

function loadTexture(url) {
  return new Promise(function(resolve, reject) {
    new THREE.TextureLoader().load(url, resolve, undefined, reject);
  });
}

// ── Desktop container setup ──────────────────────────────────────────────────

function setupDesktopContainer(fbx) {
  var normalMap = createPlasticNormalMap();
  var bodyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(CONTAINER_COLOR), side: THREE.FrontSide,
    metalness: 1.0, roughness: 0.586, clearcoat: 1.0, clearcoatRoughness: 0.08,
    reflectivity: 0.6, specularIntensity: 0.85,
    specularColor: new THREE.Color(1, 1, 1), envMapIntensity: 1.35,
    normalMap: normalMap, normalScale: new THREE.Vector2(0.03, 0.03),
    sheen: 0.3, sheenRoughness: 0.3, sheenColor: new THREE.Color(0.85, 0.92, 1.0),
  });
  var doorMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(CONTAINER_COLOR), side: THREE.FrontSide,
    metalness: 1.0, roughness: 0.586, clearcoat: 1.0, clearcoatRoughness: 0.05,
    reflectivity: 0.65, specularIntensity: 0.9,
    specularColor: new THREE.Color(1, 1, 1), envMapIntensity: 1.45,
    sheen: 0.35, sheenRoughness: 0.25, sheenColor: new THREE.Color(0.88, 0.94, 1.0),
  });

  fbx.scale.setScalar(0.01);
  var box = new THREE.Box3().setFromObject(fbx);
  var center = box.getCenter(new THREE.Vector3());
  fbx.position.sub(center);
  fbx.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(fbx);

  var fbxInv = new THREE.Matrix4().copy(fbx.matrixWorld).invert();
  var doorDefs = [
    { name: 'ContainerContainer001', pivot: 'left' },
    { name: 'ContainerContainer002', pivot: 'right' },
  ];

  for (var di = 0; di < doorDefs.length; di++) {
    var def = doorDefs[di];
    var door = fbx.getObjectByName(def.name);
    if (!door) continue;
    door.material = doorMat;
    door.castShadow = true;
    door.receiveShadow = true;
    door.updateMatrix();
    var origM = door.matrix.clone();
    var dBox = new THREE.Box3().setFromObject(door);
    var dCenter = dBox.getCenter(new THREE.Vector3());
    var hingeX = def.pivot === 'left' ? dBox.min.x : dBox.max.x;
    var hingeW = new THREE.Vector3(hingeX, dCenter.y, dBox.max.z);
    var hingeL = hingeW.clone().applyMatrix4(fbxInv);
    doorStates[def.pivot] = { mesh: door, hinge: hingeL, originalMatrix: origM };
  }

  fbx.traverse(function(child) {
    if (child.isMesh && child.name !== 'ContainerContainer001' && child.name !== 'ContainerContainer002') {
      child.material = bodyMat;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(fbx);
  return fbx;
}

// ── Mobile container setup ───────────────────────────────────────────────────

function setupMobileContainer(meshes) {
  var root = new THREE.Group();
  var mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(CONTAINER_COLOR), side: THREE.FrontSide, toneMapped: true,
  });

  var box = new THREE.Box3();
  for (var mi = 0; mi < meshes.length; mi++) {
    var m = new THREE.Mesh(meshes[mi].geometry, mat);
    m.name = meshes[mi].name;
    root.add(m);
    box.expandByObject(m);
  }

  var center = box.getCenter(new THREE.Vector3());
  for (var ci = 0; ci < root.children.length; ci++) {
    root.children[ci].position.sub(center);
  }

  root.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(root);

  var rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  var doorDefs = [
    { name: 'ContainerContainer001', pivot: 'left' },
    { name: 'ContainerContainer002', pivot: 'right' },
  ];

  for (var di = 0; di < doorDefs.length; di++) {
    var def = doorDefs[di];
    var door = root.getObjectByName(def.name);
    if (!door) continue;
    door.updateMatrix();
    var origM = door.matrix.clone();
    var dBox = new THREE.Box3().setFromObject(door);
    var dCenter = dBox.getCenter(new THREE.Vector3());
    var hingeX = def.pivot === 'left' ? dBox.min.x : dBox.max.x;
    var hingeW = new THREE.Vector3(hingeX, dCenter.y, dBox.max.z);
    var hingeL = hingeW.clone().applyMatrix4(rootInv);
    doorStates[def.pivot] = { mesh: door, hinge: hingeL, originalMatrix: origM };
  }

  scene.add(root);
  return root;
}

// ── Card setup ───────────────────────────────────────────────────────────────

function setupCards(cardFbx, imageTextures) {
  var handleMat = mobile
    ? new THREE.MeshBasicMaterial({ color: new THREE.Color('#657681'), side: THREE.DoubleSide, toneMapped: true })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#b1c8d4'), emissive: new THREE.Color('#b1c8d4'),
        emissiveIntensity: 0.4, roughness: 1.0, metalness: 0.0, ior: 1.5,
        reflectivity: 0.2, specularIntensity: 0.25,
        specularColor: new THREE.Color(1, 1, 1), envMapIntensity: 0.0, side: THREE.DoubleSide,
      });

  for (var i = 0; i < cardCount; i++) {
    var side = i % 2 === 0 ? -1 : 1;
    var srcTex = imageTextures[i % imageTextures.length];
    var label = CARD_LABELS[i % CARD_LABELS.length];
    var labelCanvas = drawLabelOnCanvas(srcTex.image, label, side === -1, mobile ? 384 : undefined);

    var cardTex;
    if (labelCanvas) {
      cardTex = new THREE.CanvasTexture(labelCanvas);
      cardTex.colorSpace = THREE.SRGBColorSpace;
      cardTex.wrapS = THREE.ClampToEdgeWrapping;
      cardTex.wrapT = THREE.ClampToEdgeWrapping;
      cardTex.minFilter = mobile ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
      cardTex.magFilter = THREE.LinearFilter;
      cardTex.generateMipmaps = !mobile;
      cardTex.anisotropy = mobile ? 1 : 16;
      cardTex.needsUpdate = true;
    } else {
      cardTex = srcTex;
    }

    var cMat = createCardMaterial(cardTex, i * 97.3 + 12.7);
    bodyMaterials.push(cMat);

    var obj = cardFbx.clone(true);
    var handle = null;
    obj.traverse(function(child) {
      if (child.isMesh) {
        var isFace = child.name === 'Plane014';
        child.material = isFace ? cMat : handleMat;
        if (!mobile) { child.castShadow = true; child.receiveShadow = true; }
        if (isFace) handle = child;
      }
    });

    var cBox = new THREE.Box3().setFromObject(obj);
    var cCenter = cBox.getCenter(new THREE.Vector3());
    var cSize = cBox.getSize(new THREE.Vector3());
    var maxDim = Math.max(cSize.x, cSize.y, cSize.z, 1);
    obj.position.sub(cCenter);

    var hinge = new THREE.Vector3(-cSize.x * 0.5, 0, 0);
    if (handle) {
      var hBox = new THREE.Box3().setFromObject(handle);
      var hCenter = hBox.getCenter(new THREE.Vector3());
      hinge.set(hBox.max.x - cCenter.x, hCenter.y - cCenter.y, hBox.max.z - cCenter.z);
    }

    obj.updateMatrix();
    var baseMatrix = obj.matrix.clone();

    var group = new THREE.Group();
    group.add(obj);
    scene.add(group);

    cardInstances.push({
      object: obj, group: group, normalizedScale: 1 / maxDim,
      hinge: hinge, baseMatrix: baseMatrix, side: side, texture: cardTex,
    });
    lastPitch.push(-1);
  }
}

// ── Position hallway lights ──────────────────────────────────────────────────

function positionLights() {
  if (!bounds || lightsPositioned) return;
  lightsPositioned = true;
  var size = bounds.getSize(new THREE.Vector3());
  var len = bounds.max.z - bounds.min.z;
  var spacing = len / (PANEL_COUNT + 1);
  var topY = bounds.max.y - size.y * 0.02;

  for (var i = 0; i < PANEL_COUNT; i++) {
    var z = bounds.min.z + spacing * (i + 1);
    panels[i].mesh.position.set(0, topY, z);
    if (rectLights[i]) rectLights[i].position.set(0, topY - 0.05, z);
  }
}

// ── Compute card layout ──────────────────────────────────────────────────────

function computeCardLayout() {
  if (!bounds || cardLayout) return;
  var size = bounds.getSize(new THREE.Vector3());
  var xOff = size.x * 0.22;
  var zPad = size.z * 0.08;
  var tScale = THREE.MathUtils.clamp(size.y * 0.4, 0.28, 0.75);
  var cY = (bounds.min.y + bounds.max.y) * 0.5;

  cardLayout = [];
  for (var i = 0; i < cardCount; i++) {
    var side = i % 2 === 0 ? -1 : 1;
    var prog = cardCount > 1 ? i / (cardCount - 1) : 0.5;
    var z = THREE.MathUtils.lerp(bounds.max.z - zPad - 1.4, bounds.min.z + zPad + 0.4, prog);
    var yOff = ((i % 3) - 1) * size.y * 0.08;
    cardLayout.push({
      x: side * xOff, z: z, baseY: cY + yOff, side: side,
      scale: cardInstances[i].normalizedScale * tScale * 1.3,
      floatY: size.y * 0.01,
    });
  }
}

// ── Update functions ─────────────────────────────────────────────────────────

function updateLightsIntensity() {
  hemiLight.intensity = 0.7 * lightsPhase;
  ambientLight.intensity = 0.3 * lightsPhase;
  keyLight.intensity = 1.6 * lightsPhase;
  if (!mobile && scene.environmentIntensity !== undefined) {
    scene.environmentIntensity = 1.1 * lightsPhase;
  }
  for (var i = 0; i < PANEL_COUNT; i++) {
    var pp = THREE.MathUtils.clamp(lightsPhase * PANEL_COUNT - i, 0, 1);
    panels[i].material.emissiveIntensity = (mobile ? 0.16 : PANEL_EMISSIVE_INTENSITY) * pp;
    panels[i].material.opacity = 0.15 + 0.77 * pp;
    if (rectLights[i]) rectLights[i].intensity = BASE_LIGHT_INTENSITY * pp;
  }

  var opacity = THREE.MathUtils.clamp(lightsPhase, 0, 1);
  for (var mi = 0; mi < bodyMaterials.length; mi++) {
    bodyMaterials[mi].transparent = opacity < 1;
    bodyMaterials[mi].opacity = opacity;
    bodyMaterials[mi].depthWrite = opacity >= 1;
    bodyMaterials[mi].needsUpdate = true;
  }
}

function updateCamera() {
  if (!bounds) return;
  if (scrollDirty) {
    var startZ = bounds.max.z - CAMERA_OFFSET;
    var endZ = mobile ? bounds.min.z + 0.8 : bounds.min.z - CAMERA_OFFSET;
    var p = Math.min(1, scrollProgress * SCENE_PROGRESS_GAIN);
    scrollZTarget = startZ + (endZ - startZ) * p;
    scrollDirty = false;
  }
  if (!mobile) {
    cursorCurrent.x = THREE.MathUtils.lerp(cursorCurrent.x, cursorTarget.x, CURSOR_LERP);
    cursorCurrent.y = THREE.MathUtils.lerp(cursorCurrent.y, cursorTarget.y, CURSOR_LERP);
  }
  camera.position.set(mobile ? 0 : cursorCurrent.x, mobile ? 0 : cursorCurrent.y, scrollZTarget);
}

function updateDoors() {
  var ref = doorStates.left || doorStates.right;
  if (!ref) return;
  _dPos.copy(ref.hinge);
  if (ref.mesh.parent) _dPos.applyMatrix4(ref.mesh.parent.matrixWorld);
  var dist = camera.position.distanceTo(_dPos);
  var doorFull = mobile ? DOOR_FULL_OPEN_MOBILE : DOOR_FULL_OPEN;
  var t = THREE.MathUtils.clamp((DOOR_OPEN_START - dist) / (DOOR_OPEN_START - doorFull), 0, 1);
  var openness = t * (Math.PI * 0.5);
  if (lastOpenness !== null && Math.abs(openness - lastOpenness) < 0.0001) return;
  lastOpenness = openness;
  applyDoorRotation(doorStates.left, openness, _hM, _sM, _uM, _dM);
  applyDoorRotation(doorStates.right, -openness, _hM, _sM, _uM, _dM);
}

function updateCards() {
  if (!cardLayout) return;
  var elapsed = clock.getElapsedTime();

  for (var si = 0; si < bodyMaterials.length; si++) {
    var sh = bodyMaterials[si].userData.shader;
    if (sh) sh.uniforms.uTime.value = elapsed;
  }

  if (mobile) {
    if (mobileCardInit) return;
    for (var i = 0; i < cardCount; i++) {
      var c = cardInstances[i], l = cardLayout[i];
      c.group.position.set(l.x, l.baseY, l.z);
      c.group.rotation.set(0, l.side === -1 ? Math.PI : 0, 0);
      c.group.scale.setScalar(l.scale);
    }
    mobileCardInit = true;
    return;
  }

  for (var i = 0; i < cardCount; i++) {
    var card = cardInstances[i], lay = cardLayout[i];
    var phase = i * 0.7;
    var floatY = Math.sin(elapsed * 1.2 + phase) * lay.floatY;
    var fRotX = Math.sin(elapsed * 0.8 + phase) * 0.015;
    var fRotZ = Math.cos(elapsed * 0.6 + phase) * 0.01;

    card.group.position.set(lay.x, lay.baseY + floatY, lay.z);
    card.group.rotation.set(fRotX, lay.side === -1 ? Math.PI : 0, fRotZ);
    card.group.scale.setScalar(lay.scale);

    _cwP.set(lay.x, lay.baseY + floatY, lay.z);
    _ctC.copy(camera.position).sub(_cwP);
    var dist = _ctC.length();
    var t = THREE.MathUtils.clamp((CARD_PITCH_START - dist) / (CARD_PITCH_START - CARD_PITCH_FULL), 0, 1);
    var pitch = t * CARD_MAX_PITCH;

    if (Math.abs(pitch - lastPitch[i]) > 0.0001 || lastPitch[i] < 0) {
      lastPitch[i] = pitch;
      _chM.makeTranslation(card.hinge.x, card.hinge.y, card.hinge.z);
      _cpM.makeRotationAxis(_pAx, pitch);
      _cuM.makeTranslation(-card.hinge.x, -card.hinge.y, -card.hinge.z);
      _cmM.copy(_chM).multiply(_cpM).multiply(_cuM).multiply(card.baseMatrix);
      _cmM.decompose(card.object.position, card.object.quaternion, card.object.scale);
    }
  }
}

// ── Render loop ──────────────────────────────────────────────────────────────

function animate() {
  if (!isActive) return;
  requestAnimationFrame(animate);
  updateCamera();
  updateDoors();
  updateCards();
  updateLightsIntensity();
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function startRendering() {
  if (isActive || !assetsLoaded) return;
  isActive = true;
  clock.start();
  animate();
}

function stopRendering() {
  isActive = false;
  clock.stop();
}

// ── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', function() {
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
});

// ── Scroll & input ───────────────────────────────────────────────────────────

var ST = window.ScrollTrigger;

ST.create({
  trigger: '#products',
  start: 'top top',
  end: 'bottom bottom',
  scrub: 0.5,
  onUpdate: function(self) {
    scrollProgress = self.progress;
    scrollDirty = true;
  },
});

ST.create({
  trigger: '#products',
  start: 'top bottom',
  end: 'top top',
  scrub: true,
  onUpdate: function(self) {
    lightsPhase = self.progress;
  },
});

ST.create({
  trigger: '#products',
  start: 'top bottom',
  end: 'bottom top',
  onUpdate: function(self) {
    var p = self.progress;
    var fadeIn = 0.08, fadeOut = 0.92;
    var opacity;
    if (p < fadeIn) opacity = p / fadeIn;
    else if (p > fadeOut) opacity = (1 - p) / (1 - fadeOut);
    else opacity = 1;
    containerEl.style.opacity = opacity;
  },
  onEnter: function() { containerEl.style.visibility = 'visible'; startRendering(); },
  onLeave: function() { containerEl.style.visibility = 'hidden'; stopRendering(); },
  onEnterBack: function() { containerEl.style.visibility = 'visible'; startRendering(); },
  onLeaveBack: function() { containerEl.style.visibility = 'hidden'; stopRendering(); },
});

if (!mobile) {
  window.addEventListener('mousemove', function(e) {
    cursorTarget.x = (e.clientX / window.innerWidth - 0.5) * MAX_CURSOR_PARALLAX;
    cursorTarget.y = (e.clientY / window.innerHeight - 0.5) * -MAX_CURSOR_PARALLAX;
  }, { passive: true });
}

// ── Load & init ──────────────────────────────────────────────────────────────

(async function() {
  try {
    var texPromises = CARD_PATHS.slice(0, cardCount).map(loadTexture);
    var cardTextures = await Promise.all(texPromises);

    if (mobile) {
      var resp = await fetch('./assets/product/container-mobile.bin');
      var buf = await resp.arrayBuffer();
      setupMobileContainer(parseMobileContainer(buf));
    } else {
      var fbx = await loadFBX('./assets/product/container.fbx');
      setupDesktopContainer(fbx);
    }

    var cardFbx = await loadFBX('./assets/product/card.fbx');
    setupCards(cardFbx, cardTextures);

    positionLights();
    computeCardLayout();
    assetsLoaded = true;
  } catch (err) {
    console.error('Container scene failed to load:', err);
  }
})();
