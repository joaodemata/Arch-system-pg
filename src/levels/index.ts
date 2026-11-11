import type { Level } from '../engine/types';
import { level01 } from './level-01';
import { level02 } from './level-02';
import { level03 } from './level-03';

/** Orden de juego. Para añadir un nivel: crear `level-XX.ts` y añadirlo aquí. */
export const LEVELS: Level[] = [level01, level02, level03];
