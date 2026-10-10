import * as THREE from "three";
import {
  MAP_TYPES,
  createMap,
  createMapObject,
  validateMap,
  createId,
} from "./map-model.js";

const $ = (id) => document.getElementById(id);
const draftKey = "rift-map-draft-v1",
  libraryKey = "rift-map-library-v1";
export class MapEditor {
  constructor(scene, camera, canvas, hooks) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.hooks = hooks;
    this.active = false;
    this.tool = "select";
    this.selected = null;
    this.history = [];
    this.future = [];
    this.document = createMap("district");
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) this.document = validateMap(JSON.parse(saved));
    } catch {}
    this.panel = document.createElement("aside");
    this.panel.id = "map-editor";
    this.panel.hidden = true;
    this.panel.setAttribute("aria-label", "Editor de mapas personalizados");
    this.panel.innerHTML = `<div class="editor-heading"><span class="eyebrow">CREADOR DE ESCENARIOS</span><button id="editor-close" aria-label="Cerrar editor">×</button></div>
      <label>Nombre del mapa<input id="map-name" maxlength="60" /></label>
      <div class="editor-row"><select id="map-template" aria-label="Plantilla"><option value="blank">Mapa vacío</option><option value="district">Distrito en ruinas</option></select><button id="map-new">Nuevo</button></div>
      <div class="editor-palette"><button data-tool="select">↖ Seleccionar</button><button data-tool="spawn">◎ Inicio</button>${Object.entries(
        MAP_TYPES,
      )
        .map(
          ([type, config]) =>
            `<button data-tool="${type}">${config.label}</button>`,
        )
        .join("")}</div>
      <p class="editor-help" id="editor-help">Selecciona un objeto. Arrastra con el botón derecho para orbitar; botón central para desplazar.</p>
      <div class="editor-row"><label>Atmósfera<select id="map-weather"><option value="dusk">Atardecer</option><option value="storm">Tormenta</option><option value="night">Noche</option></select></label><label>Cuadrícula<select id="map-snap"><option value="1">1 metro</option><option value="0.5">0,5 metros</option><option value="2">2 metros</option></select></label></div>
      <div class="editor-properties" id="object-properties" hidden><strong id="object-type"></strong><div class="editor-fields">${[
        ["x", "X"],
        ["z", "Z"],
        ["y", "Altura base"],
        ["width", "Ancho"],
        ["depth", "Largo"],
        ["height", "Alto"],
      ]
        .map(
          ([key, label]) =>
            `<label>${label}<input type="number" id="object-${key}" data-property="${key}" step="0.5" /></label>`,
        )
        .join(
          "",
        )}</div><label>Rotación<select id="object-rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label><div class="editor-row"><button id="object-copy">Duplicar</button><button id="object-delete">Eliminar</button></div></div>
      <div class="editor-row"><button id="map-undo">↶ Deshacer</button><button id="map-redo">↷ Rehacer</button></div>
      <label>Objetos <span id="map-count"></span><select id="map-objects" size="3" aria-label="Objetos del mapa"></select></label>
      <div class="editor-row"><button id="map-save">Guardar</button><button id="map-export">Exportar JSON</button><button id="map-import">Importar</button></div>
      <input type="file" id="map-file" accept=".json,application/json" hidden />
      <div class="editor-row"><select id="map-library" aria-label="Mapas guardados"></select><button id="map-load">Cargar</button></div>
      <p id="map-status" role="status"></p><button id="map-play" class="primary-button">▶ Probar mapa</button><button id="map-district" class="editor-return">Volver al distrito original</button>`;
    $("app").append(this.panel);
    this.guide = new THREE.Box3Helper(new THREE.Box3(), 0xe4a262);
    this.guide.visible = false;
    scene.add(this.guide);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xb5df9c,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);
    this.raycaster = new THREE.Raycaster();
    this.point = null;
    this.bind();
    this.refreshLibrary();
    this.render();
  }
  bind() {
    this.panel.querySelectorAll("[data-tool]").forEach(
      (button) =>
        (button.onclick = () => {
          this.tool = button.dataset.tool;
          this.selected = null;
          this.render();
        }),
    );
    $("editor-close").onclick = () => this.play();
    $("map-play").onclick = () => this.play();
    $("map-district").onclick = () => {
      this.close();
      this.hooks.district();
    };
    $("map-new").onclick = () =>
      this.change(() => {
        this.document = createMap($("map-template").value);
        this.selected = null;
      });
    $("map-name").onchange = () =>
      this.change(() => {
        this.document.name = $("map-name").value;
      });
    $("map-weather").onchange = () =>
      this.change(() => {
        this.document.weather = $("map-weather").value;
      });
    this.panel.querySelectorAll("[data-property]").forEach(
      (input) =>
        (input.onchange = () =>
          this.change(() => {
            const object = this.current();
            if (object) object[input.dataset.property] = Number(input.value);
          })),
    );
    $("object-rotation").onchange = () =>
      this.change(() => {
        if (this.current())
          this.current().rotation = Number($("object-rotation").value);
      });
    $("object-delete").onclick = () => this.remove();
    $("object-copy").onclick = () =>
      this.change(() => {
        const current = this.current();
        if (!current) return;
        const object = {
          ...current,
          id: createId(),
          x: current.x + 2,
          z: current.z + 2,
        };
        this.document.objects.push(object);
        this.selected = object.id;
      });
    $("map-objects").onchange = () => {
      this.selected = $("map-objects").value;
      this.tool = "select";
      this.render();
    };
    $("map-undo").onclick = () => this.undo();
    $("map-redo").onclick = () => this.redo();
    $("map-save").onclick = () => {
      try {
        const map = validateMap(this.document),
          library = this.library().filter((item) => item.id !== map.id);
        library.push(map);
        localStorage.setItem(libraryKey, JSON.stringify(library.slice(-20)));
        localStorage.setItem(draftKey, JSON.stringify(map));
        this.refreshLibrary();
        $("map-library").value = map.id;
        this.status("Mapa guardado en este navegador.");
      } catch (error) {
        this.status(error.message, true);
      }
    };
    $("map-load").onclick = () => {
      const map = this.library().find(
        (item) => item.id === $("map-library").value,
      );
      if (map)
        this.change(() => {
          this.document = structuredClone(map);
          this.selected = null;
        });
    };
    $("map-export").onclick = () => {
      try {
        const map = validateMap(this.document),
          blob = new Blob([JSON.stringify(map, null, 2)], {
            type: "application/json",
          });
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download =
          (map.name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "rift-map") +
          ".json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.status("Archivo JSON exportado para compartir.");
      } catch (error) {
        this.status(error.message, true);
      }
    };
    $("map-import").onclick = () => $("map-file").click();
    $("map-file").onchange = async () => {
      const file = $("map-file").files[0];
      if (!file) return;
      try {
        if (file.size > 1024 * 1024)
          throw new Error("El archivo supera el límite de 1 MB.");
        const map = validateMap(JSON.parse(await file.text()));
        this.change(() => {
          this.document = map;
          this.selected = null;
        });
        this.status("Mapa importado. Puedes editarlo o probarlo.");
      } catch (error) {
        this.status(error.message, true);
      } finally {
        $("map-file").value = "";
      }
    };
    const updateCursor = (event) => {
      if (!this.active) return;
      this.raycaster.setFromCamera(
        new THREE.Vector2(
          (event.clientX / innerWidth) * 2 - 1,
          1 - (event.clientY / innerHeight) * 2,
        ),
        this.camera,
      );
      const hit = this.raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Vector3(),
      );
      if (!hit) {
        this.point = null;
        this.guide.visible = false;
        return;
      }
      const snap = Number($("map-snap").value);
      this.point = hit.set(
        Math.round(hit.x / snap) * snap,
        0,
        Math.round(hit.z / snap) * snap,
      );
      if (this.tool !== "select" && this.tool !== "spawn") {
        const config = MAP_TYPES[this.tool];
        this.guide.box.setFromCenterAndSize(
          this.point.clone().setY(config.height / 2),
          new THREE.Vector3(config.width, config.height, config.depth),
        );
        this.guide.visible = true;
      } else if (this.tool === "spawn") {
        this.marker.position.copy(this.point).setY(0.07);
        this.guide.visible = false;
      }
    };
    this.canvas.addEventListener("pointermove", updateCursor);
    this.canvas.addEventListener("pointerdown", (event) => {
      updateCursor(event);
      if (!this.active || event.button !== 0 || !this.point) return;
      if (this.tool === "select") {
        const hits = this.raycaster.intersectObjects(
          this.view.group.children,
          true,
        );
        this.selected = null;
        for (const hit of hits) {
          let root = hit.object;
          while (root && !root.userData.mapObjectId) root = root.parent;
          if (root) {
            this.selected = root.userData.mapObjectId;
            break;
          }
        }
        this.render();
        return;
      }
      if (this.tool === "spawn")
        this.change(() => {
          const hit = this.view.collision.raycast(this.raycaster.ray, 250);
          const snap = Number($("map-snap").value),
            point = hit?.point || this.point;
          this.document.spawn = {
            x: Math.round(point.x / snap) * snap,
            y: Math.max(0, point.y),
            z: Math.round(point.z / snap) * snap,
            yaw: 0,
          };
        });
      else
        this.change(() => {
          const object = createMapObject(this.tool, this.point.x, this.point.z);
          this.document.objects.push(object);
          this.selected = object.id;
        });
    });
    window.addEventListener("keydown", (event) => {
      if (
        !this.active ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        event.shiftKey ? this.redo() : this.undo();
      }
      if (event.code === "Delete") {
        event.preventDefault();
        this.remove();
      }
    });
  }
  current() {
    return this.document.objects.find((object) => object.id === this.selected);
  }
  status(message, error = false) {
    $("map-status").textContent = message;
    $("map-status").classList.toggle("error", error);
  }
  library() {
    try {
      return JSON.parse(localStorage.getItem(libraryKey) || "[]").map(
        validateMap,
      );
    } catch {
      return [];
    }
  }
  refreshLibrary() {
    const library = this.library();
    $("map-library").replaceChildren(
      ...library.map((map) => new Option(map.name, map.id)),
    );
    if (!library.length)
      $("map-library").add(new Option("Sin mapas guardados", ""));
  }
  change(action) {
    const before = structuredClone(this.document),
      selection = this.selected;
    try {
      action();
      this.document = validateMap(this.document);
      this.history.push(before);
      this.history = this.history.slice(-50);
      this.future = [];
      this.rebuild();
      this.render();
      this.persist();
    } catch (error) {
      this.document = before;
      this.selected = selection;
      this.render();
      this.status(error.message, true);
    }
  }
  persist() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(this.document));
      this.status("Borrador guardado automáticamente.");
    } catch {
      this.status("No se pudo guardar el borrador. Usa Exportar JSON.", true);
    }
  }
  rebuild() {
    this.view = this.hooks.preview(this.document);
  }
  remove() {
    if (this.selected)
      this.change(() => {
        this.document.objects = this.document.objects.filter(
          (object) => object.id !== this.selected,
        );
        this.selected = null;
      });
  }
  undo() {
    if (!this.history.length) return;
    this.future.push(structuredClone(this.document));
    this.document = this.history.pop();
    this.selected = null;
    this.rebuild();
    this.render();
    this.persist();
  }
  redo() {
    if (!this.future.length) return;
    this.history.push(structuredClone(this.document));
    this.document = this.future.pop();
    this.selected = null;
    this.rebuild();
    this.render();
    this.persist();
  }
  open() {
    if (this.active) return;
    this.active = true;
    this.hooks.open();
    this.panel.hidden = false;
    document.body.classList.add("editing");
    this.rebuild();
    this.render();
  }
  close() {
    this.active = false;
    this.panel.hidden = true;
    document.body.classList.remove("editing");
    this.guide.visible = this.marker.visible = false;
    $("maps-toggle").setAttribute("aria-expanded", "false");
  }
  play() {
    try {
      this.hooks.play(validateMap(this.document));
      this.close();
      this.hooks.start();
    } catch (error) {
      this.status(error.message, true);
    }
  }
  render() {
    $("map-name").value = this.document.name;
    $("map-weather").value = this.document.weather;
    $("map-count").textContent = `${this.document.objects.length} / 100`;
    $("map-objects").replaceChildren(
      ...this.document.objects.map(
        (object, index) =>
          new Option(
            `${index + 1} · ${MAP_TYPES[object.type].label} (${object.x}, ${object.z})`,
            object.id,
          ),
      ),
    );
    $("map-objects").value = this.selected || "";
    this.panel
      .querySelectorAll("[data-tool]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.tool === this.tool),
        ),
      );
    $("editor-help").textContent =
      this.tool === "select"
        ? "Selecciona un objeto. Botón derecho: orbitar. Botón central: desplazar."
        : this.tool === "spawn"
          ? "Haz clic en una superficie libre para colocar el inicio del robot."
          : "Haz clic en el suelo para colocar. Ajusta posición, tamaño y rotación abajo.";
    const object = this.current();
    $("object-properties").hidden = !object;
    if (object) {
      $("object-type").textContent = MAP_TYPES[object.type].label;
      for (const key of ["x", "y", "z", "width", "height", "depth"])
        $("object-" + key).value = object[key];
      $("object-rotation").value = String(object.rotation);
    }
    $("map-undo").disabled = !this.history.length;
    $("map-redo").disabled = !this.future.length;
    this.marker.visible = this.active;
    this.marker.position.set(
      this.document.spawn.x,
      this.document.spawn.y + 0.07,
      this.document.spawn.z,
    );
    if (this.active && this.view && object) {
      this.guide.box.setFromObject(this.view.roots.get(object.id));
      this.guide.visible = true;
    } else this.guide.visible = false;
  }
}
