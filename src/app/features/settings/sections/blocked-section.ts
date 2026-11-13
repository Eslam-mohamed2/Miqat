import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { FriendService } from '../../../core/services/friend.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { UserDto } from '../../../models/api.models';
import { SettingsStatus } from '../settings-status';

/** Settings → Blocked people: the people the user blocked, each with the way back. */
@Component({
  selector: 'app-settings-blocked',
  standalone: true,
  imports: [TPipe],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="group">
      @if (state() === 'loading') {
        <div class="line" aria-hidden="true"><span class="line-text"><span class="ghost"></span></span></div>
      } @else if (state() === 'error') {
        <div class="line">
          <span class="line-text"><span class="line-hint">{{ 'The list could not be loaded.' | t }}</span></span>
          <button type="button" class="line-btn" (click)="load()">{{ 'Try again' | t }}</button>
        </div>
      } @else {
        @for (person of people(); track person.id) {
          <div class="line">
            <span class="line-text">
              <span class="line-label" dir="auto">{{ person.fullName || person.email }}</span>
              <span class="line-hint">{{ (unblocked().has(person.id) ? 'Unblocked just now' : 'Blocked@@person') | t }}</span>
            </span>
            @if (unblocked().has(person.id)) {
              <button type="button" class="line-btn" [disabled]="busy() === person.id" (click)="blockAgain(person)">{{ 'Block again' | t }}</button>
            } @else {
              <button type="button" class="line-btn" [disabled]="busy() === person.id" (click)="unblock(person)">{{ 'Unblock' | t }}</button>
            }
          </div>
        } @empty {
          <div class="line">
            <span class="line-text">
              <span class="line-label">{{ 'Nobody is blocked' | t }}</span>
              <span class="line-hint">{{ 'To block someone, open their profile in People and choose Block from the menu.' | t }}</span>
            </span>
          </div>
        }
      }
    </div>
    <p class="quiet">{{ 'Unblocking someone does not make them a friend again.' | t }}</p>
  `
})
export class BlockedSection {
  private friends = inject(FriendService);
  private status = inject(SettingsStatus);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly people = signal<UserDto[]>([]);
  /** Unblocked this visit: the row stays and offers "Block again". */
  protected readonly unblocked = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.friends.getBlockedUsers().subscribe({
      next: users => {
        this.people.set(users);
        this.state.set('ready');
      },
      error: () => this.state.set('error')
    });
  }

  protected unblock(person: UserDto): void {
    this.act(person, this.friends.unblockUser(person.id), set => set.add(person.id), t('That person could not be unblocked.'));
  }

  protected blockAgain(person: UserDto): void {
    this.act(person, this.friends.blockUser(person.id), set => set.delete(person.id), t('That person could not be blocked.'));
  }

  private act(person: UserDto, request: Observable<unknown>, change: (set: Set<string>) => void, failed: string): void {
    if (this.busy()) return;

    this.busy.set(person.id);
    this.status.saving();
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.unblocked.update(current => { const next = new Set(current); change(next); return next; });
        this.status.saved();
      },
      error: err => {
        this.busy.set(null);
        this.status.failed(apiErrorMessage(err, failed));
      }
    });
  }
}
