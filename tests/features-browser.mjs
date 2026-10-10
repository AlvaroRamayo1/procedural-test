import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { walkTo } from "./navigation.mjs";

const server = await createServer({
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
  logLevel: "error",
});
await server.listen();
let browser,
  page,
  checks = 0;
const errors = [];
const passed = (message) => {
  checks++;
  console.log(`PASS ${message}`);
};
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
    acceptDownloads: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:5176/?quality=low");
  await page.waitForFunction(
    () =>
      window.rift &&
      document.querySelector("#loading").classList.contains("done"),
  );
  const state = () => page.evaluate(() => window.rift.getState());
  const map = () => page.evaluate(() => window.rift.getMap());
  const camera = () => page.evaluate(() => window.rift.getCamera());
  const place = async (type, point) => {
    await page.click(`[data-tool="${type}"]`);
    const screen = await page.evaluate((p) => window.rift.project(p), point);
    assert.ok(
      screen[0] > 0 && screen[0] < 740 && screen[1] > 80 && screen[1] < 800,
      `place point is clear of panels: ${screen}`,
    );
    await page.mouse.click(...screen);
  };
  const importMap = async (document) => {
    await page.locator("#map-file").setInputFiles({
      name: "test-map.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
  };
  const towers = await page.evaluate(() => window.rift.getTowers());
  assert.equal(towers.length, 3);
  assert.ok(towers.every((t) => t.health === 8 && t.colliders > 20));
  const hit = await page.evaluate(() =>
    window.rift.castRay([-40, 8, -23], [-40, 8, -43]),
  );
  assert.equal(hit.id, "antenna-0");
  passed("district towers have real steel collision");

  await page.click("#mobile-panel-toggle");
  await page.click("#targets");
  await page.click("#deploy");
  await page.waitForFunction(() => window.rift.getCamera().locked);
  assert.equal((await camera()).mode, "third");
  const initialYaw = (await camera()).yaw;
  await page.mouse.move(700, 380);
  await page.waitForFunction(
    (y) => Math.abs(window.rift.getCamera().yaw - y) > 0.1,
    initialYaw,
  );
  await page.mouse.down({ button: "right" });
  await page.waitForFunction(() => window.rift.getCamera().fov < 46);
  await page.mouse.up({ button: "right" });
  const crosshair = await page.locator("#crosshair").boundingBox();
  assert.ok(
    Math.abs(crosshair.x + 10 - 550) < 1 &&
      Math.abs(crosshair.y + 10 - 400) < 1,
  );
  passed(
    "third-person pointer lock, mouse look, centered reticle and aiming zoom work",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/third-person.png" });
  const manualStart = (await state()).position,
    manualCamera = await camera();
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (p) =>
      Math.hypot(
        window.rift.getState().position[0] - p[0],
        window.rift.getState().position[2] - p[2],
      ) > 2,
    manualStart,
    { timeout: 30000 },
  );
  await page.keyboard.up("KeyW");
  const manualEnd = (await state()).position;
  assert.ok(
    (manualEnd[0] - manualStart[0]) *
      (manualCamera.target[0] - manualCamera.position[0]) +
      (manualEnd[2] - manualStart[2]) *
        (manualCamera.target[2] - manualCamera.position[2]) >
      0,
  );
  assert.ok((await state()).legs.every((l) => !l.obstructed));
  passed(
    "third-person movement follows the camera while maintaining clear procedural legs",
  );
  await page.keyboard.press("KeyP");
  await page.waitForFunction(
    () => window.rift.getState().paused && !window.rift.getCamera().locked,
  );
  await page.click("#maps-toggle");
  assert.equal((await state()).editing, true);
  await page.selectOption("#map-template", "blank");
  await page.click("#map-new");
  await page.fill("#map-name", "Taller de pruebas");
  await page.locator("#map-name").press("Tab");
  await place("antenna", [0, 0, -16]);
  await place("wall", [-18, 0, -18]);
  assert.equal((await map()).objects.length, 2);
  await page.selectOption("#object-rotation", "90");
  await page.fill("#object-width", "10");
  await page.locator("#object-width").press("Tab");
  assert.equal((await map()).objects[1].rotation, 90);
  assert.equal((await map()).objects[1].width, 10);
  await page.click("#object-copy");
  assert.equal((await map()).objects.length, 3);
  await page.click("#map-undo");
  assert.equal((await map()).objects.length, 2);
  await page.click("#map-redo");
  assert.equal((await map()).objects.length, 3);
  const objects = (await map()).objects;
  await page.selectOption("#map-objects", objects[2].id);
  await page.click("#object-delete");
  assert.equal((await map()).objects.length, 2);
  await place("spawn", [0, 0, 8]);
  assert.ok(Math.abs((await map()).spawn.z - 8) < 1.01);
  await page.selectOption("#map-weather", "storm");
  await page.click("#map-save");
  assert.ok(
    (await page.locator("#map-status").textContent()).includes("guardado"),
  );
  const downloadEvent = page.waitForEvent("download");
  await page.click("#map-export");
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.name, "Taller de pruebas");
  assert.equal(exported.objects.length, 2);
  passed(
    "visual placement, dimensions, rotation, duplication, deletion, undo and JSON export work",
  );
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/editor-desktop.png" });
  const bad = structuredClone(exported);
  bad.objects[0].type = "constructor";
  await importMap(bad);
  await page.waitForFunction(() =>
    document.querySelector("#map-status").classList.contains("error"),
  );
  assert.deepEqual(await map(), exported);
  await page.selectOption("#map-template", "blank");
  await page.click("#map-new");
  await importMap(exported);
  await page.waitForFunction(
    () => document.querySelector("#map-name").value === "Taller de pruebas",
  );
  assert.deepEqual(await map(), exported);
  passed("invalid imports preserve the current map and valid JSON restores it");
  await page.reload();
  await page.waitForFunction(() => window.rift);
  await page.click("#mobile-panel-toggle");
  await page.click("#targets");
  await page.click("#mobile-panel-toggle");
  await page.click("#maps-toggle");
  assert.deepEqual(await map(), exported);
  await page.click("#map-new");
  await page.click("#map-load");
  assert.deepEqual(await map(), exported);
  passed("saved maps and autosaved drafts survive browser reloads");
  // Orbit mode makes the tower impact test target its visible geometry directly.
  await page.click("#map-play");
  await page.waitForFunction(
    () =>
      window.rift.getState().scene === "custom-map" &&
      !window.rift.getState().editing,
  );
  await page.keyboard.press("KeyC");
  await page.waitForFunction(() => window.rift.getCamera().mode === "orbit");
  await page.keyboard.press("KeyP"); // A pointer-lock release pauses; resume explicitly.
  if ((await state()).paused) await page.keyboard.press("KeyP");
  assert.ok(Math.abs((await state()).position[2] - exported.spawn.z) < 1);
  assert.equal((await state()).weather, "storm");
  assert.equal((await state()).targets, false);
  let tower = (await page.evaluate(() => window.rift.getTowers()))[0];
  assert.equal(tower.destroyed, false);
  await page.keyboard.press("KeyV");
  const targetPoint = [tower.position[0], 8, tower.position[2]];
  const targetScreen = await page.evaluate(
    (p) => window.rift.project(p),
    targetPoint,
  );
  await page.mouse.move(...targetScreen);
  await page.keyboard.down("KeyF");
  await page.waitForFunction(() => window.rift.getTowers()[0].destroyed, null, {
    timeout: 30000,
  });
  await page.keyboard.up("KeyF");
  await page.waitForFunction(
    () => window.rift.getTowers()[0].elapsed >= 1.8,
    null,
    { timeout: 30000 },
  );
  tower = (await page.evaluate(() => window.rift.getTowers()))[0];
  assert.ok(tower.max[1] < 6);
  const highHit = await page.evaluate(
    (p) => window.rift.castRay([p[0], 12, p[2] + 10], [p[0], 12, p[2] - 10]),
    tower.position,
  );
  assert.equal(highHit, null);
  assert.ok((await state()).explosions > 0);
  passed(
    "custom maps are playable and real missiles topple towers, clearing their former hitboxes",
  );
  await page.click("#reset");
  assert.equal(
    (await page.evaluate(() => window.rift.getTowers()))[0].health,
    8,
  );
  await page.click("#maps-toggle");
  await page.click("#map-district");
  assert.equal((await state()).scene, "ruined-district");
  assert.equal((await state()).editing, false);
  assert.equal((await page.evaluate(() => window.rift.getTowers())).length, 3);
  passed(
    "reset restores broken towers and the editor can return to the original district",
  );
  await page.click('.unit-dock [data-robot="wasp"]');
  await page.click("#deploy");
  await page.keyboard.down("KeyQ");
  await page.waitForFunction(() => window.rift.getState().altitude > 14, null, {
    timeout: 30000,
  });
  await page.keyboard.up("KeyQ");
  await walkTo(page, -40, 0, 0.7);
  await walkTo(page, -40, -23, 0.7);
  const districtTowerPoint = await page.evaluate(() =>
    window.rift.project([-40, 16, -33]),
  );
  await page.mouse.move(...districtTowerPoint);
  await page.keyboard.down("KeyF");
  await page.waitForFunction(() => window.rift.getTowers()[0].destroyed, null, {
    timeout: 30000,
  });
  await page.keyboard.up("KeyF");
  await page.waitForFunction(
    () => window.rift.getTowers()[0].elapsed >= 1.8,
    null,
    { timeout: 30000 },
  );
  passed(
    "the original black district tower also falls when hit by player missiles",
  );
  await page.click("#reset");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#maps-toggle");
  assert.equal(await page.locator("#map-play").isVisible(), true);
  await page.screenshot({ path: "test-results/editor-mobile.png" });
  await page.click("#map-district");
  await page.click('.unit-dock [data-robot="wasp"]');
  await page.click("#deploy");
  assert.equal((await camera()).mode, "orbit");
  await page.click("#camera-mode");
  await page.mouse.move(100, 300);
  await page.mouse.down({ button: "right" });
  const mobileYaw = (await camera()).yaw;
  await page.mouse.move(170, 300, { steps: 4 });
  await page.mouse.up({ button: "right" });
  assert.ok(Math.abs((await camera()).yaw - mobileYaw) > 0.1);
  passed(
    "mobile layout exposes map actions and third-person drag fallback works",
  );
  await page.close();
  page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5176/?quality=low");
  await page.waitForFunction(() => window.rift);
  await page.locator("#deploy").tap();
  assert.equal((await camera()).locked, false);
  const touchYaw = (await camera()).yaw,
    session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 100, y: 300 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 180, y: 300 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(Math.abs((await camera()).yaw - touchYaw) > 0.15);
  await page.locator("#maps-toggle").tap();
  await page.selectOption("#map-template", "blank");
  await page.locator("#map-new").tap();
  await page.locator('[data-tool="antenna"]').tap();
  const touchPoint = await page.evaluate(() =>
    window.rift.project([0, 0, -16]),
  );
  await page.touchscreen.tap(...touchPoint);
  assert.equal((await map()).objects.length, 1);
  passed(
    "real touch gestures rotate the third-person camera and place editor objects without a mouse",
  );
  assert.deepEqual(errors, []);
  passed("new workflows produce no browser or shader errors");
  console.log(`\n${checks} feature browser checks passed.`);
} catch (error) {
  await mkdir("test-results", { recursive: true });
  if (page) {
    await page.screenshot({ path: "test-results/features-failure.png" });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          state: window.rift?.getState(),
          camera: window.rift?.getCamera(),
          map: window.rift?.getMap(),
          towers: window.rift?.getTowers(),
          status: document.querySelector("#map-status")?.textContent,
        })),
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await server.close();
}
