import { countryOfZone } from './zone-country';

describe('countryOfZone', () => {
  it('knows the country of a time zone', () => {
    expect(countryOfZone('Africa/Cairo')).toBe('EG');
    expect(countryOfZone('Asia/Riyadh')).toBe('SA');
    expect(countryOfZone('America/New_York')).toBe('US');
    expect(countryOfZone('America/Indiana/Knox')).toBe('US');
    expect(countryOfZone('Europe/London')).toBe('GB');
    expect(countryOfZone('Asia/Tokyo')).toBe('JP');
    expect(countryOfZone('Pacific/Auckland')).toBe('NZ');
    expect(countryOfZone('Asia/Gaza')).toBe('PS');
  });

  it('knows a zone by its older name too', () => {
    expect(countryOfZone('Asia/Calcutta')).toBe('IN');
    expect(countryOfZone('Asia/Kolkata')).toBe('IN');
    expect(countryOfZone('Europe/Kiev')).toBe('UA');
  });

  it('answers null for a zone that belongs to no country, and for what is not a zone', () => {
    expect(countryOfZone('UTC')).toBeNull();
    expect(countryOfZone('Antarctica/Troll')).toBeNull();
    expect(countryOfZone('UTC+2')).toBeNull();
    expect(countryOfZone('')).toBeNull();
    expect(countryOfZone(null)).toBeNull();
  });

  it('covers every zone the browser offers in Settings', () => {
    const offered = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    const unknown = offered.filter(zone => !countryOfZone(zone) && !zone.startsWith('Antarctica/') && zone !== 'UTC');
    expect(unknown).toEqual([]);
  });
});
