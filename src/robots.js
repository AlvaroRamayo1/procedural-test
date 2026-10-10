import * as THREE from "three";
import { solveLeg, swingFoot, smooth } from "./kinematics.js";

export const ROBOTS = {
  strider: {
    name: "STRIDER",
    id: "S01",
    index: "01",
    label: "CUADRÚPEDO",
    legs: 4,
    height: 3.25,
    upper: 2.4,
    lower: 2.6,
    speed: 4.8,
    color: 0xb49b70,
    description:
      "Un explorador pesado. Estable, resistente y preparado para el terreno de nadie.",
  },
  mantis: {
    name: "MANTIS",
    id: "M02",
    index: "02",
    label: "HEXÁPODO",
    legs: 6,
    height: 2.15,
    upper: 1.9,
    lower: 2.1,
    speed: 6.3,
    color: 0x8e9b86,
    description:
      "Seis apoyos, una marcha precisa. Un rastreador ágil con estabilidad de trípode.",
  },
  wasp: {
    name: "WASP",
    id: "W03",
    index: "03",
    label: "DRON",
    legs: 0,
    height: 3.8,
    speed: 8.5,
    color: 0xa89f7f,
    description:
      "Propulsión vectorial. Flotación, inclinación y respuesta de vuelo calculadas en tiempo real.",
  },
};

const up = new THREE.Vector3(0, 1, 0);
const materials = {
  dark: new THREE.MeshStandardMaterial({
    color: 0x262c28,
    roughness: 0.8,
    metalness: 0.72,
  }),
  joint: new THREE.MeshStandardMaterial({
    color: 0x4d5147,
    roughness: 0.6,
    metalness: 0.85,
  }),
  silver: new THREE.MeshStandardMaterial({
    color: 0x858b78,
    roughness: 0.4,
    metalness: 0.9,
  }),
  orange: new THREE.MeshStandardMaterial({
    color: 0xdd813a,
    roughness: 0.65,
    metalness: 0.4,
  }),
  eye: new THREE.MeshStandardMaterial({
    color: 0xff8b36,
    emissive: 0xff701c,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x161d18, roughness: 0.9 }),
  debug: new THREE.MeshBasicMaterial({ color: 0xadffc2, depthTest: false }),
};
const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 12, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
};
function mesh(
  geometry,
  material,
  parent,
  position = [0, 0, 0],
  scale = [1, 1, 1],
) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function box(parent, material, position, scale) {
  return mesh(geometries.box, material, parent, position, scale);
}
function sphere(parent, material, position, scale) {
  return mesh(geometries.sphere, material, parent, position, scale);
}
function cylinder(parent, material, position, scale) {
  return mesh(geometries.cylinder, material, parent, position, scale);
}
function connect(object, a, b, thickness) {
  object.position.copy(a).add(b).multiplyScalar(0.5);
  const direction = b.clone().sub(a);
  object.quaternion.setFromUnitVectors(up, direction.clone().normalize());
  object.scale.set(thickness, direction.length(), thickness);
}
function armor(parent, material, width, height, depth, position) {
  const shape = new THREE.Shape();
  const w = width / 2,
    h = depth / 2,
    cut = Math.min(width, depth) * 0.18;
  shape.moveTo(-w + cut, -h);
  shape.lineTo(w - cut, -h);
  shape.lineTo(w, -h + cut);
  shape.lineTo(w, h - cut);
  shape.lineTo(w - cut, h);
  shape.lineTo(-w + cut, h);
  shape.lineTo(-w, h - cut);
  shape.lineTo(-w, -h + cut);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.05,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -height / 2, 0);
  return mesh(geo, material, parent, position);
}
function decal(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = "#e5dfc4";
  ctx.font = "bold 58px monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 71);
  ctx.fillStyle = "#383e31";
  ctx.fillRect(35, 86, 186, 7);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
}

export class Robot {
  constructor(scene, type = "strider", position = new THREE.Vector3()) {
    this.scene = scene;
    this.type = type;
    this.config = ROBOTS[type];
    this.position = position.clone();
    this.yaw = 0;
    this.speed = 0;
    this.velocity = new THREE.Vector3();
    this.steps = 0;
    this.phase = 0;
    this.time = 0;
    this.lastGroup = -1;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);
    this.armorMaterial = new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: 0.82,
      metalness: 0.5,
    });
    this.legs = [];
    this.rotors = [];
    this.debugObjects = [];
    this.buildBody();
    this.buildLegs();
    this.reset(position);
    this.health = 100;
  }
  buildBody() {
    const { type, body, armorMaterial } = this;
    if (type === "wasp") {
      armor(body, armorMaterial, 2.7, 0.7, 2.1, [0, 0, 0]);
      armor(body, materials.dark, 1.9, 0.45, 1.8, [0, -0.45, 0]);
      const ring = new THREE.TorusGeometry(0.68, 0.14, 8, 24);
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const end = new THREE.Vector3(x * 1.95, 0, z * 1.45);
          const beam = box(body, materials.dark, [0, 0, 0], [1, 1, 1]);
          connect(beam, new THREE.Vector3(x * 0.6, 0, z * 0.4), end, 0.19);
          const rotor = new THREE.Group();
          rotor.position.copy(end);
          body.add(rotor);
          const rim = mesh(ring, materials.dark, rotor);
          rim.rotation.x = Math.PI / 2;
          cylinder(rotor, materials.joint, [0, 0, 0], [0.24, 0.3, 0.24]);
          const blades = new THREE.Group();
          rotor.add(blades);
          for (let i = 0; i < 3; i++) {
            const blade = box(
              blades,
              materials.silver,
              [0, 0, 0],
              [0.9, 0.045, 0.12],
            );
            blade.rotation.y = (i * Math.PI) / 3;
          }
          this.rotors.push(blades);
          cylinder(rotor, materials.eye, [0, -0.18, 0], [0.2, 0.05, 0.2]);
        }
      const sensor = sphere(
        body,
        materials.dark,
        [0, -0.6, -0.65],
        [0.5, 0.45, 0.5],
      );
      sensor.name = "sensor";
      sphere(body, materials.eye, [0, -0.62, -1.06], [0.16, 0.16, 0.08]);
    } else if (type === "mantis") {
      armor(body, armorMaterial, 2.4, 0.58, 2.9, [0, 0, 0]);
      armor(body, materials.dark, 1.9, 0.45, 2.5, [0, -0.4, 0]);
      armor(body, armorMaterial, 1.6, 0.33, 1.5, [0, 0.5, 0.25]);
      for (let i = 0; i < 5; i++)
        box(
          body,
          materials.dark,
          [-0.58 + i * 0.29, 0.71, 0.3],
          [0.11, 0.08, 0.87],
        );
      box(body, materials.orange, [0, 0.32, -0.95], [1.8, 0.14, 0.3]);
      sphere(body, materials.dark, [0, -0.05, -1.44], [0.7, 0.38, 0.28]);
      for (let i = -1; i <= 1; i++)
        sphere(body, materials.eye, [i * 0.36, -0.07, -1.7], [0.1, 0.1, 0.035]);
    } else {
      armor(body, materials.dark, 2.5, 0.8, 3.15, [0, -0.1, 0]);
      armor(body, armorMaterial, 2.95, 0.75, 3.5, [0, 0.3, 0]);
      armor(body, armorMaterial, 2.5, 0.3, 2.4, [0, 0.9, 0.25]);
      box(body, materials.orange, [0, 0.65, -1.4], [2.75, 0.3, 0.25]);
      box(body, materials.dark, [0, 0.07, -1.81], [1.8, 0.53, 0.15]);
      box(body, materials.eye, [0, 0.13, -1.91], [1.21, 0.12, 0.045]);
      for (const side of [-1, 1]) {
        armor(body, armorMaterial, 0.45, 0.6, 2.6, [side * 1.7, 0.17, 0.13]);
        for (let i = 0; i < 4; i++)
          box(
            body,
            materials.dark,
            [side * 1.7, 0.51, -0.56 + i * 0.4],
            [0.48, 0.04, 0.11],
          );
        const axle = cylinder(
          body,
          materials.joint,
          [side * 1.35, -0.32, 0],
          [0.38, 2.2, 0.38],
        );
        axle.rotation.x = Math.PI / 2;
        box(
          body,
          materials.silver,
          [side * 0.85, 0.31, -1.87],
          [0.18, 0.2, 0.065],
        );
      }
      const antenna = cylinder(
        body,
        materials.dark,
        [0.9, 1.6, 0.8],
        [0.035, 1.3, 0.035],
      );
      antenna.rotation.z = -0.1;
      sphere(body, materials.orange, [0.97, 2.27, 0.8], [0.07, 0.07, 0.07]);
    }
    // Independently rotating sensor turret and a twin-barrel emitter.
    this.turret = new THREE.Group();
    this.turret.position.set(0, type === "strider" ? 1.12 : 0.8, -0.1);
    body.add(this.turret);
    cylinder(this.turret, materials.joint, [0, 0, 0], [0.43, 0.24, 0.43]);
    armor(this.turret, materials.dark, 0.84, 0.38, 0.82, [0, 0.2, -0.1]);
    for (const x of [-0.22, 0.22]) {
      const gun = cylinder(
        this.turret,
        materials.dark,
        [x, 0.17, -0.82],
        [0.1, 1.05, 0.1],
      );
      gun.rotation.x = Math.PI / 2;
      const muzzle = cylinder(
        this.turret,
        materials.silver,
        [x, 0.17, -1.35],
        [0.14, 0.18, 0.14],
      );
      muzzle.rotation.x = Math.PI / 2;
    }
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.18, -1.55);
    this.turret.add(this.muzzle);
    const number = mesh(
      new THREE.PlaneGeometry(1, 0.5),
      decal(this.config.id),
      body,
      [0, 0.48, this.type === "wasp" ? 1.1 : 1.81],
    );
    number.rotation.y = 0;
    // Fasteners and exposed cable loops break up the manufactured silhouette.
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        sphere(
          body,
          materials.silver,
          [x * 0.96, 0.77, z * 1.07],
          [0.07, 0.055, 0.07],
        );
    const cable = mesh(
      new THREE.TorusGeometry(0.38, 0.055, 5, 12, Math.PI),
      materials.rubber,
      body,
      [0.6, -0.38, 0.4],
    );
    cable.rotation.y = Math.PI / 2;
    this.debugAxes = new THREE.AxesHelper(3.5);
    this.body.add(this.debugAxes);
    this.debugAxes.visible = false;
  }
  buildLegs() {
    const count = this.config.legs;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const z = count === 4 ? (row === 0 ? -1.15 : 1.15) : (row - 1) * 1.15;
      const hip = new THREE.Vector3(
        side * (count === 4 ? 1.4 : 1.08),
        -0.23,
        z,
      );
      const rest = new THREE.Vector3(
        side * (count === 4 ? 3.1 : 2.9),
        0.15,
        z * 1.5,
      );
      const group =
        count === 4
          ? (row + (side === 1 ? 1 : 0)) % 2
          : (row + (side === 1 ? 1 : 0)) % 2;
      const upper = mesh(geometries.box, materials.dark, this.scene);
      const plate = mesh(geometries.box, this.armorMaterial, this.scene);
      const lower = mesh(geometries.box, materials.dark, this.scene);
      const shin = mesh(geometries.box, this.armorMaterial, this.scene);
      const piston = mesh(geometries.cylinder, materials.silver, this.scene);
      const hipJoint = mesh(
        geometries.sphere,
        materials.joint,
        this.scene,
        [0, 0, 0],
        [0.3, 0.3, 0.3],
      );
      const kneeJoint = mesh(
        geometries.sphere,
        materials.joint,
        this.scene,
        [0, 0, 0],
        [0.28, 0.28, 0.28],
      );
      const footGroup = new THREE.Group();
      this.scene.add(footGroup);
      box(footGroup, materials.dark, [0, 0.11, 0], [0.47, 0.22, 0.66]);
      for (const x of [-0.13, 0.13])
        box(footGroup, materials.silver, [x, 0.04, -0.32], [0.13, 0.07, 0.36]);
      const debugHip = mesh(
        geometries.sphere,
        materials.debug,
        this.scene,
        [0, 0, 0],
        [0.12, 0.12, 0.12],
      );
      const debugKnee = mesh(
        geometries.sphere,
        materials.debug,
        this.scene,
        [0, 0, 0],
        [0.12, 0.12, 0.12],
      );
      const debugFoot = mesh(
        new THREE.RingGeometry(0.23, 0.3, 16),
        materials.debug,
        this.scene,
      );
      debugFoot.rotation.x = -Math.PI / 2;
      debugHip.renderOrder = 10;
      debugKnee.renderOrder = 10;
      debugFoot.renderOrder = 10;
      this.debugObjects.push(debugHip, debugKnee, debugFoot);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
          new THREE.Vector3(),
        ]),
        new THREE.LineBasicMaterial({ color: 0xadffc2, depthTest: false }),
      );
      line.renderOrder = 10;
      this.scene.add(line);
      this.debugObjects.push(line);
      this.legs.push({
        side,
        hip,
        rest,
        group,
        upper,
        plate,
        lower,
        shin,
        piston,
        hipJoint,
        kneeJoint,
        footGroup,
        debugHip,
        debugKnee,
        debugFoot,
        line,
        foot: new THREE.Vector3(),
        start: new THREE.Vector3(),
        target: new THREE.Vector3(),
        swing: false,
        progress: 1,
      });
    }
    this.setDebug(false);
  }
  worldFoot(local) {
    return new THREE.Vector3(local.x, 0, local.z)
      .applyAxisAngle(up, this.yaw)
      .add(this.position)
      .setY(0.14);
  }
  replant() {
    for (const leg of this.legs) {
      leg.foot.copy(this.worldFoot(leg.rest));
      leg.swing = false;
      leg.progress = 1;
    }
  }
  reset(position = new THREE.Vector3()) {
    this.position.copy(position);
    this.yaw = 0;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.steps = 0;
    this.time = 0;
    this.phase = 0;
    this.lastGroup = -1;
    this.health = 100;
    this.replant();
    this.update(0, { speed: 1, stride: 1.4, lift: 0.8, ik: true });
  }
  setDebug(enabled) {
    this.debugAxes.visible = enabled;
    for (const object of this.debugObjects) object.visible = enabled;
  }
  update(dt, params) {
    this.time += dt;
    this.speed = this.velocity.length();
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    const gaitRate = (0.6 + this.speed * 0.4) * params.speed;
    this.phase += dt * gaitRate;
    const sway = Math.sin(this.time * 2.1) * 0.025;
    this.body.position.y =
      this.config.height +
      (this.type === "wasp"
        ? Math.sin(this.time * 1.8) * 0.28
        : Math.sin(this.phase * Math.PI * 2) *
          Math.min(0.1, this.speed * 0.018));
    const localVelocity = this.velocity.clone().applyAxisAngle(up, -this.yaw);
    this.body.rotation.z = smooth(
      this.body.rotation.z,
      -localVelocity.x * (this.type === "wasp" ? 0.04 : 0.012) + sway,
      5,
      dt,
    );
    this.body.rotation.x = smooth(
      this.body.rotation.x,
      -localVelocity.z * (this.type === "wasp" ? 0.045 : 0.016),
      5,
      dt,
    );
    this.root.updateMatrixWorld(true);
    for (const rotor of this.rotors)
      rotor.rotation.y += dt * (35 + this.speed * 3) * params.speed;
    const group = Math.floor(this.phase * 2) % 2;
    if (group !== this.lastGroup) {
      this.lastGroup = group;
      for (const leg of this.legs) {
        const desired = this.worldFoot(leg.rest).addScaledVector(
          this.velocity,
          0.14,
        );
        if (
          leg.group === group &&
          !leg.swing &&
          leg.foot.distanceTo(desired) > params.stride * 0.45
        ) {
          leg.start.copy(leg.foot);
          leg.target.copy(desired);
          leg.swing = true;
          leg.progress = 0;
          this.steps++;
        }
      }
    }
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      if (leg.swing) {
        leg.progress = Math.min(
          1,
          leg.progress + dt * (2.9 + this.speed * 0.22) * params.speed,
        );
        leg.foot.copy(
          swingFoot(leg.start, leg.target, leg.progress, params.lift),
        );
        if (leg.progress === 1) {
          leg.swing = false;
          leg.foot.copy(leg.target);
        }
      }
      if (!params.ik) {
        leg.foot.copy(this.worldFoot(leg.rest));
        leg.foot.y +=
          Math.max(
            0,
            Math.sin(this.phase * Math.PI * 2 + leg.group * Math.PI),
          ) * params.lift;
      }
      const hip = this.body.localToWorld(leg.hip.clone());
      const bend = new THREE.Vector3(
        leg.side,
        0.25,
        leg.rest.z * 0.16,
      ).applyAxisAngle(up, this.yaw);
      const result = solveLeg(
        hip,
        leg.foot,
        this.config.upper,
        this.config.lower,
        bend,
      );
      connect(leg.upper, hip, result.knee, 0.24);
      connect(
        leg.plate,
        hip.clone().lerp(result.knee, 0.22),
        hip.clone().lerp(result.knee, 0.85),
        0.4,
      );
      connect(leg.lower, result.knee, result.foot, 0.17);
      connect(
        leg.shin,
        result.knee.clone().lerp(result.foot, 0.1),
        result.knee.clone().lerp(result.foot, 0.62),
        0.28,
      );
      const pistonOffset = bend.clone().normalize().multiplyScalar(0.13);
      connect(
        leg.piston,
        hip.clone().lerp(result.knee, 0.55).add(pistonOffset),
        result.knee.clone().lerp(result.foot, 0.4).add(pistonOffset),
        0.055,
      );
      leg.hipJoint.position.copy(hip);
      leg.kneeJoint.position.copy(result.knee);
      leg.footGroup.position.copy(result.foot);
      leg.footGroup.position.y -= 0.14;
      leg.footGroup.rotation.y = this.yaw;
      leg.debugHip.position.copy(hip);
      leg.debugKnee.position.copy(result.knee);
      leg.debugFoot.position.copy(leg.foot);
      leg.debugFoot.position.y += 0.05;
      const attribute = leg.line.geometry.attributes.position;
      attribute.setXYZ(0, hip.x, hip.y, hip.z);
      attribute.setXYZ(1, result.knee.x, result.knee.y, result.knee.z);
      attribute.setXYZ(2, result.foot.x, result.foot.y, result.foot.z);
      attribute.needsUpdate = true;
      leg.line.geometry.computeBoundingSphere();
    }
  }
  aimAt(point, dt) {
    const angle =
      Math.atan2(-(point.x - this.position.x), -(point.z - this.position.z)) -
      this.yaw;
    const delta =
      THREE.MathUtils.euclideanModulo(
        angle - this.turret.rotation.y + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
    this.turret.rotation.y += delta * (1 - Math.exp(-dt * 10));
  }
  muzzlePosition() {
    return this.muzzle.getWorldPosition(new THREE.Vector3());
  }
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh && !Object.values(geometries).includes(o.geometry))
        o.geometry.dispose();
      if (o.material?.map) o.material.map.dispose();
    });
    for (const leg of this.legs)
      for (const key of [
        "upper",
        "plate",
        "lower",
        "shin",
        "piston",
        "hipJoint",
        "kneeJoint",
        "footGroup",
        "debugHip",
        "debugKnee",
        "debugFoot",
        "line",
      ])
        this.scene.remove(leg[key]);
    for (const leg of this.legs) {
      leg.line.geometry.dispose();
      leg.line.material.dispose();
      leg.debugFoot.geometry.dispose();
    }
    this.armorMaterial.dispose();
  }
}
