import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

/**
 * A person's round picture for the chat: the photo, or their initials when
 * there is none or it fails to load, with a green dot while they are online.
 */
@Component({
  selector: 'app-chat-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url() && !failed()) {
      <!-- Google's avatar hosts refuse requests that carry a referrer. -->
      <img [src]="url()" [alt]="name()" referrerpolicy="no-referrer" (error)="failed.set(true)" />
    } @else {
      <span class="initials" aria-hidden="true">{{ initials() }}</span>
    }
    @if (online()) {
      <span class="online-dot" title="Online"></span>
    }
  `,
  styleUrl: './chat-avatar.scss',
  host: { '[style.--avatar-size.px]': 'size()' }
})
export class ChatAvatar {
  readonly name = input('');
  readonly url = input<string | null | undefined>(null);
  readonly online = input(false);
  /** Diameter in pixels. */
  readonly size = input(40);

  protected readonly failed = signal(false);

  protected readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  });

  constructor() {
    // A new picture gets a new chance to load.
    effect(() => { this.url(); this.failed.set(false); });
  }
}
