/** Parse `GET /api/v3/boardgames` (`BoardgameResponseData`) and related list payloads. */

export type BoardgameListParse = {
  games: Record<string, unknown>[];
  total: number;
  start: number;
  limit: number;
};

export function parseBoardgameListPayload(data: unknown): BoardgameListParse {
  if (data == null || typeof data !== 'object') {
    return { games: [], total: 0, start: 0, limit: 50 };
  }
  const o = data as Record<string, unknown>;
  const rawGames = o.gameArray;
  const games = Array.isArray(rawGames)
    ? rawGames.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
    : [];

  const pag = o.paginator;
  let total = 0;
  let start = 0;
  let limit = 50;
  if (pag && typeof pag === 'object') {
    const p = pag as Record<string, unknown>;
    if (typeof p.total === 'number' && Number.isFinite(p.total)) total = p.total;
    if (typeof p.start === 'number' && Number.isFinite(p.start)) start = p.start;
    if (typeof p.limit === 'number' && Number.isFinite(p.limit)) limit = p.limit;
  }
  return { games, total, start, limit };
}

export function boardgameIdFromRow(row: Record<string, unknown>): string | undefined {
  const id = row.gameID ?? row.gameId ?? row.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return undefined;
}

export function boardgameTitleFromRow(row: Record<string, unknown>): string {
  const n = row.gameName ?? row.game_name ?? row.title ?? row.name;
  if (typeof n === 'string' && n.trim()) return n.trim();
  const id = boardgameIdFromRow(row);
  return id ? `Game ${id}` : 'Untitled game';
}

export function boardgameBoolField(row: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = row[k];
    if (v === true) return true;
    if (v === false) return false;
  }
  return false;
}
