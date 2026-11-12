import type { BlockSpec, BlockType, PortSpec } from './types';

/**
 * Catálogo de bloques. Para añadir un bloque nuevo: definirlo aquí (con un
 * comportamiento existente o uno nuevo en `simulate.ts`) y darle columna en `ui/layout.ts`.
 */

const SERVER_TARGETS: BlockType[] = ['server', 'bigserver'];

/** Puertos comunes a cualquier servidor. */
const SERVER_PORTS: PortSpec[] = [
  // Lecturas: primero la caché si la hay; si no, una réplica; si no, la base de datos.
  { role: 'primary', accepts: ['cache', 'replica', 'db'], max: 1 },
  // Si el camino principal falla (fallo de caché, saturación…), se reintenta aquí.
  { role: 'fallback', accepts: ['replica', 'db'], max: 1 },
  // Si ya hay principal y respaldo, la base de datos queda para las escrituras.
  { role: 'write', accepts: ['db'], max: 1 },
  // Trabajo pesado que se deja en una cola.
  { role: 'async', accepts: ['queue'], max: 1 },
];
const SERVER_FULL = 'Un servidor admite una fuente de datos principal, una de respaldo, una para escrituras y una cola.';

export const BLOCKS: Record<BlockType, BlockSpec> = {
  users: {
    type: 'users',
    behavior: 'source',
    label: 'Usuarios',
    icon: '👥',
    capacity: Infinity,
    latencyMs: 0,
    costPerMonth: 0,
    ports: [{ role: 'primary', accepts: ['cdn', 'lb', ...SERVER_TARGETS], max: 1 }],
    fullMessage: 'Los usuarios solo conocen una dirección. Pon delante algo que reparta el tráfico.',
  },
  cdn: {
    type: 'cdn',
    behavior: 'edge-cache',
    label: 'CDN',
    icon: '🌍',
    capacity: 10000,
    latencyMs: 5,
    costPerMonth: 25,
    hitRate: 0.9,
    feminine: true,
    ports: [{ role: 'primary', accepts: ['lb', ...SERVER_TARGETS], max: 1 }],
    fullMessage: 'La CDN reenvía a un único origen. Pon un balanceador detrás.',
  },
  lb: {
    type: 'lb',
    behavior: 'balancer',
    label: 'Balanceador',
    icon: '⚖️',
    capacity: 5000,
    latencyMs: 2,
    costPerMonth: 15,
    ports: [{ role: 'primary', accepts: SERVER_TARGETS, max: Infinity }],
  },
  server: {
    type: 'server',
    behavior: 'server',
    label: 'Servidor',
    icon: '🖥️',
    capacity: 100,
    latencyMs: 20,
    costPerMonth: 10,
    ports: SERVER_PORTS,
    fullMessage: SERVER_FULL,
  },
  bigserver: {
    type: 'bigserver',
    behavior: 'server',
    label: 'Servidor XL',
    icon: '🖥️',
    capacity: 300,
    latencyMs: 20,
    costPerMonth: 30,
    ports: SERVER_PORTS,
    fullMessage: SERVER_FULL,
  },
  cache: {
    type: 'cache',
    behavior: 'cache',
    label: 'Caché',
    icon: '⚡',
    capacity: 2000,
    latencyMs: 2,
    costPerMonth: 20,
    hitRate: 0.8,
    feminine: true,
    ports: [],
  },
  replica: {
    type: 'replica',
    behavior: 'store',
    label: 'Réplica',
    icon: '📚',
    capacity: 100,
    latencyMs: 30,
    costPerMonth: 25,
    feminine: true,
    ports: [],
  },
  db: {
    type: 'db',
    behavior: 'store',
    label: 'Base de datos',
    icon: '🛢️',
    capacity: 100,
    latencyMs: 30,
    costPerMonth: 0,
    feminine: true,
    ports: [],
  },
  queue: {
    type: 'queue',
    behavior: 'queue',
    label: 'Cola',
    icon: '📬',
    capacity: 10000,
    unit: 'trabajos/s',
    latencyMs: 0,
    costPerMonth: 10,
    feminine: true,
    ports: [{ role: 'primary', accepts: ['worker'], max: Infinity }],
  },
  worker: {
    type: 'worker',
    behavior: 'worker',
    label: 'Worker',
    icon: '⚙️',
    capacity: 20,
    unit: 'trabajos/s',
    latencyMs: 0,
    costPerMonth: 8,
    ports: [],
  },
};

/** ¿Puede un bloque de tipo `from` enviar peticiones a uno de tipo `to`? */
export function canFeed(from: BlockType, to: BlockType): boolean {
  return BLOCKS[from].ports.some((port) => port.accepts.includes(to));
}
