import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CollisionWorld } from "../src/collision.js";
import { resolveLegPose, legPoseClear } from "../src/leg-collision.js";
import { solveLeg } from "../src/kinematics.js";
import { ROBOTS } from "../src/robots.js";

const v = (x, y, z) => new THREE.Vector3(x, y, z);
test("a planted leg retracts its foot and redirects its knee away from a wall", () => {
  const world = new CollisionWorld();
  world.addBox(new THREE.Box3(v(3.65, 0, -10), v(3.8, 8, 10)));
  const hip = v(1.4, 3.02, -1.15),
    foot = v(3.1, 0.14, -1.725),
    bend = v(1, 0.25, -0.276);
  assert.equal(
    legPoseClear(world, hip, solveLeg(hip, foot, 2.4, 2.6, bend)),
    false,
  );
  const pose = resolveLegPose(world, hip, foot, 2.4, 2.6, bend, v(0, 0, 0));
  assert.equal(pose.obstructed, false);
  assert.ok(pose.foot.x + 0.57 <= 3.65);
  assert.ok(Math.abs(hip.distanceTo(pose.knee) - 2.4) < 1e-6);
  assert.ok(Math.abs(pose.knee.distanceTo(pose.foot) - 2.6) < 1e-6);
  assert.ok(legPoseClear(world, hip, pose));
});
test("a clear planted foot remains fixed when no obstacle requires adjustment", () => {
  const world = new CollisionWorld();
  const hip = v(1.4, 3.02, 1.15),
    foot = v(3.1, 0.14, 1.725);
  const pose = resolveLegPose(
    world,
    hip,
    foot,
    2.4,
    2.6,
    v(1, 0.25, 0.276),
    v(0, 0, 0),
  );
  assert.equal(pose.adjusted, false);
  assert.ok(pose.foot.distanceTo(foot) < 1e-8);
});
test("limb sweeps detect a thin wall between endpoints and allow floor contact", () => {
  const world = new CollisionWorld();
  world.addBox(new THREE.Box3(v(2, 0, -4), v(2.03, 8, 4)));
  assert.equal(world.limbClear(v(0, 3, 0), v(4, 3, 0), 0.2), false);
  world.addBox(new THREE.Box3(v(-5, 6.3, -5), v(1, 7, 5)));
  assert.equal(world.footClear(v(0, 7.14, 0)), true);
  assert.equal(world.footClear(v(0, 6.9, 0)), false);
  assert.equal(world.footClear(v(1.6, 0.14, 0)), false);
});
test("the chassis passes below a ceiling that only touches the decorative antenna", () => {
  const world = new CollisionWorld();
  world.addBox(new THREE.Box3(v(-5, 5.2, -5), v(5, 5.6, 5)));
  const config = ROBOTS.strider;
  const result = world.moveWalker(v(0, 0, 0), v(4, 0, 0), 1 / 60, {
    radius: config.hullRadius,
    height: config.height + config.hullTop,
  });
  assert.ok(result.position.x > 0);
  assert.equal(result.blocked.x, false);
});
test("background barriers block both walking and high flight but allow rays through", () => {
  const world = new CollisionWorld();
  world.addBarrier(new THREE.Box3(v(4, -5, -10), v(12, 80, 10)));
  let walker = v(0, 0, 0),
    drone = v(0, 30, 0);
  for (let i = 0; i < 240; i++) {
    walker = world.moveWalker(walker, v(5, 0, 0), 1 / 60).position;
    drone = world.moveDrone(drone, v(5, 0, 0), 1 / 60).position;
  }
  assert.ok(walker.x <= 2.41);
  assert.ok(drone.x <= 1.51);
  assert.equal(world.heightAt(8, 0), 0);
  assert.equal(world.segmentHit(v(0, 3, 0), v(20, 3, 0)), null);
});
