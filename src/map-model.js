export const MAP_TYPES = {
  ruin: { label: "Ruina", width: 16, depth: 14, height: 14 },
  wall: { label: "Pared", width: 12, depth: 0.8, height: 7 },
  platform: { label: "Plataforma", width: 14, depth: 12, height: 0.6 },
  ramp: { label: "Rampa", width: 8, depth: 20, height: 6 },
  antenna: { label: "Torre", width: 5, depth: 5, height: 19 },
  crate: { label: "Contenedor", width: 8, depth: 4, height: 3.6 },
  barrier: { label: "Límite invisible", width: 12, depth: 1, height: 45 },
};
const weatherTypes = ["dusk", "storm", "night"];
// Map IDs also work when the game is served over HTTP on a local network.
export function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function createMap(template = "blank") {
  return {
    version: 1,
    id: createId(),
    name: "Mi escenario",
    weather: "dusk",
    spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    objects:
      template === "district"
        ? [
            createMapObject("ruin", -20, -22),
            createMapObject("ruin", 23, -25),
            createMapObject("ramp", -20, -5, { height: 7 }),
            createMapObject("antenna", 0, -24),
            createMapObject("crate", 18, 10),
          ]
        : [],
  };
}
export function createMapObject(type, x, z, values = {}) {
  if (!Object.hasOwn(MAP_TYPES, type))
    throw new Error("Tipo de objeto desconocido.");
  return {
    id: createId(),
    type,
    x,
    y: 0,
    z,
    rotation: 0,
    ...MAP_TYPES[type],
    ...values,
  };
}
export function validateMap(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.objects))
    throw new Error("El archivo no es un mapa RIFT compatible (versión 1).");
  if (value.objects.length > 100)
    throw new Error("El mapa admite hasta 100 objetos.");
  const number = (v, lo, hi, field) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
      throw new Error(`${field} debe estar entre ${lo} y ${hi}.`);
    return v === 0 ? 0 : v;
  };
  const ids = new Set();
  const objects = value.objects.map((object) => {
    if (!object || !Object.hasOwn(MAP_TYPES, object.type))
      throw new Error("El mapa contiene un objeto desconocido.");
    if (
      typeof object.id !== "string" ||
      !object.id ||
      object.id.length > 80 ||
      ids.has(object.id)
    )
      throw new Error("Hay identificadores de objetos inválidos o repetidos.");
    ids.add(object.id);
    const rotation = number(object.rotation, 0, 270, "Rotación");
    if (rotation % 90)
      throw new Error("Usa rotaciones de 0°, 90°, 180° o 270°.");
    const result = {
      id: object.id,
      type: object.type,
      x: number(object.x, -52, 52, "X"),
      y: number(object.y, 0, 24, "Altura base"),
      z: number(object.z, -52, 52, "Z"),
      rotation,
      width: number(object.width, 0.2, 30, "Ancho"),
      depth: number(object.depth, 0.2, 30, "Largo"),
      height: number(
        object.height,
        0.2,
        object.type === "barrier" ? 60 : 24,
        "Alto",
      ),
    };
    const halfX = (rotation % 180 ? result.depth : result.width) / 2;
    const halfZ = (rotation % 180 ? result.width : result.depth) / 2;
    if (Math.abs(result.x) + halfX > 58 || Math.abs(result.z) + halfZ > 58)
      throw new Error("El objeto queda fuera del área del mapa.");
    return result;
  });
  const spawn = value.spawn;
  if (!spawn) throw new Error("El mapa necesita un punto de inicio.");
  const name =
    typeof value.name === "string" ? value.name.trim().slice(0, 60) : "";
  if (!name) throw new Error("Pon un nombre al mapa.");
  if (!weatherTypes.includes(value.weather))
    throw new Error("Atmósfera desconocida.");
  return {
    version: 1,
    id: typeof value.id === "string" ? value.id.slice(0, 80) : createId(),
    name,
    weather: value.weather,
    spawn: {
      x: number(spawn.x, -52, 52, "Inicio X"),
      y: number(spawn.y, 0, 24, "Inicio Y"),
      z: number(spawn.z, -52, 52, "Inicio Z"),
      yaw: number(spawn.yaw ?? 0, -Math.PI * 2, Math.PI * 2, "Orientación"),
    },
    objects,
  };
}
