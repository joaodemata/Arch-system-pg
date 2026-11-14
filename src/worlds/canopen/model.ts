import type { LevelInfo } from '../types';

/*
 * Modelo simplificado de una red CANopen (CAN 2.0A, identificadores de 11 bits).
 *
 * - El bus es una LÍNEA: cada equipo tiene dos conectores (entrada y salida) y la
 *   línea se cierra con una resistencia de 120 Ω en cada extremo.
 * - La velocidad limita la longitud total del bus (el bit tiene que llegar al otro
 *   extremo y volver dentro del mismo bit para que funcione el arbitraje).
 * - Los datos de proceso viajan en PDO. Su COB-ID es una base fija por tipo de PDO
 *   más el node-ID del equipo. En CAN, el identificador más bajo gana el bus.
 */

export type CanBlockType = 'plc' | 'can2' | 'term' | 'drive' | 'encoder' | 'io' | 'scanner' | 'bms' | 'hmi';

export interface CanBlockSpec {
  label: string;
  icon: string;
  /** Interfaz CAN de un PLC: inicia una red con su propia velocidad. */
  master?: boolean;
  terminator?: boolean;
  feminine?: boolean;
  cost: number;
}

export const CAN_BLOCKS: Record<CanBlockType, CanBlockSpec> = {
  plc: { label: 'PLC', icon: '🎛️', master: true, cost: 0 },
  can2: { label: 'Interfaz CAN 2', icon: '🔌', master: true, feminine: true, cost: 40 },
  term: { label: 'Terminador', icon: 'Ω', terminator: true, cost: 3 },
  drive: { label: 'Variador', icon: '⚙️', cost: 0 },
  encoder: { label: 'Encoder', icon: '🎯', cost: 0 },
  io: { label: 'Módulo E/S', icon: '🔢', cost: 0 },
  scanner: { label: 'Escáner', icon: '📡', cost: 0 },
  bms: { label: 'Batería', icon: '🔋', feminine: true, cost: 0 },
  hmi: { label: 'Pantalla', icon: '🖥️', feminine: true, cost: 0 },
};

/** Coste del cable de bus, por metro. */
export const CABLE_COST_PER_M = 1;

/** Velocidades estándar (kbit/s) y longitud máxima recomendada del bus (CiA 301/303). */
export const BITRATES: { kbps: number; maxLengthM: number }[] = [
  { kbps: 1000, maxLengthM: 25 },
  { kbps: 800, maxLengthM: 50 },
  { kbps: 500, maxLengthM: 100 },
  { kbps: 250, maxLengthM: 250 },
  { kbps: 125, maxLengthM: 500 },
  { kbps: 50, maxLengthM: 1000 },
];

export function maxLengthFor(kbps: number): number {
  return BITRATES.find((b) => b.kbps === kbps)?.maxLengthM ?? 0;
}

/** Tipos de PDO y la base de su COB-ID en el "predefined connection set" de CANopen. */
export type PdoKind = 'tpdo1' | 'rpdo1' | 'tpdo2' | 'rpdo2' | 'tpdo3' | 'rpdo3';

export const PDO_BASE: Record<PdoKind, number> = {
  tpdo1: 0x180,
  rpdo1: 0x200,
  tpdo2: 0x280,
  rpdo2: 0x300,
  tpdo3: 0x380,
  rpdo3: 0x400,
};

export interface CanMessage {
  label: string;
  /** TPDO: lo envía el equipo. RPDO: lo envía el PLC al equipo. */
  pdo: PdoKind;
  bytes: number;
  periodMs: number;
  /** Plazo para llegar desde que se pone en cola. Por defecto, el periodo. */
  deadlineMs?: number;
}

export const cobId = (message: CanMessage, nodeId: number) => PDO_BASE[message.pdo] + nodeId;

/**
 * Bits que ocupa una trama estándar en el peor caso: 47 bits de cabecera, CRC y
 * separación, más los datos, más los bits de relleno (bit stuffing) que mete el
 * controlador cada 5 bits iguales.
 */
export function frameBits(bytes: number): number {
  return 8 * bytes + 47 + Math.floor((34 + 8 * bytes - 1) / 4);
}

export interface PlantPoint {
  x: number;
  y: number;
}

export interface CanDevice {
  key: string;
  type: CanBlockType;
  /** Posición en la planta, en metros. */
  at: PlantPoint;
  /** Node-ID inicial (1–127). */
  nodeId: number;
  /** Velocidad máxima que soporta el equipo, si es menor que 1 Mbit/s. */
  maxKbps?: number;
  messages: CanMessage[];
}

export interface CanLevel extends LevelInfo {
  /** Tamaño de la planta en metros, para dibujarla a escala. */
  plant: { width: number; height: number; label: string };
  /** PLC con su primera interfaz CAN; siempre está. */
  plc: { key: string; at: PlantPoint };
  /** Velocidad con la que arranca cada interfaz CAN. */
  defaultKbps: number;
  /** Carga máxima del bus permitida (0–1). */
  maxBusLoad: number;
  devices: CanDevice[];
  palette: Partial<Record<'term' | 'can2', number>>;
  reference: {
    blocks: Record<string, 'term' | 'can2'>;
    links: [string, string][];
    /** Ajustes de la solución: velocidad por interfaz y node-ID por equipo. */
    config?: Record<string, { kbps?: number; nodeId?: number }>;
  };
}
