import type { Level } from '../engine/types';
import { fundamentos } from './chapter-1-fundamentos';
import { datos } from './chapter-2-datos';
import { global } from './chapter-3-global';
import { asincrono } from './chapter-4-asincrono';
import { resiliencia } from './chapter-5-resiliencia';
import { casosReales } from './chapter-6-casos-reales';

/** Orden de juego. Para añadir un nivel: añadirlo al capítulo que toque (o crear uno nuevo). */
export const LEVELS: Level[] = [...fundamentos, ...datos, ...global, ...asincrono, ...resiliencia, ...casosReales];
