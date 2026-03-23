/** Swiftarr user avatars: GET /api/v3/image/thumb/:filename */
export function swiftarrImageThumbUrl(baseUrl: string, filename: string): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/api/v3/image/thumb/${encodeURIComponent(filename)}`;
}

/** Fallback when no custom image: GET /api/v3/image/user/identicon/:user_id */
export function swiftarrUserIdenticonUrl(baseUrl: string, userId: string): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/api/v3/image/user/identicon/${encodeURIComponent(userId)}`;
}
