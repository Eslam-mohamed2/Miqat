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
    createdAt: new Date().toISOString(),
    ...fields
  } as NotificationDto;
}

describe('NotificationsPage (the Inbox)', () => {
  let page: NotificationsPage;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: TEST_PROVIDERS
    }).compileComponents();

    // Not rendered: these tests are about what the lists become, and rendering
    // would start loading them.
    page = TestBed.createComponent(NotificationsPage).componentInstance;
  });

  it('counts each tab from the real sources', () => {
    page.notifications.set([
      notification({ id: 'a', type: 'TaskAssigned', linkedEntityType: 'TaskItem' }),
      notification({ id: 'b', type: 'MentionedInTask', linkedEntityType: 'TaskItem', linkedEntityId: 't1' }),
      notification({ id: 'c', type: 'Reminder' })
    ]);
    page.requests.set([
      { id: 'f1', senderId: 'u3', senderName: 'Youssef Hany', receiverId: 'me', status: 'Pending', createdAt: new Date().toISOString() }
    ]);

    expect(page.counts()).toEqual({ all: 4, mentions: 1, invites: 0, requests: 1, updates: 2 });
  });

  it('files the notification of a request that is no longer waiting under Updates', () => {
    page.notifications.set([notification({ id: 'd', type: 'FriendRequestSent', linkedEntityType: 'Friendship' })]);

    expect(page.counts()).toEqual({ all: 1, mentions: 0, invites: 0, requests: 0, updates: 1 });
  });

  it('says how many are unread, and "All read" when none are', () => {
    page.notifications.set([notification({ id: 'a' }), notification({ id: 'b', isRead: true })]);
    expect(page.unreadLabel()).toBe('1 unread');

    page.notifications.set([notification({ id: 'b', isRead: true })]);
    expect(page.unreadLabel()).toBe('All read');
  });

  it('shows only the chosen tab', () => {
    page.notifications.set([
      notification({ id: 'a', type: 'TaskAssigned' }),
      notification({ id: 'b', type: 'MentionedInTask' })
    ]);
    page.tab.set('mentions');

    const rows = page.groups().flatMap(group => group.rows);
    expect(rows.map(row => row.key)).toEqual(['n:b']);
  });

  it('groups what arrived today under Today', () => {
    page.notifications.set([notification({ id: 'a' })]);

    expect(page.groups().map(group => group.title)).toEqual(['Today']);
  });
});
