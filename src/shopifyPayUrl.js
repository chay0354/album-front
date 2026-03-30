/** See VITE_SHOPIFY_PAYMENT_URL_TEMPLATE in .env — cart / checkout link with optional {albumId} {shareToken} {shareUrl}. */

export function buildShopifyPaymentUrl(albumId, shareToken, shareAbsoluteUrl) {
  const tpl = (import.meta.env.VITE_SHOPIFY_PAYMENT_URL_TEMPLATE || "").trim();
  if (!tpl) return null;
  return tpl
    .replaceAll("{albumId}", encodeURIComponent(albumId ?? ""))
    .replaceAll("{shareToken}", encodeURIComponent(shareToken ?? ""))
    .replaceAll("{shareUrl}", encodeURIComponent(shareAbsoluteUrl ?? ""));
}
