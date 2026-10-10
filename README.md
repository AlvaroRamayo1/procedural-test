# RIFT — Robotics field lab

Prototipo 3D jugable en el navegador, con diseños industriales originales inspirados en el género de extracción y robots de ARC Raiders. Un sandbox de locomoción y combate sobre un terreno plano, con ruinas, polvo y tres atmósferas. No utiliza modelos, texturas ni animaciones del juego original.

## Ejecutar

Requiere Node.js 20.19+ o 22.12+ y un navegador con WebGL2. El entorno preparado usa Node.js 24.

```sh
cd /workspace/procedural-test
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev -- --port 5173
```

Abre el puerto 5173 en el navegador con las herramientas de tu entorno, o ejecuta estos comandos localmente y abre la dirección que imprime Vite. Para generar la versión estática: `npm run build`. El directorio `dist/` puede publicarse en un alojamiento de archivos estáticos. Los recursos y las fuentes se sirven localmente; no requiere claves ni servicios externos durante el juego.

## Jugar y experimentar

- **Pilotar unidad / Enter:** alternar patrulla automática y control manual.
- **WASD o flechas:** mover respecto a la cámara. **Shift:** correr.
- **Clic izquierdo o F:** disparar hacia el cursor. Tres impactos destruyen un dron.
- **Espacio:** pulso EMP de 22 metros, con cinco segundos de recarga.
- **Arrastrar:** orbitar. Al pilotar, usa el botón derecho. **Rueda:** zoom.
- **P:** pausar. **Escape:** salir del pilotaje. **Reiniciar:** restaurar el campo y la unidad.
- En pantallas pequeñas, abre la configuración con el engranaje. Al pilotar aparecen controles táctiles de movimiento, disparo y EMP.

**Strider** tiene cuatro patas con pares diagonales. **Mantis** tiene seis patas con grupos de trípode alternados. **Wasp** usa rotores, flotación e inclinación calculadas a partir de su velocidad. Las patas fijan sus apoyos en coordenadas del mundo, generan trayectorias suaves con elevación y resuelven cada rodilla con IK analítica de dos segmentos. No hay clips de animación pregrabados.

El panel permite cambiar velocidad, longitud y altura de paso; desactivar IK para comparar el resultado; visualizar articulaciones; cambiar atmósfera y activar drones hostiles. Telemetría muestra velocidad, apoyos y pasos. La cuadrícula y el audio se activan desde los botones de la escena. Pulsa el contador FPS para alternar calidad ligera, equilibrada y alta; `?quality=low` inicia directamente en modo ligero.

## Validar

```sh
npm test
npm run build
npm run test:browser
```

Las pruebas de navegador arrancan su propio servidor temporal en el puerto 5174 y usan Chromium instalado en `/usr/bin/chromium` (puede cambiarse con `CHROMIUM_PATH`). Verifican movimiento y pasos, pausa, IK y ajustes, tres unidades, disparos que destruyen drones, EMP, reinicio, controles móviles y ausencia de errores o peticiones externas. Se guardan capturas en `test-results/`.

## Estructura y alcance

- `src/kinematics.js`: IK, trayectorias de pies y utilidades deterministas.
- `src/robots.js`: modelos geométricos y locomoción procedural.
- `src/world.js`: terreno plano, ruinas, iluminación y atmósferas.
- `src/combat.js`: drones, proyectiles, impactos, integridad, EMP y audio.
- `src/main.js`: entrada, cámara, interfaz y simulación.

Sandbox de un jugador. Las ruinas son escenografía; no hay navegación con obstáculos, inventario, extracción ni multijugador. El objetivo es probar las unidades y ampliar sus comportamientos. No requiere GPU dedicada, pero la aceleración gráfica mejora el rendimiento; el modo ligero desactiva sombras y reduce resolución.
