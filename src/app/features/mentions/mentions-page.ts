import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MentionService } from '../../core/services/mention.service';
import { TaskService } from '../../core/services/task.service';
import { GroupService } from '../../core/services/group.service';
import { UiService } from '../../core/services/ui.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { GroupDto, MentionDto, TaskDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

@Component({
  selector: 'app-mentions-page',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './mentions-page.html',
  styleUrl: './mentions-page.scss',
  animations: [
    trigger('listAnim', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(-12px)' }),
          stagger('50ms', [
            animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class MentionsPage implements OnInit {
  private mentionService = inject(MentionService);
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  private router = inject(Router);
  private uiService = inject(UiService);

  mentions = signal<MentionDto[]>([]);
  loading = signal(true);
  errorMessage = signal('');
  filter = signal<'all' | 'unread'>('all');

  unreadCount = computed(() => this.mentions().filter(m => !m.isRead).length);

  visible = computed(() =>
    this.filter() === 'unread'
      ? this.mentions().filter(m => !m.isRead)
      : this.mentions()
  );

  ngOnInit() {
    this.loadMentions();
  }

  loadMentions() {
    this.loading.set(true);
    this.errorMessage.set('');

    // The API sends only entityType + entityId — never the name of the thing you
    // were mentioned in. Tasks and projects are fetched alongside so each row can
    // say "in Redesign the homepage" instead of a bare "in a task".
    forkJoin({
      mentions: this.mentionService.getMentions(),
      tasks: this.taskService.getTasks().pipe(catchError(() => of([] as TaskDto[]))),
      groups: this.groupService.getGroups().pipe(catchError(() => of([] as GroupDto[])))
    }).subscribe({
      next: ({ mentions, tasks, groups }) => {
        const names = new Map<string, string>();
        for (const task of tasks) names.set(task.id, task.title);
        for (const group of groups) names.set(group.id, group.name);

        const resolved = mentions.map(mention => ({
          ...mention,
          entityName: mention.entityId ? names.get(mention.entityId) : undefined
        }));
        this.mentions.set(resolved);
        this.loading.set(false);
        this.resolveMissingNames(resolved);
      },
      error: (err) => {
        this.mentions.set([]);
        this.errorMessage.set(apiErrorMessage(err, 'Could not load mentions.'));
        this.loading.set(false);
      }
    });
  }

  /**
   * Fills in the names the bulk lists could not supply.
   *
   * `getTasks()` only returns tasks you own or are assigned, but you can be
   * mentioned on a task you merely have access to as a project member — so
   * every one of those rows fell back to a bare "a task", making the whole page
   * read as four identical entries. Anything still missing is fetched by id,
   * which the API allows for exactly the people who are allowed to see it.
   */
  private resolveMissingNames(mentions: MentionDto[]) {
    const missing = new Map<string, MentionDto>();
    for (const mention of mentions) {
      if (mention.entityId && !mention.entityName) missing.set(mention.entityId, mention);
    }
    if (!missing.size) return;

    const lookups = [...missing.entries()].map(([id, mention]) =>
      (this.isProject(mention)
        ? this.groupService.getGroupById(id).pipe(map(g => g?.name))
        : this.taskService.getTaskById(id).pipe(map(t => t?.title))
      ).pipe(
        map(name => ({ id, name })),
        // A mention can outlive the thing it points at, or point at something
        // this user lost access to. Those keep the generic label.
        catchError(() => of({ id, name: undefined as string | undefined }))
      ));

    forkJoin(lookups).subscribe(results => {
      const found = new Map(results.filter(r => r.name).map(r => [r.id, r.name!]));
      if (!found.size) return;
      this.mentions.update(list => list.map(m =>
        m.entityName || !m.entityId || !found.has(m.entityId)
          ? m
          : { ...m, entityName: found.get(m.entityId) }));
    });
  }

  markAsReadAndNavigate(mention: MentionDto) {
    if (!mention.isRead) {
      this.mentionService.markMentionAsRead(mention.id).subscribe();
      this.mentions.update(list =>
        list.map(m => m.id === mention.id ? { ...m, isRead: true } : m)
      );
    }
    this.navigateToMentionTarget(mention);
  }

  navigateToMentionTarget(mention: MentionDto) {
    if (!mention.entityId) return;

    if (this.isProject(mention)) {
      this.uiService.openProjectDetails(mention.entityId);
      return;
    }

    // Task mentions used to dump you on the dashboard, which is not where the
    // task is. The tasks page is.
    this.router.navigate(['/tasks']);
  }

  /**
   * The API serialises this as the enum *name* ("Project" | "Task" | "Comment"),
   * but the numeric form is accepted too. Backend order is
   * Project = 0, Task = 1, Comment = 2 — the numeric fallback here previously
   * treated 2 as a project, which is actually Comment.
   */
  isProject(mention: MentionDto): boolean {
    const type = String(mention.entityType ?? '').toLowerCase();
    return type === '0' || type === 'group' || type === 'project';
  }

  /** Icon + wording for the entity chip on each row. */
  entityIcon(mention: MentionDto): string {
    if (this.isProject(mention)) return 'folder';
    return this.isComment(mention) ? 'chat_bubble_outline' : 'task_alt';
  }

  entityChip(mention: MentionDto): string {
    if (this.isProject(mention)) return 'Project';
    return this.isComment(mention) ? 'Comment' : 'Task';
  }

  isComment(mention: MentionDto): boolean {
    const type = String(mention.entityType ?? '').toLowerCase();
    return type === '2' || type === 'comment';
  }

  /**
   * There is no bulk endpoint for mentions, so this marks each unread one and
   * updates the list once rather than per response.
   */
  markAllRead() {
    const unread = this.mentions().filter(m => !m.isRead);
    if (!unread.length) return;

    this.mentions.update(list => list.map(m => ({ ...m, isRead: true })));
    for (const mention of unread) {
      this.mentionService.markMentionAsRead(mention.id).subscribe({
        error: () => this.loadMentions()
      });
    }
  }

  /** Wording when the entity's name could not be resolved locally. */
  entityLabel(mention: MentionDto): string {
    const type = String(mention.entityType ?? '').toLowerCase();
    if (this.isProject(mention)) return 'a project';
    if (type === '1' || type === 'task' || type === 'taskitem') return 'a task';
    if (type === '2' || type === 'comment') return 'a comment';
    return 'something';
  }

  initials(mention: MentionDto): string {
    const source = mention.mentionedByUserName || '?';
    return source.split(' ').filter(Boolean).slice(0, 2)
      .map(word => word[0]).join('').toUpperCase();
  }

  /** Stable colour per person, matching how the notifications feed picks one. */
  avatarColor(mention: MentionDto): string {
    const palette = ['#7c8ef5', '#2ec4a0', '#f4a835', '#f4845f', '#ef4444', '#9b6dff'];
    const key = mention.mentionedByUserName || mention.id;
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  trackById(_index: number, mention: MentionDto): string {
    return mention.id;
  }

  formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  }
}
