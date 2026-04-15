import { Component, ChangeDetectionStrategy, ViewEncapsulation, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { TaskDto } from '../../../core/services/task.service';
import { MatIcon } from "@angular/material/icon";

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

  statusData: any[] = [];
  priorityData: any[] = [];

  statusColorScheme = {
    domain: ['#9ca3af', '#f4a835', '#2ec4a0'] // Pending, InProgress, Completed
  } as any;

  priorityColorScheme = {
    domain: ['#2ec4a0', '#f4a835', '#ef4444'] // Low, Medium, High
  } as any;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tasks'] && this.tasks) {
      this.calculateCharts();
    }
  }

  private calculateCharts(): void {
    const statusCounts = { Pending: 0, InProgress: 0, Completed: 0 };
    const priorityCounts = { Low: 0, Medium: 0, High: 0 };

    this.tasks.forEach(t => {
      if (t.status === 'Pending') statusCounts.Pending++;
      else if (t.status === 'InProgress') statusCounts.InProgress++;
      else if (t.status === 'Completed') statusCounts.Completed++;

      if (t.priority === 'Low') priorityCounts.Low++;
      else if (t.priority === 'Medium') priorityCounts.Medium++;
      else if (t.priority === 'High') priorityCounts.High++;
    });

    this.statusData = [
      { name: 'To Do', value: statusCounts.Pending },
      { name: 'In Progress', value: statusCounts.InProgress },
      { name: 'Done', value: statusCounts.Completed }
    ];

    this.priorityData = [
      { name: 'Low', value: priorityCounts.Low },
      { name: 'Medium', value: priorityCounts.Medium },
      { name: 'High', value: priorityCounts.High }
    ];
  }
}

