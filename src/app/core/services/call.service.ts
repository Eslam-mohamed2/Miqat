import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { t } from '../i18n/i18n';
import { CallEndedEvent, CallIncomingEvent, RealtimeService } from './realtime.service';
import { ChatConversation, ChatPerson } from './chat.service';
import { CALLS_SUPPORTED, CallSetup, Ringer, openMedia, reasonOf, rtcConfiguration } from './call-media';
import { GroupCallService } from './group-call.service';
import { NoticeService } from './notice.service';

/**
 * Where a call is:
 * starting (asking for the microphone) -> calling (it rings at the friend's) or
 * ringing (a friend is calling here) -> connecting -> active.
 */
export type CallPhase = 'starting' | 'calling' | 'ringing' | 'connecting' | 'active';

export interface CallState {
  /** Null until the server has registered an outgoing call. */
  id: string | null;
  conversationId: string;
  peer: ChatPerson;
  video: boolean;
  incoming: boolean;
  phase: CallPhase;
  muted: boolean;
  cameraOff: boolean;
}

/** If the two browsers have not found each other this long after the answer, they will not. */
const CONNECT_LIMIT_MS = 25_000;

/**
 * Voice and video calls with a friend.
 *
 * The sound and picture travel straight between the two browsers (WebRTC).
 * The server only rings the friend and passes the set-up messages the two
 * browsers need to find each other; that goes through the live connection the
 * rest of the app already uses.
 *
 * One call at a time, counting the group calls of GroupCallService. The call
 * screen (CallOverlay) draws what is here.
 */
@Injectable({ providedIn: 'root' })
export class CallService {
  private http = inject(HttpClient);
  private realtime = inject(RealtimeService);
  private notices = inject(NoticeService);
  private groupCalls = inject(GroupCallService);

  /** False in a browser without calling, or on a page that is not served securely. */
  readonly supported = CALLS_SUPPORTED;

  readonly call = signal<CallState | null>(null);
  /** Own microphone (and camera), once the browser has allowed them. */
  readonly localStream = signal<MediaStream | null>(null);
  /** What the friend sends, once connected. */
  readonly remoteStream = signal<MediaStream | null>(null);
  /** Length of the call so far. */
  readonly seconds = signal(0);

  private subscriptions: Subscription[] = [];
  private peer: RTCPeerConnection | null = null;
  private setup: CallSetup | null = null;
  /** Network candidates that arrived before the other side's description; added right after it. */
  private waitingCandidates: RTCIceCandidateInit[] = [];
  /** Set-up messages that arrived before this side was ready for them. */
  private waitingSignals: any[] = [];
  /** Set-up messages are handled strictly one after the other. */
  private signalQueue: Promise<void> = Promise.resolve();
  /** Changes whenever the call changes hands, so a slow step of an abandoned attempt can tell. */
  private attempt = 0;
  private ringTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private clock?: ReturnType<typeof setInterval>;
  private ringer = new Ringer();

  /** Called when the signed-in layout appears. Safe to call again. */
  start(): void {
    if (this.subscriptions.length) return;

    this.subscriptions = [
      this.realtime.callIncoming$.subscribe(e => this.onIncoming(e)),
      this.realtime.callAccepted$.subscribe(e => this.onAccepted(e.callId)),
      this.realtime.callSignal$.subscribe(e => this.onSignal(e.callId, e.data)),
      this.realtime.callEnded$.subscribe(e => this.onEnded(e))
    ];
    this.groupCalls.start(() => this.call() !== null);
  }

  /** Called on leaving the signed-in layout: a call does not survive signing out. */
  stop(): void {
    this.finish();
    this.groupCalls.stop();
    this.subscriptions.forEach(s => s.unsubscribe());
    this.subscriptions = [];
  }

  // ── Making a call ───────────────────────────────────────────────────────────

  async startCall(conversation: ChatConversation, video: boolean): Promise<void> {
    if (this.call() || this.groupCalls.call() || !this.supported) return;

    // A group call that rings here is let go: the user chose this call.
    this.groupCalls.silence();
    const attempt = ++this.attempt;
    this.call.set({
      id: null, conversationId: conversation.id, peer: conversation.friend, video,
      incoming: false, phase: 'starting', muted: false, cameraOff: false
    });

    try {
      // The microphone first: a "no" from the browser should not ring anyone.
      const setup = await this.prepare(video, attempt);
      if (!setup) return;

      const id = await this.realtime.invoke<string>('StartCall', conversation.id, video);
      if (attempt !== this.attempt) {
        // Hung up while the server was still answering.
        this.realtime.invoke('EndCall', id).catch(() => { /* already over */ });
        return;
      }

      this.patch({ id, phase: 'calling' });
      this.ringer.start('outgoing');
      this.ringTimer = setTimeout(
        () => this.finish(t('{name} did not answer.', { name: conversation.friend.fullName })),
        setup.ringSeconds * 1000);
    } catch (err) {
      if (attempt === this.attempt) this.finish(reasonOf(err), false);
    }
  }

  /** The friend picked up: this side makes the first offer. */
  private onAccepted(callId: string): void {
    const call = this.call();
    if (!call || call.id !== callId || call.incoming || call.phase !== 'calling' || !this.setup) return;

    clearTimeout(this.ringTimer);
    this.ringer.stop();
    this.patch({ phase: 'connecting' });

    const peer = this.connectPeer(this.setup);

    // Without an own microphone or camera this side still asks to receive the
    // friend's, otherwise the offer would leave that half of the call out.
    const own = new Set(this.localStream()?.getTracks().map(track => track.kind));
    if (!own.has('audio')) peer.addTransceiver('audio', { direction: 'recvonly' });
    if (call.video && !own.has('video')) peer.addTransceiver('video', { direction: 'recvonly' });

    this.queue(async () => {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.send({ type: 'offer', sdp: offer.sdp });
    });
  }

  // ── Receiving a call ────────────────────────────────────────────────────────

  private onIncoming(event: CallIncomingEvent): void {
    // Already busy here (the server refuses that too), or a browser that cannot take calls.
    if (this.call() || this.groupCalls.call() || !this.supported) return;

    this.attempt++;
    this.call.set({
      id: event.callId, conversationId: event.conversationId, peer: event.from, video: event.video,
      incoming: true, phase: 'ringing', muted: false, cameraOff: false
    });
    this.ringer.start('incoming');
  }

  async accept(): Promise<void> {
    const call = this.call();
    if (!call?.id || call.phase !== 'ringing') return;

    const attempt = ++this.attempt;
    this.ringer.stop();
    this.groupCalls.silence();
    this.patch({ phase: 'connecting' });

    try {
      const setup = await this.prepare(call.video, attempt);
      if (!setup) return;

      // Ready before answering: the caller's offer follows the answer at once.
      this.connectPeer(setup);
      await this.realtime.invoke('AnswerCall', call.id, true);
    } catch (err) {
      if (attempt === this.attempt) this.finish(reasonOf(err));
    }
  }

  /** Says no to a ringing call. */
  decline(): void {
    this.finish();
  }

  // ── During a call ───────────────────────────────────────────────────────────

  /** Hang up, or stop calling. */
  hangUp(): void {
    this.finish();
  }

  toggleMute(): void {
    const call = this.call();
    // Nothing to switch on a device that joined without a microphone.
    if (!call || !this.localStream()?.getAudioTracks().length) return;

    this.localStream()?.getAudioTracks().forEach(track => (track.enabled = call.muted));
    this.patch({ muted: !call.muted });
  }

  toggleCamera(): void {
    const call = this.call();
    if (!call?.video || !this.localStream()?.getVideoTracks().length) return;

    this.localStream()?.getVideoTracks().forEach(track => (track.enabled = call.cameraOff));
    this.patch({ cameraOff: !call.cameraOff });
  }

  private onEnded(event: CallEndedEvent): void {
    const call = this.call();
    if (!call || call.id !== event.callId) return;

    const said = event.reason === 'declined' && !call.incoming
      ? t('{name} declined the call.', { name: call.peer.fullName })
      : undefined;
    this.finish(said, false);
  }

  // ── The connection between the two browsers ─────────────────────────────────

  /** Opens the microphone (and camera) and loads the server's call settings. Null when the call was dropped meanwhile. */
  private async prepare(video: boolean, attempt: number): Promise<CallSetup | null> {
    const { stream, missing } = await openMedia(video);
    if (attempt !== this.attempt) {
      stream?.getTracks().forEach(track => track.stop());
      return null;
    }
    this.localStream.set(stream);

    // The call goes on with what this device has; the user is told what is missing.
    const hasSound = !!stream?.getAudioTracks().length;
    const hasPicture = !!stream?.getVideoTracks().length;
    this.patch({ muted: !hasSound, cameraOff: video && !hasPicture });
    if (missing) this.notices.show({ icon: hasSound ? 'videocam_off' : 'mic_off', label: t('Call'), text: missing });

    this.setup ??= await firstValueFrom(this.http.get<CallSetup>(`${environment.apiUrl}/api/Call/setup`));
    return attempt === this.attempt ? this.setup : null;
  }

  private connectPeer(setup: CallSetup): RTCPeerConnection {
    const peer = new RTCPeerConnection(rtcConfiguration(setup));
    this.peer = peer;

    const stream = this.localStream();
    stream?.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.onicecandidate = e => { if (e.candidate) this.send({ type: 'candidate', candidate: e.candidate.toJSON() }); };
    peer.ontrack = e => this.remoteStream.set(e.streams[0] ?? new MediaStream([e.track]));
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer) return;

      if (peer.connectionState === 'connected') this.becomeActive();
      else if (peer.connectionState === 'failed') {
        this.finish(t('The call could not be connected. One of you may be on a network that blocks direct calls.'));
      }
    };

    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(
      () => this.finish(t('The call could not be connected. One of you may be on a network that blocks direct calls.')),
      CONNECT_LIMIT_MS);

    // Whatever the other side sent while this one was getting ready.
    this.waitingSignals.splice(0).forEach(data => this.handleSignal(data));
    return peer;
  }

  private becomeActive(): void {
    clearTimeout(this.connectTimer);
    if (this.call()?.phase === 'active') return;

    this.patch({ phase: 'active' });
    this.seconds.set(0);
    this.clock = setInterval(() => this.seconds.update(s => s + 1), 1000);
  }

  private onSignal(callId: string, data: any): void {
    if (this.call()?.id !== callId || !data) return;

    if (this.peer) this.handleSignal(data);
    else this.waitingSignals.push(data);
  }

  private handleSignal(data: any): void {
    const peer = this.peer;
    if (!peer) return;

    this.queue(async () => {
      switch (data.type) {
        case 'offer': {
          await peer.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          await this.addWaitingCandidates(peer);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          this.send({ type: 'answer', sdp: answer.sdp });
          break;
        }
        case 'answer':
          await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await this.addWaitingCandidates(peer);
          break;
        case 'candidate':
          if (peer.remoteDescription) await peer.addIceCandidate(data.candidate);
          else this.waitingCandidates.push(data.candidate);
          break;
      }
    });
  }

  private async addWaitingCandidates(peer: RTCPeerConnection): Promise<void> {
    for (const candidate of this.waitingCandidates.splice(0)) await peer.addIceCandidate(candidate);
  }

  /** Runs a set-up step after the ones before it; a step of a call that is over is skipped. */
  private queue(step: () => Promise<void>): void {
    const attempt = this.attempt;
    this.signalQueue = this.signalQueue
      .then(() => (attempt === this.attempt ? step() : undefined))
      .catch(() => { /* a single bad message must not end the call; the connect limit covers a dead one */ });
  }

  private send(data: unknown): void {
    const id = this.call()?.id;
    if (id) this.realtime.invoke('SendCallSignal', id, data).catch(() => { /* the connect limit covers it */ });
  }

  // ── Ending ──────────────────────────────────────────────────────────────────

  /**
   * Ends whatever call there is, on this side and (unless the server already
   * knows) for the friend. `said` is shown to the user as the reason.
   */
  private finish(said?: string, tellServer = true): void {
    const call = this.call();
    this.attempt++;

    if (call?.id && tellServer) this.realtime.invoke('EndCall', call.id).catch(() => { /* already over */ });

    clearTimeout(this.ringTimer);
    clearTimeout(this.connectTimer);
    clearInterval(this.clock);
    this.ringer.stop();

    if (this.peer) {
      this.peer.onicecandidate = this.peer.ontrack = this.peer.onconnectionstatechange = null;
      this.peer.close();
      this.peer = null;
    }
    this.localStream()?.getTracks().forEach(track => track.stop());
    this.waitingCandidates = [];
    this.waitingSignals = [];
    this.signalQueue = Promise.resolve();

    this.localStream.set(null);
    this.remoteStream.set(null);
    this.call.set(null);
    this.seconds.set(0);

    if (said) this.notices.show({ icon: 'call_end', label: t('Call'), text: said });
  }

  private patch(change: Partial<CallState>): void {
    this.call.update(call => (call ? { ...call, ...change } : call));
  }
}
