# Arch System PG

Juego educativo tipo puzzle: construye la arquitectura de un sistema con bloques (servidores, balanceadores, cachés, bases de datos…) y comprueba con una simulación de tráfico si aguanta.

## Desarrollo

```bash
npm install
npm run dev        # servidor local con recarga
npm test           # tests del motor
npm run build      # typecheck + build en dist/

npm run levels:report   # cómo se comporta la solución de referencia de cada nivel web
npm run levels:solve    # busca soluciones más baratas que el par (útil al diseñar niveles)
npm run levels:can      # lo mismo para los niveles CANopen
```

Requiere Node 20.19 o superior (lo pide Vite 7). Con fnm, `.node-version` elige la versión sola.

## Mundos

El juego se organiza en **mundos**, cada uno con sus propios bloques, su simulación y sus niveles.
La pantalla de inicio elige mundo; dentro, cada capítulo es un camino de niveles.

### 🌐 Sistemas web

20 niveles en 6 capítulos:

| Capítulo | Niveles | Qué se aprende |
|---|---|---|
| Fundamentos | 1–4 | Servidor, balanceador, escalado horizontal y vertical, redundancia N+1 |
| Datos | 5–8 | Base de datos, caché (cache-aside), réplicas de lectura, escrituras |
| Global | 9–10 | CDN: latencia por distancia y descarga de los servidores |
| Asíncrono | 11–13 | Colas y workers para trabajo pesado |
| Resiliencia | 14–16 | Caída de servidores, de la caché (estampida) y de workers |
| Casos reales | 17–20 | Tienda online, red social, Black Friday, plataforma de vídeo |

### 🏭 Automatización industrial

| Capítulo | Niveles | Qué se aprende |
|---|---|---|
| CANopen | 1–5 | Terminación de 120 Ω, velocidad frente a longitud, orden del cableado, prioridad por node-ID (COB-ID), dividir en dos buses |

El modelo CANopen (`src/worlds/canopen/`):

- **Topología.** El bus es una línea: cada equipo tiene dos conectores y cada extremo lleva un terminador. No se permiten estrellas ni anillos.
- **Planta a escala.** Los equipos están en posiciones fijas en metros; el cable va por bandeja (distancia horizontal + vertical) y cuesta 1 €/m.
- **Velocidad y longitud.** 1 Mbit/s → 25 m, 500 kbit/s → 100 m, 250 kbit/s → 250 m… (CiA). Se elige tocando el PLC.
- **Tiempo de bus.** Cada PDO ocupa una trama de 47 + 8·n bits más el relleno de bits en el peor caso. La carga del bus no puede pasar del 70 %.
- **Prioridad.** COB-ID = base del PDO (0x180 para el TPDO1…) + node-ID; el más bajo gana el arbitraje. El peor tiempo de respuesta de cada mensaje se calcula con el análisis clásico de CAN (Tindell) y se compara con su plazo.

### ⛓️ Web3 (próximamente)

## Estructura

```
src/
  engine/          Lógica pura, sin DOM. Se puede testear y reutilizar en un backend.
    types.ts       Tipos del dominio: bloques, puertos, grafo, niveles.
    catalog.ts     Ficha de cada bloque: capacidad, latencia, coste y puertos.
    graph.ts       Operaciones sobre el grafo: conectar, borrar, resolver puertos.
    simulate.ts    Simulación de tráfico: éxito, latencia, saturación y problemas.
    scoring.ts     Solución de referencia, par y estrellas.
  levels/          Niveles web: un archivo por capítulo, con helpers para escribir conexiones.
  worlds/          Contrato común de los mundos y sus adaptadores.
    types.ts       Interfaz World: grafo, paleta, simulación, escena del tablero, ajustes.
    web.ts         Mundo web: adapta engine/ y levels/ al contrato.
    canopen/       Mundo industrial: modelo, motor (cableado + análisis de tiempos), niveles y buscador.
    index.ts       Lista de mundos y búsqueda de un nivel por id.
  ui/              Todo lo visual, sin saber de qué mundo se trata.
    board.ts       Tablero en canvas: dibuja la escena que le da el mundo, partículas y entrada.
    layout.ts      Posiciones de los bloques (independientes de la orientación).
    map.ts         Mundos, capítulos y camino de niveles.
    panels.ts      Enunciado, paleta, panel de ajustes, resultado y avisos.
    storage.ts     Mejores estrellas en localStorage.
  main.ts          Controlador y navegación (#/, #/mundo/ID/N, #/nivel/ID).
tests/             Tests del motor y de todos los niveles (node:test).
scripts/           Herramientas de diseño de niveles: informe y buscador de soluciones.
docs/              Diseño: dominios y protocolos industriales (PROFINET, PROFIBUS, CANopen).
```

## Conceptos

**Puertos.** Cada bloque declara sus salidas en `catalog.ts`. Un servidor tiene salida
*principal* (continua), *respaldo* (discontinua naranja), *escrituras* (verde) y *cola* (punteada
morada). El papel de cada conexión se deduce de sus destinos, así que da igual el orden en que se
conecten: con caché, réplica y base de datos, la caché es la principal, la réplica el respaldo y la
base de datos recibe las escrituras.

**Simulación.** Reparte flujos (peticiones/s) por el grafo. Cada bloque responde o devuelve un fallo
(saturación, fallo de caché, callejón sin salida). El servidor reintenta lo que falla por su respaldo;
si no tiene, la petición se pierde y el problema se atribuye a ese servidor. El tráfico de cada nivel
puede tener contenido estático (CDN), distancia a los usuarios, escrituras y trabajos pesados (cola).

**Escenarios de caída.** Si el nivel exige aguantar la caída de un tipo de bloque, se vuelve a simular
quitando cada bloque de ese tipo, uno a uno. En esos escenarios solo se exige no perder peticiones.

**Puntuación.** Cada nivel incluye una solución de referencia. Su coste es el *par*.
La simulación decide si se pasa el nivel; las estrellas comparan el coste:

- ⭐ cumple los requisitos
- ⭐⭐ coste ≤ 125 % del par
- ⭐⭐⭐ coste ≤ par

Los tests comprueban que la solución de referencia de cada nivel consigue 3 estrellas y que el
buscador no encuentra una solución más barata.

## Añadir un nivel

1. Web: añadirlo al capítulo que toque en `src/levels/`. CANopen: en `src/worlds/canopen/levels.ts`. Siempre con enunciado, paleta y solución de referencia.
2. `npm run levels:report` / `levels:solve` (web) o `levels:can` (CANopen) para ajustar las cifras.
3. `npm test`.

## Añadir un mundo

Implementar la interfaz `World` de `src/worlds/types.ts` (crear el grafo, conectar, simular, describir el resultado
y la escena del tablero) y añadirlo a `WORLDS` en `src/worlds/index.ts`. La interfaz no necesita cambios.
