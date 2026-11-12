import { TestBed } from '@angular/core/testing';

import { NotificationsPage } from './notifications-page';
import { NotificationDto } from '../../models/api.models';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

/** A notification with only the fields a test cares about. */
function notification(fields: Partial<NotificationDto>): NotificationDto {
  return {
    id: 'n1',
    title: '',
    message: '',
    type: 'TaskAssigned',
    isRead: false,
    createdAt: '2026-11-11T10:00:00Z',
    ...fields
  } as NotificationDto;
}

describe('NotificationsPage', () => {
  let page: NotificationsPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: TEST_PROVIDERS
    }).compileComponents();

    // Not rendered: these tests are about how a notification is read, and
    // rendering would start loading the list.
    page = TestBed.createComponent(NotificationsPage).componentInstance;
  });

  describe('topic', () => {
    it('uses the name the API sends when there is one', () => {
      const topic = page.topic(notification({
        type: 'TaskAssigned',
        linkedEntityType: 'TaskItem',
        linkedEntityName: 'Write the brief',
        message: 'You have been assigned task: something else'
      }));

      expect(topic.kind).toBe('task');
      expect(topic.name).toBe('Write the brief');
    });

    it('reads a quoted task title out of the message', () => {
      const topic = page.topic(notification({
        type: 'TaskDueSoon',
        title: 'Task due soon',
        message: "Your task 'Launch email campaign' is due in 2 days"
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'task', label: 'Task', name: 'Launch email campaign' }));
    });

    it('reads "assigned task: X" as X, not as the title and message run together', () => {
      const topic = page.topic(notification({
        type: 'TaskAssigned',
        title: 'Task Assigned: Social media content Q3',
        message: 'You have been assigned task: Social media content Q3'
      }));

      expect(topic.name).toBe('Social media content Q3');
    });

    it('falls back to the title when the message names nothing', () => {
      const topic = page.topic(notification({
        type: 'TaskAssigned',
        title: 'Task Assigned: Prepare the demo',
        message: 'Open it to see the details.'
      }));

      expect(topic.name).toBe('Prepare the demo');
    });

    it('names the project of a group notification', () => {
      const topic = page.topic(notification({
        type: 'GroupMemberJoined',
        triggeredByUserName: 'Carlos Rodriguez',
        message: 'Carlos Rodriguez joined the Marketing Squad group'
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'project', label: 'Project', name: 'Marketing Squad' }));
    });

    it('names the sender of a friend request', () => {
      const topic = page.topic(notification({
        type: 'FriendRequestSent',
        linkedEntityType: 'Friendship',
        triggeredByUserName: 'Lisa Chen',
        message: 'Lisa Chen sent you a friend request.'
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'person', label: 'Friend request', name: 'Lisa Chen' }));
    });

    it('names the event of an invitation from what the API sends', () => {
      const topic = page.topic(notification({
        type: 'EventInvitation',
        linkedEntityType: 'Event',
        linkedEntityId: 'e1',
        linkedEntityName: 'Quarterly planning',
        triggeredByUserName: 'Ahmed Hassan',
        title: 'Event invitation',
        message: 'Ahmed Hassan invited you to "Quarterly planning".'
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'event', label: 'Event', name: 'Quarterly planning' }));
    });

    it('reads an event title out of the message, apostrophe and all', () => {
      const topic = page.topic(notification({
        type: 'EventResponse',
        linkedEntityType: 'Event',
        triggeredByUserName: 'Ahmed Hassan',
        title: 'Invitation answered',
        message: 'Ahmed Hassan accepted the invitation to "Sam\'s birthday".'
      }));

      expect(topic.kind).toBe('event');
      expect(topic.name).toBe("Sam's birthday");
    });

    it('files a cancelled event under events even without a link', () => {
      const topic = page.topic(notification({
        type: 'EventCancelled',
        title: 'Event cancelled',
        message: 'Lisa Chen cancelled "Design review".'
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'event', name: 'Design review' }));
    });

    it('files a reminder set on an event under that event', () => {
      const topic = page.topic(notification({
        type: 'Reminder',
        linkedEntityType: 'Event',
        title: 'Reminder',
        message: '"Team stand-up" starts in 10 minutes.'
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'event', name: 'Team stand-up' }));
    });

    it('files a reminder set on a task under that task', () => {
      const topic = page.topic(notification({
        type: 'Reminder',
        linkedEntityType: 'TaskItem',
        title: 'Reminder',
        message: '"Write the brief" is due in 1 hour.'
      }));

      expect(topic).toEqual(jasmine.objectContaining({ kind: 'task', label: 'Task', name: 'Write the brief' }));
    });

    it('files a profile update under the account', () => {
      const topic = page.topic(notification({
        type: 'General',
        message: 'Your profile has been updated successfully'
      }));

      expect(topic.kind).toBe('account');
    });
  });

  describe('the Events filter', () => {
    it('shows event news and reminders only', () => {
      page.notifications.set([
        notification({ id: 'a', type: 'TaskAssigned' }),
        notification({ id: 'b', type: 'EventInvitation' }),
        notification({ id: 'c', type: 'Reminder' })
      ]);
      page.filter.set('calendar');

      expect(page.visible().map(n => n.id)).toEqual(['b', 'c']);
    });

    it('falls back to everything once no event notification is left', () => {
      page.notifications.set([notification({ id: 'a', type: 'TaskAssigned' })]);
      page.filter.set('calendar');

      expect(page.activeFilter()).toBe('all');
      expect(page.visible().map(n => n.id)).toEqual(['a']);
    });
  });

  describe('body', () => {
    it('drops the sender name the row already prints in bold', () => {
      const text = page.body(notification({
        triggeredByUserName: 'Test User',
        message: 'Test User sent you a friend request.'
      }));

      expect(text).toBe('sent you a friend request.');
    });

    it('leaves a message alone when it does not start with the sender', () => {
      const text = page.body(notification({
        triggeredByUserName: 'Test User',
        message: "Your task 'Launch email campaign' is due in 2 days"
      }));

      expect(text).toBe("Your task 'Launch email campaign' is due in 2 days");
    });
  });
});
