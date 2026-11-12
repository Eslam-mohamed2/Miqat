import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener,
  ViewChild, computed, effect, inject, signal, untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { UiService } from '../../core/services/ui.service';
import { TaskService } from '../../core/services/task.service';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { SEARCH_MIN_LENGTH, SearchService } from '../../core/services/search.service';
import {
  GroupDto, SearchEventDto, SearchProjectDto, SearchResultsDto, TaskDto, UserDto
} from '../../models/api.models';
import { dayKeyInZone } from '../../core/utils/time-zone';

type ResultKind = 'page' | 'task' | 'project' | 'event' | 'person';

/** What one round of searching produced. */
interface ServerAnswer {
  /** The text it was for, so an answer is never shown under a different query. */
  query: string;
  /** null when the search endpoint failed and the local lists are used instead. */
  results: SearchResultsDto | null;
  /** People, from the directory search, for when `results` is null. */
  people: UserDto[];
}

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Router path to open. */
  route: unknown[];
  /** Query string to open it with (an event opens the calendar on its day). */
  queryParams?: Record<string, string>;
  /** Colour dot, for tasks and projects. */
  accent?: string;
}

interface Destination { label: string; hint: string; icon: string; route: string; }

/** Static destinations, so the palette is useful before you have typed anything. */
const PAGES: Destination[] = [
  { label: 'Dashboard',  hint: 'Overview and quick actions', icon: 'dashboard',      route: '/dashboard' },
  { label: 'Tasks',      hint: 'List and kanban',            icon: 'view_kanban',    route: '/tasks' },
  { label: 'Calendar',   hint: 'Month, week and day',        icon: 'calendar_today', route: '/calendar' },
  { label: 'Whiteboard', hint: 'Sketch and plan visually',   icon: 'edit',           route: '/whiteboard' },
  { label: 'Node Flow',  hint: 'Map your tasks as a flow',   icon: 'account_tree',   route: '/node-flow' },
  { label: 'Friends',    hint: 'People and requests',        icon: 'people',         route: '/friends' },
  { label: 'Mentions',   hint: 'Where you were mentioned',   icon: 'alternate_email', route: '/mentions' },
  { label: 'Settings',   hint: 'Profile, theme and account', icon: 'settings',       route: '/settings' }
];

const STATUS_COLOURS: Record<string, string> = {
  Pending: '#f4a835',
  In_progress: '#7c8ef5',
  Completed: '#2ec4a0',
  On_hold: '#9ca3af',
  Cancelled: '#ef4444'
};

/**
 * Command palette behind the topbar's search box.
 *
 * From two characters on the server does the searching (GET /api/Search): tasks
 * and projects the user can see, people and calendar events, in one request.
 * While that answer is on its way - and whenever it fails, or on an API build
 * without the endpoint - the user's own tasks and projects are matched in the
 * browser, so the list is never empty just because a request is slow.
 */
@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobalSearch {
  private router = inject(Router);
  private tasks = inject(TaskService);
  private groups = inject(GroupService);
  private users = inject(UserService);
  private search = inject(SearchService);
  private destroyRef = inject(DestroyRef);
  private ui = inject(UiService);

  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;

  open = signal(false);
  query = signal('');
  activeIndex = signal(0);
  /** True from the first keystroke until the server has answered for that text. */
  searching = signal(false);

  private myTasks = signal<TaskDto[]>([]);
  private myProjects = signal<GroupDto[]>([]);
  private answer = signal<ServerAnswer | null>(null);
  /** Fetched once per opening, not per keystroke. */
  private loadedAt = 0;

  private query$ = new Subject<string>();

  readonly results = computed<SearchResult[]>(() => {
    const q = this.query().trim().toLowerCase();

    if (!q) {
      return PAGES.map(p => ({
        kind: 'page' as const,
        id: p.route,
        title: p.label,
        subtitle: p.hint,
        icon: p.icon,
        route: [p.route]
      }));
    }

    const pages: SearchResult[] = PAGES
      .filter(p => p.label.toLowerCase().includes(q))
      .map(p => ({ kind: 'page', id: p.route, title: p.label, subtitle: p.hint, icon: p.icon, route: [p.route] }));

    // The server's answer, but only when it is the answer to what is typed now.
    const answer = this.answer();
    const current = answer && answer.query === q ? answer : null;
    const found = current?.results ?? null;

    const tasks = (found
      ? found.tasks ?? []
      : this.myTasks().filter(t =>
          (t.title ?? '').toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q) ||
          (t.tags ?? '').toLowerCase().includes(q))
    ).slice(0, 6).map(t => this.taskRow(t));

    const projects = (found
      ? (found.projects ?? []).map(p => this.projectRow(p, this.myProjects().find(g => g.id === p.id)))
      : this.myProjects()
          .filter(g =>
            (g.name ?? '').toLowerCase().includes(q) ||
            (g.description ?? '').toLowerCase().includes(q))
          .map(g => this.projectRow(g, g))
    ).slice(0, 4);

    // Older API builds answer without events; they are simply left out there.
    const events = (found?.events ?? []).slice(0, 5).map(e => this.eventRow(e));

    const people: SearchResult[] = (found ? found.users ?? [] : current?.people ?? [])
      .slice(0, 5)
      .map(u => ({
        kind: 'person',
        id: u.id,
        title: u.fullName,
        subtitle: u.email || u.country || 'Person',
        icon: 'person',
        route: ['/profile', u.id]
      }));

    return [...tasks, ...projects, ...events, ...people, ...pages];
  });

  private taskRow(t: TaskDto): SearchResult {
    return {
      kind: 'task',
      id: t.id,
      title: t.title,
      subtitle: `${t.groupName || 'Personal'} · ${(t.status ?? '').replace(/_/g, ' ')}`,
      icon: 'task_alt',
      route: ['/tasks', t.id],
      accent: STATUS_COLOURS[t.status] ?? '#9ca3af'
    };
  }

  /** `known` is the same project from the user's own list, which carries the counts. */
  private projectRow(p: SearchProjectDto | GroupDto, known?: GroupDto): SearchResult {
    return {
      kind: 'project',
      id: p.id,
      title: p.name,
      subtitle: known
        ? `${known.memberCount} members · ${known.taskCount} tasks`
        : (p.description || 'Project'),
      icon: 'folder_open',
      route: ['/projects', p.id],
      accent: p.color || '#2ec4a0'
    };
  }

  /** An event opens the calendar on its day, with the event itself on show. */
  private eventRow(e: SearchEventDto): SearchResult {
    const zone = this.users.timeZone();
    const start = new Date(e.startsAt);
    const valid = !Number.isNaN(start.getTime());

    const when = !valid ? '' : new Intl.DateTimeFormat(undefined, e.isAllDay
      ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }
      : { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: zone }
    ).format(start);

    const subtitle = [
      when && (e.isAllDay ? `${when} · all day` : when),
      e.location,
      e.isRecurring ? 'repeats' : ''
    ].filter(Boolean).join(' · ');

    return {
      kind: 'event',
      id: e.id,
      title: e.title,
      subtitle: subtitle || 'Event',
      icon: 'event',
      route: ['/calendar'],
      queryParams: valid ? { event: e.id, date: dayKeyInZone(start, zone) } : { event: e.id }
    };
  }

  /** Section headers are rendered by comparing against the previous row. */
  isFirstOfKind(index: number): boolean {
    const list = this.results();
    return index === 0 || list[index - 1].kind !== list[index].kind;
  }

  kindLabel(kind: ResultKind): string {
    switch (kind) {
      case 'task': return 'Tasks';
      case 'project': return 'Projects';
      case 'event': return 'Events';
      case 'person': return 'People';
      default: return 'Go to';
    }
  }

  constructor() {
    // Opened from elsewhere: the phone menu's "Search" row.
    effect(() => {
      if (this.ui.searchRequests() > 0) untracked(() => this.openPalette());
    });

    this.query$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        // switchMap drops the answer to an earlier keystroke when a newer one is out.
        switchMap(q => this.ask(q)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(answer => {
        this.answer.set(answer);
        // A late answer for text that has since changed leaves the spinner on:
        // the search for the current text is still to come.
        if (!answer || answer.query === this.normalised(this.query())) this.searching.set(false);
      });
  }

  private normalised(text: string): string {
    return text.trim().toLowerCase();
  }

  /**
   * One search. When the search endpoint fails (or is missing on an older API),
   * the directory is still asked for people, which is what the palette did before
   * the server could search everything.
   */
  private ask(text: string): Observable<ServerAnswer | null> {
    const query = this.normalised(text);
    if (query.length < SEARCH_MIN_LENGTH) return of(null);

    return this.search.search(text.trim()).pipe(
      map(results => ({ query, results, people: [] } as ServerAnswer)),
      catchError(() => this.users.searchUsers(text.trim()).pipe(
        catchError(() => of([] as UserDto[])),
        map(people => ({ query, results: null, people: people ?? [] } as ServerAnswer))
      ))
    );
  }

  /**
   * Cmd/Ctrl+K from anywhere. The placeholder has always advertised this;
   * nothing was listening for it.
   */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    const isToggle = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (isToggle) {
      event.preventDefault();
      this.open() ? this.close() : this.openPalette();
      return;
    }
    if (event.key === 'Escape' && this.open()) this.close();
  }

  openPalette() {
    this.open.set(true);
    this.activeIndex.set(0);
    this.refreshIndex();
    // The input only exists once the panel is rendered.
    requestAnimationFrame(() => this.inputRef?.nativeElement.focus());
  }

  close() {
    this.open.set(false);
    this.query.set('');
    this.answer.set(null);
    this.searching.set(false);
    this.activeIndex.set(0);
    // So the next opening starts clean even if the same text is typed again.
    this.query$.next('');
  }

  /** Loads the user's own tasks and projects, at most once every 30 seconds. */
  private refreshIndex() {
    if (Date.now() - this.loadedAt < 30_000 && this.myTasks().length) return;
    this.loadedAt = Date.now();

    this.tasks.getTasks().pipe(catchError(() => of([] as TaskDto[])))
      .subscribe(list => this.myTasks.set(list ?? []));
    this.groups.getGroups().pipe(catchError(() => of([] as GroupDto[])))
      .subscribe(list => this.myProjects.set(list ?? []));
  }

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.activeIndex.set(0);
    this.searching.set(this.normalised(value).length >= SEARCH_MIN_LENGTH);
    this.query$.next(value);
  }

  onKeydown(event: KeyboardEvent) {
    const list = this.results();
    if (!list.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() + 1) % list.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() - 1 + list.length) % list.length);
        break;
      case 'Enter': {
        event.preventDefault();
        const chosen = list[this.activeIndex()];
        if (chosen) this.go(chosen);
        break;
      }
    }
  }

  go(result: SearchResult) {
    this.close();
    this.router.navigate(
      result.route as (string | number)[],
      result.queryParams ? { queryParams: result.queryParams } : undefined
    );
  }

  trackByRow = (index: number, row: SearchResult) => `${row.kind}:${row.id}`;
}
