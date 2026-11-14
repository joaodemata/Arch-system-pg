import type { Level } from '../engine/types';
import { fanOut, ids, many } from './helpers';

const chapter = 'Global';
const users = { key: 'users', type: 'users' } as const;

export const global: Level[] = [
  {
    id: '09',
    chapter,
    title: 'Usuarios al otro lado del mundo',
    brief:
      'Tus usuarios están lejos: cada viaje hasta tus servidores suma 120 ms, y el límite es 100 ms de media. El 70 % de lo que piden es contenido estático (imágenes, CSS, JavaScript).',
    lesson:
      'Una CDN es una red de cachés repartidas por el mundo, cerca de los usuarios. Sirve el contenido estático desde allí, sin cruzar el océano. Solo lo que no tiene viaja hasta tus servidores.',
    traffic: { rps: 150, staticShare: 0.7, originDistanceMs: 120 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
    requiresData: false,
    fixed: [users],
    palette: { server: 2, lb: 1, cdn: 1 },
    reference: { blocks: { cdn: 'cdn', s1: 'server' }, links: [['users', 'cdn'], ['cdn', 's1']] },
  },
  {
    id: '10',
    chapter,
    title: 'Que trabaje la CDN',
    brief:
      '600 peticiones por segundo y el 80 % es contenido estático. Esta vez los usuarios están cerca, pero el presupuesto aprieta.',
    lesson:
      'La CDN no solo reduce la latencia: también quita carga a tus servidores. Si la mayor parte del tráfico es estático, una CDN suele salir más barata que añadir máquinas.',
    traffic: { rps: 600, staticShare: 0.8 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
    requiresData: false,
    fixed: [users],
    palette: { server: 6, lb: 1, cdn: 1 },
    reference: {
      blocks: { cdn: 'cdn', lb: 'lb', ...many('s', 2, 'server') },
      links: [['users', 'cdn'], ['cdn', 'lb'], ...fanOut('lb', ids('s', 2))],
    },
  },
];
