import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, OnInit,
  afterNextRender, computed, inject, signal, viewChild
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BoardDto, BoardService } from '../../core/services/board.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { CalendarService } from '../../core/services/calendar.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { SEARCH_MIN_LENGTH, SearchService } from '../../core/services/search.service';
import { TaskService } from '../../core/services/task.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { currentNumerals, isRtl, latinDigits, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../core/i18n/t.pipe';
import { allDaySpan, dayKeyInZone, formatTimeInZone, zonedParts } from '../../core/utils/time-zone';
import { UserMenu } from '../../layout/user-menu/user-menu';
import { DayOfWeekName, SearchEventDto, SearchResultsDto, TaskDto } from '../../models/api.models';
import {
  Box, DAY_WIDTH, FlowEdge, FlowNode, FlowNodeType, FlowTone, LAYOUT_COLUMN, LAYOUT_LEFT, LAYOUT_ROW, LAYOUT_TOP,
  MILESTONE_WIDTH, NODE_WIDTH, ROW_HEIGHT, TASK_HEIGHT, TIME_TOP, TIME_X0, TONE_LABEL,
  autoLayout, dayColumn, dayNumber, edgePath, flowBox, initialsOf, isoDay, laneOrder, lengthOf, parseFlow,
  plannedStarts, previewPath, rangeLabel, scheduleOf, serializeFlow, simulateSlip, slipImpact, timeBox,
  timelineRange, toneOf, weekdayOf, wouldLoop
} from './flow.model';

/** One node as the canvas draws it. */
interface NodeCard {
  node: FlowNode;
  box: Box;
  tone: FlowTone;
  kindLabel: string;
  /** Tasks only: "To do", "Late" ... */
  statusLabel: string;
  dates: string;
  initials: string;
  /** On the critical path, and the path is switched on. */
  critical: boolean;
  /** Has no planned dates yet. */
  undated: boolean;
  /** What a timeline bar says: "2d". */
  barLabel: string;
  aria: string;
}

/** A row under "Depends on" or "Unblocks". */
interface DependencyRow {
  edgeId: string;
  id: string;
  title: string;
  tone: FlowTone;
}

type FlowView = 'flow' | 'time';
/** Choosing a node the selected one waits for (`before`) or one that waits for it (`after`). */
type PickMode = 'before' | 'after';

/** What a flow is called until it is given a name: in the language it was started in. */
const DEFAULT_NAME = t('My flow');
/** Pointer travel above which a release is a drag, not a click (a finger wobbles more than a mouse). */
const CLICK_SLOP = 6;
/** Room kept free past the last node, so it can be dragged further out. */
const BOARD_MARGIN = 160;
const NUDGE = 8;
const ARROW_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
};
const DAY_NAMES: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The work week the design assumes (Sunday to Thursday) until the user's own is known. */
const DEFAULT_WORK_DAYS: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
const NEW_TITLE: Record<FlowNodeType, string> = { task: t('New task'), event: t('New event'), milestone: t('New milestone') };
const KIND_LABEL: Record<FlowNodeType, string> = { task: t('Task'), event: t('Event'), milestone: t('Milestone') };
const UNTITLED = t('Untitled');
/**
 * A title inside a right-to-left sentence keeps its own direction and its place in
 * the sentence (Unicode "first strong isolate"): a list of English titles would
 * otherwise read backwards. Left to right nothing is added.
 */
const isolated = (title: string) => (isRtl() ? `\u2068${title}\u2069` : title);

@Component({
  selector: 'app-node-flow-page',
  standalone: true,
  imports: [RouterLink, UserMenu, TPipe, TCountPipe, NumPipe],
  templateUrl: './node-flow-page.html',
  styleUrl: './node-flow-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NodeFlowPage implements OnInit {
  private taskService = inject(TaskService);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private boards = inject(BoardService);
  private users = inject(UserService);
  private searchApi = inject(SearchService);
  private toasts = inject(ToastService);
  private prefs = inject(LocalPrefsService);
  private calendarData = inject(CalendarDataService);
  private calendarApi = inject(CalendarService);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);

  private scrollerRef = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private surfaceRef = viewChild.required<ElementRef<HTMLElement>>('surface');
  private canvasRef = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private addRef = viewChild.required<ElementRef<HTMLElement>>('addWrap');
  private titleRef = viewChild<ElementRef<HTMLTextAreaElement>>('titleBox');

  // ── The board ─────────────────────────────────────────────────────────────
  readonly nodes = signal<FlowNode[]>([]);
  readonly edges = signal<FlowEdge[]>([]);
  readonly loading = signal(true);
  readonly name = signal(DEFAULT_NAME);

  /** Null until the first save creates the row. */
  private boardId: string | null = null;
  /** Opened as `/node-flow/new`: the first save puts the new id in the address. */
  private startedNew = false;
  private changed$ = new Subject<void>();
  /** A change that no request has carried yet. */
  private dirty = false;
  /** The page was left; the debounce is gone with it. */
  private destroyed = false;
  private readonly saving = signal(false);
  private readonly saveFailed = signal(false);
  private readonly savedAt = signal<number | null>(null);
  /** Moves every half minute, so "saved 3 min ago" and the Today line keep up. */
  private readonly now = signal(Date.now());

  // ── What is on screen ─────────────────────────────────────────────────────
  readonly selectedId = signal<string | null>(null);
  readonly view = this.prefs.value<FlowView>('flow.view', 'flow');
  readonly critical = this.prefs.value('flow.critical', true);
  readonly isTime = computed(() => this.view() === 'time');
  /** Days of delay being tried on the selected node. */
  readonly slip = signal(0);
  readonly slipChoices = [0, 1, 2, 3];
  /** A browser's number field only draws 0-9: with Arabic digits the field is a text one, read back through latinDigits. */
  readonly numberField = currentNumerals() === 'arab' ? 'text' : 'number';

  readonly addMenu = signal(false);
  readonly datesOpen = signal(false);
  readonly pick = signal<PickMode | null>(null);
  /** A dependency being dragged out of the selected node's handle. */
  private readonly linking = signal<{ fromId: string; x: number; y: number } | null>(null);
  readonly panning = signal(false);

  private drag: { id: string; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null = null;
  readonly draggingId = signal<string | null>(null);
  /** Whole days a timeline bar has been dragged so far. */
  private readonly dragDays = signal(0);
  /** A node the arrow keys are moving: it steps, it does not glide. */
  readonly nudgedId = signal<string | null>(null);
  private nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  /** The click that ends a drag is not a selection. */
  private justDragged = false;
  private pan: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;

  // ── Linking a node to a real task or event ────────────────────────────────
  readonly linkOpen = signal(false);
  readonly linkQuery = signal('');
  readonly linkBusy = signal(false);
  readonly linkResults = signal<SearchResultsDto | null>(null);
  private linkQuery$ = new Subject<string>();
  /** True once a search has answered for the text in the box. */
  readonly linkSearched = computed(() =>
    !this.linkBusy() && this.linkQuery().trim().length >= SEARCH_MIN_LENGTH && this.linkResults() !== null);

  private readonly workDays = signal<DayOfWeekName[] | null>(null);

  // ── Dates ─────────────────────────────────────────────────────────────────
  private readonly today = computed(() => dayNumber(dayKeyInZone(new Date(this.now()), this.users.timeZone())));
  private readonly thisYear = computed(() => Number(isoDay(this.today()).slice(0, 4)));
  private readonly planned = computed(() => plannedStarts(this.nodes()));
  private readonly schedule = computed(() => scheduleOf(this.nodes(), this.edges(), this.planned()));

  /** The plan with the delay that is being tried. */
  private readonly simulated = computed(() => {
    const selected = this.selectedId();
    const slip = this.slip();
    const planned = this.planned();
    return slip && selected && planned.has(selected)
      ? simulateSlip(this.nodes(), this.edges(), planned, selected, slip)
      : planned;
  });

  /** The dates on screen: the plan, a delay being tried, or a bar being dragged. */
  private readonly shown = computed(() => {
    const starts = this.simulated();
    const dragged = this.draggingId();
    const days = this.dragDays();
    if (!dragged || !days || !starts.has(dragged)) return starts;
    return new Map(starts).set(dragged, starts.get(dragged)! + days);
  });

  // ── Timeline geometry ─────────────────────────────────────────────────────
  private readonly rows = computed(() => new Map(laneOrder(this.nodes()).map((id, row) => [id, row])));
  private readonly range = computed(() => timelineRange(this.nodes(), this.planned(), this.today()));

  private readonly boxes = computed(() => {
    const boxes = new Map<string, Box>();
    if (!this.isTime()) {
      for (const node of this.nodes()) boxes.set(node.id, flowBox(node));
      return boxes;
    }

    const rows = this.rows();
    const range = this.range();
    const shown = this.shown();
    const today = this.today();
    for (const node of this.nodes()) {
      boxes.set(node.id, timeBox(node, shown.get(node.id), rows.get(node.id) ?? 0, range, today));
    }
    return boxes;
  });

  /**
   * The board is as large as its nodes need (never smaller than the visible area:
   * the stylesheet sets min-width / min-height: 100%), and scrolls.
   */
  readonly surfaceWidth = computed(() => this.isTime()
    ? TIME_X0 + this.range().count * DAY_WIDTH + 30
    : Math.max(0, ...this.nodes().map(node => node.x + NODE_WIDTH + BOARD_MARGIN)));

  readonly surfaceHeight = computed(() => this.isTime()
    ? TIME_TOP + this.nodes().length * ROW_HEIGHT + 40
    : Math.max(0, ...this.nodes().map(node => node.y + TASK_HEIGHT + BOARD_MARGIN)));

  readonly cards = computed<NodeCard[]>(() => {
    const today = this.today();
    const year = this.thisYear();
    const planned = this.planned();
    const shown = this.shown();
    const boxes = this.boxes();
    const path = this.schedule().critical;
    const pathOn = this.critical();
    const time = this.isTime();

    return this.nodes().map(node => {
      const start = shown.get(node.id);
      const tone = toneOf(node, planned.get(node.id), today);
      const title = node.title.trim() || UNTITLED;
      const status = TONE_LABEL[tone];
      return {
        node,
        box: boxes.get(node.id)!,
        tone,
        kindLabel: KIND_LABEL[node.type],
        statusLabel: node.type === 'task' ? TONE_LABEL[tone] : '',
        dates: rangeLabel(node, start, year) || t('No dates yet'),
        initials: initialsOf(node.owner),
        critical: pathOn && path.has(node.id),
        undated: start === undefined,
        barLabel: !time ? '' : start === undefined ? t('Set dates') : node.type === 'milestone' ? '' : t('{n}d', { n: lengthOf(node) }),
        aria: path.has(node.id)
          ? t('{title}, {status}, on the critical path', { title, status })
          : t('{title}, {status}', { title, status })
      };
    });
  });

  readonly lines = computed(() => {
    const boxes = this.boxes();
    const path = this.schedule().critical;
    const pathOn = this.critical();
    return this.edges().flatMap(edge => {
      const from = boxes.get(edge.fromId);
      const to = boxes.get(edge.toId);
      if (!from || !to) return [];
      return [{ id: edge.id, ...edgePath(from, to), critical: pathOn && path.has(edge.fromId) && path.has(edge.toId) }];
    });
  });

  readonly dayColumns = computed(() => {
    if (!this.isTime()) return [];
    const { first, count } = this.range();
    const today = this.today();
    const working = new Set((this.workDays() ?? DEFAULT_WORK_DAYS).map(name => DAY_NAMES.indexOf(name)));

    return Array.from({ length: count }, (_, index) => {
      const day = first + index;
      const column = dayColumn(day);
      return {
        day,
        left: TIME_X0 + index * DAY_WIDTH,
        label: column.label,
        month: index === 0 || column.date === 1 ? column.month : '',
        today: day === today,
        off: !working.has(weekdayOf(day))
      };
    });
  });

  readonly lanes = computed(() => {
    if (!this.isTime()) return [];
    const today = this.today();
    const planned = this.planned();
    const rows = this.rows();
    return this.nodes()
      .map(node => ({
        id: node.id,
        top: TIME_TOP + (rows.get(node.id) ?? 0) * ROW_HEIGHT,
        title: node.title.trim() || UNTITLED,
        initials: initialsOf(node.owner),
        tone: toneOf(node, planned.get(node.id), today)
      }))
      .sort((a, b) => a.top - b.top);
  });

  /** Where the Today line stands: today's column plus how far the day has run. Null when off the chart. */
  readonly todayLeft = computed(() => {
    const { first, count } = this.range();
    const column = this.today() - first;
    if (column < 0 || column >= count) return null;
    const clock = zonedParts(new Date(this.now()), this.users.timeZone());
    return TIME_X0 + (column + (clock.hour * 60 + clock.minute) / 1440) * DAY_WIDTH;
  });

  /** The handle on the selected node that a dependency is dragged out of. */
  readonly port = computed(() => {
    const id = this.selectedId();
    if (this.isTime() || !id || this.draggingId()) return null;
    const box = this.boxes().get(id);
    return box ? { left: box.x + box.w, top: box.y + box.h / 2 } : null;
  });

  readonly linkPreview = computed(() => {
    const linking = this.linking();
    const from = linking && this.boxes().get(linking.fromId);
    return linking && from ? previewPath(from, linking.x, linking.y) : null;
  });

  // ── Header ────────────────────────────────────────────────────────────────
  readonly countLabel = computed(() => {
    if (this.loading()) return t('loading…');
    const count = this.nodes().length;
    return count ? tCount(count, '{n} node', '{n} nodes') : t('no nodes');
  });

  readonly saveLabel = computed(() => {
    if (this.saving()) return t('saving…');
    if (this.saveFailed()) return t('could not save');
    const at = this.savedAt();
    if (at === null) return t('not saved yet');

    const minutes = Math.floor((this.now() - at) / 60_000);
    if (minutes < 1) return t('saved just now');
    if (minutes < 60) return tCount(minutes, 'saved {n} min ago', 'saved {n} min ago');
    return t('saved at {time}', {
      time: formatTimeInZone(new Date(at), this.users.timeZone(), this.calendarData.use24HourClock())
    });
  });

  // ── The inspector ─────────────────────────────────────────────────────────
  readonly sel = computed(() => {
    const id = this.selectedId();
    const nodes = this.nodes();
    const node = nodes.find(candidate => candidate.id === id);
    if (!node) return null;

    const today = this.today();
    const planned = this.planned();
    const schedule = this.schedule();
    const byId = new Map(nodes.map(candidate => [candidate.id, candidate]));
    const tone = toneOf(node, planned.get(node.id), today);
    const onPath = schedule.critical.has(node.id);
    const slack = schedule.slack.get(node.id);

    const row = (edge: FlowEdge, otherId: string): DependencyRow => {
      const other = byId.get(otherId)!;
      return { edgeId: edge.id, id: otherId, title: other.title.trim() || UNTITLED, tone: toneOf(other, planned.get(otherId), today) };
    };

    return {
      node,
      tone,
      statusLabel: TONE_LABEL[tone],
      kindLine: node.type === 'task'
        ? (node.project ? `${t('Task')} · ${node.project}` : t('Task'))
        : node.type === 'event' ? t('Calendar event') : t('Milestone'),
      onPath,
      pathLabel: onPath
        ? t('On the critical path')
        : slack === undefined ? t('No dates yet') : tCount(slack, 'Slack: {n} day', 'Slack: {n} days'),
      owner: node.owner || '—',
      project: node.project || t('No project'),
      dates: rangeLabel(node, this.shown().get(node.id), this.thisYear()) || t('No dates yet'),
      dated: planned.has(node.id),
      days: lengthOf(node),
      before: this.edges().filter(edge => edge.toId === node.id).map(edge => row(edge, edge.fromId)),
      after: this.edges().filter(edge => edge.fromId === node.id).map(edge => row(edge, edge.toId)),
      linked: !!(node.taskId || node.eventId),
      /** Its status belongs to the board, so it can be changed here. */
      ownStatus: node.type === 'task' && !node.taskId
    };
  });

  /** The selected node as a list of one, so the template rebuilds the panel when it changes. */
  readonly selection = computed(() => {
    const selected = this.sel();
    return selected ? [selected] : [];
  });

  readonly impact = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    const impact = slipImpact(
      this.nodes(), this.edges(), this.planned(), this.simulated(), id, this.slip(), this.thisYear());
    const count = impact.others.length;
    return {
      ...impact,
      movedLine: count
        ? tCount(count, '{n} more item moves: {titles}', '{n} more items move: {titles}', {
            titles: impact.others.map(node => isolated(node.title.trim() || UNTITLED)).join(t(', '))
          })
        : ''
    };
  });

  constructor() {
    // 1.2s after the last change: a drag is one request, and closing the tab rarely loses anything.
    this.changed$
      .pipe(debounceTime(1200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.persist());

    this.linkQuery$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap(() => this.linkBusy.set(true)),
        switchMap(query => query.length < SEARCH_MIN_LENGTH
          ? of(null)
          : this.searchApi.search(query, 5).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef))
      .subscribe(results => {
        this.linkResults.set(results);
        this.linkBusy.set(false);
      });

    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      clearTimeout(this.nudgeTimer);
      this.destroyed = true;
      // Leaving within the debounce would drop the last change.
      if (this.dirty) this.persist();
    });
  }

  ngOnInit() {
    // New nodes are owned by whoever makes them.
    if (!this.users.currentUser()) this.users.getMe().subscribe({ error: () => {} });

    // Shades the days off in the timeline; the calendar may not have been opened yet.
    const settings = this.calendarData.settings();
    if (settings) {
      this.workDays.set(settings.workDays);
    } else {
      this.calendarApi.getSettings().subscribe({
        next: loaded => this.workDays.set(loaded?.workDays?.length ? loaded.workDays : null),
        error: () => {}
      });
    }

    // The literal `/new` route carries no `:id` param, so the URL segment is the signal.
    const segments = this.route.snapshot.url.map(s => s.path);
    const last = segments[segments.length - 1];
    const id = last === 'new' ? 'new'
             : (last && last !== 'node-flow' ? last : null);

    // A saved diagram wins over the generated layout: the whole point of saving
    // is that your arrangement survives. Only fall back to laying tasks out when
    // there is nothing stored — or when /new was asked for explicitly.
    if (id === 'new') {
      this.startedNew = true;
      this.seedFromTasks();
      return;
    }

    const load = id ? this.boards.getById(id) : this.boards.latest('NodeFlow');
    load.subscribe(board => {
      if (!board) { this.seedFromTasks(); return; }
      this.boardId = board.id;
      if (board.name?.trim()) this.name.set(board.name.trim());
      this.savedAt.set(savedTime(board));

      try {
        const saved = parseFlow(board.content);
        if (!saved.nodes.length) { this.seedFromTasks(); return; }
        this.nodes.set(saved.nodes);
        this.edges.set(saved.edges);
        this.loading.set(false);
        this.selectFirst();
        this.refreshFromTasks(saved.legacy);
      } catch {
        this.seedFromTasks();
      }
    });
  }

  // ── Loading and saving ────────────────────────────────────────────────────

  /** First run: lay the user's tasks out as a starting diagram. */
  private seedFromTasks() {
    this.taskService.getTasks().subscribe({
      next: tasks => {
        this.nodes.set(this.layoutTasks(tasks ?? []));
        this.loading.set(false);
        this.selectFirst();
      },
      error: () => {
        this.nodes.set([]);
        this.loading.set(false);
      }
    });
  }

  /**
   * Lays the tasks out in columns by status, so the flow reads left-to-right
   * from pending through to done before anyone rearranges it.
   */
  private layoutTasks(tasks: TaskDto[]): FlowNode[] {
    const columns = ['Pending', 'In_progress', 'Completed', 'On_hold', 'Cancelled'];
    // Keyed by the resolved column, not by the status string, so an unrecognised
    // status shares the first column's row counter instead of stacking on its first node.
    const perColumn = new Map<number, number>();

    return tasks.slice(0, 40).map(task => {
      const column = Math.max(0, columns.indexOf(task.status));
      const row = perColumn.get(column) ?? 0;
      perColumn.set(column, row + 1);

      return {
        id: task.id,
        taskId: task.id,
        x: LAYOUT_LEFT + column * LAYOUT_COLUMN,
        y: LAYOUT_TOP + row * LAYOUT_ROW,
        type: 'task' as const,
        ...this.factsOfTask(task),
        ...this.datesOfTask(task)
      };
    });
  }

  /**
   * Brings linked nodes up to date with their real tasks: title, status, owner and
   * project. The dates stay the flow's own, except on a board saved before nodes
   * had dates, which takes them from the tasks once.
   */
  private refreshFromTasks(fillDates: boolean) {
    if (!this.nodes().some(node => node.taskId)) return;
    this.taskService.getTasks().subscribe({
      next: tasks => {
        const byId = new Map((tasks ?? []).map(task => [task.id, task]));
        this.nodes.update(list => list.map(node => {
          const task = node.taskId ? byId.get(node.taskId) : undefined;
          if (!task) return node;
          return {
            ...node,
            ...this.factsOfTask(task),
            ...(fillDates && !node.start ? this.datesOfTask(task) : {})
          };
        }));
      },
      error: () => {}
    });
  }

  private factsOfTask(task: TaskDto): Pick<FlowNode, 'title' | 'status' | 'owner' | 'project'> {
    return {
      title: task.title,
      status: task.status,
      owner: task.assignedToUserName || task.ownerName || undefined,
      project: task.groupName || undefined
    };
  }

  /** A task's start (or due) day to its due day, in the profile's time zone. */
  private datesOfTask(task: TaskDto): Pick<FlowNode, 'start' | 'days'> {
    const due = this.dayOf(task.dueDate);
    const first = this.dayOf(task.startDate) ?? due;
    if (!first) return {};
    const span = due ? dayNumber(due) - dayNumber(first) + 1 : 1;
    return { start: first, days: Math.max(1, span) };
  }

  private dayOf(instant: string | null | undefined): string | undefined {
    if (!instant) return undefined;
    const date = new Date(instant);
    // The API writes "no date" as year 1.
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1971) return undefined;
    return dayKeyInZone(date, this.users.timeZone());
  }

  private touch() {
    this.dirty = true;
    this.changed$.next();
  }

  private persist() {
    // One request at a time: a second create before the first answers would make two boards.
    if (this.saving()) return;
    this.dirty = false;

    const content = serializeFlow({ nodes: this.nodes(), edges: this.edges() });
    const name = this.name().trim() || DEFAULT_NAME;
    this.saving.set(true);

    const request = this.boardId
      ? this.boards.update(this.boardId, 'NodeFlow', content, name)
      : this.boards.create('NodeFlow', content, name);

    request.subscribe({
      next: board => {
        const created = !this.boardId && !!board?.id;
        this.boardId = board?.id ?? this.boardId;
        this.saving.set(false);
        this.saveFailed.set(false);
        this.savedAt.set(Date.now());
        // So a reload opens this board instead of starting another new one.
        if (created && this.startedNew) this.location.replaceState(`/node-flow/${this.boardId}`);
        // What changed while the request was out; after leaving the page nothing else would send it.
        if (this.dirty) this.destroyed ? this.persist() : this.changed$.next();
      },
      error: () => {
        this.saving.set(false);
        this.saveFailed.set(true);
      }
    });
  }

  rename(value: string) {
    this.name.set(value);
    this.touch();
  }

  /** An emptied name goes back to the default rather than saving a blank. */
  commitName() {
    if (!this.name().trim()) this.rename(DEFAULT_NAME);
  }

  // ── Header controls ───────────────────────────────────────────────────────

  setView(view: FlowView) {
    this.view.set(view);
    this.linking.set(null);
    this.alignTimeline();
  }

  /** On a narrow canvas the lane names are a narrow strip: the first day starts right beside it. */
  private alignTimeline() {
    if (!this.isTime()) return;
    afterNextRender(() => {
      const scroller = this.scrollerRef().nativeElement;
      const lanes = scroller.querySelector<HTMLElement>('.lanes');
      if (lanes && lanes.offsetWidth < TIME_X0 - 20) scroller.scrollLeft = TIME_X0 - lanes.offsetWidth - 4;
    }, { injector: this.injector });
  }

  runAutoLayout() {
    const placed = autoLayout(this.nodes(), this.edges());
    const before = new Map(this.nodes().map(node => [node.id, { x: node.x, y: node.y }]));
    const move = (to: Map<string, { x: number; y: number }>) => {
      this.nodes.update(list => list.map(node => (to.has(node.id) ? { ...node, ...to.get(node.id)! } : node)));
      this.touch();
    };

    move(placed);
    this.scrollerRef().nativeElement.scrollTo({ left: 0, top: 0 });
    this.toasts.show(t('Nodes laid out by dependency.'), { undo: () => move(before) });
  }

  addNode(type: FlowNodeType) {
    this.addMenu.set(false);
    const node: FlowNode = { id: `n_${Date.now()}`, ...this.freeSpot(type), title: NEW_TITLE[type], type };
    if (type === 'task') node.status = 'Pending';
    const me = this.users.currentUser();
    if (me?.fullName) node.owner = me.fullName;

    this.nodes.update(list => [...list, node]);
    this.touch();
    this.select(node.id);
    this.focusTitle();
  }

  /** The middle of the visible canvas, stepped aside while another node sits exactly there. */
  private freeSpot(type: FlowNodeType): { x: number; y: number } {
    const nodes = this.nodes();
    if (this.isTime()) {
      // The timeline does not show flow positions: below everything else, at the left.
      return { x: LAYOUT_LEFT, y: Math.max(LAYOUT_TOP, ...nodes.map(node => node.y + LAYOUT_ROW)) };
    }

    const scroller = this.scrollerRef().nativeElement;
    const width = type === 'milestone' ? MILESTONE_WIDTH : NODE_WIDTH;
    let x = Math.max(0, Math.round(scroller.scrollLeft + scroller.clientWidth / 2 - width / 2));
    let y = Math.max(0, Math.round(scroller.scrollTop + scroller.clientHeight / 2 - TASK_HEIGHT / 2));
    while (nodes.some(node => Math.abs(node.x - x) < 12 && Math.abs(node.y - y) < 12)) {
      x += 24;
      y += 24;
    }
    return { x, y };
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  select(id: string | null) {
    if (id !== this.selectedId()) {
      this.slip.set(0);
      this.datesOpen.set(false);
      this.closeLink();
    }
    this.selectedId.set(id);
  }

  /** Opens with something in the inspector: the start of the critical path, or the first node. */
  private selectFirst() {
    const path = this.schedule().critical;
    const nodes = this.nodes();
    this.select((nodes.find(node => path.has(node.id)) ?? nodes[0])?.id ?? null);
    this.alignTimeline();
  }

  focusTitle() {
    afterNextRender(() => {
      const box = this.titleRef()?.nativeElement;
      if (!box || box.readOnly) return;
      box.focus();
      box.select();
    }, { injector: this.injector });
  }

  // ── Pointer: nodes ────────────────────────────────────────────────────────
  // Pointer events, not mouse events: one code path for mouse, pen and finger.

  /**
   * Viewport coordinates → coordinates inside the board. Measured against the
   * scrolling surface, so the result is right wherever the board is scrolled to.
   */
  private toBoard(event: PointerEvent): { x: number; y: number } {
    const rect = this.surfaceRef().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onNodeDown(event: PointerEvent, card: NodeCard) {
    this.justDragged = false;
    // Primary button / first finger only; while a node is being chosen a press is just a choice.
    if (event.button > 0 || !event.isPrimary || this.pick()) return;

    const point = this.toBoard(event);
    this.drag = {
      id: card.node.id,
      offsetX: point.x - card.box.x,
      offsetY: point.y - card.box.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    // Without capture a fast drag leaves the node behind and never ends on it.
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onNodeMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;

    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.startX) <= CLICK_SLOP &&
          Math.abs(event.clientY - drag.startY) <= CLICK_SLOP) return;
      drag.moved = true;
      this.slip.set(0);
      this.draggingId.set(drag.id);
    }

    // In the timeline a bar only moves along its row, a whole day at a time.
    if (this.isTime()) {
      this.dragDays.set(Math.round((event.clientX - drag.startX) / DAY_WIDTH));
      return;
    }

    // Never above or left of the board's origin: a node there could not be
    // scrolled back into view.
    const point = this.toBoard(event);
    const x = Math.max(0, Math.round(point.x - drag.offsetX));
    const y = Math.max(0, Math.round(point.y - drag.offsetY));
    this.nodes.update(list => list.map(node => (node.id === drag.id ? { ...node, x, y } : node)));
  }

  onNodeUp(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;

    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    if (!drag.moved) return;

    this.justDragged = true;
    const days = this.dragDays();
    this.dragDays.set(0);
    this.draggingId.set(null);

    if (this.isTime()) {
      const start = this.planned().get(drag.id);
      if (!days || start === undefined) return;
      this.patch(drag.id, { start: isoDay(start + days) });
      return;
    }
    this.touch();
  }

  onNodeClick(node: FlowNode) {
    // Moving a node never selects something else or completes a choice.
    if (this.justDragged) { this.justDragged = false; return; }

    const mode = this.pick();
    const selected = this.selectedId();
    if (mode && selected) {
      this.pick.set(null);
      if (node.id !== selected) this.connect(mode === 'before' ? node.id : selected, mode === 'before' ? selected : node.id);
      return;
    }
    this.select(node.id);
  }

  // ── Pointer: the empty canvas ─────────────────────────────────────────────

  /** A mouse drags the board around; a finger already scrolls it natively. */
  onCanvasDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target as HTMLElement;
    // Not on a node, and not on the scrollbars (those report the scroller itself).
    if (target.closest('.node, .port') || !this.surfaceRef().nativeElement.contains(target)) return;

    const scroller = this.scrollerRef().nativeElement;
    this.pan = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, moved: false };
    scroller.setPointerCapture(event.pointerId);
  }

  onCanvasMove(event: PointerEvent) {
    const pan = this.pan;
    if (!pan) return;
    if (!pan.moved) {
      if (Math.abs(event.clientX - pan.x) <= CLICK_SLOP && Math.abs(event.clientY - pan.y) <= CLICK_SLOP) return;
      pan.moved = true;
      this.panning.set(true);
    }
    const scroller = this.scrollerRef().nativeElement;
    scroller.scrollLeft = pan.left - (event.clientX - pan.x);
    scroller.scrollTop = pan.top - (event.clientY - pan.y);
  }

  onCanvasUp(event: PointerEvent) {
    const pan = this.pan;
    if (!pan) return;
    this.pan = null;
    this.panning.set(false);
    this.justDragged = pan.moved;
    const scroller = this.scrollerRef().nativeElement;
    if (scroller.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
  }

  /** A click on nothing gives up a pending choice, otherwise clears the selection. */
  onCanvasClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('.node, .port')) return;
    if (this.justDragged) { this.justDragged = false; return; }
    if (this.pick()) { this.pick.set(null); return; }
    this.select(null);
  }

  // ── Dependencies ──────────────────────────────────────────────────────────

  onPortDown(event: PointerEvent) {
    const id = this.selectedId();
    if (!id || event.button > 0 || !event.isPrimary) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.linking.set({ fromId: id, ...this.toBoard(event) });
  }

  onPortMove(event: PointerEvent) {
    const linking = this.linking();
    if (linking) this.linking.set({ fromId: linking.fromId, ...this.toBoard(event) });
  }

  onPortUp(event: PointerEvent) {
    const linking = this.linking();
    if (!linking) return;
    this.linking.set(null);

    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);

    // The handle holds the pointer, so the node underneath is looked up by position.
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node]');
    const toId = under?.getAttribute('data-node');
    if (toId) this.connect(linking.fromId, toId);
  }

  togglePick(mode: PickMode) {
    this.pick.update(current => (current === mode ? null : mode));
  }

  /** `toId` now waits for `fromId`. A pair that is already linked, or a loop, is refused. */
  private connect(fromId: string, toId: string) {
    if (fromId === toId) return;
    const edges = this.edges();
    if (edges.some(edge => edge.fromId === fromId && edge.toId === toId)) return;

    if (wouldLoop(edges, fromId, toId)) {
      this.toasts.show(t('That would make a loop: these two already depend on each other the other way round.'),
        { tone: 'var(--mq-late)' });
      return;
    }

    this.edges.update(list => [...list, { id: `e_${Date.now()}`, fromId, toId }]);
    this.slip.set(0);
    this.touch();
  }

  removeEdge(edgeId: string) {
    this.edges.update(list => list.filter(edge => edge.id !== edgeId));
    this.slip.set(0);
    this.touch();
  }

  // ── Editing the selected node ─────────────────────────────────────────────

  private patch(id: string, changes: Partial<FlowNode>) {
    this.nodes.update(list => list.map(node => (node.id === id ? { ...node, ...changes } : node)));
    this.touch();
  }

  retitle(value: string) {
    const id = this.selectedId();
    if (id) this.patch(id, { title: value.replace(/\s*\n\s*/g, ' ') });
  }

  /** To do → In progress → Done; a late task goes straight to Done. */
  cycleStatus() {
    const selected = this.sel();
    if (!selected?.ownStatus) return;
    const status = selected.node.status;
    const next = selected.tone === 'late' || status === 'In_progress' ? 'Completed'
               : status === 'Completed' || status === 'On_hold' || status === 'Cancelled' ? 'Pending'
               : 'In_progress';
    this.patch(selected.node.id, { status: next });
  }

  setStart(value: string) {
    const id = this.selectedId();
    if (!id) return;
    this.slip.set(0);
    this.patch(id, { start: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined });
  }

  setDays(value: string) {
    const id = this.selectedId();
    const days = Math.round(Number(latinDigits(value)));
    if (!id || !Number.isFinite(days)) return;
    this.slip.set(0);
    this.patch(id, { days: Math.min(365, Math.max(1, days)) });
  }

  setTime(value: string) {
    const id = this.selectedId();
    if (id) this.patch(id, { time: /^\d{2}:\d{2}$/.test(value) ? value : undefined });
  }

  deleteSelected() {
    const id = this.selectedId();
    const index = this.nodes().findIndex(node => node.id === id);
    if (index < 0) return;

    const node = this.nodes()[index];
    const cut = this.edges().filter(edge => edge.fromId === id || edge.toId === id);
    this.nodes.update(list => list.filter(other => other.id !== id));
    this.edges.update(list => list.filter(edge => !cut.includes(edge)));
    this.pick.set(null);
    this.select(null);
    this.touch();

    this.toasts.show(t('“{title}” removed from the flow.', { title: node.title.trim() || UNTITLED }), {
      undo: () => {
        this.nodes.update(list => [...list.slice(0, index), node, ...list.slice(index)]);
        this.edges.update(list => [...list, ...cut]);
        this.touch();
        this.select(node.id);
      }
    });
  }

  // ── What if this slips ────────────────────────────────────────────────────

  /** Makes the delay that is being tried the plan. */
  keepDates() {
    const planned = this.planned();
    const next = this.simulated();
    const moved = [...next].filter(([id, start]) => planned.get(id) !== start);
    if (!moved.length) return;

    const write = (starts: Map<string, number>) => {
      this.nodes.update(list => list.map(node =>
        moved.some(([id]) => id === node.id) ? { ...node, start: isoDay(starts.get(node.id)!) } : node));
      this.touch();
    };

    write(next);
    this.slip.set(0);
    this.toasts.show(
      tCount(moved.length, 'New dates kept for {n} node.', 'New dates kept for {n} nodes.'),
      { undo: () => write(planned) });
  }

  // ── Linking to a real task or event ───────────────────────────────────────

  openLink() {
    this.linkOpen.set(true);
    this.linkQuery.set('');
    this.linkResults.set(null);
  }

  closeLink() {
    this.linkOpen.set(false);
    this.linkBusy.set(false);
    this.linkQuery$.next('');
  }

  searchLink(value: string) {
    this.linkQuery.set(value);
    this.linkQuery$.next(value.trim());
  }

  linkTask(task: TaskDto) {
    const id = this.selectedId();
    if (!id) return;
    this.closeLink();
    this.patch(id, { type: 'task', taskId: task.id, eventId: undefined, time: undefined, ...this.factsOfTask(task), ...this.datesOfTask(task) });
  }

  linkEvent(event: SearchEventDto) {
    const id = this.selectedId();
    if (!id) return;
    this.closeLink();

    const zone = this.users.timeZone();
    // An all-day event keeps the dates it was given, whatever zone it is seen from.
    const given = event.isAllDay ? allDaySpan(new Date(event.startsAt), new Date(event.endsAt), zone) : null;
    const givenStart = given ? Date.UTC(given.year, given.month - 1, given.day, 12) : 0;
    const first = given ? dayKeyInZone(new Date(givenStart), 'UTC') : this.dayOf(event.startsAt);
    const last = given
      ? dayKeyInZone(new Date(givenStart + (given.days - 1) * 86_400_000), 'UTC')
      : this.dayOf(event.endsAt) ?? first;
    const clock = zonedParts(new Date(event.startsAt), zone);
    this.patch(id, {
      type: 'event',
      eventId: event.id,
      taskId: undefined,
      status: undefined,
      project: undefined,
      title: event.title,
      start: first,
      days: first && last ? Math.max(1, dayNumber(last) - dayNumber(first) + 1) : 1,
      time: event.isAllDay || !first
        ? undefined
        : `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`
    });
  }

  /** The node stays as it is; only the tie to the real item goes. */
  unlink() {
    const id = this.selectedId();
    if (id) this.patch(id, { taskId: undefined, eventId: undefined });
  }

  eventWhen(event: SearchEventDto): string {
    const first = this.dayOf(event.startsAt);
    return first ? rangeLabel({ id: '', x: 0, y: 0, title: '', type: 'event' }, dayNumber(first), this.thisYear()) : '';
  }

  // ── Keyboard and outside clicks ───────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      this.addMenu.set(false);
      this.pick.set(null);
      this.linking.set(null);
      return;
    }

    const target = event.target;
    if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable]')) return;
    // Only with the canvas in hand: the same keys mean other things in the header and the panel.
    const onCanvas = this.canvasRef().nativeElement.contains(target);
    if (!onCanvas && target !== document.body) return;

    const id = this.selectedId();
    const node = this.nodes().find(candidate => candidate.id === id);
    if (!node) return;

    if (event.key === 'Delete' || (event.key === 'Backspace' && onCanvas)) {
      event.preventDefault();
      this.deleteSelected();
      return;
    }

    const step = ARROW_STEPS[event.key];
    if (!step) return;
    event.preventDefault();

    if (this.isTime()) {
      const start = this.planned().get(node.id);
      if (step[0] && start !== undefined) this.patch(node.id, { start: isoDay(start + step[0]) });
      return;
    }
    this.nudgedId.set(node.id);
    clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => this.nudgedId.set(null), 120);
    this.patch(node.id, { x: Math.max(0, node.x + step[0] * NUDGE), y: Math.max(0, node.y + step[1] * NUDGE) });
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: Event) {
    if (this.addMenu() && !this.addRef().nativeElement.contains(event.target as Node)) this.addMenu.set(false);
  }
}

/** When the server last stored the board. It writes UTC, sometimes without the "Z". */
function savedTime(board: BoardDto): number | null {
  const stamp = board.updatedAt ?? board.createdAt;
  if (!stamp) return null;
  const time = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(stamp) ? stamp : `${stamp}Z`);
  return Number.isNaN(time) ? null : time;
}
