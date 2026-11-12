import {
  ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GroupService } from '../../../core/services/group.service';
import { UiService } from '../../../core/services/ui.service';
import { GroupDto } from '../../../models/api.models';

/** How many projects the card lists before "View All". */
const LIMIT = 4;

/**
 * The user's most recent projects. This card was a hardcoded "No recent workspaces
 * available." with a "View All" that had no handler.
 */
@Component({
  selector: 'app-recent-workspaces',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './recent-workspaces.html',
  styleUrl: './recent-workspaces.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecentWorkspaces implements OnInit, OnChanges {
  private groupService = inject(GroupService);
  private ui = inject(UiService);

  /** Changes whenever the dashboard wants the list re-read. */
  @Input() refresh = 0;

  private groups = signal<GroupDto[]>([]);
  readonly loading = signal(true);

  readonly recent = computed(() =>
    [...this.groups()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, LIMIT));

  readonly total = computed(() => this.groups().length);

  ngOnInit() {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['refresh'] && !changes['refresh'].firstChange) this.load();
  }

  private load() {
    this.groupService.getGroups()
      .pipe(catchError(() => of([] as GroupDto[])))
      .subscribe(groups => {
        this.groups.set(groups ?? []);
        this.loading.set(false);
      });
  }

  /** Opens the full list (the Projects panel), where projects are also created. */
  viewAll() {
    this.ui.toggleProjects(true);
  }

  /** 0-100, from the counts the API already sends with each project. */
  progress(group: GroupDto): number {
    if (!group.taskCount) return 0;
    return Math.round(((group.completedTaskCount ?? 0) / group.taskCount) * 100);
  }

  trackById = (_: number, group: GroupDto) => group.id;
}
