import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, OnDestroy, OnInit,
  afterNextRender, computed, effect, inject, signal, untracked, viewChild
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BoardDto, BoardService } from '../../core/services/board.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { CalendarService } from '../../core/services/calendar.service';
import { ChatService } from '../../core/services/chat.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { TaskService } from '../../core/services/task.service';
import { ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { currentNumerals, direction, formatNumber, isRtl, latinDigits, locale, num, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../core/i18n/t.pipe';
import { UserService } from '../../core/services/user.service';
import { placeForZone, prayerTimes } from '../../core/utils/prayer-times';
import { dayKeyInZone, formatTimeInZone, zonedParts } from '../../core/utils/time-zone';
import { UserMenu } from '../../layout/user-menu/user-menu';
import { CalendarItemDto, TaskDto } from '../../models/api.models';
import { ExportColors, renderBoard } from './whiteboard-export';
import {
  Agenda, AgendaItem, BoardContent, Box, Connector, ConnectorEnd, ERASER_WIDTH, FRAME_H, FRAME_LABEL_RISE, FRAME_W,
  MadeTask, NOTE_H, NOTE_W, Note, PEN_WIDTHS, Point, ShapeKind, Stroke, TONES, TextItem, Tone, Tool,
  anchorBoxes, boxOf, connectorLine, contentBox, edgeDistance, emptyAgenda, emptyContent, inside, intersects, isTone,
  itemBoxes, moved, movingSet, nearestSide, noteBox, noteTurn, parseBoard, round, serializeBoard, strokeBox,
  textTurn, uid, union, without
} from './whiteboard.model';

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type ItemKind = 'note' | 'shape' | 'text' | 'frame' | 'connector';

/** What the pointer is in the middle of doing. One at a time. */
type Gesture = { pointer: number } & (
  | { kind: 'pan'; x: number; y: number; left: number; top: number }
  | { kind: 'draw'; stroke: Stroke }
  | { kind: 'place'; tool: 'sticky' | 'text'; x: number; y: number }
  | { kind: 'box'; tool: 'shape' | 'frame'; start: Point }
  | { kind: 'connect'; from: ConnectorEnd }
  | { kind: 'marquee'; start: Point; keep: string[] }
  | { kind: 'tap' }
  | {
      kind: 'move'; start: Point; x: number; y: number; before: BoardContent;
      set: { ids: Set<string>; strokes: Set<number> }; min: Point; dragging: boolean;
      /** The item under the pointer, and whether it was already the only thing selected. */
      item: string; only: boolean;
    }
  | { kind: 'resize'; start: Point; before: BoardContent; item: string; corner: Corner; box: Box }
);

/** What a board is called until it is given a name: in the language it was started in. */
const DEFAULT_NAME = t('My whiteboard');
/** Empty room kept past the furthest thing on the board, so there is always space to carry on. */
const BOARD_MARGIN = 240;
/** The board grows in steps, so dragging something outwards does not resize the ink on every move. */
const GROW_STEP = 240;
/** Upper bound for the ink's backing store, in device pixels (about 4000 x 3000). */
const MAX_CANVAS_PIXELS = 12_000_000;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 2;
/** Pointer travel below which a press is a click, not a drag. */
const DRAG_SLOP = 4;
const HISTORY_LIMIT = 100;
const SELECTION_PAD = 8;
const MAP_W = 132;
const MAP_H = 92;
const MAP_PAD = 6;
/** How long "N tasks added" stays, with its Undo. */
const MADE_NOTICE_MS = 8000;

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select', h: 'hand', s: 'sticky', r: 'shape', t: 'text', p: 'pen', c: 'connector', f: 'frame'
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const floor0 = (value: number) => Math.max(0, round(value));
const growTo = (value: number) => Math.ceil(value / GROW_STEP) * GROW_STEP;

@Component({
  selector: 'app-whiteboard-page',
  standalone: true,
  imports: [RouterLink, UserMenu, TPipe, TCountPipe, NumPipe],
  templateUrl: './whiteboard-page.html',
  styleUrl: './whiteboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.presenting]': 'presenting()' }
})
export class WhiteboardPage implements OnInit, OnDestroy {
  private boards = inject(BoardService);
  private tasks = inject(TaskService);
  private calendar = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private users = inject(UserService);
  private prefs = inject(LocalPrefsService);
  private toasts = inject(ToastService);
  private themes = inject(ThemeService);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private chat = inject(ChatService);
  /** The chat button shares the page's bottom corner with the side panel. */
  readonly besideChat = this.chat.cornerInUse;

  private scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');
  private surfaceRef = viewChild<ElementRef<HTMLElement>>('surface');
  private canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('ink');
  /** The one text field that is open on the board (a sticky, a text, a name or a label). */
  private editField = viewChild<ElementRef<HTMLElement>>('editField');

  // ── The board ─────────────────────────────────────────────────────────────
  readonly name = signal(DEFAULT_NAME);
  readonly content = signal<BoardContent>(emptyContent());
  readonly agenda = signal<Agenda>(emptyAgenda());
  /** Tasks made from this board, as saved with it. */
  private readonly made = signal<MadeTask[]>([]);
  /** The user's tasks by id, once known: a made task that has since been deleted is no longer listed. */
  private readonly liveTasks = signal<Map<string, string> | null>(null);
  readonly madeTasks = computed(() => {
    const live = this.liveTasks();
    if (!live) return this.made();
    return this.made().filter(task => live.has(task.id)).map(task => ({ ...task, title: live.get(task.id)! }));
  });
  /** The saved board is on its way: nothing can be drawn that it would then replace. */
  private readonly loading = signal(false);

  /** Null until the first save creates the row. */
  private boardId: string | null = null;
  /** Opened as `/whiteboard/new`: the first save puts the board's own address in the bar. */
  private startedNew = false;
  /** Debounced so a stroke does not become a request per pointer move. */
  private changed$ = new Subject<void>();
  private dirty = false;
  private destroyed = false;
  private readonly saving = signal(false);
  private readonly saveFailed = signal(false);
  private readonly savedAt = signal<number | null>(null);
  /** The clock, for "saved 3 min ago", the meeting card and the next prayer time. */
  private readonly now = signal(Date.now());

  readonly saveLabel = computed(() => {
    if (this.saving()) return t('saving…');
    if (this.saveFailed()) return t('could not save');
    const at = this.savedAt();
    if (at === null) return t('not saved yet');

    const minutes = Math.floor((this.now() - at) / 60_000);
    if (minutes < 1) return t('saved just now');
    if (minutes < 60) return tCount(minutes, 'saved {n} min ago', 'saved {n} min ago');
    return t('saved at {time}', { time: this.clock(new Date(at)) });
  });

  /** The page's direction, for the chrome that sits inside the left-to-right board. */
  readonly dir = direction();
  /** A browser's number field only draws 0-9: with Arabic digits the field is a text one, read back through latinDigits. */
  readonly numberField = currentNumerals() === 'arab' ? 'text' : 'number';

  // ── Tools ─────────────────────────────────────────────────────────────────
  readonly tools: { key: Tool; label: string; shortcut: string; d: string }[] = [
    { key: 'select', label: t('Select@@tool'), shortcut: 'V', d: 'M5 3l14 7-6 2-2 6z' },
    { key: 'hand', label: t('Pan'), shortcut: 'H', d: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3 15a1.5 1.5 0 0 1 2.4-1.8L8 15' },
    { key: 'sticky', label: t('Sticky note'), shortcut: 'S', d: 'M4 4h16v10l-6 6H4zM14 20v-6h6' },
    { key: 'shape', label: t('Shape'), shortcut: 'R', d: 'M4 4h8v8H4zM16 20a4 4 0 1 0 0-8a4 4 0 1 0 0 8z' },
    { key: 'text', label: t('Text'), shortcut: 'T', d: 'M5 6V4h14v2M12 4v16M9 20h6' },
    { key: 'pen', label: t('Pen'), shortcut: 'P', d: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4' },
    { key: 'connector', label: t('Connector'), shortcut: 'C', d: 'M5 19L19 5M19 5h-6M19 5v6' },
    { key: 'frame', label: t('Frame'), shortcut: 'F', d: 'M7 3v18M17 3v18M3 7h18M3 17h18' }
  ];
  readonly tones = TONES;
  readonly penWidths = PEN_WIDTHS;
  readonly shapeKinds: { key: ShapeKind; label: string; d: string }[] = [
    { key: 'rect', label: t('Rectangle'), d: 'M5 6h14v12H5z' },
    { key: 'ellipse', label: t('Ellipse'), d: 'M12 19c4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7 3.6 7 8 7z' },
    { key: 'diamond', label: t('Diamond'), d: 'M12 4l8 8-8 8-8-8z' }
  ];
  readonly corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
  readonly toneLabels: Record<Tone, string> = {
    gold: t('Colour gold'), sage: t('Colour sage'), sky: t('Colour sky'), rose: t('Colour rose'), lilac: t('Colour lilac')
  };
  private readonly optionLabels: Partial<Record<Tool, string>> = {
    pen: t('Options for pen'), sticky: t('Options for sticky'), shape: t('Options for shape'), text: t('Options for text')
  };

  readonly tool = signal<Tool>('select');
  /** The colour new stickies, ink, shapes and texts take. */
  readonly tone = signal<Tone>('gold');
  readonly penWidth = signal(PEN_WIDTHS[0]);
  /** The pen rubs out instead of drawing. */
  readonly erasing = signal(false);
  readonly shapeKind = signal<ShapeKind>('rect');
  /** While presenting the board can only be moved around. */
  readonly activeTool = computed<Tool>(() => (this.presenting() ? 'hand' : this.tool()));
  readonly optionsLabel = computed(() => this.optionLabels[this.tool()] ?? '');

  // ── Selection and editing ─────────────────────────────────────────────────
  readonly selection = signal<string[]>([]);
  private readonly selected = computed(() => new Set(this.selection()));
  /** Id of the item whose text field is open. */
  readonly editing = signal<string | null>(null);
  private editBefore: BoardContent | null = null;

  private readonly kinds = computed(() => {
    const content = this.content();
    const kinds = new Map<string, ItemKind>();
    for (const item of content.notes) kinds.set(item.id, 'note');
    for (const item of content.shapes) kinds.set(item.id, 'shape');
    for (const item of content.texts) kinds.set(item.id, 'text');
    for (const item of content.frames) kinds.set(item.id, 'frame');
    for (const item of content.connectors) kinds.set(item.id, 'connector');
    return kinds;
  });

  private readonly boxes = computed(() => itemBoxes(this.content()));
  private readonly anchors = computed(() => anchorBoxes(this.content()));

  readonly connectorLines = computed(() => {
    const boxes = this.anchors();
    return this.content().connectors.map(connector => ({ id: connector.id, label: connector.label ?? '', ...connectorLine(connector, boxes) }));
  });

  /** Shift is down: more things are being added to the selection, so its bar stays out of the way. */
  readonly adding = signal(false);
  /** The line being pulled out with the connector tool. */
  private readonly draftConnector = signal<Connector | null>(null);
  readonly draftLine = computed(() => {
    const draft = this.draftConnector();
    return draft ? connectorLine(draft, this.anchors()) : null;
  });
  /** The shape or frame being dragged out. */
  readonly draftBox = signal<{ tool: 'shape' | 'frame'; box: Box } | null>(null);
  readonly marquee = signal<Box | null>(null);
  readonly panning = signal(false);
  readonly dragging = signal(false);
  private gesture: Gesture | null = null;

  readonly selectedNotes = computed(() => {
    const selected = this.selected();
    return this.content().notes.filter(note => selected.has(note.id));
  });

  private readonly madeByNote = computed(() => {
    const byNote = new Map<string, MadeTask>();
    for (const task of this.madeTasks()) if (task.noteId) byNote.set(task.noteId, task);
    return byNote;
  });

  /** Selected stickies that can become tasks: they say something and are not a task yet. */
  readonly taskable = computed(() => {
    const made = this.madeByNote();
    return this.selectedNotes().filter(note => note.text.trim() && !made.has(note.id));
  });
  readonly making = signal(false);

  /** Selected things that take a colour or join a group. */
  private readonly selectedTinted = computed(() => {
    const selected = this.selected();
    const content = this.content();
    return [...content.notes, ...content.shapes, ...content.texts].filter(item => selected.has(item.id));
  });
  readonly canTint = computed(() => this.selectedTinted().length > 0);
  readonly canGroup = computed(() => this.selectedTinted().length > 1);
  /** True when everything selected is already one group. */
  readonly grouped = computed(() => {
    const items = this.selectedTinted();
    return items.length > 1 && !!items[0].group && items.every(item => item.group === items[0].group);
  });
  /** The colour everything selected has, when it is the same one. */
  readonly selectionTone = computed(() => {
    const items = this.selectedTinted();
    return items.length && items.every(item => item.color === items[0].color) ? items[0].color : null;
  });
  readonly selectedConnector = computed(() => {
    const ids = this.selection();
    return ids.length === 1 && this.kinds().get(ids[0]) === 'connector' ? ids[0] : null;
  });
  /** The one selected item whose corners can be dragged. */
  readonly resizable = computed(() => {
    const ids = this.selection();
    const kind = ids.length === 1 ? this.kinds().get(ids[0]) : undefined;
    return kind === 'note' || kind === 'shape' || kind === 'frame' ? ids[0] : null;
  });

  readonly selectionBox = computed<Box | null>(() => {
    const boxes = this.boxes();
    const lines = this.connectorLines();
    const picked: Box[] = [];
    for (const id of this.selection()) {
      const box = boxes.get(id) ?? lines.find(line => line.id === id)?.box;
      if (box) picked.push(box);
    }
    const all = union(picked);
    // As drawn in the design: 8px around, 10px below.
    return all && { x: all.x - SELECTION_PAD, y: all.y - SELECTION_PAD, w: all.w + SELECTION_PAD * 2, h: all.h + SELECTION_PAD * 2 + 2 };
  });

  readonly selectionLabel = computed(() => {
    const notes = this.selectedNotes().length;
    const total = this.selection().length;
    if (notes === total) return tCount(notes, 'Selection, {n} sticky', 'Selection, {n} stickies');
    return tCount(total, 'Selection, {n} item', 'Selection, {n} items');
  });

  // ── History ───────────────────────────────────────────────────────────────
  private readonly undoStack = signal<BoardContent[]>([]);
  private readonly redoStack = signal<BoardContent[]>([]);
  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly isEmpty = computed(() => {
    const content = this.content();
    return !content.strokes.length && !this.kinds().size;
  });

  // ── View: size, zoom, minimap ─────────────────────────────────────────────
  readonly zoom = signal(1);
  readonly zoomLabel = computed(() =>
    formatNumber(Math.round(this.zoom() * 100) / 100, { style: 'percent', maximumFractionDigits: 0 }));
  private readonly viewW = signal(0);
  private readonly viewH = signal(0);
  private readonly scrollX = signal(0);
  private readonly scrollY = signal(0);
  private readonly bounds = computed(() => contentBox(this.content()));

  /**
   * The board is as large as what is on it, and never smaller than the visible area,
   * so there is always canvas under the pointer. It scrolls inside its frame.
   */
  readonly surfaceW = computed(() => {
    const used = this.used();
    return Math.max(used ? growTo(used.x + used.w + BOARD_MARGIN) : 0, Math.ceil(this.viewW() / this.zoom()));
  });
  readonly surfaceH = computed(() => {
    const used = this.used();
    return Math.max(used ? growTo(used.y + used.h + BOARD_MARGIN) : 0, Math.ceil(this.viewH() / this.zoom()));
  });
  private readonly strokes = computed(() => this.content().strokes);
  /** Everything on the board, rubbed-out strokes included: the ink layer has to reach all of it. */
  private readonly used = computed(() => {
    const bounds = this.bounds();
    return union([...(bounds ? [bounds] : []), ...this.strokes().map(strokeBox)]);
  });

  readonly minimap = computed(() => {
    const zoom = this.zoom();
    const content = this.content();
    const view: Box = { x: this.scrollX() / zoom, y: this.scrollY() / zoom, w: this.viewW() / zoom, h: this.viewH() / zoom };
    const bounds = this.bounds();
    const area = union(bounds ? [view, bounds] : [view])!;
    const scale = Math.min((MAP_W - MAP_PAD * 2) / (area.w || 1), (MAP_H - MAP_PAD * 2) / (area.h || 1));
    const left = (MAP_W - area.w * scale) / 2 - area.x * scale;
    const top = (MAP_H - area.h * scale) / 2 - area.y * scale;
    const place = (box: Box) => ({
      left: box.x * scale + left, top: box.y * scale + top,
      width: Math.max(2, box.w * scale), height: Math.max(2, box.h * scale)
    });
    return {
      scale, left, top,
      view: place(view),
      frames: content.frames.map(frame => ({ id: frame.id, ...place(frame) })),
      // Frames are the landmarks; what sits inside one is not drawn again.
      blocks: [...content.notes.map(noteBox), ...content.shapes]
        .filter(box => !content.frames.some(frame => intersects(frame, box)))
        .map(place)
    };
  });

  // ── Presenting ────────────────────────────────────────────────────────────
  readonly presenting = signal(false);
  readonly slide = signal(0);
  /** Frames in reading order: each is one step of a presentation. */
  readonly slides = computed(() =>
    [...this.content().frames].sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) / 2 ? a.y - b.y : a.x - b.x)));
  readonly slideTitle = computed(() => this.slides()[this.slide()]?.label || '');
  private zoomBefore = 1;

  readonly shareOpen = signal(false);
  /** Phone width: the account circle is drawn at tap size. */
  readonly phone = signal(false);

  // ── Side panel ────────────────────────────────────────────────────────────
  private readonly events = signal<CalendarItemDto[]>([]);

  /** The meeting on the calendar right now, or the next one today. */
  readonly meeting = computed(() => {
    const now = this.now();
    const zone = this.users.timeZone();
    const today = dayKeyInZone(new Date(now), zone);
    const timed = this.events()
      .map(event => ({ event, start: Date.parse(event.start), end: Date.parse(event.end) }))
      .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end))
      .sort((a, b) => a.start - b.start);

    const live = timed.find(item => item.start <= now && now < item.end);
    const pick = live ?? timed.find(item => item.start > now && dayKeyInZone(new Date(item.start), zone) === today);
    if (!pick) return null;

    const start = new Date(pick.start);
    // "Fri 13 Nov" / "الجمعة ١٣ نوفمبر": the same order in both languages, whatever the locale's own.
    const parts = new Intl.DateTimeFormat(locale(), { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' })
      .formatToParts(start);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(piece => piece.type === type)?.value ?? '';
    const day = `${part('weekday')} ${part('day')} ${part('month')}`;
    return {
      live: !!live,
      title: pick.event.title,
      when: `${day} · ${this.clock(start)} – ${this.clock(new Date(pick.end))}`,
      query: { event: pick.event.id, date: dayKeyInZone(start, zone) }
    };
  });

  /** The next prayer today, when the prayer-time layer is on and the place is known. */
  readonly prayer = computed(() => {
    if (!this.prefs.prayerTimes()) return null;
    const zone = this.users.timeZone();
    const place = placeForZone(zone);
    if (!place) return null;

    const now = this.now();
    const parts = zonedParts(new Date(now), zone);
    const next = prayerTimes(parts.year, parts.month, parts.day, place, this.prefs.prayerMethod() ?? place.method)
      .find(time => time.name !== 'Sunrise' && time.at.getTime() > now);
    if (!next) return null;
    // The name is the calculation's own; what is shown is translated.
    const names = { prayer: t(next.name), time: this.clock(next.at) };
    return {
      name: next.name,
      at: next.at.getTime(),
      label: t('{prayer} at {time}', names),
      pauseLabel: t('{prayer} at {time} · pause planned', names)
    };
  });
  /** The timer stops by itself when that prayer time comes (Settings → Planning: plan around prayer). */
  readonly pausePlanned = computed(() => this.running() && !!this.prayer() && this.prefs.planAroundPrayer());

  /** The "add an item" row of the agenda is open. */
  readonly agendaOpen = signal(false);
  private agendaField = viewChild<ElementRef<HTMLInputElement>>('agendaField');
  readonly running = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;
  private timerEndsAt = 0;
  private pauseAt: { name: string; at: number } | null = null;

  /** The agenda item the timer is on: the chosen one, or the first that is not done. */
  readonly currentItem = computed(() => {
    const agenda = this.agenda();
    return agenda.items.find(item => item.id === agenda.current && !item.done) ?? agenda.items.find(item => !item.done) ?? null;
  });
  readonly timerText = computed(() => {
    const agenda = this.agenda();
    const item = this.currentItem();
    const left = !item ? 0 : agenda.current === item.id ? agenda.left : item.minutes * 60;
    return num(`${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`);
  });

  readonly topVotes = computed(() => {
    const voted = this.content().notes.filter(note => (note.votes ?? 0) > 0 && note.text.trim())
      .sort((a, b) => b.votes! - a.votes!).slice(0, 3);
    const most = voted[0]?.votes ?? 1;
    return voted.map(note => ({ id: note.id, text: note.text.trim(), votes: note.votes!, share: (note.votes! / most) * 100 }));
  });

  /** "3 tasks added", shown over the board with its Undo. */
  readonly madeNotice = signal<{ ids: string[] } | null>(null);
  private madeNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Ink ───────────────────────────────────────────────────────────────────
  /** Everything already drawn, kept as a picture so a new stroke costs only itself. */
  private inkCache: HTMLCanvasElement | null = null;
  private inkScale = 1;
  private liveStroke: Stroke | null = null;
  private inkColors = new Map<string, string>();
  private inkTheme = '';

  constructor() {
    // 1.2s after the last change: long enough that a continuous scribble is one
    // request, short enough that closing the tab rarely loses anything.
    this.changed$
      .pipe(debounceTime(1200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.persist());

    const narrow = matchMedia('(max-width: 767.98px)');
    const onNarrow = () => this.phone.set(narrow.matches);
    onNarrow();
    narrow.addEventListener('change', onNarrow);
    this.destroyRef.onDestroy(() => narrow.removeEventListener('change', onNarrow));

    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    const feed = setInterval(() => this.loadEvents(), 600_000);
    this.destroyRef.onDestroy(() => { clearInterval(clock); clearInterval(feed); });

    // The ink is repainted when it changes, when the board or the zoom changes
    // size, and when the theme does (the colours are the theme's).
    effect(() => {
      const canvas = this.canvasRef()?.nativeElement;
      this.strokes();
      this.surfaceW();
      this.surfaceH();
      this.zoom();
      this.themes.theme();
      if (canvas) untracked(() => this.renderInk());
    });

    // The field of whatever is being edited takes the keyboard as soon as it exists.
    effect(() => {
      const field = this.editField()?.nativeElement as HTMLInputElement | HTMLTextAreaElement | undefined;
      if (!field || document.activeElement === field) return;
      field.focus({ preventScroll: true });
      field.setSelectionRange?.(field.value.length, field.value.length);
    });

    // Opening the agenda's "add an item" row puts the keyboard in it.
    effect(() => {
      if (this.agendaOpen()) this.agendaField()?.nativeElement.focus();
    });

    // The frame's size is what "at least as large as the visible area" is measured against.
    effect(onCleanup => {
      const scroller = this.scrollerRef()?.nativeElement;
      if (!scroller) return;
      const observer = new ResizeObserver(() => {
        this.viewW.set(scroller.clientWidth);
        this.viewH.set(scroller.clientHeight);
        if (this.presenting()) this.showSlide();
      });
      observer.observe(scroller);
      onCleanup(() => observer.disconnect());
    });
  }

  ngOnInit() {
    this.restore();
    this.loadEvents();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.stopTimer();
    if (this.madeNoticeTimer) clearTimeout(this.madeNoticeTimer);
    // Leaving inside the debounce window: send what has not been sent yet.
    if (this.dirty) this.persist();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  /**
   * Loads the board this route refers to.
   *
   * `/whiteboard/new` deliberately starts empty and unattached, so the next
   * save creates a second board rather than overwriting the first.
   */
  private restore() {
    // `/whiteboard/new` matches the literal route declared before `:id`, so it
    // carries no route param. The URL segment is the reliable signal.
    const segments = this.route.snapshot.url.map(s => s.path);
    const last = segments[segments.length - 1];
    if (last === 'new') { this.startedNew = true; return; }
    const id = last && last !== 'whiteboard' ? last : null;

    const load = id ? this.boards.getById(id) : this.boards.latest('Whiteboard');
    this.loading.set(true);
    load.subscribe(board => {
      this.loading.set(false);
      if (board) this.open(board);
    });
  }

  private open(board: BoardDto) {
    this.boardId = board.id;
    this.name.set(board.name?.trim() || DEFAULT_NAME);
    // A board that cannot be read opens blank; the next save writes it afresh.
    const state = parseBoard(board.content);
    this.content.set(state.content);
    this.agenda.set(state.agenda);
    this.made.set(state.made);
    const saved = Date.parse(board.updatedAt ?? board.createdAt);
    this.savedAt.set(Number.isFinite(saved) ? saved : null);

    if (!state.made.length) return;
    this.tasks.getTasks().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: tasks => this.liveTasks.set(new Map(tasks.map(task => [task.id, task.title]))),
      // Not knowing is not the same as gone: the saved list stays as it is.
      error: () => {}
    });
  }

  /** Called by every change that has to be saved; the debounce upstream does the batching. */
  private touch() {
    this.dirty = true;
    this.changed$.next();
  }

  private persist() {
    // One request at a time: a second create before the first answers would make two boards.
    if (this.saving()) return;
    this.dirty = false;

    const content = serializeBoard({ content: this.content(), agenda: this.agenda(), made: this.madeTasks() });
    const name = this.name().trim() || DEFAULT_NAME;
    this.saving.set(true);

    const request = this.boardId
      ? this.boards.update(this.boardId, 'Whiteboard', content, name)
      : this.boards.create('Whiteboard', content, name);

    request.subscribe({
      next: board => {
        const created = !this.boardId && !!board?.id;
        this.boardId = board?.id ?? this.boardId;
        this.saving.set(false);
        this.saveFailed.set(false);
        this.savedAt.set(Date.now());
        // So a reload opens this board instead of starting another new one.
        if (created && this.startedNew) this.location.replaceState(`/whiteboard/${this.boardId}`);
        // What changed while the request was out; after leaving the page nothing else would send it.
        if (this.dirty) this.destroyed ? this.persist() : this.changed$.next();
      },
      error: () => {
        this.saving.set(false);
        this.saveFailed.set(true);
      }
    });
  }

  rename(value: string) {
    this.name.set(value);
    this.touch();
  }

  /** An emptied name goes back to the default rather than staying blank. */
  finishRename() {
    if (!this.name().trim()) this.name.set(DEFAULT_NAME);
  }

  // ── History ───────────────────────────────────────────────────────────────

  /** Records the state before a change that has already been applied. */
  private remember(before: BoardContent) {
    if (before === this.content()) return;
    this.undoStack.update(stack => [...stack.slice(-(HISTORY_LIMIT - 1)), before]);
    this.redoStack.set([]);
    this.touch();
  }

  /** Applies a change as one undoable step. */
  private change(next: BoardContent) {
    const before = this.content();
    this.content.set(next);
    this.remember(before);
  }

  undo() {
    this.endEdit();
    const stack = this.undoStack();
    const previous = stack.at(-1);
    if (!previous) return;
    this.undoStack.set(stack.slice(0, -1));
    this.redoStack.update(redo => [...redo, this.content()]);
    this.show(previous);
  }

  redo() {
    this.endEdit();
    const stack = this.redoStack();
    const next = stack.at(-1);
    if (!next) return;
    this.redoStack.set(stack.slice(0, -1));
    this.undoStack.update(undo => [...undo, this.content()]);
    this.show(next);
  }

  private show(content: BoardContent) {
    this.content.set(content);
    const kinds = this.kinds();
    this.selection.update(ids => ids.filter(id => kinds.has(id)));
    this.touch();
  }

  clear() {
    if (this.isEmpty() || !confirm(t('Clear the whole board?'))) return;
    this.endEdit();
    this.selection.set([]);
    this.change(emptyContent());
  }

  // ── Tools ─────────────────────────────────────────────────────────────────

  setTool(tool: Tool) {
    this.endEdit();
    this.tool.set(tool);
    if (tool !== 'select') this.selection.set([]);
  }

  setTone(tone: Tone) {
    this.tone.set(tone);
    this.erasing.set(false);
  }

  setPenWidth(width: number) {
    this.penWidth.set(width);
    this.erasing.set(false);
  }

  /** The tone of a saved colour, or null for a plain CSS colour from an older board. */
  toneOf(color: string): Tone | null {
    return isTone(color) ? color : null;
  }

  /** What a screen reader says for a sticky. */
  noteLabel(text: string): string {
    return text ? t('Sticky note: {text}', { text }) : t('Sticky note: empty');
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  taskOf(noteId: string): MadeTask | undefined {
    return this.madeByNote().get(noteId);
  }

  // ── Pointer ───────────────────────────────────────────────────────────────
  // Pointer events, not mouse events: one code path for mouse, pen and finger.

  /** Viewport coordinates → coordinates on the board, whatever the scroll and the zoom. */
  private toBoard(e: { clientX: number; clientY: number }): Point {
    const rect = this.surfaceRef()!.nativeElement.getBoundingClientRect();
    const zoom = this.zoom();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  private begin(e: PointerEvent, gesture: Gesture, capture = true) {
    this.gesture = gesture;
    // Without capture, releasing outside the board never ends the gesture here.
    if (capture) this.scrollerRef()!.nativeElement.setPointerCapture(e.pointerId);
  }

  /** The item an element belongs to, or the frame whose outline the point is on. */
  private hit(target: Element | null, point: Point): string | null {
    const id = target?.closest<HTMLElement>('[data-id]')?.dataset['id'];
    if (id) return id;
    const reach = 6 / this.zoom();
    const frames = this.content().frames;
    for (let i = frames.length - 1; i >= 0; i--) {
      if (edgeDistance(frames[i], point) <= reach) return frames[i].id;
    }
    return null;
  }

  /** An end of a connector at this point: attached to the item there, or free. */
  private endAt(point: Point, item: string | null): ConnectorEnd {
    const box = item ? this.boxes().get(item) : undefined;
    const at = { x: floor0(point.x), y: floor0(point.y) };
    return box ? { item: item!, side: nearestSide(box, point), ...at } : at;
  }

  onPointerDown(e: PointerEvent) {
    if (this.gesture || !e.isPrimary || this.loading()) return;
    const target = e.target as HTMLElement;
    // Fields and buttons on the board work as they do anywhere.
    if (target.closest('input, textarea, button, a')) return;

    const scroller = this.scrollerRef()!.nativeElement;
    const tool = this.activeTool();
    const touch = e.pointerType === 'touch';
    const pointer = e.pointerId;

    // The hand, or the middle button with any tool, moves the board. A finger
    // already scrolls it natively, so this is for the mouse and the pen.
    if (e.button === 1 || (tool === 'hand' && e.button === 0 && !touch)) {
      e.preventDefault();
      this.begin(e, { pointer, kind: 'pan', x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop });
      this.panning.set(true);
      return;
    }
    if (e.button !== 0 || tool === 'hand') return;

    const point = this.toBoard(e);
    switch (tool) {
      case 'pen': {
        e.preventDefault();
        this.endEdit();
        const erasing = this.erasing();
        const stroke: Stroke = {
          color: this.tone(),
          width: erasing ? ERASER_WIDTH : this.penWidth(),
          type: erasing ? 'eraser' : 'pen',
          points: [{ x: round(point.x), y: round(point.y) }]
        };
        this.begin(e, { pointer, kind: 'draw', stroke });
        this.liveStroke = stroke;
        this.presentInk();
        return;
      }
      case 'sticky':
      case 'text':
        // Placed on release, so a finger that turns out to be scrolling places nothing.
        this.begin(e, { pointer, kind: 'place', tool, x: e.clientX, y: e.clientY }, false);
        return;
      case 'shape':
      case 'frame':
        e.preventDefault();
        this.begin(e, { pointer, kind: 'box', tool, start: point });
        return;
      case 'connector':
        e.preventDefault();
        this.begin(e, { pointer, kind: 'connect', from: this.endAt(point, this.attachable(this.hit(target, point))) });
        return;
    }

    // Select.
    const corner = target.closest<HTMLElement>('[data-handle]')?.dataset['handle'] as Corner | undefined;
    const sized = this.resizable();
    if (corner && sized) {
      e.preventDefault();
      this.begin(e, { pointer, kind: 'resize', start: point, before: this.content(), item: sized, corner, box: this.boxes().get(sized)! });
      return;
    }

    const id = this.hit(target, point);
    if (!id) {
      this.endEdit();
      // A finger on empty board scrolls it; a tap there lets go of the selection.
      if (touch) { this.begin(e, { pointer, kind: 'tap' }, false); return; }
      e.preventDefault();
      const keep = e.shiftKey ? this.selection() : [];
      this.selection.set(keep);
      this.begin(e, { pointer, kind: 'marquee', start: point, keep });
      return;
    }

    if (this.editing() && this.editing() !== id) this.endEdit();
    const members = this.withGroup(id);
    const was = this.selected().has(id);
    const only = was && this.selection().length === members.length;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      this.selection.update(ids => (was ? ids.filter(other => !members.includes(other)) : [...ids, ...members]));
      if (was) return;
    } else if (!was) {
      this.selection.set(members);
    }

    e.preventDefault();
    const before = this.content();
    const set = movingSet(before, this.selection());
    this.begin(e, {
      pointer, kind: 'move', start: point, x: e.clientX, y: e.clientY, before, set,
      min: this.originOf(before, set), dragging: false, item: id, only
    });
  }

  onPointerMove(e: PointerEvent) {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== e.pointerId) return;

    if (gesture.kind === 'pan') {
      const scroller = this.scrollerRef()!.nativeElement;
      scroller.scrollLeft = gesture.left - (e.clientX - gesture.x);
      scroller.scrollTop = gesture.top - (e.clientY - gesture.y);
      return;
    }
    if (gesture.kind === 'place' || gesture.kind === 'tap') return;

    const point = this.toBoard(e);
    switch (gesture.kind) {
      case 'draw':
        // Every sample the browser collected since the last frame, for a smooth line.
        for (const sample of e.getCoalescedEvents?.() ?? [e]) {
          const at = this.toBoard(sample);
          gesture.stroke.points.push({ x: round(at.x), y: round(at.y) });
        }
        this.presentInk();
        break;
      case 'box':
        this.draftBox.set({ tool: gesture.tool, box: boxOf(gesture.start, { x: Math.max(0, point.x), y: Math.max(0, point.y) }) });
        break;
      case 'connect':
        this.draftConnector.set({ id: 'draft', from: gesture.from, to: this.endAt(point, this.dropTarget(e, gesture.from.item)) });
        break;
      case 'marquee':
        this.marquee.set(boxOf(gesture.start, point));
        break;
      case 'move': {
        if (!gesture.dragging) {
          if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < DRAG_SLOP) return;
          gesture.dragging = true;
          this.dragging.set(true);
          this.endEdit();
        }
        // Never above or left of the board's origin: it could not be scrolled back to.
        const dx = Math.max(point.x - gesture.start.x, -gesture.min.x);
        const dy = Math.max(point.y - gesture.start.y, -gesture.min.y);
        this.content.set(moved(gesture.before, gesture.set, round(dx), round(dy)));
        break;
      }
      case 'resize':
        this.content.set(this.resized(gesture.before, gesture.item, this.dragCorner(gesture.box, gesture.corner, point, gesture.start)));
        break;
    }
  }

  onPointerUp(e: PointerEvent) {
    this.finish(e, false);
  }

  onPointerCancel(e: PointerEvent) {
    this.finish(e, true);
  }

  private finish(e: PointerEvent, cancelled: boolean) {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== e.pointerId) return;
    this.gesture = null;

    const scroller = this.scrollerRef()!.nativeElement;
    if (scroller.hasPointerCapture(e.pointerId)) scroller.releasePointerCapture(e.pointerId);
    const point = this.toBoard(e);

    switch (gesture.kind) {
      case 'pan':
        this.panning.set(false);
        break;
      case 'tap':
        if (!cancelled) this.selection.set([]);
        break;
      case 'draw': {
        // A cancelled stroke is kept too: what was drawn is drawn.
        this.liveStroke = null;
        const content = this.content();
        this.change({ ...content, strokes: [...content.strokes, gesture.stroke] });
        break;
      }
      case 'place':
        if (!cancelled && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < DRAG_SLOP * 2) this.place(gesture.tool, point);
        break;
      case 'box':
        this.draftBox.set(null);
        if (!cancelled) this.addBox(gesture.tool, gesture.start, { x: Math.max(0, point.x), y: Math.max(0, point.y) });
        break;
      case 'connect': {
        this.draftConnector.set(null);
        const to = this.endAt(point, this.dropTarget(e, gesture.from.item));
        const length = Math.hypot(point.x - gesture.from.x, point.y - gesture.from.y);
        if (cancelled || length < 16 || (to.item && to.item === gesture.from.item)) break;
        const connector: Connector = { id: uid('c'), from: gesture.from, to };
        const content = this.content();
        this.change({ ...content, connectors: [...content.connectors, connector] });
        this.tool.set('select');
        this.selection.set([connector.id]);
        break;
      }
      case 'marquee': {
        const area = this.marquee();
        this.marquee.set(null);
        if (!cancelled && area) this.selection.set([...new Set([...gesture.keep, ...this.itemsIn(area)])]);
        break;
      }
      case 'move':
        this.dragging.set(false);
        if (gesture.dragging) this.remember(gesture.before);
        else if (cancelled || e.shiftKey || e.ctrlKey || e.metaKey) break;
        // A tap on the one selected thing opens its text; on one of several, it alone stays selected.
        else if (gesture.only) this.startEdit(gesture.item);
        else this.selection.set(this.withGroup(gesture.item));
        break;
      case 'resize':
        this.remember(gesture.before);
        break;
    }
  }

  onDoubleClick(e: MouseEvent) {
    if (this.activeTool() !== 'select') return;
    if ((e.target as HTMLElement).closest('input, textarea, button, a')) return;
    // The press was captured by the board, so the event no longer says what is under the pointer.
    const id = this.hit(document.elementFromPoint(e.clientX, e.clientY), this.toBoard(e));
    if (!id) return;
    this.selection.set([id]);
    this.startEdit(id);
  }

  /** A keyboard user who tabs onto an item has selected it. */
  onItemFocus(e: FocusEvent, id: string) {
    if ((e.target as HTMLElement).matches(':focus-visible') && this.activeTool() === 'select' && !this.isSelected(id)) {
      this.selection.set(this.withGroup(id));
    }
  }

  private withGroup(id: string): string[] {
    const content = this.content();
    const items = [...content.notes, ...content.shapes, ...content.texts];
    const group = items.find(item => item.id === id)?.group;
    return group ? items.filter(item => item.group === group).map(item => item.id) : [id];
  }

  /** Connectors attach to things with a box, not to other connectors. */
  private attachable(id: string | null): string | null {
    return id && this.boxes().has(id) ? id : null;
  }

  /** What a connector being pulled would attach to if it were dropped here. */
  private dropTarget(e: PointerEvent, from: string | undefined): string | null {
    const id = this.attachable(this.hit(document.elementFromPoint(e.clientX, e.clientY), this.toBoard(e)));
    return id === from ? null : id;
  }

  /** The top-left corner of everything that is about to move, so it can be kept on the board. */
  private originOf(content: BoardContent, set: { ids: Set<string>; strokes: Set<number> }): Point {
    const boxes = itemBoxes(content);
    const moving: Box[] = [];
    for (const id of set.ids) {
      const box = boxes.get(id);
      if (box) moving.push(box);
    }
    for (const frame of content.frames) {
      if (set.ids.has(frame.id)) moving.push({ ...frame, y: frame.y - FRAME_LABEL_RISE });
    }
    for (const index of set.strokes) moving.push(strokeBox(content.strokes[index]));
    for (const connector of content.connectors) {
      if (!set.ids.has(connector.id)) continue;
      for (const end of [connector.from, connector.to]) if (!end.item) moving.push({ x: end.x, y: end.y, w: 0, h: 0 });
    }
    const all = union(moving);
    return all ? { x: all.x, y: all.y } : { x: 0, y: 0 };
  }

  private itemsIn(area: Box): string[] {
    const content = this.content();
    const boxes = this.boxes();
    const ids = new Set<string>();
    for (const item of [...content.notes, ...content.shapes, ...content.texts]) {
      if (intersects(area, boxes.get(item.id)!)) for (const id of this.withGroup(item.id)) ids.add(id);
    }
    // A frame is taken only when all of it is inside; its edge alone would grab it by accident.
    for (const frame of content.frames) if (inside(area, frame)) ids.add(frame.id);
    for (const line of this.connectorLines()) if (inside(area, line.box)) ids.add(line.id);
    return [...ids];
  }

  // ── Making things ─────────────────────────────────────────────────────────

  private readonly initials = computed(() => {
    const user = this.users.currentUser();
    const words = (user?.fullName?.trim() || user?.email || '').split(/[\s@.]+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
    return letters.toUpperCase();
  });

  private place(tool: 'sticky' | 'text', point: Point) {
    const before = this.content();
    this.tool.set('select');

    if (tool === 'sticky') {
      const note: Note = {
        id: uid('n'), x: floor0(point.x - NOTE_W / 2), y: floor0(point.y - NOTE_H / 2), text: '',
        color: this.tone(), rot: noteTurn(before.notes.length), by: this.initials() || undefined
      };
      this.change({ ...before, notes: [...before.notes, note] });
      this.selection.set([note.id]);
      this.startEdit(note.id);
      return;
    }

    // A text that is left empty was never there: it joins the history when it says something.
    const text: TextItem = {
      id: uid('t'), x: floor0(point.x), y: floor0(point.y - 15), text: '', color: this.tone(), rot: textTurn(before.texts.length)
    };
    this.content.set({ ...before, texts: [...before.texts, text] });
    this.selection.set([text.id]);
    this.startEdit(text.id, before);
  }

  private addBox(tool: 'shape' | 'frame', from: Point, to: Point) {
    const content = this.content();
    let box = boxOf(from, to);
    // A click without a drag gives the usual size.
    if (box.w < 12 && box.h < 12) {
      box = tool === 'frame' ? { x: from.x, y: from.y, w: FRAME_W, h: FRAME_H } : { x: from.x - 60, y: from.y - 40, w: 120, h: 80 };
    }
    box = { x: floor0(box.x), y: floor0(box.y), w: Math.max(12, round(box.w)), h: Math.max(12, round(box.h)) };
    this.tool.set('select');

    if (tool === 'frame') {
      const frame = { id: uid('f'), ...box, label: t('Frame {n}', { n: content.frames.length + 1 }) };
      this.change({ ...content, frames: [...content.frames, frame] });
      this.selection.set([frame.id]);
      this.startEdit(frame.id);
    } else {
      const shape = { id: uid('s'), kind: this.shapeKind(), ...box, color: this.tone() };
      this.change({ ...content, shapes: [...content.shapes, shape] });
      this.selection.set([shape.id]);
    }
  }

  private dragCorner(box: Box, corner: Corner, point: Point, start: Point): Box {
    const dx = point.x - start.x, dy = point.y - start.y;
    let x1 = box.x, y1 = box.y, x2 = box.x + box.w, y2 = box.y + box.h;
    const min = 48;
    if (corner === 'nw' || corner === 'sw') x1 = clamp(x1 + dx, 0, x2 - min); else x2 = Math.max(x1 + min, x2 + dx);
    if (corner === 'nw' || corner === 'ne') y1 = clamp(y1 + dy, 0, y2 - min); else y2 = Math.max(y1 + min, y2 + dy);
    return { x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
  }

  private resized(content: BoardContent, id: string, box: Box): BoardContent {
    const fit = <T extends { id: string }>(items: T[]) => items.map(item => (item.id === id ? { ...item, ...box } : item));
    return { ...content, notes: fit(content.notes), shapes: fit(content.shapes), frames: fit(content.frames) };
  }

  // ── Editing text ──────────────────────────────────────────────────────────

  /** Opens the text of a sticky, a handwritten text, a frame's name or a connector's label. */
  startEdit(id: string, before = this.content()) {
    if (!this.kinds().has(id) || this.kinds().get(id) === 'shape') return;
    this.editBefore = before;
    this.editing.set(id);
  }

  endEdit() {
    const id = this.editing();
    if (!id) return;
    this.editing.set(null);
    const before = this.editBefore ?? this.content();
    this.editBefore = null;

    const content = this.content();
    const text = content.texts.find(item => item.id === id);
    if (text && !text.text.trim()) {
      this.selection.update(ids => ids.filter(other => other !== id));
      // Left empty: gone again. If it had only just been added, as if it never was.
      if (before.texts.some(item => item.id === id)) this.change(without(content, [id]));
      else this.content.set(before);
      return;
    }
    this.remember(before);
  }

  /** Enter or Escape in a one-line field: done. */
  closeField(e: Event) {
    e.preventDefault();
    (e.target as HTMLElement).blur();
  }

  typeNote(id: string, field: HTMLTextAreaElement) {
    // The sticky grows with its text, as far as it needs to show all of it. The field
    // fills the sticky, so it is let go of for a moment to see how tall the text is.
    const chrome = field.parentElement!.offsetHeight - field.offsetHeight;
    field.style.flex = 'none';
    field.style.height = '0';
    const needed = field.scrollHeight + chrome;
    field.style.flex = '';
    field.style.height = '';
    this.content.update(content => ({
      ...content,
      notes: content.notes.map(note => (note.id === id
        ? { ...note, text: field.value, h: Math.max(note.h ?? NOTE_H, needed) }
        : note))
    }));
  }

  typeText(id: string, value: string) {
    this.content.update(content => ({ ...content, texts: content.texts.map(text => (text.id === id ? { ...text, text: value } : text)) }));
  }

  typeFrame(id: string, value: string) {
    this.content.update(content => ({ ...content, frames: content.frames.map(frame => (frame.id === id ? { ...frame, label: value } : frame)) }));
  }

  typeLabel(id: string, value: string) {
    this.content.update(content => ({
      ...content,
      connectors: content.connectors.map(connector => (connector.id === id ? { ...connector, label: value } : connector))
    }));
  }

  // ── Selection actions ─────────────────────────────────────────────────────

  /** Gives everything selected this colour. */
  tint(tone: Tone) {
    this.tone.set(tone);
    const selected = this.selected();
    const paint = <T extends { id: string; color: string }>(items: T[]) =>
      items.map(item => (selected.has(item.id) && item.color !== tone ? { ...item, color: tone } : item));
    const content = this.content();
    this.change({ ...content, notes: paint(content.notes), shapes: paint(content.shapes), texts: paint(content.texts) });
  }

  /** One more vote on each selected sticky. */
  vote() {
    const selected = this.selected();
    const content = this.content();
    this.change({
      ...content,
      notes: content.notes.map(note => (selected.has(note.id) ? { ...note, votes: (note.votes ?? 0) + 1 } : note))
    });
  }

  unvote(id: string) {
    const content = this.content();
    this.change({
      ...content,
      notes: content.notes.map(note => (note.id === id ? { ...note, votes: Math.max(0, (note.votes ?? 0) - 1) } : note))
    });
  }

  /** Makes the selected things move as one, or lets them go again. */
  toggleGroup() {
    const selected = this.selected();
    const group = this.grouped() ? undefined : uid('g');
    const join = <T extends { id: string; group?: string }>(items: T[]) =>
      items.map(item => (selected.has(item.id) ? { ...item, group } : item));
    const content = this.content();
    this.change({ ...content, notes: join(content.notes), shapes: join(content.shapes), texts: join(content.texts) });
  }

  deleteSelection() {
    const ids = this.selection();
    if (!ids.length) return;
    this.endEdit();
    this.selection.set([]);
    this.change(without(this.content(), ids));
  }

  private nudge(dx: number, dy: number) {
    const before = this.content();
    const set = movingSet(before, this.selection());
    const min = this.originOf(before, set);
    this.change(moved(before, set, Math.max(dx, -min.x), Math.max(dy, -min.y)));
  }

  private selectAll() {
    const content = this.content();
    this.selection.set([...content.frames, ...content.shapes, ...content.texts, ...content.notes, ...content.connectors].map(item => item.id));
  }

  // ── Tasks from stickies ───────────────────────────────────────────────────

  /** Makes a real task from each selected sticky and remembers which sticky it came from. */
  makeTasks() {
    const notes = this.taskable();
    if (!notes.length || this.making()) return;
    this.endEdit();
    this.making.set(true);

    const from = this.boardId ? ` ${location.origin}/whiteboard/${this.boardId}` : '';
    const description = t('Made from the whiteboard “{name}”.', { name: this.name().trim() || DEFAULT_NAME }) + from;
    const requests = notes.map(note => this.tasks
      .createTask({ title: note.text.replace(/\s+/g, ' ').trim().slice(0, 200), description, priority: 'Medium', status: 'Pending' })
      .pipe(catchError(() => of<TaskDto | null>(null))));

    forkJoin(requests).subscribe(results => {
      this.making.set(false);
      const created: MadeTask[] = [];
      results.forEach((task, index) => { if (task?.id) created.push({ id: task.id, title: task.title, noteId: notes[index].id }); });

      if (!created.length) {
        this.toasts.show(t('The tasks could not be made. Try again.'), { tone: 'var(--mq-late)' });
        return;
      }
      if (created.length < notes.length) {
        this.toasts.show(
          t('{failed} of {total} could not be made.', { failed: notes.length - created.length, total: notes.length }),
          { tone: 'var(--mq-late)' });
      }
      this.made.update(list => [...list, ...created]);
      this.liveTasks.update(live => live && new Map([...live, ...created.map(task => [task.id, task.title] as [string, string])]));
      this.selection.set([]);
      this.touch();
      this.notifyMade(created.map(task => task.id));
    });
  }

  private notifyMade(ids: string[]) {
    if (this.madeNoticeTimer) clearTimeout(this.madeNoticeTimer);
    this.madeNotice.set({ ids });
    this.madeNoticeTimer = setTimeout(() => this.madeNotice.set(null), MADE_NOTICE_MS);
  }

  /** Takes back the tasks that were just made: they are deleted and the stickies are plain again. */
  undoMade() {
    const notice = this.madeNotice();
    if (!notice) return;
    if (this.madeNoticeTimer) clearTimeout(this.madeNoticeTimer);
    this.madeNotice.set(null);

    const gone = new Set(notice.ids);
    this.made.update(list => list.filter(task => !gone.has(task.id)));
    this.touch();
    forkJoin(notice.ids.map(id => this.tasks.deleteTask(id).pipe(catchError(() => of(null))))).subscribe();
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  /** Changes the zoom and keeps the given point of the screen (the middle, if none) where it is. */
  private setZoom(next: number, anchor?: { x: number; y: number }) {
    const scroller = this.scrollerRef()?.nativeElement;
    const previous = this.zoom();
    next = clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    if (!scroller || next === previous) return;

    const frame = scroller.getBoundingClientRect();
    const ax = anchor ? anchor.x - frame.left : scroller.clientWidth / 2;
    const ay = anchor ? anchor.y - frame.top : scroller.clientHeight / 2;
    const x = (scroller.scrollLeft + ax) / previous;
    const y = (scroller.scrollTop + ay) / previous;

    this.zoom.set(next);
    // The board has its new size only after the next render.
    afterNextRender(() => scroller.scrollTo(x * next - ax, y * next - ay), { injector: this.injector });
  }

  zoomBy(direction: 1 | -1) {
    const zoom = this.zoom();
    const next = direction > 0
      ? ZOOM_STEPS.find(step => step > zoom + 0.001) ?? ZOOM_MAX
      : [...ZOOM_STEPS].reverse().find(step => step < zoom - 0.001) ?? ZOOM_STEPS[0];
    this.setZoom(next);
  }

  /** The zoom that shows all of `box` (the whole board by default), never above `most`. */
  private fitZoom(box: Box, most: number): number {
    const pad = 40;
    const zoom = Math.min(this.viewW() / (box.w + pad * 2), this.viewH() / (box.h + pad * 2));
    return clamp(Math.floor(zoom * 100) / 100, ZOOM_MIN, most);
  }

  private fit(box: Box | null, most = 1) {
    const scroller = this.scrollerRef()?.nativeElement;
    if (!scroller) return;
    if (!box) { this.setZoom(1); return; }
    const zoom = this.fitZoom(box, most);
    this.zoom.set(zoom);
    afterNextRender(
      () => scroller.scrollTo((box.x + box.w / 2) * zoom - scroller.clientWidth / 2, (box.y + box.h / 2) * zoom - scroller.clientHeight / 2),
      { injector: this.injector });
  }

  /** The percentage is a button: everything in view, or back to 100% when it already is. */
  zoomToFit() {
    const bounds = this.bounds();
    if (bounds && this.zoom() !== this.fitZoom(bounds, 1)) this.fit(bounds);
    else if (this.zoom() !== 1) this.setZoom(1);
    else this.fit(bounds);
  }

  onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.setZoom(this.zoom() * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY });
  }

  onScroll() {
    const scroller = this.scrollerRef()!.nativeElement;
    this.scrollX.set(scroller.scrollLeft);
    this.scrollY.set(scroller.scrollTop);
  }

  /** Pressing or dragging on the minimap brings that part of the board into view. */
  onMap(e: PointerEvent) {
    if (e.type === 'pointerdown') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    else if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;

    const map = this.minimap();
    const frame = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zoom = this.zoom();
    const x = (e.clientX - frame.left - map.left) / map.scale;
    const y = (e.clientY - frame.top - map.top) / map.scale;
    this.scrollerRef()!.nativeElement.scrollTo(x * zoom - this.viewW() / 2, y * zoom - this.viewH() / 2);
  }

  // ── Presenting ────────────────────────────────────────────────────────────

  /** Full screen, tools away, one frame at a time (the whole board when it has no frames). */
  present() {
    this.endEdit();
    this.selection.set([]);
    this.shareOpen.set(false);
    this.zoomBefore = this.zoom();
    this.slide.set(0);
    this.presenting.set(true);
    // Refused outside a click or inside an embedded page: the board then fills the window instead.
    this.host.nativeElement.requestFullscreen?.().catch(() => { /* stays in the window */ });
    afterNextRender(() => this.showSlide(), { injector: this.injector });
  }

  step(direction: 1 | -1) {
    const last = Math.max(0, this.slides().length - 1);
    this.slide.update(index => clamp(index + direction, 0, last));
    this.showSlide();
  }

  private showSlide() {
    const frame = this.slides()[this.slide()];
    this.fit(frame ? { x: frame.x, y: frame.y - FRAME_LABEL_RISE, w: frame.w, h: frame.h + FRAME_LABEL_RISE } : this.bounds(), ZOOM_MAX);
  }

  stopPresenting() {
    if (!this.presenting()) return;
    this.presenting.set(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* already left */ });
    this.zoom.set(this.zoomBefore);
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    if (!document.fullscreenElement) this.stopPresenting();
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  copyLink() {
    this.shareOpen.set(false);
    if (!this.boardId) {
      this.toasts.show(t('Nothing to link to yet: the board is saved once something is on it.'));
      return;
    }
    const failed = () => this.toasts.show(t('The link could not be copied.'), { tone: 'var(--mq-late)' });
    // The clipboard is missing on a page that was not loaded securely.
    const copied = navigator.clipboard?.writeText(`${location.origin}/whiteboard/${this.boardId}`);
    if (!copied) { failed(); return; }
    copied.then(() => this.toasts.show(t('Link copied. Boards are private, so it opens for you only.')), failed);
  }

  downloadPng() {
    this.shareOpen.set(false);
    const picture = renderBoard(this.content(), this.exportColors(), (ctx, stroke) => this.paintStroke(ctx, stroke));
    if (!picture) {
      this.toasts.show(t('The board is empty: there is nothing to download yet.'));
      return;
    }
    picture.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${(this.name().trim() || DEFAULT_NAME).replace(/[\\/:*?"<>|]+/g, ' ')}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, 'image/png');
  }

  // ── Agenda and timer ──────────────────────────────────────────────────────

  agendaState(item: AgendaItem): 'done' | 'now' | 'next' {
    return item.done ? 'done' : item.id === this.currentItem()?.id ? 'now' : 'next';
  }

  addAgendaItem(title: HTMLInputElement, minutes: HTMLInputElement) {
    const text = title.value.trim();
    if (!text) return;
    const length = clamp(Math.round(+latinDigits(minutes.value)) || 10, 1, 240);
    this.agenda.update(agenda => ({ ...agenda, items: [...agenda.items, { id: uid('a'), title: text, minutes: length }] }));
    title.value = '';
    this.touch();
  }

  removeAgendaItem(id: string) {
    const wasCurrent = this.currentItem()?.id === id;
    this.agenda.update(agenda => ({
      items: agenda.items.filter(item => item.id !== id),
      current: agenda.current === id ? null : agenda.current,
      left: agenda.current === id ? 0 : agenda.left
    }));
    if (wasCurrent && this.running()) this.stopTimer();
    this.touch();
  }

  /** The item the timer is on is finished by pressing it; any other one is started. */
  pickAgendaItem(item: AgendaItem) {
    if (this.agendaState(item) === 'now') { this.finishItem(); return; }
    this.agenda.update(agenda => ({
      items: agenda.items.map(other => (other.id === item.id ? { ...other, done: false } : other)),
      current: item.id,
      left: item.minutes * 60
    }));
    if (this.running()) this.timerEndsAt = Date.now() + item.minutes * 60_000;
    this.touch();
  }

  toggleTimer() {
    if (this.running()) { this.stopTimer(); this.touch(); return; }

    const item = this.currentItem();
    if (!item) return;
    const agenda = this.agenda();
    const left = agenda.current === item.id && agenda.left > 0 ? agenda.left : item.minutes * 60;
    this.agenda.set({ ...agenda, current: item.id, left });

    const prayer = this.prayer();
    this.pauseAt = prayer && this.prefs.planAroundPrayer() ? prayer : null;
    this.timerEndsAt = Date.now() + left * 1000;
    this.running.set(true);
    // Counted from the clock, not from the ticks: a tab in the background ticks late.
    this.timer = setInterval(() => this.tick(), 250);
  }

  private tick() {
    if (this.pauseAt && Date.now() >= this.pauseAt.at) {
      const name = this.pauseAt.name;
      this.pauseAt = null;
      this.stopTimer();
      this.touch();
      this.toasts.show(t('Timer paused for {prayer}.', { prayer: t(name) }));
      return;
    }
    const left = Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
    if (left !== this.agenda().left) this.agenda.update(agenda => ({ ...agenda, left }));
    if (left === 0) this.finishItem();
  }

  /** Ticks off the current item and moves the timer to the next one, if there is one. */
  private finishItem() {
    const current = this.currentItem();
    if (!current) return;
    const items = this.agenda().items.map(item => (item.id === current.id ? { ...item, done: true } : item));
    const next = items.find(item => !item.done);
    this.agenda.set({ items, current: next?.id ?? null, left: next ? next.minutes * 60 : 0 });
    if (next && this.running()) this.timerEndsAt = Date.now() + next.minutes * 60_000;
    else this.stopTimer();
    this.touch();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running.set(false);
  }

  // ── Calendar ──────────────────────────────────────────────────────────────

  private clock(date: Date): string {
    return formatTimeInZone(date, this.users.timeZone(), this.calendarData.use24HourClock());
  }

  /** Today's timed events, for the "live meeting" card. A server without events shows none. */
  private loadEvents() {
    const from = new Date(Date.now() - 12 * 3_600_000);
    const to = new Date(Date.now() + 36 * 3_600_000);
    this.calendar.getFeed(from, to, false)
      .pipe(catchError(() => of<CalendarItemDto[]>([])), takeUntilDestroyed(this.destroyRef))
      .subscribe(items => this.events.set(items.filter(item => item.kind === 'Event' && !item.isAllDay)));
  }

  // ── Ink ───────────────────────────────────────────────────────────────────

  /** A theme colour as a value a canvas takes (it does not read CSS variables). */
  private resolve(css: string): string {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    probe.style.color = css;
    this.host.nativeElement.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }

  private inkColor(color: string): string {
    if (!isTone(color)) return color;
    const theme = this.themes.theme();
    if (this.inkTheme !== theme) {
      this.inkColors.clear();
      this.inkTheme = theme;
    }
    let value = this.inkColors.get(color);
    if (!value) {
      value = this.resolve(`var(--wb-ink-${color})`);
      this.inkColors.set(color, value);
    }
    return value;
  }

  private exportColors(): ExportColors {
    return {
      background: this.resolve('var(--mq-bg-2)'),
      frameLine: this.resolve('var(--mq-line-2)'),
      frameLabel: this.resolve('var(--mq-text-2)'),
      connector: this.resolve('var(--mq-placeholder)'),
      labelBack: this.resolve('var(--mq-bg-2)'),
      labelText: this.resolve('var(--mq-text-4)'),
      noteInk: this.resolve('var(--wb-note-ink)'),
      noteShadow: this.resolve('var(--wb-note-shadow)'),
      paper: color => (isTone(color) ? this.resolve(`var(--wb-paper-${color})`) : color),
      ink: color => this.inkColor(color)
    };
  }

  /** Paints one stroke: a smooth line through its points, or a dot for a single tap. */
  private paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
    const points = stroke.points;
    if (!points.length) return;

    const erasing = stroke.type === 'eraser';
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    const color = erasing ? 'black' : this.inkColor(stroke.color);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        ctx.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2);
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Repaints all the ink into the cache, at the resolution the screen shows it:
   * the device's pixel ratio times the zoom, lowered when a large board would
   * need a canvas bigger than browsers allow.
   */
  private renderInk() {
    const canvas = this.canvasRef()?.nativeElement;
    const width = this.surfaceW(), height = this.surfaceH();
    if (!canvas || !width || !height) return;

    const scale = Math.min((window.devicePixelRatio || 1) * this.zoom(), Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
    const pixelsW = Math.max(1, Math.round(width * scale));
    const pixelsH = Math.max(1, Math.round(height * scale));
    this.inkCache ??= document.createElement('canvas');
    for (const layer of [canvas, this.inkCache]) {
      if (layer.width !== pixelsW || layer.height !== pixelsH) {
        layer.width = pixelsW;
        layer.height = pixelsH;
      }
    }
    this.inkScale = scale;

    const cache = this.inkCache.getContext('2d')!;
    cache.setTransform(1, 0, 0, 1, 0, 0);
    cache.clearRect(0, 0, pixelsW, pixelsH);
    // Everything else works in board coordinates; the transform does the scaling.
    cache.setTransform(scale, 0, 0, scale, 0, 0);
    for (const stroke of this.strokes()) this.paintStroke(cache, stroke);
    this.presentInk();
  }

  /** Shows the cached ink, plus the stroke that is being drawn right now. */
  private presentInk() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.inkCache) return;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.inkCache, 0, 0);
    if (this.liveStroke) {
      ctx.setTransform(this.inkScale, 0, 0, this.inkScale, 0, 0);
      this.paintStroke(ctx, this.liveStroke);
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    // Keys pressed in a dialog or in another part of the page are not for the board.
    if (target !== document.body && !this.host.nativeElement.contains(target)) return;

    if (this.presenting()) {
      if (e.key === 'Escape') this.stopPresenting();
      // The "next" arrow on screen points left in Arabic, so that is the key for it there.
      else if ([isRtl() ? 'ArrowLeft' : 'ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); this.step(1); }
      else if ([isRtl() ? 'ArrowRight' : 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); this.step(-1); }
      return;
    }
    if (e.key === 'Escape' && this.shareOpen()) { this.shareOpen.set(false); return; }
    if (target.closest('input, textarea, select, [contenteditable]')) return;

    // On an Arabic keyboard the V key types "ر": the shortcut is the key, whatever it types.
    const typed = e.key.toLowerCase();
    const key = typed.length === 1 && !/[a-z]/.test(typed) && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : typed;
    if (e.ctrlKey || e.metaKey) {
      if (key === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (key === 'y') { e.preventDefault(); this.redo(); }
      else if (key === 'a') { e.preventDefault(); this.tool.set('select'); this.selectAll(); }
      return;
    }
    if (e.altKey) return;

    const onControl = !!target.closest('button, a');
    const ids = this.selection();
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (ids.length) { e.preventDefault(); this.deleteSelection(); }
        return;
      case 'Escape':
        if (ids.length) this.selection.set([]);
        else this.setTool('select');
        return;
      case 'Enter':
        if (!onControl && ids.length === 1) { e.preventDefault(); this.startEdit(ids[0]); }
        return;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (!ids.length) return;
        e.preventDefault();
        const by = e.shiftKey ? 10 : 1;
        this.nudge(e.key === 'ArrowLeft' ? -by : e.key === 'ArrowRight' ? by : 0, e.key === 'ArrowUp' ? -by : e.key === 'ArrowDown' ? by : 0);
        return;
      }
    }
    if (!onControl && key.length === 1 && TOOL_KEYS[key]) this.setTool(TOOL_KEYS[key]);
  }

  @HostListener('document:keydown.shift')
  onShiftDown() { this.adding.set(true); }

  @HostListener('document:keyup.shift')
  @HostListener('window:blur')
  onShiftUp() { this.adding.set(false); }

  @HostListener('document:pointerdown', ['$event'])
  onOutsidePointer(e: Event) {
    if (this.shareOpen() && !(e.target as HTMLElement).closest?.('.share')) this.shareOpen.set(false);
  }
}
