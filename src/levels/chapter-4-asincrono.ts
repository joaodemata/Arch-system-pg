import type { Level } from '../engine/types';
import { fanIn, fanOut, ids, many } from './helpers';

const chapter = 'Asíncrono';
const users = { key: 'users', type: 'users' } as const;

export const asincrono: Level[] = [
  {
    id: '11',
    chapter,
    title: 'El email de bienvenida',
    brief:
      'El 30 % de las peticiones son registros, y cada registro envía un email de bienvenida. Enviarlo le cuesta al servidor 6 veces más que una petición normal, y el usuario tiene que esperar. ¿Y si el email se envía después?',
    lesson:
      'Una cola desacopla lo urgente de lo que puede esperar: el servidor deja el trabajo en la cola y responde al momento. Los workers lo recogen y lo hacen a su ritmo. El usuario no espera por un email que puede llegar unos segundos después.',
    traffic: { rps: 90, heavyWork: { share: 0.3, factor: 6, label: 'enviar el email de bienvenida' } },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 80 },
    requiresData: false,
    fixed: [users],
    palette: { server: 3, lb: 1, queue: 1, worker: 3 },
    reference: {
      blocks: { s1: 'server', queue: 'queue', ...many('w', 2, 'worker') },
      links: [['users', 's1'], ['s1', 'queue'], ...fanOut('queue', ids('w', 2))],
    },
  },
  {
    id: '12',
    chapter,
    title: 'La cola crece',
    brief:
      '200 peticiones por segundo y el 40 % genera una factura en PDF. Cada worker hace 20 trabajos por segundo. Si entran más trabajos de los que salen, la cola crece hasta reventar.',
    lesson:
      'Una cola no hace magia: solo absorbe picos. A la larga, los workers tienen que procesar al menos tantos trabajos como entran. Se dimensionan aparte de los servidores, según el ritmo de trabajos.',
    traffic: { rps: 200, heavyWork: { share: 0.4, factor: 5, label: 'generar la factura en PDF' } },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
    requiresData: false,
    fixed: [users],
    palette: { server: 3, lb: 1, queue: 1, worker: 6 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 2, 'server'), queue: 'queue', ...many('w', 4, 'worker') },
      links: [['users', 'lb'], ...fanOut('lb', ids('s', 2)), ...fanIn(ids('s', 2), 'queue'), ...fanOut('queue', ids('w', 4))],
    },
  },
  {
    id: '13',
    chapter,
    title: 'Subir vídeos',
    brief:
      'La mitad de las peticiones suben un vídeo, y procesarlo cuesta 12 veces una petición normal. Ni el Servidor XL puede con eso sin ayuda.',
    lesson:
      'Cuando un trabajo es muy pesado, hacerlo dentro de la petición es inviable: el usuario esperaría minutos y harían falta servidores enormes. Lo normal es responder "recibido, lo estamos procesando" y dejar el trabajo a los workers.',
    traffic: { rps: 60, heavyWork: { share: 0.5, factor: 12, label: 'procesar el vídeo subido' } },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 80 },
    requiresData: false,
    fixed: [users],
    palette: { server: 4, bigserver: 1, lb: 1, queue: 1, worker: 4 },
    reference: {
      blocks: { s1: 'server', queue: 'queue', ...many('w', 2, 'worker') },
      links: [['users', 's1'], ['s1', 'queue'], ...fanOut('queue', ids('w', 2))],
    },
  },
];
