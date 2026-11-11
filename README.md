# Arch System PG

Juego educativo tipo puzzle: construye la arquitectura de un sistema con bloques (servidores, balanceadores, cachés, bases de datos…) y comprueba con una simulación de tráfico si aguanta.

## Desarrollo

```bash
npm install
npm run dev        # servidor local con recarga
npm test           # tests del motor
npm run build      # typecheck + build en dist/

npm run levels:report   # cómo se comporta la solución de referencia de cada nivel
npm run levels:solve    # busca soluciones más baratas que el par (útil al diseñar niveles)
```

## Niveles

20 niveles en 6 capítulos:

| Capítulo | Niveles | Qué se aprende |
|---|---|---|
| Fundamentos | 1–4 | Servidor, balanceador, escalado horizontal y vertical, redundancia N+1 |
| Datos | 5–8 | Base de datos, caché (cache-aside), réplicas de lectura, escrituras |
| Global | 9–10 | CDN: latencia por distancia y descarga de los servidores |
| Asíncrono | 11–13 | Colas y workers para trabajo pesado |
| Resiliencia | 14–16 | Caída de servidores, de la caché (estampida) y de workers |
| Casos reales | 17–20 | Tienda online, red social, Black Friday, plataforma de vídeo |

## Estructura

```
src/
  engine/          Lógica pura, sin DOM. Se puede testear y reutilizar en un backend.
    types.ts       Tipos del dominio: bloques, puertos, grafo, niveles.
    catalog.ts     Ficha de cada bloque: capacidad, latencia, coste y puertos.
    graph.ts       Operaciones sobre el grafo: conectar, borrar, resolver puertos.
    simulate.ts    Simulación de tráfico: éxito, latencia, saturación y problemas.
    scoring.ts     Solución de referencia, par y estrellas.
  levels/          Un archivo por capítulo, con helpers para escribir conexiones.
  ui/              Todo lo visual.
    board.ts       Tablero en canvas: dibujo, partículas y entrada táctil/ratón.
    layout.ts      Posiciones de los bloques (independientes de la orientación).
    panels.ts      Enunciado, paleta, pestañas de nivel, resultado y avisos.
    storage.ts     Mejores estrellas en localStorage.
  main.ts          Controlador: une estado, motor y UI.
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

1. Añadirlo al capítulo que toque en `src/levels/` con enunciado, tráfico, requisitos, paleta y solución de referencia.
2. `npm run levels:report` y `npm run levels:solve` para ajustar las cifras.
3. `npm test`.
