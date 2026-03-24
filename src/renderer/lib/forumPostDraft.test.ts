import { describe, expect, it } from 'vitest';
import { forumPostLineCount, validateForumImageAttachmentCount, validateForumPostDraft } from './forumPostDraft';

describe('forumPostLineCount', () => {
  it('counts lines like Swiftarr (collapse CRLF)', () => {
    expect(forumPostLineCount('a')).toBe(1);
    expect(forumPostLineCount('a\nb')).toBe(2);
    expect(forumPostLineCount('a\r\nb')).toBe(2);
  });
});

describe('validateForumPostDraft', () => {
  it('rejects empty', () => {
    expect(validateForumPostDraft('   ')).toMatch(/empty/i);
  });

  it('rejects too many lines', () => {
    const lines = Array.from({ length: 26 }, () => 'x').join('\n');
    expect(validateForumPostDraft(lines)).toMatch(/lines/i);
  });

  it('accepts typical message', () => {
    expect(validateForumPostDraft('Hello @crew')).toBeNull();
  });
});

describe('validateForumImageAttachmentCount', () => {
  it('rejects too many', () => {
    expect(validateForumImageAttachmentCount(9)).toMatch(/8/);
  });

  it('accepts zero through max', () => {
    expect(validateForumImageAttachmentCount(0)).toBeNull();
    expect(validateForumImageAttachmentCount(8)).toBeNull();
  });
});
