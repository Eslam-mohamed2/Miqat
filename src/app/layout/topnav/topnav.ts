import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-topnav',
  standalone: true,
  imports: [MatIconModule, CommonModule],
  templateUrl: './topnav.html',
  styleUrl: './topnav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Topnav {
  public themeService = inject(ThemeService);
}
