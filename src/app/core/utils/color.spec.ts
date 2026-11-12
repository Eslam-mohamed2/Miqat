import { readableTextOn } from './color';

describe('readableTextOn', () => {
  const DARK = '#111827';
  const WHITE = '#ffffff';

  it('uses dark text on light backgrounds', () => {
    expect(readableTextOn('#ffffff')).toBe(DARK);
    expect(readableTextOn('#f4a835')).toBe(DARK);
    // The brand teal: white on it is only about 2.2:1.
    expect(readableTextOn('#2ec4a0')).toBe(DARK);
  });

  it('uses white text on dark backgrounds', () => {
    expect(readableTextOn('#000000')).toBe(WHITE);
    expect(readableTextOn('#264653')).toBe(WHITE);
  });

  it('understands short and un-prefixed hex colours', () => {
    expect(readableTextOn('#fff')).toBe(DARK);
    expect(readableTextOn('000')).toBe(WHITE);
  });

  it('falls back to white for anything it cannot parse', () => {
    expect(readableTextOn('teal')).toBe(WHITE);
    expect(readableTextOn('')).toBe(WHITE);
  });
});
