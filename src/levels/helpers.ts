import type { BlockType } from '../engine/types';

type Link = [from: string, to: string];

/** `many('s', 3, 'server')` → `{ s1: 'server', s2: 'server', s3: 'server' }`. */
export function many(prefix: string, count: number, type: BlockType): Record<string, BlockType> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i + 1}`, type]));
}

/** Conecta `from` con cada uno de `targets`. */
export function fanOut(from: string, targets: string[]): Link[] {
  return targets.map((to) => [from, to]);
}

/** Conecta cada uno de `sources` con `to`. */
export function fanIn(sources: string[], to: string): Link[] {
  return sources.map((from) => [from, to]);
}

/** Ids generados por `many`: `ids('s', 3)` → `['s1', 's2', 's3']`. */
export function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}
