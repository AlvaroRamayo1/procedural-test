import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Combat } from "../src/combat.js";
import { CollisionWorld } from "../src/collision.js";
const v = (x, y, z) => new THREE.Vector3(x, y, z);
function setup(world = new CollisionWorld()) {
  const combat = new Combat(new THREE.Scene(), () => {}, world);
  combat.enemies.forEach((e) => {
    e.dead = true;
    e.respawn = 100;
    e.root.visible = false;
  });
  const target = combat.enemies[0];
  Object.assign(target, { dead: false, angle: 0, radius: 10, baseHeight: 3 });
  target.root.position.set(0, 3, 10);
  const robot = {
    position: v(0, 0, 0),
    config: { height: 3 },
    health: 100,
    muzzlePosition: () => v(0, 3, 0),
  };
  combat.setWeapon("missile");
  return { combat, target, robot };
}
test("a missile launches, observes its cooldown and destroys a drone on impact", () => {
  const { combat, target, robot } = setup();
  assert.equal(combat.shoot(robot, target.root.position), true);
  assert.equal(combat.shoot(robot, target.root.position), false);
  assert.equal(combat.missilesFired, 1);
  for (let i = 0; i < 35; i++) combat.update(1 / 60, 0, robot, false);
  assert.equal(combat.explosions, 1);
  assert.equal(combat.score, 1);
  assert.equal(target.dead, true);
  assert.ok(combat.effects.some((e) => e.smoke));
  assert.equal(combat.bullets.length, 0);
});
test("walls stop missiles and shield drones from explosion damage", () => {
  const world = new CollisionWorld();
  world.addBox(new THREE.Box3(v(-8, 0, 4), v(8, 8, 4.3)));
  const { combat, target, robot } = setup(world);
  combat.shoot(robot, target.root.position);
  for (let i = 0; i < 35; i++) combat.update(1 / 60, 0, robot, false);
  assert.equal(combat.explosions, 1);
  assert.equal(combat.terrainHits, 1);
  assert.equal(target.health, 3);
  assert.equal(combat.score, 0);
});
test("missile blast damages nearby exposed drones and reset clears all effects", () => {
  const { combat, target, robot } = setup();
  const nearby = combat.enemies[1];
  Object.assign(nearby, {
    dead: false,
    angle: Math.atan2(2, 10),
    radius: Math.hypot(2, 10),
    baseHeight: 3,
  });
  nearby.root.position.set(2, 3, 10);
  combat.shoot(robot, target.root.position);
  for (let i = 0; i < 35; i++) combat.update(1 / 60, 0, robot, false);
  assert.equal(combat.score, 2);
  combat.reset();
  assert.equal(combat.missilesFired, 0);
  assert.equal(combat.explosions, 0);
  assert.equal(combat.effects.length, 0);
  assert.equal(combat.bullets.length, 0);
  assert.equal(combat.weaponMode, "missile");
});
