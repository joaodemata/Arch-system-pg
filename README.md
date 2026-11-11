# Arch System PG

Juego educativo tipo puzzle: construye la arquitectura de un sistema con bloques (servidores, balanceadores, cachés, bases de datos…) y comprueba con una simulación de tráfico si aguanta.

## Desarrollo

```bash
npm install
npm run dev        # servidor local con recarga
npm test           # tests del motor
npm run build      # typecheck + build en dist/
```

## Estructura

```
src/
  engine/          Lógica pura, sin DOM. Se puede testear y reutilizar en un backend.
    types.ts       Tipos del dominio: bloques, puertos, grafo, niveles.
    catalog.ts     Ficha de cada bloque: capacidad, latencia, coste y puertos.
    graph.ts       Operaciones sobre el grafo: conectar, borrar, resolver puertos.
    simulate.ts    Simulación de tráfico: éxito, latencia, saturación y problemas.
    scoring.ts     Solución de referencia, par y estrellas.
  levels/          Un archivo por nivel.
  ui/              Todo lo visual.
    board.ts       Tablero en canvas: dibujo, partículas y entrada táctil/ratón.
    layout.ts      Posiciones de los bloques (independientes de la orientación).
    panels.ts      Enunciado, paleta, pestañas de nivel, resultado y avisos.
    storage.ts     Mejores estrellas en localStorage.
  main.ts          Controlador: une estado, motor y UI.
tests/             Tests del motor (node:test).
```

## Conceptos

**Puertos.** Cada bloque declara sus salidas en `catalog.ts`. El servidor tiene una salida
*principal* (línea continua) y otra de *respaldo* (línea discontinua naranja). El papel de cada
conexión se deduce de sus destinos: si un servidor está conectado a una caché y a la base de datos,
la caché es la principal y la base de datos el respaldo.

**Simulación.** Reparte flujos (peticiones/s) por el grafo. Cada bloque responde o devuelve un fallo
(saturación, fallo de caché, callejón sin salida). El servidor reintenta lo que falla por su respaldo;
si no tiene, la petición se pierde y el problema se atribuye a ese servidor.

**Puntuación.** Cada nivel incluye una solución de referencia. Su coste es el *par*.
La simulación decide si se pasa el nivel; las estrellas comparan el coste:

- ⭐ cumple los requisitos
- ⭐⭐ coste ≤ 125 % del par
- ⭐⭐⭐ coste ≤ par

Los tests comprueban que la solución de referencia de cada nivel consigue 3 estrellas.

## Añadir un nivel

1. Crear `src/levels/level-XX.ts` con enunciado, requisitos, paleta y solución de referencia.
2. Añadirlo a `src/levels/index.ts`.
3. `npm test`.
