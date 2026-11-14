import type { NodeStatus, Scene, SceneEdge, SceneNode } from '../worlds/types';
import type { BoardPoint, Positions } from './layout';

const NODE_W = 112;
const NODE_H = 62;
const COMPACT_W = 64;
const COMPACT_H = 40;
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
  ok: '#3ecf8e',
  warn: '#f5b942',
  bad: '#ff5d6c',
  background: '#0f1220',
};

const STATUS_COLOR: Record<NodeStatus, string> = { idle: COLOR.nodeBorder, ok: COLOR.ok, warn: COLOR.warn, bad: COLOR.bad };

/** Lo que el tablero necesita para dibujarse. Lo calcula el controlador (main.ts) con el mundo del nivel. */
export interface BoardView {
  scene: Scene;
  positions: Positions;
  selectedId: string | null;
}

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
  | { kind: 'flow'; edgeId: string; t: number; color: string; reverse: boolean }
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

  /** Anima el resultado durante `durationMs` y luego llama a `onDone`. */
  playSimulation(durationMs: number, onDone: () => void): void {
    this.stopAnimation();
    if (!this.view) return;

    const spawnDebt = new Map<string, number>();
    const start = performance.now();
    let last = start;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.spawnParticles(spawnDebt, dt);
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

  private spawnParticles(debt: Map<string, number>, dt: number): void {
    const view = this.view!;
    const emit = (key: string, rate: number, create: () => Particle) => {
      let pending = (debt.get(key) ?? 0) + rate * dt;
      for (; pending >= 1; pending--) this.particles.push(create());
      debt.set(key, pending);
    };

    for (const edge of view.scene.edges) {
      const p = edge.particles;
      if (!p || p.rate <= 0) continue;
      // Sin flecha, el tráfico va en los dos sentidos (un bus).
      emit(edge.id, p.rate, () => ({ kind: 'flow', edgeId: edge.id, t: 0, color: p.color, reverse: !edge.arrow && Math.random() < 0.5 }));
    }
    for (const node of view.scene.nodes) {
      if (node.lossRate <= 0) continue;
      const center = this.nodeCenter(node.id);
      const size = nodeSize(node);
      emit(`lost:${node.id}`, node.lossRate, () => ({
        kind: 'lost',
        x: center.x + (Math.random() - 0.5) * size.w * 0.6,
        y: center.y + size.h / 2,
        vx: (Math.random() - 0.5) * 30,
        vy: 30 + Math.random() * 30,
        life: 1,
      }));
    }
  }

  private moveParticles(dt: number): void {
    for (const p of this.particles) {
      if (p.kind === 'flow') {
        p.t += dt * 0.85;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.2;
      }
    }
    this.particles = this.particles.filter((p) => (p.kind === 'flow' ? p.t < 1 : p.life > 0));
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

  private sceneNode(id: string): SceneNode | undefined {
    return this.view?.scene.nodes.find((n) => n.id === id);
  }

  private nodeCenter(id: string): Pixel {
    return this.toPixel(this.view!.positions.get(id) ?? { along: 0.5, across: 0.5 });
  }

  /** Extremos de una línea, recortados al borde de cada bloque. */
  private edgeEnds(edge: SceneEdge): { from: Pixel; to: Pixel } {
    const a = this.nodeCenter(edge.from);
    const b = this.nodeCenter(edge.to);
    const sa = nodeSize(this.sceneNode(edge.from));
    const sb = nodeSize(this.sceneNode(edge.to));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const scale = (size: { w: number; h: number }, pad: number) =>
      Math.min((size.w / 2 + pad) / Math.abs(dx || 1e-6), (size.h / 2 + pad) / Math.abs(dy || 1e-6));
    const s1 = scale(sa, 2);
    const s2 = scale(sb, edge.arrow ? 6 : 2);
    return { from: { x: a.x + dx * s1, y: a.y + dy * s1 }, to: { x: b.x - dx * s2, y: b.y - dy * s2 } };
  }

  private deleteButton(id: string): Pixel {
    const c = this.nodeCenter(id);
    const size = nodeSize(this.sceneNode(id));
    return { x: c.x + size.w / 2 - 4, y: c.y - size.h / 2 + 4 };
  }

  private nodeAt(p: Pixel): string | null {
    const nodes = this.view?.scene.nodes ?? [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const c = this.nodeCenter(nodes[i].id);
      const size = nodeSize(nodes[i]);
      if (Math.abs(p.x - c.x) < size.w / 2 && Math.abs(p.y - c.y) < size.h / 2) return nodes[i].id;
    }
    return null;
  }

  /** Punto que se toca para borrar una conexión: el centro, o más allá si ahí va la etiqueta. */
  private handlePoint(edge: SceneEdge): Pixel {
    const { from, to } = this.edgeEnds(edge);
    return lerp(from, to, edge.label?.at === 0.5 ? 0.75 : 0.5);
  }

  private edgeAt(p: Pixel): string | null {
    for (const edge of this.view?.scene.edges ?? []) {
      const h = this.handlePoint(edge);
      if (Math.hypot(p.x - h.x, p.y - h.y) < 16) return edge.id;
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
      if (selected && this.sceneNode(selected)?.deletable) {
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
      if (!drag?.nodeId || !this.sceneNode(drag.nodeId)?.draggable) return;
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

  // ---------- dibujo ----------

  private draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawGrid();
    if (!this.view) return;

    const { scene } = this.view;
    for (const edge of scene.edges) this.drawEdge(edge);
    this.drawParticles();
    for (const node of scene.nodes) this.drawNode(node);

    if (scene.emptyHint) {
      ctx.fillStyle = '#5d6590';
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Pegado al borde superior: los bloques nunca llegan ahí (se recortan al margen).
      ctx.fillText(scene.emptyHint, this.width / 2, 14);
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

  private drawEdge(edge: SceneEdge): void {
    const { ctx } = this;
    const { from, to } = this.edgeEnds(edge);

    ctx.strokeStyle = edge.color;
    ctx.fillStyle = edge.color;
    ctx.lineWidth = edge.arrow ? 2.5 : 4;
    ctx.setLineDash(edge.dash);
    line(ctx, from, to);
    ctx.setLineDash([]);
    if (edge.arrow) arrowHead(ctx, from, to);

    if (edge.label) pill(ctx, lerp(from, to, edge.label.at), edge.label.text, edge.label.color);
    if (edge.handle) {
      const mid = this.handlePoint(edge);
      ctx.fillStyle = '#2c3354';
      circle(ctx, mid, 6);
      ctx.fillStyle = COLOR.muted;
      circle(ctx, mid, 2.5);
    }
  }

  private drawParticles(): void {
    const { ctx } = this;
    const edges = new Map(this.view!.scene.edges.map((e) => [e.id, e]));
    for (const p of this.particles) {
      if (p.kind === 'flow') {
        const edge = edges.get(p.edgeId);
        if (!edge) continue;
        const { from, to } = this.edgeEnds(edge);
        ctx.fillStyle = p.color;
        circle(ctx, lerp(from, to, p.reverse ? 1 - p.t : p.t), 3.2);
      } else {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = COLOR.bad;
        circle(ctx, p, 3.2);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawNode(node: SceneNode): void {
    const { ctx } = this;
    const view = this.view!;
    const size = nodeSize(node);
    const c = this.nodeCenter(node.id);
    const x = c.x - size.w / 2;
    const y = c.y - size.h / 2;
    const selected = view.selectedId === node.id;

    ctx.fillStyle = node.deletable ? COLOR.nodeFill : COLOR.fixedFill;
    roundRect(ctx, x, y, size.w, size.h, node.compact ? 10 : 12);
    ctx.fill();

    ctx.strokeStyle = selected ? COLOR.selected : STATUS_COLOR[node.status];
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOR.text;
    if (node.compact) {
      ctx.font = '14px system-ui';
      ctx.fillText(node.icon, c.x, c.y - 7);
      ctx.font = '10px system-ui';
      ctx.fillStyle = COLOR.muted;
      ctx.fillText(node.subtitle, c.x, c.y + 10);
    } else {
      ctx.font = '18px system-ui';
      ctx.fillText(node.icon, c.x, c.y - 13);
      ctx.font = '600 12px system-ui';
      ctx.fillText(node.title, c.x, c.y + 5);
      ctx.font = '11px system-ui';
      ctx.fillStyle = COLOR.muted;
      ctx.fillText(node.subtitle, c.x, c.y + 20);
    }

    if (node.bar !== null) {
      const barWidth = size.w - 20;
      ctx.fillStyle = '#2c3354';
      ctx.fillRect(x + 10, y + size.h - 5, barWidth, 3);
      ctx.fillStyle = STATUS_COLOR[node.status === 'idle' ? 'ok' : node.status];
      ctx.fillRect(x + 10, y + size.h - 5, barWidth * Math.min(node.bar, 1), 3);
    }

    if (selected && node.deletable) {
      const d = this.deleteButton(node.id);
      ctx.fillStyle = COLOR.bad;
      circle(ctx, d, DELETE_RADIUS);
      ctx.fillStyle = COLOR.text;
      ctx.font = 'bold 13px system-ui';
      ctx.fillText('✕', d.x, d.y + 1);
    }
  }
}

// ---------- utilidades de dibujo ----------

function nodeSize(node: SceneNode | undefined): { w: number; h: number } {
  return node?.compact ? { w: COMPACT_W, h: COMPACT_H } : { w: NODE_W, h: NODE_H };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: Pixel, b: Pixel, t: number): Pixel {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
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
