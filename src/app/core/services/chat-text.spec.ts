import {
  ChatSummary, applyCallMembers, applyGroupChange, applyRead, chatTitle, countLabel, describeCall,
  describeGroupEvent, firstName, isInCall, isolate, previewText, readersOf, sameRun, seenLabel, typingLabel
} from './chat-text';
import { AR, AR_PLURALS } from '../i18n/ar';
import { missingTranslations, useLanguageForTests } from '../i18n/i18n';
import type { ChatMessageEvent, ChatParticipant, GroupCall } from './realtime.service';

const ME = 'me';
const SARA = { id: 'sara', fullName: 'Sara Ali' };
const OMAR = { id: 'omar', fullName: 'Omar Zaki' };

function message(change: Partial<ChatMessageEvent> = {}): ChatMessageEvent {
  return {
    id: 'm1', conversationId: 'c1', senderId: SARA.id, sender: SARA, body: 'Hello',
    createdAt: '2026-11-13T10:00:00Z', ...change
  };
}

function person(id: string, fullName: string, change: Partial<ChatParticipant> = {}): ChatParticipant {
  return { id, fullName, isAdmin: false, joinedAt: '2026-11-01T00:00:00Z', ...change };
}

function group(change: Partial<ChatSummary> = {}): ChatSummary {
  return {
    isGroup: true, name: 'Trip', isAdmin: false,
    friend: { id: 'c1', fullName: 'Trip' },
    participants: [person(ME, 'Me Myself', { isAdmin: true }), person('sara', 'Sara Ali'), person('omar', 'Omar Zaki')],
    ...change
  };
}

function call(ids: string[]): GroupCall {
  return {
    callId: 'call1', conversationId: 'c1', video: true, startedByUserId: ids[0], startedAt: '2026-11-13T10:00:00Z',
    participants: ids.map(id => ({ id, fullName: id, joinedAt: '2026-11-13T10:00:00Z' }))
  };
}

describe('chat text', () => {
  describe('names', () => {
    it('takes the first word of a name', () => {
      expect(firstName('Sara Ali')).toBe('Sara');
      expect(firstName('  Omar  ')).toBe('Omar');
    });

    it('has a word for a missing name', () => {
      expect(firstName('')).toBe('Someone');
      expect(firstName(undefined)).toBe('Someone');
    });

    it('titles a group by its name and a chat between two by the friend', () => {
      expect(chatTitle(group())).toBe('Trip');
      expect(chatTitle({ friend: { id: 'sara', fullName: 'Sara Ali' } })).toBe('Sara Ali');
    });

    it('falls back to the stand-in when a group has no name yet', () => {
      expect(chatTitle(group({ name: null }))).toBe('Trip');
    });

    it('counts in the singular and the plural', () => {
      expect(countLabel(1, 'member', 'members')).toBe('1 member');
      expect(countLabel(5, 'member', 'members')).toBe('5 members');
    });
  });

  describe('describeCall', () => {
    it('keeps the wording of a call between two', () => {
      expect(describeCall(message({ callOutcome: 'Completed', callVideo: true, callSeconds: 125 }), true)).toBe('Video call · 2:05');
      expect(describeCall(message({ callOutcome: 'Missed', callVideo: false }), true)).toBe('Voice call · no answer');
      expect(describeCall(message({ callOutcome: 'Missed', callVideo: false }), false)).toBe('Missed voice call');
      expect(describeCall(message({ callOutcome: 'Declined', callVideo: true }), false)).toBe('Video call declined');
    });

    it('adds how many took part to a group call', () => {
      const line = message({ callOutcome: 'Completed', callVideo: true, callSeconds: 65, callParticipants: 3 });
      expect(describeCall(line, false)).toBe('Video call · 1:05 · 3 people');
    });

    it('says nobody joined to the starter of a missed group call, and "missed" to the others', () => {
      const line = message({ callOutcome: 'Missed', callVideo: false, callSeconds: 0, callParticipants: 1 });
      expect(describeCall(line, true)).toBe('Voice call · no one joined');
      expect(describeCall(line, false)).toBe('Missed voice call');
    });
  });

  describe('describeGroupEvent', () => {
    it('says each kind of change with first names', () => {
      expect(describeGroupEvent(message({ groupEvent: 'Created', groupName: 'Trip' }), ME)).toBe('Sara created the group “Trip”');
      expect(describeGroupEvent(message({ groupEvent: 'MemberAdded', targetUser: OMAR }), ME)).toBe('Sara added Omar');
      expect(describeGroupEvent(message({ groupEvent: 'MemberRemoved', targetUser: OMAR }), ME)).toBe('Sara removed Omar');
      expect(describeGroupEvent(message({ groupEvent: 'MemberLeft' }), ME)).toBe('Sara left the group');
      expect(describeGroupEvent(message({ groupEvent: 'Renamed', groupName: 'Trip 2027' }), ME)).toBe('Sara renamed the group to “Trip 2027”');
    });

    it('says "You" for what the reader did and "you" for what was done to them', () => {
      expect(describeGroupEvent(message({ senderId: ME, groupEvent: 'MemberAdded', targetUser: OMAR }), ME)).toBe('You added Omar');
      expect(describeGroupEvent(message({ groupEvent: 'MemberAdded', targetUser: { id: ME, fullName: 'Me Myself' } }), ME))
        .toBe('Sara added you');
    });

    it('uses the server sentence for a kind it does not know', () => {
      const unknown = message({ groupEvent: 'Archived' as never, body: 'Sara Ali archived the group' });
      expect(describeGroupEvent(unknown, ME)).toBe('Sara Ali archived the group');
    });
  });

  describe('previewText', () => {
    it('is empty without a message', () => {
      expect(previewText(group(), ME)).toBe('');
    });

    it('names the writer in a group, and not in a chat between two', () => {
      expect(previewText(group({ lastMessage: message() }), ME)).toBe('Sara: Hello');
      expect(previewText({ friend: SARA, lastMessage: message() }, ME)).toBe('Hello');
    });

    it('says "You" for an own message', () => {
      expect(previewText(group({ lastMessage: message({ senderId: ME }) }), ME)).toBe('You: Hello');
    });

    it('shows a deleted message as deleted', () => {
      expect(previewText(group({ lastMessage: message({ isDeleted: true, body: '' }) }), ME)).toBe('Sara: Message deleted');
    });

    it('describes a line about the group and a call', () => {
      expect(previewText(group({ lastMessage: message({ groupEvent: 'MemberLeft' }) }), ME)).toBe('Sara left the group');
      expect(previewText(group({ lastMessage: message({ callOutcome: 'Missed', callVideo: true, callParticipants: 1 }) }), ME))
        .toBe('Missed video call');
    });
  });

  describe('sameRun', () => {
    const gap = 5 * 60 * 1000;

    it('joins messages of one person that are close in time', () => {
      expect(sameRun(message(), message({ id: 'm2', createdAt: '2026-11-13T10:02:00Z' }), gap)).toBeTrue();
    });

    it('breaks on another writer, a long pause, or nothing on one side', () => {
      expect(sameRun(message(), message({ senderId: OMAR.id }), gap)).toBeFalse();
      expect(sameRun(message(), message({ createdAt: '2026-11-13T10:06:00Z' }), gap)).toBeFalse();
      expect(sameRun(undefined, message(), gap)).toBeFalse();
      expect(sameRun(message(), undefined, gap)).toBeFalse();
    });

    it('never joins a line about the group or a call', () => {
      expect(sameRun(message({ groupEvent: 'MemberLeft' }), message(), gap)).toBeFalse();
      expect(sameRun(message(), message({ callOutcome: 'Completed' }), gap)).toBeFalse();
    });
  });

  describe('typingLabel', () => {
    it('is empty when nobody types', () => {
      expect(typingLabel([])).toBe('');
    });

    it('names one person and counts several', () => {
      expect(typingLabel(['Omar Zaki'])).toBe('Omar is typing…');
      expect(typingLabel(['Omar Zaki', 'Sara Ali'])).toBe('2 people are typing…');
    });
  });

  describe('read marks', () => {
    const sentAt = '2026-11-13T10:00:00Z';
    const people = [
      person(ME, 'Me Myself', { lastReadAt: '2026-11-13T11:00:00Z' }),
      person('sara', 'Sara Ali', { lastReadAt: '2026-11-13T10:00:00Z' }),
      person('omar', 'Omar Zaki', { lastReadAt: '2026-11-13T09:00:00Z' }),
      person('lina', 'Lina Noor', { lastReadAt: null })
    ];

    it('lists the others who have read up to a message, never the reader', () => {
      expect(readersOf(people, ME, sentAt)).toEqual(['Sara Ali']);
    });

    it('says "Sent" until someone has read it', () => {
      expect(seenLabel([], 3)).toBe('Sent');
    });

    it('names up to two readers and counts more', () => {
      expect(seenLabel(['Sara Ali'], 3)).toBe('Seen by Sara');
      expect(seenLabel(['Sara Ali', 'Omar Zaki'], 3)).toBe('Seen by Sara and Omar');
      expect(seenLabel(['Sara Ali', 'Omar Zaki', 'Lina Noor'], 5)).toBe('Seen by 3 people');
    });

    it('says everyone once all the others have read it', () => {
      expect(seenLabel(['Sara Ali', 'Omar Zaki'], 2)).toBe('Seen by everyone');
      expect(seenLabel(['Sara Ali'], 1)).toBe('Seen');
    });

    it('puts a live read mark on its person only', () => {
      const marked = applyRead(group(), 'sara', '2026-11-13T12:00:00Z');
      expect(marked.participants?.find(p => p.id === 'sara')?.lastReadAt).toBe('2026-11-13T12:00:00Z');
      expect(marked.participants?.find(p => p.id === 'omar')?.lastReadAt).toBeUndefined();
    });

    it('leaves a chat without a people list as it is', () => {
      const direct: ChatSummary = { friend: SARA };
      expect(applyRead(direct, 'sara', sentAt)).toBe(direct);
    });
  });

  describe('applyGroupChange', () => {
    const change = {
      conversationId: 'c1', name: 'Trip 2027', createdByUserId: 'sara',
      participants: [person('sara', 'Sara Ali', { isAdmin: true }), person(ME, 'Me Myself')]
    };

    it('takes the new name and people, also on the stand-in', () => {
      const next = applyGroupChange(group(), change, ME);
      expect(next.name).toBe('Trip 2027');
      expect(next.friend.fullName).toBe('Trip 2027');
      expect(next.participants?.map(p => p.id)).toEqual(['sara', ME]);
    });

    it('follows the admin role of the reader', () => {
      expect(applyGroupChange(group({ isAdmin: true }), change, ME).isAdmin).toBeFalse();

      const promoted = { ...change, participants: [person(ME, 'Me Myself', { isAdmin: true })] };
      expect(applyGroupChange(group(), promoted, ME).isAdmin).toBeTrue();
    });

    it('keeps what the event does not carry', () => {
      const last = message();
      expect(applyGroupChange(group({ lastMessage: last }), change, ME).lastMessage).toBe(last);
    });
  });

  describe('the call of a group', () => {
    const event = {
      callId: 'call1', conversationId: 'c1', userId: 'omar',
      participants: call(['sara', 'omar']).participants
    };

    it('takes the new list of people for the call it knows', () => {
      expect(applyCallMembers(call(['sara']), event)?.participants.map(p => p.id)).toEqual(['sara', 'omar']);
    });

    it('answers null for a call it does not know, so the caller asks the server', () => {
      expect(applyCallMembers(null, event)).toBeNull();
      expect(applyCallMembers({ ...call(['sara']), callId: 'other' }, event)).toBeNull();
    });

    it('knows whether a person is in the call', () => {
      expect(isInCall(group({ activeCall: call(['sara', ME]) }), ME)).toBeTrue();
      expect(isInCall(group({ activeCall: call(['sara']) }), ME)).toBeFalse();
      expect(isInCall(group(), ME)).toBeFalse();
      expect(isInCall(undefined, ME)).toBeFalse();
    });
  });

  describe('in English', () => {
    it('leaves names as they are', () => {
      expect(isolate('Trip 2027!')).toBe('Trip 2027!');
      expect(describeGroupEvent(message({ groupEvent: 'MemberLeft' }), ME)).toBe('Sara left the group');
    });
  });

  describe('in Arabic', () => {
    // The marks that keep a name in its own direction inside an Arabic sentence.
    const START = String.fromCharCode(0x2068);
    const END = String.fromCharCode(0x2069);
    const bare = (text: string) => text.split(START).join('').split(END).join('');
    const arabic = (numerals: 'arab' | 'latn' = 'arab') =>
      useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS, numerals });

    beforeEach(() => arabic());
    afterEach(() => useLanguageForTests('en'));

    it('keeps a name in its own direction', () => {
      expect(isolate('Trip 2027!')).toBe(START + 'Trip 2027!' + END);
      expect(isolate('')).toBe('');
      expect(describeGroupEvent(message({ groupEvent: 'MemberLeft' }), ME)).toBe(`غادر ${START}Sara${END} المجموعة`);
    });

    it('says what the reader did, what was done to them and what others did as three sentences', () => {
      const added = (change: Partial<ChatMessageEvent>) => bare(describeGroupEvent(message({ groupEvent: 'MemberAdded', ...change }), ME));
      expect(added({ senderId: ME, targetUser: OMAR })).toBe('أنت أضفت Omar');
      expect(added({ targetUser: { id: ME, fullName: 'Me Myself' } })).toBe('تمت إضافتك بواسطة Sara');
      expect(added({ targetUser: OMAR })).toBe('تمت إضافة Omar بواسطة Sara');

      const removed = (change: Partial<ChatMessageEvent>) => bare(describeGroupEvent(message({ groupEvent: 'MemberRemoved', ...change }), ME));
      expect(removed({ senderId: ME, targetUser: OMAR })).toBe('أنت أزلت Omar');
      expect(removed({ targetUser: { id: ME, fullName: 'Me Myself' } })).toBe('تمت إزالتك بواسطة Sara');
      expect(removed({ targetUser: OMAR })).toBe('تمت إزالة Omar بواسطة Sara');
    });

    it('says the other changes of a group', () => {
      const said = (change: Partial<ChatMessageEvent>) => bare(describeGroupEvent(message(change), ME));
      expect(said({ groupEvent: 'Created', groupName: 'Trip' })).toBe('تم إنشاء المجموعة «Trip» بواسطة Sara');
      expect(said({ senderId: ME, groupEvent: 'Created', groupName: 'Trip' })).toBe('أنت أنشأت المجموعة «Trip»');
      expect(said({ senderId: ME, groupEvent: 'MemberLeft' })).toBe('أنت غادرت المجموعة');
      expect(said({ groupEvent: 'Renamed', groupName: 'Trip 2027' })).toBe('تم تغيير اسم المجموعة إلى «Trip 2027» بواسطة Sara');
      expect(said({ senderId: ME, groupEvent: 'Renamed', groupName: 'Trip 2027' })).toBe('أنت غيّرت اسم المجموعة إلى «Trip 2027»');
    });

    it('draws the length of a call in the chosen digits', () => {
      const line = message({ callOutcome: 'Completed', callVideo: true, callSeconds: 125 });
      expect(describeCall(line, true)).toBe('مكالمة فيديو · ٢:٠٥');

      arabic('latn');
      expect(describeCall(line, true)).toBe('مكالمة فيديو · 2:05');
    });

    it('counts the people of a group call the Arabic way', () => {
      const call = (people: number) => describeCall(message({ callOutcome: 'Completed', callSeconds: 65, callParticipants: people }), false);
      expect(call(2)).toBe('مكالمة صوتية · ١:٠٥ · شخصان');
      expect(call(3)).toBe('مكالمة صوتية · ١:٠٥ · ٣ أشخاص');
      expect(call(11)).toBe('مكالمة صوتية · ١:٠٥ · ١١ شخصًا');
    });

    it('says the other outcomes of a call', () => {
      expect(describeCall(message({ callOutcome: 'Missed', callVideo: false }), true)).toBe('مكالمة صوتية · بلا رد');
      expect(describeCall(message({ callOutcome: 'Missed', callVideo: true }), false)).toBe('مكالمة فيديو فائتة');
      expect(describeCall(message({ callOutcome: 'Declined', callVideo: true }), false)).toBe('مكالمة فيديو مرفوضة');
      expect(describeCall(message({ callOutcome: 'Missed', callVideo: true, callParticipants: 1 }), true)).toBe('مكالمة فيديو · لم ينضم أحد');
    });

    it('counts members and people with the Arabic forms', () => {
      expect(countLabel(1, 'member', 'members')).toBe('عضو واحد');
      expect(countLabel(2, 'member', 'members')).toBe('عضوان');
      expect(countLabel(5, 'member', 'members')).toBe('٥ أعضاء');
      expect(countLabel(3, 'person', 'people')).toBe('٣ أشخاص');
    });

    it('says who is typing and who has seen a message', () => {
      expect(bare(typingLabel(['Omar Zaki']))).toBe('Omar يكتب…');
      expect(typingLabel(['Omar Zaki', 'Sara Ali'])).toBe('شخصان يكتبان…');
      expect(typingLabel(['Omar Zaki', 'Sara Ali', 'Lina Noor'])).toBe('٣ أشخاص يكتبون…');

      expect(seenLabel([], 3)).toBe('تم الإرسال');
      expect(bare(seenLabel(['Sara Ali'], 3))).toBe('تمت المشاهدة بواسطة Sara');
      expect(bare(seenLabel(['Sara Ali', 'Omar Zaki'], 3))).toBe('تمت المشاهدة بواسطة Sara وOmar');
      expect(seenLabel(['Sara Ali', 'Omar Zaki', 'Lina Noor'], 5)).toBe('تمت المشاهدة بواسطة ٣ أشخاص');
      expect(seenLabel(['Sara Ali', 'Omar Zaki'], 2)).toBe('شاهدها الجميع');
    });

    it('names the writer of the newest message', () => {
      expect(bare(previewText(group({ lastMessage: message({ senderId: ME }) }), ME))).toBe('أنت: Hello');
      expect(bare(previewText(group({ lastMessage: message() }), ME))).toBe('Sara: Hello');
      expect(previewText({ friend: SARA, lastMessage: message() }, ME)).toBe('Hello');
      expect(bare(previewText(group({ lastMessage: message({ isDeleted: true, body: '' }) }), ME))).toBe('Sara: تم حذف هذه الرسالة');
    });

    it('has a word for a missing name', () => {
      expect(firstName('')).toBe('شخص ما');
    });

    it('has Arabic for every sentence these functions say', () => {
      const lines: ChatMessageEvent[] = [];
      for (const groupEvent of ['Created', 'MemberAdded', 'MemberRemoved', 'MemberLeft', 'Renamed'] as const) {
        lines.push(message({ groupEvent, groupName: 'Trip', targetUser: OMAR }));
        lines.push(message({ groupEvent, groupName: 'Trip', targetUser: OMAR, senderId: ME }));
        lines.push(message({ groupEvent, groupName: 'Trip', targetUser: { id: ME, fullName: 'Me Myself' } }));
      }
      for (const callOutcome of ['Completed', 'Missed', 'Declined'] as const) {
        for (const callVideo of [true, false]) {
          lines.push(message({ callOutcome, callVideo, callSeconds: 65 }));
          lines.push(message({ callOutcome, callVideo, callSeconds: 65, callParticipants: 3 }));
        }
      }

      for (const line of lines) {
        for (const reader of [ME, SARA.id]) {
          previewText(group({ lastMessage: line }), reader);
        }
      }
      previewText(group({ lastMessage: message({ isDeleted: true }) }), ME);
      firstName(undefined);
      for (let people = 0; people <= 12; people++) {
        countLabel(people, 'member', 'members');
        countLabel(people, 'person', 'people');
        typingLabel(Array.from({ length: people }, () => 'Sara Ali'));
        seenLabel(Array.from({ length: people }, () => 'Sara Ali'), 20);
        seenLabel(Array.from({ length: people }, () => 'Sara Ali'), people);
      }

      expect(missingTranslations()).toEqual([]);
    });
  });
});
