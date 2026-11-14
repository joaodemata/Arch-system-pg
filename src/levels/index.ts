import type { Level } from '../engine/types';
import { fundamentos } from './chapter-1-fundamentos';
import { datos } from './chapter-2-datos';
import { global } from './chapter-3-global';
import { asincrono } from './chapter-4-asincrono';
import { resiliencia } from './chapter-5-resiliencia';
import { casosReales } from './chapter-6-casos-reales';

export interface Chapter {
  name: string;
  icon: string;
  summary: string;
  /** Color principal del capítulo en el mapa. */
  color: string;
  levels: Level[];
}

/** Orden de juego. Para añadir un nivel: añadirlo al capítulo que toque (o crear uno nuevo). */
export const CHAPTERS: Chapter[] = [
  { name: 'Fundamentos', icon: '🖥️', summary: 'Servidores, balanceadores y redundancia', color: '#6c8cff', levels: fundamentos },
  { name: 'Datos', icon: '🗄️', summary: 'Bases de datos, cachés y réplicas', color: '#3ecf8e', levels: datos },
  { name: 'Global', icon: '🌍', summary: 'CDN y latencia por distancia', color: '#38bdf8', levels: global },
  { name: 'Asíncrono', icon: '📬', summary: 'Colas y workers para trabajo pesado', color: '#c084fc', levels: asincrono },
  { name: 'Resiliencia', icon: '🛡️', summary: 'Sobrevivir a las caídas', color: '#f59e42', levels: resiliencia },
  { name: 'Casos reales', icon: '🏆', summary: 'Tienda, red social, Black Friday, vídeo', color: '#ff5d8f', levels: casosReales },
];

export const LEVELS: Level[] = CHAPTERS.flatMap((c) => c.levels);
