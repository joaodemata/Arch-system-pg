import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addCanNode, connectCan, createCanGraph, removeCanEdge, setConfig, simulateCan } from '../src/worlds/canopen/engine';
import { canopenLevels } from '../src/worlds/canopen/levels';
import { frameBits, type CanLevel } from '../src/worlds/canopen/model';
import { buildCanReference, canParCost, cheapestCan } from '../src/worlds/canopen/solver';
import { WORLDS, levelsOf } from '../src/worlds';
import { starsFor } from '../src/worlds/scoring';
import type { AnyGraph } from '../src/worlds/types';

const level = (id: string): CanLevel => {
  const found = canopenLevels.find((l) => l.id === id);
  if (!found) throw new Error(`No existe el nivel ${id}`);
  return found;
};

function link(graph: AnyGraph, a: string, b: string): AnyGraph {
  const r = connectCan(graph, a, b);
  if (!r.ok) throw new Error(r.error);
  return r.graph;
}

const problems = (lv: CanLevel, g: AnyGraph) => simulateCan(lv, g).problems.join('\n');

describe('niveles CANopen', () => {
  test('los ids de nivel son únicos entre todos los mundos', () => {
    const ids = WORLDS.flatMap(levelsOf).map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  for (const lv of canopenLevels) {
    describe(`${lv.id} · ${lv.title}`, () => {
      test('la solución de referencia consigue 3 estrellas', () => {
        const result = simulateCan(lv, buildCanReference(lv));
        assert.equal(result.meetsRequirements, true, result.problems.join('\n'));
        assert.equal(starsFor(result.meetsRequirements, result.cost, canParCost(lv)), 3);
      });

      test('la referencia cabe en la paleta', () => {
        const used = Object.values(lv.reference.blocks);
        for (const type of new Set(used)) {
          assert.ok(used.filter((t) => t === type).length <= (lv.palette[type] ?? 0), `faltan bloques de tipo ${type}`);
        }
      });

      test('no hay una solución más barata que el par', () => {
        const cheaper = cheapestCan(lv, canParCost(lv));
        assert.equal(cheaper, null, cheaper ? `hay una de ${cheaper.cost} €: ${cheaper.graph.edges.map((e) => e.id).join(' ')}` : '');
      });

      test('tal como empieza, el nivel no está resuelto', () => {
        assert.equal(simulateCan(lv, createCanGraph(lv)).meetsRequirements, false);
      });
    });
  }
});

describe('reglas del bus', () => {
  const lv = level('can-01');
  const withTerms = () => {
    let g = createCanGraph(lv);
    g = addCanNode(lv, g, 'term').graph;
    g = addCanNode(lv, g, 'term').graph;
    return g;
  };

  test('una trama de 8 bytes ocupa 135 bits en el peor caso', () => {
    assert.equal(frameBits(8), 135);
    assert.equal(frameBits(0), 55);
  });

  test('sin terminadores el bus no funciona', () => {
    const g = link(createCanGraph(lv), 'plc', 'drive');
    const result = simulateCan(lv, g);
    assert.equal(result.meetsRequirements, false);
    assert.match(result.problems[0], /no está terminado/);
  });

  test('con un solo terminador tampoco', () => {
    const g = link(link(withTerms(), 'term-1', 'plc'), 'plc', 'drive');
    assert.match(problems(lv, g), /falta la resistencia de 120 Ω en un extremo/);
  });

  test('un equipo solo tiene dos conectores: no se puede hacer una estrella', () => {
    let g = link(withTerms(), 'term-1', 'plc');
    g = link(g, 'plc', 'drive');
    const r = connectCan(g, 'plc', 'term-2');
    assert.equal(r.ok, false);
  });

  test('un terminador va en un único extremo', () => {
    const g = link(withTerms(), 'term-1', 'plc');
    assert.equal(connectCan(g, 'term-1', 'drive').ok, false);
  });

  test('no se puede cerrar el bus en anillo', () => {
    const lv3 = level('can-03');
    let g = link(createCanGraph(lv3), 'plc', 'robot1');
    g = link(g, 'robot1', 'hmi');
    const r = connectCan(g, 'hmi', 'plc');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /anillo/);
  });

  test('quitar un cable vuelve a dejar el conector libre', () => {
    let g = link(withTerms(), 'term-1', 'plc');
    g = link(g, 'plc', 'drive');
    g = removeCanEdge(g, 'plc~drive');
    assert.equal(connectCan(g, 'plc', 'drive').ok, true);
  });
});

describe('velocidad y longitud (can-02)', () => {
  const lv = level('can-02');

  test('a 500 kbit/s el bus de 135 m es demasiado largo', () => {
    const g = setConfig(buildCanReference(lv), 'plc', 'kbps', 500);
    assert.match(problems(lv, g), /mide 135 m y a 500 kbit\/s el máximo son 100 m/);
  });

  test('a 125 kbit/s cabe, pero la carga pasa del 70 %', () => {
    const g = setConfig(buildCanReference(lv), 'plc', 'kbps', 125);
    const result = simulateCan(lv, g);
    assert.equal(result.meetsRequirements, false);
    assert.ok(result.buses[0].load > 0.7);
  });
});

describe('prioridad por node-ID (can-04)', () => {
  const lv = level('can-04');

  test('con los node-ID de fábrica el encoder llega tarde', () => {
    let g = buildCanReference(lv);
    g = setConfig(setConfig(g, 'encoder', 'nodeId', 12), 'bms', 'nodeId', 1);
    assert.match(problems(lv, g), /Encoder · Posición \(COB-ID 0x18C\) tarda/);
  });

  test('dos equipos con el mismo node-ID tumban el bus', () => {
    const g = setConfig(buildCanReference(lv), 'bms', 'nodeId', 1);
    assert.match(problems(lv, g), /mismo node-ID \(1\)/);
  });

  test('subir a 1 Mbit/s no vale: el encoder no lo soporta', () => {
    const g = setConfig(buildCanReference(lv), 'plc', 'kbps', 1000);
    assert.match(problems(lv, g), /solo admite hasta 500 kbit\/s/);
  });
});

describe('dos interfaces (can-05)', () => {
  const lv = level('can-05');

  test('no se pueden unir dos interfaces CAN en el mismo bus', () => {
    let g = addCanNode(lv, createCanGraph(lv), 'can2').graph;
    g = link(g, 'plc', 'd2');
    g = link(g, 'can2-1', 'd3');
    const r = connectCan(g, 'd2', 'd3');
    assert.equal(r.ok, false);
  });
});
