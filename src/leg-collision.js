import * as THREE from "three";
import { solveLeg } from "./kinematics.js";

export function legPoseClear(world, hip, pose) {
  const { knee, foot } = pose;
  return (
    world.footClear(foot) &&
    world.limbClear(hip, knee, 0.34) &&
    world.limbClear(knee, knee.clone().lerp(foot, 0.65), 0.24) &&
    world.limbClear(
      knee.clone().lerp(foot, 0.65),
      foot.clone().lerp(knee, 0.06),
      0.13,
    )
  );
}

// First preserve the planted foot and steer its knee around the obstacle.
// Only relocate the support if no reachable knee rotation clears the wall.
export function resolveLegPose(
  world,
  hip,
  desired,
  upper,
  lower,
  bend,
  center,
  grounded = true,
  preserveLift = false,
) {
  const solve = (foot, direction) =>
    solveLeg(hip, foot, upper, lower, direction);
  const base = solve(desired, bend);
  if (!world || legPoseClear(world, hip, base))
    return { ...base, adjusted: false, obstructed: false };
  const angles = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, Math.PI];
  const tryFoot = (foot) => {
    if (!world.footClear(foot)) return null;
    const axis = foot.clone().sub(hip).normalize();
    for (const angle of angles) {
      const pose = solve(foot, bend.clone().applyAxisAngle(axis, angle));
      if (legPoseClear(world, hip, pose))
        return { ...pose, adjusted: true, obstructed: false };
    }
    return null;
  };
  let clear = tryFoot(desired);
  if (clear) return clear;
  const tangent = new THREE.Vector3(
    desired.z - center.z,
    0,
    center.x - desired.x,
  ).normalize();
  for (const inset of [0.18, 0.35, 0.5, 0.65, 0.8, 1]) {
    for (const offset of [0, 0.65, -0.65, 1.2, -1.2]) {
      const foot = desired
        .clone()
        .lerp(center, inset)
        .addScaledVector(tangent, offset);
      foot.y = grounded
        ? world.heightAt(foot.x, foot.z, center.y + 2) + 0.14
        : desired.y;
      // Keep the raised foot raised during its swing instead of snapping down.
      if (grounded && preserveLift) foot.y = Math.max(foot.y, desired.y);
      clear = tryFoot(foot);
      if (clear) return clear;
    }
  }
  return { ...base, adjusted: true, obstructed: true };
}
