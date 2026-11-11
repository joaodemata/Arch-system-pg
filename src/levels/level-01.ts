import type { Level } from '../engine/types';

export const level01: Level = {
  id: '01',
  title: 'Tu primer servidor',
  brief: '50 personas por segundo entran en tu web. Conecta a los usuarios con un servidor para que alguien les responda.',
  lesson:
    'Un servidor recibe peticiones y devuelve respuestas. Cada uno aguanta un número máximo de peticiones por segundo; mientras no lo superes, todo va fluido.',
  trafficRps: 50,
  requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
  requiresData: false,
  fixed: [{ key: 'users', type: 'users' }],
  palette: { server: 2 },
  reference: {
    blocks: { s1: 'server' },
    links: [['users', 's1']],
  },
};
