import { BLOCKS, canFeed } from './catalog';
import type { BlockType, Graph, GraphEdge, GraphNode, Level, PortRole } from './types';

// Todas las funciones son puras: reciben un grafo y devuelven uno nuevo.

export function createLevelGraph(level: Level): Graph {
  return {
    nodes: level.fixed.map(({ key, type }) => ({ id: key, type, fixed: true })),
    edges: [],
  };
}

export function getNode(graph: Graph, id: string): GraphNode {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`Nodo desconocido: ${id}`);
  return node;
}

export function outgoing(graph: Graph, id: string): GraphEdge[] {
  return graph.edges.filter((e) => e.from === id);
}

export interface ResolvedPorts {
  primary: GraphEdge[];
  fallback: GraphEdge[];
  write: GraphEdge[];
  async: GraphEdge[];
  /** Conexiones que no caben en ningún puerto (no deberían existir en un grafo válido). */
  unassigned: GraphEdge[];
}

/**
 * Decide qué papel juega cada conexión saliente de un bloque.
 * El papel no se guarda en la conexión: se deduce de los destinos, así da igual
 * en qué orden conecte las cosas el jugador. Ejemplo: un servidor conectado a una
 * caché y a una base de datos usa la caché como principal y la base de datos como respaldo.
 */
export function resolvePorts(graph: Graph, nodeId: string): ResolvedPorts {
  const node = getNode(graph, nodeId);
  const resolved: ResolvedPorts = { primary: [], fallback: [], write: [], async: [], unassigned: [] };
  let remaining = outgoing(graph, nodeId);

  for (const port of BLOCKS[node.type].ports) {
    const preference = (e: GraphEdge) => port.accepts.indexOf(getNode(graph, e.to).type);
    const taken = remaining
      .filter((e) => preference(e) >= 0)
      .sort((a, b) => preference(a) - preference(b))
      .slice(0, port.max);
    resolved[port.role].push(...taken);
    remaining = remaining.filter((e) => !taken.includes(e));
  }

  resolved.unassigned = remaining;
  return resolved;
}

export function edgeRoles(graph: Graph): Map<string, PortRole> {
  const roles = new Map<string, PortRole>();
  for (const node of graph.nodes) {
    const ports = resolvePorts(graph, node.id);
    for (const role of ['primary', 'fallback', 'write', 'async'] as const) {
      ports[role].forEach((e) => roles.set(e.id, role));
    }
  }
  return roles;
}

export type ConnectResult =
  | { ok: true; graph: Graph; edge: GraphEdge }
  | { ok: false; error: string };

/**
 * Conecta dos bloques. La dirección se deduce sola: tocar "base de datos" y luego
 * "servidor" crea servidor → base de datos.
 */
export function connect(graph: Graph, aId: string, bId: string): ConnectResult {
  if (aId === bId) return { ok: false, error: 'Un bloque no puede conectarse consigo mismo.' };

  const a = getNode(graph, aId);
  const b = getNode(graph, bId);
  const direction = canFeed(a.type, b.type) ? [a, b] : canFeed(b.type, a.type) ? [b, a] : null;
  if (!direction) {
    return { ok: false, error: `${BLOCKS[a.type].label} y ${BLOCKS[b.type].label} no se pueden conectar.` };
  }

  const [from, to] = direction;
  if (graph.edges.some((e) => e.from === from.id && e.to === to.id)) {
    return { ok: false, error: 'Esos bloques ya están conectados.' };
  }

  const edge: GraphEdge = { id: `${from.id}->${to.id}`, from: from.id, to: to.id };
  const next: Graph = { ...graph, edges: [...graph.edges, edge] };
  if (resolvePorts(next, from.id).unassigned.includes(edge)) {
    const error = BLOCKS[from.type].fullMessage ?? `${displayName(graph, from)} no admite más conexiones de ese tipo.`;
    return { ok: false, error };
  }
  return { ok: true, graph: next, edge };
}

export function addNode(graph: Graph, type: BlockType): { graph: Graph; node: GraphNode } {
  const ids = new Set(graph.nodes.map((n) => n.id));
  let n = 1;
  while (ids.has(`${type}-${n}`)) n++;
  const node: GraphNode = { id: `${type}-${n}`, type };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, node };
}

export function removeNode(graph: Graph, id: string): Graph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function removeEdge(graph: Graph, id: string): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

/** Bloques de un tipo colocados por el jugador (sin contar los fijos del nivel). */
export function countPlaced(graph: Graph, type: BlockType): number {
  return graph.nodes.filter((n) => n.type === type && !n.fixed).length;
}

/** Nombre visible: "Servidor 2" si hay varios del mismo tipo, "Caché" si solo hay uno. */
export function displayName(graph: Graph, node: GraphNode): string {
  const sameType = graph.nodes.filter((n) => n.type === node.type);
  const label = BLOCKS[node.type].label;
  return sameType.length > 1 ? `${label} ${sameType.indexOf(node) + 1}` : label;
}

export function monthlyCost(graph: Graph): number {
  return graph.nodes
    .filter((n) => !n.fixed)
    .reduce((sum, n) => sum + BLOCKS[n.type].costPerMonth, 0);
}
