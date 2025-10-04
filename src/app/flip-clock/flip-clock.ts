import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { inject } from '@angular/core';
@Component({
  selector: 'app-flip-clock',
  imports: [CommonModule] ,
  templateUrl: './flip-clock.html',
  styleUrl: './flip-clock.scss'
})
export class FlipClock implements OnInit, OnDestroy{
  time: string = '';
  isFlipping = false;
  Timer = inject(ChangeDetectorRef);
  private intervalId: any;

  ngOnInit(): void {
    this.updateTime();
    this.intervalId = setInterval(() => this.updateTime(), 1000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private updateTime(): void {
    this.isFlipping = true; // start flip animation
    const now = new Date();
    const hours = this.formatTime(now.getHours());
    const minutes = this.formatTime(now.getMinutes());
    const seconds = this.formatTime(now.getSeconds());
    this.time = `${hours}:${minutes}:${seconds}`;
    this.Timer.detectChanges();

    // stop animation after it completes (0.6s)
    setTimeout(() => (this.isFlipping = false), 600);
  }

  private formatTime(num: number): string {
    return num < 10 ? '0' + num : num.toString();
  }
}
