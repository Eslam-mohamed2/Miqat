import { chipsByDay, timeRangeLabel } from './calendar-chips';
import { CalendarItemDto, GroupDto } from '../../models/api.models';

/** A feed item with only the fields a test cares about. */
function item(fields: Partial<CalendarItemDto>): CalendarItemDto {
  return {
    kind: 'Event', id: 'e1', title: 'Meeting',
    start: '2026-11-12T10:00:00Z', end: '2026-11-12T11:00:00Z',
    isAllDay: false, isRecurring: false, isOwner: true, attendeeCount: 0, isOverdue: false,
    ...fields
  };
}

const options = { zone: 'UTC', hour24: false, groups: [] as GroupDto[] };

/** Browsers print a narrow no-break space before AM / PM; the tests do not care which space it is. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('calendar chips', () => {
  it('puts a timed event on the day it starts, with a short time', () => {
    const byDay = chipsByDay([item({})], options);

    expect([...byDay.keys()]).toEqual(['2026-11-12']);
    const chip = byDay.get('2026-11-12')![0];
    expect(chip.time).toBe('10am');
    expect(plain(chip.timeRange)).toBe('10:00 – 11:00 AM');
  });

  it('files an event under the day it falls on in the calendar zone', () => {
    // 02:00 UTC on the 12th is still the evening of the 11th in New York.
    const byDay = chipsByDay(
      [item({ start: '2026-11-12T02:00:00Z', end: '2026-11-12T03:00:00Z' })],
      { ...options, zone: 'America/New_York' });

    expect([...byDay.keys()]).toEqual(['2026-11-11']);
    expect(byDay.get('2026-11-11')![0].time).toBe('9pm');
  });

  it('shows an all-day event on its own day only', () => {
    // Midnight to midnight in New York: the end does not spill onto the 22nd.
    const byDay = chipsByDay(
      [item({ isAllDay: true, start: '2026-11-21T05:00:00Z', end: '2026-11-22T05:00:00Z' })],
      { ...options, zone: 'America/New_York' });

    expect([...byDay.keys()]).toEqual(['2026-11-21']);
    expect(byDay.get('2026-11-21')![0].time).toBe('All day');
  });

  it('spreads an event that runs over midnight across the days it touches', () => {
    const byDay = chipsByDay(
      [item({ start: '2026-11-12T22:00:00Z', end: '2026-11-14T09:00:00Z' })], options);

    expect([...byDay.keys()]).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
    expect(byDay.get('2026-11-12')![0].time).toBe('10pm');
    expect(byDay.get('2026-11-13')![0].time).toBe('All day');
    expect(byDay.get('2026-11-14')![0].time).toBe('Until 9am');
  });

  it('leads a day with all-day items, then orders by start time', () => {
    const byDay = chipsByDay([
      item({ id: 'late', title: 'Late', start: '2026-11-12T15:00:00Z', end: '2026-11-12T16:00:00Z' }),
      item({ id: 'early', title: 'Early', start: '2026-11-12T08:00:00Z', end: '2026-11-12T09:00:00Z' }),
      item({ id: 'day', title: 'Holiday', isAllDay: true, start: '2026-11-12T00:00:00Z', end: '2026-11-13T00:00:00Z' })
    ], options);

    expect(byDay.get('2026-11-12')!.map(chip => chip.title)).toEqual(['Holiday', 'Early', 'Late']);
  });

  it('gives each date of a repeating event its own key', () => {
    const byDay = chipsByDay([
      item({ isRecurring: true, occurrenceStart: '2026-11-12T10:00:00Z' }),
      item({ isRecurring: true, occurrenceStart: '2026-11-19T10:00:00Z', start: '2026-11-19T10:00:00Z', end: '2026-11-19T11:00:00Z' })
    ], options);

    const keys = [...byDay.values()].flat().map(chip => chip.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('marks invitations by the answer given', () => {
    const byDay = chipsByDay([
      item({ id: 'p', isOwner: false, myResponse: 'Pending' }),
      item({ id: 'd', isOwner: false, myResponse: 'Declined' }),
      item({ id: 'a', isOwner: false, myResponse: 'Accepted' })
    ], options);

    const chips = Object.fromEntries(byDay.get('2026-11-12')!.map(chip => [chip.id, chip]));
    expect(chips['p'].pending).toBeTrue();
    expect(chips['d'].declined).toBeTrue();
    expect(chips['a'].pending || chips['a'].declined).toBeFalse();
  });

  it('colours a task by its project and marks a finished one', () => {
    const groups = [{ id: 'g1', name: 'Launch', color: '#f97316' }] as GroupDto[];
    const byDay = chipsByDay([
      item({ kind: 'Task', id: 't1', groupId: 'g1', status: 'Completed', end: '2026-11-12T10:00:00Z' }),
      item({ kind: 'Task', id: 't2', status: 'Pending', end: '2026-11-12T10:00:00Z' })
    ], { ...options, groups });

    const chips = Object.fromEntries(byDay.get('2026-11-12')!.map(chip => [chip.id, chip]));
    expect(chips['t1'].color).toBe('#f97316');
    expect(chips['t1'].done).toBeTrue();
    expect(chips['t2'].done).toBeFalse();
    // A task has a due time, not a length.
    expect(plain(chips['t1'].timeRange)).toBe('10:00 AM');
  });

  it('skips an item whose start cannot be read', () => {
    expect(chipsByDay([item({ start: 'not a date' })], options).size).toBe(0);
  });

  it('writes a time range once per half of the day, or on a 24-hour clock', () => {
    expect(plain(timeRangeLabel(item({}), 'UTC', false))).toBe('10:00 – 11:00 AM');
    expect(plain(timeRangeLabel(item({ end: '2026-11-12T13:30:00Z' }), 'UTC', false))).toBe('10:00 AM – 1:30 PM');
    expect(timeRangeLabel(item({ end: '2026-11-12T13:30:00Z' }), 'UTC', true)).toBe('10:00 – 13:30');
    expect(timeRangeLabel(item({ isAllDay: true }), 'UTC', false)).toBe('All day');
  });
});
