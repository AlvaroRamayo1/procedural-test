import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { walkTo } from "./navigation.mjs";

const server = await createServer({
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  logLevel: "error",
});
await server.listen();
let browser, page;
const errors = [],
  externalRequests = [];
let checks = 0;
const passed = (description) => {
  checks++;
  console.log(`PASS ${description}`);
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
    viewport: { width: 1000, height: 760 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5174") &&
      !r.url().startsWith("data:")
    )
      externalRequests.push(r.url());
  });
  await page.goto("http://127.0.0.1:5174/?quality=low&camera=orbit");
  await page.waitForFunction(
    () =>
      window.rift &&
      document.querySelector("#loading").classList.contains("done"),
  );
  const snapshot = () => page.evaluate(() => window.rift.getState());
  const openSettings = async () => {
    if (!(await page.locator("#lab-panel").isVisible()))
      await page.click("#mobile-panel-toggle");
  };
  const initial = await snapshot();
  assert.equal(initial.robot, "strider");
  assert.equal(initial.legs.length, 4);
  assert.ok(initial.position.every((v) => Math.abs(v) < 2));
  assert.equal(initial.empCooldown, 0);
  passed(
    "3D scene starts with a centered quadruped, without runtime or shader errors",
  );
  assert.equal(await page.locator("#lab-panel").isVisible(), false);
  assert.equal(await page.locator(".unit-dock").isVisible(), true);
  passed(
    "left sidebar is removed and units are accessible from the compact dock",
  );
  await openSettings();
  await page.click("#targets");
  await page.click("#deploy");
  const start = (await snapshot()).position;
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (start) =>
      Math.hypot(
        window.rift.getState().position[0] - start[0],
        window.rift.getState().position[2] - start[2],
      ) > 2,
    start,
    { timeout: 45000 },
  );
  await page.keyboard.up("KeyW");
  await page.waitForFunction(() => window.rift.getState().steps > 0, null, {
    timeout: 45000,
  });
  const moving = await snapshot();
  assert.equal(moving.playing, true);
  assert.ok(moving.steps > 0);
  const stance = await page.evaluate(async () => {
    let previous = window.rift.getState(),
      verified = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      const current = window.rift.getState();
      for (let j = 0; j < current.legs.length; j++) {
        const a = previous.legs[j],
          b = current.legs[j];
        if (
          !a.swing &&
          !b.swing &&
          a.foot.every((v, k) => Math.abs(v - b.foot[k]) < 1e-7) &&
          Math.hypot(
            current.position[0] - previous.position[0],
            current.position[2] - previous.position[2],
          ) > 1e-5
        )
          verified = true;
      }
      previous = current;
    }
    return verified;
  });
  assert.ok(
    stance,
    "supporting feet stay fixed in world space while the body moves",
  );
  passed("WASD moves the unit and triggers real procedural foot steps");
  await page.click("#pause");
  const paused = await snapshot();
  assert.equal(paused.paused, true);
  await page.waitForTimeout(500);
  const still = await snapshot();
  assert.deepEqual(still.position, paused.position);
  assert.deepEqual(still.legs, paused.legs);
  passed("pause freezes robot position and foot motion");
  await page.click("#pause");
  await openSettings();
  await page.click("#debug");
  assert.equal((await snapshot()).debug, true);
  await page.locator("#lift").evaluate((el) => {
    el.value = "1.2";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal((await snapshot()).params.lift, 1.2);
  await page.click("#ik");
  assert.equal((await snapshot()).params.ik, false);
  await page.click("#ik");
  passed("live gait parameters, IK comparison and joint visualization respond");
  await page.click('.unit-tab[data-robot="mantis"]');
  assert.equal((await snapshot()).legs.length, 6);
  assert.equal((await snapshot()).robot, "mantis");
  await page.click('.unit-tab[data-robot="wasp"]');
  assert.equal((await snapshot()).legs.length, 0);
  assert.equal(await page.locator("#lift").isDisabled(), true);
  await page.locator("#world").focus();
  const droneStart = (await snapshot()).position;
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    (start) => Math.abs(window.rift.getState().position[0] - start[0]) > 1.5,
    droneStart,
    { timeout: 45000 },
  );
  await page.keyboard.up("KeyD");
  passed(
    "hexapod and hover drone can be selected; drone flight accepts player input",
  );
  const initialAltitude = (await snapshot()).altitude;
  await page.keyboard.down("KeyQ");
  await page.waitForFunction(
    (y) => window.rift.getState().altitude > y + 3,
    initialAltitude,
    { timeout: 45000 },
  );
  await page.keyboard.up("KeyQ");
  await page.keyboard.down("KeyE");
  await page.waitForFunction(
    (y) => window.rift.getState().altitude < y + 0.5,
    initialAltitude,
    { timeout: 45000 },
  );
  await page.keyboard.up("KeyE");
  passed("drone ascends with Q and descends with E");
  await openSettings();
  await page.selectOption("#weather", "night");
  assert.equal((await snapshot()).weather, "night");
  await page.click("#mobile-panel-toggle");
  await page.click("#grid-toggle");
  assert.equal((await snapshot()).grid, true);
  await page.click('[data-view="telemetry"]');
  assert.equal(await page.locator("#telemetry-panel").isVisible(), true);
  passed("weather, grid and live telemetry work");
  await page.click('[data-view="field"]');
  await page.click("#reset");
  await page.click('.unit-tab[data-robot="strider"]');
  await openSettings();
  await page.click("#targets");
  await page.click("#deploy");
  // Aim using projected target coordinates; no test-only state mutation is used.
  await page.locator("#world").focus();
  await page.keyboard.down("KeyF");
  let fired = false;
  for (let i = 0; i < 25; i++) {
    if ((await snapshot()).score > 0) break;
    const targets = await page.evaluate(() => window.rift.getTargets());
    const target = targets.find(
      (t) =>
        t.visible &&
        t.unobstructed &&
        t.screen[0] > 345 &&
        t.screen[0] < 940 &&
        t.screen[1] > 165 &&
        t.screen[1] < 650,
    );
    if (!target) {
      await page.waitForTimeout(200);
      continue;
    }
    await page.mouse.move(...target.screen);
    await page.waitForTimeout(200);
    const s = await snapshot();
    if (s.bullets > 0) fired = true;
    if (s.score > 0) break;
  }
  await page.keyboard.up("KeyF");
  assert.ok(fired);
  assert.ok((await snapshot()).score > 0, "projectiles should destroy a drone");
  passed("aimed projectiles hit and destroy hostile drones");
  await page.keyboard.press("KeyV");
  assert.equal((await snapshot()).weapon, "missile");
  for (const type of ["strider", "mantis", "wasp"]) {
    await page.click('.unit-tab[data-robot="' + type + '"]');
    const before = (await snapshot()).missilesFired;
    await page.locator("#world").focus();
    await page.keyboard.down("KeyF");
    for (let i = 0; i < 35; i++) {
      const target = (await page.evaluate(() => window.rift.getTargets())).find(
        (t) =>
          t.visible &&
          t.unobstructed &&
          t.screen[0] > 150 &&
          t.screen[0] < 950 &&
          t.screen[1] > 170 &&
          t.screen[1] < 640,
      );
      if (target) await page.mouse.move(...target.screen);
      await page.waitForTimeout(150);
      if ((await snapshot()).missilesFired > before) break;
    }
    await page.keyboard.up("KeyF");
    assert.ok(
      (await snapshot()).missilesFired > before,
      type + " launches a missile",
    );
  }
  await page.waitForFunction(
    () => window.rift.getState().explosions > 0,
    null,
    { timeout: 45000 },
  );
  assert.ok((await snapshot()).explosions > 0);
  await page.click("#weapon-toggle");
  assert.equal((await snapshot()).weapon, "bullet");
  await page.keyboard.press("Digit1");
  passed(
    "all three units launch missiles; V and the weapon button switch firing modes",
  );
  await page.keyboard.press("Space");
  const emp = await snapshot();
  assert.ok(emp.empCooldown > 0);
  await page.keyboard.press("Space");
  assert.ok((await snapshot()).empCooldown <= emp.empCooldown);
  passed("EMP fires with a cooldown, preventing repeated pulses");
  await page.click("#reset");
  const reset = await snapshot();
  assert.equal(reset.health, 100);
  assert.equal(reset.score, 0);
  assert.equal(reset.playing, false);
  assert.ok(reset.position.every((v) => Math.abs(v) < 0.5));
  passed("reset restores health, enemies, position and counters");
  await openSettings();
  await page.click("#targets");
  await page.click("#deploy");
  assert.equal(await page.evaluate(() => window.rift.heightAt(0, -17, 1)), 0);
  assert.equal(
    (await page.evaluate(() => window.rift.getBackgroundBounds())).length,
    42,
  );
  passed(
    "central street stays level and skyline buildings have inaccessible boundary volumes",
  );
  await page.evaluate(() => {
    window.legFailures = [];
    window.watchLegs = true;
    const watch = () => {
      if (!window.watchLegs) return;
      const state = window.rift.getState();
      if (state.legs.some((l) => l.obstructed) && window.legFailures.length < 5)
        window.legFailures.push({ position: state.position, legs: state.legs });
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await walkTo(page, -13, -8);
  await walkTo(page, -19, -8);
  await walkTo(page, -19, -18);
  await walkTo(page, -19, -26);
  await walkTo(page, -19, -34);
  const elevated = await snapshot();
  assert.ok(elevated.altitude > 6.9);
  assert.ok(elevated.steps > 15);
  assert.ok(elevated.legs.some((l) => l.renderedFoot[1] > 6));
  assert.ok(elevated.legs.every((l) => !l.obstructed));
  passed(
    "walker climbs the collapsed side slab with collision-free procedural legs",
  );
  await walkTo(page, -12, -34);
  await walkTo(page, -12, -29.2);
  await walkTo(page, 12, -29.2);
  await walkTo(page, 12, -36);
  await walkTo(page, -7, -36);
  assert.ok((await snapshot()).altitude > 10.4);
  assert.ok((await snapshot()).legs.every((l) => !l.obstructed));
  const clearCamera = await page.evaluate(() => window.rift.getCamera());
  assert.ok(clearCamera.distance > 8);
  passed("walker reaches the upper floor through the ruined building");
  await walkTo(page, 12, -36);
  await walkTo(page, 20, -36);
  await walkTo(page, 27, -36);
  await walkTo(page, 35, -36);
  assert.ok(Math.abs((await snapshot()).altitude - 7) < 0.1);
  passed("the bridge remains traversable between buildings");
  await walkTo(page, 39.4, -36, 0.6);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1600);
  await page.keyboard.up("KeyD");
  for (const type of ["strider", "mantis"]) {
    await page.click('.unit-tab[data-robot="' + type + '"]');
    const nearWall = await snapshot();
    assert.ok(nearWall.position[0] < 40.1);
    assert.ok(
      nearWall.legs.every(
        (l) => !l.obstructed && l.renderedFoot[0] < 41.5 && l.knee[0] < 41.67,
      ),
    );
  }
  passed(
    "quadruped and hexapod keep feet and knees clear when pressing against a wall",
  );
  await page.keyboard.press("Digit1");
  await walkTo(page, 35, -36);
  await walkTo(page, 27, -36);
  await walkTo(page, 20, -36);
  await walkTo(page, 12, -36);
  await walkTo(page, 12, -29.2);
  await walkTo(page, -12, -29.2);
  await walkTo(page, -12, -34);
  await walkTo(page, -19, -34);
  await walkTo(page, -19, -8);
  assert.ok((await snapshot()).altitude < 0.05);
  const legFailures = await page.evaluate(() => {
    window.watchLegs = false;
    return window.legFailures;
  });
  assert.deepEqual(
    legFailures,
    [],
    "feet and limb segments stay outside masonry throughout exploration",
  );
  passed(
    "walker descends the side slab back to the street with no limb penetration",
  );
  await page.click("#reset");
  await mkdir("test-results", { recursive: true });
  await openSettings();
  await page.selectOption("#weather", "dusk");
  await page.click("#mobile-panel-toggle");
  await page.screenshot({ path: "test-results/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#mobile-panel-toggle");
  assert.equal(await page.locator("#lab-panel").isVisible(), true);
  await page.click("#deploy");
  assert.equal(await page.locator("#touch-controls").isVisible(), true);
  const touchStart = (await snapshot()).position;
  const forward = page.locator('[data-key="KeyW"]');
  const bounds = await forward.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForFunction(
    (start) =>
      Math.hypot(
        window.rift.getState().position[0] - start[0],
        window.rift.getState().position[2] - start[2],
      ) > 0.5,
    touchStart,
    { timeout: 45000 },
  );
  await page.mouse.up();
  await page.screenshot({ path: "test-results/mobile.png" });
  passed(
    "mobile layout exposes configuration and functional on-screen movement controls",
  );
  await page.keyboard.press("Digit3");
  assert.equal((await snapshot()).robot, "wasp");
  const upButton = page.locator('[data-key="KeyQ"]');
  assert.equal(await upButton.isVisible(), true);
  const upBounds = await upButton.boundingBox();
  const mobileAltitude = (await snapshot()).altitude;
  await page.mouse.move(
    upBounds.x + upBounds.width / 2,
    upBounds.y + upBounds.height / 2,
  );
  await page.mouse.down();
  await page.waitForFunction(
    (y) => window.rift.getState().altitude > y + 0.8,
    mobileAltitude,
    { timeout: 45000 },
  );
  await page.mouse.up();
  passed("mobile drone controls include functional ascent buttons");
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  passed("no browser errors, shader errors or external runtime asset requests");
  console.log(
    `\n${checks} browser checks passed. Screenshots: test-results/desktop.png, test-results/mobile.png`,
  );
} catch (error) {
  await mkdir("test-results", { recursive: true });
  if (page) {
    await page.screenshot({ path: "test-results/failure.png" });
    console.error(
      JSON.stringify(
        await page.evaluate(() => ({
          state: window.rift?.getState(),
          legs: window.legFailures,
          camera: window.rift?.getCamera(),
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
