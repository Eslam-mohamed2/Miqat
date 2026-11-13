import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';

/** Keeps two Arabic initials apart: side by side they would join into one word. */
const NON_JOINER = String.fromCharCode(0x200c);
const ARABIC_LETTER = /\p{Script=Arabic}/u;

/**
 * A person's round picture for the chat: the photo, or their initials when
 * there is none or it fails to load, with a green dot while they are online.
 */
@Component({
  selector: 'app-chat-avatar',
  standalone: true,
  imports: [TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url() && !failed()) {
      <!-- Google's avatar hosts refuse requests that carry a referrer. -->
      <img [src]="url()" [alt]="name()" referrerpolicy="no-referrer" (error)="failed.set(true)" />
    } @else {
      <span class="initials" aria-hidden="true">{{ initials() }}</span>
    }
    @if (online()) {
      <span class="online-dot" [title]="'Online' | t"></span>
    }
  `,
  styleUrl: './chat-avatar.scss',
  host: { '[style.--avatar-size.px]': 'size()', '[class.group]': 'group()' }
})
export class ChatAvatar {
  readonly name = input('');
  readonly url = input<string | null | undefined>(null);
  readonly online = input(false);
  /** A group chat: the initials of its name, tinted with the accent so it reads apart from a person. */
  readonly group = input(false);
  /** Diameter in pixels. */
  readonly size = input(40);

  protected readonly failed = signal(false);

  protected readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const first = words[0][0];
      const last = words[words.length - 1][0];
      return (ARABIC_LETTER.test(first + last) ? first + NON_JOINER + last : first + last).toUpperCase();
    }

    return (words[0] ?? '?').slice(0, 2).toUpperCase();
  });

  constructor() {
    // A new picture gets a new chance to load.
    effect(() => { this.url(); this.failed.set(false); });
  }
}
