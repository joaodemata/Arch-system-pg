import type { Level } from '../engine/types';

export const level03: Level = {
  id: '03',
  title: 'La base de datos sufre',
  brief:
    'Cada petición necesita datos, y la base de datos solo aguanta 100 consultas por segundo. La caché tiene en memoria el 80 % de los datos. Cuando no tiene uno, el servidor debe ir a buscarlo a la base de datos: conecta cada servidor a ambas y verás una línea discontinua, la ruta de respaldo.',
  lesson:
    'Esto se llama cache-aside: el servidor pregunta primero a la caché y, solo si no tiene el dato, va a la base de datos. Así la base de datos, que es la pieza más lenta y difícil de escalar, recibe solo una de cada cinco consultas. Cada servidor necesita su propio plan B: si uno no lo tiene, sus peticiones se pierden aunque los demás funcionen.',
  trafficRps: 250,
  requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 150 },
  requiresData: true,
  fixed: [
    { key: 'users', type: 'users' },
    { key: 'db', type: 'db' },
  ],
  palette: { server: 4, lb: 1, cache: 1 },
  reference: {
    blocks: { lb: 'lb', s1: 'server', s2: 'server', s3: 'server', cache: 'cache' },
    links: [
      ['users', 'lb'],
      ['lb', 's1'],
      ['lb', 's2'],
      ['lb', 's3'],
      ['s1', 'cache'],
      ['s2', 'cache'],
      ['s3', 'cache'],
      ['s1', 'db'],
      ['s2', 'db'],
      ['s3', 'db'],
    ],
  },
};
