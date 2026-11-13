import { NotificationDto } from '../../models/api.models';

/** Where a click on a notification goes: a router path and, sometimes, a query string. */
export interface NotificationTarget {
  commands: string[];
  queryParams?: Record<string, string>;
}

/**
 * The page a notification points at, when the notification itself says so
 * (`linkedEntityType` + `linkedEntityId`). Returns null when it names nothing;
 * the caller then decides what to fall back to.
 *
 * Shared by the notifications page and the notification panel so a row opens the
 * same thing wherever it is clicked.
 */
export function notificationTarget(n: NotificationDto): NotificationTarget | null {
  const entity = (n.linkedEntityType ?? '').toLowerCase();
  const id = n.linkedEntityId || null;
  const type = n.type ?? '';

  // A task: an assignment, a comment, a due-soon warning or a reminder set on it.
  if (entity === 'taskitem' && id) {
    return n.linkedCommentId
      ? { commands: ['/tasks', id], queryParams: { comment: n.linkedCommentId } }
      : { commands: ['/tasks', id] };
  }

  // A project: news about the project itself, or a comment in its discussion
  // (a mention or a reply), which opens the discussion at that comment.
  if (entity === 'group' && id) {
    return n.linkedCommentId
      ? { commands: ['/projects', id, 'discussion'], queryParams: { comment: n.linkedCommentId } }
      : { commands: ['/projects', id] };
  }

  // A calendar event: an invitation, an answer, a change, or a reminder set on it.
  if (entity === 'event') {
    // A cancelled event is gone, so there is nothing to open but the calendar.
    return id && type !== 'EventCancelled'
      ? { commands: ['/calendar'], queryParams: { event: id } }
      : { commands: ['/calendar'] };
  }

  if (entity === 'friendship') {
    // A request still waiting for an answer belongs on the Requests list, where
    // it can be confirmed; anything else is about the person.
    if (type === 'FriendRequestSent') return { commands: ['/friends'], queryParams: { tab: 'requests' } };
    return n.triggeredByUserId ? { commands: ['/profile', n.triggeredByUserId] } : { commands: ['/friends'] };
  }

  return null;
}

/** True for the notifications the calendar produces: event news and reminders. */
export function isCalendarNotification(n: NotificationDto): boolean {
  const type = n.type ?? '';
  return type.startsWith('Event') || type === 'Reminder';
}
