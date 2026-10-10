import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seededRandom } from "./kinematics.js";
import { CollisionWorld } from "./collision.js";

const rand = seededRandom(71);
const material = (color, roughness = 1, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const concrete = material(0x767970),
  darkConcrete = material(0x4d5556),
  metal = material(0x40483b, 0.8, 0.6),
  rust = material(0x8c5a3d, 0.95, 0.3),
  pale = material(0xb0a586),
  road = material(0x545651),
  yellow = material(0xa88a4a);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, x, y, z, w, h, d, rotation = 0) {
  const m = new THREE.Mesh(unitBox, mat);
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.rotation.y = rotation;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function beam(parent, a, b, width = 0.1, mat = metal) {
  const m = new THREE.Mesh(unitBox, mat);
  const dir = b.clone().sub(a);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  m.scale.set(width, dir.length(), width);
  m.userData.noCollision = true;
  parent.add(m);
  return m;
}

function groundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#767866";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 45000; i++) {
    const c = Math.floor(72 + rand() * 65);
    ctx.fillStyle = `rgba(${c + 5},${c + 9},${c - 2},${rand() * 0.23})`;
    const size = 1 + rand() * 5;
    ctx.fillRect(rand() * 1024, rand() * 1024, size, size * 0.5);
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#3d453e40";
  for (let i = 0; i < 85; i++) {
    let x = rand() * 1024,
      y = rand() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 35;
      y += (rand() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(26, 26);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
function groundMark(text, width = 8, height = 2.3) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d6c38a70";
  ctx.textAlign = "center";
  ctx.font = "bold 110px monospace";
  ctx.fillText(text, 512, 172);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.027;
  return m;
}
function pylon(parent, x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      beam(
        group,
        new THREE.Vector3(sx * 2, 0, sz * 2),
        new THREE.Vector3(sx * 0.55, 19, sz * 0.55),
        0.2,
      );
  for (let y = 1; y < 19; y += 3)
    for (const sz of [-1, 1]) {
      const w = 2 - y * 0.076;
      beam(
        group,
        new THREE.Vector3(-w, y, sz * w),
        new THREE.Vector3(w, y + 3, sz * (w - 0.22)),
        0.08,
      );
      beam(
        group,
        new THREE.Vector3(w, y, sz * w),
        new THREE.Vector3(-w, y + 3, sz * (w - 0.22)),
        0.08,
      );
    }
  for (const y of [15, 19]) {
    beam(group, new THREE.Vector3(-4, y, 0), new THREE.Vector3(4, y, 0), 0.18);
    for (const side of [-1, 1])
      beam(
        group,
        new THREE.Vector3(0, y - 2, 0),
        new THREE.Vector3(side * 4, y, 0),
        0.1,
      );
  }
  for (const side of [-1, 1])
    cable(
      parent,
      new THREE.Vector3(x + side * 4 * scale, 19 * scale, z),
      new THREE.Vector3(x + side * 4 * scale, 18 * scale, z - 44),
      3,
    );
}
function cable(parent, a, b, sag) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(
      a
        .clone()
        .lerp(b, t)
        .add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)),
    );
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  parent.add(
    new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x373e32 })),
  );
}
function ruins(parent, collision) {
  for (let i = 0; i < 42; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 72 + rand() * 85;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    const w = 5 + rand() * 10,
      d = 5 + rand() * 7,
      h = 8 + rand() * 31;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rand() * 0.5;
    parent.add(g);
    // Open floor slabs and broken structural frames, rather than solid box buildings.
    const floors = Math.floor(h / 3.8);
    for (let f = 0; f < floors; f++) {
      const level = f * 3.8;
      box(g, f % 2 ? darkConcrete : concrete, 0, level, 0, w, 0.35, d);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          if (rand() > 0.08 || f === 0)
            box(
              g,
              concrete,
              sx * (w / 2 - 0.2),
              level + 1.8,
              sz * (d / 2 - 0.2),
              0.45,
              3.8,
              0.45,
            );
      if (rand() > 0.45)
        box(g, darkConcrete, 0, level + 1.8, -d / 2, w, 3.2, 0.35);
      if (rand() > 0.45)
        box(g, darkConcrete, -w / 2, level + 1.4, 0, 0.35, 2.6, d * 0.7);
    }
    for (let j = 0; j < 5; j++) {
      const chunk = box(
        g,
        concrete,
        (rand() - 0.5) * w,
        0.3 + rand(),
        (rand() - 0.5) * d,
        2 + rand() * 3,
        0.5 + rand(),
        2 + rand(),
      );
      chunk.rotation.z = rand() * 0.5;
    }
    g.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(g).expandByScalar(1.5);
    bounds.min.y = -5;
    bounds.max.y = 80;
    collision.addBarrier(bounds, `background-${i}`);
    g.traverse((object) => {
      object.userData.background = true;
    });
  }
}

export function createWorld(scene) {
  const terrain = new THREE.Group();
  const collision = new CollisionWorld();
  for (const [min, max] of [
    [
      [-150, -5, -150],
      [-62, 80, 150],
    ],
    [
      [62, -5, -150],
      [150, 80, 150],
    ],
    [
      [-62, -5, -150],
      [62, 80, -60],
    ],
    [
      [-62, -5, 60],
      [62, 80, 150],
    ],
  ])
    collision.addBarrier(
      new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
      "district-edge",
    );
  scene.add(terrain);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({
      map: groundTexture(),
      roughness: 1,
      color: 0xb1b09b,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  terrain.add(ground);
  // A worn concrete service apron remains perfectly level for reproducible gait tests.
  box(terrain, road, 0, -0.09, 0, 31, 0.16, 31);
  const markings = new THREE.Group();
  terrain.add(markings);
  for (let i = -3; i <= 3; i++) {
    box(markings, pale, i * 4.6, 0.002, 0, 0.035, 0.008, 28);
    box(markings, pale, 0, 0.002, i * 4.6, 28, 0.008, 0.035);
  }
  for (const side of [-1, 1])
    for (let i = -14; i < 14; i += 1.1)
      box(terrain, yellow, i, 0.012, side * 15, 0.65, 0.008, 0.13);
  const fieldLabel = groundMark("SECTOR 07", 12, 2.7);
  fieldLabel.position.set(0, 0.023, 11);
  terrain.add(fieldLabel);
  const northLabel = groundMark("RIFT // TEST RANGE", 14, 1.7);
  northLabel.position.set(0, 0.025, -12.5);
  terrain.add(northLabel);
  const pointsOfInterest = [];
  function ramp(options) {
    const shape = collision.addRamp(options);
    const coords = [];
    for (const face of shape.faces)
      for (const index of face) coords.push(...shape.vertices[index].toArray());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, concrete);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    terrain.add(mesh);
    const {
      x,
      z,
      axis,
      width,
      length,
      bottom,
      top,
      direction,
      collapsed = false,
    } = options;
    const start = new THREE.Vector3(x, bottom, z),
      end = new THREE.Vector3(x, top, z);
    start[axis] -= (direction * length) / 2;
    end[axis] += (direction * length) / 2;
    for (const side of [-1, 1]) {
      const a = start.clone(),
        b = end.clone();
      a[axis === "x" ? "z" : "x"] += side * (width / 2 - 0.2);
      b[axis === "x" ? "z" : "x"] += side * (width / 2 - 0.2);
      a.y += 0.025;
      b.y += 0.025;
      if (!collapsed) beam(terrain, a, b, 0.1, yellow);
    }
    if (collapsed) {
      for (const t of [0.23, 0.48, 0.71]) {
        const p = start.clone().lerp(end, t);
        const a = p.clone(),
          b = p.clone();
        const across = axis === "x" ? "z" : "x";
        a[across] -= width * 0.45;
        b[across] += width * 0.38;
        a[axis] -= 0.4;
        b[axis] += 0.5;
        a.y = collision.topAt(shape, a.x, a.z) + 0.02;
        b.y = collision.topAt(shape, b.x, b.z) + 0.02;
        beam(terrain, a, b, 0.05, darkConcrete);
      }
    }
    return shape;
  }
  function sign(text, x, y, z, width = 6) {
    box(terrain, rust, x, y, z, width, 1.55, 0.14);
    const textMesh = groundMark(text, width - 0.3, 1.1);
    textMesh.rotation.x = 0;
    textMesh.position.set(x, y, z + 0.08);
    terrain.add(textMesh);
  }
  function ruinedFacade(x, z, width, height) {
    for (let level = 0; level < height; level += 7) {
      for (let i = 0; i < 5; i++) {
        const px = x - width / 2 + (i * width) / 4;
        const h = level + 7 > height ? 3 : 6.5;
        box(terrain, concrete, px, level + h / 2, z, 0.55, h, 0.65);
        if (i < 4) {
          box(
            terrain,
            darkConcrete,
            px + width / 8,
            level + 0.8,
            z,
            width / 4 - 0.55,
            1.5,
            0.35,
          );
          if ((i + level) % 3 !== 1)
            box(
              terrain,
              concrete,
              px + width / 8,
              level + 5.4,
              z,
              width / 4 - 0.55,
              0.8,
              0.35,
            );
        }
      }
    }
    for (let i = 0; i < 6; i++)
      beam(
        terrain,
        new THREE.Vector3(x - width / 2 + (i * width) / 5, height, z),
        new THREE.Vector3(
          x - width / 2 + (i * width) / 5 + 0.4,
          height + 1.1 + rand(),
          z - 0.3,
        ),
        0.035,
        metal,
      );
  }
  // The factory has lost its front wall. A fallen side slab gives access to
  // the surviving floor; the central courtyard remains a street, not a ramp.
  box(terrain, concrete, 2, 6.65, -33, 30, 0.7, 14);
  box(terrain, concrete, -5, 10.15, -36.5, 8, 0.7, 7);
  box(terrain, concrete, -19, 6.65, -34.5, 9, 0.7, 3);
  box(terrain, concrete, -11.75, 6.65, -31.5, 5.5, 0.7, 9);
  ramp({
    x: -19,
    z: -22,
    width: 8.5,
    length: 22,
    axis: "z",
    direction: -1,
    bottom: 0,
    top: 7,
    id: "factory-access",
    collapsed: true,
  });
  ramp({
    x: 5,
    z: -36,
    width: 7,
    length: 12,
    axis: "x",
    direction: -1,
    bottom: 7,
    top: 10.5,
    id: "upper-access",
    collapsed: true,
  });
  // Exposed reinforcing bars and a broken edge explain the tilted floor slab.
  for (const side of [-1, 1]) {
    beam(
      terrain,
      new THREE.Vector3(-19 + side * 3.3, 0.3, -11),
      new THREE.Vector3(-19 + side * 3.3, 6.8, -32),
      0.18,
      rust,
    );
    box(terrain, darkConcrete, -25, 1.15, -28 + side * 3, 2, 2.3, 4);
  }
  for (const x of [-10, 16])
    for (const z of [-26.4, -38])
      box(terrain, concrete, x, 3.2, z, 0.9, 6.4, 0.9);
  for (const x of [-8, -2])
    for (const z of [-33.4, -39.5])
      box(terrain, concrete, x, 8.55, z, 0.8, 3.1, 0.8);
  ruinedFacade(2, -40.2, 32, 19);
  ruinedFacade(-24.5, -37, 1.2, 15);
  // The broken side wall has large gaps through which the walker can pass.
  box(terrain, darkConcrete, -14, 4.2, -38, 1.2, 8.4, 3.2);
  box(terrain, darkConcrete, 18, 4.5, -28, 1.1, 9, 2.5);
  box(terrain, metal, 21.5, 6.83, -36, 17, 0.34, 8);
  for (const z of [-39.9, -32.1]) {
    beam(
      terrain,
      new THREE.Vector3(13, 6.6, z),
      new THREE.Vector3(30, 6.6, z),
      0.2,
      rust,
    );
    for (const x of [15, 21, 27]) {
      const post = box(terrain, rust, x, 7.6, z, 0.1, 1.2, 0.1);
      post.userData.walkable = false;
    }
    beam(
      terrain,
      new THREE.Vector3(13, 8.2, z),
      new THREE.Vector3(24, 8.2, z),
      0.07,
      rust,
    );
  }
  box(terrain, concrete, 36, 6.65, -36, 12, 0.7, 18);
  for (const x of [30.5, 41.5])
    for (const z of [-28, -44]) box(terrain, concrete, x, 3.2, z, 1, 6.4, 1);
  ruinedFacade(36, -45, 14, 21);
  box(terrain, darkConcrete, 42.3, 8, -36, 0.6, 16, 18);
  box(terrain, concrete, 36, 16.6, -42, 12, 0.8, 6);
  const fallen = box(terrain, concrete, 39, 14.2, -29, 7, 0.6, 4);
  fallen.rotation.z = 0.3;
  fallen.rotation.x = -0.2;
  // The warehouse keeps its original loading dock and a collapsed roof bay.
  box(terrain, concrete, 32, 3.65, 0, 18, 0.7, 14);
  ramp({
    x: 32,
    z: 14,
    width: 11,
    length: 14,
    axis: "z",
    direction: -1,
    bottom: 0,
    top: 4,
    id: "warehouse-access",
  });
  for (const x of [24, 40])
    for (const z of [-6, 6]) box(terrain, concrete, x, 1.8, z, 0.85, 3.6, 0.85);
  ruinedFacade(32, -7.5, 19, 11);
  box(terrain, darkConcrete, 41.4, 3.8, 0, 0.65, 7.6, 13);
  box(terrain, concrete, 25.5, 9.4, -3, 4, 0.55, 8);
  for (const z of [-5, 5])
    beam(
      terrain,
      new THREE.Vector3(24, 9, z),
      new THREE.Vector3(38, 7.2, z),
      0.22,
      rust,
    );
  // A gutted office block: one wing survives; the missing corner has collapsed
  // into its courtyard. The intact column grid gives the ruin a readable plan.
  box(terrain, concrete, -40, 3.9, 13, 14, 0.6, 16);
  box(terrain, concrete, -35.5, 3.9, 19, 5, 0.6, 4);
  box(terrain, concrete, -43, 7.9, 10, 8, 0.6, 10);
  ruinedFacade(-40, 4.6, 16, 13);
  box(terrain, darkConcrete, -47.5, 5.5, 13, 0.65, 11, 17);
  for (const x of [-46, -40, -34])
    for (const z of [6, 18]) {
      box(terrain, concrete, x, 1.9, z, 0.65, 3.8, 0.65);
      if (x < -36) box(terrain, concrete, x, 5.95, z, 0.6, 3.5, 0.6);
    }
  ramp({
    x: -35.5,
    z: 28,
    width: 6,
    length: 14,
    axis: "z",
    direction: -1,
    bottom: 0,
    top: 4.2,
    id: "office-collapse",
    collapsed: true,
  });
  const officeSlab = box(terrain, concrete, -29, 0.55, 13, 5, 0.65, 7, 0.25);
  officeSlab.rotation.z = -0.18;
  for (let i = 0; i < 7; i++) {
    box(
      terrain,
      darkConcrete,
      -27 - rand() * 4,
      0.3 + rand() * 0.5,
      6 + rand() * 11,
      1 + rand() * 2,
      0.55 + rand(),
      1 + rand(),
      rand(),
    );
    beam(
      terrain,
      new THREE.Vector3(-33, 4.2, 12 + i * 0.6),
      new THREE.Vector3(-31.5, 3.6, 12 + i * 0.6),
      0.04,
      metal,
    );
  }
  // Bombed service building south of the arena: doorway, window bays, partial
  // roof and fallen lintels, leaving a clear passage through the middle.
  for (const x of [2, 20]) box(terrain, darkConcrete, x, 3, 43, 0.6, 6, 14);
  for (const x of [5, 17]) box(terrain, concrete, x, 2.5, 36, 5, 5, 0.6);
  box(terrain, concrete, 7, 5.8, 45, 9, 0.5, 8);
  box(terrain, concrete, 11, 5.5, 50, 19, 0.7, 0.8);
  for (const x of [2, 11, 20])
    box(terrain, concrete, x, 2.7, 50, 0.6, 5.4, 0.6);
  const lintel = box(terrain, concrete, 17, 0.6, 40, 5, 0.7, 1, 0.4);
  lintel.rotation.z = 0.2;
  for (let i = 0; i < 8; i++) {
    const rubble = box(
      terrain,
      i % 2 ? concrete : darkConcrete,
      -19 - rand() * 9,
      0.3 + rand(),
      -24 - rand() * 18,
      1 + rand() * 3,
      0.5 + rand(),
      1 + rand() * 3,
      rand() * 3,
    );
    rubble.rotation.z = (rand() - 0.5) * 0.5;
    const broken = box(
      terrain,
      concrete,
      45 + rand() * 6,
      0.3,
      -20 - rand() * 25,
      2 + rand() * 3,
      0.6,
      1 + rand() * 2,
      rand() * 3,
    );
    broken.rotation.z = 0.15;
  }
  sign("ACCESO OESTE", -25, 1.8, -10, 7);
  sign("NIVEL 02", -8, 12, -40, 5);
  sign("ALMACÉN", 32, 6, -7.15, 6);
  pointsOfInterest.push(
    { name: "Fábrica / losa derrumbada", x: -19, z: -11, height: 0 },
    { name: "Terraza / nivel 01", x: 0, z: -28, height: 7 },
    { name: "Mirador / nivel 02", x: -8, z: -36, height: 10.5 },
    { name: "Almacén", x: 32, z: 0, height: 4 },
    { name: "Oficinas / ala derrumbada", x: -35.5, z: 14, height: 4.2 },
  );
  // Street markings direct the player toward the approach rather than a menu.
  for (let x = -3; x > -17; x -= 2)
    box(terrain, yellow, x, 0.025, -5, 0.65, 0.015, 0.17);
  // Slab seams, service rails, bollards, and wreckage in the foreground.
  for (let i = 0; i < 14; i++) {
    const x = -23 + rand() * 46,
      z = 16 + rand() * 24;
    const slab = box(
      terrain,
      concrete,
      x,
      0.035,
      z,
      2 + rand() * 2,
      0.045,
      1 + rand() * 2,
      rand() * 2,
    );
    slab.castShadow = false;
    if (i % 3 === 0) box(terrain, rust, x, 0.34, z, 0.6, 0.7, 1.5, rand() * 3);
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++) {
      if (side === -1 && i === 0) continue;
      const x = side * 18,
        z = -10 + i * 6;
      box(terrain, darkConcrete, x, 0.45, z, 1.3, 0.9, 2.8);
      box(terrain, yellow, x, 0.91, z, 1.32, 0.04, 2.8);
      for (let stripe = 0; stripe < 4; stripe++)
        box(
          terrain,
          metal,
          x + side * 0.66,
          0.6,
          z - 0.9 + stripe * 0.55,
          0.025,
          0.38,
          0.2,
        );
    }
  const container = new THREE.Group();
  container.position.set(-27, 0, -17);
  container.rotation.y = 0.13;
  terrain.add(container);
  box(container, rust, 0, 1.8, 0, 8, 3.6, 3.6);
  for (let x = -3.8; x < 4; x += 0.35)
    box(container, metal, x, 1.8, 1.81, 0.045, 3.4, 0.035);
  box(container, metal, 0, 3.61, 0, 8.05, 0.08, 3.65);
  const label = groundMark("07", 2, 1.2);
  label.rotation.x = 0;
  label.position.set(2, 2, 1.84);
  container.add(label);
  // Derelict radar dish.
  const radar = new THREE.Group();
  radar.position.set(30, 0, -38);
  terrain.add(radar);
  box(radar, concrete, 0, 0.5, 0, 4, 1, 4);
  box(radar, metal, 0, 4, 0, 0.8, 7, 0.8);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(4, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.37),
    new THREE.MeshStandardMaterial({
      color: 0x7c806c,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  dish.position.set(0, 9, 0);
  dish.rotation.x = -0.7;
  radar.add(dish);
  pylon(terrain, -40, -33, 1.15);
  pylon(terrain, -40, -77, 1.1);
  pylon(terrain, 49, -70, 0.95);
  ruins(terrain, collision);
  for (let i = 0; i < 100; i++) {
    const angle = rand() * Math.PI * 2,
      r = 24 + rand() * 70;
    const px = Math.sin(angle) * r,
      pz = Math.cos(angle) * r;
    if (
      (px > -28 && px < 20 && pz < -5 && pz > -45) ||
      (px > 20 && px < 44 && pz > -8 && pz < 25) ||
      (px > -51 && px < -24 && pz > 2 && pz < 36) ||
      (px > -2 && px < 24 && pz > 32 && pz < 53)
    )
      continue;
    const object = box(
      terrain,
      i % 3 ? darkConcrete : rust,
      px,
      0.1 + rand() * 0.2,
      pz,
      0.25 + rand() * 1.6,
      0.2 + rand() * 0.5,
      0.3 + rand() * 1.8,
      rand() * Math.PI,
    );
    object.rotation.z = (rand() - 0.5) * 0.3;
  }
  // Sparse dead trees and telephone poles frame the horizon.
  for (let i = 0; i < 16; i++) {
    const x = (rand() - 0.5) * 240,
      z = -60 - rand() * 90,
      height = 5 + rand() * 6;
    beam(
      terrain,
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x + 0.4, height, z),
      0.18,
      rust,
    );
    for (let j = 0; j < 3; j++)
      beam(
        terrain,
        new THREE.Vector3(x, height * 0.5 + j, z),
        new THREE.Vector3(
          x + (j % 2 ? 1 : -1) * (1.5 + rand()),
          height * 0.7 + j,
          z + 0.2,
        ),
        0.06,
        rust,
      );
  }
  // Batch static structures by material: thousands of pieces, only a few draw calls.
  terrain.updateMatrixWorld(true);
  const batches = new Map(),
    pieces = [];
  terrain.traverse((object) => {
    if (object.isMesh && object.geometry === unitBox) {
      const bounds = new THREE.Box3().setFromObject(object);
      if (
        !object.userData.noCollision &&
        bounds.max.y > 0.18 &&
        bounds.max.y - bounds.min.y > 0.17
      )
        collision.addBox(
          bounds,
          object.userData.background ? "background-masonry" : "structure",
          !object.userData.background && object.userData.walkable !== false,
          object.userData.background ? { movement: false, limbs: false } : {},
        );
      const key = object.material.uuid;
      if (!batches.has(key))
        batches.set(key, { material: object.material, geometries: [] });
      batches
        .get(key)
        .geometries.push(unitBox.clone().applyMatrix4(object.matrixWorld));
      pieces.push(object);
    }
  });
  for (const piece of pieces) piece.removeFromParent();
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometries);
    const combined = new THREE.Mesh(geometry, batch.material);
    combined.castShadow = true;
    combined.receiveShadow = true;
    terrain.add(combined);
    for (const g of batch.geometries) g.dispose();
  }
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x555d51) },
      bottom: { value: new THREE.Color(0xbbb095) },
      sunColor: { value: new THREE.Color(0xe9c994) },
      sunDirection: { value: new THREE.Vector3(-0.6, 0.17, -0.8).normalize() },
    },
    vertexShader:
      "varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "varying vec3 vPos;uniform vec3 top;uniform vec3 bottom;uniform vec3 sunColor;uniform vec3 sunDirection;void main(){vec3 dir=normalize(vPos);float h=clamp(dir.y*1.7,0.,1.);vec3 color=mix(bottom,top,pow(h,.55));float sun=max(0.,dot(dir,sunDirection));color+=sunColor*pow(sun,8.)*.19;color=mix(color,sunColor,pow(sun,650.));gl_FragColor=vec4(color,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(430, 32, 16),
    skyMaterial,
  );
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffdfab, 3.2);
  sun.position.set(-45, 70, -45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  sun.shadow.normalBias = 0.055;
  sun.shadow.bias = -0.00025;
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.HemisphereLight(0xd4d5b7, 0x4e5745, 2.5);
  scene.add(ambient);
  const dustCount = 600;
  const positions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    positions[i * 3] = (rand() - 0.5) * 170;
    positions[i * 3 + 1] = rand() * 16;
    positions[i * 3 + 2] = (rand() - 0.5) * 170;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xdac69c,
      size: 0.075,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  const grid = new THREE.GridHelper(240, 60, 0xe7c393, 0xa9c19a);
  grid.position.y = 0.032;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  grid.visible = false;
  scene.add(grid);
  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-120, 0.035, -120),
      new THREE.Vector3(120, 0.035, -120),
      new THREE.Vector3(120, 0.035, 120),
      new THREE.Vector3(-120, 0.035, 120),
    ]),
    new THREE.LineBasicMaterial({
      color: 0xd1a46b,
      transparent: true,
      opacity: 0.5,
    }),
  );
  scene.add(boundary);
  scene.fog = new THREE.FogExp2(0xa1a18a, 0.0105);
  // Layered smoke and small fires add scale and contrast without external assets.
  const smokeCanvas = document.createElement("canvas");
  smokeCanvas.width = 64;
  smokeCanvas.height = 64;
  const smokeCtx = smokeCanvas.getContext("2d"),
    gradient = smokeCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,.7)");
  gradient.addColorStop(0.5, "rgba(255,255,255,.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  smokeCtx.fillStyle = gradient;
  smokeCtx.fillRect(0, 0, 64, 64);
  const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
  const smoke = [];
  const flames = [];
  for (const [x, z] of [
    [-19, -35],
    [46, -23],
    [-35, 18],
  ]) {
    box(terrain, metal, x, 0.45, z, 3, 0.9, 2);
    collision.addBox(
      new THREE.Box3(
        new THREE.Vector3(x - 1.5, 0, z - 1),
        new THREE.Vector3(x + 1.5, 0.9, z + 1),
      ),
      "burned-wreck",
    );
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTexture,
          color: 0x252f31,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
        }),
      );
      scene.add(puff);
      smoke.push({ puff, x, z, phase: i / 9 });
    }
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTexture,
          color: 0xff8540,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      flame.position.set(x + (i - 1) * 0.45, 0.7, z);
      scene.add(flame);
      flames.push(flame);
    }
  }
  function setWeather(weather) {
    const styles = {
      dusk: {
        fog: 0xa1a18a,
        density: 0.0105,
        top: 0x555d51,
        bottom: 0xbbb095,
        sun: 0xffdfab,
        intensity: 3.2,
        ambient: 2.5,
        dust: 0.34,
      },
      storm: {
        fog: 0x656e62,
        density: 0.021,
        top: 0x303e38,
        bottom: 0x8c9281,
        sun: 0xc2d0bc,
        intensity: 1.4,
        ambient: 2,
        dust: 0.65,
      },
      night: {
        fog: 0x202e31,
        density: 0.012,
        top: 0x0b171d,
        bottom: 0x475459,
        sun: 0xadcbe1,
        intensity: 0.8,
        ambient: 1.2,
        dust: 0.2,
      },
    };
    const s = styles[weather];
    scene.fog.color.setHex(s.fog);
    scene.fog.density = s.density;
    skyMaterial.uniforms.top.value.setHex(s.top);
    skyMaterial.uniforms.bottom.value.setHex(s.bottom);
    skyMaterial.uniforms.sunColor.value.setHex(s.sun);
    sun.color.setHex(s.sun);
    sun.intensity = s.intensity;
    ambient.intensity = s.ambient;
    dust.material.opacity = s.dust;
  }
  function update(dt, time, position) {
    dust.rotation.y = time * 0.002;
    dust.position.x = Math.sin(time * 0.03) * 7;
    sky.position.copy(position);
    sun.target.position.copy(position);
    sun.position.set(position.x - 45, position.y + 70, position.z - 45);
    for (const { puff, x, z, phase } of smoke) {
      const t = (time * 0.065 + phase) % 1;
      puff.position.set(x + t * 3, 1 + t * 12, z + Math.sin(t * 4) * 0.7);
      puff.scale.setScalar(2 + t * 5);
      puff.material.opacity = Math.sin(t * Math.PI) * 0.28;
    }
    for (let i = 0; i < flames.length; i++) {
      const pulse = 0.9 + Math.sin(time * 9 + i) * 0.16;
      flames[i].scale.set(1.4 * pulse, 2.7 * pulse, 1);
    }
  }
  return { grid, setWeather, update, ground, collision, pointsOfInterest };
}
