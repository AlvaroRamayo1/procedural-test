import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { solveLeg, swingFoot, seededRandom } from "../src/kinematics.js";

test("IK reaches the target while preserving both mechanical segment lengths", () => {
  const hip = new Vector3(1, 3.25, 1),
    foot = new Vector3(3, 0.14, 2);
  const {
    knee,
    foot: resolved,
    reachable,
  } = solveLeg(hip, foot, 2.4, 2.6, new Vector3(1, 0.25, 0.2));
  assert.equal(reachable, true);
  assert.ok(Math.abs(hip.distanceTo(knee) - 2.4) < 1e-6);
  assert.ok(Math.abs(knee.distanceTo(resolved) - 2.6) < 1e-6);
  assert.ok(foot.distanceTo(resolved) < 1e-6);
});
test("IK remains finite for out-of-reach and coincident endpoints", () => {
  for (const foot of [
    new Vector3(100, 0, 0),
    new Vector3(),
    new Vector3(0.01, 0, 0),
  ]) {
    const result = solveLeg(new Vector3(), foot, 2, 3, new Vector3(1, 0, 0));
    assert.equal(result.reachable, false);
    assert.ok(
      [...result.knee.toArray(), ...result.foot.toArray()].every(
        Number.isFinite,
      ),
    );
    assert.ok(Math.abs(result.knee.length() - 2) < 1e-6);
    assert.ok(Math.abs(result.knee.distanceTo(result.foot) - 3) < 1e-6);
  }
});
test("knee bend direction selects opposite sides of the joint plane", () => {
  const hip = new Vector3(0, 3, 0),
    foot = new Vector3(0, 0, 0);
  const left = solveLeg(hip, foot, 2, 2, new Vector3(-1, 0, 0));
  const right = solveLeg(hip, foot, 2, 2, new Vector3(1, 0, 0));
  assert.ok(left.knee.x < 0 && right.knee.x > 0);
  assert.ok(Math.abs(left.knee.x + right.knee.x) < 1e-6);
});
test("swing has grounded endpoints, specified midpoint lift, and clamped progress", () => {
  const start = new Vector3(1, 0.14, 0),
    target = new Vector3(3, 0.14, 2);
  assert.ok(swingFoot(start, target, 0, 0.8).distanceTo(start) < 1e-7);
  assert.ok(swingFoot(start, target, 1, 0.8).distanceTo(target) < 1e-7);
  const middle = swingFoot(start, target, 0.5, 0.8);
  assert.ok(Math.abs(middle.y - 0.94) < 1e-7);
  assert.ok(swingFoot(start, target, -2, 0.8).distanceTo(start) < 1e-7);
  assert.ok(swingFoot(start, target, 3, 0.8).distanceTo(target) < 1e-7);
});
test("field generation is deterministic and stays within the unit interval", () => {
  const a = seededRandom(71),
    b = seededRandom(71);
  for (let i = 0; i < 200; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});
