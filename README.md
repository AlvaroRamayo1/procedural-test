# RIFT — Robotics field lab

Prototipo 3D jugable en el navegador, con diseños industriales originales inspirados en el género de extracción y robots de ARC Raiders. Explora un distrito industrial destruido con fachadas abiertas, losas caídas, terrazas, una pasarela elevada, humo y fuego. Las patas evitan paredes y ajustan sus apoyos y rodillas mediante IK procedural. La calle central sigue siendo plana; los accesos elevados forman parte de las ruinas. No utiliza modelos, texturas ni animaciones del juego original.

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
- **V / botón BALAS–MISIL:** alternar fuego automático y lanzamiento de misiles con cualquiera de las tres unidades.
- **Clic izquierdo o F:** disparar hacia el cursor. Tres balas destruyen un dron. Los misiles tienen estela, explosión de área de 7 metros y recarga de 1,1 segundos; un impacto directo destruye un dron. Las paredes bloquean tanto el proyectil como el daño de la explosión.
- **Espacio:** pulso EMP de 22 metros, con cinco segundos de recarga.
- **Arrastrar:** orbitar. Al pilotar, usa el botón derecho. **Rueda:** zoom.
- **P:** pausar. **Escape:** salir del pilotaje. **R / Reiniciar:** restaurar el campo y la unidad.
- **I / Ajustes:** abrir el menú de configuración a la derecha. El panel izquierdo se eliminó para dejar libre el escenario.
- En pantallas pequeñas aparecen controles táctiles de movimiento, disparo y EMP, y botones **Subir / Bajar** al pilotar el dron.

**Strider** tiene cuatro patas con pares diagonales. **Mantis** tiene seis patas con grupos de trípode alternados. **Wasp** usa rotores, flotación e inclinación calculadas a partir de su velocidad y vuelo vertical. Las patas fijan sus apoyos en coordenadas del mundo, consultan la altura real de las superficies, generan trayectorias suaves y resuelven cada rodilla con IK analítica de dos segmentos. El chasis se inclina en pendientes y los apoyos se acercan al cuerpo en los bordes estrechos. Las articulaciones y los segmentos comprueban el grosor de la pata frente a los colisionadores. Si una rodilla invade una pared, el solver cambia su dirección de flexión; si hace falta, repliega el apoyo hacia una posición libre. Si no existe una pose libre en un rincón, el movimiento se detiene en la última posición válida. No hay clips de animación pregrabados.

## Explorar las ruinas

La calle central queda libre. Para subir a la fábrica, ve hacia el **acceso oeste** (X −19 / Z −11): una losa derrumbada junto a la fachada conduce hasta X −19 / Z −34, a **7 metros** de altura. Desde allí cruza a X −12 / Z −34, bordea el piso superior por Z −29 y llega al lado este (X 12). La losa inclinada dentro del edificio se toma desde X 11 / Z −36 y conduce al mirador de **10,5 metros**. La pasarela al este conecta con otra torre. El almacén (X 32 / Z 0) conserva su muelle elevado de **4 metros**, con acceso desde Z 21. Las oficinas al oeste (X −35,5 / Z 14) tienen un ala transitable de **4,2 metros**, accesible desde Z 35. Al sur hay un edificio de servicios con un pasaje abierto entre paredes y restos de techo.

Puedes bajar por las rampas o dejarte caer desde un borde; la gravedad lleva a los caminantes hasta la siguiente superficie. El dron puede explorar los pisos altos y sobrevolar los edificios. El indicador de altitud distingue superficie, caída y vuelo. Los edificios lejanos son decorativos. El perímetro del distrito y las barreras invisibles de cada edificio impiden acceder al fondo o aterrizar allí, incluso con el dron. La antena negra del Strider es decorativa y queda fuera de la hitbox del chasis. Las paredes, columnas, losas y contenedores bloquean el movimiento; los disparos también impactan en la arquitectura, permitiendo utilizarla como cobertura. La cámara evita atravesar estructuras y recupera su distancia cuando se despeja la vista. Los edificios todavía no se destruyen: los misiles destruyen los drones e impactan en la arquitectura. Una siguiente etapa viable es romper paneles o tramos predefinidos, actualizar sus colisionadores y generar escombros temporales; un derrumbe estructural completo exige otra simulación y más presupuesto de rendimiento.

El panel permite cambiar velocidad, longitud y altura de paso; desactivar IK para comparar el resultado; visualizar articulaciones; cambiar atmósfera y activar drones hostiles. Telemetría muestra velocidad, apoyos y pasos. La cuadrícula y el audio se activan desde los botones de la escena. Pulsa el contador FPS para alternar calidad ligera, equilibrada y alta; `?quality=low` inicia directamente en modo ligero.

## Validar

```sh
npm test
npm run build
npm run test:browser
```

Las pruebas de navegador arrancan su propio servidor temporal en el puerto 5174 y usan Chromium instalado en `/usr/bin/chromium` (puede cambiarse con `CHROMIUM_PATH`). Verifican movimiento y apoyos, subida y bajada por rampas, vuelo vertical, pausa, ajustes, tres unidades, combate, EMP, reinicio y controles móviles. Las pruebas de física comprueban paredes, pendientes, caídas, techos, patas junto a muros, exclusión de la antena, límites del fondo, misiles y daño de explosión bloqueado por cobertura. El navegador comprueba que los tres robots pueden lanzar misiles y vigila las patas durante la ruta por los edificios. Se guardan capturas en `test-results/`.

## Estructura y alcance

- `src/kinematics.js`: IK, trayectorias de pies y utilidades deterministas.
- `src/robots.js`: modelos geométricos y locomoción procedural.
- `src/leg-collision.js`: búsqueda de apoyos y poses de rodilla que evitan la arquitectura.
- `src/world.js`: distrito destruido, rampas y plataformas, iluminación, humo y atmósferas.
- `src/collision.js`: colisión, superficies inclinadas, gravedad, vuelo y consultas de proyectiles con una cuadrícula espacial.
- `src/combat.js`: drones, balas, misiles, explosiones, integridad, EMP y audio.
- `src/main.js`: entrada, cámara, interfaz y simulación.

Sandbox de un jugador. La arquitectura principal usa colisionadores de cajas y prismas de rampas; los escombros rotados usan cajas aproximadas y las varillas finas son decorativas. Los enemigos evitan atravesar edificios, pero aún no planifican rutas complejas. El objetivo es explorar y probar las unidades. No requiere GPU dedicada, pero la aceleración gráfica mejora el rendimiento; el modo ligero desactiva sombras y reduce resolución.
