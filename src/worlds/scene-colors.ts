import type { NodeStatus } from './types';

/** Colores del tablero compartidos por todos los mundos. */
export const BOARD_COLOR = {
  primary: '#7d93ff',
  primaryIdle: '#56608f',
  fallback: '#f59e42',
  write: '#34d399',
  async: '#c084fc',
  inactive: '#3a4060',
  request: '#9fe8c3',
  bad: '#ff5d6c',
  can: '#2dd4bf',
  canIdle: '#2a8f86',
  frame: '#a7f3d0',
};

export function statusFromUtilization(u: number): NodeStatus {
  return u > 1 ? 'bad' : u > 0.8 ? 'warn' : 'ok';
}
