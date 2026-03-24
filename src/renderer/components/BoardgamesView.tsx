import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  List,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { IconChess, IconStar, IconStarFilled } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import { trpc } from '../lib/trpc';
import {
  boardgameBoolField,
  boardgameIdFromRow,
  boardgameTitleFromRow,
  parseBoardgameListPayload,
} from '../lib/boardgameResponse';

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
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

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

  const detailId = detailRow ? boardgameIdFromRow(detailRow) : undefined;
  const hasExpansions = detailRow ? boardgameBoolField(detailRow, ['hasExpansions']) : false;

  const expansionsQuery = trpc.boardgameExpansions.useQuery(
    { gameId: detailId ?? '' },
    { enabled: Boolean(detailId && hasExpansions) },
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
        <div style={{ marginTop: 10, fontSize: 12, color: '#6d7178' }}>
          Showing {parsed.games.length} of {parsed.total} games
          {parsed.limit < parsed.total && parsed.games.length >= parsed.limit ? ' — refine search to narrow results' : ''}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px 20px' }}>
        {parsed.games.length === 0 ? (
          <Empty
            description={debouncedSearch || favoritesOnly ? 'No games match your filters' : 'No games in the library'}
            styles={{ description: { color: '#9A9D9A' } }}
          />
        ) : (
          <List
            dataSource={parsed.games}
            renderItem={(row) => {
              const id = boardgameIdFromRow(row);
              const title = boardgameTitleFromRow(row);
              const copies = optInt(row.numCopies);
              const minP = optInt(row.minPlayers);
              const maxP = optInt(row.maxPlayers);
              const time = optInt(row.avgPlayingTime ?? row.maxPlayingTime ?? row.minPlayingTime);
              const rating = optFloat(row.avgRating);
              const fav = boardgameBoolField(row, ['isFavorite']);
              const expansion = boardgameBoolField(row, ['isExpansion']);

              const metaParts: string[] = [];
              if (copies != null) metaParts.push(`${copies} cop${copies === 1 ? 'y' : 'ies'}`);
              if (minP != null && maxP != null) metaParts.push(`${minP}–${maxP} players`);
              else if (minP != null) metaParts.push(`${minP}+ players`);
              if (time != null) metaParts.push(`~${time} min`);
              if (rating != null) metaParts.push(`${rating.toFixed(1)} / 10`);

              return (
                <List.Item
                  style={{
                    cursor: id ? 'pointer' : 'default',
                    borderBottom: '1px solid #2f3238',
                    padding: '12px 8px',
                  }}
                  onClick={() => id && setDetailRow(row)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#EFECE2', fontSize: 14 }}>{title}</span>
                        {expansion ? (
                          <Tag color="purple" style={{ margin: 0 }}>
                            Expansion
                          </Tag>
                        ) : null}
                      </div>
                      {metaParts.length > 0 ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9A9D9A' }}>{metaParts.join(' · ')}</div>
                      ) : null}
                    </div>
                    {id ? <FavoriteStarButton gameId={id} isFavorite={fav} /> : null}
                  </div>
                </List.Item>
              );
            }}
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
