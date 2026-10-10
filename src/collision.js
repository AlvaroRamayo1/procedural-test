import * as THREE from "three";
import { clamp } from "./kinematics.js";

const EPS = 0.002;
const up = new THREE.Vector3(0, 1, 0);

// A spatial hash keeps terrain queries local. Visual geometry and collision shapes
// share the same dimensions; ramps use their actual sloping surface, not a box.
export class CollisionWorld {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.solids = [];
  }
  addBox(bounds, id = "structure", walkable = true) {
    return this.register({ bounds: bounds.clone(), id, walkable, type: "box" });
  }
  addRamp({
    x,
    z,
    width,
    length,
    axis = "z",
    direction = -1,
    bottom = 0,
    top = 7,
    id = "ramp",
  }) {
    const halfX = (axis === "x" ? length : width) / 2;
    const halfZ = (axis === "z" ? length : width) / 2;
    const bounds = new THREE.Box3(
      new THREE.Vector3(x - halfX, bottom - 0.35, z - halfZ),
      new THREE.Vector3(x + halfX, top, z + halfZ),
    );
    const ramp = {
      bounds,
      id,
      type: "ramp",
      walkable: true,
      axis,
      direction,
      bottom,
      top,
    };
    const vertices = [
      new THREE.Vector3(bounds.min.x, bottom - 0.35, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bottom - 0.35, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bottom - 0.35, bounds.max.z),
      new THREE.Vector3(bounds.min.x, bottom - 0.35, bounds.max.z),
    ];
    for (let i = 0; i < 4; i++)
      vertices.push(
        new THREE.Vector3(
          vertices[i].x,
          this.topAt(ramp, vertices[i].x, vertices[i].z),
          vertices[i].z,
        ),
      );
    ramp.vertices = vertices;
    ramp.faces = [
      [4, 5, 6],
      [4, 6, 7],
      [0, 2, 1],
      [0, 3, 2],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ];
    return this.register(ramp);
  }
  register(solid) {
    this.solids.push(solid);
    const { min, max } = solid.bounds;
    for (
      let x = Math.floor(min.x / this.cellSize);
      x <= Math.floor(max.x / this.cellSize);
      x++
    )
      for (
        let z = Math.floor(min.z / this.cellSize);
        z <= Math.floor(max.z / this.cellSize);
        z++
      ) {
        const key = `${x},${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(solid);
      }
    return solid;
  }
  query(x, z, radius = 0) {
    const found = new Set();
    for (
      let cx = Math.floor((x - radius) / this.cellSize);
      cx <= Math.floor((x + radius) / this.cellSize);
      cx++
    )
      for (
        let cz = Math.floor((z - radius) / this.cellSize);
        cz <= Math.floor((z + radius) / this.cellSize);
        cz++
      )
        for (const solid of this.cells.get(`${cx},${cz}`) || [])
          found.add(solid);
    return found;
  }
  topAt(solid, x, z) {
    if (solid.type !== "ramp") return solid.bounds.max.y;
    const axis = solid.axis;
    let t = clamp(
      ((axis === "x" ? x : z) - solid.bounds.min[axis]) /
        (solid.bounds.max[axis] - solid.bounds.min[axis]),
      0,
      1,
    );
    if (solid.direction < 0) t = 1 - t;
    return solid.bottom + (solid.top - solid.bottom) * t;
  }
  heightAt(x, z, ceiling = Infinity) {
    let height = 0;
    for (const solid of this.query(x, z)) {
      const { min, max } = solid.bounds;
      if (
        !solid.walkable ||
        x < min.x - EPS ||
        x > max.x + EPS ||
        z < min.z - EPS ||
        z > max.z + EPS
      )
        continue;
      const top = this.topAt(solid, x, z);
      if (top <= ceiling + EPS && top > height) height = top;
    }
    return height;
  }
  overlaps(solid, position, radius, bottom, top, stepHeight = 0) {
    const { min, max } = solid.bounds;
    const nearX = clamp(position.x, min.x, max.x),
      nearZ = clamp(position.z, min.z, max.z);
    if ((position.x - nearX) ** 2 + (position.z - nearZ) ** 2 >= radius ** 2)
      return false;
    const surface = this.topAt(solid, nearX, nearZ);
    if (surface <= bottom + stepHeight + EPS || min.y >= top - EPS)
      return false;
    return true;
  }
  moveWalker(position, velocity, dt, options = {}) {
    const {
      radius = 1.6,
      height = 5,
      stepHeight = 0.55,
      verticalVelocity = 0,
    } = options;
    const next = position.clone();
    const blocked = { x: false, z: false };
    for (const axis of ["x", "z"]) {
      const candidate = next.clone();
      candidate[axis] += velocity[axis] * dt;
      const floor = this.heightAt(
        candidate.x,
        candidate.z,
        next.y + stepHeight,
      );
      const candidateY = floor > next.y ? floor : next.y;
      const obstruction = [
        ...this.query(candidate.x, candidate.z, radius),
      ].some((s) =>
        this.overlaps(
          s,
          candidate,
          radius,
          candidateY + 0.12,
          candidateY + height,
          stepHeight,
        ),
      );
      if (obstruction) blocked[axis] = true;
      else {
        next[axis] = candidate[axis];
        if (floor > next.y) next.y = floor;
      }
    }
    next.x = clamp(next.x, -117, 117);
    next.z = clamp(next.z, -117, 117);
    const floor = this.heightAt(next.x, next.z, next.y + stepHeight);
    let vy = verticalVelocity,
      grounded = false;
    if (next.y - floor <= 0.35 && vy <= 0) {
      next.y = floor;
      vy = 0;
      grounded = true;
    } else {
      vy -= 18 * dt;
      next.y += vy * dt;
      if (next.y <= floor) {
        next.y = floor;
        vy = 0;
        grounded = true;
      }
    }
    return { position: next, verticalVelocity: vy, grounded, blocked };
  }
  moveDrone(position, velocity, dt, { height = 3.8, radius = 2.5 } = {}) {
    const next = position.clone(),
      blocked = { x: false, y: false, z: false };
    // position.y is the robot's reference plane; its actual hull is above it.
    for (const axis of ["y", "x", "z"]) {
      const candidate = next.clone();
      candidate[axis] += velocity[axis] * dt;
      candidate.y = clamp(candidate.y, 1.4 - height, 42 - height);
      const obstruction = [
        ...this.query(candidate.x, candidate.z, radius),
      ].some((s) =>
        this.overlaps(
          s,
          candidate,
          radius,
          candidate.y + height - 1.05,
          candidate.y + height + 1.3,
        ),
      );
      if (obstruction) blocked[axis] = true;
      else next.copy(candidate);
    }
    next.x = clamp(next.x, -116, 116);
    next.z = clamp(next.z, -116, 116);
    return {
      position: next,
      grounded: false,
      verticalVelocity: velocity.y,
      blocked,
    };
  }
  raycast(ray, maxDistance = 150, includeGround = true) {
    const candidates = new Set();
    const samples = Math.max(
      1,
      Math.ceil(maxDistance / (this.cellSize * 0.45)),
    );
    for (let i = 0; i <= samples; i++) {
      const p = ray.at((i / samples) * maxDistance, new THREE.Vector3());
      for (const solid of this.query(p.x, p.z)) candidates.add(solid);
    }
    let closest = null;
    const accept = (point, solid) => {
      if (!point) return;
      const distance = point.distanceTo(ray.origin);
      if (distance <= maxDistance && (!closest || distance < closest.distance))
        closest = { point: point.clone(), distance, solid };
    };
    for (const solid of candidates) {
      if (!ray.intersectsBox(solid.bounds)) continue;
      if (solid.type === "ramp")
        for (const [a, b, c] of solid.faces)
          accept(
            ray.intersectTriangle(
              solid.vertices[a],
              solid.vertices[b],
              solid.vertices[c],
              false,
              new THREE.Vector3(),
            ),
            solid,
          );
      else accept(ray.intersectBox(solid.bounds, new THREE.Vector3()), solid);
    }
    if (includeGround)
      accept(
        ray.intersectPlane(new THREE.Plane(up, 0), new THREE.Vector3()),
        null,
      );
    return closest;
  }
  segmentHit(start, end) {
    const direction = end.clone().sub(start),
      distance = direction.length();
    if (distance < EPS) return null;
    return this.raycast(
      new THREE.Ray(start.clone(), direction.divideScalar(distance)),
      distance,
    );
  }
}
