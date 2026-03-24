const KEY = (albumId) => `albumPdfDataUrl:${albumId}`;

/** Same-tab handoff: Done page reads this synchronously so the link is never the server URL first. */
export async function stashPdfDataUrlForSession(albumId, blob) {
  if (!albumId || !blob) return;
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => {
      const s = typeof r.result === "string" ? r.result : "";
      if (s.length > 4_500_000) {
        resolve(false);
        return;
      }
      try {
        sessionStorage.setItem(KEY(albumId), s);
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    r.onerror = () => resolve(false);
    r.readAsDataURL(blob);
  });
}

export function peekPdfDataUrlFromSession(albumId) {
  if (!albumId) return null;
  try {
    return sessionStorage.getItem(KEY(albumId));
  } catch {
    return null;
  }
}
