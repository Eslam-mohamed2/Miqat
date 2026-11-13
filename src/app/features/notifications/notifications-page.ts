import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, OnInit, afterNextRender,
  computed, effect, inject, signal, untracked, viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { NotificationService } from '../../core/services/notification.service';
import { MentionService } from '../../core/services/mention.service';
import { FriendService } from '../../core/services/friend.service';
import { EventService } from '../../core/services/event.service';
import { CommentService } from '../../core/services/comment.service';
import { TaskService } from '../../core/services/task.service';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { CalendarService } from '../../core/services/calendar.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/services/ui.service';
import { NoticeService } from '../../core/services/notice.service';
import { InboxCountService } from '../../core/services/inbox-count.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AttendeeStatus, CalendarItemDto, CommentDto, EventDto, FriendshipDto, GroupDto, MentionDto, MentionableUserDto,
  NotificationDto, TaskDto, UserProfileDto
} from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { notificationTarget } from '../../core/utils/notification-target';
import {
  allDaySpan, formatTimeInZone, isValidTimeZone, timeZoneCity, zonedParts, zonedTimeToUtc
} from '../../core/utils/time-zone';
import { placeForZone, prayerLabel, prayerTimes } from '../../core/utils/prayer-times';
import { estimateMinutes, formatDuration } from '../../core/utils/task-estimate';
import { addDays, todayIn, weekdayOf } from '../../core/utils/quick-parse';
import { minutesCovered } from '../../core/utils/day-plan';
import { formatNumber, isArabic, locale, num, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../core/i18n/t.pipe';
import {
  InboxItem, InboxTab, KINDS, TABS, WeekRecap, buildInbox, initialsOf, mentionDiscussion, mentionTaskId, mentionType,
  notificationHeading, notificationSentence, notificationTopic, tabOf, weekNumberOf
} from './inbox-model';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PAGE_SIZE = 40;
/** How long "Archived" can be taken back before the item is really removed. */
const ARCHIVE_DELAY_MS = 5000;
/** The names the API uses for the days of the week (working days). Never shown. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** How an event repeats, as the end of "Sun 15 Nov · 15:00 – 15:45 · repeats weekly". */
const REPEATS: Record<string, string> = {
  Daily: 'repeats daily', Weekly: 'repeats weekly', Monthly: 'repeats monthly', Yearly: 'repeats yearly'
};

interface ListRow {
  key: string;
  initials: string;
  picture: string | null;
  /** From Miqat itself rather than from a person. */
  system: boolean;
  glyph: string;
  tone: string;
  title: string;
  snippet: string;
  when: string;
  unread: boolean;
  on: boolean;
}

/** The comments under a mention, and who can be @mentioned in a reply. */
interface Thread {
  key: string;
  taskId: string | null;
  task: TaskDto | null;
  comments: CommentDto[];
  /** Comments before the ones shown. */
  earlier: number;
  mentionable: MentionableUserDto[];
  loading: boolean;
}

/** The user's own day around an invitation. */
interface Around {
  key: string;
  items: CalendarItemDto[];
  organizerZone: string | null;
  loading: boolean;
}

/** The task, event, project or person an update is about. */
interface Subject {
  key: string;
  task: TaskDto | null;
  event: EventDto | null;
  group: GroupDto | null;
  loading: boolean;
}

/**
 * The Inbox (design/miqat-2.0: V2-Inbox): notifications, mentions, event
 * invitations and friend requests in one list, with a reading pane where each can
 * be answered. See inbox-model.ts for how the four sources become one list.
 *
 * Snooze and the "seen" state of items the server keeps no read state for live in
 * the browser (LocalPrefsService).
 */
@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [RouterLink, TPipe, TCountPipe, NumPipe],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsPage implements OnInit {
  private notificationApi = inject(NotificationService);
  private mentionApi = inject(MentionService);
  private friendApi = inject(FriendService);
  private eventApi = inject(EventService);
  private commentApi = inject(CommentService);
  private taskApi = inject(TaskService);
  private groupApi = inject(GroupService);
  private users = inject(UserService);
  private schedule = inject(ScheduleService);
  private calendarApi = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private realtime = inject(RealtimeService);
  private ui = inject(UiService);
  private notices = inject(NoticeService);
  private inboxCount = inject(InboxCountService);
  private prefs = inject(LocalPrefsService);
  private toasts = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly myId = inject(AuthService).getCurrentUserId();

  private replyRef = viewChild<ElementRef<HTMLInputElement>>('replyBox');
  private snoozeRef = viewChild<ElementRef<HTMLElement>>('snoozeMenu');

  readonly tabs = TABS;

  // ── The four sources ───────────────────────────────────────────────────────
  readonly notifications = signal<NotificationDto[]>([]);
  readonly mentions = signal<MentionDto[]>([]);
  readonly invitations = signal<EventDto[]>([]);
  readonly requests = signal<FriendshipDto[]>([]);
  private readonly recap = signal<WeekRecap | null>(null);

  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly errorMessage = signal('');
  private readonly totalCount = signal(0);
  private pageIndex = 0;
  readonly hasMore = computed(() => this.notifications().length < this.totalCount());

  // ── Kept in the browser ────────────────────────────────────────────────────
  /** Item key to the moment it comes back. */
  private readonly snoozed = this.prefs.value<Record<string, number>>('inbox.snoozed', {});
  private readonly archived = this.prefs.value<string[]>('inbox.archived', []);
  private readonly seen = this.prefs.value<string[]>('inbox.seen', []);
  /** Archived a moment ago and still possible to take back. */
  private readonly leaving = signal<ReadonlySet<string>>(new Set());
  private pendingArchive = new Map<string, { timer: ReturnType<typeof setTimeout>; finish: () => void }>();

  // ── What is on screen ──────────────────────────────────────────────────────
  readonly tab = signal<InboxTab>('all');
  readonly selectedKey = signal<string | null>(null);
  /** Below this width the list and the reading pane take turns. */
  readonly narrow = signal(false);
  readonly snoozeOpen = signal(false);
  private readonly now = signal(Date.now());
  private readonly brokenPictures = signal<ReadonlySet<string>>(new Set());

  private readonly zone = this.users.timeZone;
  private readonly hour24 = this.calendarData.use24HourClock;

  /** Everything that is not archived, newest first; an item back from a snooze leads. */
  private readonly live = computed(() => {
    const now = this.now();
    const snoozed = this.snoozed();
    const gone = new Set([...this.archived(), ...this.leaving()]);
    const items = buildInbox({
      notifications: this.notifications(), mentions: this.mentions(), invitations: this.invitations(),
      requests: this.requests(), recap: this.recap(), seen: new Set(this.seen()), now
    }).filter(item => !gone.has(item.key) && !(snoozed[item.key] > now));

    const back = (item: InboxItem) => snoozed[item.key] !== undefined;
    return [...items.filter(back), ...items.filter(item => !back(item))];
  });

  private readonly shown = computed(() => {
    const tab = this.tab();
    return this.live().filter(item => tab === 'all' || tabOf(item) === tab);
  });

  readonly counts = computed(() => {
    const live = this.live();
    const counts: Record<InboxTab, number> = { all: live.length, mentions: 0, invites: 0, requests: 0, updates: 0 };
    for (const item of live) counts[tabOf(item)]++;
    return counts;
  });

  readonly unreadLabel = computed(() => {
    const unread = this.live().filter(item => this.isUnread(item)).length;
    return unread ? tCount(unread, '{n} unread', '{n} unread') : t('All read');
  });
  readonly anyUnread = computed(() => this.live().some(item => this.isUnread(item)));

  /** Today, Yesterday, Earlier - by the day each item arrived on. */
  readonly groups = computed(() => {
    const zone = this.zone();
    const today = todayIn(new Date(this.now()), zone);
    const startOfToday = zonedTimeToUtc(today.year, today.month, today.day, 0, 0, zone).getTime();
    const selected = this.selectedKey();
    const snoozed = this.snoozed();

    const groups: { title: string; rows: ListRow[] }[] = [
      { title: t('Today'), rows: [] }, { title: t('Yesterday'), rows: [] }, { title: t('Earlier@@older items'), rows: [] }
    ];
    for (const item of this.shown()) {
      const returned = snoozed[item.key] !== undefined;
      const index = returned || item.at >= startOfToday ? 0 : item.at >= startOfToday - DAY ? 1 : 2;
      groups[index].rows.push(this.row(item, item.key === selected, returned));
    }
    return groups.filter(group => group.rows.length);
  });

  readonly selected = computed(() => this.live().find(item => item.key === this.selectedKey()) ?? null);

  // ── The reading pane ───────────────────────────────────────────────────────
  private readonly thread = signal<Thread | null>(null);
  private readonly around = signal<Around | null>(null);
  private readonly subject = signal<Subject | null>(null);
  private readonly profile = signal<{ key: string; profile: UserProfileDto | null } | null>(null);
  /** Friend requests answered in this visit, so the pane can say what happened. */
  private readonly answered = signal<ReadonlyMap<string, 'accepted' | 'declined'>>(new Map());
  /** Invitations and requests answered in this visit, so a reload of the lists does not take them from under the reader. */
  private keptInvitations = new Map<string, EventDto>();
  private keptRequests = new Map<string, FriendshipDto>();
  readonly replyText = signal('');
  readonly busy = signal(false);
  readonly paneError = signal('');

  readonly detail = computed(() => {
    const item = this.selected();
    if (!item) return null;
    const look = KINDS[item.kind];
    return {
      item,
      key: item.key,
      kindLabel: item.label,
      tone: look.tone,
      // A recap is for a whole week: the day it became available says enough.
      when: item.recap ? this.dayLabel(new Date(item.at)) : this.longWhen(item.at),
      title: item.title,
      initials: initialsOf(item.actorName),
      picture: this.pictureOf(item),
      system: !item.actorName,
      replyLabel: item.actorName ? t('Reply to {name}', { name: item.actorName.split(/\s+/)[0] }) : t('Reply to them'),
      isThread: item.kind === 'mention' || item.kind === 'comment',
      isInvite: item.kind === 'invite' && !!item.event,
      isRequest: item.kind === 'request' && !!item.request,
      isRecap: item.kind === 'recap',
      isUpdate: item.kind === 'update' || item.kind === 'reminder'
    };
  });

  /** A mention: where it is, the comments there, and whether a reply can be posted. */
  readonly threadView = computed(() => {
    const item = this.selected();
    const thread = this.thread();
    if (!item || (item.kind !== 'mention' && item.kind !== 'comment')) return null;
    const current = thread?.key === item.key ? thread : null;
    const mention = item.mention;
    const isProject = mention ? mentionType(mention) === 'project' : !!mentionDiscussion(item);
    const name = current?.task?.title || mention?.entityName || item.notifications[0]?.linkedEntityName
      || (isProject ? t('Project') : t('Task'));
    const project = current?.task?.groupName;

    return {
      name,
      context: [name, isProject ? t('Project') : project || t('Task')].join(' · '),
      color: current?.task?.groupColor ?? null,
      loading: !current || current.loading,
      messages: (current?.comments ?? []).map(comment => ({
        id: comment.id,
        initials: initialsOf(comment.authorName ?? ''),
        name: comment.authorName || t('Someone'),
        when: this.longWhen(new Date(comment.createdAt).getTime()),
        text: comment.content
      })),
      earlier: current?.earlier ?? 0,
      canReply: !!current?.taskId,
      whyNot: isProject
        ? t('A reply is posted as a comment on a task, and this mention is on a project')
        : t('The task this mention is on could not be found')
    };
  });

  readonly inviteView = computed(() => {
    const item = this.selected();
    const event = item?.event;
    if (!item || !event) return null;

    const zone = this.zone();
    const { start, end } = this.occurrenceOf(event);
    const around = this.around();
    const current = around?.key === item.key ? around : null;
    const guests = (event.attendees ?? []).filter(guest => guest.userId !== this.myId).map(guest => guest.fullName || t('A guest'));

    const repeats = REPEATS[event.recurrence ?? ''] ? ` · ${t(REPEATS[event.recurrence])}` : '';
    const when = event.isAllDay
      ? `${this.dayLabel(this.allDayNoon(start, end))} · ${t('all day')}${repeats}`
      : `${this.dayLabel(start)} · ${this.time(start)} – ${this.time(end)}${repeats}`;

    let organizer = event.ownerName || t('Unknown');
    if (current?.organizerZone && current.organizerZone !== zone) {
      organizer = t('{name} · {city}, {time} their time', {
        name: organizer,
        city: placeForZone(current.organizerZone)?.city ?? timeZoneCity(current.organizerZone),
        time: formatTimeInZone(start, current.organizerZone, this.hour24())
      });
    }

    return {
      when,
      where: event.location || t('No place given'),
      organizer,
      guests: guests.length ? this.shortList(guests.map(name => name.split(/\s+/)[0]), 2) : t('Just you'),
      response: event.myResponse ?? 'Pending',
      strip: event.isAllDay ? null : this.strip(event, start, end, current),
      findTime: { event: event.id, with: event.ownerId, minutes: String(Math.round((end.getTime() - start.getTime()) / MINUTE)), title: event.title }
    };
  });

  readonly responses: { status: Exclude<AttendeeStatus, 'Pending'>; label: string }[] = [
    { status: 'Accepted', label: t('Going') },
    { status: 'Tentative', label: t('Maybe') },
    { status: 'Declined', label: t('Decline') }
  ];

  readonly requestView = computed(() => {
    const item = this.selected();
    const request = item?.request;
    if (!item || !request) return null;

    const loaded = this.profile();
    const profile = loaded?.key === item.key ? loaded.profile : null;
    const first = item.actorName.split(/\s+/)[0] || t('Someone');
    const bio = profile?.user.bio?.trim() ?? '';
    const facts: string[] = [];

    if (profile) {
      const theirZone = profile.user.timeZone;
      const place = (isValidTimeZone(theirZone) ? placeForZone(theirZone)?.city : null) || profile.user.country;
      if (place) facts.push(place);
      if (isValidTimeZone(theirZone)) facts.push(this.clockDifference(theirZone));
      const mutual = profile.mutualFriends ?? [];
      const count = profile.mutualFriendsCount ?? mutual.length;
      const names = mutual.slice(0, 3).map(person => person.fullName.split(/\s+/)[0]).join(t(', @@between names'));
      facts.push(!count ? t('No friends in common yet')
        : names ? tCount(count, '{n} friend in common: {names}', '{n} friends in common: {names}', { names })
        : tCount(count, '{n} friend in common', '{n} friends in common'));
    }

    const answer = this.answered().get(item.key);
    return {
      heading: bio && bio.length <= 48 ? `${item.actorName} · ${bio}` : item.actorName,
      facts: profile ? facts.join(' · ') : loaded?.key === item.key ? t('Their profile could not be loaded') : t('Loading their profile…'),
      about: bio.length > 48 ? bio : '',
      profileId: request.senderId,
      open: !answer,
      result: answer === 'accepted'
        ? t('You and {name} are now friends. You can see each other’s free and busy times.', { name: first })
        : answer === 'declined' ? t('Declined. {name} won’t be told.', { name: first }) : ''
    };
  });

  /** A reminder or an update: the thing it is about, with a way to open it. */
  readonly updateView = computed(() => {
    const item = this.selected();
    const n = item?.notifications[0];
    if (!item || !n) return null;

    const loaded = this.subject();
    const subject = loaded?.key === item.key ? loaded : null;
    const topic = notificationTopic(n);
    const eyebrow = topic.label;
    let title = topic.name || notificationHeading(n) || item.title;
    let line = (n.message ?? '').trim() ? notificationSentence(n) : '';
    let chip = '';

    const task = subject?.task;
    const event = subject?.event;
    const group = subject?.group;
    if (task) {
      title = task.title;
      const parts = [task.groupName || t('No project')];
      if (task.dueDate) parts.push(t('due {date}', { date: this.dayLabel(new Date(task.dueDate)) }));
      parts.push(this.statusLabel(task.status).toLowerCase());
      if (task.isBlocked) parts.push(t('blocked by another task'));
      if (task.subtaskCount) {
        parts.push(tCount(task.subtaskCount, '{done} of {n} subtasks done', '{done} of {n} subtasks done', { done: task.completedSubtaskCount ?? 0 }));
      }
      line = parts.filter(Boolean).join(' · ');
      if (task.startDate) {
        const start = new Date(task.startDate);
        const minutes = estimateMinutes(task);
        const placed = { day: this.shortDay(start), time: this.time(start) };
        chip = minutes
          ? t('On your calendar · {day} {time} – {end}', { ...placed, end: this.time(new Date(start.getTime() + minutes * MINUTE)) })
          : t('On your calendar · {day} {time}', placed);
      }
    } else if (event) {
      title = event.title;
      const { start, end } = this.occurrenceOf(event);
      line = [
        event.isAllDay
          ? `${this.dayLabel(this.allDayNoon(start, end))} · ${t('all day')}`
          : `${this.dayLabel(start)} · ${this.time(start)} – ${this.time(end)}`,
        event.location
      ].filter(Boolean).join(' · ');
      if (event.isOwner || event.myResponse === 'Accepted') {
        chip = event.isAllDay
          ? t('On your calendar · {day}', { day: this.shortDay(this.allDayNoon(start, end)) })
          : t('On your calendar · {day} {time}', { day: this.shortDay(start), time: this.time(start) });
      }
    } else if (group) {
      title = group.name;
      line = `${tCount(group.memberCount, '{n} member', '{n} members')} · ${tCount(group.taskCount, '{n} task', '{n} tasks')}`;
    }

    const cta = topic.kind === 'task' || topic.kind === 'mention' ? t('Open task')
      : topic.kind === 'project' ? t('Open project')
      : topic.kind === 'event' ? t('Open in calendar')
      : topic.kind === 'account' ? t('Open settings')
      : n.type === 'FriendRequestSent' ? t('Open requests')
      : topic.kind === 'person' ? t('Open profile')
      : '';

    return { eyebrow, title, line, chip, cta, loading: !!subject?.loading };
  });

  readonly recapView = computed(() => {
    const recap = this.selected()?.recap;
    if (!recap) return null;
    return {
      stats: [
        { label: t('Tasks done'), value: num(recap.tasksDone) },
        { label: t('In meetings'), value: this.hours(recap.meetingMinutes) },
        { label: t('Focus time'), value: this.hours(recap.focusMinutes) },
        { label: t('Plans approved'), value: t('{done} of {total}', { done: recap.plansCommitted, total: recap.workDays }) }
      ],
      sentence: recap.busiestDay
        ? t('{weekday} had the most meetings: {duration}. Focus time is what your planned task blocks added up to.',
            { weekday: recap.busiestDay, duration: formatDuration(recap.busiestMinutes) })
        : t('No meetings that week. Focus time is what your planned task blocks added up to.'),
      month: recap.monthLabel,
      monthKey: recap.monthKey
    };
  });

  /** "In 1 hour", "Tomorrow · 09:00" ... each with the moment the item comes back. */
  readonly snoozeChoices = computed(() => {
    const zone = this.zone();
    const now = this.now();
    const today = todayIn(new Date(now), zone);
    const start = this.clockOf(this.calendarData.settings()?.workDayStart, 9);
    const at = (ahead: number, hour: number, minute: number) => {
      const day = addDays(today, ahead);
      return zonedTimeToUtc(day.year, day.month, day.day, hour, minute, zone).getTime();
    };

    const choices: { label: string; until: number }[] = [{ label: t('In 1 hour'), until: now + HOUR }];
    const evening = at(0, 18, 0);
    if (evening - now > 2 * HOUR) choices.push({ label: t('This evening · {time}', { time: this.time(new Date(evening)) }), until: evening });
    const tomorrow = at(1, start.hour, start.minute);
    choices.push({ label: t('Tomorrow · {time}', { time: this.time(new Date(tomorrow)) }), until: tomorrow });

    // The next first day of a working week: a working day that follows a day off.
    const workDays = this.calendarData.settings()?.workDays as string[] | undefined;
    const weekStart = this.calendarData.weekStart();
    const works = (weekday: number) => !!workDays?.includes(WEEKDAY_NAMES[weekday]);
    for (let ahead = 2; ahead <= 8; ahead++) {
      const weekday = weekdayOf(addDays(today, ahead));
      const isFirst = workDays?.length ? works(weekday) && !works((weekday + 6) % 7) : weekday === weekStart;
      if (isFirst) {
        const until = at(ahead, start.hour, start.minute);
        choices.push({ label: t('Next week · {day} {time}', { day: this.shortDay(new Date(until)), time: this.time(new Date(until)) }), until });
        break;
      }
    }
    return choices;
  });

  constructor() {
    // The first snooze choice takes the focus when the choices open.
    effect(() => {
      this.snoozeRef()?.nativeElement.querySelector<HTMLElement>('button')?.focus();
    });

    // What the reading pane needs is fetched when an item is opened.
    effect(() => {
      const key = this.selectedKey();
      untracked(() => {
        this.replyText.set('');
        this.paneError.set('');
        this.snoozeOpen.set(false);
        const item = this.live().find(candidate => candidate.key === key);
        if (item) this.loadDetail(item);
      });
    });

    if (typeof window !== 'undefined' && window.matchMedia) {
      const query = window.matchMedia('(max-width: 1023.98px)');
      const update = () => this.narrow.set(query.matches);
      update();
      query.addEventListener('change', update);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', update));
    }
  }

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const wanted = params.get('tab') as InboxTab | null;
      this.tab.set(wanted && TABS.some(tab => tab.key === wanted) ? wanted : 'all');
    });

    this.load();
    if (!this.calendarData.settings()) this.calendarData.reloadLists();
    if (!this.users.currentUser()) this.users.getMe().pipe(catchError(() => of(null))).subscribe();

    // Reloading (rather than prepending the payload) keeps ids and read state
    // authoritative: the push carries no id.
    this.realtime.notification$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(true));
    this.realtime.eventChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load(true));

    // Snoozed items come back on their own.
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      // Anything archived a moment ago is final once the page is left.
      for (const pending of this.pendingArchive.values()) {
        clearTimeout(pending.timer);
        pending.finish();
      }
      this.pendingArchive.clear();
    });
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  /** `quiet` skips the loading shapes: used when a live push refreshes the list. */
  load(quiet = false) {
    this.pageIndex = 0;
    if (!quiet) this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({
      page: this.notificationApi.getPaged(0, PAGE_SIZE).pipe(catchError(err => {
        this.errorMessage.set(apiErrorMessage(err, t('Could not load notifications.')));
        return of(null);
      })),
      mentions: this.mentionApi.getMentions().pipe(catchError(() => of(null))),
      invitations: this.eventApi.getInvitations().pipe(catchError(() => of(null))),
      requests: this.friendApi.getPendingRequests().pipe(catchError(() => of(null)))
    }).subscribe(result => {
      // A list that failed keeps what it had: one failed call must not empty a tab.
      if (result.page) {
        this.notifications.set(result.page.items ?? []);
        this.totalCount.set(result.page.totalCount ?? result.page.items?.length ?? 0);
      }
      if (result.mentions) this.mentions.set(result.mentions);
      // The API lists what is still waiting; what was answered in this visit stays on the page.
      if (result.invitations) {
        const waiting = new Set(result.invitations.map(event => event.id));
        this.invitations.set([...result.invitations, ...[...this.keptInvitations.values()].filter(event => !waiting.has(event.id))]);
      }
      if (result.requests) {
        const waiting = new Set(result.requests.map(request => request.id));
        this.requests.set([...result.requests, ...[...this.keptRequests.values()].filter(request => !waiting.has(request.id))]);
      }
      this.loading.set(false);
      this.afterLoad();
      if (!quiet) this.loadRecap();
    });
  }

  loadMore() {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.notificationApi.getPaged(this.pageIndex + 1, PAGE_SIZE).subscribe({
      next: page => {
        this.pageIndex += 1;
        // Deduped by id: a notification created between two page fetches shifts
        // the pages and would otherwise appear twice.
        this.notifications.update(current => {
          const known = new Set(current.map(n => n.id));
          return [...current, ...(page.items ?? []).filter(n => !known.has(n.id))];
        });
        this.totalCount.set(page.totalCount ?? this.totalCount());
        this.loadingMore.set(false);
      },
      error: err => {
        this.loadingMore.set(false);
        this.errorMessage.set(apiErrorMessage(err, t('Could not load more notifications.')));
      }
    });
  }

  /** On a wide screen the first item is open to begin with, as in the design. */
  private afterLoad() {
    const live = this.live();
    this.forgetOld(live);
    if (this.selected() || this.narrow()) return;
    const first = this.shown()[0];
    if (first) this.select(first.key);
  }

  /** Snooze and "seen" entries of items that no longer exist are dropped. */
  private forgetOld(live: InboxItem[]) {
    if (this.hasMore()) return;
    const known = new Set([...live.map(item => item.key), ...Object.keys(this.snoozed()).filter(key => this.snoozed()[key] > this.now())]);
    const snoozed = Object.fromEntries(Object.entries(this.snoozed()).filter(([key]) => known.has(key)));
    if (Object.keys(snoozed).length !== Object.keys(this.snoozed()).length) this.snoozed.set(snoozed);
  }

  /**
   * "Your week in review": last week's numbers, counted here from the user's
   * tasks and calendar. Left out when nothing happened that week.
   */
  private loadRecap() {
    const zone = this.zone();
    const today = todayIn(new Date(), zone);
    const sinceWeekStart = (weekdayOf(today) - this.calendarData.weekStart() + 7) % 7;
    const thisWeek = addDays(today, -sinceWeekStart);
    const lastWeek = addDays(thisWeek, -7);
    const from = zonedTimeToUtc(lastWeek.year, lastWeek.month, lastWeek.day, 0, 0, zone);
    const to = zonedTimeToUtc(thisWeek.year, thisWeek.month, thisWeek.day, 0, 0, zone);
    const weekKey = `${lastWeek.year}-${String(lastWeek.month).padStart(2, '0')}-${String(lastWeek.day).padStart(2, '0')}`;
    if (this.archived().includes(`w:${weekKey}`)) return;

    forkJoin({
      tasks: this.taskApi.getTasks().pipe(catchError(() => of([] as TaskDto[]))),
      events: this.calendarApi.getFeed(from, to, false).pipe(catchError(() => of([] as CalendarItemDto[])))
    }).subscribe(({ tasks, events }) => {
      const inWeek = (value: string | null | undefined) => {
        const stamp = value ? new Date(value).getTime() : NaN;
        return !Number.isNaN(stamp) && stamp >= from.getTime() && stamp < to.getTime();
      };
      const tasksDone = tasks.filter(task => inWeek(task.completedAt)).length;
      const focusMinutes = tasks.filter(task => inWeek(task.startDate))
        .reduce((sum, task) => sum + (estimateMinutes(task) ?? 0), 0);

      // Minutes in meetings per day of that week, overlapping ones counted once.
      const perDay = new Map<number, { start: number; end: number }[]>();
      for (const item of events) {
        if (item.kind !== 'Event' || item.isAllDay || item.myResponse === 'Declined') continue;
        const start = new Date(item.start).getTime();
        const end = new Date(item.end).getTime();
        if (!(end > start)) continue;
        const day = Math.floor((start - from.getTime()) / DAY);
        if (day < 0 || day > 6) continue;
        perDay.set(day, [...(perDay.get(day) ?? []), { start: start / MINUTE, end: end / MINUTE }]);
      }
      let meetingMinutes = 0;
      let busiestDay: string | null = null;
      let busiestMinutes = 0;
      for (const [day, stretches] of perDay) {
        const minutes = Math.round(minutesCovered(stretches));
        meetingMinutes += minutes;
        if (minutes > busiestMinutes) {
          busiestMinutes = minutes;
          const busiest = addDays(lastWeek, day);
          busiestDay = new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' })
            .format(new Date(Date.UTC(busiest.year, busiest.month - 1, busiest.day)));
        }
      }

      if (!tasksDone && !meetingMinutes && !focusMinutes) return;

      const workDays = this.calendarData.settings()?.workDays?.length || 5;
      const committed = this.prefs.value<string[]>('plan.committedDays', [])();
      const lastDay = addDays(thisWeek, -1);
      const lastKey = `${lastDay.year}-${String(lastDay.month).padStart(2, '0')}-${String(lastDay.day).padStart(2, '0')}`;
      const middle = new Date(from.getTime() + 3 * DAY);
      this.recap.set({
        weekKey,
        weekNumber: weekNumberOf(lastWeek.year, lastWeek.month, lastWeek.day + 3),
        tasksDone, meetingMinutes, focusMinutes,
        plansCommitted: committed.filter(key => key >= weekKey && key <= lastKey).length,
        workDays,
        busiestDay, busiestMinutes,
        monthLabel: new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: zone }).format(middle),
        monthKey: `${lastWeek.year}-${String(lastWeek.month).padStart(2, '0')}-${String(lastWeek.day).padStart(2, '0')}`,
        at: to.toISOString()
      });
      this.afterLoad();
    });
  }

  private loadDetail(item: InboxItem) {
    if (item.kind === 'mention' || item.kind === 'comment') this.loadThread(item);
    else if (item.event) this.loadAround(item, item.event);
    else if (item.request) this.loadProfile(item, item.request);
    else if (item.notifications[0]) this.loadSubject(item, item.notifications[0]);
  }

  private loadThread(item: InboxItem) {
    const taskId = mentionTaskId(item);
    const key = item.key;
    if (!taskId) {
      this.thread.set({ key, taskId: null, task: null, comments: [], earlier: 0, mentionable: [], loading: false });
      return;
    }
    if (this.thread()?.key !== key) {
      this.thread.set({ key, taskId, task: null, comments: [], earlier: 0, mentionable: [], loading: true });
    }

    forkJoin({
      task: this.taskApi.getTaskById(taskId).pipe(catchError(() => of(null))),
      comments: this.commentApi.getForTask(taskId).pipe(catchError(() => of([] as CommentDto[]))),
      mentionable: this.commentApi.getMentionable(taskId).pipe(catchError(() => of([] as MentionableUserDto[])))
    }).subscribe(({ task, comments, mentionable }) => {
      if (this.selectedKey() !== key) return;
      // From the comment that mentions the user onward; without one to point at, the latest few.
      const author = item.mention?.mentionedByUserId ?? item.actorId;
      const linked = item.notifications.find(n => n.linkedCommentId)?.linkedCommentId
        ?? (item.mention && mentionType(item.mention) === 'comment' ? item.mention.entityId : null);
      let from = linked ? comments.findIndex(comment => comment.id === linked) : -1;
      if (from < 0 && author) {
        const near = comments
          .map((comment, index) => ({ index, gap: Math.abs(new Date(comment.createdAt).getTime() - item.at), mine: comment.authorId === author }))
          .filter(entry => entry.mine && entry.gap < 2 * MINUTE)
          .sort((a, b) => a.gap - b.gap)[0];
        from = near ? near.index : -1;
      }
      if (from < 0) from = Math.max(0, comments.length - 3);
      from = Math.max(from, comments.length - 8);
      this.thread.set({ key, taskId, task, comments: comments.slice(from), earlier: from, mentionable, loading: false });
    });
  }

  private loadAround(item: InboxItem, event: EventDto) {
    const key = item.key;
    const { start, end } = this.occurrenceOf(event);
    if (this.around()?.key !== key) this.around.set({ key, items: [], organizerZone: null, loading: true });
    const from = new Date(start.getTime() - 2 * HOUR);
    const to = new Date(Math.max(start.getTime() + 2 * HOUR, end.getTime() + 30 * MINUTE));

    forkJoin({
      items: this.calendarApi.getFeed(from, to, false).pipe(catchError(() => of([] as CalendarItemDto[]))),
      // The organizer's time zone comes with their free / busy times, when they are a contact.
      people: this.schedule.getAvailability([event.ownerId], start, end).pipe(catchError(() => of([])))
    }).subscribe(({ items, people }) => {
      if (this.selectedKey() !== key) return;
      const organizer = people.find(person => person.userId === event.ownerId);
      this.around.set({
        key, loading: false,
        items: items.filter(other => other.kind === 'Event' && other.id !== event.id && !other.isAllDay && other.myResponse !== 'Declined'),
        organizerZone: organizer && isValidTimeZone(organizer.timeZone) ? organizer.timeZone : null
      });
    });
  }

  private loadProfile(item: InboxItem, request: FriendshipDto) {
    const key = item.key;
    if (this.profile()?.key === key && this.profile()?.profile) return;
    this.users.getProfile(request.senderId).pipe(catchError(() => of(null))).subscribe(profile => {
      if (this.selectedKey() === key) this.profile.set({ key, profile });
    });
  }

  private loadSubject(item: InboxItem, n: NotificationDto) {
    const key = item.key;
    const entity = (n.linkedEntityType ?? '').toLowerCase();
    const id = n.linkedEntityId;
    const empty: Subject = { key, task: null, event: null, group: null, loading: false };
    if (!id || (entity !== 'taskitem' && entity !== 'event' && entity !== 'group') || n.type === 'EventCancelled') {
      this.subject.set(empty);
      return;
    }
    if (this.subject()?.key !== key) this.subject.set({ ...empty, loading: true });

    const done = (found: Partial<Subject>) => { if (this.selectedKey() === key) this.subject.set({ ...empty, ...found }); };
    if (entity === 'taskitem') this.taskApi.getTaskById(id).pipe(catchError(() => of(null))).subscribe(task => done({ task }));
    else if (entity === 'event') this.eventApi.getById(id).pipe(catchError(() => of(null))).subscribe(event => done({ event }));
    else this.groupApi.getGroupById(id).pipe(catchError(() => of(null))).subscribe(group => done({ group }));
  }

  // ── Choosing and reading ───────────────────────────────────────────────────

  chooseTab(tab: InboxTab) {
    this.router.navigate([], { queryParams: { tab: tab === 'all' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
    this.tab.set(tab);
    // The open item stays open when the new tab has it; otherwise the tab's first one opens.
    if (!this.narrow() && !this.shown().some(item => item.key === this.selectedKey())) {
      this.show(this.shown()[0]?.key ?? null);
      const first = this.selected();
      if (first) this.markRead(first);
    }
  }

  select(key: string) {
    this.show(key);
    const item = this.selected();
    if (item) this.markRead(item);
  }

  /** Narrow screens: back from the reading pane to the list. */
  closePane() {
    this.show(null);
  }

  /**
   * Opens an item, or none. An item that is back from a snooze keeps its place at
   * the top while it is open, and becomes an ordinary item once the user moves on.
   */
  private show(key: string | null) {
    const previous = this.selectedKey();
    if (previous && previous !== key) {
      const until = this.snoozed()[previous];
      if (until !== undefined && until <= Date.now()) {
        const rest = { ...this.snoozed() };
        delete rest[previous];
        this.snoozed.set(rest);
      }
    }
    this.selectedKey.set(key);
  }

  private isUnread(item: InboxItem): boolean {
    return item.unread || (this.snoozed()[item.key] !== undefined && item.key !== this.selectedKey());
  }

  private markRead(item: InboxItem) {
    const unreadNotifications = item.notifications.filter(n => !n.isRead);
    const mention = item.mention && !item.mention.isRead ? item.mention : null;
    const local = !item.notifications.length && !item.mention && !this.seen().includes(item.key);
    if (!unreadNotifications.length && !mention && !local) return;

    if (unreadNotifications.length) {
      const ids = new Set(unreadNotifications.map(n => n.id));
      this.notifications.update(list => list.map(n => (ids.has(n.id) ? { ...n, isRead: true } : n)));
    }
    if (mention) this.mentions.update(list => list.map(m => (m.id === mention.id ? { ...m, isRead: true } : m)));
    if (local) this.seen.set([...this.seen(), item.key].slice(-300));

    const calls = [
      ...unreadNotifications.map(n => this.notificationApi.markAsRead(n.id).pipe(catchError(() => of(null)))),
      ...(mention ? [this.mentionApi.markMentionAsRead(mention.id).pipe(catchError(() => of(null)))] : [])
    ];
    if (calls.length) forkJoin(calls).subscribe(() => this.inboxCount.refresh());
  }

  markAllRead() {
    if (!this.anyUnread()) return;
    const before = { notifications: this.notifications(), mentions: this.mentions() };
    this.notifications.update(list => list.map(n => ({ ...n, isRead: true })));
    this.mentions.update(list => list.map(m => ({ ...m, isRead: true })));
    this.seen.set([...new Set([...this.seen(), ...this.live().map(item => item.key)])].slice(-300));

    forkJoin([
      this.notificationApi.markAllAsRead(),
      this.mentionApi.markAllAsRead()
    ]).subscribe({
      next: () => this.inboxCount.refresh(),
      error: err => {
        this.notifications.set(before.notifications);
        this.mentions.set(before.mentions);
        this.errorMessage.set(apiErrorMessage(err, t('Could not mark all as read.')));
        this.inboxCount.refresh();
      }
    });
  }

  // ── Archive and snooze ─────────────────────────────────────────────────────

  /** The item after the given one in the list on screen, or the one before it. */
  private neighbour(key: string): string | null {
    const shown = this.shown();
    const index = shown.findIndex(item => item.key === key);
    return (shown[index + 1] ?? shown[index - 1])?.key ?? null;
  }

  /**
   * Archive: the item is marked read and leaves the list. Its notifications are
   * deleted, which cannot be undone on the server, so that waits until the
   * "Undo" on the toast has run out.
   */
  archive(item: InboxItem | null = this.selected()) {
    if (!item) return;
    const key = item.key;
    const next = this.neighbour(key);
    this.markRead(item);
    this.leaving.update(current => new Set(current).add(key));
    if (this.selectedKey() === key) {
      if (next && !this.narrow()) this.select(next);
      else this.selectedKey.set(null);
    }

    const finish = () => {
      this.pendingArchive.delete(key);
      // Mentions, invitations and requests have nothing to delete: they are remembered as archived here.
      if (item.mention || item.event || item.request || item.recap) {
        this.archived.set([...this.archived(), key].slice(-500));
      }
      const ids = new Set(item.notifications.map(n => n.id));
      if (ids.size) {
        this.notifications.update(list => list.filter(n => !ids.has(n.id)));
        this.totalCount.update(count => Math.max(0, count - ids.size));
        forkJoin(item.notifications.map(n => this.notificationApi.deleteNotification(n.id).pipe(catchError(() => of(null)))))
          .subscribe(() => this.inboxCount.refresh());
      }
      this.leaving.update(current => {
        const rest = new Set(current);
        rest.delete(key);
        return rest;
      });
    };

    this.pendingArchive.set(key, { timer: setTimeout(finish, ARCHIVE_DELAY_MS), finish });
    this.toasts.show(t('Archived'), {
      duration: ARCHIVE_DELAY_MS,
      undo: () => {
        const pending = this.pendingArchive.get(key);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pendingArchive.delete(key);
        this.leaving.update(current => {
          const rest = new Set(current);
          rest.delete(key);
          return rest;
        });
        if (!this.narrow()) this.select(key);
      }
    });
  }

  toggleSnooze() {
    if (!this.selected()) return;
    this.snoozeOpen.update(open => !open);
  }

  /** Hides the item until `until`; it then comes back at the top of the list. */
  snooze(until: number, item: InboxItem | null = this.selected()) {
    if (!item) return;
    const key = item.key;
    const next = this.neighbour(key);
    const before = this.snoozed();
    this.snoozeOpen.set(false);
    this.snoozed.set({ ...before, [key]: until });
    if (next && !this.narrow()) this.select(next);
    else this.selectedKey.set(null);

    const when = new Date(until);
    this.toasts.show(t('Snoozed until {day} {time}', { day: this.shortDay(when), time: this.time(when) }), {
      undo: () => {
        this.snoozed.set(before);
        if (!this.narrow()) this.selectedKey.set(key);
      }
    });
  }

  snoozeHour() {
    this.snooze(Date.now() + HOUR);
  }

  /** Arrow keys move through the snooze choices; Escape closes them. */
  onSnoozeKey(event: KeyboardEvent) {
    const buttons = Array.from(this.snoozeRef()?.nativeElement.querySelectorAll<HTMLElement>('button') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.snoozeOpen.set(false);
    }
  }

  // ── Keyboard: J K move, E archive, H snooze, R reply ───────────────────────

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement | null;
    // Typing somewhere, or a dialog on top of the page: the letters are not shortcuts.
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .cdk-overlay-container')) return;

    switch (event.key.toLowerCase()) {
      case 'j': this.move(1); break;
      case 'k': this.move(-1); break;
      case 'e': this.archive(); break;
      case 'h': this.toggleSnooze(); break;
      case 'r':
        if (!this.replyRef()) return;
        this.replyRef()!.nativeElement.focus();
        break;
      case 'escape':
        if (this.snoozeOpen()) this.snoozeOpen.set(false);
        else return;
        break;
      default: return;
    }
    event.preventDefault();
  }

  private move(step: 1 | -1) {
    const shown = this.shown();
    if (!shown.length) return;
    const index = shown.findIndex(item => item.key === this.selectedKey());
    const next = shown[index < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, index + step))];
    this.select(next.key);
    afterNextRender(() => this.host.nativeElement.querySelector('.item[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector });
  }

  // ── Mentions: reply, make it a task ────────────────────────────────────────

  onReplyInput(event: Event) {
    this.replyText.set((event.target as HTMLInputElement).value);
  }

  /** Posts the reply as a real comment on the task; "@Name" of someone who can be mentioned mentions them. */
  reply() {
    const thread = this.thread();
    const item = this.selected();
    const text = this.replyText().trim();
    if (!thread?.taskId || !item || thread.key !== item.key || this.busy()) return;
    // Nothing written yet: the button leads to the place to write it.
    if (!text) {
      this.replyRef()?.nativeElement.focus();
      return;
    }

    const lower = text.toLowerCase();
    const mentioned = thread.mentionable
      .filter(person => {
        const name = person.fullName.trim().toLowerCase();
        return lower.includes(`@${name}`) || lower.includes(`@${name.split(/\s+/)[0]}`);
      })
      .map(person => person.userId);

    this.busy.set(true);
    this.paneError.set('');
    this.commentApi.add(thread.taskId, text, mentioned).subscribe({
      next: comment => {
        this.busy.set(false);
        this.replyText.set('');
        if (this.thread()?.key === thread.key) {
          this.thread.update(current => current && { ...current, comments: [...current.comments, comment] });
        }
        this.toasts.show(t('Reply posted on the task'));
      },
      error: err => {
        this.busy.set(false);
        this.paneError.set(apiErrorMessage(err, t('The reply was not posted.')));
      }
    });
  }

  /** A new task from the mention: what was typed as the reply, or else the comment itself. */
  makeTask() {
    const thread = this.thread();
    const item = this.selected();
    if (!item || this.busy()) return;
    const current = thread?.key === item.key ? thread : null;

    const typed = this.replyText().trim();
    const said = current?.comments[0]?.content?.trim() ?? '';
    const about = current?.task?.title || item.mention?.entityName || '';
    const title = (typed || said || (about ? t('Follow up: {title}', { title: about }) : item.title)).replace(/\s+/g, ' ').slice(0, 200);
    const from = !item.actorName ? ''
      : about ? t('From {name}’s mention in “{title}”.', { name: item.actorName, title: about })
      : t('From {name}’s mention.', { name: item.actorName });

    const task: Partial<TaskDto> = {
      title,
      description: [from, typed && said ? said : ''].filter(Boolean).join('\n\n').slice(0, 1000),
      status: 'Pending',
      priority: 'Medium',
      tags: ''
    };
    if (current?.task?.groupId) task.groupId = current.task.groupId;

    this.busy.set(true);
    this.paneError.set('');
    this.taskApi.createTask(task).subscribe({
      next: created => {
        this.busy.set(false);
        if (typed) this.replyText.set('');
        this.toasts.show(t('Task added: “{title}”', { title: created?.title ?? title }), created?.id ? {
          undo: () => this.taskApi.deleteTask(created.id).subscribe({ error: () => {} })
        } : {});
      },
      error: err => {
        this.busy.set(false);
        this.paneError.set(apiErrorMessage(err, t('The task was not created.')));
      }
    });
  }

  // ── Invitations and friend requests ────────────────────────────────────────

  respond(status: Exclude<AttendeeStatus, 'Pending'>) {
    const item = this.selected();
    const event = item?.event;
    if (!item || !event || this.busy()) return;

    this.busy.set(true);
    this.paneError.set('');
    this.eventApi.respond(event.id, status).subscribe({
      next: updated => {
        this.busy.set(false);
        const answered: EventDto = { ...event, ...(updated ?? {}), myResponse: status };
        this.keptInvitations.set(event.id, answered);
        this.invitations.update(list => list.map(other => (other.id === event.id ? answered : other)));
        this.calendarData.reload();
        this.inboxCount.refresh();
      },
      error: err => {
        this.busy.set(false);
        this.paneError.set(apiErrorMessage(err, t('Your answer was not saved.')));
      }
    });
  }

  answerRequest(accept: boolean) {
    const item = this.selected();
    const request = item?.request;
    if (!item || !request || this.busy()) return;

    this.busy.set(true);
    this.paneError.set('');
    (accept ? this.friendApi.acceptRequest(request.id) : this.friendApi.rejectRequest(request.id)).subscribe({
      next: () => {
        this.busy.set(false);
        this.keptRequests.set(request.id, request);
        this.answered.update(current => new Map(current).set(item.key, accept ? 'accepted' : 'declined'));
        this.inboxCount.refresh();
      },
      error: err => {
        this.busy.set(false);
        this.paneError.set(apiErrorMessage(err, t('The request could not be answered.')));
      }
    });
  }

  // ── Opening what an item is about ──────────────────────────────────────────

  /** The task or project a mention is in, with a note on arrival saying which mention it was. */
  openMention() {
    const item = this.selected();
    if (!item) return;
    const taskId = mentionTaskId(item);
    const mention = item.mention;
    const where = this.threadView()?.name;
    const who = item.actorName || t('Someone');

    this.notices.show({
      icon: 'alternate_email', label: t('From your mentions'),
      text: where ? t('{name} mentioned you in {where}', { name: who, where }) : t('{name} mentioned you in a task', { name: who })
    });
    // Made in a project's discussion: that discussion, at the comment.
    const discussion = mentionDiscussion(item);
    if (discussion) {
      this.router.navigate(['/projects', discussion.projectId, 'discussion'], { queryParams: { comment: discussion.commentId } });
      return;
    }
    if (mention && mentionType(mention) === 'project' && mention.entityId) {
      this.ui.openProjectDetails(mention.entityId);
      return;
    }
    const comment = item.notifications.find(n => n.linkedCommentId)?.linkedCommentId;
    if (taskId) this.router.navigate(['/tasks', taskId], comment ? { queryParams: { comment } } : {});
    else this.router.navigate(['/tasks']);
  }

  /**
   * Opens what a notification is about - the task, project, event, person or
   * the friend-request list - and says on arrival which notification it was.
   */
  openUpdate() {
    const item = this.selected();
    const n = item?.notifications[0];
    if (!item || !n || this.busy()) return;

    const topic = notificationTopic(n);
    const sentence = notificationSentence(n);
    const arrive = (commands: unknown[], extras: { queryParams?: Record<string, string> } = {}) => {
      this.busy.set(false);
      this.notices.show({ icon: 'notifications', label: t('From your notifications'), text: sentence });
      this.router.navigate(commands, extras);
    };

    // Last resort, used by both steps below: the section the notification belongs to.
    const toSection = () => {
      switch (topic.kind) {
        case 'task':    arrive(['/tasks']); break;
        case 'mention': arrive(['/tasks']); break;
        case 'event':   arrive(['/calendar']); break;
        case 'account': arrive(['/settings']); break;
        case 'person':  arrive(n.triggeredByUserId ? ['/profile', n.triggeredByUserId] : ['/friends']); break;
        case 'project':
          // No page lists every project; the Projects panel does.
          this.busy.set(false);
          this.notices.show({ icon: 'notifications', label: t('From your notifications'), text: sentence });
          this.ui.toggleProjects(true);
          break;
        default:
          this.busy.set(false);
      }
    };

    // 1. The notification names its target outright: a task, a project, a calendar
    //    event (opened on the calendar) or a person.
    const target = notificationTarget(n);
    if (target) {
      arrive(target.commands, target.queryParams ? { queryParams: target.queryParams } : {});
      return;
    }

    // 2. No target on the notification (older ones were stored without one): find
    //    the task or project it names, rather than leaving the user on a whole list.
    if ((topic.kind === 'task' || topic.kind === 'project' || topic.kind === 'mention') && topic.name) {
      this.busy.set(true);
      forkJoin({
        tasks: this.taskApi.getTasks().pipe(catchError(() => of([] as TaskDto[]))),
        groups: this.groupApi.getGroups().pipe(catchError(() => of([] as GroupDto[])))
      }).subscribe(({ tasks, groups }) => {
        const wanted = topic.name!.trim().toLowerCase();
        const task = tasks.find(t => (t.title ?? '').trim().toLowerCase() === wanted);
        const group = groups.find(g => (g.name ?? '').trim().toLowerCase() === wanted);

        if (topic.kind !== 'project' && task) arrive(['/tasks', task.id]);
        else if (group) arrive(['/projects', group.id]);
        else if (task) arrive(['/tasks', task.id]);
        else toSection();
      });
      return;
    }

    // 3. Nothing more specific than the section it belongs to.
    toSection();
  }

  onPictureError(key: string) {
    this.brokenPictures.update(set => new Set(set).add(key));
  }

  // ── Wording ────────────────────────────────────────────────────────────────

  private row(item: InboxItem, on: boolean, returned: boolean): ListRow {
    const look = KINDS[item.kind];
    let snippet = item.snippet;
    if (item.event) {
      const { start, end } = this.occurrenceOf(item.event);
      snippet = [
        item.event.isAllDay
          ? `${this.dayLabel(this.allDayNoon(start, end))} · ${t('all day')}`
          : `${this.dayLabel(start)} · ${this.time(start)} – ${this.time(end)}`,
        item.event.location
      ].filter(Boolean).join(' · ');
    } else if (item.recap) {
      snippet = [
        tCount(item.recap.tasksDone, '{n} task done', '{n} tasks done'),
        t('{duration} in meetings', { duration: this.hours(item.recap.meetingMinutes) }),
        t('{duration} of focus', { duration: this.hours(item.recap.focusMinutes) })
      ].join(' · ');
    }

    return {
      key: item.key,
      initials: initialsOf(item.actorName),
      picture: this.pictureOf(item),
      system: !item.actorName,
      glyph: look.glyph,
      tone: look.tone,
      title: item.title,
      snippet,
      when: returned ? t('Snoozed') : this.shortWhen(item.at),
      unread: item.unread || (returned && !on),
      on
    };
  }

  private pictureOf(item: InboxItem): string | null {
    return item.actorPicture && !this.brokenPictures().has(item.key) ? item.actorPicture : null;
  }

  /** "20 min", "2 h", "Wed", "3 Nov" - as short as the list needs. */
  private shortWhen(at: number): string {
    const minutes = Math.floor((this.now() - at) / MINUTE);
    if (minutes < 1) return t('Now');
    if (minutes < 60) return t('{m} min', { m: minutes });
    if (minutes < 24 * 60) return t('{h} h', { h: Math.floor(minutes / 60) });
    const date = new Date(at);
    if (minutes < 7 * 24 * 60) return new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: this.zone() }).format(date);
    const parts = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: this.zone() }).formatToParts(date);
    const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
    return `${part('day')} ${part('month')}`;
  }

  /** "20 min ago", "Wed 11 Nov, 18:40" */
  private longWhen(at: number): string {
    const minutes = Math.floor((this.now() - at) / MINUTE);
    if (minutes < 1) return t('Just now');
    if (minutes < 24 * 60) {
      if (isArabic()) {
        // Arabic counts minutes and hours in its own forms: the browser knows them.
        const ago = new Intl.RelativeTimeFormat(locale(), { numeric: 'always', style: 'long' });
        return minutes < 60 ? ago.format(-minutes, 'minute') : ago.format(-Math.floor(minutes / 60), 'hour');
      }
      return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
    }
    const date = new Date(at);
    return t('{date}, {time}', { date: this.dayLabel(date), time: this.time(date) });
  }

  /** A task's status as the API names it ("In_progress"), in words. */
  private statusLabel(status: string | null | undefined): string {
    const words = (status ?? '').replace(/_/g, ' ');
    if (!words) return '';
    // "Pending" is also what a request that waits is called: the task meaning has its own entry.
    return words === 'Pending' ? t('Pending@@task') : t(words);
  }

  private time(date: Date): string {
    return formatTimeInZone(date, this.zone(), this.hour24());
  }

  /**
   * Noon on the first day of an all-day event. The event keeps the date it was
   * given in whatever zone it was made, so its day is not the day of its first instant.
   */
  private allDayNoon(start: Date, end: Date): Date {
    const span = allDaySpan(start, end, this.zone());
    return zonedTimeToUtc(span.year, span.month, span.day, 12, 0, this.zone());
  }

  /** "Sun 15 Nov" */
  private dayLabel(date: Date): string {
    const parts = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: this.zone() })
      .formatToParts(date);
    const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')} ${part('month')}`;
  }

  /** "Sun" */
  private shortDay(date: Date): string {
    return new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: this.zone() }).format(date);
  }

  /** 780 -> "13 h", 210 -> "3.5 h", 45 -> "45 min" */
  private hours(minutes: number): string {
    if (minutes < 60) return t('{m} min', { m: minutes });
    return minutes % 60
      ? t('{h} h', { h: formatNumber(minutes / 60, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
      : t('{h} h', { h: minutes / 60 });
  }

  /** "Mariam, Sara and 2 more" */
  private shortList(names: string[], shown: number): string {
    if (names.length <= shown + 1) {
      if (names.length <= 1) return names[0] ?? '';
      // Arabic joins every name with "و": the browser knows the rule.
      if (isArabic()) return new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(names);
      return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }
    const more = names.length - shown;
    return tCount(more, '{names} and {n} more', '{names} and {n} more', { names: names.slice(0, shown).join(t(', @@between names')) });
  }

  private clockOf(value: string | undefined, fallbackHour: number): { hour: number; minute: number } {
    const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
    return match ? { hour: Number(match[1]), minute: Number(match[2]) } : { hour: fallbackHour, minute: 0 };
  }

  /** "same time as you", "2 h behind you": another zone's clock against the user's, right now. */
  private clockDifference(theirZone: string): string {
    const at = new Date(this.now());
    const offset = (zone: string) => {
      const parts = zonedParts(at, zone);
      return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - at.getTime()) / MINUTE;
    };
    const difference = Math.round(offset(theirZone) - offset(this.zone()));
    if (!difference) return t('same time as you');
    const duration = formatDuration(Math.abs(difference));
    return difference < 0 ? t('{duration} behind you', { duration }) : t('{duration} ahead of you', { duration });
  }

  /** The date an invitation is for: the event's own, or for a repeating one its next date. */
  private occurrenceOf(event: EventDto): { start: Date; end: Date } {
    let start = new Date(event.startsAt);
    const length = new Date(event.endsAt).getTime() - start.getTime();
    const pattern = event.recurrence ?? 'None';
    const now = this.now();

    if (pattern !== 'None' && start.getTime() + length < now) {
      const interval = Math.max(1, event.recurrenceInterval || 1);
      const last = event.recurrenceEndDate ? new Date(event.recurrenceEndDate).getTime() : Number.POSITIVE_INFINITY;
      for (let guard = 0; guard < 2000 && start.getTime() + length < now; guard++) {
        const next = new Date(start);
        if (pattern === 'Daily') next.setUTCDate(next.getUTCDate() + interval);
        else if (pattern === 'Weekly') next.setUTCDate(next.getUTCDate() + 7 * interval);
        else if (pattern === 'Monthly') next.setUTCMonth(next.getUTCMonth() + interval);
        else next.setUTCFullYear(next.getUTCFullYear() + interval);
        if (next.getTime() > last) break;
        start = next;
      }
    }
    return { start, end: new Date(start.getTime() + length) };
  }

  /** "Your Sunday around it": the user's own events and the prayer times around the invitation. */
  private strip(event: EventDto, start: Date, end: Date, around: Around | null) {
    const zone = this.zone();
    const from = start.getTime() - 2 * HOUR;
    const to = Math.max(start.getTime() + 2 * HOUR, end.getTime() + 30 * MINUTE);
    const span = to - from;
    const share = (stamp: number) => ((Math.min(to, Math.max(from, stamp)) - from) / span) * 100;

    const others = (around?.items ?? []).map(item => ({
      item, start: new Date(item.start).getTime(), end: new Date(item.end).getTime()
    })).filter(other => other.end > from && other.start < to);

    const place = this.prefs.prayerTimes() ? placeForZone(zone) : null;
    const day = todayIn(start, zone);
    const next = addDays(day, 1);
    const prayers = place
      ? [...prayerTimes(day.year, day.month, day.day, place, this.prefs.prayerMethod() ?? place.method),
         ...prayerTimes(next.year, next.month, next.day, place, this.prefs.prayerMethod() ?? place.method)]
          .filter(prayer => prayer.name !== 'Sunrise')
      : [];
    const inWindow = prayers.filter(prayer => prayer.at.getTime() > from && prayer.at.getTime() < to);

    const clashes = others.filter(other => other.start < end.getTime() && other.end > start.getTime());
    const during = prayers.find(prayer => prayer.at.getTime() > start.getTime() && prayer.at.getTime() < end.getTime());
    const after = prayers.find(prayer => prayer.at.getTime() >= end.getTime());

    let verdict: string;
    if (!around || around.loading) verdict = t('Checking your calendar…');
    else if (clashes.length) {
      const title = clashes[0].item.title;
      verdict = clashes.length > 1
        ? tCount(clashes.length - 1, 'You have “{title}” at that time and {n} more.', 'You have “{title}” at that time and {n} more.', { title })
        : t('You have “{title}” at that time.', { title });
    } else if (during) {
      verdict = t('You’re free. It runs across {prayer} ({time}).', { prayer: prayerLabel(during.name), time: this.time(during.at) });
    } else if (after) {
      verdict = t('You’re free, and it ends before {prayer} ({time}).', { prayer: prayerLabel(after.name), time: this.time(after.at) });
    } else verdict = t('You’re free.');

    return {
      weekday: new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: zone }).format(start),
      blocks: others.map(other => ({
        label: `${other.item.title} · ${this.time(new Date(other.start))}`,
        left: share(other.start),
        width: share(other.end) - share(other.start),
        tone: other.item.color ?? null
      })),
      prayers: inWindow.map(prayer => share(prayer.at.getTime())),
      event: { title: event.title, left: share(start.getTime()), width: share(end.getTime()) - share(start.getTime()) },
      labels: [
        this.time(new Date(from)),
        ...inWindow.slice(0, 1).map(prayer => `${prayerLabel(prayer.name)} ${this.time(prayer.at)}`),
        this.time(start),
        this.time(new Date(to))
      ],
      verdict,
      good: !!around && !around.loading && !clashes.length,
      waiting: !around || around.loading
    };
  }
}
