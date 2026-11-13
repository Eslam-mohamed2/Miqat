import { NotificationDto } from '../../models/api.models';
import { isCalendarNotification, notificationTarget } from './notification-target';

function notification(fields: Partial<NotificationDto>): NotificationDto {
  return { id: 'n1', isRead: false, createdAt: '2026-11-12T10:00:00Z', ...fields } as NotificationDto;
}

describe('notificationTarget', () => {
  it('opens the event of an invitation on the calendar', () => {
    const target = notificationTarget(notification({
      type: 'EventInvitation', linkedEntityType: 'Event', linkedEntityId: 'e1'
    }));

    expect(target).toEqual({ commands: ['/calendar'], queryParams: { event: 'e1' } });
  });

  it('opens just the calendar for a cancelled event, which no longer exists', () => {
    const target = notificationTarget(notification({
      type: 'EventCancelled', linkedEntityType: 'Event', linkedEntityId: 'e1'
    }));

    expect(target).toEqual({ commands: ['/calendar'] });
  });

  it('opens the event of a reminder set on an event', () => {
    const target = notificationTarget(notification({
      type: 'Reminder', linkedEntityType: 'Event', linkedEntityId: 'e2'
    }));

    expect(target).toEqual({ commands: ['/calendar'], queryParams: { event: 'e2' } });
  });

  it('opens the task of a reminder set on a task', () => {
    const target = notificationTarget(notification({
      type: 'Reminder', linkedEntityType: 'TaskItem', linkedEntityId: 't1'
    }));

    expect(target).toEqual({ commands: ['/tasks', 't1'] });
  });

  it('opens a task on the comment the notification is about', () => {
    const target = notificationTarget(notification({
      type: 'MentionedInTask', linkedEntityType: 'TaskItem', linkedEntityId: 't1', linkedCommentId: 'c9'
    }));

    expect(target).toEqual({ commands: ['/tasks', 't1'], queryParams: { comment: 'c9' } });
  });

  it('opens a project, and its discussion when the notification is about a comment there', () => {
    expect(notificationTarget(notification({ linkedEntityType: 'Group', linkedEntityId: 'p1' })))
      .toEqual({ commands: ['/projects', 'p1'] });

    expect(notificationTarget(notification({ linkedEntityType: 'Group', linkedEntityId: 'p1', linkedCommentId: 'c4' })))
      .toEqual({ commands: ['/projects', 'p1', 'discussion'], queryParams: { comment: 'c4' } });
  });

  it('sends a waiting friend request to the Requests list', () => {
    const target = notificationTarget(notification({
      type: 'FriendRequestSent', linkedEntityType: 'Friendship', triggeredByUserId: 'u1'
    }));

    expect(target).toEqual({ commands: ['/friends'], queryParams: { tab: 'requests' } });
  });

  it('answers null when the notification names nothing', () => {
    expect(notificationTarget(notification({ type: 'TaskAssigned' }))).toBeNull();
  });
});

describe('isCalendarNotification', () => {
  it('is true for event news and reminders, and false for the rest', () => {
    expect(isCalendarNotification(notification({ type: 'EventResponse' }))).toBeTrue();
    expect(isCalendarNotification(notification({ type: 'Reminder' }))).toBeTrue();
    expect(isCalendarNotification(notification({ type: 'TaskDueSoon' }))).toBeFalse();
  });
});
