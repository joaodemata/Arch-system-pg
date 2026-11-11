import type { BlockType, Graph } from '../engine/types';

/**
 * Posición de un bloque en el tablero, en fracciones (0–1):
 * - `along`: a lo largo del flujo (izquierda→derecha en horizontal, arriba→abajo en vertical).
 * - `across`: perpendicular al flujo.
 * Así el mismo diseño sirve para pantallas horizontales y verticales.
 */
export interface BoardPoint {
  along: number;
  across: number;
}

export type Positions = Map<string, BoardPoint>;

/** Columna por defecto de cada tipo de bloque, siguiendo el sentido de las peticiones. */
const COLUMN: Record<BlockType, number> = {
  users: 0.08,
  lb: 0.3,
  server: 0.52,
  cache: 0.74,
  db: 0.92,
};

const ACROSS_SLOTS = [0.5, 0.17, 0.83, 0.33, 0.67, 0.08, 0.92];

/** La caché empieza a un lado para no tapar las rutas de respaldo servidor → base de datos. */
const PREFERRED_SLOTS: Partial<Record<BlockType, number[]>> = {
  cache: [0.83, 0.17, 0.67, 0.33, 0.5],
};

export function initialPositions(graph: Graph): Positions {
  return new Map(graph.nodes.map((n) => [n.id, { along: COLUMN[n.type], across: 0.5 }]));
}

/** Busca un hueco libre en la columna del tipo de bloque. */
export function placeNew(positions: Positions, type: BlockType): BoardPoint {
  const along = COLUMN[type];
  const neighbours = [...positions.values()].filter((p) => Math.abs(p.along - along) < 0.14);
  const gap = (across: number) => Math.min(1, ...neighbours.map((p) => Math.abs(p.across - across)));

  const slots = PREFERRED_SLOTS[type] ?? ACROSS_SLOTS;
  let best = slots[0];
  for (const slot of slots) {
    if (gap(slot) > 0.2) return { along, across: slot };
    if (gap(slot) > gap(best)) best = slot;
  }
  return { along, across: best };
}
