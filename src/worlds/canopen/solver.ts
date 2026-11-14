import type { AnyGraph } from '../types';
import { canCost, connectCan, createCanGraph, setConfig, simulateCan } from './engine';
import { BITRATES, CAN_BLOCKS, type CanDevice, type CanLevel, type PlantPoint } from './model';

/** Construye la solución de referencia con las mismas reglas que usa el jugador. */
export function buildCanReference(level: CanLevel): AnyGraph {
  let graph = createCanGraph(level);
  for (const [id, type] of Object.entries(level.reference.blocks)) {
    const node = { id, type, config: CAN_BLOCKS[type].master ? { kbps: level.defaultKbps } : undefined };
    graph = { ...graph, nodes: [...graph.nodes, node] };
  }
  for (const [a, b] of level.reference.links) {
    const result = connectCan(graph, a, b);
    if (!result.ok) throw new Error(`Referencia inválida en ${level.id}: ${result.error}`);
    graph = result.graph;
  }
  for (const [id, config] of Object.entries(level.reference.config ?? {})) {
    for (const [key, value] of Object.entries(config)) graph = setConfig(graph, id, key, value);
  }
  return graph;
}

export function canParCost(level: CanLevel): number {
  return canCost(level, buildCanReference(level));
}

const distance = (a: PlantPoint, b: PlantPoint) => Math.max(1, Math.abs(a.x - b.x) + Math.abs(a.y - b.y));

/** Camino más corto que pasa por todos los puntos (el maestro puede quedar en medio). Held-Karp. */
function shortestChain(points: PlantPoint[]): { length: number; order: number[] } {
  const n = points.length;
  if (n === 1) return { length: 0, order: [0] };
  const full = (1 << n) - 1;
  const best: number[][] = Array.from({ length: 1 << n }, () => Array(n).fill(Infinity));
  const prev: number[][] = Array.from({ length: 1 << n }, () => Array(n).fill(-1));
  for (let i = 0; i < n; i++) best[1 << i][i] = 0;
  for (let mask = 1; mask <= full; mask++) {
    for (let last = 0; last < n; last++) {
      const cost = best[mask][last];
      if (!(mask & (1 << last)) || cost === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const m = mask | (1 << next);
        const c = cost + distance(points[last], points[next]);
        if (c < best[m][next]) {
          best[m][next] = c;
          prev[m][next] = last;
        }
      }
    }
  }
  let end = 0;
  for (let i = 1; i < n; i++) if (best[full][i] < best[full][end]) end = i;
  const order: number[] = [];
  for (let mask = full, at = end; at !== -1; ) {
    order.unshift(at);
    const p = prev[mask][at];
    mask &= ~(1 << at);
    at = p;
  }
  return { length: best[full][end], order };
}

export interface CanSolution {
  cost: number;
  graph: AnyGraph;
}

/**
 * Busca la solución más barata que cumpla el nivel: reparte los equipos entre las
 * interfaces disponibles, cablea cada bus por el camino más corto y prueba las
 * velocidades con node-IDs por plazo (el más urgente, el ID más bajo).
 * Solo explora soluciones más baratas que `limit`.
 */
export function cheapestCan(level: CanLevel, limit = Infinity): CanSolution | null {
  const masters = (level.palette.can2 ?? 0) > 0 ? ['plc', 'can2'] : ['plc'];
  const devices = level.devices;
  const candidates: { cost: number; buses: { master: string; devices: CanDevice[]; order: number[] }[] }[] = [];

  for (let split = 0; split < masters.length ** devices.length; split++) {
    const groups = masters.map(() => [] as CanDevice[]);
    devices.forEach((d, i) => groups[Math.floor(split / masters.length ** i) % masters.length].push(d));
    if (masters.length > 1 && groups[1].length === 0) continue;
    let cost = groups[1]?.length ? CAN_BLOCKS.can2.cost : 0;
    const buses = groups.map((group, i) => {
      const chain = shortestChain([level.plc.at, ...group.map((d) => d.at)]);
      cost += chain.length + (group.length ? 2 * CAN_BLOCKS.term.cost : 0);
      return { master: masters[i], devices: group, order: chain.order };
    });
    if (cost < limit) candidates.push({ cost, buses });
  }
  candidates.sort((a, b) => a.cost - b.cost);

  for (const candidate of candidates) {
    for (const kbpsCombo of combos(candidate.buses.length)) {
      const graph = wire(level, candidate.buses, kbpsCombo);
      if (graph && simulateCan(level, graph).meetsRequirements) return { cost: canCost(level, graph), graph };
    }
  }
  return null;
}

function* combos(n: number): Generator<number[]> {
  const rates = BITRATES.map((b) => b.kbps);
  if (n === 1) for (const r of rates) yield [r];
  else for (const r of rates) for (const s of rates) yield [r, s];
}

function wire(level: CanLevel, buses: { master: string; devices: CanDevice[]; order: number[] }[], kbps: number[]): AnyGraph | null {
  let graph = createCanGraph(level);
  let terms = 0;
  const add = (id: string, type: string, config?: Record<string, number>) => {
    graph = { ...graph, nodes: [...graph.nodes, { id, type, config }] };
  };
  const link = (a: string, b: string) => {
    const r = connectCan(graph, a, b);
    if (!r.ok) return false;
    graph = r.graph;
    return true;
  };

  for (const [i, bus] of buses.entries()) {
    if (bus.devices.length === 0) continue;
    if (bus.master === 'can2') add('can2', 'can2', { kbps: kbps[i] });
    else graph = setConfig(graph, 'plc', 'kbps', kbps[i]);
    const keys = [bus.master, ...bus.devices.map((d) => d.key)];
    const chain = bus.order.map((j) => keys[j]);
    const [t1, t2] = [`t${++terms}`, `t${++terms}`];
    add(t1, 'term');
    add(t2, 'term');
    if (!link(t1, chain[0])) return null;
    for (let j = 1; j < chain.length; j++) if (!link(chain[j - 1], chain[j])) return null;
    if (!link(chain[chain.length - 1], t2)) return null;

    // Node-IDs por plazo: el equipo con el mensaje más urgente se queda el ID más bajo.
    const urgency = (d: CanDevice) => Math.min(...d.messages.map((m) => m.deadlineMs ?? m.periodMs));
    [...bus.devices].sort((a, b) => urgency(a) - urgency(b)).forEach((d, k) => (graph = setConfig(graph, d.key, 'nodeId', k + 1)));
  }
  return graph;
}
