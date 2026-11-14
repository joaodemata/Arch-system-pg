import { canopenWorld } from './canopen/world';
import type { AnyWorld, Chapter, LevelInfo } from './types';
import { webWorld } from './web';

/** Mundos jugables, en el orden en que aparecen en la pantalla de inicio. */
export const WORLDS: AnyWorld[] = [webWorld, canopenWorld];

/** Mundos anunciados que todavía no tienen niveles. */
export const COMING_SOON = [{ name: 'Web3', icon: '⛓️', summary: 'IPFS, Ethereum, nodos RPC e indexadores', color: '#f59e42' }];

export interface LevelRef {
  world: AnyWorld;
  chapterIndex: number;
  chapter: Chapter;
  level: LevelInfo;
  /** Posición del nivel dentro de su mundo (para numerarlo y pasar al siguiente). */
  index: number;
}

export function levelsOf(world: AnyWorld): LevelInfo[] {
  return world.chapters.flatMap((c) => c.levels);
}

export function findLevel(id: string): LevelRef | null {
  for (const world of WORLDS) {
    const all = levelsOf(world);
    for (const [chapterIndex, chapter] of world.chapters.entries()) {
      const level = chapter.levels.find((l) => l.id === id);
      if (level) return { world, chapterIndex, chapter, level, index: all.indexOf(level) };
    }
  }
  return null;
}

export function findWorld(id: string): AnyWorld | null {
  return WORLDS.find((w) => w.id === id) ?? null;
}
