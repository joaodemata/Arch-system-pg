import { BLOCKS } from '../engine/catalog';
import { displayName, edgeRoles } from '../engine/graph';
import type { SimulationResult } from '../engine/simulate';
import type { Graph, GraphEdge, PortRole } from '../engine/types';
import type { BoardPoint, Positions } from './layout';

const NODE_W = 112;
const NODE_H = 62;
const MARGIN = 6;
const DELETE_RADIUS = 11;
const TAP_SLOP_PX = 7;

const COLOR = {
  grid: 'rgba(255,255,255,.035)',
  nodeFill: '#20253b',
  fixedFill: '#1d2236',
  nodeBorder: '#39406a',
  selected: '#6c8cff',
  text: '#ffffff',
  muted: '#8a90b0',
  primary: '#7d93ff',
  primaryIdle: '#56608f',
  fallback: '#f59e42',
  write: '#34d399',
  async: '#c084fc',
  inactive: '#3a4060',
  ok: '#3ecf8e',
  warn: '#f5b942',
  bad: '#ff5d6c',
  request: '#9fe8c3',
  background: '#0f1220',
};

/** Lo que el tablero necesita para dibujarse. Lo calcula el controlador (main.ts). */
export interface BoardView {
  graph: Graph;
  positions: Positions;
  selectedId: string | null;
  result: SimulationResult | null;
  trafficRps: number;
  /** Si el nivel tiene escrituras, las conexiones a la base de datos las llevan. */
  hasWrites: boolean;
}

const ROLE_STYLE: Record<PortRole, { color: string; dash: number[]; label: string | null; text: string }> = {
  primary: { color: COLOR.primary, dash: [], label: null, text: '#c7d0ff' },
  fallback: { color: COLOR.fallback, dash: [7, 5], label: 'si falla', text: '#ffd2a6' },
  write: { color: COLOR.write, dash: [], label: 'escrituras', text: '#bdf5dd' },
  async: { color: COLOR.async, dash: [2, 5], label: 'a la cola', text: '#ead5ff' },
};

export interface BoardHandlers {
  onNodeTap(id: string): void;
  onEdgeTap(id: string): void;
  onDeleteTap(id: string): void;
  onBackgroundTap(): void;
  onNodeMoved(id: string, point: BoardPoint): void;
}

interface Pixel {
  x: number;
  y: number;
}

type Particle =
  | { kind: 'request'; edgeId: string; t: number; color: string }
  | { kind: 'lost'; x: number; y: number; vx: number; vy: number; life: number };

export class Board {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private portrait = false;
  private view: BoardView | null = null;
  private particles: Particle[] = [];
  private animationFrame: number | null = null;
  private drag: { nodeId: string | null; start: Pixel; offset: Pixel; moved: boolean } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: BoardHandlers,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get isAnimating(): boolean {
    return this.animationFrame !== null;
  }

  update(view: BoardView): void {
    this.view = view;
    this.draw();
  }

  resize(): void {
    this.width = this.canvas.parentElement?.getBoundingClientRect().width ?? 600;
    this.portrait = this.width < 640;
    this.height = this.portrait ? Math.round(Math.max(520, Math.min(window.innerHeight * 0.66, 680))) : 440;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  /** Anima el tráfico del resultado durante `durationMs` y luego llama a `onDone`. */
  playSimulation(durationMs: number, onDone: () => void): void {
    this.stopAnimation();
    const result = this.view?.result;
    if (!result) return;

    const spawnDebt = new Map<string, number>();
    const start = performance.now();
    let last = start;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.spawnParticles(result, spawnDebt, dt);
      this.moveParticles(dt);
      this.draw();
      if (now - start < durationMs) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        this.stopAnimation();
        onDone();
      }
    };
    this.animationFrame = requestAnimationFrame(step);
  }

  stopAnimation(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.particles = [];
    this.draw();
  }

  // ---------- partículas ----------

  private spawnParticles(result: SimulationResult, debt: Map<string, number>, dt: number): void {
    const view = this.view!;
    const roles = edgeRoles(view.graph);
    const emit = (key: string, rate: number, create: () => Particle) => {
      let pending = (debt.get(key) ?? 0) + rate * dt;
      for (; pending >= 1; pending--) this.particles.push(create());
      debt.set(key, pending);
    };

    for (const edge of view.graph.edges) {
      const flow = result.edgeFlow[edge.id] ?? 0;
      const role = roles.get(edge.id) ?? 'primary';
      const color = role === 'primary' ? COLOR.request : ROLE_STYLE[role].color;
      emit(edge.id, flow * 0.045, () => ({ kind: 'request', edgeId: edge.id, t: 0, color }));
    }
    for (const node of view.graph.nodes) {
      const lost = result.nodes[node.id]?.lostRps ?? 0;
      if (lost <= 0) continue;
      const center = this.toPixel(view.positions.get(node.id)!);
      emit(`lost:${node.id}`, 3 + lost * 0.12, () => ({
        kind: 'lost',
        x: center.x + (Math.random() - 0.5) * NODE_W * 0.6,
        y: center.y + NODE_H / 2,
        vx: (Math.random() - 0.5) * 30,
        vy: 30 + Math.random() * 30,
        life: 1,
      }));
    }
  }

  private moveParticles(dt: number): void {
    for (const p of this.particles) {
      if (p.kind === 'request') {
        p.t += dt * 0.85;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.2;
      }
    }
    this.particles = this.particles.filter((p) => (p.kind === 'request' ? p.t < 1 : p.life > 0));
  }

  // ---------- geometría ----------

  private toPixel(point: BoardPoint): Pixel {
    const raw = this.portrait
      ? { x: point.across * this.width, y: point.along * this.height }
      : { x: point.along * this.width, y: point.across * this.height };
    return {
      x: clamp(raw.x, NODE_W / 2 + MARGIN, this.width - NODE_W / 2 - MARGIN),
      y: clamp(raw.y, NODE_H / 2 + MARGIN, this.height - NODE_H / 2 - MARGIN),
    };
  }

  private toPoint(pixel: Pixel): BoardPoint {
    const x = clamp(pixel.x, NODE_W / 2 + MARGIN, this.width - NODE_W / 2 - MARGIN) / this.width;
    const y = clamp(pixel.y, NODE_H / 2 + MARGIN, this.height - NODE_H / 2 - MARGIN) / this.height;
    return this.portrait ? { along: y, across: x } : { along: x, across: y };
  }

  private nodeCenter(id: string): Pixel {
    return this.toPixel(this.view!.positions.get(id)!);
  }

  /** Extremos de una flecha, recortados al borde de cada bloque. */
  private edgeEnds(edge: GraphEdge): { from: Pixel; to: Pixel } {
    const a = this.nodeCenter(edge.from);
    const b = this.nodeCenter(edge.to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const scale = (pad: number) => Math.min((NODE_W / 2 + pad) / Math.abs(dx || 1e-6), (NODE_H / 2 + pad) / Math.abs(dy || 1e-6));
    const s1 = scale(2);
    const s2 = scale(6);
    return { from: { x: a.x + dx * s1, y: a.y + dy * s1 }, to: { x: b.x - dx * s2, y: b.y - dy * s2 } };
  }

  private deleteButton(id: string): Pixel {
    const c = this.nodeCenter(id);
    return { x: c.x + NODE_W / 2 - 4, y: c.y - NODE_H / 2 + 4 };
  }

  private nodeAt(p: Pixel): string | null {
    const nodes = this.view?.graph.nodes ?? [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const c = this.nodeCenter(nodes[i].id);
      if (Math.abs(p.x - c.x) < NODE_W / 2 && Math.abs(p.y - c.y) < NODE_H / 2) return nodes[i].id;
    }
    return null;
  }

  private edgeAt(p: Pixel): string | null {
    for (const edge of this.view?.graph.edges ?? []) {
      const { from, to } = this.edgeEnds(edge);
      if (Math.hypot(p.x - (from.x + to.x) / 2, p.y - (from.y + to.y) / 2) < 16) return edge.id;
    }
    return null;
  }

  // ---------- entrada (ratón y táctil) ----------

  private bindInput(): void {
    const position = (ev: PointerEvent): Pixel => {
      const rect = this.canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    this.canvas.addEventListener('pointerdown', (ev) => {
      if (!this.view || this.isAnimating) return;
      const p = position(ev);
      const selected = this.view.selectedId;
      if (selected && !this.isFixed(selected)) {
        const del = this.deleteButton(selected);
        if (Math.hypot(p.x - del.x, p.y - del.y) < DELETE_RADIUS + 4) {
          this.handlers.onDeleteTap(selected);
          return;
        }
      }
      const nodeId = this.nodeAt(p);
      const center = nodeId ? this.nodeCenter(nodeId) : p;
      this.drag = { nodeId, start: p, offset: { x: center.x - p.x, y: center.y - p.y }, moved: false };
      this.canvas.setPointerCapture(ev.pointerId);
    });

    this.canvas.addEventListener('pointermove', (ev) => {
      const drag = this.drag;
      if (!drag?.nodeId) return;
      const p = position(ev);
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < TAP_SLOP_PX) return;
      drag.moved = true;
      this.handlers.onNodeMoved(drag.nodeId, this.toPoint({ x: p.x + drag.offset.x, y: p.y + drag.offset.y }));
    });

    this.canvas.addEventListener('pointerup', (ev) => {
      const drag = this.drag;
      this.drag = null;
      if (!drag || drag.moved) return;
      if (drag.nodeId) return this.handlers.onNodeTap(drag.nodeId);
      const edgeId = this.edgeAt(position(ev));
      if (edgeId) return this.handlers.onEdgeTap(edgeId);
      this.handlers.onBackgroundTap();
    });
  }

  private isFixed(id: string): boolean {
    return this.view?.graph.nodes.find((n) => n.id === id)?.fixed ?? false;
  }

  // ---------- dibujo ----------

  private draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawGrid();
    if (!this.view) return;

    const roles = edgeRoles(this.view.graph);
    for (const edge of this.view.graph.edges) this.drawEdge(edge, roles.get(edge.id) ?? 'primary');
    this.drawParticles();
    for (const node of this.view.graph.nodes) this.drawNode(node.id);

    const placed = this.view.graph.nodes.some((n) => !n.fixed);
    if (!placed) {
      ctx.fillStyle = '#5d6590';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Añade bloques desde abajo ↓', this.width / 2, this.portrait ? this.height * 0.3 : this.height * 0.15);
    }
  }

  private drawGrid(): void {
    const { ctx } = this;
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let x = 0; x < this.width; x += 24) line(ctx, { x, y: 0 }, { x, y: this.height });
    for (let y = 0; y < this.height; y += 24) line(ctx, { x: 0, y }, { x: this.width, y });
  }

  private drawEdge(edge: GraphEdge, role: PortRole): void {
    const { ctx } = this;
    const view = this.view!;
    const flow = view.result ? (view.result.edgeFlow[edge.id] ?? 0) : null;
    const { from, to } = this.edgeEnds(edge);
    const style = ROLE_STYLE[role];

    let color = style.color;
    if (role === 'primary' && flow === null) color = COLOR.primaryIdle;
    if (flow === 0) color = COLOR.inactive;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(style.dash);
    line(ctx, from, to);
    ctx.setLineDash([]);
    arrowHead(ctx, from, to);

    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    if (flow !== null && flow > 0) {
      pill(ctx, mid, `${Math.round(flow)}/s`, style.text);
    } else if (flow === null) {
      const writesHere = view.hasWrites && role === 'fallback' && this.isDatabase(edge.to);
      const label = writesHere ? 'si falla + escrituras' : style.label;
      if (label) pill(ctx, lerp(from, to, 0.3), label, style.text);
      ctx.fillStyle = '#2c3354';
      circle(ctx, mid, 6);
      ctx.fillStyle = COLOR.muted;
      circle(ctx, mid, 2.5);
    }
  }

  private isDatabase(id: string): boolean {
    return this.view?.graph.nodes.find((n) => n.id === id)?.type === 'db';
  }

  private drawParticles(): void {
    const { ctx } = this;
    const edges = new Map(this.view!.graph.edges.map((e) => [e.id, e]));
    for (const p of this.particles) {
      if (p.kind === 'request') {
        const edge = edges.get(p.edgeId);
        if (!edge) continue;
        const { from, to } = this.edgeEnds(edge);
        ctx.fillStyle = p.color;
        circle(ctx, lerp(from, to, p.t), 3.2);
      } else {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = COLOR.bad;
        circle(ctx, p, 3.2);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawNode(id: string): void {
    const { ctx } = this;
    const view = this.view!;
    const node = view.graph.nodes.find((n) => n.id === id)!;
    const spec = BLOCKS[node.type];
    const stats = view.result?.nodes[id];
    const c = this.nodeCenter(id);
    const x = c.x - NODE_W / 2;
    const y = c.y - NODE_H / 2;
    const selected = view.selectedId === id;

    ctx.fillStyle = node.fixed ? COLOR.fixedFill : COLOR.nodeFill;
    roundRect(ctx, x, y, NODE_W, NODE_H, 12);
    ctx.fill();

    let border = COLOR.nodeBorder;
    if (stats && (stats.load > 0 || stats.lostRps > 0)) border = stats.lostRps > 0 ? COLOR.bad : utilizationColor(stats.utilization);
    if (selected) border = COLOR.selected;
    ctx.strokeStyle = border;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOR.text;
    ctx.font = '18px system-ui';
    ctx.fillText(spec.icon, c.x, c.y - 13);
    ctx.font = '600 12px system-ui';
    ctx.fillText(displayName(view.graph, node), c.x, c.y + 5);

    ctx.font = '11px system-ui';
    ctx.fillStyle = COLOR.muted;
    const capacityText = Number.isFinite(spec.capacity) ? `${spec.capacity}${spec.unit ? ' tr' : ''}/s` : '';
    let subtitle = node.type === 'users' ? `${view.trafficRps}/s` : `máx ${capacityText}`;
    if (stats && node.type !== 'users') subtitle = `${Math.round(stats.load)} / ${capacityText}`;
    ctx.fillText(subtitle, c.x, c.y + 20);

    if (stats && stats.load > 0 && Number.isFinite(spec.capacity)) {
      const barWidth = NODE_W - 20;
      ctx.fillStyle = '#2c3354';
      ctx.fillRect(x + 10, y + NODE_H - 5, barWidth, 3);
      ctx.fillStyle = utilizationColor(stats.utilization);
      ctx.fillRect(x + 10, y + NODE_H - 5, barWidth * Math.min(stats.utilization, 1), 3);
    }

    if (selected && !node.fixed) {
      const d = this.deleteButton(id);
      ctx.fillStyle = COLOR.bad;
      circle(ctx, d, DELETE_RADIUS);
      ctx.fillStyle = COLOR.text;
      ctx.font = 'bold 13px system-ui';
      ctx.fillText('✕', d.x, d.y + 1);
    }
  }
}

// ---------- utilidades de dibujo ----------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: Pixel, b: Pixel, t: number): Pixel {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function utilizationColor(u: number): string {
  return u > 1 ? COLOR.bad : u > 0.8 ? COLOR.warn : COLOR.ok;
}

function line(ctx: CanvasRenderingContext2D, a: Pixel, b: Pixel): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, c: Pixel, r: number): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pixel, to: Pixel): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x + Math.cos(angle) * 6, to.y + Math.sin(angle) * 6);
  ctx.lineTo(to.x - Math.cos(angle - 0.45) * 10, to.y - Math.sin(angle - 0.45) * 10);
  ctx.lineTo(to.x - Math.cos(angle + 0.45) * 10, to.y - Math.sin(angle + 0.45) * 10);
  ctx.fill();
}

function pill(ctx: CanvasRenderingContext2D, c: Pixel, text: string, color: string): void {
  ctx.font = '11px system-ui';
  const width = ctx.measureText(text).width + 14;
  ctx.fillStyle = COLOR.background;
  roundRect(ctx, c.x - width / 2, c.y - 9, width, 18, 9);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.x, c.y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
