import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-upcoming-agenda',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './upcoming-agenda.html',
  styleUrl: './upcoming-agenda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpcomingAgenda {
  agendaItems = [
    {
      time: '10:00',
      title: 'Design Sync',
      description: 'Review whiteboard sketches',
      accentColor: '#2ec4a0',
      avatars: ['https://i.pravatar.cc/100?img=1', 'https://i.pravatar.cc/100?img=2']
    },
    {
      time: '14:30',
      title: 'Client Presentation',
      description: 'Present Node Flow diagram',
      accentColor: '#f4845f',
      avatars: []
    }
  ];
}
