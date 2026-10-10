// Steer with the same camera-relative keyboard controls as a player. The test
// only reads positions; it never teleports a unit or mutates simulation state.
export async function walkTo(page, x, z, tolerance = 0.8) {
  const start = await page.evaluate(() => window.rift.getState().position);
  const distance = Math.hypot(x - start[0], z - start[2]);
  const tangent = [
    (x - start[0]) / (distance || 1),
    (z - start[2]) / (distance || 1),
  ];
  const combinations = [
    ["KeyW"],
    ["KeyD"],
    ["KeyS"],
    ["KeyA"],
    ["KeyW", "KeyD"],
    ["KeyW", "KeyA"],
    ["KeyS", "KeyD"],
    ["KeyS", "KeyA"],
  ];
  let held = [];
  try {
    for (let i = 0; i < 180; i++) {
      const { position, camera } = await page.evaluate(() => ({
        position: window.rift.getState().position,
        camera: window.rift.getCamera(),
      }));
      if (Math.hypot(x - position[0], z - position[2]) < tolerance) return;
      // Follow the intended segment with a short look-ahead. Aiming only at a
      // distant goal lets eight keyboard directions drift across a narrow lane.
      const progress = Math.max(
        0,
        (position[0] - start[0]) * tangent[0] +
          (position[2] - start[2]) * tangent[1],
      );
      const ahead = Math.min(distance, progress + 1.6);
      const aimX = start[0] + tangent[0] * ahead,
        aimZ = start[2] + tangent[1] * ahead;
      const fx = camera.target[0] - camera.position[0],
        fz = camera.target[2] - camera.position[2],
        length = Math.hypot(fx, fz);
      const forward = [fx / length, fz / length],
        right = [-forward[1], forward[0]];
      let best,
        score = -Infinity;
      for (const keys of combinations) {
        let dx = 0,
          dz = 0;
        for (const key of keys) {
          const axis =
            key === "KeyW"
              ? forward
              : key === "KeyS"
                ? forward.map((v) => -v)
                : key === "KeyD"
                  ? right
                  : right.map((v) => -v);
          dx += axis[0];
          dz += axis[1];
        }
        const dot =
          ((aimX - position[0]) * dx + (aimZ - position[2]) * dz) /
          Math.hypot(dx, dz);
        if (dot > score) {
          score = dot;
          best = keys;
        }
      }
      for (const key of held)
        if (!best.includes(key)) await page.keyboard.up(key);
      for (const key of best)
        if (!held.includes(key)) await page.keyboard.down(key);
      held = best;
      await page.waitForTimeout(130);
    }
    throw Error(
      `Could not reach waypoint ${x},${z}: ${JSON.stringify(await page.evaluate(() => window.rift.getState().position))}`,
    );
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
}
