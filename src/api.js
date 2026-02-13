// In dev use proxy (/api). In production set VITE_API_URL to your backend origin (e.g. https://album-back.vercel.app)
const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, "") : "";
const API = API_BASE ? API_BASE + "/api" : "/api";

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

export async function getElementsList() {
  const r = await fetch(`${API}/covers/elements`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function getElementUrl(storagePath) {
  if (!storagePath) return null;
  if (storagePath.startsWith("http")) return storagePath;
  return `${import.meta.env.VITE_SUPABASE_URL || ""}/storage/v1/object/public/elements/${storagePath}`;
}

export function getPdfDownloadUrl(albumId) {
  return `${API_BASE || ""}/api/pdf/generate/${albumId}`;
}

export async function getPdfDeliveries() {
  const r = await fetch(`${API}/admin/pdf-deliveries`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
