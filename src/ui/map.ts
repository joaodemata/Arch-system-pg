import type { Stars } from '../engine/scoring';
import { COMING_SOON, levelsOf } from '../worlds';
import type { AnyWorld, Chapter, LevelInfo } from '../worlds/types';
import { starText } from './panels';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

type Best = Record<string, Stars>;

const starsOf = (levels: LevelInfo[], best: Best) => levels.reduce((sum, level) => sum + (best[level.id] ?? 0), 0);

interface CardOptions {
  color: string;
  icon: string;
  kicker: string;
  title: string;
  summary: string;
  stars: number | null;
  max: number;
  onClick: (() => void) | null;
}

function card(o: CardOptions): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = `chapter-card${o.onClick ? '' : ' soon'}`;
  el.disabled = !o.onClick;
  el.style.setProperty('--c', o.color);
  const progress = o.stars === null ? '' : `<div class="progress"><i style="width:${(o.stars / o.max) * 100}%"></i></div>`;
  const right = o.stars === null ? '<div class="chapter-stars soon-tag">Próximamente</div>' : `<div class="chapter-stars">★ ${o.stars}<small>/${o.max}</small></div>`;
  el.innerHTML = `
    <div class="chapter-badge">${o.icon}</div>
    <div class="chapter-info">
      <small>${o.kicker}</small>
      <b>${o.title}</b>
      <span>${o.summary}</span>
      ${progress}
    </div>
    ${right}`;
  if (o.onClick) el.onclick = o.onClick;
  return el;
}

/** Pantalla de inicio: un mundo por tipo de sistema (web, industrial…). */
export function renderWorldPicker(worlds: AnyWorld[], best: Best, onOpen: (world: AnyWorld) => void): void {
  const all = worlds.flatMap(levelsOf);
  $('#total-stars').textContent = `★ ${starsOf(all, best)} / ${all.length * 3}`;
  $('#world-list').replaceChildren(
    ...worlds.map((world) => {
      const levels = levelsOf(world);
      return card({
        color: world.color,
        icon: world.icon,
        kicker: `${world.chapters.length} ${world.chapters.length === 1 ? 'capítulo' : 'capítulos'} · ${levels.length} niveles`,
        title: world.name,
        summary: world.summary,
        stars: starsOf(levels, best),
        max: levels.length * 3,
        onClick: () => onOpen(world),
      });
    }),
    ...COMING_SOON.map((soon) => card({ ...soon, kicker: 'En construcción', title: soon.name, stars: null, max: 0, onClick: null })),
  );
}

/** Capítulos de un mundo. */
export function renderChapterMap(world: AnyWorld, best: Best, onOpen: (chapterIndex: number) => void): void {
  const screen = $('#screen-world');
  screen.style.setProperty('--c', world.color);
  $('#world-title').textContent = `${world.icon} ${world.name}`;
  const levels = levelsOf(world);
  $('#world-subtitle').textContent = `★ ${starsOf(levels, best)} / ${levels.length * 3}`;

  $('#chapter-list').replaceChildren(
    ...world.chapters.map((chapter, i) =>
      card({
        color: chapter.color,
        icon: chapter.icon,
        kicker: `Capítulo ${i + 1} · ${chapter.levels.length} niveles`,
        title: chapter.name,
        summary: chapter.summary,
        stars: starsOf(chapter.levels, best),
        max: chapter.levels.length * 3,
        onClick: () => onOpen(i),
      }),
    ),
  );
}

/** Columnas del camino serpenteante, en % del ancho. */
const PATH_X = [50, 76, 50, 24];
const ROW_HEIGHT = 120;

/** Pantalla de capítulo: los niveles como paradas en un camino serpenteante. */
export function renderLevelPath(world: AnyWorld, chapter: Chapter, chapterIndex: number, best: Best, onPlay: (level: LevelInfo) => void): void {
  const screen = $('#screen-chapter');
  screen.style.setProperty('--c', chapter.color);
  $('#chapter-title').textContent = `${chapter.icon} ${chapter.name}`;
  $('#chapter-subtitle').textContent = `${world.name} · Capítulo ${chapterIndex + 1} · ★ ${starsOf(chapter.levels, best)} / ${chapter.levels.length * 3}`;

  const firstNumber = levelsOf(world).indexOf(chapter.levels[0]) + 1;
  const nextUp = chapter.levels.findIndex((l) => !best[l.id]);
  const points = chapter.levels.map((_, i) => ({ x: PATH_X[i % PATH_X.length], y: ROW_HEIGHT / 2 + i * ROW_HEIGHT }));
  const height = points.length * ROW_HEIGHT;

  const container = $('#level-path');
  container.style.height = `${height}px`;

  // Curva suave entre paradas consecutivas.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const midY = (a.y + b.y) / 2;
    d += ` C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
  }
  const svg = `<svg class="path-line" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" class="path-bg" vector-effect="non-scaling-stroke"/>
    <path d="${d}" class="path-dash" vector-effect="non-scaling-stroke"/>
  </svg>`;

  const nodes = chapter.levels.map((level, i) => {
    const stars = best[level.id] ?? 0;
    const node = document.createElement('button');
    node.className = `level-node${stars ? ' done' : ''}${i === nextUp ? ' next' : ''}`;
    node.style.left = `${points[i].x}%`;
    node.style.top = `${points[i].y}px`;
    node.innerHTML = `
      <span class="bubble">${firstNumber + i}</span>
      <span class="node-stars">${stars ? starText(stars) : '☆☆☆'}</span>
      <span class="node-title">${level.title}</span>`;
    node.onclick = () => onPlay(level);
    return node;
  });

  container.innerHTML = svg;
  container.append(...nodes);
}
