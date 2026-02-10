// In dev use proxy (/api). In production set VITE_API_URL to your backend origin (e.g. https://album-back.vercel.app)
const API_BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, "") : "";
const API = API_BASE ? API_BASE + "/api" : "/api";

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

export async function uploadCover(file) {
  const fd = new FormData();
  fd.append("file", file);
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

export async function uploadPhotos(albumId, pageId, files) {
  const fd = new FormData();
  for (const f of files) fd.append("photos", f);
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

export function getPdfDownloadUrl(albumId) {
  return `${API_BASE || ""}/api/pdf/generate/${albumId}`;
}

export async function getPdfDeliveries() {
  const r = await fetch(`${API}/admin/pdf-deliveries`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
