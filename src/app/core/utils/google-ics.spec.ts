import { GoogleEvent, escapeText, foldLine, googleEventsToIcs, plainText } from './google-ics';

const NOW = new Date('2026-11-13T10:00:00Z');

/** The entries of every file, each as its unfolded lines between BEGIN:VEVENT and END:VEVENT. */
function entriesOf(events: GoogleEvent[]): string[][] {
  const entries: string[][] = [];
  for (const file of googleEventsToIcs(events, { now: NOW }).files) {
    const lines = file.replace(/\r\n /g, '').split('\r\n');
    let current: string[] | null = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') current = [];
      else if (line === 'END:VEVENT') { entries.push(current!); current = null; }
      else if (current) current.push(line);
    }
  }
  return entries;
}

/** The value of the first line with this name ("DTSTART" also finds "DTSTART;VALUE=DATE"). */
function valueOf(entry: string[], name: string): string | undefined {
  const line = entry.find(candidate => candidate.startsWith(name + ':') || candidate.startsWith(name + ';'));
  return line?.slice(line.indexOf(':') + 1);
}

function linesOf(entry: string[], name: string): string[] {
  return entry.filter(candidate => candidate.startsWith(name + ':') || candidate.startsWith(name + ';'));
}

function timed(id: string, start: string, end: string, more: Partial<GoogleEvent> = {}): GoogleEvent {
  return { id, summary: id, start: { dateTime: start }, end: { dateTime: end }, ...more };
}

describe('googleEventsToIcs', () => {
  describe('all-day events', () => {
    it('keeps the dates, with the end on the day after the last one as Google has it', () => {
      const [entry] = entriesOf([
        { id: 'trip', summary: 'Trip', start: { date: '2026-11-18' }, end: { date: '2026-11-20' } }
      ]);

      expect(entry).toContain('DTSTART;VALUE=DATE:20261118');
      expect(entry).toContain('DTEND;VALUE=DATE:20261120');
    });

    it('writes one day when Google gives no later end', () => {
      const [entry] = entriesOf([{ id: 'day', summary: 'Day', start: { date: '2026-11-18' }, end: { date: '2026-11-18' } }]);

      expect(entry).toContain('DTSTART;VALUE=DATE:20261118');
      expect(valueOf(entry, 'DTEND')).toBeUndefined();
    });
  });

  describe('timed events', () => {
    it('writes a time with an offset as the same moment in UTC', () => {
      const [entry] = entriesOf([timed('call', '2026-11-16T09:00:00+02:00', '2026-11-16T10:30:00+02:00')]);

      expect(entry).toContain('DTSTART:20261116T070000Z');
      expect(entry).toContain('DTEND:20261116T083000Z');
    });

    it('keeps the moment when the event names a zone other than the one its time is written in', () => {
      const [entry] = entriesOf([{
        id: 'berlin', summary: 'Berlin',
        start: { dateTime: '2026-11-17T10:00:00+02:00', timeZone: 'Europe/Berlin' },
        end: { dateTime: '2026-11-17T11:00:00+02:00', timeZone: 'Europe/Berlin' }
      }]);

      expect(entry).toContain('DTSTART:20261117T080000Z');
      expect(entry).toContain('DTEND:20261117T090000Z');
    });

    it('reads a time without an offset in the zone the event names', () => {
      const [entry] = entriesOf([{
        id: 'ny', summary: 'New York',
        start: { dateTime: '2026-11-16T09:00:00', timeZone: 'America/New_York' },
        end: { dateTime: '2026-11-16T09:45:00', timeZone: 'America/New_York' }
      }]);

      expect(entry).toContain('DTSTART:20261116T140000Z');
      expect(entry).toContain('DTEND:20261116T144500Z');
    });

    it('writes a time with neither offset nor zone without one, for the import to read in the user’s zone', () => {
      const [entry] = entriesOf([timed('floating', '2026-11-16T09:00:00', '2026-11-16T10:00:00')]);

      expect(entry).toContain('DTSTART:20261116T090000');
      expect(entry).toContain('DTEND:20261116T100000');
    });

    it('leaves the end out when it is missing or not after the start', () => {
      const [entry] = entriesOf([timed('point', '2026-11-16T09:00:00Z', '2026-11-16T09:00:00Z')]);

      expect(entry).toContain('DTSTART:20261116T090000Z');
      expect(valueOf(entry, 'DTEND')).toBeUndefined();
    });
  });

  describe('what an entry carries', () => {
    it('uses Google’s iCalendar UID, and the event id when there is none', () => {
      const entries = entriesOf([
        timed('abc', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { iCalUID: 'abc-from-outlook' }),
        timed('def', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z')
      ]);

      expect(valueOf(entries[0], 'UID')).toBe('abc-from-outlook');
      expect(valueOf(entries[1], 'UID')).toBe('def@google.com');
    });

    it('keeps a UID on one line, so an invitation cannot write entries of its own', () => {
      const result = googleEventsToIcs([
        timed('a', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', {
          iCalUID: 'x\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:planted', summary: 'One\nEND:VEVENT'
        })
      ], { now: NOW });

      expect(result.files[0].split('\r\n').filter(line => line === 'BEGIN:VEVENT').length).toBe(1);
      expect(result.files[0]).toContain('UID:x END:VEVENT BEGIN:VEVENT UID:planted\r\n');
      expect(result.files[0]).toContain('SUMMARY:One\\nEND:VEVENT\r\n');
    });

    it('carries title, place and description, and stamps the entry', () => {
      const [entry] = entriesOf([timed('a', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', {
        summary: '  Design review ', location: 'Room 4', description: 'Bring the mock-ups'
      })]);

      expect(entry).toContain('SUMMARY:Design review');
      expect(entry).toContain('LOCATION:Room 4');
      expect(entry).toContain('DESCRIPTION:Bring the mock-ups');
      expect(entry).toContain('DTSTAMP:20261113T100000Z');
    });

    it('names an event without a title', () => {
      const entries = entriesOf([
        timed('a', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { summary: undefined }),
        timed('b', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { summary: '   ' })
      ]);

      expect(valueOf(entries[0], 'SUMMARY')).toBe('(No title)');
      expect(valueOf(entries[1], 'SUMMARY')).toBe('(No title)');
    });

    it('uses the Google Meet address as the place when the event has no other', () => {
      const entries = entriesOf([
        timed('a', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { hangoutLink: 'https://meet.google.com/abc-defg-hij' }),
        timed('b', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { location: 'Room 4', hangoutLink: 'https://meet.google.com/abc-defg-hij' })
      ]);

      expect(valueOf(entries[0], 'LOCATION')).toBe('https://meet.google.com/abc-defg-hij');
      expect(valueOf(entries[1], 'LOCATION')).toBe('Room 4');
    });

    it('turns the description’s HTML into plain text', () => {
      const [entry] = entriesOf([timed('a', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', {
        description: 'Agenda:<br><ul><li>Budget &amp; plan</li><li><a href="https://example.org/doc">Notes</a></li></ul>'
      })]);

      expect(valueOf(entry, 'DESCRIPTION')).toBe('Agenda:\\n• Budget & plan\\n• Notes (https://example.org/doc)');
    });
  });

  describe('events that are left out', () => {
    it('skips cancelled events, working-location markers and events without a start', () => {
      const result = googleEventsToIcs([
        timed('gone', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { status: 'cancelled' }),
        { id: 'office', summary: 'Office', eventType: 'workingLocation', start: { date: '2026-11-16' }, end: { date: '2026-11-17' } },
        { id: 'broken', summary: 'No start' },
        timed('kept', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z')
      ], { now: NOW });

      expect(result.written).toBe(1);
      expect(result.leftOut).toBe(3);
      expect(result.files.length).toBe(1);
      expect(result.files[0]).toContain('UID:kept@google.com');
      expect(result.files[0]).not.toContain('gone');
    });

    it('gives no file when nothing is left', () => {
      const result = googleEventsToIcs([timed('gone', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z', { status: 'cancelled' })], { now: NOW });

      expect(result.files).toEqual([]);
      expect(result.written).toBe(0);
    });
  });

  describe('repeating events', () => {
    it('keeps frequency, interval and end of a rule', () => {
      const entries = entriesOf([
        timed('weekly', '2026-11-02T08:00:00Z', '2026-11-02T08:30:00Z', { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T215959Z'] }),
        timed('daily', '2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z', { recurrence: ['RRULE:FREQ=DAILY;INTERVAL=2;COUNT=5'] }),
        { id: 'yearly', summary: 'Birthday', start: { date: '2026-11-05' }, end: { date: '2026-11-06' }, recurrence: ['RRULE:FREQ=YEARLY'] },
        timed('monthly', '2026-11-15T10:00:00Z', '2026-11-15T11:00:00Z', { recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'] })
      ]);

      expect(valueOf(entries[0], 'RRULE')).toBe('FREQ=WEEKLY;INTERVAL=1;UNTIL=20261231T215959Z');
      expect(valueOf(entries[1], 'RRULE')).toBe('FREQ=DAILY;INTERVAL=2;COUNT=5');
      expect(valueOf(entries[2], 'RRULE')).toBe('FREQ=YEARLY;INTERVAL=1');
      expect(valueOf(entries[3], 'RRULE')).toBe('FREQ=MONTHLY;INTERVAL=1');
      expect(googleEventsToIcs([
        timed('monthly', '2026-11-15T10:00:00Z', '2026-11-15T11:00:00Z', { recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'] })
      ], { now: NOW }).simplified).toEqual([]);
    });

    it('writes the rule’s own skipped dates: dates as dates, times in UTC', () => {
      const entries = entriesOf([
        timed('weekly', '2026-11-02T10:00:00+02:00', '2026-11-02T10:30:00+02:00', {
          recurrence: [
            'RRULE:FREQ=WEEKLY',
            'EXDATE;TZID=Africa/Cairo:20261109T100000,20261116T100000',
            'EXDATE:20261123T080000Z'
          ]
        }),
        {
          id: 'days', summary: 'Days', start: { date: '2026-11-02' }, end: { date: '2026-11-03' },
          recurrence: ['RRULE:FREQ=DAILY', 'EXDATE;VALUE=DATE:20261104']
        }
      ]);

      expect(linesOf(entries[0], 'EXDATE')).toEqual([
        'EXDATE:20261109T080000Z', 'EXDATE:20261116T080000Z', 'EXDATE:20261123T080000Z'
      ]);
      expect(linesOf(entries[1], 'EXDATE')).toEqual(['EXDATE;VALUE=DATE:20261104']);
    });

    it('makes a deleted date of a series a skipped date, not an event', () => {
      const result = googleEventsToIcs([
        timed('standup', '2026-11-02T08:00:00Z', '2026-11-02T08:15:00Z', { recurrence: ['RRULE:FREQ=WEEKLY'] }),
        {
          id: 'standup_20261109T080000Z', status: 'cancelled', recurringEventId: 'standup',
          originalStartTime: { dateTime: '2026-11-09T10:00:00+02:00', timeZone: 'Africa/Cairo' }
        }
      ], { now: NOW });
      const [entry] = entriesOf([
        timed('standup', '2026-11-02T08:00:00Z', '2026-11-02T08:15:00Z', { recurrence: ['RRULE:FREQ=WEEKLY'] }),
        {
          id: 'standup_20261109T080000Z', status: 'cancelled', recurringEventId: 'standup',
          originalStartTime: { dateTime: '2026-11-09T10:00:00+02:00', timeZone: 'Africa/Cairo' }
        }
      ]);

      expect(result.written).toBe(1);
      expect(result.leftOut).toBe(0);
      expect(linesOf(entry, 'EXDATE')).toEqual(['EXDATE:20261109T080000Z']);
    });

    it('makes a changed date of a series a skipped date plus an event of its own', () => {
      const entries = entriesOf([
        timed('standup', '2026-11-02T08:00:00Z', '2026-11-02T08:15:00Z', { recurrence: ['RRULE:FREQ=WEEKLY'], iCalUID: 'standup@google.com' }),
        timed('standup_20261116T080000Z', '2026-11-16T12:00:00Z', '2026-11-16T12:15:00Z', {
          summary: 'Stand-up (moved)', recurringEventId: 'standup', iCalUID: 'standup@google.com',
          originalStartTime: { dateTime: '2026-11-16T08:00:00Z' }
        })
      ]);

      expect(entries.length).toBe(2);
      expect(valueOf(entries[0], 'UID')).toBe('standup@google.com');
      expect(linesOf(entries[0], 'EXDATE')).toEqual(['EXDATE:20261116T080000Z']);

      expect(valueOf(entries[1], 'UID')).toBe('standup_20261116T080000Z@google.com');
      expect(entries[1]).toContain('DTSTART:20261116T120000Z');
      expect(entries[1]).toContain('SUMMARY:Stand-up (moved)');
      expect(valueOf(entries[1], 'RRULE')).toBeUndefined();
      expect(valueOf(entries[1], 'RECURRENCE-ID')).toBeUndefined();
    });

    it('skips a changed date of an all-day series by its date', () => {
      const entries = entriesOf([
        { id: 'shift', summary: 'Shift', start: { date: '2026-11-02' }, end: { date: '2026-11-03' }, recurrence: ['RRULE:FREQ=WEEKLY'] },
        {
          id: 'shift_20261109', summary: 'Shift', recurringEventId: 'shift', originalStartTime: { date: '2026-11-09' },
          start: { date: '2026-11-10' }, end: { date: '2026-11-11' }
        }
      ]);

      expect(linesOf(entries[0], 'EXDATE')).toEqual(['EXDATE;VALUE=DATE:20261109']);
      expect(entries[1]).toContain('DTSTART;VALUE=DATE:20261110');
    });

    it('names an event whose rule Miqat cannot follow, and keeps its frequency', () => {
      const events = [
        timed('second-tuesday', '2026-11-10T09:00:00Z', '2026-11-10T10:00:00Z', { recurrence: ['RRULE:FREQ=MONTHLY;BYDAY=2TU'] }),
        timed('last-day', '2026-11-30T09:00:00Z', '2026-11-30T10:00:00Z', { recurrence: ['RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'] }),
        timed('hourly', '2026-11-10T09:00:00Z', '2026-11-10T09:10:00Z', { recurrence: ['RRULE:FREQ=HOURLY'] }),
        timed('extra-dates', '2026-11-10T09:00:00Z', '2026-11-10T10:00:00Z', { recurrence: ['RRULE:FREQ=WEEKLY', 'RDATE:20261112T090000Z'] })
      ];
      const entries = entriesOf(events);

      expect(googleEventsToIcs(events, { now: NOW }).simplified).toEqual(['second-tuesday', 'last-day', 'hourly', 'extra-dates']);
      expect(valueOf(entries[0], 'RRULE')).toBe('FREQ=MONTHLY;INTERVAL=1');
      expect(valueOf(entries[1], 'RRULE')).toBe('FREQ=MONTHLY;INTERVAL=1');
      expect(valueOf(entries[2], 'RRULE')).toBeUndefined();
      expect(valueOf(entries[3], 'RRULE')).toBe('FREQ=WEEKLY;INTERVAL=1');
    });
  });

  describe('a weekly event on several weekdays', () => {
    // Monday 2 November 2026, 09:00 in Cairo.
    const gym = (rule: string) => timed('gym', '2026-11-02T09:00:00+02:00', '2026-11-02T10:00:00+02:00', {
      summary: 'Gym', iCalUID: 'gym@google.com', recurrence: [rule]
    });

    it('becomes one weekly series per weekday, each from its own first date', () => {
      const events = [gym('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')];
      const entries = entriesOf(events);

      expect(entries.map(entry => valueOf(entry, 'UID'))).toEqual(['gym@google.com', 'gym@google.com#WE', 'gym@google.com#FR']);
      expect(entries.map(entry => valueOf(entry, 'DTSTART'))).toEqual(['20261102T070000Z', '20261104T070000Z', '20261106T070000Z']);
      expect(entries.map(entry => valueOf(entry, 'DTEND'))).toEqual(['20261102T080000Z', '20261104T080000Z', '20261106T080000Z']);
      expect(entries.every(entry => valueOf(entry, 'RRULE') === 'FREQ=WEEKLY;INTERVAL=1')).toBeTrue();
      expect(googleEventsToIcs(events, { now: NOW }).split).toEqual(['Gym']);
    });

    it('turns "N times" into the date of the Nth one', () => {
      // Mon 2, Wed 4, Fri 6, Mon 9, Wed 11: the fifth date is Wednesday 11 November.
      const entries = entriesOf([gym('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5')]);

      expect(entries.every(entry => valueOf(entry, 'RRULE') === 'FREQ=WEEKLY;INTERVAL=1;UNTIL=20261111T070000Z')).toBeTrue();
    });

    it('leaves out a weekday whose first date is after the end', () => {
      const entries = entriesOf([gym('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261105T215959Z')]);

      expect(entries.map(entry => valueOf(entry, 'UID'))).toEqual(['gym@google.com', 'gym@google.com#WE']);
    });

    it('keeps the weekdays in the same weeks when it repeats every second week', () => {
      // Starts on a Wednesday: that week's Monday is before the start, so Mondays begin two weeks later.
      const entries = entriesOf([
        timed('club', '2026-11-04T18:00:00Z', '2026-11-04T19:00:00Z', { recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'] })
      ]);

      expect(entries.map(entry => valueOf(entry, 'DTSTART'))).toEqual(['20261104T180000Z', '20261116T180000Z']);
      expect(entries.map(entry => valueOf(entry, 'UID'))).toEqual(['club@google.com', 'club@google.com#MO']);
      expect(valueOf(entries[1], 'RRULE')).toBe('FREQ=WEEKLY;INTERVAL=2');
    });

    it('keeps the clock time of the event’s zone across a daylight-saving change', () => {
      // Saturday 24 October 2026, 10:00 in Berlin; the clocks go back on the 25th.
      const entries = entriesOf([{
        id: 'market', summary: 'Market',
        start: { dateTime: '2026-10-24T10:00:00+02:00', timeZone: 'Europe/Berlin' },
        end: { dateTime: '2026-10-24T11:00:00+02:00', timeZone: 'Europe/Berlin' },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SA,MO']
      }]);

      expect(entries.map(entry => valueOf(entry, 'DTSTART'))).toEqual(['20261024T080000Z', '20261026T090000Z']);
    });

    it('splits all-day events by date and gives every part the skipped dates', () => {
      const entries = entriesOf([
        {
          id: 'school', summary: 'School run', start: { date: '2026-11-03' }, end: { date: '2026-11-04' },
          recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU,TH']
        },
        { id: 'school_20261112', status: 'cancelled', recurringEventId: 'school', originalStartTime: { date: '2026-11-12' } }
      ]);

      expect(entries.map(entry => valueOf(entry, 'DTSTART'))).toEqual(['20261103', '20261105']);
      expect(entries.map(entry => valueOf(entry, 'DTEND'))).toEqual(['20261104', '20261106']);
      expect(entries.every(entry => entry.includes('EXDATE;VALUE=DATE:20261112'))).toBeTrue();
    });
  });

  describe('text', () => {
    it('escapes backslashes, semicolons, commas and line breaks', () => {
      expect(escapeText('Room 4; floor 2, back\\front\r\nsecond line\nthird')).toBe(
        'Room 4\\; floor 2\\, back\\\\front\\nsecond line\\nthird');
    });

    it('folds a long line at 75 octets and continues after a space', () => {
      const line = 'DESCRIPTION:' + 'a'.repeat(200);
      const folded = foldLine(line);
      const pieces = folded.split('\r\n');

      expect(pieces.length).toBe(3);
      expect(pieces[0].length).toBe(75);
      expect(pieces.slice(1).every(piece => piece[0] === ' ' && piece.length <= 75)).toBeTrue();
      expect(folded.replace(/\r\n /g, '')).toBe(line);
    });

    it('counts bytes, not characters, and never cuts a character in two', () => {
      const line = 'SUMMARY:' + 'اجتماع الفريق 📅 '.repeat(12);
      const folded = foldLine(line);
      const encoder = new TextEncoder();

      expect(folded.split('\r\n').every(piece => encoder.encode(piece).length <= 75)).toBeTrue();
      expect(folded.replace(/\r\n /g, '')).toBe(line);
      expect(folded).not.toContain('�');
    });

    it('leaves a short line alone', () => {
      expect(foldLine('SUMMARY:Lunch')).toBe('SUMMARY:Lunch');
    });

    it('reads plain text as it is and HTML as text', () => {
      expect(plainText('Just words, 2 < 3')).toBe('Just words, 2 < 3');
      expect(plainText('<p>One</p><p>Two&nbsp;&#38;&nbsp;three</p>')).toBe('One\nTwo & three');
      expect(plainText('<a href="https://example.org">https://example.org</a>')).toBe('https://example.org');
    });
  });

  describe('files', () => {
    const many = Array.from({ length: 5 }, (_, index) => timed(`e${index}`, '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z'));

    it('writes whole calendars, ending every line with CRLF', () => {
      const [file] = googleEventsToIcs(many, { now: NOW }).files;

      expect(file.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBeTrue();
      expect(file.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBeTrue();
      expect(file.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('starts a new file when one holds as many events as the import takes', () => {
      const result = googleEventsToIcs(many, { now: NOW, maxEventsPerFile: 2 });

      expect(result.written).toBe(5);
      expect(result.files.map(file => file.split('BEGIN:VEVENT').length - 1)).toEqual([2, 2, 1]);
      expect(result.files.every(file => file.startsWith('BEGIN:VCALENDAR') && file.endsWith('END:VCALENDAR\r\n'))).toBeTrue();
    });

    it('starts a new file before one grows past the size the import takes', () => {
      const result = googleEventsToIcs(many, { now: NOW, maxBytesPerFile: 400 });

      expect(result.files.length).toBeGreaterThan(1);
      expect(result.files.every(file => new TextEncoder().encode(file).length <= 400)).toBeTrue();
      expect(result.files.join('').split('BEGIN:VEVENT').length - 1).toBe(5);
    });
  });
});
