import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, viewChild
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CallService } from '../../core/services/call.service';
import { ChatAvatar } from './chat-avatar';

/**
 * The call screen: the pop-up when a friend is calling, and the view of a
 * call that is being made or is going on. All state lives in CallService.
 */
@Component({
  selector: 'app-call-overlay',
  standalone: true,
  imports: [MatIconModule, ChatAvatar],
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
      case 'starting': return 'Starting…';
      case 'calling': return 'Ringing…';
      case 'ringing': return call.video ? 'Incoming video call' : 'Incoming voice call';
      case 'connecting': return 'Connecting…';
      case 'active': return clock(this.calls.seconds());
    }
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

/** 75 -> "1:15", 3725 -> "1:02:05". */
function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
