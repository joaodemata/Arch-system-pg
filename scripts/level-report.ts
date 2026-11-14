/**
 * Informe de diseño de niveles: cómo se comporta la solución de referencia de cada uno.
 * Uso: npx tsx scripts/level-report.ts
 */
import { buildReferenceGraph, parCost, scoreResult } from '../src/engine/scoring';
import { simulate } from '../src/engine/simulate';
import { LEVELS } from '../src/levels';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

for (const level of LEVELS) {
  const result = simulate(level, buildReferenceGraph(level));
  const stars = scoreResult(result, parCost(level));
  const maxUse = Math.max(...Object.values(result.nodes).map((n) => n.utilization));
  const jobs = result.jobSuccessRate === null ? '' : ` trabajos ${pct(result.jobSuccessRate)}`;
  const scenarios = result.scenarios.length ? ` escenarios ${result.scenarios.filter((s) => s.passed).length}/${result.scenarios.length}` : '';
  console.log(
    `${level.id} ${level.title.padEnd(32)} ${'★'.repeat(stars).padEnd(3)} par ${String(parCost(level)).padStart(3)} € · éxito ${pct(result.successRate)}${jobs} · ${Math.round(result.avgLatencyMs)}/${level.requirements.maxAvgLatencyMs} ms · uso máx ${pct(maxUse)}${scenarios}`,
  );
  for (const p of result.problems) console.log(`     ⚠ ${p.message}`);
}
