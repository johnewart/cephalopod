import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, List, Spin, Tag, Typography } from 'antd';
import { IconPuzzle } from '@tabler/icons-react';
import Markdown from 'react-markdown';
import { trpc } from '../lib/trpc';
import {
  huntCallInResultSummary,
  huntDescriptionFromRow,
  huntIdFromRow,
  huntTitleFromRow,
  parseHuntDetailPayload,
  parseHuntListItems,
  parseHuntPuzzleDetailPayload,
  puzzleIdFromRow,
  puzzleLooksSolved,
  puzzleTitleFromRow,
} from '../lib/huntResponse';

function formatIsoLocal(iso?: string): string | undefined {
  if (!iso?.trim()) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function callInRowLabel(row: Record<string, unknown>): { tone: 'success' | 'warning' | 'default'; text: string } {
  if (typeof row.correct === 'string' && row.correct.trim()) {
    return { tone: 'success', text: 'Correct' };
  }
  if (typeof row.hint === 'string' && row.hint.trim()) {
    return { tone: 'warning', text: 'Hint' };
  }
  return { tone: 'default', text: 'Incorrect' };
}

export function HuntsView() {
  const utils = trpc.useUtils();
  const [selectedHuntId, setSelectedHuntId] = useState<string | null>(null);
  const [puzzleDrawerId, setPuzzleDrawerId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const listQuery = trpc.huntsList.useQuery(undefined, { staleTime: 30_000 });
  const huntQuery = trpc.huntGet.useQuery(
    { huntId: selectedHuntId ?? '' },
    { enabled: Boolean(selectedHuntId), staleTime: 15_000 },
  );
  const puzzleQuery = trpc.huntPuzzleGet.useQuery(
    { puzzleId: puzzleDrawerId ?? '' },
    { enabled: Boolean(puzzleDrawerId), staleTime: 10_000 },
  );

  const callInMut = trpc.huntPuzzleCallIn.useMutation({
    onSuccess: (data) => {
      setFeedback(huntCallInResultSummary(data));
      if (puzzleDrawerId) void utils.huntPuzzleGet.invalidate({ puzzleId: puzzleDrawerId });
      if (selectedHuntId) void utils.huntGet.invalidate({ huntId: selectedHuntId });
      void utils.huntsList.invalidate();
      setAnswerDraft('');
    },
    onError: (e) => setFeedback(e.message),
  });

  useEffect(() => {
    setAnswerDraft('');
    setFeedback(null);
  }, [puzzleDrawerId]);

  const hunts = useMemo(() => parseHuntListItems(listQuery.data), [listQuery.data]);
  const huntDetail = useMemo(() => parseHuntDetailPayload(huntQuery.data), [huntQuery.data]);
  const puzzleDetail = useMemo(() => parseHuntPuzzleDetailPayload(puzzleQuery.data), [puzzleQuery.data]);

  const drawerOpen = puzzleDrawerId != null;

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
        <Alert type="error" message="Could not load hunts" description={listQuery.error.message} showIcon />
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
          <IconPuzzle size={18} stroke={1.5} style={{ color: '#6F458F' }} />
          Hunts
        </div>
        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#9A9D9A' }}
        >
          Cruise puzzle hunts from Twitarr. Open a hunt to see unlocked puzzles and submit answers.
        </Typography.Paragraph>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px 20px' }}>
        {!selectedHuntId ? (
          hunts.length === 0 ? (
            <Empty description="No hunts available" styles={{ description: { color: '#9A9D9A' } }} />
          ) : (
            <List
              dataSource={hunts}
              renderItem={(row) => {
                const id = huntIdFromRow(row);
                const title = huntTitleFromRow(row);
                const desc = huntDescriptionFromRow(row);
                return (
                  <List.Item
                    style={{
                      cursor: id ? 'pointer' : 'default',
                      borderBottom: '1px solid #2f3238',
                      padding: '12px 8px',
                    }}
                    onClick={() => id && setSelectedHuntId(id)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#EFECE2', fontSize: 14 }}>{title}</div>
                      {desc ? (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: '#9A9D9A',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {desc}
                        </div>
                      ) : null}
                    </div>
                  </List.Item>
                );
              }}
            />
          )
        ) : huntQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : huntQuery.isError ? (
          <Alert type="error" message="Could not load hunt" description={huntQuery.error.message} showIcon />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Button
                type="link"
                style={{ padding: 0, color: '#9A9D9A', marginBottom: 8 }}
                onClick={() => {
                  setSelectedHuntId(null);
                  setPuzzleDrawerId(null);
                }}
              >
                ← All hunts
              </Button>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#EFECE2' }}>
                {huntDetail.title ?? huntTitleFromRow({ title: '', huntID: selectedHuntId })}
              </div>
              {huntDetail.description ? (
                <div style={{ marginTop: 10, fontSize: 13, color: '#cfcac0', lineHeight: 1.55 }}>
                  <Markdown>{huntDetail.description}</Markdown>
                </div>
              ) : null}
              {huntDetail.nextUnlockTime ? (
                <div style={{ marginTop: 12, fontSize: 12, color: '#c9a227' }}>
                  Next puzzle unlocks: {formatIsoLocal(huntDetail.nextUnlockTime) ?? huntDetail.nextUnlockTime}
                </div>
              ) : null}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
                Unlocked puzzles
              </div>
              {huntDetail.puzzles.length === 0 ? (
                <div style={{ marginTop: 8, fontSize: 13, color: '#9A9D9A' }}>
                  No puzzles are unlocked yet. Check back after the next unlock time.
                </div>
              ) : (
                <List
                  style={{ marginTop: 8 }}
                  dataSource={huntDetail.puzzles}
                  renderItem={(row) => {
                    const pid = puzzleIdFromRow(row);
                    const title = puzzleTitleFromRow(row);
                    const solved = puzzleLooksSolved(row);
                    return (
                      <List.Item
                        style={{
                          cursor: pid ? 'pointer' : 'default',
                          borderBottom: '1px solid #2f3238',
                          padding: '10px 4px',
                        }}
                        onClick={() => pid && setPuzzleDrawerId(pid)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                          <span style={{ flex: 1, color: '#EFECE2', fontSize: 14 }}>{title}</span>
                          {solved ? (
                            <Tag color="green" style={{ margin: 0 }}>
                              Solved
                            </Tag>
                          ) : (
                            <Tag style={{ margin: 0 }}>Open</Tag>
                          )}
                        </div>
                      </List.Item>
                    );
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <Drawer
        title={puzzleDetail.puzzleTitle ?? 'Puzzle'}
        placement="right"
        width={440}
        open={drawerOpen}
        onClose={() => setPuzzleDrawerId(null)}
        destroyOnClose
        styles={{
          body: { background: '#1B1D23', color: '#EFECE2' },
          header: { background: '#25272e', borderBottom: '1px solid #3d4149', color: '#EFECE2' },
        }}
      >
        {puzzleDetail.huntTitle ? (
          <div style={{ fontSize: 12, color: '#9A9D9A', marginBottom: 12 }}>{puzzleDetail.huntTitle}</div>
        ) : null}

        {puzzleQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : puzzleQuery.isError ? (
          <Alert
            type="warning"
            showIcon
            message="Could not open puzzle"
            description={
              <>
                {puzzleQuery.error.message}
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  It may still be locked, or the puzzle id is invalid.
                </div>
              </>
            }
          />
        ) : (
          <>
            {puzzleDetail.body ? (
              <div style={{ fontSize: 13, color: '#cfcac0', lineHeight: 1.55, marginBottom: 16 }}>
                <Markdown>{puzzleDetail.body}</Markdown>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#9A9D9A', marginBottom: 16 }}>No puzzle text from server.</div>
            )}

            <div style={{ fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
              Your submissions
            </div>
            {puzzleDetail.callIns.length === 0 ? (
              <div style={{ marginTop: 6, fontSize: 12, color: '#9A9D9A' }}>None yet.</div>
            ) : (
              <List
                style={{ marginTop: 8 }}
                dataSource={puzzleDetail.callIns}
                renderItem={(row) => {
                  const raw = typeof row.rawSubmission === 'string' ? row.rawSubmission : '—';
                  const when = typeof row.creationTime === 'string' ? formatIsoLocal(row.creationTime) : undefined;
                  const { tone, text } = callInRowLabel(row);
                  const color = tone === 'success' ? 'green' : tone === 'warning' ? 'gold' : 'default';
                  return (
                    <List.Item style={{ borderBottom: '1px solid #2f3238', padding: '8px 0' }}>
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Tag color={color} style={{ margin: 0 }}>
                            {text}
                          </Tag>
                          {when ? <span style={{ fontSize: 11, color: '#6d7178' }}>{when}</span> : null}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13, color: '#EFECE2', wordBreak: 'break-word' }}>{raw}</div>
                        {typeof row.hint === 'string' && row.hint.trim() ? (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#e0c266' }}>{row.hint.trim()}</div>
                        ) : null}
                        {typeof row.correct === 'string' && row.correct.trim() ? (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#7fd8a0' }}>{row.correct.trim()}</div>
                        ) : null}
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}

            <div style={{ marginTop: 20, fontSize: 11, fontWeight: 600, color: '#6d7178', textTransform: 'uppercase' }}>
              Call in an answer
            </div>
            <Typography.Paragraph style={{ marginTop: 6, marginBottom: 10, fontSize: 12, color: '#9A9D9A' }}>
              Answers are sent as plain text (case and spacing are normalized on the server). If you have already solved
              this puzzle, new submissions may be rejected.
            </Typography.Paragraph>
            <Input.TextArea
              value={answerDraft}
              onChange={(e) => setAnswerDraft(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 6 }}
              placeholder="Your answer"
              disabled={callInMut.isPending}
              style={{ background: '#16171C', borderColor: '#3d4149', color: '#EFECE2' }}
            />
            <Button
              type="primary"
              style={{ marginTop: 10 }}
              loading={callInMut.isPending}
              disabled={!puzzleDrawerId || !answerDraft.trim()}
              onClick={() => {
                if (!puzzleDrawerId) return;
                setFeedback(null);
                callInMut.mutate({ puzzleId: puzzleDrawerId, answer: answerDraft.trim() });
              }}
            >
              Submit
            </Button>
            {feedback ? (
              <Alert
                style={{ marginTop: 12 }}
                type={feedback.startsWith('Correct') ? 'success' : 'info'}
                showIcon
                message={feedback}
              />
            ) : null}
          </>
        )}
      </Drawer>
    </div>
  );
}
