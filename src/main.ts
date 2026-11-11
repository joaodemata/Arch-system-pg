import { addNode, connect, createLevelGraph, removeEdge, removeNode } from './engine/graph';
import { parCost, scoreResult } from './engine/scoring';
import { simulate, type SimulationResult } from './engine/simulate';
import type { BlockType, Graph } from './engine/types';
import { LEVELS } from './levels';
import { Board } from './ui/board';
import { initialPositions, placeNew, type Positions } from './ui/layout';
import { remaining, renderBrief, renderLevelTabs, renderPalette, showResultModal, toast } from './ui/panels';
import { loadBestStars, saveBestStars } from './ui/storage';

const SIMULATION_ANIMATION_MS = 2800;

interface GameState {
  levelIndex: number;
  graph: Graph;
  positions: Positions;
  selectedId: string | null;
  result: SimulationResult | null;
}

const state: GameState = {
  levelIndex: 0,
  graph: { nodes: [], edges: [] },
  positions: new Map(),
  selectedId: null,
  result: null,
};
const bestStars = loadBestStars();

const currentLevel = () => LEVELS[state.levelIndex];

const board = new Board(document.querySelector('#board') as HTMLCanvasElement, {
  onNodeTap(id) {
    const selected = state.selectedId;
    if (selected && selected !== id) {
      const result = connect(state.graph, selected, id);
      state.selectedId = null;
      if (result.ok) return applyEdit(result.graph);
      toast(result.error);
    } else {
      state.selectedId = selected === id ? null : id;
    }
    render();
  },
  onEdgeTap(id) {
    applyEdit(removeEdge(state.graph, id));
  },
  onDeleteTap(id) {
    state.positions.delete(id);
    state.selectedId = null;
    applyEdit(removeNode(state.graph, id));
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

function loadLevel(index: number): void {
  board.stopAnimation();
  state.levelIndex = index;
  state.graph = createLevelGraph(currentLevel());
  state.positions = initialPositions(state.graph);
  state.selectedId = null;
  state.result = null;
  render();
}

/** Cualquier cambio en la arquitectura invalida el último resultado. */
function applyEdit(graph: Graph): void {
  board.stopAnimation();
  state.graph = graph;
  state.result = null;
  render();
}

function addBlock(type: BlockType): void {
  if (remaining(currentLevel(), state.graph, type) <= 0) return;
  const { graph, node } = addNode(state.graph, type);
  state.positions.set(node.id, placeNew(state.positions, type));
  applyEdit(graph);
}

function runSimulation(): void {
  if (board.isAnimating) return;
  const level = currentLevel();
  state.selectedId = null;
  state.result = simulate(level, state.graph);
  renderBoard();

  const result = state.result;
  board.playSimulation(SIMULATION_ANIMATION_MS, () => {
    const par = parCost(level);
    const stars = scoreResult(result, par);
    if (stars > (bestStars[level.id] ?? 0)) {
      bestStars[level.id] = stars;
      saveBestStars(bestStars);
      renderTabs();
    }
    const hasNext = state.levelIndex < LEVELS.length - 1;
    showResultModal({ level, result, stars, par, onNext: hasNext ? () => loadLevel(state.levelIndex + 1) : null });
  });
}

function renderBoard(): void {
  board.update({
    graph: state.graph,
    positions: state.positions,
    selectedId: state.selectedId,
    result: state.result,
    trafficRps: currentLevel().trafficRps,
  });
}

function renderTabs(): void {
  renderLevelTabs(LEVELS, state.levelIndex, bestStars, loadLevel);
}

function render(): void {
  const level = currentLevel();
  renderTabs();
  renderBrief(level, state.levelIndex, parCost(level));
  renderPalette(level, state.graph, addBlock);
  renderBoard();
}

(document.querySelector('#run') as HTMLButtonElement).onclick = runSimulation;
(document.querySelector('#reset') as HTMLButtonElement).onclick = () => loadLevel(state.levelIndex);
loadLevel(0);
