import type { BoardPoint, Positions } from '../../ui/layout';
import { BOARD_COLOR } from '../scene-colors';
import type { AnyGraph, GameResult, Inspector, NodeStatus, Scene, SceneEdge, SceneNode, World } from '../types';
import {
  addCanNode,
  cableLength,
  canName,
  connectCan,
  createCanGraph,
  hex,
  removeCanEdge,
  removeCanNode,
  setConfig,
  simulateCan,
  type CanResult,
} from './engine';
import { canopenLevels } from './levels';
import { BITRATES, CABLE_COST_PER_M, CAN_BLOCKS, cobId, maxLengthFor, type CanBlockType, type CanLevel } from './model';
import { canParCost } from './solver';

const fmt = (x: number, digits = 2) => x.toLocaleString('es', { maximumFractionDigits: digits });
const pct = (x: number) => `${Math.round(x * 100)} %`;
const specOf = (graph: AnyGraph, id: string) => CAN_BLOCKS[graph.nodes.find((n) => n.id === id)!.type as CanBlockType];

/** La planta se dibuja a escala: metros → fracción del tablero. */
function toBoard(level: CanLevel, x: number, y: number): BoardPoint {
  return { along: 0.1 + (0.8 * x) / level.plant.width, across: 0.15 + (0.7 * y) / level.plant.height };
}

function initialPositions(level: CanLevel, graph: AnyGraph): Positions {
  const positions: Positions = new Map();
  for (const node of graph.nodes) {
    const at = node.type === 'plc' ? level.plc.at : level.devices.find((d) => d.key === node.id)?.at;
    if (at) positions.set(node.id, toBoard(level, at.x, at.y));
  }
  return positions;
}

function placeNew(level: CanLevel, positions: Positions, type: string): BoardPoint {
  if (type === 'can2') {
    const plc = toBoard(level, level.plc.at.x, level.plc.at.y);
    return { along: plc.along, across: plc.across > 0.5 ? plc.across - 0.22 : plc.across + 0.22 };
  }
  // Los terminadores esperan en el borde hasta que el jugador los acerca a un extremo.
  const taken = [...positions.values()];
  const slots = [0.5, 0.3, 0.7, 0.1, 0.9, 0.2, 0.8, 0.4, 0.6];
  for (const across of [0.97, 0.03]) {
    const free = slots.find((along) => taken.every((p) => Math.abs(p.along - along) > 0.08 || Math.abs(p.across - across) > 0.1));
    if (free !== undefined) return { along: free, across };
  }
  return { along: 0.5, across: 0.97 };
}

/** Un terminador conectado se dibuja pegado a su equipo, por el lado de fuera. */
function arrange(_level: CanLevel, graph: AnyGraph, positions: Positions): void {
  for (const term of graph.nodes.filter((n) => n.type === 'term')) {
    const edge = graph.edges.find((e) => e.from === term.id || e.to === term.id);
    const device = edge && positions.get(edge.from === term.id ? edge.to : edge.from);
    if (!device) continue;
    const side = device.along < 0.5 ? -1 : 1;
    positions.set(term.id, { along: device.along + side * 0.11, across: device.across });
  }
}

function report(level: CanLevel, result: CanResult): GameResult {
  const onTime = result.messages.filter((m) => m.onTime).length;
  const total = result.messages.length;
  const working = result.buses.filter((b) => !b.failure);
  const maxLoad = working.length ? Math.max(...working.map((b) => b.load)) : 0;
  const par = canParCost(level);
  return {
    meetsRequirements: result.meetsRequirements,
    cost: result.cost,
    metrics: [
      { value: `${onTime}/${total}`, label: 'mensajes a tiempo', good: onTime === total },
      { value: working.length ? pct(maxLoad) : '—', label: 'carga del bus', good: working.length > 0 && maxLoad <= level.maxBusLoad },
      { value: `${result.cost} €`, label: 'material', good: result.cost <= par },
    ],
    details: {
      title: 'Buses:',
      lines: result.buses.map((b) => ({
        ok: !b.failure && b.load <= level.maxBusLoad,
        text: `${b.master === 'plc' ? 'PLC' : 'Interfaz CAN 2'}: ${b.kbps} kbit/s · ${b.lengthM} de ${b.maxLengthM} m · carga ${pct(b.load)}`,
      })),
    },
    problems: result.problems,
  };
}

function scene(level: CanLevel, graph: AnyGraph, result: CanResult | null): Scene {
  const busOf = (id: string) => result?.buses.find((b) => b.nodes.includes(id));

  const nodes: SceneNode[] = graph.nodes.map((node) => {
    const spec = CAN_BLOCKS[node.type as CanBlockType];
    const base = { id: node.id, icon: spec.icon, title: canName(graph, node.id), deletable: !node.fixed, draggable: !spec.master && !node.fixed, lossRate: 0, bar: null };

    if (spec.terminator) {
      const plugged = graph.edges.some((e) => e.from === node.id || e.to === node.id);
      return { ...base, subtitle: '120 Ω', status: plugged && result ? 'ok' : 'idle', compact: true, draggable: !plugged };
    }
    if (spec.master) {
      const kbps = node.config?.kbps ?? level.defaultKbps;
      const bus = busOf(node.id);
      if (!bus) return { ...base, subtitle: `${kbps} kbit/s`, status: 'idle' };
      const status: NodeStatus = bus.failure || bus.load > level.maxBusLoad ? 'bad' : bus.load > level.maxBusLoad * 0.85 ? 'warn' : 'ok';
      return { ...base, subtitle: `${kbps} kbit/s · ${pct(bus.load)}`, status, bar: bus.failure ? null : bus.load, lossRate: bus.failure ? 6 : 0 };
    }

    const nodeId = node.config?.nodeId ?? 0;
    const messages = result?.messages.filter((m) => m.deviceId === node.id) ?? [];
    if (!result || messages.length === 0) return { ...base, subtitle: `node-ID ${nodeId}`, status: 'idle' };
    const late = messages.filter((m) => !m.onTime);
    const lost = messages.some((m) => m.responseMs === null);
    // El mensaje con menos margen respecto a su plazo.
    const tightest = [...messages].sort((a, b) => (b.responseMs ?? Infinity) / b.deadlineMs - (a.responseMs ?? Infinity) / a.deadlineMs)[0];
    const subtitle = lost ? `ID ${nodeId} · sin bus` : `ID ${nodeId} · ${fmt(tightest.responseMs!)}/${fmt(tightest.deadlineMs)} ms`;
    return { ...base, subtitle, status: late.length ? 'bad' : 'ok', lossRate: late.length ? 4 : 0 };
  });

  const edges: SceneEdge[] = graph.edges.map((edge) => {
    const bus = busOf(edge.from);
    const length = cableLength(level, graph, edge);
    const broken = result && (!bus || bus.failure);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      color: broken ? BOARD_COLOR.bad : result ? BOARD_COLOR.can : BOARD_COLOR.canIdle,
      dash: [],
      arrow: false,
      label: length > 0 ? { text: `${length} m`, color: '#99f6e4', at: 0.5 } : null,
      handle: !result,
      particles: result && bus && !bus.failure ? { rate: 3 + bus.load * 25, color: BOARD_COLOR.frame } : null,
    };
  });

  return { nodes, edges, emptyHint: graph.edges.length ? null : 'Añade terminadores abajo y toca dos equipos para tender un cable ↔' };
}

function inspector(level: CanLevel, graph: AnyGraph, nodeId: string): Inspector | null {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const spec = specOf(graph, nodeId);
  const name = canName(graph, nodeId);

  if (spec.terminator) {
    return {
      title: `${spec.icon} ${name}`,
      html: '<p>Resistencia de 120 Ω entre CAN_H y CAN_L. Va en los <b>dos extremos</b> del bus, y solo ahí: absorbe la señal para que no rebote.</p>',
      field: null,
    };
  }

  if (spec.master) {
    const kbps = node.config?.kbps ?? level.defaultKbps;
    return {
      title: `${spec.icon} ${name}`,
      html: `<p>Cada interfaz CAN es un bus independiente. Elige su velocidad: cuanto más rápida, menos tarda cada trama, pero más corto puede ser el cable.</p>`,
      field: {
        label: 'Velocidad del bus',
        value: kbps,
        options: BITRATES.map((b) => ({ value: b.kbps, label: `${b.kbps} kbit/s · hasta ${b.maxLengthM} m` })),
        apply: (value) => setConfig(graph, nodeId, 'kbps', value),
      },
    };
  }

  const device = level.devices.find((d) => d.key === nodeId)!;
  const id = node.config?.nodeId ?? device.nodeId;
  const rows = device.messages
    .map((m) => {
      const dir = m.pdo.startsWith('t') ? `${name} → PLC` : `PLC → ${name}`;
      return `<tr><td>${m.label}<small>${m.pdo.toUpperCase()} · ${dir}</small></td><td><code>${hex(cobId(m, id))}</code></td><td>${m.bytes} B</td><td>cada ${fmt(m.periodMs)} ms${m.deadlineMs ? `<small>plazo ${fmt(m.deadlineMs)} ms</small>` : ''}</td></tr>`;
    })
    .join('');
  const limit = device.maxKbps ? `<p class="note">⚠️ Admite como máximo ${device.maxKbps} kbit/s.</p>` : '';
  return {
    title: `${spec.icon} ${name}`,
    html: `<table class="pdo"><tr><th>Mensaje</th><th>COB-ID</th><th>Datos</th><th>Periodo</th></tr>${rows}</table>${limit}`,
    field: {
      label: 'Node-ID (prioridad: más bajo = gana el bus)',
      value: id,
      options: Array.from({ length: 32 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
      apply: (value) => setConfig(graph, nodeId, 'nodeId', value),
    },
  };
}

export const canopenWorld: World<CanLevel, CanResult> = {
  id: 'industrial',
  name: 'Automatización industrial',
  icon: '🏭',
  summary: 'Buses de campo: cableado, velocidad, carga y prioridades',
  color: '#2dd4bf',
  costUnit: '€',
  chapters: [{ name: 'CANopen', icon: '🔗', summary: 'Terminación, velocidad vs. longitud y prioridad por node-ID', color: '#2dd4bf', levels: canopenLevels }],
  legend: `<span><i class="line can"></i> cable de bus CAN (con su longitud)</span>
    <span><b class="ohm">Ω</b> terminador de 120 Ω</span>
    <span class="hint">Toca dos equipos para tender un cable · toca un equipo para ver sus mensajes y ajustes · toca ● para quitar un cable</span>`,
  inspectorHint: 'Toca un equipo para ver sus mensajes y cambiar su node-ID, o el PLC para elegir la velocidad del bus.',

  createGraph: createCanGraph,
  connect: (_level, graph, a, b) => connectCan(graph, a, b),
  addNode: addCanNode,
  removeNode: removeCanNode,
  removeEdge: removeCanEdge,

  palette(level, graph) {
    const descriptions: Record<'term' | 'can2', string> = {
      term: `${CAN_BLOCKS.term.cost} € · cierra un extremo del bus`,
      can2: `${CAN_BLOCKS.can2.cost} € · un segundo bus independiente en el PLC`,
    };
    return (Object.keys(level.palette) as ('term' | 'can2')[]).map((type) => ({
      type,
      title: `${CAN_BLOCKS[type].icon} ${CAN_BLOCKS[type].label}`,
      detail: descriptions[type],
      left: (level.palette[type] ?? 0) - graph.nodes.filter((n) => n.type === type && !n.fixed).length,
    }));
  },
  chips(level) {
    const messages = level.devices.reduce((sum, d) => sum + d.messages.length, 0);
    return [
      `🏭 ${level.plant.label}: ${level.plant.width} × ${level.plant.height} m`,
      `🔌 arranca a ${level.defaultKbps} kbit/s (máx ${maxLengthFor(level.defaultKbps)} m)`,
      `📨 ${messages} mensajes PDO, todos dentro de plazo`,
      `📊 carga del bus ≤ ${pct(level.maxBusLoad)}`,
      `🧵 cable ${CABLE_COST_PER_M} €/m`,
      `💰 par: ${canParCost(level)} €`,
    ];
  },
  initialPositions,
  placeNew,
  arrange,

  par: canParCost,
  simulate: simulateCan,
  report,
  scene,
  inspector,
};

