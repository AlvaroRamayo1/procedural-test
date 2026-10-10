// Steer with the same camera-relative keyboard controls as a player. The test
// only reads positions; it never teleports a unit or mutates simulation state.
export async function walkTo(page, x, z, tolerance = 0.8) {
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
          ((x - position[0]) * dx + (z - position[2]) * dz) /
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
