/**
 * Buscador de soluciones baratas para diseñar niveles.
 *
 * Prueba todas las combinaciones de bloques de la paleta con un cableado "canónico"
 * (el razonable: CDN → balanceador → servidores → caché/réplica/base de datos/cola)
 * y avisa si alguna cumple los requisitos por menos que la solución de referencia.
 * No es exhaustivo en el cableado, pero detecta niveles que se resuelven sin aprender nada.
 *
 * Uso: npx tsx scripts/solver.ts [id-de-nivel]
 */
import { connect, createLevelGraph, monthlyCost } from '../src/engine/graph';
import { parCost } from '../src/engine/scoring';
import { simulate } from '../src/engine/simulate';
import type { BlockType, Graph, Level } from '../src/engine/types';
import { LEVELS } from '../src/levels';

type Counts = Partial<Record<BlockType, number>>;

function* combinations(palette: Counts): Generator<Counts> {
  const types = Object.keys(palette) as BlockType[];
  const counts: Counts = {};
  function* step(i: number): Generator<Counts> {
    if (i === types.length) return yield { ...counts };
    for (let n = 0; n <= (palette[types[i]] ?? 0); n++) {
      counts[types[i]] = n;
      yield* step(i + 1);
    }
  }
  yield* step(0);
}

function canonicalGraph(level: Level, counts: Counts): Graph | null {
  let graph = createLevelGraph(level);
  const add = (type: BlockType) => {
    const ids = Array.from({ length: counts[type] ?? 0 }, (_, i) => `${type}${i + 1}`);
    graph = { ...graph, nodes: [...graph.nodes, ...ids.map((id) => ({ id, type }))] };
    return ids;
  };
  const link = (a: string, b: string) => {
    const r = connect(graph, a, b);
    if (!r.ok) throw new Error(r.error);
    graph = r.graph;
  };

  const [cdn] = add('cdn');
  const [lb] = add('lb');
  const servers = [...add('server'), ...add('bigserver')];
  const [cache] = add('cache');
  const replicas = add('replica');
  const [queue] = add('queue');
  const workers = add('worker');

  if (servers.length === 0 || (servers.length > 1 && !lb) || (lb && servers.length === 0)) return null;
  try {
    let entry = 'users';
    if (cdn) (link(entry, cdn), (entry = cdn));
    if (lb) (link(entry, lb), (entry = lb));
    servers.forEach((s, i) => {
      link(entry, s);
      if (level.requiresData) {
        if (cache) link(s, cache);
        if (replicas.length) link(s, replicas[i % replicas.length]);
        link(s, 'db');
      }
      if (queue) link(s, queue);
    });
    if (queue) workers.forEach((w) => link(queue, w));
  } catch {
    return null;
  }
  return graph;
}

/** La solución canónica más barata que cumple los requisitos, o null si no hay. */
export function cheapestCanonical(level: Level): { cost: number; counts: Counts } | null {
  let best: { cost: number; counts: Counts } | null = null;
  for (const counts of combinations(level.palette)) {
    const graph = canonicalGraph(level, counts);
    if (!graph) continue;
    const cost = monthlyCost(graph);
    if (best && cost >= best.cost) continue;
    if (simulate(level, graph).meetsRequirements) best = { cost, counts };
  }
  return best;
}

const isCli = process.argv[1]?.includes('solver');
const only = process.argv[2];
for (const level of isCli ? LEVELS.filter((l) => !only || l.id === only) : []) {
  const par = parCost(level);
  const best = cheapestCanonical(level);
  const describe = (c: Counts) => Object.entries(c).filter(([, n]) => n).map(([t, n]) => `${n}×${t}`).join(' ');
  const verdict = !best ? '❓ sin solución canónica' : best.cost < par ? '⚠️  MÁS BARATA QUE EL PAR' : '✅';
  console.log(`${level.id} par ${par} € · mejor encontrada ${best ? `${best.cost} € (${describe(best.counts)})` : '—'} ${verdict}`);
}
