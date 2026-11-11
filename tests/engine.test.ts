import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { connect, createLevelGraph, edgeRoles, resolvePorts } from '../src/engine/graph';
import { buildReferenceGraph, parCost, scoreResult } from '../src/engine/scoring';
import { simulate } from '../src/engine/simulate';
import type { BlockType, Graph, Level } from '../src/engine/types';
import { LEVELS } from '../src/levels';
import { level02 } from '../src/levels/level-02';
import { level03 } from '../src/levels/level-03';

/** Construye un grafo a partir del nivel, unos bloques y unas conexiones. */
function build(level: Level, blocks: Record<string, BlockType>, links: [string, string][]): Graph {
  let graph = createLevelGraph(level);
  for (const [id, type] of Object.entries(blocks)) graph = { ...graph, nodes: [...graph.nodes, { id, type }] };
  for (const [a, b] of links) {
    const r = connect(graph, a, b);
    if (!r.ok) throw new Error(r.error);
    graph = r.graph;
  }
  return graph;
}

describe('niveles', () => {
  for (const level of LEVELS) {
    test(`nivel ${level.id}: la solución de referencia consigue 3 estrellas`, () => {
      const result = simulate(level, buildReferenceGraph(level));
      assert.equal(result.meetsRequirements, true, result.problems.map((p) => p.message).join('\n'));
      assert.equal(scoreResult(result, parCost(level)), 3);
    });

    test(`nivel ${level.id}: la referencia cabe en la paleta`, () => {
      for (const type of Object.values(level.reference.blocks)) {
        const used = Object.values(level.reference.blocks).filter((t) => t === type).length;
        assert.ok(used <= (level.palette[type] ?? 0), `faltan bloques de tipo ${type}`);
      }
    });
  }
});

describe('nivel 2', () => {
  const lbWith = (n: number) => {
    const servers = Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i + 1}`, 'server' as const]));
    return build(level02, { lb: 'lb', ...servers }, [['users', 'lb'], ...Object.keys(servers).map((s): [string, string] => ['lb', s])]);
  };

  test('con 2 servidores se saturan', () => {
    const result = simulate(level02, lbWith(2));
    assert.equal(result.meetsRequirements, false);
    assert.ok(Math.abs(result.successRate - 0.8) < 1e-6);
    assert.match(result.problems[0].message, /saturado/);
  });

  test('con 4 servidores funciona pero cuesta más: 2 estrellas', () => {
    const result = simulate(level02, lbWith(4));
    assert.equal(scoreResult(result, parCost(level02)), 2);
  });
});

describe('nivel 3: cache-aside', () => {
  const base = { lb: 'lb', s1: 'server', s2: 'server', s3: 'server', cache: 'cache' } as const;
  const front: [string, string][] = [['users', 'lb'], ['lb', 's1'], ['lb', 's2'], ['lb', 's3']];
  const toCache: [string, string][] = [['s1', 'cache'], ['s2', 'cache'], ['s3', 'cache']];

  test('si solo un servidor tiene respaldo, los otros pierden sus fallos de caché', () => {
    const graph = build(level03, base, [...front, ...toCache, ['s1', 'db']]);
    const result = simulate(level03, graph);
    assert.equal(result.meetsRequirements, false);
    const messages = result.problems.map((p) => p.message).join('\n');
    assert.match(messages, /Servidor 2 no tiene ruta de respaldo/);
    assert.match(messages, /Servidor 3 no tiene ruta de respaldo/);
    assert.doesNotMatch(messages, /Servidor 1/);
    // 2 de 3 servidores pierden el 20 % de lo que reciben.
    assert.ok(Math.abs(result.successRate - (1 - (2 / 3) * 0.2)) < 1e-6);
  });

  test('sin caché, la base de datos se satura', () => {
    const graph = build(level03, base, [...front, ['s1', 'db'], ['s2', 'db'], ['s3', 'db']]);
    const result = simulate(level03, graph);
    assert.equal(result.meetsRequirements, false);
    assert.match(result.problems[0].message, /Base de datos saturada/);
  });

  test('un servidor sin datos no puede responder', () => {
    const graph = build(level03, base, [...front, ['s1', 'cache'], ['s1', 'db'], ['s2', 'cache'], ['s2', 'db']]);
    const result = simulate(level03, graph);
    assert.match(result.problems.map((p) => p.message).join('\n'), /Servidor 3 no tiene de dónde sacar los datos/);
  });

  test('con respaldo completo, la base de datos solo recibe los fallos de caché', () => {
    const result = simulate(level03, buildReferenceGraph(level03));
    assert.ok(Math.abs(result.nodes.db.load - 50) < 1e-6);
    assert.ok(Math.abs(result.nodes.cache.load - 250) < 1e-6);
  });
});

describe('conexiones', () => {
  test('la caché es principal y la base de datos respaldo, en cualquier orden', () => {
    const graph = build(level03, { s1: 'server', cache: 'cache' }, [['db', 's1'], ['cache', 's1']]);
    const roles = edgeRoles(graph);
    assert.equal(roles.get('s1->cache'), 'primary');
    assert.equal(roles.get('s1->db'), 'fallback');
  });

  test('sin caché, la base de datos es el camino principal', () => {
    const graph = build(level03, { s1: 'server' }, [['s1', 'db']]);
    assert.deepEqual(resolvePorts(graph, 's1').primary.map((e) => e.to), ['db']);
  });

  test('los usuarios solo pueden tener una salida', () => {
    const graph = build(level02, { s1: 'server', s2: 'server' }, [['users', 's1']]);
    const r = connect(graph, 'users', 's2');
    assert.equal(r.ok, false);
  });

  test('no se pueden conectar bloques incompatibles', () => {
    const graph = build(level03, { cache: 'cache' }, []);
    const r = connect(graph, 'cache', 'db');
    assert.equal(r.ok, false);
  });
});
