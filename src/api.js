import { getSupabaseBrowserClient } from "./supabaseClient.js";

// In dev use proxy (/api). In production set VITE_API_URL to your backend origin (e.g. https://album-back.vercel.app)
const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, "") : "";
const API = API_BASE ? API_BASE + "/api" : "/api";

/** Stay under Vercel ~4.5 MB request cap for multipart PDF upload; larger → Supabase signed upload. */
const PDF_DIRECT_UPLOAD_MAX_BYTES = 4_000_000;

/** Vercel serverless has 4.5 MB request body limit. Compress so single or multiple photos fit. */
const MAX_FILE_SIZE = 1.4 * 1024 * 1024; // 1.4 MB per file so 3 photos stay under 4.5 MB
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

async function compressImageForUpload(file) {
  if (!file.type.startsWith("image/") || file.size <= MAX_FILE_SIZE) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size <= MAX_FILE_SIZE) {
        resolve(file);
        return;
      }
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export async function getAlbums() {
  const r = await fetch(`${API}/albums`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAlbum(id) {
  const r = await fetch(`${API}/albums/${id}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAlbumByShareToken(token) {
  const r = await fetch(`${API}/albums/by-share-token/${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createAlbum(body = {}) {
  const r = await fetch(`${API}/albums`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Create a new album as a copy of the album identified by share token (for "get this album for myself"). */
export async function createAlbumFromShareToken(shareToken) {
  const r = await fetch(`${API}/albums/from-share-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ share_token: shareToken }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateAlbum(id, body) {
  const r = await fetch(`${API}/albums/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getBaseCovers() {
  const r = await fetch(`${API}/covers/base`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getCoverList() {
  const r = await fetch(`${API}/covers/list`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getPremadeCoverList() {
  const r = await fetch(`${API}/covers/premade`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Upload a cover to the premade-covers bucket (admin). Files appear in EditCover "בחר רקע כריכה". */
export async function uploadPremadeCover(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API}/covers/premade/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadCover(file) {
  const compressed = await compressImageForUpload(file);
  const fd = new FormData();
  fd.append("file", compressed);
  const r = await fetch(`${API}/covers/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addPage(albumId) {
  const r = await fetch(`${API}/albums/${albumId}/pages`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Set album to exactly `targetCount` pages in one request (fast vs looping addPage/deletePage). */
export async function syncAlbumPageCount(albumId, targetCount) {
  const r = await fetch(`${API}/albums/${albumId}/pages/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_count: targetCount }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deletePage(albumId, pageId) {
  const r = await fetch(`${API}/albums/${albumId}/pages/${pageId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function updatePageConfig(albumId, pageId, pageConfig) {
  const r = await fetch(`${API}/albums/${albumId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_config: pageConfig }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadPhotos(albumId, pageId, files) {
  const compressed = await Promise.all(Array.from(files).map((f) => compressImageForUpload(f)));
  const fd = new FormData();
  for (const f of compressed) fd.append("photos", f);
  const r = await fetch(`${API}/albums/${albumId}/pages/${pageId}/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addPhotoToPage(albumId, pageId, storagePath, photoOrder) {
  const r = await fetch(`${API}/albums/${albumId}/pages/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storage_path: storagePath, photo_order: photoOrder }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function reorderPhotos(albumId, pageId, photoIds) {
  const r = await fetch(`${API}/albums/${albumId}/pages/${pageId}/photos/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo_ids: photoIds }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function removePhoto(albumId, pageId, photoId) {
  const r = await fetch(`${API}/albums/${albumId}/pages/${pageId}/photos/${photoId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function movePhotoToPage(albumId, photoId, pageId, photoOrder) {
  const r = await fetch(`${API}/albums/${albumId}/photos/${photoId}/move`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId, photo_order: photoOrder }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updatePhotoLayout(albumId, photoId, layout) {
  const r = await fetch(`${API}/albums/${albumId}/photos/${photoId}/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function getPhotoUrl(storagePath) {
  if (storagePath.startsWith("http")) return storagePath;
  return `${import.meta.env.VITE_SUPABASE_URL || ""}/storage/v1/object/public/album-photos/${storagePath}`;
}

export function getCoverUrl(storagePath) {
  if (!storagePath) return null;
  if (storagePath.startsWith("http")) return storagePath;
  return `${import.meta.env.VITE_SUPABASE_URL || ""}/storage/v1/object/public/covers/${storagePath}`;
}

export function getPremadeCoverUrl(storagePath) {
  if (!storagePath) return null;
  if (storagePath.startsWith("http")) return storagePath;
  return `${import.meta.env.VITE_SUPABASE_URL || ""}/storage/v1/object/public/premade-covers/${storagePath}`;
}

/** Bundled decorations (always available; no Storage upload). Paths are site-root URLs. */
export const BUILTIN_PAGE_ELEMENTS = [
  { path: "/builtin-elements/dec-01-heart.svg" },
  { path: "/builtin-elements/dec-02-star.svg" },
  { path: "/builtin-elements/dec-03-flower.svg" },
  { path: "/builtin-elements/dec-04-leaf.svg" },
  { path: "/builtin-elements/dec-05-sun.svg" },
  { path: "/builtin-elements/dec-06-moon.svg" },
  { path: "/builtin-elements/dec-07-cloud.svg" },
  { path: "/builtin-elements/dec-08-sparkle.svg" },
  { path: "/builtin-elements/dec-09-ribbon.svg" },
  { path: "/builtin-elements/dec-10-frame.svg" },
  { path: "/builtin-elements/dec-11-scallop.svg" },
  { path: "/builtin-elements/dec-12-banner.svg" },
  { path: "/builtin-elements/dec-13-ring.svg" },
  { path: "/builtin-elements/dec-14-clover.svg" },
  { path: "/builtin-elements/dec-15-butterfly.svg" },
  { path: "/builtin-elements/dec-16-balloon.svg" },
  { path: "/builtin-elements/dec-17-crown.svg" },
  { path: "/builtin-elements/dec-18-music.svg" },
  { path: "/builtin-elements/dec-19-camera.svg" },
  { path: "/builtin-elements/dec-20-gift.svg" },
];

export async function getElementsList() {
  let remote = [];
  try {
    const r = await fetch(`${API}/covers/elements`);
    if (r.ok) {
      const j = await r.json();
      remote = Array.isArray(j) ? j : [];
    }
  } catch {
    /* offline / API down — still show builtins */
  }
  const seen = new Set(remote.map((x) => x?.path).filter(Boolean));
  const extra = BUILTIN_PAGE_ELEMENTS.filter((b) => b.path && !seen.has(b.path));
  return [...remote, ...extra];
}

export function getElementUrl(storagePath) {
  if (!storagePath) return null;
  if (storagePath.startsWith("http")) return storagePath;
  if (storagePath.startsWith("/")) return storagePath;
  return `${import.meta.env.VITE_SUPABASE_URL || ""}/storage/v1/object/public/elements/${storagePath}`;
}

export function getPdfDownloadUrl(albumId) {
  return `${API_BASE || ""}/api/pdf/generate/${albumId}`;
}

/**
 * Register client-built PDF (same pixels as local jsPDF) for delivery / analytics.
 * Small files: multipart to API. Large: Supabase signed upload (needs VITE_SUPABASE_ANON_KEY).
 */
export async function uploadAlbumPdfForDelivery(albumId, pdfBlob) {
  if (pdfBlob.size <= PDF_DIRECT_UPLOAD_MAX_BYTES) {
    const fd = new FormData();
    fd.append("albumId", albumId);
    fd.append("pdf", pdfBlob, "album.pdf");
    const r = await fetch(`${API}/pdf/upload-client-pdf`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(await r.text());
    const blob = await r.blob();
    const pdfUrl = r.headers.get("X-Pdf-Url") || null;
    return { blob, pdfUrl };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "הקובץ גדול מדי לשליחה לשרת הקצה. הוסף משתנה סביבה VITE_SUPABASE_ANON_KEY (מפתח anon של Supabase) כדי להעלות PDF ישירות לאחסון."
    );
  }

  const start = await fetch(`${API}/pdf/signed-upload-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ albumId }),
  });
  if (!start.ok) throw new Error(await start.text());
  const { path: storagePath, token } = await start.json();

  const { error: upErr } = await supabase.storage.from("pdfs").uploadToSignedUrl(storagePath, token, pdfBlob, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);

  const fin = await fetch(`${API}/pdf/signed-upload-finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ albumId, path: storagePath }),
  });
  if (!fin.ok) throw new Error(await fin.text());
  const { pdfUrl } = await fin.json();
  return { blob: pdfBlob, pdfUrl: pdfUrl || null };
}

export async function getPdfDeliveries() {
  const r = await fetch(`${API}/admin/pdf-deliveries`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
