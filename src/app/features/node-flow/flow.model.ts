/**
 * Node Flow: the saved format and everything that is computed from the graph
 * (dates, critical path, slack, "what if this slips", auto-layout, the timeline).
 * Pure functions, no Angular.
 */

import { isArabic, locale, num, t, tCount } from '../../core/i18n/i18n';

export type FlowNodeType = 'task' | 'event' | 'milestone';

export interface FlowNode {
  id: string;
  x: number;
  y: number;
  title: string;
  type: FlowNodeType;
  /** The API's task status: Pending, In_progress, Completed, On_hold or Cancelled. */
  status?: string;
  /** Set for a node that stands for a real task, so the node can open it. */
  taskId?: string;
  /** Set for a node that stands for a real calendar event. */
  eventId?: string;
  /** Planned first day, `yyyy-mm-dd`. The flow owns its dates: they are the plan. */
  start?: string;
  /** Planned length in whole days; 0 for a milestone. */
  days?: number;
  /** `HH:mm`, events only. */
  time?: string;
  /** Display name of whoever the node belongs to. */
  owner?: string;
  /** Name of the project the linked task belongs to. */
  project?: string;
}

/** `toId` depends on `fromId`: the arrow points at the node that has to wait. */
export interface FlowEdge {
  id: string;
  fromId: string;
  toId: string;
}

export interface FlowBoard {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Written as `v`. Boards saved before it existed have no `v` and fewer node fields. */
const FLOW_FORMAT = 2;

// ── Geometry (design/miqat-2.0/pages/V2-Flow.dc.html) ───────────────────────
export const NODE_WIDTH = 176;
export const MILESTONE_WIDTH = 150;
/** Edges anchor to these heights, as in the design, whatever the card's real height. */
export const TASK_HEIGHT = 92;
export const OTHER_HEIGHT = 78;

export const TIME_X0 = 250;
export const DAY_WIDTH = 40;
export const ROW_HEIGHT = 46;
export const TIME_TOP = 62;
export const BAR_HEIGHT = 26;
/** Width of the "Set dates" bar of a node that has no dates yet. */
const UNDATED_BAR_WIDTH = 76;
const MIN_DAY_COLUMNS = 19;
/** A plan can span years; the timeline stops drawing columns here. */
const MAX_DAY_COLUMNS = 730;

export const LAYOUT_LEFT = 24;
export const LAYOUT_TOP = 50;
export const LAYOUT_COLUMN = 212;
/** Clear of a card whose title takes three lines (about 120px). */
export const LAYOUT_ROW = 132;
/** Rows per column for nodes that nothing connects, so they do not form one endless column. */
const LAYOUT_LOOSE_ROWS = 5;

export interface Box { x: number; y: number; w: number; h: number; }

// ── Saved format ────────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function cleanNode(raw: any, index: number): FlowNode {
  const type: FlowNodeType = raw.type === 'event' || raw.type === 'milestone' ? raw.type : 'task';
  const node: FlowNode = {
    id: text(raw.id) ?? `n_${index}`,
    x: Math.max(0, Number(raw.x) || 0),
    y: Math.max(0, Number(raw.y) || 0),
    title: typeof raw.title === 'string' ? raw.title : '',
    type
  };

  const status = text(raw.status);
  if (status) node.status = status;
  const taskId = text(raw.taskId);
  if (taskId) node.taskId = taskId;
  const eventId = text(raw.eventId);
  if (eventId) node.eventId = eventId;
  if (typeof raw.start === 'string' && ISO_DAY.test(raw.start)) node.start = raw.start;
  if (Number.isFinite(raw.days)) node.days = Math.max(0, Math.round(raw.days));
  if (typeof raw.time === 'string' && CLOCK.test(raw.time)) node.time = raw.time;
  const owner = text(raw.owner);
  if (owner) node.owner = owner;
  const project = text(raw.project);
  if (project) node.project = project;
  return node;
}

/**
 * Reads a saved board, old or new. Throws on text that is not JSON; anything
 * else that is missing or malformed is dropped rather than refused.
 */
export function parseFlow(content: string | null | undefined): FlowBoard & { legacy: boolean } {
  const data = JSON.parse(content || '{}') ?? {};
  const nodes: FlowNode[] = (Array.isArray(data.nodes) ? data.nodes : [])
    .filter((raw: unknown) => !!raw && typeof raw === 'object')
    .map(cleanNode);

  const known = new Set(nodes.map(node => node.id));
  const edges: FlowEdge[] = (Array.isArray(data.edges) ? data.edges : [])
    .filter((raw: any) => raw && known.has(raw.fromId) && known.has(raw.toId) && raw.fromId !== raw.toId)
    .map((raw: any, index: number) => ({ id: text(raw.id) ?? `e_${index}`, fromId: raw.fromId, toId: raw.toId }));

  return { nodes, edges, legacy: !data.v };
}

export function serializeFlow(board: FlowBoard): string {
  return JSON.stringify({ v: FLOW_FORMAT, nodes: board.nodes, edges: board.edges });
}

// ── Dates: whole calendar days, counted from 1 January 1970 ─────────────────

const DAY_MS = 86_400_000;

/** Formatters by locale and weekday length. A day number is a day in UTC, so that is the zone they read in. */
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The names and numbers of a day in the interface language: "Tue", "10", "Nov", "2026". */
function dayParts(day: number, weekday: 'short' | 'narrow'): { weekday: string; day: string; month: string; year: string } {
  const key = `${locale()}|${weekday}`;
  let formatter = dayFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', weekday, day: 'numeric', month: 'short', year: 'numeric' });
    dayFormatters.set(key, formatter);
  }
  const parts = formatter.formatToParts(new Date(day * DAY_MS));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(piece => piece.type === type)?.value ?? '';
  return { weekday: part('weekday'), day: part('day'), month: part('month'), year: part('year') };
}

export function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 0 (Sunday) to 6 (Saturday). */
export function weekdayOf(day: number): number {
  return new Date(day * DAY_MS).getUTCDay();
}

/**
 * "Tue 10 Nov" ("الثلاثاء ١٠ نوفمبر"); the year is added when it is not `thisYear`.
 * Weekday, day, month in both languages, whatever order the locale itself would use.
 */
export function dayLabel(day: number, thisYear?: number): string {
  const parts = dayParts(day, 'short');
  const label = `${parts.weekday} ${parts.day} ${parts.month}`;
  return thisYear !== undefined && new Date(day * DAY_MS).getUTCFullYear() !== thisYear ? `${label} ${parts.year}` : label;
}

/** A day column of the timeline: "T 10", and the month's name for the caption above it. */
export function dayColumn(day: number): { label: string; month: string; date: number } {
  const parts = dayParts(day, 'narrow');
  return {
    label: `${parts.weekday} ${parts.day}`,
    month: parts.month,
    date: new Date(day * DAY_MS).getUTCDate()
  };
}

/** Whole days a node takes: 0 for a milestone, at least 1 for anything else. */
export function lengthOf(node: FlowNode): number {
  if (node.type === 'milestone') return 0;
  return Math.max(1, node.days ?? 1);
}

/** Planned first day of every node that has one. */
export function plannedStarts(nodes: FlowNode[]): Map<string, number> {
  const starts = new Map<string, number>();
  for (const node of nodes) if (node.start) starts.set(node.id, dayNumber(node.start));
  return starts;
}

/** "Tue 10 Nov – Wed 11 Nov", "Tue 17 Nov · 11:00", or "" for a node without dates. */
export function rangeLabel(node: FlowNode, start: number | undefined, thisYear?: number): string {
  if (start === undefined) return '';
  const days = lengthOf(node);
  if (days <= 1) {
    return dayLabel(start, thisYear) + (node.type === 'event' && node.time ? ` · ${num(node.time)}` : '');
  }
  const last = start + days - 1;
  // Arabic has no short weekday names. A range inside one month names the month once
  // ("الثلاثاء ١٠ – الأربعاء ١١ نوفمبر"), as Arabic writes it, and stays on one line of a card.
  if (isArabic()) {
    const from = dayParts(start, 'short');
    const to = dayParts(last, 'short');
    if (from.month === to.month && from.year === to.year) {
      const year = thisYear !== undefined && new Date(last * DAY_MS).getUTCFullYear() !== thisYear ? ` ${to.year}` : '';
      return `${from.weekday} ${from.day} – ${to.weekday} ${to.day} ${to.month}${year}`;
    }
  }
  return `${dayLabel(start, thisYear)} – ${dayLabel(last, thisYear)}`;
}

// ── Status ──────────────────────────────────────────────────────────────────

export type FlowTone = 'done' | 'doing' | 'todo' | 'hold' | 'cancelled' | 'late' | 'event' | 'milestone';

export const TONE_LABEL: Record<FlowTone, string> = {
  done: t('Done@@status'),
  doing: t('In progress'),
  todo: t('To do'),
  hold: t('On hold'),
  cancelled: t('Cancelled'),
  late: t('Late'),
  event: t('Calendar event'),
  milestone: t('Milestone')
};

/** What the node is drawn as. "Late" is a task that is not finished and whose last planned day has passed. */
export function toneOf(node: FlowNode, start: number | undefined, today: number): FlowTone {
  if (node.type === 'event') return 'event';
  if (node.type === 'milestone') return 'milestone';
  if (node.status === 'Completed') return 'done';
  if (node.status === 'Cancelled') return 'cancelled';
  if (start !== undefined && start + lengthOf(node) - 1 < today) return 'late';
  if (node.status === 'In_progress') return 'doing';
  if (node.status === 'On_hold') return 'hold';
  return 'todo';
}

// ── Graph ───────────────────────────────────────────────────────────────────

interface Links {
  before: Map<string, string[]>;
  after: Map<string, string[]>;
}

function linksOf(nodes: FlowNode[], edges: FlowEdge[]): Links {
  const before = new Map<string, string[]>();
  const after = new Map<string, string[]>();
  for (const node of nodes) {
    before.set(node.id, []);
    after.set(node.id, []);
  }
  for (const edge of edges) {
    before.get(edge.toId)?.push(edge.fromId);
    after.get(edge.fromId)?.push(edge.toId);
  }
  return { before, after };
}

/**
 * Every node after the ones it depends on. A board saved before loops were
 * refused can hold one; its nodes come last, in the order they are stored.
 */
function dependencyOrder(nodes: FlowNode[], links: Links): string[] {
  const waiting = new Map(nodes.map(node => [node.id, links.before.get(node.id)!.length]));
  const ready = nodes.filter(node => !waiting.get(node.id)).map(node => node.id);
  const order: string[] = [];

  for (let index = 0; index < ready.length; index++) {
    const id = ready[index];
    order.push(id);
    for (const next of links.after.get(id)!) {
      const left = waiting.get(next)! - 1;
      waiting.set(next, left);
      if (left === 0) ready.push(next);
    }
  }

  if (order.length < nodes.length) {
    const placed = new Set(order);
    for (const node of nodes) if (!placed.has(node.id)) order.push(node.id);
  }
  return order;
}

/** True when `toId` already leads back to `fromId`, so the new dependency would close a loop. */
export function wouldLoop(edges: FlowEdge[], fromId: string, toId: string): boolean {
  if (fromId === toId) return true;
  const seen = new Set<string>();
  const queue = [toId];
  while (queue.length) {
    const id = queue.pop()!;
    if (id === fromId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of edges) if (edge.fromId === id) queue.push(edge.toId);
  }
  return false;
}

// ── Critical path and slack ─────────────────────────────────────────────────

export interface Schedule {
  /** Ids on the chain of work that decides when the last node ends. */
  critical: Set<string>;
  /** Days each other dated node can slip before the plan's end moves. */
  slack: Map<string, number>;
}

/**
 * The critical path, from the planned dates: start at the node nothing dated depends
 * on that ends last (a milestone wins a tie) and walk back, each time taking the
 * predecessors that end last. Nodes without dates cannot be on it, and a board
 * with no dependencies has no path.
 */
export function scheduleOf(nodes: FlowNode[], edges: FlowEdge[], starts: Map<string, number>): Schedule {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = linksOf(nodes, edges);
  const endOf = (id: string) => starts.get(id)! + lengthOf(byId.get(id)!);
  const dated = nodes.filter(node => starts.has(node.id));

  const critical = new Set<string>();
  const slack = new Map<string, number>();
  if (!dated.length) return { critical, slack };

  let planEnd = -Infinity;
  for (const node of dated) planEnd = Math.max(planEnd, endOf(node.id));

  if (edges.length) {
    let target: FlowNode | null = null;
    for (const node of dated) {
      if (links.after.get(node.id)!.some(other => starts.has(other))) continue;
      if (!target) { target = node; continue; }
      const difference = endOf(node.id) - endOf(target.id);
      if (difference > 0 || (difference === 0 && node.type === 'milestone' && target.type !== 'milestone')) target = node;
    }

    const queue = target ? [target.id] : [];
    while (queue.length) {
      const id = queue.pop()!;
      if (critical.has(id)) continue;
      critical.add(id);

      const before = links.before.get(id)!.filter(other => starts.has(other));
      if (!before.length) continue;
      const latest = Math.max(...before.map(endOf));
      for (const other of before) if (endOf(other) === latest) queue.push(other);
    }
  }

  // After its dependents, so each node can add their slack to its own gap.
  const order = dependencyOrder(nodes, links).reverse();
  for (const id of order) {
    if (!starts.has(id) || critical.has(id)) continue;
    const after = links.after.get(id)!.filter(other => starts.has(other));
    const room = after.length
      ? Math.min(...after.map(other => starts.get(other)! - endOf(id) + (critical.has(other) ? 0 : slack.get(other) ?? 0)))
      : planEnd - endOf(id);
    slack.set(id, Math.max(0, room));
  }

  return { critical, slack };
}

// ── What if this slips ──────────────────────────────────────────────────────

/**
 * The plan with one node starting `slip` days later. In dependency order, a node
 * whose predecessor moved starts no earlier than that predecessor's new end: slack
 * absorbs a delay, a chain without slack moves by the whole amount.
 */
export function simulateSlip(
  nodes: FlowNode[], edges: FlowEdge[], starts: Map<string, number>, selectedId: string, slip: number
): Map<string, number> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = linksOf(nodes, edges);
  const moved = new Map<string, number>();

  for (const id of dependencyOrder(nodes, links)) {
    const planned = starts.get(id);
    if (planned === undefined) continue;

    let start = id === selectedId ? planned + slip : planned;
    for (const other of links.before.get(id)!) {
      const before = moved.get(other);
      if (before !== undefined && before !== starts.get(other)) {
        start = Math.max(start, before + lengthOf(byId.get(other)!));
      }
    }
    moved.set(id, start);
  }
  return moved;
}

export interface SlipImpact {
  text: string;
  /** `moved`: the final node moves. `safe`: it stays. `idle`: nothing to judge. */
  tone: 'idle' | 'moved' | 'safe';
  /** The other nodes whose dates change, in board order. */
  others: FlowNode[];
}

/** What a delay of the selected node does to the last node that depends on it. */
export function slipImpact(
  nodes: FlowNode[], edges: FlowEdge[], starts: Map<string, number>, moved: Map<string, number>,
  selectedId: string, slip: number, thisYear?: number
): SlipImpact {
  if (!starts.has(selectedId)) {
    return { text: t('Give this node dates to see what a delay moves.'), tone: 'idle', others: [] };
  }

  const byId = new Map(nodes.map(node => [node.id, node]));
  const links = linksOf(nodes, edges);

  const downstream = new Set<string>();
  const queue = [...links.after.get(selectedId)!];
  while (queue.length) {
    const id = queue.pop()!;
    if (downstream.has(id) || id === selectedId) continue;
    downstream.add(id);
    queue.push(...links.after.get(id)!);
  }

  const endOf = (id: string) => starts.get(id)! + lengthOf(byId.get(id)!);
  let target: FlowNode | null = null;
  for (const node of nodes) {
    if (!downstream.has(node.id) || !starts.has(node.id)) continue;
    if (links.after.get(node.id)!.some(other => starts.has(other))) continue;
    if (!target) { target = node; continue; }
    const milestone = Number(node.type === 'milestone') - Number(target.type === 'milestone');
    if (milestone > 0 || (milestone === 0 && endOf(node.id) > endOf(target.id))) target = node;
  }

  if (!target) return { text: t('Nothing depends on this, so nothing else moves.'), tone: 'idle', others: [] };
  if (!slip) return { text: t('Pick a delay to see what moves.'), tone: 'idle', others: [] };

  const others = nodes.filter(node =>
    node.id !== selectedId && starts.has(node.id) && moved.get(node.id) !== starts.get(node.id));
  const title = target.title.trim() || t('The last node');
  const planned = starts.get(target.id)!;
  const next = moved.get(target.id)!;

  if (next !== planned) {
    return { text: t('{title} moves to {date}.', { title, date: dayLabel(next, thisYear) }), tone: 'moved', others };
  }

  const stays = { title, date: dayLabel(planned, thisYear) };
  const before = links.before.get(target.id)!.filter(other => moved.has(other));
  if (!others.length || !before.length) {
    return { text: t('{title} stays on {date}. The delay fits in this node’s slack.', stays), tone: 'safe', others };
  }

  const buffer = Math.max(0, planned - Math.max(...before.map(other => moved.get(other)! + lengthOf(byId.get(other)!))));
  return {
    text: tCount(buffer, '{title} stays on {date}. {n} day of buffer left.', '{title} stays on {date}. {n} days of buffer left.', stays),
    tone: 'safe',
    others
  };
}

// ── Auto-layout ─────────────────────────────────────────────────────────────

/**
 * Left to right by dependency: a node sits one column after the last node it
 * depends on, and each column is ordered by planned start. Nodes that nothing
 * connects follow in short columns of their own.
 */
export function autoLayout(nodes: FlowNode[], edges: FlowEdge[]): Map<string, { x: number; y: number }> {
  const links = linksOf(nodes, edges);
  const starts = plannedStarts(nodes);
  const position = new Map(nodes.map((node, index) => [node.id, index]));
  const byStart = (a: string, b: string) =>
    (starts.get(a) ?? Infinity) - (starts.get(b) ?? Infinity) || position.get(a)! - position.get(b)!;

  const layer = new Map<string, number>();
  for (const id of dependencyOrder(nodes, links)) {
    const before = links.before.get(id)!.map(other => layer.get(other) ?? -1);
    layer.set(id, before.length ? Math.max(...before) + 1 : 0);
  }

  const columns: string[][] = [];
  const loose: string[] = [];
  for (const node of nodes) {
    if (!links.before.get(node.id)!.length && !links.after.get(node.id)!.length) {
      loose.push(node.id);
    } else {
      (columns[layer.get(node.id)!] ??= []).push(node.id);
    }
  }

  const rows = Math.max(LAYOUT_LOOSE_ROWS, ...columns.map(column => column?.length ?? 0));
  loose.sort(byStart);
  for (let index = 0; index < loose.length; index += rows) columns.push(loose.slice(index, index + rows));

  const placed = new Map<string, { x: number; y: number }>();
  columns.filter(column => column?.length).forEach((column, columnIndex) => {
    column.sort(byStart).forEach((id, rowIndex) => {
      placed.set(id, { x: LAYOUT_LEFT + columnIndex * LAYOUT_COLUMN, y: LAYOUT_TOP + rowIndex * LAYOUT_ROW });
    });
  });
  return placed;
}

// ── Timeline ────────────────────────────────────────────────────────────────

export interface TimelineRange {
  /** Day number of the first column. */
  first: number;
  /** How many day columns are drawn. */
  count: number;
}

/**
 * The days the timeline shows: from the earliest planned start to two days past
 * the latest end, never fewer than the design's 19 columns. Today is included
 * when it is near the plan, or when a node without dates has to sit on it.
 */
export function timelineRange(nodes: FlowNode[], starts: Map<string, number>, today: number): TimelineRange {
  let first = Infinity;
  let last = -Infinity;
  let undated = false;

  for (const node of nodes) {
    const start = starts.get(node.id);
    if (start === undefined) { undated = true; continue; }
    first = Math.min(first, start);
    last = Math.max(last, start + lengthOf(node) + 2);
  }

  if (first === Infinity) {
    first = today - 3;
    last = today + 3;
  } else if (undated || (today >= first - 14 && today <= last + 14)) {
    first = Math.min(first, today);
    last = Math.max(last, today + 3);
  }

  return { first, count: Math.min(MAX_DAY_COLUMNS, Math.max(MIN_DAY_COLUMNS, last - first)) };
}

/** Rows of the timeline: by planned start, nodes without dates last. */
export function laneOrder(nodes: FlowNode[]): string[] {
  const starts = plannedStarts(nodes);
  return nodes
    .map((node, index) => ({ id: node.id, start: starts.get(node.id) ?? Infinity, index }))
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map(entry => entry.id);
}

/** Where a node is drawn in the flow view. */
export function flowBox(node: FlowNode): Box {
  return {
    x: node.x,
    y: node.y,
    w: node.type === 'milestone' ? MILESTONE_WIDTH : NODE_WIDTH,
    h: node.type === 'task' ? TASK_HEIGHT : OTHER_HEIGHT
  };
}

/** Where a node's bar is drawn in the timeline. A node without dates sits on today. */
export function timeBox(node: FlowNode, start: number | undefined, row: number, range: TimelineRange, today: number): Box {
  const y = TIME_TOP + row * ROW_HEIGHT;
  if (start === undefined) {
    return { x: TIME_X0 + (today - range.first) * DAY_WIDTH + 2, y, w: UNDATED_BAR_WIDTH, h: BAR_HEIGHT };
  }
  const w = node.type === 'milestone' ? BAR_HEIGHT : Math.max(30, lengthOf(node) * DAY_WIDTH - 4);
  return { x: TIME_X0 + (start - range.first) * DAY_WIDTH + 2, y, w, h: BAR_HEIGHT };
}

/** The connector between two boxes and its arrowhead, as the design's logic block draws them. */
export function edgePath(a: Box, b: Box): { d: string; arrow: string } {
  if (b.x >= a.x + a.w - 4) {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 2, y2 = b.y + b.h / 2;
    const dx = Math.max(30, (x2 - x1) / 2);
    return {
      d: `M${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      arrow: `M${x2 - 7} ${y2 - 4} L${x2} ${y2} L${x2 - 7} ${y2 + 4}`
    };
  }

  const down = b.y >= a.y;
  const sign = down ? 1 : -1;
  const x1 = a.x + a.w / 2, y1 = down ? a.y + a.h : a.y;
  const x2 = b.x + b.w / 2, y2 = down ? b.y - 2 : b.y + b.h + 2;
  const dy = Math.max(30, Math.abs(y2 - y1) / 2) * sign;
  return {
    d: `M${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`,
    arrow: `M${x2 - 4} ${y2 - 7 * sign} L${x2} ${y2} L${x2 + 4} ${y2 - 7 * sign}`
  };
}

/** The dashed line that follows the pointer while a dependency is being dragged out of a node. */
export function previewPath(from: Box, x: number, y: number): string {
  const x1 = from.x + from.w, y1 = from.y + from.h / 2;
  const dx = Math.max(30, Math.abs(x - x1) / 2);
  return `M${x1} ${y1} C ${x1 + dx} ${y1}, ${x - dx} ${y}, ${x} ${y}`;
}

/** Two letters for the owner's circle: "Eslam Mohamed" → "EM". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').split(/[\s@.]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}
