# RIFT — Robotics field lab

Prototipo 3D jugable en el navegador, con diseños industriales originales inspirados en el género de extracción y robots de ARC Raiders. Explora un distrito industrial destruido con edificios, rampas, terrazas, una pasarela elevada, humo y fuego. Las superficies tienen colisión y las patas se adaptan a sus alturas. No utiliza modelos, texturas ni animaciones del juego original.

## Ejecutar

Requiere Node.js 20.19+ o 22.12+ y un navegador con WebGL2. El entorno preparado usa Node.js 24.

```sh
cd rift-lab
npm ci
npm run dev
```

Después de descomprimir `rift-lab.zip`, ejecuta esos comandos y abre la dirección que imprime Vite. Si descargaste el código con **Code → Download ZIP**, entra en la carpeta del repositorio en lugar de `rift-lab`. En el entorno de nube el checkout está en `/workspace/procedural-test` y puedes usar `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`. Para generar la versión estática: `npm run build`. El directorio `dist/` puede publicarse en un alojamiento de archivos estáticos. Los recursos y las fuentes se sirven localmente; no requiere claves ni servicios externos durante el juego.

## Jugar y experimentar

- **Pilotar unidad / Enter:** alternar patrulla automática y control manual.
- **WASD o flechas:** mover respecto a la cámara. **Shift:** correr.
- **1 / 2 / 3:** seleccionar Strider, Mantis o Wasp. También puedes usar la barra compacta inferior.
- **Q / E en Wasp:** ascender / descender. El dron respeta suelos, techos y paredes y puede volar hasta 42 metros de altura.
- **Clic izquierdo o F:** disparar hacia el cursor. Tres impactos destruyen un dron.
- **Espacio:** pulso EMP de 22 metros, con cinco segundos de recarga.
- **Arrastrar:** orbitar. Al pilotar, usa el botón derecho. **Rueda:** zoom.
- **P:** pausar. **Escape:** salir del pilotaje. **R / Reiniciar:** restaurar el campo y la unidad.
- **I / Ajustes:** abrir el menú de configuración a la derecha. El panel izquierdo se eliminó para dejar libre el escenario.
- En pantallas pequeñas aparecen controles táctiles de movimiento, disparo y EMP, y botones **Subir / Bajar** al pilotar el dron.

**Strider** tiene cuatro patas con pares diagonales. **Mantis** tiene seis patas con grupos de trípode alternados. **Wasp** usa rotores, flotación e inclinación calculadas a partir de su velocidad y vuelo vertical. Las patas fijan sus apoyos en coordenadas del mundo, consultan la altura real de las superficies, generan trayectorias suaves y resuelven cada rodilla con IK analítica de dos segmentos. El chasis se inclina en pendientes y los apoyos se acercan al cuerpo en los bordes estrechos. No hay clips de animación pregrabados.

## Explorar las ruinas

Desde el punto de inicio, sigue las marcas amarillas hacia la rampa de la fábrica (X 0 / Z −8). Sube al primer piso de **7 metros**. En esa terraza, la segunda rampa se toma por el lado derecho (X 13 / Z −33) y conduce al mirador de **14 metros**. La pasarela al este conecta con otro edificio. El almacén (X 32 / Z 0) tiene una terraza de **4 metros** y su propia rampa de acceso desde Z 21.

Puedes bajar por las rampas o dejarte caer desde un borde; la gravedad lleva a los caminantes hasta la siguiente superficie. El dron puede explorar los pisos altos y sobrevolar los edificios. El indicador de altitud distingue superficie, caída y vuelo. Las paredes, columnas, losas y contenedores bloquean el movimiento; los disparos también impactan en la arquitectura, permitiendo utilizarla como cobertura. La cámara evita atravesar estructuras y recupera su distancia cuando se despeja la vista.

El panel permite cambiar velocidad, longitud y altura de paso; desactivar IK para comparar el resultado; visualizar articulaciones; cambiar atmósfera y activar drones hostiles. Telemetría muestra velocidad, apoyos y pasos. La cuadrícula y el audio se activan desde los botones de la escena. Pulsa el contador FPS para alternar calidad ligera, equilibrada y alta; `?quality=low` inicia directamente en modo ligero.

## Validar

```sh
npm test
npm run build
npm run test:browser
```

Las pruebas de navegador arrancan su propio servidor temporal en el puerto 5174 y usan Chromium instalado en `/usr/bin/chromium` (puede cambiarse con `CHROMIUM_PATH`). Verifican movimiento y apoyos, subida y bajada por rampas, vuelo vertical, pausa, ajustes, tres unidades, combate, EMP, reinicio y controles móviles. Las pruebas de física comprueban paredes, pendientes, caídas, techos y proyectiles bloqueados por cobertura. Se guardan capturas en `test-results/`.

## Estructura y alcance

- `src/kinematics.js`: IK, trayectorias de pies y utilidades deterministas.
- `src/robots.js`: modelos geométricos y locomoción procedural.
- `src/world.js`: distrito destruido, rampas y plataformas, iluminación, humo y atmósferas.
- `src/collision.js`: colisión, superficies inclinadas, gravedad, vuelo y consultas de proyectiles con una cuadrícula espacial.
- `src/combat.js`: drones, proyectiles, impactos, integridad, EMP y audio.
- `src/main.js`: entrada, cámara, interfaz y simulación.

Sandbox de un jugador. La arquitectura principal usa colisionadores de cajas y prismas de rampas; los escombros rotados usan cajas aproximadas y las varillas finas son decorativas. Los enemigos evitan atravesar edificios, pero aún no planifican rutas complejas. El objetivo es explorar y probar las unidades. No requiere GPU dedicada, pero la aceleración gráfica mejora el rendimiento; el modo ligero desactiva sombras y reduce resolución.
