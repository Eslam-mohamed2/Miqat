import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, EventEmitter, Injector, Input, Output, ViewChild,
  afterNextRender, computed, inject, signal
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, fromEvent } from 'rxjs';
import { CommentService } from '../../core/services/comment.service';
import { GroupService, discussionMissing } from '../../core/services/group.service';
import { AuthService } from '../../core/services/auth.service';
import { ProjectCommentEvent, RealtimeService } from '../../core/services/realtime.service';
import { ToastService } from '../../core/services/toast.service';
import { CommentDto, GroupCommentDto, GroupCommentPage, MentionableUserDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { locale, t, tCount } from '../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';

/** One run of a rendered comment: either plain text or a resolved @mention. */
interface CommentPart {
  text: string;
  mentionOf: MentionableUserDto | null;
}

/**
 * A row of the thread: a comment on a task or in a project's discussion, plus
 * what only this app knows about it while it is being sent.
 */
export interface ThreadComment {
  id: string;
  content: string;
  authorId: string;
  authorName?: string | null;
  authorProfilePictureUrl?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  isEdited?: boolean;
  /** Discussion only: the comment this one answers. */
  parentId?: string | null;
  /** Discussion only: what the server lets the reader do. */
  canEdit?: boolean;
  canDelete?: boolean;
  /** The id this app gave the comment before the server had it. */
  clientId?: string | null;
  /** Shown before the server answered ('sending'), or after it refused ('failed'). */
  state?: 'sending' | 'failed';
  /** Who the comment mentions, kept so a failed one can be sent again as it was. */
  mentionIds?: string[];
}

/** A comment of its own with the replies under it. */
interface Thread {
  comment: ThreadComment;
  replies: ThreadComment[];
}

/** Close enough to the end of the page that a new comment should stay in view. */
const NEAR_END_PX = 160;
/** How far a notification's comment is looked for in older pages before giving up. */
const MAX_PAGES_TO_FOCUS = 12;

/**
 * A discussion thread with @mention support, in one of two places:
 *
 * - on a task (`taskId`): the flat "Activity" thread of the task panel;
 * - in a project (`projectId`): the project's Discussion, where members write to
 *   each other. It adds what a longer conversation needs: replies one level deep,
 *   older comments a page at a time, comments that appear, change and go as they
 *   happen, and a comment that shows at once while it is being sent.
 *
 * Typing `@` opens a picker of everyone the current user may mention here. On a
 * task that includes friends who cannot see it yet: picking one grants them
 * access when the comment is posted. In a project only its members are offered.
 *
 * Mentions travel to the API as user ids, never as text. The name in the
 * textarea is only a label; if the author deletes it before posting, the id is
 * dropped with it.
 */
@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, TPipe, NumPipe],
  templateUrl: './comment-thread.html',
  styleUrl: './comment-thread.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommentThread {
  private comments_ = inject(CommentService);
  private groups = inject(GroupService);
  private auth = inject(AuthService);
  private realtime = inject(RealtimeService);
  private toasts = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  @ViewChild('composer') composerRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('end') endRef?: ElementRef<HTMLElement>;
  @ViewChild('older') olderRef?: ElementRef<HTMLElement>;

  private taskIdValue: string | null = null;
  private projectIdValue: string | null = null;

  /** The task whose comments these are. Give this or `projectId`. */
  @Input()
  set taskId(value: string | null | undefined) {
    if (!value || value === this.taskIdValue) return;
    // Another task: nothing of the previous thread may stay on screen, or be posted here.
    if (this.taskIdValue || this.projectIdValue) this.reset();
    this.projectIdValue = null;
    this.discussion.set(false);
    this.taskIdValue = value;
    this.load();
  }
  get taskId(): string | null { return this.taskIdValue; }

  /** The project whose discussion this is. Give this or `taskId`. */
  @Input()
  set projectId(value: string | null | undefined) {
    if (!value || value === this.projectIdValue) return;
    if (this.taskIdValue || this.projectIdValue) this.reset();
    this.taskIdValue = null;
    this.discussion.set(true);
    this.projectIdValue = value;
    this.loadDiscussion();
  }
  get projectId(): string | null { return this.projectIdValue; }

  /** Compact rendering for the dialog; the task panel uses the roomier layout. */
  @Input() compact = false;

  /** The "Activity" heading. The task panel draws its own and switches this one off. */
  @Input() showHeading = true;

  /**
   * A comment to scroll to and mark, arrived at from a notification. Set before
   * the thread has loaded, so the scroll happens once the rows exist rather
   * than immediately.
   */
  @Input()
  set focusCommentId(value: string | null | undefined) {
    this.focusedId.set(value ?? null);
    if (value) {
      this.pendingScroll = true;
      // The discussion is already on screen: go to the comment now.
      if (this.discussion() && !this.loading() && this.comments().length) this.seekFocused();
    }
  }

  /** Discussion only: how many comments and replies the discussion has, whenever that is learned or changes. */
  @Output() countChange = new EventEmitter<number>();

  /** True for a project's discussion, false for a task's thread. */
  readonly discussion = signal(false);

  focusedId = signal<string | null>(null);
  private pendingScroll = false;

  comments = signal<ThreadComment[]>([]);
  loading = signal(false);
  posting = signal(false);
  error = signal<string | null>(null);

  draft = signal('');
  mentionable = signal<MentionableUserDto[]>([]);

  /** Ids picked from the menu, keyed by the exact label written into the text. */
  private picked = new Map<string, MentionableUserDto>();

  // ── Autocomplete state ────────────────────────────────────────────────────
  menuOpen = signal(false);
  menuQuery = signal('');
  activeIndex = signal(0);
  /** Caret offset of the `@` that opened the menu. */
  private tokenStart = -1;

  readonly suggestions = computed(() => {
    const q = this.menuQuery().trim().toLowerCase();
    const all = this.mentionable();
    if (!q) return all.slice(0, 8);
    return all
      .filter(u =>
        u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  });

  /**
   * People in the current draft who cannot see this task yet. Posting will let
   * them in, so the composer warns first rather than reporting it afterwards.
   */
  readonly grantsAccessTo = computed(() => {
    const text = this.draft();
    return [...this.picked.entries()]
      .filter(([label, user]) => !user.hasAccess && text.includes(label))
      .map(([, user]) => user);
  });

  /** "{names} will be given access…" around the names, which are drawn in bold. */
  readonly grantNote = splitAround(t('{names} will be given access to this task when you post.'), '{names}');
  /** "No comments yet. Type @ to pull someone in." around the @, which is drawn in bold. */
  readonly emptyHint = splitAround(t('No comments yet. Type {at} to pull someone in.'), '{at}');
  /** What stands between two names of a list: ", " ("، " in Arabic). */
  readonly listSeparator = t(', @@between names');

  readonly myId = this.auth.getCurrentUserId();

  constructor() {
    // Someone else commenting on the open task should show up without a reload.
    this.realtime.commentAdded$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event?.taskId && event.taskId === this.taskIdValue) this.refresh();
      });

    // In a project the event carries the comment itself: the thread changes in place.
    this.realtime.projectCommentChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => this.onDiscussionEvent(event));

    // Whatever was said while the connection was down was missed: read the newest page again.
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { if (this.discussion() && !this.missing() && !this.loading()) this.catchUp(); });

    this.destroyRef.onDestroy(() => this.scrollWatch?.unsubscribe());
  }

  // ── A task's thread ───────────────────────────────────────────────────────

  private load() {
    const id = this.taskIdValue;
    if (!id) return;
    this.loading.set(true);
    // An answer for a task the panel has already left is dropped.
    const current = () => id === this.taskIdValue;

    this.comments_.getForTask(id).subscribe({
      next: thread => {
        if (!current()) return;
        this.comments.set(thread ?? []);
        this.loading.set(false);
        this.scrollToFocused();
      },
      error: () => {
        if (!current()) return;
        this.comments.set([]);
        this.loading.set(false);
      }
    });
    // A failure here only costs the picker, so it must not surface as an error.
    this.comments_.getMentionable(id).subscribe({
      next: people => { if (current()) this.mentionable.set(people ?? []); },
      error: () => { if (current()) this.mentionable.set([]); }
    });
  }

  private refresh() {
    const id = this.taskIdValue;
    if (!id) return;
    this.comments_.getForTask(id).subscribe({
      next: thread => { if (id === this.taskIdValue) this.comments.set(thread ?? []); }
    });
  }

  private reset() {
    this.comments.set([]);
    this.mentionable.set([]);
    this.draft.set('');
    this.picked.clear();
    this.error.set(null);
    this.editingId.set(null);
    this.editDraft.set('');
    this.closeMenu();
    this.hasMore.set(false);
    this.loadingOlder.set(false);
    this.loadError.set(null);
    this.missing.set(false);
    this.replyTo.set(null);
    this.total = 0;
    this.pagesTried = 0;
    const box = this.composerRef?.nativeElement;
    if (box) {
      box.value = '';
      box.style.height = '';
    }
  }

  /**
   * Brings the linked comment into view once its row exists. The rAF is needed
   * because the signal write above only queues a render — querying for the row
   * in the same tick finds nothing.
   */
  private scrollToFocused() {
    if (!this.pendingScroll) return;
    const id = this.focusedId();
    if (!id) return;
    this.pendingScroll = false;

    requestAnimationFrame(() => {
      const row = document.getElementById(`comment-${id}`);
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  // ── A project's discussion ────────────────────────────────────────────────

  /** There are older comments than the ones on screen. */
  hasMore = signal(false);
  loadingOlder = signal(false);
  /** Why the discussion could not be read, when it could not. */
  loadError = signal<string | null>(null);
  /** The server is an older build that has no discussions. */
  missing = signal(false);
  /** The comment being answered, if any. Always a comment of its own, never a reply. */
  replyTo = signal<ThreadComment | null>(null);

  /** Comments and replies in the whole discussion, as last heard from the server. */
  private total = 0;
  private pagesTried = 0;
  private scrollWatch?: Subscription;

  /**
   * The discussion as it is drawn: every comment of its own, oldest first, with
   * its replies under it. A reply whose comment is on a page not read yet waits
   * for that page.
   */
  readonly threads = computed<Thread[]>(() => {
    const byParent = new Map<string, ThreadComment[]>();
    const tops: ThreadComment[] = [];
    for (const comment of this.comments()) {
      if (!comment.parentId) { tops.push(comment); continue; }
      const list = byParent.get(comment.parentId);
      if (list) list.push(comment); else byParent.set(comment.parentId, [comment]);
    }
    return tops.map(comment => ({ comment, replies: byParent.get(comment.id) ?? [] }));
  });

  private loadDiscussion() {
    const id = this.projectIdValue;
    if (!id) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.missing.set(false);
    const current = () => id === this.projectIdValue;

    this.groups.getComments(id).subscribe({
      next: page => {
        if (!current()) return;
        this.comments.set(page.comments);
        this.hasMore.set(page.hasMore);
        this.loading.set(false);
        this.setTotal(page.total);
        this.watchScroll();
        // Newest at the bottom: the page opens there, or on the comment a notification pointed at.
        if (this.pendingScroll && this.focusedId()) this.seekFocused();
        else this.scrollToEnd();
      },
      error: err => {
        if (!current()) return;
        this.comments.set([]);
        this.loading.set(false);
        if (discussionMissing(err)) this.missing.set(true);
        else this.loadError.set(apiErrorMessage(err, t('Could not load the discussion.')));
      }
    });
    // A failure here only costs the picker, so it must not surface as an error.
    this.groups.getMentionable(id).subscribe({
      next: people => { if (current()) this.mentionable.set(people ?? []); },
      error: () => { if (current()) this.mentionable.set([]); }
    });
  }

  /** "Try again" on the error state. */
  retryLoad() {
    this.loadDiscussion();
  }

  /** Reads the page before the oldest comment on screen and keeps the screen where it is. */
  loadOlder(then?: () => void) {
    const id = this.projectIdValue;
    const first = this.comments().find(c => !c.parentId && !c.state);
    if (!id || !first || !this.hasMore() || this.loadingOlder()) return;

    const scroller = this.scroller();
    const fromEnd = scroller ? scroller.scrollHeight - scroller.scrollTop : 0;
    this.loadingOlder.set(true);

    this.groups.getComments(id, first.id).subscribe({
      next: page => {
        if (id !== this.projectIdValue) return;
        const known = new Set(this.comments().map(c => c.id));
        this.comments.update(list => [...page.comments.filter(c => !known.has(c.id)), ...list]);
        this.hasMore.set(page.hasMore);
        this.loadingOlder.set(false);
        this.setTotal(page.total);
        // The older comments were added above: the ones being read must not move.
        afterNextRender(() => {
          if (scroller) scroller.scrollTop = scroller.scrollHeight - fromEnd;
          then?.();
        }, { injector: this.injector });
      },
      error: err => {
        if (id !== this.projectIdValue) return;
        this.loadingOlder.set(false);
        this.error.set(apiErrorMessage(err, t('Could not load earlier comments.')));
      }
    });
  }

  /** After a reconnect: the newest page again, laid over what is on screen. */
  private catchUp() {
    const id = this.projectIdValue;
    if (!id) return;
    this.groups.getComments(id).subscribe({
      next: page => {
        if (id !== this.projectIdValue) return;
        this.mergeNewest(page);
        this.setTotal(page.total);
      },
      error: () => { /* the next reconnect or reload tries again */ }
    });
  }

  private mergeNewest(page: GroupCommentPage) {
    const unsent = this.comments().filter(c => c.state);
    const loaded = this.comments().filter(c => !c.state);
    const firstNew = page.comments.find(c => !c.parentId);
    if (!firstNew) {
      this.comments.set(unsent);
      this.hasMore.set(false);
      return;
    }

    // What is on screen from before the new page stays, as long as the two meet.
    const cut = Date.parse(firstNew.createdAt);
    const olderIds = new Set(loaded.filter(c => !c.parentId && Date.parse(c.createdAt) < cut).map(c => c.id));
    const older = loaded.filter(c => olderIds.has(c.id) || (!!c.parentId && olderIds.has(c.parentId)));
    const meets = !page.hasMore || loaded.some(c => c.id === firstNew.id);

    if (older.length && meets) {
      this.comments.set([...older, ...page.comments, ...unsent]);
    } else {
      this.comments.set([...page.comments, ...unsent]);
      this.hasMore.set(page.hasMore);
    }
  }

  private onDiscussionEvent(event: ProjectCommentEvent | null | undefined) {
    if (!event || !this.projectIdValue || event.groupId !== this.projectIdValue || this.loading()) return;
    if (typeof event.total === 'number') this.setTotal(event.total);

    if (event.action === 'deleted') {
      this.forget(event.deletedIds ?? []);
    } else if (event.comment) {
      this.place(event.comment, event.action === 'added');
    }
  }

  /**
   * Puts a comment the server sent where it belongs: over the row that already
   * shows it (also the one still marked "sending"), or as a new row.
   */
  private place(comment: GroupCommentDto, isNew: boolean) {
    const list = this.comments();
    const known = list.some(c => c.id === comment.id);
    const mine = comment.clientId ? list.find(c => c.state && c.clientId === comment.clientId) : undefined;

    if (known) {
      // The row that was being sent is done with, if the event got here before the answer.
      this.comments.update(rows => rows
        .filter(c => c !== mine)
        .map(c => (c.id === comment.id ? { ...c, ...comment, state: undefined } : c)));
      return;
    }
    if (mine) {
      this.comments.update(rows => rows.map(c => (c === mine ? { ...comment } : c)));
      return;
    }
    if (!isNew) return;
    // A reply to a comment on a page not read yet comes with that page.
    if (comment.parentId && !list.some(c => c.id === comment.parentId)) return;

    const atEnd = this.nearEnd();
    this.comments.update(rows => [...rows, { ...comment }]);
    // Someone reading the newest comments keeps reading them; someone further up is left alone.
    if (atEnd && !comment.parentId) this.scrollToEnd();
  }

  /** Takes deleted comments, and the replies to them, off the screen. */
  private forget(ids: string[]) {
    if (!ids.length) return;
    const gone = new Set(ids);
    this.comments.update(rows => rows.filter(c => !gone.has(c.id) && !(c.parentId && gone.has(c.parentId))));
    if (this.editingId() && gone.has(this.editingId()!)) { this.editingId.set(null); this.editDraft.set(''); }
    const answering = this.replyTo();
    if (answering && gone.has(answering.id)) this.replyTo.set(null);
  }

  private setTotal(total: number) {
    this.total = Math.max(0, total);
    this.countChange.emit(this.total);
  }

  // ── Where the page is scrolled ────────────────────────────────────────────

  /** The element that scrolls the thread: the page's content area. */
  private scroller(): HTMLElement | null {
    let el = this.host.nativeElement.parentElement;
    while (el) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return el;
      el = el.parentElement;
    }
    return null;
  }

  private nearEnd(): boolean {
    const scroller = this.scroller();
    if (!scroller) return true;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_END_PX;
  }

  /** Brings the newest comment and the comment box into view. */
  private scrollToEnd() {
    afterNextRender(() => this.endRef?.nativeElement.scrollIntoView({ block: 'end' }), { injector: this.injector });
  }

  /** Scrolling up to the first comment on screen reads the ones before it. */
  private watchScroll() {
    if (this.scrollWatch) return;
    const scroller = this.scroller();
    if (!scroller) return;

    let last = scroller.scrollTop;
    this.scrollWatch = fromEvent(scroller, 'scroll', { passive: true }).subscribe(() => {
      const goingUp = scroller.scrollTop < last;
      last = scroller.scrollTop;
      const marker = this.olderRef?.nativeElement;
      if (!goingUp || !marker || !this.hasMore() || this.loadingOlder()) return;
      if (marker.getBoundingClientRect().bottom >= scroller.getBoundingClientRect().top - 200) this.loadOlder();
    });
  }

  /**
   * Goes to the comment a notification pointed at. It may be on an older page:
   * those are read until it turns up.
   */
  private seekFocused() {
    const id = this.focusedId();
    if (!id) return;

    if (this.comments().some(c => c.id === id)) {
      this.pendingScroll = false;
      this.pagesTried = 0;
      afterNextRender(() => {
        document.getElementById(`comment-${id}`)?.scrollIntoView({ block: 'center' });
      }, { injector: this.injector });
      return;
    }

    if (this.hasMore() && this.pagesTried < MAX_PAGES_TO_FOCUS) {
      this.pagesTried++;
      this.loadOlder(() => this.seekFocused());
      return;
    }
    // Deleted since, or too far back: the newest comments it is.
    this.pendingScroll = false;
    this.pagesTried = 0;
    this.scrollToEnd();
  }

  // ── Composer ──────────────────────────────────────────────────────────────

  onInput(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    this.fit(el);
    this.syncMenu(el);
    // The box grows downward as it fills: it must not slide under what floats over the page's end.
    if (this.discussion()) this.keepEndInView();
  }

  /** The box is one line tall and grows with what is typed (the stylesheet caps it). */
  private fit(el: HTMLTextAreaElement) {
    el.style.height = '';
    if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight}px`;
  }

  onClick(event: Event) {
    this.syncMenu(event.target as HTMLTextAreaElement);
  }

  /**
   * Decide whether the caret sits inside an `@…` token and, if so, what has been
   * typed after the `@`. One trailing space is allowed so full names like
   * "Sara Adel" keep matching; a second space ends the token.
   */
  private syncMenu(el: HTMLTextAreaElement) {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const match = /(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(before);

    if (!match) { this.closeMenu(); return; }

    this.tokenStart = caret - match[1].length - 1;
    this.menuQuery.set(match[1]);
    this.activeIndex.set(0);
    this.menuOpen.set(this.suggestions().length > 0);
  }

  closeMenu() {
    this.menuOpen.set(false);
    this.menuQuery.set('');
    this.tokenStart = -1;
  }

  /**
   * Arrow keys and Enter belong to the menu while it is open. Otherwise Enter
   * posts and Shift + Enter starts a new line.
   */
  onKeydown(event: KeyboardEvent) {
    if (!this.menuOpen()) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.post();
      } else if (event.key === 'Escape' && this.replyTo()) {
        // Esc gives up the reply, not the text.
        event.preventDefault();
        event.stopPropagation();
        this.cancelReply();
      }
      return;
    }

    const items = this.suggestions();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() + 1) % items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() - 1 + items.length) % items.length);
        break;
      case 'Enter':
      case 'Tab': {
        const chosen = items[this.activeIndex()];
        if (chosen) { event.preventDefault(); this.choose(chosen); }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.closeMenu();
        break;
    }
  }

  choose(user: MentionableUserDto) {
    const el = this.composerRef?.nativeElement;
    if (!el || this.tokenStart < 0) return;

    const label = `@${user.fullName}`;
    const caret = el.selectionStart ?? el.value.length;
    const next = `${el.value.slice(0, this.tokenStart)}${label} ${el.value.slice(caret)}`;
    const cursor = this.tokenStart + label.length + 1;

    this.picked.set(label, user);
    this.draft.set(next);
    this.closeMenu();

    // Writing through the DOM keeps the caret where the author expects it; the
    // signal alone would re-render with the caret at the end.
    el.value = next;
    el.focus();
    el.setSelectionRange(cursor, cursor);
  }

  post() {
    if (this.discussion()) { this.postToDiscussion(); return; }

    const id = this.taskIdValue;
    const content = this.draft().trim();
    if (!id || !content || this.posting()) return;

    // Only ids whose label survived editing are sent.
    const ids = [...this.picked.entries()]
      .filter(([label]) => content.includes(label))
      .map(([, user]) => user.userId);

    this.posting.set(true);
    this.error.set(null);
    this.comments_.add(id, content, ids).subscribe({
      next: comment => {
        this.comments.update(list => [...list, comment]);
        this.clearComposer();
        this.posting.set(false);
        // Anyone just granted access is now a member, so the picker is stale.
        if (ids.length) this.load();
      },
      error: err => {
        this.posting.set(false);
        this.error.set(apiErrorMessage(err, t('Could not post that comment.')));
      }
    });
  }

  private clearComposer() {
    this.draft.set('');
    this.picked.clear();
    const box = this.composerRef?.nativeElement;
    if (box) {
      box.value = '';
      box.style.height = '';
    }
  }

  // ── Writing in a discussion ───────────────────────────────────────────────

  /**
   * The comment is on screen the moment it is sent, marked as on its way. The
   * server's answer (or its live event, whichever is first) takes its place; a
   * refusal leaves it there to send again or take back.
   */
  private postToDiscussion() {
    const content = this.draft().trim();
    if (!this.projectIdValue || !content) return;

    // Only ids whose label survived editing are sent.
    const mentionIds = [...this.picked.entries()]
      .filter(([label]) => content.includes(label))
      .map(([, user]) => user.userId);

    const me = this.auth.getCurrentUser();
    const clientId = newClientId();
    const parent = this.replyTo();
    const row: ThreadComment = {
      id: `sending-${clientId}`,
      clientId,
      content,
      authorId: this.myId ?? '',
      authorName: me?.fullName ?? null,
      // The author's own picture is on any comment of theirs already on screen.
      authorProfilePictureUrl: this.comments().find(c => c.authorId === this.myId && !c.state)?.authorProfilePictureUrl ?? null,
      createdAt: new Date().toISOString(),
      parentId: parent?.id ?? null,
      state: 'sending',
      mentionIds
    };

    this.error.set(null);
    this.comments.update(list => [...list, row]);
    this.clearComposer();
    this.replyTo.set(null);

    if (row.parentId) this.reveal(row.id);
    else this.scrollToEnd();

    this.dispatch(row);
  }

  private dispatch(row: ThreadComment) {
    const id = this.projectIdValue;
    if (!id) return;

    this.groups.addComment(id, {
      content: row.content,
      parentId: row.parentId,
      mentionedUserIds: row.mentionIds,
      clientId: row.clientId ?? undefined
    }).subscribe({
      next: saved => {
        if (id !== this.projectIdValue) return;
        const counted = this.comments().some(c => c.id === saved.id);
        this.place({ ...saved, clientId: saved.clientId ?? row.clientId }, true);
        // Without the live channel nobody else says the discussion grew.
        if (!counted) this.setTotal(this.total + 1);
      },
      error: err => {
        if (id !== this.projectIdValue) return;
        this.comments.update(list => list.map(c => (c.id === row.id ? { ...c, state: 'failed' as const } : c)));
        this.error.set(apiErrorMessage(err, t('Could not post that comment.')));
      }
    });
  }

  /** "Try again" on a comment that was not sent. */
  retry(row: ThreadComment) {
    if (row.state !== 'failed') return;
    this.error.set(null);
    const again: ThreadComment = { ...row, state: 'sending' };
    this.comments.update(list => list.map(c => (c.id === row.id ? again : c)));
    this.dispatch(again);
  }

  /** Takes a comment that was not sent off the screen; its text goes back into the box when the box is free. */
  discard(row: ThreadComment) {
    this.comments.update(list => list.filter(c => c.id !== row.id));
    this.error.set(null);
    const box = this.composerRef?.nativeElement;
    if (box && !this.draft().trim()) {
      this.draft.set(row.content);
      box.value = row.content;
      this.fit(box);
      box.focus();
    }
  }

  /** "Reply" on a comment, or on a reply: the answer goes under the comment itself. */
  startReply(comment: ThreadComment) {
    const top = comment.parentId
      ? this.comments().find(c => c.id === comment.parentId) ?? null
      : comment;
    if (!top || top.state) return;
    this.replyTo.set(top);
    this.composerRef?.nativeElement.focus();
    // "Replying to ..." appears above the box and pushes it down.
    this.keepEndInView();
  }

  cancelReply() {
    this.replyTo.set(null);
  }

  /** With the comment box in use, the end of the thread stays on screen (it scrolls only when it has to). */
  private keepEndInView() {
    afterNextRender(() => this.endRef?.nativeElement.scrollIntoView({ block: 'nearest' }), { injector: this.injector });
  }

  /** Scrolls a row into view if it is not already. */
  private reveal(rowId: string) {
    afterNextRender(() => {
      document.getElementById(`comment-${rowId}`)?.scrollIntoView({ block: 'nearest' });
    }, { injector: this.injector });
  }

  // ── Editing ───────────────────────────────────────────────────────────────

  /** The comment being rewritten, if any. One at a time. */
  editingId = signal<string | null>(null);
  editDraft = signal('');
  savingEdit = signal(false);

  startEdit(comment: ThreadComment) {
    this.editingId.set(comment.id);
    this.editDraft.set(comment.content ?? '');
    this.error.set(null);
    // The textarea only exists after the next render.
    requestAnimationFrame(() => {
      const box = document.getElementById(`comment-edit-${comment.id}`) as HTMLTextAreaElement | null;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  }

  cancelEdit() {
    if (this.savingEdit()) return;
    this.editingId.set(null);
    this.editDraft.set('');
  }

  onEditInput(event: Event) {
    this.editDraft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Esc leaves the text as it was; Ctrl / Cmd + Enter saves. */
  onEditKeydown(event: KeyboardEvent, comment: ThreadComment) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelEdit();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.saveEdit(comment);
    }
  }

  /** True when saving would change something. */
  canSaveEdit(comment: ThreadComment): boolean {
    const text = this.editDraft().trim();
    return !!text && text !== (comment.content ?? '').trim() && !this.savingEdit();
  }

  saveEdit(comment: ThreadComment) {
    const content = this.editDraft().trim();
    if (!content || this.savingEdit()) return;
    if (content === (comment.content ?? '').trim()) { this.cancelEdit(); return; }

    this.savingEdit.set(true);
    this.error.set(null);
    const request: Observable<CommentDto | GroupCommentDto | null> = this.discussion()
      ? this.groups.updateComment(comment.id, content)
      : this.comments_.update(comment.id, content);

    request.subscribe({
      next: saved => {
        // Older answers may leave updatedAt out; the row still has to say "edited".
        const updatedAt = saved?.updatedAt ?? new Date().toISOString();
        this.comments.update(list => list.map(c =>
          c.id === comment.id ? { ...c, ...(saved ?? {}), content: saved?.content ?? content, updatedAt } : c));
        this.savingEdit.set(false);
        this.editingId.set(null);
        this.editDraft.set('');
      },
      error: err => {
        this.savingEdit.set(false);
        this.error.set(apiErrorMessage(err, t('Could not save that change.')));
      }
    });
  }

  /**
   * A comment counts as edited when it was changed after it was written. The API
   * leaves updatedAt empty until then; the stamps are also compared, in case a
   * build fills it in on creation with the same moment.
   */
  isEdited(comment: ThreadComment): boolean {
    return !!comment.updatedAt && comment.updatedAt !== comment.createdAt;
  }

  remove(comment: ThreadComment) {
    if (this.discussion()) { this.removeFromDiscussion(comment); return; }

    if (this.editingId() === comment.id) this.editingId.set(null);
    const snapshot = this.comments();
    this.comments.update(list => list.filter(c => c.id !== comment.id));
    this.comments_.delete(comment.id).subscribe({
      error: () => {
        this.comments.set(snapshot);
        this.error.set(t('Could not delete that comment.'));
      }
    });
  }

  /**
   * Asks first: the replies to a comment go with it, and nothing brings a
   * deleted comment back (so the confirmation offers no "Undo").
   */
  private removeFromDiscussion(comment: ThreadComment) {
    const replies = this.comments().filter(c => c.parentId === comment.id && !c.state).length;
    const question = replies
      ? tCount(replies, 'Delete this comment and the reply to it? This cannot be undone.',
        'Delete this comment and the {n} replies to it? This cannot be undone.')
      : t('Delete this comment? This cannot be undone.');
    if (!confirm(question)) return;

    const snapshot = this.comments();
    const before = this.total;
    this.error.set(null);
    this.forget([comment.id]);

    this.groups.deleteComment(comment.id).subscribe({
      next: () => {
        // The live event says the same; without it this keeps the count right.
        if (this.total === before) this.setTotal(before - 1 - replies);
        this.toasts.show(t('Comment deleted'));
      },
      error: err => {
        // Gone already (someone else deleted it first) is what was asked for.
        if (err?.status === 404 && !discussionMissing(err)) return;
        this.comments.set(snapshot);
        this.error.set(apiErrorMessage(err, t('Could not delete that comment.')));
      }
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /**
   * Split a comment so mentions of known people can be linked. Names are matched
   * longest-first, otherwise "@Sara" would win over "@Sara Adel".
   */
  parts(comment: ThreadComment): CommentPart[] {
    const people = [...this.mentionable()].sort((a, b) => b.fullName.length - a.fullName.length);
    const out: CommentPart[] = [];
    let rest = comment.content ?? '';

    outer: while (rest.length) {
      const at = rest.indexOf('@');
      if (at < 0) break;

      for (const person of people) {
        const label = `@${person.fullName}`;
        if (rest.startsWith(label, at)) {
          if (at > 0) out.push({ text: rest.slice(0, at), mentionOf: null });
          out.push({ text: label, mentionOf: person });
          rest = rest.slice(at + label.length);
          continue outer;
        }
      }
      // An "@" that names nobody we know is just text — step past it.
      out.push({ text: rest.slice(0, at + 1), mentionOf: null });
      rest = rest.slice(at + 1);
    }

    if (rest.length) out.push({ text: rest, mentionOf: null });
    return out;
  }

  /**
   * Authors whose avatar failed to load. Profile pictures are third-party URLs
   * (Google, Azure Blob) that can 403 or disappear; when one does, the row shows
   * initials instead of a broken-image icon.
   */
  private failedAvatars = signal<ReadonlySet<string>>(new Set());

  avatarFailed(userId: string): boolean {
    return this.failedAvatars().has(userId);
  }

  onAvatarError(userId: string) {
    this.failedAvatars.update(set => new Set(set).add(userId));
  }

  isMine(comment: ThreadComment): boolean {
    return !!this.myId && comment.authorId === this.myId;
  }

  /** Who may rewrite a comment: in a discussion the server says, on a task its author. */
  canEdit(comment: ThreadComment): boolean {
    if (comment.state) return false;
    return this.discussion() ? !!comment.canEdit : this.isMine(comment);
  }

  canDelete(comment: ThreadComment): boolean {
    if (comment.state) return false;
    return this.discussion() ? !!comment.canDelete : this.isMine(comment);
  }

  initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  /** The role the server gives a person in the picker ("Project member"), in the interface language. */
  relationship(user: MentionableUserDto): string {
    return user.relationship ? t(user.relationship) : '';
  }

  /** "just now" / "20 min ago" / "2 h ago" / "yesterday" / "Mon" / a date once it is older than a week. */
  when(dateStr: string): string {
    const then = new Date(dateStr).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return t('just now');
    if (mins < 60) return tCount(mins, '{n} min ago', '{n} min ago');
    if (mins < 1440) return tCount(Math.round(mins / 60), '{n} h ago', '{n} h ago');
    if (mins < 2880) return t('yesterday');
    if (mins < 10080) return new Date(then).toLocaleDateString(locale(), { weekday: 'short' });
    return new Date(then).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  }

  /** The whole date and time, shown when the short one is hovered: "Friday, November 13, 2026 at 10:42 AM". */
  fullDate(dateStr: string | null | undefined): string {
    const date = dateStr ? new Date(dateStr) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'short' });
  }
}

/** The text before and after a gap of a sentence, for a sentence with one styled word in it. */
function splitAround(sentence: string, gap: string): { before: string; after: string } {
  const at = sentence.indexOf(gap);
  return at < 0
    ? { before: sentence, after: '' }
    : { before: sentence.slice(0, at), after: sentence.slice(at + gap.length) };
}

function newClientId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `c-${Date.now().toString(36)}-${random.slice(0, 16)}`;
}
