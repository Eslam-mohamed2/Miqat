// The rules of a group call that need no browser: who offers a connection to
// whom, and how the people are laid out on the call screen.

/** At most this many people in one group call (the server enforces it). */
export const GROUP_CALL_LIMIT = 8;

/**
 * The people a browser that has just joined offers a connection to: everyone
 * already in the call. They wait for that offer, so two browsers never offer
 * to each other at the same time.
 */
export function peersToOffer<T extends { id: string }>(participants: T[], me: string | null): T[] {
  return participants.filter(p => p.id !== me);
}

/**
 * How many tiles go side by side, for 1 to 8 people. On a phone held upright
 * up to three tiles stack (each stays wide, like the picture a camera sends)
 * and more go two by two; on anything wider the grid is two rows at most.
 */
export function tileColumns(count: number, narrow: boolean): number {
  if (count <= 1) return 1;
  if (narrow) return count <= 3 ? 1 : 2;
  return count <= 4 ? 2 : count <= 6 ? 3 : 4;
}

/** True when the last tile is alone on its row; the screen then puts it in the middle. */
export function lastTileAlone(count: number, columns: number): boolean {
  return count > 1 && columns > 1 && count % columns === 1;
}
