import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Col,
  Drawer,
  Empty,
  Input,
  InputNumber,
  List,
  Masonry,
  Radio,
  Row,
  Select,
  Slider,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { IconChess, IconStar, IconStarFilled } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import {
  boardgameBoolField,
  boardgameIdFromRow,
  boardgameTitleFromRow,
  parseBoardgameListPayload,
} from '../lib/boardgameResponse';
import {
  DEFAULT_BOARDGAME_FILTERS,
  boardgameFiltersActive,
  collectBoardgameFilterOptions,
  filterBoardgames,
  type BoardgameClientFilterState,
} from '../lib/boardgameFilters';

const BOARDGAME_FILTER_SELECT_STYLES = { popup: { root: { background: '#25272e' } } } as const;

const DESCRIPTION_SNIPPET_MAX_CHARS = 200;

function boardgameDescriptionSnippet(
  row: Record<string, unknown>,
  maxLen = DESCRIPTION_SNIPPET_MAX_CHARS,
): string | undefined {
  const raw = row.gameDescription ?? row.description;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  let s = raw.trim();
  s = s.replace(/\[(.+?)\]\([^)]*\)/g, '$1');
  s = s.replace(/`{1,3}[^`]*`{1,3}/g, ' ');
  s = s.replace(/[*_#>|]/g, '');
  s = s.replace(/\s+/g, ' ');
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trimEnd()}…`;
}

function optInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim()) {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function optFloat(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function stringArrayField(row: Record<string, unknown>, key: string): string[] {
  const v = row[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** Best-effort cover URL for masonry cards when the API includes one. */
function boardgameCoverUrl(baseUrl: string, row: Record<string, unknown>): string | undefined {
  const root = baseUrl.replace(/\/$/, '');
  const keys = [
    'thumbnailURL',
    'thumbURL',
    'thumbUrl',
    'imageURL',
    'imageUrl',
    'gameImage',
    'coverImage',
    'photo',
    'image',
  ];
  for (const k of keys) {
    const v = row[k];
    if (typeof v !== 'string' || !v.trim()) continue;
    const c = v.trim();
    if (/^https?:\/\//i.test(c)) return c;
    if (c.startsWith('/')) return `${root}${c}`;
  }
  return undefined;
}

function BoardgameSearchCard({
  row,
  baseUrl,
  onOpen,
}: {
  row: Record<string, unknown>;
  baseUrl: string;
  onOpen: (row: Record<string, unknown>) => void;
}) {
  const id = boardgameIdFromRow(row);
  const title = boardgameTitleFromRow(row);
  const copies = optInt(row.numCopies);
  const minP = optInt(row.minPlayers);
  const maxP = optInt(row.maxPlayers);
  const time = optInt(row.avgPlayingTime ?? row.maxPlayingTime ?? row.minPlayingTime);
  const rating = optFloat(row.avgRating);
  const fav = boardgameBoolField(row, ['isFavorite']);
  const expansion = boardgameBoolField(row, ['isExpansion']);
  const cover = baseUrl ? boardgameCoverUrl(baseUrl, row) : undefined;
  const categories = stringArrayField(row, 'categories');
  const descSnippet = boardgameDescriptionSnippet(row);

  const metaParts: string[] = [];
  if (copies != null) metaParts.push(`${copies} cop${copies === 1 ? 'y' : 'ies'}`);
  if (minP != null && maxP != null) metaParts.push(`${minP}–${maxP} players`);
  else if (minP != null) metaParts.push(`${minP}+ players`);
  if (time != null) metaParts.push(`~${time} min`);
  if (rating != null) metaParts.push(`${rating.toFixed(1)} / 10`);

  const previewTags = categories.slice(0, 4);

  return (
    <div
      role={id ? 'button' : undefined}
      tabIndex={id ? 0 : undefined}
      onKeyDown={(e) => {
        if (!id) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row);
        }
      }}
      onClick={() => id && onOpen(row)}
      style={{
        borderRadius: 10,
        overflow: 'hidden',
        background: '#2A2D34',
        border: '1px solid #3d4149',
        cursor: id ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {cover ? (
        <div style={{ lineHeight: 0, background: '#1B1D23' }}>
          <img
            src={cover}
            alt=""
            style={{
              width: '100%',
              display: 'block',
              maxHeight: 220,
              objectFit: 'cover',
              aspectRatio: '3/2',
            }}
          />
        </div>
      ) : null}
      <div
        style={{
          padding: 12,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#EFECE2', fontSize: 14, lineHeight: 1.35 }}>{title}</span>
              {expansion ? (
                <Tag color="purple" style={{ margin: 0 }}>
                  Expansion
                </Tag>
              ) : null}
            </div>
            {metaParts.length > 0 ? (
              <div style={{ marginTop: 6, fontSize: 12, color: '#9A9D9A', lineHeight: 1.4 }}>
                {metaParts.join(' · ')}
              </div>
            ) : null}
            {descSnippet ? (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#8a8d94',
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {descSnippet}
              </div>
            ) : null}
          </div>
          {id ? (
            <div
              style={{ flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <FavoriteStarButton gameId={id} isFavorite={fav} />
            </div>
          ) : null}
        </div>
        {previewTags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
            {previewTags.map((t, i) => (
              <Tag key={`${t}-${i}`} color="blue" style={{ margin: 0, fontSize: 11 }}>
                {t}
              </Tag>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FavoriteStarButton({
  gameId,
  isFavorite,
  disabled,
}: {
  gameId: string;
  isFavorite: boolean;
  disabled?: boolean;
}) {
  const utils = trpc.useUtils();
  const addMut = trpc.boardgameFavoriteAdd.useMutation({
    onSuccess: () => {
      void utils.boardgamesList.invalidate();
      void utils.boardgameExpansions.invalidate();
    },
  });
  const removeMut = trpc.boardgameFavoriteRemove.useMutation({
    onSuccess: () => {
      void utils.boardgamesList.invalidate();
      void utils.boardgameExpansions.invalidate();
    },
  });
  const pending = addMut.isPending || removeMut.isPending;

  return (
    <Button
      type="text"
      disabled={disabled || pending}
      aria-label={isFavorite ? 'Remove favorite' : 'Add favorite'}
      onClick={(e) => {
        e.stopPropagation();
        if (isFavorite) removeMut.mutate({ gameId });
        else addMut.mutate({ gameId });
      }}
      icon={
        isFavorite ? (
          <IconStarFilled size={18} stroke={1.5} style={{ color: '#c9a227' }} />
        ) : (
          <IconStar size={18} stroke={1.5} style={{ color: '#9A9D9A' }} />
        )
      }
    />
  );
}

export function BoardgamesView() {
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [clientFilters, setClientFilters] = useState<BoardgameClientFilterState>(() => ({
    ...DEFAULT_BOARDGAME_FILTERS,
  }));
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

  /** Tighter than app defaults — search/filters should feel responsive. */
  const listQuery = trpc.boardgamesList.useQuery(
    {
      search: debouncedSearch || undefined,
      favorite: favoritesOnly ? true : undefined,
      start: 0,
      limit: 200,
    },
    { staleTime: 20_000 },
  );

  const parsed = useMemo(() => parseBoardgameListPayload(listQuery.data), [listQuery.data]);

  const filterOptions = useMemo(
    () => collectBoardgameFilterOptions(parsed.games),
    [parsed.games],
  );
  const filteredGames = useMemo(
    () => filterBoardgames(parsed.games, clientFilters),
    [parsed.games, clientFilters],
  );

  const boardgameMasonryItems = useMemo(
    () =>
      filteredGames.map((row, i) => ({
        key: boardgameIdFromRow(row) ?? `boardgame-${i}`,
        data: row,
      })),
    [filteredGames],
  );

  const detailId = detailRow ? boardgameIdFromRow(detailRow) : undefined;
  const hasExpansions = detailRow ? boardgameBoolField(detailRow, ['hasExpansions']) : false;

  const expansionsQuery = trpc.boardgameExpansions.useQuery(
    { gameId: detailId ?? '' },
    { enabled: Boolean(detailId && hasExpansions), staleTime: 10 * 60 * 1000 },
  );

  const expansionGames = useMemo(() => {
    if (!expansionsQuery.data) return [];
    return parseBoardgameListPayload(expansionsQuery.data).games;
  }, [expansionsQuery.data]);

  if (listQuery.isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Could not load board games"
          description={listQuery.error.message}
          showIcon
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1B1D23' }}>
      <div
        style={{
          flexShrink: 0,
          padding: '16px 20px',
          borderBottom: '1px solid #3d4149',
          background: '#1B1D23',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: '#EFECE2',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <IconChess size={18} stroke={1.5} style={{ color: '#6F458F' }} />
          Board game library
        </div>
        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#9A9D9A' }}
        >
          Games available in the onboard library (from Twitarr). Favorite games you want to find quickly.
        </Typography.Paragraph>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 12px',
            alignItems: 'center',
          }}
        >
          <Input
            allowClear
            placeholder="Search by title"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              flex: '1 1 220px',
              maxWidth: 420,
              minWidth: 180,
              background: '#1B1D23',
              borderColor: '#3d4149',
              color: '#EFECE2',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#EFECE2', fontSize: 13 }}>
            <Switch checked={favoritesOnly} onChange={setFavoritesOnly} size="small" />
            Favorites only
          </div>
        </div>
        <Collapse
          ghost
          style={{ marginTop: 12 }}
          items={[
            {
              key: 'filters',
              label: (
                <span style={{ color: '#EFECE2', fontSize: 13 }}>
                  Filters
                  {boardgameFiltersActive(clientFilters) ? (
                    <Tag style={{ marginLeft: 8, marginBottom: 0 }} color="purple">
                      Active
                    </Tag>
                  ) : null}
                </span>
              ),
              children: (
                <div style={{ paddingTop: 2 }}>
                  <Row gutter={[12, 14]}>
                    <Col xs={24} sm={12} md={8}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>Players (headcount)</div>
                      <Space size={8} wrap>
                        <InputNumber
                          min={1}
                          max={99}
                          placeholder="Min"
                          value={clientFilters.playersMin ?? undefined}
                          onChange={(v) =>
                            setClientFilters((f) => ({ ...f, playersMin: v == null ? null : Number(v) }))
                          }
                          style={{ width: 100, background: '#1B1D23', borderColor: '#3d4149', color: '#EFECE2' }}
                          controls={false}
                        />
                        <InputNumber
                          min={1}
                          max={99}
                          placeholder="Max"
                          value={clientFilters.playersMax ?? undefined}
                          onChange={(v) =>
                            setClientFilters((f) => ({ ...f, playersMax: v == null ? null : Number(v) }))
                          }
                          style={{ width: 100, background: '#1B1D23', borderColor: '#3d4149', color: '#EFECE2' }}
                          controls={false}
                        />
                      </Space>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>Play time (minutes)</div>
                      <Space size={8} wrap>
                        <InputNumber
                          min={0}
                          max={9999}
                          placeholder="Min"
                          value={clientFilters.playTimeMin ?? undefined}
                          onChange={(v) =>
                            setClientFilters((f) => ({ ...f, playTimeMin: v == null ? null : Number(v) }))
                          }
                          style={{ width: 100, background: '#1B1D23', borderColor: '#3d4149', color: '#EFECE2' }}
                          controls={false}
                        />
                        <InputNumber
                          min={0}
                          max={9999}
                          placeholder="Max"
                          value={clientFilters.playTimeMax ?? undefined}
                          onChange={(v) =>
                            setClientFilters((f) => ({ ...f, playTimeMax: v == null ? null : Number(v) }))
                          }
                          style={{ width: 100, background: '#1B1D23', borderColor: '#3d4149', color: '#EFECE2' }}
                          controls={false}
                        />
                      </Space>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>
                        Max min age (leave empty for any)
                      </div>
                      <InputNumber
                        min={1}
                        max={99}
                        placeholder="e.g. 10"
                        value={clientFilters.minAgeMax ?? undefined}
                        onChange={(v) =>
                          setClientFilters((f) => ({ ...f, minAgeMax: v == null ? null : Number(v) }))
                        }
                        style={{ width: 120, background: '#1B1D23', borderColor: '#3d4149', color: '#EFECE2' }}
                        controls={false}
                      />
                    </Col>
                    <Col span={24}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>
                        Complexity (BGG weight, 1–5)
                      </div>
                      <Slider
                        range
                        min={1}
                        max={5}
                        step={0.1}
                        marks={{ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }}
                        value={[clientFilters.complexityMin, clientFilters.complexityMax]}
                        onChange={(v) => {
                          const [a, b] = v as number[];
                          setClientFilters((f) => ({ ...f, complexityMin: a, complexityMax: b }));
                        }}
                        tooltip={{ formatter: (n) => (n != null ? n.toFixed(1) : '') }}
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>Type — include any</div>
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="Any type"
                        value={clientFilters.types}
                        onChange={(types) =>
                          setClientFilters((f) => ({
                            ...f,
                            types,
                            typesExclude: f.typesExclude.filter((x) => !types.includes(x)),
                          }))
                        }
                        options={filterOptions.typeOptions.map((t) => ({ label: t, value: t }))}
                        style={{ width: '100%' }}
                        styles={BOARDGAME_FILTER_SELECT_STYLES}
                        maxTagCount="responsive"
                      />
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6, marginTop: 10 }}>
                        Type — exclude any
                      </div>
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="None"
                        value={clientFilters.typesExclude}
                        onChange={(typesExclude) =>
                          setClientFilters((f) => ({
                            ...f,
                            typesExclude,
                            types: f.types.filter((x) => !typesExclude.includes(x)),
                          }))
                        }
                        options={filterOptions.typeOptions.map((t) => ({ label: t, value: t }))}
                        style={{ width: '100%' }}
                        styles={BOARDGAME_FILTER_SELECT_STYLES}
                        maxTagCount="responsive"
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>Category</div>
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="Any category"
                        value={clientFilters.categories}
                        onChange={(categories) => setClientFilters((f) => ({ ...f, categories }))}
                        options={filterOptions.categoryOptions.map((t) => ({ label: t, value: t }))}
                        style={{ width: '100%' }}
                        styles={BOARDGAME_FILTER_SELECT_STYLES}
                        maxTagCount="responsive"
                      />
                    </Col>
                    <Col xs={24} md={8}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>Mechanics — include any</div>
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="Any mechanic"
                        value={clientFilters.mechanics}
                        onChange={(mechanics) =>
                          setClientFilters((f) => ({
                            ...f,
                            mechanics,
                            mechanicsExclude: f.mechanicsExclude.filter((x) => !mechanics.includes(x)),
                          }))
                        }
                        options={filterOptions.mechanicOptions.map((t) => ({ label: t, value: t }))}
                        style={{ width: '100%' }}
                        styles={BOARDGAME_FILTER_SELECT_STYLES}
                        maxTagCount="responsive"
                      />
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6, marginTop: 10 }}>
                        Mechanics — exclude any
                      </div>
                      <Select
                        mode="multiple"
                        allowClear
                        placeholder="None"
                        value={clientFilters.mechanicsExclude}
                        onChange={(mechanicsExclude) =>
                          setClientFilters((f) => ({
                            ...f,
                            mechanicsExclude,
                            mechanics: f.mechanics.filter((x) => !mechanicsExclude.includes(x)),
                          }))
                        }
                        options={filterOptions.mechanicOptions.map((t) => ({ label: t, value: t }))}
                        style={{ width: '100%' }}
                        styles={BOARDGAME_FILTER_SELECT_STYLES}
                        maxTagCount="responsive"
                      />
                    </Col>
                    <Col span={24}>
                      <div style={{ fontSize: 11, color: '#6d7178', marginBottom: 6 }}>Availability</div>
                      <Radio.Group
                        value={clientFilters.availability}
                        onChange={(e) =>
                          setClientFilters((f) => ({ ...f, availability: e.target.value }))
                        }
                        options={[
                          { label: 'Any', value: 'any' },
                          { label: 'Available (≥1 copy)', value: 'available' },
                          { label: 'Unavailable (0 copies)', value: 'unavailable' },
                        ]}
                      />
                    </Col>
                  </Row>
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingLeft: 0, color: '#b8a3d4' }}
                      disabled={!boardgameFiltersActive(clientFilters)}
                      onClick={() => setClientFilters({ ...DEFAULT_BOARDGAME_FILTERS })}
                    >
                      Reset filters
                    </Button>
                  </div>
                </div>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 10, fontSize: 12, color: '#6d7178' }}>
          Showing {filteredGames.length} of {parsed.games.length} loaded
          {parsed.total !== parsed.games.length ? ` (${parsed.total} reported by server)` : ''}
          {boardgameFiltersActive(clientFilters) && parsed.games.length > 0 ? ' — filters narrow the loaded page' : ''}
          {parsed.limit < parsed.total && parsed.games.length >= parsed.limit
            ? ' — refine search to narrow what is loaded'
            : ''}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px 20px' }}>
        {parsed.games.length === 0 ? (
          <Empty
            description={debouncedSearch || favoritesOnly ? 'No games match your filters' : 'No games in the library'}
            styles={{ description: { color: '#9A9D9A' } }}
          />
        ) : filteredGames.length === 0 ? (
          <Empty
            description="No games match these filters"
            styles={{ description: { color: '#9A9D9A' } }}
          >
            <Button type="primary" onClick={() => setClientFilters({ ...DEFAULT_BOARDGAME_FILTERS })}>
              Clear filters
            </Button>
          </Empty>
        ) : (
          <Masonry
            gutter={[14, 14]}
            columns={{ xs: 1, sm: 2, md: 2, lg: 3, xl: 4 }}
            items={boardgameMasonryItems}
            itemRender={({ data: row }) => (
              <BoardgameSearchCard
                row={row}
                baseUrl={baseUrl}
                onOpen={(r) => {
                  if (boardgameIdFromRow(r)) setDetailRow(r);
                }}
              />
            )}
          />
        )}
      </div>

      <Drawer
        title={detailRow ? boardgameTitleFromRow(detailRow) : 'Game'}
        placement="right"
        width={440}
        onClose={() => setDetailRow(null)}
        open={detailRow != null}
        styles={{
          body: { background: '#1B1D23', color: '#EFECE2' },
          header: { background: '#25272e', borderBottom: '1px solid #3d4149', color: '#EFECE2' },
        }}
        extra={
          detailId ? (
            <FavoriteStarButton
              gameId={detailId}
              isFavorite={boardgameBoolField(detailRow ?? {}, ['isFavorite'])}
            />
          ) : null
        }
      >
        {detailRow ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(() => {
              const copies = optInt(detailRow.numCopies);
              const donated = detailRow.donatedBy;
              const notes = detailRow.notes;
              const desc = detailRow.gameDescription;
              const minP = optInt(detailRow.minPlayers);
              const maxP = optInt(detailRow.maxPlayers);
              const sug = optInt(detailRow.suggestedPlayers);
              const timeMin = optInt(detailRow.minPlayingTime);
              const timeMax = optInt(detailRow.maxPlayingTime);
              const timeAvg = optInt(detailRow.avgPlayingTime);
              const age = optInt(detailRow.minAge);
              const complexity = optFloat(detailRow.complexity);
              const categories = stringArrayField(detailRow, 'categories');
              const mechanics = stringArrayField(detailRow, 'mechanics');
              const types = stringArrayField(detailRow, 'gameTypes');

              let playTimeLabel: string | undefined;
              if (timeMin != null && timeMax != null) {
                playTimeLabel = timeMin === timeMax ? `${timeMin} min` : `${timeMin}–${timeMax} min`;
              } else if (timeAvg != null) {
                playTimeLabel = `~${timeAvg} min (avg)`;
              } else if (timeMin != null) {
                playTimeLabel = `${timeMin}+ min`;
              } else if (timeMax != null) {
                playTimeLabel = `up to ${timeMax} min`;
              }

              return (
                <>
                  <div style={{ fontSize: 13, color: '#9A9D9A', lineHeight: 1.5 }}>
                    {copies != null ? (
                      <div>
                        <strong style={{ color: '#EFECE2' }}>Copies aboard:</strong> {copies}
                      </div>
                    ) : null}
                    {typeof donated === 'string' && donated.trim() ? (
                      <div>
                        <strong style={{ color: '#EFECE2' }}>Donated by:</strong> {donated.trim()}
                      </div>
                    ) : null}
                    {minP != null || maxP != null ? (
                      <div>
                        <strong style={{ color: '#EFECE2' }}>Players:</strong>{' '}
                        {minP != null && maxP != null ? `${minP}–${maxP}` : minP ?? maxP}
                        {sug != null ? ` (suggested ${sug})` : ''}
                      </div>
                    ) : null}
                    {playTimeLabel ? (
                      <div>
                        <strong style={{ color: '#EFECE2' }}>Play time:</strong> {playTimeLabel}
                      </div>
                    ) : null}
                    {age != null ? (
                      <div>
                        <strong style={{ color: '#EFECE2' }}>Min age:</strong> {age}+
                      </div>
                    ) : null}
                    {complexity != null ? (
                      <div>
                        <strong style={{ color: '#EFECE2' }}>Complexity (BGG):</strong> {complexity.toFixed(1)} / 5
                      </div>
                    ) : null}
                  </div>

                  {typeof notes === 'string' && notes.trim() ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                        Library notes
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, color: '#cfcac0', whiteSpace: 'pre-wrap' }}>
                        {notes.trim()}
                      </div>
                    </div>
                  ) : null}

                  {types.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                        Types
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {types.map((t) => (
                          <Tag key={t} style={{ margin: 0 }}>
                            {t}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {categories.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                        Categories
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {categories.map((t) => (
                          <Tag key={t} color="blue" style={{ margin: 0 }}>
                            {t}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {mechanics.length > 0 ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                        Mechanics
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {mechanics.map((t) => (
                          <Tag key={t} color="geekblue" style={{ margin: 0 }}>
                            {t}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {typeof desc === 'string' && desc.trim() ? (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                        Description
                      </div>
                      <div
                        className="boardgame-markdown"
                        style={{ marginTop: 8, fontSize: 13, color: '#cfcac0', lineHeight: 1.55 }}
                      >
                        <Markdown>{desc.trim()}</Markdown>
                      </div>
                    </div>
                  ) : null}
                </>
              );
            })()}

            {hasExpansions ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                  Expansions
                </div>
                {expansionsQuery.isLoading ? (
                  <div style={{ marginTop: 12 }}>
                    <Spin />
                  </div>
                ) : expansionsQuery.isError ? (
                  <Alert type="warning" showIcon style={{ marginTop: 8 }} message={expansionsQuery.error.message} />
                ) : expansionGames.length <= 1 ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#9A9D9A' }}>No expansion entries returned.</div>
                ) : (
                  <List
                    style={{ marginTop: 8 }}
                    dataSource={expansionGames.slice(1)}
                    renderItem={(row) => {
                      const id = boardgameIdFromRow(row);
                      const title = boardgameTitleFromRow(row);
                      return (
                        <List.Item style={{ borderBottom: '1px solid #2f3238', padding: '8px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                            <span style={{ flex: 1, color: '#EFECE2', fontSize: 13 }}>{title}</span>
                            {id ? (
                              <FavoriteStarButton gameId={id} isFavorite={boardgameBoolField(row, ['isFavorite'])} />
                            ) : null}
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
