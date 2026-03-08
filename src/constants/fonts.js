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

/** Returns a CSS font-family value (quoted when name has spaces so all 6 fonts apply correctly). */
export function getFontStack(fontName) {
  if (!fontName) return "Heebo, sans-serif";
  return fontName.includes(" ") ? `"${fontName}", sans-serif` : `${fontName}, sans-serif`;
}
