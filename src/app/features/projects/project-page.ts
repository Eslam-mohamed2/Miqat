import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { GroupService } from '../../core/services/group.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { TaskService } from '../../core/services/task.service';
import { UserService } from '../../core/services/user.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { formatNumber, locale, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';
import { estimateMinutes, formatEstimate, visibleTags } from '../../core/utils/task-estimate';
import { UserMenu } from '../../layout/user-menu/user-menu';
import { GroupDto, MemberDto, TaskDto } from '../../models/api.models';
import { CommentThread } from '../../shared/comment-thread/comment-thread';
import { TaskMarks } from '../../shared/task-marks/task-marks';
import { TaskWindowComponent } from '../dashboard/task-window/task-window';
import { TaskBoard } from '../tasks/task-board/task-board';
import { TasksStore } from '../tasks/tasks-store';
import { PRIORITIES, STATUSES, dueLabel, initials, isDone, isLate, priorityLabel } from '../tasks/task-view';

type ViewMode = 'table' | 'board';
type GroupBy = 'none' | 'status' | 'assignee';
type Section = 'tasks' | 'members' | 'discussion';

/**
 * A project as a page of its own: its tasks as a table or a board, its members
 * and their workload, the discussion between them, its progress, and the
 * controls to rename or delete it.
 *
 * The discussion has an address of its own, /projects/:id/discussion: the same
 * page with that section open. /projects/:id opens the tasks.
 *
 * No design file draws it; it follows the Tasks and Board screens (design/miqat-2.0).
 */
@Component({
  selector: 'app-project-page',
  standalone: true,
  imports: [FormsModule, RouterLink, UserMenu, TaskMarks, TaskBoard, CommentThread, TPipe, NumPipe],
  providers: [TasksStore],
  templateUrl: './project-page.html',
  styleUrl: './project-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectPage implements OnInit {
  readonly store = inject(TasksStore);
  readonly quickAdd = inject(QuickAddService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupService = inject(GroupService);
  private taskService = inject(TaskService);
  private friendService = inject(FriendService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private realtime = inject(RealtimeService);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);

  /** Values match the backend TaskStatus enum exactly. */
  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES;

  readonly projectId = signal('');
  readonly project = signal<GroupDto | null>(null);
  /** The project's tasks, kept by the store so the board and the table share them. */
  readonly tasks = this.store.tasks;
  readonly members = signal<MemberDto[]>([]);
  /** Friends and teammates, used as the pool of people who can be added to the project. */
  readonly allUsers = signal<{ id: string; name: string }[]>([]);

  readonly loading = signal(true);
  readonly errorMessage = signal('');

  readonly view = signal<ViewMode>('table');
  readonly groupBy = signal<GroupBy>('status');
  readonly search = signal('');
  readonly statusFilter = signal('All');
  readonly activeSection = signal<Section>('tasks');

  /** Comments and replies in the discussion. Null until the project says, or when its server has no discussions. */
  readonly commentCount = signal<number | null>(null);
  /** A comment to open the discussion on, named by the link that brought the user here (?comment=). */
  readonly focusComment = signal<string | null>(null);
  /**
   * An API build without discussions leaves the count out of the project. The
   * section is still offered there; opening it says what is missing.
   */
  readonly discussionAvailable = computed(() => this.project()?.commentCount !== undefined);

  readonly isEditingHeader = signal(false);
  readonly draftName = signal('');
  readonly draftDescription = signal('');
  readonly draftColor = signal('');
  private colorPicked = false;

  // ── Derived ────────────────────────────────────────────────────────────────

  readonly filteredTasks = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.tasks().filter(task => {
      if (status !== 'All' && task.status !== status) return false;
      if (!term) return true;
      return (task.title ?? '').toLowerCase().includes(term)
        || visibleTags(task.tags).some(tag => tag.toLowerCase().includes(term))
        || (task.assignedToUserName ?? '').toLowerCase().includes(term);
    });
  });

  /**
   * The table's row groups. Every status keeps its group even when empty, so a
   * group never disappears while tasks move between them.
   */
  readonly tableGroups = computed(() => {
    const zone = this.store.zone();
    const now = this.store.now();
    const hour24 = this.store.hour24();

    const rows = (tasks: TaskDto[]) => tasks.map(task => ({
      task,
      done: isDone(task),
      est: formatEstimate(estimateMinutes(task)),
      due: dueLabel(task, zone, now, hour24),
      late: isLate(task, now),
      labels: visibleTags(task.tags).slice(0, 3)
    }));
    const tasks = this.filteredTasks();

    if (this.groupBy() === 'status') {
      return this.statuses.map(status => ({
        key: status.value,
        title: status.label,
        status: status.value,
        rows: rows(tasks.filter(task => task.status === status.value))
      }));
    }

    if (this.groupBy() === 'assignee') {
      const nobody = t('Unassigned');
      const names = Array.from(new Set(tasks.map(task => task.assignedToUserName || nobody)));
      return names.sort().map(name => ({
        key: name,
        title: name,
        status: null,
        rows: rows(tasks.filter(task => (task.assignedToUserName || nobody) === name))
      }));
    }

    return [{ key: 'all', title: t('All tasks'), status: null, rows: rows(tasks) }];
  });

  /** The first group with rows: its table is the one that prints the column headings. */
  readonly firstFilledGroup = computed(() => this.tableGroups().findIndex(group => group.rows.length > 0));

  readonly stats = computed(() => {
    const all = this.tasks();
    const done = all.filter(isDone).length;
    const now = this.store.now();
    return {
      total: all.length,
      done,
      overdue: all.filter(task => isLate(task, now)).length,
      percent: all.length ? Math.round((done / all.length) * 100) : 0
    };
  });

  /**
   * Who can be assigned a task: the project's own members. That is the correct
   * semantics for a team board (you hand work to people on the project) and it
   * sidesteps GET /api/User, which is admin-only and 403s for everyone else.
   */
  readonly assignableUsers = computed(() =>
    this.members().map(member => ({ id: member.userId, name: member.fullName })));

  /** Contacts not already in the project, for the add-member picker. */
  readonly addableUsers = computed(() => {
    const memberIds = new Set(this.members().map(member => member.userId));
    return this.allUsers().filter(user => !memberIds.has(user.id));
  });

  /** Per-member workload, so a lead can see the distribution at a glance. */
  readonly memberStats = computed(() => {
    const tasks = this.tasks();
    return this.members().map(member => {
      const assigned = tasks.filter(task => task.assignedToUserId === member.userId);
      const done = assigned.filter(isDone).length;
      return {
        member,
        total: assigned.length,
        done,
        percent: assigned.length ? Math.round((done / assigned.length) * 100) : 0
      };
    });
  });

  readonly createdLabel = computed(() => this.formatDate(this.project()?.createdAt ?? ''));

  /** "Project · owned by Sara Ali · created 3 Nov 2026", above the name. */
  readonly ownerLine = computed(() => {
    const owner = this.project()?.ownerName || t('an unknown owner');
    const date = this.createdLabel();
    return date
      ? t('Project · owned by {owner} · created {date}', { owner, date })
      : t('Project · owned by {owner}', { owner });
  });

  /** "40% · 4 of 10 tasks", on the progress card. */
  readonly doneLine = computed(() => {
    const stats = this.stats();
    return t('{percent} · {done} of {total} tasks', {
      percent: formatNumber(stats.percent / 100, { style: 'percent' }), done: stats.done, total: stats.total
    });
  });

  readonly teamLabel = computed(() =>
    tCount(this.members().length, '{n} member: show the team', '{n} members: show the team'));

  ngOnInit() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('id');
        if (!id) {
          void this.router.navigate(['/tasks']);
          return;
        }
        // The address says whether the discussion is open; Tasks and Members share the other one.
        if (params.get('section') === 'discussion') this.activeSection.set('discussion');
        else if (this.activeSection() === 'discussion') this.activeSection.set('tasks');

        // Changing section keeps the page: only another project is loaded.
        if (id === this.projectId()) return;
        this.activeSection.update(section => (section === 'discussion' ? section : 'tasks'));
        this.projectId.set(id);
        this.load(id);
      });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(query => {
        const comment = query.get('comment');
        this.focusComment.set(comment);
        // A link to a comment means the discussion, also when its address does not say so.
        const params = this.route.snapshot.paramMap;
        if (comment && params.get('id') && params.get('section') !== 'discussion') {
          void this.router.navigate(['/projects', params.get('id'), 'discussion'], { queryParams: { comment }, replaceUrl: true });
        }
      });

    // The count on the Discussion tab follows the discussion, whichever section is open.
    this.realtime.projectCommentChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event?.groupId === this.projectId() && typeof event.total === 'number' && this.discussionAvailable()) {
          this.commentCount.set(event.total);
        }
      });
  }

  /** Opens a section. The discussion has its own address, so it can be linked to and reloaded. */
  showSection(section: Section) {
    this.activeSection.set(section);
    const onDiscussion = this.route.snapshot.paramMap.get('section') === 'discussion';
    if ((section === 'discussion') === onDiscussion) return;
    void this.router.navigate(section === 'discussion'
      ? ['/projects', this.projectId(), 'discussion']
      : ['/projects', this.projectId()]);
  }

  load(id: string) {
    this.loading.set(true);
    this.errorMessage.set('');
    this.commentCount.set(null);
    // The tasks: loaded, kept current over the live channel and changed through the store.
    this.store.start(() => this.taskService.getTasksByGroup(id));

    // One pass so the page renders complete rather than filling in piecemeal.
    // Each stream degrades to an empty value so a single failure cannot blank
    // the whole page.
    forkJoin({
      project: this.groupService.getGroupById(id).pipe(catchError(() => of(null))),
      members: this.groupService.getMembers(id).pipe(catchError(() => of([] as MemberDto[]))),
      // People who can be added: friends and teammates from other projects
      // (GET /api/User/contacts). The full user list is admin-only. An API build
      // without that endpoint falls back to friends alone.
      users: this.userService.getContacts().pipe(
        map(people => people.map(person => ({ id: person.id, name: person.fullName || person.email }))),
        catchError(() => this.friendService.getFriendUsers(this.authService.getCurrentUserId())
          .pipe(catchError(() => of([] as { id: string; name: string }[]))))
      )
    }).subscribe({
      next: result => {
        if (!result.project) {
          this.project.set(null);
          this.errorMessage.set(t('That project could not be found.'));
          this.loading.set(false);
          return;
        }
        this.project.set(result.project);
        this.commentCount.set(result.project.commentCount ?? null);
        this.members.set(result.members ?? []);
        this.allUsers.set(result.users ?? []);
        this.resetHeaderDraft();
        this.loading.set(false);
      },
      error: err => {
        this.errorMessage.set(apiErrorMessage(err, t('Could not load this project.')));
        this.loading.set(false);
      }
    });
  }

  private reloadMembers() {
    this.groupService.getMembers(this.projectId()).subscribe({
      next: members => {
        this.members.set(members);
        this.project.update(project => (project ? { ...project, memberCount: members.length } : project));
      },
      error: () => { /* keep what is on screen */ }
    });
  }

  // ── Task edits ─────────────────────────────────────────────────────────────

  setStatus(task: TaskDto, status: string) {
    this.store.setStatus(task, status);
  }

  setPriority(task: TaskDto, priority: string) {
    this.store.setPriority(task, priority);
  }

  setAssignee(task: TaskDto, userId: string) {
    const name = this.assignableUsers().find(user => user.id === userId)?.name ?? '';
    void this.store.save(task, {
      assignedToUserId: (userId || null) as unknown as string,
      assignedToUserName: name
    });
  }

  toggleDone(task: TaskDto) {
    this.store.toggleDone(task);
  }

  newTask() {
    this.dialog
      .open(TaskWindowComponent, {
        width: '600px',
        maxWidth: '95vw',
        disableClose: true,
        panelClass: 'custom-dialog-container',
        autoFocus: false,
        data: { groupId: this.projectId() }
      })
      .afterClosed()
      .subscribe(result => { if (result) this.store.reload(true); });
  }

  /** A task opens in Tasks, with its detail panel. */
  openTask(task: TaskDto) {
    void this.router.navigate(['/tasks', task.id]);
  }

  deleteTask(task: TaskDto) {
    void this.store.remove(task);
  }

  showDone() {
    this.view.set('table');
    this.statusFilter.set('Completed');
  }

  // ── Members ────────────────────────────────────────────────────────────────

  addMember(userId: string) {
    if (!userId) return;
    this.errorMessage.set('');
    this.groupService.addMember(this.projectId(), userId).subscribe({
      next: () => this.reloadMembers(),
      error: err => this.errorMessage.set(apiErrorMessage(err, t('Could not add that member.')))
    });
  }

  removeMember(member: MemberDto) {
    if (!confirm(t('Remove {name} from this project?', { name: member.fullName }))) return;

    const snapshot = this.members();
    this.members.update(list => list.filter(item => item.userId !== member.userId));
    this.groupService.removeMember(this.projectId(), member.userId).subscribe({
      next: () => this.reloadMembers(),
      error: err => {
        this.members.set(snapshot);
        this.errorMessage.set(apiErrorMessage(err, t('Could not remove that member.')));
      }
    });
  }

  // ── Header edit ────────────────────────────────────────────────────────────

  toggleHeaderEdit() {
    if (this.isEditingHeader()) this.resetHeaderDraft();
    this.isEditingHeader.update(editing => !editing);
  }

  private resetHeaderDraft() {
    const project = this.project();
    this.draftName.set(project?.name ?? '');
    this.draftDescription.set(project?.description ?? '');
    // A colour field cannot be empty: a project without a colour starts at the accent.
    this.draftColor.set(project?.color || this.accentColor());
    this.colorPicked = false;
  }

  pickColor(color: string) {
    this.draftColor.set(color);
    this.colorPicked = true;
  }

  /** The theme's accent as the browser reports it. */
  private accentColor(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--mq-accent').trim();
  }

  saveHeader() {
    const project = this.project();
    const name = this.draftName().trim();
    if (!project || !name) return;

    const updated: GroupDto = {
      ...project, name, description: this.draftDescription().trim(),
      // A project with no colour keeps none unless one was actually chosen.
      color: this.colorPicked ? this.draftColor() : project.color
    };
    this.project.set(updated);
    this.isEditingHeader.set(false);

    this.groupService.updateGroup(project.id, updated).subscribe({
      error: err => {
        this.project.set(project);
        this.errorMessage.set(apiErrorMessage(err, t('Could not save the project.')));
      }
    });
  }

  deleteProject() {
    const project = this.project();
    if (!project) return;
    if (!confirm(t('Delete “{name}” and everything in it? This cannot be undone.', { name: project.name }))) return;

    this.groupService.deleteGroup(project.id).subscribe({
      next: () => void this.router.navigate(['/tasks']),
      error: err => this.errorMessage.set(apiErrorMessage(err, t('Could not delete this project.')))
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  initialsOf(name: string | null | undefined): string {
    return initials(name);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /** A priority's name in the interface language; the value sent to the API stays as it is. */
  priorityName(priority: string): string {
    return priorityLabel(priority);
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
