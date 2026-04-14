import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-quick-action-card',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './quick-action-card.html',
  styleUrl: './quick-action-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickActionCard {
  @Input() card: any;
  @Output() cardClick = new EventEmitter<any>();
}
