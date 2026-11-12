import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ChatConversation, ChatPerson, ChatService, describeCall } from '../../core/services/chat.service';
import { FriendService } from '../../core/services/friend.service';
import { ChatAvatar } from './chat-avatar';
import { ChatWindow } from './chat-window';

const shortTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

/**
 * The chat corner of the app, messenger style: a round button that opens the
 * chat list, the docked chats as small round bubbles above it, and the open
 * chats as pop-up windows beside them.
 *
 * It draws nothing on an API build without chat.
 */
@Component({
  selector: 'app-chat-dock',
  standalone: true,
  imports: [MatIconModule, ChatAvatar, ChatWindow],
  templateUrl: './chat-dock.html',
  styleUrl: './chat-dock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatDock {
  protected chat = inject(ChatService);
  private friendService = inject(FriendService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly panelOpen = signal(false);
  protected readonly search = signal('');
  protected readonly error = signal('');
  /** Friends, for starting a chat with someone there is none with yet. */
  private readonly friends = signal<ChatPerson[]>([]);

  protected readonly matchingChats = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.chat.conversations().filter(c => !term || c.friend.fullName.toLowerCase().includes(term));
  });

  protected readonly matchingFriends = computed(() => {
    const term = this.search().trim().toLowerCase();
    const chatting = new Set(this.chat.conversations().map(c => c.friend.id));

    return this.friends()
      .filter(f => !chatting.has(f.id) && (!term || f.fullName.toLowerCase().includes(term)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  });

  protected togglePanel(): void {
    this.panelOpen.update(open => !open);
    if (!this.panelOpen()) return;

    this.search.set('');
    this.error.set('');
    this.loadFriends();
  }

  protected openChat(conversation: ChatConversation): void {
    this.chat.open(conversation.id);
    this.panelOpen.set(false);
  }

  protected startChat(friend: ChatPerson): void {
    this.error.set('');
    this.chat.openWith(friend.id).subscribe({
      next: () => this.panelOpen.set(false),
      error: err => this.error.set(err?.error?.message || 'Could not open the chat. Try again.')
    });
  }

  /** What the list shows under a name: the newest message, in a few words. */
  protected preview(conversation: ChatConversation): string {
    const last = conversation.lastMessage;
    if (!last) return '';

    const mine = last.senderId === this.chat.currentUserId;
    if (last.callOutcome) return describeCall(last, mine);

    const text = last.isDeleted ? 'Message deleted' : last.body;
    return mine ? `You: ${text}` : text;
  }

  /** The time today, otherwise the date. */
  protected when(iso?: string | null): string {
    if (!iso) return '';

    const date = new Date(iso);
    return date.toDateString() === new Date().toDateString() ? shortTime.format(date) : shortDate.format(date);
  }

  protected badge(count: number): string {
    return count > 9 ? '9+' : String(count);
  }

  // A click anywhere else, or Escape, puts the list away.
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.panelOpen() && !this.host.nativeElement.contains(event.target as Node)) this.panelOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.panelOpen.set(false);
  }

  private loadFriends(): void {
    const me = this.chat.currentUserId;

    this.friendService.getMyFriends().subscribe({
      next: rows => this.friends.set(rows.map(row => {
        const friendIsSender = row.senderId !== me;
        return {
          id: row.friendId ?? (friendIsSender ? row.senderId : row.receiverId),
          fullName: row.friendName ?? (friendIsSender ? row.senderName : row.receiverName) ?? 'Friend',
          profilePictureUrl: row.friendProfilePictureUrl ??
            (friendIsSender ? row.senderProfilePictureUrl : row.receiverProfilePictureUrl)
        };
      })),
      error: () => { /* the chats that exist are still listed */ }
    });
  }
}
