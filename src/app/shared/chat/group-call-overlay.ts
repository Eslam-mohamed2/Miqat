import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { CallService } from '../../core/services/call.service';
import { callClock } from '../../core/services/call-media';
import { ChatService } from '../../core/services/chat.service';
import { isolate } from '../../core/services/chat-text';
import { GroupCallService } from '../../core/services/group-call.service';
import { lastTileAlone, tileColumns } from '../../core/services/group-call-rules';
import { num, t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { CallTile } from './call-tile';
import { ChatAvatar } from './chat-avatar';
import { ChatIcon } from './chat-icon';

/**
 * The screen of a group call: the invitation while one rings, and the grid of
 * people once this tab is in it. All state lives in GroupCallService.
 */
@Component({
  selector: 'app-group-call-overlay',
  standalone: true,
  imports: [CallTile, ChatAvatar, ChatIcon, TPipe],
  templateUrl: './group-call-overlay.html',
  styleUrl: './group-call-overlay.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GroupCallOverlay {
  protected groupCalls = inject(GroupCallService);
  protected calls = inject(CallService);
  private chat = inject(ChatService);

  /** A phone held upright: the tiles go under each other instead of side by side. */
  private readonly narrow = signal(false);

  /** The user as the group knows them, for their own tile. */
  protected readonly self = computed(() => {
    const call = this.groupCalls.call();
    const me = this.chat.currentUserId;
    return call ? this.chat.conversation(call.conversationId)?.participants?.find(p => p.id === me) : undefined;
  });

  /** The user's own picture is on screen: a video call with the camera running. */
  protected readonly showsOwnVideo = computed(() => {
    const call = this.groupCalls.call();
    return !!call?.video && !call.cameraOff && !!this.groupCalls.localStream()?.getVideoTracks().length;
  });

  protected readonly count = computed(() => this.groupCalls.peers().length + 1);
  protected readonly columns = computed(() => tileColumns(this.count(), this.narrow()));
  /** The last tile is alone on its row: it goes in the middle. */
  protected readonly lastAlone = computed(() => lastTileAlone(this.count(), this.columns()));
  protected readonly avatarSize = computed(() => (this.count() <= 2 ? 96 : this.count() <= 4 ? 80 : 64));

  protected readonly status = computed(() => {
    const call = this.groupCalls.call();
    if (!call) return '';
    if (call.phase === 'joining') return t('Joining…');
    if (this.count() === 1) return t('Waiting for the others to join…');
    return tCount(this.count(), '{n} person · {time}', '{n} people · {time}', { time: num(callClock(this.groupCalls.seconds())) });
  });

  /** Under the caller's name while a group call rings: "Video call in Trip". */
  protected readonly invitationText = computed(() => {
    const ring = this.groupCalls.invitation();
    if (!ring) return '';

    const group = isolate(ring.groupName);
    return ring.video ? t('Video call in {group}', { group }) : t('Voice call in {group}', { group });
  });

  constructor() {
    if (typeof matchMedia !== 'function') return;

    const media = matchMedia('(max-width: 575.98px) and (orientation: portrait)');
    const follow = () => this.narrow.set(media.matches);
    follow();
    media.addEventListener('change', follow);
    inject(DestroyRef).onDestroy(() => media.removeEventListener('change', follow));
  }

  /** Escape dismisses a ringing invitation; it never takes the user out of a call. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.groupCalls.dismissInvitation();
  }
}
