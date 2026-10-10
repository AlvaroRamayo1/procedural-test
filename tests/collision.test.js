import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CollisionWorld } from "../src/collision.js";
import { Combat } from "../src/combat.js";

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const addBox = (world, min, max) =>
  world.addBox(new THREE.Box3(v(...min), v(...max)));

test("walkers are blocked by walls and can slide along them", () => {
  const world = new CollisionWorld();
  addBox(world, [3, 0, -20], [4, 9, 20]);
  let position = v(0, 0, 0);
  for (let i = 0; i < 240; i++)
    position = world.moveWalker(position, v(5, 0, 2), 1 / 60).position;
  assert.ok(position.x <= 1.41);
  assert.ok(position.z > 7.5);
});
test("a walker climbs and descends a ramp without teleporting to the platform", () => {
  const world = new CollisionWorld();
  world.addRamp({
    x: 0,
    z: -10,
    width: 10,
    length: 20,
    bottom: 0,
    top: 7,
    direction: -1,
  });
  addBox(world, [-8, 6.3, -30], [8, 7, -20]);
  let position = v(0, 0, 2),
    vy = 0;
  for (let i = 0; i < 450; i++) {
    const r = world.moveWalker(position, v(0, 0, -4), 1 / 60, {
      verticalVelocity: vy,
    });
    assert.ok(Math.abs(r.position.y - position.y) < 0.13);
    position = r.position;
    vy = r.verticalVelocity;
  }
  assert.ok(position.y > 6.9 && position.z < -20);
  for (let i = 0; i < 450; i++) {
    const r = world.moveWalker(position, v(0, 0, 4), 1 / 60, {
      verticalVelocity: vy,
    });
    position = r.position;
    vy = r.verticalVelocity;
  }
  assert.equal(position.y, 0);
});
test("walking underneath a floor does not move the robot onto its roof", () => {
  const world = new CollisionWorld();
  addBox(world, [-10, 7, -10], [10, 7.6, 10]);
  const result = world.moveWalker(v(0, 0, 0), v(1, 0, 0), 1 / 60);
  assert.equal(result.position.y, 0);
  assert.ok(result.position.x > 0);
  assert.equal(world.heightAt(0, 0, 1), 0);
  assert.equal(world.heightAt(0, 0, 10), 7.6);
});
test("leaving a ledge applies gravity and lands on the surface below", () => {
  const world = new CollisionWorld();
  addBox(world, [-5, 6.3, -5], [5, 7, 5]);
  let position = v(0, 7, 0),
    vy = 0,
    sawFalling = false;
  for (let i = 0; i < 220; i++) {
    const result = world.moveWalker(position, v(5, 0, 0), 1 / 60, {
      verticalVelocity: vy,
    });
    position = result.position;
    vy = result.verticalVelocity;
    if (!result.grounded && vy < 0) sawFalling = true;
  }
  assert.ok(sawFalling);
  assert.equal(position.y, 0);
});
test("drone ascent and descent respect ceilings, walls and ground clearance", () => {
  const world = new CollisionWorld();
  addBox(world, [-7, 8, -7], [7, 8.5, 7]);
  let position = v(0, 0, 0);
  for (let i = 0; i < 240; i++)
    position = world.moveDrone(position, v(0, 5, 0), 1 / 60).position;
  assert.ok(position.y + 3.8 + 1.3 <= 8.01);
  for (let i = 0; i < 240; i++)
    position = world.moveDrone(position, v(0, -5, 0), 1 / 60).position;
  assert.ok(Math.abs(position.y + 3.8 - 1.4) < 0.01);
  addBox(world, [4, 0, -15], [5, 20, 15]);
  for (let i = 0; i < 120; i++)
    position = world.moveDrone(position, v(5, 0, 0), 1 / 60).position;
  assert.ok(position.x < 1.51);
});
test("raycasts intersect the actual ramp slope and short segments detect cover", () => {
  const world = new CollisionWorld();
  world.addRamp({
    x: 0,
    z: -10,
    width: 10,
    length: 20,
    bottom: 0,
    top: 7,
    direction: -1,
  });
  const hit = world.raycast(new THREE.Ray(v(0, 12, -10), v(0, -1, 0)), 20);
  assert.ok(Math.abs(hit.point.y - 3.5) < 1e-6);
  addBox(world, [8, 0, -1], [8.1, 5, 1]);
  assert.ok(world.segmentHit(v(7.9, 2, 0), v(8.2, 2, 0)));
});
test("projectiles collide with a wall before damaging a drone behind it", () => {
  const world = new CollisionWorld();
  addBox(world, [-5, 0, -5], [5, 6, -4]);
  const combat = new Combat(new THREE.Scene(), () => {}, world);
  combat.enemies.forEach((e) => {
    e.dead = true;
    e.root.visible = false;
  });
  const target = combat.enemies[0];
  target.dead = false;
  target.root.position.set(0, 3, -10);
  target.angle = Math.PI;
  target.radius = 10;
  target.baseHeight = 3;
  target.health = 3;
  combat.addBullet(v(0, 3, 0), v(0, 0, -55), false);
  const robot = { position: v(0, 0, 0), config: { height: 3.25 }, health: 100 };
  for (let i = 0; i < 20; i++) combat.update(1 / 60, 0, robot, false);
  assert.equal(target.health, 3);
  assert.equal(combat.score, 0);
  assert.ok(combat.terrainHits > 0);
});
