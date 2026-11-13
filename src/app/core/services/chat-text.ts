import type {
  ChatGroupEvent, ChatMessageEvent, ChatParticipant, GroupCall, GroupCallMemberEvent
} from './realtime.service';
import { isRtl, num, t, tCount } from '../i18n/i18n';

// What the chat says in words, and how a group follows the live events. Plain
// functions: ChatService and the chat components call them.
//
// Every sentence is whole and goes through the interface language (core/i18n):
// "You added Omar" and "Sara added Omar" are two sentences, because Arabic says
// them differently.

/** The parts of a chat these functions read. */
export interface ChatSummary {
  isGroup?: boolean;
  name?: string | null;
  isAdmin?: boolean;
  createdByUserId?: string | null;
  participants?: ChatParticipant[];
  activeCall?: GroupCall | null;
  friend: { id: string; fullName: string; profilePictureUrl?: string | null; isOnline?: boolean };
  lastMessage?: ChatMessageEvent | null;
}

// Unicode marks that keep a piece of text in its own direction inside a sentence.
const FIRST_STRONG_ISOLATE = String.fromCharCode(0x2068);
const POP_ISOLATE = String.fromCharCode(0x2069);

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || t('Someone');
}

/**
 * A name or a message placed inside an Arabic sentence, kept in its own direction
 * (Unicode isolates), so "Trip 2027!" does not come out as "!Trip 2027" in a
 * right-to-left line. English sentences are left exactly as they are.
 */
export function isolate(text: string | null | undefined): string {
  const value = text ?? '';
  return isRtl() && value ? FIRST_STRONG_ISOLATE + value + POP_ISOLATE : value;
}

/** The name on a chat: the group's, or the friend's. */
export function chatTitle(chat: ChatSummary): string {
  return chat.isGroup ? chat.name || chat.friend.fullName : chat.friend.fullName;
}

/**
 * "1 member", "5 members". `one` and `many` are the English words; the Arabic
 * forms are listed in the dictionary under "{n} members", "{n} people".
 */
export function countLabel(count: number, one: string, many: string): string {
  return tCount(count, `{n} ${one}`, `{n} ${many}`);
}

/**
 * A call as one line of text, for the chat and the chat list:
 * "Video call · 2:05", "Missed voice call", "Voice call · no answer", and for
 * a group call "Video call · 2:05 · 3 people".
 * "mine" is true when the reader is the one who called.
 */
export function describeCall(message: ChatMessageEvent, mine: boolean): string {
  const video = !!message.callVideo;
  const inGroup = message.callParticipants != null;

  switch (message.callOutcome) {
    case 'Completed': {
      const seconds = message.callSeconds ?? 0;
      const length = num(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
      if (!inGroup) return video ? t('Video call · {length}', { length }) : t('Voice call · {length}', { length });

      // English says "people" for every count here; Arabic picks its form by the count.
      const people = message.callParticipants ?? 0;
      return video
        ? tCount(people, 'Video call · {length} · {n} people', 'Video call · {length} · {n} people', { length })
        : tCount(people, 'Voice call · {length} · {n} people', 'Voice call · {length} · {n} people', { length });
    }
    case 'Declined': return video ? t('Video call declined') : t('Voice call declined');
    default:
      if (!mine) return video ? t('Missed video call') : t('Missed voice call');
      if (inGroup) return video ? t('Video call · no one joined') : t('Voice call · no one joined');
      return video ? t('Video call · no answer') : t('Voice call · no answer');
  }
}

/**
 * What happened to a group, as the chat says it to this reader:
 * "You created the group “Trip”", "Sara added you", "Omar left the group".
 */
export function describeGroupEvent(message: ChatMessageEvent, me: string | null): string {
  const byMe = message.senderId === me;
  const toMe = message.targetUser?.id === me;
  const actor = isolate(firstName(message.sender?.fullName));
  const name = isolate(firstName(message.targetUser?.fullName));
  const group = isolate(message.groupName ?? '');

  switch (message.groupEvent) {
    case 'Created':
      return byMe
        ? t('You created the group “{group}”', { group })
        : t('{actor} created the group “{group}”', { actor, group });
    case 'MemberAdded':
      if (byMe) return t('You added {name}', { name });
      return toMe ? t('{actor} added you', { actor }) : t('{actor} added {name}', { actor, name });
    case 'MemberRemoved':
      if (byMe) return t('You removed {name}', { name });
      return toMe ? t('{actor} removed you', { actor }) : t('{actor} removed {name}', { actor, name });
    case 'MemberLeft':
      return byMe ? t('You left the group') : t('{actor} left the group', { actor });
    case 'Renamed':
      return byMe
        ? t('You renamed the group to “{group}”', { group })
        : t('{actor} renamed the group to “{group}”', { actor, group });
    // A kind this build does not know: the server's own sentence.
    default: return message.body;
  }
}

/** Under a name in the chat list: the newest message, in a few words. */
export function previewText(chat: ChatSummary, me: string | null): string {
  const last = chat.lastMessage;
  if (!last) return '';

  const mine = last.senderId === me;
  if (last.groupEvent) return describeGroupEvent(last, me);
  if (last.callOutcome) return describeCall(last, mine);

  const text = last.isDeleted ? t('Message deleted') : last.body;
  if (mine) return t('You: {text}', { text: isolate(text) });
  return chat.isGroup && last.sender
    ? t('{name}: {text}', { name: isolate(firstName(last.sender.fullName)), text: isolate(text) })
    : text;
}

/**
 * Whether two neighbouring messages of a group read as one run: written by the
 * same person, close in time. A line about a call or about the group is never
 * part of a run.
 */
export function sameRun(
  a: ChatMessageEvent | undefined, b: ChatMessageEvent | undefined, gapMs: number
): boolean {
  if (!a || !b || a.senderId !== b.senderId) return false;
  if (a.callOutcome || a.groupEvent || b.callOutcome || b.groupEvent) return false;
  return Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <= gapMs;
}

/** Who is typing in a group: "Omar is typing…", "2 people are typing…". */
export function typingLabel(names: string[]): string {
  if (!names.length) return '';
  return names.length === 1
    ? t('{name} is typing…', { name: isolate(firstName(names[0])) })
    : tCount(names.length, '{n} people are typing…', '{n} people are typing…');
}

/**
 * Under the user's newest message in a group: who has read it.
 * `readers` are the others who have, `others` is how many others the group has.
 */
export function seenLabel(readers: string[], others: number): string {
  if (!readers.length) return t('Sent');
  if (readers.length >= others) return others > 1 ? t('Seen by everyone') : t('Seen');

  const names = readers.map(reader => isolate(firstName(reader)));
  if (names.length === 1) return t('Seen by {name}', { name: names[0] });
  if (names.length === 2) return t('Seen by {first} and {second}', { first: names[0], second: names[1] });
  return tCount(names.length, 'Seen by {n} people', 'Seen by {n} people');
}

/** The others of a group who have read everything up to `sentAt`. */
export function readersOf(participants: ChatParticipant[], me: string | null, sentAt: string): string[] {
  return participants
    .filter(p => p.id !== me && !!p.lastReadAt && p.lastReadAt >= sentAt)
    .map(p => p.fullName);
}

/** A group after "chatGroupChanged": its name and people, and whether the reader is an admin. */
export function applyGroupChange<T extends ChatSummary>(chat: T, change: ChatGroupEvent, me: string | null): T {
  return {
    ...chat,
    name: change.name,
    createdByUserId: change.createdByUserId,
    participants: change.participants,
    isAdmin: change.participants.some(p => p.id === me && p.isAdmin),
    // The stand-in the server sends for builds without groups carries the name too.
    friend: { ...chat.friend, fullName: change.name }
  };
}

/** A read mark that arrived live, on the person it belongs to. */
export function applyRead<T extends ChatSummary>(chat: T, userId: string, readAt: string): T {
  if (!chat.participants) return chat;
  return { ...chat, participants: chat.participants.map(p => (p.id === userId ? { ...p, lastReadAt: readAt } : p)) };
}

/**
 * The call of a group after someone joined or left it. Null when this tab does
 * not know that call (the event came before the call itself): ask the server.
 */
export function applyCallMembers(call: GroupCall | null | undefined, event: GroupCallMemberEvent): GroupCall | null {
  return call && call.callId === event.callId ? { ...call, participants: event.participants } : null;
}

/** True when this person is in the call of the chat. */
export function isInCall(chat: ChatSummary | undefined, userId: string | null): boolean {
  return !!chat?.activeCall?.participants.some(p => p.id === userId);
}
