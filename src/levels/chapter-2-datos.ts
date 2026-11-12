import type { Level } from '../engine/types';
import { fanIn, fanOut, ids, many } from './helpers';

const chapter = 'Datos';
const users = { key: 'users', type: 'users' } as const;
const db = { key: 'db', type: 'db' } as const;

export const datos: Level[] = [
  {
    id: '05',
    chapter,
    title: 'Tu primera base de datos',
    brief:
      'Tu web ahora guarda datos: cada petición necesita leer de la base de datos. Conecta el servidor a la base de datos para que pueda responder.',
    lesson:
      'Los servidores no guardan nada: si uno se reinicia, no se pierde información, porque todo vive en la base de datos. Por eso se pueden añadir o quitar servidores sin miedo.',
    traffic: { rps: 80 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 150 },
    requiresData: true,
    fixed: [users, db],
    palette: { server: 2 },
    reference: { blocks: { s1: 'server' }, links: [['users', 's1'], ['s1', 'db']] },
  },
  {
    id: '06',
    chapter,
    title: 'La base de datos sufre',
    brief:
      'Llegan 250 peticiones por segundo y la base de datos solo aguanta 100. La caché tiene en memoria el 80 % de los datos. Cuando no tiene uno, el servidor debe ir a la base de datos: conecta cada servidor a ambas y verás una línea discontinua, la ruta de respaldo.',
    lesson:
      'Esto se llama cache-aside: el servidor pregunta primero a la caché y, solo si no tiene el dato, va a la base de datos. Así la base de datos recibe una de cada cinco consultas. Cada servidor necesita su propio plan B: si uno no lo tiene, sus peticiones se pierden aunque los demás funcionen.',
    traffic: { rps: 250 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 150 },
    requiresData: true,
    fixed: [users, db],
    palette: { server: 4, lb: 1, cache: 1 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 3, 'server'), cache: 'cache' },
      links: [['users', 'lb'], ...fanOut('lb', ids('s', 3)), ...fanIn(ids('s', 3), 'cache'), ...fanIn(ids('s', 3), 'db')],
    },
  },
  {
    id: '07',
    chapter,
    title: 'Más lecturas que escrituras',
    brief:
      'El 90 % de las peticiones solo leen datos; el 10 % escriben. Las escrituras tienen que ir a la base de datos principal, pero las lecturas pueden ir a réplicas: copias de solo lectura. Aquí no tienes caché.',
    lesson:
      'Las réplicas de lectura copian la base de datos principal y reparten las lecturas. Las escrituras siguen yendo a la principal, que después las propaga a las réplicas. Casi todas las aplicaciones leen mucho más de lo que escriben, así que esto escala muy bien.',
    traffic: { rps: 270, writeShare: 0.1 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 160 },
    requiresData: true,
    fixed: [users, db],
    palette: { server: 4, lb: 1, replica: 3 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 3, 'server'), ...many('r', 3, 'replica') },
      links: [
        ['users', 'lb'],
        ...fanOut('lb', ids('s', 3)),
        ['s1', 'r1'],
        ['s2', 'r2'],
        ['s3', 'r3'],
        ...fanIn(ids('s', 3), 'db'),
      ],
    },
  },
  {
    id: '08',
    chapter,
    title: 'Caché y réplicas',
    brief:
      '450 peticiones por segundo, un 10 % son escrituras. Solo tienes dos réplicas. Combina caché y réplicas: la caché primero, la réplica cuando la caché falle y la base de datos para escribir.',
    lesson:
      'Las capas se suman: la caché quita la mayoría de lecturas, la réplica recoge los fallos de caché y la base de datos principal solo recibe escrituras. Cada capa protege a la siguiente.',
    traffic: { rps: 450, writeShare: 0.1 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 120 },
    requiresData: true,
    fixed: [users, db],
    palette: { server: 6, lb: 1, cache: 1, replica: 2 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 5, 'server'), cache: 'cache', r1: 'replica' },
      links: [
        ['users', 'lb'],
        ...fanOut('lb', ids('s', 5)),
        ...fanIn(ids('s', 5), 'cache'),
        ...fanIn(ids('s', 5), 'r1'),
        ...fanIn(ids('s', 5), 'db'),
      ],
    },
  },
];
