import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { connect, createLevelGraph, edgeRoles, resolvePorts } from '../src/engine/graph';
import { parCost, scoreResult } from '../src/engine/scoring';
import { simulate } from '../src/engine/simulate';
import type { BlockType, Graph, Level } from '../src/engine/types';
import { LEVELS } from '../src/levels';
import { fanIn, fanOut, ids, many } from '../src/levels/helpers';

const level = (id: string): Level => {
  const found = LEVELS.find((l) => l.id === id);
  if (!found) throw new Error(`No existe el nivel ${id}`);
  return found;
};

/** Construye un grafo a partir del nivel, unos bloques y unas conexiones. */
function build(lv: Level, blocks: Record<string, BlockType>, links: [string, string][]): Graph {
  let graph = createLevelGraph(lv);
  for (const [id, type] of Object.entries(blocks)) graph = { ...graph, nodes: [...graph.nodes, { id, type }] };
  for (const [a, b] of links) {
    const r = connect(graph, a, b);
    if (!r.ok) throw new Error(r.error);
    graph = r.graph;
  }
  return graph;
}

const messages = (g: Graph, lv: Level) => simulate(lv, g).problems.map((p) => p.message).join('\n');
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('escalado (nivel 02)', () => {
  const withServers = (n: number) =>
    build(level('02'), { lb: 'lb', ...many('s', n, 'server') }, [['users', 'lb'], ...fanOut('lb', ids('s', n))]);

  test('con 2 servidores se saturan', () => {
    const result = simulate(level('02'), withServers(2));
    assert.equal(result.meetsRequirements, false);
    assert.ok(close(result.successRate, 0.8));
    assert.match(result.problems[0].message, /saturado/);
  });

  test('con 4 servidores funciona pero cuesta más: 2 estrellas', () => {
    assert.equal(scoreResult(simulate(level('02'), withServers(4)), parCost(level('02'))), 2);
  });
});

describe('caídas (nivel 04)', () => {
  test('un servidor XL solo no aguanta su propia caída', () => {
    const graph = build(level('04'), { xl: 'bigserver' }, [['users', 'xl']]);
    const result = simulate(level('04'), graph);
    assert.equal(result.meetsRequirements, false);
    assert.match(messages(graph, level('04')), /Si cae Servidor XL/);
  });

  test('los nombres no cambian en los escenarios de caída', () => {
    const graph = build(level('04'), { lb: 'lb', ...many('s', 2, 'server') }, [['users', 'lb'], ...fanOut('lb', ids('s', 2))]);
    const result = simulate(level('04'), graph);
    assert.deepEqual(result.scenarios.map((s) => s.failedNode), ['Servidor 1', 'Servidor 2']);
  });
});

describe('cache-aside (nivel 06)', () => {
  const lv = level('06');
  const base = { lb: 'lb', ...many('s', 3, 'server'), cache: 'cache' } as const;
  const front: [string, string][] = [['users', 'lb'], ...fanOut('lb', ids('s', 3))];

  test('si solo un servidor tiene respaldo, los otros pierden sus fallos de caché', () => {
    const graph = build(lv, base, [...front, ...fanIn(ids('s', 3), 'cache'), ['s1', 'db']]);
    const result = simulate(lv, graph);
    assert.equal(result.meetsRequirements, false);
    const text = messages(graph, lv);
    assert.match(text, /Servidor 2 no tiene ruta de respaldo/);
    assert.match(text, /Servidor 3 no tiene ruta de respaldo/);
    assert.doesNotMatch(text, /Servidor 1/);
    assert.ok(close(result.successRate, 1 - (2 / 3) * 0.2));
  });

  test('sin caché, la base de datos se satura', () => {
    const graph = build(lv, base, [...front, ...fanIn(ids('s', 3), 'db')]);
    assert.match(simulate(lv, graph).problems[0].message, /Base de datos saturada/);
  });

  test('un servidor sin datos no puede responder', () => {
    const graph = build(lv, base, [...front, ...fanIn(['s1', 's2'], 'cache'), ...fanIn(['s1', 's2'], 'db')]);
    assert.match(messages(graph, lv), /Servidor 3 no tiene de dónde leer los datos/);
  });
});

describe('escrituras (nivel 07)', () => {
  test('sin conexión a la base de datos principal, las escrituras se pierden', () => {
    const lv = level('07');
    const graph = build(lv, { s1: 'server', r1: 'replica' }, [['users', 's1'], ['s1', 'r1']]);
    assert.match(messages(graph, lv), /Servidor no puede guardar datos/);
  });
});

describe('CDN (nivel 09)', () => {
  const lv = level('09');

  test('sin CDN, la distancia hace imposible cumplir la latencia', () => {
    const graph = build(lv, { s1: 'server' }, [['users', 's1']]);
    const result = simulate(lv, graph);
    assert.ok(result.avgLatencyMs > 120);
    assert.equal(result.meetsRequirements, false);
  });

  test('la CDN sirve el estático y solo reenvía el resto', () => {
    const graph = build(lv, { cdn: 'cdn', s1: 'server' }, [['users', 'cdn'], ['cdn', 's1']]);
    const result = simulate(lv, graph);
    assert.ok(close(result.nodes.s1.load, 150 * (1 - 0.7 * 0.9)));
  });
});

describe('colas (niveles 11 y 12)', () => {
  test('hacer el trabajo pesado en el servidor dispara la carga y la latencia', () => {
    const lv = level('11');
    const graph = build(lv, { s1: 'server' }, [['users', 's1']]);
    const result = simulate(lv, graph);
    assert.ok(close(result.nodes.s1.load, 90 * (1 + 0.3 * 5)));
    assert.equal(result.meetsRequirements, false);
  });

  test('con pocos workers se pierden trabajos aunque las peticiones vayan bien', () => {
    const lv = level('12');
    const graph = build(lv, { lb: 'lb', ...many('s', 2, 'server'), queue: 'queue', ...many('w', 2, 'worker') }, [
      ['users', 'lb'],
      ...fanOut('lb', ids('s', 2)),
      ...fanIn(ids('s', 2), 'queue'),
      ...fanOut('queue', ids('w', 2)),
    ]);
    const result = simulate(lv, graph);
    assert.ok(close(result.successRate, 1));
    assert.ok(close(result.jobSuccessRate ?? 0, 0.5));
    assert.match(result.problems[0].message, /cola sin parar/);
  });
});

describe('conexiones', () => {
  test('la caché es principal y la base de datos respaldo, en cualquier orden', () => {
    const graph = build(level('06'), { s1: 'server', cache: 'cache' }, [['db', 's1'], ['cache', 's1']]);
    const roles = edgeRoles(graph);
    assert.equal(roles.get('s1->cache'), 'primary');
    assert.equal(roles.get('s1->db'), 'fallback');
  });

  test('con caché, réplica y base de datos: principal, respaldo y escrituras', () => {
    const graph = build(level('08'), { s1: 'server', cache: 'cache', r1: 'replica' }, [['s1', 'db'], ['s1', 'r1'], ['s1', 'cache']]);
    const roles = edgeRoles(graph);
    assert.equal(roles.get('s1->cache'), 'primary');
    assert.equal(roles.get('s1->r1'), 'fallback');
    assert.equal(roles.get('s1->db'), 'write');
  });

  test('sin caché, la base de datos es el camino principal', () => {
    const graph = build(level('06'), { s1: 'server' }, [['s1', 'db']]);
    assert.deepEqual(resolvePorts(graph, 's1').primary.map((e) => e.to), ['db']);
  });

  test('los usuarios solo pueden tener una salida', () => {
    const graph = build(level('02'), { s1: 'server', s2: 'server' }, [['users', 's1']]);
    assert.equal(connect(graph, 'users', 's2').ok, false);
  });

  test('no se pueden conectar bloques incompatibles', () => {
    const graph = build(level('06'), { cache: 'cache' }, []);
    assert.equal(connect(graph, 'cache', 'db').ok, false);
  });
});
