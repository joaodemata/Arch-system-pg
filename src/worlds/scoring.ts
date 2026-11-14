import { TWO_STAR_COST_MARGIN, type Stars } from '../engine/scoring';

/** Estrellas de cualquier mundo: cumplir los requisitos y no pasarse del coste de referencia. */
export function starsFor(meetsRequirements: boolean, cost: number, par: number): Stars {
  if (!meetsRequirements) return 0;
  if (cost <= par) return 3;
  if (cost <= par * TWO_STAR_COST_MARGIN) return 2;
  return 1;
}
