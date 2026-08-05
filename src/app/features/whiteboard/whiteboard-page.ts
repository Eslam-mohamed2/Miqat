import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef,
  OnDestroy, ViewChild, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

interface Point { x: number; y: number; }
interface Stroke { color: string; width: number; points: Point[]; type: 'pen' | 'eraser'; }
interface Note { id: string; x: number; y: number; text: string; color: string; }

/** Undo pops whichever of the two happened last. */
type HistoryEntry = { kind: 'stroke' } | { kind: 'note'; id: string };

const ERASER_WIDTH = 20;

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

  ngAfterViewInit() {
    this.resize();

    // A window resize listener was not enough: collapsing the sidebar changes
    // the board's width without the window changing at all, which left the
    // backing store the wrong size and every later stroke landing off-cursor.
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
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

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    this.ctx = canvas.getContext('2d')!;
    // Work in CSS pixels everywhere else; the transform handles HiDPI, so lines
    // are crisp on retina screens instead of being upscaled and blurry.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.redraw();
  }

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
    if (!this.isDrawing || !this.currentStroke) return;
    this.currentStroke.points.push(this.toCanvas(e));
    this.redraw();
  }

  onPointerUp(e: PointerEvent) {
    if (!this.isDrawing || !this.currentStroke) return;

    const canvas = this.canvasRef.nativeElement;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

    this.strokes.update(list => [...list, this.currentStroke!]);
    this.history.update(h => [...h, { kind: 'stroke' }]);
    this.currentStroke = null;
    this.isDrawing = false;
    this.redraw();
  }

  private redraw() {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    const dpr = window.devicePixelRatio || 1;
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
  }

  clear() {
    if (this.isEmpty() || !confirm('Clear the whole board?')) return;
    this.strokes.set([]);
    this.notes.set([]);
    this.history.set([]);
    this.redraw();
  }

  // ── Sticky notes ──────────────────────────────────────────────────────────

  startDragNote(e: MouseEvent, note: Note) {
    if (this.tool() !== 'select') return;
    e.stopPropagation();
    const point = this.toCanvas(e);
    this.draggingNoteId = note.id;
    this.dragOffset = { x: point.x - note.x, y: point.y - note.y };
  }

  dragNote(e: MouseEvent) {
    if (!this.draggingNoteId) return;
    const point = this.toCanvas(e);
    // Rebuilt immutably rather than mutating the note in place: the app is
    // zoneless, so a mutated object never notifies the template.
    this.notes.update(list => list.map(n =>
      n.id === this.draggingNoteId
        ? { ...n, x: point.x - this.dragOffset.x, y: point.y - this.dragOffset.y }
        : n));
  }

  endDragNote() {
    this.draggingNoteId = null;
  }

  updateNoteText(id: string, text: string) {
    this.notes.update(list => list.map(n => (n.id === id ? { ...n, text } : n)));
  }

  deleteNote(e: Event, id: string) {
    e.stopPropagation();
    this.notes.update(list => list.filter(n => n.id !== id));
    this.history.update(h => h.filter(entry => entry.kind !== 'note' || entry.id !== id));
  }

  trackByNoteId = (_: number, note: Note) => note.id;
}
