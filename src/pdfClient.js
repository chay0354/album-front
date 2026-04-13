import { jsPDF } from "jspdf";

/** Pure image PDF in the browser — no server text/fonts; each page is a full-page JPEG. */
export function buildPdfBlobFromJpegDataUrls(jpegDataUrls) {
  if (!jpegDataUrls?.length) throw new Error("אין עמודים ל-PDF");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  jpegDataUrls.forEach((dataUrl, i) => {
    if (i > 0) pdf.addPage();
    try {
      if (dataUrl && String(dataUrl).startsWith("data:image/")) {
        const props = pdf.getImageProperties(dataUrl);
        const iw = props?.width || w;
        const ih = props?.height || h;
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;
        pdf.addImage(dataUrl, "JPEG", dx, dy, dw, dh, undefined, "MEDIUM");
      }
    } catch (_) {
      /* Invalid raster — keep this PDF sheet blank so page count matches album. */
    }
  });
  return pdf.output("blob");
}
