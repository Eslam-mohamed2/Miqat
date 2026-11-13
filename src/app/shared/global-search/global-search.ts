import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed,
  effect, inject, signal, untracked, viewChild
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { UiService } from '../../core/services/ui.service';
import { TaskService } from '../../core/services/task.service';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { EventService } from '../../core/services/event.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { CalendarService } from '../../core/services/calendar.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { ToastService } from '../../core/services/toast.service';
import { SEARCH_MIN_LENGTH, SearchService } from '../../core/services/search.service';
import {
  CalendarItemDto, ContactDto, GroupDto, SaveEventDto, SearchEventDto, SearchProjectDto, SearchResultsDto,
  TaskDto, TimeSlotDto, UserAvailabilityDto, UserDto
} from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import {
  allDaySpan, cellOfInstant, dateInputInZone, dayKeyInZone, formatTimeInZone, isValidTimeZone, timeInputInZone,
  timeZoneCity, zonedParts, zonedTimeToUtc
} from '../../core/utils/time-zone';
import { hijriFullLabel } from '../../core/utils/hijri';
import { PrayerTime, placeForZone, prayerLabel, prayerTimes } from '../../core/utils/prayer-times';
import { formatDuration, formatEstimate, withEstimate } from '../../core/utils/task-estimate';
import {
  ClockTime, DayRef, ParsedSentence, PieceKind, addDays, daysBetween, isRightToLeft, parseSentence, sameDay,
  todayIn, weekdayOf
} from '../../core/utils/quick-parse';
import { blockedStretches, nearestStart } from '../../core/utils/day-plan';
import { currentLanguage, isArabic, locale, num, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';
import { EventEditor, EventEditorData } from '../../features/calendar/components/event-editor/event-editor';
import { TaskWindowComponent } from '../../features/dashboard/task-window/task-window';

type Mode = 'idle' | 'search' | 'create' | 'goto';
type Kind = 'event' | 'task';
type RowIcon = 'task' | 'project' | 'event' | 'person' | 'calendar' | 'board' | 'flow' | 'people' | 'inbox' | 'settings' | 'plan';

/** What one round of searching produced. */
interface ServerAnswer {
  /** The text it was for, so an answer is never shown under a different query. */
  query: string;
  /** null when the search endpoint failed and the local lists are used instead. */
  results: SearchResultsDto | null;
  /** People, from the directory search, for when `results` is null. */
  people: UserDto[];
}

/** One line of the list under the sentence: a search result, a command or a page. */
interface Row {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  /** A letter in the square in front of a command ("T"). */
  glyph?: string;
  icon?: RowIcon;
  /** Colour of the square, for tasks and projects. */
  tone?: string;
  /** The shortcut shown at the end of the line. */
  key?: string;
  keyTitle?: string;
  run: () => void;
}

/** One word or understood part as it is drawn, with the caret and the selection inside it. */
interface ShownPiece {
  kind: PieceKind;
  part?: string;
  start: number;
  pre: string;
  sel: string;
  post: string;
  caretIn: boolean;
  caretBefore: boolean;
}

/** One card of the preview: "WHEN / Sun 15 Nov · 15:00 – 15:45 / 3 Jumada II 1448". */
interface Fact {
  /** Which card it is; never shown. */
  key: string;
  /** The word on the card, in the interface language. */
  label: string;
  tone: 'when' | 'who' | 'len' | 'rep' | 'proj' | 'where';
  value: string;
  note: string;
}

interface NotePart { text: string; strong?: boolean; }

/** What the full editor is opened with (Tab). */
export interface QuickDraft {
  title: string;
  start: Date | null;
  end: Date | null;
  due: Date | null;
  guests: { id: string; name: string }[];
  location: string | null;
  calendarId: string | null;
  groupId: string | null;
  recurrence: string;
  priority: string | null;
  estimateMinutes: number | null;
}

/** The parts of the two editors that are filled in when one is opened from a sentence. */
interface EditorInsides {
  form?: { patchValue(value: Record<string, unknown>): void };
  taskForm?: { patchValue(value: Record<string, unknown>): void };
  guests?: { set(value: { id: string; name: string }[]): void };
  endChanged?: () => void;
}

/** `name` is the English name: a page is found by it in either language. */
interface Destination { name: string; label: string; hint: string; icon: RowIcon; route: string; }

const page = (name: string, hint: string, icon: RowIcon, route: string): Destination =>
  ({ name, label: t(name), hint: t(hint), icon, route });

/** Every section, so the dialog is useful before anything is typed. */
const PAGES: Destination[] = [
  page('Calendar',    'Week, month and day',         'calendar', '/calendar'),
  page('Plan my day', 'Place today’s tasks',         'plan',     '/dashboard'),
  page('Tasks',       'List and board',              'task',     '/tasks'),
  page('Whiteboard',  'Sketch and plan visually',    'board',    '/whiteboard'),
  page('Node Flow',   'Map your tasks as a flow',    'flow',     '/node-flow'),
  page('People',      'Friends and requests',        'people',   '/friends'),
  page('Inbox',       'Mentions, invites, updates',  'inbox',    '/inbox'),
  page('Settings',    'Profile, theme and account',  'settings', '/settings')
];

/** The names the API uses for the days of the week (working days). Never shown: see `weekdayName`. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The name of a weekday (0 = Sunday) in a language: "Friday", "الجمعة". */
function weekdayNameIn(weekday: number, language: string): string {
  // 1 January 2023 was a Sunday.
  return new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + weekday)));
}

/** A weekday's name in the interface language. */
const weekdayName = (weekday: number): string => weekdayNameIn(weekday, locale());

/** The word shown for a task's priority, as part of "High priority". */
const PRIORITY_LINES: Record<string, string> = {
  Low: 'Low priority', Medium: 'Medium priority', High: 'High priority', Critical: 'Critical priority'
};

/** Marks around the part of a sentence that is drawn bold. */
const STRONG_OPEN = '\u0001';
const STRONG_CLOSE = '\u0002';
const strong = (text: string): string => `${STRONG_OPEN}${text}${STRONG_CLOSE}`;

/** A translated sentence with one part marked by `strong()`, as the pieces the note draws. */
function sentenceParts(sentence: string): NotePart[] {
  const open = sentence.indexOf(STRONG_OPEN);
  const close = sentence.indexOf(STRONG_CLOSE);
  // The space after the sentence keeps it apart from the next one.
  if (open < 0 || close < open) return [{ text: `${sentence} ` }];
  return [
    { text: sentence.slice(0, open) },
    { text: sentence.slice(open + 1, close), strong: true },
    { text: `${sentence.slice(close + 1)} ` }
  ].filter(part => part.text);
}
const MINUTE = 60_000;
/** How long typing has to pause before the calendars of the people named are asked. */
const LOOKUP_DELAY_MS = 350;

/**
 * "Create or search" (Ctrl K): the dialog every page opens to add something or to
 * find something.
 *
 * A sentence typed the way it would be said is read in the browser (see
 * core/utils/quick-parse.ts): the understood parts are coloured, the preview shows
 * what will be created, and Enter creates it. Text with nothing to understand in it
 * is a search: from two characters on the server searches tasks, projects, people
 * and events (GET /api/Search), with the user's own tasks and projects matched in
 * the browser while that answer is on its way.
 */
@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [NgTemplateOutlet, TPipe, NumPipe],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GlobalSearch {
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private tasks = inject(TaskService);
  private groups = inject(GroupService);
  private users = inject(UserService);
  private search = inject(SearchService);
  private events = inject(EventService);
  private schedule = inject(ScheduleService);
  private calendarApi = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private prefs = inject(LocalPrefsService);
  private quickAdd = inject(QuickAddService);
  private toasts = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private ui = inject(UiService);
  private injector = inject(Injector);
  private readonly myId = inject(AuthService).getCurrentUserId();

  private inputRef = viewChild<ElementRef<HTMLInputElement>>('input');
  private lineRef = viewChild<ElementRef<HTMLElement>>('line');
  private dialogRef = viewChild<ElementRef<HTMLElement>>('panel');

  readonly open = signal(false);
  readonly text = signal('');
  /** -1 while the sentence itself is what Enter acts on. */
  readonly activeIndex = signal(0);
  /** True from the first keystroke until the server has answered for that text. */
  readonly searching = signal(false);
  readonly creating = signal(false);
  readonly error = signal('');

  /** Phone width: the dialog is the bottom sheet of the mobile design. */
  readonly phone = signal(false);
  /**
   * Which way the sentence reads. Follows what is typed; the switch sets it before
   * typing, and it starts in the language of the interface.
   */
  readonly arabic = signal(isArabic());
  /** Set by the Event / Task switch on phones; null leaves it to the sentence. */
  private kindChoice = signal<Kind | null>(null);

  // The caret and selection of the (invisible) text field, drawn by hand in the sentence.
  private selStart = signal(0);
  private selEnd = signal(0);
  readonly focused = signal(false);
  private dragAnchor: number | null = null;

  private now = signal(new Date());
  private myTasks = signal<TaskDto[]>([]);
  private myProjects = signal<GroupDto[]>([]);
  private contacts = signal<ContactDto[]>([]);
  private answer = signal<ServerAnswer | null>(null);
  /** Fetched once per opening, not per keystroke. */
  private loadedAt = 0;
  private query$ = new Subject<string>();
  /** What had the focus before the dialog opened, to give it back. */
  private opener: HTMLElement | null = null;

  /** The alternative time picked in the note, if any. */
  readonly slot = signal<TimeSlotDto | null>(null);
  /** Free / busy of the people named at the typed time. `key` says which time it is for. */
  private availability = signal<{ key: string; people: UserAvailabilityDto[] | null } | null>(null);
  private suggestions = signal<{ key: string; slots: TimeSlotDto[] | null } | null>(null);
  /** The time alternatives are being looked up for, so one question is not asked twice. */
  private suggestingFor = '';
  /** "Plan it for me": the first free time found for the new task. */
  readonly plannedStart = signal<Date | null>(null);
  readonly planning = signal(false);

  private readonly zone = this.users.timeZone;
  private readonly hour24 = this.calendarData.use24HourClock;

  // ── Reading the sentence ───────────────────────────────────────────────────

  readonly parsed = computed<ParsedSentence>(() => parseSentence(this.text(), {
    now: this.now(),
    zone: this.zone(),
    people: this.contacts().map(contact => ({ id: contact.id, name: contact.fullName })),
    projects: this.myProjects().map(group => ({ id: group.id, name: group.name, color: group.color })),
    calendars: this.calendarData.calendars().map(calendar => ({ id: calendar.id, name: calendar.name, color: calendar.color }))
  }));

  readonly mode = computed<Mode>(() => {
    const parsed = this.parsed();
    if (!this.text().trim()) return 'idle';
    if (parsed.goTo) return 'goto';
    if (!parsed.title) return 'search';
    // On a phone the sheet is "New event / New task": picking one is enough to create.
    return parsed.structured || this.kindChoice() ? 'create' : 'search';
  });

  /** An event when the sentence has a time or people; a task when it is written as one. */
  readonly kind = computed<Kind>(() => {
    const forced = this.kindChoice();
    if (forced) return forced;
    const parsed = this.parsed();
    if (parsed.estimate !== null || parsed.priority || parsed.deadline) return 'task';
    return parsed.time || parsed.people.length ? 'event' : 'task';
  });

  private readonly today = computed(() => todayIn(this.now(), this.zone()));
  private readonly workStart = computed(() => this.clockOf(this.calendarData.settings()?.workDayStart, 9));
  private readonly workEnd = computed(() => this.clockOf(this.calendarData.settings()?.workDayEnd, 17));

  /** When the event starts as typed, before an alternative is picked. */
  private readonly typedStart = computed<Date>(() => {
    const parsed = this.parsed();
    const zone = this.zone();
    const now = this.now();
    const today = this.today();

    let time = parsed.time;
    if (!time) {
      // No time typed: the next full hour today, the start of the working day otherwise.
      const isToday = !parsed.day || sameDay(parsed.day, today);
      time = isToday ? { hour: Math.min(23, zonedParts(now, zone).hour + 1), minute: 0 } : this.workStart();
    }
    let day = parsed.day ?? today;
    let start = this.instant(day, time);
    if (!parsed.day && start.getTime() < now.getTime()) {
      day = addDays(today, 1);
      start = this.instant(day, time);
    }
    return start;
  });

  readonly minutes = computed(() =>
    this.parsed().minutes ?? this.calendarData.settings()?.defaultEventMinutes ?? 60);

  readonly start = computed<Date>(() => {
    const slot = this.slot();
    return slot ? new Date(slot.start) : this.typedStart();
  });
  readonly end = computed<Date>(() => new Date(this.start().getTime() + this.minutes() * MINUTE));

  /** A task's deadline: the day named, at the time named or at the end of the working day. */
  readonly due = computed<Date | null>(() => {
    const parsed = this.parsed();
    if (!parsed.day && !parsed.time) return null;
    const today = this.today();
    const time = parsed.time ?? this.workEnd();
    const due = this.instant(parsed.day ?? today, time);
    return !parsed.day && due.getTime() < this.now().getTime() ? this.instant(addDays(today, 1), time) : due;
  });

  /** A task's estimate: `~30m`, or the length given with "for". */
  private readonly estimate = computed(() => this.parsed().estimate ?? this.parsed().minutes);

  /** Changes whenever the time, length or people of the event as typed change. */
  private readonly timingKey = computed(() => {
    if (this.mode() !== 'create' || this.kind() !== 'event') return '';
    const ids = this.parsed().people.map(person => person.id).join(',');
    return `${this.typedStart().getTime()}|${this.minutes()}|${ids}`;
  });

  // ── What is drawn in the sentence ──────────────────────────────────────────

  readonly shown = computed<ShownPiece[]>(() => {
    const pieces = this.parsed().pieces;
    const from = this.selStart();
    const to = this.selEnd();
    const caret = this.focused() && from === to ? from : -1;

    const isPlain = (kind: PieceKind) => kind === 'text' || kind === 'link';
    return pieces.map((piece, index) => {
      const previous = index ? pieces[index - 1] : null;
      const previousEnd = previous ? previous.end : -1;
      const shown: ShownPiece = {
        kind: piece.kind, part: piece.part, start: piece.start,
        pre: piece.text, sel: '', post: '', caretIn: false, caretBefore: false
      };

      // At the edge of a coloured part the caret stands beside it, as the design draws it;
      // inside a part, or anywhere in a plain word, it stands between the letters.
      const inside = isPlain(piece.kind)
        ? caret >= piece.start && caret <= piece.end
        : caret > piece.start && caret < piece.end;
      // The end of the word or part before this one: a plain word keeps the caret, a part hands it on.
      const handedOn = !!previous && caret === previousEnd && !isPlain(previous.kind);
      if (inside && caret !== previousEnd) {
        shown.caretIn = true;
        shown.pre = piece.text.slice(0, caret - piece.start);
        shown.post = piece.text.slice(caret - piece.start);
      } else if (caret >= 0 && caret <= piece.start && (caret > previousEnd || handedOn)) {
        shown.caretBefore = true;
      } else if (from !== to) {
        const a = Math.max(from, piece.start) - piece.start;
        const b = Math.min(to, piece.end) - piece.start;
        if (a < b) {
          shown.pre = piece.text.slice(0, a);
          shown.sel = piece.text.slice(a, b);
          shown.post = piece.text.slice(b);
        }
      }
      return shown;
    });
  });

  /** The caret after the last word: in the space typed after it, or in an empty field. */
  readonly caretAtEnd = computed(() => {
    if (!this.focused() || this.selStart() !== this.selEnd()) return false;
    const pieces = this.parsed().pieces;
    const last = pieces[pieces.length - 1];
    if (!last) return true;
    const plain = last.kind === 'text' || last.kind === 'link';
    return this.selStart() > last.end || (!plain && this.selStart() === last.end);
  });

  readonly placeholder = computed(() => {
    if (this.mode() === 'goto') return '';
    const friend = this.contacts()[0]?.fullName.split(/\s+/)[0];
    // The example is in the language the sentence is typed in, which the switch chooses.
    if (this.arabic()) {
      // Arabic digits, unless the Arabic interface is set to draw 123.
      const digits = (text: string) => currentLanguage() === 'ar' ? num(text) : text.replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[+digit]);
      return digits(friend ? `جرّب: غداء مع ${friend} غدًا الساعة 1 م` : 'جرّب: اجتماع الفريق غدًا الساعة 10 ص لمدة ساعة');
    }
    return friend ? `Try “Lunch with ${friend} tomorrow at 1pm”` : 'Try “Team lunch tomorrow at 1pm for 45 min”';
  });

  readonly eyebrow = computed(() => this.mode() === 'goto'
    ? t('Go to a date · type a day')
    : t('Create · type it the way you’d say it'));

  // ── Preview ────────────────────────────────────────────────────────────────

  readonly meta = computed(() => {
    const parsed = this.parsed();
    if (this.kind() === 'task') {
      return [t('New task'), parsed.project?.name ?? t('No project'), parsed.priority ? t(PRIORITY_LINES[parsed.priority]) : '']
        .filter(Boolean).join(' · ');
    }
    const home = parsed.project?.name ?? parsed.calendar?.name ?? this.calendarData.defaultCalendar()?.name ?? '';
    return [t('New event'), home].filter(Boolean).join(' · ');
  });

  readonly facts = computed<Fact[]>(() => {
    if (this.kind() === 'task') return [this.dueFact(), this.forFact(), this.estimateFact(), this.projectFact()];
    return this.phone()
      ? [this.whenFact(), this.repeatFact(), this.withFact(), this.calendarFact()]
      : [this.whenFact(), this.withFact(), this.lengthFact(), this.whereFact()];
  });

  /** Why the typed time may not suit, with real alternatives. null when there is no reason. */
  readonly note = computed<{ parts: NotePart[]; lead: string; slots: TimeSlotDto[]; loading: boolean } | null>(() => {
    const key = this.timingKey();
    if (!key) return null;

    const parts = this.reasons();
    if (!parts.length) return null;

    const found = this.suggestions();
    const slots = found?.key === key ? found.slots : undefined;
    const guests = this.parsed().people.length;

    if (slots === undefined) return { parts, lead: t('Looking for times that work…'), slots: [], loading: true };
    if (slots === null) return { parts, lead: t('Free times could not be looked up.'), slots: [], loading: false };
    if (!slots.length) return { parts, lead: t('No free time was found in the next two weeks.'), slots: [], loading: false };
    const lead = guests === 0 ? t('These times work for you:')
      : guests === 1 ? t('These times work for both of you:')
      : t('These times work for all of you:');
    return { parts, lead, slots, loading: false };
  });

  /**
   * Mobile: the shortcuts under the rows. Each one rewrites a part of the sentence,
   * in the language the sentence is typed in (the words are ones the parser reads).
   */
  readonly chips = computed<{ label: string; pressed?: boolean; run: () => void }[]>(() => {
    const parsed = this.parsed();
    if (this.kind() === 'task') {
      return [
        { label: t('Today'), run: () => this.setDayWord(this.arabic() ? 'اليوم' : 'today') },
        { label: t('Tomorrow'), run: () => this.setDayWord(this.arabic() ? 'غدًا' : 'tomorrow') },
        { label: t('Plan it for me'), pressed: !!this.plannedStart(), run: () => this.togglePlanForMe() }
      ];
    }
    const first = this.firstWorkDay();
    return [
      { label: t('Tomorrow'), run: () => this.setDayWord(this.arabic() ? 'غدًا' : 'tomorrow') },
      {
        label: t('Next {weekday}', { weekday: weekdayName(first) }),
        run: () => this.setDayWord(this.arabic() ? `يوم ${weekdayNameIn(first, 'ar')} القادم` : `next ${WEEKDAY_NAMES[first].toLowerCase()}`)
      },
      { label: t('1 h'), run: () => this.replacePart('len', undefined, this.arabic() ? 'لمدة ساعة' : 'for 1 hour') },
      parsed.repeat
        ? { label: t('No repeat'), run: () => this.replacePart('rep', undefined, '') }
        : { label: t('Every week'), run: () => this.replacePart('rep', undefined, this.arabic() ? 'كل أسبوع' : 'every week') }
    ];
  });

  readonly cta = computed(() => this.kind() === 'task' ? t('Add task') : t('Add to calendar'));

  // ── The list: results, commands, pages ─────────────────────────────────────

  readonly rows = computed<Row[]>(() => {
    const mode = this.mode();
    if (mode === 'goto') return [];
    if (mode === 'create') return this.commands(t('Or run a command'));
    if (mode === 'idle') return [...this.commands(t('Run a command')), ...this.pageRows('')];
    return [...this.resultRows(), ...this.pageRows(this.normalised(this.text())), ...this.commands(t('Or run a command'))];
  });

  /** The day "g friday" would open, as it reads in the preview. */
  readonly goToLabel = computed(() => {
    const day = this.parsed().day;
    return day ? this.longDay(this.instant(day, { hour: 12, minute: 0 })) : '';
  });

  constructor() {
    // Opened from elsewhere: a page's search box, "Quick add" on the phone tab bar.
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
        // A late answer for text that has since changed leaves the search on:
        // the search for the current text is still to come.
        if (!answer || answer.query === this.normalised(this.text())) this.searching.set(false);
      });

    // The calendars of the people named are asked a moment after the last change.
    effect(onCleanup => {
      const key = this.timingKey();
      untracked(() => {
        this.slot.set(null);
        if (!key) return;
        const timer = setTimeout(() => this.lookUpAvailability(key), LOOKUP_DELAY_MS);
        onCleanup(() => clearTimeout(timer));
      });
    });

    // Alternatives are only asked for when there is a reason to offer them.
    effect(() => {
      const key = this.timingKey();
      const reasons = this.reasons().length;
      untracked(() => {
        if (key && reasons && this.suggestions()?.key !== key && this.suggestingFor !== key) this.lookUpSuggestions(key);
      });
    });

    // The text field takes the focus the moment the dialog is rendered.
    effect(() => {
      const input = this.inputRef()?.nativeElement;
      if (input) untracked(() => this.focusInput());
    });

    // "Plan it for me" is an answer for one sentence: any change to it asks again.
    effect(() => {
      this.text();
      untracked(() => this.plannedStart.set(null));
    });

    if (typeof window !== 'undefined' && window.matchMedia) {
      const query = window.matchMedia('(max-width: 767.98px)');
      const update = () => this.phone.set(query.matches);
      update();
      query.addEventListener('change', update);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', update));

      // The caret of the hidden field moves without an event of its own.
      const onSelection = () => { if (this.open()) this.syncSelection(); };
      document.addEventListener('selectionchange', onSelection);
      this.destroyRef.onDestroy(() => document.removeEventListener('selectionchange', onSelection));
    }
  }

  // ── Opening and closing ────────────────────────────────────────────────────

  /** Cmd/Ctrl+K from anywhere opens and closes it; Escape closes it. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    const isToggle = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k';
    if (isToggle) {
      event.preventDefault();
      this.open() ? this.close() : this.openPalette();
      return;
    }
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      this.close();
    }
  }

  openPalette() {
    if (!this.open()) this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.open.set(true);
    this.now.set(new Date());
    this.activeIndex.set(0);
    this.refreshIndex();
    // Already open: the field is there. Otherwise it takes the focus when it is rendered (see the constructor).
    this.focusInput();
  }

  close() {
    this.open.set(false);
    this.text.set('');
    this.answer.set(null);
    this.searching.set(false);
    this.creating.set(false);
    this.error.set('');
    this.activeIndex.set(0);
    this.kindChoice.set(null);
    this.selStart.set(0);
    this.selEnd.set(0);
    // So the next opening starts clean even if the same text is typed again.
    this.query$.next('');
    this.opener?.focus?.();
    this.opener = null;
  }

  /** A press on the dimmed page closes the dialog; one inside it does not. */
  onBackdrop(event: Event) {
    if (event.target === event.currentTarget) this.close();
  }

  /** Loads what the sentence is matched against, at most once every 30 seconds. */
  private refreshIndex() {
    if (Date.now() - this.loadedAt < 30_000 && this.myTasks().length) return;
    this.loadedAt = Date.now();

    this.tasks.getTasks().pipe(catchError(() => of([] as TaskDto[])))
      .subscribe(list => this.myTasks.set(list ?? []));
    this.groups.getGroups().pipe(catchError(() => of([] as GroupDto[])))
      .subscribe(list => this.myProjects.set(list ?? []));
    this.users.getContacts().pipe(catchError(() => of([] as ContactDto[])))
      .subscribe(list => this.contacts.set(list ?? []));
    // Working hours, default length and the calendars, when no page has loaded them yet.
    if (!this.calendarData.settings()) this.calendarData.reloadLists();
  }

  // ── Typing ─────────────────────────────────────────────────────────────────

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.setText(value);
    this.syncSelection();
  }

  private setText(value: string) {
    this.text.set(value);
    this.now.set(new Date());
    this.error.set('');
    // The sentence turns with its first letters; with none typed the switch decides.
    const letters = /\p{L}/u.exec(value);
    if (letters) this.arabic.set(isRightToLeft(letters[0]));

    const mode = this.mode();
    this.activeIndex.set(mode === 'create' || mode === 'goto' ? -1 : 0);
    // A single "P" is the prayer-times command (Shift P): Enter runs it.
    if (value === 'P') {
      const index = this.rows().findIndex(row => row.id === 'cmd:prayer');
      if (index >= 0) this.activeIndex.set(index);
    }

    const wanted = mode === 'search' && this.normalised(value).length >= SEARCH_MIN_LENGTH;
    this.searching.set(wanted);
    this.query$.next(mode === 'search' ? value : '');
  }

  /** Puts new text in the field, with the caret at its end. */
  private write(value: string) {
    const input = this.inputRef()?.nativeElement;
    if (input) input.value = value;
    this.setText(value);
    this.focusInput();
    input?.setSelectionRange(value.length, value.length);
    this.syncSelection();
  }

  private focusInput() {
    this.inputRef()?.nativeElement.focus({ preventScroll: true });
    this.syncSelection();
  }

  /**
   * The dialog is modal: when something outside it takes the focus while it is
   * open (a page that focuses a panel as it finishes loading), the field takes it back.
   */
  onBlur() {
    this.focused.set(false);
    setTimeout(() => {
      const panel = this.dialogRef()?.nativeElement;
      if (this.open() && panel && !panel.contains(document.activeElement)) this.focusInput();
    });
  }

  private syncSelection() {
    const input = this.inputRef()?.nativeElement;
    if (!input) return;
    this.selStart.set(input.selectionStart ?? input.value.length);
    this.selEnd.set(input.selectionEnd ?? input.value.length);
  }

  setLanguage(language: 'en' | 'ar') {
    this.arabic.set(language === 'ar');
    this.focusInput();
  }

  /** Phones: the Event / Task switch. */
  chooseKind(kind: Kind) {
    this.kindChoice.set(kind);
    this.activeIndex.set(this.mode() === 'create' ? -1 : 0);
    this.focusInput();
  }

  onKeydown(event: KeyboardEvent) {
    const key = event.key;
    const command = event.ctrlKey || event.metaKey;
    const rows = this.rows();

    // Shortcuts of the commands. Ctrl T belongs to the browser in a normal tab, so Alt T does the same.
    if ((command || event.altKey) && !event.shiftKey && key.toLowerCase() === 't') {
      event.preventDefault();
      this.newTask();
      return;
    }
    if (command && !event.altKey && key.toLowerCase() === 'f') {
      event.preventDefault();
      this.findTime();
      return;
    }

    switch (key) {
      case 'ArrowDown':
        if (!rows.length) return;
        event.preventDefault();
        this.activeIndex.set(this.activeIndex() + 1 >= rows.length ? this.firstIndex() : this.activeIndex() + 1);
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        if (!rows.length) return;
        event.preventDefault();
        this.activeIndex.set(this.activeIndex() <= this.firstIndex() ? rows.length - 1 : this.activeIndex() - 1);
        this.scrollActiveIntoView();
        break;
      case 'Enter': {
        if (event.isComposing) return;
        event.preventDefault();
        const mode = this.mode();
        const chosen = rows[this.activeIndex()];
        if (mode === 'goto') this.goToDate();
        else if (mode === 'create' && (command || !chosen)) this.create(command);
        else if (chosen) chosen.run();
        break;
      }
      case 'Tab':
        // Tab opens the full editor with what was understood; with nothing typed it moves on as usual.
        if (!event.shiftKey && this.parsed().title && this.mode() !== 'goto') {
          event.preventDefault();
          this.openEditor();
        }
        break;
    }
  }

  /** Keeps Tab inside the dialog while it is open. */
  onDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const panel = this.dialogRef()?.nativeElement;
    if (!panel) return;
    const stops = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]'))
      .filter(element => element.offsetParent !== null || element === this.inputRef()?.nativeElement);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /** While a sentence is being created nothing in the list is chosen, so the list starts at -1. */
  private firstIndex(): number {
    return this.mode() === 'create' ? -1 : 0;
  }

  private scrollActiveIntoView() {
    afterNextRender(() => this.dialogRef()?.nativeElement
      .querySelector('.qa-opt.active')?.scrollIntoView({ block: 'nearest' }), { injector: this.injector });
  }

  hover(index: number) {
    // Hovering must not turn Enter from "create" into "run this command".
    if (this.mode() !== 'create') this.activeIndex.set(index);
  }

  // ── The caret, drawn by hand ───────────────────────────────────────────────

  onLinePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    // The field keeps the focus; the caret goes where the press landed.
    event.preventDefault();
    const input = this.inputRef()?.nativeElement;
    if (!input) return;
    input.focus({ preventScroll: true });
    const offset = this.offsetAt(event.clientX, event.clientY);
    this.dragAnchor = offset;
    input.setSelectionRange(offset, offset);
    this.syncSelection();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onLinePointerMove(event: PointerEvent) {
    if (this.dragAnchor === null) return;
    const input = this.inputRef()?.nativeElement;
    if (!input) return;
    const offset = this.offsetAt(event.clientX, event.clientY);
    input.setSelectionRange(Math.min(offset, this.dragAnchor), Math.max(offset, this.dragAnchor),
      offset < this.dragAnchor ? 'backward' : 'forward');
    this.syncSelection();
  }

  onLinePointerUp() {
    this.dragAnchor = null;
    // Touch screens only bring the keyboard up for a focus made in the tap itself.
    this.focusInput();
  }

  /** A double press selects the word or part under it. */
  onLineDoubleClick(event: MouseEvent) {
    const input = this.inputRef()?.nativeElement;
    const offset = this.offsetAt(event.clientX, event.clientY);
    const piece = this.parsed().pieces.find(candidate => offset >= candidate.start && offset <= candidate.end);
    if (!input || !piece) return;
    input.setSelectionRange(piece.start, piece.end);
    this.syncSelection();
  }

  /** The place in the text under a point of the drawn sentence. */
  private offsetAt(x: number, y: number): number {
    const line = this.lineRef()?.nativeElement;
    const length = this.text().length;
    if (!line) return length;

    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let node: Node | null = null;
    let inside = 0;
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) {
      node = position.offsetNode;
      inside = position.offset;
    } else {
      const range = doc.caretRangeFromPoint?.(x, y);
      if (range) { node = range.startContainer; inside = range.startOffset; }
    }

    const holder = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>('.qa-piece');
    if (holder && node && node.nodeType === Node.TEXT_NODE && line.contains(holder)) {
      const before = document.createRange();
      before.setStart(holder, 0);
      before.setEnd(node, inside);
      return Number(holder.dataset['start']) + before.toString().length;
    }

    // Not on a word: the nearest one decides, and which half of it was nearer.
    let best = length;
    let nearest = Number.POSITIVE_INFINITY;
    const rtl = this.arabic();
    line.querySelectorAll<HTMLElement>('.qa-piece').forEach(element => {
      const box = element.getBoundingClientRect();
      const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
      const distance = dy * 1000 + dx;
      if (distance >= nearest) return;
      nearest = distance;
      const start = Number(element.dataset['start']);
      const pastMiddle = x > box.left + box.width / 2;
      best = pastMiddle !== rtl ? start + (element.textContent ?? '').length : start;
    });
    return best;
  }

  // ── Search (as before the redesign) ────────────────────────────────────────

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

  private resultRows(): Row[] {
    const q = this.normalised(this.text());

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

    const people: Row[] = (found ? found.users ?? [] : current?.people ?? [])
      .slice(0, 5)
      .map(u => ({
        id: `person:${u.id}`,
        section: t('People'),
        title: u.fullName,
        subtitle: u.email || u.country || t('Person'),
        icon: 'person' as const,
        run: () => this.go(['/profile', u.id])
      }));

    return [...tasks, ...projects, ...events, ...people];
  }

  private taskRow(task: TaskDto): Row {
    return {
      id: `task:${task.id}`,
      section: t('Tasks'),
      title: task.title,
      subtitle: `${task.groupName || t('Personal')} · ${this.statusLabel(task.status)}`,
      icon: 'task',
      tone: task.groupColor || undefined,
      run: () => this.go(['/tasks', task.id])
    };
  }

  /** A task's status as the API names it ("In_progress"), in words. */
  private statusLabel(status: string | null | undefined): string {
    const words = (status ?? '').replace(/_/g, ' ');
    if (!words) return '';
    // "Pending" is also what a request that waits is called: the task meaning has its own entry.
    return words === 'Pending' ? t('Pending@@task') : t(words);
  }

  /** `known` is the same project from the user's own list, which carries the counts. */
  private projectRow(p: SearchProjectDto | GroupDto, known?: GroupDto): Row {
    return {
      id: `project:${p.id}`,
      section: t('Projects'),
      title: p.name,
      subtitle: known
        ? `${tCount(known.memberCount, '{n} member', '{n} members')} · ${tCount(known.taskCount, '{n} task', '{n} tasks')}`
        : (p.description || t('Project')),
      icon: 'project',
      tone: p.color || undefined,
      run: () => this.go(['/projects', p.id])
    };
  }

  /** An event opens the calendar on its day, with the event itself on show. */
  private eventRow(e: SearchEventDto): Row {
    const zone = this.zone();
    const start = new Date(e.startsAt);
    const end = new Date(e.endsAt);
    const valid = !Number.isNaN(start.getTime());

    // An all-day event keeps the date it was given in whatever zone it was made,
    // so its day is read from that date (at noon), not from its first instant.
    let day = start;
    if (valid && e.isAllDay && !Number.isNaN(end.getTime())) {
      const span = allDaySpan(start, end, zone);
      day = zonedTimeToUtc(span.year, span.month, span.day, 12, 0, zone);
    }

    // On the clock the user chose (12 or 24 hours), like everywhere else.
    const subtitle = [
      valid && (e.isAllDay ? `${this.dayLabel(day)} · ${t('all day')}` : `${this.dayLabel(start)} · ${this.time(start)}`),
      e.location,
      e.isRecurring ? t('repeats') : ''
    ].filter(Boolean).join(' · ');

    return {
      id: `event:${e.id}`,
      section: t('Events'),
      title: e.title,
      subtitle: subtitle || t('Event'),
      icon: 'event',
      run: () => this.go(['/calendar'], valid ? { event: e.id, date: dayKeyInZone(day, zone) } : { event: e.id })
    };
  }

  private pageRows(q: string): Row[] {
    return PAGES
      .filter(page => !q || page.label.toLowerCase().includes(q) || page.name.toLowerCase().includes(q))
      .map(page => ({
        id: `page:${page.route}`,
        section: t('Go to'),
        title: page.label,
        subtitle: page.hint,
        icon: page.icon,
        run: () => this.go([page.route])
      }));
  }

  private go(commands: (string | number)[], queryParams?: Record<string, string>) {
    this.close();
    this.router.navigate(commands, queryParams ? { queryParams } : undefined);
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  private commands(section: string): Row[] {
    const parsed = this.parsed();
    const title = parsed.title;
    const guest = parsed.people[0]?.name;
    const prayerOn = this.prefs.prayerTimes();

    const rows: Row[] = [
      {
        id: 'cmd:task', section, glyph: 'T', key: 'Ctrl T',
        keyTitle: t('In a browser tab Ctrl T opens a new tab: Alt T does the same here'),
        title: title ? t('New task “{title}”', { title }) : t('New task'),
        run: () => this.newTask()
      }
    ];
    if (!title) {
      rows.push(
        { id: 'cmd:event', section, glyph: 'E', title: t('New event'), run: () => { this.close(); this.quickAdd.newEvent(); } },
        { id: 'cmd:project', section, glyph: 'N', title: t('New project'), run: () => { this.close(); this.quickAdd.newProject(); } }
      );
    }
    rows.push(
      {
        id: 'cmd:find', section, glyph: 'F', key: 'Ctrl F',
        title: guest ? t('Find a time with {name}', { name: guest }) : t('Find a time'),
        run: () => this.findTime()
      },
      { id: 'cmd:goto', section, glyph: 'G', key: 'G', keyTitle: t('Type g and a day, then Enter'), title: t('Go to a date…'), run: () => this.startGoTo() },
      {
        id: 'cmd:prayer', section, glyph: 'P', key: 'Shift P', keyTitle: t('Type a capital P, then Enter'),
        title: prayerOn ? t('Hide prayer times layer') : t('Show prayer times layer'),
        run: () => this.togglePrayerLayer()
      }
    );
    return rows;
  }

  /** "New task": from the sentence when there is one, otherwise the task dialog. */
  newTask() {
    if (this.parsed().title && this.mode() !== 'goto') {
      this.createTask();
      return;
    }
    this.close();
    this.quickAdd.newTask();
  }

  /** The calendar track's "Find a time" page, told who, how long and what for. */
  findTime() {
    const parsed = this.parsed();
    const queryParams: Record<string, string> = {};
    if (parsed.people.length) queryParams['with'] = parsed.people.map(person => person.id).join(',');
    if (parsed.minutes) queryParams['minutes'] = String(parsed.minutes);
    if (parsed.title && this.mode() === 'create') queryParams['title'] = parsed.title;
    this.close();
    this.router.navigate(['/calendar/find-time'], { queryParams });
  }

  /** "Go to a date…": straight there when the sentence names a day, otherwise it asks for one. */
  private startGoTo() {
    if (this.parsed().day) {
      this.goToDate();
      return;
    }
    this.write('g ');
  }

  goToDate() {
    const day = this.parsed().day;
    if (!day) {
      this.error.set(num(t('Type a day: “today”, “friday”, “15 nov”.')));
      return;
    }
    const key = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    this.go(['/calendar'], { date: key });
  }

  private togglePrayerLayer() {
    const shown = !this.prefs.prayerTimes();
    this.prefs.prayerTimes.set(shown);
    this.close();
    this.toasts.show(shown ? t('Prayer times are shown on the calendar') : t('Prayer times are hidden'),
      { undo: () => this.prefs.prayerTimes.set(!shown) });
  }

  // ── Creating ───────────────────────────────────────────────────────────────

  /** Enter creates what the sentence says; with `invite` the people named are invited too. */
  create(invite: boolean) {
    if (this.creating() || !this.parsed().title) return;
    if (this.kind() === 'task') this.createTask();
    else this.createEvent(invite);
  }

  /** The button of the phone sheet: an event there always invites the people named. */
  createFromSheet() {
    if (this.mode() === 'search') {
      this.createTask();
      return;
    }
    this.create(true);
  }

  private createEvent(invite: boolean) {
    const parsed = this.parsed();
    const start = this.start();
    const end = this.end();
    const guests = parsed.people;

    const body: SaveEventDto = {
      title: parsed.title,
      // Without an invitation the names would be lost, so they are kept as a note.
      description: !invite && guests.length ? t('With {names}', { names: this.nameList(guests.map(guest => guest.name)) }) : null,
      location: parsed.place,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      isAllDay: false,
      recurrence: parsed.repeat?.pattern ?? 'None',
      recurrenceInterval: parsed.repeat?.interval ?? 1,
      recurrenceEndDate: null,
      calendarId: parsed.calendar?.id ?? null,
      groupId: parsed.project?.id ?? null,
      attendeeIds: invite ? guests.map(guest => guest.id) : []
    };

    this.creating.set(true);
    this.events.create(body).subscribe({
      next: created => {
        const placed = { title: created.title, day: this.shortDay(start), time: this.time(start) };
        const text = invite && guests.length
          ? t('“{title}” is on your calendar · {day} {time} · {names} invited', { ...placed, names: this.nameList(guests.map(guest => guest.name)) })
          : t('“{title}” is on your calendar · {day} {time}', placed);
        this.close();
        this.calendarData.reload();
        this.toasts.show(text, {
          undo: () => this.events.delete(created.id).subscribe({ next: () => this.calendarData.reload(), error: () => {} })
        });
      },
      error: err => {
        this.creating.set(false);
        this.error.set(apiErrorMessage(err, t('The event was not created.')));
      }
    });
  }

  private createTask() {
    const parsed = this.parsed();
    if (this.creating() || !parsed.title) return;

    const planned = this.plannedStart();
    const estimate = this.estimate();
    let due = this.due();
    // A time block has to end by the deadline; with none given, the block's end is the deadline.
    if (planned) {
      const blockEnd = new Date(planned.getTime() + (estimate ?? 30) * MINUTE);
      if (!due || due.getTime() < blockEnd.getTime()) due = blockEnd;
    }

    const task: Partial<TaskDto> = {
      title: parsed.title,
      description: '',
      status: 'Pending',
      priority: parsed.priority ?? 'Medium',
      tags: withEstimate('', estimate),
      recurrence: parsed.repeat?.pattern ?? 'None'
    };
    if (due) task.dueDate = due.toISOString();
    if (planned) task.startDate = planned.toISOString();
    if (parsed.project) task.groupId = parsed.project.id;
    if (parsed.assignee) task.assignedToUserId = parsed.assignee.id;

    this.creating.set(true);
    this.tasks.createTask(task).subscribe({
      next: created => {
        this.close();
        this.loadedAt = 0;
        this.calendarData.reloadItems();
        const title = created?.title ?? parsed.title;
        const text = planned ? t('Task added: “{title}” · planned {day} {time}', { title, day: this.shortDay(planned), time: this.time(planned) })
          : due ? t('Task added: “{title}” · due {day}', { title, day: this.shortDay(due) })
          : t('Task added: “{title}”', { title });
        this.toasts.show(text, created?.id ? {
          undo: () => this.tasks.deleteTask(created.id).subscribe({ next: () => this.calendarData.reloadItems(), error: () => {} })
        } : {});
      },
      error: err => {
        this.creating.set(false);
        this.error.set(apiErrorMessage(err, t('The task was not created.')));
      }
    });
  }

  /** Tab: the full editor, filled in with what was understood. */
  openEditor() {
    const parsed = this.parsed();
    const kind = this.kind();
    const zone = this.zone();
    const start = this.start();
    const end = this.end();
    const due = this.due();
    const estimate = this.estimate();

    const draft: QuickDraft = {
      title: parsed.title,
      start: kind === 'event' ? start : null,
      end: kind === 'event' ? end : null,
      due: kind === 'task' ? due : null,
      guests: parsed.people,
      location: parsed.place,
      calendarId: parsed.calendar?.id ?? null,
      groupId: parsed.project?.id ?? null,
      recurrence: parsed.repeat?.pattern ?? 'None',
      priority: parsed.priority,
      estimateMinutes: estimate
    };
    this.close();

    if (kind === 'event') {
      const data = { zone, date: cellOfInstant(start, zone), time: timeInputInZone(start, zone), draft } as EventEditorData;
      const ref = this.dialog.open(EventEditor, { panelClass: 'custom-dialog-container', autoFocus: false, data });
      // The editor takes a day only, so the rest goes into its form. Read loosely, so a
      // change to the editor's insides leaves this a no-op instead of a broken build.
      const editor = ref.componentInstance as unknown as EditorInsides;
      editor.form?.patchValue({
        title: draft.title,
        startDate: dateInputInZone(start, zone), startTime: timeInputInZone(start, zone),
        endDate: dateInputInZone(end, zone), endTime: timeInputInZone(end, zone),
        location: draft.location ?? '',
        recurrence: draft.recurrence,
        ...(draft.calendarId ? { calendarId: draft.calendarId } : {}),
        ...(draft.groupId ? { groupId: draft.groupId } : {})
      });
      editor.endChanged?.();
      editor.guests?.set(draft.guests.map(guest => ({ id: guest.id, name: guest.name })));
      ref.afterClosed().subscribe(saved => { if (saved) this.calendarData.reload(); });
      return;
    }

    const ref = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false,
      data: { groupId: draft.groupId ?? undefined, draft }
    });
    // The dialog takes a project only, so the rest goes into its form (on the profile's clock).
    (ref.componentInstance as unknown as EditorInsides).taskForm?.patchValue({
      title: draft.title,
      priority: draft.priority ?? 'Medium',
      dueDay: due ? dateInputInZone(due, zone) : '',
      dueTime: due && parsed.time ? timeInputInZone(due, zone) : '',
      estimate: formatEstimate(estimate),
      recurrence: draft.recurrence,
      groupId: draft.groupId ?? '',
      assignedToUserId: parsed.assignee?.id ?? ''
    });
    ref.afterClosed().subscribe(saved => { if (saved) this.calendarData.reloadItems(); });
  }

  pickSlot(slot: TimeSlotDto) {
    this.slot.update(current => (current?.start === slot.start ? null : slot));
    this.focusInput();
  }

  // ── Looking things up ──────────────────────────────────────────────────────

  private lookUpAvailability(key: string) {
    const ids = this.parsed().people.map(person => person.id);
    const start = this.typedStart();
    const end = new Date(start.getTime() + this.minutes() * MINUTE);

    this.schedule.getAvailability(ids, start, end).subscribe({
      next: people => { if (this.timingKey() === key) this.availability.set({ key, people }); },
      // A hint only: without it the event can still be created.
      error: () => { if (this.timingKey() === key) this.availability.set({ key, people: null }); }
    });
  }

  private lookUpSuggestions(key: string) {
    const start = this.typedStart();
    const day = todayIn(start, this.zone());
    const dayStart = this.instant(day, { hour: 0, minute: 0 });

    this.suggestingFor = key;
    this.schedule.suggest({
      attendeeIds: this.parsed().people.map(person => person.id),
      durationMinutes: Math.min(24 * 60, Math.max(5, this.minutes())),
      from: new Date(Math.max(dayStart.getTime(), Date.now())).toISOString(),
      maxResults: 3,
      workingHoursOnly: true
    }).subscribe({
      next: slots => { if (this.timingKey() === key) this.suggestions.set({ key, slots }); },
      error: () => { if (this.timingKey() === key) this.suggestions.set({ key, slots: null }); }
    });
  }

  /** The people busy at the typed time: "you" and / or guests. null while it is not known. */
  private busyNow(): { me: boolean; guests: UserAvailabilityDto[] } | null {
    const known = this.availability();
    if (!known || known.key !== this.timingKey() || !known.people) return null;

    const start = this.typedStart().getTime();
    const end = start + this.minutes() * MINUTE;
    const isBusy = (person: UserAvailabilityDto) => (person.busy ?? []).some(busy =>
      new Date(busy.start).getTime() < end && new Date(busy.end).getTime() > start);

    return {
      me: known.people.some(person => person.userId === this.myId && isBusy(person)),
      guests: known.people.filter(person => person.userId !== this.myId && isBusy(person))
    };
  }

  /** The real reasons the typed time may not suit; empty when there are none. */
  private readonly reasons = computed<NotePart[]>(() => {
    if (!this.timingKey()) return [];
    const settings = this.calendarData.settings();
    const zone = this.zone();
    const start = this.typedStart();
    const end = new Date(start.getTime() + this.minutes() * MINUTE);
    const parts: NotePart[] = [];

    if (settings) {
      const day = todayIn(start, zone);
      const weekday = weekdayOf(day);
      if (settings.workDays?.length && !(settings.workDays as string[]).includes(WEEKDAY_NAMES[weekday])) {
        const ahead = daysBetween(this.today(), day);
        const named = { weekday: strong(weekdayName(weekday)) };
        parts.push(...sentenceParts(ahead === 0 ? t('Today is {weekday}, outside your working week.', named)
          : ahead === 1 ? t('Tomorrow is {weekday}, outside your working week.', named)
          : t('That day is {weekday}, outside your working week.', named)));
      } else {
        const from = this.workStart();
        const to = this.workEnd();
        const startsAt = zonedParts(start, zone);
        const endsAt = zonedParts(end, zone);
        const startMinutes = startsAt.hour * 60 + startsAt.minute;
        const endMinutes = sameDay(todayIn(end, zone), day) ? endsAt.hour * 60 + endsAt.minute : 24 * 60;
        if (startMinutes < from.hour * 60 + from.minute || endMinutes > to.hour * 60 + to.minute) {
          parts.push(...sentenceParts(t('{range} is outside your working hours ({hours}).', {
            range: strong(`${this.time(start)} – ${this.time(end)}`),
            hours: `${this.time(this.instant(day, from))} – ${this.time(this.instant(day, to))}`
          })));
        }
      }
    }

    const busy = this.busyNow();
    if (busy?.me) parts.push(...sentenceParts(t('You already have something at that time.')));
    if (busy?.guests.length) {
      const names = this.nameList(busy.guests.map(person => this.firstNameOf(person)));
      parts.push(...sentenceParts(busy.guests.length > 1
        ? t('{names} are busy at that time.', { names })
        : t('{name} is busy at that time.', { name: names })));
    }
    return parts;
  });

  private firstNameOf(person: UserAvailabilityDto): string {
    return (person.fullName || t('A guest')).split(/\s+/)[0];
  }

  // ── The cards of the preview ───────────────────────────────────────────────

  private whenFact(): Fact {
    const parsed = this.parsed();
    const start = this.start();
    const end = this.end();
    const notes: string[] = [];
    if (this.slot()) notes.push(t('Moved from {day}', { day: this.shortDay(this.typedStart()) }));
    else if (!parsed.time) notes.push(t('No time given'));
    if (parsed.repeat && !this.phone()) notes.push(this.repeatLabel());
    if (parsed.place && this.phone()) notes.push(parsed.place);
    if (this.prefs.hijriDates()) notes.push(hijriFullLabel(start, this.zone(), this.prefs.hijriCalendar()));
    return {
      key: 'When', label: t('When'), tone: 'when',
      value: `${this.dayLabel(start)} · ${this.time(start)} – ${this.time(end)}`, note: notes.join(' · ')
    };
  }

  private withFact(): Fact {
    const people = this.parsed().people;
    if (!people.length) {
      return { key: 'With', label: t('With'), tone: 'who', value: t('Just you'), note: t('Add someone by typing their name') };
    }

    const value = people.length > 2
      ? tCount(people.length - 1, '{name} and {n} more', '{name} and {n} more', { name: people[0].name })
      : this.nameList(people.map(person => person.name));
    return { key: 'With', label: t('With'), tone: 'who', value, note: this.withNote() };
  }

  /** "Free then · 2 h behind you in London", from the person's real calendar and time zone. */
  private withNote(): string {
    const people = this.parsed().people;
    const known = this.availability();
    const current = known && known.key === this.timingKey() ? known : null;
    if (!current) return t('Checking their calendar…');
    if (!current.people) return t('Their free time could not be checked');

    const guests = current.people.filter(person => person.userId !== this.myId);
    const busy = this.busyNow()?.guests ?? [];
    // An alternative from the note is a time at which everyone is free.
    const moved = !!this.slot();

    if (people.length === 1) {
      const state = moved || !busy.length ? t('Free then') : t('Busy then');
      const zone = guests[0] ? this.zoneNote(guests[0]) : '';
      return [state, zone].filter(Boolean).join(' · ');
    }
    if (moved || !busy.length) return t('Everyone is free then');
    const names = this.nameList(busy.map(person => this.firstNameOf(person)));
    return busy.length > 1 ? t('{names} are busy then', { names }) : t('{name} is busy then', { name: names });
  }

  /** "2 h behind you in London": the difference between two clocks at the event's start. */
  private zoneNote(person: UserAvailabilityDto): string {
    if (!isValidTimeZone(person.timeZone)) return '';
    const at = this.start();
    const offset = (zone: string) => {
      const parts = zonedParts(at, zone);
      return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - at.getTime()) / MINUTE;
    };
    const difference = Math.round(offset(person.timeZone) - offset(this.zone()));
    const city = placeForZone(person.timeZone)?.city ?? timeZoneCity(person.timeZone);
    if (!difference) return city ? t('same time as you in {city}', { city }) : t('same time as you');
    const duration = formatDuration(Math.abs(difference));
    if (difference < 0) return city ? t('{duration} behind you in {city}', { duration, city }) : t('{duration} behind you', { duration });
    return city ? t('{duration} ahead of you in {city}', { duration, city }) : t('{duration} ahead of you', { duration });
  }

  private lengthFact(): Fact {
    const notes: string[] = [];
    if (this.parsed().minutes === null) notes.push(t('Your default length'));
    const prayer = this.prayerNote();
    if (prayer) notes.push(prayer);
    return { key: 'Length', label: t('Length'), tone: 'len', value: this.longMinutes(this.minutes()), note: notes.join(' · ') };
  }

  /** "Ends before Maghrib (16:59)", when the prayer-times layer is on and the place is known. */
  private prayerNote(): string {
    const zone = this.zone();
    const place = placeForZone(zone);
    if (!place || !this.prefs.prayerTimes()) return '';

    const start = this.start();
    const end = this.end();
    const method = this.prefs.prayerMethod() ?? place.method;
    const day = todayIn(start, zone);
    const next = addDays(day, 1);
    const times: PrayerTime[] = [
      ...prayerTimes(day.year, day.month, day.day, place, method),
      ...prayerTimes(next.year, next.month, next.day, place, method)
    ].filter(prayer => prayer.name !== 'Sunrise');

    const during = times.find(prayer => prayer.at.getTime() > start.getTime() && prayer.at.getTime() < end.getTime());
    if (during) return t('Runs across {prayer} ({time})', { prayer: prayerLabel(during.name), time: this.time(during.at) });
    const after = times.find(prayer => prayer.at.getTime() >= end.getTime());
    return after ? t('Ends before {prayer} ({time})', { prayer: prayerLabel(after.name), time: this.time(after.at) }) : '';
  }

  private whereFact(): Fact {
    const parsed = this.parsed();
    const label = t('Where');
    if (!parsed.place) {
      return { key: 'Where', label, tone: 'where', value: t('No place yet'), note: t('Add one with “at” or “on Meet”') };
    }
    return {
      key: 'Where', label, tone: 'where', value: parsed.place,
      note: parsed.online ? t('Saved as the place. Add the link in the details') : t('Saved as the place')
    };
  }

  private repeatFact(): Fact {
    const label = t('Repeats');
    return this.parsed().repeat
      ? { key: 'Repeats', label, tone: 'rep', value: this.repeatLabel(), note: t('Until you stop it') }
      : { key: 'Repeats', label, tone: 'rep', value: t('Does not repeat'), note: t('Add “every week” to repeat it') };
  }

  private calendarFact(): Fact {
    const parsed = this.parsed();
    const reminder = this.calendarData.settings()?.defaultReminderMinutes;
    const note = reminder === null || reminder === undefined ? t('No reminder')
      : reminder === 0 ? t('Reminder when it starts')
      : t('Reminder {duration} before', { duration: formatDuration(reminder) });
    return {
      key: 'Calendar', label: t('Calendar'), tone: 'proj',
      value: parsed.calendar?.name ?? this.calendarData.defaultCalendar()?.name ?? t('Your calendar'),
      note: parsed.project ? `${parsed.project.name} · ${note}` : note
    };
  }

  private dueFact(): Fact {
    const parsed = this.parsed();
    const due = this.due();
    const label = t('Due');
    if (!due) return { key: 'Due', label, tone: 'when', value: t('No due date'), note: t('Add a day: “by Sunday”') };
    const notes: string[] = [];
    if (!parsed.time) notes.push(t('End of your working day'));
    if (this.prefs.hijriDates()) notes.push(hijriFullLabel(due, this.zone(), this.prefs.hijriCalendar()));
    return {
      key: 'Due', label, tone: 'when',
      value: parsed.time ? `${this.dayLabel(due)} · ${this.time(due)}` : this.dayLabel(due),
      note: notes.join(' · ')
    };
  }

  private forFact(): Fact {
    const { people, assignee } = this.parsed();
    const label = t('For@@who');
    if (assignee) return { key: 'For', label, tone: 'who', value: assignee.name, note: t('They are told when you add it') };
    return {
      key: 'For', label, tone: 'who', value: t('You'),
      // "With Omar" is company, not a handover.
      note: people.length
        ? t('Write “to {name}” to hand it over', { name: people[0].name.split(/\s+/)[0] })
        : t('Write “to” and a name to hand it over')
    };
  }

  private estimateFact(): Fact {
    const estimate = this.estimate();
    const planned = this.plannedStart();
    const label = t('Estimate');
    if (planned) {
      return {
        key: 'Estimate', label, tone: 'len', value: this.longMinutes(estimate ?? 30),
        note: t('Planned for {day} {time}', { day: this.shortDay(planned), time: this.time(planned) })
      };
    }
    return estimate
      ? { key: 'Estimate', label, tone: 'len', value: this.longMinutes(estimate), note: t('Used when you plan your day') }
      : { key: 'Estimate', label, tone: 'len', value: t('No estimate'), note: num(t('Add one like ~30m')) };
  }

  private projectFact(): Fact {
    const parsed = this.parsed();
    const label = t('Project');
    if (!parsed.project) {
      return {
        key: 'Project', label, tone: 'proj', value: t('No project'),
        note: parsed.calendar ? t('Calendars are for events: use a project name') : t('Add one with #name')
      };
    }
    const group = this.myProjects().find(candidate => candidate.id === parsed.project!.id);
    const open = group ? Math.max(0, group.taskCount - (group.completedTaskCount ?? 0)) : null;
    return {
      key: 'Project', label, tone: 'proj', value: parsed.project.name,
      note: open === null ? '' : tCount(open, '{n} open task', '{n} open tasks')
    };
  }

  // ── Phone shortcuts ────────────────────────────────────────────────────────

  /** Writes `word` in place of the day in the sentence, or adds it. */
  private setDayWord(word: string) {
    const piece = this.parsed().pieces.find(candidate => candidate.kind === 'when' && candidate.part === 'day');
    const lead = piece && this.parsed().deadline ? /^\S+\s+/u.exec(piece.text)?.[0] ?? '' : '';
    this.replacePart('when', 'day', lead + word);
  }

  /** Replaces the first part of that kind with `value`, adds it when there is none, removes it when `value` is empty. */
  private replacePart(kind: PieceKind, part: string | undefined, value: string) {
    const text = this.text();
    const piece = this.parsed().pieces.find(candidate =>
      candidate.kind === kind && (part === undefined ? candidate.part !== 'estimate' : candidate.part === part));

    let next: string;
    if (piece) next = `${text.slice(0, piece.start)}${value}${text.slice(piece.end)}`;
    else if (value) next = `${text.trimEnd()} ${value}`;
    else return;
    this.write(next.replace(/\s{2,}/g, ' ').trimStart());
  }

  /** The first day of the user's working week (Sunday for a Sunday to Thursday week). */
  private firstWorkDay(): number {
    const settings = this.calendarData.settings();
    const first = this.calendarData.weekStart();
    for (let step = 0; step < 7; step++) {
      const weekday = (first + step) % 7;
      if (!settings?.workDays?.length || (settings.workDays as string[]).includes(WEEKDAY_NAMES[weekday])) return weekday;
    }
    return first;
  }

  /**
   * "Plan it for me": finds the first free stretch of the due day (today when no
   * day is given) that is long enough, around that day's events, and plans the
   * task there.
   */
  private togglePlanForMe() {
    if (this.plannedStart()) {
      this.plannedStart.set(null);
      return;
    }
    if (this.planning()) return;

    const zone = this.zone();
    const now = new Date();
    const today = todayIn(now, zone);
    const day = this.parsed().day ?? today;
    const dayStart = this.instant(day, { hour: 0, minute: 0 });
    const dayEnd = this.instant(addDays(day, 1), { hour: 0, minute: 0 });
    const minutes = this.estimate() ?? 30;
    const minuteOf = (date: Date) => Math.round((date.getTime() - dayStart.getTime()) / MINUTE);

    this.planning.set(true);
    this.calendarApi.getFeed(dayStart, dayEnd, false).pipe(catchError(() => of([] as CalendarItemDto[]))).subscribe(items => {
      this.planning.set(false);
      const meetings = items
        .filter(item => item.kind === 'Event' && !item.isAllDay && item.myResponse !== 'Declined')
        .map(item => ({ start: minuteOf(new Date(item.start)), end: minuteOf(new Date(item.end)) }));
      const from = this.workStart();
      const to = this.workEnd();
      const lunch = this.prefs.protectLunch()
        ? { start: this.minutesOf(this.prefs.lunchStart()), end: this.minutesOf(this.prefs.lunchEnd()) }
        : null;

      const blocked = blockedStretches({
        dayStart: from.hour * 60 + from.minute, dayEnd: to.hour * 60 + to.minute, notBefore: 0,
        meetings, bufferAfterMeetings: this.prefs.bufferAfterMeetings() ? 10 : 0, lunch,
        prayers: [], prayerPause: 0, step: 5
      });
      const earliest = Math.max(from.hour * 60 + from.minute, sameDay(day, today) ? minuteOf(now) : 0);
      const start = nearestStart(earliest, minutes, blocked, earliest, to.hour * 60 + to.minute, 5);
      if (start === null) {
        this.error.set(t('No free {length} in your working hours on {day}.', { length: this.longMinutes(minutes), day: this.shortDay(dayStart) }));
        return;
      }
      this.plannedStart.set(new Date(dayStart.getTime() + start * MINUTE));
    });
  }

  // ── Wording ────────────────────────────────────────────────────────────────

  private instant(day: DayRef, time: ClockTime): Date {
    return zonedTimeToUtc(day.year, day.month, day.day, time.hour, time.minute, this.zone());
  }

  private clockOf(value: string | undefined, fallbackHour: number): ClockTime {
    const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
    return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: fallbackHour, minute: 0 };
  }

  private minutesOf(value: string): number {
    const time = this.clockOf(value, 0);
    return time.hour * 60 + time.minute;
  }

  time(date: Date): string {
    return formatTimeInZone(date, this.zone(), this.hour24());
  }

  /** "Sun 15 Nov" */
  private dayLabel(date: Date): string {
    const parts = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: this.zone() })
      .formatToParts(date);
    const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')} ${part('month')}`;
  }

  /** "Sun 15" */
  private shortDay(date: Date): string {
    const parts = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', timeZone: this.zone() }).formatToParts(date);
    const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')}`;
  }

  /** "Friday, 13 November" */
  private longDay(date: Date): string {
    const parts = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: this.zone() })
      .formatToParts(date);
    const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
    return t('{weekday}, {day} {month}', { weekday: part('weekday'), day: part('day'), month: part('month') });
  }

  /** "Sun 15 · 15:00", for a suggested time. */
  slotLabel(slot: TimeSlotDto): string {
    const start = new Date(slot.start);
    return `${this.shortDay(start)} · ${this.time(start)}`;
  }

  /** "45 minutes", "1 hour", "1 h 30 min" */
  private longMinutes(minutes: number): string {
    if (minutes < 60) return tCount(minutes, '{n} minute', '{n} minutes');
    if (minutes % 60 === 0) return tCount(minutes / 60, '{n} hour', '{n} hours');
    return formatDuration(minutes);
  }

  /** "Every Friday", "Every week", "Every 2 weeks" */
  private repeatLabel(): string {
    const repeat = this.parsed().repeat;
    if (!repeat) return '';
    const day = this.parsed().day;
    if (repeat.interval <= 1 && repeat.pattern === 'Weekly' && day) return t('Every {weekday}', { weekday: weekdayName(weekdayOf(day)) });
    switch (repeat.pattern) {
      case 'Daily': return tCount(repeat.interval, 'Every day', 'Every {n} days');
      case 'Weekly': return tCount(repeat.interval, 'Every week', 'Every {n} weeks');
      case 'Monthly': return tCount(repeat.interval, 'Every month', 'Every {n} months');
      case 'Yearly': return tCount(repeat.interval, 'Every year', 'Every {n} years');
      default: return '';
    }
  }

  /** "Omar", "Omar and Sara", "Omar, Sara and Lina" */
  private nameList(names: string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    // Arabic joins every name with "و": the browser knows the rule.
    if (isArabic()) return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(names);
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
}
