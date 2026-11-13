import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { InboxCountService } from '../../core/services/inbox-count.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { ToastService } from '../../core/services/toast.service';
import { UiService } from '../../core/services/ui.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { formatNumber, locale, num, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';
import {
  estimateMinutes, formatDuration, formatEstimate, visibleTags, withEstimate
} from '../../core/utils/task-estimate';
import { zonedParts, zonedTimeToUtc } from '../../core/utils/time-zone';
import { UserMenu } from '../../layout/user-menu/user-menu';
import { GroupDto, TaskDto } from '../../models/api.models';
import { TaskWindowComponent } from '../dashboard/task-window/task-window';
import { QuickPart, parseQuickTask } from './quick-task';
import { SchedulePopover } from './schedule-popover/schedule-popover';
import { TaskBoard } from './task-board/task-board';
import { TaskList, TaskSection } from './task-list/task-list';
import { TaskPanel } from './task-panel/task-panel';
import { TasksStore } from './tasks-store';
import {
  PRIORITIES, STATUSES, TaskDates, blockMinutes, dayNumber, isClosed, isDone, isOpen, longDate, priorityLabel,
  priorityPhrase, taskDates, timeValue
} from './task-view';

export type ViewMode = 'list' | 'kanban';
type ListKey = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'logbook' | 'mine' | 'blocked' | 'project';
type SortKey = 'default' | 'dueDate' | 'priority' | 'title' | 'status';

interface NavItem {
  key: ListKey;
  label: string;
  /** The `d` of the item's icon, from the design file. */
  icon: string;
}

const VIEW_STORAGE_KEY = 'miqat.tasks.view';
const DAY_MS = 86_400_000;
/** From this width the detail panel has a column of its own. */
const WIDE_QUERY = '(min-width: 1180px)';

const LISTS: NavItem[] = [
  { key: 'inbox', label: t('Inbox'), icon: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z' },
  { key: 'today', label: t('Today'), icon: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' },
  { key: 'upcoming', label: t('Upcoming'), icon: 'M5.5 5h13A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5zM3 10h18M8 3v4M16 3v4' },
  { key: 'anytime', label: t('Anytime'), icon: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5' },
  { key: 'someday', label: t('Someday'), icon: 'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v2A1.5 1.5 0 0 1 19.5 9h-15A1.5 1.5 0 0 1 3 7.5v-2A1.5 1.5 0 0 1 4.5 4zM5 9v10h14V9M10 13h4' },
  { key: 'logbook', label: t('Logbook'), icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12.5l2.5 2.5L16 9.5' }
];

const VIEWS: NavItem[] = [
  { key: 'mine', label: t('Assigned to me'), icon: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0' },
  { key: 'blocked', label: t('Blocked'), icon: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M5.6 5.6l12.8 12.8' }
];

const MENTIONS_ICON = 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8';

const EMPTY_TEXT: Record<ListKey, string> = {
  inbox: t('Nothing waiting to be sorted. New tasks without a project or a date land here.'),
  today: t('Nothing is due or planned for today.'),
  upcoming: t('No task is dated later than today.'),
  anytime: t('No open task is without a date.'),
  someday: t('Nothing is on hold.'),
  logbook: t('Finished tasks are kept here.'),
  mine: t('No open task is assigned to you.'),
  blocked: t('No task is waiting on another one.'),
  project: t('This project has no tasks yet.')
};

/**
 * The letter of a shortcut. On a keyboard set to Arabic the key marked "N" types
 * "ى", so when the key gives no Latin letter its place on the keyboard is used.
 */
function shortcutKey(event: KeyboardEvent): string {
  if (/^[a-z ]$/i.test(event.key) || !/^Key[A-Z]$/.test(event.code)) return event.key.toLowerCase();
  return event.code.slice(3).toLowerCase();
}

/**
 * Tasks (design/miqat-2.0: V2-Tasks, V2-Board and, at phone width, V2-MobileTasks).
 *
 * The list has the smart lists on the left and the selected task's detail panel
 * on the right; the board is the same tasks as columns by status. `/tasks/:id`
 * is this page with that task open.
 */
@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [RouterLink, UserMenu, TaskList, TaskBoard, TaskPanel, SchedulePopover, TPipe, NumPipe],
  providers: [TasksStore],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksPage implements OnInit {
  readonly store = inject(TasksStore);
  readonly quickAdd = inject(QuickAddService);
  readonly inbox = inject(InboxCountService);
  private ui = inject(UiService);
  private prefs = inject(LocalPrefsService);
  private toasts = inject(ToastService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  readonly lists = LISTS;
  readonly views = VIEWS;
  readonly mentionsIcon = MENTIONS_ICON;
  /** The API's values with the names shown for them. */
  readonly priorities = PRIORITIES.map(value => ({ value, label: priorityLabel(value) }));
  readonly sortChoices: { key: SortKey; label: string }[] = [
    { key: 'default', label: t('Date (default)') },
    { key: 'dueDate', label: t('Deadline') },
    { key: 'priority', label: t('Priority') },
    { key: 'status', label: t('Status') },
    { key: 'title', label: t('Title') }
  ];

  readonly view = signal<ViewMode>(this.restoreView());
  readonly list = signal<ListKey>('today');
  /** The project chosen in the left column (when `list` is "project"). */
  readonly projectId = signal<string | null>(null);

  /** The task in the address (/tasks/:id), and the comment a notification pointed at. */
  readonly routeId = signal<string | null>(null);
  readonly focusCommentId = signal<string | null>(null);

  /** True when the detail panel has its own column beside the list. */
  readonly wide = signal(true);

  // ── "Display": sorting and filters, kept in this browser ───────────────────
  readonly displayOpen = signal(false);
  readonly sortKey = this.prefs.value<SortKey>('tasks.sort', 'default');
  readonly sortAsc = this.prefs.value('tasks.sortAsc', true);
  readonly priorityFilter = signal('All');
  readonly term = signal('');
  readonly hasFilters = computed(() => this.priorityFilter() !== 'All' || !!this.term().trim());

  // ── Board switches ─────────────────────────────────────────────────────────
  readonly lanes = this.prefs.value('board.rowsByProject', false);
  readonly onlyMine = signal(false);
  readonly onlyHigh = signal(false);

  /** Sections folded or opened by hand; "Done" sections start folded. */
  private readonly folds = signal<Record<string, boolean>>({});

  // ── The "Add a task" row ───────────────────────────────────────────────────
  readonly draft = signal('');
  readonly adding = signal(false);
  /** Parts of the shorthand the user asked to be read as plain words. */
  private readonly ignored = signal<ReadonlySet<QuickPart>>(new Set());

  // ── Reading the tasks ──────────────────────────────────────────────────────

  /** Each task's dates relative to today. A task just ticked keeps its place for a moment. */
  private readonly dates = computed(() => {
    const zone = this.store.zone();
    const now = this.store.now();
    const settling = this.store.settling();
    const map = new Map<string, TaskDates>();
    for (const task of this.store.tasks()) map.set(task.id, taskDates(settling.get(task.id) ?? task, zone, now));
    return map;
  });

  /** A task as the lists place it: as it was a moment ago while its tick settles. */
  private placed(task: TaskDto): TaskDto {
    return this.store.settling().get(task.id) ?? task;
  }

  readonly counts = computed(() => {
    const zone = this.store.zone();
    const now = this.store.now();
    const counts = { inbox: 0, today: 0, upcoming: 0, anytime: 0, someday: 0, mine: 0, blocked: 0 };

    for (const task of this.store.tasks()) {
      const dates = taskDates(task, zone, now);
      if (dates.today) counts.today++;
      if (dates.upcoming) counts.upcoming++;
      if (dates.anytime) counts.anytime++;
      if (dates.anytime && !task.groupId) counts.inbox++;
      if (task.status === 'On_hold') counts.someday++;
      if (isOpen(task) && task.assignedToUserId === this.store.myId) counts.mine++;
      if (!isClosed(task) && task.isBlocked) counts.blocked++;
    }
    return counts;
  });

  /** The number beside a list's name. The Logbook has none, and a zero is left out. */
  countOf(key: ListKey): number | '' {
    const counts: Partial<Record<ListKey, number>> = this.counts();
    return counts[key] || '';
  }

  readonly projects = computed(() =>
    this.store.groups().map(group => {
      const percent = group.taskCount ? Math.round(((group.completedTaskCount ?? 0) / group.taskCount) * 100) : 0;
      return {
        id: group.id,
        name: group.name,
        color: group.color || null,
        percent: formatNumber(percent / 100, { style: 'percent' }),
        // The ring is a circle of radius 6: 37.7 around.
        dash: ((percent / 100) * 37.7).toFixed(1) + ' 37.7'
      };
    }));

  readonly project = computed<GroupDto | null>(() =>
    this.list() === 'project' ? this.store.groups().find(group => group.id === this.projectId()) ?? null : null);

  readonly title = computed(() => {
    if (this.list() === 'project') return this.project()?.name ?? t('Project');
    return [...LISTS, ...VIEWS].find(item => item.key === this.list())?.label ?? t('Tasks');
  });

  /** "Thursday, 12 November" */
  readonly dateLine = computed(() => longDate(this.store.now(), this.store.zone()));

  /** The tasks of the chosen list, before "Display" narrows them. */
  private readonly scoped = computed(() => {
    const list = this.list();
    const dates = this.dates();
    const doneToday = (task: TaskDto) => isDone(task) && this.completedIn(task) === 0;

    return this.store.tasks().filter(task => {
      const placed = this.placed(task);
      const when = dates.get(task.id)!;
      switch (list) {
        case 'inbox': return when.anytime && !placed.groupId;
        case 'today': return when.today || (doneToday(task) && placed === task);
        case 'upcoming': return when.upcoming;
        case 'anytime': return when.anytime;
        case 'someday': return placed.status === 'On_hold';
        case 'logbook': return isClosed(placed);
        case 'mine': return task.assignedToUserId === this.store.myId;
        case 'blocked': return !!task.isBlocked && !isClosed(placed);
        case 'project': return task.groupId === this.projectId();
      }
    });
  });

  readonly filtered = computed(() => {
    const priority = this.priorityFilter();
    const term = this.term().trim().toLowerCase();

    return this.scoped().filter(task => {
      if (priority !== 'All' && task.priority !== priority) return false;
      if (!term) return true;
      return (task.title ?? '').toLowerCase().includes(term)
        || (task.description ?? '').toLowerCase().includes(term)
        || visibleTags(task.tags).some(tag => tag.toLowerCase().includes(term));
    });
  });

  readonly sections = computed<TaskSection[]>(() => {
    const folds = this.folds();
    return this.buildSections()
      .filter(section => section.tasks.length)
      .map(section => ({
        key: this.list() + ':' + section.key,
        title: section.title,
        tone: section.tone,
        tasks: this.sort(section.tasks, section.key),
        open: !(folds[this.list() + ':' + section.key] ?? !!section.folded),
        shortTitle: section.shortTitle
      }));
  });

  /** The rows on screen, top to bottom: what J and K walk through. */
  private readonly visible = computed(() => this.sections().flatMap(section => (section.open ? section.tasks : [])));

  /**
   * The task in the detail panel: the one in the address, or, on a wide screen
   * with nothing chosen yet, the first row of the list.
   */
  readonly selectedId = computed(() => {
    const fromRoute = this.routeId();
    if (fromRoute) return fromRoute;
    if (this.view() !== 'list' || !this.wide()) return null;
    return this.visible()[0]?.id ?? null;
  });

  private readonly totals = computed(() => {
    const open = this.filtered().filter(task => !isClosed(task));
    return {
      open: open.length,
      estimated: open.reduce((sum, task) => sum + (estimateMinutes(task) ?? 0), 0),
      planned: open.filter(task => task.startDate).reduce((sum, task) => sum + blockMinutes(task), 0)
    };
  });

  /** "6 open · 4 h 45 min estimated · 2 h 45 min on your calendar" */
  readonly summary = computed(() => {
    if (this.list() === 'logbook') {
      return tCount(this.filtered().length, '{n} finished task', '{n} finished tasks');
    }
    const totals = this.totals();
    return [
      tCount(totals.open, '{n} open', '{n} open'),
      totals.estimated ? t('{duration} estimated', { duration: formatDuration(totals.estimated) }) : '',
      totals.planned ? t('{duration} on your calendar', { duration: formatDuration(totals.planned) }) : ''
    ].filter(Boolean).join(' · ');
  });

  /** Phones: the short form beside the title ("6 open · 4 h 45 min"). */
  readonly shortSummary = computed(() => {
    if (this.list() === 'logbook') return this.summary();
    const totals = this.totals();
    return tCount(totals.open, '{n} open', '{n} open') + (totals.estimated ? ' · ' + formatDuration(totals.estimated) : '');
  });

  readonly emptyText = computed(() =>
    this.hasFilters() ? t('No task here matches the filters under “Display”.') : EMPTY_TEXT[this.list()]);

  // ── The board ──────────────────────────────────────────────────────────────

  readonly boardTasks = computed(() => {
    const project = this.list() === 'project' ? this.projectId() : null;
    return this.store.tasks().filter(task =>
      (!project || task.groupId === project)
      && (!this.onlyMine() || task.assignedToUserId === this.store.myId)
      && (!this.onlyHigh() || task.priority === 'High' || task.priority === 'Critical'));
  });

  /** "30% · 4h 45m of 15h 45m": by estimate when tasks have them, by count otherwise. */
  readonly boardProgress = computed(() => {
    const tasks = this.boardTasks().filter(task => task.status !== 'Cancelled');
    const minutes = (list: TaskDto[]) => list.reduce((sum, task) => sum + (estimateMinutes(task) ?? 0), 0);
    const done = tasks.filter(isDone);
    const total = minutes(tasks);

    const share = (percent: number) => formatNumber(percent / 100, { style: 'percent' });

    if (total) {
      const percent = Math.round((minutes(done) / total) * 100);
      const label = t('{percent} · {done} of {total}', {
        percent: share(percent),
        done: formatEstimate(minutes(done)) || t('{m}m', { m: 0 }),
        total: formatEstimate(total)
      });
      return { percent, label };
    }
    const percent = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
    // English says "tasks" after any number here ("1 of 1 tasks"), as it always did.
    const label = tCount(tasks.length, '{percent} · {done} of {n} tasks', '{percent} · {done} of {n} tasks', {
      percent: share(percent),
      done: num(done.length)
    });
    return { percent, label };
  });

  readonly boardScope = computed(() => this.project()?.name ?? t('All projects'));

  // ── Phones: how much of the working day is planned ─────────────────────────

  readonly dayLoad = computed(() => {
    const hours = this.store.workHours(0);
    const capacity = Math.max(0, (hours.end - hours.start) / 60_000);
    const dayStart = this.store.dayStart(0).getTime();
    const dayEnd = dayStart + DAY_MS;
    const todayNumber = dayNumber(this.store.now(), this.store.zone());

    const meetings = this.store.meetings().reduce((sum, stretch) =>
      sum + Math.max(0, Math.min(stretch.end, dayEnd) - Math.max(stretch.start, dayStart)) / 60_000, 0);
    const blocks = this.store.tasks()
      .filter(task => !isClosed(task) && task.startDate && dayNumber(new Date(task.startDate), this.store.zone()) === todayNumber)
      .reduce((sum, task) => sum + blockMinutes(task), 0);

    const share = (minutes: number) => (capacity ? Math.min(100, (minutes / capacity) * 100) : 0);
    const meetingShare = share(meetings);
    return {
      label: t('{planned} of {capacity} planned', {
        planned: formatDuration(Math.round(meetings + blocks)),
        capacity: formatDuration(capacity)
      }),
      meetingShare,
      taskShare: Math.min(100 - meetingShare, share(blocks))
    };
  });

  // ── What the "Add a task" row understood ───────────────────────────────────

  readonly understood = computed(() => {
    const ignored = this.ignored();
    const parsed = parseQuickTask(
      this.draft(),
      this.store.groups().map(group => ({ id: group.id, name: group.name, color: group.color })),
      this.weekdayToday(),
      ignored);

    // A task added in "Today" is for today, and one added in a project belongs to it.
    const dueInDays = parsed.dueInDays ?? (this.list() === 'today' && !ignored.has('due') ? 0 : null);
    const project = parsed.project ?? (!ignored.has('project') && this.project()
      ? { id: this.project()!.id, name: this.project()!.name, color: this.project()!.color }
      : null);

    const dueLabel = parsed.dueLabel ?? (dueInDays === 0 ? t('Today') : null);

    return {
      ...parsed,
      dueInDays,
      dueLabel,
      // "Due tomorrow", "Due friday": the day in small letters, as the design writes the chip.
      dueChip: dueLabel ? t('Due {day}', { day: dueLabel.toLowerCase() }) : '',
      priorityChip: parsed.priority ? priorityPhrase(parsed.priority) : '',
      project,
      estimateLabel: formatEstimate(parsed.estimate)
    };
  });

  ngOnInit(): void {
    this.store.start();

    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.routeId.set(params.get('id')));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(query => this.focusCommentId.set(query.get('comment')));

    const media = window.matchMedia(WIDE_QUERY);
    const onChange = () => this.wide.set(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
  }

  // ── Sections of each list ──────────────────────────────────────────────────

  private buildSections(): {
    key: string; title: string; shortTitle?: string; tone: TaskSection['tone']; tasks: TaskDto[]; folded?: boolean;
  }[] {
    const tasks = this.filtered();
    const dates = this.dates();
    const when = (task: TaskDto) => dates.get(task.id)!;
    const stillOpen = (task: TaskDto) => !isClosed(this.placed(task));

    switch (this.list()) {
      case 'today': {
        const current = tasks.filter(task => when(task).today);
        return [
          { key: 'overdue', title: t('Overdue'), tone: 'late', tasks: current.filter(task => when(task).overdue) },
          { key: 'cal', title: t('On your calendar today'), shortTitle: t('On your calendar'), tone: 'accent',
            tasks: current.filter(task => !when(task).overdue && when(task).startIn === 0) },
          { key: 'any', title: t('Anytime today'), tone: 'text',
            tasks: current.filter(task => !when(task).overdue && when(task).startIn !== 0) },
          { key: 'done', title: t('Done today'), tone: 'muted', folded: true, tasks: tasks.filter(task => !when(task).today) }
        ];
      }

      case 'upcoming': {
        // The first day ahead that the task is tied to: its block, else its deadline.
        const inDays = (task: TaskDto) => {
          const { startIn, dueIn } = when(task);
          return startIn !== null && startIn > 0 ? startIn : dueIn ?? 0;
        };
        return [
          { key: 'tomorrow', title: t('Tomorrow'), tone: 'accent', tasks: tasks.filter(task => inDays(task) === 1) },
          { key: 'week', title: t('Next 7 days'), tone: 'text', tasks: tasks.filter(task => inDays(task) > 1 && inDays(task) <= 7) },
          { key: 'later', title: t('Later'), tone: 'muted', tasks: tasks.filter(task => inDays(task) > 7) }
        ];
      }

      case 'anytime': {
        const byProject = new Map<string, TaskDto[]>();
        for (const task of tasks) {
          const key = task.groupId || '';
          byProject.set(key, [...(byProject.get(key) ?? []), task]);
        }
        return [...byProject.entries()]
          .map(([key, list]) => ({
            key: 'p-' + key,
            title: key ? this.store.groupName(list[0]) || t('Project') : t('No project'),
            tone: 'text' as const,
            tasks: list
          }))
          .sort((a, b) => (a.key === 'p-' ? -1 : b.key === 'p-' ? 1 : a.title.localeCompare(b.title, locale())));
      }

      case 'inbox':
        return [{ key: 'all', title: t('To sort'), tone: 'text', tasks }];

      case 'someday':
        return [{ key: 'all', title: t('On hold'), tone: 'text', tasks }];

      case 'logbook': {
        const done = tasks.filter(task => this.placed(task).status === 'Completed');
        return [
          { key: 'today', title: t('Done today'), tone: 'text', tasks: done.filter(task => this.completedIn(task) === 0) },
          { key: 'week', title: t('Last 7 days'), tone: 'text',
            tasks: done.filter(task => this.completedIn(task) < 0 && this.completedIn(task) >= -7) },
          { key: 'earlier', title: t('Earlier'), tone: 'muted', tasks: done.filter(task => this.completedIn(task) < -7) },
          { key: 'cancelled', title: t('Cancelled'), tone: 'muted', folded: true,
            tasks: tasks.filter(task => task.status === 'Cancelled') }
        ];
      }

      default:
        return [
          { key: 'overdue', title: t('Overdue'), tone: 'late', tasks: tasks.filter(task => when(task).overdue) },
          { key: 'today', title: t('Today'), tone: 'accent', tasks: tasks.filter(task => when(task).today && !when(task).overdue) },
          { key: 'upcoming', title: t('Upcoming'), tone: 'text', tasks: tasks.filter(task => when(task).upcoming) },
          { key: 'anytime', title: t('Anytime'), tone: 'text', tasks: tasks.filter(task => when(task).anytime) },
          { key: 'hold', title: t('On hold'), tone: 'muted', tasks: tasks.filter(task => stillOpen(task) && this.placed(task).status === 'On_hold') },
          { key: 'done', title: t('Done@@status'), tone: 'muted', folded: true, tasks: tasks.filter(task => this.placed(task).status === 'Completed') },
          { key: 'cancelled', title: t('Cancelled'), tone: 'muted', folded: true, tasks: tasks.filter(task => task.status === 'Cancelled') }
        ];
    }
  }

  /** Days from today to the day the task was finished (0 today, negative before); far back when unknown. */
  private completedIn(task: TaskDto): number {
    const completed = task.completedAt ? new Date(task.completedAt) : null;
    if (!completed || Number.isNaN(completed.getTime())) return -9999;
    return dayNumber(completed, this.store.zone()) - dayNumber(this.store.now(), this.store.zone());
  }

  private sort(tasks: TaskDto[], sectionKey: string): TaskDto[] {
    const key = this.sortKey();
    const direction = this.sortAsc() ? 1 : -1;
    const priorityRank = new Map<string, number>(PRIORITIES.map((priority, index) => [priority, index]));
    const statusRank = new Map(STATUSES.map((status, index) => [status.value, index]));
    const finished = (task: TaskDto) => new Date(task.completedAt ?? task.updatedAt ?? task.createdAt).getTime() || 0;

    return [...tasks].sort((a, b) => {
      let result: number;
      switch (key) {
        // Priority and status sort by their real order, not alphabetically.
        case 'priority':
          result = (priorityRank.get(a.priority) ?? -1) - (priorityRank.get(b.priority) ?? -1);
          break;
        case 'status':
          result = (statusRank.get(a.status) ?? -1) - (statusRank.get(b.status) ?? -1);
          break;
        case 'title':
          result = (a.title ?? '').localeCompare(b.title ?? '', locale());
          break;
        case 'dueDate':
          result = timeValue(a.dueDate) - timeValue(b.dueDate);
          break;
        default:
          // Finished work newest first; planned work by its block; the rest by deadline.
          if (isClosed(a) && isClosed(b)) result = finished(b) - finished(a);
          else if (sectionKey === 'cal') result = timeValue(a.startDate) - timeValue(b.startDate);
          else result = Math.min(timeValue(a.dueDate), timeValue(a.startDate)) - Math.min(timeValue(b.dueDate), timeValue(b.startDate));
      }
      return (result || (a.title ?? '').localeCompare(b.title ?? '', locale())) * direction;
    });
  }

  private weekdayToday(): number {
    const today = zonedParts(this.store.now(), this.store.zone());
    return new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  }

  // ── Choosing what to show ──────────────────────────────────────────────────

  choose(list: ListKey): void {
    this.list.set(list);
    this.projectId.set(null);
    this.afterChoice();
  }

  chooseProject(id: string): void {
    this.list.set('project');
    this.projectId.set(id);
    this.afterChoice();
  }

  /** A new list starts with no task chosen, so the panel follows its first row. */
  private afterChoice(): void {
    if (this.view() === 'kanban') this.setView('list');
    if (this.routeId()) void this.router.navigate(['/tasks']);
  }

  openProjects(): void {
    this.ui.toggleProjects(true);
  }

  newProject(): void {
    this.quickAdd.newProject();
  }

  setView(mode: ViewMode): void {
    this.view.set(mode);
    this.displayOpen.set(false);
    try {
      localStorage?.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Private mode or storage disabled: the choice just will not persist.
    }
  }

  private restoreView(): ViewMode {
    try {
      return localStorage?.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'list';
    } catch {
      return 'list';
    }
  }

  toggleFold(key: string): void {
    const open = this.sections().find(section => section.key === key)?.open ?? true;
    this.folds.update(folds => ({ ...folds, [key]: open }));
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortAsc.update(ascending => !ascending);
    else {
      this.sortKey.set(key);
      this.sortAsc.set(true);
    }
  }

  clearFilters(): void {
    this.priorityFilter.set('All');
    this.term.set('');
  }

  /** Shows a task in the panel. The address follows, so the task can be linked to. */
  select(task: TaskDto): void {
    if (task.id === this.routeId()) return;
    void this.router.navigate(['/tasks', task.id], { replaceUrl: !!this.routeId() });
  }

  closeDetail(): void {
    void this.router.navigate(['/tasks']);
  }

  showLogbook(): void {
    this.choose('logbook');
  }

  // ── Creating ───────────────────────────────────────────────────────────────

  openCreate(): void {
    const groupId = this.project()?.id;
    this.dialog
      .open(TaskWindowComponent, {
        width: '600px',
        maxWidth: '95vw',
        disableClose: true,
        panelClass: 'custom-dialog-container',
        autoFocus: false,
        data: groupId ? { groupId } : undefined
      })
      .afterClosed()
      .subscribe((created: TaskDto | undefined) => {
        if (!created) return;
        this.store.reload(true);
        this.store.loadGroups();
        if (created.id && this.wide()) this.select(created);
      });
  }

  /** Reads one of the shorthand's parts as plain words instead. */
  ignore(part: QuickPart): void {
    this.ignored.update(set => new Set(set).add(part));
  }

  addFromRow(): void {
    const parsed = this.understood();
    const title = parsed.title.trim();
    if (!title || this.adding()) return;

    const task: Partial<TaskDto> = {
      title,
      status: 'Pending',
      priority: parsed.priority ?? 'Medium',
      tags: withEstimate('', parsed.estimate)
    };
    if (parsed.project) task.groupId = parsed.project.id;
    if (parsed.dueInDays !== null) task.dueDate = this.endOfDay(parsed.dueInDays).toISOString();
    if (this.list() === 'mine' && this.store.myId) task.assignedToUserId = this.store.myId;

    this.adding.set(true);
    this.store.create(task).subscribe({
      next: created => {
        this.adding.set(false);
        this.draft.set('');
        this.ignored.set(new Set());
        this.store.loadGroups();

        const shown = this.scoped().some(item => item.id === created?.id);
        this.toasts.show(shown ? t('Added “{title}”', { title }) : this.addedElsewhere(title, created), { duration: 3200 });
      },
      error: err => {
        this.adding.set(false);
        this.toasts.show(apiErrorMessage(err, t('That task was not added.')), { tone: 'var(--mq-late)' });
      }
    });
  }

  /** The last minute of a day, which is how a deadline with no time of day is stored. */
  private endOfDay(offsetDays: number): Date {
    const zone = this.store.zone();
    const day = zonedParts(new Date(this.store.dayStart(offsetDays).getTime() + DAY_MS / 2), zone);
    return zonedTimeToUtc(day.year, day.month, day.day, 23, 59, zone);
  }

  /** "Added … to Upcoming": names the list a new task can be found in when it is not the one on screen. */
  private addedElsewhere(title: string, task: TaskDto | null | undefined): string {
    if (!task) return t('Added “{title}” to your tasks', { title });
    const dates = taskDates(task, this.store.zone(), this.store.now());
    const list = dates.today ? t('Today') : dates.upcoming ? t('Upcoming') : task.groupId ? t('Anytime') : t('Inbox');
    return t('Added “{title}” to {list}', { title, list });
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  // ── Keyboard: J K, Space, S, Shift P, N ────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.displayOpen.set(false);
      return;
    }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return;
    // A dialog, a menu or the palette is in front: the keys belong to it.
    if (document.querySelector('.cdk-overlay-pane') || this.store.scheduleRequest()) return;

    const key = shortcutKey(event);

    if (key === 'n' && !event.shiftKey) {
      event.preventDefault();
      if (this.view() === 'list') this.host.nativeElement.querySelector<HTMLInputElement>('.add-input')?.focus();
      else this.openCreate();
      return;
    }

    if (this.view() !== 'list' || !this.wide()) return;

    if (key === 'j' || key === 'k') {
      event.preventDefault();
      this.step(key === 'j' ? 1 : -1);
      return;
    }

    const task = this.store.find(this.selectedId());
    if (!task) return;

    if (key === ' ') {
      // On another control, Space still presses that control.
      if (target?.closest('button, a') && !target.closest('.pick')) return;
      event.preventDefault();
      this.store.toggleDone(task);
    } else if (key === 's' && !event.shiftKey) {
      if (isClosed(task)) return;
      event.preventDefault();
      this.store.askSchedule(task, this.host.nativeElement.querySelector(`[data-task="${task.id}"] .sched`));
    } else if (key === 'p' && event.shiftKey) {
      event.preventDefault();
      this.store.cyclePriority(task);
    }
  }

  private step(by: 1 | -1): void {
    const rows = this.visible();
    if (!rows.length) return;
    const at = rows.findIndex(task => task.id === this.selectedId());
    const next = rows[Math.min(rows.length - 1, Math.max(0, at + by))] ?? rows[0];
    this.select(next);

    requestAnimationFrame(() =>
      this.host.nativeElement.querySelector(`[data-task="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: Event): void {
    if (this.displayOpen() && !(event.target as Element | null)?.closest?.('.display')) this.displayOpen.set(false);
  }
}
