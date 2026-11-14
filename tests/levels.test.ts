import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cheapestCanonical } from '../scripts/solver';
import { buildReferenceGraph, parCost, scoreResult } from '../src/engine/scoring';
import { simulate } from '../src/engine/simulate';
import { LEVELS } from '../src/levels';

describe('niveles', () => {
  test('los ids son únicos', () => {
    assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
  });

  for (const level of LEVELS) {
    describe(`${level.id} · ${level.title}`, () => {
      test('la solución de referencia consigue 3 estrellas', () => {
        const result = simulate(level, buildReferenceGraph(level));
        assert.equal(result.meetsRequirements, true, result.problems.map((p) => p.message).join('\n'));
        assert.equal(scoreResult(result, parCost(level)), 3);
      });

      test('la referencia cabe en la paleta', () => {
        const used = Object.values(level.reference.blocks);
        for (const type of new Set(used)) {
          const count = used.filter((t) => t === type).length;
          assert.ok(count <= (level.palette[type] ?? 0), `faltan bloques de tipo ${type}`);
        }
      });

      test('no hay una solución canónica más barata que el par', () => {
        const best = cheapestCanonical(level);
        assert.ok(best, 'el buscador no encuentra ninguna solución');
        assert.ok(best.cost >= parCost(level), `hay una solución de ${best.cost} € con ${JSON.stringify(best.counts)}`);
      });
    });
  }
});
