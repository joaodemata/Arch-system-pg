import type { Level } from '../engine/types';
import { fanOut, ids, many } from './helpers';

const chapter = 'Fundamentos';
const users = { key: 'users', type: 'users' } as const;

export const fundamentos: Level[] = [
  {
    id: '01',
    chapter,
    title: 'Tu primer servidor',
    brief: '50 personas por segundo entran en tu web. Conecta a los usuarios con un servidor para que alguien les responda.',
    lesson:
      'Un servidor recibe peticiones y devuelve respuestas. Cada uno aguanta un número máximo de peticiones por segundo; mientras no lo superes, todo va fluido.',
    traffic: { rps: 50 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
    requiresData: false,
    fixed: [users],
    palette: { server: 2 },
    reference: { blocks: { s1: 'server' }, links: [['users', 's1']] },
  },
  {
    id: '02',
    chapter,
    title: 'Te has hecho viral',
    brief:
      'Ahora llegan 250 peticiones por segundo y cada servidor aguanta 100. Además, los usuarios solo conocen una dirección: no pueden repartirse solos entre varios servidores.',
    lesson:
      'Esto es escalado horizontal: en vez de un servidor más grande, pones varios iguales. El balanceador de carga es la única dirección que conocen los usuarios y reparte las peticiones entre los servidores.',
    traffic: { rps: 250 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
    requiresData: false,
    fixed: [users],
    palette: { server: 4, lb: 1 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 3, 'server') },
      links: [['users', 'lb'], ...fanOut('lb', ids('s', 3))],
    },
  },
  {
    id: '03',
    chapter,
    title: 'Una máquina más grande',
    brief:
      'Mismo tráfico, 250 peticiones por segundo, pero ahora también tienes un Servidor XL: aguanta 300 y cuesta 30 €. Mira el presupuesto.',
    lesson:
      'Esto es escalado vertical: una máquina más potente en lugar de varias. Es más simple (no necesitas balanceador) y a veces más barato, pero tiene techo: no existen servidores infinitamente grandes.',
    traffic: { rps: 250 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100 },
    requiresData: false,
    fixed: [users],
    palette: { server: 4, lb: 1, bigserver: 1 },
    reference: { blocks: { xl: 'bigserver' }, links: [['users', 'xl']] },
  },
  {
    id: '04',
    chapter,
    title: 'Si se cae, se cae todo',
    brief:
      'Los servidores se rompen. Tu sistema tiene que seguir respondiendo a las 250 peticiones por segundo aunque caiga cualquiera de ellos.',
    lesson:
      'Un único servidor, por grande que sea, es un punto único de fallo. Con N+1 (uno más de los que necesitas) puedes perder cualquiera sin que nadie lo note. Por eso en producción casi nunca verás una sola máquina.',
    traffic: { rps: 250 },
    requirements: { minSuccessRate: 0.99, maxAvgLatencyMs: 100, survive: ['server', 'bigserver'] },
    requiresData: false,
    fixed: [users],
    palette: { server: 4, lb: 1, bigserver: 2 },
    reference: {
      blocks: { lb: 'lb', ...many('s', 4, 'server') },
      links: [['users', 'lb'], ...fanOut('lb', ids('s', 4))],
    },
  },
];
