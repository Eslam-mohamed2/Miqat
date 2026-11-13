import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal
} from '@angular/core';
import { ChatConversation, ChatPerson, ChatService } from '../../core/services/chat.service';
import { CallService } from '../../core/services/call.service';
import { GroupCallService } from '../../core/services/group-call.service';
import { chatTitle, isInCall, previewText } from '../../core/services/chat-text';
import { serverMessage } from '../../core/http/api-error';
import { locale, num, t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';
import { ChatWindow } from './chat-window';
import { NewGroupDialog } from './new-group-dialog';

const shortTime = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });

/**
 * The chat corner of the app, messenger style: a round button that opens the
 * chat list, the docked chats as small round bubbles above it, and the open
 * chats as pop-up windows beside them. It also draws the "New group" dialog,
 * so that it can be opened from any page.
 *
 * It sits in the bottom corner at the end edge: bottom right in English,
 * bottom left in Arabic, with the windows stacking toward the start.
 *
 * It draws nothing on an API build without chat.
 */
@Component({
  selector: 'app-chat-dock',
  standalone: true,
  imports: [ChatAvatar, ChatIcon, ChatWindow, NewGroupDialog, TPipe],
  templateUrl: './chat-dock.html',
  styleUrl: './chat-dock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatDock {
  protected chat = inject(ChatService);
  protected calls = inject(CallService);
  protected groupCalls = inject(GroupCallService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly panelOpen = signal(false);
  protected readonly search = signal('');
  protected readonly error = signal('');

  protected readonly matchingChats = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.chat.conversations().filter(c => !term || chatTitle(c).toLowerCase().includes(term));
  });

  /** Friends there is no chat with yet. */
  protected readonly matchingFriends = computed(() => {
    const term = this.search().trim().toLowerCase();
    const chatting = new Set(this.chat.conversations().filter(c => !c.isGroup).map(c => c.friend.id));

    return this.chat.friends().filter(f => !chatting.has(f.id) && (!term || f.fullName.toLowerCase().includes(term)));
  });

  protected togglePanel(): void {
    this.panelOpen.update(open => !open);
    if (!this.panelOpen()) return;

    this.search.set('');
    this.error.set('');
    this.chat.loadFriends();
  }

  protected openChat(conversation: ChatConversation): void {
    this.chat.open(conversation.id);
    this.panelOpen.set(false);
  }

  protected startChat(friend: ChatPerson): void {
    this.error.set('');
    this.chat.openWith(friend.id).subscribe({
      next: () => this.panelOpen.set(false),
      error: err => this.error.set(err?.error?.message
        ? serverMessage(err.error.message)
        : t('Could not open the chat. Try again.'))
    });
  }

  protected newGroup(): void {
    this.panelOpen.set(false);
    this.chat.creatingGroup.set(true);
  }

  protected title(conversation: ChatConversation): string { return chatTitle(conversation); }

  /** What the list shows under a name: the newest message, in a few words. */
  protected preview(conversation: ChatConversation): string {
    return previewText(conversation, this.chat.currentUserId);
  }

  /** "typing…" for a friend, who it is in a group. Empty when nobody is. */
  protected typingLine(conversation: ChatConversation): string {
    if (!this.chat.isTyping(conversation.id)) return '';
    return conversation.isGroup ? this.chat.typingText(conversation.id) : t('typing…');
  }

  /** What a screen reader says for a chat's bubble: who it is with, and how much is unread. */
  protected headLabel(conversation: ChatConversation): string {
    const name = chatTitle(conversation);
    return conversation.unreadCount
      ? t('Chat with {name}, {n} unread', { name, n: conversation.unreadCount })
      : t('Chat with {name}', { name });
  }

  /** The same for the round button of the list. */
  protected launcherLabel(): string {
    const unread = this.chat.unreadTotal();
    return unread ? t('Chats, {n} unread', { n: unread }) : t('Chats');
  }

  /** A call is going on in this group that this account is not in: the list offers to join it. */
  protected canJoin(conversation: ChatConversation): boolean {
    return this.calls.supported && !!conversation.activeCall && !isInCall(conversation, this.chat.currentUserId);
  }

  protected joinCall(conversation: ChatConversation): void {
    if (!conversation.activeCall) return;

    this.groupCalls.join(conversation.activeCall, chatTitle(conversation));
    this.chat.open(conversation.id);
    this.panelOpen.set(false);
  }

  /** The time today, otherwise the date. */
  protected when(iso?: string | null): string {
    if (!iso) return '';

    const date = new Date(iso);
    return date.toDateString() === new Date().toDateString() ? shortTime.format(date) : shortDate.format(date);
  }

  protected badge(count: number): string {
    return num(count > 9 ? '9+' : String(count));
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
}
