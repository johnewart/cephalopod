import { useCallback, useEffect, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

const STORAGE_KEY = 'cephalopod:mySchedule:v1';

export type MyScheduleEntry = {
  id: string;
  title: string;
  startISO: string;
  endISO: string | null;
  location: string;
  eventType: string;
  description: string;
};

type StoredShape = { v: 1; items: MyScheduleEntry[] };

function isEntry(x: unknown): x is MyScheduleEntry {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.title === 'string' && typeof o.startISO === 'string';
}

function load(): MyScheduleEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredShape;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isEntry);
  } catch {
    return [];
  }
}

function persist(items: MyScheduleEntry[]) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const payload: StoredShape = { v: 1, items };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function entryEffectiveEnd(e: MyScheduleEntry): Dayjs {
  return e.endISO ? dayjs(e.endISO) : dayjs(e.startISO).add(1, 'hour');
}

/** True if this event overlaps any "my schedule" block, except the same event id (always show your picks). */
export function eventConflictsWithMySchedule(
  ev: { id: string; start: Dayjs; end: Dayjs | null },
  items: MyScheduleEntry[]
): boolean {
  if (items.length === 0) return false;
  if (items.some((x) => x.id === ev.id)) return false;
  const evEnd = ev.end?.isValid() ? ev.end : ev.start.add(1, 'hour');
  for (const m of items) {
    const mStart = dayjs(m.startISO);
    const mEnd = entryEffectiveEnd(m);
    if (ev.start.isBefore(mEnd) && evEnd.isAfter(mStart)) return true;
  }
  return false;
}

export type ParsedEventLike = {
  id: string;
  title: string;
  start: Dayjs;
  end: Dayjs | null;
  location: string;
  eventType: string;
  description: string;
};

function toEntry(ev: ParsedEventLike): MyScheduleEntry {
  return {
    id: ev.id,
    title: ev.title,
    startISO: ev.start.toISOString(),
    endISO: ev.end?.isValid() ? ev.end.toISOString() : null,
    location: ev.location,
    eventType: ev.eventType,
    description: ev.description,
  };
}

export function useMySchedule() {
  const [items, setItems] = useState<MyScheduleEntry[]>(() => load());

  useEffect(() => {
    persist(items);
  }, [items]);

  const add = useCallback((ev: ParsedEventLike) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === ev.id)) return prev;
      return [...prev, toEntry(ev)];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return { items, add, remove, clear };
}
