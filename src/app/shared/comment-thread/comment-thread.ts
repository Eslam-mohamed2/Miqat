import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Input, ViewChild,
  computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { CommentService } from '../../core/services/comment.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { CommentDto, MentionableUserDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

/** One run of a rendered comment: either plain text or a resolved @mention. */
interface CommentPart {
  text: string;
  mentionOf: MentionableUserDto | null;
}

/**
 * A task's discussion thread with @mention support.
 *
 * Typing `@` opens a picker of everyone the current user may mention here: the
 * task's owner and assignee, the project's members, and the user's own friends.
 * Friends who cannot see the task yet are marked — picking one grants them
 * access when the comment is posted, which is the whole point of mentioning a
 * friend on a task you need help with.
 *
 * Mentions travel to the API as user ids, never as text. The name in the
 * textarea is only a label; if the author deletes it before posting, the id is
 * dropped with it.
 */
@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './comment-thread.html',
  styleUrl: './comment-thread.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommentThread {
  private comments_ = inject(CommentService);
  private auth = inject(AuthService);
  private realtime = inject(RealtimeService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('composer') composerRef?: ElementRef<HTMLTextAreaElement>;

  private taskIdValue: string | null = null;

  @Input({ required: true })
  set taskId(value: string | null | undefined) {
    if (!value || value === this.taskIdValue) return;
    this.taskIdValue = value;
    this.load();
  }
  get taskId(): string | null { return this.taskIdValue; }

  /** Compact rendering for the modal; the full page uses the roomier layout. */
  @Input() compact = false;

  /**
   * A comment to scroll to and mark, arrived at from a notification. Set before
   * the thread has loaded, so the scroll happens once the rows exist rather
   * than immediately.
   */
  @Input()
  set focusCommentId(value: string | null | undefined) {
    this.focusedId.set(value ?? null);
    if (value) this.pendingScroll = true;
  }

  focusedId = signal<string | null>(null);
  private pendingScroll = false;

  comments = signal<CommentDto[]>([]);
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

  readonly myId = this.auth.getCurrentUserId();

  constructor() {
    // Someone else commenting on the open task should show up without a reload.
    this.realtime.commentAdded$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event?.taskId && event.taskId === this.taskIdValue) this.refresh();
      });
  }

  private load() {
    const id = this.taskIdValue;
    if (!id) return;
    this.loading.set(true);
    this.comments_.getForTask(id).subscribe({
      next: thread => {
        this.comments.set(thread ?? []);
        this.loading.set(false);
        this.scrollToFocused();
      },
      error: () => { this.comments.set([]); this.loading.set(false); }
    });
    // A failure here only costs the picker, so it must not surface as an error.
    this.comments_.getMentionable(id).subscribe({
      next: people => this.mentionable.set(people ?? []),
      error: () => this.mentionable.set([])
    });
  }

  private refresh() {
    const id = this.taskIdValue;
    if (!id) return;
    this.comments_.getForTask(id).subscribe({
      next: thread => this.comments.set(thread ?? [])
    });
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

  // ── Composer ──────────────────────────────────────────────────────────────

  onInput(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    this.syncMenu(el);
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
   * Arrow keys and Enter belong to the menu while it is open; otherwise they
   * must fall through so the textarea still behaves like a textarea.
   */
  onKeydown(event: KeyboardEvent) {
    if (!this.menuOpen()) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        this.post();
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
        this.draft.set('');
        this.picked.clear();
        this.posting.set(false);
        if (this.composerRef) this.composerRef.nativeElement.value = '';
        // Anyone just granted access is now a member, so the picker is stale.
        if (ids.length) this.load();
      },
      error: err => {
        this.posting.set(false);
        this.error.set(apiErrorMessage(err, 'Could not post that comment.'));
      }
    });
  }

  remove(comment: CommentDto) {
    const snapshot = this.comments();
    this.comments.update(list => list.filter(c => c.id !== comment.id));
    this.comments_.delete(comment.id).subscribe({
      error: () => {
        this.comments.set(snapshot);
        this.error.set('Could not delete that comment.');
      }
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  /**
   * Split a comment so mentions of known people can be linked. Names are matched
   * longest-first, otherwise "@Sara" would win over "@Sara Adel".
   */
  parts(comment: CommentDto): CommentPart[] {
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

  isMine(comment: CommentDto): boolean {
    return !!this.myId && comment.authorId === this.myId;
  }

  initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  /** "just now" / "12m" / "3h" / a date once it is older than a week. */
  when(dateStr: string): string {
    const then = new Date(dateStr).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    if (mins < 10080) return `${Math.round(mins / 1440)}d ago`;
    return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  trackById = (_: number, item: { id?: string; userId?: string }) => item.id ?? item.userId!;
}
