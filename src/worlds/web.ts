import { BLOCKS } from '../engine/catalog';
import { addNode, connect, countPlaced, createLevelGraph, displayName, edgeRoles, removeEdge, removeNode } from '../engine/graph';
import { parCost } from '../engine/scoring';
import { simulate, type SimulationResult } from '../engine/simulate';
import type { BlockType, Graph, Level, PortRole } from '../engine/types';
import { CHAPTERS } from '../levels';
import { initialPositions, placeNew } from '../ui/layout';
import { BOARD_COLOR, statusFromUtilization } from './scene-colors';
import type { AnyGraph, GameResult, Scene, SceneEdge, SceneNode, World } from './types';

const ROLE_STYLE: Record<PortRole, { color: string; dash: number[]; label: string | null; text: string }> = {
  primary: { color: BOARD_COLOR.primary, dash: [], label: null, text: '#c7d0ff' },
  fallback: { color: BOARD_COLOR.fallback, dash: [7, 5], label: 'si falla', text: '#ffd2a6' },
  write: { color: BOARD_COLOR.write, dash: [], label: 'escrituras', text: '#bdf5dd' },
  async: { color: BOARD_COLOR.async, dash: [2, 5], label: 'a la cola', text: '#ead5ff' },
};

// El grafo genérico tiene la misma forma que el del motor web; solo cambia el tipo de `type`.
const asGraph = (graph: AnyGraph) => graph as Graph;

function requirementChips(level: Level): string[] {
  const { traffic, requirements } = level;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const chips = [`🚦 ${traffic.rps} peticiones/s`];
  if (traffic.originDistanceMs) chips.push(`🌐 usuarios a ${traffic.originDistanceMs} ms`);
  if (traffic.staticShare) chips.push(`🖼️ ${pct(traffic.staticShare)} estático`);
  if (traffic.writeShare) chips.push(`✍️ ${pct(traffic.writeShare)} escrituras`);
  if (traffic.heavyWork) chips.push(`⏳ ${pct(traffic.heavyWork.share)}: ${traffic.heavyWork.label} (×${traffic.heavyWork.factor})`);
  chips.push(`✅ ≥ ${pct(requirements.minSuccessRate)} respondidas`, `⏱ ≤ ${requirements.maxAvgLatencyMs} ms de media`);
  if (requirements.survive?.length) {
    const names = [...new Set(requirements.survive.map((t) => BLOCKS[t].label.toLowerCase().replace(' xl', '')))];
    chips.push(`🛡️ aguanta la caída de cualquier ${names.join(' o ')}`);
  }
  chips.push(`💰 par: ${parCost(level)} €/mes`);
  return chips;
}

function report(level: Level, result: SimulationResult): GameResult {
  const { minSuccessRate, maxAvgLatencyMs } = level.requirements;
  const par = parCost(level);
  const metrics = [
    { value: `${(result.successRate * 100).toFixed(1)} %`, label: 'respondidas', good: result.successRate >= minSuccessRate },
    { value: `${Math.round(result.avgLatencyMs)} ms`, label: 'latencia media', good: result.avgLatencyMs <= maxAvgLatencyMs },
    { value: `${result.monthlyCost} €`, label: 'coste/mes', good: result.monthlyCost <= par },
  ];
  if (result.jobSuccessRate !== null) {
    metrics.push({ value: `${(result.jobSuccessRate * 100).toFixed(1)} %`, label: 'trabajos hechos', good: result.jobSuccessRate >= minSuccessRate });
  }
  const details = result.scenarios.length
    ? {
        title: 'Pruebas de caída:',
        lines: result.scenarios.map((s) => ({
          ok: s.passed,
          text: `Si cae ${s.failedNode}: ${(s.successRate * 100).toFixed(1)} % respondidas${s.jobSuccessRate === null ? '' : `, ${(s.jobSuccessRate * 100).toFixed(1)} % trabajos`}`,
        })),
      }
    : null;
  return {
    meetsRequirements: result.meetsRequirements,
    cost: result.monthlyCost,
    metrics,
    details,
    problems: result.problems.map((p) => `${p.message}${p.lostRps > 0 ? ` <em>(−${Math.round(p.lostRps)}/s)</em>` : ''}`),
  };
}

function scene(level: Level, anyGraph: AnyGraph, result: SimulationResult | null): Scene {
  const graph = asGraph(anyGraph);
  const roles = edgeRoles(graph);
  const hasWrites = (level.traffic.writeShare ?? 0) > 0;

  const edges: SceneEdge[] = graph.edges.map((edge) => {
    const role = roles.get(edge.id) ?? 'primary';
    const style = ROLE_STYLE[role];
    const flow = result ? (result.edgeFlow[edge.id] ?? 0) : null;
    let color = style.color;
    if (role === 'primary' && flow === null) color = BOARD_COLOR.primaryIdle;
    if (flow === 0) color = BOARD_COLOR.inactive;

    let label: SceneEdge['label'] = null;
    if (flow !== null && flow > 0) {
      label = { text: `${Math.round(flow)}/s`, color: style.text, at: 0.5 };
    } else if (flow === null) {
      const writesHere = hasWrites && role === 'fallback' && graph.nodes.find((n) => n.id === edge.to)?.type === 'db';
      const text = writesHere ? 'si falla + escrituras' : style.label;
      if (text) label = { text, color: style.text, at: 0.3 };
    }
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      color,
      dash: style.dash,
      arrow: true,
      label,
      handle: flow === null,
      particles: flow ? { rate: flow * 0.045, color: role === 'primary' ? BOARD_COLOR.request : style.color } : null,
    };
  });

  const nodes: SceneNode[] = graph.nodes.map((node) => {
    const spec = BLOCKS[node.type];
    const stats = result?.nodes[node.id];
    const capacityText = Number.isFinite(spec.capacity) ? `${spec.capacity}${spec.unit ? ' tr' : ''}/s` : '';
    let subtitle = node.type === 'users' ? `${level.traffic.rps}/s` : `máx ${capacityText}`;
    if (stats && node.type !== 'users') subtitle = `${Math.round(stats.load)} / ${capacityText}`;
    const active = stats && (stats.load > 0 || stats.lostRps > 0);
    return {
      id: node.id,
      icon: spec.icon,
      title: displayName(graph, node),
      subtitle,
      status: !active ? 'idle' : stats.lostRps > 0 ? 'bad' : statusFromUtilization(stats.utilization),
      bar: stats && stats.load > 0 && Number.isFinite(spec.capacity) ? stats.utilization : null,
      deletable: !node.fixed,
      draggable: true,
      lossRate: stats && stats.lostRps > 0 ? 3 + stats.lostRps * 0.12 : 0,
    };
  });

  return { nodes, edges, emptyHint: graph.nodes.some((n) => !n.fixed) ? null : 'Añade bloques desde abajo ↓' };
}

export const webWorld: World<Level, SimulationResult> = {
  id: 'web',
  name: 'Sistemas web',
  icon: '🌐',
  summary: 'Servidores, cachés, CDN y colas bajo tráfico HTTP',
  color: '#6c8cff',
  costUnit: '€/mes',
  chapters: CHAPTERS,
  legend: `<span><i class="line solid"></i> petición</span>
    <span><i class="line dashed"></i> respaldo si falla</span>
    <span><i class="line write"></i> escrituras</span>
    <span><i class="line async"></i> a la cola</span>
    <span class="hint">Toca dos bloques para conectarlos · arrastra para mover · toca ● para borrar una flecha</span>`,

  inspectorHint: null,

  createGraph: (level) => createLevelGraph(level),
  connect(_level, graph, a, b) {
    const result = connect(asGraph(graph), a, b);
    return result.ok ? { ok: true, graph: result.graph } : result;
  },
  addNode(_level, graph, type) {
    const result = addNode(asGraph(graph), type as BlockType);
    return { graph: result.graph, id: result.node.id };
  },
  removeNode: (graph, id) => removeNode(asGraph(graph), id),
  removeEdge: (graph, id) => removeEdge(asGraph(graph), id),

  palette(level, graph) {
    return (Object.keys(level.palette) as BlockType[]).map((type) => {
      const spec = BLOCKS[type];
      const hit = spec.hitRate ? ` · ${spec.hitRate * 100} % aciertos` : '';
      const latency = spec.latencyMs ? ` · ${spec.latencyMs} ms` : '';
      return {
        type,
        title: `${spec.icon} ${spec.label}`,
        detail: `${spec.capacity} ${spec.unit ?? 'pet./s'}${latency} · ${spec.costPerMonth} €/mes${hit}`,
        left: (level.palette[type] ?? 0) - countPlaced(asGraph(graph), type),
      };
    });
  },
  chips: requirementChips,
  initialPositions: (_level, graph) => initialPositions(asGraph(graph)),
  placeNew: (_level, positions, type) => placeNew(positions, type as BlockType),

  par: parCost,
  simulate: (level, graph) => simulate(level, asGraph(graph)),
  report,
  scene,
  inspector: () => null,
};
