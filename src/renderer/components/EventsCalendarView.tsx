import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, Button, DatePicker, Empty, Input, List, message, Popover, Spin, Switch, Tabs, Typography } from 'antd';
import { IconCalendar } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { eventConflictsWithMySchedule, useMySchedule } from '../hooks/useMySchedule';

function extractEventList(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
    );
  }
  return [];
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function toTimeValue(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

type ParsedEvent = {
  id: string;
  title: string;
  start: Dayjs;
  end: Dayjs | null;
  location: string;
  eventType: string;
  description: string;
};

function parseEvent(rec: Record<string, unknown>): ParsedEvent | null {
  const title = pickString(rec, 'title') ?? 'Untitled';
  const startRaw = toTimeValue(rec.startTime ?? rec.start_time);
  const endRaw = toTimeValue(rec.endTime ?? rec.end_time);
  const start = startRaw ? dayjs(startRaw) : null;
  if (!start?.isValid()) return null;
  const end = endRaw ? dayjs(endRaw) : null;
  const id =
    pickString(rec, 'eventID', 'event_id') ??
    `${title}-${start.valueOf()}`;
  return {
    id,
    title,
    start,
    end: end?.isValid() ? end : null,
    location: pickString(rec, 'location') ?? '',
    eventType: pickString(rec, 'eventType', 'event_type') ?? '',
    description: pickString(rec, 'description') ?? '',
  };
}

function effectiveEventEnd(ev: ParsedEvent): Dayjs {
  return ev.end?.isValid() ? ev.end : ev.start.add(1, 'hour');
}

function eventIntersectsDay(ev: ParsedEvent, day: Dayjs): boolean {
  const d0 = day.startOf('day');
  const d1 = day.endOf('day');
  const evEnd = effectiveEventEnd(ev);
  return !ev.start.isAfter(d1) && !evEnd.isBefore(d0);
}

/** Clip event to local calendar day; returns minutes from midnight [0, 1440]. */
function clipEventToDay(ev: ParsedEvent, day: Dayjs): { startMin: number; endMin: number } | null {
  const d0 = day.startOf('day');
  const d1 = day.endOf('day');
  const evEnd = effectiveEventEnd(ev);
  const clipStart = ev.start.isBefore(d0) ? d0 : ev.start;
  const clipEnd = evEnd.isAfter(d1) ? d1 : evEnd;
  if (!clipStart.isBefore(clipEnd)) return null;
  const startMin = clipStart.diff(d0, 'minute', true);
  const endMin = clipEnd.diff(d0, 'minute', true);
  return {
    startMin: Math.max(0, startMin),
    endMin: Math.min(24 * 60, endMin),
  };
}

function assignOverlapLanes(segments: { startMin: number; endMin: number }[]): number[] {
  const order = segments
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const laneByIndex = new Array<number>(segments.length);
  for (const seg of order) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > seg.startMin + 1e-6) lane += 1;
    if (lane === laneEnds.length) laneEnds.push(seg.endMin);
    else laneEnds[lane] = seg.endMin;
    laneByIndex[seg.i] = lane;
  }
  return laneByIndex;
}

function formatHourLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function GanttEventDetailPopover({
  ev,
  scheduled,
  onAdd,
  onRemove,
}: {
  ev: ParsedEvent;
  scheduled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ maxWidth: 340 }}>
      <Typography.Text strong style={{ display: 'block', color: '#EFECE2', fontSize: 15, marginBottom: 8 }}>
        {ev.title}
      </Typography.Text>
      <div style={{ color: '#9A9D9A', fontSize: 12, marginBottom: 6 }}>
        {ev.start.format('h:mm A')} – {ev.end?.isValid() ? ev.end.format('h:mm A') : 'No end (shown as 1h)'}
      </div>
      {ev.location ? (
        <div style={{ color: '#7A7490', fontSize: 12, marginBottom: 6 }}>{ev.location}</div>
      ) : null}
      {ev.eventType ? (
        <div style={{ color: '#7A7490', fontSize: 12, marginBottom: 6 }}>{ev.eventType}</div>
      ) : null}
      {ev.description ? (
        <Typography.Paragraph style={{ color: '#9A9D9A', fontSize: 12, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {ev.description}
        </Typography.Paragraph>
      ) : null}
      <Button
        type="primary"
        size="small"
        block
        onClick={() => {
          if (scheduled) {
            onRemove();
            message.success('Removed from your schedule');
          } else {
            onAdd();
            message.success('Added to your schedule');
          }
        }}
      >
        {scheduled ? 'Remove from my schedule' : 'Add to my schedule'}
      </Button>
    </div>
  );
}

function EventsDayGantt({
  events,
  day,
  myScheduleIds,
  onAddToSchedule,
  onRemoveFromSchedule,
  suppressedOnDay,
  eventsOnDayBeforeFilter,
}: {
  events: ParsedEvent[];
  day: Dayjs;
  myScheduleIds: Set<string>;
  onAddToSchedule: (ev: ParsedEvent) => void;
  onRemoveFromSchedule: (id: string) => void;
  suppressedOnDay: number;
  eventsOnDayBeforeFilter: number;
}) {
  const segments = useMemo(() => {
    const list: { ev: ParsedEvent; startMin: number; endMin: number }[] = [];
    for (const ev of events) {
      if (!eventIntersectsDay(ev, day)) continue;
      const clip = clipEventToDay(ev, day);
      if (clip != null && clip.endMin > clip.startMin + 0.5) list.push({ ev, ...clip });
    }
    return list.sort((a, b) => a.startMin - b.startMin);
  }, [events, day]);

  const range = useMemo(() => {
    const DEFAULT_MIN = 8 * 60;
    const DEFAULT_MAX = 18 * 60;
    if (segments.length === 0) return { min: DEFAULT_MIN, max: DEFAULT_MAX };
    let min = Math.min(...segments.map((s) => s.startMin));
    let max = Math.max(...segments.map((s) => s.endMin));
    min = Math.floor(min / 60) * 60;
    max = Math.ceil(max / 60) * 60;
    min = Math.max(0, min - 60);
    max = Math.min(24 * 60, max + 60);
    if (max - min < 120) max = Math.min(24 * 60, min + 120);
    return { min, max };
  }, [segments]);

  const lanes = useMemo(
    () => assignOverlapLanes(segments.map((s) => ({ startMin: s.startMin, endMin: s.endMin }))),
    [segments]
  );
  const laneCount = segments.length === 0 ? 1 : Math.max(...lanes) + 1;

  const ROW_H = 32;
  const GAP = 6;
  const TOP = 26;
  const innerHeight = TOP + laneCount * (ROW_H + GAP) + 8;
  const span = Math.max(1, range.max - range.min);

  const hours: number[] = [];
  for (let m = Math.floor(range.min / 60) * 60; m <= range.max; m += 60) {
    if (m >= 0 && m <= 24 * 60) hours.push(m);
  }

  return (
    <div className="events-gantt-root">
      <Typography.Text type="secondary" style={{ fontSize: 12, color: '#9A9D9A' }}>
        {suppressedOnDay > 0
          ? `${suppressedOnDay} event(s) hidden on this day — they overlap times on your schedule. Click a bar for details.`
          : 'Bars show time within the selected day (overlaps stack vertically). Click a bar for details. Default duration 1h when no end time.'}
      </Typography.Text>
      <div className="events-gantt-chart">
        <div className="events-gantt-chart-inner" style={{ height: innerHeight, minWidth: '100%' }}>
          {hours.map((hm) => {
            const pct = ((hm - range.min) / span) * 100;
            return (
              <span key={hm}>
                <span
                  className="events-gantt-hour-line"
                  style={{ left: `${pct}%` }}
                  title={formatHourLabel(hm)}
                />
                <span className="events-gantt-hour-label" style={{ left: `${pct}%` }}>
                  {formatHourLabel(hm)}
                </span>
              </span>
            );
          })}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: TOP - 4,
              height: 1,
              background: '#3d4149',
              pointerEvents: 'none',
            }}
          />
          {segments.length === 0 ? (
            <div
              style={{
                position: 'absolute',
                top: TOP + 12,
                left: 12,
                right: 12,
                color: '#7A7490',
                fontSize: 13,
              }}
            >
              {eventsOnDayBeforeFilter === 0
                ? 'No events intersect this day (after search filter).'
                : suppressedOnDay > 0
                  ? 'Every event on this day overlaps your schedule and is hidden. Remove or adjust items under “My schedule” to see them again.'
                  : 'No events intersect this day (after search filter).'}
            </div>
          ) : (
            segments.map((seg, i) => {
              const lane = lanes[i] ?? 0;
              const leftPct = ((seg.startMin - range.min) / span) * 100;
              const widthPct = ((seg.endMin - seg.startMin) / span) * 100;
              const top = TOP + lane * (ROW_H + GAP);
              const clippedStart = seg.ev.start.isBefore(day.startOf('day'));
              const evEnd = effectiveEventEnd(seg.ev);
              const clippedEnd = evEnd.isAfter(day.endOf('day'));
              const scheduled = myScheduleIds.has(seg.ev.id);
              return (
                <Popover
                  key={`${seg.ev.id}-${i}`}
                  trigger="click"
                  placement="bottom"
                  zIndex={1200}
                  styles={{
                    body: {
                      background: '#2a2d34',
                      border: '1px solid #3d4149',
                      borderRadius: 10,
                      boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
                    },
                  }}
                  content={
                    <GanttEventDetailPopover
                      ev={seg.ev}
                      scheduled={scheduled}
                      onAdd={() => onAddToSchedule(seg.ev)}
                      onRemove={() => onRemoveFromSchedule(seg.ev.id)}
                    />
                  }
                >
                  <div
                    className={`events-gantt-bar${clippedStart || clippedEnd ? ' events-gantt-bar-muted' : ''}${
                      scheduled ? ' events-gantt-bar-scheduled' : ''
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.8)}%`,
                      top,
                      height: ROW_H,
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
                    }}
                  >
                    {seg.ev.title}
                  </div>
                </Popover>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function EventsCalendarView() {
  const query = trpc.eventsList.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const [selected, setSelected] = useState<Dayjs>(() => dayjs());
  const [search, setSearch] = useState('');
  const [futureOnly, setFutureOnly] = useState(true);

  const events = useMemo(() => {
    const raw = extractEventList(query.data);
    return raw.map(parseEvent).filter((x): x is ParsedEvent => x != null);
  }, [query.data]);

  const searchLower = search.trim().toLowerCase();
  const eventsFiltered = useMemo(() => {
    const now = dayjs();
    let list = futureOnly ? events.filter((ev) => effectiveEventEnd(ev).isAfter(now)) : events;
    if (!searchLower) return list;
    return list.filter((ev) => {
      const hay = `${ev.title} ${ev.location} ${ev.description}`.toLowerCase();
      return hay.includes(searchLower);
    });
  }, [events, searchLower, futureOnly]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const ev of eventsFiltered) {
      const key = ev.start.format('YYYY-MM-DD');
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [eventsFiltered]);

  const { weekStart, weekEnd, weekDays } = useMemo(() => {
    const ws = selected.startOf('week');
    return {
      weekStart: ws,
      weekEnd: ws.endOf('week'),
      weekDays: Array.from({ length: 7 }, (_, i) => ws.add(i, 'day')),
    };
  }, [selected]);

  const eventsForSelectedDay = useMemo(() => {
    const dayKey = selected.format('YYYY-MM-DD');
    return eventsFiltered
      .filter((ev) => ev.start.format('YYYY-MM-DD') === dayKey)
      .sort((a, b) => a.start.valueOf() - b.start.valueOf());
  }, [eventsFiltered, selected]);

  const mySchedule = useMySchedule();

  const timelineEvents = useMemo(() => {
    if (mySchedule.items.length === 0) return eventsFiltered;
    return eventsFiltered.filter((ev) => !eventConflictsWithMySchedule(ev, mySchedule.items));
  }, [eventsFiltered, mySchedule.items]);

  const eventsOnSelectedDayAll = useMemo(
    () => eventsFiltered.filter((ev) => eventIntersectsDay(ev, selected)),
    [eventsFiltered, selected]
  );

  const eventsOnSelectedDayGantt = useMemo(
    () => timelineEvents.filter((ev) => eventIntersectsDay(ev, selected)),
    [timelineEvents, selected]
  );

  const suppressedOnDay = eventsOnSelectedDayAll.length - eventsOnSelectedDayGantt.length;

  const myScheduleIds = useMemo(() => new Set(mySchedule.items.map((x) => x.id)), [mySchedule.items]);

  if (query.isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" message="Could not load events" description={query.error.message} showIcon />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1B1D23' }}>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #3d4149',
          fontWeight: 600,
          fontSize: 14,
          color: '#EFECE2',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <IconCalendar size={18} stroke={1.5} style={{ color: '#6F458F' }} />
        Event calendar
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px 20px',
            flexShrink: 0,
          }}
        >
          <Input.Search
            allowClear
            placeholder="Search title, location, description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 400, flex: '1 1 200px' }}
          />
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <Switch checked={futureOnly} onChange={setFutureOnly} />
            <Typography.Text style={{ color: '#9A9D9A', fontSize: 13 }}>Show only future events</Typography.Text>
          </label>
        </div>
        <Tabs
          className="events-calendar-tabs"
          defaultActiveKey="week"
          items={[
            {
              key: 'week',
              label: 'Week',
              children: (
                <div className="events-calendar-week-layout">
                  <div className="events-week-toolbar">
                    <Button type="text" onClick={() => setSelected((d) => d.subtract(1, 'week'))} style={{ color: '#6F458F' }}>
                      ← Previous week
                    </Button>
                    <Typography.Text strong style={{ color: '#EFECE2', fontSize: 14, flex: 1, textAlign: 'center' }}>
                      {weekStart.format('MMM D')} – {weekEnd.format('MMM D, YYYY')}
                    </Typography.Text>
                    <Button type="text" onClick={() => setSelected((d) => d.add(1, 'week'))} style={{ color: '#6F458F' }}>
                      Next week →
                    </Button>
                    <Button size="small" onClick={() => setSelected(dayjs())} style={{ marginLeft: 8 }}>
                      Today
                    </Button>
                  </div>
                  <div className="events-week-strip" role="row" aria-label="Days this week">
                    {weekDays.map((day) => {
                      const key = day.format('YYYY-MM-DD');
                      const n = byDay.get(key) ?? 0;
                      const isSelected = selected.isSame(day, 'day');
                      const isToday = day.isSame(dayjs(), 'day');
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`events-week-day${isSelected ? ' events-week-day-selected' : ''}${
                            isToday ? ' events-week-day-today' : ''
                          }`}
                          onClick={() => setSelected(day)}
                        >
                          <span className="events-week-day-dow">{day.format('ddd')}</span>
                          <span className="events-week-day-num">{day.date()}</span>
                          {n > 0 ? (
                            <span className="events-week-day-count" title={`${n} event(s)`}>
                              {n} event{n === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="events-week-day-count events-week-day-count-empty"> </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="schedule-calendar-day-list events-calendar-week-list" style={{ gap: 12 }}>
                    <Typography.Text strong style={{ color: '#EFECE2', fontSize: 15, flexShrink: 0 }}>
                      {selected.format('dddd, MMMM D, YYYY')}
                    </Typography.Text>
                    <div
                      className="schedule-calendar-event-scroll"
                      style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
                    >
                      <List
                        className="schedule-calendar-event-list"
                        size="small"
                        dataSource={eventsForSelectedDay}
                        locale={{ emptyText: <Empty description="No events this day" /> }}
                        renderItem={(ev) => (
                          <List.Item style={{ borderColor: '#3d4149', paddingLeft: 0, paddingRight: 0 }}>
                            <List.Item.Meta
                              title={<span style={{ color: '#EFECE2' }}>{ev.title}</span>}
                              description={
                                <div style={{ color: '#9A9D9A', fontSize: 12 }}>
                                  <div>
                                    {ev.start.format('h:mm A')}
                                    {ev.end?.isValid() ? ` – ${ev.end.format('h:mm A')}` : null}
                                    {ev.location ? ` · ${ev.location}` : null}
                                  </div>
                                  {ev.eventType ? (
                                    <div style={{ marginTop: 4, color: '#7A7490' }}>{ev.eventType}</div>
                                  ) : null}
                                  {ev.description ? (
                                    <Typography.Paragraph
                                      ellipsis={{ rows: 3, expandable: true, symbol: 'more' }}
                                      style={{ marginTop: 8, marginBottom: 0, color: '#7A7490' }}
                                    >
                                      {ev.description}
                                    </Typography.Paragraph>
                                  ) : null}
                                </div>
                              }
                            />
                          </List.Item>
                        )}
                      />
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'timeline',
              label: 'Day timeline',
              children: (
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography.Text style={{ color: '#EFECE2', fontWeight: 600 }}>Day</Typography.Text>
                    <DatePicker
                      value={selected}
                      onChange={(d) => {
                        if (d) setSelected(d);
                      }}
                      allowClear={false}
                      format="dddd, MMM D, YYYY"
                      popupStyle={{ zIndex: 1100 }}
                    />
                  </div>
                  {mySchedule.items.length > 0 ? (
                    <div
                      className="events-my-schedule-panel"
                      style={{
                        flexShrink: 0,
                        maxHeight: 160,
                        overflowY: 'auto',
                        border: '1px solid #3d4149',
                        borderRadius: 10,
                        padding: '10px 12px',
                        background: '#24272e',
                      }}
                    >
                      <Typography.Text strong style={{ color: '#EFECE2', fontSize: 13 }}>
                        My schedule ({mySchedule.items.length})
                      </Typography.Text>
                      <Typography.Paragraph
                        type="secondary"
                        style={{ color: '#9A9D9A', fontSize: 11, marginBottom: 8, marginTop: 4 }}
                      >
                        Other events that overlap these times are hidden on the chart. Remove an item to show conflicting events again.
                      </Typography.Paragraph>
                      <List
                        size="small"
                        dataSource={mySchedule.items}
                        locale={{ emptyText: null }}
                        renderItem={(m) => (
                          <List.Item
                            style={{ borderColor: '#353942', padding: '6px 0' }}
                            actions={[
                              <Button key="rm" type="link" size="small" onClick={() => mySchedule.remove(m.id)} style={{ color: '#6F458F' }}>
                                Remove
                              </Button>,
                            ]}
                          >
                            <div>
                              <div style={{ color: '#EFECE2', fontSize: 13 }}>{m.title}</div>
                              <div style={{ color: '#7A7490', fontSize: 11 }}>
                                {dayjs(m.startISO).format('MMM D, h:mm A')}
                                {m.endISO ? ` – ${dayjs(m.endISO).format('h:mm A')}` : ' – 1h default'}
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    </div>
                  ) : null}
                  <EventsDayGantt
                    events={timelineEvents}
                    day={selected}
                    myScheduleIds={myScheduleIds}
                    onAddToSchedule={mySchedule.add}
                    onRemoveFromSchedule={mySchedule.remove}
                    suppressedOnDay={suppressedOnDay}
                    eventsOnDayBeforeFilter={eventsOnSelectedDayAll.length}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
