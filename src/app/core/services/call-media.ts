// What a call between two people and a group call share: the server's call
// settings, opening the microphone and camera, and the ringing sounds.

import { num, t } from '../i18n/i18n';

/** False in a browser without calling, or on a page that is not served securely. */
export const CALLS_SUPPORTED = typeof RTCPeerConnection !== 'undefined' &&
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/** The length of a call: 75 -> "1:15", 3725 -> "1:02:05", in the digits of the interface. */
export function callClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return num(hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`);
}

export interface IceServer { urls: string[]; username?: string | null; credential?: string | null; }
/** `GET /api/Call/setup`. */
export interface CallSetup { iceServers: IceServer[]; ringSeconds: number; }

/** The server's settings, as a browser connection takes them. */
export function rtcConfiguration(setup: CallSetup): RTCConfiguration {
  return {
    iceServers: setup.iceServers.map(server => ({
      urls: server.urls,
      username: server.username ?? undefined,
      credential: server.credential ?? undefined
    }))
  };
}

/** What this device could open for a call, and a sentence about what it could not. */
export interface OpenedMedia {
  stream: MediaStream | null;
  missing?: string;
}

/**
 * Asks the browser for the microphone, and the camera for a video call.
 *
 * A call is not refused because a device is missing: a PC without a camera
 * joins a video call with sound only, and one without a microphone still sees
 * and hears the others. Only a "no" from the user stops the call, because that
 * is theirs to change. `group` says who is on the other side, for the sentence
 * about a missing microphone: one friend, or the others of a group call.
 */
export async function openMedia(video: boolean, group = false): Promise<OpenedMedia> {
  const blocked = (err: unknown) => ['NotAllowedError', 'SecurityError'].includes((err as DOMException)?.name);

  if (video) {
    try {
      return {
        stream: await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        })
      };
    } catch (err) {
      if (blocked(err)) throw new Error(t('Allow this site to use your camera and microphone in the browser, then try again.'));
      // No camera, or another app holds it: carry on with the microphone below.
    }
  }

  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      missing: video ? t('Your camera could not be started, so you joined with sound only.') : undefined
    };
  } catch (err) {
    if (blocked(err)) throw new Error(t('Allow this site to use your microphone in the browser, then try again.'));
  }

  // No microphone either: a camera alone is still worth sending on a video call.
  if (video) {
    try {
      return {
        stream: await navigator.mediaDevices.getUserMedia({ audio: false, video: true }),
        missing: group
          ? t('Your microphone could not be started, so the others cannot hear you.')
          : t('Your microphone could not be started, so your friend cannot hear you.')
      };
    } catch { /* nothing to send at all */ }
  }

  return {
    stream: null,
    missing: group
      ? t('No microphone could be started on this device, so the others cannot hear you. You can still hear them.')
      : t('No microphone could be started on this device, so your friend cannot hear you. You can still hear them.')
  };
}

export function reasonOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : t('The call could not be started. Try again.');
}

/**
 * The ringing sounds, made by the browser itself so no sound file is needed:
 * a two-tone ring for an incoming call, a slower single tone while calling.
 * Browsers may keep a page silent until the user has clicked something on it;
 * the call still shows on screen then.
 */
export class Ringer {
  private context?: AudioContext;
  private timer?: ReturnType<typeof setInterval>;

  start(kind: 'incoming' | 'outgoing'): void {
    this.stop();
    try {
      this.context = new AudioContext();
    } catch {
      return;
    }

    const tones = kind === 'incoming' ? [[880, 0], [1108, 0.24]] : [[440, 0]];
    const length = kind === 'incoming' ? 0.2 : 0.9;
    const ring = () => tones.forEach(([frequency, delay]) => this.tone(frequency, delay, length));

    ring();
    this.timer = setInterval(ring, kind === 'incoming' ? 1500 : 3000);
  }

  stop(): void {
    clearInterval(this.timer);
    this.context?.close().catch(() => { /* already closed */ });
    this.context = undefined;
  }

  private tone(frequency: number, delay: number, length: number): void {
    const context = this.context;
    if (!context) return;

    const from = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.frequency.value = frequency;
    // Fades in and out, so the tone does not click.
    volume.gain.setValueAtTime(0, from);
    volume.gain.linearRampToValueAtTime(0.12, from + 0.03);
    volume.gain.linearRampToValueAtTime(0, from + length);

    oscillator.connect(volume).connect(context.destination);
    oscillator.start(from);
    oscillator.stop(from + length + 0.02);
  }
}
