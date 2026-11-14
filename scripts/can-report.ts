/**
 * Informe de los niveles CANopen: cómo se comporta la referencia y si hay algo más barato.
 * Uso: npx tsx scripts/can-report.ts
 */
import { simulateCan } from '../src/worlds/canopen/engine';
import { canopenLevels } from '../src/worlds/canopen/levels';
import { buildCanReference, canParCost, cheapestCan } from '../src/worlds/canopen/solver';

for (const level of canopenLevels) {
  const result = simulateCan(level, buildCanReference(level));
  const par = canParCost(level);
  const buses = result.buses.map((b) => `${b.master}@${b.kbps}k ${b.lengthM}/${b.maxLengthM} m carga ${(b.load * 100).toFixed(0)}%`).join(' | ');
  const worst = result.messages.map((m) => `${m.deviceId}:${m.message.label}=${m.responseMs?.toFixed(2)}/${m.deadlineMs}`).join(' ');
  console.log(`${level.id} ${level.title.padEnd(28)} ${result.meetsRequirements ? 'OK ' : 'KO '} par ${par} € · ${buses}`);
  console.log(`     ${worst}`);
  for (const p of result.problems) console.log(`     ⚠ ${p}`);
  const best = cheapestCan(level, Infinity);
  console.log(`     solver: ${best ? `${best.cost} €${best.cost < par ? '  ← MÁS BARATO QUE EL PAR' : ''}` : 'sin solución'}`);
  if (best && best.cost < par) console.log(`     ${best.graph.edges.map((e) => e.id).join(' ')}`);
}
