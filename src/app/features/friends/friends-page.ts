import { Component, DestroyRef, HostListener, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FriendService } from '../../core/services/friend.service';
import { ChatService } from '../../core/services/chat.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { FriendshipDto, ProfilePersonDto, UserDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

/** The sections of the page. `home` shows requests and suggestions together. */
export type FriendTab = 'home' | 'pending' | 'suggestions' | 'friends' | 'sent' | 'blocked';

/** Which list a card belongs to, and so which buttons it gets. */
export type CardKind = 'suggestion' | 'request' | 'friend' | 'sent' | 'blocked';

/**
 * One card in a grid, normalised so the template never has to care whether it
 * came from a UserDto (suggestions) or a FriendshipDto (the other lists).
 */
export interface FriendCard {
  /** The other person's user id. */
  userId: string;
  /** The friendship row id, needed to accept/reject/unfriend. Absent for suggestions. */
  friendshipId?: string;
  name: string;
  avatarUrl?: string | null;
  /** Shown when nothing is known about mutual friends: a country, or when the request was made. */
  subtitle?: string;
}

/** What is known about the friends a person shares with the signed-in user. */
interface Mutuals {
  count: number;
  people: ProfilePersonDto[];
}

/** How many cards get a mutual-friends lookup (one request each). */
const MUTUALS_LIMIT = 16;
/** Cards per section on the home view before "See all". */
const HOME_PREVIEW = 8;

@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './friends-page.html',
  styleUrl: './friends-page.scss'
})
export class FriendsPage implements OnInit {
  private friendService = inject(FriendService);
  protected chat = inject(ChatService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly tabs: { key: FriendTab; label: string; icon: string }[] = [
    { key: 'home',        label: 'Home',            icon: 'home' },
    { key: 'pending',     label: 'Friend requests', icon: 'group_add' },
    { key: 'suggestions', label: 'Suggestions',     icon: 'person_search' },
    { key: 'friends',     label: 'All friends',     icon: 'people' },
    { key: 'sent',        label: 'Sent requests',   icon: 'send' },
    { key: 'blocked',     label: 'Blocked',         icon: 'block' }
  ];

  activeTab = signal<FriendTab>('home');

  // All four lists are loaded together, so switching section is instant and the
  // menu can show how many are in each.
  suggestions = signal<FriendCard[]>([]);
  requests = signal<FriendCard[]>([]);
  friends = signal<FriendCard[]>([]);
  sent = signal<FriendCard[]>([]);
  /** People the user has blocked, kept so each can be unblocked again. */
  blocked = signal<FriendCard[]>([]);
  /** Directory search results; null when no search is running. */
  private searchResults = signal<FriendCard[] | null>(null);

  loading = signal(true);
  searching = signal(false);
  errorMessage = signal('');
  searchText = signal('');

  /** Ids with an in-flight action, so its buttons can disable themselves. */
  busyIds = signal<ReadonlySet<string>>(new Set());
  /** Suggestions already requested this session, so the button flips to "Request sent". */
  requestedIds = signal<ReadonlySet<string>>(new Set());
  /** Suggestions the user waved away with "Remove". Not stored: they return next visit. */
  private removedIds = signal<ReadonlySet<string>>(new Set());
  /** Pictures that failed to load fall back to initials. */
  private brokenAvatars = signal<ReadonlySet<string>>(new Set());
  /** Mutual friends per person, filled in after the lists arrive. */
  private mutuals = signal<ReadonlyMap<string, Mutuals>>(new Map());
  /** The card whose "more" menu is open. */
  openMenuId = signal<string | null>(null);

  private searchQuery = new Subject<string>();
  private currentUserId = this.authService.getCurrentUserId();

  readonly pendingCount = computed(() => this.requests().length);

  /** Suggestions on screen: search results while searching, minus the ones removed. */
  readonly visibleSuggestions = computed(() => {
    const removed = this.removedIds();
    return (this.searchResults() ?? this.suggestions()).filter(card => !removed.has(card.userId));
  });

  readonly visibleRequests = computed(() => this.filterByName(this.requests()));
  readonly visibleFriends = computed(() => this.filterByName(this.friends()));
  readonly visibleSent = computed(() => this.filterByName(this.sent()));
  readonly visibleBlocked = computed(() => this.filterByName(this.blocked()));

  /** The home view shows the first few of each; "See all" opens the full list. */
  readonly homeRequests = computed(() => this.visibleRequests().slice(0, HOME_PREVIEW));
  readonly homeSuggestions = computed(() => this.visibleSuggestions().slice(0, HOME_PREVIEW * 2));

  /** Cards of the single-list sections. */
  readonly sectionCards = computed<FriendCard[]>(() => {
    switch (this.activeTab()) {
      case 'pending':     return this.visibleRequests();
      case 'suggestions': return this.visibleSuggestions();
      case 'friends':     return this.visibleFriends();
      case 'sent':        return this.visibleSent();
      case 'blocked':     return this.visibleBlocked();
      default:            return [];
    }
  });

  readonly sectionKind = computed<CardKind>(() => {
    switch (this.activeTab()) {
      case 'pending': return 'request';
      case 'friends': return 'friend';
      case 'sent':    return 'sent';
      case 'blocked': return 'blocked';
      default:        return 'suggestion';
    }
  });

  readonly sectionTitle = computed(() => {
    switch (this.activeTab()) {
      case 'pending':     return 'Friend requests';
      case 'suggestions': return this.searchResults() ? 'Search results' : 'People you may know';
      case 'friends':     return 'All friends';
      case 'sent':        return 'Sent requests';
      case 'blocked':     return 'Blocked people';
      default:            return '';
    }
  });

  readonly homeIsEmpty = computed(() =>
    !this.loading() && !this.homeRequests().length && !this.homeSuggestions().length);

  ngOnInit() {
    this.searchQuery
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(query => this.runSearch(query));

    // ?tab=requests opens a section directly (notifications link here).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.activeTab.set(this.tabFromQuery(params.get('tab'))));

    this.loadData();
  }

  private tabFromQuery(value: string | null): FriendTab {
    switch ((value ?? '').toLowerCase()) {
      case 'requests': case 'pending': return 'pending';
      case 'suggestions':              return 'suggestions';
      case 'friends': case 'all':      return 'friends';
      case 'sent':                     return 'sent';
      case 'blocked':                  return 'blocked';
      default:                         return 'home';
    }
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  /** Changing section goes through the URL, so Back returns to the previous one. */
  setTab(tab: FriendTab) {
    this.openMenuId.set(null);
    const query: Record<FriendTab, string | null> = {
      home: null, pending: 'requests', suggestions: 'suggestions', friends: 'friends', sent: 'sent',
      blocked: 'blocked'
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: query[tab] },
      queryParamsHandling: 'merge'
    });
  }

  loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    let failed = 0;
    const safe = <T>(request: Observable<T[]>) =>
      request.pipe(catchError(() => { failed++; return of([] as T[]); }));

    forkJoin({
      suggestions: safe(this.friendService.getSuggestions()),
      requests: safe(this.friendService.getPendingRequests()),
      friends: safe(this.friendService.getMyFriends()),
      sent: safe(this.friendService.getSentRequests())
    }).subscribe(result => {
      this.suggestions.set(result.suggestions
        .filter(user => user.id !== this.currentUserId)
        .map(user => this.fromUser(user)));
      this.requests.set(result.requests.map(row => this.fromFriendship(row, 'request')));
      this.friends.set(result.friends.map(row => this.fromFriendship(row, 'friend')));
      this.sent.set(result.sent.map(row => this.fromFriendship(row, 'sent')));

      if (failed === 4) this.errorMessage.set('Could not load your friends. Check your connection and try again.');
      else if (failed) this.errorMessage.set('Some of this page could not be loaded.');

      this.loading.set(false);
      this.loadMutuals([...this.requests(), ...this.suggestions()]);
    });

    this.loadBlocked();
  }

  /**
   * Loaded on its own: the page is complete without it, so a failure here must
   * not count against the four lists above or raise their error banner.
   */
  private loadBlocked() {
    this.friendService.getBlockedUsers().subscribe({
      next: users => this.blocked.set(users.map(user => this.fromUser(user))),
      error: () => this.blocked.set([])
    });
  }

  /**
   * "2 mutual friends" under a name is what makes a suggestion mean something.
   * The lists do not carry it, so the first cards each ask for the person's
   * profile, which does. A failed lookup just leaves that card without the line.
   */
  private loadMutuals(cards: FriendCard[]) {
    const known = this.mutuals();
    const wanted = cards.filter(card => !known.has(card.userId)).slice(0, MUTUALS_LIMIT);
    if (!wanted.length) return;

    forkJoin(wanted.map(card =>
      this.userService.getProfile(card.userId).pipe(catchError(() => of(null)))
    )).subscribe(profiles => {
      const next = new Map(this.mutuals());
      profiles.forEach((profile, index) => {
        if (!profile) return;
        next.set(wanted[index].userId, {
          count: profile.mutualFriendsCount ?? 0,
          people: (profile.mutualFriends ?? []).slice(0, 3)
        });
      });
      this.mutuals.set(next);
    });
  }

  /** Suggestions and search results come back as plain users. */
  private fromUser(user: UserDto): FriendCard {
    return {
      userId: user.id,
      name: user.fullName || user.email,
      avatarUrl: user.profilePictureUrl,
      subtitle: user.country || undefined
    };
  }

  /**
   * The API returns both sides of a friendship. Current builds also say which
   * side is the other person (`friendId` / `friendName`); older ones do not, so
   * it is worked out from the list the row came from.
   */
  private fromFriendship(row: FriendshipDto, kind: CardKind): FriendCard {
    const useSender = kind === 'request' || (kind === 'friend' && row.senderId !== this.currentUserId);

    const subtitle = kind === 'request' ? `Sent ${this.ago(row.createdAt)}`
      : kind === 'sent' ? `Requested ${this.ago(row.createdAt)}`
      : this.since(row.updatedAt || row.createdAt);

    return {
      userId: row.friendId || (useSender ? row.senderId : row.receiverId),
      friendshipId: row.id,
      name: row.friendName
        || (useSender ? row.senderName : row.receiverName)
        || (useSender ? row.sender?.fullName : row.receiver?.fullName)
        || 'Unknown',
      avatarUrl: row.friendProfilePictureUrl
        ?? (useSender ? row.senderProfilePictureUrl : row.receiverProfilePictureUrl),
      subtitle
    };
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  onSearch(value: string) {
    this.searchText.set(value);
    this.searchQuery.next(value);
  }

  clearSearch() {
    this.onSearch('');
  }

  /**
   * The friend lists are filtered as you type. Finding *new* people needs the
   * directory, so a search also asks the server and shows the answer under
   * Suggestions.
   */
  private runSearch(query: string) {
    const term = query.trim();
    if (term.length < 2) {
      this.searchResults.set(null);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.userService.searchUsers(term).subscribe({
      next: users => {
        const known = new Set([...this.friends(), ...this.requests(), ...this.sent()].map(card => card.userId));
        const cards = (users ?? [])
          // People who are already friends, or already asked, are not suggestions.
          .filter(user => user.id !== this.currentUserId && !known.has(user.id))
          .map(user => this.fromUser(user));
        this.searchResults.set(cards);
        this.searching.set(false);
        // Typing a name is asking to see people, so show them.
        if (this.activeTab() === 'home' && !this.visibleRequests().length) this.setTab('suggestions');
        this.loadMutuals(cards);
      },
      error: err => {
        this.searching.set(false);
        this.errorMessage.set(apiErrorMessage(err, 'Search failed.'));
      }
    });
  }

  private filterByName(cards: FriendCard[]): FriendCard[] {
    const term = this.searchText().trim().toLowerCase();
    return term ? cards.filter(card => card.name.toLowerCase().includes(term)) : cards;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  sendRequest(card: FriendCard) {
    this.act(card.userId, this.friendService.sendRequest(card.userId), () => {
      this.requestedIds.update(set => new Set(set).add(card.userId));
      // So it is listed under "Sent requests" without a reload.
      this.friendService.getSentRequests().subscribe({
        next: rows => this.sent.set(rows.map(row => this.fromFriendship(row, 'sent'))),
        error: () => {}
      });
    }, 'Could not send that friend request.');
  }

  /** "Remove" on a suggestion: takes it off the page; nothing is sent anywhere. */
  removeSuggestion(card: FriendCard) {
    this.removedIds.update(set => new Set(set).add(card.userId));
  }

  accept(card: FriendCard) {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.acceptRequest(card.friendshipId), () => {
      this.requests.update(list => list.filter(c => c.userId !== card.userId));
      this.friends.update(list => [{ ...card, subtitle: 'Friends since today' }, ...list]);
    }, 'Could not accept that request.');
  }

  reject(card: FriendCard) {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.rejectRequest(card.friendshipId),
      () => this.requests.update(list => list.filter(c => c.userId !== card.userId)),
      'Could not decline that request.');
  }

  cancelSent(card: FriendCard) {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.unfriend(card.friendshipId), () => {
      this.sent.update(list => list.filter(c => c.userId !== card.userId));
      this.requestedIds.update(set => { const next = new Set(set); next.delete(card.userId); return next; });
    }, 'Could not cancel that request.');
  }

  /** Opens the pop-up chat with a friend. */
  message(card: FriendCard) {
    this.chat.openWith(card.userId).subscribe({
      error: err => this.errorMessage.set(err?.error?.message || 'Could not open the chat.')
    });
  }

  unfriend(card: FriendCard) {
    if (!card.friendshipId) return;
    if (!confirm(`Remove ${card.name} from your friends?`)) return;
    this.act(card.userId, this.friendService.unfriend(card.friendshipId),
      () => this.friends.update(list => list.filter(c => c.userId !== card.userId)),
      'Could not remove that friend.');
  }

  block(card: FriendCard) {
    this.openMenuId.set(null);
    if (!confirm(`Block ${card.name}? They will no longer be able to reach you.`)) return;
    this.act(card.userId, this.friendService.blockUser(card.userId), () => {
      const without = (list: FriendCard[]) => list.filter(c => c.userId !== card.userId);
      this.suggestions.update(without);
      this.requests.update(without);
      this.friends.update(without);
      this.sent.update(without);
      this.searchResults.update(list => (list ? without(list) : list));
      // Listed under "Blocked" straight away, so the way back is visible.
      this.blocked.update(list => [{ userId: card.userId, name: card.name, avatarUrl: card.avatarUrl }, ...without(list)]);
    }, 'Could not block that person.');
  }

  /**
   * Unblocking does not restore a friendship that existed before the block; the
   * person simply becomes someone who can be found and added again.
   */
  unblock(card: FriendCard) {
    this.act(card.userId, this.friendService.unblockUser(card.userId), () => {
      this.blocked.update(list => list.filter(c => c.userId !== card.userId));
      // They may be a suggestion again now.
      this.friendService.getSuggestions().subscribe({
        next: users => this.suggestions.set(users
          .filter(user => user.id !== this.currentUserId)
          .map(user => this.fromUser(user))),
        error: () => {}
      });
    }, 'Could not unblock that person.');
  }

  private act(id: string, request: Observable<unknown>, onSuccess: () => void, failureMessage: string) {
    this.setBusy(id, true);
    this.errorMessage.set('');
    request.subscribe({
      next: () => {
        this.setBusy(id, false);
        onSuccess();
      },
      error: err => {
        this.setBusy(id, false);
        this.errorMessage.set(apiErrorMessage(err, failureMessage));
      }
    });
  }

  private setBusy(id: string, busy: boolean) {
    this.busyIds.update(current => {
      const next = new Set(current);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  }

  isBusy(id: string): boolean { return this.busyIds().has(id); }
  isRequested(id: string): boolean { return this.requestedIds().has(id); }

  viewProfile(card: FriendCard) {
    this.openMenuId.set(null);
    if (card.userId) this.router.navigate(['/profile', card.userId]);
  }

  toggleMenu(card: FriendCard, event: Event) {
    event.stopPropagation();
    this.openMenuId.update(current => (current === card.userId ? null : card.userId));
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeMenu() {
    if (this.openMenuId()) this.openMenuId.set(null);
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  count(tab: FriendTab): number {
    switch (tab) {
      case 'pending': return this.requests().length;
      case 'friends': return this.friends().length;
      case 'sent':    return this.sent().length;
      case 'blocked': return this.blocked().length;
      default:        return 0;
    }
  }

  mutualsOf(card: FriendCard): Mutuals | null {
    const found = this.mutuals().get(card.userId);
    return found && found.count > 0 ? found : null;
  }

  mutualLabel(mutual: Mutuals): string {
    return `${mutual.count} mutual ${mutual.count === 1 ? 'friend' : 'friends'}`;
  }

  /** The card's picture, unless it is missing or failed to load. */
  avatarOf(card: FriendCard): string | null {
    return card.avatarUrl && !this.brokenAvatars().has(card.userId) ? card.avatarUrl : null;
  }

  onAvatarError(card: FriendCard) {
    this.brokenAvatars.update(set => new Set(set).add(card.userId));
  }

  initials(name: string): string {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2)
      .map(word => word[0]).join('').toUpperCase();
  }

  /** Stable per-person colour so a card keeps the same tint between renders. */
  avatarColor(card: { userId?: string; id?: string; name?: string; fullName?: string }): string {
    const palette = ['#7c8ef5', '#2ec4a0', '#f4a835', '#f4845f', '#ef4444', '#9b6dff'];
    let hash = 0;
    for (const char of card.userId || card.id || card.name || card.fullName || '?') {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return palette[hash % palette.length];
  }

  /** "5h ago", "3d ago", "Nov 2". */
  private ago(dateStr: string | null | undefined): string {
    const date = dateStr ? new Date(dateStr) : null;
    if (!date || Number.isNaN(date.getTime())) return 'recently';

    const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }

  private since(dateStr: string | null | undefined): string | undefined {
    const date = dateStr ? new Date(dateStr) : null;
    if (!date || Number.isNaN(date.getTime())) return undefined;
    return `Friends since ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
  }

  emptyTitle(): string {
    if (this.searchText().trim()) return 'No one matches that search';
    switch (this.activeTab()) {
      case 'pending': return 'No friend requests';
      case 'friends': return 'No friends yet';
      case 'sent':    return 'No sent requests waiting';
      case 'blocked': return 'You have not blocked anyone';
      default:        return 'No suggestions right now';
    }
  }

  emptySub(): string {
    if (this.searchText().trim()) return 'Try a different name or email address.';
    switch (this.activeTab()) {
      case 'pending': return 'When someone sends you a request, it will appear here.';
      case 'friends': return 'Find people under Suggestions and send them a request.';
      case 'sent':    return 'Requests you send are listed here until they are answered.';
      case 'blocked': return 'People you block are listed here, so you can unblock them later.';
      default:        return 'Check back later for new people to connect with.';
    }
  }

  trackByUser(_index: number, card: FriendCard): string {
    return card.userId;
  }
}
