// 引入 Three.js 核心库。
// 它负责场景、相机、材质、灯光、渲染器这些最基础的 3D 能力。
import * as THREE from "three";

// 轨道控制器：负责鼠标旋转、缩放、平移视角。
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// 位移控制器：负责出现三轴 gizmo，让你直接拖动对象位置。
import { TransformControls } from "three/addons/controls/TransformControls.js";

// GLB 加载器：读取 .glb / .gltf 模型。
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// HDR 加载器：读取 .hdr 环境贴图。
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

// ---------------------------------------------------------------------------
// 1. 先拿到页面里的 DOM 元素
// ---------------------------------------------------------------------------

const app = document.querySelector("#app");

const statusModelEl = document.querySelector("#status-model");
const statusHDREl = document.querySelector("#status-hdr");
const statusSelectionEl = document.querySelector("#status-selection");
const objectListEl = document.querySelector("#object-list");
const materialInspectorEl = document.querySelector("#material-inspector");
const basicInfoInspectorEl = document.querySelector("#basic-info-inspector");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");

const loadSceneBtn = document.querySelector("#load-scene-btn");
const loadTeaBtn = document.querySelector("#load-tea-btn");
const pickGLBBtn = document.querySelector("#pick-glb-btn");
const showFallbackBtn = document.querySelector("#show-fallback-btn");

const loadDefaultHDRBtn = document.querySelector("#load-default-hdr-btn");
const pickHDRBtn = document.querySelector("#pick-hdr-btn");

const resetViewBtn = document.querySelector("#reset-view-btn");
const clearSelectionBtn = document.querySelector("#clear-selection-btn");
const toggleMoveBtn = document.querySelector("#toggle-move-btn");
const showAllBtn = document.querySelector("#show-all-btn");

const glbInput = document.querySelector("#glb-input");
const hdrInput = document.querySelector("#hdr-input");

// ---------------------------------------------------------------------------
// 2. 一些固定路径
// ---------------------------------------------------------------------------

const DEFAULT_SCENE_PATH = "./assets/scene.glb";
const DEFAULT_TEA_PATH = "./assets/tea.glb";
const DEFAULT_HDR_PATH = "./assets/studio_small_09_4k.hdr";

const MATERIAL_PRESET_OPTIONS = [
  { value: "original", label: "原材质" },
  { value: "basic", label: "MeshBasicMaterial" },
  { value: "lambert", label: "MeshLambertMaterial" },
  { value: "phong", label: "MeshPhongMaterial" },
  { value: "standard", label: "MeshStandardMaterial" },
  { value: "physical", label: "MeshPhysicalMaterial" },
  { value: "shader-ripple", label: "自定义 Shader 波纹" },
];

// ---------------------------------------------------------------------------
// 3. 创建渲染器、场景、相机
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#dbeafe");

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  200
);
camera.position.set(4, 3, 6);

// ---------------------------------------------------------------------------
// 4. 相机控制和位移控制
// ---------------------------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.8, 0);
controls.minDistance = 0.2;
controls.maxDistance = 60;

// TransformControls 会显示三轴坐标轴，让你拖动对象。
// 这里我们只启用“平移”模式，不做旋转和缩放。
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode("translate");
transformControls.enabled = true;
transformControls.visible = false;
scene.add(transformControls);

// 当你正在拖动对象时，先把 OrbitControls 暂时关掉，
// 否则会出现“拖对象”和“转镜头”互相抢输入的问题。
transformControls.addEventListener("dragging-changed", (event) => {
  controls.enabled = !event.value;
});

// ---------------------------------------------------------------------------
// 5. 灯光
// ---------------------------------------------------------------------------

// 半球光：给暗部一点基础亮度，避免完全死黑。
const hemiLight = new THREE.HemisphereLight("#ffffff", "#8090a0", 0.35);
scene.add(hemiLight);

// 平行光：负责主要直射光和阴影。
const dirLight = new THREE.DirectionalLight("#ffffff", 2.2);
dirLight.position.set(5, 8, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;
dirLight.shadow.camera.left = -8;
dirLight.shadow.camera.right = 8;
dirLight.shadow.camera.top = 8;
dirLight.shadow.camera.bottom = -8;
dirLight.shadow.bias = -0.0005;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);
scene.add(dirLight.target);

// ---------------------------------------------------------------------------
// 6. HDR 环境贴图相关对象
// ---------------------------------------------------------------------------

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const rgbeLoader = new RGBELoader();

// ---------------------------------------------------------------------------
// 7. 运行时状态
// ---------------------------------------------------------------------------

let fallbackGroup = null;
let currentRoot = null;
let selectedObject = null;
let moveModeEnabled = true;

let currentModelObjectURL = null;
let currentHDRObjectURL = null;
let currentHDRTexture = null;
let currentEnvironmentTarget = null;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let currentInspectorTarget = materialInspectorEl;

const customRippleVertexShader = `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const customRippleFragmentShader = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uLightDirection;
uniform float uWaveScale;
uniform float uSpeed;
uniform float uFresnelPower;
uniform float uGlow;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec2 uv = vUv * 3.0;

  float waveA = sin((uv.x + uTime * uSpeed) * uWaveScale);
  float waveB = sin((uv.y * 1.37 - uTime * uSpeed * 0.82) * (uWaveScale * 1.15));
  float waveC = sin(((uv.x + uv.y) * 0.5 + uTime * uSpeed * 0.4) * (uWaveScale * 0.7));

  float wave = waveA * 0.5 + waveB * 0.35 + waveC * 0.15;
  wave = wave * 0.5 + 0.5;
  wave = smoothstep(0.15, 0.85, wave);

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(uLightDirection);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  float diffuse = max(dot(normal, lightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), uFresnelPower);

  vec3 baseColor = mix(uColorA, uColorB, wave);
  vec3 color = baseColor * (0.28 + diffuse * 0.72);
  color += fresnel * uGlow;

  gl_FragColor = vec4(color, 1.0);
}
`;

// ---------------------------------------------------------------------------
// 8. 一些通用小工具
// ---------------------------------------------------------------------------

function setModelStatus(text) {
  statusModelEl.textContent = `模型状态：${text}`;
}

function setHDRStatus(text) {
  statusHDREl.textContent = `HDR 状态：${text}`;
}

function setSelectionStatus(text) {
  statusSelectionEl.textContent = `当前选中：${text}`;
}

function switchInspectorTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === tabName;
    button.classList.toggle("is-active", isActive);
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("is-active", isActive);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchInspectorTab(button.dataset.tabTarget);
  });
});

function getDisplayName(object) {
  if (!object) {
    return "无";
  }

  const baseName = object.name && object.name.trim() ? object.name : "未命名对象";
  return `${baseName} (${object.type})`;
}

function revokeModelObjectURL() {
  if (currentModelObjectURL) {
    URL.revokeObjectURL(currentModelObjectURL);
    currentModelObjectURL = null;
  }
}

function revokeHDLObjectURL() {
  if (currentHDRObjectURL) {
    URL.revokeObjectURL(currentHDRObjectURL);
    currentHDRObjectURL = null;
  }
}

function getActiveRoot() {
  if (currentRoot) {
    return currentRoot;
  }
  return fallbackGroup;
}

function collectMeshes(root) {
  const meshList = [];
  if (!root) {
    return meshList;
  }

  root.traverse((child) => {
    if (child.isMesh && child.visible) {
      meshList.push(child);
    }
  });

  return meshList;
}

function findSelectableObject(clickedObject, root) {
  if (!clickedObject || !root) {
    return null;
  }

  let current = clickedObject;

  // 一直往上找，尽量找到 root 下面的直接子对象。
  // 这样复杂模型里点击一个小零件时，不会总是只选到最底层三角面。
  while (current.parent && current.parent !== root) {
    current = current.parent;
  }

  return current;
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  for (const key of Object.keys(material)) {
    const value = material[key];
    if (value && typeof value === "object" && "isTexture" in value) {
      value.dispose();
    }
  }

  material.dispose();
}

function disposeObject3D(root) {
  if (!root) {
    return;
  }

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      disposeMaterial(child.material);
    }
  });
}

function cloneMaterial(material) {
  if (!material) {
    return null;
  }

  if (Array.isArray(material)) {
    return material.map((item) => item.clone());
  }

  return material.clone();
}

function getPrimaryMaterial(material) {
  if (Array.isArray(material)) {
    return material[0] || null;
  }

  return material || null;
}

function rememberOriginalMaterial(mesh) {
  if (!mesh.userData.originalMaterial) {
    mesh.userData.originalMaterial = cloneMaterial(mesh.material);
  }

  const currentMaterial = getPrimaryMaterial(mesh.material);
  if (currentMaterial) {
    currentMaterial.userData = currentMaterial.userData || {};
    if (!currentMaterial.userData.materialPreset) {
      currentMaterial.userData.materialPreset = "original";
    }
  }
}

function copyCommonMaterialProps(sourceMaterial, targetMaterial) {
  if (!sourceMaterial || !targetMaterial) {
    return;
  }

  if (sourceMaterial.color && targetMaterial.color) {
    targetMaterial.color.copy(sourceMaterial.color);
  }

  if (sourceMaterial.emissive && targetMaterial.emissive) {
    targetMaterial.emissive.copy(sourceMaterial.emissive);
  }

  if ("emissiveIntensity" in sourceMaterial && "emissiveIntensity" in targetMaterial) {
    targetMaterial.emissiveIntensity = sourceMaterial.emissiveIntensity;
  }

  if ("roughness" in sourceMaterial && "roughness" in targetMaterial) {
    targetMaterial.roughness = sourceMaterial.roughness;
  }

  if ("metalness" in sourceMaterial && "metalness" in targetMaterial) {
    targetMaterial.metalness = sourceMaterial.metalness;
  }

  if ("envMapIntensity" in sourceMaterial && "envMapIntensity" in targetMaterial) {
    targetMaterial.envMapIntensity = sourceMaterial.envMapIntensity;
  }

  if ("opacity" in sourceMaterial && "opacity" in targetMaterial) {
    targetMaterial.opacity = sourceMaterial.opacity;
  }

  targetMaterial.transparent = !!sourceMaterial.transparent;
  targetMaterial.side = sourceMaterial.side;
  targetMaterial.wireframe = !!sourceMaterial.wireframe;

  if ("map" in targetMaterial) {
    targetMaterial.map = sourceMaterial.map || null;
  }

  if ("normalMap" in targetMaterial) {
    targetMaterial.normalMap = sourceMaterial.normalMap || null;
  }

  if ("roughnessMap" in targetMaterial) {
    targetMaterial.roughnessMap = sourceMaterial.roughnessMap || null;
  }

  if ("metalnessMap" in targetMaterial) {
    targetMaterial.metalnessMap = sourceMaterial.metalnessMap || null;
  }

  if ("aoMap" in targetMaterial) {
    targetMaterial.aoMap = sourceMaterial.aoMap || null;
  }

  if ("emissiveMap" in targetMaterial) {
    targetMaterial.emissiveMap = sourceMaterial.emissiveMap || null;
  }

  if ("clearcoat" in sourceMaterial && "clearcoat" in targetMaterial) {
    targetMaterial.clearcoat = sourceMaterial.clearcoat;
  }

  if (
    "clearcoatRoughness" in sourceMaterial &&
    "clearcoatRoughness" in targetMaterial
  ) {
    targetMaterial.clearcoatRoughness = sourceMaterial.clearcoatRoughness;
  }

  if ("transmission" in sourceMaterial && "transmission" in targetMaterial) {
    targetMaterial.transmission = sourceMaterial.transmission;
  }

  if ("ior" in sourceMaterial && "ior" in targetMaterial) {
    targetMaterial.ior = sourceMaterial.ior;
  }

  if ("thickness" in sourceMaterial && "thickness" in targetMaterial) {
    targetMaterial.thickness = sourceMaterial.thickness;
  }

  targetMaterial.needsUpdate = true;
}

function createCustomRippleMaterial(sourceMaterial) {
  const colorA = sourceMaterial?.color
    ? sourceMaterial.color.clone()
    : new THREE.Color("#f4b4a8");
  const colorB = colorA.clone().offsetHSL(-0.08, 0.08, -0.12);

  const material = new THREE.ShaderMaterial({
    vertexShader: customRippleVertexShader,
    fragmentShader: customRippleFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uLightDirection: { value: new THREE.Vector3(0.4, 1, 0.6).normalize() },
      uWaveScale: { value: 12 },
      uSpeed: { value: 1.2 },
      uFresnelPower: { value: 3.2 },
      uGlow: { value: 0.28 },
    },
  });

  material.userData = material.userData || {};
  material.userData.materialPreset = "shader-ripple";
  material.userData.shaderLabel = "Shadertoy 风格波纹";
  return material;
}

function createMaterialFromPreset(presetKey, sourceMaterial) {
  let material = null;

  if (presetKey === "basic") {
    material = new THREE.MeshBasicMaterial();
  }

  if (presetKey === "lambert") {
    material = new THREE.MeshLambertMaterial();
  }

  if (presetKey === "phong") {
    material = new THREE.MeshPhongMaterial({ shininess: 80 });
  }

  if (presetKey === "standard") {
    material = new THREE.MeshStandardMaterial();
  }

  if (presetKey === "physical") {
    material = new THREE.MeshPhysicalMaterial();
  }

  if (presetKey === "shader-ripple") {
    return createCustomRippleMaterial(sourceMaterial);
  }

  if (!material) {
    return null;
  }

  copyCommonMaterialProps(sourceMaterial, material);
  material.userData = material.userData || {};
  material.userData.materialPreset = presetKey;
  return material;
}

function replaceSelectedMaterial(presetKey) {
  if (!selectedObject || !selectedObject.isMesh) {
    return;
  }

  const previousMaterial = selectedObject.material;
  const previousPrimaryMaterial = getPrimaryMaterial(previousMaterial);
  const sourceMaterial =
    getPrimaryMaterial(selectedObject.userData.originalMaterial) ||
    previousPrimaryMaterial;

  let nextMaterial = null;

  if (presetKey === "original") {
    nextMaterial = cloneMaterial(selectedObject.userData.originalMaterial);
  } else {
    nextMaterial = createMaterialFromPreset(presetKey, sourceMaterial);
  }

  if (!nextMaterial) {
    return;
  }

  selectedObject.material = nextMaterial;

  if (Array.isArray(nextMaterial)) {
    nextMaterial.forEach(prepareMaterial);
  } else {
    prepareMaterial(nextMaterial);
  }

  if (previousMaterial && previousMaterial !== selectedObject.userData.originalMaterial) {
    disposeMaterial(previousMaterial);
  }

  selectObject(selectedObject);
}

// ---------------------------------------------------------------------------
// 9. 默认内置演示
// ---------------------------------------------------------------------------

function showFallbackDemo() {
  removeCurrentModel();

  fallbackGroup = new THREE.Group();
  fallbackGroup.name = "内置示例";

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({
      color: "#cbd5e1",
      roughness: 1,
      metalness: 0,
    })
  );
  floor.name = "示例地面";
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  rememberOriginalMaterial(floor);
  fallbackGroup.add(floor);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: "#f97316",
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  cube.name = "示例立方体";
  cube.position.y = 0.5;
  cube.castShadow = true;
  cube.receiveShadow = true;
  rememberOriginalMaterial(cube);
  fallbackGroup.add(cube);

  const grid = new THREE.GridHelper(12, 12, "#64748b", "#94a3b8");
  grid.name = "示例网格";
  grid.position.y = 0.001;
  fallbackGroup.add(grid);

  scene.add(fallbackGroup);
  frameModel(fallbackGroup);
  refreshObjectManager();
  clearSelection();
  setModelStatus("当前显示的是内置示例。");
}

// ---------------------------------------------------------------------------
// 10. 清理旧模型
// ---------------------------------------------------------------------------

function removeCurrentModel() {
  clearSelection();

  if (currentRoot) {
    scene.remove(currentRoot);
    disposeObject3D(currentRoot);
    currentRoot = null;
  }

  if (fallbackGroup) {
    scene.remove(fallbackGroup);
    disposeObject3D(fallbackGroup);
    fallbackGroup = null;
  }

  revokeModelObjectURL();
}

// ---------------------------------------------------------------------------
// 11. 准备模型材质和阴影
// ---------------------------------------------------------------------------

function prepareMaterial(material) {
  if (!material) {
    return;
  }

  if (material.map) {
    material.map.colorSpace = THREE.SRGBColorSpace;
  }

  if ("needsUpdate" in material) {
    material.needsUpdate = true;
  }
}

function prepareModel(root) {
  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.castShadow = true;
    child.receiveShadow = true;
    rememberOriginalMaterial(child);

    if (Array.isArray(child.material)) {
      child.material.forEach(prepareMaterial);
      return;
    }

    prepareMaterial(child.material);
  });
}

// ---------------------------------------------------------------------------
// 12. 自动构图
// ---------------------------------------------------------------------------

function frameModel(root) {
  if (!root) {
    return;
  }

  root.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;

  root.updateWorldMatrix(true, true);

  const framedBox = new THREE.Box3().setFromObject(root);
  const sphere = framedBox.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.5);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const distance = radius / Math.tan(halfFov);

  const viewOffset = new THREE.Vector3(1, 0.6, 1.2)
    .normalize()
    .multiplyScalar(distance * 1.35);

  camera.near = Math.max(radius / 200, 0.01);
  camera.far = Math.max(radius * 40, 200);
  camera.updateProjectionMatrix();

  camera.position.copy(sphere.center).add(viewOffset);
  controls.target.copy(sphere.center);
  controls.minDistance = Math.max(radius * 0.08, 0.08);
  controls.maxDistance = Math.max(radius * 12, 30);
  controls.update();

  dirLight.target.position.copy(sphere.center);
  dirLight.shadow.camera.left = -radius * 2.5;
  dirLight.shadow.camera.right = radius * 2.5;
  dirLight.shadow.camera.top = radius * 2.5;
  dirLight.shadow.camera.bottom = -radius * 2.5;
  dirLight.shadow.camera.far = Math.max(radius * 12, 30);
  dirLight.shadow.camera.updateProjectionMatrix();

  console.log("模型最大尺寸:", Math.max(size.x, size.y, size.z));
}

// ---------------------------------------------------------------------------
// 13. 对象选择和对象管理器
// ---------------------------------------------------------------------------

function clearSelection() {
  selectedObject = null;
  transformControls.detach();
  transformControls.visible = false;
  setSelectionStatus("无");
  refreshObjectManager();
  renderInspectors();
}

function selectObject(object) {
  if (!object) {
    clearSelection();
    return;
  }

  selectedObject = object;
  setSelectionStatus(getDisplayName(object));

  if (moveModeEnabled) {
    transformControls.attach(object);
    transformControls.visible = true;
  } else {
    transformControls.detach();
    transformControls.visible = false;
  }

  refreshObjectManager();
  renderInspectors();
}

function buildObjectRows(root, depth = 0, rows = []) {
  if (!root) {
    return rows;
  }

  if (root !== transformControls && root.type !== "TransformControls") {
    rows.push({ object: root, depth });
  }

  root.children.forEach((child) => {
    buildObjectRows(child, depth + 1, rows);
  });

  return rows;
}

function refreshObjectManager() {
  objectListEl.innerHTML = "";

  const root = getActiveRoot();

  if (!root) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "当前还没有可管理的对象。";
    objectListEl.appendChild(empty);
    return;
  }

  const rows = buildObjectRows(root);

  rows.forEach(({ object, depth }) => {
    const row = document.createElement("div");
    row.className = "tree-item";
    if (object === selectedObject) {
      row.classList.add("selected");
    }
    row.style.marginLeft = `${depth * 10}px`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = object.visible;
    checkbox.addEventListener("change", () => {
      object.visible = checkbox.checked;
      if (!object.visible && object === selectedObject) {
        clearSelection();
      } else {
        refreshObjectManager();
        renderInspectors();
      }
    });

    const label = document.createElement("div");
    label.className = "tree-label";
    label.textContent = object.name && object.name.trim() ? object.name : "未命名对象";

    const type = document.createElement("span");
    type.className = "tree-type";
    type.textContent = object.type;
    label.appendChild(type);

    const selectBtn = document.createElement("button");
    selectBtn.className = "secondary";
    selectBtn.textContent = object === selectedObject ? "已选中" : "选中";
    selectBtn.addEventListener("click", () => {
      selectObject(object);
    });

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(selectBtn);
    objectListEl.appendChild(row);
  });
}

function showAllObjects() {
  const root = getActiveRoot();
  if (!root) {
    return;
  }

  root.traverse((child) => {
    child.visible = true;
  });

  refreshObjectManager();
  renderInspectors();
}

// ---------------------------------------------------------------------------
// 14. 材质参数面板
// ---------------------------------------------------------------------------

function clearMaterialInspector(message) {
  materialInspectorEl.innerHTML = "";

  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  materialInspectorEl.appendChild(empty);
}

function clearBasicInfoInspector(message) {
  basicInfoInspectorEl.innerHTML = "";

  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = message;
  basicInfoInspectorEl.appendChild(empty);
}

function getSelectedMaterialInfo() {
  if (!selectedObject) {
    return null;
  }

  if (!selectedObject.isMesh) {
    return {
      object: selectedObject,
      material: null,
      isArrayMaterial: false,
    };
  }

  if (Array.isArray(selectedObject.material)) {
    return {
      object: selectedObject,
      material: selectedObject.material[0] || null,
      isArrayMaterial: true,
    };
  }

  return {
    object: selectedObject,
    material: selectedObject.material || null,
    isArrayMaterial: false,
  };
}

function createInspectorSectionTitle(text) {
  const title = document.createElement("h3");
  title.textContent = text;
  title.style.marginTop = "14px";
  title.style.marginBottom = "8px";
  title.style.fontSize = "13px";
  currentInspectorTarget.appendChild(title);
}

function createInfoRow(labelText, valueText) {
  const row = document.createElement("div");
  row.className = "tree-item";

  const label = document.createElement("div");
  label.className = "tree-label";
  label.textContent = labelText;

  const value = document.createElement("div");
  value.className = "tree-label";
  value.style.textAlign = "right";
  value.textContent = valueText;

  row.appendChild(label);
  row.appendChild(value);
  currentInspectorTarget.appendChild(row);
}

function createBooleanControl(labelText, checked, onChange) {
  const row = document.createElement("div");
  row.className = "tree-item";

  const label = document.createElement("div");
  label.className = "tree-label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    onChange(input.checked);
  });

  row.appendChild(label);
  row.appendChild(input);
  currentInspectorTarget.appendChild(row);
}

function createColorControl(labelText, colorValue, onChange) {
  const row = document.createElement("div");
  row.className = "tree-item";

  const label = document.createElement("div");
  label.className = "tree-label";
  label.textContent = labelText;

  const input = document.createElement("input");
  input.type = "color";
  input.value = colorValue;
  input.addEventListener("input", () => {
    onChange(input.value);
  });

  row.appendChild(label);
  row.appendChild(input);
  currentInspectorTarget.appendChild(row);
}

function createNumberControl(
  labelText,
  value,
  min,
  max,
  step,
  onChange
) {
  const row = document.createElement("div");
  row.className = "tree-item";
  row.style.alignItems = "stretch";
  row.style.flexDirection = "column";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.gap = "8px";

  const label = document.createElement("div");
  label.className = "tree-label";
  label.textContent = labelText;

  const numberInput = document.createElement("input");
  numberInput.type = "number";
  numberInput.min = String(min);
  numberInput.max = String(max);
  numberInput.step = String(step);
  numberInput.value = String(value);
  numberInput.style.width = "80px";

  top.appendChild(label);
  top.appendChild(numberInput);

  const rangeInput = document.createElement("input");
  rangeInput.type = "range";
  rangeInput.min = String(min);
  rangeInput.max = String(max);
  rangeInput.step = String(step);
  rangeInput.value = String(value);

  const syncValue = (nextValue) => {
    const parsed = Number(nextValue);
    numberInput.value = String(parsed);
    rangeInput.value = String(parsed);
    onChange(parsed);
  };

  numberInput.addEventListener("input", () => {
    syncValue(numberInput.value);
  });

  rangeInput.addEventListener("input", () => {
    syncValue(rangeInput.value);
  });

  row.appendChild(top);
  row.appendChild(rangeInput);
  currentInspectorTarget.appendChild(row);
}

function createSelectControl(labelText, value, options, onChange) {
  const row = document.createElement("div");
  row.className = "tree-item";
  row.style.alignItems = "stretch";
  row.style.flexDirection = "column";

  const label = document.createElement("div");
  label.className = "tree-label";
  label.textContent = labelText;

  const select = document.createElement("select");
  select.style.marginTop = "8px";
  select.style.padding = "8px 10px";
  select.style.borderRadius = "10px";
  select.style.border = "0";
  select.style.background = "rgba(255, 255, 255, 0.1)";
  select.style.color = "#f8fafc";
  select.style.colorScheme = "dark";

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.style.color = "#0f172a";
    element.style.backgroundColor = "#ffffff";
    if (option.value === value) {
      element.selected = true;
    }
    select.appendChild(element);
  });

  select.addEventListener("change", () => {
    onChange(select.value);
  });

  row.appendChild(label);
  row.appendChild(select);
  currentInspectorTarget.appendChild(row);
}

function renderLegacyMaterialInspector() {
  const info = getSelectedMaterialInfo();

  if (!info) {
    clearMaterialInspector("当前没有选中对象。");
    return;
  }

  if (!info.object.isMesh) {
    clearMaterialInspector("当前选中的是 Group，不是 Mesh。请选中右侧的具体网格对象。");
    return;
  }

  if (!info.material) {
    clearMaterialInspector("当前选中的 Mesh 没有可编辑材质。");
    return;
  }

  const { object, material, isArrayMaterial } = info;
  const currentPreset = material.userData?.materialPreset || "original";

  materialInspectorEl.innerHTML = "";

  createInspectorSectionTitle("基础信息");
  createInfoRow("对象名", object.name || "未命名对象");
  createInfoRow("对象类型", object.type);
  createInfoRow("材质类型", material.type || "未知");
  createInfoRow("材质预设", currentPreset);
  createInfoRow("颜色贴图", material.map ? "有" : "无");
  createInfoRow("法线贴图", material.normalMap ? "有" : "无");
  createInfoRow("粗糙度贴图", material.roughnessMap ? "有" : "无");
  createInfoRow("金属度贴图", material.metalnessMap ? "有" : "无");
  createInfoRow("环境贴图", material.envMap ? "有" : "无");

  if (isArrayMaterial) {
    createInfoRow("多材质提示", "当前只编辑第一个材质");
  }

  createInspectorSectionTitle("对象参数");
  createBooleanControl("对象可见", object.visible, (value) => {
    object.visible = value;
    if (!value && object === selectedObject) {
      clearSelection();
      return;
    }
    refreshObjectManager();
  });
  createBooleanControl("投射阴影", object.castShadow, (value) => {
    object.castShadow = value;
  });
  createBooleanControl("接收阴影", object.receiveShadow, (value) => {
    object.receiveShadow = value;
  });

  createInspectorSectionTitle("材质类型切换");
  createSelectControl(
    "替换为 Three.js 预制材质 / 自定义 Shader",
    currentPreset,
    MATERIAL_PRESET_OPTIONS,
    (value) => {
      replaceSelectedMaterial(value);
    }
  );

  createInspectorSectionTitle("材质参数");

  if (material.color) {
    createColorControl(
      "基础颜色",
      `#${material.color.getHexString()}`,
      (value) => {
        material.color.set(value);
      }
    );
  }

  if ("roughness" in material) {
    createNumberControl(
      "粗糙度 roughness",
      material.roughness,
      0,
      1,
      0.01,
      (value) => {
        material.roughness = value;
      }
    );
  }

  if ("metalness" in material) {
    createNumberControl(
      "金属度 metalness",
      material.metalness,
      0,
      1,
      0.01,
      (value) => {
        material.metalness = value;
      }
    );
  }

  if ("envMapIntensity" in material) {
    createNumberControl(
      "环境反射 envMapIntensity",
      material.envMapIntensity,
      0,
      10,
      0.01,
      (value) => {
        material.envMapIntensity = value;
      }
    );
  }

  if ("opacity" in material) {
    createNumberControl(
      "透明度 opacity",
      material.opacity,
      0,
      1,
      0.01,
      (value) => {
        material.opacity = value;
        material.transparent = value < 1;
        material.needsUpdate = true;
      }
    );
  }

  if ("clearcoat" in material) {
    createNumberControl(
      "清漆 clearcoat",
      material.clearcoat,
      0,
      1,
      0.01,
      (value) => {
        material.clearcoat = value;
      }
    );
  }

  if ("clearcoatRoughness" in material) {
    createNumberControl(
      "清漆粗糙度 clearcoatRoughness",
      material.clearcoatRoughness,
      0,
      1,
      0.01,
      (value) => {
        material.clearcoatRoughness = value;
      }
    );
  }

  if ("transmission" in material) {
    createNumberControl(
      "透射 transmission",
      material.transmission,
      0,
      1,
      0.01,
      (value) => {
        material.transmission = value;
      }
    );
  }

  if ("ior" in material) {
    createNumberControl("折射率 ior", material.ior, 1, 2.5, 0.01, (value) => {
      material.ior = value;
    });
  }

  if ("thickness" in material) {
    createNumberControl(
      "厚度 thickness",
      material.thickness,
      0,
      10,
      0.01,
      (value) => {
        material.thickness = value;
      }
    );
  }

  if (material.emissive) {
    createColorControl(
      "自发光 emissive",
      `#${material.emissive.getHexString()}`,
      (value) => {
        material.emissive.set(value);
      }
    );
  }

  if ("emissiveIntensity" in material) {
    createNumberControl(
      "自发光强度 emissiveIntensity",
      material.emissiveIntensity,
      0,
      10,
      0.01,
      (value) => {
        material.emissiveIntensity = value;
      }
    );
  }

  createBooleanControl("线框显示 wireframe", !!material.wireframe, (value) => {
    material.wireframe = value;
    material.needsUpdate = true;
  });

  if (material.userData?.materialPreset === "shader-ripple" && material.uniforms) {
    createInspectorSectionTitle("自定义 Shader 参数");

    createColorControl(
      "颜色 A",
      `#${material.uniforms.uColorA.value.getHexString()}`,
      (value) => {
        material.uniforms.uColorA.value.set(value);
      }
    );

    createColorControl(
      "颜色 B",
      `#${material.uniforms.uColorB.value.getHexString()}`,
      (value) => {
        material.uniforms.uColorB.value.set(value);
      }
    );

    createNumberControl(
      "波纹密度 uWaveScale",
      material.uniforms.uWaveScale.value,
      1,
      30,
      0.1,
      (value) => {
        material.uniforms.uWaveScale.value = value;
      }
    );

    createNumberControl(
      "流动速度 uSpeed",
      material.uniforms.uSpeed.value,
      0,
      10,
      0.01,
      (value) => {
        material.uniforms.uSpeed.value = value;
      }
    );

    createNumberControl(
      "菲涅耳强度 uFresnelPower",
      material.uniforms.uFresnelPower.value,
      0,
      8,
      0.01,
      (value) => {
        material.uniforms.uFresnelPower.value = value;
      }
    );

    createNumberControl(
      "高光发光 uGlow",
      material.uniforms.uGlow.value,
      0,
      2,
      0.01,
      (value) => {
        material.uniforms.uGlow.value = value;
      }
    );
  }
}

// ---------------------------------------------------------------------------
// 14. 加载 HDR
// ---------------------------------------------------------------------------

function renderBasicInfoInspector() {
  const info = getSelectedMaterialInfo();

  if (!info) {
    clearBasicInfoInspector("当前没有选中对象。");
    return;
  }

  const { object, material, isArrayMaterial } = info;

  basicInfoInspectorEl.innerHTML = "";
  currentInspectorTarget = basicInfoInspectorEl;

  createInspectorSectionTitle("对象信息");
  createInfoRow("对象名称", object.name || "未命名对象");
  createInfoRow("对象类型", object.type);
  createInfoRow("对象可见", object.visible ? "是" : "否");

  if ("castShadow" in object) {
    createInfoRow("投射阴影", object.castShadow ? "是" : "否");
  }

  if ("receiveShadow" in object) {
    createInfoRow("接收阴影", object.receiveShadow ? "是" : "否");
  }

  createInspectorSectionTitle("对象开关");
  createBooleanControl("对象可见", object.visible, (value) => {
    object.visible = value;
    if (!value && object === selectedObject) {
      clearSelection();
      return;
    }
    refreshObjectManager();
    renderBasicInfoInspector();
  });

  if ("castShadow" in object) {
    createBooleanControl("投射阴影", object.castShadow, (value) => {
      object.castShadow = value;
      renderBasicInfoInspector();
    });
  }

  if ("receiveShadow" in object) {
    createBooleanControl("接收阴影", object.receiveShadow, (value) => {
      object.receiveShadow = value;
      renderBasicInfoInspector();
    });
  }

  if (!object.isMesh) {
    createInspectorSectionTitle("材质说明");
    createInfoRow("当前状态", "这是一个 Group 容器，请到对象页签里选中具体 Mesh。");
    return;
  }

  if (!material) {
    createInspectorSectionTitle("材质说明");
    createInfoRow("当前状态", "当前 Mesh 没有可编辑材质。");
    return;
  }

  const currentPreset = material.userData?.materialPreset || "original";

  createInspectorSectionTitle("材质概览");
  createInfoRow("材质类型", material.type || "未知");
  createInfoRow("材质预设", currentPreset);
  createInfoRow("颜色贴图", material.map ? "有" : "无");
  createInfoRow("法线贴图", material.normalMap ? "有" : "无");
  createInfoRow("粗糙度贴图", material.roughnessMap ? "有" : "无");
  createInfoRow("金属度贴图", material.metalnessMap ? "有" : "无");
  createInfoRow("环境贴图", material.envMap ? "有" : "无");

  if (isArrayMaterial) {
    createInfoRow("多材质提示", "当前只编辑第一个材质。");
  }
}

function renderMaterialInspector() {
  const info = getSelectedMaterialInfo();

  if (!info) {
    clearMaterialInspector("当前没有选中对象。");
    return;
  }

  if (!info.object.isMesh) {
    clearMaterialInspector("当前选中的是 Group。请先选中具体 Mesh。");
    return;
  }

  if (!info.material) {
    clearMaterialInspector("当前选中的 Mesh 没有可编辑材质。");
    return;
  }

  const { material } = info;
  const currentPreset = material.userData?.materialPreset || "original";

  materialInspectorEl.innerHTML = "";
  currentInspectorTarget = materialInspectorEl;

  createInspectorSectionTitle("材质类型");
  createSelectControl(
    "切换 Three.js 预制材质 / 自定义 Shader",
    currentPreset,
    MATERIAL_PRESET_OPTIONS,
    (value) => {
      replaceSelectedMaterial(value);
    }
  );

  createInspectorSectionTitle("材质参数");
  createInfoRow("当前材质类型", material.type || "未知");
  createInfoRow(
    "当前模式",
    currentPreset === "original" ? "正在使用 GLB 原材质。" : "正在使用替换后的 Three.js 材质。"
  );

  if ("transparent" in material) {
    createBooleanControl("开启透明 transparent", !!material.transparent, (value) => {
      material.transparent = value;
      material.needsUpdate = true;
      renderBasicInfoInspector();
    });
  }

  if ("depthWrite" in material) {
    createBooleanControl("写入深度 depthWrite", !!material.depthWrite, (value) => {
      material.depthWrite = value;
      material.needsUpdate = true;
    });
  }

  if ("depthTest" in material) {
    createBooleanControl("深度测试 depthTest", !!material.depthTest, (value) => {
      material.depthTest = value;
      material.needsUpdate = true;
    });
  }

  if ("side" in material) {
    createSelectControl(
      "渲染面 side",
      String(material.side),
      [
        { value: String(THREE.FrontSide), label: "正面 FrontSide" },
        { value: String(THREE.BackSide), label: "背面 BackSide" },
        { value: String(THREE.DoubleSide), label: "双面 DoubleSide" },
      ],
      (value) => {
        material.side = Number(value);
        material.needsUpdate = true;
      }
    );
  }

  if ("flatShading" in material) {
    createBooleanControl("平面着色 flatShading", !!material.flatShading, (value) => {
      material.flatShading = value;
      material.needsUpdate = true;
    });
  }

  if ("toneMapped" in material) {
    createBooleanControl("参与色调映射 toneMapped", !!material.toneMapped, (value) => {
      material.toneMapped = value;
      material.needsUpdate = true;
    });
  }

  if ("fog" in material) {
    createBooleanControl("参与雾 fog", !!material.fog, (value) => {
      material.fog = value;
      material.needsUpdate = true;
    });
  }

  if ("dithering" in material) {
    createBooleanControl("抖动 dithering", !!material.dithering, (value) => {
      material.dithering = value;
      material.needsUpdate = true;
    });
  }

  if ("visible" in material) {
    createBooleanControl("材质可见", !!material.visible, (value) => {
      material.visible = value;
      material.needsUpdate = true;
    });
  }

  if ("wireframe" in material) {
    createBooleanControl("线框显示 wireframe", !!material.wireframe, (value) => {
      material.wireframe = value;
      material.needsUpdate = true;
    });
  }

  if ("alphaTest" in material) {
    createNumberControl("透明裁切 alphaTest", material.alphaTest, 0, 1, 0.01, (value) => {
      material.alphaTest = value;
      material.needsUpdate = true;
    });
  }

  if (material.color) {
    createColorControl("基础颜色", `#${material.color.getHexString()}`, (value) => {
      material.color.set(value);
    });
  }

  if ("roughness" in material) {
    createNumberControl("粗糙度 roughness", material.roughness, 0, 1, 0.01, (value) => {
      material.roughness = value;
    });
  }

  if ("metalness" in material) {
    createNumberControl("金属度 metalness", material.metalness, 0, 1, 0.01, (value) => {
      material.metalness = value;
    });
  }

  if ("envMapIntensity" in material) {
    createNumberControl("环境反射 envMapIntensity", material.envMapIntensity, 0, 10, 0.01, (value) => {
      material.envMapIntensity = value;
    });
  }

  if ("reflectivity" in material) {
    createNumberControl("反射 reflectivity", material.reflectivity, 0, 1, 0.01, (value) => {
      material.reflectivity = value;
    });
  }

  if ("shininess" in material) {
    createNumberControl("高光 shininess", material.shininess, 0, 200, 1, (value) => {
      material.shininess = value;
    });
  }

  if ("specular" in material) {
    createColorControl("高光颜色 specular", `#${material.specular.getHexString()}`, (value) => {
      material.specular.set(value);
    });
  }

  if ("opacity" in material) {
    createNumberControl("透明度 opacity", material.opacity, 0, 1, 0.01, (value) => {
      material.opacity = value;
      material.transparent = value < 1 || material.transparent;
      material.needsUpdate = true;
      renderBasicInfoInspector();
    });
  }

  if ("clearcoat" in material) {
    createNumberControl("清漆 clearcoat", material.clearcoat, 0, 1, 0.01, (value) => {
      material.clearcoat = value;
    });
  }

  if ("clearcoatRoughness" in material) {
    createNumberControl(
      "清漆粗糙度 clearcoatRoughness",
      material.clearcoatRoughness,
      0,
      1,
      0.01,
      (value) => {
        material.clearcoatRoughness = value;
      }
    );
  }

  if ("transmission" in material) {
    createNumberControl("透射 transmission", material.transmission, 0, 1, 0.01, (value) => {
      material.transmission = value;
    });
  }

  if ("ior" in material) {
    createNumberControl("折射率 ior", material.ior, 1, 2.5, 0.01, (value) => {
      material.ior = value;
    });
  }

  if ("refractionRatio" in material) {
    createNumberControl("折射比 refractionRatio", material.refractionRatio, 0, 1, 0.01, (value) => {
      material.refractionRatio = value;
    });
  }

  if ("thickness" in material) {
    createNumberControl("厚度 thickness", material.thickness, 0, 10, 0.01, (value) => {
      material.thickness = value;
    });
  }

  if ("normalScale" in material) {
    createNumberControl("法线强度 X", material.normalScale.x, -5, 5, 0.01, (value) => {
      material.normalScale.set(value, material.normalScale.y);
    });
    createNumberControl("法线强度 Y", material.normalScale.y, -5, 5, 0.01, (value) => {
      material.normalScale.set(material.normalScale.x, value);
    });
  }

  if ("bumpScale" in material) {
    createNumberControl("凹凸强度 bumpScale", material.bumpScale, 0, 5, 0.01, (value) => {
      material.bumpScale = value;
    });
  }

  if ("displacementScale" in material) {
    createNumberControl("位移强度 displacementScale", material.displacementScale, 0, 5, 0.01, (value) => {
      material.displacementScale = value;
    });
  }

  if ("aoMapIntensity" in material) {
    createNumberControl("AO 强度 aoMapIntensity", material.aoMapIntensity, 0, 5, 0.01, (value) => {
      material.aoMapIntensity = value;
    });
  }

  if (material.emissive) {
    createColorControl("自发光 emissive", `#${material.emissive.getHexString()}`, (value) => {
      material.emissive.set(value);
    });
  }

  if ("emissiveIntensity" in material) {
    createNumberControl(
      "自发光强度 emissiveIntensity",
      material.emissiveIntensity,
      0,
      10,
      0.01,
      (value) => {
        material.emissiveIntensity = value;
      }
    );
  }

  if (material.userData?.materialPreset === "shader-ripple" && material.uniforms) {
    createInspectorSectionTitle("自定义 Shader 参数");

    createColorControl("颜色 A", `#${material.uniforms.uColorA.value.getHexString()}`, (value) => {
      material.uniforms.uColorA.value.set(value);
    });

    createColorControl("颜色 B", `#${material.uniforms.uColorB.value.getHexString()}`, (value) => {
      material.uniforms.uColorB.value.set(value);
    });

    createNumberControl("波纹密度 uWaveScale", material.uniforms.uWaveScale.value, 1, 30, 0.1, (value) => {
      material.uniforms.uWaveScale.value = value;
    });

    createNumberControl("流动速度 uSpeed", material.uniforms.uSpeed.value, 0, 10, 0.01, (value) => {
      material.uniforms.uSpeed.value = value;
    });

    createNumberControl(
      "菲涅耳强度 uFresnelPower",
      material.uniforms.uFresnelPower.value,
      0,
      8,
      0.01,
      (value) => {
        material.uniforms.uFresnelPower.value = value;
      }
    );

    createNumberControl("高光发光 uGlow", material.uniforms.uGlow.value, 0, 2, 0.01, (value) => {
      material.uniforms.uGlow.value = value;
    });
  }
}

function renderInspectors() {
  renderBasicInfoInspector();
  renderMaterialInspector();
}

function applyHDRTexture(texture, label) {
  texture.mapping = THREE.EquirectangularReflectionMapping;

  const envTarget = pmremGenerator.fromEquirectangular(texture);

  if (currentEnvironmentTarget) {
    currentEnvironmentTarget.dispose();
  }

  if (currentHDRTexture) {
    currentHDRTexture.dispose();
  }

  currentEnvironmentTarget = envTarget;
  currentHDRTexture = texture;

  scene.environment = envTarget.texture;
  scene.background = texture;
  scene.backgroundBlurriness = 0.2;
  scene.backgroundIntensity = 1;

  setHDRStatus(`已加载 ${label}`);
  renderInspectors();
}

function loadHDRFromURL(url, label, isObjectURL = false) {
  setHDRStatus(`正在加载 ${label}...`);

  rgbeLoader.load(
    url,
    (texture) => {
      applyHDRTexture(texture, label);

      if (isObjectURL) {
        revokeHDLObjectURL();
      }
    },
    undefined,
    (error) => {
      console.error(error);
      setHDRStatus(`加载失败：${label}`);
      if (isObjectURL) {
        revokeHDLObjectURL();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// 15. 加载 GLB
// ---------------------------------------------------------------------------

const gltfLoader = new GLTFLoader();

function loadGLBFromURL(url, label, isObjectURL = false) {
  setModelStatus(`正在加载 ${label}...`);

  gltfLoader.load(
    url,
    (gltf) => {
      removeCurrentModel();

      const model = gltf.scene;
      model.name = label;

      prepareModel(model);
      currentRoot = model;
      scene.add(model);
      frameModel(model);
      refreshObjectManager();
      selectObject(model);
      setModelStatus(`已加载 ${label}`);

      if (isObjectURL) {
        currentModelObjectURL = url;
      }
    },
    (event) => {
      if (event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setModelStatus(`正在加载 ${label}：${percent}%`);
      }
    },
    (error) => {
      console.error(error);
      setModelStatus(`加载失败：${label}`);

      if (isObjectURL) {
        revokeModelObjectURL();
      } else if (label === "assets/scene.glb") {
        showFallbackDemo();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// 16. 场景点击选择
// ---------------------------------------------------------------------------

function onPointerDown(event) {
  if (!moveModeEnabled) {
    return;
  }

  const root = getActiveRoot();
  if (!root) {
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(collectMeshes(root), false);

  if (hits.length === 0) {
    return;
  }

  const object = findSelectableObject(hits[0].object, root);
  selectObject(object);
}

renderer.domElement.addEventListener("pointerdown", onPointerDown);

// ---------------------------------------------------------------------------
// 17. 按钮事件
// ---------------------------------------------------------------------------

loadSceneBtn.addEventListener("click", () => {
  loadGLBFromURL(DEFAULT_SCENE_PATH, "assets/scene.glb");
});

loadTeaBtn.addEventListener("click", () => {
  loadGLBFromURL(DEFAULT_TEA_PATH, "assets/tea.glb");
});

pickGLBBtn.addEventListener("click", () => {
  glbInput.click();
});

showFallbackBtn.addEventListener("click", () => {
  showFallbackDemo();
});

loadDefaultHDRBtn.addEventListener("click", () => {
  loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
});

pickHDRBtn.addEventListener("click", () => {
  hdrInput.click();
});

resetViewBtn.addEventListener("click", () => {
  const root = getActiveRoot();
  if (root) {
    frameModel(root);
  }
});

clearSelectionBtn.addEventListener("click", () => {
  clearSelection();
});

toggleMoveBtn.addEventListener("click", () => {
  moveModeEnabled = !moveModeEnabled;

  if (moveModeEnabled) {
    toggleMoveBtn.textContent = "移动模式开启";
    toggleMoveBtn.classList.add("active");

    if (selectedObject) {
      transformControls.attach(selectedObject);
      transformControls.visible = true;
    }
  } else {
    toggleMoveBtn.textContent = "移动模式关闭";
    toggleMoveBtn.classList.remove("active");
    transformControls.detach();
    transformControls.visible = false;
  }
});

showAllBtn.addEventListener("click", () => {
  showAllObjects();
});

glbInput.addEventListener("change", () => {
  const file = glbInput.files?.[0];
  if (!file) {
    return;
  }

  revokeModelObjectURL();
  const objectURL = URL.createObjectURL(file);
  currentModelObjectURL = objectURL;
  loadGLBFromURL(objectURL, file.name, true);
  glbInput.value = "";
});

hdrInput.addEventListener("change", () => {
  const file = hdrInput.files?.[0];
  if (!file) {
    return;
  }

  revokeHDLObjectURL();
  const objectURL = URL.createObjectURL(file);
  currentHDRObjectURL = objectURL;
  loadHDRFromURL(objectURL, file.name, true);
  hdrInput.value = "";
});

// ---------------------------------------------------------------------------
// 18. 默认启动行为
// ---------------------------------------------------------------------------

loadHDRFromURL(DEFAULT_HDR_PATH, "assets/studio_small_09_4k.hdr");
loadGLBFromURL(DEFAULT_SCENE_PATH, "assets/scene.glb");
renderInspectors();

// ---------------------------------------------------------------------------
// 19. 渲染循环
// ---------------------------------------------------------------------------

function updateCustomShaderMaterials(root) {
  if (!root) {
    return;
  }

  root.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const material = getPrimaryMaterial(child.material);
    if (!material || material.userData?.materialPreset !== "shader-ripple") {
      return;
    }

    material.uniforms.uTime.value = performance.now() * 0.001;
    material.uniforms.uLightDirection.value
      .copy(dirLight.position)
      .normalize();
  });
}

function animate() {
  controls.update();

  updateCustomShaderMaterials(getActiveRoot());
  renderer.render(scene, camera);
  window.requestAnimationFrame(animate);
}

animate();

// ---------------------------------------------------------------------------
// 20. 窗口缩放
// ---------------------------------------------------------------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
