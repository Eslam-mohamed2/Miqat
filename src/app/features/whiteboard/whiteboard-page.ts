import { Component, ChangeDetectionStrategy, ViewChild, ElementRef, AfterViewInit, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

interface Point { x: number; y: number; }
interface Stroke { color: string; width: number; points: Point[]; type: 'pen' | 'eraser'; }
interface Note { id: string; x: number; y: number; text: string; color: string; }

@Component({
  selector: 'app-whiteboard-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './whiteboard-page.html',
  styleUrl: './whiteboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WhiteboardPage implements AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private ctx!: CanvasRenderingContext2D;
  
  tool = signal<'select' | 'pen' | 'eraser' | 'note'>('pen');
  currentColor = signal('#2ec4a0');
  strokeWidth = signal(4);
  
  strokes = signal<Stroke[]>([]);
  currentStroke: Stroke | null = null;
  
  notes = signal<Note[]>([]);
  draggingNote: Note | null = null;
  dragOffset = { x: 0, y: 0 };

  isDrawing = false;
  
  ngAfterViewInit() {
    this.initCanvas();
  }

  @HostListener('window:resize')
  onResize() {
    this.initCanvas();
    this.redraw();
  }

  initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.ctx = canvas.getContext('2d') as any;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setTool(t: 'select' | 'pen' | 'eraser' | 'note') {
    this.tool.set(t);
  }

  setColor(c: string) {
    this.currentColor.set(c);
    this.tool.set('pen');
  }

  onPointerDown(e: PointerEvent) {
    if (this.tool() === 'note') {
      const newNote: Note = {
        id: Date.now().toString(),
        x: e.clientX,
        y: e.clientY,
        text: '',
        color: this.currentColor()
      };
      this.notes.update(n => [...n, newNote]);
      this.tool.set('select');
      return;
    }

    if (this.tool() === 'pen' || this.tool() === 'eraser') {
      this.isDrawing = true;
      this.currentStroke = {
        color: this.tool() === 'eraser' ? '#181b21' : this.currentColor(), // Match background if erasing
        width: this.tool() === 'eraser' ? 20 : this.strokeWidth(),
        type: this.tool() as 'pen' | 'eraser',
        points: [{ x: e.clientX, y: e.clientY }]
      };
    }
  }

  onPointerMove(e: PointerEvent) {
    if (this.isDrawing && this.currentStroke) {
      this.currentStroke.points.push({ x: e.clientX, y: e.clientY });
      this.redraw();
    }
  }

  onPointerUp(e: PointerEvent) {
    if (this.isDrawing && this.currentStroke) {
      this.strokes.update(s => [...s, this.currentStroke!]);
      this.currentStroke = null;
      this.isDrawing = false;
    }
  }

  redraw() {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    // We do NOT clear canvas to transparent, we clear it entirely. But actually wait, it's over a background.
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = [...this.strokes()];
    if (this.currentStroke) allStrokes.push(this.currentStroke);

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      this.ctx.beginPath();
      this.ctx.lineWidth = stroke.width;
      this.ctx.strokeStyle = stroke.color;
      
      // If it's an eraser we want to use composite operation to clear? 
      // If background is static we can just paint with bg color. Let's use globalCompositeOperation.
      if (stroke.type === 'eraser') {
         this.ctx.globalCompositeOperation = 'destination-out';
         this.ctx.lineWidth = 20;
         this.ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
         this.ctx.globalCompositeOperation = 'source-over';
      }

      this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      this.ctx.stroke();
    }
    
    // Reset composite operation
    this.ctx.globalCompositeOperation = 'source-over';
  }

  // Sticky Note Dragging
  startDragNote(e: MouseEvent, note: Note) {
    if (this.tool() !== 'select') return;
    e.stopPropagation();
    this.draggingNote = note;
    this.dragOffset = { x: e.clientX - note.x, y: e.clientY - note.y };
  }

  dragNote(e: MouseEvent) {
    if (this.draggingNote) {
      this.draggingNote.x = e.clientX - this.dragOffset.x;
      this.draggingNote.y = e.clientY - this.dragOffset.y;
      this.notes.update(n => [...n]); // force update
    }
  }

  endDragNote() {
    this.draggingNote = null;
  }

  deleteNote(id: string) {
    this.notes.update(n => n.filter(x => x.id !== id));
  }
}
