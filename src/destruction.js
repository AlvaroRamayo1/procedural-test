import * as THREE from "three";

export class DestructionSystem {
  constructor(collision, onBreak = () => {}) {
    this.collision = collision;
    this.onBreak = onBreak;
    this.entities = [];
  }
  add(root, id, label = "Torre de comunicaciones", extras = []) {
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      object.userData.dynamic = true;
    });
    const entity = {
      id,
      label,
      root,
      extras,
      health: 8,
      destroyed: false,
      elapsed: 0,
      initial: root.quaternion.clone(),
      colliders: [],
      bounds: new THREE.Box3(),
      fallYaw: 0,
    };
    this.entities.push(entity);
    this.sync(entity);
    return entity;
  }
  sync(entity) {
    for (const collider of entity.colliders) this.collision.remove(collider);
    entity.colliders = [];
    entity.root.updateWorldMatrix(true, true);
    entity.bounds.setFromObject(entity.root);
    entity.root.traverse((object) => {
      if (!object.isMesh) return;
      const bounds = new THREE.Box3()
        .setFromObject(object)
        .expandByScalar(0.04);
      entity.colliders.push(
        this.collision.addBox(
          bounds,
          entity.id,
          entity.destroyed && entity.elapsed >= 1.8,
          { entity: entity.destroyed ? null : entity },
        ),
      );
    });
  }
  damage(entity, amount, origin) {
    if (!entity || entity.destroyed || !(amount > 0)) return false;
    entity.health = Math.max(0, entity.health - amount);
    if (!entity.health) {
      entity.destroyed = true;
      entity.elapsed = 0;
      const direction = origin
        ? entity.root.position.clone().sub(origin)
        : new THREE.Vector3(1, 0, 0);
      entity.fallYaw = Math.atan2(-direction.z, direction.x);
      for (const extra of entity.extras) extra.visible = false;
      this.onBreak(entity);
    }
    return true;
  }
  blast(position, radius = 7) {
    for (const entity of this.entities) {
      if (entity.destroyed) continue;
      const target = entity.bounds.clampPoint(position, new THREE.Vector3());
      const distance = target.distanceTo(position);
      if (distance > radius) continue;
      const cover = this.collision.segmentHit(position, target);
      if (
        cover &&
        cover.solid?.entity !== entity &&
        cover.distance < distance - 0.1
      )
        continue;
      this.damage(entity, distance < 3.5 ? 8 : 4, position);
    }
  }
  update(dt) {
    for (const entity of this.entities) {
      if (!entity.destroyed || entity.elapsed >= 1.8) continue;
      entity.elapsed = Math.min(1.8, entity.elapsed + dt);
      const t = entity.elapsed / 1.8,
        angle = (Math.PI / 2 - 0.035) * t * t;
      entity.root.quaternion.setFromEuler(
        new THREE.Euler(0, entity.fallYaw, -angle, "YXZ"),
      );
      entity.root.quaternion.multiply(entity.initial);
      this.sync(entity);
    }
  }
  reset() {
    for (const entity of this.entities) {
      entity.health = 8;
      entity.destroyed = false;
      entity.elapsed = 0;
      entity.root.quaternion.copy(entity.initial);
      for (const extra of entity.extras) extra.visible = true;
      this.sync(entity);
    }
  }
  dispose() {
    for (const entity of this.entities)
      for (const collider of entity.colliders) this.collision.remove(collider);
    this.entities = [];
  }
}
