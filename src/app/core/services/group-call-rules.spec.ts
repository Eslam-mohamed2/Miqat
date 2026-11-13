import { GROUP_CALL_LIMIT, lastTileAlone, peersToOffer, tileColumns } from './group-call-rules';

describe('group call rules', () => {
  describe('peersToOffer', () => {
    const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    it('offers to everyone already in the call, never to oneself', () => {
      expect(peersToOffer(people, 'c').map(p => p.id)).toEqual(['a', 'b']);
    });

    it('offers to nobody when alone in the call', () => {
      expect(peersToOffer([{ id: 'a' }], 'a')).toEqual([]);
    });

    it('never has two people offering to each other', () => {
      // People join one after the other; each offers to those before them.
      const offers = new Set<string>();
      people.forEach((joiner, index) =>
        peersToOffer(people.slice(0, index + 1), joiner.id).forEach(other => offers.add(`${joiner.id}>${other.id}`)));

      expect([...offers].sort()).toEqual(['b>a', 'c>a', 'c>b']);
      offers.forEach(offer => {
        const [from, to] = offer.split('>');
        expect(offers.has(`${to}>${from}`)).toBeFalse();
      });
    });
  });

  describe('tileColumns', () => {
    it('gives one person the whole screen', () => {
      expect(tileColumns(1, false)).toBe(1);
      expect(tileColumns(1, true)).toBe(1);
    });

    it('keeps to two rows on a wide screen, up to the limit', () => {
      const columns = Array.from({ length: GROUP_CALL_LIMIT }, (_, i) => tileColumns(i + 1, false));
      expect(columns).toEqual([1, 2, 2, 2, 3, 3, 4, 4]);
      columns.forEach((cols, i) => expect(Math.ceil((i + 1) / cols)).toBeLessThanOrEqual(2));
    });

    it('stacks up to three people and goes two by two beyond that on an upright phone', () => {
      const columns = Array.from({ length: GROUP_CALL_LIMIT }, (_, i) => tileColumns(i + 1, true));
      expect(columns).toEqual([1, 1, 1, 2, 2, 2, 2, 2]);
    });
  });

  describe('lastTileAlone', () => {
    it('is true when one tile is left over on the last row', () => {
      expect(lastTileAlone(3, 2)).toBeTrue();
      expect(lastTileAlone(5, 2)).toBeTrue();
      expect(lastTileAlone(7, 3)).toBeTrue();
    });

    it('is false for full rows, for a single column and for one person', () => {
      expect(lastTileAlone(4, 2)).toBeFalse();
      expect(lastTileAlone(5, 3)).toBeFalse();
      expect(lastTileAlone(2, 1)).toBeFalse();
      expect(lastTileAlone(1, 1)).toBeFalse();
    });
  });
});
