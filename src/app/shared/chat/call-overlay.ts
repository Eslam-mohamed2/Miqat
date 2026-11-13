import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, viewChild
} from '@angular/core';
import { CallService } from '../../core/services/call.service';
import { callClock } from '../../core/services/call-media';
import { num, t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';
import { GroupCallOverlay } from './group-call-overlay';

/**
 * The call screen: the pop-up when a friend is calling, and the view of a
 * call that is being made or is going on. All state lives in CallService.
 * The calls of a group have their own screen (GroupCallOverlay), drawn from here.
 */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [ChatAvatar, ChatIcon, GroupCallOverlay, TPipe],
  templateUrl: './call-overlay.html',
  styleUrl: './call-overlay.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CallOverlay {
  protected calls = inject(CallService);

  private remoteVideo = viewChild<ElementRef<HTMLVideoElement>>('remote');
  private localVideo = viewChild<ElementRef<HTMLVideoElement>>('local');

  protected readonly status = computed(() => {
    const call = this.calls.call();
    if (!call) return '';

    switch (call.phase) {
      case 'starting': return t('Starting…');
      case 'calling': return t('Ringing…');
      case 'ringing': return call.video ? t('Incoming video call') : t('Incoming voice call');
      case 'connecting': return t('Connecting…');
      case 'active': return num(callClock(this.calls.seconds()));
    }
  });

  /** What a screen reader says when a friend calls: "Incoming video call from Omar". */
  protected readonly incomingLabel = computed(() => {
    const call = this.calls.call();
    if (!call) return '';

    const name = call.peer.fullName;
    return call.video ? t('Incoming video call from {name}', { name }) : t('Incoming voice call from {name}', { name });
  });

  /** The friend's picture is on screen: a video call that is connected. */
  protected readonly showsRemoteVideo = computed(() => {
    const call = this.calls.call();
    return !!call?.video && call.phase === 'active';
  });

  constructor() {
    // A stream is given to its player as an object, not as an address.
    effect(() => attach(this.remoteVideo()?.nativeElement, this.calls.remoteStream()));
    effect(() => attach(this.localVideo()?.nativeElement, this.calls.localStream()));
  }

  /** Escape declines a ringing call; it never hangs up one that is going on. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.calls.call()?.phase === 'ringing') this.calls.decline();
  }
}

function attach(player: HTMLVideoElement | undefined, stream: MediaStream | null): void {
  if (!player || player.srcObject === stream) return;

  player.srcObject = stream;
  // Some browsers wait for an explicit play() even with autoplay set.
  if (stream) player.play().catch(() => { /* starts with the next user action */ });
}
