import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export function createAssetsModule(app) {
  const gltfLoader = new GLTFLoader();
  const rgbeLoader = new RGBELoader();

  function revokeModelObjectURL() {
    if (!app.state.currentModelObjectURL) {
      return;
    }

    URL.revokeObjectURL(app.state.currentModelObjectURL);
    app.state.currentModelObjectURL = null;
  }

  function revokeHDRObjectURL() {
    if (!app.state.currentHDRObjectURL) {
      return;
    }

    URL.revokeObjectURL(app.state.currentHDRObjectURL);
    app.state.currentHDRObjectURL = null;
  }

  function frameModel(root) {
    if (!root) {
      return;
    }

    const { camera, controls } = app.runtime;

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

    const viewOffset = new THREE.Vector3(1.05, 0.72, 1.28)
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

    app.lights.fitShadowToObject(root);

    console.log("模型最大尺寸", Math.max(size.x, size.y, size.z));
  }

  function removeCurrentModel() {
    app.selection.clearSelection();

    if (app.state.currentRoot) {
      app.runtime.scene.remove(app.state.currentRoot);
      app.materials.disposeObject3D(app.state.currentRoot);
      app.state.currentRoot = null;
    }

    if (app.state.fallbackGroup) {
      app.runtime.scene.remove(app.state.fallbackGroup);
      app.materials.disposeObject3D(app.state.fallbackGroup);
      app.state.fallbackGroup = null;
    }

    revokeModelObjectURL();
  }

  function createWaterShowcaseSurface() {
    const geometry = new THREE.PlaneGeometry(8.5, 8.5, 180, 180);
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const radial = Math.sqrt(x * x + y * y);
      const bowl = -Math.min(radial * 0.01, 0.055);
      const swellA = Math.sin(x * 0.55 + y * 0.2) * 0.035;
      const swellB = Math.cos(y * 0.45 - x * 0.18) * 0.025;
      const centerLift = Math.exp(-radial * radial * 0.06) * 0.035;

      positions.setZ(i, bowl + swellA + swellB + centerLift);
    }

    geometry.computeVertexNormals();

    const material = app.materials.createMaterialFromPreset("shader-water", null);
    material.uniforms.uDeepColor.value.set("#0a3e63");
    material.uniforms.uShallowColor.value.set("#8ee8ff");
    material.uniforms.uHighlightColor.value.set("#f8feff");
    material.uniforms.uFlowSpeed.value = 0.38;
    material.uniforms.uNoiseScale.value = 0.78;
    material.uniforms.uNormalStrength.value = 0.9;
    material.uniforms.uSurfaceMotion.value = 0.028;
    material.uniforms.uFresnelPower.value = 3.2;
    material.uniforms.uSpecularStrength.value = 1.1;
    material.uniforms.uOpacity.value = 0.86;
    material.uniforms.uFoamAmount.value = 0.08;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "水面展示";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.receiveShadow = true;

    return mesh;
  }

  function createWaterDroplet() {
    const material = app.materials.createMaterialFromPreset("shader-water", null);
    material.uniforms.uDeepColor.value.set("#0b5873");
    material.uniforms.uShallowColor.value.set("#bff7ff");
    material.uniforms.uHighlightColor.value.set("#ffffff");
    material.uniforms.uFlowSpeed.value = 0.52;
    material.uniforms.uNoiseScale.value = 1.15;
    material.uniforms.uNormalStrength.value = 0.85;
    material.uniforms.uSurfaceMotion.value = 0.018;
    material.uniforms.uFresnelPower.value = 4.1;
    material.uniforms.uSpecularStrength.value = 1.35;
    material.uniforms.uOpacity.value = 0.72;
    material.uniforms.uFoamAmount.value = 0.03;

    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.78, 5),
      material
    );
    mesh.name = "水滴球";
    mesh.position.set(-1.75, 1.0, 1.55);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  function showFallbackDemo() {
    removeCurrentModel();

    const fallbackGroup = new THREE.Group();
    fallbackGroup.name = "内置示例";

    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(5.4, 5.9, 0.42, 96),
      new THREE.MeshStandardMaterial({
        color: "#dbe3ea",
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    stage.name = "展示底台";
    stage.position.y = -0.21;
    stage.receiveShadow = true;
    fallbackGroup.add(stage);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 9),
      new THREE.MeshBasicMaterial({
        color: "#f3f5f7",
      })
    );
    backdrop.name = "背景板";
    backdrop.position.set(0, 4.2, -4.8);
    backdrop.receiveShadow = true;
    fallbackGroup.add(backdrop);

    const waterSurface = createWaterShowcaseSurface();
    fallbackGroup.add(waterSurface);

    const droplet = createWaterDroplet();
    fallbackGroup.add(droplet);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.64, 0.4, 64),
      new THREE.MeshPhysicalMaterial({
        color: "#f8fafc",
        roughness: 0.2,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      })
    );
    pedestal.name = "展示台";
    pedestal.position.set(-1.75, 0.2, 1.55);
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    fallbackGroup.add(pedestal);

    const accentMesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.42, 0.12, 160, 24),
      new THREE.MeshPhysicalMaterial({
        color: "#f59e0b",
        roughness: 0.28,
        metalness: 0.08,
        clearcoat: 0.9,
        clearcoatRoughness: 0.12,
      })
    );
    accentMesh.name = "反射参照物";
    accentMesh.position.set(1.95, 1.15, -1.5);
    accentMesh.rotation.set(0.8, 0.2, -0.5);
    accentMesh.castShadow = true;
    accentMesh.receiveShadow = true;
    fallbackGroup.add(accentMesh);

    app.materials.prepareModel(fallbackGroup);

    app.state.fallbackGroup = fallbackGroup;
    app.runtime.scene.add(fallbackGroup);
    frameModel(fallbackGroup);
    app.objectManager.refreshObjectManager();
    app.selection.selectObject(waterSurface);
    app.status.setModel("当前显示的是内置水材质示例");
  }

  function applyHDRTexture(texture, label) {
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const envTarget = app.runtime.pmremGenerator.fromEquirectangular(texture);

    if (app.state.currentEnvironmentTarget) {
      app.state.currentEnvironmentTarget.dispose();
    }

    if (app.state.currentHDRTexture) {
      app.state.currentHDRTexture.dispose();
    }

    app.state.currentEnvironmentTarget = envTarget;
    app.state.currentHDRTexture = texture;

    app.runtime.scene.environment = envTarget.texture;
    app.runtime.scene.background = texture;
    app.runtime.scene.backgroundBlurriness = 0.2;
    app.runtime.scene.backgroundIntensity = 1;

    app.status.setHDR(`已加载 ${label}`);
    app.inspectors.renderInspectors();
  }

  function loadHDRFromURL(url, label, isObjectURL = false) {
    app.status.setHDR(`正在加载 ${label}...`);

    rgbeLoader.load(
      url,
      (texture) => {
        applyHDRTexture(texture, label);

        if (isObjectURL) {
          revokeHDRObjectURL();
        }
      },
      undefined,
      (error) => {
        console.error(error);
        app.status.setHDR(`加载失败：${label}`);

        if (isObjectURL) {
          revokeHDRObjectURL();
        }
      }
    );
  }

  function loadGLBFromURL(url, label, isObjectURL = false) {
    app.status.setModel(`正在加载 ${label}...`);

    gltfLoader.load(
      url,
      (gltf) => {
        removeCurrentModel();

        const model = gltf.scene;
        model.name = label;

        app.materials.prepareModel(model);
        app.state.currentRoot = model;
        app.runtime.scene.add(model);
        frameModel(model);
        app.objectManager.refreshObjectManager();
        app.selection.selectObject(model);
        app.status.setModel(`已加载 ${label}`);

        if (isObjectURL) {
          app.state.currentModelObjectURL = url;
        }
      },
      (event) => {
        if (event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          app.status.setModel(`正在加载 ${label}：${percent}%`);
        }
      },
      (error) => {
        console.error(error);
        app.status.setModel(`加载失败：${label}`);

        if (isObjectURL) {
          revokeModelObjectURL();
        } else if (label === "assets/scene.glb") {
          showFallbackDemo();
        }
      }
    );
  }

  return {
    revokeModelObjectURL,
    revokeHDRObjectURL,
    frameModel,
    removeCurrentModel,
    showFallbackDemo,
    applyHDRTexture,
    loadHDRFromURL,
    loadGLBFromURL,
  };
}
