import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { inject } from '@angular/core';
@Component({
  selector: 'app-flip-clock',
  imports: [],
  templateUrl: './flip-clock.html',
  styleUrl: './flip-clock.scss'
})
export class FlipClock implements OnInit, OnDestroy{
  time: string = '';
  Timer = inject(ChangeDetectorRef);
  private timer: any;
  private intervalId: any;
  ngOnInit(): void {
    this.updateTime();
    this.intervalId = setInterval(() => this.updateTime(), 1000);
  }

  ngOnDestroy(): void {
      if (this.intervalId)
      clearInterval(this.intervalId);
  }

  private updateTime(): void {
   const now = new Date();
    const hours = this.formatTime(now.getHours());
    const minutes = this.formatTime(now.getMinutes());
    const seconds = this.formatTime(now.getSeconds());
    this.time = `${hours}:${minutes }:${seconds}`;
    this.Timer.detectChanges();
  }

  private formatTime(num: number): string {
    return num < 10 ? '0' + num : num.toString();
  }
}
