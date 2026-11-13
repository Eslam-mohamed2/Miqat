import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ChatService } from '../../core/services/chat.service';
import { ChatParticipant } from '../../core/services/realtime.service';
import { countLabel, firstName, isolate } from '../../core/services/chat-text';
import { apiErrorMessage } from '../../core/http/api-error';
import { t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';
import { FriendPicker } from './friend-picker';

/**
 * The people of a group, inside its chat window: who is in it, who is an
 * admin and who is online; adding friends, and leaving. Admins also rename
 * the group, remove people and make others admins.
 */
@Component({
  selector: 'app-chat-members',
  standalone: true,
  imports: [ChatAvatar, ChatIcon, FriendPicker, TPipe],
  templateUrl: './chat-members.html',
  styleUrl: './chat-members.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatMembers {
  protected chat = inject(ChatService);

  readonly conversationId = input.required<string>();
  /** The user is done here: back to the messages. */
  readonly closed = output<void>();

  protected readonly conversation = computed(() => this.chat.conversation(this.conversationId()));
  protected readonly people = computed(() => this.conversation()?.participants ?? []);
  protected readonly countText = computed(() => countLabel(this.people().length, 'member', 'members'));

  /** Friends who are not in the group yet. */
  protected readonly candidates = computed(() => {
    const inGroup = new Set(this.people().map(p => p.id));
    return this.chat.friends().filter(f => !inGroup.has(f.id));
  });

  /** Picking friends to add, instead of the list. */
  protected readonly adding = signal(false);
  protected readonly addIds = signal<string[]>([]);
  protected readonly renaming = signal(false);
  protected readonly nameDraft = signal('');
  /** The person whose actions are open, and the one being asked about for removal. */
  protected readonly actingOn = signal<string | null>(null);
  protected readonly removing = signal<string | null>(null);
  protected readonly leaving = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected get me(): string | null { return this.chat.currentUserId; }

  protected isOnline(person: ChatParticipant): boolean {
    return person.id === this.me || this.chat.isOnline(person.id);
  }

  protected first(person: ChatParticipant): string { return firstName(person.fullName); }

  /** On the button of "Add people": "Add", "Add 3 people". */
  protected addLabel(): string {
    const count = this.addIds().length;
    return count > 1 ? tCount(count, 'Add {n} people', 'Add {n} people') : t('Add');
  }

  /** "Remove Omar from the group?" */
  protected removeQuestion(person: ChatParticipant): string {
    return t('Remove {name} from the group?', { name: isolate(this.first(person)) });
  }

  /** "Leave “Trip”? You will stop getting its messages." */
  protected leaveQuestion(name: string | null | undefined): string {
    return t('Leave “{name}”? You will stop getting its messages.', { name: isolate(name) });
  }

  protected back(): void {
    if (this.adding()) this.adding.set(false);
    else this.closed.emit();
  }

  // ── Adding ──────────────────────────────────────────────────────────────────

  protected startAdd(): void {
    this.error.set('');
    this.addIds.set([]);
    this.adding.set(true);
    this.chat.loadFriends();
  }

  protected add(): void {
    if (!this.addIds().length) return;
    this.run(this.chat.addMembers(this.conversationId(), this.addIds()), t('Could not add them. Try again.'),
      () => this.adding.set(false));
  }

  // ── Admins ──────────────────────────────────────────────────────────────────

  protected startRename(): void {
    this.error.set('');
    this.nameDraft.set(this.conversation()?.name ?? '');
    this.renaming.set(true);
  }

  protected saveName(event: Event): void {
    event.preventDefault();
    const name = this.nameDraft().trim();
    if (!name) return;

    this.run(this.chat.renameGroup(this.conversationId(), name), t('Could not rename the group. Try again.'),
      () => this.renaming.set(false));
  }

  protected toggleActions(person: ChatParticipant): void {
    this.removing.set(null);
    this.actingOn.update(id => (id === person.id ? null : person.id));
  }

  protected makeAdmin(person: ChatParticipant): void {
    this.run(this.chat.makeAdmin(this.conversationId(), person.id),
      t('Could not make {name} an admin.', { name: isolate(this.first(person)) }),
      () => this.actingOn.set(null));
  }

  protected remove(person: ChatParticipant): void {
    const failure = t('Could not remove {name}.', { name: isolate(this.first(person)) });
    this.run(this.chat.removeMember(this.conversationId(), person.id), failure, () => {
      this.actingOn.set(null);
      this.removing.set(null);
    });
  }

  // ── Leaving ─────────────────────────────────────────────────────────────────

  protected leave(): void {
    // The chat is gone from the screen the moment the server agrees.
    this.run(this.chat.leaveGroup(this.conversationId()), t('Could not leave the group. Try again.'), () => {});
  }

  /** `failure` is the sentence to show, already in the interface language, when the server gives none. */
  private run(request: Observable<unknown>, failure: string, done: () => void): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: () => {
        this.busy.set(false);
        done();
      },
      error: err => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, failure));
      }
    });
  }
}
