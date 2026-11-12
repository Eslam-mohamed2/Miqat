import { Component, ChangeDetectionStrategy, ViewEncapsulation, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { TaskDto } from '../../../models/api.models';
import { MatIcon } from "@angular/material/icon";

interface ChartSlice {
  name: string;
  value: number;
  color: string;
}

/** Same colours the task list, the board and the node flow use for a status. */
const STATUSES: { key: string; name: string; color: string }[] = [
  { key: 'pending', name: 'To Do', color: '#f4a835' },
  { key: 'inprogress', name: 'In Progress', color: '#7c8ef5' },
  { key: 'completed', name: 'Done', color: '#2ec4a0' },
  { key: 'onhold', name: 'On Hold', color: '#9ca3af' },
  { key: 'cancelled', name: 'Cancelled', color: '#ef4444' }
];

const PRIORITIES: { key: string; name: string; color: string }[] = [
  { key: 'low', name: 'Low', color: '#2ec4a0' },
  { key: 'medium', name: 'Medium', color: '#f4a835' },
  { key: 'high', name: 'High', color: '#ef4444' }
];

/** "In_progress", "InProgress" and "in progress" are the same status. */
const normalise = (value: string | null | undefined) => (value ?? '').toLowerCase().replace(/[^a-z]/g, '');

@Component({
  selector: 'app-productivity-chart',
  standalone: true,
  imports: [CommonModule, NgxChartsModule, MatIcon],
  templateUrl: './productivity-chart.html',
  styleUrl: './productivity-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ProductivityChart implements OnChanges {
  @Input() tasks: TaskDto[] = [];
  /** e.g. "12 tasks · Last 7 Days": which slice of the tasks the charts cover. */
  @Input() caption = '';

  statusData: ChartSlice[] = [];
  priorityData: ChartSlice[] = [];

  statusColorScheme = { domain: STATUSES.map(status => status.color) } as any;
  priorityColorScheme = { domain: PRIORITIES.map(priority => priority.color) } as any;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tasks'] && this.tasks) {
      this.calculateCharts();
    }
  }

  private calculateCharts(): void {
    // The API spells the status "In_progress"; this compared against "InProgress",
    // so the In Progress slice was always empty.
    const statusCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();

    for (const task of this.tasks) {
      const status = normalise(task.status);
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      const priority = normalise(task.priority);
      priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
    }

    this.statusData = STATUSES.map(status => ({
      name: status.name, value: statusCounts.get(status.key) ?? 0, color: status.color
    }));
    this.priorityData = PRIORITIES.map(priority => ({
      name: priority.name, value: priorityCounts.get(priority.key) ?? 0, color: priority.color
    }));
  }

  /** The doughnut has no labels, so the legend is what says which colour is which. */
  get statusLegend(): ChartSlice[] {
    return this.statusData.filter(slice => slice.value > 0);
  }
}
