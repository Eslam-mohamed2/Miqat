import {
  ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild,
  inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TaskService } from '../../core/services/task.service';
import { TaskDto } from '../../models/api.models';

export interface FlowNode {
  id: string;
  x: number;
  y: number;
  title: string;
  type: 'task' | 'event';
  status?: string;
  /** Set for nodes seeded from a real task, so the node can open it. */
  taskId?: string;
}

export interface FlowEdge {
  id: string;
  fromId: string;
  toId: string;
}

/** Must match `.flow-node { width }` in the stylesheet — edges anchor to it. */
const NODE_WIDTH = 200;
const NODE_MID_Y = 40;
/** Pointer travel above which a mouseup is a drag, not a click. */
const CLICK_SLOP = 4;

@Component({
  selector: 'app-node-flow-page',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './node-flow-page.html',
  styleUrl: './node-flow-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NodeFlowPage implements OnInit {
  private taskService = inject(TaskService);
  private router = inject(Router);

  @ViewChild('board') boardRef!: ElementRef<HTMLElement>;

  nodes = signal<FlowNode[]>([]);
  edges = signal<FlowEdge[]>([]);
  loading = signal(true);

  tool = signal<'select' | 'link' | 'add-task' | 'add-event'>('select');

  private draggingNodeId: string | null = null;
  private dragOffset = { x: 0, y: 0 };
  private dragStart = { x: 0, y: 0 };
  private dragMoved = false;

  linkingFromNodeId = signal<string | null>(null);
  /** Only meaningful while linking — see onMouseMove. */
  pointer = signal({ x: 0, y: 0 });

  ngOnInit() {
    this.taskService.getTasks().subscribe({
      next: tasks => {
        this.nodes.set(this.layoutTasks(tasks ?? []));
        this.loading.set(false);
      },
      error: () => {
        this.nodes.set([]);
        this.loading.set(false);
      }
    });
  }

  /**
   * Lays the tasks out in columns by status, so the flow reads left-to-right
   * from pending through to done before anyone rearranges it.
   */
  private layoutTasks(tasks: TaskDto[]): FlowNode[] {
    const columns = ['Pending', 'In_progress', 'Completed', 'On_hold', 'Cancelled'];
    // Keyed by the resolved column, not by the status string. Keying it on the
    // status meant every unrecognised status started its own row counter at 0
    // and stacked exactly on top of the first Pending node.
    const perColumn = new Map<number, number>();

    return tasks.slice(0, 40).map(task => {
      const column = Math.max(0, columns.indexOf(task.status));
      const row = perColumn.get(column) ?? 0;
      perColumn.set(column, row + 1);

      return {
        id: task.id,
        taskId: task.id,
        x: 60 + column * 240,
        y: 60 + row * 110,
        title: task.title,
        type: 'task' as const,
        status: task.status
      };
    });
  }

  /** Viewport coordinates → coordinates inside the board. */
  private toBoard(e: MouseEvent): { x: number; y: number } {
    const rect = this.boardRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ── Pointer ───────────────────────────────────────────────────────────────

  onMouseMove(e: MouseEvent) {
    const linking = !!this.linkingFromNodeId();
    // Writing a signal on every single mousemove re-ran change detection across
    // the whole board even when nothing was being dragged or linked.
    if (!linking && !this.draggingNodeId) return;

    const point = this.toBoard(e);
    if (linking) this.pointer.set(point);

    const id = this.draggingNodeId;
    if (!id) return;

    if (Math.abs(e.clientX - this.dragStart.x) > CLICK_SLOP ||
        Math.abs(e.clientY - this.dragStart.y) > CLICK_SLOP) {
      this.dragMoved = true;
    }

    this.nodes.update(list => list.map(n =>
      n.id === id
        ? { ...n, x: point.x - this.dragOffset.x, y: point.y - this.dragOffset.y }
        : n));
  }

  onMouseUp() {
    this.draggingNodeId = null;
  }

  setTool(t: 'select' | 'link' | 'add-task' | 'add-event') {
    this.tool.set(t);
    this.linkingFromNodeId.set(null);
  }

  onBackgroundClick(e: MouseEvent) {
    if (this.tool() === 'add-task' || this.tool() === 'add-event') {
      // Was `e.clientX - 100`: viewport coordinates written into a container
      // whose own origin is offset by the sidebar and topbar, so every new node
      // landed a few hundred pixels away from the click.
      const point = this.toBoard(e);
      const isTask = this.tool() === 'add-task';

      this.nodes.update(list => [...list, {
        id: `n_${Date.now()}`,
        x: point.x - NODE_WIDTH / 2,
        y: point.y - NODE_MID_Y,
        title: isTask ? 'New Task' : 'New Event',
        type: isTask ? 'task' : 'event',
        status: 'Pending'
      }]);
      this.tool.set('select');
    }
    this.linkingFromNodeId.set(null);
  }

  onNodeMouseDown(e: MouseEvent, node: FlowNode) {
    if (this.tool() !== 'select') return;
    e.stopPropagation();
    const point = this.toBoard(e);
    this.draggingNodeId = node.id;
    this.dragOffset = { x: point.x - node.x, y: point.y - node.y };
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragMoved = false;
  }

  onNodeClick(e: MouseEvent, node: FlowNode) {
    e.stopPropagation();

    if (this.tool() === 'link') {
      const fromId = this.linkingFromNodeId();
      if (!fromId) {
        this.linkingFromNodeId.set(node.id);
        return;
      }
      if (fromId === node.id) return;

      const exists = this.edges().some(edge =>
        (edge.fromId === fromId && edge.toId === node.id) ||
        (edge.fromId === node.id && edge.toId === fromId));
      if (!exists) {
        this.edges.update(list => [...list, { id: `e_${Date.now()}`, fromId, toId: node.id }]);
      }
      this.linkingFromNodeId.set(null);
      return;
    }

    // A node seeded from a real task opens it — that is what makes this board
    // part of the app rather than a drawing of one. Suppressed after a drag so
    // moving a node never navigates away.
    if (this.tool() === 'select' && node.taskId && !this.dragMoved) {
      this.router.navigate(['/tasks', node.taskId]);
    }
  }

  updateNodeTitle(id: string, title: string) {
    this.nodes.update(list => list.map(n => (n.id === id ? { ...n, title } : n)));
  }

  deleteNode(e: Event, id: string) {
    e.stopPropagation();
    this.nodes.update(list => list.filter(n => n.id !== id));
    this.edges.update(list => list.filter(edge => edge.fromId !== id && edge.toId !== id));
    if (this.linkingFromNodeId() === id) this.linkingFromNodeId.set(null);
  }

  // ── Edges ─────────────────────────────────────────────────────────────────

  private curve(x1: number, y1: number, x2: number, y2: number): string {
    const bend = Math.max(40, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  }

  getEdgePath(edge: FlowEdge): string {
    const from = this.nodes().find(n => n.id === edge.fromId);
    const to = this.nodes().find(n => n.id === edge.toId);
    if (!from || !to) return '';
    return this.curve(from.x + NODE_WIDTH, from.y + NODE_MID_Y, to.x, to.y + NODE_MID_Y);
  }

  getLinkingPath(): string {
    const from = this.nodes().find(n => n.id === this.linkingFromNodeId());
    if (!from) return '';
    // `pointer` is board-relative now; it used to be raw viewport coordinates
    // mixed with board-relative node coordinates, so the preview line trailed
    // the cursor by the width of the sidebar.
    const p = this.pointer();
    return this.curve(from.x + NODE_WIDTH, from.y + NODE_MID_Y, p.x, p.y);
  }

  statusColor(status?: string): string {
    switch (status) {
      case 'Completed':   return '#2ec4a0';
      case 'In_progress': return '#7c8ef5';
      case 'On_hold':     return '#9ca3af';
      case 'Cancelled':   return '#ef4444';
      default:            return '#f4a835';
    }
  }

  trackByNodeId = (_: number, node: FlowNode) => node.id;
  trackByEdgeId = (_: number, edge: FlowEdge) => edge.id;
}
