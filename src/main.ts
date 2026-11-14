import { Board } from './ui/board';
import type { Positions } from './ui/layout';
import { renderChapterMap, renderLevelPath, renderWorldPicker } from './ui/map';
import { renderBrief, renderInspector, renderLegend, renderPalette, showResultModal, toast } from './ui/panels';
import { loadBestStars, saveBestStars } from './ui/storage';
import { WORLDS, findLevel, findWorld, levelsOf, type LevelRef } from './worlds';
import { starsFor } from './worlds/scoring';
import type { AnyGraph } from './worlds/types';

const SIMULATION_ANIMATION_MS = 2800;

interface GameState {
  ref: LevelRef | null;
  graph: AnyGraph;
  positions: Positions;
  selectedId: string | null;
  result: unknown;
}

const state: GameState = { ref: null, graph: { nodes: [], edges: [] }, positions: new Map(), selectedId: null, result: null };
const bestStars = loadBestStars();

/** El nivel en juego; solo se llama con la pantalla de juego abierta. */
const current = () => state.ref!;

const board = new Board(document.querySelector('#board') as HTMLCanvasElement, {
  onNodeTap(id) {
    const { world, level } = current();
    const selected = state.selectedId;
    if (selected && selected !== id) {
      const result = world.connect(level, state.graph, selected, id);
      state.selectedId = null;
      if (result.ok) return applyEdit(result.graph);
      toast(result.error);
    } else {
      state.selectedId = selected === id ? null : id;
    }
    render();
  },
  onEdgeTap(id) {
    applyEdit(current().world.removeEdge(state.graph, id));
  },
  onDeleteTap(id) {
    state.positions.delete(id);
    state.selectedId = null;
    applyEdit(current().world.removeNode(state.graph, id));
  },
  onBackgroundTap() {
    state.selectedId = null;
    render();
  },
  onNodeMoved(id, point) {
    state.positions.set(id, point);
    renderBoard();
  },
});

function loadLevel(ref: LevelRef): void {
  board.stopAnimation();
  state.ref = ref;
  state.graph = ref.world.createGraph(ref.level);
  state.positions = ref.world.initialPositions(ref.level, state.graph);
  state.selectedId = null;
  state.result = null;
  renderLegend(ref.world.legend);
  render();
}

/** Cualquier cambio en la arquitectura invalida el último resultado. */
function applyEdit(graph: AnyGraph): void {
  board.stopAnimation();
  state.graph = graph;
  state.result = null;
  const { world, level } = current();
  world.arrange?.(level, graph, state.positions);
  render();
}

function addBlock(type: string): void {
  const { world, level } = current();
  const entry = world.palette(level, state.graph).find((e) => e.type === type);
  if (!entry || entry.left <= 0) return;
  const { graph, id } = world.addNode(level, state.graph, type);
  state.positions.set(id, world.placeNew(level, state.positions, type));
  applyEdit(graph);
}

function runSimulation(): void {
  if (board.isAnimating) return;
  const ref = current();
  const { world, level } = ref;
  state.selectedId = null;
  state.result = world.simulate(level, state.graph);
  render();

  const report = world.report(level, state.result);
  board.playSimulation(SIMULATION_ANIMATION_MS, () => {
    const par = world.par(level);
    const stars = starsFor(report.meetsRequirements, report.cost, par);
    if (stars > (bestStars[level.id] ?? 0)) {
      bestStars[level.id] = stars;
      saveBestStars(bestStars);
    }
    const next = levelsOf(world)[ref.index + 1];
    showResultModal({
      level,
      result: report,
      stars,
      par,
      costUnit: world.costUnit,
      onNext: next ? () => go(`#/nivel/${next.id}`) : null,
      onMap: () => go(chapterHash(ref)),
    });
  });
}

function renderBoard(): void {
  const { world, level } = current();
  board.update({ scene: world.scene(level, state.graph, state.result), positions: state.positions, selectedId: state.selectedId });
}

function render(): void {
  const { world, level, index } = current();
  renderBrief(level, index + 1, world.chips(level));
  renderPalette(world.palette(level, state.graph), addBlock);
  renderInspector(state.selectedId ? world.inspector(level, state.graph, state.selectedId) : null, world.inspectorHint, applyEdit);
  renderBoard();
}

// --- Navegación: #/ (mundos) · #/mundo/ID · #/mundo/ID/N (capítulo) · #/nivel/ID ---

type Screen = 'home' | 'world' | 'chapter' | 'game';

const chapterHash = (ref: LevelRef) => `#/mundo/${ref.world.id}/${ref.chapterIndex + 1}`;

function show(screen: Screen): void {
  for (const el of document.querySelectorAll<HTMLElement>('.screen')) el.classList.toggle('active', el.id === `screen-${screen}`);
  window.scrollTo(0, 0);
}

function go(hash: string): void {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route(): void {
  board.stopAnimation();
  document.querySelector('#modal')?.classList.remove('show');
  const [, kind, param, sub] = location.hash.split('/');

  if (kind === 'nivel') {
    const ref = findLevel(decodeURIComponent(param ?? ''));
    if (ref) {
      show('game');
      board.resize(); // el canvas no tenía tamaño mientras su pantalla estaba oculta
      loadLevel(ref);
      return;
    }
  }

  // Enlaces antiguos (#/capitulo/N) apuntaban a los capítulos web.
  const [worldId, chapterParam] = kind === 'capitulo' ? ['web', param] : [param, sub];
  const world = kind === 'mundo' || kind === 'capitulo' ? findWorld(worldId ?? '') : null;
  if (world) {
    const chapterIndex = Number(chapterParam) - 1;
    const chapter = world.chapters[chapterIndex];
    if (chapter) {
      renderLevelPath(world, chapter, chapterIndex, bestStars, (level) => go(`#/nivel/${level.id}`));
      show('chapter');
      return;
    }
    // Un mundo con un solo capítulo va directo a su camino de niveles.
    // (replace, para que el botón atrás del navegador no vuelva a caer en la redirección).
    if (world.chapters.length === 1 && chapterParam === undefined) return location.replace(`#/mundo/${world.id}/1`);
    renderChapterMap(world, bestStars, (i) => go(`#/mundo/${world.id}/${i + 1}`));
    show('world');
    return;
  }

  renderWorldPicker(WORLDS, bestStars, (w) => go(`#/mundo/${w.id}`));
  show('home');
}

const button = (selector: string) => document.querySelector(selector) as HTMLButtonElement;
button('#run').onclick = runSimulation;
button('#reset').onclick = () => loadLevel(current());
button('#back-home').onclick = () => go('#/');
button('#back-world').onclick = () => {
  const [, , worldId] = location.hash.split('/');
  const world = findWorld(worldId ?? '');
  // Si el mundo tiene un solo capítulo, su pantalla de capítulos se salta: volver al inicio.
  go(world && world.chapters.length > 1 ? `#/mundo/${world.id}` : '#/');
};
button('#back-chapter').onclick = () => go(chapterHash(current()));
window.addEventListener('hashchange', route);
route();
