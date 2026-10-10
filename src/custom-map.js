import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CollisionWorld } from "./collision.js";
import { DestructionSystem } from "./destruction.js";
import { validateMap } from "./map-model.js";

const cube = new THREE.BoxGeometry(1, 1, 1);
const concrete = new THREE.MeshStandardMaterial({
  color: 0x767970,
  roughness: 1,
});
const dark = new THREE.MeshStandardMaterial({
  color: 0x414940,
  roughness: 0.85,
  metalness: 0.6,
});
const rust = new THREE.MeshStandardMaterial({
  color: 0x8c5a3d,
  roughness: 0.9,
  metalness: 0.4,
});
const boundary = new THREE.MeshBasicMaterial({
  color: 0xe4a262,
  wireframe: true,
  transparent: true,
  opacity: 0.45,
});
const shared = new Set([cube]);
export function buildCustomMap(scene, value, editing = false) {
  const document = validateMap(value),
    group = new THREE.Group();
  const collision = new CollisionWorld(),
    destruction = new DestructionSystem(collision);
  scene.add(group);
  for (const [min, max] of [
    [
      [-150, -5, -150],
      [-60, 80, 150],
    ],
    [
      [60, -5, -150],
      [150, 80, 150],
    ],
    [
      [-60, -5, -150],
      [60, 80, -60],
    ],
    [
      [-60, -5, 60],
      [60, 80, 150],
    ],
  ])
    collision.addBarrier(
      new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)),
      "map-edge",
    );
  const roots = new Map();
  for (const object of document.objects) {
    const root = new THREE.Group();
    root.userData.mapObjectId = object.id;
    root.position.set(object.x, object.y, object.z);
    root.rotation.y = (object.rotation * Math.PI) / 180;
    group.add(root);
    roots.set(object.id, root);
    const { width: w, depth: d, height: h } = object;
    const box = (mat, x, y, z, width, height, depth) => {
      const mesh = new THREE.Mesh(cube, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    };
    const beam = (a, b, thickness) => {
      const mesh = box(dark, 0, 0, 0, thickness, 1, thickness),
        direction = b.clone().sub(a);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      );
      mesh.scale.y = direction.length();
      return mesh;
    };
    if (object.type === "ramp") {
      const direction =
        object.rotation === 0 || object.rotation === 90 ? -1 : 1;
      const solid = collision.addRamp({
        x: object.x,
        z: object.z,
        width: w,
        length: d,
        axis: object.rotation % 180 ? "x" : "z",
        direction,
        bottom: object.y,
        top: object.y + h,
        id: object.id,
      });
      const positions = [];
      for (const face of solid.faces)
        for (const index of face)
          positions.push(...solid.vertices[index].toArray());
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, concrete);
      mesh.castShadow = mesh.receiveShadow = true;
      root.position.set(0, 0, 0);
      root.rotation.y = 0;
      root.add(mesh);
    } else if (object.type === "ruin") {
      const level = h * 0.5;
      box(concrete, 0, level - 0.3, -d * 0.15, w, 0.6, d * 0.7);
      box(concrete, -w * 0.3, h - 0.3, -d * 0.25, w * 0.4, 0.6, d * 0.5);
      for (const x of [-w / 2 + 0.35, 0, w / 2 - 0.35])
        for (const z of [-d / 2 + 0.35, d / 2 - 0.35])
          box(concrete, x, h / 2, z, 0.65, h, 0.65);
      for (const y of [1, level + 1])
        for (let i = 0; i < 4; i++)
          if (i !== 1 || y === 1)
            box(
              concrete,
              -w / 2 + ((i + 0.5) * w) / 4,
              y,
              -d / 2,
              w / 4 - 0.65,
              1.8,
              0.5,
            );
      box(concrete, -w / 2, level * 0.4, 0, 0.55, level * 0.8, d * 0.75);
      for (const z of [-d / 2, d / 2])
        beam(
          new THREE.Vector3(-w / 2, h, z),
          new THREE.Vector3(w / 2, h * 0.88, z),
          0.16,
        );
    } else if (object.type === "antenna") {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          beam(
            new THREE.Vector3(sx * w * 0.4, 0, sz * d * 0.4),
            new THREE.Vector3(sx * w * 0.1, h, sz * d * 0.1),
            0.2,
          );
      for (let y = 1; y < h - 2; y += 3)
        for (const sz of [-1, 1]) {
          const lower = 0.4 - (y / h) * 0.3,
            upper = 0.4 - ((y + 3) / h) * 0.3;
          beam(
            new THREE.Vector3(-w * lower, y, sz * d * lower),
            new THREE.Vector3(w * upper, y + 3, sz * d * upper),
            0.12,
          );
          beam(
            new THREE.Vector3(w * lower, y, sz * d * lower),
            new THREE.Vector3(-w * upper, y + 3, sz * d * upper),
            0.12,
          );
        }
      for (const y of [h * 0.8, h])
        beam(
          new THREE.Vector3(-w * 0.8, y, 0),
          new THREE.Vector3(w * 0.8, y, 0),
          0.2,
        );
      destruction.add(root, object.id);
    } else if (object.type === "barrier") {
      box(boundary, 0, h / 2, 0, w, h, d);
      root.visible = editing;
    } else {
      box(object.type === "crate" ? rust : concrete, 0, h / 2, 0, w, h, d);
      if (object.type === "crate")
        for (let x = -w / 2 + 0.3; x < w / 2; x += 0.5)
          box(dark, x, h / 2, d / 2 + 0.01, 0.035, h * 0.92, 0.035);
    }
    root.updateWorldMatrix(true, true);
    if (!["ramp", "antenna"].includes(object.type))
      root.traverse((mesh) => {
        if (mesh.isMesh)
          collision.addBox(
            new THREE.Box3().setFromObject(mesh),
            object.id,
            object.type !== "barrier",
            object.type === "barrier" ? { raycast: false } : {},
          );
      });
    // Merge each prefab separately so it remains selectable in the editor.
    if (object.type !== "antenna") {
      const batches = new Map(),
        meshes = [];
      root.traverse((mesh) => {
        if (!mesh.isMesh || mesh.geometry !== cube) return;
        const key = mesh.material.uuid;
        if (!batches.has(key))
          batches.set(key, { material: mesh.material, geometries: [] });
        const matrix = new THREE.Matrix4()
          .copy(root.matrixWorld)
          .invert()
          .multiply(mesh.matrixWorld);
        batches
          .get(key)
          .geometries.push(mesh.geometry.clone().applyMatrix4(matrix));
        meshes.push(mesh);
      });
      for (const mesh of meshes) mesh.removeFromParent();
      for (const batch of batches.values()) {
        const mesh = new THREE.Mesh(
          mergeGeometries(batch.geometries),
          batch.material,
        );
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        batch.geometries.forEach((geometry) => geometry.dispose());
      }
    }
  }
  return {
    group,
    collision,
    destruction,
    document,
    roots,
    dispose() {
      destruction.dispose();
      group.removeFromParent();
      group.traverse((object) => {
        if (object.geometry && !shared.has(object.geometry))
          object.geometry.dispose();
      });
    },
    spawnPosition() {
      const spawn = document.spawn,
        position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
      const floor = collision.heightAt(spawn.x, spawn.z, spawn.y + 0.6);
      position.y = Math.max(spawn.y, floor);
      const blocked = [...collision.query(spawn.x, spawn.z, 2.1)].some(
        (solid) =>
          collision.overlaps(
            solid,
            position,
            2.1,
            position.y + 0.12,
            position.y + 4.95,
          ),
      );
      if (blocked)
        throw new Error(
          "El punto de inicio está dentro de un objeto. Coloca INICIO en una superficie libre.",
        );
      return position;
    },
  };
}
