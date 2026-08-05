import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener,
  ViewChild, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

import { TaskService } from '../../core/services/task.service';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { GroupDto, TaskDto, UserDto } from '../../models/api.models';

type ResultKind = 'page' | 'task' | 'project' | 'person';

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Router path to open. */
  route: unknown[];
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
 * Your own tasks and projects are matched locally: the API has no search
 * endpoint for them, and a user's own working set is small enough that
 * filtering in the browser is both simpler and faster than a request per
 * keystroke. People go through /api/User/search, because the directory is not
 * something the client can hold.
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
  private destroyRef = inject(DestroyRef);

  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;

  open = signal(false);
  query = signal('');
  activeIndex = signal(0);
  loadingPeople = signal(false);

  private myTasks = signal<TaskDto[]>([]);
  private myProjects = signal<GroupDto[]>([]);
  private people = signal<UserDto[]>([]);
  /** Fetched once per opening, not per keystroke. */
  private loadedAt = 0;

  private personQuery$ = new Subject<string>();

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

    const tasks: SearchResult[] = this.myTasks()
      .filter(t =>
        (t.title ?? '').toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.tags ?? '').toLowerCase().includes(q))
      .slice(0, 6)
      .map(t => ({
        kind: 'task',
        id: t.id,
        title: t.title,
        subtitle: `${t.groupName || 'Personal'} · ${(t.status ?? '').replace(/_/g, ' ')}`,
        icon: 'task_alt',
        route: ['/tasks', t.id],
        accent: STATUS_COLOURS[t.status] ?? '#9ca3af'
      }));

    const projects: SearchResult[] = this.myProjects()
      .filter(g =>
        (g.name ?? '').toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q))
      .slice(0, 4)
      .map(g => ({
        kind: 'project',
        id: g.id,
        title: g.name,
        subtitle: `${g.memberCount} members · ${g.taskCount} tasks`,
        icon: 'folder_open',
        route: ['/projects', g.id],
        accent: g.color || '#2ec4a0'
      }));

    const people: SearchResult[] = this.people()
      .slice(0, 5)
      .map(u => ({
        kind: 'person',
        id: u.id,
        title: u.fullName,
        subtitle: u.email,
        icon: 'person',
        route: ['/profile', u.id]
      }));

    return [...tasks, ...projects, ...people, ...pages];
  });

  /** Section headers are rendered by comparing against the previous row. */
  isFirstOfKind(index: number): boolean {
    const list = this.results();
    return index === 0 || list[index - 1].kind !== list[index].kind;
  }

  kindLabel(kind: ResultKind): string {
    switch (kind) {
      case 'task': return 'Tasks';
      case 'project': return 'Projects';
      case 'person': return 'People';
      default: return 'Go to';
    }
  }

  constructor() {
    this.personQuery$
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap(q => {
          if (q.trim().length < 2) {
            this.loadingPeople.set(false);
            return of([] as UserDto[]);
          }
          this.loadingPeople.set(true);
          return this.users.searchUsers(q).pipe(catchError(() => of([] as UserDto[])));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(found => {
        this.people.set(found ?? []);
        this.loadingPeople.set(false);
      });
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
    this.people.set([]);
    this.activeIndex.set(0);
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
    this.personQuery$.next(value);
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
    this.router.navigate(result.route as (string | number)[]);
  }

  trackByRow = (index: number, row: SearchResult) => `${row.kind}:${row.id}`;
}
