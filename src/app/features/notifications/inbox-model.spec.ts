import { EventDto, FriendshipDto, MentionDto, NotificationDto } from '../../models/api.models';
import { useLanguageForTests } from '../../core/i18n/i18n';
import { AR, AR_PLURALS } from '../../core/i18n/ar';
import {
  InboxSources, KINDS, TABS, WeekRecap, buildInbox, initialsOf, mentionDiscussion, mentionTaskId, notificationHeading,
  notificationKind, notificationSentence, notificationTopic, tabOf, weekNumberOf
} from './inbox-model';

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

function sources(fields: Partial<InboxSources>): InboxSources {
  return {
    notifications: [], mentions: [], invitations: [], requests: [], recap: null,
    seen: new Set(), now: new Date('2026-11-12T12:00:00Z').getTime(),
    ...fields
  };
}

describe('notificationTopic', () => {
  it('uses the name the API sends when there is one', () => {
    const topic = notificationTopic(notification({
      type: 'TaskAssigned',
      linkedEntityType: 'TaskItem',
      linkedEntityName: 'Write the brief',
      message: 'You have been assigned task: something else'
    }));

    expect(topic.kind).toBe('task');
    expect(topic.name).toBe('Write the brief');
  });

  it('reads a quoted task title out of the message', () => {
    const topic = notificationTopic(notification({
      type: 'TaskDueSoon',
      title: 'Task due soon',
      message: "Your task 'Launch email campaign' is due in 2 days"
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'task', label: 'Task', name: 'Launch email campaign' }));
  });

  it('reads "assigned task: X" as X, not as the title and message run together', () => {
    const topic = notificationTopic(notification({
      type: 'TaskAssigned',
      title: 'Task Assigned: Social media content Q3',
      message: 'You have been assigned task: Social media content Q3'
    }));

    expect(topic.name).toBe('Social media content Q3');
  });

  it('falls back to the title when the message names nothing', () => {
    const topic = notificationTopic(notification({
      type: 'TaskAssigned',
      title: 'Task Assigned: Prepare the demo',
      message: 'Open it to see the details.'
    }));

    expect(topic.name).toBe('Prepare the demo');
  });

  it('names the project of a group notification', () => {
    const topic = notificationTopic(notification({
      type: 'GroupMemberJoined',
      triggeredByUserName: 'Carlos Rodriguez',
      message: 'Carlos Rodriguez joined the Marketing Squad group'
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'project', label: 'Project', name: 'Marketing Squad' }));
  });

  it('names the sender of a friend request', () => {
    const topic = notificationTopic(notification({
      type: 'FriendRequestSent',
      linkedEntityType: 'Friendship',
      triggeredByUserName: 'Lisa Chen',
      message: 'Lisa Chen sent you a friend request.'
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'person', label: 'Friend request', name: 'Lisa Chen' }));
  });

  it('names the event of an invitation from what the API sends', () => {
    const topic = notificationTopic(notification({
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
    const topic = notificationTopic(notification({
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
    const topic = notificationTopic(notification({
      type: 'EventCancelled',
      title: 'Event cancelled',
      message: 'Lisa Chen cancelled "Design review".'
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'event', name: 'Design review' }));
  });

  it('files a reminder set on an event under that event', () => {
    const topic = notificationTopic(notification({
      type: 'Reminder',
      linkedEntityType: 'Event',
      title: 'Reminder',
      message: '"Team stand-up" starts in 10 minutes.'
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'event', name: 'Team stand-up' }));
  });

  it('files a reminder set on a task under that task', () => {
    const topic = notificationTopic(notification({
      type: 'Reminder',
      linkedEntityType: 'TaskItem',
      title: 'Reminder',
      message: '"Write the brief" is due in 1 hour.'
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'task', label: 'Task', name: 'Write the brief' }));
  });

  it('files a profile update under the account', () => {
    const topic = notificationTopic(notification({
      type: 'General',
      message: 'Your profile has been updated successfully'
    }));

    expect(topic.kind).toBe('account');
  });
});

describe('notificationKind', () => {
  it('puts reminders and due-soon warnings under Reminder', () => {
    expect(notificationKind(notification({ type: 'Reminder' })).kind).toBe('reminder');
    expect(notificationKind(notification({ type: 'TaskDueSoon' })).kind).toBe('reminder');
  });

  it('names an update after what it is about', () => {
    expect(notificationKind(notification({ type: 'TaskCompleted', linkedEntityType: 'TaskItem' })).label).toBe('Task update');
    expect(notificationKind(notification({ type: 'EventResponse', linkedEntityType: 'Event' })).label).toBe('Event update');
  });
});

describe('buildInbox', () => {
  it('sends each source to its tab', () => {
    const mention = { id: 'm1', isRead: false, entityType: 'Task', entityId: 't1', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1', mentionedByUserName: 'Mariam Adel' } as MentionDto;
    const invitation = { id: 'e1', title: 'Sprint review', startsAt: '2026-11-15T13:00:00Z', endsAt: '2026-11-15T13:45:00Z', isAllDay: false, recurrence: 'None', ownerId: 'u2', ownerName: 'Omar Khaled', myResponse: 'Pending', attendees: [], createdAt: '2026-11-12T08:00:00Z' } as unknown as EventDto;
    const request = { id: 'f1', senderId: 'u3', senderName: 'Youssef Hany', receiverId: 'me', status: 'Pending', createdAt: '2026-11-12T07:00:00Z' } as FriendshipDto;

    const items = buildInbox(sources({
      notifications: [notification({ id: 'a', type: 'TaskCompleted', linkedEntityType: 'TaskItem' })],
      mentions: [mention], invitations: [invitation], requests: [request]
    }));

    expect(items.map(item => [item.key, tabOf(item)])).toEqual([
      ['m:m1', 'mentions'], ['i:e1', 'invites'], ['r:f1', 'requests'], ['n:a', 'updates']
    ]);
  });

  it('shows a mention and the notification about it once, unread while either is', () => {
    const mention = { id: 'm1', isRead: true, entityType: 'Task', entityId: 't1', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1', mentionedByUserName: 'Mariam Adel', entityName: 'Sprint planning' } as MentionDto;
    const paired = notification({ id: 'p', type: 'MentionedInTask', linkedEntityType: 'TaskItem', linkedEntityId: 't1', triggeredByUserId: 'u1', createdAt: '2026-11-12T09:00:01Z' });

    const items = buildInbox(sources({ notifications: [paired], mentions: [mention] }));

    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Mariam mentioned you in Sprint planning');
    expect(items[0].unread).toBeTrue();
    expect(items[0].notifications.map(n => n.id)).toEqual(['p']);
  });

  it('finds the task of a mention made in a comment through its notification', () => {
    const mention = { id: 'm2', isRead: false, entityType: 'Comment', entityId: 'c9', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1' } as MentionDto;
    const paired = notification({ id: 'p', type: 'MentionedInTask', linkedEntityType: 'TaskItem', linkedEntityId: 't7', linkedCommentId: 'c9', triggeredByUserId: 'u1', createdAt: '2026-11-12T09:00:02Z' });

    const [item] = buildInbox(sources({ notifications: [paired], mentions: [mention] }));

    expect(item.kind).toBe('comment');
    expect(mentionTaskId(item)).toBe('t7');
  });

  it('keeps every notification about being mentioned on a task in that one item, dated by the newest', () => {
    const mention = { id: 'm3', isRead: true, entityType: 'Task', entityId: 't1', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1' } as MentionDto;
    const about = (id: string, createdAt: string, by = 'u1') =>
      notification({ id, type: 'MentionedInTask', linkedEntityType: 'TaskItem', linkedEntityId: 't1', triggeredByUserId: by, createdAt });

    const items = buildInbox(sources({
      notifications: [
        about('mentioned', '2026-11-12T09:00:00Z'), about('commented', '2026-11-12T09:00:01Z'),
        about('again', '2026-11-12T11:00:00Z'), about('someone-else', '2026-11-12T10:00:00Z', 'u2')
      ],
      mentions: [mention]
    }));

    expect(items.map(item => item.key)).toEqual(['m:m3', 'n:someone-else']);
    expect(items[0].notifications.map(n => n.id).sort()).toEqual(['again', 'commented', 'mentioned']);
    expect(items[0].at).toBe(new Date('2026-11-12T11:00:00Z').getTime());
    expect(items[0].unread).toBeTrue();
  });

  it('leaves out an invitation that was answered and has no notification left', () => {
    const answered = { id: 'e1', title: 'Old', startsAt: '2026-11-20T13:00:00Z', endsAt: '2026-11-20T14:00:00Z', recurrence: 'None', ownerId: 'u2', myResponse: 'Accepted', attendees: [], createdAt: '2026-11-01T08:00:00Z' } as unknown as EventDto;

    expect(buildInbox(sources({ invitations: [answered] }))).toEqual([]);
  });

  it('keeps a friend request unread until it has been opened in this browser', () => {
    const request = { id: 'f1', senderId: 'u3', senderName: 'Youssef Hany', receiverId: 'me', status: 'Pending', createdAt: '2026-11-12T07:00:00Z' } as FriendshipDto;

    expect(buildInbox(sources({ requests: [request] }))[0].unread).toBeTrue();
    expect(buildInbox(sources({ requests: [request], seen: new Set(['r:f1']) }))[0].unread).toBeFalse();
  });
});

describe('mentionDiscussion', () => {
  const reply = (fields: Partial<NotificationDto>) => notification({
    id: 'r', type: 'MentionedInTask', title: 'New reply', linkedEntityType: 'Group', linkedEntityId: 'g1', linkedCommentId: 'c5',
    triggeredByUserId: 'u1', triggeredByUserName: 'Omar Khaled',
    message: 'Omar Khaled replied to your comment in "Website": Yes, if the review is done by Thursday.',
    ...fields
  });

  it('finds the project and the comment of a reply in a discussion', () => {
    const [item] = buildInbox(sources({ notifications: [reply({})] }));

    expect(item.kind).toBe('mention');
    expect(tabOf(item)).toBe('mentions');
    expect(item.title).toBe('Omar Khaled replied to your comment in "Website": Yes, if the review is done by Thursday.');
    expect(mentionDiscussion(item)).toEqual({ projectId: 'g1', commentId: 'c5' });
    expect(mentionTaskId(item)).toBeNull();
  });

  it('finds them for a project mention through its notification', () => {
    const mention = { id: 'm9', isRead: false, entityType: 'Project', entityId: 'g1', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1', mentionedByUserName: 'Omar Khaled', entityName: 'Website' } as MentionDto;
    const paired = reply({ id: 'p', title: 'You were mentioned', message: 'Omar Khaled mentioned you in "Website".' });

    const [item] = buildInbox(sources({ notifications: [paired], mentions: [mention] }));

    expect(item.key).toBe('m:m9');
    expect(mentionDiscussion(item)).toEqual({ projectId: 'g1', commentId: 'c5' });
  });

  it('has nothing to open for a mention on a task, or a project mention with no comment', () => {
    const onTask = notification({ id: 't', type: 'MentionedInTask', linkedEntityType: 'TaskItem', linkedEntityId: 't1', linkedCommentId: 'c1' });
    const bare = { id: 'm8', isRead: false, entityType: 'Project', entityId: 'g1', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1' } as MentionDto;

    const items = buildInbox(sources({ notifications: [onTask], mentions: [bare] }));

    expect(items.map(item => mentionDiscussion(item))).toEqual([null, null]);
  });
});

describe('initialsOf and weekNumberOf', () => {
  it('uses two initials for a person and M for Miqat itself', () => {
    expect(initialsOf('Mariam Adel')).toBe('MA');
    expect(initialsOf('')).toBe('M');
  });

  it('numbers weeks the ISO way', () => {
    expect(weekNumberOf(2026, 11, 12)).toBe(46);
    expect(weekNumberOf(2026, 1, 1)).toBe(1);
  });
});

describe('notificationSentence', () => {
  /** Every wording the API sends with a notification today. */
  const sent = [
    'Sara Ali commented on "Design review": First draft is up — be brutal…',
    'Sara Ali replied to your comment in "Website": Yes, if the review is done by Thursday.',
    'Sara Ali mentioned you in "Design review".',
    'Sara Ali mentioned you in a project.',
    'Omar Khaled invited you to "Sprint review".',
    'Omar Khaled accepted the invitation to "Sam\'s birthday".',
    'Omar Khaled declined the invitation to "Sprint review".',
    'Omar Khaled may come to "Sprint review".',
    'Omar Khaled changed "Sprint review".',
    'Omar Khaled changed one date of "Stand-up".',
    'Omar Khaled cancelled one date of "Stand-up".',
    'Omar Khaled restored one date of "Stand-up".',
    'Omar Khaled cancelled "Sprint review".',
    'Youssef Hany sent you a friend request.',
    'Youssef Hany accepted your friend request.',
    'Sara Ali added you to "Mobile app".',
    'Mariam Adel assigned you "Prepare the launch checklist".',
    'Nour Samir assigned "Press kit" to you.',
    'Mariam Adel completed "Prepare the launch checklist".',
    '"Write the brief" is due now.',
    '"Write the brief" is due in 1 minute.',
    '"Write the brief" is due in 45 minutes.',
    '"Write the brief" is due in about an hour.',
    '"Write the brief" is due in about 3 hours.',
    '"Write the brief" is due in about a day.',
    '"Write the brief" is due in about 2 days.',
    '"Team stand-up" has started.',
    '"Team stand-up" starts now.',
    '"Team stand-up" starts in 10 minutes.',
    '"Team stand-up" starts in about an hour.',
    '"Team stand-up" starts in about 2 days.'
  ];

  it('leaves every sentence of the API as it came, in English', () => {
    for (const message of sent) expect(notificationSentence(notification({ message }))).toBe(message);
  });

  it('falls back to the title, then to a plain word', () => {
    expect(notificationSentence(notification({ title: 'Event invitation', message: '' }))).toBe('Event invitation');
    expect(notificationSentence(notification({}))).toBe('Notification');
  });
});

describe('the Inbox in Arabic', () => {
  beforeEach(() => {
    useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS, numerals: 'arab' });
    // t() keeps Latin names and titles in their own direction with invisible isolate
    // marks (U+2068, U+2069). The sentences below are compared without them.
    const plain = (text: string) => text.replace(/[⁨⁩]/g, '');
    jasmine.addCustomEqualityTester((a: unknown, b: unknown) =>
      typeof a === 'string' && typeof b === 'string' ? plain(a) === plain(b) : undefined);
  });
  afterEach(() => useLanguageForTests('en'));

  const say =(message: string) => notificationSentence(notification({ message }));

  it('says again what the API wrote, with the names and titles in place', () => {
    expect(say('Omar Khaled invited you to "Sprint review".')).toEqual('دعاك Omar Khaled إلى «Sprint review».');
    expect(say('مريم عادل assigned you "إعداد قائمة الإطلاق".')).toEqual('أسند إليك مريم عادل المهمة «إعداد قائمة الإطلاق».');
    expect(say('Sara Ali commented on "Design review": First draft is up')).toEqual('علّق Sara Ali على «Design review»: First draft is up');
    expect(say('Omar Khaled accepted the invitation to "Sam\'s birthday".')).toEqual('قبِل Omar Khaled الدعوة إلى «Sam\'s birthday».');
    expect(say('Omar Khaled cancelled one date of "Stand-up".')).toEqual('ألغى Omar Khaled أحد مواعيد «Stand-up».');
    expect(say('Youssef Hany sent you a friend request.')).toEqual('أرسل إليك Youssef Hany طلب صداقة.');
    expect(say('Sara Ali mentioned you in a project.')).toEqual('أشار إليك Sara Ali في مشروع.');
  });

  it('says a reply in a project discussion again, and names its title', () => {
    const reply = notification({
      type: 'MentionedInTask', title: 'New reply', linkedEntityType: 'Group', linkedEntityId: 'g1', linkedCommentId: 'c5',
      message: 'Omar Khaled replied to your comment in "Website": Yes, if the review is done by Thursday.'
    });

    expect(notificationSentence(reply)).toEqual('ردّ Omar Khaled على تعليقك في «Website»: Yes, if the review is done by Thursday.');
    expect(notificationHeading(reply)).toEqual('رد جديد');
    expect(notificationTopic(reply)).toEqual(jasmine.objectContaining({ kind: 'project', label: 'مشروع', name: 'Website' }));
  });

  it('counts what is left before a reminder the way Arabic counts', () => {
    expect(say('"Write the brief" is due in 1 minute.')).toEqual('تستحق «Write the brief» بعد دقيقة واحدة.');
    expect(say('"Write the brief" is due in 2 minutes.')).toEqual('تستحق «Write the brief» بعد دقيقتين.');
    expect(say('"Team stand-up" starts in 10 minutes.')).toEqual('يبدأ «Team stand-up» بعد ١٠ دقائق.');
    expect(say('"Team stand-up" starts in 45 minutes.')).toEqual('يبدأ «Team stand-up» بعد ٤٥ دقيقة.');
    expect(say('"Write the brief" is due in about an hour.')).toEqual('تستحق «Write the brief» بعد ساعة تقريبًا.');
    expect(say('"Write the brief" is due in about 3 days.')).toEqual('تستحق «Write the brief» بعد ٣ أيام تقريبًا.');
    expect(say('"Team stand-up" has started.')).toEqual('بدأ «Team stand-up».');
  });

  it('draws the numbers in the digits that were chosen', () => {
    useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS, numerals: 'latn' });
    expect(say('"Team stand-up" starts in 10 minutes.')).toEqual('يبدأ «Team stand-up» بعد 10 دقائق.');
  });

  it('shows a sentence it does not know as the API wrote it', () => {
    expect(say("Your task 'Launch email campaign' is due in 2 days")).toBe("Your task 'Launch email campaign' is due in 2 days");
  });

  it('still reads the name out of the English message', () => {
    const topic = notificationTopic(notification({
      type: 'EventResponse', linkedEntityType: 'Event',
      message: 'Ahmed Hassan accepted the invitation to "Sam\'s birthday".'
    }));

    expect(topic).toEqual(jasmine.objectContaining({ kind: 'event', label: 'حدث', name: "Sam's birthday" }));
  });

  it('names the tabs, the kinds and the updates', () => {
    expect(TABS.map(tab => tab.label)).toEqual(['الكل', 'الإشارات', 'الدعوات', 'الطلبات', 'التحديثات']);
    expect(KINDS.request.label).toEqual('طلب صداقة');
    expect(KINDS.update.glyph).toEqual('←');
    expect(notificationKind(notification({ type: 'TaskCompleted', linkedEntityType: 'TaskItem' })).label).toEqual('تحديث مهمة');
    expect(notificationKind(notification({ type: 'Reminder' })).label).toEqual('تذكير');
  });

  it('builds the titles of mentions, invitations, requests and the recap', () => {
    const mention = { id: 'm1', isRead: false, entityType: 'Task', entityId: 't1', createdAt: '2026-11-12T09:00:00Z', mentionedByUserId: 'u1', mentionedByUserName: 'مريم عادل', entityName: 'تخطيط السبرنت' } as MentionDto;
    const comment = { id: 'm2', isRead: false, entityType: 'Comment', entityId: 'c9', createdAt: '2026-11-12T08:30:00Z', mentionedByUserId: 'u1', mentionedByUserName: 'Mariam Adel' } as MentionDto;
    const invitation = { id: 'e1', title: 'مراجعة السبرنت', startsAt: '2026-11-15T13:00:00Z', endsAt: '2026-11-15T13:45:00Z', isAllDay: false, recurrence: 'None', ownerId: 'u2', ownerName: 'Omar Khaled', myResponse: 'Pending', attendees: [], createdAt: '2026-11-12T08:00:00Z' } as unknown as EventDto;
    const request = { id: 'f1', senderId: 'u3', senderName: 'Youssef Hany', receiverId: 'me', status: 'Pending', createdAt: '2026-11-12T07:00:00Z' } as FriendshipDto;
    const recap = { weekKey: '2026-11-01', weekNumber: 45, at: '2026-11-08T00:00:00Z' } as WeekRecap;

    const items = buildInbox(sources({ mentions: [mention, comment], invitations: [invitation], requests: [request], recap }));

    expect(items.map(item => item.title)).toEqual([
      'أشار إليك مريم في «تخطيط السبرنت»',
      'أشار إليك Mariam في تعليق',
      'دعاك Omar إلى «مراجعة السبرنت»',
      'يريد Youssef Hany التواصل معك',
      'مراجعة أسبوعك رقم ٤٥'
    ]);
    expect(items[0].snippet).toEqual('مهمة · تخطيط السبرنت');
    expect(items[0].label).toEqual('إشارة');
    expect(items[3].snippet).toEqual('طلب صداقة · أجب عنه هنا');
  });

  it('keeps two Arabic initials apart, and uses the first letter of ميقات for Miqat itself', () => {
    expect(initialsOf('مريم عادل')).toEqual('م‌ع');
    expect(initialsOf('')).toEqual('م');
    expect(initialsOf('Mariam Adel')).toEqual('MA');
  });
});
