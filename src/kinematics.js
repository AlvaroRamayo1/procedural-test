import * as THREE from "three";

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const smooth = (a, b, response, dt) =>
  THREE.MathUtils.lerp(a, b, 1 - Math.exp(-response * dt));
export const ease = (t) => t * t * (3 - 2 * t);

// Analytic two-bone IK. The bend direction determines the mechanical knee plane.
export function solveLeg(hip, foot, upperLength, lowerLength, bendDirection) {
  const axis = foot.clone().sub(hip);
  const rawDistance = axis.length();
  if (rawDistance < 1e-7) axis.set(0, -1, 0);
  else axis.multiplyScalar(1 / rawDistance);
  const distance = clamp(
    rawDistance,
    Math.abs(upperLength - lowerLength) + 0.001,
    upperLength + lowerLength - 0.001,
  );
  const projection =
    (upperLength * upperLength -
      lowerLength * lowerLength +
      distance * distance) /
    (2 * distance);
  const height = Math.sqrt(
    Math.max(0, upperLength * upperLength - projection * projection),
  );
  const bend = bendDirection
    .clone()
    .addScaledVector(axis, -bendDirection.dot(axis));
  if (bend.lengthSq() < 1e-7) {
    bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
    if (bend.lengthSq() < 1e-7) bend.set(0, 0, 1);
  }
  bend.normalize();
  const knee = hip
    .clone()
    .addScaledVector(axis, projection)
    .addScaledVector(bend, height);
  const reachableFoot = hip.clone().addScaledVector(axis, distance);
  return {
    knee,
    foot: reachableFoot,
    reachable: Math.abs(rawDistance - distance) < 0.002,
  };
}

export function swingFoot(start, target, progress, lift) {
  const t = clamp(progress, 0, 1);
  const result = start.clone().lerp(target, ease(t));
  result.y += Math.sin(t * Math.PI) * lift;
  return result;
}

export function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
