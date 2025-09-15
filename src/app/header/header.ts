import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { inject } from '@angular/core';
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule], // gives access to *ngFor, *ngIf, etc.
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class Header implements OnInit, OnDestroy {
  time: string = '';
  Timer = inject(ChangeDetectorRef);

  clocks = [
    'assets/SVG icons/clock-slash-svgrepo-com.svg',
    'assets/SVG icons/clock-two-thirty-svgrepo-com.svg',
    '../../assets/SVG icons/clock-lines-svgrepo-com.svg',
    'assets/SVG icons/clock-slash-svgrepo-com.svg',
    'assets/SVG icons/clock-two-thirty-svgrepo-com.svg',
    '../../assets/SVG icons/clock-lines-svgrepo-com.svg',
    'assets/SVG icons/clock-slash-svgrepo-com.svg',
    'assets/SVG icons/clock-two-thirty-svgrepo-com.svg',
    '../../assets/SVG icons/clock-lines-svgrepo-com.svg'
  ];

  private intervalId: any;

  ngOnInit(): void {
    this.updateTime();
    this.intervalId = setInterval(() => this.updateTime(), 6000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private updateTime(): void {
    const now = new Date();
    const hours = this.padZero(now.getHours());
    const minutes = this.padZero(now.getMinutes());
    this.time = `${hours}:${minutes}`;
    this.Timer.detectChanges();
  }

  private padZero(num: number): string {
    return num < 10 ? '0' + num : num.toString();
  }
}
