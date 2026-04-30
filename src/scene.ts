import * as THREE from "three";

/**
 * Builds the renderable 3-D scene.
 * Returns the scene object, the calibration group (checkerboard cube),
 * and the main content group so callers can toggle visibility.
 */
export function createScene(): {
  scene: THREE.Scene;
  calibrationGroup: THREE.Group;
  mainGroup: THREE.Group;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  /* ---- lighting ---- */
  scene.add(new THREE.AmbientLight(0x404060, 2));

  const dir = new THREE.DirectionalLight(0xffffff, 3);
  dir.position.set(5, 10, 5);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  dir.shadow.camera.left = -10;
  dir.shadow.camera.right = 10;
  dir.shadow.camera.top = 10;
  dir.shadow.camera.bottom = -10;
  scene.add(dir);

  const point1 = new THREE.PointLight(0x4444ff, 30, 20);
  point1.position.set(-3, 2, 0);
  scene.add(point1);

  const point2 = new THREE.PointLight(0xff44ff, 30, 20);
  point2.position.set(3, 2, 0);
  scene.add(point2);

  /* ---- main content group ---- */
  const mainGroup = new THREE.Group();
  scene.add(mainGroup);

  /* ---- ground ---- */
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x222233,
    roughness: 0.9,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  ground.receiveShadow = true;
  mainGroup.add(ground);

  /* ---- grid ---- */
  const grid = new THREE.GridHelper(20, 20, 0x444466, 0x222244);
  grid.position.y = -2.99;
  mainGroup.add(grid);

  /* ---- floating decorations ---- */
  const colours = [0xff3333, 0x33ff33, 0x3333ff, 0xffff33, 0xff33ff, 0x33ffff];
  for (let i = 0; i < 6; i++) {
    const sgeo = new THREE.SphereGeometry(0.25, 32, 32);
    const smat = new THREE.MeshStandardMaterial({
      color: colours[i],
      roughness: 0.2,
      metalness: 0.3,
      emissive: colours[i],
      emissiveIntensity: 0.3,
    });
    const sphere = new THREE.Mesh(sgeo, smat);
    const angle = (i / 6) * Math.PI * 2;
    sphere.position.set(Math.cos(angle) * 2.5, Math.sin(i * 1.5) * 1.5, Math.sin(angle) * 2);
    sphere.castShadow = true;
    sphere.userData = {
      floatSpeed: 0.5 + Math.random() * 1.5,
      rotSpeed: 0.5 + Math.random(),
      baseY: sphere.position.y,
      phase: Math.random() * Math.PI * 2,
    };
    mainGroup.add(sphere);
  }

  /* ---- starfield ---- */
  const starsGeo = new THREE.BufferGeometry();
  const starCount = 400;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * 30;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    starPositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starsMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.03,
    transparent: true,
    opacity: 0.7,
  });
  const stars = new THREE.Points(starsGeo, starsMat);
  mainGroup.add(stars);

  /* ---- calibration group (hidden by default) ---- */
  const calibrationGroup = new THREE.Group();
  calibrationGroup.visible = false;
  scene.add(calibrationGroup);

  const checkerTexture = createCheckerboardTexture(512, 8);
  const checkerGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const checkerMat = new THREE.MeshStandardMaterial({
    map: checkerTexture,
    roughness: 0.6,
  });
  const checkerCube = new THREE.Mesh(checkerGeo, checkerMat);
  calibrationGroup.add(checkerCube);
  // checkerCube.position.z = -6;  // 往后推 3 个单位

  // axis helper for spatial reference during calibration
  calibrationGroup.add(new THREE.AxesHelper(2));

  return { scene, calibrationGroup, mainGroup };
}

/**
 * Generate a checkerboard canvas texture at runtime (no external file needed).
 */
function createCheckerboardTexture(
  size: number,
  squares: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const sq = size / squares;
  for (let row = 0; row < squares; row++) {
    for (let col = 0; col < squares; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#ffffff" : "#111111";
      ctx.fillRect(col * sq, row * sq, sq, sq);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // crisp
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Update floating-object animations. Call once per frame.
 */
export function animateScene(group: THREE.Group, time: number): void {
  group.children.forEach((child: THREE.Object3D & { userData: Record<string, number> }) => {
    if (child.userData?.floatSpeed !== undefined) {
      child.position.y =
        child.userData.baseY +
        Math.sin(time * child.userData.floatSpeed + child.userData.phase) * 0.5;
      child.rotation.x += 0.005 * child.userData.rotSpeed;
      child.rotation.y += 0.008 * child.userData.rotSpeed;
    }
  });
}
