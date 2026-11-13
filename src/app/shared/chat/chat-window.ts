import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, afterRenderEffect,
  computed, inject, input, signal, viewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { ChatMessage, ChatService } from '../../core/services/chat.service';
import { CallService } from '../../core/services/call.service';
import { GroupCallService } from '../../core/services/group-call.service';
import { GROUP_CALL_LIMIT } from '../../core/services/group-call-rules';
import { ChatUser } from '../../core/services/realtime.service';
import {
  chatTitle, countLabel, describeCall, describeGroupEvent, isInCall, isolate, readersOf, sameRun, seenLabel
} from '../../core/services/chat-text';
import { serverMessage } from '../../core/http/api-error';
import { locale, t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';
import { ChatMembers } from './chat-members';

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
  /** For a line about the group itself: what happened ("Sara added Omar"). */
  event: string | null;
  /** In a group, on someone else's message: who wrote it. Their picture goes beside the last of a run. */
  sender: ChatUser | null;
  /** In a group, on the first of a run of someone else's messages: their name above it. */
  showsName: boolean;
}

const timeFormat = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
/** Messages of one person less than this apart are drawn as one group. */
const GROUP_GAP_MS = 5 * 60 * 1000;
/** Closer than this to the end counts as "reading the newest messages". */
const NEAR_BOTTOM_PX = 80;

/**
 * A pop-up chat with one friend or with a group: the messages, "is typing",
 * "seen", and the box to write in. A group's window also names who wrote each
 * message, shows what happened to the group, and opens its members and its
 * call. All state lives in ChatService; this only draws it.
 */
@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [ChatAvatar, ChatIcon, ChatMembers, TPipe],
  templateUrl: './chat-window.html',
  styleUrl: './chat-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatWindow {
  protected chat = inject(ChatService);
  protected calls = inject(CallService);
  protected groupCalls = inject(GroupCallService);
  private router = inject(Router);

  readonly conversationId = input.required<string>();

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  protected readonly conversation = computed(() => this.chat.conversation(this.conversationId()));
  protected readonly thread = computed(() => this.chat.thread(this.conversationId()));
  protected readonly online = computed(() => this.chat.isOnline(this.conversation()?.friend.id ?? ''));
  protected readonly typing = computed(() => this.chat.isTyping(this.conversationId()));
  /** "typing…" for a friend, "Omar is typing…" in a group. */
  protected readonly typingText = computed(() => this.chat.typingText(this.conversationId()));

  /** The friend's name, or the group's. */
  protected readonly title = computed(() => {
    const conversation = this.conversation();
    return conversation ? chatTitle(conversation) : '';
  });

  /** Under a group's name: how many people it has. */
  protected readonly memberCount = computed(() =>
    countLabel(this.conversation()?.participants?.length ?? 0, 'member', 'members'));

  /** In an empty chat: "Say hello to Omar." */
  protected readonly hello = computed(() => t('Say hello to {name}.', { name: isolate(this.title()) }));

  /** The members panel of a group is open over the messages. */
  protected readonly membersOpen = signal(false);

  /** A call of any kind is going on in this tab: one at a time. */
  protected readonly onCall = computed(() => !!this.calls.call() || !!this.groupCalls.call());

  /** The call going on in this group, unless this tab is the one in it. */
  protected readonly liveCall = computed(() => {
    const call = this.conversation()?.activeCall;
    return call && this.groupCalls.call()?.id !== call.callId ? call : null;
  });

  /** The user is in the group's call with another tab or device, so it cannot be joined here. */
  protected readonly inCallElsewhere = computed(() => isInCall(this.conversation(), this.chat.currentUserId));

  protected readonly liveCallFull = computed(() => (this.liveCall()?.participants.length ?? 0) >= GROUP_CALL_LIMIT);

  protected readonly liveCallText = computed(() => {
    const count = this.liveCall()?.participants.length ?? 0;
    return this.liveCallFull()
      ? tCount(count, 'Call in progress · full ({n} people)', 'Call in progress · full ({n} people)')
      : tCount(count, 'Call in progress · {n} person', 'Call in progress · {n} people');
  });

  protected readonly draft = signal('');
  /** The own message being rewritten in the box, if any. */
  protected readonly editing = signal<ChatMessage | null>(null);
  /** The own message whose "Delete?" question is showing. */
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal('');

  protected readonly rows = computed<MessageRow[]>(() => {
    const me = this.chat.currentUserId;
    const messages = this.thread().messages;
    const conversation = this.conversation();
    const group = !!conversation?.isGroup;

    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      const at = new Date(message.createdAt);
      const mine = message.senderId === me;
      const written = !message.callOutcome && !message.groupEvent;

      return {
        message,
        mine,
        call: message.callOutcome ? describeCall(message, mine) : null,
        event: message.groupEvent ? describeGroupEvent(message, me) : null,
        day: !previous || !sameDay(new Date(previous.createdAt), at) ? dayLabel(at) : null,
        time: timeFormat.format(at),
        endsGroup: group
          ? !sameRun(message, next, GROUP_GAP_MS)
          : !next || next.senderId !== message.senderId ||
            new Date(next.createdAt).getTime() - at.getTime() > GROUP_GAP_MS,
        sender: group && !mine && written
          ? message.sender ?? conversation?.participants?.find(p => p.id === message.senderId) ??
            { id: message.senderId, fullName: t('Someone') }
          : null,
        showsName: group && !mine && written && !sameRun(previous, message, GROUP_GAP_MS)
      };
    });
  });

  /** Under the newest message when it is the user's own: has it gone out, who has seen it. */
  protected readonly receipt = computed(() => {
    const last = this.thread().messages.at(-1);
    if (!last || last.senderId !== this.chat.currentUserId || last.isDeleted || last.callOutcome || last.groupEvent) return '';
    if (last.state === 'sending') return t('Sending…');
    if (last.state === 'failed') return '';

    const conversation = this.conversation();
    if (conversation?.isGroup) {
      const people = conversation.participants ?? [];
      return seenLabel(readersOf(people, this.chat.currentUserId, last.createdAt), people.length - 1);
    }

    const seenAt = conversation?.friendLastReadAt;
    return seenAt && seenAt >= last.createdAt ? t('Seen') : t('Sent');
  });

  /** Follow new messages only while the user is at the end; reading older ones is left alone. */
  private atBottom = true;
  /** Set while older messages load: the height before, to keep the same messages in view after. */
  private heightBeforeOlder: number | null = null;

  constructor() {
    afterRenderEffect(() => {
      // Runs after every change to what is listed (new, older, typing, receipt)
      // and to the room it has (the strip of a call in progress).
      this.rows(); this.typing(); this.receipt(); this.liveCall();

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

  /** Calls the friend of this chat, or starts a call in this group. */
  protected call(video: boolean): void {
    const conversation = this.conversation();
    if (!conversation) return;

    if (conversation.isGroup) this.groupCalls.startCall(conversation.id, this.title(), video);
    else this.calls.startCall(conversation, video);
  }

  /** Joins the call that is going on in this group. */
  protected joinCall(): void {
    const call = this.liveCall();
    if (call) this.groupCalls.join(call, this.title());
  }

  /** The header: a friend's profile, a group's members. */
  protected openDetails(): void {
    const conversation = this.conversation();
    if (conversation?.isGroup) this.membersOpen.update(open => !open);
    else if (conversation) this.router.navigate(['/profile', conversation.friend.id]);
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
        error: err => this.error.set(said(err, 'Could not save the change.'))
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
      error: err => this.error.set(said(err, 'Could not delete the message.'))
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

/** The server's refusal when it gave one, otherwise `fallback`: both in the interface language. */
function said(err: { error?: { message?: string } } | null | undefined, fallback: string): string {
  return err?.error?.message ? serverMessage(err.error.message) : t(fallback);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(date, today)) return t('Today');
  if (sameDay(date, yesterday)) return t('Yesterday');

  return new Intl.DateTimeFormat(locale(), {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' })
  }).format(date);
}
