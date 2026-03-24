/** Parse Twitarr hunt API payloads (`HuntListData`, `HuntData`, puzzle rows). */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseHuntListItems(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data)) return [];
  const h = data.hunts;
  if (!Array.isArray(h)) return [];
  return h.filter(isRecord);
}

export function huntIdFromRow(row: Record<string, unknown>): string | undefined {
  const id = row.huntID ?? row.huntId ?? row.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return undefined;
}

export function huntTitleFromRow(row: Record<string, unknown>): string {
  const t = row.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  const id = huntIdFromRow(row);
  return id ? `Hunt ${id}` : 'Untitled hunt';
}

export function huntDescriptionFromRow(row: Record<string, unknown>): string | undefined {
  const d = row.description;
  if (typeof d === 'string' && d.trim()) return d.trim();
  return undefined;
}

export type HuntDetailParse = {
  huntId?: string;
  title?: string;
  description?: string;
  puzzles: Record<string, unknown>[];
  nextUnlockTime?: string;
};

/** Parse `GET /hunts/:id` → `HuntData`. */
export function parseHuntDetailPayload(data: unknown): HuntDetailParse {
  if (!isRecord(data)) {
    return { puzzles: [] };
  }
  const huntId = huntIdFromRow(data);
  const title = typeof data.title === 'string' ? data.title : undefined;
  const description = typeof data.description === 'string' ? data.description : undefined;
  const rawPuzzles = data.puzzles;
  const puzzles = Array.isArray(rawPuzzles) ? rawPuzzles.filter(isRecord) : [];
  const nu = data.nextUnlockTime ?? data.next_unlock_time;
  const nextUnlockTime = typeof nu === 'string' && nu.trim() ? nu.trim() : undefined;
  return { huntId, title, description, puzzles, nextUnlockTime };
}

export function puzzleIdFromRow(row: Record<string, unknown>): string | undefined {
  const id = row.puzzleID ?? row.puzzleId ?? row.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return undefined;
}

export function puzzleTitleFromRow(row: Record<string, unknown>): string {
  const t = row.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  const id = puzzleIdFromRow(row);
  return id ? `Puzzle ${id}` : 'Puzzle';
}

/** True if the solver has solved this puzzle (answer field present on `HuntPuzzleData`). */
export function puzzleLooksSolved(row: Record<string, unknown>): boolean {
  const a = row.answer;
  return typeof a === 'string' && a.length > 0;
}

/** User-facing summary for `HuntPuzzleCallInResultData` from `POST .../callin`. */
export function huntCallInResultSummary(data: unknown): string {
  if (!isRecord(data)) return 'Response received.';
  if (typeof data.correct === 'string' && data.correct.trim()) {
    return `Correct — ${data.correct.trim()}`;
  }
  if (typeof data.hint === 'string' && data.hint.trim()) {
    return data.hint.trim();
  }
  return 'Not quite — try again.';
}

export type HuntPuzzleDetailParse = {
  huntTitle?: string;
  puzzleTitle?: string;
  body?: string;
  callIns: Record<string, unknown>[];
};

/** Parse `GET /hunts/puzzles/:id` → `HuntPuzzleDetailData`. */
export function parseHuntPuzzleDetailPayload(data: unknown): HuntPuzzleDetailParse {
  if (!isRecord(data)) return { callIns: [] };
  const huntTitle = typeof data.huntTitle === 'string' ? data.huntTitle : undefined;
  const puzzleTitle = typeof data.title === 'string' ? data.title : undefined;
  const body = typeof data.body === 'string' ? data.body : undefined;
  const raw = data.callIns ?? data.call_ins;
  const callIns = Array.isArray(raw) ? raw.filter(isRecord) : [];
  return { huntTitle, puzzleTitle, body, callIns };
}
