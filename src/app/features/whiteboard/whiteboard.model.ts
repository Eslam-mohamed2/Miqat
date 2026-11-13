// What a whiteboard is made of, how it is saved, and the geometry the page needs.
// No Angular in here: plain data and pure functions.

export interface Point { x: number; y: number; }
export interface Box { x: number; y: number; w: number; h: number; }

/** The five colours of the board. A sticky shows the paper version, ink and shapes the theme's. */
export type Tone = 'gold' | 'sage' | 'sky' | 'rose' | 'lilac';
export const TONES: readonly Tone[] = ['gold', 'sage', 'sky', 'rose', 'lilac'];

export type Tool = 'select' | 'hand' | 'sticky' | 'shape' | 'text' | 'pen' | 'connector' | 'frame';
export type ShapeKind = 'rect' | 'ellipse' | 'diamond';
export type Side = 't' | 'r' | 'b' | 'l';

/** `color` is a {@link Tone}, or a CSS colour on boards saved before the tones existed. */
export interface Stroke { color: string; width: number; points: Point[]; type: 'pen' | 'eraser'; }

export interface Note {
  id: string; x: number; y: number; text: string;
  /** A {@link Tone}, or a CSS colour on boards saved before the tones existed. */
  color: string;
  w?: number; h?: number;
  /** Degrees; a new sticky sits slightly askew, as paper does. */
  rot?: number;
  votes?: number;
  /** Initials of who wrote it. */
  by?: string;
  group?: string;
}

export interface Frame { id: string; x: number; y: number; w: number; h: number; label: string; }
export interface Shape { id: string; kind: ShapeKind; x: number; y: number; w: number; h: number; color: string; group?: string; }
export interface TextItem { id: string; x: number; y: number; text: string; color: string; rot?: number; group?: string; }

/** One end of a connector: attached to the side of an item, or a free point on the board. */
export interface ConnectorEnd { item?: string; side?: Side; x: number; y: number; }
export interface Connector { id: string; from: ConnectorEnd; to: ConnectorEnd; label?: string; }

export interface AgendaItem { id: string; title: string; minutes: number; done?: boolean; }
/** The session's agenda: which item the timer is on and the seconds left in it. */
export interface Agenda { items: AgendaItem[]; current: string | null; left: number; }

/** A task that was made from a sticky on this board. */
export interface MadeTask { id: string; title: string; noteId?: string; }

/** Everything undo and redo cover. */
export interface BoardContent {
  strokes: Stroke[]; notes: Note[]; frames: Frame[]; shapes: Shape[]; texts: TextItem[]; connectors: Connector[];
}

export interface BoardState { content: BoardContent; agenda: Agenda; made: MadeTask[]; }

export const NOTE_W = 120;
export const NOTE_H = 108;
/** Stickies were 200px squares before version 2 of the saved format. */
const LEGACY_NOTE_SIZE = 200;
export const FRAME_W = 290;
export const FRAME_H = 456;
/** A frame's name starts this far above the frame. */
export const FRAME_LABEL_RISE = 30;
/** How far a connector reaches under the edge of a sticky. */
const NOTE_TUCK = 4;
export const ERASER_WIDTH = 20;
export const PEN_WIDTHS: readonly number[] = [2.4, 4, 8];
/** The slight turns stickies are given, in the order they are added. */
const NOTE_TURNS = [-1.5, 1, -0.5, 1.5, -1, 0.5, 1.2, -1.3, 0.8, -0.6, 1.4];
const TEXT_TURNS = [-6, 3, -3, 5];
const TEXT_LINE = 30;

export const emptyContent = (): BoardContent =>
  ({ strokes: [], notes: [], frames: [], shapes: [], texts: [], connectors: [] });

export const emptyAgenda = (): Agenda => ({ items: [], current: null, left: 0 });

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const noteTurn = (count: number) => NOTE_TURNS[count % NOTE_TURNS.length];
export const textTurn = (count: number) => TEXT_TURNS[count % TEXT_TURNS.length];
export const isTone = (value: string): value is Tone => (TONES as readonly string[]).includes(value);

// ── Saved format ────────────────────────────────────────────────────────────
// Version 1 (before the redesign) is `{ strokes, notes }`. Version 2 keeps both
// under the same names and adds the rest, so a version 1 board opens unchanged.

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const list = (value: unknown): any[] => (Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []);
const placed = (item: any) => typeof item.id === 'string' && isNumber(item.x) && isNumber(item.y);
const sized = (item: any) => placed(item) && isNumber(item.w) && isNumber(item.h);
const validEnd = (end: any) => !!end && isNumber(end.x) && isNumber(end.y);

export function parseBoard(raw: string | null | undefined): BoardState {
  let data: any;
  try { data = JSON.parse(raw || '{}'); } catch { data = null; }
  if (!data || typeof data !== 'object') data = {};
  const legacy = !(data.v >= 2);

  const notes: Note[] = list(data.notes).filter(placed).map(note => ({
    ...note,
    text: typeof note.text === 'string' ? note.text : '',
    color: typeof note.color === 'string' ? note.color : 'gold',
    ...(legacy ? { w: note.w ?? LEGACY_NOTE_SIZE, h: note.h ?? LEGACY_NOTE_SIZE } : {})
  }));

  const agendaItems: AgendaItem[] = list(data.agenda?.items)
    .filter(item => typeof item.id === 'string' && typeof item.title === 'string')
    .map(item => ({ id: item.id, title: item.title, minutes: isNumber(item.minutes) ? item.minutes : 10, done: !!item.done }));
  const current = agendaItems.some(item => item.id === data.agenda?.current) ? data.agenda.current : null;

  return {
    content: {
      strokes: list(data.strokes).filter(stroke => Array.isArray(stroke.points) && stroke.points.length),
      notes,
      frames: list(data.frames).filter(sized).map(frame => ({ ...frame, label: typeof frame.label === 'string' ? frame.label : '' })),
      shapes: list(data.shapes).filter(sized),
      texts: list(data.texts).filter(placed).filter(text => typeof text.text === 'string'),
      connectors: list(data.connectors).filter(c => typeof c.id === 'string' && validEnd(c.from) && validEnd(c.to))
    },
    agenda: { items: agendaItems, current, left: current && isNumber(data.agenda?.left) ? Math.max(0, data.agenda.left) : 0 },
    made: list(data.made).filter(task => typeof task.id === 'string' && typeof task.title === 'string')
  };
}

export function serializeBoard(state: BoardState): string {
  return JSON.stringify({ v: 2, ...state.content, agenda: state.agenda, made: state.made });
}

// ── Geometry ────────────────────────────────────────────────────────────────

export const noteBox = (note: Note): Box => ({ x: note.x, y: note.y, w: note.w ?? NOTE_W, h: note.h ?? NOTE_H });

let measurer: CanvasRenderingContext2D | null | undefined;

/** Size of a handwritten text on the board (24px Caveat, as the stylesheet sets it). */
export function textBox(text: TextItem): Box {
  if (measurer === undefined) {
    measurer = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  const lines = (text.text || ' ').split('\n');
  let width = 0;
  for (const line of lines) {
    if (measurer) {
      measurer.font = "600 24px 'Caveat', cursive";
      width = Math.max(width, measurer.measureText(line).width);
    } else {
      width = Math.max(width, line.length * 10);
    }
  }
  return { x: text.x, y: text.y, w: Math.max(24, Math.ceil(width)), h: lines.length * TEXT_LINE };
}

export function strokeBox(stroke: Stroke): Box {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of stroke.points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  const half = stroke.width / 2;
  return { x: x1 - half, y: y1 - half, w: x2 - x1 + stroke.width, h: y2 - y1 + stroke.width };
}

export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const inside = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export const boxOf = (a: Point, b: Point): Box =>
  ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

/** Where the things that have a box are: stickies, shapes, texts and frames, by id. */
export function itemBoxes(content: BoardContent): Map<string, Box> {
  const boxes = new Map<string, Box>();
  for (const frame of content.frames) boxes.set(frame.id, frame);
  for (const shape of content.shapes) boxes.set(shape.id, shape);
  for (const text of content.texts) boxes.set(text.id, textBox(text));
  for (const note of content.notes) boxes.set(note.id, noteBox(note));
  return boxes;
}

/**
 * Where connectors meet things. A line reaches a little way under a sticky, which lies
 * above it and is never quite straight, so no gap shows at its edge.
 */
export function anchorBoxes(content: BoardContent): Map<string, Box> {
  const boxes = itemBoxes(content);
  for (const note of content.notes) {
    const box = noteBox(note);
    boxes.set(note.id, { x: box.x + NOTE_TUCK, y: box.y + NOTE_TUCK, w: box.w - NOTE_TUCK * 2, h: box.h - NOTE_TUCK * 2 });
  }
  return boxes;
}

/** The side of a box that a point is nearest to. */
export function nearestSide(box: Box, point: Point): Side {
  const gaps: [Side, number][] = [
    ['l', Math.abs(point.x - box.x)], ['r', Math.abs(box.x + box.w - point.x)],
    ['t', Math.abs(point.y - box.y)], ['b', Math.abs(box.y + box.h - point.y)]
  ];
  return gaps.sort((a, b) => a[1] - b[1])[0][0];
}

const NORMALS: Record<Side, Point> = { t: { x: 0, y: -1 }, r: { x: 1, y: 0 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 } };

function sidePoint(box: Box, side: Side): Point {
  switch (side) {
    case 't': return { x: box.x + box.w / 2, y: box.y };
    case 'b': return { x: box.x + box.w / 2, y: box.y + box.h };
    case 'l': return { x: box.x, y: box.y + box.h / 2 };
    default: return { x: box.x + box.w, y: box.y + box.h / 2 };
  }
}

/** Where an end of a connector is right now, and which way the line leaves it. */
function resolveEnd(end: ConnectorEnd, boxes: Map<string, Box>): { point: Point; normal: Point | null } {
  const box = end.item ? boxes.get(end.item) : undefined;
  if (!box) return { point: { x: end.x, y: end.y }, normal: null };
  const side = end.side ?? nearestSide(box, end);
  return { point: sidePoint(box, side), normal: NORMALS[side] };
}

export interface ConnectorLine {
  /** The curve. */
  d: string;
  /** The open arrowhead at the far end. */
  arrow: string;
  /** Middle of the curve, where the label sits. */
  mid: Point;
  box: Box;
}

/**
 * The dashed curve between two ends. Each end leaves its item at a right angle; two
 * ends on the same side of their items make the loop the design draws under a row.
 */
export function connectorLine(connector: Connector, boxes: Map<string, Box>): ConnectorLine {
  const a = resolveEnd(connector.from, boxes);
  const b = resolveEnd(connector.to, boxes);
  const p0 = a.point, p3 = b.point;
  const distance = Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1;
  const along = { x: (p3.x - p0.x) / distance, y: (p3.y - p0.y) / distance };
  const sameSide = !!a.normal && !!b.normal && a.normal.x === b.normal.x && a.normal.y === b.normal.y;
  const reach = Math.max(40, distance * (sameSide ? 0.93 : 0.5));

  const n0 = a.normal ?? along;
  const n3 = b.normal ?? { x: -along.x, y: -along.y };
  const c1 = { x: p0.x + n0.x * reach, y: p0.y + n0.y * reach };
  const c2 = { x: p3.x + n3.x * reach, y: p3.y + n3.y * reach };

  // The arrowhead opens back along the way the line arrives.
  const back = { x: n3.x, y: n3.y };
  const across = { x: -back.y, y: back.x };
  const wing = (sign: number) =>
    `${round(p3.x + back.x * 12 + across.x * 7 * sign)} ${round(p3.y + back.y * 12 + across.y * 7 * sign)}`;

  const xs = [p0.x, c1.x, c2.x, p3.x], ys = [p0.y, c1.y, c2.y, p3.y];
  return {
    d: `M${round(p0.x)} ${round(p0.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(p3.x)} ${round(p3.y)}`,
    arrow: `M${wing(1)} L${round(p3.x)} ${round(p3.y)} L${wing(-1)}`,
    mid: { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 },
    box: boxOf({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) })
  };
}

export const round = (value: number) => Math.round(value * 10) / 10;

/** The box around everything on the board, or null when it is empty. */
export function contentBox(content: BoardContent): Box | null {
  const items = itemBoxes(content);
  const boxes = [...items.values()];
  // A frame's name sits above it.
  for (const frame of content.frames) boxes.push({ x: frame.x, y: frame.y - FRAME_LABEL_RISE, w: frame.w, h: FRAME_LABEL_RISE });
  for (const stroke of content.strokes) if (stroke.type === 'pen') boxes.push(strokeBox(stroke));
  const anchors = anchorBoxes(content);
  for (const connector of content.connectors) boxes.push(connectorLine(connector, anchors).box);
  return union(boxes);
}

// ── Changes ─────────────────────────────────────────────────────────────────

/** What moves when the given items are dragged: their groups, and what a frame holds. */
export function movingSet(content: BoardContent, ids: readonly string[]): { ids: Set<string>; strokes: Set<number> } {
  const moving = new Set(ids);
  const strokes = new Set<number>();
  const boxes = itemBoxes(content);

  for (const frame of content.frames) {
    if (!moving.has(frame.id)) continue;
    for (const item of [...content.notes, ...content.shapes, ...content.texts]) {
      const box = boxes.get(item.id)!;
      const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      if (centre.x >= frame.x && centre.x <= frame.x + frame.w && centre.y >= frame.y && centre.y <= frame.y + frame.h) {
        moving.add(item.id);
      }
    }
    content.strokes.forEach((stroke, index) => { if (inside(frame, strokeBox(stroke))) strokes.add(index); });
  }

  const groups = new Set<string>();
  for (const item of [...content.notes, ...content.shapes, ...content.texts]) {
    if (item.group && moving.has(item.id)) groups.add(item.group);
  }
  for (const item of [...content.notes, ...content.shapes, ...content.texts]) {
    if (item.group && groups.has(item.group)) moving.add(item.id);
  }
  return { ids: moving, strokes };
}

/** A copy of the board with those things moved by (dx, dy). */
export function moved(
  content: BoardContent, set: { ids: Set<string>; strokes: Set<number> }, dx: number, dy: number
): BoardContent {
  const shift = <T extends { id: string; x: number; y: number }>(items: T[]) =>
    items.map(item => (set.ids.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item));
  const shiftEnd = (end: ConnectorEnd): ConnectorEnd => ({ ...end, x: end.x + dx, y: end.y + dy });

  return {
    notes: shift(content.notes),
    frames: shift(content.frames),
    shapes: shift(content.shapes),
    texts: shift(content.texts),
    strokes: set.strokes.size
      ? content.strokes.map((stroke, index) => (set.strokes.has(index)
        ? { ...stroke, points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
        : stroke))
      : content.strokes,
    connectors: content.connectors.map(connector => {
      const selected = set.ids.has(connector.id);
      const from = (connector.from.item ? set.ids.has(connector.from.item) : selected) ? shiftEnd(connector.from) : connector.from;
      const to = (connector.to.item ? set.ids.has(connector.to.item) : selected) ? shiftEnd(connector.to) : connector.to;
      return from === connector.from && to === connector.to ? connector : { ...connector, from, to };
    })
  };
}

/** A copy of the board without those items, and without the connectors that were attached to them. */
export function without(content: BoardContent, ids: readonly string[]): BoardContent {
  const gone = new Set(ids);
  const keep = <T extends { id: string }>(items: T[]) => items.filter(item => !gone.has(item.id));
  return {
    strokes: content.strokes,
    notes: keep(content.notes),
    frames: keep(content.frames),
    shapes: keep(content.shapes),
    texts: keep(content.texts),
    connectors: keep(content.connectors).filter(c =>
      !(c.from.item && gone.has(c.from.item)) && !(c.to.item && gone.has(c.to.item)))
  };
}

/** How far a point is from the outline of a box; used to pick a frame up by its edge. */
export function edgeDistance(box: Box, point: Point): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
  if (dx || dy) return Math.hypot(dx, dy);
  return Math.min(point.x - box.x, box.x + box.w - point.x, point.y - box.y, box.y + box.h - point.y);
}
