import { BLOCKS } from './catalog';
import { displayName, getNode, monthlyCost, removeNode, resolvePorts, type ResolvedPorts } from './graph';
import type { Graph, GraphEdge, GraphNode, Level } from './types';

/*
 * Simulación en régimen estable: en vez de simular petición a petición, reparte
 * flujos (peticiones/segundo) por el grafo.
 *
 * Cada petición hace un recorrido de ida y vuelta. Un bloque puede responderla
 * (éxito) o devolver un fallo a quien se la envió. El servidor es quien decide
 * qué hacer con un fallo: si tiene ruta de respaldo, reintenta por ella; si no,
 * la petición se pierde.
 *
 * Los trabajos pesados que van a una cola se contabilizan aparte: no suman
 * latencia a la respuesta, pero tienen que completarse.
 *
 * Como la saturación de un bloque depende de la carga total que recibe, y esa carga
 * depende de las saturaciones de los bloques anteriores, se repiten pasadas hasta
 * que las cargas dejan de cambiar.
 */

export type FailureKind = 'overload' | 'dead-end' | 'miss' | 'unhandled-miss' | 'no-write-path';

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
  /** Suma de flujo × latencia de lo que tuvo éxito (para la media ponderada). */
  okLatencySum: number;
  failures: Failure[];
}

export interface NodeStats {
  /** Carga en unidades de trabajo (una petición pesada hecha en el servidor cuenta más). */
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

/** Qué pasa si cae un bloque concreto. */
export interface FailureScenario {
  failedNode: string;
  successRate: number;
  jobSuccessRate: number | null;
  passed: boolean;
  problems: Problem[];
}

export interface SimulationResult {
  successRate: number;
  avgLatencyMs: number;
  /** Fracción de trabajos pesados completados; null si el nivel no tiene. */
  jobSuccessRate: number | null;
  monthlyCost: number;
  meetsRequirements: boolean;
  nodes: Record<string, NodeStats>;
  edgeFlow: Record<string, number>;
  /** Problemas ordenados de más a menos grave, incluidos los de los escenarios de caída. */
  problems: Problem[];
  scenarios: FailureScenario[];
}

const MAX_PASSES = 30;
const EPSILON = 1e-9;

/** La latencia apenas sube hasta ~70 % de uso y se dispara cerca del 100 % (hasta ×4). */
export function latencyUnderLoad(baseMs: number, utilization: number): number {
  return baseMs * (1 + 3 * Math.min(utilization, 1) ** 3);
}

export function simulate(level: Level, graph: Graph): SimulationResult {
  // Los nombres se fijan con el grafo completo para que "Servidor 2" siga siendo
  // el mismo bloque en los escenarios en los que cae otro.
  const names = new Map(graph.nodes.map((n) => [n.id, displayName(graph, n)]));
  const normal = steadyState(level, graph, names);
  const scenarios = failureScenarios(level, graph, names);

  const scenarioProblems = scenarios
    .filter((s) => !s.passed)
    .map((s) => ({
      message: `Si cae ${s.failedNode}: ${s.problems[0]?.message ?? 'se pierden peticiones.'}`,
      lostRps: (1 - s.successRate) * level.traffic.rps,
    }));

  return {
    ...normal,
    problems: [...normal.problems, ...scenarioProblems],
    scenarios,
    meetsRequirements: normal.meetsRequirements && scenarios.every((s) => s.passed),
  };
}

/** Quita, uno a uno, cada bloque de los tipos que el nivel exige soportar. */
function failureScenarios(level: Level, graph: Graph, names: Map<string, string>): FailureScenario[] {
  const types = level.requirements.survive ?? [];
  return graph.nodes
    .filter((n) => !n.fixed && types.includes(n.type))
    .map((node) => {
      const result = steadyState(level, removeNode(graph, node.id), names);
      const min = level.requirements.minSuccessRate - EPSILON;
      return {
        failedNode: names.get(node.id) ?? node.id,
        successRate: result.successRate,
        jobSuccessRate: result.jobSuccessRate,
        // En modo degradado solo se exige que no se pierdan peticiones ni trabajos.
        passed: result.successRate >= min && (result.jobSuccessRate ?? 1) >= min,
        problems: result.problems,
      };
    });
}

type SteadyState = Omit<SimulationResult, 'scenarios'>;

function steadyState(level: Level, graph: Graph, names: Map<string, string>): SteadyState {
  let loads = new Map<string, number>();
  let pass = runPass(level, graph, loads);
  for (let i = 1; i < MAX_PASSES && !sameLoads(loads, pass.loads); i++) {
    loads = pass.loads;
    pass = runPass(level, graph, loads);
  }
  return summarize(level, graph, pass, names);
}

interface Pass {
  loads: Map<string, number>;
  edgeFlow: Map<string, number>;
  requests: Outcome;
  jobs: Outcome;
  /** Trabajos pesados generados por peticiones que llegaron a responderse. */
  jobsCreated: number;
  nodeLatency: (id: string) => number;
}

/** Una pasada: envía el tráfico usando las cargas de la pasada anterior para calcular saturaciones. */
function runPass(level: Level, graph: Graph, previousLoads: Map<string, number>): Pass {
  const { traffic } = level;
  const loads = new Map<string, number>();
  const edgeFlow = new Map<string, number>();
  const jobs = emptyOutcome();
  let jobsCreated = 0;

  const typeOf = (id: string) => getNode(graph, id).type;
  const behaviorOf = (id: string) => BLOCKS[typeOf(id)].behavior;
  const ports = (id: string) => resolvePorts(graph, id);

  /**
   * Cuánto trabajo supone cada petición para el bloque. Un servidor que hace él mismo
   * las tareas pesadas (sin cola) gasta más capacidad y tarda más en responder.
   */
  const workPerRequest = (id: string) => {
    const heavy = traffic.heavyWork;
    if (!heavy || behaviorOf(id) !== 'server' || ports(id).async.length > 0) return 1;
    return 1 + heavy.share * (heavy.factor - 1);
  };
  const utilization = (id: string) => (previousLoads.get(id) ?? 0) / BLOCKS[typeOf(id)].capacity;
  const nodeLatency = (id: string) =>
    latencyUnderLoad(BLOCKS[typeOf(id)].latencyMs * workPerRequest(id), utilization(id));

  function send(node: GraphNode, flow: number, latencyIn: number): Outcome {
    addTo(loads, node.id, flow * workPerRequest(node.id));
    const outcome = emptyOutcome();
    const latency = latencyIn + nodeLatency(node.id);

    // Si el bloque está saturado, solo atiende la parte que le cabe.
    const u = utilization(node.id);
    const served = u > 1 ? flow / u : flow;
    if (flow - served > EPSILON) fail(outcome, 'overload', node.id, flow - served, latency);
    if (served <= EPSILON) return outcome;

    const spec = BLOCKS[node.type];
    switch (spec.behavior) {
      case 'source':
      case 'balancer':
      case 'queue':
        merge(outcome, distribute(node, ports(node.id).primary, served, latency));
        break;
      case 'edge-cache': {
        // La CDN solo puede servir contenido estático; el resto va al origen.
        const hits = served * (traffic.staticShare ?? 0) * (spec.hitRate ?? 0);
        succeed(outcome, hits, latency);
        merge(outcome, distribute(node, ports(node.id).primary, served - hits, latency));
        break;
      }
      case 'server':
        merge(outcome, atServer(node, served, latency));
        break;
      case 'cache': {
        const hits = served * (spec.hitRate ?? 0);
        succeed(outcome, hits, latency);
        fail(outcome, 'miss', node.id, served - hits, latency);
        break;
      }
      case 'store':
      case 'worker':
        succeed(outcome, served, latency);
        break;
    }
    return outcome;
  }

  function forward(edge: GraphEdge, flow: number, latency: number): Outcome {
    addTo(edgeFlow, edge.id, flow);
    return send(getNode(graph, edge.to), flow, latency);
  }

  /** Reparte a partes iguales entre las salidas. */
  function distribute(node: GraphNode, targets: GraphEdge[], flow: number, latency: number): Outcome {
    const outcome = emptyOutcome();
    if (flow <= EPSILON) return outcome;
    if (targets.length === 0) {
      fail(outcome, 'dead-end', node.id, flow, latency);
      return outcome;
    }
    for (const edge of targets) {
      // Salir de la "red de los usuarios" hacia tus servidores cuesta la distancia hasta ellos.
      const leavesEdge = ['source', 'edge-cache'].includes(behaviorOf(node.id)) && behaviorOf(edge.to) !== 'edge-cache';
      const extra = leavesEdge ? (traffic.originDistanceMs ?? 0) : 0;
      merge(outcome, forward(edge, flow / targets.length, latency + extra));
    }
    return outcome;
  }

  function atServer(node: GraphNode, flow: number, latency: number): Outcome {
    const p = ports(node.id);
    const outcome = level.requiresData ? fetchData(node, p, flow, latency) : succeeded(flow, latency);

    // Trabajos pesados: a la cola si hay; si no, ya los hizo el propio servidor.
    const heavy = traffic.heavyWork;
    if (heavy) {
      const jobFlow = outcome.okFlow * heavy.share;
      jobsCreated += jobFlow;
      const [queue] = p.async;
      if (queue) merge(jobs, forward(queue, jobFlow, 0));
      else succeed(jobs, jobFlow, 0);
    }
    return outcome;
  }

  function fetchData(node: GraphNode, p: ResolvedPorts, flow: number, latency: number): Outcome {
    const outcome = emptyOutcome();

    // Escrituras: siempre a la base de datos principal, por la conexión que sea.
    const writes = flow * (traffic.writeShare ?? 0);
    if (writes > EPSILON) {
      const toDb = [...p.primary, ...p.fallback, ...p.write].find((e) => typeOf(e.to) === 'db');
      if (toDb) merge(outcome, forward(toDb, writes, latency));
      else fail(outcome, 'no-write-path', node.id, writes, latency);
    }

    // Lecturas: camino principal y, lo que falle, por el respaldo.
    const reads = flow - writes;
    const [primary] = p.primary;
    if (!primary) {
      fail(outcome, 'dead-end', node.id, reads, latency);
      return outcome;
    }
    const result = forward(primary, reads, latency);
    outcome.okFlow += result.okFlow;
    outcome.okLatencySum += result.okLatencySum;

    const [fallback] = p.fallback;
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
  const requests = send(users, traffic.rps, 0);
  return { loads, edgeFlow, requests, jobs, jobsCreated, nodeLatency };
}

function summarize(level: Level, graph: Graph, pass: Pass, names: Map<string, string>): SteadyState {
  const { okFlow, okLatencySum } = pass.requests;
  const { minSuccessRate, maxAvgLatencyMs } = level.requirements;
  const heavy = level.traffic.heavyWork;
  const successRate = okFlow / level.traffic.rps;
  const avgLatencyMs = okFlow > 0 ? okLatencySum / okFlow : 0;
  // Los trabajos se miden sobre los que se generaron: una petición perdida ya cuenta en `successRate`.
  const jobSuccessRate = heavy ? (pass.jobsCreated > EPSILON ? pass.jobs.okFlow / pass.jobsCreated : 0) : null;
  const failures = [...pass.requests.failures, ...pass.jobs.failures];

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

  const problems = groupFailures(graph, failures, nodes, names);
  if (okFlow > 0 && avgLatencyMs > maxAvgLatencyMs) {
    problems.push({
      message: `La latencia media (${Math.round(avgLatencyMs)} ms) supera el límite de ${maxAvgLatencyMs} ms.`,
      lostRps: 0,
    });
  }

  const min = minSuccessRate - EPSILON;
  return {
    successRate,
    avgLatencyMs,
    jobSuccessRate,
    monthlyCost: monthlyCost(graph),
    meetsRequirements: successRate >= min && (jobSuccessRate ?? 1) >= min && avgLatencyMs <= maxAvgLatencyMs,
    nodes,
    edgeFlow: Object.fromEntries(pass.edgeFlow),
    problems,
  };
}

function groupFailures(
  graph: Graph,
  failures: Failure[],
  stats: Record<string, NodeStats>,
  names: Map<string, string>,
): Problem[] {
  const groups = new Map<string, { kind: FailureKind; nodeId: string; lostRps: number }>();
  for (const f of failures) {
    if (f.flow <= EPSILON) continue;
    const key = `${f.kind}:${f.nodeId}`;
    const group = groups.get(key) ?? { kind: f.kind, nodeId: f.nodeId, lostRps: 0 };
    group.lostRps += f.flow;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({
      message: describeFailure(g.kind, getNode(graph, g.nodeId), stats[g.nodeId], names.get(g.nodeId) ?? g.nodeId),
      lostRps: g.lostRps,
    }))
    .sort((a, b) => b.lostRps - a.lostRps);
}

function describeFailure(kind: FailureKind, node: GraphNode, stats: NodeStats, name: string): string {
  const spec = BLOCKS[node.type];
  switch (kind) {
    case 'overload': {
      const unit = spec.unit ?? '/s';
      const tail = spec.behavior === 'worker' ? ' Los trabajos se acumulan en la cola sin parar.' : '';
      return `${name} ${spec.feminine ? 'saturada' : 'saturado'}: recibe ${Math.round(stats.load)} ${unit} y aguanta ${spec.capacity}.${tail}`;
    }
    case 'dead-end':
      switch (spec.behavior) {
        case 'source':
          return 'Los usuarios no están conectados a nada.';
        case 'balancer':
          return `${name} no tiene servidores detrás.`;
        case 'edge-cache':
          return `${name} no tiene origen: lo que no tiene en caché no puede pedirlo a nadie.`;
        case 'queue':
          return `${name} no tiene workers: nadie procesa los trabajos.`;
        default:
          return `${name} no tiene de dónde leer los datos.`;
      }
    case 'unhandled-miss':
      return `${name} no tiene ruta de respaldo: cuando la caché no tiene el dato, la petición se pierde.`;
    case 'no-write-path':
      return `${name} no puede guardar datos: las escrituras tienen que llegar a la base de datos principal.`;
    case 'miss':
      return `${name}: fallos sin gestionar.`;
  }
}

function emptyOutcome(): Outcome {
  return { okFlow: 0, okLatencySum: 0, failures: [] };
}

function succeeded(flow: number, latency: number): Outcome {
  const outcome = emptyOutcome();
  succeed(outcome, flow, latency);
  return outcome;
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
