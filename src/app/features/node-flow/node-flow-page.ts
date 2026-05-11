import { Component, ChangeDetectionStrategy, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

export interface FlowNode {
  id: string;
  x: number;
  y: number;
  title: string;
  type: 'task' | 'event';
  status?: string;
}

export interface FlowEdge {
  id: string;
  fromId: string;
  toId: string;
}

@Component({
  selector: 'app-node-flow-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './node-flow-page.html',
  styleUrl: './node-flow-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NodeFlowPage {
  nodes = signal<FlowNode[]>([
    { id: '1', x: 200, y: 150, title: 'Research Phase', type: 'task', status: 'completed' },
    { id: '2', x: 500, y: 100, title: 'Design Mockups', type: 'task', status: 'in-progress' },
    { id: '3', x: 500, y: 250, title: 'Client Review', type: 'event' }
  ]);

  edges = signal<FlowEdge[]>([
    { id: 'e1', fromId: '1', toId: '2' },
    { id: 'e2', fromId: '1', toId: '3' }
  ]);

  tool = signal<'select' | 'link' | 'add-task' | 'add-event'>('select');
  
  draggingNodeId = signal<string | null>(null);
  dragOffset = { x: 0, y: 0 };

  linkingFromNodeId = signal<string | null>(null);
  mousePos = signal({ x: 0, y: 0 });

  @HostListener('mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.mousePos.set({ x: e.clientX, y: e.clientY });

    const draggingId = this.draggingNodeId();
    if (draggingId) {
      this.nodes.update(list => list.map(n => 
        n.id === draggingId 
          ? { ...n, x: e.clientX - this.dragOffset.x, y: e.clientY - this.dragOffset.y }
          : n
      ));
    }
  }

  @HostListener('mouseup')
  onMouseUp() {
    this.draggingNodeId.set(null);
  }

  setTool(t: 'select' | 'link' | 'add-task' | 'add-event') {
    this.tool.set(t);
    this.linkingFromNodeId.set(null);
  }

  onBackgroundClick(e: MouseEvent) {
    if (this.tool() === 'add-task' || this.tool() === 'add-event') {
      const newNode: FlowNode = {
        id: Date.now().toString(),
        x: e.clientX - 100, // Center roughly
        y: e.clientY - 40,
        title: this.tool() === 'add-task' ? 'New Task' : 'New Event',
        type: this.tool() === 'add-task' ? 'task' : 'event',
        status: 'pending'
      };
      this.nodes.update(n => [...n, newNode]);
      this.tool.set('select');
    }
    this.linkingFromNodeId.set(null);
  }

  onNodeMouseDown(e: MouseEvent, node: FlowNode) {
    if (this.tool() === 'select') {
      e.stopPropagation();
      this.draggingNodeId.set(node.id);
      this.dragOffset = { x: e.clientX - node.x, y: e.clientY - node.y };
    }
  }

  onNodeClick(e: MouseEvent, node: FlowNode) {
    e.stopPropagation();
    
    if (this.tool() === 'link') {
      const fromId = this.linkingFromNodeId();
      if (!fromId) {
        this.linkingFromNodeId.set(node.id);
      } else if (fromId !== node.id) {
        // Create link
        const exists = this.edges().some(edge => edge.fromId === fromId && edge.toId === node.id);
        if (!exists) {
           this.edges.update(edges => [...edges, {
             id: `e_${Date.now()}`,
             fromId,
             toId: node.id
           }]);
        }
        this.linkingFromNodeId.set(null);
      }
    }
  }

  deleteNode(e: MouseEvent, id: string) {
    e.stopPropagation();
    this.nodes.update(n => n.filter(x => x.id !== id));
    this.edges.update(edges => edges.filter(e => e.fromId !== id && e.toId !== id));
  }

  getEdgePath(edge: FlowEdge): string {
    const from = this.nodes().find(n => n.id === edge.fromId);
    const to = this.nodes().find(n => n.id === edge.toId);
    if (!from || !to) return '';

    // Calculate center points (Node is 200x80 approx)
    const x1 = from.x + 200; // Right side
    const y1 = from.y + 40;  // Middle
    const x2 = to.x;         // Left side
    const y2 = to.y + 40;    // Middle

    // Bezier curve
    const cpX1 = x1 + Math.abs(x2 - x1) * 0.5;
    const cpX2 = x2 - Math.abs(x2 - x1) * 0.5;

    return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
  }

  getLinkingPath(): string {
    const fromId = this.linkingFromNodeId();
    if (!fromId) return '';
    const from = this.nodes().find(n => n.id === fromId);
    if (!from) return '';

    const x1 = from.x + 200;
    const y1 = from.y + 40;
    const x2 = this.mousePos().x;
    const y2 = this.mousePos().y;

    const cpX1 = x1 + Math.abs(x2 - x1) * 0.5;
    const cpX2 = x2 - Math.abs(x2 - x1) * 0.5;

    return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
  }
}
