import { BLOCKS } from './catalog';
import { displayName, getNode, monthlyCost, resolvePorts, type ResolvedPorts } from './graph';
import type { Graph, GraphEdge, GraphNode, Level } from './types';

/*
 * Simulación en régimen estable: en vez de simular petición a petición, reparte
 * flujos (peticiones/segundo) por el grafo.
 *
 * Cada petición sigue un recorrido de ida y vuelta. Un bloque puede responderla
 * (éxito) o devolver un fallo a quien se la envió. El servidor es quien decide
 * qué hacer con un fallo: si tiene ruta de respaldo, reintenta por ella; si no,
 * la petición se pierde.
 *
 * Como la saturación de un bloque depende de la carga total que recibe, y esa carga
 * depende de las saturaciones de los bloques anteriores, se repiten pasadas hasta
 * que las cargas dejan de cambiar.
 */

export type FailureKind = 'overload' | 'dead-end' | 'miss' | 'unhandled-miss';

interface Failure {
  kind: FailureKind;
  /** Bloque responsable: donde se produjo o donde no se supo gestionar. */
  nodeId: string;
  flow: number;
  /** Latencia acumulada hasta el fallo, para seguir sumando si se reintenta. */
  latencyMs: number;
}

interface Outcome {
  okFlow: number;
  /** Suma de flujo × latencia de las peticiones con éxito (para la media ponderada). */
  okLatencySum: number;
  failures: Failure[];
}

export interface NodeStats {
  load: number;
  capacity: number;
  utilization: number;
  latencyMs: number;
  lostRps: number;
}

export interface Problem {
  message: string;
  lostRps: number;
}

export interface SimulationResult {
  successRate: number;
  avgLatencyMs: number;
  monthlyCost: number;
  meetsRequirements: boolean;
  nodes: Record<string, NodeStats>;
  edgeFlow: Record<string, number>;
  /** Problemas ordenados de más a menos grave. */
  problems: Problem[];
}

const MAX_PASSES = 20;
const EPSILON = 1e-9;

/** La latencia apenas sube hasta ~70 % de uso y se dispara cerca del 100 % (hasta ×4). */
export function latencyUnderLoad(baseMs: number, utilization: number): number {
  return baseMs * (1 + 3 * Math.min(utilization, 1) ** 3);
}

export function simulate(level: Level, graph: Graph): SimulationResult {
  let loads = new Map<string, number>();
  let pass = runPass(level, graph, loads);
  for (let i = 1; i < MAX_PASSES && !sameLoads(loads, pass.loads); i++) {
    loads = pass.loads;
    pass = runPass(level, graph, loads);
  }
  return summarize(level, graph, pass);
}

interface Pass {
  loads: Map<string, number>;
  edgeFlow: Map<string, number>;
  outcome: Outcome;
  nodeLatency: (id: string) => number;
}

/** Una pasada: envía el tráfico usando las cargas de la pasada anterior para calcular saturaciones. */
function runPass(level: Level, graph: Graph, previousLoads: Map<string, number>): Pass {
  const loads = new Map<string, number>();
  const edgeFlow = new Map<string, number>();

  const utilization = (id: string) => (previousLoads.get(id) ?? 0) / BLOCKS[getNode(graph, id).type].capacity;
  const nodeLatency = (id: string) => latencyUnderLoad(BLOCKS[getNode(graph, id).type].latencyMs, utilization(id));

  function send(node: GraphNode, flow: number, latencyIn: number): Outcome {
    addTo(loads, node.id, flow);
    const outcome = emptyOutcome();
    const latency = latencyIn + nodeLatency(node.id);

    // Si el bloque está saturado, solo atiende la parte que le cabe.
    const u = utilization(node.id);
    const served = u > 1 ? flow / u : flow;
    if (flow - served > EPSILON) fail(outcome, 'overload', node.id, flow - served, latency);
    if (served <= EPSILON) return outcome;

    const ports = resolvePorts(graph, node.id);
    switch (node.type) {
      case 'users':
      case 'lb':
        merge(outcome, distribute(node, ports.primary, served, latency));
        break;
      case 'server':
        merge(outcome, handleAtServer(node, ports, served, latency));
        break;
      case 'cache': {
        const hits = served * (BLOCKS.cache.hitRate ?? 0);
        succeed(outcome, hits, latency);
        fail(outcome, 'miss', node.id, served - hits, latency);
        break;
      }
      case 'db':
        succeed(outcome, served, latency);
        break;
    }
    return outcome;
  }

  function forward(edge: GraphEdge, flow: number, latency: number): Outcome {
    addTo(edgeFlow, edge.id, flow);
    return send(getNode(graph, edge.to), flow, latency);
  }

  /** Reparte a partes iguales entre las salidas (usuarios y balanceador). */
  function distribute(node: GraphNode, targets: GraphEdge[], flow: number, latency: number): Outcome {
    const outcome = emptyOutcome();
    if (targets.length === 0) {
      fail(outcome, 'dead-end', node.id, flow, latency);
      return outcome;
    }
    for (const edge of targets) merge(outcome, forward(edge, flow / targets.length, latency));
    return outcome;
  }

  function handleAtServer(node: GraphNode, ports: ResolvedPorts, flow: number, latency: number): Outcome {
    const outcome = emptyOutcome();
    if (!level.requiresData) {
      succeed(outcome, flow, latency);
      return outcome;
    }

    const [primary] = ports.primary;
    if (!primary) {
      fail(outcome, 'dead-end', node.id, flow, latency);
      return outcome;
    }

    const result = forward(primary, flow, latency);
    outcome.okFlow += result.okFlow;
    outcome.okLatencySum += result.okLatencySum;

    // Lo que falla en el camino principal se reintenta por el respaldo, si existe.
    const [fallback] = ports.fallback;
    for (const failure of result.failures) {
      if (fallback) {
        merge(outcome, forward(fallback, failure.flow, failure.latencyMs));
      } else if (failure.kind === 'miss') {
        // El fallo de caché es normal; el problema es que este servidor no sabe qué hacer con él.
        outcome.failures.push({ ...failure, kind: 'unhandled-miss', nodeId: node.id });
      } else {
        outcome.failures.push(failure);
      }
    }
    return outcome;
  }

  const users = graph.nodes.find((n) => n.type === 'users');
  if (!users) throw new Error('El nivel no tiene bloque de usuarios');
  const outcome = send(users, level.trafficRps, 0);
  return { loads, edgeFlow, outcome, nodeLatency };
}

function summarize(level: Level, graph: Graph, pass: Pass): SimulationResult {
  const { okFlow, okLatencySum, failures } = pass.outcome;
  const { minSuccessRate, maxAvgLatencyMs } = level.requirements;
  const successRate = okFlow / level.trafficRps;
  const avgLatencyMs = okFlow > 0 ? okLatencySum / okFlow : 0;

  const nodes: Record<string, NodeStats> = {};
  for (const node of graph.nodes) {
    const capacity = BLOCKS[node.type].capacity;
    const load = pass.loads.get(node.id) ?? 0;
    nodes[node.id] = {
      load,
      capacity,
      utilization: Number.isFinite(capacity) ? load / capacity : 0,
      latencyMs: pass.nodeLatency(node.id),
      lostRps: failures.filter((f) => f.nodeId === node.id).reduce((sum, f) => sum + f.flow, 0),
    };
  }

  const problems = groupFailures(graph, failures, nodes);
  if (okFlow > 0 && avgLatencyMs > maxAvgLatencyMs) {
    problems.push({
      message: `La latencia media (${Math.round(avgLatencyMs)} ms) supera el límite de ${maxAvgLatencyMs} ms.`,
      lostRps: 0,
    });
  }

  return {
    successRate,
    avgLatencyMs,
    monthlyCost: monthlyCost(graph),
    meetsRequirements: successRate >= minSuccessRate - EPSILON && avgLatencyMs <= maxAvgLatencyMs,
    nodes,
    edgeFlow: Object.fromEntries(pass.edgeFlow),
    problems,
  };
}

function groupFailures(graph: Graph, failures: Failure[], stats: Record<string, NodeStats>): Problem[] {
  const groups = new Map<string, { kind: FailureKind; nodeId: string; lostRps: number }>();
  for (const f of failures) {
    if (f.flow <= EPSILON) continue;
    const key = `${f.kind}:${f.nodeId}`;
    const group = groups.get(key) ?? { kind: f.kind, nodeId: f.nodeId, lostRps: 0 };
    group.lostRps += f.flow;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ message: describeFailure(graph, g.kind, getNode(graph, g.nodeId), stats[g.nodeId]), lostRps: g.lostRps }))
    .sort((a, b) => b.lostRps - a.lostRps);
}

function describeFailure(graph: Graph, kind: FailureKind, node: GraphNode, stats: NodeStats): string {
  const name = displayName(graph, node);
  const spec = BLOCKS[node.type];
  switch (kind) {
    case 'overload':
      return `${name} ${spec.feminine ? 'saturada' : 'saturado'}: recibe ${Math.round(stats.load)}/s y aguanta ${spec.capacity}/s.`;
    case 'dead-end':
      if (node.type === 'users') return 'Los usuarios no están conectados a nada.';
      if (node.type === 'lb') return `${name} no tiene servidores detrás.`;
      return `${name} no tiene de dónde sacar los datos: conéctalo a la caché o a la base de datos.`;
    case 'unhandled-miss':
      return `${name} no tiene ruta de respaldo: cuando la caché no tiene el dato, la petición se pierde.`;
    case 'miss':
      return `${name}: fallos sin gestionar.`;
  }
}

function emptyOutcome(): Outcome {
  return { okFlow: 0, okLatencySum: 0, failures: [] };
}

function succeed(outcome: Outcome, flow: number, latency: number): void {
  outcome.okFlow += flow;
  outcome.okLatencySum += flow * latency;
}

function fail(outcome: Outcome, kind: FailureKind, nodeId: string, flow: number, latencyMs: number): void {
  outcome.failures.push({ kind, nodeId, flow, latencyMs });
}

function merge(into: Outcome, other: Outcome): void {
  into.okFlow += other.okFlow;
  into.okLatencySum += other.okLatencySum;
  into.failures.push(...other.failures);
}

function addTo(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function sameLoads(a: Map<string, number>, b: Map<string, number>): boolean {
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys].every((k) => Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)) < 1e-6);
}
