import { AR, AR_PLURALS } from '../../core/i18n/ar';
import { useLanguageForTests } from '../../core/i18n/i18n';
import { TaskDto } from '../../models/api.models';
import {
  blockLabel, blockRange, dayTimeLabel, dueLabel, dueLong, isLate, longDate, nextPriority, priorityLabel, priorityLevel,
  priorityPhrase, statusLabel, taskDates, weekdayDate
} from './task-view';

describe('task view helpers', () => {
  const zone = 'UTC';
  /** Thursday 12 November 2026, 09:00. */
  const now = new Date('2026-11-12T09:00:00Z');

  function task(values: Partial<TaskDto>): TaskDto {
    return {
      id: 't', title: 'Task', description: '', status: 'Pending', priority: 'Medium', dueDate: '', tags: '',
      recurrence: 'None', recurrenceEndDate: '', userId: 'u', ownerName: '', assignedToUserId: '',
      assignedToUserName: '', groupId: '', groupName: '', createdAt: '2026-11-01T08:00:00Z', ...values
    };
  }

  describe('taskDates', () => {
    it('puts a task with no date in Anytime', () => {
      const dates = taskDates(task({}), zone, now);
      expect(dates.anytime).toBeTrue();
      expect(dates.today).toBeFalse();
      expect(dates.upcoming).toBeFalse();
    });

    it('counts a deadline that has passed as overdue and as today\'s business', () => {
      const dates = taskDates(task({ dueDate: '2026-11-10T17:00:00Z' }), zone, now);
      expect(dates.overdue).toBeTrue();
      expect(dates.today).toBeTrue();
      expect(dates.dueIn).toBe(-2);
    });

    it('puts a task due or planned today in Today without calling it overdue', () => {
      expect(taskDates(task({ dueDate: '2026-11-12T08:00:00Z' }), zone, now).overdue).toBeFalse();
      expect(taskDates(task({ dueDate: '2026-11-12T08:00:00Z' }), zone, now).today).toBeTrue();
      expect(taskDates(task({ startDate: '2026-11-12T15:00:00Z', dueDate: '2026-11-20T15:00:00Z' }), zone, now).today)
        .toBeTrue();
    });

    it('puts a later date in Upcoming', () => {
      const dates = taskDates(task({ dueDate: '2026-11-15T12:00:00Z' }), zone, now);
      expect(dates.upcoming).toBeTrue();
      expect(dates.today).toBeFalse();
    });

    it('keeps a block that passed with no deadline in Today', () => {
      expect(taskDates(task({ startDate: '2026-11-10T10:00:00Z' }), zone, now).today).toBeTrue();
    });

    it('leaves finished and on-hold tasks out of every dated list', () => {
      for (const status of ['Completed', 'Cancelled', 'On_hold']) {
        const dates = taskDates(task({ status, dueDate: '2026-11-10T17:00:00Z' }), zone, now);
        expect(dates.today || dates.upcoming || dates.anytime || dates.overdue).toBeFalse();
      }
    });

    it('reads the day in the given time zone', () => {
      // 23:30 UTC on the 11th is already the 12th in Cairo.
      const due = task({ dueDate: '2026-11-11T23:30:00Z' });
      expect(taskDates(due, 'UTC', now).overdue).toBeTrue();
      expect(taskDates(due, 'Africa/Cairo', now).overdue).toBeFalse();
    });
  });

  describe('labels', () => {
    it('says how late, or which day', () => {
      expect(dueLabel(task({ dueDate: '2026-11-10T17:00:00Z' }), zone, now, true)).toBe('2d late');
      expect(dueLabel(task({ dueDate: '2026-11-12T17:00:00Z' }), zone, now, true)).toBe('Today 17:00');
      expect(dueLabel(task({ dueDate: '2026-11-12T23:59:00Z' }), zone, now, true)).toBe('Today');
      expect(dueLabel(task({ dueDate: '2026-11-13T12:00:00Z' }), zone, now, true)).toBe('Tomorrow');
      expect(dueLabel(task({ dueDate: '2026-11-15T12:00:00Z' }), zone, now, true)).toBe('Sun');
      expect(dueLabel(task({ dueDate: '2026-11-25T12:00:00Z' }), zone, now, true)).toBe('25 Nov');
      expect(dueLabel(task({}), zone, now, true)).toBe('');
    });

    it('says when a task was finished', () => {
      const done = (completedAt: string) => task({ status: 'Completed', completedAt });
      expect(dueLabel(done('2026-11-12T08:40:00Z'), zone, now, true)).toBe('Done 08:40');
      expect(dueLabel(done('2026-11-10T08:40:00Z'), zone, now, true)).toBe('Done Tue');
      expect(dueLabel(task({ status: 'Cancelled' }), zone, now, true)).toBe('Cancelled');
    });

    it('writes the deadline in full for the panel', () => {
      expect(dueLong(task({ dueDate: '2026-11-12T17:00:00Z' }), zone, now, true)).toBe('Today 17:00');
      expect(dueLong(task({ dueDate: '2026-11-15T09:00:00Z' }), zone, now, true)).toBe('Sun 15 Nov, 09:00');
    });

    it('shows a block as its start today, with its day otherwise', () => {
      expect(blockLabel(task({ startDate: '2026-11-12T17:30:00Z' }), zone, now, true)).toBe('17:30');
      expect(blockLabel(task({ startDate: '2026-11-13T10:00:00Z' }), zone, now, true)).toBe('Fri 10:00');
      expect(blockLabel(task({ startDate: '2026-11-12T17:30:00Z' }), zone, now, true, true)).toBe('Thu 17:30');
      expect(blockLabel(task({}), zone, now, true)).toBe('');
    });

    it('ends a block after the estimate', () => {
      expect(blockRange(task({ startDate: '2026-11-12T10:00:00Z', tags: 'auth, est:75' }), zone, true))
        .toBe('Thu 10:00 – 11:15');
      expect(blockRange(task({ startDate: '2026-11-12T10:00:00Z' }), zone, true)).toBe('Thu 10:00');
    });
  });

  it('knows when an open task is late, to the minute', () => {
    expect(isLate(task({ dueDate: '2026-11-12T08:59:00Z' }), now)).toBeTrue();
    expect(isLate(task({ dueDate: '2026-11-12T09:01:00Z' }), now)).toBeFalse();
    expect(isLate(task({ dueDate: '2026-11-10T09:00:00Z', status: 'Completed' }), now)).toBeFalse();
  });

  it('names statuses and orders priorities', () => {
    expect(statusLabel('In_progress')).toBe('In progress');
    expect(statusLabel('Pending')).toBe('To do');
    expect(statusLabel('Completed')).toBe('Done');
    expect(priorityLabel('Critical')).toBe('Critical');
    expect(priorityLabel(null)).toBe('Medium');
    expect(priorityPhrase('High')).toBe('High priority');
    expect(priorityLevel('Critical')).toBe(3);
    expect(priorityLevel('Low')).toBe(1);
    expect(nextPriority('High')).toBe('Critical');
    expect(nextPriority('Critical')).toBe('Low');
  });

  it('writes the dates the English way: day before month, no commas', () => {
    expect(longDate(now, zone)).toBe('Thursday, 12 November');
    expect(weekdayDate(new Date('2026-11-20T12:00:00Z'), zone)).toBe('Fri 20 Nov');
    expect(weekdayDate(new Date('2027-01-20T12:00:00Z'), zone, now)).toBe('Wed 20 Jan 2027');
    expect(dueLabel(task({ dueDate: '2027-01-20T12:00:00Z' }), zone, now, true)).toBe('20 Jan 2027');
    expect(dueLabel(task({ dueDate: '2026-11-11T17:00:00Z' }), zone, now, true)).toBe('1d late');
    expect(dayTimeLabel(new Date('2026-11-13T09:30:00Z'), zone, now, true)).toBe('Tomorrow 09:30');
    expect(dayTimeLabel(new Date('2026-11-15T09:30:00Z'), zone, now, true)).toBe('Sun 09:30');
  });

  describe('in Arabic', () => {
    beforeEach(() => useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS, numerals: 'arab' }));
    afterEach(() => useLanguageForTests('en'));

    it('says how late in whole words, with the plural the number asks for', () => {
      const late = (dueDate: string) => dueLabel(task({ dueDate }), zone, now, true);
      expect(late('2026-11-11T17:00:00Z')).toBe('متأخرة يومًا واحدًا');
      expect(late('2026-11-10T17:00:00Z')).toBe('متأخرة يومين');
      expect(late('2026-11-09T17:00:00Z')).toBe('متأخرة ٣ أيام');
      expect(late('2026-11-01T17:00:00Z')).toBe('متأخرة ١١ يومًا');
    });

    it('writes days, dates and times in Arabic with Arabic digits', () => {
      expect(dueLabel(task({ dueDate: '2026-11-12T17:00:00Z' }), zone, now, true)).toBe('اليوم ١٧:٠٠');
      expect(dueLabel(task({ dueDate: '2026-11-12T23:59:00Z' }), zone, now, true)).toBe('اليوم');
      expect(dueLabel(task({ dueDate: '2026-11-13T12:00:00Z' }), zone, now, true)).toBe('غدًا');
      expect(dueLabel(task({ dueDate: '2026-11-15T12:00:00Z' }), zone, now, true)).toBe('الأحد');
      expect(dueLabel(task({ dueDate: '2026-11-25T12:00:00Z' }), zone, now, true)).toBe('٢٥ نوفمبر');
      expect(dueLabel(task({ status: 'Completed', completedAt: '2026-11-12T08:40:00Z' }), zone, now, true)).toBe('اكتملت ٠٨:٤٠');
      expect(dueLabel(task({ status: 'Completed', completedAt: '2026-11-10T08:40:00Z' }), zone, now, true)).toBe('اكتملت الثلاثاء');
      expect(dueLong(task({ dueDate: '2026-11-15T09:00:00Z' }), zone, now, true)).toBe('الأحد، ١٥ نوفمبر، ٠٩:٠٠');
      expect(longDate(now, zone)).toBe('الخميس، ١٢ نوفمبر');
    });

    it('writes a block from its start to its end', () => {
      expect(blockLabel(task({ startDate: '2026-11-13T10:00:00Z' }), zone, now, true)).toBe('الجمعة ١٠:٠٠');
      expect(blockRange(task({ startDate: '2026-11-12T10:00:00Z', tags: 'auth, est:75' }), zone, true))
        .toBe('الخميس ١٠:٠٠ – ١١:١٥');
      expect(dayTimeLabel(new Date('2026-11-13T09:30:00Z'), zone, now, true)).toBe('غدًا ٠٩:٣٠');
    });

    it('keeps Latin digits when they are chosen', () => {
      useLanguageForTests('ar', { dictionary: AR, plurals: AR_PLURALS, numerals: 'latn' });
      expect(dueLabel(task({ dueDate: '2026-11-09T17:00:00Z' }), zone, now, true)).toBe('متأخرة 3 أيام');
      expect(dueLabel(task({ dueDate: '2026-11-25T12:00:00Z' }), zone, now, true)).toBe('25 نوفمبر');
    });
  });
});
