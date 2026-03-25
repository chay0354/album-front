/**
 * In-memory PDF blob URL between Studio → Done (same JS session).
 * Survives when iOS / in-app browsers strip history.state or sessionStorage.
 */
const handoff = new Map();
const clearTimers = new Map();
const TIMEOUT_MS = 10 * 60 * 1000;

export function stashPdfHandoff(albumId, blobUrl) {
  if (!albumId || !blobUrl) return;
  const prev = clearTimers.get(albumId);
  if (prev) window.clearTimeout(prev);
  handoff.set(albumId, blobUrl);
  const t = window.setTimeout(() => {
    handoff.delete(albumId);
    clearTimers.delete(albumId);
  }, TIMEOUT_MS);
  clearTimers.set(albumId, t);
}

export function peekPdfHandoff(albumId) {
  if (!albumId) return null;
  return handoff.get(albumId) ?? null;
}
