import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createMap,
  createMapObject,
  validateMap,
  MAP_TYPES,
} from "../src/map-model.js";
import { buildCustomMap } from "../src/custom-map.js";
import { CollisionWorld } from "../src/collision.js";
import { ThirdPersonCamera } from "../src/third-person.js";
import { Combat } from "../src/combat.js";
const v = (x, y, z) => new THREE.Vector3(x, y, z);

test("map import rejects unsupported types, invalid dimensions and duplicate IDs", () => {
  const map = createMap();
  map.objects = [createMapObject("wall", 10, 10)];
  assert.deepEqual(validateMap(map).objects[0].type, "wall");
  for (const update of [
    { type: "constructor" },
    { width: Infinity },
    { width: 0 },
    { rotation: 45 },
    { x: 60 },
  ]) {
    const broken = structuredClone(map);
    Object.assign(broken.objects[0], update);
    assert.throws(() => validateMap(broken));
  }
  map.objects.push({ ...map.objects[0] });
  assert.throws(() => validateMap(map), /repetidos/);
  map.objects = Array.from({ length: 101 }, () =>
    createMapObject("wall", 10, 10),
  );
  assert.throws(() => validateMap(map), /100/);
});

test("custom ramps preserve their slope under all four editor rotations", () => {
  for (const rotation of [0, 90, 180, 270]) {
    const document = createMap();
    document.objects = [createMapObject("ramp", 0, 0, { rotation })];
    const map = buildCustomMap(new THREE.Scene(), document);
    const direction = rotation === 0 || rotation === 90 ? -1 : 1;
    const axis = rotation % 180 ? "x" : "z";
    const high = axis === "x" ? [direction * 9, 0] : [0, direction * 9];
    const low = axis === "x" ? [-direction * 9, 0] : [0, -direction * 9];
    assert.ok(map.collision.heightAt(...high) > 5.6);
    assert.ok(map.collision.heightAt(...low) < 0.4);
    const hit = map.collision.raycast(
      new THREE.Ray(v(0, 20, 0), v(0, -1, 0)),
      30,
    );
    assert.ok(Math.abs(hit.point.y - 3) < 0.001);
    map.dispose();
  }
});

test("all editor prefabs build with usable collision and clean up their geometry", () => {
  for (const type of Object.keys(MAP_TYPES)) {
    const document = createMap();
    document.objects = [createMapObject(type, 20, 20)];
    const scene = new THREE.Scene(),
      map = buildCustomMap(scene, document, true);
    assert.ok(map.roots.size === 1 && map.collision.solids.length > 4);
    map.dispose();
    assert.equal(scene.children.length, 0);
  }
});

test("custom spawn rejects occupied space and supports elevated platforms", () => {
  const document = createMap();
  document.objects = [createMapObject("platform", 0, 0, { height: 7 })];
  let map = buildCustomMap(new THREE.Scene(), document);
  assert.throws(() => map.spawnPosition(), /inicio/);
  map.dispose();
  document.spawn.y = 7;
  map = buildCustomMap(new THREE.Scene(), document);
  assert.equal(map.spawnPosition().y, 7);
  map.dispose();
});

test("invisible editor boundaries stop high drones without blocking camera rays", () => {
  const document = createMap();
  document.objects = [createMapObject("barrier", 0, 10)];
  const map = buildCustomMap(new THREE.Scene(), document);
  assert.equal(map.roots.values().next().value.visible, false);
  let position = v(0, 20, 0);
  for (let i = 0; i < 180; i++)
    position = map.collision.moveDrone(position, v(0, 0, 6), 1 / 60, {
      height: 0,
      radius: 2,
    }).position;
  assert.ok(position.z < 8);
  assert.equal(map.collision.segmentHit(v(0, 20, 0), v(0, 20, 20)), null);
  map.dispose();
});

function towerSetup() {
  const document = createMap();
  document.objects = [createMapObject("antenna", 0, 0)];
  const scene = new THREE.Scene(),
    map = buildCustomMap(scene, document);
  const tower = map.destruction.entities[0],
    combat = new Combat(scene, () => {}, map.collision);
  combat.destruction = map.destruction;
  combat.setEnabled(false);
  const robot = {
    position: v(0, 0, 10),
    config: { height: 8 },
    health: 100,
    muzzlePosition: () => v(0, 8, 10),
  };
  return { map, tower, combat, robot };
}

test("tower steel blocks walkers and eight real bullet impacts break it", () => {
  const { map, tower, combat, robot } = towerSetup();
  let position = v(0, 0, 10);
  for (let i = 0; i < 180; i++)
    position = map.collision.moveWalker(position, v(0, 0, -6), 1 / 60, {
      radius: 2.1,
      height: 4.95,
    }).position;
  assert.ok(position.z > 3);
  for (let i = 0; i < 8; i++) {
    assert.equal(combat.shoot(robot, v(0, 8, 0)), true);
    for (let frame = 0; frame < 25; frame++)
      combat.update(1 / 60, 0, robot, false);
  }
  assert.equal(tower.health, 0);
  assert.equal(tower.destroyed, true);
  assert.equal(combat.terrainHits, 8);
  map.dispose();
});

test("a missile breaks a tower and falling removes the old elevated hitboxes", () => {
  const { map, tower, combat, robot } = towerSetup();
  combat.setWeapon("missile");
  const cast = () => map.collision.segmentHit(v(0, 12, 10), v(0, 12, -10));
  assert.equal(cast().solid.entity, tower);
  const old = [...tower.colliders];
  combat.shoot(robot, v(0, 8, 0));
  for (let i = 0; i < 60; i++) combat.update(1 / 60, 0, robot, false);
  assert.equal(tower.destroyed, true);
  for (let i = 0; i < 120; i++) map.destruction.update(1 / 60);
  assert.equal(cast(), null);
  assert.ok(tower.bounds.max.y < 6);
  assert.ok(old.every((s) => !map.collision.solids.includes(s)));
  assert.ok(
    [...map.collision.cells.values()].every((bucket) =>
      old.every((s) => !bucket.includes(s)),
    ),
  );
  assert.ok(tower.colliders.every((s) => s.walkable));
  map.destruction.reset();
  assert.equal(tower.health, 8);
  assert.equal(tower.destroyed, false);
  assert.equal(cast().solid.entity, tower);
  map.dispose();
});

test("masonry shields a tower from a nearby missile blast", () => {
  const { map, tower } = towerSetup();
  map.collision.addBox(new THREE.Box3(v(-10, 0, 3), v(10, 20, 3.5)), "cover");
  map.destruction.blast(v(0, 8, 4));
  assert.equal(tower.health, 8);
  map.dispose();
});

test("third-person camera turns freely, clamps pitch and zoom and aims over the shoulder", () => {
  const camera = new THREE.PerspectiveCamera(48),
    rig = new ThirdPersonCamera(camera);
  rig.reset(v(0, 0, 0), 3);
  const yaw = rig.yaw;
  rig.look(200, 10000);
  assert.ok(rig.yaw < yaw);
  assert.equal(rig.pitch, 1.15);
  rig.look(0, -10000);
  assert.equal(rig.pitch, -1.15);
  rig.update(1 / 60, v(0, 0, 0), 3, new CollisionWorld());
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y > 0.85);
  assert.ok(camera.position.y >= 0.45);
  rig.zoom(100000);
  assert.equal(rig.distance, 28);
  rig.zoom(-100000);
  assert.equal(rig.distance, 8);
  rig.reset(v(0, 0, 0), 3);
  rig.aiming = true;
  for (let i = 0; i < 120; i++)
    rig.update(1 / 60, v(0, 0, 0), 3, new CollisionWorld());
  assert.ok(camera.fov < 42.01);
  assert.ok(rig.actualDistance < 12);
});

test("third-person camera stays in front of walls and recovers when the view clears", () => {
  const world = new CollisionWorld(),
    camera = new THREE.PerspectiveCamera(48),
    rig = new ThirdPersonCamera(camera);
  const wall = world.addBox(
    new THREE.Box3(v(-6, 0, 6), v(6, 20, 7)),
    "camera-wall",
  );
  rig.reset(v(0, 0, 0), 3);
  rig.yaw = 0;
  rig.update(1 / 60, v(0, 0, 0), 3, world);
  assert.ok(camera.position.z < 6);
  assert.equal(rig.obstruction.id, "camera-wall");
  world.remove(wall);
  for (let i = 0; i < 120; i++) rig.update(1 / 60, v(0, 0, 0), 3, world);
  assert.equal(rig.obstruction, null);
  assert.ok(rig.actualDistance > 15.9);
});
