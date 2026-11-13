import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { ChatConversation, ChatService } from '../../core/services/chat.service';
import { previewText } from '../../core/services/chat-text';
import { FriendService } from '../../core/services/friend.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { UserService } from '../../core/services/user.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { locale, num, t, tCount } from '../../core/i18n/i18n';
import { TCountPipe, TPipe } from '../../core/i18n/t.pipe';
import { formatTimeInZone, isValidTimeZone } from '../../core/utils/time-zone';
import { FriendshipDto, UserAvailabilityDto, UserDto } from '../../models/api.models';
import { UserMenu } from '../../layout/user-menu/user-menu';
import { ChatAvatar } from '../../shared/chat/chat-avatar';
import { PersonProfile, RelationChange } from '../profile/person-profile';
import { zoneCity } from '../profile/day-overlap';

/** The three lists of the left column. */
export type PeopleTab = 'friends' | 'requests' | 'blocked';

/** One person in a list, whichever endpoint they came from. */
export interface PersonCard {
  userId: string;
  /** The friendship row, needed to accept, decline, cancel or remove. Absent for suggestions. */
  friendshipId?: string;
  name: string;
  avatarUrl?: string | null;
  country?: string | null;
  /** When the friendship or the request was made. */
  since?: string | null;
}

/** How many people get a mutual-friends lookup (one request each). */
const MUTUALS_LIMIT = 16;
/** How many group chats the Friends list shows before "Show all". */
const GROUPS_SHOWN = 4;
const DAY_MS = 86_400_000;
/** A list that did not arrive is asked for again by itself: after this long, then twice as long. */
const RELOAD_AFTER_MS = 3000;
const RELOADS = 2;

/**
 * People (design/miqat-2.0, V2-People): friends, requests and blocked people on
 * the left, the selected person's profile on the right. `?person=<id>` selects
 * someone (also someone who is not a friend); `/profile/:id` redirects here.
 */
@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [ChatAvatar, PersonProfile, UserMenu, TPipe, TCountPipe],
  templateUrl: './friends-page.html',
  styleUrl: './friends-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendsPage {
  private friendService = inject(FriendService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private schedule = inject(ScheduleService);
  private calendarData = inject(CalendarDataService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  protected chat = inject(ChatService);

  protected readonly tab = signal<PeopleTab>('friends');
  /** "Add friend" is open: the list shows people to add instead of the tabs. */
  protected readonly adding = signal(false);
  /** The person named in the address, if any. */
  private readonly personParam = signal<string | null>(null);

  // All lists are loaded together, so switching tab is instant and the tabs can count.
  protected readonly friends = signal<PersonCard[]>([]);
  protected readonly requests = signal<PersonCard[]>([]);
  protected readonly sent = signal<PersonCard[]>([]);
  protected readonly blocked = signal<PersonCard[]>([]);
  private readonly suggestions = signal<PersonCard[]>([]);
  /** Directory search results; null when no search is running. */
  private readonly found = signal<PersonCard[] | null>(null);

  protected readonly loading = signal(true);
  /** The friends have never arrived: the list must not say "no friends yet". */
  protected readonly friendsMissing = signal(false);
  private friendsLoaded = false;
  private reloads = 0;
  private reloadTimer?: ReturnType<typeof setTimeout>;
  protected readonly searching = signal(false);
  protected readonly error = signal('');
  protected readonly query = signal('');

  /** Ids with an action on its way, so its buttons can disable themselves. */
  private readonly busyIds = signal<ReadonlySet<string>>(new Set());
  /** People asked this visit, so "Add" turns into "Requested". */
  private readonly requestedIds = signal<ReadonlySet<string>>(new Set());
  /** Suggestions waved away. Not stored: they return next visit. */
  private readonly hiddenIds = signal<ReadonlySet<string>>(new Set());
  /** Requests answered this visit: the card stays and says what happened. */
  protected readonly answered = signal<ReadonlyMap<string, 'accepted' | 'declined'>>(new Map());
  /** People unblocked this visit: the card stays and offers "Block again". */
  protected readonly unblocked = signal<ReadonlySet<string>>(new Set());
  /** Mutual friends per person, filled in after the lists arrive. */
  private readonly mutuals = signal<ReadonlyMap<string, number>>(new Map());
  /** Time zone and busy times of each friend, when the API shares them. */
  private readonly availability = signal<ReadonlyMap<string, UserAvailabilityDto>>(new Map());

  /** Moves the local times along. */
  private readonly now = signal(new Date());
  /** True where list and profile fit side by side. */
  private readonly wide = signal(true);

  private searchQuery = new Subject<string>();
  private readonly myId = this.authService.getCurrentUserId();

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      clearTimeout(this.reloadTimer);
    });

    if (typeof matchMedia === 'function') {
      const media = matchMedia('(min-width: 1024px)');
      const follow = () => this.wide.set(media.matches);
      follow();
      media.addEventListener('change', follow);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', follow));
    }

    this.searchQuery
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(text => this.runSearch(text));

    // ?tab=requests opens a list directly (notifications link here); ?person= selects someone.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const wanted = (params.get('tab') ?? '').toLowerCase();
        this.adding.set(wanted === 'suggestions' || wanted === 'add');
        this.tab.set(this.tabFromQuery(wanted));

        const person = params.get('person');
        // The user's own profile is edited in Settings.
        if (person && (person === 'me' || person === this.myId)) {
          this.router.navigate(['/settings'], { queryParams: { tab: 'profile' }, replaceUrl: true });
          return;
        }
        this.personParam.set(person);
      });

    this.loadData();
  }

  private tabFromQuery(value: string): PeopleTab {
    switch (value) {
      case 'requests': case 'pending': case 'sent': return 'requests';
      case 'blocked': return 'blocked';
      default: return 'friends';
    }
  }

  // ── What is shown ──────────────────────────────────────────────────────────

  /** The profile on the right: the person in the address, or on a wide screen the first friend. */
  protected readonly selectedId = computed(() =>
    this.personParam() ?? (this.wide() ? this.visibleFriends()[0]?.userId ?? this.friends()[0]?.userId ?? null : null));

  /** On a narrow screen the profile replaces the list. */
  protected readonly profileOnly = computed(() => !!this.personParam());

  protected readonly visibleFriends = computed(() => this.matching(this.friends()));
  protected readonly visibleRequests = computed(() => this.matching(this.requests()));
  protected readonly visibleSent = computed(() => this.matching(this.sent()));
  protected readonly visibleBlocked = computed(() => this.matching(this.blocked()));

  /** People to add: search results while searching, otherwise the suggestions. */
  protected readonly candidates = computed(() => {
    const hidden = this.hiddenIds();
    return (this.found() ?? this.suggestions()).filter(card => !hidden.has(card.userId));
  });

  protected readonly showingResults = computed(() => this.found() !== null);

  /** The user asked to see every group, not only the first few. */
  protected readonly allGroups = signal(false);

  /** The user's group chats, above the friends; typed text narrows them by name. */
  protected readonly matchingGroups = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.chat.groups().filter(group => !term || (group.name ?? '').toLowerCase().includes(term));
  });

  protected readonly visibleGroups = computed(() =>
    this.allGroups() || this.query().trim() ? this.matchingGroups() : this.matchingGroups().slice(0, GROUPS_SHOWN));

  protected readonly moreGroups = computed(() => this.matchingGroups().length - this.visibleGroups().length);

  protected readonly tabs = computed<{ key: PeopleTab; label: string }[]>(() => {
    const open = this.requests().filter(card => !this.answered().has(card.userId)).length;
    const blocked = this.blocked().filter(card => !this.unblocked().has(card.userId)).length;
    return [
      // Everyone, online or not. Without a number while the list has not arrived.
      { key: 'friends', label: this.friendsMissing() ? t('Friends') : t('Friends · {n}', { n: this.friends().length }) },
      { key: 'requests', label: t('Requests · {n}', { n: open }) },
      { key: 'blocked', label: t('Blocked · {n}', { n: blocked }) }
    ];
  });

  /** Typed text against a person's name, city and country. */
  private matching(cards: PersonCard[]): PersonCard[] {
    const term = this.query().trim().toLowerCase();
    if (!term || this.adding()) return cards;
    return cards.filter(card =>
      `${card.name} ${this.city(card.userId)} ${card.country ?? ''}`.toLowerCase().includes(term));
  }

  // ── Address ────────────────────────────────────────────────────────────────

  /** Changing list goes through the address, so Back returns to the previous one. */
  protected setTab(tab: PeopleTab): void {
    this.navigate({ tab: tab === 'friends' ? null : tab });
  }

  protected toggleAdd(): void {
    this.onSearch('');
    this.navigate({ tab: this.adding() ? null : 'suggestions' });
  }

  protected select(userId: string): void {
    this.navigate({ person: userId });
  }

  protected closeProfile(): void {
    this.navigate({ person: null });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  /**
   * Loads the lists. Friends are listed whether they are online or not: who is
   * online only decides the dot and the line under the name.
   *
   * A list that does not arrive keeps what it showed before (a failed request
   * never empties it) and is asked for again by itself a couple of times;
   * `again` marks such a repeat, which leaves the error line up until it works.
   */
  protected loadData(quiet = false, again = false): void {
    clearTimeout(this.reloadTimer);
    if (!again) this.reloads = 0;
    if (!quiet) this.loading.set(true);
    if (!again) this.error.set('');

    let failed = 0;
    const safe = <T>(request: Observable<T[]>) =>
      request.pipe(catchError(() => { failed++; return of(null); }));

    forkJoin({
      suggestions: safe(this.friendService.getSuggestions()),
      requests: safe(this.friendService.getPendingRequests()),
      friends: safe(this.friendService.getMyFriends()),
      sent: safe(this.friendService.getSentRequests())
    }).subscribe(result => {
      if (result.suggestions) {
        this.suggestions.set(result.suggestions
          .filter(user => user.id !== this.myId)
          .map(user => this.fromUser(user)));
      }
      if (result.requests) {
        this.requests.set(this.keepAnswered(result.requests.map(row => this.fromFriendship(row, true))));
      }
      if (result.friends) {
        this.friends.set(result.friends
          .map(row => this.fromFriendship(row, row.senderId !== this.myId))
          .sort((a, b) => a.name.localeCompare(b.name)));
        this.friendsLoaded = true;
      }
      this.friendsMissing.set(!this.friendsLoaded);
      if (result.sent) this.sent.set(result.sent.map(row => this.fromFriendship(row, false)));

      if (failed === 4) this.error.set(t('Could not load your people. Check your connection and try again.'));
      else if (failed) this.error.set(t('Some of this page could not be loaded.'));
      else this.error.set('');

      this.loading.set(false);
      this.loadAvailability();
      this.loadMutuals([...this.requests(), ...this.suggestions()]);

      if (failed && this.reloads < RELOADS) {
        this.reloadTimer = setTimeout(() => this.loadData(true, true), RELOAD_AFTER_MS * ++this.reloads);
      }
    });

    this.loadBlocked();
  }

  /**
   * Loaded on its own: the page is complete without it, so a failure here must
   * not count against the lists above or raise their error line.
   */
  private loadBlocked(): void {
    this.friendService.getBlockedUsers().subscribe({
      next: users => {
        const listed = users.map(user => this.fromUser(user));
        const ids = new Set(listed.map(card => card.userId));
        // Someone unblocked this visit stays on the list, with "Block again".
        const kept = this.blocked().filter(card => this.unblocked().has(card.userId) && !ids.has(card.userId));
        this.blocked.set([...listed, ...kept]);
      },
      error: () => this.blocked.set([])
    });
  }

  /** A request answered this visit is no longer pending on the server; its card stays. */
  private keepAnswered(pending: PersonCard[]): PersonCard[] {
    const ids = new Set(pending.map(card => card.userId));
    const kept = this.requests().filter(card => this.answered().has(card.userId) && !ids.has(card.userId));
    return [...pending, ...kept];
  }

  /**
   * One call for every friend: their time zone (for the local time and city) and
   * when they are busy today (for "in a meeting"). Friends only, so the server
   * never refuses the list as a whole.
   */
  private loadAvailability(): void {
    const ids = this.friends().map(card => card.userId);
    if (!ids.length) return;

    const now = new Date();
    this.schedule.getAvailability(ids, now, new Date(now.getTime() + DAY_MS)).subscribe({
      next: rows => this.availability.set(new Map(rows.map(row => [row.userId, row]))),
      // An API build without scheduling: the rows then show no time or city.
      error: () => this.availability.set(new Map())
    });
  }

  /**
   * "2 mutual friends" is what makes a request or a suggestion mean something.
   * The lists do not carry it, so the first people each ask for their profile,
   * which does. A failed lookup just leaves that person without it.
   */
  private loadMutuals(cards: PersonCard[]): void {
    const known = this.mutuals();
    const wanted = cards.filter(card => !known.has(card.userId)).slice(0, MUTUALS_LIMIT);
    if (!wanted.length) return;

    forkJoin(wanted.map(card =>
      this.userService.getProfile(card.userId).pipe(catchError(() => of(null)))
    )).subscribe(profiles => {
      const next = new Map(this.mutuals());
      profiles.forEach((profile, index) => {
        if (profile) next.set(wanted[index].userId, profile.mutualFriendsCount ?? 0);
      });
      this.mutuals.set(next);
    });
  }

  /** Suggestions, search results and blocked people come back as plain users. */
  private fromUser(user: UserDto): PersonCard {
    return {
      userId: user.id,
      name: user.fullName || user.email,
      avatarUrl: user.profilePictureUrl,
      country: user.country || null
    };
  }

  /**
   * The API returns both sides of a friendship. Current builds also say which
   * side is the other person (`friendId` / `friendName`); older ones do not, so
   * the caller says which side that is.
   */
  private fromFriendship(row: FriendshipDto, useSender: boolean): PersonCard {
    const other = useSender ? row.sender : row.receiver;
    return {
      userId: row.friendId || (useSender ? row.senderId : row.receiverId),
      friendshipId: row.id,
      name: row.friendName
        || (useSender ? row.senderName : row.receiverName)
        || other?.fullName
        || t('Unknown@@person'),
      avatarUrl: row.friendProfilePictureUrl
        ?? (useSender ? row.senderProfilePictureUrl : row.receiverProfilePictureUrl),
      country: row.friendUser?.country || other?.country || null,
      since: row.updatedAt || row.createdAt
    };
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  protected onSearch(value: string): void {
    this.query.set(value);
    this.searchQuery.next(value);
  }

  /**
   * The lists are filtered as you type. Finding new people needs the directory,
   * so with "Add friend" open a search asks the server.
   */
  private runSearch(text: string): void {
    const term = text.trim();
    if (!this.adding() || term.length < 2) {
      this.found.set(null);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.userService.searchUsers(term).subscribe({
      next: users => {
        const known = new Set([...this.friends(), ...this.requests(), ...this.sent()].map(card => card.userId));
        // People who are already friends, or already asked, are not people to add.
        const cards = (users ?? [])
          .filter(user => user.id !== this.myId && !known.has(user.id))
          .map(user => this.fromUser(user));
        this.found.set(cards);
        this.searching.set(false);
        this.loadMutuals(cards);
      },
      error: err => {
        this.searching.set(false);
        this.error.set(apiErrorMessage(err, t('Search failed.')));
      }
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  protected sendRequest(card: PersonCard): void {
    this.act(card.userId, this.friendService.sendRequest(card.userId), () => {
      this.requestedIds.update(set => new Set(set).add(card.userId));
      // So it is listed under Requests without a reload.
      this.friendService.getSentRequests().subscribe({
        next: rows => this.sent.set(rows.map(row => this.fromFriendship(row, false))),
        error: () => {}
      });
    }, t('Could not send that friend request.'));
  }

  /** Takes a suggestion off the list; nothing is sent anywhere. */
  protected hide(card: PersonCard): void {
    this.hiddenIds.update(set => new Set(set).add(card.userId));
  }

  protected accept(card: PersonCard): void {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.acceptRequest(card.friendshipId), () => {
      this.answer(card.userId, 'accepted');
      this.friends.update(list => [...list, { ...card, since: new Date().toISOString() }]
        .sort((a, b) => a.name.localeCompare(b.name)));
      this.loadAvailability();
    }, t('Could not accept that request.'));
  }

  protected decline(card: PersonCard): void {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.rejectRequest(card.friendshipId),
      () => this.answer(card.userId, 'declined'), t('Could not decline that request.'));
  }

  private answer(userId: string, result: 'accepted' | 'declined'): void {
    this.answered.update(map => new Map(map).set(userId, result));
  }

  protected cancelSent(card: PersonCard): void {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.unfriend(card.friendshipId), () => {
      this.sent.update(list => list.filter(c => c.userId !== card.userId));
      this.requestedIds.update(set => { const next = new Set(set); next.delete(card.userId); return next; });
    }, t('Could not cancel that request.'));
  }

  /**
   * Unblocking does not restore a friendship that existed before the block; the
   * person simply becomes someone who can be found and added again.
   */
  protected unblock(card: PersonCard): void {
    this.act(card.userId, this.friendService.unblockUser(card.userId),
      () => this.unblocked.update(set => new Set(set).add(card.userId)),
      t('Could not unblock that person.'));
  }

  protected blockAgain(card: PersonCard): void {
    this.act(card.userId, this.friendService.blockUser(card.userId),
      () => this.unblocked.update(set => { const next = new Set(set); next.delete(card.userId); return next; }),
      t('Could not block that person.'));
  }

  /** The profile on the right changed a relationship: the lists follow. */
  protected onRelationChange(change: RelationChange): void {
    const id = this.selectedId();
    if (id && change === 'blocked') {
      this.unblocked.update(set => { const next = new Set(set); next.delete(id); return next; });
    }
    if (id && (change === 'accepted' || change === 'declined')) this.answer(id, change);
    // Someone removed or blocked leaves the friends list; their profile stays open.
    if (id && !this.personParam()) this.select(id);
    this.loadData(true);
  }

  private act(id: string, request: Observable<unknown>, onSuccess: () => void, failureMessage: string): void {
    this.setBusy(id, true);
    this.error.set('');
    request.subscribe({
      next: () => {
        this.setBusy(id, false);
        onSuccess();
      },
      error: err => {
        this.setBusy(id, false);
        this.error.set(apiErrorMessage(err, failureMessage));
      }
    });
  }

  private setBusy(id: string, busy: boolean): void {
    this.busyIds.update(current => {
      const next = new Set(current);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  }

  protected isBusy(id: string): boolean { return this.busyIds().has(id); }
  protected isRequested(id: string): boolean {
    return this.requestedIds().has(id) || this.sent().some(card => card.userId === id);
  }

  // ── Groups ─────────────────────────────────────────────────────────────────

  /** The dialog itself is drawn by the chat corner, which is on every page. */
  protected newGroup(): void {
    this.chat.creatingGroup.set(true);
  }

  protected openGroup(group: ChatConversation): void {
    this.chat.open(group.id);
  }

  /** Under a group's name: a call going on, otherwise its size and newest message. */
  protected groupLine(group: ChatConversation): string {
    if (group.activeCall) return t('Call in progress');

    const members = tCount(group.participants?.length ?? 0, '{n} member', '{n} members');
    const last = previewText(group, this.myId);
    return last ? `${members} · ${last}` : members;
  }

  /** What a screen reader says for a group's row. */
  protected groupLabel(group: ChatConversation): string {
    const name = group.name ?? '';
    return group.unreadCount
      ? t('Open the group {name}, {n} unread', { name, n: group.unreadCount })
      : t('Open the group {name}', { name });
  }

  protected unreadBadge(count: number): string {
    return num(count > 9 ? '9+' : count);
  }

  // ── What a row says ────────────────────────────────────────────────────────

  private zone(userId: string): string | null {
    const zone = this.availability().get(userId)?.timeZone;
    return isValidTimeZone(zone) ? zone : null;
  }

  protected city(userId: string): string {
    const zone = this.zone(userId);
    return zone ? zoneCity(zone) : '';
  }

  /** The time on their clock right now. */
  protected localTime(userId: string): string {
    const zone = this.zone(userId);
    return zone ? formatTimeInZone(this.now(), zone, this.calendarData.use24HourClock()) : '';
  }

  /** The end of a meeting of theirs that is going on now, when free / busy says so. */
  private busyUntil(userId: string): Date | null {
    const at = this.now().getTime();
    const slot = this.availability().get(userId)?.busy.find(b =>
      new Date(b.start).getTime() <= at && at < new Date(b.end).getTime());
    return slot ? new Date(slot.end) : null;
  }

  protected presence(userId: string): 'online' | 'busy' | 'away' {
    if (this.busyUntil(userId)) return 'busy';
    return this.chat.isOnline(userId) ? 'online' : 'away';
  }

  /** Under a friend's name: what is really known about them right now. */
  protected friendLine(card: PersonCard): string {
    const until = this.busyUntil(card.userId);
    if (until) {
      return t('In a meeting until {time}', {
        time: formatTimeInZone(until, this.userService.timeZone(), this.calendarData.use24HourClock())
      });
    }
    if (this.chat.isOnline(card.userId)) return t('Online');

    const since = card.since ? new Date(card.since) : null;
    const known = !!since && !Number.isNaN(since.getTime());
    // On a server with chat, who is online is known: someone who is not says so.
    if (this.chat.available()) {
      return known
        ? t('Offline · Friends since {date}', { date: since!.toLocaleDateString(locale(), { month: 'short', year: 'numeric' }) })
        : t('Offline');
    }

    if (known) {
      return t('Friends since {date}', { date: since!.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }) });
    }
    return card.country || t('Friend');
  }

  /** What the dot on a friend's picture means, for a pointer resting on it and for a screen reader. */
  protected presenceLabel(userId: string): string {
    switch (this.presence(userId)) {
      case 'busy': return t('In a meeting');
      case 'online': return t('Online');
      default: return this.chat.available() ? t('Offline') : '';
    }
  }

  /** Under the name of someone who is not a friend yet: country and mutual friends. */
  protected strangerLine(card: PersonCard, extra = ''): string {
    const mutual = this.mutuals().get(card.userId) ?? 0;
    return [
      extra,
      card.country,
      mutual ? tCount(mutual, '{n} mutual friend', '{n} mutual friends') : ''
    ].filter(Boolean).join(' · ');
  }

  /** "Requested 3 d ago". */
  protected requestedLine(card: PersonCard): string {
    const date = card.since ? new Date(card.since) : null;
    if (!date || Number.isNaN(date.getTime())) return this.strangerLine(card, t('Waiting for a reply'));

    const minutes = Math.floor((this.now().getTime() - date.getTime()) / 60_000);
    const requested = minutes < 60 ? t('Requested just now')
      : minutes < 1440 ? tCount(Math.floor(minutes / 60), 'Requested {n} h ago', 'Requested {n} h ago')
      : minutes < 10_080 ? tCount(Math.floor(minutes / 1440), 'Requested {n} d ago', 'Requested {n} d ago')
      : t('Requested on {date}', { date: date.toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) });
    return this.strangerLine(card, requested);
  }

  protected firstName(card: PersonCard): string {
    return card.name.trim().split(/\s+/)[0] || card.name;
  }
}
