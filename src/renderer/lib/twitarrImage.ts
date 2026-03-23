/** User uploads: GET /api/v3/image/{thumb|full}/:filename */
export function twitarrImageUrl(baseUrl: string, filename: string, size: 'thumb' | 'full'): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/api/v3/image/${size}/${encodeURIComponent(filename)}`;
}

/** Twitarr user avatars: GET /api/v3/image/thumb/:filename */
export function twitarrImageThumbUrl(baseUrl: string, filename: string): string {
  return twitarrImageUrl(baseUrl, filename, 'thumb');
}

/** If URL points at a Twitarr thumbnail, return the corresponding full-size URL for preview. */
export function swapTwitarrThumbToFull(url: string): string {
  return url.replace(/\/image\/thumb\//, '/image/full/');
}

/**
 * Resolve markdown image `src`: absolute URL, site-relative path (`/api/v3/...`), or bare filename.
 */
export function resolveMarkdownImageSrc(baseUrl: string, raw: string): string {
  const root = baseUrl.replace(/\/$/, '');
  const c = raw.trim();
  if (!c) return c;
  if (/^https?:\/\//i.test(c)) return c;
  if (c.startsWith('/')) return `${root}${c}`;
  if (!c.includes('/')) return twitarrImageUrl(baseUrl, c, 'full');
  return `${root}/${c}`;
}

/** Fallback when no custom image: GET /api/v3/image/user/identicon/:user_id */
export function twitarrUserIdenticonUrl(baseUrl: string, userId: string): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/api/v3/image/user/identicon/${encodeURIComponent(userId)}`;
}
