import type { BoardPoint, Positions } from '../ui/layout';

/**
 * Contrato que cumple cada "mundo" del juego (web, CANopen…). La interfaz
 * (tablero, paleta, modal de resultado, mapa) solo habla con este contrato,
 * así que añadir un mundo nuevo no toca a los demás.
 */

/** Grafo genérico: cada mundo decide qué tipos de bloque existen y qué guarda en `config`. */
export interface AnyNode {
  id: string;
  type: string;
  fixed?: boolean;
  /** Ajustes del bloque que el jugador puede cambiar (velocidad del bus, node-ID…). */
  config?: Record<string, number>;
}

export interface AnyEdge {
  id: string;
  from: string;
  to: string;
}

export interface AnyGraph {
  nodes: AnyNode[];
  edges: AnyEdge[];
}

export interface LevelInfo {
  id: string;
  chapter: string;
  title: string;
  brief: string;
  lesson: string;
}

export interface PaletteEntry {
  type: string;
  title: string;
  detail: string;
  left: number;
}

export interface Metric {
  value: string;
  label: string;
  good: boolean;
}

/** Resultado de una simulación, ya traducido a textos y métricas para la interfaz. */
export interface GameResult {
  meetsRequirements: boolean;
  cost: number;
  metrics: Metric[];
  /** Líneas de detalle (escenarios de caída, resumen de cada bus…). */
  details: { title: string; lines: { ok: boolean; text: string }[] } | null;
  problems: string[];
}

export type NodeStatus = 'idle' | 'ok' | 'warn' | 'bad';

/** Lo que el tablero dibuja de un bloque. */
export interface SceneNode {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  status: NodeStatus;
  /** Barra de uso (0–1+); null para no dibujarla. */
  bar: number | null;
  /** Bloques pequeños, como un terminador. */
  compact?: boolean;
  deletable: boolean;
  draggable: boolean;
  /** Partículas rojas por segundo que caen del bloque (lo que se pierde). */
  lossRate: number;
}

/** Lo que el tablero dibuja de una conexión. */
export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  color: string;
  dash: number[];
  arrow: boolean;
  /** Etiqueta y en qué punto del tramo va (0–1). */
  label: { text: string; color: string; at: number } | null;
  /** Punto para borrar la conexión (se oculta mientras hay resultado). */
  handle: boolean;
  particles: { rate: number; color: string } | null;
}

export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  emptyHint: string | null;
}

/** Panel bajo el tablero con los ajustes del bloque seleccionado. */
export interface Inspector {
  title: string;
  html: string;
  field: {
    label: string;
    value: number;
    options: { value: number; label: string }[];
    apply(value: number): AnyGraph;
  } | null;
}

export type ConnectOutcome = { ok: true; graph: AnyGraph } | { ok: false; error: string };

export interface World<L extends LevelInfo = LevelInfo, R = unknown> {
  id: string;
  name: string;
  icon: string;
  summary: string;
  color: string;
  /** "€/mes" en la nube, "€" de material en una planta. */
  costUnit: string;
  chapters: Chapter<L>[];
  /** Leyenda de tipos de línea bajo el tablero (HTML). */
  legend: string;
  /**
   * Si el mundo tiene ajustes por bloque, texto del panel cuando no hay nada seleccionado.
   * El panel se queda siempre visible para que el tablero no salte al seleccionar.
   */
  inspectorHint: string | null;

  createGraph(level: L): AnyGraph;
  connect(level: L, graph: AnyGraph, a: string, b: string): ConnectOutcome;
  addNode(level: L, graph: AnyGraph, type: string): { graph: AnyGraph; id: string };
  removeNode(graph: AnyGraph, id: string): AnyGraph;
  removeEdge(graph: AnyGraph, id: string): AnyGraph;

  palette(level: L, graph: AnyGraph): PaletteEntry[];
  chips(level: L): string[];
  initialPositions(level: L, graph: AnyGraph): Positions;
  placeNew(level: L, positions: Positions, type: string): BoardPoint;
  /** Recoloca bloques que dependen de otros (un terminador junto a su equipo) tras cada cambio. */
  arrange?(level: L, graph: AnyGraph, positions: Positions): void;

  par(level: L): number;
  simulate(level: L, graph: AnyGraph): R;
  report(level: L, result: R): GameResult;
  scene(level: L, graph: AnyGraph, result: R | null): Scene;
  inspector(level: L, graph: AnyGraph, nodeId: string): Inspector | null;
}

export interface Chapter<L extends LevelInfo = LevelInfo> {
  name: string;
  icon: string;
  summary: string;
  color: string;
  levels: L[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorld = World<any, any>;
