import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from '../core/services/theme.service';
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule], // gives access to *ngFor, *ngIf, routerLink, etc.
  templateUrl: './header.html',
  styleUrl: './header.scss'
})
export class Header implements OnInit, OnDestroy {
  time: string = '';
  isMenuOpen = false;
  Timer = inject(ChangeDetectorRef);

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    console.log('Mobile menu toggled. New state:', this.isMenuOpen);
    this.Timer.detectChanges();
  }



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
  constructor(private router: Router, public themeService: ThemeService) { }
  private intervalId: any;

  goToLogin() {
    this.router.navigate(['/authentication'], { queryParams: { form: 'login' } });
  }

  goToRegister() {
    this.router.navigate(['/authentication'], { queryParams: { form: 'register' } });
  }

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
