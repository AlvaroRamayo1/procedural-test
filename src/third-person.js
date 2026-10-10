import * as THREE from "three";
import { clamp } from "./kinematics.js";

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.atan2(11, 14);
    this.pitch = 0.28;
    this.distance = 16;
    this.actualDistance = 16;
    this.pivot = new THREE.Vector3();
    this.ready = false;
    this.aiming = false;
    this.obstruction = null;
  }
  look(dx, dy) {
    this.yaw -= dx * 0.003;
    this.pitch = clamp(this.pitch + dy * 0.003, -1.15, 1.15);
  }
  zoom(delta) {
    this.distance = clamp(this.distance * Math.exp(delta * 0.001), 8, 28);
  }
  reset(position, height) {
    this.yaw = Math.atan2(11, 14);
    this.pitch = 0.28;
    this.distance = 16;
    this.actualDistance = 16;
    this.pivot.copy(position).add(new THREE.Vector3(0, height + 1.1, 0));
    this.ready = true;
  }
  update(dt, position, height, collision) {
    const target = position.clone().add(new THREE.Vector3(0, height + 1.1, 0));
    if (!this.ready) this.reset(position, height);
    this.pivot.lerp(target, 1 - Math.exp(-Math.max(dt, 0.001) * 14));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const lookAt = this.pivot
      .clone()
      .addScaledVector(right, this.aiming ? 1.55 : 1.2);
    const shoulderHit = collision?.segmentHit(this.pivot, lookAt);
    if (shoulderHit)
      lookAt
        .copy(this.pivot)
        .addScaledVector(right, Math.max(0, shoulderHit.distance - 0.3));
    const behind = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const wanted = this.distance * (this.aiming ? 0.72 : 1);
    let allowed = wanted,
      obstruction = null;
    // Four offset rays provide camera thickness at wall and doorway edges.
    for (const offset of [
      new THREE.Vector3(),
      right.clone().multiplyScalar(0.25),
      right.clone().multiplyScalar(-0.25),
      new THREE.Vector3(0, 0.25, 0),
    ]) {
      const hit = collision?.raycast(
        new THREE.Ray(lookAt.clone().add(offset), behind),
        wanted,
      );
      if (hit && hit.distance - 0.45 < allowed) {
        allowed = Math.max(0.2, hit.distance - 0.45);
        obstruction = hit;
      }
    }
    this.actualDistance =
      allowed < this.actualDistance
        ? allowed
        : THREE.MathUtils.lerp(
            this.actualDistance,
            allowed,
            1 - Math.exp(-Math.max(dt, 0.001) * 5),
          );
    this.camera.position
      .copy(lookAt)
      .addScaledVector(behind, this.actualDistance);
    const groundCorrection = Math.max(0, 0.45 - this.camera.position.y);
    this.camera.position.y += groundCorrection;
    lookAt.y += groundCorrection;
    this.camera.lookAt(lookAt);
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      this.aiming ? 42 : 48,
      1 - Math.exp(-Math.max(dt, 0.001) * 9),
    );
    this.camera.updateProjectionMatrix();
    this.obstruction = obstruction
      ? { id: obstruction.solid?.id, distance: obstruction.distance }
      : null;
    return lookAt;
  }
}
