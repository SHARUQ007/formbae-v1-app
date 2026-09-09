/** Stable weekly editions: opening or scrolling a report never shuffles its art. */
export function reportEdition(identity = ''): number {
  const date = identity.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (date) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (Number.isFinite(time)) return Math.floor(time / (7 * 86400000));
  }
  let hash = 0;
  for (const char of identity) hash = (hash * 31 + char.charCodeAt(0)) % 4294967296;
  return hash;
}

export function reportVariant(identity: string, count = 3, slot = 0) {
  return ((reportEdition(identity) + slot) % count + count) % count;
}
