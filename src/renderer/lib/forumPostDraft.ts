import { FORUM_POST_MAX_IMAGES } from './imageBase64';

/**
 * Client-side checks aligned with Swiftarr `PostContentData` validation for forum posts
 * (2048 chars, 25 lines). Server remains authoritative.
 */
export function forumPostLineCount(text: string): number {
  if (!text) return 0;
  return text.replace(/\r\n/g, '\r').split(/\r|\n/).length;
}

/** Returns an error message, or null when the draft is acceptable to send. */
export function validateForumPostDraft(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Message cannot be empty.';
  if (t.length > 2048) return 'Message is too long (max 2048 characters).';
  if (forumPostLineCount(t) > 25) return 'Message has too many lines (max 25).';
  return null;
}

export function validateForumImageAttachmentCount(count: number): string | null {
  if (!Number.isFinite(count) || count < 0) return 'Invalid attachment count.';
  if (count > FORUM_POST_MAX_IMAGES) {
    return `You can attach at most ${FORUM_POST_MAX_IMAGES} images per post.`;
  }
  return null;
}
