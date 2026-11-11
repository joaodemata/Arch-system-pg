import type { Level } from '../engine/types';

export const level02: Level = {
  id: '02',
  title: 'Te has hecho viral',
  brief:
    'Ahora llegan 250 peticiones por segundo y cada servidor aguanta 100. Además, los usuarios solo conocen una dirección: no pueden repartirse solos entre varios servidores.',
  lesson:
    'Esto es escalado horizontal: en vez de un servidor más grande, pones varios iguales. El balanceador de carga es la única dirección que conocen los usuarios y reparte las peticiones entre los servidores. Así funcionan casi todas las webs grandes.',
  trafficRps: 250,
  requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
  requiresData: false,
  fixed: [{ key: 'users', type: 'users' }],
  palette: { server: 4, lb: 1 },
  reference: {
    blocks: { lb: 'lb', s1: 'server', s2: 'server', s3: 'server' },
    links: [
      ['users', 'lb'],
      ['lb', 's1'],
      ['lb', 's2'],
      ['lb', 's3'],
    ],
  },
};
