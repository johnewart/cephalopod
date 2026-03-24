/** Matches Settings avatar uploads and forum attachments (Swiftarr body size limits still apply server-side). */
export const TWITARR_IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export const FORUM_POST_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const FORUM_POST_IMAGE_MAX_BYTES = TWITARR_IMAGE_UPLOAD_MAX_BYTES;
/** Swiftarr `PostContentData` allows up to 8 images; moderators may have a lower effective cap server-side. */
export const FORUM_POST_MAX_IMAGES = 8;
