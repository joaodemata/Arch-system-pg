import type { Stars } from '../engine/scoring';

const KEY = 'arch-system-pg:best-stars';

/** Mejores estrellas por nivel, guardadas solo en este navegador. */
export function loadBestStars(): Record<string, Stars> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveBestStars(best: Record<string, Stars>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(best));
  } catch {
    // Sin almacenamiento disponible: el progreso dura lo que la pestaña.
  }
}
