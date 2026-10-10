import * as THREE from "three";
import { seededRandom, clamp } from "./kinematics.js";

const rng = seededRandom(93),
  up = new THREE.Vector3(0, 1, 0);
const metal = new THREE.MeshStandardMaterial({
  color: 0x39433a,
  roughness: 0.6,
  metalness: 0.7,
});
const shell = new THREE.MeshStandardMaterial({
  color: 0xaaa08a,
  roughness: 0.8,
  metalness: 0.5,
});
const red = new THREE.MeshStandardMaterial({
  color: 0xff6544,
  emissive: 0xff3c19,
  emissiveIntensity: 3,
});
const sphereGeo = new THREE.SphereGeometry(1, 10, 8),
  boxGeo = new THREE.BoxGeometry(1, 1, 1);

export class Combat {
  constructor(scene, onEvent, collision = null) {
    this.scene = scene;
    this.onEvent = onEvent;
    this.collision = collision;
    this.terrainHits = 0;
    this.enemies = [];
    this.bullets = [];
    this.effects = [];
    this.score = 0;
    this.enabled = true;
    this.shotCooldown = 0;
    this.empCooldown = 0;
    this.soundEnabled = false;
    this.reset();
  }
  reset() {
    this.terrainHits = 0;
    for (const e of this.enemies) this.scene.remove(e.root);
    this.enemies = [];
    for (const b of this.bullets) {
      this.scene.remove(b.mesh);
      b.mesh.material.dispose();
    }
    this.bullets = [];
    for (const e of this.effects) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
    this.effects = [];
    this.score = 0;
    this.shotCooldown = 0;
    this.empCooldown = 0;
    for (let i = 0; i < 6; i++) this.spawn(i);
  }
  spawn(index) {
    const root = new THREE.Group();
    const angle = (index * Math.PI) / 3 + 0.5,
      r = 18 + rng() * 10;
    root.position.set(
      Math.sin(angle) * r,
      3.6 + rng() * 2,
      Math.cos(angle) * r,
    );
    this.scene.add(root);
    root.visible = this.enabled;
    const body = new THREE.Mesh(sphereGeo, shell);
    body.scale.set(0.9, 0.52, 0.9);
    body.castShadow = true;
    root.add(body);
    const eye = new THREE.Mesh(sphereGeo, red);
    eye.position.set(0, -0.12, -0.82);
    eye.scale.set(0.14, 0.14, 0.08);
    root.add(eye);
    const rotors = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(boxGeo, metal);
      arm.scale.set(2.5, 0.12, 0.16);
      arm.position.set(0, 0, side * 0.5);
      root.add(arm);
      for (const x of [-1.35, 1.35]) {
        const rotor = new THREE.Mesh(
          new THREE.TorusGeometry(0.46, 0.08, 5, 16),
          metal,
        );
        rotor.rotation.x = Math.PI / 2;
        rotor.position.set(x, 0, side * 0.5);
        root.add(rotor);
        const blade = new THREE.Mesh(boxGeo, metal);
        blade.scale.set(0.85, 0.03, 0.09);
        blade.position.copy(rotor.position);
        root.add(blade);
        rotors.push(blade);
      }
    }
    const indicator = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.44, 32),
      new THREE.MeshBasicMaterial({
        color: 0xe99956,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      }),
    );
    indicator.rotation.x = -Math.PI / 2;
    indicator.position.y = -root.position.y + 0.035;
    root.add(indicator);
    this.enemies.push({
      root,
      rotors,
      indicator,
      health: 3,
      angle,
      radius: r,
      baseHeight: root.position.y,
      shootTime: 2 + index * 0.7,
      respawn: 0,
      dead: false,
    });
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    for (const e of this.enemies) e.root.visible = enabled && !e.dead;
  }
  sound(kind) {
    if (!this.soundEnabled) return;
    try {
      if (!this.audio)
        this.audio = new (window.AudioContext || window.webkitAudioContext)();
      this.audio.resume();
      const osc = this.audio.createOscillator(),
        gain = this.audio.createGain();
      osc.connect(gain);
      gain.connect(this.audio.destination);
      osc.type = kind === "emp" ? "sine" : "sawtooth";
      const now = this.audio.currentTime;
      osc.frequency.setValueAtTime(
        kind === "emp" ? 180 : kind === "hit" ? 120 : 420,
        now,
      );
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.16);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start();
      osc.stop(now + 0.2);
    } catch {
      /* Audio is optional; simulation keeps running. */
    }
  }
  shoot(robot, point) {
    if (this.shotCooldown > 0) return false;
    this.shotCooldown = 0.17;
    const start = robot.muzzlePosition(),
      direction = point.clone().sub(start).normalize();
    this.addBullet(start, direction.multiplyScalar(55), false);
    this.burst(start, 0xffbd6e, 3, 0.12);
    this.sound("shot");
    return true;
  }
  addBullet(position, velocity, hostile) {
    const material = new THREE.MeshBasicMaterial({
      color: hostile ? 0xff7350 : 0xffd99a,
    });
    const mesh = new THREE.Mesh(sphereGeo, material);
    mesh.scale.set(0.075, 0.075, 0.55);
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      velocity.clone().normalize(),
    );
    this.scene.add(mesh);
    this.bullets.push({
      mesh,
      velocity,
      life: 3,
      hostile,
      previous: position.clone(),
    });
  }
  burst(position, color, count = 10, duration = 0.55) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), mat);
      mesh.position.copy(position);
      mesh.rotation.set(rng() * 6, rng() * 6, rng() * 6);
      this.scene.add(mesh);
      this.effects.push({
        mesh,
        velocity: new THREE.Vector3(
          (rng() - 0.5) * 8,
          rng() * 6,
          (rng() - 0.5) * 8,
        ),
        life: duration,
        max: duration,
      });
    }
  }
  hit(enemy, damage = 1) {
    if (enemy.dead) return;
    enemy.health -= damage;
    this.burst(enemy.root.position, 0xffb565, 8);
    this.sound("hit");
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.respawn = 8;
      enemy.root.visible = false;
      this.score++;
      this.burst(enemy.root.position, 0xffa659, 28, 0.85);
      this.onEvent("target");
    }
  }
  pulse(robot) {
    if (this.empCooldown > 0) return false;
    this.empCooldown = 5;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 80),
      new THREE.MeshBasicMaterial({
        color: 0xc8e6c1,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(robot.position);
    mesh.position.y =
      robot.position.y + (robot.type === "wasp" ? robot.config.height : 0.09);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 0.8, max: 0.8, pulse: true });
    for (const enemy of this.enemies)
      if (
        this.enabled &&
        !enemy.dead &&
        enemy.root.position.distanceTo(robot.position) < 22
      )
        this.hit(enemy, 3);
    this.sound("emp");
    this.onEvent("emp");
    return true;
  }
  aim(ray, groundPoint) {
    let closest = Infinity,
      target = null;
    const hit = new THREE.Vector3();
    for (const e of this.enemies)
      if (this.enabled && !e.dead) {
        const point = ray.intersectSphere(
          new THREE.Sphere(e.root.position, 1.25),
          hit,
        );
        if (point) {
          const distance = point.distanceTo(ray.origin);
          if (
            distance < closest &&
            (!groundPoint || distance < groundPoint.distanceTo(ray.origin))
          ) {
            closest = distance;
            target = e.root.position.clone();
          }
        }
      }
    return target || groundPoint;
  }
  update(dt, time, robot, playing) {
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.empCooldown = Math.max(0, this.empCooldown - dt);
    for (const e of this.enemies) {
      if (!this.enabled) continue;
      if (e.dead) {
        e.respawn -= dt;
        if (e.respawn <= 0) {
          e.dead = false;
          e.health = 3;
          e.root.visible = true;
          e.shootTime = 3;
        }
        continue;
      }
      const angle = e.angle + time * 0.025;
      const center = playing ? robot.position : new THREE.Vector3();
      const target = new THREE.Vector3(
        center.x + Math.sin(angle) * e.radius,
        center.y + e.baseHeight + Math.sin(time * 1.5 + e.angle) * 0.3,
        center.z + Math.cos(angle) * e.radius,
      );
      target.x = clamp(target.x, -115, 115);
      target.z = clamp(target.z, -115, 115);
      if (this.collision) {
        const motion = target.clone().sub(e.root.position).multiplyScalar(0.5);
        const result = this.collision.moveDrone(e.root.position, motion, dt, {
          height: 0,
          radius: 1.45,
        });
        e.root.position.copy(result.position);
      } else e.root.position.lerp(target, 1 - Math.exp(-dt * 0.5));
      e.root.lookAt(robot.position.x, e.root.position.y, robot.position.z);
      e.indicator.position.y =
        -e.root.position.y +
        (this.collision?.heightAt(
          e.root.position.x,
          e.root.position.z,
          e.root.position.y - 0.8,
        ) || 0) +
        0.035;
      for (const r of e.rotors) r.rotation.y += dt * 38;
      if (playing && robot.health > 0) {
        e.shootTime -= dt;
        if (e.shootTime <= 0) {
          e.shootTime = 3.5 + rng() * 3;
          const start = e.root.position.clone();
          const dir = robot.position
            .clone()
            .add(new THREE.Vector3(0, robot.config.height, 0))
            .sub(start)
            .normalize();
          this.addBullet(start, dir.multiplyScalar(15), true);
        }
      }
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.previous.copy(b.mesh.position);
      b.mesh.position.addScaledVector(b.velocity, dt);
      b.life -= dt;
      const travel = b.mesh.position.clone().sub(b.previous),
        distance = travel.length();
      const ray = new THREE.Ray(b.previous.clone(), travel.normalize());
      const terrainHit = this.collision?.segmentHit(
        b.previous,
        b.mesh.position,
      );
      let hitDistance = terrainHit?.distance ?? Infinity,
        hitEnemy = null,
        hitPlayer = false;
      if (!b.hostile) {
        for (const e of this.enemies)
          if (this.enabled && !e.dead) {
            const hit = ray.intersectSphere(
              new THREE.Sphere(e.root.position, 1.35),
              new THREE.Vector3(),
            );
            if (hit) {
              const d = hit.distanceTo(b.previous);
              if (d <= distance && d < hitDistance) {
                hitDistance = d;
                hitEnemy = e;
              }
            }
          }
      } else if (playing) {
        const body = robot.position
          .clone()
          .add(new THREE.Vector3(0, robot.config.height, 0));
        const hit = ray.intersectSphere(
          new THREE.Sphere(body, 1.65),
          new THREE.Vector3(),
        );
        if (
          hit &&
          hit.distanceTo(b.previous) <= distance &&
          hit.distanceTo(b.previous) < hitDistance
        )
          hitPlayer = true;
      }
      if (hitEnemy) {
        this.hit(hitEnemy);
        b.life = 0;
      } else if (hitPlayer) {
        robot.health = Math.max(0, robot.health - 5);
        this.burst(
          robot.position
            .clone()
            .add(new THREE.Vector3(0, robot.config.height, 0)),
          0xffa16a,
          5,
          0.25,
        );
        b.life = 0;
        this.onEvent("damage");
      } else if (terrainHit) {
        b.life = 0;
        this.terrainHits++;
        this.burst(terrainHit.point, 0xccaf83, 4, 0.25);
      }
      if (b.life <= 0 || b.mesh.position.y < 0.05) {
        if (b.mesh.position.y < 0.05)
          this.burst(b.mesh.position, 0xccaf83, 3, 0.2);
        this.scene.remove(b.mesh);
        b.mesh.material.dispose();
        this.bullets.splice(i, 1);
      }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      e.mesh.material.opacity = Math.max(0, e.life / e.max);
      if (e.pulse) e.mesh.scale.setScalar(1 + (1 - e.life / e.max) * 22);
      else {
        e.velocity.y -= dt * 9;
        e.mesh.position.addScaledVector(e.velocity, dt);
      }
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }
}
