import type { Stars } from '../engine/scoring';
import type { AnyGraph, GameResult, Inspector, LevelInfo, PaletteEntry } from '../worlds/types';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

export function renderBrief(level: LevelInfo, number: number, chips: string[]): void {
  $('#level-chapter').textContent = level.chapter;
  $('#level-title').textContent = `${number} · ${level.title}`;
  $('#level-brief').textContent = level.brief;
  $('#level-chips').replaceChildren(...chips.map((text) => Object.assign(document.createElement('span'), { className: 'chip', textContent: text })));
}

export function renderLegend(html: string): void {
  $('#legend').innerHTML = html;
}

export function renderPalette(entries: PaletteEntry[], onAdd: (type: string) => void): void {
  $('#palette').replaceChildren(
    ...entries.map((entry) => {
      const button = document.createElement('button');
      button.className = 'palette-item';
      button.disabled = entry.left <= 0;
      button.innerHTML = `<b>${entry.title} ×${entry.left}</b><span>${entry.detail}</span>`;
      button.onclick = () => onAdd(entry.type);
      return button;
    }),
  );
}

/** Panel de ajustes del bloque seleccionado (velocidad del bus, node-ID…). */
export function renderInspector(inspector: Inspector | null, hint: string | null, onApply: (graph: AnyGraph) => void): void {
  const panel = $('#inspector');
  panel.hidden = hint === null;
  if (!inspector) {
    panel.innerHTML = hint ? `<p class="inspector-hint">👆 ${hint}</p>` : '';
    return;
  }
  panel.innerHTML = `<h4>${inspector.title}</h4>${inspector.html}`;
  const field = inspector.field;
  if (!field) return;
  const label = document.createElement('label');
  label.className = 'field';
  label.textContent = field.label;
  const select = document.createElement('select');
  for (const option of field.options) select.append(new Option(option.label, String(option.value), false, option.value === field.value));
  select.onchange = () => onApply(field.apply(Number(select.value)));
  label.append(select);
  panel.append(label);
}

export interface ResultModalOptions {
  level: LevelInfo;
  result: GameResult;
  stars: Stars;
  par: number;
  costUnit: string;
  onNext: (() => void) | null;
  onMap: () => void;
}

export function showResultModal({ level, result, stars, par, costUnit, onNext, onMap }: ResultModalOptions): void {
  const metric = (m: GameResult['metrics'][number]) => `<div class="metric ${m.good ? 'good' : 'bad'}"><b>${m.value}</b><span>${m.label}</span></div>`;

  let html = `<h3>${result.meetsRequirements ? '¡Funciona! 🎉' : 'No funciona 💥'}</h3>`;
  html += `<div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>`;
  html += `<div class="metrics">${result.metrics.map(metric).join('')}</div>`;
  if (result.details) {
    const rows = result.details.lines.map((l) => `<li class="${l.ok ? 'ok' : 'ko'}">${l.ok ? '✅' : '❌'} ${l.text}</li>`);
    html += `<p class="note">${result.details.title}</p><ul class="scenarios">${rows.join('')}</ul>`;
  }

  if (!result.meetsRequirements) {
    const items = result.problems.slice(0, 6).map((p) => `<li>${p}</li>`);
    html += `<ul class="problems">${items.join('') || '<li>Revisa las conexiones.</li>'}</ul>`;
  } else {
    if (stars < 3) html += `<p class="note">Funciona, pero hay una solución que cuesta ${par} ${costUnit}.</p>`;
    else if (result.cost < par) html += `<p class="note">¡Más barato que la solución de referencia!</p>`;
    html += `<div class="lesson">💡 ${level.lesson}</div>`;
  }

  html += `<div class="actions"><button class="btn ghost" id="modal-map" title="Volver al capítulo">🗺️</button><button class="btn ghost" id="modal-close">Seguir editando</button>`;
  if (result.meetsRequirements && onNext) html += `<button class="btn primary" id="modal-next">Siguiente nivel →</button>`;
  html += `</div>`;

  const modal = $('#modal');
  $('#modal-card').innerHTML = html;
  modal.classList.add('show');
  $('#modal-close').onclick = () => modal.classList.remove('show');
  $('#modal-map').onclick = () => {
    modal.classList.remove('show');
    onMap();
  };
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
