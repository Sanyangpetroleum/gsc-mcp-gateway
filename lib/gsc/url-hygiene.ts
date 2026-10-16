/**
 * Pure URL hygiene diagnostic. Does not contact Google or assume indexing.
 * Detects invisible Unicode that can silently turn an article slug into a 404.
 */
const INVISIBLE = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
const INVISIBLE_ESCAPES = /%(?:C2%AD|CD%8F|D8%9C|E1%A0%8E|E2%80%8[B-F]|E2%80%AA|E2%80%AB|E2%80%AC|E2%80%AD|E2%80%AE|E2%81%A[0-9A-F]|EF%BB%BF)/gi;

export function urlHygieneReport(url: string) {
  const parsed = new URL(url);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    return {
      url, clean: false, issue: "invalid_percent_encoding",
      invisibleCodePoints: [], suggestedUrl: null,
      action: "Copy the exact published canonical URL and retry; do not submit the malformed URL.",
    };
  }
  const codePoints = [...decodedPath.matchAll(INVISIBLE)]
    .map(([character]) => "U+" + character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0"));
  const suggestedUrl = codePoints.length
    ? parsed.href.replace(INVISIBLE_ESCAPES, "")
    : parsed.href;
  const clean = codePoints.length === 0 && url === parsed.href;
  return {
    url, clean,
    issue: codePoints.length ? "invisible_unicode_in_url" : clean ? null : "noncanonical_url_encoding",
    invisibleCodePoints: codePoints,
    suggestedUrl,
    action: clean
      ? "URL syntax is clean. This does not guarantee that Google has crawled or indexed the page."
      : "Use the exact published canonical URL, without invisible characters; re-run Google's live URL test.",
  };
}
