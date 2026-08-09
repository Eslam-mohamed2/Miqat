import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FriendService } from '../../core/services/friend.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { FriendshipDto, UserDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

export type FriendTab = 'suggestions' | 'pending' | 'friends' | 'sent';

/**
 * One card in the grid, normalised so the template never has to care whether it
 * came from a UserDto (suggestions) or a FriendshipDto (the other three tabs).
 */
export interface FriendCard {
  /** The other person's user id. */
  userId: string;
  /** The friendship row id, needed to accept/reject/unfriend. Absent for suggestions. */
  friendshipId?: string;
  name: string;
  avatarUrl?: string | null;
  subtitle?: string;
}

@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './friends-page.html',
  styleUrl: './friends-page.scss'
})
export class FriendsPage implements OnInit {
  private friendService = inject(FriendService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly tabs: { key: FriendTab; label: string; icon: string }[] = [
    { key: 'suggestions', label: 'Suggestions',  icon: 'person_search' },
    { key: 'pending',     label: 'Requests',     icon: 'group_add' },
    { key: 'friends',     label: 'Your Friends', icon: 'people' },
    { key: 'sent',        label: 'Sent',         icon: 'send' }
  ];

  activeTab = signal<FriendTab>('suggestions');
  cards = signal<FriendCard[]>([]);
  loading = signal(false);
  errorMessage = signal('');
  searchText = signal('');

  /** Ids with an in-flight action, so its buttons can disable themselves. */
  busyIds = signal<ReadonlySet<string>>(new Set());
  /** Suggestions already requested this session, so the button flips to "Sent". */
  requestedIds = signal<ReadonlySet<string>>(new Set());

  pendingCount = signal(0);

  private searchQuery = new Subject<string>();
  private currentUserId = this.authService.getCurrentUserId();

  /** In-memory filter for the non-suggestion tabs. */
  visibleCards = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term || this.activeTab() === 'suggestions') return this.cards();
    return this.cards().filter(card => card.name.toLowerCase().includes(term));
  });

  isEmpty = computed(() =>
    !this.loading() && !this.errorMessage() && this.visibleCards().length === 0);

  ngOnInit() {
    this.searchQuery
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(query => this.runSearch(query));

    this.loadData();
    this.refreshPendingCount();
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  setTab(tab: FriendTab) {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchText.set('');
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.errorMessage.set('');

    const finish = (cards: FriendCard[]) => {
      this.cards.set(cards);
      this.loading.set(false);
    };
    const fail = (what: string) => (err: unknown) => {
      this.cards.set([]);
      this.errorMessage.set(apiErrorMessage(err, `Could not load ${what}.`));
      this.loading.set(false);
    };

    switch (this.activeTab()) {
      case 'suggestions':
        this.friendService.getSuggestions().subscribe({
          next: users => finish((users ?? [])
            .filter(u => u.id !== this.currentUserId)
            .map(u => this.fromUser(u))),
          error: fail('suggestions')
        });
        break;

      case 'pending':
        this.friendService.getPendingRequests().subscribe({
          next: rows => {
            this.pendingCount.set(rows.length);
            finish(rows.map(row => this.fromFriendship(row, 'sender')));
          },
          error: fail('friend requests')
        });
        break;

      case 'friends':
        this.friendService.getMyFriends().subscribe({
          next: rows => finish(rows.map(row => this.fromFriendship(row, 'counterpart'))),
          error: fail('your friends')
        });
        break;

      case 'sent':
        this.friendService.getSentRequests().subscribe({
          next: rows => finish(rows.map(row => this.fromFriendship(row, 'receiver'))),
          error: fail('sent requests')
        });
        break;
    }
  }

  private refreshPendingCount() {
    this.friendService.getPendingRequests().subscribe({
      next: rows => this.pendingCount.set(rows.length),
      error: () => this.pendingCount.set(0)
    });
  }

  /** Suggestions come back as plain users. */
  private fromUser(user: UserDto): FriendCard {
    return {
      userId: user.id,
      name: user.fullName || user.email,
      avatarUrl: user.profilePictureUrl,
      subtitle: user.country || undefined
    };
  }

  /**
   * The API returns both sides of a friendship as flat fields. Which side is
   * "the other person" depends on the list: on a received request it is always
   * the sender, on a sent request always the receiver, and in the friends list
   * it is whichever side is not the signed-in user.
   */
  private fromFriendship(row: FriendshipDto, side: 'sender' | 'receiver' | 'counterpart'): FriendCard {
    const useSender =
      side === 'sender' ||
      (side === 'counterpart' && row.senderId !== this.currentUserId);

    return {
      userId: useSender ? row.senderId : row.receiverId,
      friendshipId: row.id,
      name: (useSender ? row.senderName : row.receiverName)
        || (useSender ? row.sender?.fullName : row.receiver?.fullName)
        || 'Unknown',
      avatarUrl: useSender ? row.senderProfilePictureUrl : row.receiverProfilePictureUrl,
      subtitle: side === 'sender' ? 'Sent you a request'
        : side === 'receiver' ? 'Request pending'
        : undefined
    };
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  onSearch(value: string) {
    this.searchText.set(value);
    this.searchQuery.next(value);
  }

  private runSearch(query: string) {
    // Only Suggestions searches the whole directory; the other tabs are small
    // enough to filter client-side via visibleCards().
    if (this.activeTab() !== 'suggestions') return;

    if (!query.trim()) {
      this.loadData();
      return;
    }

    this.loading.set(true);
    this.userService.searchUsers(query).subscribe({
      next: users => {
        this.cards.set((users ?? [])
          .filter(u => u.id !== this.currentUserId)
          .map(u => this.fromUser(u)));
        this.loading.set(false);
      },
      error: err => {
        this.errorMessage.set(apiErrorMessage(err, 'Search failed.'));
        this.loading.set(false);
      }
    });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  sendRequest(card: FriendCard) {
    this.act(card.userId, this.friendService.sendRequest(card.userId),
      () => this.requestedIds.update(set => new Set(set).add(card.userId)),
      'Could not send that friend request.');
  }

  accept(card: FriendCard) {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.acceptRequest(card.friendshipId), () => {
      this.removeCard(card);
      this.pendingCount.update(n => Math.max(0, n - 1));
    }, 'Could not accept that request.');
  }

  reject(card: FriendCard) {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.rejectRequest(card.friendshipId), () => {
      this.removeCard(card);
      this.pendingCount.update(n => Math.max(0, n - 1));
    }, 'Could not decline that request.');
  }

  cancelSent(card: FriendCard) {
    if (!card.friendshipId) return;
    this.act(card.userId, this.friendService.unfriend(card.friendshipId),
      () => this.removeCard(card), 'Could not cancel that request.');
  }

  unfriend(card: FriendCard) {
    if (!card.friendshipId) return;
    if (!confirm(`Remove ${card.name} from your friends?`)) return;
    this.act(card.userId, this.friendService.unfriend(card.friendshipId),
      () => this.removeCard(card), 'Could not remove that friend.');
  }

  block(card: FriendCard) {
    if (!confirm(`Block ${card.name}? They will no longer be able to reach you.`)) return;
    this.act(card.userId, this.friendService.blockUser(card.userId),
      () => this.removeCard(card), 'Could not block that person.');
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

  private removeCard(card: FriendCard) {
    this.cards.update(list => list.filter(c => c.userId !== card.userId));
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
    if (card.userId) this.router.navigate(['/profile', card.userId]);
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  initials(name: string): string {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2)
      .map(word => word[0]).join('').toUpperCase();
  }

  /** Stable per-person colour so an avatar keeps the same tint between renders. */
  avatarColor(card: FriendCard): string {
    const palette = ['#7c8ef5', '#2ec4a0', '#f4a835', '#f4845f', '#ef4444', '#9b6dff'];
    let hash = 0;
    for (const char of card.userId || card.name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  emptyTitle(): string {
    switch (this.activeTab()) {
      case 'pending': return 'No friend requests';
      case 'friends': return 'No friends yet';
      case 'sent':    return 'No pending sent requests';
      default:        return this.searchText() ? 'No people found' : 'No suggestions right now';
    }
  }

  emptySub(): string {
    switch (this.activeTab()) {
      case 'pending': return 'When someone sends you a request, it will appear here.';
      case 'friends': return 'Find people under Suggestions and send them a request.';
      case 'sent':    return 'Requests you send are listed here until they are answered.';
      default:        return this.searchText()
        ? 'Try a different name or email.'
        : 'Check back later for new people to connect with.';
    }
  }

  trackByUser(_index: number, card: FriendCard): string {
    return card.userId;
  }
}
