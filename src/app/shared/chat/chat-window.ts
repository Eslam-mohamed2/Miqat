import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, afterRenderEffect,
  computed, inject, input, signal, viewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ChatMessage, ChatService, describeCall } from '../../core/services/chat.service';
import { CallService } from '../../core/services/call.service';
import { ChatAvatar } from './chat-avatar';

/** One message as the window draws it. */
interface MessageRow {
  message: ChatMessage;
  mine: boolean;
  /** "Today", "Yesterday" or a date, on the first message of each day. */
  day: string | null;
  time: string;
  /** Last of a run of messages from the same person: it gets the gap below it. */
  endsGroup: boolean;
  /** For the record of a call: what to say about it ("Video call · 2:05"). Null for a normal message. */
  call: string | null;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
/** Messages of one person less than this apart are drawn as one group. */
const GROUP_GAP_MS = 5 * 60 * 1000;
/** Closer than this to the end counts as "reading the newest messages". */
const NEAR_BOTTOM_PX = 80;

/**
 * A pop-up chat with one friend: the messages, "is typing", "seen", and the
 * box to write in. All state lives in ChatService; this only draws it.
 */
@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [MatIconModule, ChatAvatar],
  templateUrl: './chat-window.html',
  styleUrl: './chat-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatWindow {
  protected chat = inject(ChatService);
  protected calls = inject(CallService);
  private router = inject(Router);

  readonly conversationId = input.required<string>();

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  protected readonly conversation = computed(() => this.chat.conversation(this.conversationId()));
  protected readonly thread = computed(() => this.chat.thread(this.conversationId()));
  protected readonly online = computed(() => this.chat.isOnline(this.conversation()?.friend.id ?? ''));
  protected readonly typing = computed(() => this.chat.isTyping(this.conversationId()));

  protected readonly draft = signal('');
  /** The own message being rewritten in the box, if any. */
  protected readonly editing = signal<ChatMessage | null>(null);
  /** The own message whose "Delete?" question is showing. */
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal('');

  protected readonly rows = computed<MessageRow[]>(() => {
    const me = this.chat.currentUserId;
    const messages = this.thread().messages;

    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      const at = new Date(message.createdAt);

      return {
        message,
        mine: message.senderId === me,
        call: message.callOutcome ? describeCall(message, message.senderId === me) : null,
        day: !previous || !sameDay(new Date(previous.createdAt), at) ? dayLabel(at) : null,
        time: timeFormat.format(at),
        endsGroup: !next || next.senderId !== message.senderId ||
          new Date(next.createdAt).getTime() - at.getTime() > GROUP_GAP_MS
      };
    });
  });

  /** Under the newest message when it is the user's own: has it gone out, has the friend seen it. */
  protected readonly receipt = computed(() => {
    const last = this.thread().messages.at(-1);
    if (!last || last.senderId !== this.chat.currentUserId || last.isDeleted || last.callOutcome) return '';
    if (last.state === 'sending') return 'Sending…';
    if (last.state === 'failed') return '';

    const seenAt = this.conversation()?.friendLastReadAt;
    return seenAt && seenAt >= last.createdAt ? 'Seen' : 'Sent';
  });

  /** Follow new messages only while the user is at the end; reading older ones is left alone. */
  private atBottom = true;
  /** Set while older messages load: the height before, to keep the same messages in view after. */
  private heightBeforeOlder: number | null = null;

  constructor() {
    afterRenderEffect(() => {
      // Runs after every change to what is listed (new, older, typing, receipt).
      this.rows(); this.typing(); this.receipt();

      const el = this.scroller()?.nativeElement;
      if (!el) return;

      if (this.heightBeforeOlder !== null) {
        el.scrollTop += el.scrollHeight - this.heightBeforeOlder;
        this.heightBeforeOlder = null;
      } else if (this.atBottom) {
        el.scrollTop = el.scrollHeight;
      }
    });

    afterNextRender(() => this.box()?.nativeElement.focus({ preventScroll: true }));
  }

  // ── Reading ─────────────────────────────────────────────────────────────────

  protected onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;

    this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (el.scrollTop < 60) this.loadOlder();
  }

  protected loadOlder(): void {
    const el = this.scroller()?.nativeElement;
    const thread = this.thread();
    if (!el || !thread.hasMore || thread.loading) return;

    this.heightBeforeOlder = el.scrollHeight;
    this.chat.loadOlder(this.conversationId()).subscribe(added => {
      if (!added) this.heightBeforeOlder = null;
    });
  }

  /** Coming back to the tab with the window open counts as reading it. */
  @HostListener('document:visibilitychange')
  protected onVisibility(): void {
    if (document.visibilityState === 'visible') this.chat.markRead(this.conversationId());
  }

  /** Calls the friend of this chat. */
  protected call(video: boolean): void {
    const conversation = this.conversation();
    if (conversation) this.calls.startCall(conversation, video);
  }

  protected openProfile(): void {
    const friend = this.conversation()?.friend;
    if (friend) this.router.navigate(['/profile', friend.id]);
  }

  // ── Writing ─────────────────────────────────────────────────────────────────

  protected onInput(event: Event): void {
    const box = event.target as HTMLTextAreaElement;
    this.draft.set(box.value);
    this.fit(box);
    if (box.value.trim() && !this.editing()) this.chat.typing(this.conversationId());
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter sends, Shift+Enter starts a new line; Enter while composing (IME) belongs to the keyboard.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'Escape' && this.editing()) {
      event.stopPropagation();
      this.cancelEdit();
    }
  }

  protected submit(): void {
    const text = this.draft().trim();
    if (!text) return;

    const editing = this.editing();
    if (editing) {
      this.error.set('');
      this.chat.edit(editing, text).subscribe({
        next: () => this.cancelEdit(),
        error: err => this.error.set(err?.error?.message || 'Could not save the change.')
      });
      return;
    }

    this.atBottom = true;
    this.chat.send(this.conversationId(), text);
    this.clearBox();
  }

  protected startEdit(message: ChatMessage): void {
    this.deleting.set(null);
    this.error.set('');
    this.editing.set(message);
    this.setBox(message.body);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.clearBox();
  }

  protected confirmDelete(message: ChatMessage): void {
    this.deleting.set(null);
    this.error.set('');
    if (this.editing()?.id === message.id) this.cancelEdit();

    this.chat.remove(message).subscribe({
      error: err => this.error.set(err?.error?.message || 'Could not delete the message.')
    });
  }

  private clearBox(): void { this.setBox(''); }

  private setBox(text: string): void {
    this.draft.set(text);
    const box = this.box()?.nativeElement;
    if (!box) return;

    box.value = text;
    this.fit(box);
    box.focus({ preventScroll: true });
  }

  /** The box grows with its text, up to the limit set in the stylesheet. */
  private fit(box: HTMLTextAreaElement): void {
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' })
  }).format(date);
}
