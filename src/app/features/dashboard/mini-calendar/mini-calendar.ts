import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-mini-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './mini-calendar.html',
  styleUrl: './mini-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCalendar {
  daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  
  // Dummy data for October 2023 grid: starts on Sunday
  // Previous month (Sept): 24, 25, 26, 27, 28, 29, 30
  // Current month (Oct): 1..31
  // Next month (Nov): 1..4 (to fill 42 cells)
  grid = [
    { num: 24, other: true }, { num: 25, other: true }, { num: 26, other: true }, { num: 27, other: true }, { num: 28, other: true }, { num: 29, other: true }, { num: 30, other: true },
    { num: 1, other: false }, { num: 2, other: false }, { num: 3, other: false }, { num: 4, other: false }, { num: 5, other: false }, { num: 6, other: false }, { num: 7, other: false, event: true },
    { num: 8, other: false }, { num: 9, other: false, event: true }, { num: 10, other: false }, { num: 11, other: false }, { num: 12, other: false, today: true }, { num: 13, other: false }, { num: 14, other: false },
    { num: 15, other: false }, { num: 16, other: false }, { num: 17, other: false }, { num: 18, other: false }, { num: 19, other: false }, { num: 20, other: false }, { num: 21, other: false },
    { num: 22, other: false }, { num: 23, other: false }, { num: 24, other: false }, { num: 25, other: false }, { num: 26, other: false }, { num: 27, other: false }, { num: 28, other: false },
    { num: 29, other: false }, { num: 30, other: false }, { num: 31, other: false }, { num: 1, other: true }, { num: 2, other: true }, { num: 3, other: true }, { num: 4, other: true },
  ];
}
