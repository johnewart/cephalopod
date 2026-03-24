/** Twitarr API UUID path params are often compared lowercase; URLs may carry uppercase from JSON. */
export function normalizeTwitarrUuid(id: string): string {
  const t = id.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)
  ) {
    return t.toLowerCase();
  }
  return t;
}
