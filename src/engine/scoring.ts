import { connect, createLevelGraph, monthlyCost } from './graph';
import type { SimulationResult } from './simulate';
import type { Graph, Level } from './types';

export type Stars = 0 | 1 | 2 | 3;

/** Con 2 estrellas se permite gastar hasta un 25 % más que la solución de referencia. */
export const TWO_STAR_COST_MARGIN = 1.25;

/** Construye la solución de referencia del nivel con las mismas reglas que usa el jugador. */
export function buildReferenceGraph(level: Level): Graph {
  let graph = createLevelGraph(level);
  for (const [id, type] of Object.entries(level.reference.blocks)) {
    graph = { ...graph, nodes: [...graph.nodes, { id, type }] };
  }
  for (const [from, to] of level.reference.links) {
    const result = connect(graph, from, to);
    if (!result.ok) throw new Error(`Solución de referencia inválida en el nivel ${level.id}: ${result.error}`);
    graph = result.graph;
  }
  return graph;
}

/** El "par" del nivel: lo que cuesta la solución de referencia. */
export function parCost(level: Level): number {
  return monthlyCost(buildReferenceGraph(level));
}

export function scoreResult(result: SimulationResult, par: number): Stars {
  if (!result.meetsRequirements) return 0;
  if (result.monthlyCost <= par) return 3;
  if (result.monthlyCost <= par * TWO_STAR_COST_MARGIN) return 2;
  return 1;
}
