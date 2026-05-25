import * as THREE from "three";

/**
 * Builds the 3-D scene.
 *
 * Two interchangeable backgrounds:
 *   room — cream walls & floor (non-calibration)
 *   box  — wireframe room (calibration mode)
 *
 * Caller scales both to frustum bounds and toggles visibility.
 */
export function createScene(): {
  scene: THREE.Scene;
  calibrationGroup: THREE.Group;
  mainGroup: THREE.Group;
  box: THREE.Group;
  room: THREE.Group;
} {
  const scene = new THREE.Scene();

  /* ---- lights ---- */
  scene.add(createLights());

  /* ---- calibration group ---- */
  const calibrationGroup = new THREE.Group();
  scene.add(calibrationGroup);
  addCalibrationScene(calibrationGroup);

  /* ---- main scene group ---- */
  const mainScene = new THREE.Group();
  scene.add(mainScene);

  /* ---- cream room (non-calibration, hidden when calibrating) ---- */
  const room = createRoom(mainScene);

  /* ---- wireframe box (calibration mode only) ---- */
  const box = addBox(mainScene);

  return { scene, calibrationGroup, mainGroup: mainScene, box, room };
}

/* ===================================================================
 *  LIGHTING
 * =================================================================== */

function createLights(): THREE.Group {
  const group = new THREE.Group();

  // sky-ground natural ambient
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x8d7c6b, 0.6);
  group.add(hemi);

  // main shadow-casting sun
  const sun = new THREE.DirectionalLight(0xfff5eb, 0.6);
  sun.position.set(0.5, 1, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.bias = -0.0005;
  group.add(sun);

  const point1 = new THREE.PointLight(0x66ccff, 2, 10);
  point1.position.set(0.8, 1.5, -7.8);
  group.add(point1);

  const point2 = new THREE.PointLight(0x66ccff, 2, 10);
  point2.position.set(-0.8, 1.5, -7.8);
  group.add(point2);

  const point3 = new THREE.PointLight(0x66ccff, 2, 10);
  point3.position.set(0.8, 1.5, 0);
  group.add(point3);

  const point4 = new THREE.PointLight(0x66ccff, 2, 10);
  point4.position.set(-0.8, 1.5, 0);
  group.add(point4);

  const point5 = new THREE.PointLight(0x66ccff, 2, 10);
  point5.position.set(0.8, -1.5, -7.8);
  group.add(point5);

  const point6 = new THREE.PointLight(0x66ccff, 2, 10);
  point6.position.set(-0.8, -1.5, -7.8);
  group.add(point6);

  return group;
}

/* ===================================================================
 *  CREAM ROOM  (non-calibration)
 * =================================================================== */

function createRoom(parent: THREE.Group): THREE.Group {
  const room = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xfaf8f5,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xf0ece4,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });

  const geo = new THREE.PlaneGeometry(1, 1);

  // floor — horizontal at y=-0.5, z offset=-0.5  (matching box coords)
  const floor = new THREE.Mesh(geo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.5, -0.5);
  floor.receiveShadow = true;
  room.add(floor);

  // back wall — at z=-1
  const backWall = new THREE.Mesh(geo, wallMat);
  backWall.position.set(0, 0, -1);
  backWall.receiveShadow = true;
  room.add(backWall);

  // left wall
  const leftWall = new THREE.Mesh(geo, wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-0.5, 0, -0.5);
  leftWall.receiveShadow = true;
  room.add(leftWall);

  // right wall
  const rightWall = new THREE.Mesh(geo, wallMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(0.5, 0, -0.5);
  rightWall.receiveShadow = true;
  room.add(rightWall);

  // ceiling
  const ceiling = new THREE.Mesh(geo, wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 0.5, -0.5);
  room.add(ceiling);

  parent.add(room);
  return room;
}

/* ===================================================================
 *  WIREFRAME BOX  (calibration mode)
 * =================================================================== */

function addBox(parent: THREE.Group): THREE.Group {
  const box = new THREE.Group();
  const divisions = 10;

  const gridBottom = new THREE.GridHelper(1, divisions, "white", "white");
  gridBottom.position.y = -0.5;
  gridBottom.position.z = -0.5;
  box.add(gridBottom);

  const gridTop = new THREE.GridHelper(1, divisions, "white", "white");
  gridTop.position.y = 0.5;
  gridTop.position.z = -0.5;
  box.add(gridTop);

  const gridLeft = new THREE.GridHelper(1, divisions, "white", "white");
  gridLeft.position.x = -0.5;
  gridLeft.position.z = -0.5;
  gridLeft.rotation.z = Math.PI / 2;
  box.add(gridLeft);

  const gridRight = new THREE.GridHelper(1, divisions, "white", "white");
  gridRight.position.x = 0.5;
  gridRight.position.z = -0.5;
  gridRight.rotation.z = Math.PI / 2;
  box.add(gridRight);

  const gridBack = new THREE.GridHelper(1, divisions, "white", "white");
  gridBack.position.z = -1;
  gridBack.rotation.x = Math.PI / 2;
  box.add(gridBack);

  parent.add(box);
  return box;
}

/* ===================================================================
 *  CALIBRATION CHECKERBOARD
 * =================================================================== */

function addCalibrationScene(parent: THREE.Group): void {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({
    map: createCheckerboardTexture(512, 8),
  });
  const cube = new THREE.Mesh(geometry, material);
  cube.scale.multiplyScalar(0.5);
  parent.add(cube);
}

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
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
