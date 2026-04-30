import { Component, ChangeDetectionStrategy, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TaskService, TaskDto } from '../../../core/services/task.service';
import { TaskWindowComponent } from '../task-window/task-window';

@Component({
  selector: 'app-mini-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule],
  templateUrl: './mini-calendar.html',
  styleUrl: './mini-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCalendar implements OnInit {
  daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  
  private taskService = inject(TaskService);
  private dialog = inject(MatDialog);
  private cdr = inject(ChangeDetectorRef);

  currentDate = new Date();
  tasks: TaskDto[] = [];
  grid: any[] = [];
  currentMonthName = '';

  ngOnInit() {
    this.taskService.getTasks().subscribe({
      next: (tasks) => {
        this.tasks = tasks || [];
        this.generateGrid();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load tasks for calendar', err);
      }
    });
    this.generateGrid();
  }

  generateGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    this.currentMonthName = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const newGrid = [];

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      newGrid.push({ num: daysInPrevMonth - i, other: true });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      // Create local date string in YYYY-MM-DD format manually to avoid timezone shift
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(i).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      
      const dayTasks = this.tasks.filter(t => t.dueDate && t.dueDate.startsWith(dateStr));
      
      newGrid.push({
        num: i,
        other: false,
        today: isCurrentMonth && today.getDate() === i,
        event: dayTasks.length > 0,
        tasks: dayTasks
      });
    }

    // Next month padding to complete 42 cells (6 rows * 7)
    const remainingCells = 42 - newGrid.length;
    for (let i = 1; i <= remainingCells; i++) {
      newGrid.push({ num: i, other: true });
    }

    this.grid = newGrid;
  }

  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateGrid();
    this.cdr.markForCheck();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateGrid();
    this.cdr.markForCheck();
  }

  onDayClick(day: any) {
    if (day.other) return; // Ignore clicks on other months
    if (day.tasks && day.tasks.length > 0) {
      // Open the first task for this day
      const dialogRef = this.dialog.open(TaskWindowComponent, {
        width: '600px',
        maxWidth: '95vw',
        panelClass: 'custom-dialog-container',
        autoFocus: false,
        data: { task: day.tasks[0] }
      });
      
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          // Refresh tasks if something was updated
          this.ngOnInit();
        }
      });
    }
  }
}
