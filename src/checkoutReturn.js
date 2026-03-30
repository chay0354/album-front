/**
 * Shopify / external checkout return URL (open-redirect safe).
 *
 * Set in .env:
 *   VITE_SHOPIFY_RETURN_URL_PREFIXES=https://your-store.myshopify.com/checkouts/,https://shopify.com/checkouts/
 *
 * Link from Shopify to the app, e.g.:
 *   https://your-album-host/album/{id}/cover?return_to=${encodeURIComponent(window.location.href)}
 */

const STORAGE_KEY = "album_checkout_return_url";

function allowedPrefixes() {
  const raw = import.meta.env.VITE_SHOPIFY_RETURN_URL_PREFIXES || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedHttpsUrl(href) {
  const prefixes = allowedPrefixes();
  if (!prefixes.length || !href) return false;
  let u;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return prefixes.some((p) => u.href.startsWith(p));
}

/** Persist return URL if it matches env allowlist. Returns whether stored. */
export function tryStoreCheckoutReturnUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  let decoded = rawUrl;
  try {
    decoded = decodeURIComponent(rawUrl.trim());
  } catch {
    return false;
  }
  if (!isAllowedHttpsUrl(decoded)) return false;
  try {
    sessionStorage.setItem(STORAGE_KEY, new URL(decoded).href);
    return true;
  } catch {
    return false;
  }
}

export function getStoredCheckoutReturnUrl() {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    if (!isAllowedHttpsUrl(s)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearStoredCheckoutReturnUrl() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
