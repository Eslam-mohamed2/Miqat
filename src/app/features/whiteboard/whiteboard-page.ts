import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef,
  OnDestroy, ViewChild, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BoardService } from '../../core/services/board.service';

interface Point { x: number; y: number; }
interface Stroke { color: string; width: number; points: Point[]; type: 'pen' | 'eraser'; }
interface Note { id: string; x: number; y: number; text: string; color: string; }

/** Undo pops whichever of the two happened last. */
type HistoryEntry = { kind: 'stroke' } | { kind: 'note'; id: string };

const ERASER_WIDTH = 20;
/** Must match `.sticky-note { width / height }` in the stylesheet. */
const NOTE_SIZE = 200;
/** Empty room kept past the furthest ink or note, so there is always space to carry on. */
const BOARD_MARGIN = 240;
/** Upper bound for the canvas backing store, in device pixels (about 4000 x 3000). */
const MAX_CANVAS_PIXELS = 12_000_000;

@Component({
  selector: 'app-whiteboard-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './whiteboard-page.html',
  styleUrl: './whiteboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WhiteboardPage implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('scroller') scrollerRef!: ElementRef<HTMLElement>;
  @ViewChild('surface') surfaceRef!: ElementRef<HTMLElement>;

  private boards = inject(BoardService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  /** Null until the first save creates the row. */
  private boardId: string | null = null;
  /** Debounced so a stroke does not become a request per pointer move. */
  private changed$ = new Subject<void>();
  saveState = signal<'idle' | 'saving' | 'saved'>('idle');

  private ctx!: CanvasRenderingContext2D;
  private resizeObserver?: ResizeObserver;

  tool = signal<'select' | 'pen' | 'eraser' | 'note'>('pen');
  currentColor = signal('#2ec4a0');
  strokeWidth = signal(4);

  strokes = signal<Stroke[]>([]);
  private currentStroke: Stroke | null = null;

  notes = signal<Note[]>([]);
  private draggingNoteId: string | null = null;
  private dragOffset = { x: 0, y: 0 };

  private history = signal<HistoryEntry[]>([]);
  readonly canUndo = computed(() => this.history().length > 0);
  readonly isEmpty = computed(() => !this.strokes().length && !this.notes().length);

  private isDrawing = false;

  /**
   * The board is as large as its content (never smaller than the visible area - the
   * stylesheet sets min-width / min-height: 100%) and scrolls inside its frame. It
   * used to be exactly the size of the screen it was opened on, so anything drawn
   * on a large monitor was simply cut off on a phone, with no way to reach it.
   */
  readonly surfaceWidth = computed(() => {
    let max = 0;
    for (const stroke of this.strokes()) for (const p of stroke.points) if (p.x > max) max = p.x;
    for (const note of this.notes()) if (note.x + NOTE_SIZE > max) max = note.x + NOTE_SIZE;
    return max ? Math.ceil(max + BOARD_MARGIN) : 0;
  });

  readonly surfaceHeight = computed(() => {
    let max = 0;
    for (const stroke of this.strokes()) for (const p of stroke.points) if (p.y > max) max = p.y;
    for (const note of this.notes()) if (note.y + NOTE_SIZE > max) max = note.y + NOTE_SIZE;
    return max ? Math.ceil(max + BOARD_MARGIN) : 0;
  });

  /** True while part of the board is off screen (drives the "move around" hint). */
  canScroll = signal(false);
  /** Dragging the board itself with the mouse, in Select mode. */
  isPanning = signal(false);
  private panStart = { x: 0, y: 0, left: 0, top: 0 };

  constructor() {
    // 1.2s after the last change: long enough that a continuous scribble is one
    // request, short enough that closing the tab rarely loses anything.
    this.changed$
      .pipe(debounceTime(1200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.persist());
  }

  ngAfterViewInit() {
    this.resize();
    this.restore();

    // A window resize listener was not enough: collapsing the sidebar changes
    // the board's width without the window changing at all, which left the
    // backing store the wrong size and every later stroke landing off-cursor.
    // Both are watched: the surface grows as things are drawn, and the frame
    // changes when the window or the sidebar does.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.surfaceRef.nativeElement);
    this.resizeObserver.observe(this.scrollerRef.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
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
    // carries no route param — reading paramMap here returned null and the
    // blank-board branch never fired. The URL segment is the reliable signal.
    const segments = this.route.snapshot.url.map(s => s.path);
    const last = segments[segments.length - 1];
    if (last === 'new') return;
    const id = last && last !== 'whiteboard' && last !== 'node-flow' ? last : null;

    const load = id ? this.boards.getById(id) : this.boards.latest('Whiteboard');
    load.subscribe(board => {
      if (!board) return;
      this.boardId = board.id;
      try {
        const data = JSON.parse(board.content || '{}');
        if (Array.isArray(data.strokes)) this.strokes.set(data.strokes);
        if (Array.isArray(data.notes)) this.notes.set(data.notes);
        this.redraw();
      } catch {
        // A board we cannot parse is not worth destroying the editor over —
        // start blank and let the next save overwrite it.
      }
    });
  }

  /** Called by every mutating action; the debounce upstream does the batching. */
  private touch() {
    this.changed$.next();
  }

  private persist() {
    const content = JSON.stringify({ strokes: this.strokes(), notes: this.notes() });
    this.saveState.set('saving');

    const request = this.boardId
      ? this.boards.update(this.boardId, 'Whiteboard', content)
      : this.boards.create('Whiteboard', content, 'My whiteboard');

    request.subscribe({
      next: board => {
        this.boardId = board?.id ?? this.boardId;
        this.saveState.set('saved');
        setTimeout(() => this.saveState.set('idle'), 1800);
      },
      error: () => this.saveState.set('idle')
    });
  }

  /**
   * Matches the backing store to the element's real box.
   *
   * This used to size the canvas to `window.innerWidth/Height`, but the board
   * sits inside the app shell next to the sidebar — so the backing store was
   * ~1440x950 inside an ~1086x838 element and the browser scaled the whole
   * drawing down. Combined with drawing at raw viewport coordinates, ink landed
   * a couple of hundred pixels away from the pointer.
   */
  private resize() {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // A large board on a HiDPI screen would need a canvas bigger than browsers
    // allow, so the pixel ratio is lowered until it fits the budget.
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      Math.sqrt(MAX_CANVAS_PIXELS / (rect.width * rect.height))
    );
    this.dpr = dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    this.ctx = canvas.getContext('2d')!;
    // Work in CSS pixels everywhere else; the transform handles HiDPI, so lines
    // are crisp on retina screens instead of being upscaled and blurry.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.redraw();

    const scroller = this.scrollerRef.nativeElement;
    this.canScroll.set(
      scroller.scrollWidth > scroller.clientWidth + 1 || scroller.scrollHeight > scroller.clientHeight + 1);
  }

  /** The pixel ratio the canvas was last sized with (see resize()). */
  private dpr = 1;

  /** Viewport coordinates → coordinates inside the canvas. */
  private toCanvas(e: PointerEvent | MouseEvent): Point {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  setTool(t: 'select' | 'pen' | 'eraser' | 'note') {
    this.tool.set(t);
  }

  setColor(c: string) {
    this.currentColor.set(c);
    if (this.tool() === 'eraser') this.tool.set('pen');
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  onPointerDown(e: PointerEvent) {
    const point = this.toCanvas(e);

    // Select mode on empty board: drag it to move around. Fingers already scroll
    // the board natively in this mode, so this is for the mouse and the pen.
    if (this.tool() === 'select') {
      if (e.pointerType === 'touch' || e.button > 0) return;
      const scroller = this.scrollerRef.nativeElement;
      this.panStart = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
      this.isPanning.set(true);
      this.canvasRef.nativeElement.setPointerCapture(e.pointerId);
      return;
    }

    if (this.tool() === 'note') {
      const note: Note = {
        id: `n_${Date.now()}`,
        x: point.x,
        y: point.y,
        text: '',
        color: this.currentColor()
      };
      this.notes.update(list => [...list, note]);
      this.history.update(h => [...h, { kind: 'note', id: note.id }]);
      this.touch();
      this.tool.set('select');
      return;
    }

    if (this.tool() !== 'pen' && this.tool() !== 'eraser') return;

    // Without capture, releasing outside the canvas never fires pointerup here,
    // so the stroke stayed "live" and the next move drew a line across the board.
    this.canvasRef.nativeElement.setPointerCapture(e.pointerId);

    this.isDrawing = true;
    this.currentStroke = {
      color: this.currentColor(),
      width: this.tool() === 'eraser' ? ERASER_WIDTH : this.strokeWidth(),
      type: this.tool() as 'pen' | 'eraser',
      points: [point]
    };
    this.redraw();
  }

  onPointerMove(e: PointerEvent) {
    if (this.isPanning()) {
      const scroller = this.scrollerRef.nativeElement;
      scroller.scrollLeft = this.panStart.left - (e.clientX - this.panStart.x);
      scroller.scrollTop = this.panStart.top - (e.clientY - this.panStart.y);
      return;
    }
    if (!this.isDrawing || !this.currentStroke) return;
    this.currentStroke.points.push(this.toCanvas(e));
    this.redraw();
  }

  onPointerUp(e: PointerEvent) {
    if (this.isPanning()) {
      this.isPanning.set(false);
      const el = this.canvasRef.nativeElement;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      return;
    }
    if (!this.isDrawing || !this.currentStroke) return;

    const canvas = this.canvasRef.nativeElement;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

    this.strokes.update(list => [...list, this.currentStroke!]);
    this.history.update(h => [...h, { kind: 'stroke' }]);
    this.currentStroke = null;
    this.isDrawing = false;
    this.redraw();
    this.touch();
  }

  private redraw() {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const dpr = this.dpr;
    this.ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    const all = this.currentStroke ? [...this.strokes(), this.currentStroke] : this.strokes();

    for (const stroke of all) {
      if (!stroke.points.length) continue;

      if (stroke.type === 'eraser') {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.strokeStyle = 'rgba(0,0,0,1)';
        this.ctx.fillStyle = 'rgba(0,0,0,1)';
      } else {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.strokeStyle = stroke.color;
        this.ctx.fillStyle = stroke.color;
      }
      this.ctx.lineWidth = stroke.width;

      // A tap is one point, and a line needs two — those strokes used to be
      // skipped entirely, so clicking without dragging drew nothing at all.
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
        this.ctx.fill();
        continue;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      this.ctx.stroke();
    }

    this.ctx.globalCompositeOperation = 'source-over';
  }

  // ── History ───────────────────────────────────────────────────────────────

  undo() {
    const entry = this.history().at(-1);
    if (!entry) return;

    this.history.update(h => h.slice(0, -1));
    if (entry.kind === 'stroke') {
      this.strokes.update(list => list.slice(0, -1));
      this.redraw();
    } else {
      this.notes.update(list => list.filter(n => n.id !== entry.id));
    }
    this.touch();
  }

  clear() {
    if (this.isEmpty() || !confirm('Clear the whole board?')) return;
    this.strokes.set([]);
    this.notes.set([]);
    this.history.set([]);
    this.redraw();
    this.touch();
  }

  // ── Sticky notes ──────────────────────────────────────────────────────────

  // Pointer events, not mouse events, so a note can be moved with a finger too.
  startDragNote(e: PointerEvent, note: Note) {
    if (this.tool() !== 'select') return;
    if (e.button > 0 || !e.isPrimary) return;
    e.stopPropagation();
    const point = this.toCanvas(e);
    this.draggingNoteId = note.id;
    this.dragOffset = { x: point.x - note.x, y: point.y - note.y };
  }

  dragNote(e: PointerEvent) {
    if (!this.draggingNoteId) return;
    const point = this.toCanvas(e);
    // Rebuilt immutably rather than mutating the note in place: the app is
    // zoneless, so a mutated object never notifies the template.
    this.notes.update(list => list.map(n =>
      n.id === this.draggingNoteId
        // Never above or left of the board's origin: it could not be scrolled back to.
        ? { ...n, x: Math.max(0, point.x - this.dragOffset.x), y: Math.max(0, point.y - this.dragOffset.y) }
        : n));
  }

  endDragNote() {
    if (this.draggingNoteId) this.touch();
    this.draggingNoteId = null;
  }

  updateNoteText(id: string, text: string) {
    this.notes.update(list => list.map(n => (n.id === id ? { ...n, text } : n)));
    this.touch();
  }

  deleteNote(e: Event, id: string) {
    e.stopPropagation();
    this.notes.update(list => list.filter(n => n.id !== id));
    this.history.update(h => h.filter(entry => entry.kind !== 'note' || entry.id !== id));
    this.touch();
  }

  trackByNoteId = (_: number, note: Note) => note.id;
}
