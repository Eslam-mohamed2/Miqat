import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MainCalendar } from '../components/main-calendar/main-calendar';
import { CalendarSidebar } from '../components/calendar-sidebar/calendar-sidebar';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CommonModule, MainCalendar, CalendarSidebar],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarPage {
}
