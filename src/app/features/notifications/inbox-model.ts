/**
 * What the Inbox shows, worked out from its four real sources: notifications,
 * mentions, event invitations and friend requests. Pure functions, so the page
 * only has to load the lists and draw the result.
 *
 * Every sentence is in the interface language. The API writes its notification
 * sentences in English, so the ones it is known to send are read back into their
 * parts (who, what) and said again here: see `notificationSentence`.
 */
import { EventDto, FriendshipDto, MentionDto, NotificationDto } from '../../models/api.models';
import { isRtl, t, tCount } from '../../core/i18n/i18n';

export type InboxTab = 'all' | 'mentions' | 'invites' | 'requests' | 'updates';
export type InboxKind = 'mention' | 'comment' | 'invite' | 'request' | 'update' | 'reminder' | 'recap';
/** Which colour of the design a kind is drawn in. */
export type InboxTone = 'accent' | 'blue' | 'violet' | 'green' | 'rose';

export interface KindLook { label: string; glyph: string; tone: InboxTone; tab: Exclude<InboxTab, 'all'>; }

/**
 * Label, badge and tab of each kind, as in the design. The label is read in the
 * interface language each time, and the arrow of an update points the way the page reads.
 */
export const KINDS: Record<InboxKind, KindLook> = {
  mention:  { get label() { return t('Mention'); },        glyph: '@', tone: 'accent', tab: 'mentions' },
  comment:  { get label() { return t('Comment'); },        glyph: '"', tone: 'rose',   tab: 'mentions' },
  invite:   { get label() { return t('Invite@@noun'); },   glyph: '+', tone: 'blue',   tab: 'invites' },
  request:  { get label() { return t('Friend request'); }, glyph: '★', tone: 'violet', tab: 'requests' },
  update:   { get label() { return t('Update@@noun'); },   get glyph() { return isRtl() ? '←' : '→'; }, tone: 'green', tab: 'updates' },
  reminder: { get label() { return t('Reminder'); },       glyph: '!', tone: 'accent', tab: 'updates' },
  recap:    { get label() { return t('Weekly recap'); },   glyph: '✓', tone: 'green',  tab: 'updates' }
};

export const TABS: { key: InboxTab; label: string }[] = [
  { key: 'all', get label() { return t('All'); } },
  { key: 'mentions', get label() { return t('Mentions'); } },
  { key: 'invites', get label() { return t('Invites'); } },
  { key: 'requests', get label() { return t('Requests'); } },
  { key: 'updates', get label() { return t('Updates'); } }
];

/** The numbers of the week before this one, counted in the browser from real tasks and events. */
export interface WeekRecap {
  /** `yyyy-mm-dd` of the first day of that week; also what the item is remembered by. */
  weekKey: string;
  weekNumber: number;
  tasksDone: number;
  meetingMinutes: number;
  focusMinutes: number;
  plansCommitted: number;
  workDays: number;
  /** The day with the most time in meetings, and how much. */
  busiestDay: string | null;
  busiestMinutes: number;
  /** Month and year of that week, for the link to the month view. */
  monthLabel: string;
  monthKey: string;
  /** When the recap becomes available: the start of this week. */
  at: string;
}

export interface InboxItem {
  /** Stable across reloads: "n:<id>", "m:<id>", "i:<event id>", "r:<friendship id>", "w:<week>". */
  key: string;
  kind: InboxKind;
  /** The word on the chip in the reading pane ("Task update", "Event update"). */
  label: string;
  /** When it happened, as a time stamp; the list is sorted by it. */
  at: number;
  title: string;
  snippet: string;
  /** Who it is from; empty for the ones Miqat itself sends. */
  actorId: string | null;
  actorName: string;
  actorPicture: string | null;
  /** True when it has not been read on the server (or, with no server state, seen in this browser). */
  unread: boolean;
  /** Notifications that say the same thing: read and removed together with the item. */
  notifications: NotificationDto[];
  mention?: MentionDto;
  event?: EventDto;
  request?: FriendshipDto;
  recap?: WeekRecap;
}

export interface InboxSources {
  notifications: NotificationDto[];
  mentions: MentionDto[];
  invitations: EventDto[];
  requests: FriendshipDto[];
  recap: WeekRecap | null;
  /** Keys of items with no read state on the server that were opened in this browser. */
  seen: ReadonlySet<string>;
  now: number;
}

const time = (value: string | null | undefined): number => {
  const stamp = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(stamp) ? 0 : stamp;
};

const firstName = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/)[0] || t('Someone');

// ── Mentions ─────────────────────────────────────────────────────────────────

/**
 * The API serialises a mention's type as the enum name ("Project" | "Task" |
 * "Comment") and accepts the number too: Project = 0, Task = 1, Comment = 2.
 */
export function mentionType(mention: MentionDto): 'project' | 'task' | 'comment' | 'other' {
  const type = String(mention.entityType ?? '').toLowerCase();
  if (type === '0' || type === 'group' || type === 'project') return 'project';
  if (type === '1' || type === 'task' || type === 'taskitem') return 'task';
  if (type === '2' || type === 'comment') return 'comment';
  return 'other';
}

/**
 * The project discussion a mention or a reply was made in, and the comment there:
 * the API links such a notification to the project ("Group") and to the comment.
 * null when the item is not about a comment in a discussion.
 */
export function mentionDiscussion(item: InboxItem): { projectId: string; commentId: string } | null {
  const linked = item.notifications
    .find(n => (n.linkedEntityType ?? '').toLowerCase() === 'group' && n.linkedEntityId && n.linkedCommentId);
  return linked ? { projectId: linked.linkedEntityId!, commentId: linked.linkedCommentId! } : null;
}

/** The task a mention is on: its own id, or for a comment the task its notification names. */
export function mentionTaskId(item: InboxItem): string | null {
  const mention = item.mention;
  const fromNotification = item.notifications
    .find(n => (n.linkedEntityType ?? '').toLowerCase() === 'taskitem' && n.linkedEntityId)?.linkedEntityId ?? null;
  if (!mention) return fromNotification;
  if (mentionType(mention) === 'task') return mention.entityId ?? fromNotification;
  return mentionType(mention) === 'comment' ? fromNotification : null;
}

// ── What a notification is about ─────────────────────────────────────────────

/** What a notification is about, shown on the row and used to decide where a click goes. */
export interface NotificationTopic {
  kind: 'task' | 'project' | 'person' | 'mention' | 'event' | 'account' | 'other';
  /** "Task", "Project", "Friend request" ... */
  label: string;
  /** The task title, project name or person's name, when it is known. */
  name?: string;
}

/** 'Launch email campaign' out of "Your task 'Launch email campaign' is due in 2 days". */
function quotedIn(text: string): string | undefined {
  // Double quotes first: event and reminder messages use them ("Sam's birthday"
  // starts in 10 minutes), and the name inside may itself hold an apostrophe.
  return (/["“]([^"”]{2,})["”]/.exec(text) ?? /['‘]([^'’]{2,})['’]/.exec(text))?.[1]?.trim();
}

function taskNameIn(text: string): string | undefined {
  return quotedIn(text)
    // "You have been assigned task: Social media content"
    ?? /\btask(?: assigned)?:\s*(.+?)\s*$/i.exec(text.trim())?.[1]?.trim();
}

/** "Marketing Squad" out of "Carlos joined the Marketing Squad group". */
function projectNameIn(text: string): string | undefined {
  return /\bthe\s+(.+?)\s+(?:group|project)\b/i.exec(text)?.[1]?.trim();
}

/**
 * Reads a name out of the message, or failing that the title - one at a time.
 * Joined into one string, a pattern that runs to the end of the title ("Task
 * Assigned: X") carried on through the message and returned both.
 */
function nameIn(n: NotificationDto, read: (text: string) => string | undefined): string | undefined {
  for (const part of [n.message, n.title]) {
    const found = part ? read(part.trim()) : undefined;
    if (found) return found;
  }
  return undefined;
}

/**
 * The topic of a notification: its kind and, when it can be told, the name of
 * the task / project / person. The API sends the name with new notifications
 * (`linkedEntityName`); for older ones it is read out of the message, which
 * quotes it ("Your task 'Launch email campaign' is due in 2 days").
 */
export function notificationTopic(n: NotificationDto): NotificationTopic {
  const type = n.type ?? '';
  const text = `${n.title ?? ''} ${n.message ?? ''}`;
  const entity = (n.linkedEntityType ?? '').toLowerCase();
  const linkedName = n.linkedEntityName?.trim() || undefined;

  if (/profile (was|has been) updated/i.test(text)) return { kind: 'account', label: t('Your account') };
  if (entity === 'friendship' || type.startsWith('Friend') || type === 'UserBlocked') {
    const label = type === 'FriendRequestSent' ? t('Friend request')
      : type === 'FriendRequestAccepted' ? t('New friend')
      : t('Friends');
    return { kind: 'person', label, name: n.triggeredByUserName?.trim() || undefined };
  }
  // Event news, and a reminder set on an event. (A reminder set on a task is
  // linked to the task and is caught by the task branch below.)
  if (entity.includes('event') || type.startsWith('Event')) {
    return { kind: 'event', label: t('Event'), name: linkedName ?? nameIn(n, quotedIn) };
  }
  if (entity === 'group' || type.startsWith('Group')) {
    // New sentences quote the project (added you to "Website"); older ones say "the Website group".
    return { kind: 'project', label: t('Project'), name: linkedName ?? nameIn(n, quotedIn) ?? nameIn(n, projectNameIn) };
  }
  if (type.includes('Mention')) {
    // A mention in a task carries the task; otherwise the message names the project.
    return { kind: 'mention', label: t('Mention'), name: linkedName ?? nameIn(n, quotedIn) ?? nameIn(n, projectNameIn) };
  }
  if (entity === 'taskitem' || type.startsWith('Task')) {
    return { kind: 'task', label: t('Task'), name: linkedName ?? nameIn(n, taskNameIn) };
  }
  return { kind: 'other', label: t('Update@@noun') };
}

/** Which kind of inbox item a notification is, and the word on its chip. */
export function notificationKind(n: NotificationDto): { kind: InboxKind; label: string } {
  const type = n.type ?? '';
  if (type.includes('Mention')) return { kind: 'mention', label: KINDS.mention.label };
  if (type === 'EventInvitation') return { kind: 'invite', label: KINDS.invite.label };
  if (type === 'FriendRequestSent') return { kind: 'request', label: KINDS.request.label };
  if (type === 'Reminder' || type === 'TaskDueSoon') return { kind: 'reminder', label: KINDS.reminder.label };

  const topic = notificationTopic(n);
  const label = topic.kind === 'task' ? t('Task update')
    : topic.kind === 'event' ? t('Event update')
    : topic.kind === 'project' ? t('Project update')
    : topic.kind === 'person' ? topic.label
    : topic.kind === 'account' ? t('Your account')
    : t('Update@@noun');
  return { kind: 'update', label };
}

// ── What a notification says ─────────────────────────────────────────────────

type Said = Record<string, string>;

/** One sentence the API writes: how to recognise it, and how to say it in the interface language. */
interface ServerSentence { pattern: RegExp; say: (said: Said) => string; }

/** "in 5 minutes", "in about an hour", "in about 3 days", as the API words how long is left. */
const UNTIL = '(?<until>in (?:about )?(?<count>\\d+|an?) (?<unit>minute|hour|day)s?)';

const count = (said: Said): number => (/^\d+$/.test(said['count']) ? Number(said['count']) : 1);

/** "Write the brief" is due in 5 minutes / in about an hour / in about 2 days. */
function dueIn(said: Said): string {
  const name = said['name'];
  switch (said['unit']) {
    case 'minute': return tCount(count(said), '"{name}" is due in {n} minute.', '"{name}" is due in {n} minutes.', { name });
    case 'hour': return tCount(count(said), '"{name}" is due in about an hour.', '"{name}" is due in about {n} hours.', { name });
    default: return tCount(count(said), '"{name}" is due in about a day.', '"{name}" is due in about {n} days.', { name });
  }
}

/** "Team stand-up" starts in 10 minutes / in about an hour / in about 2 days. */
function startsIn(said: Said): string {
  const name = said['name'];
  switch (said['unit']) {
    case 'minute': return tCount(count(said), '"{name}" starts in {n} minute.', '"{name}" starts in {n} minutes.', { name });
    case 'hour': return tCount(count(said), '"{name}" starts in about an hour.', '"{name}" starts in about {n} hours.', { name });
    default: return tCount(count(said), '"{name}" starts in about a day.', '"{name}" starts in about {n} days.', { name });
  }
}

/**
 * Every sentence the API sends with a notification (see the services that call
 * its notification sender). In English each comes out exactly as it came in.
 * The longer wordings stand before the shorter ones they begin like.
 */
const SERVER_SENTENCES: ServerSentence[] = [
  // Comments and mentions
  { pattern: /^(?<actor>.+?) commented on "(?<name>.+?)": (?<text>[\s\S]*)$/,
    say: said => t('{actor} commented on "{name}": {text}', said) },
  // A reply in a project's discussion (its Arabic is with the discussion, in ar/projects.ts).
  { pattern: /^(?<actor>.+?) replied to your comment in "(?<name>.+?)": (?<text>[\s\S]*)$/,
    say: said => t('{actor} replied to your comment in "{name}": {text}', said) },
  { pattern: /^(?<actor>.+?) mentioned you in "(?<name>.+)"\.$/, say: said => t('{actor} mentioned you in "{name}".', said) },
  { pattern: /^(?<actor>.+?) mentioned you in a project\.$/, say: said => t('{actor} mentioned you in a project.', said) },
  { pattern: /^(?<actor>.+?) mentioned you in a task\.$/, say: said => t('{actor} mentioned you in a task.', said) },
  { pattern: /^(?<actor>.+?) mentioned you in a comment\.$/, say: said => t('{actor} mentioned you in a comment.', said) },

  // Events
  { pattern: /^(?<actor>.+?) invited you to "(?<name>.+)"\.$/, say: said => t('{actor} invited you to "{name}".', said) },
  { pattern: /^(?<actor>.+?) accepted the invitation to "(?<name>.+)"\.$/, say: said => t('{actor} accepted the invitation to "{name}".', said) },
  { pattern: /^(?<actor>.+?) declined the invitation to "(?<name>.+)"\.$/, say: said => t('{actor} declined the invitation to "{name}".', said) },
  { pattern: /^(?<actor>.+?) may come to "(?<name>.+)"\.$/, say: said => t('{actor} may come to "{name}".', said) },
  { pattern: /^(?<actor>.+?) changed one date of "(?<name>.+)"\.$/, say: said => t('{actor} changed one date of "{name}".', said) },
  { pattern: /^(?<actor>.+?) cancelled one date of "(?<name>.+)"\.$/, say: said => t('{actor} cancelled one date of "{name}".', said) },
  { pattern: /^(?<actor>.+?) restored one date of "(?<name>.+)"\.$/, say: said => t('{actor} restored one date of "{name}".', said) },
  { pattern: /^(?<actor>.+?) changed "(?<name>.+)"\.$/, say: said => t('{actor} changed "{name}".', said) },
  { pattern: /^(?<actor>.+?) cancelled "(?<name>.+)"\.$/, say: said => t('{actor} cancelled "{name}".', said) },

  // Friends and projects
  { pattern: /^(?<actor>.+?) sent you a friend request\.$/, say: said => t('{actor} sent you a friend request.', said) },
  { pattern: /^(?<actor>.+?) accepted your friend request\.$/, say: said => t('{actor} accepted your friend request.', said) },
  { pattern: /^(?<actor>.+?) added you to "(?<name>.+)"\.$/, say: said => t('{actor} added you to "{name}".', said) },

  // Tasks
  { pattern: /^(?<actor>.+?) assigned you "(?<name>.+)"\.$/, say: said => t('{actor} assigned you "{name}".', said) },
  { pattern: /^(?<actor>.+?) assigned "(?<name>.+)" to you\.$/, say: said => t('{actor} assigned "{name}" to you.', said) },
  { pattern: /^(?<actor>.+?) completed "(?<name>.+)"\.$/, say: said => t('{actor} completed "{name}".', said) },

  // Reminders and "due soon": no one caused them
  { pattern: /^"(?<name>.+)" is due now\.$/, say: said => t('"{name}" is due now.', said) },
  { pattern: /^"(?<name>.+)" has started\.$/, say: said => t('"{name}" has started.', said) },
  { pattern: /^"(?<name>.+)" starts now\.$/, say: said => t('"{name}" starts now.', said) },
  { pattern: new RegExp(`^"(?<name>.+)" is due ${UNTIL}\\.$`), say: dueIn },
  { pattern: new RegExp(`^"(?<name>.+)" starts ${UNTIL}\\.$`), say: startsIn }
];

/**
 * What a notification says, in the interface language.
 *
 * The API sends a ready English sentence with the type. The sentences it is known
 * to write are recognised and said again with their names and titles in place; the
 * person named is the one the notification says caused it. Anything else (older
 * wordings, sentences added to the API later) is looked up as it stands and
 * otherwise shown as the API wrote it.
 */
export function notificationSentence(n: NotificationDto): string {
  const message = (n.message ?? '').trim();
  if (!message) return notificationHeading(n) || t('Notification');

  for (const sentence of SERVER_SENTENCES) {
    const said = sentence.pattern.exec(message)?.groups;
    if (said) return sentence.say({ ...said });
  }
  return t(message);
}

/** The short title the API gives a notification ("Event invitation"), in the interface language. */
export function notificationHeading(n: NotificationDto): string {
  const title = (n.title ?? '').trim();
  return title ? t(title) : '';
}

// ── Building the list ────────────────────────────────────────────────────────

function fromNotification(n: NotificationDto): InboxItem {
  let { kind, label } = notificationKind(n);
  // An invitation or a friend request with nothing left to answer (it was answered,
  // or the event is gone) is news, not something waiting: it goes under Updates.
  if (kind === 'invite' || kind === 'request') {
    label = kind === 'invite' ? t('Invitation') : t('Friend request');
    kind = 'update';
  }
  const topic = notificationTopic(n);
  const sentence = notificationSentence(n);
  return {
    key: `n:${n.id}`,
    kind, label,
    at: time(n.createdAt),
    title: sentence,
    snippet: [topic.label, topic.name].filter(Boolean).join(' · '),
    actorId: n.triggeredByUserId ?? null,
    actorName: n.triggeredByUserName?.trim() || '',
    actorPicture: n.triggeredByUserProfilePictureUrl ?? null,
    unread: !n.isRead,
    notifications: [n]
  };
}

/**
 * Notifications, mentions, invitations and friend requests as one list, newest
 * first. A mention, an invitation and a request each have a notification that
 * says the same thing: the two are shown once, and read together.
 */
export function buildInbox(sources: InboxSources): InboxItem[] {
  const left = [...sources.notifications];
  /** Takes the notifications that match out of the pool, newest first. */
  const take = (matches: (n: NotificationDto) => boolean): NotificationDto[] => {
    const found = left.filter(matches).sort((a, b) => time(b.createdAt) - time(a.createdAt));
    for (const n of found) left.splice(left.indexOf(n), 1);
    return found;
  };
  const items: InboxItem[] = [];

  for (const mention of sources.mentions) {
    const type = mentionType(mention);
    // The API keeps one mention per person and task, however often they mention the user
    // there, and sends notifications each time (two for a comment: "You were mentioned" and
    // "New comment"). All of them belong to this one item; the newest says when it happened.
    const paired = take(n => (n.type ?? '').includes('Mention')
      && (!mention.mentionedByUserId || n.triggeredByUserId === mention.mentionedByUserId)
      && (n.linkedEntityId === mention.entityId || n.linkedCommentId === mention.entityId));
    const at = Math.max(time(mention.createdAt), time(paired[0]?.createdAt));

    const where = mention.entityName || paired[0]?.linkedEntityName || '';
    const who = firstName(mention.mentionedByUserName);
    const title = where
      ? (type === 'comment'
        ? t('{name} mentioned you in a comment on {where}', { name: who, where })
        : t('{name} mentioned you in {where}', { name: who, where }))
      : type === 'project' ? t('{name} mentioned you in a project', { name: who })
      : type === 'comment' ? t('{name} mentioned you in a comment', { name: who })
      : t('{name} mentioned you in a task', { name: who });
    items.push({
      key: `m:${mention.id}`,
      kind: type === 'comment' ? 'comment' : 'mention',
      label: type === 'comment' ? KINDS.comment.label : KINDS.mention.label,
      at,
      title,
      snippet: [type === 'project' ? t('Project') : t('Task'), where].filter(Boolean).join(' · '),
      actorId: mention.mentionedByUserId ?? null,
      actorName: mention.mentionedByUserName?.trim() || '',
      actorPicture: mention.mentionedByUserProfilePictureUrl ?? null,
      unread: !mention.isRead || paired.some(n => !n.isRead),
      notifications: paired,
      mention
    });
  }

  for (const event of sources.invitations) {
    const paired = take(n => n.type === 'EventInvitation' && n.linkedEntityId === event.id);
    const pending = (event.myResponse ?? 'Pending') === 'Pending';
    const over = !event.recurrence || event.recurrence === 'None' ? time(event.endsAt) < sources.now : false;
    // An answered or past invitation stays only while its notification is still in the feed.
    if (!paired.length && (!pending || over)) continue;

    const key = `i:${event.id}`;
    items.push({
      key,
      kind: 'invite',
      label: KINDS.invite.label,
      at: time(paired[0]?.createdAt) || time(event.createdAt),
      title: t('{name} invited you to {title}', { name: firstName(event.ownerName), title: event.title }),
      snippet: '',
      actorId: event.ownerId,
      actorName: event.ownerName?.trim() || '',
      actorPicture: event.ownerProfilePictureUrl ?? null,
      unread: paired.length ? paired.some(n => !n.isRead) : pending && !sources.seen.has(key),
      notifications: paired,
      event
    });
  }

  for (const request of sources.requests) {
    const paired = take(n => n.type === 'FriendRequestSent' && n.triggeredByUserId === request.senderId);
    const key = `r:${request.id}`;
    const name = request.senderName?.trim() || request.sender?.fullName?.trim() || t('Someone');
    items.push({
      key,
      kind: 'request',
      label: KINDS.request.label,
      at: time(paired[0]?.createdAt) || time(request.createdAt),
      title: t('{name} wants to connect', { name }),
      snippet: t('Friend request · answer it here'),
      actorId: request.senderId,
      actorName: name,
      actorPicture: request.senderProfilePictureUrl ?? null,
      unread: paired.length ? paired.some(n => !n.isRead) : !sources.seen.has(key),
      notifications: paired,
      request
    });
  }

  for (const n of left) items.push(fromNotification(n));

  const recap = sources.recap;
  if (recap) {
    const key = `w:${recap.weekKey}`;
    items.push({
      key,
      kind: 'recap',
      label: KINDS.recap.label,
      at: time(recap.at),
      title: t('Your week {n} in review', { n: recap.weekNumber }),
      snippet: '',
      actorId: null,
      actorName: '',
      actorPicture: null,
      unread: !sources.seen.has(key),
      notifications: [],
      recap
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

export function tabOf(item: InboxItem): Exclude<InboxTab, 'all'> {
  return KINDS[item.kind].tab;
}

/** "MA" for Mariam Adel; "M" for Miqat itself (its first letter in the interface language). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return t('M@@the first letter of Miqat');
  const first = words[0][0];
  const second = words[1]?.[0] ?? '';
  // Two Arabic letters side by side would join into a word: a zero-width non-joiner keeps them apart.
  const apart = second && /[\u0600-\u06ff]/.test(first) && /[\u0600-\u06ff]/.test(second) ? '\u200c' : '';
  return (first + apart + second).toUpperCase();
}

/** ISO week number of a calendar day. */
export function weekNumberOf(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}
