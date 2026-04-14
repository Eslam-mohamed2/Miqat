import { Component, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import * as shape from 'd3-shape';

@Component({
  selector: 'app-productivity-chart',
  standalone: true,
  imports: [CommonModule, NgxChartsModule],
  templateUrl: './productivity-chart.html',
  styleUrl: './productivity-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ProductivityChart {
  chartData = [
    {
      name: 'Tasks',
      series: [
        { name: 'Mon', value: 12 },
        { name: 'Tue', value: 19 },
        { name: 'Wed', value: 15 },
        { name: 'Thu', value: 22 },
        { name: 'Fri', value: 17 },
        { name: 'Sat', value: 7  },
        { name: 'Sun', value: 9  }
      ]
    },
    {
      name: 'Nodes',
      series: [
        { name: 'Mon', value: 5  },
        { name: 'Tue', value: 8  },
        { name: 'Wed', value: 12 },
        { name: 'Thu', value: 15 },
        { name: 'Fri', value: 14 },
        { name: 'Sat', value: 10 },
        { name: 'Sun', value: 7  }
      ]
    }
  ];

  colorScheme = {
    domain: ['#2ec4a0', '#f4845f']
  } as any;

  curve = shape.curveBasis;
  chartWidth = 700; // In a real app this would be responsive
}
