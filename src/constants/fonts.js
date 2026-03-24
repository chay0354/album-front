/** 6 font options for cover and page text (Hebrew-supporting). */
export const FONT_OPTIONS = [
  { value: "Heebo", label: "Heebo" },
  { value: "Assistant", label: "Assistant" },
  { value: "Rubik", label: "Rubik" },
  { value: "Noto Sans Hebrew", label: "Noto Sans Hebrew" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Frank Ruhl Libre", label: "Frank Ruhl Libre" },
];

export const DEFAULT_FONT = FONT_OPTIONS[0].value;

/** Emoji fallback so emoji display on iPhone and other devices (system emoji fonts). */
const EMOJI_FONT_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Returns a CSS font-family value with emoji fallback so Hebrew + emoji both display. */
export function getFontStack(fontName) {
  if (!fontName) return `Heebo, ${EMOJI_FONT_FALLBACK}`;
  const main = fontName.includes(" ") ? `"${fontName}"` : fontName;
  return `${main}, ${EMOJI_FONT_FALLBACK}`;
}
