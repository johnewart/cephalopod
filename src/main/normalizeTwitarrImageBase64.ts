/** Strip data-URL prefix / whitespace for Swiftarr `ImageUploadData.image` (base64 → Data). */
export function normalizeTwitarrImageBase64(raw: string): string {
  const trimmed = raw.trim();
  const dataUrl = /^data:[^;]+;base64,(.+)$/is.exec(trimmed);
  const b64 = (dataUrl ? dataUrl[1] : trimmed).replace(/\s/g, '');
  if (!b64.length) throw new Error('Empty image data');
  return b64;
}
