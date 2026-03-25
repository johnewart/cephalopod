import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Button,
  Empty,
  Image,
  Masonry,
  Modal,
  Select,
  Spin,
  Typography,
  message,
} from 'antd';
import { IconPhoto, IconUpload } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';
import { swapTwitarrThumbToFull, twitarrImageUrl } from '../lib/twitarrImage';
import {
  FORUM_POST_IMAGE_ACCEPT,
  TWITARR_IMAGE_UPLOAD_MAX_BYTES,
  arrayBufferToBase64,
} from '../lib/imageBase64';

const PAGE_LIMIT = 48;

function extractPhotoRecords(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(
      (x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
    );
  }
  if (typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  const keys = ['photos', 'photostreamPhotos', 'streamPhotos', 'photostream', 'items', 'results'];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return extractPhotoRecords(v);
  }
  return [];
}

function resolveImageSources(
  baseUrl: string,
  item: Record<string, unknown>
): { thumb: string; preview: string } | null {
  const root = baseUrl.replace(/\/$/, '');
  const candidates: unknown[] = [
    item.fullURL,
    item.fullUrl,
    item.url,
    item.imageURL,
    item.imageUrl,
    item.mediumURL,
    item.mediumUrl,
    item.thumbURL,
    item.thumbUrl,
    item.thumbnailURL,
    item.thumbnailUrl,
    item.image,
  ];

  for (const c of candidates) {
    if (typeof c !== 'string' || c.length === 0) continue;

    if (/^https?:\/\//i.test(c)) {
      const preview = swapTwitarrThumbToFull(c);
      return { thumb: c, preview: preview !== c ? preview : c };
    }

    if (c.startsWith('/')) {
      const abs = `${root}${c}`;
      const preview = swapTwitarrThumbToFull(abs);
      return { thumb: abs, preview: preview !== abs ? preview : abs };
    }

    // Bare filename (e.g. PhotostreamImageData.image — UUID.jpg); do not use `${root}/${c}`.
    if (!c.includes('/')) {
      return {
        thumb: twitarrImageUrl(baseUrl, c, 'thumb'),
        preview: twitarrImageUrl(baseUrl, c, 'full'),
      };
    }

    const abs = `${root}/${c}`;
    const preview = swapTwitarrThumbToFull(abs);
    return { thumb: abs, preview: preview !== abs ? preview : abs };
  }

  return null;
}

function pickCaption(item: Record<string, unknown>): string | undefined {
  const caption = item.caption ?? item.title ?? item.text ?? item.description;
  if (typeof caption === 'string' && caption.trim()) return caption.trim();
  const author = item.author;
  if (author && typeof author === 'object' && author !== null) {
    const u = (author as Record<string, unknown>).username;
    if (typeof u === 'string') return `@${u}`;
  }
  return undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** `PhotostreamLocationData` from `GET /api/v3/photostream/placenames`. */
function parsePhotostreamPlacenames(raw: unknown): {
  events: { id: string; title: string }[];
  locations: string[];
} {
  if (!isRecord(raw)) return { events: [], locations: [] };
  const locRaw = raw.locations;
  const locations = Array.isArray(locRaw)
    ? locRaw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const evRaw = raw.events;
  const events: { id: string; title: string }[] = [];
  if (Array.isArray(evRaw)) {
    for (const row of evRaw) {
      if (!isRecord(row)) continue;
      const id = row.eventID ?? row.eventId ?? row.event_id;
      const title = row.title;
      const idStr =
        typeof id === 'string' ? id : typeof id === 'number' && Number.isFinite(id) ? String(id) : '';
      if (idStr && typeof title === 'string' && title.trim()) {
        events.push({ id: idStr, title: title.trim() });
      }
    }
  }
  return { events, locations };
}

function decodeTagSelection(value: string | undefined): { eventId?: string; locationName?: string } {
  if (!value) return {};
  if (value.startsWith('e:')) return { eventId: value.slice(2).trim() };
  if (value.startsWith('l:')) {
    try {
      const name = decodeURIComponent(value.slice(2));
      return name.trim() ? { locationName: name.trim() } : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function PhotostreamView() {
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tagValue, setTagValue] = useState<string | undefined>(undefined);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const query = trpc.photostreamList.useQuery(
    { start: 0, limit: PAGE_LIMIT },
    { staleTime: 10 * 60 * 1000 }
  );

  const placenamesQuery = trpc.photostreamPlacenames.useQuery(undefined, {
    enabled: uploadOpen,
    staleTime: 60_000,
  });

  const uploadMutation = trpc.photostreamUpload.useMutation({
    onSuccess: () => {
      message.success('Photo uploaded');
      setUploadOpen(false);
      setTagValue(undefined);
      setPendingFile(null);
      void utils.photostreamList.invalidate();
      void utils.photostreamPlacenames.invalidate();
    },
    onError: (e) => message.error(e.message || 'Upload failed'),
  });

  const tagOptions = useMemo(() => {
    const { events, locations } = parsePhotostreamPlacenames(placenamesQuery.data);
    const evOpts = events.map((ev) => ({
      value: `e:${ev.id}`,
      label: `Event: ${ev.title}`,
    }));
    const locOpts = locations.map((loc) => ({
      value: `l:${encodeURIComponent(loc)}`,
      label: `Place: ${loc}`,
    }));
    return [...evOpts, ...locOpts];
  }, [placenamesQuery.data]);

  const items = useMemo(() => {
    const raw = extractPhotoRecords(query.data);
    return raw
      .map((rec) => {
        const sources = resolveImageSources(baseUrl, rec);
        if (!sources) return null;
        const key = String(
          rec.stream_photoID ??
            rec.streamPhotoID ??
            rec.postID ??
            rec.postId ??
            rec.id ??
            rec.photoID ??
            rec.photoId ??
            sources.thumb
        );
        return { key, thumb: sources.thumb, preview: sources.preview, caption: pickCaption(rec) };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [query.data, baseUrl]);

  const masonryItems = useMemo(() => items.map((it) => ({ key: it.key, data: it })), [items]);

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!FORUM_POST_IMAGE_ACCEPT.split(',').some((t) => f.type === t.trim())) {
      message.error('Use JPEG, PNG, WebP, or GIF.');
      return;
    }
    if (f.size > TWITARR_IMAGE_UPLOAD_MAX_BYTES) {
      message.error(`Image too large (max ${Math.round(TWITARR_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    setPendingFile(f);
  }, []);

  const submitUpload = useCallback(async () => {
    if (!pendingFile) {
      message.warning('Choose a photo first.');
      return;
    }
    const buf = await pendingFile.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(buf);
    const { eventId, locationName } = decodeTagSelection(tagValue);
    uploadMutation.mutate({
      imageBase64,
      createdAt: new Date().toISOString(),
      eventId,
      locationName,
    });
  }, [pendingFile, tagValue, uploadMutation]);

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
        <Alert type="error" message="Could not load photostream" description={query.error.message} showIcon />
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
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconPhoto size={18} stroke={1.5} style={{ color: '#6F458F' }} />
          Photostream
        </span>
        <Button
          type="primary"
          icon={<IconUpload size={16} stroke={1.5} />}
          onClick={() => setUploadOpen(true)}
          style={{ background: '#6F458F', borderColor: '#6F458F' }}
        >
          Upload
        </Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {items.length === 0 ? (
          <Empty description="No photos yet" style={{ marginTop: 48 }} />
        ) : (
          <Image.PreviewGroup>
            <Masonry
              gutter={[12, 12]}
              columns={{ xs: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
              items={masonryItems}
              itemRender={({ data }) => (
                <div
                  style={{
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#2A2D34',
                    border: '1px solid #3d4149',
                  }}
                >
                  <Image
                    src={data.thumb}
                    alt={data.caption ?? ''}
                    style={{ width: '100%', height: 'auto', display: 'block', verticalAlign: 'top' }}
                    preview={{ src: data.preview }}
                  />
                  {data.caption ? (
                    <Typography.Text
                      ellipsis
                      style={{ display: 'block', padding: 8, fontSize: 12, color: '#9A9D9A' }}
                    >
                      {data.caption}
                    </Typography.Text>
                  ) : null}
                </div>
              )}
            />
          </Image.PreviewGroup>
        )}
      </div>

      <Modal
        title="Upload to photostream"
        open={uploadOpen}
        onCancel={() => {
          if (uploadMutation.isPending) return;
          setUploadOpen(false);
          setTagValue(undefined);
          setPendingFile(null);
        }}
        onOk={() => void submitUpload()}
        okText="Upload"
        okButtonProps={{ loading: uploadMutation.isPending, disabled: !pendingFile }}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
          Tag with a current event or ship location from the server list (from{' '}
          <code style={{ fontSize: 12 }}>/photostream/placenames</code>). The server may rate-limit uploads.
        </Typography.Paragraph>
        {placenamesQuery.isError ? (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={placenamesQuery.error.message} />
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={FORUM_POST_IMAGE_ACCEPT}
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
          <Button onClick={onPickFile} disabled={uploadMutation.isPending}>
            {pendingFile ? `Selected: ${pendingFile.name}` : 'Choose photo…'}
          </Button>
          <Select
            allowClear
            placeholder="Tag: event or place (optional)"
            loading={placenamesQuery.isLoading}
            options={tagOptions}
            value={tagValue}
            onChange={(v) => setTagValue(v)}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
          />
        </div>
      </Modal>
    </div>
  );
}
