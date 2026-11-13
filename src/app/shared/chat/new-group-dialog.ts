import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, computed, inject, signal, viewChild
} from '@angular/core';
import { ChatService } from '../../core/services/chat.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatIcon } from './chat-icon';
import { FriendPicker } from './friend-picker';

/** A group needs the user and at least this many friends. */
const MIN_OTHERS = 2;

/**
 * "New group": a name and at least two friends. Creating it opens the group's
 * chat. Drawn by the chat corner while ChatService.creatingGroup is set.
 */
@Component({
  selector: 'app-new-group-dialog',
  standalone: true,
  imports: [ChatIcon, FriendPicker, TPipe],
  templateUrl: './new-group-dialog.html',
  styleUrl: './new-group-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewGroupDialog {
  protected chat = inject(ChatService);

  private nameBox = viewChild<ElementRef<HTMLInputElement>>('nameBox');

  protected readonly name = signal('');
  protected readonly memberIds = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly ready = computed(() => !!this.name().trim() && this.memberIds().length >= MIN_OTHERS);

  /** What is still missing, next to the buttons. */
  protected readonly hint = computed(() => {
    if (this.memberIds().length >= MIN_OTHERS) return this.name().trim() ? '' : t('Give the group a name.');
    return this.chat.friends().length < MIN_OTHERS
      ? t('A group needs at least two of your friends.')
      : t('Pick at least two friends.');
  });

  constructor() {
    this.chat.loadFriends();
    afterNextRender(() => this.nameBox()?.nativeElement.focus());
  }

  /** A refusal was about the people chosen: it goes away when they change. */
  protected pick(ids: string[]): void {
    this.memberIds.set(ids);
    this.error.set('');
  }

  protected create(): void {
    if (!this.ready() || this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.chat.createGroup(this.name(), this.memberIds()).subscribe({
      next: () => this.close(),
      error: err => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(err, t('Could not create the group. Try again.')));
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected close(): void {
    this.chat.creatingGroup.set(false);
  }
}
