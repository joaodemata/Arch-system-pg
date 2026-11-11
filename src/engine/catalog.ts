import type { BlockSpec, BlockType } from './types';

/**
 * Catálogo de bloques. Para añadir un bloque nuevo: definirlo aquí, darle
 * comportamiento en `simulate.ts` y una columna en `ui/layout.ts`.
 */
export const BLOCKS: Record<BlockType, BlockSpec> = {
  users: {
    type: 'users',
    label: 'Usuarios',
    icon: '👥',
    capacity: Infinity,
    latencyMs: 0,
    costPerMonth: 0,
    ports: [{ role: 'primary', accepts: ['lb', 'server'], max: 1 }],
    fullMessage: 'Los usuarios solo conocen una dirección. Pon delante algo que reparta el tráfico.',
  },
  lb: {
    type: 'lb',
    label: 'Balanceador',
    icon: '⚖️',
    capacity: 5000,
    latencyMs: 2,
    costPerMonth: 15,
    ports: [{ role: 'primary', accepts: ['server'], max: Infinity }],
  },
  server: {
    type: 'server',
    label: 'Servidor',
    icon: '🖥️',
    capacity: 100,
    latencyMs: 20,
    costPerMonth: 10,
    ports: [
      // Primero pregunta a la caché si la hay; si no, directamente a la base de datos.
      { role: 'primary', accepts: ['cache', 'db'], max: 1 },
      // Si la caché no tiene el dato (o no responde), va a la base de datos.
      { role: 'fallback', accepts: ['db'], max: 1 },
    ],
    fullMessage: 'Un servidor usa una fuente de datos principal y, como mucho, una de respaldo.',
  },
  cache: {
    type: 'cache',
    label: 'Caché',
    icon: '⚡',
    capacity: 2000,
    latencyMs: 2,
    costPerMonth: 20,
    hitRate: 0.8,
    feminine: true,
    ports: [],
  },
  db: {
    type: 'db',
    label: 'Base de datos',
    icon: '🗄️',
    capacity: 100,
    latencyMs: 30,
    costPerMonth: 0,
    feminine: true,
    ports: [],
  },
};

/** ¿Puede un bloque de tipo `from` enviar peticiones a uno de tipo `to`? */
export function canFeed(from: BlockType, to: BlockType): boolean {
  return BLOCKS[from].ports.some((port) => port.accepts.includes(to));
}
