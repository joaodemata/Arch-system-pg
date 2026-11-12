import type { Level } from '../engine/types';
import { fanIn, fanOut, ids, many } from './helpers';

const chapter = 'Casos reales';
const users = { key: 'users', type: 'users' } as const;
const db = { key: 'db', type: 'db' } as const;

export const casosReales: Level[] = [
  {
    id: '17',
    chapter,
    title: 'Tienda online',
    brief:
      '400 peticiones por segundo desde otro país (100 ms de distancia). El 60 % es estático (fotos de productos) y un 5 % son compras que escriben en la base de datos.',
    lesson:
      'Una tienda típica: CDN para las fotos, unos pocos servidores para la lógica, caché para el catálogo y la base de datos para pedidos. Cada pieza resuelve un problema concreto.',
    traffic: { rps: 400, staticShare: 0.6, originDistanceMs: 100, writeShare: 0.05 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 120 },
    requiresData: true,
    fixed: [users, db],
    palette: { cdn: 1, lb: 1, server: 4, cache: 1, replica: 1 },
    reference: {
      blocks: { cdn: 'cdn', lb: 'lb', ...many('s', 2, 'server'), cache: 'cache' },
      links: [
        ['users', 'cdn'],
        ['cdn', 'lb'],
        ...fanOut('lb', ids('s', 2)),
        ...fanIn(ids('s', 2), 'cache'),
        ...fanIn(ids('s', 2), 'db'),
      ],
    },
  },
  {
    id: '18',
    chapter,
    title: 'Red social',
    brief:
      '500 peticiones por segundo. Un 10 % son publicaciones (escrituras) y un 20 % dispara avisos a los seguidores, que cuestan 5 veces una petición normal.',
    lesson:
      'Las redes sociales leen muchísimo (caché y réplicas), escriben poco (base de datos principal) y generan mucho trabajo en segundo plano (colas y workers). Tres problemas distintos, tres herramientas distintas.',
    traffic: { rps: 500, writeShare: 0.1, heavyWork: { share: 0.2, factor: 5, label: 'avisar a los seguidores' } },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 120 },
    requiresData: true,
    fixed: [users, db],
    palette: { lb: 1, server: 6, bigserver: 2, cache: 1, replica: 2, queue: 1, worker: 6 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 5, 'server'), cache: 'cache', r1: 'replica', queue: 'queue', ...many('w', 5, 'worker') },
      links: [
        ['users', 'lb'],
        ...fanOut('lb', ids('s', 5)),
        ...fanIn(ids('s', 5), 'cache'),
        ...fanIn(ids('s', 5), 'r1'),
        ...fanIn(ids('s', 5), 'db'),
        ...fanIn(ids('s', 5), 'queue'),
        ...fanOut('queue', ids('w', 5)),
      ],
    },
  },
  {
    id: '19',
    chapter,
    title: 'Black Friday',
    brief:
      '1000 peticiones por segundo, a 50 ms de distancia. El 70 % es estático y un 5 % son compras. Y hoy no puede caerse nada: aguanta la caída de cualquier servidor.',
    lesson:
      'En los grandes picos se combina todo: la CDN absorbe la mayor parte, la caché protege la base de datos y la redundancia N+1 evita que un fallo se convierta en titular.',
    traffic: { rps: 1000, staticShare: 0.7, originDistanceMs: 50, writeShare: 0.05 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 150, survive: ['server', 'bigserver'] },
    requiresData: true,
    fixed: [users, db],
    palette: { cdn: 1, lb: 1, server: 6, bigserver: 3, cache: 1, replica: 2 },
    reference: {
      blocks: { cdn: 'cdn', lb: 'lb', ...many('s', 5, 'server'), cache: 'cache' },
      links: [
        ['users', 'cdn'],
        ['cdn', 'lb'],
        ...fanOut('lb', ids('s', 5)),
        ...fanIn(ids('s', 5), 'cache'),
        ...fanIn(ids('s', 5), 'db'),
      ],
    },
  },
  {
    id: '20',
    chapter,
    title: 'Plataforma de vídeo',
    brief:
      'El nivel final: 600 peticiones por segundo a 80 ms. La mitad es estático, un 5 % escrituras y un 10 % de lo que llega a tus servidores son vídeos que hay que transcodificar (×10). Debe aguantar la caída de cualquier servidor o worker.',
    lesson:
      'Has construido una arquitectura real: CDN, balanceo, caché, base de datos, procesamiento asíncrono y redundancia. Con estas piezas se explica la mayoría de sistemas que usas cada día.',
    traffic: {
      rps: 600,
      staticShare: 0.5,
      originDistanceMs: 80,
      writeShare: 0.05,
      heavyWork: { share: 0.1, factor: 10, label: 'transcodificar el vídeo' },
    },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 150, survive: ['server', 'bigserver', 'worker'] },
    requiresData: true,
    fixed: [users, db],
    palette: { cdn: 1, lb: 1, server: 6, bigserver: 2, cache: 1, replica: 2, queue: 1, worker: 6 },
    reference: {
      blocks: { cdn: 'cdn', lb: 'lb', ...many('s', 5, 'server'), cache: 'cache', queue: 'queue', ...many('w', 3, 'worker') },
      links: [
        ['users', 'cdn'],
        ['cdn', 'lb'],
        ...fanOut('lb', ids('s', 5)),
        ...fanIn(ids('s', 5), 'cache'),
        ...fanIn(ids('s', 5), 'db'),
        ...fanIn(ids('s', 5), 'queue'),
        ...fanOut('queue', ids('w', 3)),
      ],
    },
  },
];
