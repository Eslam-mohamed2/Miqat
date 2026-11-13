import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { ChatPerson, ChatService } from '../../core/services/chat.service';
import { t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';

/**
 * Picks several friends: a search box, the people chosen so far as chips, and
 * the list to choose from. Used to fill a new group and to add people to one.
 */
@Component({
  selector: 'app-friend-picker',
  standalone: true,
  imports: [ChatAvatar, ChatIcon, TPipe],
  templateUrl: './friend-picker.html',
  styleUrl: './friend-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendPicker {
  protected chat = inject(ChatService);

  /** The people to choose from. */
  readonly people = input.required<ChatPerson[]>();
  /** The ids chosen so far. */
  readonly selected = model<string[]>([]);
  /** Shown when there is nobody to choose from, in the interface language. */
  readonly emptyText = input(t('You have no friends to add yet.'));

  protected readonly search = signal('');

  protected readonly matching = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.people().filter(p => !term || p.fullName.toLowerCase().includes(term));
  });

  protected readonly chosen = computed(() => {
    const people = this.people();
    return this.selected()
      .map(id => people.find(p => p.id === id))
      .filter((p): p is ChatPerson => !!p);
  });

  protected isChosen(id: string): boolean { return this.selected().includes(id); }

  protected toggle(id: string): void {
    this.selected.update(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  }
}
