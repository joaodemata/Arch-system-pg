import type { Level } from '../engine/types';
import { fanIn, fanOut, ids, many } from './helpers';

const chapter = 'Resiliencia';
const users = { key: 'users', type: 'users' } as const;
const db = { key: 'db', type: 'db' } as const;

export const resiliencia: Level[] = [
  {
    id: '14',
    chapter,
    title: 'Cae un servidor (con datos)',
    brief:
      'Vuelve el nivel de la caché: 250 peticiones por segundo, la base de datos aguanta 100. Pero ahora tiene que seguir funcionando aunque caiga cualquier servidor.',
    lesson:
      'La redundancia se planifica para el peor caso: con un servidor menos, los que quedan reciben su parte. Y como cada servidor tiene su propia ruta a caché y base de datos, da igual cuál caiga.',
    traffic: { rps: 250 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 150, survive: ['server'] },
    requiresData: true,
    fixed: [users, db],
    palette: { server: 5, lb: 1, cache: 1 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 4, 'server'), cache: 'cache' },
      links: [['users', 'lb'], ...fanOut('lb', ids('s', 4)), ...fanIn(ids('s', 4), 'cache'), ...fanIn(ids('s', 4), 'db')],
    },
  },
  {
    id: '15',
    chapter,
    title: 'Cae la caché',
    brief:
      '240 peticiones por segundo, un 10 % escrituras. Hay que aguantar que se caiga la caché: entonces todas las lecturas irán por el respaldo. En ese caso se tolera que vaya más lento, pero no que se pierdan peticiones.',
    lesson:
      'Cuando una caché cae, todo su tráfico se desploma sobre lo que hay detrás: es el efecto estampida. Un buen respaldo tiene que aguantar el tráfico completo, aunque vaya más lento. Y cada réplica debe recibir una parte equilibrada.',
    traffic: { rps: 240, writeShare: 0.1 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100, survive: ['cache'] },
    requiresData: true,
    fixed: [users, db],
    palette: { server: 4, lb: 1, cache: 1, replica: 2 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 3, 'server'), cache: 'cache', ...many('r', 2, 'replica') },
      links: [
        ['users', 'lb'],
        ...fanOut('lb', ids('s', 3)),
        ...fanIn(ids('s', 3), 'cache'),
        ['s1', 'r1'],
        ['s2', 'r2'],
        ['s3', 'r1'],
        ...fanIn(ids('s', 3), 'db'),
      ],
    },
  },
  {
    id: '16',
    chapter,
    title: 'Workers caídos',
    brief:
      '120 peticiones por segundo y la mitad sube una foto que hay que redimensionar. Ningún trabajo se puede perder, aunque caiga un worker.',
    lesson:
      'La redundancia también aplica al trabajo en segundo plano. Si los workers van justos, la caída de uno hace que la cola crezca sin fin. Con un worker de más, el resto absorbe su parte.',
    traffic: { rps: 120, heavyWork: { share: 0.5, factor: 4, label: 'redimensionar la foto' } },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100, survive: ['worker'] },
    requiresData: false,
    fixed: [users],
    palette: { server: 3, lb: 1, queue: 1, worker: 6 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 2, 'server'), queue: 'queue', ...many('w', 4, 'worker') },
      links: [['users', 'lb'], ...fanOut('lb', ids('s', 2)), ...fanIn(ids('s', 2), 'queue'), ...fanOut('queue', ids('w', 4))],
    },
  },
];
