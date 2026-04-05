/** Shopify cart URLs on mygloby.co.il — tier matches “מספר עמודים” chosen in the wizard (26 … 120+). */
const TIERS = [26, 36, 50, 76, 100, 120];

const CART_BY_TIER = {
  26: "https://mygloby.co.il/cart/50926574502210:1?discount=MYGLOBY5%25CODE",
  36: "https://mygloby.co.il/cart/51346429313346:1?discount=MYGLOBY5%25CODE",
  50: "https://mygloby.co.il/cart/50926574534978:1?discount=MYGLOBY5%25CODE",
  76: "https://mygloby.co.il/cart/50926574567746:1?discount=MYGLOBY5%25CODE",
  100: "https://mygloby.co.il/cart/51272522105154:1?discount=MYGLOBY5%25CODE",
  120: "https://mygloby.co.il/cart/51071343526210:1?discount=MYGLOBY5%25CODE",
};

/**
 * @param {number} pageCount — album inner pages (`album.pages.length`), same as PagesCount options.
 */
export function getMyglobyCheckoutUrl(pageCount) {
  const n = Math.max(0, Number(pageCount) || 0);
  if (n <= 0) return CART_BY_TIER[26];
  if (CART_BY_TIER[n]) return CART_BY_TIER[n];
  if (n > 120) return CART_BY_TIER[120];
  const tier = TIERS.find((t) => t >= n) ?? 120;
  return CART_BY_TIER[tier];
}
