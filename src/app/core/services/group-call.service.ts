import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { t } from '../i18n/i18n';
import { AuthService } from './auth.service';
import { CALLS_SUPPORTED, CallSetup, Ringer, openMedia, reasonOf, rtcConfiguration } from './call-media';
import { peersToOffer } from './group-call-rules';
import { NoticeService } from './notice.service';
import {
  ChatUser, GroupCall, GroupCallIncomingEvent, GroupCallMemberEvent, GroupCallRef, GroupCallSignalEvent,
  RealtimeService
} from './realtime.service';

/** The group call this tab is in. */
export interface GroupCallState {
  /** Null until the server has put this tab into the call. */
  id: string | null;
  conversationId: string;
  groupName: string;
  /** What the starter chose. On a voice call nobody sends a picture. */
  video: boolean;
  /** joining: opening the microphone and asking the server. active: in the call. */
  phase: 'joining' | 'active';
  muted: boolean;
  cameraOff: boolean;
}

/** One other person in the call, as the call screen draws them. */
export interface GroupCallPeer extends ChatUser {
  /** What they send, once their browser and this one have found each other. */
  stream: MediaStream | null;
  link: 'connecting' | 'connected' | 'failed';
  muted: boolean;
  cameraOff: boolean;
  speaking: boolean;
}

/** What is known about one call, enough to join it. */
export interface JoinableCall { callId: string; conversationId: string; video: boolean; }

/** The connection to one other browser of the call. */
interface PeerLink {
  userId: string;
  connection: RTCPeerConnection;
  /** Network candidates that arrived before the other side's description; added right after it. */
  waitingCandidates: RTCIceCandidateInit[];
  /** Set-up messages of one connection are handled strictly one after the other. */
  queue: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  /** This side made the offer (it joined after the other one), so it is the one that tries again. */
  offerer: boolean;
  retried: boolean;
}

/** If two browsers have not found each other this long after the offer, they will not. */
const CONNECT_LIMIT_MS = 25_000;
/** How long an invitation rings when the server's setting is not known. */
const DEFAULT_RING_SECONDS = 30;
/**
 * The server never ends a call that one person sits in alone. A starter nobody
 * joins leaves this long after the ringing has stopped at the others; someone
 * the others have all left stays a little longer, in case one comes back.
 */
const ALONE_AFTER_RINGING_SECONDS = 15;
const ALONE_AFTER_OTHERS_SECONDS = 90;
/** How often the sound levels are read, and how loud counts as speaking (0 to 1). */
const LEVELS_EVERY_MS = 120;
const SPEAKING_LEVEL = 0.04;
/** "Speaking" stays lit this long after the last sound, so it does not flicker between words. */
const SPEAKING_HOLD_MS = 700;

/**
 * Voice and video calls inside a group chat, for up to eight people.
 *
 * Sound and picture travel straight between every pair of browsers (a WebRTC
 * mesh): this tab holds one connection per other person. The server keeps the
 * list of who is in the call, rings the group, and passes the set-up messages.
 * So that two browsers never offer to each other at once, the one who joins
 * offers to everyone already in the call, and they answer.
 *
 * Beside CallService (calls between two people) rather than inside it: that
 * one is a single connection with ring, accept and decline; this one is many
 * connections that come and go while the call stays up. They share the media
 * and ringing code in call-media.ts. The call screen (GroupCallOverlay) draws
 * what is here.
 */
@Injectable({ providedIn: 'root' })
export class GroupCallService {
  private http = inject(HttpClient);
  private realtime = inject(RealtimeService);
  private notices = inject(NoticeService);
  private auth = inject(AuthService);

  readonly supported = CALLS_SUPPORTED;

  readonly call = signal<GroupCallState | null>(null);
  /** The others in the call, in the order they joined. */
  readonly peers = signal<GroupCallPeer[]>([]);
  /** Own microphone (and camera), once the browser has allowed them. */
  readonly localStream = signal<MediaStream | null>(null);
  /** How long this tab has been in the call. */
  readonly seconds = signal(0);
  /** A group call that rings here: join it or dismiss it. */
  readonly invitation = signal<GroupCallIncomingEvent | null>(null);

  private subscriptions: Subscription[] = [];
  private links = new Map<string, PeerLink>();
  private setup: CallSetup | null = null;
  /** Events that arrive while the server's answer to joining is still on its way; handled right after it. */
  private early: Array<() => void> = [];
  /** When each person was last heard, for the speaking mark. */
  private heardAt = new Map<string, number>();
  /** Changes whenever the call changes hands, so a slow step of an abandoned attempt can tell. */
  private attempt = 0;
  private me: string | null = null;
  private busyElsewhere: () => boolean = () => false;
  private ringTimer?: ReturnType<typeof setTimeout>;
  private aloneTimer?: ReturnType<typeof setTimeout>;
  /** Someone else has been in this call with this tab. */
  private hadCompany = false;
  private clock?: ReturnType<typeof setInterval>;
  private levels?: ReturnType<typeof setInterval>;
  private ringer = new Ringer();

  /**
   * Called when the signed-in layout appears. Safe to call again.
   * `busyElsewhere` says whether a call between two people is going on in this tab.
   */
  start(busyElsewhere: () => boolean): void {
    if (this.subscriptions.length) return;
    this.busyElsewhere = busyElsewhere;
    this.me = this.auth.getCurrentUserId();

    this.subscriptions = [
      this.realtime.groupCallIncoming$.subscribe(e => this.onIncoming(e)),
      this.realtime.groupCallJoined$.subscribe(e => this.onJoined(e)),
      this.realtime.groupCallLeft$.subscribe(e => this.onLeft(e)),
      this.realtime.groupCallEnded$.subscribe(e => this.onEnded(e)),
      this.realtime.groupCallDismissed$.subscribe(e => this.stopRinging(e.callId)),
      this.realtime.groupCallSignal$.subscribe(e => this.inCall(e.callId, () => this.onSignal(e))),
      this.realtime.chatGroupRemoved$.subscribe(e => this.onGroupRemoved(e.conversationId)),
      this.realtime.reconnected$.subscribe(() => this.rejoin()),
      this.realtime.closed$.subscribe(() => {
        this.silence();
        if (this.call()) this.finish(t('The connection was lost, so you left the call.'), false);
      })
    ];
  }

  /** Called on leaving the signed-in layout: a call does not survive signing out. */
  stop(): void {
    this.finish();
    this.silence();
    this.subscriptions.forEach(s => s.unsubscribe());
    this.subscriptions = [];
    this.me = null;
  }

  // ── Getting into a call ─────────────────────────────────────────────────────

  /** Starts a call in a group. If the group already has one, this joins it. */
  startCall(conversationId: string, groupName: string, video: boolean): Promise<void> {
    return this.enter(conversationId, groupName, video,
      () => this.realtime.invoke<GroupCall>('StartGroupCall', conversationId, video));
  }

  /** Joins a call that is going on. */
  join(call: JoinableCall, groupName: string): Promise<void> {
    return this.enter(call.conversationId, groupName, call.video,
      () => this.realtime.invoke<GroupCall>('JoinGroupCall', call.callId));
  }

  /** Joins the call that is ringing here. */
  acceptInvitation(): Promise<void> {
    const invitation = this.invitation();
    return invitation ? this.join(invitation, invitation.groupName) : Promise.resolve();
  }

  /** Stops the ringing, in every tab of this account. The call goes on and can still be joined from the chat. */
  dismissInvitation(): void {
    const invitation = this.invitation();
    if (!invitation) return;

    this.realtime.invoke('DismissGroupCall', invitation.callId).catch(() => { /* it stops here anyway */ });
    this.silence();
  }

  /** Puts a ringing invitation away without telling anyone (the user picked up another call). */
  silence(): void {
    clearTimeout(this.ringTimer);
    this.ringer.stop();
    this.invitation.set(null);
  }

  private async enter(
    conversationId: string, groupName: string, video: boolean, ask: () => Promise<GroupCall>
  ): Promise<void> {
    if (this.call() || this.busyElsewhere() || !this.supported) return;

    this.silence();
    const attempt = ++this.attempt;
    this.call.set({ id: null, conversationId, groupName, video, phase: 'joining', muted: false, cameraOff: !video });

    try {
      // The microphone first: a "no" from the browser should not put anyone into a call.
      const { stream, missing } = await openMedia(video, true);
      if (attempt !== this.attempt) {
        stream?.getTracks().forEach(track => track.stop());
        return;
      }
      this.localStream.set(stream);

      // The call goes on with what this device has; the user is told what is missing.
      const hasSound = !!stream?.getAudioTracks().length;
      const hasPicture = !!stream?.getVideoTracks().length;
      this.patch({ muted: !hasSound, cameraOff: !video || !hasPicture });
      if (missing) this.notices.show({ icon: hasSound ? 'videocam_off' : 'mic_off', label: t('Call'), text: missing });

      await this.loadSetup();
      if (attempt !== this.attempt) return;

      const joined = await ask();
      if (attempt !== this.attempt) {
        // Left while the server was still answering.
        this.realtime.invoke('LeaveGroupCall', joined.callId).catch(() => { /* already out */ });
        return;
      }

      // Starting a video call in a group that already has a voice call joins that one: no picture then.
      if (!joined.video && hasPicture) {
        stream?.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track); });
      }
      this.patch({ id: joined.callId, video: joined.video, phase: 'active', cameraOff: !joined.video || !hasPicture });
      // A camera or microphone that stops by itself (unplugged, taken by another app) shows as switched off.
      stream?.getTracks().forEach(track => track.addEventListener('ended', () => this.onDeviceLost(stream, track.kind)));

      this.seconds.set(0);
      this.clock = setInterval(() => this.seconds.update(s => s + 1), 1000);
      this.levels = setInterval(() => this.readLevels(), LEVELS_EVERY_MS);

      peersToOffer(joined.participants, this.me).forEach(person => this.connect(person, true));
      this.early.splice(0).forEach(handle => handle());
      this.watchAlone();
    } catch (err) {
      if (attempt === this.attempt) this.finish(reasonOf(err), false);
    }
  }

  private async loadSetup(): Promise<CallSetup> {
    return this.setup ??= await firstValueFrom(this.http.get<CallSetup>(`${environment.apiUrl}/api/Call/setup`));
  }

  // ── During a call ───────────────────────────────────────────────────────────

  /** Leaves the call. It goes on for the others. */
  leave(): void {
    this.finish();
  }

  toggleMute(): void {
    const call = this.call();
    const tracks = this.liveTracks('audio');
    // Nothing to switch on a device that joined without a microphone, or lost it.
    if (!call || !tracks.length) return;

    tracks.forEach(track => (track.enabled = call.muted));
    this.patch({ muted: !call.muted });
    this.tellState();
  }

  toggleCamera(): void {
    const call = this.call();
    const tracks = this.liveTracks('video');
    if (!call?.video || !tracks.length) return;

    tracks.forEach(track => (track.enabled = call.cameraOff));
    this.patch({ cameraOff: !call.cameraOff });
    this.tellState();
  }

  private liveTracks(kind: 'audio' | 'video'): MediaStreamTrack[] {
    return (this.localStream()?.getTracks() ?? []).filter(track => track.kind === kind && track.readyState === 'live');
  }

  private onDeviceLost(stream: MediaStream, kind: string): void {
    if (this.localStream() !== stream) return;

    this.patch(kind === 'video' ? { cameraOff: true } : { muted: true });
    this.tellState();
  }

  /** The others show a muted microphone or an avatar instead of a black picture. */
  private tellState(): void {
    this.links.forEach(link => this.send(link.userId, { type: 'state', ...this.ownState() }));
  }

  private ownState(): { muted: boolean; cameraOff: boolean } {
    const call = this.call();
    return { muted: call?.muted ?? false, cameraOff: call?.cameraOff ?? true };
  }

  // ── What the server says ────────────────────────────────────────────────────

  private onIncoming(event: GroupCallIncomingEvent): void {
    // Already busy here (the server does not ring someone on a call), or a browser that cannot take calls.
    if (!this.supported || this.call() || this.busyElsewhere() || this.invitation()) return;

    this.invitation.set(event);
    this.ringer.start('incoming');

    // The server leaves it to the client to stop ringing.
    this.loadSetup().then(setup => setup.ringSeconds, () => DEFAULT_RING_SECONDS).then(seconds => {
      if (this.invitation() !== event) return;

      clearTimeout(this.ringTimer);
      this.ringTimer = setTimeout(() => this.stopRinging(event.callId), seconds * 1000);
    });
  }

  private stopRinging(callId: string): void {
    if (this.invitation()?.callId === callId) this.silence();
  }

  private onJoined(event: GroupCallMemberEvent): void {
    if (event.userId === this.me) {
      // Joined, here or in another tab: nothing left to ring for.
      this.stopRinging(event.callId);
      return;
    }

    // They offer the connection; their tile shows "connecting" until it is made.
    const person = event.participants.find(p => p.id === event.userId);
    if (person) this.inCall(event.callId, () => this.upsertPeer(person));
  }

  private onLeft(event: GroupCallMemberEvent): void {
    this.inCall(event.callId, () => {
      // The server took this tab out: the user left the group or was removed from it.
      if (event.userId === this.me) this.finish(undefined, false);
      else this.dropPeer(event.userId);
    });
  }

  private onEnded(event: GroupCallRef): void {
    this.stopRinging(event.callId);
    this.inCall(event.callId, () => this.finish(undefined, false));
  }

  private onGroupRemoved(conversationId: string): void {
    if (this.invitation()?.conversationId === conversationId) this.silence();
    if (this.call()?.conversationId === conversationId) this.finish(undefined, false);
  }

  /**
   * The live connection came back. The server takes a tab out of its call when
   * its connection closes, so this tab joins again and offers to everyone.
   */
  private async rejoin(): Promise<void> {
    const call = this.call();
    if (!call?.id) return;

    const attempt = this.attempt;
    this.links.forEach(link => this.closeLink(link));
    this.links.clear();
    this.peers.update(peers => peers.map(p => ({ ...p, stream: null, link: 'connecting' as const, speaking: false })));

    try {
      const joined = await this.realtime.invoke<GroupCall>('JoinGroupCall', call.id);
      if (attempt !== this.attempt) return;

      const others = peersToOffer(joined.participants, this.me);
      this.peers.update(peers => peers.filter(p => others.some(o => o.id === p.id)));
      others.forEach(person => this.connect(person, true));
      this.watchAlone();
    } catch {
      if (attempt === this.attempt) {
        this.finish(t('The connection dropped, so you left the call. Join again from the chat if it is still going.'), false);
      }
    }
  }

  /** Runs `handle` if this tab is in that call; holds it back while the server's answer to joining is on its way. */
  private inCall(callId: string, handle: () => void): void {
    const call = this.call();
    if (!call) return;

    if (call.id === null) this.early.push(() => this.inCall(callId, handle));
    else if (call.id === callId) handle();
  }

  /**
   * Called whenever the people in the call change. While this tab is the only
   * one in it, a timer runs; when it ends this tab leaves, the call ends on the
   * server and the chat gets its line ("no one joined" when nobody ever did).
   */
  private watchAlone(): void {
    clearTimeout(this.aloneTimer);
    this.aloneTimer = undefined;

    if (!this.call()?.id) return;
    if (this.peers().length) {
      this.hadCompany = true;
      return;
    }

    const hadCompany = this.hadCompany;
    const seconds = hadCompany
      ? ALONE_AFTER_OTHERS_SECONDS
      : (this.setup?.ringSeconds ?? DEFAULT_RING_SECONDS) + ALONE_AFTER_RINGING_SECONDS;
    this.aloneTimer = setTimeout(
      () => this.finish(hadCompany ? t('Everyone else left the call, so it ended.') : t('Nobody joined the call.')),
      seconds * 1000);
  }

  // ── The connections between the browsers ────────────────────────────────────

  /** Opens the connection to one person. The offerer also makes the offer. */
  private connect(person: ChatUser, offerer: boolean): PeerLink {
    const previous = this.links.get(person.id);
    if (previous) this.closeLink(previous);

    const connection = new RTCPeerConnection(rtcConfiguration(this.setup!));
    const link: PeerLink = {
      userId: person.id, connection, waitingCandidates: [], queue: Promise.resolve(), offerer,
      retried: previous?.retried ?? false
    };
    this.links.set(person.id, link);
    this.upsertPeer(person, { stream: null, link: 'connecting', speaking: false });

    const stream = this.localStream();
    stream?.getTracks().forEach(track => connection.addTrack(track, stream));

    connection.onicecandidate = e => {
      if (e.candidate) this.send(person.id, { type: 'candidate', candidate: e.candidate.toJSON() });
    };
    connection.ontrack = e => {
      if (this.links.get(person.id) !== link) return;

      // Sound and picture arrive one after the other; a track sent without a stream joins the one shown.
      const shown = this.peers().find(p => p.id === person.id)?.stream;
      const next = e.streams[0] ?? new MediaStream([...(shown?.getTracks() ?? []), e.track]);
      this.patchPeer(person.id, { stream: next });
    };
    connection.onconnectionstatechange = () => {
      if (this.links.get(person.id) !== link) return;

      if (connection.connectionState === 'connected') {
        clearTimeout(link.timer);
        this.patchPeer(person.id, { link: 'connected' });
      } else if (connection.connectionState === 'failed') {
        this.onLinkFailed(person, link);
      }
    };
    link.timer = setTimeout(() => this.onLinkFailed(person, link), CONNECT_LIMIT_MS);

    if (offerer) {
      // Without an own microphone or camera this side still asks to receive the
      // other's, otherwise the offer would leave that half of the call out.
      const own = new Set(stream?.getTracks().map(track => track.kind));
      if (!own.has('audio')) connection.addTransceiver('audio', { direction: 'recvonly' });
      if (this.call()?.video && !own.has('video')) connection.addTransceiver('video', { direction: 'recvonly' });

      this.queue(link, async () => {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        this.send(person.id, { type: 'offer', sdp: offer.sdp, ...this.ownState() });
      });
    }

    return link;
  }

  /** One pair could not connect: the side that offered tries once more, then the tile says so. The call goes on. */
  private onLinkFailed(person: ChatUser, link: PeerLink): void {
    if (this.links.get(person.id) !== link) return;
    clearTimeout(link.timer);

    if (link.offerer && !link.retried) this.connect(person, true).retried = true;
    else this.patchPeer(person.id, { link: 'failed', stream: null, speaking: false });
  }

  private onSignal(event: GroupCallSignalEvent): void {
    const data = event.data;
    const from = event.fromUserId;
    if (!data) return;

    if (data.type === 'state') {
      this.patchPeer(from, { muted: !!data.muted, cameraOff: !!data.cameraOff });
      return;
    }

    let link = this.links.get(from);
    if (data.type === 'offer') {
      // The one who joins offers, and their offer may be here before the news that they
      // joined. A second offer from the same person is them trying again.
      const person = this.peers().find(p => p.id === from) ?? { id: from, fullName: '' };
      link = this.connect(person, false);
    }
    if (!link) return;

    if (data.type === 'offer' || data.type === 'answer') {
      this.patchPeer(from, { muted: !!data.muted, cameraOff: !!data.cameraOff });
    }

    const { connection, waitingCandidates } = link;
    const addWaitingCandidates = async () => {
      for (const candidate of waitingCandidates.splice(0)) await connection.addIceCandidate(candidate);
    };

    this.queue(link, async () => {
      switch (data.type) {
        case 'offer': {
          await connection.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          await addWaitingCandidates();
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          this.send(from, { type: 'answer', sdp: answer.sdp, ...this.ownState() });
          break;
        }
        case 'answer':
          await connection.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await addWaitingCandidates();
          break;
        case 'candidate':
          if (connection.remoteDescription) await connection.addIceCandidate(data.candidate);
          else waitingCandidates.push(data.candidate);
          break;
      }
    });
  }

  /** Runs a set-up step after the ones before it; a step of a connection that is gone is skipped. */
  private queue(link: PeerLink, step: () => Promise<void>): void {
    link.queue = link.queue
      .then(() => (this.links.get(link.userId) === link ? step() : undefined))
      .catch(() => { /* a single bad message must not end the call; the connect limit covers a dead link */ });
  }

  private send(toUserId: string, data: unknown): void {
    const id = this.call()?.id;
    if (id) this.realtime.invoke('SendGroupCallSignal', id, toUserId, data).catch(() => { /* the connect limit covers it */ });
  }

  private closeLink(link: PeerLink): void {
    clearTimeout(link.timer);
    link.connection.onicecandidate = link.connection.ontrack = link.connection.onconnectionstatechange = null;
    link.connection.close();
  }

  /** Lights "speaking" on whoever is making sound. */
  private readLevels(): void {
    const now = Date.now();

    this.links.forEach(link => {
      const receiver = link.connection.getReceivers().find(r => r.track.kind === 'audio');
      const level = Math.max(0, ...(receiver?.getSynchronizationSources() ?? []).map(source => source.audioLevel ?? 0));
      if (level > SPEAKING_LEVEL) this.heardAt.set(link.userId, now);
    });

    const speaking = (id: string) => now - (this.heardAt.get(id) ?? 0) < SPEAKING_HOLD_MS;
    if (this.peers().some(p => p.speaking !== (speaking(p.id) && !p.muted))) {
      this.peers.update(peers => peers.map(p => ({ ...p, speaking: speaking(p.id) && !p.muted })));
    }
  }

  // ── The people on the screen ────────────────────────────────────────────────

  /** Adds a person to the call screen, or fills in what is now known about them. */
  private upsertPeer(person: ChatUser, change: Partial<GroupCallPeer> = {}): void {
    const known = { id: person.id, ...(person.fullName ? { fullName: person.fullName, profilePictureUrl: person.profilePictureUrl } : {}) };

    this.peers.update(peers => peers.some(p => p.id === person.id)
      ? peers.map(p => (p.id === person.id ? { ...p, ...known, ...change } : p))
      : [...peers, {
          fullName: t('Someone@@call'), profilePictureUrl: null, stream: null, link: 'connecting',
          muted: false, cameraOff: !this.call()?.video, speaking: false, ...known, ...change
        }]);
    this.watchAlone();
  }

  private patchPeer(id: string, change: Partial<GroupCallPeer>): void {
    this.peers.update(peers => peers.map(p => (p.id === id ? { ...p, ...change } : p)));
  }

  private dropPeer(id: string): void {
    const link = this.links.get(id);
    if (link) this.closeLink(link);

    this.links.delete(id);
    this.heardAt.delete(id);
    this.peers.update(peers => peers.filter(p => p.id !== id));
    this.watchAlone();
  }

  // ── Ending ──────────────────────────────────────────────────────────────────

  /**
   * Takes this tab out of whatever group call it is in, and (unless the server
   * already knows) tells the server. `said` is shown to the user as the reason.
   */
  private finish(said?: string, tellServer = true): void {
    const call = this.call();
    this.attempt++;

    if (call?.id && tellServer) this.realtime.invoke('LeaveGroupCall', call.id).catch(() => { /* already out */ });

    clearInterval(this.clock);
    clearInterval(this.levels);
    clearTimeout(this.aloneTimer);
    this.hadCompany = false;
    this.links.forEach(link => this.closeLink(link));
    this.links.clear();
    this.heardAt.clear();
    this.early = [];
    this.localStream()?.getTracks().forEach(track => track.stop());

    this.localStream.set(null);
    this.peers.set([]);
    this.call.set(null);
    this.seconds.set(0);

    if (said) this.notices.show({ icon: 'call_end', label: t('Call'), text: said });
  }

  private patch(change: Partial<GroupCallState>): void {
    this.call.update(call => (call ? { ...call, ...change } : call));
  }
}
