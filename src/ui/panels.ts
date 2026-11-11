import { BLOCKS } from '../engine/catalog';
import { countPlaced } from '../engine/graph';
import type { SimulationResult } from '../engine/simulate';
import type { Stars } from '../engine/scoring';
import type { BlockType, Graph, Level } from '../engine/types';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

export function renderLevelTabs(levels: Level[], current: number, best: Record<string, Stars>, onSelect: (i: number) => void): void {
  const container = $('#levels');
  container.replaceChildren(
    ...levels.map((level, i) => {
      const button = document.createElement('button');
      button.className = `level-tab${i === current ? ' active' : ''}`;
      button.textContent = `Nivel ${i + 1}`;
      const stars = best[level.id];
      if (stars) {
        const small = document.createElement('small');
        small.textContent = starText(stars);
        button.append(small);
      }
      button.onclick = () => onSelect(i);
      return button;
    }),
  );
}

export function renderBrief(level: Level, index: number, par: number): void {
  $('#level-title').textContent = `${index + 1} · ${level.title}`;
  $('#level-brief').textContent = level.brief;
  const { minSuccessRate, maxAvgLatencyMs } = level.requirements;
  const chips = [
    `🚦 ${level.trafficRps} peticiones/s`,
    `✅ ≥ ${minSuccessRate * 100} % respondidas`,
    `⏱ ≤ ${maxAvgLatencyMs} ms de media`,
    `💰 par: ${par} €/mes`,
  ];
  $('#level-chips').replaceChildren(...chips.map((text) => Object.assign(document.createElement('span'), { className: 'chip', textContent: text })));
}

export function remaining(level: Level, graph: Graph, type: BlockType): number {
  return (level.palette[type] ?? 0) - countPlaced(graph, type);
}

export function renderPalette(level: Level, graph: Graph, onAdd: (type: BlockType) => void): void {
  const types = Object.keys(level.palette) as BlockType[];
  $('#palette').replaceChildren(
    ...types.map((type) => {
      const spec = BLOCKS[type];
      const left = remaining(level, graph, type);
      const button = document.createElement('button');
      button.className = 'palette-item';
      button.disabled = left <= 0;
      const hit = spec.hitRate ? ` · ${spec.hitRate * 100} % aciertos` : '';
      button.innerHTML = `<b>${spec.icon} ${spec.label} ×${left}</b><span>${spec.capacity}/s · ${spec.latencyMs} ms · ${spec.costPerMonth} €/mes${hit}</span>`;
      button.onclick = () => onAdd(type);
      return button;
    }),
  );
}

export interface ResultModalOptions {
  level: Level;
  result: SimulationResult;
  stars: Stars;
  par: number;
  onNext: (() => void) | null;
}

export function showResultModal({ level, result, stars, par, onNext }: ResultModalOptions): void {
  const { minSuccessRate, maxAvgLatencyMs } = level.requirements;
  const metric = (value: string, label: string, good: boolean) =>
    `<div class="metric ${good ? 'good' : 'bad'}"><b>${value}</b><span>${label}</span></div>`;

  let html = `<h3>${result.meetsRequirements ? '¡Aguanta! 🎉' : 'No aguanta 💥'}</h3>`;
  html += `<div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>`;
  html += `<div class="metrics">
    ${metric(`${(result.successRate * 100).toFixed(1)} %`, 'respondidas', result.successRate >= minSuccessRate)}
    ${metric(`${Math.round(result.avgLatencyMs)} ms`, 'latencia media', result.avgLatencyMs <= maxAvgLatencyMs)}
    ${metric(`${result.monthlyCost} €`, 'coste/mes', result.monthlyCost <= par)}
  </div>`;

  if (!result.meetsRequirements) {
    const items = result.problems.map((p) => `<li>${p.message}${p.lostRps > 0 ? ` <em>(−${Math.round(p.lostRps)}/s)</em>` : ''}</li>`);
    html += `<ul class="problems">${items.join('') || '<li>Revisa las conexiones.</li>'}</ul>`;
  } else {
    if (stars < 3) html += `<p class="note">Funciona, pero hay una solución que cuesta ${par} €/mes.</p>`;
    else if (result.monthlyCost < par) html += `<p class="note">¡Más barato que la solución de referencia!</p>`;
    html += `<div class="lesson">💡 ${level.lesson}</div>`;
  }

  html += `<div class="actions"><button class="btn ghost" id="modal-close">Seguir editando</button>`;
  if (result.meetsRequirements && onNext) html += `<button class="btn primary" id="modal-next">Siguiente nivel →</button>`;
  html += `</div>`;

  const modal = $('#modal');
  $('#modal-card').innerHTML = html;
  modal.classList.add('show');
  $('#modal-close').onclick = () => modal.classList.remove('show');
  const next = document.querySelector<HTMLButtonElement>('#modal-next');
  if (next && onNext) {
    next.onclick = () => {
      modal.classList.remove('show');
      onNext();
    };
  }
}

let toastTimer: number | undefined;
export function toast(message: string): void {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}
