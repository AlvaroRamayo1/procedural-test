import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Robot, ROBOTS } from "./robots.js";
import { createWorld } from "./world.js";
import { Combat } from "./combat.js";
import { clamp } from "./kinematics.js";
import { ThirdPersonCamera } from "./third-person.js";
import { MapEditor } from "./map-editor.js";
import { buildCustomMap } from "./custom-map.js";

const $ = (id) => document.getElementById(id);
const canvas = $("world");
canvas.tabIndex = -1;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  $("loading").classList.add("done");
  $("fatal").hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  48,
  innerWidth / innerHeight,
  0.1,
  650,
);
const controls = new OrbitControls(camera, canvas);
const thirdPerson = new ThirdPersonCamera(camera);
let cameraMode =
  new URLSearchParams(location.search).get("camera") === "orbit"
    ? "orbit"
    : "third";
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 8;
controls.maxDistance = 65;
controls.maxPolarAngle = Math.PI * 0.47;
controls.enablePan = false;
let desiredCameraDistance = 18.75,
  orbitInteracting = false;
controls.addEventListener("start", () => (orbitInteracting = true));
controls.addEventListener("end", () => {
  orbitInteracting = false;
  desiredCameraDistance = camera.position.distanceTo(controls.target);
});
const world = createWorld(scene);
const districtCollision = world.collision,
  districtDestruction = world.destruction;
let activeMap = null,
  editor,
  editorGrid = false;
const qualities = ["low", "medium", "high"];
let quality = new URLSearchParams(location.search).get("quality") || "medium";
function setQuality(value) {
  quality = qualities.includes(value) ? value : "medium";
  renderer.setPixelRatio(
    quality === "low"
      ? 0.75
      : Math.min(devicePixelRatio, quality === "high" ? 1.75 : 1.25),
  );
  renderer.shadowMap.enabled = quality !== "low";
  renderer.shadowMap.needsUpdate = true;
  $("fps").setAttribute(
    "aria-label",
    `Cambiar calidad gráfica. Actual: ${quality}`,
  );
  resize();
}
setQuality(quality);
const surface = (x, z, ceiling) => world.collision.heightAt(x, z, ceiling);
let robot = new Robot(
  scene,
  "strider",
  new THREE.Vector3(),
  surface,
  world.collision,
);
robot.yaw = 2.7;
robot.replant();
const params = { speed: 1, stride: 1.4, lift: 0.8, ik: true };
const state = {
  playing: false,
  paused: false,
  time: 0,
  autoTime: 0,
  fps: 60,
  view: "field",
};
const keys = new Set();
let toastTimer,
  mouseLockDenied = false,
  touchLook = null,
  holdingFire = false,
  aimPoint = new THREE.Vector3(),
  pointer = new THREE.Vector2(),
  hasPointer = false;
const combat = new Combat(
  scene,
  (kind) => {
    if (kind === "target") toast("OBJETIVO NEUTRALIZADO · +1");
    if (kind === "emp") toast("PULSO EMP · RADIO 22 M");
    if (kind === "damage" && robot.health <= 0) {
      setPlaying(false);
      toast("UNIDAD FUERA DE SERVICIO · REINICIA PARA VOLVER");
      $("unit-state").textContent = "FUERA DE SERVICIO";
    }
  },
  world.collision,
);
combat.destruction = world.destruction;
function connectWorld(map = null) {
  world.terrain.visible = !map;
  world.collision = map?.collision || districtCollision;
  world.destruction = map?.destruction || districtDestruction;
  combat.collision = world.collision;
  combat.destruction = world.destruction;
  robot.collision = world.collision;
  world.destruction.onBreak = () => toast("TORRE DERRIBADA · ZONA LIBRE");
}
connectWorld();
function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  thirdPerson.aiming = false;
}
async function captureMouse() {
  if (
    !state.playing ||
    cameraMode !== "third" ||
    editor?.active ||
    matchMedia("(pointer: coarse)").matches
  )
    return;
  setPaused(false);
  mouseLockDenied = false;
  try {
    await canvas.requestPointerLock();
  } catch {
    mouseLockDenied = true;
    toast("BOTÓN DERECHO PARA GIRAR · PUEDES VOLVER A CAPTURAR EL MOUSE");
  }
}
function updateCameraUI() {
  document.body.classList.toggle("third-person", cameraMode === "third");
  $("camera-mode").textContent = cameraMode === "third" ? "3P" : "ÓRBITA";
  $("camera-mode").setAttribute("aria-pressed", String(cameraMode === "third"));
  $("mouse-capture").hidden =
    !state.playing ||
    cameraMode !== "third" ||
    matchMedia("(pointer: coarse)").matches ||
    document.pointerLockElement === canvas;
  controls.enabled =
    !(state.playing && cameraMode === "third") || !!editor?.active;
}
function setCameraMode(mode) {
  cameraMode = mode;
  releaseMouse();
  thirdPerson.reset(robot.position, robot.config.height);
  camera.fov = 48;
  camera.updateProjectionMatrix();
  updateCameraUI();
  toast(
    mode === "third"
      ? "TERCERA PERSONA · MOUSE PARA GIRAR · CLIC DERECHO PARA APUNTAR"
      : "CÁMARA ORBITAL · ARRASTRA PARA GIRAR",
  );
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2600);
}
function cameraReset() {
  camera.position.copy(robot.position).add(new THREE.Vector3(11, 7.8, 14));
  controls.target.copy(robot.position).add(new THREE.Vector3(0, 1.9, 0));
  controls.update();
  desiredCameraDistance = camera.position.distanceTo(controls.target);
  thirdPerson.reset(robot.position, robot.config.height);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
cameraReset();
resize();
window.addEventListener("resize", resize);

function setPlaying(playing) {
  if (playing && robot.health <= 0) {
    toast("REINICIA LA UNIDAD ANTES DE PILOTAR");
    return;
  }
  state.playing = playing;
  if (!playing) releaseMouse();
  holdingFire = false;
  keys.clear();
  document.body.classList.toggle("playing", playing);
  $("deploy").classList.toggle("active", playing);
  $("deploy").querySelector("span").textContent = playing
    ? "Salir del pilotaje"
    : "Pilotar unidad";
  $("unit-state").textContent = playing
    ? "CONTROL MANUAL"
    : "PATRULLA AUTÓNOMA";
  controls.mouseButtons.LEFT = playing ? null : THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  updateCameraUI();
  if (playing) {
    setPaused(false);
    $("lab-panel").classList.remove("open");
    $("mobile-panel-toggle").setAttribute("aria-expanded", "false");
    canvas.focus({ preventScroll: true });
    const center = robot.position
      .clone()
      .add(new THREE.Vector3(0, robot.config.height * 0.85, 0));
    const correction = center.sub(controls.target);
    controls.target.add(correction);
    camera.position.add(correction);
    toast(
      robot.type === "wasp"
        ? "WASD · Q SUBIR · E BAJAR · ESC SALIR"
        : "WASD PARA MOVER · V CAMBIA EL ARMA · ACCESO OESTE",
    );
    if (cameraMode === "third") {
      thirdPerson.reset(robot.position, robot.config.height);
      captureMouse();
    }
  } else robot.velocity.set(0, 0, 0);
}
function setPaused(paused) {
  state.paused = paused;
  if (paused) releaseMouse();
  holdingFire = false;
  keys.clear();
  document.body.classList.toggle("paused", paused);
  $("pause").innerHTML = paused
    ? "▷ <span>Reanudar</span>"
    : "Ⅱ <span>Pausar</span>";
  $("unit-state").textContent = paused
    ? "SIMULACIÓN PAUSADA"
    : state.playing
      ? "CONTROL MANUAL"
      : "PATRULLA AUTÓNOMA";
}
function selectRobot(type) {
  if (type === robot.type) return;
  const pos = robot.position.clone(),
    oldYaw = robot.yaw;
  robot.dispose();
  robot = new Robot(scene, type, pos, surface, world.collision);
  robot.yaw = oldYaw;
  robot.replant();
  robot.setDebug($("debug").checked);
  const c = ROBOTS[type];
  $("robot-name").textContent = c.name;
  $("robot-class").textContent = c.label;
  $("unit-index").textContent = c.index;
  $("robot-description").textContent = c.description;
  $("scene-unit-name").textContent = c.name;
  $("scene-unit-id").textContent = `RFT — ${c.id}`;
  $("telemetry-name").textContent = `${c.name} / ${c.id}`;
  document.body.classList.toggle("drone", type === "wasp");
  document.querySelectorAll("[data-robot]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.robot === type);
    b.setAttribute("aria-pressed", String(b.dataset.robot === type));
  });
  if (state.playing) canvas.focus({ preventScroll: true });
  for (const id of ["stride", "lift", "ik"]) $(id).disabled = type === "wasp";
  robot.velocity.set(0, 0, 0);
  thirdPerson.reset(robot.position, robot.config.height);
  toast(
    `${c.name} DESPLEGADO · ${c.legs ? c.legs + " APOYOS PROCEDURALES" : "VUELO PROCEDURAL"}`,
  );
}
document
  .querySelectorAll("[data-robot]")
  .forEach((b) =>
    b.addEventListener("click", () => selectRobot(b.dataset.robot)),
  );
for (const id of ["speed", "stride", "lift"]) {
  const input = $(id);
  const update = () => {
    params[id] = Number(input.value);
    $(`${id}-value`).textContent = Number(input.value).toFixed(1);
    input.style.background = `linear-gradient(to right,var(--orange) ${((input.value - input.min) / (input.max - input.min)) * 100}%,#858d7535 0)`;
  };
  input.addEventListener("input", update);
  update();
}
$("ik").addEventListener("change", () => {
  params.ik = $("ik").checked;
  for (const leg of robot.legs) {
    leg.swing = false;
    leg.foot.copy(robot.worldFoot(leg.rest));
  }
  toast(
    params.ik
      ? "IK ACTIVO · APOYOS FIJADOS AL TERRENO"
      : "IK DESACTIVADO · COMPARACIÓN DE MARCHA",
  );
});
$("debug").addEventListener("change", () => robot.setDebug($("debug").checked));
$("weather").addEventListener("change", () =>
  world.setWeather($("weather").value),
);
$("targets").addEventListener("change", () =>
  combat.setEnabled($("targets").checked),
);
$("deploy").addEventListener("click", () => setPlaying(!state.playing));
$("pause").addEventListener("click", () => setPaused(!state.paused));
$("reset").addEventListener("click", () => {
  setPlaying(false);
  setPaused(false);
  world.destruction.reset();
  robot.reset(activeMap ? activeMap.spawnPosition() : new THREE.Vector3());
  robot.yaw = activeMap ? activeMap.document.spawn.yaw : 2.7;
  robot.replant();
  state.autoTime = 0;
  state.time = 0;
  combat.reset(robot.position);
  cameraReset();
  toast("CAMPO REINICIADO · UNIDAD RESTAURADA");
});
$("camera-reset").addEventListener("click", cameraReset);
$("camera-mode").addEventListener("click", () =>
  setCameraMode(cameraMode === "third" ? "orbit" : "third"),
);
$("mouse-capture").addEventListener("click", captureMouse);
document.addEventListener("pointerlockchange", () => {
  if (
    document.pointerLockElement !== canvas &&
    state.playing &&
    cameraMode === "third" &&
    !editor?.active
  )
    setPaused(true);
  updateCameraUI();
});
$("grid-toggle").addEventListener("click", () => {
  world.grid.visible = !world.grid.visible;
  $("grid-toggle").setAttribute("aria-pressed", String(world.grid.visible));
});
$("sound-toggle").addEventListener("click", () => {
  combat.soundEnabled = !combat.soundEnabled;
  $("sound-toggle").setAttribute("aria-pressed", String(combat.soundEnabled));
  $("sound-toggle").setAttribute(
    "aria-label",
    combat.soundEnabled ? "Desactivar sonido" : "Activar sonido",
  );
  if (combat.soundEnabled) combat.sound("hit");
  toast(combat.soundEnabled ? "AUDIO ACTIVADO" : "AUDIO DESACTIVADO");
});
$("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("PANTALLA COMPLETA NO DISPONIBLE EN ESTE NAVEGADOR");
  }
});
$("fps").addEventListener("click", () => {
  setQuality(qualities[(qualities.indexOf(quality) + 1) % qualities.length]);
  toast(
    `CALIDAD GRÁFICA · ${{ low: "LIGERA", medium: "EQUILIBRADA", high: "ALTA" }[quality]}`,
  );
});
function toggleSettings() {
  releaseMouse();
  const open = $("lab-panel").classList.toggle("open");
  $("mobile-panel-toggle").setAttribute("aria-expanded", String(open));
}
$("mobile-panel-toggle").addEventListener("click", toggleSettings);
document.querySelectorAll("[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    if (editor?.active) {
      editor.play();
      return;
    }
    $("lab-panel").classList.remove("open");
    $("mobile-panel-toggle").setAttribute("aria-expanded", "false");
    state.view = b.dataset.view;
    $("telemetry-panel").hidden = state.view !== "telemetry";
    document
      .querySelectorAll("[data-view]")
      .forEach((n) => n.classList.toggle("active", n === b));
  }),
);

function isFormTarget(target) {
  return ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}
window.addEventListener("keydown", (e) => {
  if (isFormTarget(e.target)) return;
  if (e.code === "KeyM" && !e.repeat) {
    releaseMouse();
    editor.open();
    return;
  }
  if (editor?.active) return;
  if (e.code === "Enter" && e.target.tagName === "BUTTON") return;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.code === "Enter" && !e.repeat) setPlaying(!state.playing);
  if (e.code === "Escape") {
    if (
      cameraMode === "third" &&
      state.playing &&
      document.pointerLockElement === canvas
    ) {
      releaseMouse();
      setPaused(true);
      return;
    }
    setPlaying(false);
    $("lab-panel").classList.remove("open");
    $("mobile-panel-toggle").setAttribute("aria-expanded", "false");
  }
  if (e.code === "KeyP" && !e.repeat) setPaused(!state.paused);
  if (e.code === "KeyI" && !e.repeat) toggleSettings();
  if (e.code === "KeyR" && !e.repeat) $("reset").click();
  if (e.code === "KeyV" && !e.repeat) $("weapon-toggle").click();
  if (e.code === "KeyC" && !e.repeat) $("camera-mode").click();
  if (!e.repeat && ["Digit1", "Digit2", "Digit3"].includes(e.code))
    selectRobot(["strider", "mantis", "wasp"][Number(e.code.slice(-1)) - 1]);
  if (e.code === "Space" && state.playing && !state.paused && !e.repeat) {
    if (!combat.pulse(robot))
      toast(`EMP RECARGANDO · ${combat.empCooldown.toFixed(1)} S`);
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
$("weapon-toggle").addEventListener("click", () => {
  combat.setWeapon(combat.weaponMode === "bullet" ? "missile" : "bullet");
  $("weapon-toggle").setAttribute(
    "aria-pressed",
    String(combat.weaponMode === "missile"),
  );
  toast(
    combat.weaponMode === "missile"
      ? "MISIL ARMADO · EXPLOSIÓN DE ÁREA · RECARGA 1.1 S"
      : "BALAS · FUEGO AUTOMÁTICO",
  );
  if (state.playing) canvas.focus({ preventScroll: true });
});
window.addEventListener("blur", () => {
  keys.clear();
  holdingFire = false;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointermove", (e) => {
  if (editor?.active) return;
  if (state.playing && cameraMode === "third") {
    if (e.pointerType === "touch" && touchLook?.id === e.pointerId) {
      thirdPerson.look(e.clientX - touchLook.x, e.clientY - touchLook.y);
      touchLook.x = e.clientX;
      touchLook.y = e.clientY;
      return;
    }
    if (
      document.pointerLockElement === canvas ||
      e.buttons & 2 ||
      (e.pointerType === "touch" && e.buttons)
    )
      thirdPerson.look(e.movementX, e.movementY);
    return;
  }
  pointer.set(
    (e.clientX / innerWidth) * 2 - 1,
    (-e.clientY / innerHeight) * 2 + 1,
  );
  hasPointer = true;
});
canvas.addEventListener("pointerdown", (e) => {
  if (editor?.active) return;
  $("lab-panel").classList.remove("open");
  $("mobile-panel-toggle").setAttribute("aria-expanded", "false");
  if (state.playing && cameraMode === "third") {
    if (e.pointerType === "touch") {
      touchLook = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 2 && document.pointerLockElement === canvas) {
      thirdPerson.aiming = true;
      return;
    }
    if (
      e.button === 0 &&
      !mouseLockDenied &&
      document.pointerLockElement !== canvas &&
      !matchMedia("(pointer: coarse)").matches
    ) {
      captureMouse();
      return;
    }
  }
  if (e.button === 0 && state.playing) {
    holdingFire = true;
    pointer.set(
      (e.clientX / innerWidth) * 2 - 1,
      (-e.clientY / innerHeight) * 2 + 1,
    );
    hasPointer = true;
  }
});
window.addEventListener("pointerup", () => {
  touchLook = null;
  holdingFire = false;
  thirdPerson.aiming = false;
});
canvas.addEventListener("pointercancel", () => {
  touchLook = null;
  holdingFire = false;
  thirdPerson.aiming = false;
});
canvas.addEventListener(
  "wheel",
  (event) => {
    if (state.playing && cameraMode === "third") {
      event.preventDefault();
      thirdPerson.zoom(event.deltaY);
    }
  },
  { passive: false },
);
document.querySelectorAll("#touch-controls button").forEach((button) => {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    if (button.dataset.key) keys.add(button.dataset.key);
    if (button.dataset.action === "fire") holdingFire = true;
    if (button.dataset.action === "emp" && !state.paused) {
      if (!combat.pulse(robot))
        toast(`EMP RECARGANDO · ${combat.empCooldown.toFixed(1)} S`);
    }
    if (button.dataset.action === "exit") setPlaying(false);
  });
  const release = () => {
    if (button.dataset.key) keys.delete(button.dataset.key);
    if (button.dataset.action === "fire") holdingFire = false;
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
});

function showRobot(visible) {
  robot.root.visible = visible;
  for (const leg of robot.legs) {
    for (const key of [
      "upper",
      "plate",
      "lower",
      "shin",
      "piston",
      "hipJoint",
      "kneeJoint",
      "footGroup",
    ])
      if (leg[key]) leg[key].visible = visible;
  }
  for (const object of robot.debugObjects)
    object.visible = visible && $("debug").checked;
}
function loadMap(document, editing) {
  const next = buildCustomMap(scene, document, editing);
  let spawn;
  try {
    if (!editing) spawn = next.spawnPosition();
  } catch (error) {
    next.dispose();
    throw error;
  }
  activeMap?.dispose();
  activeMap = next;
  connectWorld(next);
  world.setWeather(document.weather);
  if (editing) scene.fog.density = 0.003;
  $("weather").value = document.weather;
  if (!editing) {
    robot.reset(spawn);
    robot.yaw = document.spawn.yaw;
    robot.replant();
    robot.update(0.016, params);
    showRobot(true);
    combat.reset(spawn);
    combat.setEnabled($("targets").checked);
    state.time = state.autoTime = 0;
    cameraReset();
  }
  return next;
}
function leaveEditorCamera() {
  world.grid.visible = editorGrid;
  controls.enablePan = false;
  controls.maxDistance = 65;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  cameraReset();
  updateCameraUI();
}
editor = new MapEditor(scene, camera, canvas, {
  open() {
    editorGrid = world.grid.visible;
    world.grid.visible = true;
    setPlaying(false);
    setPaused(true);
    showRobot(false);
    combat.setEnabled(false);
    $("lab-panel").classList.remove("open");
    $("telemetry-panel").hidden = true;
    $("maps-toggle").setAttribute("aria-expanded", "true");
    controls.enabled = true;
    controls.enablePan = true;
    controls.maxDistance = 150;
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.touches.ONE = null;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    camera.position.set(40, 65, 65);
    camera.fov = 48;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
  },
  preview: (document) => loadMap(document, true),
  play: (document) => loadMap(document, false),
  start() {
    leaveEditorCamera();
    setPlaying(true);
    toast("MAPA PERSONALIZADO · M PARA VOLVER A EDITAR");
  },
  district() {
    setPlaying(false);
    activeMap?.dispose();
    activeMap = null;
    connectWorld();
    districtDestruction.reset();
    robot.reset();
    robot.yaw = 2.7;
    robot.replant();
    robot.update(0.016, params);
    showRobot(true);
    combat.reset();
    combat.setEnabled($("targets").checked);
    world.setWeather("dusk");
    $("weather").value = "dusk";
    state.time = state.autoTime = 0;
    leaveEditorCamera();
    setPaused(false);
    toast("DISTRITO ORIGINAL RESTAURADO");
  },
});
$("maps-toggle").addEventListener("click", () => editor.open());
updateCameraUI();

const raycaster = new THREE.Raycaster();
const samples = [];
let telemetryTimer = 0,
  frameCount = 0,
  fpsTime = 0;
function updateTelemetry(dt) {
  telemetryTimer += dt;
  if (telemetryTimer < 0.15) return;
  telemetryTimer = 0;
  $("coordinates").textContent =
    `X ${robot.position.x.toFixed(1)} / Z ${robot.position.z.toFixed(1)}`;
  $("altitude").textContent =
    `${(robot.type === "wasp" ? robot.position.y + robot.config.height : robot.position.y).toFixed(1)} M`;
  $("ground-state").textContent =
    robot.type === "wasp"
      ? "VUELO VECTORIAL"
      : robot.grounded
        ? "APOYO EN SUPERFICIE"
        : "EN CAÍDA";
  $("health-text").textContent = `${robot.health}%`;
  $("health-bar").style.width = `${robot.health}%`;
  $("health-bar").style.background = robot.health < 30 ? "#e79a71" : "#abc294";
  $("score").textContent = String(combat.score).padStart(2, "0");
  $("weapon-label").textContent =
    combat.weaponMode === "missile"
      ? combat.shotCooldown > 0.1
        ? `MISIL ${combat.shotCooldown.toFixed(1)}s`
        : "MISIL"
      : "BALAS";
  $("live-speed").textContent = `${robot.speed.toFixed(1)} m/s`;
  $("live-feet").textContent = robot.legs.length
    ? `${robot.legs.filter((l) => !l.swing).length} / ${robot.legs.length}`
    : "EN VUELO";
  $("live-steps").textContent = robot.steps;
  $("live-ik").textContent =
    robot.type === "wasp" ? "VECTORIAL" : params.ik ? "ACTIVO" : "DESACTIVADO";
  samples.push(robot.speed);
  if (samples.length > 100) samples.shift();
  if (state.view === "telemetry") {
    const chart = $("telemetry-chart"),
      ctx = chart.getContext("2d");
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.strokeStyle = "#b7c3a41a";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 25);
      ctx.lineTo(chart.width, i * 25);
      ctx.stroke();
    }
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = (i / 99) * chart.width,
        y = chart.height - 8 - (s / 20) * chart.height;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = "#e4a262";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(((samples.length - 1) / 99) * chart.width, chart.height);
    ctx.lineTo(0, chart.height);
    ctx.closePath();
    ctx.fillStyle = "#e4a26212";
    ctx.fill();
  }
}
function movement(dt) {
  if (state.playing) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();
    const desired = new THREE.Vector3();
    if (keys.has("KeyW") || keys.has("ArrowUp")) desired.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) desired.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) desired.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) desired.sub(right);
    desired
      .normalize()
      .multiplyScalar(
        robot.config.speed *
          params.speed *
          (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1.7 : 1),
      );
    if (robot.type === "wasp")
      desired.y =
        ((keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0)) *
        5 *
        params.speed;
    robot.velocity.lerp(desired, 1 - Math.exp(-dt * 4));
  } else if (robot.health > 0) {
    state.autoTime += dt;
    const t = state.autoTime;
    const desired = new THREE.Vector3(
      Math.sin(t * 0.2) * 0.65,
      0,
      Math.cos(t * 0.2) * 0.85,
    );
    robot.velocity.lerp(
      desired.multiplyScalar(params.speed),
      1 - Math.exp(-dt * 2),
    );
  } else robot.velocity.set(0, 0, 0);
  const previous = robot.position.clone();
  const wasGrounded = robot.grounded;
  const result =
    robot.type === "wasp"
      ? world.collision.moveDrone(robot.position, robot.velocity, dt, {
          height: robot.config.height,
          radius: 2.45,
        })
      : world.collision.moveWalker(robot.position, robot.velocity, dt, {
          radius: robot.config.hullRadius,
          height: robot.config.height + robot.config.hullTop,
          verticalVelocity: robot.verticalVelocity,
        });
  robot.position.copy(result.position);
  robot.grounded = result.grounded;
  robot.verticalVelocity = result.verticalVelocity;
  robot.blocked = result.blocked;
  for (const axis of ["x", "z"])
    if (result.blocked[axis]) robot.velocity[axis] = 0;
  if (robot.type === "wasp" && result.blocked.y) robot.velocity.y = 0;
  if (robot.grounded && !wasGrounded) robot.replant();
  if (Math.hypot(robot.velocity.x, robot.velocity.z) > 0.6) {
    const desiredYaw = Math.atan2(-robot.velocity.x, -robot.velocity.z);
    const delta =
      THREE.MathUtils.euclideanModulo(
        desiredYaw - robot.yaw + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
    const rate = robot.type === "wasp" ? 5 : robot.type === "mantis" ? 3 : 2;
    robot.yaw += clamp(delta, -rate * dt, rate * dt);
  }
  if (state.playing && cameraMode === "orbit") {
    const offset = robot.position.clone().sub(previous);
    camera.position.add(offset);
    controls.target.add(offset);
  }
}
let lastTime = null;
function animate(now) {
  requestAnimationFrame(animate);
  const elapsed = lastTime === null ? 0 : Math.max(0, (now - lastTime) / 1000),
    realDt = Math.min(elapsed, 0.25);
  lastTime = now;
  frameCount++;
  fpsTime += elapsed;
  if (fpsTime > 0.65) {
    state.fps = Math.round(frameCount / fpsTime);
    $("fps").textContent =
      `${quality === "low" ? "LO" : quality === "high" ? "HI" : "BAL"} · ${state.fps} FPS`;
    fpsTime = 0;
    frameCount = 0;
  }
  let remaining = state.paused || editor.active ? 0 : realDt;
  // Small physics steps keep planted feet, turn rates and projectile collisions stable
  // even when rendering is slow. Long tab suspensions never teleport the unit.
  while (remaining > 0.000001) {
    const dt = Math.min(remaining, 1 / 60);
    remaining -= dt;
    state.time += dt;
    const safeMotion = robot.legs.length ? robot.captureMotion() : null;
    movement(dt);
    robot.update(dt, params);
    if (safeMotion && robot.legs.some((leg) => leg.obstructed)) {
      // A corner can leave no mechanical pose with sufficient clearance.
      // Keep the last valid position rather than rendering a limb through it.
      const correction = safeMotion.position.clone().sub(robot.position);
      robot.restoreMotion(safeMotion, params);
      robot.blocked = { ...robot.blocked, legs: true };
      if (state.playing && cameraMode === "orbit") {
        camera.position.add(correction);
        controls.target.add(correction);
      }
    }
    if (state.playing) {
      raycaster.setFromCamera(
        cameraMode === "third" || !hasPointer
          ? new THREE.Vector2(0, 0)
          : pointer,
        camera,
      );
      const groundPoint = world.collision.raycast(raycaster.ray, 180)?.point;
      aimPoint =
        combat.aim(raycaster.ray, groundPoint) ||
        (cameraMode === "third"
          ? raycaster.ray.at(180, new THREE.Vector3())
          : robot.position
              .clone()
              .add(
                new THREE.Vector3(
                  -Math.sin(robot.yaw) * 35,
                  0,
                  -Math.cos(robot.yaw) * 35,
                ),
              ));
      robot.aimAt(aimPoint, dt);
      if (holdingFire || keys.has("KeyF")) combat.shoot(robot, aimPoint);
    } else robot.turret.rotation.y = Math.sin(state.time * 0.45) * 0.25;
    combat.update(dt, state.time, robot, state.playing);
    world.destruction.update(dt);
  }
  if (!state.paused) world.update(realDt, state.time, robot.position);
  if (state.playing && cameraMode === "third" && !editor.active) {
    controls.target.copy(
      thirdPerson.update(
        realDt,
        robot.position,
        robot.config.height,
        world.collision,
      ),
    );
    state.cameraObstruction = thirdPerson.obstruction;
  } else {
    controls.update();
    if (!editor.active) {
      // Pull the orbit camera in before a wall can pass between it and the unit.
      let cameraDirection = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      const cameraDistance = camera.position.distanceTo(controls.target),
        wanted = orbitInteracting ? cameraDistance : desiredCameraDistance;
      let cameraHit = world.collision.raycast(
        new THREE.Ray(controls.target.clone(), cameraDirection),
        wanted,
      );
      // Prefer a lower orbit angle beneath a ceiling over zooming into the chassis.
      if (cameraHit && cameraHit.distance < 6) {
        const horizontal = cameraDirection.clone().setY(0).normalize();
        for (const slope of [0.08, 0.2, 0.55]) {
          const direction = horizontal.clone().setY(slope).normalize();
          const hit = world.collision.raycast(
            new THREE.Ray(controls.target.clone(), direction),
            wanted,
          );
          if (!hit || hit.distance > 8) {
            cameraDirection = direction;
            cameraHit = hit;
            break;
          }
        }
      }
      const available = cameraHit
        ? Math.min(wanted, Math.max(1.5, cameraHit.distance - 0.35))
        : wanted;
      const nextDistance =
        available < cameraDistance
          ? available
          : THREE.MathUtils.lerp(
              cameraDistance,
              available,
              1 - Math.exp(-realDt * 4),
            );
      camera.position
        .copy(controls.target)
        .addScaledVector(cameraDirection, nextDistance);
      camera.lookAt(controls.target);
      state.cameraObstruction = cameraHit
        ? {
            id: cameraHit.solid?.id,
            distance: cameraHit.distance,
            bounds: cameraHit.solid?.bounds.min
              .toArray()
              .concat(cameraHit.solid.bounds.max.toArray()),
          }
        : null;
    }
  }
  updateTelemetry(realDt);
  renderer.render(scene, camera);
}
robot.update(0.016, params);
requestAnimationFrame(animate);
requestAnimationFrame(() => $("loading").classList.add("done"));

// Read-only instrumentation used by the smoke tests and available in the console.
window.rift = {
  getState: () => ({
    robot: robot.type,
    position: robot.position.toArray(),
    velocity: robot.speed,
    steps: robot.steps,
    legs: robot.legs.map((l) => ({
      foot: l.foot.toArray(),
      swing: l.swing,
      adjusted: l.adjusted,
      obstructed: l.obstructed,
      hip: l.pose?.hip.toArray(),
      knee: l.pose?.knee.toArray(),
      renderedFoot: l.pose?.foot.toArray(),
    })),
    health: robot.health,
    score: combat.score,
    playing: state.playing,
    paused: state.paused,
    params: { ...params },
    debug: robot.debugAxes.visible,
    targets: combat.enabled,
    weather: $("weather").value,
    grid: world.grid.visible,
    empCooldown: combat.empCooldown,
    bullets: combat.bullets.length,
    weapon: combat.weaponMode,
    missiles: combat.bullets.filter((b) => b.missile).length,
    missilesFired: combat.missilesFired,
    explosions: combat.explosions,
    shotCooldown: combat.shotCooldown,
    fps: state.fps,
    grounded: robot.grounded,
    altitude:
      robot.position.y + (robot.type === "wasp" ? robot.config.height : 0),
    blocked: robot.blocked || {},
    terrainHits: combat.terrainHits,
    scene: activeMap ? "custom-map" : "ruined-district",
    editing: editor.active,
  }),
  heightAt: (x, z, ceiling) => surface(x, z, ceiling),
  getLandmarks: () => world.pointsOfInterest.map((p) => ({ ...p })),
  getBackgroundBounds: () =>
    world.collision.solids
      .filter((s) => s.id.startsWith("background-") && s.raycast === false)
      .map((s) => ({
        min: s.bounds.min.toArray(),
        max: s.bounds.max.toArray(),
      })),
  getCamera: () => ({
    mode: cameraMode,
    locked: document.pointerLockElement === canvas,
    yaw: thirdPerson.yaw,
    pitch: thirdPerson.pitch,
    aiming: thirdPerson.aiming,
    fov: camera.fov,
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    distance: camera.position.distanceTo(controls.target),
    obstruction: state.cameraObstruction,
  }),
  getMap: () => structuredClone(editor.document),
  getTowers: () =>
    world.destruction.entities.map((e) => ({
      id: e.id,
      health: e.health,
      destroyed: e.destroyed,
      elapsed: e.elapsed,
      position: e.root.position.toArray(),
      min: e.bounds.min.toArray(),
      max: e.bounds.max.toArray(),
      colliders: e.colliders.length,
    })),
  project: (point) => {
    const p = new THREE.Vector3(...point).project(camera);
    return [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight];
  },
  castRay: (from, to) => {
    const hit = world.collision.segmentHit(
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    );
    return hit
      ? {
          id: hit.solid?.id,
          point: hit.point.toArray(),
          distance: hit.distance,
        }
      : null;
  },
  getTargets: () =>
    combat.enemies
      .filter((e) => !e.dead && combat.enabled)
      .map((e) => {
        const p = e.root.position.clone().project(camera);
        return {
          position: e.root.position.toArray(),
          health: e.health,
          screen: [((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight],
          visible:
            p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
          unobstructed: (() => {
            const direction = e.root.position.clone().sub(camera.position),
              distance = direction.length();
            return !world.collision.raycast(
              new THREE.Ray(camera.position.clone(), direction.normalize()),
              Math.max(0, distance - 1.4),
            );
          })(),
        };
      }),
};
