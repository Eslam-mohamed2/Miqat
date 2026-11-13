import { ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild } from '@angular/core';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';

/**
 * One person on the screen of a group call: their picture, or their avatar
 * while there is none, with their name, a muted mark and a ring while they speak.
 */
@Component({
  selector: 'app-call-tile',
  standalone: true,
  imports: [ChatAvatar, ChatIcon, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Always present: it also plays the person's sound when there is no picture. -->
    <video #player [class.shown]="video()" [class.mirror]="self()" autoplay playsinline [muted]="self()"></video>

    @if (!video()) {
      <app-chat-avatar [name]="name()" [url]="url()" [size]="avatarSize()" />
    }

    @if (note()) {
      <span class="note">{{ note() }}</span>
    }

    <span class="label">
      @if (muted()) {
        <app-chat-icon name="mic-off" [size]="13" />
      }
      <span class="label-name"><bdi>{{ self() ? ('You' | t) : name() }}</bdi></span>
    </span>
  `,
  styleUrl: './call-tile.scss',
  host: { '[class.speaking]': 'speaking()', 'role': 'listitem' }
})
export class CallTile {
  readonly name = input('');
  readonly url = input<string | null | undefined>(null);
  readonly stream = input<MediaStream | null>(null);
  /** The picture is shown; otherwise the avatar. */
  readonly video = input(false);
  readonly muted = input(false);
  readonly speaking = input(false);
  /** The user's own tile: mirrored, and silent so they do not hear themselves. */
  readonly self = input(false);
  /** "Connecting…", "Could not connect". */
  readonly note = input('');
  readonly avatarSize = input(72);

  private player = viewChild<ElementRef<HTMLVideoElement>>('player');

  constructor() {
    // A stream is given to its player as an object, not as an address.
    effect(() => {
      const player = this.player()?.nativeElement;
      const stream = this.stream();
      if (!player || player.srcObject === stream) return;

      player.srcObject = stream;
      // Some browsers wait for an explicit play() even with autoplay set.
      if (stream) player.play().catch(() => { /* starts with the next user action */ });
    });
  }
}
