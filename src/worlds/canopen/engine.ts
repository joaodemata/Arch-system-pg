import type { AnyEdge, AnyGraph, AnyNode } from '../types';
import {
  CABLE_COST_PER_M,
  CAN_BLOCKS,
  cobId,
  frameBits,
  maxLengthFor,
  type CanBlockType,
  type CanLevel,
  type CanMessage,
  type PlantPoint,
} from './model';

// ---------- grafo ----------

const spec = (node: AnyNode) => CAN_BLOCKS[node.type as CanBlockType];
const EPSILON = 1e-9;

export function createCanGraph(level: CanLevel): AnyGraph {
  return {
    nodes: [
      { id: level.plc.key, type: 'plc', fixed: true, config: { kbps: level.defaultKbps } },
      ...level.devices.map((d) => ({ id: d.key, type: d.type, fixed: true, config: { nodeId: d.nodeId } })),
    ],
    edges: [],
  };
}

export function addCanNode(level: CanLevel, graph: AnyGraph, type: string): { graph: AnyGraph; id: string } {
  const ids = new Set(graph.nodes.map((n) => n.id));
  let n = 1;
  while (ids.has(`${type}-${n}`)) n++;
  const node: AnyNode = { id: `${type}-${n}`, type };
  if (CAN_BLOCKS[type as CanBlockType].master) node.config = { kbps: level.defaultKbps };
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, id: node.id };
}

export function removeCanNode(graph: AnyGraph, id: string): AnyGraph {
  return { nodes: graph.nodes.filter((n) => n.id !== id), edges: graph.edges.filter((e) => e.from !== id && e.to !== id) };
}

export function removeCanEdge(graph: AnyGraph, id: string): AnyGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== id) };
}

export function setConfig(graph: AnyGraph, id: string, key: string, value: number): AnyGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)),
  };
}

const degree = (graph: AnyGraph, id: string) => graph.edges.filter((e) => e.from === id || e.to === id).length;

const neighbours = (graph: AnyGraph, id: string) =>
  graph.edges.filter((e) => e.from === id || e.to === id).map((e) => (e.from === id ? e.to : e.from));

/** Bloques unidos por cable a `id` (incluido él). */
export function component(graph: AnyGraph, id: string): Set<string> {
  const seen = new Set([id]);
  const stack = [id];
  while (stack.length) {
    for (const next of neighbours(graph, stack.pop()!)) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

export type CanConnect = { ok: true; graph: AnyGraph } | { ok: false; error: string };

export function connectCan(graph: AnyGraph, aId: string, bId: string): CanConnect {
  if (aId === bId) return { ok: false, error: 'Un equipo no puede conectarse consigo mismo.' };
  const a = graph.nodes.find((n) => n.id === aId)!;
  const b = graph.nodes.find((n) => n.id === bId)!;
  const [sa, sb] = [spec(a), spec(b)];

  if (sa.terminator && sb.terminator) return { ok: false, error: 'Dos terminadores juntos no forman un bus.' };
  if (sa.master && sb.master) return { ok: false, error: 'Cada interfaz CAN es una red distinta: no se pueden unir entre sí.' };
  if (graph.edges.some((e) => (e.from === aId && e.to === bId) || (e.from === bId && e.to === aId))) {
    return { ok: false, error: 'Esos equipos ya están conectados.' };
  }
  for (const [node, s] of [[a, sa], [b, sb]] as const) {
    const max = s.terminator ? 1 : 2;
    if (degree(graph, node.id) >= max) {
      return {
        ok: false,
        error: s.terminator
          ? 'Un terminador va en un único extremo del bus.'
          : `${s.label} ya tiene sus dos conectores ocupados (entrada y salida). Un bus CAN es una línea, no una estrella.`,
      };
    }
  }
  const reach = component(graph, aId);
  if (reach.has(bId)) return { ok: false, error: 'Eso cerraría el bus en anillo. Un bus CAN es una línea con dos extremos.' };
  const masters = [...reach, ...component(graph, bId)].filter((id) => spec(graph.nodes.find((n) => n.id === id)!).master);
  if (masters.length > 1) return { ok: false, error: 'Esa conexión uniría dos interfaces CAN en el mismo bus.' };

  const edge: AnyEdge = { id: `${aId}~${bId}`, from: aId, to: bId };
  return { ok: true, graph: { ...graph, edges: [...graph.edges, edge] } };
}

// ---------- planta: distancias y coste ----------

/** Dónde está cada bloque en la planta. Los terminadores van pegados a su equipo. */
export function plantPosition(level: CanLevel, node: AnyNode): PlantPoint | null {
  if (node.type === 'plc' || node.type === 'can2') return level.plc.at;
  return level.devices.find((d) => d.key === node.id)?.at ?? null;
}

/** Metros de cable de una conexión: por bandeja, en horizontal y vertical. */
export function cableLength(level: CanLevel, graph: AnyGraph, edge: AnyEdge): number {
  const a = graph.nodes.find((n) => n.id === edge.from)!;
  const b = graph.nodes.find((n) => n.id === edge.to)!;
  const pa = plantPosition(level, a);
  const pb = plantPosition(level, b);
  if (!pa || !pb) return 0;
  const length = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
  // Entre dos interfaces del mismo PLC o un equipo y su terminador no hay tramo de bus.
  return Math.max(length, a.type === 'term' || b.type === 'term' ? 0 : 1);
}

export function canCost(level: CanLevel, graph: AnyGraph): number {
  const blocks = graph.nodes.filter((n) => !n.fixed).reduce((sum, n) => sum + spec(n).cost, 0);
  const cable = graph.edges.reduce((sum, e) => sum + cableLength(level, graph, e) * CABLE_COST_PER_M, 0);
  return blocks + cable;
}

// ---------- simulación ----------

export interface BusReport {
  master: string;
  kbps: number;
  lengthM: number;
  maxLengthM: number;
  /** Fracción del tiempo que el bus está ocupado. */
  load: number;
  nodes: string[];
  /** Si el bus no funciona, por qué. */
  failure: string | null;
}

export interface MessageReport {
  deviceId: string;
  message: CanMessage;
  cob: number;
  deadlineMs: number;
  /** Peor tiempo de respuesta; null si el mensaje no llega nunca. */
  responseMs: number | null;
  onTime: boolean;
  bus: string | null;
}

export interface CanResult {
  buses: BusReport[];
  messages: MessageReport[];
  cost: number;
  meetsRequirements: boolean;
  problems: string[];
}

/** Nombre visible: "Variador 2" si hay varios del mismo tipo. */
export function canName(graph: AnyGraph, id: string): string {
  const node = graph.nodes.find((n) => n.id === id)!;
  const same = graph.nodes.filter((n) => n.type === node.type);
  const label = spec(node).label;
  return same.length > 1 ? `${label} ${same.indexOf(node) + 1}` : label;
}

export const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(3, '0')}`;
const ms = (x: number) => `${x.toLocaleString('es', { maximumFractionDigits: 2 })} ms`;

export function simulateCan(level: CanLevel, graph: AnyGraph): CanResult {
  const problems: string[] = [];
  const buses: BusReport[] = [];
  const messages: MessageReport[] = [];
  const assigned = new Set<string>();

  const masters = graph.nodes.filter((n) => spec(n).master);
  for (const master of masters) {
    const members = component(graph, master.id);
    const devices = level.devices.filter((d) => members.has(d.key));
    if (devices.length === 0 && master.type !== 'plc') continue;
    devices.forEach((d) => assigned.add(d.key));

    const kbps = master.config?.kbps ?? level.defaultKbps;
    const busName = masters.length > 1 ? `Bus de ${canName(graph, master.id)}` : 'El bus';
    const edges = graph.edges.filter((e) => members.has(e.from));
    const lengthM = edges.reduce((sum, e) => sum + cableLength(level, graph, e), 0);
    const maxLengthM = maxLengthFor(kbps);
    const terms = [...members].filter((id) => graph.nodes.find((n) => n.id === id)?.type === 'term').length;

    // Mensajes de este bus, ordenados por prioridad (COB-ID más bajo primero).
    const nodeIdOf = (key: string) => graph.nodes.find((n) => n.id === key)?.config?.nodeId ?? 0;
    const frames = devices
      .flatMap((d) =>
        d.messages.map((m) => ({
          deviceId: d.key,
          message: m,
          cob: cobId(m, nodeIdOf(d.key)),
          c: frameBits(m.bytes) / kbps,
          t: m.periodMs,
          deadlineMs: m.deadlineMs ?? m.periodMs,
        })),
      )
      .sort((x, y) => x.cob - y.cob);
    const load = frames.reduce((sum, f) => sum + f.c / f.t, 0);

    let failure: string | null = null;
    const ids = devices.map((d) => nodeIdOf(d.key));
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
    const tooSlow = devices.find((d) => d.maxKbps !== undefined && d.maxKbps < kbps);
    if (devices.length > 0 && terms < 2) {
      failure = `${busName} no está terminado: ${terms === 0 ? 'faltan las resistencias de 120 Ω en los dos extremos' : 'falta la resistencia de 120 Ω en un extremo'}. Las señales rebotan y las tramas llegan corruptas.`;
    } else if (lengthM > maxLengthM) {
      failure = `${busName} mide ${lengthM} m y a ${kbps} kbit/s el máximo son ${maxLengthM} m: el bit no llega al otro extremo a tiempo para el arbitraje.`;
    } else if (tooSlow) {
      failure = `${canName(graph, tooSlow.key)} solo admite hasta ${tooSlow.maxKbps} kbit/s y ${busName.toLowerCase()} va a ${kbps}: genera tramas de error y tumba el bus.`;
    } else if (duplicate !== undefined) {
      const clash = devices.filter((d) => nodeIdOf(d.key) === duplicate).map((d) => canName(graph, d.key));
      failure = `${clash.join(' y ')} tienen el mismo node-ID (${duplicate}): sus COB-ID chocan y el bus se llena de errores.`;
    }
    if (failure) problems.push(failure);

    for (const [i, f] of frames.entries()) {
      const responseMs = failure ? null : responseTime(frames, i, kbps);
      const onTime = responseMs !== null && responseMs <= f.deadlineMs + EPSILON;
      messages.push({ deviceId: f.deviceId, message: f.message, cob: f.cob, deadlineMs: f.deadlineMs, responseMs, onTime, bus: master.id });
      if (!failure && !onTime) {
        const late = responseMs === null ? 'no llega nunca: el bus está saturado' : `tarda hasta ${ms(responseMs)} y su plazo es ${ms(f.deadlineMs)}`;
        const ahead = frames.slice(0, i).filter((g) => g.deviceId !== f.deviceId);
        const who = ahead.length === 1 ? ' Le pasa delante 1 mensaje con COB-ID más bajo.' : ahead.length ? ` Le pasan delante ${ahead.length} mensajes con COB-ID más bajo.` : '';
        problems.push(`${canName(graph, f.deviceId)} · ${f.message.label} (COB-ID ${hex(f.cob)}) ${late}.${who}`);
      }
    }

    if (!failure && load > level.maxBusLoad + EPSILON) {
      problems.push(
        `${busName} va al ${Math.round(load * 100)} % de carga y el máximo son ${Math.round(level.maxBusLoad * 100)} %: sin margen, cualquier reintento o mensaje de diagnóstico llega tarde.`,
      );
    }
    buses.push({ master: master.id, kbps, lengthM, maxLengthM, load, nodes: [...members], failure });
  }

  for (const device of level.devices.filter((d) => !assigned.has(d.key))) {
    problems.push(`${canName(graph, device.key)} no está conectado a ninguna interfaz CAN del PLC.`);
    for (const m of device.messages) {
      messages.push({ deviceId: device.key, message: m, cob: 0, deadlineMs: m.deadlineMs ?? m.periodMs, responseMs: null, onTime: false, bus: null });
    }
  }

  const loadsOk = buses.every((b) => b.failure !== null || b.load <= level.maxBusLoad + EPSILON);
  return {
    buses,
    messages,
    cost: canCost(level, graph),
    meetsRequirements: messages.every((m) => m.onTime) && loadsOk && buses.every((b) => !b.failure),
    problems,
  };
}

/**
 * Peor tiempo de respuesta de la trama `i` (análisis clásico de CAN, Tindell 1994):
 * espera a que acabe la trama más larga de menor prioridad que ya esté en el bus
 * (CAN no interrumpe una trama empezada) y a todas las de mayor prioridad que se
 * pongan en cola mientras tanto. Devuelve null si nunca consigue el bus.
 */
function responseTime(frames: { c: number; t: number; deadlineMs: number }[], i: number, kbps: number): number | null {
  const own = frames[i];
  const blocking = Math.max(0, ...frames.slice(i + 1).map((f) => f.c));
  const higher = frames.slice(0, i);
  const bit = 1 / kbps;
  let wait = blocking;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const next = blocking + higher.reduce((sum, f) => sum + Math.ceil((wait + bit) / f.t - EPSILON) * f.c, 0);
    // Si la espera supera 10 periodos, el bus está saturado y la trama no llega nunca.
    if (next + own.c > own.t * 10) return null;
    if (Math.abs(next - wait) < EPSILON) return wait + own.c;
    wait = next;
  }
  return null;
}
