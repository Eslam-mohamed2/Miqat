import { CALENDAR_COLORS, nearestCalendarColor } from './calendar-colors';

describe('nearestCalendarColor', () => {
  it('keeps a colour that is already a calendar colour', () => {
    for (const color of CALENDAR_COLORS.filter(candidate => candidate !== '#CDAE72')) {
      expect(nearestCalendarColor(color)).toBe(color);
    }
  });

  it('matches Google’s calendar colours by hue', () => {
    expect(nearestCalendarColor('#0B8043')).toBe('#8FBF9F');
    expect(nearestCalendarColor('#4285F4')).toBe('#8FB0E0');
    expect(nearestCalendarColor('#9E69AF')).toBe('#B9A7E6');
    expect(nearestCalendarColor('#D50000')).toBe('#E3907F');
    expect(nearestCalendarColor('#F6BF26')).toBe('#CDAE72');
    expect(nearestCalendarColor('#EF6C00')).toBe('#D9B26A');
    expect(nearestCalendarColor('#d81b60')).toBe('#D99AA8');
  });

  it('gives a grey the neutral colour', () => {
    expect(nearestCalendarColor('#616161')).toBe('#C9C2B4');
    expect(nearestCalendarColor('#fff')).toBe('#C9C2B4');
  });

  it('falls back to the first colour for a value that is not a colour', () => {
    expect(nearestCalendarColor('')).toBe(CALENDAR_COLORS[0]);
    expect(nearestCalendarColor(undefined)).toBe(CALENDAR_COLORS[0]);
    expect(nearestCalendarColor('teal')).toBe(CALENDAR_COLORS[0]);
  });
});
