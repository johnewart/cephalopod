import { useMemo } from 'react';
import { Alert, Empty, Image, Masonry, Spin, Typography } from 'antd';
import { IconPhoto } from '@tabler/icons-react';
import { trpc } from '../lib/trpc';
import { useStore } from '../hooks/useStore';

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

/** Swiftarr serves user uploads at GET /api/v3/image/{thumb|full}/:filename (see ImageController). */
function swiftarrImageUrl(baseUrl: string, filename: string, size: 'thumb' | 'full'): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/api/v3/image/${size}/${encodeURIComponent(filename)}`;
}

/** If URL points at a Swiftarr thumbnail, return the corresponding full-size URL for preview. */
function swapSwiftarrThumbToFull(url: string): string {
  return url.replace(/\/image\/thumb\//, '/image/full/');
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
      const preview = swapSwiftarrThumbToFull(c);
      return { thumb: c, preview: preview !== c ? preview : c };
    }

    if (c.startsWith('/')) {
      const abs = `${root}${c}`;
      const preview = swapSwiftarrThumbToFull(abs);
      return { thumb: abs, preview: preview !== abs ? preview : abs };
    }

    // Bare filename (e.g. PhotostreamImageData.image — UUID.jpg); do not use `${root}/${c}`.
    if (!c.includes('/')) {
      return {
        thumb: swiftarrImageUrl(baseUrl, c, 'thumb'),
        preview: swiftarrImageUrl(baseUrl, c, 'full'),
      };
    }

    const abs = `${root}/${c}`;
    const preview = swapSwiftarrThumbToFull(abs);
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

export function PhotostreamView() {
  const baseUrl = useStore((s) => s.server.baseUrl ?? '');
  const query = trpc.photostreamList.useQuery({ start: 0, limit: PAGE_LIMIT });

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

  const masonryItems = useMemo(
    () => items.map((it) => ({ key: it.key, data: it })),
    [items]
  );

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
          gap: 8,
        }}
      >
        <IconPhoto size={18} stroke={1.5} style={{ color: '#6F458F' }} />
        Photostream
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
    </div>
  );
}
