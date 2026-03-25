import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  getAlbum,
  getBaseCovers,
  addPage,
  uploadPhotos,
  getPhotoUrl,
  getCoverUrl,
  movePhotoToPage,
  removePhoto,
  updatePhotoLayout,
  updatePageConfig,
  getElementsList,
  getElementUrl,
} from "../api";
import html2canvas from "html2canvas";
import { toJpeg } from "html-to-image";
import { domToJpeg } from "modern-screenshot";
import { buildPdfBlobFromJpegDataUrls } from "../pdfClient";
import { saveLocalPdfBlob } from "../pdfLocalCache";
import { stashPdfDataUrlForSession, stashPdfBlobUrlForSession } from "../pdfSessionBridge";
import { stashPdfHandoff } from "../pdfHandoff";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import { FONT_OPTIONS, DEFAULT_FONT, getFontStack } from "../constants/fonts";
import styles from "./EditPages.module.css";

function StudioDockIconLayout() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="3" width="7" height="7" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="3" y="14" width="7" height="7" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <rect x="14" y="14" width="7" height="7" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function StudioDockIconBackground() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 6.5a2 2 0 012-2h12a2 2 0 012 2v5H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M4 11.5h16v6a2 2 0 01-2 2H6a2 2 0 01-2-2z"
        fill="currentColor"
        fillOpacity="0.3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudioDockIconElements() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3l1.8 5.5h5.7l-4.6 3.3 1.8 5.5L12 14.9 7.3 17.3l1.8-5.5L4.5 8.5h5.7L12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StudioDockIconQr() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.65" />
      <rect x="14" y="3" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.65" />
      <rect x="3" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.65" />
      <rect x="5" y="5" width="3" height="3" fill="currentColor" />
      <rect x="16" y="5" width="3" height="3" fill="currentColor" />
      <rect x="5" y="16" width="3" height="3" fill="currentColor" />
      <rect x="14" y="14" width="2" height="2" fill="currentColor" />
      <rect x="17" y="14" width="2" height="2" fill="currentColor" />
      <rect x="14" y="17" width="2" height="2" fill="currentColor" />
      <rect x="18" y="17" width="3" height="3" fill="currentColor" />
    </svg>
  );
}

function StudioDockIconText() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 6h14M12 6v11M9 19h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DEFAULT_LAYOUT = (index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 48 + 2, y: row * 48 + 2, w: 46, h: 46, rotation: 0 };
};

const DEFAULT_PHOTO_CROP = { l: 0, t: 0, w: 100, h: 100 };

function getPhotoLayoutCrop(layout) {
  return layout?.crop && typeof layout.crop.w === "number" ? layout.crop : null;
}

function normalizePhotoLayoutFromAlbumPhoto(photo, indexInPage) {
  const base = DEFAULT_LAYOUT(indexInPage);
  if (!photo?.layout || typeof photo.layout.x !== "number") return { ...base, rotation: 0 };
  return { ...base, ...photo.layout, rotation: photo.layout.rotation ?? 0 };
}

function renderSpreadPhotoInner(layout, imgSrc, onNaturalSize) {
  const crop = getPhotoLayoutCrop(layout) || DEFAULT_PHOTO_CROP;
  const hasCrop = crop.l > 0 || crop.t > 0 || crop.w < 100 || crop.h < 100;
  const onLoad = onNaturalSize
    ? (e) => {
        const im = e.currentTarget;
        if (im.naturalWidth > 0 && im.naturalHeight > 0) {
          onNaturalSize({ width: im.naturalWidth, height: im.naturalHeight });
        }
      }
    : undefined;
  if (!hasCrop) return <img src={imgSrc} alt="" draggable={false} onLoad={onLoad} />;
  return (
    <div className={styles.editorPhotoCropWrap}>
      <img
        src={imgSrc}
        alt=""
        draggable={false}
        className={styles.editorPhotoCroppedImg}
        onLoad={onLoad}
        style={{
          width: `${(100 / crop.w) * 100}%`,
          height: `${(100 / crop.h) * 100}%`,
          left: `${-(crop.l / crop.w) * 100}%`,
          top: `${-(crop.t / crop.h) * 100}%`,
        }}
      />
    </div>
  );
}

/** layout w/h so on-screen pixel aspect matches image (naturalW/naturalH) inside a % box over containerRect */
function layoutAspectRatioFromImage(imageAspectWH, containerRect) {
  const cw = Math.max(containerRect.width, 1e-6);
  const ch = Math.max(containerRect.height, 1e-6);
  return (imageAspectWH * ch) / cw;
}

/** Pixel aspect (width/height) of visible image from file pixels + current crop rect */
function visibleImageAspectRatioFromLayout(layout, naturalWH) {
  if (!naturalWH || naturalWH.width <= 0 || naturalWH.height <= 0) return null;
  const crop = getPhotoLayoutCrop(layout) || DEFAULT_PHOTO_CROP;
  const hasCrop = crop.l > 0 || crop.t > 0 || crop.w < 100 || crop.h < 100;
  const base = naturalWH.width / naturalWH.height;
  if (hasCrop && crop.w > 0 && crop.h > 0) return base * (crop.w / crop.h);
  return base;
}

/** Clamp w,h to bounds while keeping w/h === k (fixes drift from alternating w/h clamps) */
function fitBoxToAspectBounds(w, h, k, minS, maxW, maxH) {
  const kk = Math.max(k, 1e-9);
  for (let i = 0; i < 20; i++) {
    w = Math.max(minS, Math.min(maxW, w));
    h = w / kk;
    if (h > maxH) {
      h = maxH;
      w = kk * h;
    } else if (h < minS) {
      h = minS;
      w = kk * h;
    } else {
      break;
    }
  }
  return { w, h };
}

function clampAspectBoxFromPointer(rw, rh, k, minS, maxW, maxH) {
  const eps = 1e-9;
  const kk = Math.max(k, eps);
  rw = Math.max(0, rw);
  rh = Math.max(0, rh);
  let w;
  let h;
  if (rw < eps || rh < eps) {
    w = minS;
    h = w / kk;
  } else if (rw / kk <= rh + eps) {
    w = rw;
    h = rw / kk;
  } else {
    h = rh;
    w = kk * rh;
  }
  return fitBoxToAspectBounds(w, h, kk, minS, maxW, maxH);
}

function resizeLayoutKeepImageAspect(handle, startLayout, pctX, pctY, k, minS, maxXY) {
  const l = startLayout;
  const ar = l.x + l.w;
  const ab = l.y + l.h;
  let newX = l.x;
  let newY = l.y;
  let newW = l.w;
  let newH = l.h;
  switch (handle) {
    case "se": {
      const { w, h } = clampAspectBoxFromPointer(pctX - l.x, pctY - l.y, k, minS, maxXY - l.x, maxXY - l.y);
      newW = w;
      newH = h;
      break;
    }
    case "sw": {
      const rw = ar - pctX;
      const rh = pctY - l.y;
      const { w, h } = clampAspectBoxFromPointer(rw, rh, k, minS, ar, maxXY - l.y);
      newX = ar - w;
      newY = l.y;
      newW = w;
      newH = h;
      break;
    }
    case "ne": {
      const rw = pctX - l.x;
      const rh = ab - pctY;
      const { w, h } = clampAspectBoxFromPointer(rw, rh, k, minS, maxXY - l.x, ab);
      newX = l.x;
      newY = ab - h;
      newW = w;
      newH = h;
      break;
    }
    case "nw": {
      const rw = ar - pctX;
      const rh = ab - pctY;
      const { w, h } = clampAspectBoxFromPointer(rw, rh, k, minS, ar, ab);
      newX = ar - w;
      newY = ab - h;
      newW = w;
      newH = h;
      break;
    }
    default:
      break;
  }
  return { x: newX, y: newY, w: newW, h: newH };
}

const CROP_SLIDER_KEYS = ["l", "t", "w", "h"];
const CROP_SLIDER_LABELS = { l: "מיקום אופקי", t: "מיקום אנכי", w: "רוחב", h: "גובה" };

function normalizeCropRect(crop) {
  if (!crop || typeof crop.w !== "number" || !Number.isFinite(crop.w)) {
    return { ...DEFAULT_PHOTO_CROP };
  }
  return {
    l: Math.max(0, Math.min(100, crop.l)),
    t: Math.max(0, Math.min(100, crop.t)),
    w: Math.max(1, Math.min(100, crop.w)),
    h: Math.max(1, Math.min(100, crop.h)),
  };
}

/** Full-bleed source + dimmed mask + marquee — matches pro crop UIs */
function CropModalPreview({ imageUrl, crop }) {
  const c = normalizeCropRect(crop);
  return (
    <div className={styles.cropModalStage}>
      <div className={styles.cropModalImgShell}>
        <img src={imageUrl} alt="" draggable={false} className={styles.cropModalSourceImg} />
        <div className={styles.cropModalOverlayLayer} aria-hidden>
          <div className={styles.cropModalDim} style={{ top: 0, left: 0, right: 0, height: `${c.t}%` }} />
          <div className={styles.cropModalDim} style={{ top: `${c.t + c.h}%`, left: 0, right: 0, bottom: 0 }} />
          <div className={styles.cropModalDim} style={{ top: `${c.t}%`, left: 0, width: `${c.l}%`, height: `${c.h}%` }} />
          <div className={styles.cropModalDim} style={{ top: `${c.t}%`, left: `${c.l + c.w}%`, right: 0, height: `${c.h}%` }} />
          <div className={styles.cropModalMarquee} style={{ left: `${c.l}%`, top: `${c.t}%`, width: `${c.w}%`, height: `${c.h}%` }} />
        </div>
      </div>
    </div>
  );
}

function CropModalSliderGrid({ crop, onFieldChange }) {
  const c = normalizeCropRect(crop);
  return (
    <div className={styles.cropModalSliders}>
      {CROP_SLIDER_KEYS.map((key) => (
        <div key={key} className={styles.cropModalSliderBlock}>
          <div className={styles.cropModalSliderHead}>
            <span className={styles.cropModalSliderLabel}>{CROP_SLIDER_LABELS[key]}</span>
            <span className={styles.cropModalSliderPct}>{Math.round(c[key])}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(c[key])}
            onChange={(e) => onFieldChange(key, Number(e.target.value))}
            className={styles.cropModalRange}
            aria-label={CROP_SLIDER_LABELS[key]}
          />
        </div>
      ))}
    </div>
  );
}

const STICKER_DEFAULT_SIZE = 12;

/** Premade page layouts: each template is an array of { x, y, w, h, rotation } in % */
const PAGE_TEMPLATES = [
  { id: "1-full", name: "תמונה אחת", slots: [{ x: 5, y: 5, w: 90, h: 90, rotation: 0 }] },
  { id: "2-h", name: "2 אופקי", slots: [{ x: 2, y: 10, w: 46, h: 80, rotation: 0 }, { x: 52, y: 10, w: 46, h: 80, rotation: 0 }] },
  { id: "2-v", name: "2 אנכי", slots: [{ x: 10, y: 2, w: 80, h: 46, rotation: 0 }, { x: 10, y: 52, w: 80, h: 46, rotation: 0 }] },
  { id: "3-l", name: "3 (גדול+2)", slots: [{ x: 2, y: 5, w: 48, h: 90, rotation: 0 }, { x: 52, y: 5, w: 46, h: 43, rotation: 0 }, { x: 52, y: 52, w: 46, h: 46, rotation: 0 }] },
  { id: "4-grid", name: "4 רשת", slots: [{ x: 2, y: 2, w: 46, h: 46, rotation: 0 }, { x: 52, y: 2, w: 46, h: 46, rotation: 0 }, { x: 2, y: 52, w: 46, h: 46, rotation: 0 }, { x: 52, y: 52, w: 46, h: 46, rotation: 0 }] },
];

/** Mini page (3:4) with dashed slots + — matches full-screen template placeholders */
/** Empty mini page for “no template” option in layout sheet */
function StudioNoTemplatePreviewThumb() {
  return (
    <div className={styles.studioNoTemplatePreview} aria-hidden>
      <span className={styles.studioNoTemplatePreviewLabel}>ללא</span>
    </div>
  );
}

function StudioTemplatePreviewThumb({ slots }) {
  return (
    <div className={styles.studioTemplatePreview} aria-hidden>
      {slots.map((slot, i) => (
        <div
          key={i}
          className={styles.studioTemplateSlot}
          style={{
            left: `${slot.x}%`,
            top: `${slot.y}%`,
            width: `${slot.w}%`,
            height: `${slot.h}%`,
            transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
          }}
        >
          <span className={styles.studioTemplateSlotPlus}>+</span>
        </div>
      ))}
    </div>
  );
}

/** True when a photo's saved layout matches this template slot's frame (not "nth photo = nth slot"). */
function studioLayoutMatchesSlot(layout, slot, tol = 0.85) {
  if (!layout || typeof layout.x !== "number" || typeof layout.y !== "number") return false;
  if (!slot || typeof slot.x !== "number" || typeof slot.y !== "number") return false;
  for (const k of ["x", "y", "w", "h"]) {
    const lv = layout[k];
    const sv = slot[k];
    if (typeof lv !== "number" || typeof sv !== "number") return false;
    if (Math.abs(lv - sv) > tol) return false;
  }
  const lr = Number.isFinite(layout.rotation) ? layout.rotation : 0;
  const sr = Number.isFinite(slot.rotation) ? slot.rotation : 0;
  return Math.abs(lr - sr) <= tol;
}

/** On-page template: tappable + for each empty slot (under photos; see .studioSpreadFrame .pagePhotosAbsolute z-index). */
function StudioTemplateSlotsLayer({ page, onSlotTap }) {
  const slots = page?.page_config?.studioTemplate?.slots;
  if (!page || !slots?.length || !onSlotTap) return null;
  const photos = [...(page.album_photos || [])].sort((a, b) => a.photo_order - b.photo_order);
  return (
    <div className={styles.studioTemplateSlotsLayer}>
      {slots.map((slot, i) => {
        const hasPhotoInSlot = photos.some((p) => studioLayoutMatchesSlot(p.layout, slot));
        if (hasPhotoInSlot) return null;
        return (
          <button
            key={i}
            type="button"
            className={styles.studioSlotHit}
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `${slot.w}%`,
              height: `${slot.h}%`,
              transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSlotTap(page.id, i);
            }}
            aria-label={`מקום ${i + 1} — הוספת תמונה`}
          >
            <span className={styles.studioSlotPlus} aria-hidden>
              +
            </span>
          </button>
        );
      })}
    </div>
  );
}

function setMinimalDragImage(e) {
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;";
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 0, 0);
  setTimeout(() => el.remove(), 0);
}

/** Raster page size before embedding in A4 PDF (~2× jsPDF pt for sharper output). */
const PDF_OUT_W = 1190;
const PDF_OUT_H = 1684;

/** Raster snapshot of the visible page (pixels only — no PDF font encoding). Order: modern-screenshot → html-to-image → html2canvas. */
async function captureVisibleElementToPdfJpeg(el) {
  if (!el || !(el instanceof HTMLElement)) throw new Error("PDF capture: no element");

  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));

  const pr = Math.min(4, Math.max(2, Math.ceil(1800 / Math.max(1, el.offsetWidth))));

  let dataUrl;
  try {
    dataUrl = await domToJpeg(el, {
      quality: 0.95,
      scale: pr,
      backgroundColor: "#ffffff",
      fetch: { bypassingCache: true },
      drawImageInterval: 150,
      timeout: 45000,
    });
  } catch (e1) {
    console.warn("[PDF] domToJpeg failed:", e1?.message || e1);
    try {
      dataUrl = await toJpeg(el, {
        quality: 0.93,
        pixelRatio: pr,
        cacheBust: true,
        backgroundColor: "#ffffff",
        skipFonts: false,
      });
    } catch (e2) {
      console.warn("[PDF] toJpeg failed, html2canvas:", e2?.message || e2);
      const canvas = await html2canvas(el, {
        scale: pr,
        useCORS: true,
        foreignObjectRendering: true,
        logging: false,
        backgroundColor: "#ffffff",
        imageTimeout: 20000,
        scrollX: 0,
        scrollY: -window.scrollY,
      });
      dataUrl = canvas.toDataURL("image/jpeg", 0.93);
    }
  }

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("PDF capture: image decode failed"));
    img.src = dataUrl;
  });

  const out = document.createElement("canvas");
  out.width = PDF_OUT_W;
  out.height = PDF_OUT_H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("PDF capture: no canvas context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PDF_OUT_W, PDF_OUT_H);
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw < 1 || nh < 1) throw new Error("PDF capture: empty snapshot");
  const scale = Math.min(PDF_OUT_W / nw, PDF_OUT_H / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const dx = (PDF_OUT_W - dw) / 2;
  const dy = (PDF_OUT_H - dh) / 2;
  ctx.drawImage(img, 0, 0, nw, nh, dx, dy, dw, dh);
  return out.toDataURL("image/jpeg", 0.93);
}

function AlbumCover({ album, coverUrl }) {
  const cfg = album?.cover_config || {};
  const texts = Array.isArray(cfg.texts) && cfg.texts.length > 0
    ? cfg.texts
    : cfg.headerText
      ? [{ content: cfg.headerText, x: cfg.headerX ?? 50, y: cfg.headerY ?? 18, fontSize: cfg.headerFontSize ?? 28, color: "#ffffff" }]
      : [];
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")`, background: `center/cover no-repeat url("${coverUrl}")` }
    : {};
  return (
    <div className={styles.coverSingle} style={coverStyle} data-pdf-capture="cover">
      <div className={styles.coverOverlay} />
      {texts.map((t, i) => (
        <div
          key={i}
          className={styles.coverTitleOnModel}
          style={{
            left: `${t.x ?? 50}%`,
            top: `${t.y ?? 18}%`,
            transform: "translate(-50%, -50%)",
            fontSize: `${t.fontSize ?? 28}px`,
            color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#fff",
            fontFamily: getFontStack(t.fontFamily || DEFAULT_FONT),
          }}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

function PagePhotos({ photos, getPhotoUrl, onRemove, useLayout, showRemoveButton = true }) {
  if (!photos.length) return null;
  if (useLayout) {
    return (
      <div className={styles.pagePhotosAbsolute}>
        {photos.map((p, i) => {
          const layout = p.layout && typeof p.layout.x === "number" ? p.layout : DEFAULT_LAYOUT(i);
          const rot = layout.rotation ?? 0;
          return (
            <div
              key={p.id}
              className={styles.placedPhoto}
              style={{
                left: `${layout.x}%`,
                top: `${layout.y}%`,
                width: `${layout.w}%`,
                height: `${layout.h}%`,
                transform: rot ? `rotate(${rot}deg)` : undefined,
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/photo-id", p.id);
                e.dataTransfer.effectAllowed = "move";
                setMinimalDragImage(e);
              }}
            >
              <img src={getPhotoUrl(p.storage_path)} alt="" />
              {showRemoveButton && (
              <button type="button" className={styles.removeBtn} onClick={() => onRemove(p.id)} aria-label="הסר">×</button>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={styles.pagePhotos}>
      {photos.map((p) => (
        <div
          key={p.id}
          className={styles.placedPhoto}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/photo-id", p.id);
            e.dataTransfer.effectAllowed = "move";
            setMinimalDragImage(e);
          }}
        >
          <img src={getPhotoUrl(p.storage_path)} alt="" />
          {showRemoveButton && (
          <button type="button" className={styles.removeBtn} onClick={() => onRemove(p.id)} aria-label="הסר">×</button>
          )}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_PAGE_BG = "#ffffff";
const DEFAULT_PAGE_TEXT_COLOR = "#000000";

const MIN_FONT = 14;
const MAX_FONT = 52;
const DEFAULT_TEXT_X = 50;
const DEFAULT_TEXT_Y = 25;
const DEFAULT_TEXT_FONT_SIZE = 28;
const DEFAULT_TEXT_COLOR = "#000000";

function isValidHex(s) {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function newPageText(overrides = {}) {
  return {
    id: "pt" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    content: "",
    x: DEFAULT_TEXT_X,
    y: DEFAULT_TEXT_Y,
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    color: DEFAULT_TEXT_COLOR,
    fontFamily: DEFAULT_FONT,
    ...overrides,
  };
}

function loadTextsFromPageConfig(cfg) {
  if (cfg.texts && Array.isArray(cfg.texts) && cfg.texts.length > 0) {
    return cfg.texts.map((t, i) => ({
      ...t,
      id: t.id || "pt-" + i + "-" + Math.random().toString(36).slice(2, 8),
      color: t.color || DEFAULT_TEXT_COLOR,
    }));
  }
  return [];
}

function FullScreenPageEditor({ page, pageLabel, photos, albumId, getPhotoUrl, onSave, onClose, onSaveError, onUploadToPage, onRemovePhoto }) {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const slotFileInputRef = useRef(null);
  const slotUploadingForRef = useRef(null);
  const cfg = page?.page_config || {};
  const [pageConfig, setPageConfig] = useState({
    backgroundColor: cfg.backgroundColor ?? DEFAULT_PAGE_BG,
    textColor: cfg.textColor ?? DEFAULT_PAGE_TEXT_COLOR,
    stickers: Array.isArray(cfg.stickers) ? cfg.stickers : [],
    texts: loadTextsFromPageConfig(cfg),
  });
  const [layouts, setLayouts] = useState(() => {
    const next = {};
    (photos || []).forEach((p, i) => {
      const base = p.layout && typeof p.layout.x === "number" ? { ...p.layout } : DEFAULT_LAYOUT(i);
      next[p.id] = { ...DEFAULT_LAYOUT(i), ...base, rotation: base.rotation ?? 0 };
    });
    return next;
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedStickerId, setSelectedStickerId] = useState(null);
  const [draggingStickerId, setDraggingStickerId] = useState(null);
  const [elementsList, setElementsList] = useState([]);
  const [templateSlots, setTemplateSlots] = useState(null);
  const [slotPhotoIds, setSlotPhotoIds] = useState([]);
  const [selectedSlotForPicker, setSelectedSlotForPicker] = useState(null);
  const [slotIndexForNextUpload, setSlotIndexForNextUpload] = useState(null);
  const dragRef = useRef({ type: "photo", id: null, startX: 0, startY: 0, startLayout: null, dragStarted: false });
  const resizeRef = useRef({ photoId: null, handle: null, startLayout: null, aspectK: 1 });
  const photoNaturalAspectRef = useRef({});
  const stickerNaturalAspectRef = useRef({});
  const [resizingId, setResizingId] = useState(null);
  const resizeStickerRef = useRef({ stickerId: null, handle: null, startLayout: null, aspectK: 1 });
  const [resizingStickerId, setResizingStickerId] = useState(null);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [editingTextInlineId, setEditingTextInlineId] = useState(null);
  const [draggingTextId, setDraggingTextId] = useState(null);
  const [showCropPanel, setShowCropPanel] = useState(false);
  const textDragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const inlineTextInputRef = useRef(null);
  const inlineEditOriginalContentRef = useRef("");
  const lastTextTapRef = useRef({ id: null, time: 0 });
  const [guideLines, setGuideLines] = useState({ vertical: [], horizontal: [] });
  const layoutsRef = useRef(layouts);
  const MIN_SIZE = 8;
  const SNAP_THRESHOLD = 2.5;
  const DOUBLE_TAP_MS = 550;
  const TEXT_DRAG_THRESHOLD_PX = 5;
  const TEXT_DRAG_THRESHOLD_TOUCH_PX = 14;
  const DEFAULT_CROP = { l: 0, t: 0, w: 100, h: 100 };
  const getCrop = (layout) => layout?.crop && typeof layout.crop.w === "number" ? layout.crop : null;
  const applyCrop = (layout, imgSrc, onNaturalSize) => {
    const crop = getCrop(layout) || DEFAULT_CROP;
    const hasCrop = crop.l > 0 || crop.t > 0 || crop.w < 100 || crop.h < 100;
    const onLoad = onNaturalSize
      ? (e) => {
          const im = e.currentTarget;
          if (im.naturalWidth > 0 && im.naturalHeight > 0) {
            onNaturalSize({ width: im.naturalWidth, height: im.naturalHeight });
          }
        }
      : undefined;
    if (!hasCrop) return <img src={imgSrc} alt="" draggable={false} onLoad={onLoad} />;
    return (
      <div className={styles.editorPhotoCropWrap}>
        <img
          src={imgSrc}
          alt=""
          draggable={false}
          className={styles.editorPhotoCroppedImg}
          onLoad={onLoad}
          style={{
            width: `${(100 / crop.w) * 100}%`,
            height: `${(100 / crop.h) * 100}%`,
            left: `${-(crop.l / crop.w) * 100}%`,
            top: `${-(crop.t / crop.h) * 100}%`,
          }}
        />
      </div>
    );
  };
  const MAX_XY = 100;

  useEffect(() => {
    getElementsList().then(setElementsList).catch(() => setElementsList([]));
  }, []);

  useEffect(() => {
    if (!showCropPanel) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowCropPanel(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCropPanel]);

  useEffect(() => {
    const cfg = page?.page_config || {};
    setPageConfig((prev) => ({
      ...prev,
      backgroundColor: cfg.backgroundColor ?? prev.backgroundColor ?? DEFAULT_PAGE_BG,
      textColor: cfg.textColor ?? prev.textColor ?? DEFAULT_PAGE_TEXT_COLOR,
      stickers: Array.isArray(cfg.stickers) ? cfg.stickers : [],
      texts: loadTextsFromPageConfig(cfg),
    }));
  }, [page?.id, page?.page_config]);

  useEffect(() => {
    setLayouts((prev) => {
      const next = { ...prev };
      (photos || []).forEach((p, i) => {
        if (next[p.id]) return;
        const base = p.layout && typeof p.layout.x === "number" ? { ...p.layout } : DEFAULT_LAYOUT(i);
        next[p.id] = { ...DEFAULT_LAYOUT(i), ...base, rotation: base.rotation ?? 0 };
      });
      return next;
    });
  }, [photos]);

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  useEffect(() => {
    const pending = slotUploadingForRef.current;
    if (pending == null || !templateSlots) return;
    const { slotIndex, previousIds } = pending;
    const newPhoto = (photos || []).find((p) => !previousIds.has(p.id));
    if (newPhoto) {
      const slot = templateSlots[slotIndex];
      if (slot) {
        setSlotPhotoIds((prev) => {
          const next = [...prev];
          const prevIdx = next.findIndex((id) => id === newPhoto.id);
          if (prevIdx >= 0) next[prevIdx] = null;
          next[slotIndex] = newPhoto.id;
          return next;
        });
        setLayouts((prev) => ({ ...prev, [newPhoto.id]: { ...slot, rotation: slot.rotation ?? 0 } }));
      }
      setSelectedSlotForPicker(null);
      slotUploadingForRef.current = null;
    }
  }, [photos, templateSlots]);

  const getCoords = useCallback((e) => {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseDown = useCallback((e, photoId) => {
    e.preventDefault();
    e.stopPropagation();
    const { x: startX, y: startY } = getCoords(e);
    const layout = layouts[photoId] || DEFAULT_LAYOUT(0);
    dragRef.current = {
      type: "photo",
      id: photoId,
      startX,
      startY,
      startLayout: { ...layout },
      dragStarted: false,
    };
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const onMove = (ev) => {
      ev.preventDefault();
      const ref = dragRef.current;
      if (!ref.id) return;
      const { x, y } = getCoords(ev);
      const dist = Math.hypot(x - ref.startX, y - ref.startY);
      if (!ref.dragStarted) {
        if (dist > 5) {
          ref.dragStarted = true;
          if (ref.type === "photo") setDraggingId(ref.id);
          else setDraggingStickerId(ref.id);
        } else return;
      }
      const dx = ((x - ref.startX) / rect.width) * 100;
      const dy = ((y - ref.startY) / rect.height) * 100;
      if (ref.type === "photo") {
        const currentLayouts = layoutsRef.current;
        const l = currentLayouts[ref.id] || ref.startLayout;
        if (!l || typeof l.x !== "number") return;
        let newX = ref.startLayout.x + dx;
        let newY = ref.startLayout.y + dy;
        newX = Math.max(0, Math.min(100 - l.w, newX));
        newY = Math.max(0, Math.min(100 - l.h, newY));
        const guides = { vertical: [], horizontal: [] };
        const otherIds = (photos || []).filter((p) => p.id !== ref.id).map((p) => p.id);
        const vTargets = [0, 50, 100];
        const hTargets = [0, 50, 100];
        otherIds.forEach((id) => {
          const o = currentLayouts[id];
          if (o && typeof o.x === "number") {
            vTargets.push(o.x, o.x + (o.w || 0) / 2, o.x + (o.w || 0));
            hTargets.push(o.y, o.y + (o.h || 0) / 2, o.y + (o.h || 0));
          }
        });
        const dragLeft = newX;
        const dragCenterX = newX + (l.w || 0) / 2;
        const dragRight = newX + (l.w || 0);
        const dragTop = newY;
        const dragCenterY = newY + (l.h || 0) / 2;
        const dragBottom = newY + (l.h || 0);
        let bestV = null;
        let bestVAnchor = 0;
        let bestVDist = SNAP_THRESHOLD;
        vTargets.forEach((t) => {
          const dLeft = Math.abs(dragLeft - t);
          const dCenter = Math.abs(dragCenterX - t);
          const dRight = Math.abs(dragRight - t);
          if (dLeft < bestVDist) {
            bestVDist = dLeft;
            bestV = t;
            bestVAnchor = 0;
          }
          if (dCenter < bestVDist) {
            bestVDist = dCenter;
            bestV = t;
            bestVAnchor = 1;
          }
          if (dRight < bestVDist) {
            bestVDist = dRight;
            bestV = t;
            bestVAnchor = 2;
          }
        });
        let bestH = null;
        let bestHAnchor = 0;
        let bestHDist = SNAP_THRESHOLD;
        hTargets.forEach((t) => {
          const dTop = Math.abs(dragTop - t);
          const dCenter = Math.abs(dragCenterY - t);
          const dBottom = Math.abs(dragBottom - t);
          if (dTop < bestHDist) {
            bestHDist = dTop;
            bestH = t;
            bestHAnchor = 0;
          }
          if (dCenter < bestHDist) {
            bestHDist = dCenter;
            bestH = t;
            bestHAnchor = 1;
          }
          if (dBottom < bestHDist) {
            bestHDist = dBottom;
            bestH = t;
            bestHAnchor = 2;
          }
        });
        if (bestV != null) {
          guides.vertical.push(bestV);
          const offset = bestVAnchor === 0 ? 0 : bestVAnchor === 1 ? (l.w || 0) / 2 : l.w || 0;
          newX = Math.max(0, Math.min(100 - (l.w || 0), bestV - offset));
        }
        if (bestH != null) {
          guides.horizontal.push(bestH);
          const offset = bestHAnchor === 0 ? 0 : bestHAnchor === 1 ? (l.h || 0) / 2 : l.h || 0;
          newY = Math.max(0, Math.min(100 - (l.h || 0), bestH - offset));
        }
        setGuideLines(guides);
        setLayouts((prev) => ({ ...prev, [ref.id]: { ...(prev[ref.id] || ref.startLayout), x: newX, y: newY } }));
      } else {
        setPageConfig((prev) => ({
          ...prev,
          stickers: (prev.stickers || []).map((s) =>
            s.id === ref.id
              ? {
                  ...s,
                  x: Math.max(0, Math.min(100 - (s.w ?? STICKER_DEFAULT_SIZE), ref.startLayout.x + dx)),
                  y: Math.max(0, Math.min(100 - (s.h ?? STICKER_DEFAULT_SIZE), ref.startLayout.y + dy)),
                }
              : s
          ),
        }));
      }
    };
    const onUp = () => {
      if (!dragRef.current.dragStarted && dragRef.current.type === "photo") {
        setSelectedId(dragRef.current.id);
        setSelectedStickerId(null);
      }
      setDraggingId(null);
      setDraggingStickerId(null);
      setGuideLines({ vertical: [], horizontal: [] });
      dragRef.current.id = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    const opts = { passive: false };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onUp);
  }, [layouts, getCoords, photos]);

  const handleStickerMouseDown = useCallback((e, sticker) => {
    e.preventDefault();
    e.stopPropagation();
    const { x: startX, y: startY } = getCoords(e);
    dragRef.current = {
      type: "sticker",
      id: sticker.id,
      startX,
      startY,
      startLayout: { x: sticker.x ?? 10, y: sticker.y ?? 10 },
      dragStarted: false,
    };
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const onMove = (ev) => {
      ev.preventDefault();
      const ref = dragRef.current;
      if (!ref.id || ref.type !== "sticker") return;
      const { x, y } = getCoords(ev);
      const dist = Math.hypot(x - ref.startX, y - ref.startY);
      if (!ref.dragStarted && dist > 5) {
        ref.dragStarted = true;
        setDraggingStickerId(ref.id);
      }
      const dx = ((x - ref.startX) / rect.width) * 100;
      const dy = ((y - ref.startY) / rect.height) * 100;
      setPageConfig((prev) => ({
        ...prev,
        stickers: (prev.stickers || []).map((s) =>
          s.id === ref.id
            ? {
                ...s,
                x: Math.max(0, Math.min(100 - (s.w ?? STICKER_DEFAULT_SIZE), ref.startLayout.x + dx)),
                y: Math.max(0, Math.min(100 - (s.h ?? STICKER_DEFAULT_SIZE), ref.startLayout.y + dy)),
              }
            : s
        ),
      }));
    };
    const onUp = () => {
      if (!dragRef.current.dragStarted) {
        setSelectedId(null);
        setSelectedStickerId(dragRef.current.id);
      }
      setDraggingStickerId(null);
      dragRef.current.id = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    const opts = { passive: false };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onUp);
  }, [getCoords]);

  const updatePageText = useCallback((id, updates) => {
    setPageConfig((prev) => ({
      ...prev,
      texts: (prev.texts || []).map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, []);

  const addPageText = useCallback(() => {
    const t = newPageText();
    setPageConfig((prev) => ({ ...prev, texts: [...(prev.texts || []), t] }));
    setSelectedTextId(t.id);
    setSelectedId(null);
    setSelectedStickerId(null);
  }, []);

  const removePageText = useCallback((id) => {
    setPageConfig((prev) => ({ ...prev, texts: (prev.texts || []).filter((t) => t.id !== id) }));
    if (selectedTextId === id) setSelectedTextId(null);
    if (editingTextInlineId === id) setEditingTextInlineId(null);
  }, [selectedTextId, editingTextInlineId]);

  const handleTextDoubleClick = useCallback((e, textId) => {
    e.preventDefault();
    e.stopPropagation();
    const text = (pageConfig.texts || []).find((x) => x.id === textId);
    if (text) inlineEditOriginalContentRef.current = text.content;
    flushSync(() => {
      setSelectedTextId(textId);
      setSelectedId(null);
      setSelectedStickerId(null);
      setEditingTextInlineId(textId);
    });
    inlineTextInputRef.current?.focus();
  }, [pageConfig.texts]);

  const handleTextTap = useCallback((textId) => {
    const now = Date.now();
    const last = lastTextTapRef.current;
    if (last.id === textId && now - last.time < DOUBLE_TAP_MS) {
      lastTextTapRef.current = { id: null, time: 0 };
      const text = (pageConfig.texts || []).find((x) => x.id === textId);
      if (text) inlineEditOriginalContentRef.current = text.content;
      flushSync(() => {
        setSelectedTextId(textId);
        setSelectedId(null);
        setSelectedStickerId(null);
        setEditingTextInlineId(textId);
      });
      inlineTextInputRef.current?.focus();
      return true;
    }
    /* Single tap: ensure text is selected so options show (no hold required) */
    setSelectedTextId(textId);
    setSelectedId(null);
    setSelectedStickerId(null);
    lastTextTapRef.current = { id: textId, time: now };
    return false;
  }, [pageConfig.texts]);

  useEffect(() => {
    if (editingTextInlineId && document.activeElement !== inlineTextInputRef.current) {
      const t = setTimeout(() => inlineTextInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [editingTextInlineId]);

  const handleTextPointerDown = useCallback((e, textId) => {
    e.preventDefault();
    e.stopPropagation();
    const texts = pageConfig.texts || [];
    const t = texts.find((x) => x.id === textId);
    if (!t) return;
    setSelectedTextId(textId);
    setSelectedId(null);
    setSelectedStickerId(null);
    const { x, y } = getCoords(e);
    const isTouch = !!e.touches?.length;
    const dragThreshold = isTouch ? TEXT_DRAG_THRESHOLD_TOUCH_PX : TEXT_DRAG_THRESHOLD_PX;
    const ref = { textId, x: t.x, y: t.y, startX: x, startY: y, dragStarted: false };
    textDragStartRef.current = ref;
    const wrap = containerRef.current;
    const onMove = (ev) => {
      ev.preventDefault();
      const r = textDragStartRef.current;
      if (!r || r.textId !== textId) return;
      const rect = wrap?.getBoundingClientRect();
      if (!rect) return;
      const pos = getCoords(ev);
      const dist = Math.hypot(pos.x - r.startX, pos.y - r.startY);
      if (!r.dragStarted && dist > dragThreshold) {
        r.dragStarted = true;
        setDraggingTextId(textId);
      }
      if (r.dragStarted) {
        const dx = ((pos.x - r.startX) / rect.width) * 100;
        const dy = ((pos.y - r.startY) / rect.height) * 100;
        updatePageText(textId, {
          x: Math.max(0, Math.min(100, r.x + dx)),
          y: Math.max(0, Math.min(100, r.y + dy)),
        });
      }
    };
    const onUp = () => {
      const r = textDragStartRef.current;
      if (r && !r.dragStarted) handleTextTap(r.textId);
      textDragStartRef.current = null;
      setDraggingTextId(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
    const opts = { passive: false };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
  }, [pageConfig.texts, getCoords, updatePageText, handleTextTap]);

  const handleResizeStart = useCallback((e, photoId, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const layout = layouts[photoId];
    if (!layout || typeof layout.x !== "number") return;
    setResizingId(photoId);
    const el = containerRef.current;
    if (!el) {
      setResizingId(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const l0 = { ...layout };
    const nat = photoNaturalAspectRef.current[photoId];
    const R = visibleImageAspectRatioFromLayout(l0, nat);
    const aspectK =
      R != null && R > 0 && Number.isFinite(R) ? layoutAspectRatioFromImage(R, rect) : l0.w / Math.max(l0.h, 1e-6);
    resizeRef.current = { photoId, handle, startLayout: l0, aspectK };
    const toPct = (clientX, clientY) => ({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
    const onMove = (ev) => {
      ev.preventDefault();
      const ref = resizeRef.current;
      if (!ref.photoId || !ref.handle) return;
      const { x: pctX, y: pctY } = toPct(getCoords(ev).x, getCoords(ev).y);
      const l = ref.startLayout;
      const k = ref.aspectK;
      const { x: newX, y: newY, w: newW, h: newH } = resizeLayoutKeepImageAspect(
        ref.handle,
        l,
        pctX,
        pctY,
        k,
        MIN_SIZE,
        MAX_XY
      );
      setLayouts((prev) => ({ ...prev, [ref.photoId]: { ...prev[ref.photoId], x: newX, y: newY, w: newW, h: newH } }));
    };
    const onUp = () => {
      setResizingId(null);
      resizeRef.current = { photoId: null, handle: null, startLayout: null, aspectK: 1 };
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    const opts = { passive: false };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onUp);
  }, [layouts, getCoords]);

  const handleStickerResizeStart = useCallback((e, stickerId, handle) => {
    e.preventDefault();
    e.stopPropagation();
    const sticker = (pageConfig.stickers || []).find((s) => s.id === stickerId);
    if (!sticker || typeof sticker.x !== "number") return;
    const layout = {
      x: sticker.x ?? 10,
      y: sticker.y ?? 10,
      w: sticker.w ?? STICKER_DEFAULT_SIZE,
      h: sticker.h ?? STICKER_DEFAULT_SIZE,
      rotation: sticker.rotation ?? 0,
    };
    setResizingStickerId(stickerId);
    const el = containerRef.current;
    if (!el) {
      setResizingStickerId(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const l0 = { ...layout };
    const nat = stickerNaturalAspectRef.current[stickerId];
    const R = nat && nat.width > 0 && nat.height > 0 ? nat.width / nat.height : null;
    const aspectK =
      R != null && R > 0 && Number.isFinite(R) ? layoutAspectRatioFromImage(R, rect) : l0.w / Math.max(l0.h, 1e-6);
    resizeStickerRef.current = { stickerId, handle, startLayout: l0, aspectK };
    const toPct = (clientX, clientY) => ({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
    const onMove = (ev) => {
      ev.preventDefault();
      const ref = resizeStickerRef.current;
      if (!ref.stickerId || !ref.handle) return;
      const { x: pctX, y: pctY } = toPct(getCoords(ev).x, getCoords(ev).y);
      const l = ref.startLayout;
      const k = ref.aspectK;
      const { x: newX, y: newY, w: newW, h: newH } = resizeLayoutKeepImageAspect(
        ref.handle,
        l,
        pctX,
        pctY,
        k,
        MIN_SIZE,
        MAX_XY
      );
      setPageConfig((prev) => ({
        ...prev,
        stickers: (prev.stickers || []).map((s) =>
          s.id === ref.stickerId ? { ...s, x: newX, y: newY, w: newW, h: newH } : s
        ),
      }));
    };
    const onUp = () => {
      setResizingStickerId(null);
      resizeStickerRef.current = { stickerId: null, handle: null, startLayout: null, aspectK: 1 };
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    const opts = { passive: false };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onUp);
  }, [pageConfig.stickers, getCoords]);

  function addSticker(path) {
    if (!path) return;
    const id = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    setPageConfig((prev) => ({
      ...prev,
      stickers: [...(prev.stickers || []), { id, path, x: 15, y: 15, w: STICKER_DEFAULT_SIZE, h: STICKER_DEFAULT_SIZE, rotation: 0 }],
    }));
  }

  function updateSticker(stickerId, updates) {
    setPageConfig((prev) => ({
      ...prev,
      stickers: (prev.stickers || []).map((s) => (s.id === stickerId ? { ...s, ...updates } : s)),
    }));
  }

  function removeSticker(stickerId) {
    setPageConfig((prev) => ({
      ...prev,
      stickers: (prev.stickers || []).filter((s) => s.id !== stickerId),
    }));
    setSelectedStickerId(null);
  }

  async function handleRemovePhoto() {
    if (!selectedId || !onRemovePhoto) return;
    try {
      await onRemovePhoto(selectedId, pageConfig);
      setSelectedId(null);
    } catch (err) {
      onSaveError?.(err?.message || "שגיאה בהסרת תמונה");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      for (const p of photos || []) {
        if (layouts[p.id]) await updatePhotoLayout(albumId, p.id, layouts[p.id]);
      }
      const configToSave = {
        ...pageConfig,
        texts: (pageConfig.texts || [])
          .filter((t) => (t.content || "").trim() !== "")
          .map(({ id: _id, ...t }) => t),
      };
      const updated = page?.id ? await updatePageConfig(albumId, page.id, configToSave) : null;
      await onSave(updated);
      onClose();
    } catch (err) {
      onSaveError?.(err?.message || "שגיאה בשמירה");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const sortedPhotos = (photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const selectedPhotoIndex = selectedId ? sortedPhotos.findIndex((p) => p.id === selectedId) : -1;
  const selectedPhoto = selectedPhotoIndex >= 0 ? sortedPhotos[selectedPhotoIndex] : null;
  const selectedLayout = selectedId
    ? (layouts[selectedId] || (selectedPhotoIndex >= 0 ? DEFAULT_LAYOUT(selectedPhotoIndex) : null))
    : null;
  const selectedSticker = selectedStickerId
    ? (pageConfig.stickers || []).find((s) => s.id === selectedStickerId)
    : null;
  const selectedPageText = selectedTextId
    ? (pageConfig.texts || []).find((t) => t.id === selectedTextId)
    : null;

  function updateLayout(photoId, updates) {
    setLayouts((prev) => {
      const cur = prev[photoId] || DEFAULT_LAYOUT(0);
      return { ...prev, [photoId]: { ...cur, ...updates } };
    });
  }

  function applyTemplate(template) {
    const slots = template.slots || [];
    setTemplateSlots(slots.map((s) => ({ ...s, rotation: s.rotation ?? 0 })));
    setSlotPhotoIds(slots.map(() => null));
    setSelectedSlotForPicker(null);
    setSelectedId(null);
    setSelectedStickerId(null);
  }

  function clearTemplate() {
    setTemplateSlots(null);
    setSlotPhotoIds([]);
    setSelectedSlotForPicker(null);
  }

  function assignPhotoToSlot(slotIndex, photoId) {
    const slot = templateSlots?.[slotIndex];
    if (!slot) return;
    setSlotPhotoIds((prev) => {
      const next = [...prev];
      const prevIdx = next.findIndex((id) => id === photoId);
      if (prevIdx >= 0) next[prevIdx] = null;
      next[slotIndex] = photoId;
      return next;
    });
    updateLayout(photoId, { ...slot });
    setSelectedSlotForPicker(null);
  }

  function unassignPhotoFromSlot(slotIndex) {
    setSlotPhotoIds((prev) => {
      const next = [...prev];
      next[slotIndex] = null;
      return next;
    });
  }

  return (
    <div className={styles.fullScreenOverlay} onClick={(e) => { if (e.target === e.currentTarget) { setSelectedId(null); setSelectedStickerId(null); setSelectedTextId(null); setShowCropPanel(false); } }}>
      {showCropPanel && selectedId && selectedLayout && selectedPhoto && (
        <div className={styles.cropModalBackdrop} onClick={() => setShowCropPanel(false)} aria-hidden={false}>
          <div
            className={styles.cropModalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="crop-screen-title"
          >
            <header className={styles.cropModalHeader}>
              <div className={styles.cropModalHeaderText}>
                <h2 id="crop-screen-title" className={styles.cropModalTitle}>
                  חיתוך תמונה
                </h2>
                <p className={styles.cropModalSubtitle}>
                  האזור המואר בתוך המסגרת יוצג בתמונה. התאימו את המיקום והגודל באמצעות המחוונים.
                </p>
              </div>
              <button type="button" className={styles.cropModalClose} onClick={() => setShowCropPanel(false)} aria-label="סגור">
                ×
              </button>
            </header>
            <div className={styles.cropModalBody}>
              <CropModalPreview imageUrl={getPhotoUrl(selectedPhoto.storage_path)} crop={getCrop(selectedLayout) || DEFAULT_CROP} />
              <CropModalSliderGrid
                crop={getCrop(selectedLayout) || DEFAULT_CROP}
                onFieldChange={(key, val) => {
                  const cur = getCrop(selectedLayout) || DEFAULT_CROP;
                  const crop = { ...cur, [key]: val };
                  if (key === "l") crop.w = Math.min(crop.w, 100 - val);
                  else if (key === "t") crop.h = Math.min(crop.h, 100 - val);
                  else if (key === "w") crop.w = Math.min(100 - crop.l, Math.max(1, val));
                  else if (key === "h") crop.h = Math.min(100 - crop.t, Math.max(1, val));
                  updateLayout(selectedId, { crop });
                }}
              />
            </div>
            <footer className={styles.cropModalFooter}>
              <button type="button" className={styles.cropModalBtnGhost} onClick={() => updateLayout(selectedId, { crop: { ...DEFAULT_CROP } })}>
                איפוס מלא
              </button>
              <button type="button" className={styles.cropModalBtnPrimary} onClick={() => setShowCropPanel(false)}>
                סיום
              </button>
            </footer>
          </div>
        </div>
      )}
      <div className={styles.fullScreenContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.fullScreenHeader}>
          <h2>עריכת מיקומים – {pageLabel}</h2>
          <div className={styles.fullScreenActions}>
            <button type="button" className={styles.secondary} onClick={onClose}>ביטול</button>
            <button type="button" className={styles.cta} onClick={handleSave} disabled={saving}>{saving ? "שומר..." : "שמור"}</button>
          </div>
        </div>
        {selectedPageText && (
          <div className={styles.fullScreenTextOptionsRow}>
            <div className={styles.fullScreenTextOptions}>
              <label className={styles.fullScreenTextOptGroup}>
                <span className={styles.fullScreenTextOptLabel}>גופן</span>
                <select
                  value={selectedPageText.fontFamily || DEFAULT_FONT}
                  onChange={(e) => updatePageText(selectedPageText.id, { fontFamily: e.target.value })}
                  className={styles.fullScreenTextOptSelect}
                  aria-label="גופן"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.fullScreenTextOptGroup}>
                <span className={styles.fullScreenTextOptLabel}>גודל</span>
                <input
                  type="number"
                  min={MIN_FONT}
                  max={MAX_FONT}
                  value={selectedPageText.fontSize}
                  onChange={(e) => updatePageText(selectedPageText.id, { fontSize: Number(e.target.value) || MIN_FONT })}
                  className={styles.fullScreenTextOptSize}
                  aria-label="גודל גופן"
                />
              </label>
              <label className={styles.fullScreenTextOptGroup}>
                <span className={styles.fullScreenTextOptLabel}>צבע</span>
                <input
                  type="color"
                  value={selectedPageText.color}
                  onChange={(e) => updatePageText(selectedPageText.id, { color: e.target.value })}
                  className={styles.fullScreenTextOptColor}
                  aria-label="צבע"
                />
              </label>
              <button type="button" className={styles.fullScreenTextOptDelete} onClick={() => removePageText(selectedPageText.id)} title="מחק טקסט">
                מחק
              </button>
            </div>
          </div>
        )}
        <div className={styles.editorLayout}>
          <p className={styles.fullScreenHint}>גרור את התמונה כדי להזיז אותה, לחץ עליה לחיצה אחת כדי להגדיל או להקטין אותה</p>
          <div className={styles.fullScreenPageWrap} ref={containerRef}>
            <div
              className={styles.fullScreenPage}
              onClick={() => { setSelectedId(null); setSelectedStickerId(null); setSelectedTextId(null); setSelectedSlotForPicker(null); setShowCropPanel(false); }}
              style={{
                background: pageConfig.backgroundColor,
                backgroundColor: pageConfig.backgroundColor,
              }}
            >
              {!templateSlots && (
                <div className={styles.editorGridOverlay} aria-hidden />
              )}
              {(guideLines.vertical.length > 0 || guideLines.horizontal.length > 0) && (
                <div className={styles.editorGuideLines} aria-hidden>
                  {guideLines.vertical.map((x) => (
                    <div key={`v-${x}`} className={styles.editorGuideLineV} style={{ left: `${x}%` }} />
                  ))}
                  {guideLines.horizontal.map((y) => (
                    <div key={`h-${y}`} className={styles.editorGuideLineH} style={{ top: `${y}%` }} />
                  ))}
                </div>
              )}
              {templateSlots ? (
                <>
                  {templateSlots.map((slot, i) => {
                    const photoId = slotPhotoIds[i];
                    const slotLayout = { x: slot.x, y: slot.y, w: slot.w, h: slot.h, rotation: slot.rotation ?? 0 };
                    if (photoId) {
                      const p = sortedPhotos.find((ph) => ph.id === photoId);
                      if (!p) return null;
                      const layout = layouts[p.id] || slotLayout;
                      const rot = layout.rotation ?? 0;
                      return (
                        <div
                          key={`slot-${i}-${photoId}`}
                          className={
                            styles.editorPhotoOuter +
                            (selectedId === photoId ? " " + styles.editorPhotoSelectedOuter : "") +
                            (resizingId === photoId ? " " + styles.editorPhotoResizingOuter : "")
                          }
                          style={{
                            left: `${layout.x}%`,
                            top: `${layout.y}%`,
                            width: `${layout.w}%`,
                            height: `${layout.h}%`,
                            transform: rot ? `rotate(${rot}deg)` : undefined,
                          }}
                        >
                          <div
                            className={
                              styles.editorPhoto +
                              (draggingId === photoId ? " " + styles.editorPhotoDragging : "") +
                              (selectedId === photoId ? " " + styles.editorPhotoSelected : "") +
                              (resizingId === photoId ? " " + styles.editorPhotoResizing : "")
                            }
                            onMouseDown={(e) => !resizingId && handleMouseDown(e, p.id)}
                            onTouchStart={(e) => !resizingId && handleMouseDown(e, p.id)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {applyCrop(layouts[p.id] || slotLayout, getPhotoUrl(p.storage_path), (wh) => {
                              photoNaturalAspectRef.current[p.id] = wh;
                            })}
                          </div>
                          {selectedId === photoId && selectedLayout && (
                            <>
                              {["nw", "ne", "sw", "se"].map((h) => (
                                <div
                                  key={h}
                                  className={styles.editorResizeHandle}
                                  data-handle={h}
                                  onMouseDown={(ev) => { ev.stopPropagation(); handleResizeStart(ev, p.id, h); }}
                                  onTouchStart={(ev) => { ev.stopPropagation(); handleResizeStart(ev, p.id, h); }}
                                  aria-label={`Resize ${h}`}
                                />
                              ))}
                            </>
                          )}
                          {selectedId === photoId && (
                            <div className={styles.editorPhotoControls + ((layout.y + (layout.h ?? 0)) > 60 ? " " + styles.editorPhotoControlsAbove : "")}>
                              <button type="button" className={styles.editorPhotoRemoveBtn} onClick={(ev) => { ev.stopPropagation(); setShowCropPanel((v) => !v); }}>חתוך תמונה</button>
                              {templateSlots && slotPhotoIds.includes(p.id) ? (
                                <button type="button" className={styles.editorPhotoRemoveBtn} onClick={(ev) => { ev.stopPropagation(); const idx = slotPhotoIds.indexOf(p.id); if (idx >= 0) unassignPhotoFromSlot(idx); setSelectedId(null); }}>הסר מהמקום</button>
                              ) : onRemovePhoto ? (
                                <button type="button" className={styles.editorPhotoRemoveBtn} onClick={(ev) => { ev.stopPropagation(); handleRemovePhoto(); }}>הסר</button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`placeholder-${i}`}
                        className={styles.templateSlotPlaceholder}
                        style={{
                          left: `${slot.x}%`,
                          top: `${slot.y}%`,
                          width: `${slot.w}%`,
                          height: `${slot.h}%`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(null);
                          setSelectedStickerId(null);
                          if (onUploadToPage && slotFileInputRef.current) {
                            setSlotIndexForNextUpload(i);
                            slotFileInputRef.current.click();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(null);
                            setSelectedStickerId(null);
                            if (onUploadToPage && slotFileInputRef.current) {
                              setSlotIndexForNextUpload(i);
                              slotFileInputRef.current.click();
                            }
                          }
                        }}
                        aria-label="הוסף תמונה"
                      >
                        <span className={styles.templateSlotPlus}>+</span>
                      </div>
                    );
                  })}
                </>
              ) : (
                sortedPhotos.map((p) => {
                const layout = layouts[p.id] || DEFAULT_LAYOUT(0);
                const rot = layout.rotation ?? 0;
                return (
                  <div
                    key={p.id}
                    className={
                        styles.editorPhotoOuter +
                        (selectedId === p.id ? " " + styles.editorPhotoSelectedOuter : "") +
                        (resizingId === p.id ? " " + styles.editorPhotoResizingOuter : "")
                    }
                    style={{
                      left: `${layout.x}%`,
                      top: `${layout.y}%`,
                      width: `${layout.w}%`,
                      height: `${layout.h}%`,
                      transform: rot ? `rotate(${rot}deg)` : undefined,
                    }}
                    >
                      <div
                        className={
                          styles.editorPhoto +
                          (draggingId === p.id ? " " + styles.editorPhotoDragging : "") +
                          (selectedId === p.id ? " " + styles.editorPhotoSelected : "") +
                          (resizingId === p.id ? " " + styles.editorPhotoResizing : "")
                        }
                        onMouseDown={(e) => !resizingId && handleMouseDown(e, p.id)}
                        onTouchStart={(e) => !resizingId && handleMouseDown(e, p.id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                        {applyCrop(layouts[p.id] || DEFAULT_LAYOUT(0), getPhotoUrl(p.storage_path), (wh) => {
                          photoNaturalAspectRef.current[p.id] = wh;
                        })}
                      </div>
                      {selectedId === p.id && selectedLayout && (
                        <>
                          {["nw", "ne", "sw", "se"].map((h) => (
                            <div
                              key={h}
                              className={styles.editorResizeHandle}
                              data-handle={h}
                              onMouseDown={(ev) => { ev.stopPropagation(); handleResizeStart(ev, p.id, h); }}
                              onTouchStart={(ev) => { ev.stopPropagation(); handleResizeStart(ev, p.id, h); }}
                              aria-label={`Resize ${h}`}
                            />
                          ))}
                        </>
                      )}
                      {selectedId === p.id && (
                        <div className={styles.editorPhotoControls + ((layout.y + (layout.h ?? 0)) > 60 ? " " + styles.editorPhotoControlsAbove : "")}>
                          <button type="button" className={styles.editorPhotoRemoveBtn} onClick={(ev) => { ev.stopPropagation(); setShowCropPanel((v) => !v); }}>חתוך תמונה</button>
                          {onRemovePhoto && (
                            <button type="button" className={styles.editorPhotoRemoveBtn} onClick={(ev) => { ev.stopPropagation(); handleRemovePhoto(); }}>הסר</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {(pageConfig.stickers || []).map((sticker) => {
                if (!sticker.path) return null;
                const w = sticker.w ?? STICKER_DEFAULT_SIZE;
                const h = sticker.h ?? STICKER_DEFAULT_SIZE;
                const x = sticker.x ?? 10;
                const y = sticker.y ?? 10;
                const rot = sticker.rotation ?? 0;
                const imgUrl = getElementUrl(sticker.path);
                const isSelected = selectedStickerId === sticker.id;
                return (
                  <div
                    key={sticker.id}
                    className={
                      styles.editorSticker +
                      (draggingStickerId === sticker.id ? " " + styles.editorPhotoDragging : "") +
                      (isSelected ? " " + styles.editorPhotoSelected : "") +
                      (resizingStickerId === sticker.id ? " " + styles.editorPhotoResizing : "")
                    }
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      transform: rot ? `rotate(${rot}deg)` : undefined,
                    }}
                    onMouseDown={(e) => !resizingStickerId && handleStickerMouseDown(e, sticker)}
                    onTouchStart={(e) => !resizingStickerId && handleStickerMouseDown(e, sticker)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={imgUrl}
                      alt=""
                      className={styles.stickerImg}
                      onLoad={(ev) => {
                        const im = ev.currentTarget;
                        if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                          stickerNaturalAspectRef.current[sticker.id] = {
                            width: im.naturalWidth,
                            height: im.naturalHeight,
                          };
                        }
                      }}
                    />
                    {isSelected && (
                      <>
                        {["nw", "ne", "sw", "se"].map((handleKey) => (
                          <div
                            key={handleKey}
                            className={styles.editorResizeHandle}
                            data-handle={handleKey}
                            onMouseDown={(ev) => { ev.stopPropagation(); handleStickerResizeStart(ev, sticker.id, handleKey); }}
                            onTouchStart={(ev) => { ev.stopPropagation(); handleStickerResizeStart(ev, sticker.id, handleKey); }}
                            aria-label={`Resize ${handleKey}`}
                          />
                        ))}
                        <div className={styles.editorPhotoControls + ((y + h) > 60 ? " " + styles.editorPhotoControlsAbove : "")}>
                          <button type="button" className={styles.editorPhotoRemoveBtn} onClick={(ev) => { ev.stopPropagation(); removeSticker(sticker.id); }}>הסר אלמנט</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {(pageConfig.texts || []).map((t) => (
                <div
                  key={t.id}
                  className={
                    styles.pageTextDisplay +
                    (draggingTextId === t.id ? " " + styles.pageTextDragging : "") +
                    (selectedTextId === t.id && editingTextInlineId !== t.id ? " " + styles.pageTextSelected : "")
                  }
                  style={{
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `${t.fontSize}px`,
                    color: isValidHex(t.color) ? t.color : DEFAULT_TEXT_COLOR,
                    fontFamily: getFontStack(t.fontFamily || DEFAULT_FONT),
                  }}
                  onMouseDown={(e) => handleTextPointerDown(e, t.id)}
                  onTouchStart={(e) => handleTextPointerDown(e, t.id)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => handleTextDoubleClick(e, t.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelectedTextId(t.id); }}
                  aria-label="טקסט בעמוד – לחיצה כפולה לעריכת התוכן"
                >
                  {editingTextInlineId === t.id ? (
                    <input
                      ref={inlineTextInputRef}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      className={styles.pageTextInlineInput}
                      value={t.content}
                      onChange={(e) => updatePageText(t.id, { content: e.target.value })}
                      onBlur={() => setEditingTextInlineId(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setEditingTextInlineId(null);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          updatePageText(t.id, { content: inlineEditOriginalContentRef.current });
                          setEditingTextInlineId(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="עריכת תוכן הטקסט"
                    />
                  ) : (
                    <span className={styles.pageTextTitle}>{t.content.trim() || "טקסט"}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.editorControlsCol}>
            <div className={styles.editorControls}>
              <h4>צבע רקע העמוד</h4>
                  <label className={styles.controlRow}>
                <span>צבע רקע</span>
                    <input
                  type="color"
                  value={pageConfig.backgroundColor}
                  onChange={(e) => setPageConfig((c) => ({ ...c, backgroundColor: e.target.value }))}
                  className={styles.colorPicker}
                  aria-label="צבע רקע"
                />
                  </label>
            </div>
            {onUploadToPage && (
              <>
                    <input
                  ref={slotFileInputRef}
                  type="file"
                  accept="image/*,image/heic,image/heif"
                  multiple={false}
                      onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length && slotIndexForNextUpload != null) {
                      slotUploadingForRef.current = {
                        slotIndex: slotIndexForNextUpload,
                        previousIds: new Set((photos || []).map((p) => p.id)),
                      };
                      setSlotIndexForNextUpload(null);
                      setUploading(true);
                      onUploadToPage(Array.from(files), pageConfig).finally(() => {
                        setUploading(false);
                        e.target.value = "";
                      });
                    }
                  }}
                  style={{ display: "none" }}
                  aria-hidden
                />
                <div className={styles.addPageActionsRow}>
              <label className={styles.addImageToPageBtn}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files?.length) {
                      setUploading(true);
                          onUploadToPage(Array.from(files), pageConfig).finally(() => {
                        setUploading(false);
                        e.target.value = "";
                      });
                    }
                  }}
                  hidden
                />
                <span>{uploading ? "מעלה..." : "הוסף תמונות לעמוד"}</span>
              </label>
                  <button type="button" className={styles.addPageTextBtn} onClick={addPageText}>
                    הוסף טקסט לעמוד
                  </button>
                </div>
                <p className={styles.addPageTextHint}>ניתן להוסיף כמה טקסטים.</p>
              </>
            )}
            <div className={styles.stickerPicker}>
              <span className={styles.stickerPickerLabel}>אלמנטים מוכנים</span>
              {elementsList.length === 0 && (
                <p className={styles.stickerPickerHint}>טוען... או הוסף תמונות ל־bucket "elements" ב־Storage.</p>
              )}
              <div className={styles.stickerPickerRow}>
                {elementsList.map((c) => (
                  <button
                    key={c.path}
                    type="button"
                    className={styles.stickerPickerBtn}
                    onClick={() => addSticker(c.path)}
                    title={c.path}
                    aria-label={c.path}
                  >
                    <img src={getElementUrl(c.path)} alt="" className={styles.stickerPickerImg} />
                  </button>
                ))}
          </div>
        </div>
            <div className={styles.templatePicker}>
              <span className={styles.stickerPickerLabel}>בחר מתבנית מוכנת</span>
              <p className={styles.stickerPickerHint}>
                &quot;ללא תבנית&quot; מבטל את מצב המסגרות. אחרת לחץ על תבנית — יופיעו מקומות עם +, ואז לחץ על + ובחר תמונה.
              </p>
              <div className={styles.templatePickerRow}>
                <button
                  type="button"
                  className={
                    styles.templatePickerBtn + (!templateSlots ? " " + styles.templatePickerBtnActive : "")
                  }
                  onClick={clearTemplate}
                  title="ללא תבנית"
                  aria-label="ללא תבנית — פריסה חופשית"
                >
                  <span className={styles.templatePickerLabel}>ללא תבנית</span>
                  <span className={styles.templatePickerSlots}>פריסה חופשית</span>
                </button>
                {PAGE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className={styles.templatePickerBtn}
                    onClick={() => applyTemplate(tpl)}
                    title={tpl.name}
                    aria-label={tpl.name}
                  >
                    <span className={styles.templatePickerLabel}>{tpl.name}</span>
                    <span className={styles.templatePickerSlots}>{tpl.slots.length} מקומות</span>
                  </button>
                ))}
              </div>
            </div>
            {selectedSlotForPicker !== null && (
              <div className={styles.slotPhotoPicker}>
                <h4 className={styles.slotPhotoPickerTitle}>בחר תמונה למקום {selectedSlotForPicker + 1}</h4>
                {sortedPhotos.length === 0 ? (
                  <p className={styles.stickerPickerHint}>אין תמונות בעמוד. הוסף תמונות למעלה ואז בחר.</p>
                ) : (
                  <div className={styles.slotPhotoPickerGrid}>
                    {sortedPhotos.map((p) => {
                      const inSlot = slotPhotoIds.indexOf(p.id);
                      const isInOtherSlot = inSlot >= 0 && inSlot !== selectedSlotForPicker;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={styles.slotPhotoPickerBtn + (isInOtherSlot ? " " + styles.slotPhotoPickerBtnUsed : "")}
                          onClick={() => assignPhotoToSlot(selectedSlotForPicker, p.id)}
                          title={isInOtherSlot ? "העבר למקום זה" : "בחר תמונה"}
                        >
                          <img src={getPhotoUrl(p.storage_path)} alt="" />
                          {isInOtherSlot && <span className={styles.slotPhotoPickerUsedLabel}>במקום {inSlot + 1}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button type="button" className={styles.secondary} onClick={() => setSelectedSlotForPicker(null)} style={{ marginTop: "0.5rem" }}>
                  ביטול
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EDITOR_PAGE_WIDTH = 420;
const SPREAD_HALF_PAGE_MAX_WIDTH = 260;
const SPREAD_TEXT_SCALE = SPREAD_HALF_PAGE_MAX_WIDTH / EDITOR_PAGE_WIDTH;

function PageTexts({ texts }) {
  if (!Array.isArray(texts) || texts.length === 0) return null;
  return (
    <div className={styles.halfPageTexts} aria-hidden>
      {texts.map((t, i) => {
        const designSize = t.fontSize ?? 28;
        const spreadSize = Math.round(designSize * SPREAD_TEXT_SCALE);
        return (
          <div
            key={t.id || i}
            className={styles.halfPageText}
            style={{
              left: `${t.x ?? 50}%`,
              top: `${t.y ?? 25}%`,
              transform: "translate(-50%, -50%)",
              fontSize: `${spreadSize}px`,
              color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#000",
              fontFamily: getFontStack(t.fontFamily || DEFAULT_FONT),
            }}
          >
            {t.content}
          </div>
        );
      })}
    </div>
  );
}

const STUDIO_TEXT_DOUBLE_TAP_MS = 550;
const STUDIO_TEXT_DRAG_PX = 5;
const STUDIO_TEXT_DRAG_TOUCH_PX = 14;

function normalizeStudioFontSize(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_TEXT_FONT_SIZE;
  return Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(n)));
}

function StudioTextToolbar({ text, onPatch, onRemove, onDismiss, onLiveFontSizeChange }) {
  const fontPatchTimerRef = useRef(null);
  const [fontSizeLocal, setFontSizeLocal] = useState(() => normalizeStudioFontSize(text?.fontSize));

  useEffect(() => {
    setFontSizeLocal(normalizeStudioFontSize(text?.fontSize));
  }, [text?.id, text?.fontSize]);

  useEffect(
    () => () => {
      if (fontPatchTimerRef.current) window.clearTimeout(fontPatchTimerRef.current);
    },
    []
  );

  function scheduleFontSizePatch(nv) {
    if (fontPatchTimerRef.current) window.clearTimeout(fontPatchTimerRef.current);
    fontPatchTimerRef.current = window.setTimeout(() => {
      onPatch({ fontSize: nv });
      fontPatchTimerRef.current = null;
    }, 90);
  }

  function applyRangeFontSize(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const nv = Math.min(MAX_FONT, Math.max(MIN_FONT, Math.round(n)));
    setFontSizeLocal(nv);
    onLiveFontSizeChange?.(nv);
    scheduleFontSizePatch(nv);
  }

  if (!text) return null;
  const safeColor = isValidHex(text.color) ? text.color : DEFAULT_TEXT_COLOR;
  const fs = fontSizeLocal;
  return (
    <div className={styles.studioTextToolbar} role="region" aria-label="עיצוב טקסט" data-studio-text-toolbar>
      <p className={styles.studioTextToolbarTitle}>עיצוב טקסט</p>
      <div className={styles.studioTextToolbarGroup}>
        <span className={styles.studioTextToolbarLabel}>גופן</span>
        <select
          className={styles.studioTextToolbarSelect}
          value={text.fontFamily || DEFAULT_FONT}
          onChange={(e) => onPatch({ fontFamily: e.target.value })}
          aria-label="גופן"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.studioTextToolbarGroup}>
        <span className={styles.studioTextToolbarLabel}>גודל</span>
        <div className={styles.studioTextToolbarSizeWrap}>
          <input
            type="range"
            className={styles.studioTextToolbarSlider}
            min={MIN_FONT}
            max={MAX_FONT}
            step={1}
            value={fs}
            onInput={(e) => applyRangeFontSize(e.currentTarget.value)}
            onChange={(e) => applyRangeFontSize(e.currentTarget.value)}
            aria-label="גודל גופן"
          />
          <input
            type="number"
            className={styles.studioTextToolbarSizeNum}
            min={MIN_FONT}
            max={MAX_FONT}
            value={fs}
            onChange={(e) => {
              const nv = normalizeStudioFontSize(e.target.value);
              setFontSizeLocal(nv);
              onLiveFontSizeChange?.(nv);
              if (fontPatchTimerRef.current) window.clearTimeout(fontPatchTimerRef.current);
              onPatch({ fontSize: nv });
            }}
            aria-label="גודל במספר"
          />
        </div>
      </div>
      <div className={styles.studioTextToolbarGroup}>
        <span className={styles.studioTextToolbarLabel}>צבע</span>
        <input
          type="color"
          className={styles.studioTextToolbarColor}
          value={safeColor}
          onChange={(e) => onPatch({ color: e.target.value })}
          aria-label="צבע טקסט"
        />
      </div>
      <button type="button" className={styles.studioTextToolbarBtn} onClick={onDismiss}>
        סיום
      </button>
      <button type="button" className={`${styles.studioTextToolbarBtn} ${styles.studioTextToolbarBtnDanger}`} onClick={onRemove}>
        מחק טקסט
      </button>
    </div>
  );
}

function StudioSpreadTexts({
  pageId: _pageId,
  texts: textsProp,
  selectedTextId,
  editingTextId,
  onSelectText,
  onEditingChange,
  onPatchText,
  liveFontSize,
}) {
  const containerRef = useRef(null);
  const inlineTextInputRef = useRef(null);
  const inlineEditOriginalContentRef = useRef("");
  const lastTextTapRef = useRef({ id: null, time: 0 });
  const textDragStartRef = useRef({ textId: null, startX: 0, startY: 0, origX: 0, origY: 0, dragStarted: false });
  const dragFinalRef = useRef(null);
  const [draggingTextId, setDraggingTextId] = useState(null);
  const [dragOverride, setDragOverride] = useState(null);
  const [inlineDraft, setInlineDraft] = useState(null);
  const inlineDraftRef = useRef(null);
  const editingIdRef = useRef(null);

  const textsList = useMemo(() => loadTextsFromPageConfig({ texts: textsProp }), [textsProp]);
  const textsSig = JSON.stringify(textsProp || []);

  useEffect(() => {
    inlineDraftRef.current = inlineDraft;
  }, [inlineDraft]);

  useEffect(() => {
    editingIdRef.current = editingTextId;
  }, [editingTextId]);

  useEffect(() => {
    setDragOverride(null);
    dragFinalRef.current = null;
  }, [textsSig]);

  /* Seed draft when starting to edit this block — avoid textsSig here or server refresh wipes typed text */
  useEffect(() => {
    if (!editingTextId) {
      setInlineDraft(null);
      inlineDraftRef.current = null;
      return;
    }
    const list = loadTextsFromPageConfig({ texts: textsProp });
    const tx = list.find((x) => x.id === editingTextId);
    if (tx) {
      const next = { textId: editingTextId, content: tx.content || "" };
      setInlineDraft(next);
      inlineDraftRef.current = next;
    }
  }, [editingTextId, textsProp]);

  const getCoords = useCallback((e) => {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }, []);

  const handleTextTap = useCallback(
    (textId) => {
      const now = Date.now();
      const last = lastTextTapRef.current;
      if (last.id === textId && now - last.time < STUDIO_TEXT_DOUBLE_TAP_MS) {
        lastTextTapRef.current = { id: null, time: 0 };
        const tx = textsList.find((x) => x.id === textId);
        if (tx) inlineEditOriginalContentRef.current = tx.content;
        flushSync(() => {
          onSelectText(textId);
          onEditingChange(textId);
        });
        inlineTextInputRef.current?.focus();
        return true;
      }
      onSelectText(textId);
      onEditingChange(null);
      lastTextTapRef.current = { id: textId, time: now };
      return false;
    },
    [textsList, onSelectText, onEditingChange]
  );

  useEffect(() => {
    if (editingTextId && document.activeElement !== inlineTextInputRef.current) {
      const t = setTimeout(() => inlineTextInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [editingTextId]);

  const handleTextPointerDown = useCallback(
    (e, textId) => {
      e.preventDefault();
      e.stopPropagation();
      const t = textsList.find((x) => x.id === textId);
      if (!t) return;
      const ox = dragOverride?.textId === textId ? dragOverride.x : (t.x ?? DEFAULT_TEXT_X);
      const oy = dragOverride?.textId === textId ? dragOverride.y : (t.y ?? DEFAULT_TEXT_Y);
      const { x: startX, y: startY } = getCoords(e);
      const isTouch = !!e.touches?.length;
      const dragThreshold = isTouch ? STUDIO_TEXT_DRAG_TOUCH_PX : STUDIO_TEXT_DRAG_PX;
      textDragStartRef.current = {
        textId,
        startX,
        startY,
        origX: ox,
        origY: oy,
        dragStarted: false,
      };
      const wrap = containerRef.current;
      const onMove = (ev) => {
        ev.preventDefault();
        const r = textDragStartRef.current;
        if (!r || r.textId !== textId) return;
        const rect = wrap?.getBoundingClientRect();
        if (!rect) return;
        const pos = getCoords(ev);
        const dist = Math.hypot(pos.x - r.startX, pos.y - r.startY);
        if (!r.dragStarted && dist > dragThreshold) {
          r.dragStarted = true;
          setDraggingTextId(textId);
        }
        if (r.dragStarted) {
          const dx = ((pos.x - r.startX) / rect.width) * 100;
          const dy = ((pos.y - r.startY) / rect.height) * 100;
          const nx = Math.max(0, Math.min(100, r.origX + dx));
          const ny = Math.max(0, Math.min(100, r.origY + dy));
          dragFinalRef.current = { textId, x: nx, y: ny };
          setDragOverride({ textId, x: nx, y: ny });
        }
      };
      const onUp = async () => {
        const r = textDragStartRef.current;
        textDragStartRef.current = { textId: null, startX: 0, startY: 0, origX: 0, origY: 0, dragStarted: false };
        setDraggingTextId(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        window.removeEventListener("touchcancel", onUp);
        if (!r.textId) return;
        if (r.dragStarted) {
          const fin = dragFinalRef.current?.textId === r.textId ? dragFinalRef.current : null;
          dragFinalRef.current = null;
          try {
            if (fin) await onPatchText(r.textId, { x: fin.x, y: fin.y }, { skipUndo: true });
          } finally {
            setDragOverride(null);
          }
        } else {
          handleTextTap(r.textId);
        }
      };
      const opts = { passive: false };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, opts);
      window.addEventListener("touchend", onUp);
      window.addEventListener("touchcancel", onUp);
    },
    [textsList, getCoords, handleTextTap, onPatchText]
  );

  const handleTextDoubleClick = useCallback(
    (e, textId) => {
      e.preventDefault();
      e.stopPropagation();
      const tx = textsList.find((x) => x.id === textId);
      if (tx) inlineEditOriginalContentRef.current = tx.content;
      flushSync(() => {
        onSelectText(textId);
        onEditingChange(textId);
      });
      inlineTextInputRef.current?.focus();
    },
    [textsList, onSelectText, onEditingChange]
  );

  if (!textsList.length) return null;

  return (
    <div ref={containerRef} className={`${styles.halfPageTexts} ${styles.studioTextsLayer}`} aria-hidden={false}>
      {textsList.map((t) => {
        const fromServer = t.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
        const designSize =
          selectedTextId === t.id && liveFontSize != null && Number.isFinite(liveFontSize)
            ? Math.min(MAX_FONT, Math.max(MIN_FONT, liveFontSize))
            : fromServer;
        const spreadSize = Math.round(designSize * SPREAD_TEXT_SCALE);
        const posX = dragOverride?.textId === t.id ? dragOverride.x : (t.x ?? DEFAULT_TEXT_X);
        const posY = dragOverride?.textId === t.id ? dragOverride.y : (t.y ?? DEFAULT_TEXT_Y);
        const isSelected = selectedTextId === t.id;
        const isEditing = editingTextId === t.id;
        return (
          <div
            key={t.id}
            className={
              styles.pageTextDisplay +
              " " +
              styles.studioTextDisplaySpread +
              (draggingTextId === t.id ? " " + styles.pageTextDragging : "") +
              (isSelected && !isEditing ? " " + styles.pageTextSelectedStudio : "")
            }
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
              transform: "translate(-50%, -50%)",
              fontSize: `${spreadSize}px`,
              color: isValidHex(t.color) ? t.color : DEFAULT_TEXT_COLOR,
              fontFamily: getFontStack(t.fontFamily || DEFAULT_FONT),
            }}
            onMouseDown={(e) => handleTextPointerDown(e, t.id)}
            onTouchStart={(e) => handleTextPointerDown(e, t.id)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => handleTextDoubleClick(e, t.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSelectText(t.id);
                onEditingChange(t.id);
              }
            }}
            aria-label="טקסט — גרירה להזזה, לחיצה כפולה לעריכה"
          >
            {isEditing ? (
              <input
                ref={inlineTextInputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                className={`${styles.pageTextInlineInput} ${styles.pageTextInlineInputSpread}`}
                value={inlineDraft?.textId === t.id ? inlineDraft.content : t.content || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setInlineDraft((d) => {
                    if (d?.textId !== t.id) return d;
                    const next = { ...d, content: v };
                    inlineDraftRef.current = next;
                    return next;
                  });
                }}
                onBlur={() => {
                  const textIdForBlur = t.id;
                  const contentToSave = inlineTextInputRef.current?.value ?? inlineDraftRef.current?.content ?? "";
                  window.setTimeout(async () => {
                    await onPatchText(textIdForBlur, { content: contentToSave }, { skipUndo: true });
                    setInlineDraft(null);
                    if (editingIdRef.current === textIdForBlur) onEditingChange(null);
                  }, 0);
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = e.currentTarget.value;
                    await onPatchText(t.id, { content: v }, { skipUndo: true });
                    setInlineDraft(null);
                    onEditingChange(null);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    await onPatchText(t.id, { content: inlineEditOriginalContentRef.current }, { skipUndo: true });
                    setInlineDraft(null);
                    onEditingChange(null);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label="עריכת תוכן"
              />
            ) : (
              <span className={styles.pageTextTitle}>{(t.content || "").trim() || "טקסט"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PageStickers({ stickers, getElementUrl }) {
  if (!Array.isArray(stickers) || stickers.length === 0) return null;
  return (
    <div className={styles.halfPageStickers} aria-hidden>
      {stickers.map((s) => {
        if (!s.path) return null;
        const x = s.x ?? 10;
        const y = s.y ?? 10;
        const w = s.w ?? 12;
        const h = s.h ?? 12;
        const rot = s.rotation ?? 0;
        return (
          <div
            key={s.id}
            className={styles.halfPageSticker}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${w}%`,
              height: `${h}%`,
              transform: rot ? `rotate(${rot}deg)` : undefined,
            }}
          >
            <img src={getElementUrl(s.path)} alt="" />
          </div>
        );
      })}
    </div>
  );
}

const SPREAD_LAYOUT_MIN = 8;
const SPREAD_LAYOUT_MAX = 100;
const SPREAD_SNAP_THRESHOLD = 2.5;

/** Studio spread: free-form layout with tap-to-select, corner resize, and drag (same % model as full editor). */
function StudioSpreadPhotos({ photos, getPhotoUrl, selectedPhotoId, onSelectPhoto, onPersistLayout }) {
  const containerRef = useRef(null);
  const sorted = useMemo(() => [...photos].sort((a, b) => a.photo_order - b.photo_order), [photos]);
  const layoutSyncKey = sorted.map((p) => `${p.id}:${p.photo_order}:${JSON.stringify(p.layout ?? null)}`).join(";");
  const [layouts, setLayouts] = useState({});
  const layoutsRef = useRef(layouts);
  const dragRef = useRef({ id: null, startX: 0, startY: 0, startLayout: null, dragStarted: false });
  const resizeRef = useRef({ photoId: null, handle: null, startLayout: null, aspectK: 1 });
  const naturalAspectByPhotoRef = useRef({});
  const [draggingId, setDraggingId] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [guideLines, setGuideLines] = useState({ vertical: [], horizontal: [] });

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  useEffect(() => {
    const next = {};
    sorted.forEach((p, i) => {
      next[p.id] =
        p.layout && typeof p.layout.x === "number"
          ? { ...DEFAULT_LAYOUT(i), ...p.layout, rotation: p.layout.rotation ?? 0 }
          : DEFAULT_LAYOUT(i);
    });
    setLayouts(next);
  }, [layoutSyncKey]);

  const getCoords = useCallback((e) => {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }, []);

  const handleResizeStart = useCallback(
    (e, photoId, handle) => {
      e.preventDefault();
      e.stopPropagation();
      const layout = layoutsRef.current[photoId];
      if (!layout || typeof layout.x !== "number") return;
      onSelectPhoto(photoId);
      setResizingId(photoId);
      const el = containerRef.current;
      if (!el) {
        setResizingId(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const l0 = { ...layout };
      const nat = naturalAspectByPhotoRef.current[photoId];
      const R = visibleImageAspectRatioFromLayout(l0, nat);
      const aspectK =
        R != null && R > 0 && Number.isFinite(R)
          ? layoutAspectRatioFromImage(R, rect)
          : l0.w / Math.max(l0.h, 1e-6);
      resizeRef.current = { photoId, handle, startLayout: l0, aspectK };
      const toPct = (clientX, clientY) => ({
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      });
      const onMove = (ev) => {
        ev.preventDefault();
        const ref = resizeRef.current;
        if (!ref.photoId || !ref.handle) return;
        const { x: pctX, y: pctY } = toPct(getCoords(ev).x, getCoords(ev).y);
        const l = ref.startLayout;
        const k = ref.aspectK;
        const { x: newX, y: newY, w: newW, h: newH } = resizeLayoutKeepImageAspect(
          ref.handle,
          l,
          pctX,
          pctY,
          k,
          SPREAD_LAYOUT_MIN,
          SPREAD_LAYOUT_MAX
        );
        setLayouts((prev) => ({
          ...prev,
          [ref.photoId]: { ...(prev[ref.photoId] || l), x: newX, y: newY, w: newW, h: newH },
        }));
      };
      const onUp = async () => {
        setResizingId(null);
        const fid = resizeRef.current.photoId;
        resizeRef.current = { photoId: null, handle: null, startLayout: null, aspectK: 1 };
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        if (fid) {
          const lay = layoutsRef.current[fid];
          if (lay) await onPersistLayout(fid, lay);
        }
      };
      const opts = { passive: false };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, opts);
      window.addEventListener("touchend", onUp);
    },
    [getCoords, onSelectPhoto, onPersistLayout]
  );

  const handlePhotoPointerDown = useCallback(
    (e, photoId) => {
      e.preventDefault();
      e.stopPropagation();
      const { x: startX, y: startY } = getCoords(e);
      const layout = layoutsRef.current[photoId] || DEFAULT_LAYOUT(0);
      dragRef.current = {
        id: photoId,
        startX,
        startY,
        startLayout: { ...layout },
        dragStarted: false,
      };
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const onMove = (ev) => {
        ev.preventDefault();
        const ref = dragRef.current;
        if (!ref.id) return;
        const { x, y } = getCoords(ev);
        const dist = Math.hypot(x - ref.startX, y - ref.startY);
        if (!ref.dragStarted) {
          if (dist > 5) ref.dragStarted = true;
          else return;
        }
        setDraggingId(ref.id);
        const dx = ((x - ref.startX) / rect.width) * 100;
        const dy = ((y - ref.startY) / rect.height) * 100;
        const l = ref.startLayout;
        let newX = l.x + dx;
        let newY = l.y + dy;
        newX = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - l.w, newX));
        newY = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - l.h, newY));
        const guides = { vertical: [], horizontal: [] };
        const currentLayouts = layoutsRef.current;
        const otherIds = sorted.filter((p) => p.id !== ref.id).map((p) => p.id);
        const vTargets = [0, 50, SPREAD_LAYOUT_MAX];
        const hTargets = [0, 50, SPREAD_LAYOUT_MAX];
        otherIds.forEach((oid) => {
          const o = currentLayouts[oid];
          if (o && typeof o.x === "number") {
            vTargets.push(o.x, o.x + (o.w || 0) / 2, o.x + (o.w || 0));
            hTargets.push(o.y, o.y + (o.h || 0) / 2, o.y + (o.h || 0));
          }
        });
        const dragLeft = newX;
        const dragCenterX = newX + (l.w || 0) / 2;
        const dragRight = newX + (l.w || 0);
        const dragTop = newY;
        const dragCenterY = newY + (l.h || 0) / 2;
        const dragBottom = newY + (l.h || 0);
        let bestV = null;
        let bestVAnchor = 0;
        let bestVDist = SPREAD_SNAP_THRESHOLD;
        vTargets.forEach((t) => {
          const dLeft = Math.abs(dragLeft - t);
          const dCenter = Math.abs(dragCenterX - t);
          const dRight = Math.abs(dragRight - t);
          if (dLeft < bestVDist) {
            bestVDist = dLeft;
            bestV = t;
            bestVAnchor = 0;
          }
          if (dCenter < bestVDist) {
            bestVDist = dCenter;
            bestV = t;
            bestVAnchor = 1;
          }
          if (dRight < bestVDist) {
            bestVDist = dRight;
            bestV = t;
            bestVAnchor = 2;
          }
        });
        let bestH = null;
        let bestHAnchor = 0;
        let bestHDist = SPREAD_SNAP_THRESHOLD;
        hTargets.forEach((t) => {
          const dTop = Math.abs(dragTop - t);
          const dCenter = Math.abs(dragCenterY - t);
          const dBottom = Math.abs(dragBottom - t);
          if (dTop < bestHDist) {
            bestHDist = dTop;
            bestH = t;
            bestHAnchor = 0;
          }
          if (dCenter < bestHDist) {
            bestHDist = dCenter;
            bestH = t;
            bestHAnchor = 1;
          }
          if (dBottom < bestHDist) {
            bestHDist = dBottom;
            bestH = t;
            bestHAnchor = 2;
          }
        });
        if (bestV != null) {
          guides.vertical.push(bestV);
          const offset = bestVAnchor === 0 ? 0 : bestVAnchor === 1 ? (l.w || 0) / 2 : l.w || 0;
          newX = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - (l.w || 0), bestV - offset));
        }
        if (bestH != null) {
          guides.horizontal.push(bestH);
          const offset = bestHAnchor === 0 ? 0 : bestHAnchor === 1 ? (l.h || 0) / 2 : l.h || 0;
          newY = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - (l.h || 0), bestH - offset));
        }
        setGuideLines(guides);
        setLayouts((prev) => ({
          ...prev,
          [ref.id]: { ...(prev[ref.id] || l), x: newX, y: newY },
        }));
      };
      const onUp = async () => {
        const ref = dragRef.current;
        dragRef.current = { id: null, startX: 0, startY: 0, startLayout: null, dragStarted: false };
        setDraggingId(null);
        setGuideLines({ vertical: [], horizontal: [] });
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        window.removeEventListener("touchcancel", onUp);
        if (!ref.id) return;
        if (!ref.dragStarted) {
          if (selectedPhotoId === ref.id) onSelectPhoto(null);
          else onSelectPhoto(ref.id);
        } else {
          const lay = layoutsRef.current[ref.id];
          if (lay) await onPersistLayout(ref.id, lay);
        }
      };
      const opts = { passive: false };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, opts);
      window.addEventListener("touchend", onUp);
      window.addEventListener("touchcancel", onUp);
    },
    [getCoords, onSelectPhoto, onPersistLayout, selectedPhotoId, sorted]
  );

  const renderOrder = useMemo(() => {
    if (!selectedPhotoId) return sorted;
    const idx = sorted.findIndex((p) => p.id === selectedPhotoId);
    if (idx < 0) return sorted;
    const next = [...sorted];
    const [sel] = next.splice(idx, 1);
    next.push(sel);
    return next;
  }, [sorted, selectedPhotoId]);

  if (!sorted.length) return null;

  return (
    <div ref={containerRef} className={styles.pagePhotosAbsolute}>
      {(guideLines.vertical.length > 0 || guideLines.horizontal.length > 0) && (
        <div className={`${styles.editorGuideLines} ${styles.spreadGuideLines}`} aria-hidden>
          {guideLines.vertical.map((xv) => (
            <div key={`v-${xv}`} className={styles.editorGuideLineV} style={{ left: `${xv}%` }} />
          ))}
          {guideLines.horizontal.map((yh) => (
            <div key={`h-${yh}`} className={styles.editorGuideLineH} style={{ top: `${yh}%` }} />
          ))}
        </div>
      )}
      {renderOrder.map((p) => {
        const layout = layouts[p.id] || DEFAULT_LAYOUT(0);
        const rot = layout.rotation ?? 0;
        const isSelected = selectedPhotoId === p.id;
        return (
          <div
            key={p.id}
            className={
              styles.editorPhotoOuter +
              (isSelected ? " " + styles.editorPhotoSelectedOuter : "") +
              (isSelected ? " " + styles.studioSpreadPhotoRaised : "") +
              (resizingId === p.id ? " " + styles.editorPhotoResizingOuter : "")
            }
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.w}%`,
              height: `${layout.h}%`,
              transform: rot ? `rotate(${rot}deg)` : undefined,
            }}
          >
            <div
              className={
                styles.editorPhoto +
                (draggingId === p.id ? " " + styles.editorPhotoDragging : "") +
                (isSelected ? " " + styles.editorPhotoSelected : "") +
                (resizingId === p.id ? " " + styles.editorPhotoResizing : "")
              }
              onMouseDown={(e) => !resizingId && handlePhotoPointerDown(e, p.id)}
              onTouchStart={(e) => !resizingId && handlePhotoPointerDown(e, p.id)}
              onClick={(e) => e.stopPropagation()}
            >
              {renderSpreadPhotoInner(layout, getPhotoUrl(p.storage_path), (wh) => {
                naturalAspectByPhotoRef.current[p.id] = wh;
              })}
            </div>
            {isSelected && (
              <>
                {["nw", "ne", "sw", "se"].map((h) => (
                  <div
                    key={h}
                    className={styles.editorResizeHandle}
                    data-handle={h}
                    onMouseDown={(ev) => {
                      ev.stopPropagation();
                      handleResizeStart(ev, p.id, h);
                    }}
                    onTouchStart={(ev) => {
                      ev.stopPropagation();
                      handleResizeStart(ev, p.id, h);
                    }}
                    aria-label={`שינוי גודל ${h}`}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function layoutFromSticker(s) {
  return {
    x: typeof s.x === "number" ? s.x : 15,
    y: typeof s.y === "number" ? s.y : 15,
    w: typeof s.w === "number" ? s.w : STICKER_DEFAULT_SIZE,
    h: typeof s.h === "number" ? s.h : STICKER_DEFAULT_SIZE,
    rotation: s.rotation ?? 0,
  };
}

/** Studio spread: stickers — same drag, snap guides, and corner resize (aspect lock) as photos. */
function StudioSpreadStickers({ stickers, getElementUrl, selectedStickerId, onSelectSticker, onPersistLayout }) {
  const containerRef = useRef(null);
  const sorted = useMemo(
    () => [...(stickers || [])].filter((s) => s.path).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    [stickers]
  );
  const layoutSyncKey = sorted.map((s) => `${s.id}:${s.x}:${s.y}:${s.w}:${s.h}:${s.rotation ?? 0}`).join(";");
  const [layouts, setLayouts] = useState({});
  const layoutsRef = useRef(layouts);
  const dragRef = useRef({ id: null, startX: 0, startY: 0, startLayout: null, dragStarted: false });
  const resizeRef = useRef({ stickerId: null, handle: null, startLayout: null, aspectK: 1 });
  const naturalAspectByStickerRef = useRef({});
  const [draggingId, setDraggingId] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [guideLines, setGuideLines] = useState({ vertical: [], horizontal: [] });

  useEffect(() => {
    layoutsRef.current = layouts;
  }, [layouts]);

  useEffect(() => {
    const next = {};
    sorted.forEach((s) => {
      next[s.id] = layoutFromSticker(s);
    });
    setLayouts(next);
  }, [layoutSyncKey]);

  const getCoords = useCallback((e) => {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }, []);

  const handleResizeStart = useCallback(
    (e, stickerId, handle) => {
      e.preventDefault();
      e.stopPropagation();
      const layout = layoutsRef.current[stickerId];
      if (!layout || typeof layout.x !== "number") return;
      onSelectSticker(stickerId);
      setResizingId(stickerId);
      const el = containerRef.current;
      if (!el) {
        setResizingId(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const l0 = { ...layout };
      const nat = naturalAspectByStickerRef.current[stickerId];
      const R = nat && nat.width > 0 && nat.height > 0 ? nat.width / nat.height : null;
      const aspectK =
        R != null && R > 0 && Number.isFinite(R)
          ? layoutAspectRatioFromImage(R, rect)
          : l0.w / Math.max(l0.h, 1e-6);
      resizeRef.current = { stickerId, handle, startLayout: l0, aspectK };
      const toPct = (clientX, clientY) => ({
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      });
      const onMove = (ev) => {
        ev.preventDefault();
        const ref = resizeRef.current;
        if (!ref.stickerId || !ref.handle) return;
        const { x: pctX, y: pctY } = toPct(getCoords(ev).x, getCoords(ev).y);
        const l = ref.startLayout;
        const k = ref.aspectK;
        const { x: newX, y: newY, w: newW, h: newH } = resizeLayoutKeepImageAspect(
          ref.handle,
          l,
          pctX,
          pctY,
          k,
          SPREAD_LAYOUT_MIN,
          SPREAD_LAYOUT_MAX
        );
        setLayouts((prev) => ({
          ...prev,
          [ref.stickerId]: { ...(prev[ref.stickerId] || l), x: newX, y: newY, w: newW, h: newH },
        }));
      };
      const onUp = async () => {
        setResizingId(null);
        const sid = resizeRef.current.stickerId;
        resizeRef.current = { stickerId: null, handle: null, startLayout: null, aspectK: 1 };
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        if (sid) {
          const lay = layoutsRef.current[sid];
          if (lay) await onPersistLayout(sid, lay);
        }
      };
      const opts = { passive: false };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, opts);
      window.addEventListener("touchend", onUp);
    },
    [getCoords, onSelectSticker, onPersistLayout]
  );

  const handleStickerPointerDown = useCallback(
    (e, stickerId) => {
      e.preventDefault();
      e.stopPropagation();
      const { x: startX, y: startY } = getCoords(e);
      const st = sorted.find((s) => s.id === stickerId);
      const layout = layoutsRef.current[stickerId] || (st ? layoutFromSticker(st) : layoutFromSticker({}));
      dragRef.current = {
        id: stickerId,
        startX,
        startY,
        startLayout: { ...layout },
        dragStarted: false,
      };
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const onMove = (ev) => {
        ev.preventDefault();
        const ref = dragRef.current;
        if (!ref.id) return;
        const { x, y } = getCoords(ev);
        const dist = Math.hypot(x - ref.startX, y - ref.startY);
        if (!ref.dragStarted) {
          if (dist > 5) ref.dragStarted = true;
          else return;
        }
        setDraggingId(ref.id);
        const dx = ((x - ref.startX) / rect.width) * 100;
        const dy = ((y - ref.startY) / rect.height) * 100;
        const l = ref.startLayout;
        let newX = l.x + dx;
        let newY = l.y + dy;
        newX = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - l.w, newX));
        newY = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - l.h, newY));
        const guides = { vertical: [], horizontal: [] };
        const currentLayouts = layoutsRef.current;
        const otherIds = sorted.filter((s) => s.id !== ref.id).map((s) => s.id);
        const vTargets = [0, 50, SPREAD_LAYOUT_MAX];
        const hTargets = [0, 50, SPREAD_LAYOUT_MAX];
        otherIds.forEach((oid) => {
          const o = currentLayouts[oid];
          if (o && typeof o.x === "number") {
            vTargets.push(o.x, o.x + (o.w || 0) / 2, o.x + (o.w || 0));
            hTargets.push(o.y, o.y + (o.h || 0) / 2, o.y + (o.h || 0));
          }
        });
        const dragLeft = newX;
        const dragCenterX = newX + (l.w || 0) / 2;
        const dragRight = newX + (l.w || 0);
        const dragTop = newY;
        const dragCenterY = newY + (l.h || 0) / 2;
        const dragBottom = newY + (l.h || 0);
        let bestV = null;
        let bestVAnchor = 0;
        let bestVDist = SPREAD_SNAP_THRESHOLD;
        vTargets.forEach((t) => {
          const dLeft = Math.abs(dragLeft - t);
          const dCenter = Math.abs(dragCenterX - t);
          const dRight = Math.abs(dragRight - t);
          if (dLeft < bestVDist) {
            bestVDist = dLeft;
            bestV = t;
            bestVAnchor = 0;
          }
          if (dCenter < bestVDist) {
            bestVDist = dCenter;
            bestV = t;
            bestVAnchor = 1;
          }
          if (dRight < bestVDist) {
            bestVDist = dRight;
            bestV = t;
            bestVAnchor = 2;
          }
        });
        let bestH = null;
        let bestHAnchor = 0;
        let bestHDist = SPREAD_SNAP_THRESHOLD;
        hTargets.forEach((t) => {
          const dTop = Math.abs(dragTop - t);
          const dCenter = Math.abs(dragCenterY - t);
          const dBottom = Math.abs(dragBottom - t);
          if (dTop < bestHDist) {
            bestHDist = dTop;
            bestH = t;
            bestHAnchor = 0;
          }
          if (dCenter < bestHDist) {
            bestHDist = dCenter;
            bestH = t;
            bestHAnchor = 1;
          }
          if (dBottom < bestHDist) {
            bestHDist = dBottom;
            bestH = t;
            bestHAnchor = 2;
          }
        });
        if (bestV != null) {
          guides.vertical.push(bestV);
          const offset = bestVAnchor === 0 ? 0 : bestVAnchor === 1 ? (l.w || 0) / 2 : l.w || 0;
          newX = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - (l.w || 0), bestV - offset));
        }
        if (bestH != null) {
          guides.horizontal.push(bestH);
          const offset = bestHAnchor === 0 ? 0 : bestHAnchor === 1 ? (l.h || 0) / 2 : l.h || 0;
          newY = Math.max(0, Math.min(SPREAD_LAYOUT_MAX - (l.h || 0), bestH - offset));
        }
        setGuideLines(guides);
        setLayouts((prev) => ({
          ...prev,
          [ref.id]: { ...(prev[ref.id] || l), x: newX, y: newY },
        }));
      };
      const onUp = async () => {
        const ref = dragRef.current;
        dragRef.current = { id: null, startX: 0, startY: 0, startLayout: null, dragStarted: false };
        setDraggingId(null);
        setGuideLines({ vertical: [], horizontal: [] });
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
        window.removeEventListener("touchcancel", onUp);
        if (!ref.id) return;
        if (!ref.dragStarted) {
          if (selectedStickerId === ref.id) onSelectSticker(null);
          else onSelectSticker(ref.id);
        } else {
          const lay = layoutsRef.current[ref.id];
          if (lay) await onPersistLayout(ref.id, lay);
        }
      };
      const opts = { passive: false };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      window.addEventListener("touchmove", onMove, opts);
      window.addEventListener("touchend", onUp);
      window.addEventListener("touchcancel", onUp);
    },
    [getCoords, onSelectSticker, onPersistLayout, selectedStickerId, sorted]
  );

  const renderOrder = useMemo(() => {
    if (!selectedStickerId) return sorted;
    const idx = sorted.findIndex((s) => s.id === selectedStickerId);
    if (idx < 0) return sorted;
    const next = [...sorted];
    const [sel] = next.splice(idx, 1);
    next.push(sel);
    return next;
  }, [sorted, selectedStickerId]);

  if (!sorted.length) return null;

  return (
    <div ref={containerRef} className={`${styles.pagePhotosAbsolute} ${styles.studioSpreadStickersLayer}`}>
      {(guideLines.vertical.length > 0 || guideLines.horizontal.length > 0) && (
        <div className={`${styles.editorGuideLines} ${styles.spreadGuideLines}`} aria-hidden>
          {guideLines.vertical.map((xv) => (
            <div key={`sv-${xv}`} className={styles.editorGuideLineV} style={{ left: `${xv}%` }} />
          ))}
          {guideLines.horizontal.map((yh) => (
            <div key={`sh-${yh}`} className={styles.editorGuideLineH} style={{ top: `${yh}%` }} />
          ))}
        </div>
      )}
      {renderOrder.map((s) => {
        const layout = layouts[s.id] || layoutFromSticker(s);
        const rot = layout.rotation ?? 0;
        const isSelected = selectedStickerId === s.id;
        const imgUrl = getElementUrl(s.path);
        return (
          <div
            key={s.id}
            className={
              styles.editorPhotoOuter +
              (isSelected ? " " + styles.editorPhotoSelectedOuter : "") +
              (isSelected ? " " + styles.studioSpreadPhotoRaised : "") +
              (resizingId === s.id ? " " + styles.editorPhotoResizingOuter : "")
            }
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.w}%`,
              height: `${layout.h}%`,
              transform: rot ? `rotate(${rot}deg)` : undefined,
            }}
          >
            <div
              className={
                styles.editorPhoto +
                (draggingId === s.id ? " " + styles.editorPhotoDragging : "") +
                (isSelected ? " " + styles.editorPhotoSelected : "") +
                (resizingId === s.id ? " " + styles.editorPhotoResizing : "")
              }
              onMouseDown={(e) => !resizingId && handleStickerPointerDown(e, s.id)}
              onTouchStart={(e) => !resizingId && handleStickerPointerDown(e, s.id)}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={imgUrl}
                alt=""
                className={styles.stickerImg}
                draggable={false}
                onLoad={(e) => {
                  const im = e.currentTarget;
                  if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                    naturalAspectByStickerRef.current[s.id] = { width: im.naturalWidth, height: im.naturalHeight };
                  }
                }}
              />
            </div>
            {isSelected && (
              <>
                {["nw", "ne", "sw", "se"].map((h) => (
                  <div
                    key={h}
                    className={styles.editorResizeHandle}
                    data-handle={h}
                    onMouseDown={(ev) => {
                      ev.stopPropagation();
                      handleResizeStart(ev, s.id, h);
                    }}
                    onTouchStart={(ev) => {
                      ev.stopPropagation();
                      handleResizeStart(ev, s.id, h);
                    }}
                    aria-label={`שינוי גודל ${h}`}
                  />
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlbumSpread({
  leftPage,
  rightPage,
  albumId,
  onDrop,
  onRemove,
  onEditPage,
  onAddPage,
  getPhotoUrl,
  getElementUrl,
  studioSpreadChrome,
  activePageId,
  onStudioPageBackground,
  onStudioTapAddPhotos,
  studioPhotoSel,
  onStudioSelectPhoto,
  onPersistSpreadPhotoLayout,
  studioStickerSel,
  onStudioSelectSticker,
  onPersistSpreadStickerLayout,
  studioTextSel,
  studioEditingTextId,
  onStudioTextSelect,
  onStudioTextEditingChange,
  onStudioTextPatch,
  studioLiveFontSize,
  onStudioSlotAddPhoto,
}) {
  const [dragOverLeft, setDragOverLeft] = useState(false);
  const [dragOverRight, setDragOverRight] = useState(false);

  function handleDrop(e, targetPageId) {
    e.preventDefault();
    setDragOverLeft(false);
    setDragOverRight(false);
    const photoId = e.dataTransfer.getData("application/photo-id");
    if (!photoId || !targetPageId) return;
    onDrop(photoId, targetPageId);
  }

  const photosLeft = (leftPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const photosRight = (rightPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const hasLayoutLeft = photosLeft.some((p) => p.layout && typeof p.layout.x === "number");
  const hasLayoutRight = photosRight.some((p) => p.layout && typeof p.layout.x === "number");
  const stickersLeft = leftPage?.page_config?.stickers || [];
  const stickersRight = rightPage?.page_config?.stickers || [];

  const studio = !!studioSpreadChrome;

  function halfClick(e, page) {
    if (!studio || !page || !onStudioPageBackground) return;
    if (e.target.closest("button")) return;
    if (e.target.closest("img") && e.target.closest(`.${styles.pagePhotosAbsolute}`)) return;
    if (e.target.closest(`.${styles.pagePhotos}`)) return;
    onStudioPageBackground(page.id);
  }

  return (
    <div className={styles.spread}>
      <div className={styles.halfPageWrapper}>
        <div
          className={
            styles.halfPage +
            (dragOverLeft ? " " + styles.dragOver : "") +
            (studio && activePageId && leftPage?.id === activePageId ? " " + styles.halfPageActive : "")
          }
          style={
            !studio && leftPage?.page_config?.backgroundColor
              ? { background: leftPage.page_config.backgroundColor }
              : studio && leftPage?.page_config?.backgroundColor
                ? { background: leftPage.page_config.backgroundColor }
                : undefined
          }
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverLeft(true); }}
          onDragLeave={() => setDragOverLeft(false)}
          onDrop={(e) => handleDrop(e, leftPage?.id)}
          data-page-id={leftPage?.id}
          {...(studio ? { "data-pdf-capture": "left" } : {})}
          onClick={(e) => halfClick(e, leftPage)}
          role="presentation"
        >
          {studio && leftPage && <StudioTemplateSlotsLayer page={leftPage} onSlotTap={onStudioSlotAddPhoto} />}
          {studio && leftPage && photosLeft.length > 0 ? (
            <StudioSpreadPhotos
              photos={photosLeft}
              getPhotoUrl={getPhotoUrl}
              selectedPhotoId={studioPhotoSel?.pageId === leftPage.id ? studioPhotoSel.photoId : null}
              onSelectPhoto={(photoId) => onStudioSelectPhoto?.(photoId ? { pageId: leftPage.id, photoId } : null)}
              onPersistLayout={onPersistSpreadPhotoLayout}
            />
          ) : (
          <PagePhotos
            photos={photosLeft}
            getPhotoUrl={getPhotoUrl}
            onRemove={(photoId) => onRemove(leftPage?.id, photoId)}
            useLayout={hasLayoutLeft}
              showRemoveButton={false}
            />
          )}
          {getElementUrl && !studio && <PageStickers stickers={stickersLeft} getElementUrl={getElementUrl} />}
          {studio && leftPage && getElementUrl && (
            <StudioSpreadStickers
              stickers={stickersLeft}
              getElementUrl={getElementUrl}
              selectedStickerId={studioStickerSel?.pageId === leftPage.id ? studioStickerSel.stickerId : null}
              onSelectSticker={(stickerId) =>
                onStudioSelectSticker?.(stickerId ? { pageId: leftPage.id, stickerId } : null)
              }
              onPersistLayout={(stickerId, layout) => onPersistSpreadStickerLayout?.(leftPage.id, stickerId, layout)}
            />
          )}
          {studio && leftPage ? (
            <StudioSpreadTexts
              pageId={leftPage.id}
              texts={leftPage?.page_config?.texts}
              selectedTextId={studioTextSel?.pageId === leftPage.id ? studioTextSel.textId : null}
              editingTextId={studioTextSel?.pageId === leftPage.id ? studioEditingTextId : null}
              onSelectText={(tid) => onStudioTextSelect?.(leftPage.id, tid)}
              onEditingChange={onStudioTextEditingChange}
              onPatchText={(textId, partial, opts) => onStudioTextPatch?.(leftPage.id, textId, partial, opts)}
              liveFontSize={studioLiveFontSize}
            />
          ) : (
            <PageTexts texts={leftPage?.page_config?.texts} />
          )}
          {studio && leftPage && (
            photosLeft.length === 0 && !leftPage.page_config?.studioTemplate?.slots?.length ? (
              <button
                type="button"
                className={styles.tapAddPhoto}
                onClick={(e) => {
                  e.stopPropagation();
                  onStudioTapAddPhotos?.(leftPage.id);
                }}
              >
                הקש להוספת תמונה
              </button>
            ) : photosLeft.length > 0 ? (
              <button
                type="button"
                className={styles.tapAddPhotoCorner}
                onClick={(e) => {
                  e.stopPropagation();
                  onStudioTapAddPhotos?.(leftPage.id);
                }}
                aria-label="הוסף תמונה"
              >
                +
              </button>
            ) : null
          )}
          {!studio && leftPage && (
            <button type="button" className={styles.editPageBtnOnPage} onClick={(e) => { e.stopPropagation(); onEditPage(leftPage); }} title="ערוך עמוד">
              לחץ כדי לערוך עמוד ולהוסיף תמונות
          </button>
        )}
      </div>
      </div>
      <div className={studio ? styles.studioSpine : styles.spine} />
      <div className={styles.halfPageWrapper}>
        <div
          className={
            styles.halfPage +
            (dragOverRight ? " " + styles.dragOver : "") +
            (studio && activePageId && rightPage?.id === activePageId ? " " + styles.halfPageActive : "")
          }
          style={
            !studio && rightPage?.page_config?.backgroundColor
              ? { background: rightPage.page_config.backgroundColor }
              : studio && rightPage?.page_config?.backgroundColor
                ? { background: rightPage.page_config.backgroundColor }
                : undefined
          }
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverRight(true); }}
          onDragLeave={() => setDragOverRight(false)}
          onDrop={(e) => handleDrop(e, rightPage?.id)}
          data-page-id={rightPage?.id}
          {...(studio ? { "data-pdf-capture": "right" } : {})}
          onClick={(e) => halfClick(e, rightPage)}
          role="presentation"
        >
          {studio && rightPage && <StudioTemplateSlotsLayer page={rightPage} onSlotTap={onStudioSlotAddPhoto} />}
          {studio && rightPage && photosRight.length > 0 ? (
            <StudioSpreadPhotos
              photos={photosRight}
              getPhotoUrl={getPhotoUrl}
              selectedPhotoId={studioPhotoSel?.pageId === rightPage.id ? studioPhotoSel.photoId : null}
              onSelectPhoto={(photoId) => onStudioSelectPhoto?.(photoId ? { pageId: rightPage.id, photoId } : null)}
              onPersistLayout={onPersistSpreadPhotoLayout}
            />
          ) : (
          <PagePhotos
            photos={photosRight}
            getPhotoUrl={getPhotoUrl}
            onRemove={(photoId) => onRemove(rightPage?.id, photoId)}
            useLayout={hasLayoutRight}
              showRemoveButton={false}
            />
          )}
          {getElementUrl && !studio && <PageStickers stickers={stickersRight} getElementUrl={getElementUrl} />}
          {studio && rightPage && getElementUrl && (
            <StudioSpreadStickers
              stickers={stickersRight}
              getElementUrl={getElementUrl}
              selectedStickerId={studioStickerSel?.pageId === rightPage.id ? studioStickerSel.stickerId : null}
              onSelectSticker={(stickerId) =>
                onStudioSelectSticker?.(stickerId ? { pageId: rightPage.id, stickerId } : null)
              }
              onPersistLayout={(stickerId, layout) => onPersistSpreadStickerLayout?.(rightPage.id, stickerId, layout)}
            />
          )}
          {studio && rightPage ? (
            <StudioSpreadTexts
              pageId={rightPage.id}
              texts={rightPage?.page_config?.texts}
              selectedTextId={studioTextSel?.pageId === rightPage.id ? studioTextSel.textId : null}
              editingTextId={studioTextSel?.pageId === rightPage.id ? studioEditingTextId : null}
              onSelectText={(tid) => onStudioTextSelect?.(rightPage.id, tid)}
              onEditingChange={onStudioTextEditingChange}
              onPatchText={(textId, partial, opts) => onStudioTextPatch?.(rightPage.id, textId, partial, opts)}
              liveFontSize={studioLiveFontSize}
            />
          ) : (
            <PageTexts texts={rightPage?.page_config?.texts} />
          )}
          {studio && rightPage && (
            photosRight.length === 0 && !rightPage.page_config?.studioTemplate?.slots?.length ? (
              <button
                type="button"
                className={styles.tapAddPhoto}
                onClick={(e) => {
                  e.stopPropagation();
                  onStudioTapAddPhotos?.(rightPage.id);
                }}
              >
                הקש להוספת תמונה
          </button>
            ) : photosRight.length > 0 ? (
              <button
                type="button"
                className={styles.tapAddPhotoCorner}
                onClick={(e) => {
                  e.stopPropagation();
                  onStudioTapAddPhotos?.(rightPage.id);
                }}
                aria-label="הוסף תמונה"
              >
                +
              </button>
            ) : null
          )}
          {!studio && rightPage && (
            <button type="button" className={styles.editPageBtnOnPage} onClick={(e) => { e.stopPropagation(); onEditPage(rightPage); }} title="ערוך עמוד">
              לחץ כדי לערוך עמוד ולהוסיף תמונות
            </button>
          )}
          {!studio && !rightPage && onAddPage ? (
            <button type="button" className={styles.editPageBtnOnPage} onClick={(e) => { e.stopPropagation(); onAddPage(); }} title="הוסף עמוד">
              הוסף עמוד
            </button>
          ) : null}
          {studio && !rightPage && onAddPage ? (
            <button
              type="button"
              className={styles.tapAddPhoto}
              onClick={(e) => {
                e.stopPropagation();
                onAddPage();
              }}
            >
              הוסף עמוד
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EditPages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const autoPdfNavKeyRef = useRef(null);
  const finishPdfRef = useRef(null);
  const [album, setAlbum] = useState(null);
  const [viewIndex, setViewIndex] = useState(1);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [error, setError] = useState(null);
  const [editingPage, setEditingPage] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [activePageId, setActivePageId] = useState(null);
  const [studioPhotoSel, setStudioPhotoSel] = useState(null);
  const [studioStickerSel, setStudioStickerSel] = useState(null);
  const [showStudioCropSheet, setShowStudioCropSheet] = useState(false);
  const [studioCropDraft, setStudioCropDraft] = useState(() => ({ ...DEFAULT_PHOTO_CROP }));
  const studioCropDraftRef = useRef({ ...DEFAULT_PHOTO_CROP });
  const [studioTextSel, setStudioTextSel] = useState(null);
  const [studioEditingTextId, setStudioEditingTextId] = useState(null);
  const [studioSpreadFontSizeLive, setStudioSpreadFontSizeLive] = useState(null);
  const [showLayoutSheet, setShowLayoutSheet] = useState(false);
  const [showBgSheet, setShowBgSheet] = useState(false);
  const [showStickersSheet, setShowStickersSheet] = useState(false);
  const [studioElementsList, setStudioElementsList] = useState([]);
  const [showQrSheet, setShowQrSheet] = useState(false);
  const [showAllPagesSheet, setShowAllPagesSheet] = useState(false);
  const [shareUrlQr, setShareUrlQr] = useState("");
  const [studioUploading, setStudioUploading] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);
  const [bgDraftColor, setBgDraftColor] = useState(DEFAULT_PAGE_BG);
  const studioFileInputRef = useRef(null);
  const uploadTargetPageIdRef = useRef(null);
  const uploadTargetSlotIndexRef = useRef(null);
  const photosBeforeIdsRef = useRef(null);
  const studioSpreadLayoutBaseRef = useRef(null);
  const studioCropPersistTimerRef = useRef(null);
  const undoConfigStack = useRef([]);
  const redoConfigStack = useRef([]);
  const dockScrollRef = useRef(null);

  useEffect(() => {
    getAlbum(id).then(setAlbum).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    autoPdfNavKeyRef.current = null;
  }, [id]);

  useEffect(() => {
    getElementsList().then(setStudioElementsList).catch(() => setStudioElementsList([]));
  }, []);

  async function handleFinishAndDownload() {
    setGeneratingPdf(true);
    setError(null);

    const pagesSorted = [...(album?.pages || [])].sort((a, b) => (a.page_order ?? 0) - (b.page_order ?? 0));
    const captureSteps = [{ kind: "cover" }];
    pagesSorted.forEach((p, pageIndex) => {
      const photos = (p.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
      const texts = Array.isArray(p.page_config?.texts) ? p.page_config.texts : [];
      if (photos.length === 0 && texts.length === 0) return;
      captureSteps.push({
        kind: "half",
        pageIndex,
        side: pageIndex % 2 === 0 ? "left" : "right",
        spreadViewIndex: Math.floor(pageIndex / 2) + 1,
      });
    });

    const saved = {
      viewIndex,
      activePageId,
      studioPhotoSel,
      studioStickerSel,
      studioTextSel,
      studioEditingTextId,
    };

    document.body.classList.add("pdfCaptureMode");
    try {
      flushSync(() => {
        setStudioPhotoSel(null);
        setStudioStickerSel(null);
        setStudioTextSel(null);
        setStudioEditingTextId(null);
        setStudioSpreadFontSizeLive(null);
      });

      const images = [];
      for (const step of captureSteps) {
        if (step.kind === "cover") {
          flushSync(() => setViewIndex(0));
        } else {
          flushSync(() => setViewIndex(step.spreadViewIndex));
        }

        await document.fonts.ready;
        await new Promise((r) => setTimeout(r, 150));
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));

        const selector =
          step.kind === "cover" ? '[data-pdf-capture="cover"]' : `[data-pdf-capture="${step.side}"]`;
        const el = document.querySelector(selector);
        if (!el) throw new Error("לא נמצא תוכן לצילום PDF");

        images.push(await captureVisibleElementToPdfJpeg(el));
      }

      const blob = buildPdfBlobFromJpegDataUrls(images);
      await saveLocalPdfBlob(id, blob).catch(() => {});
      await stashPdfDataUrlForSession(id, blob);
      const pdfBlobUrl = URL.createObjectURL(blob);
      stashPdfHandoff(id, pdfBlobUrl);
      stashPdfBlobUrlForSession(id, pdfBlobUrl);
      const a = document.createElement("a");
      a.href = pdfBlobUrl;
      a.download = "album.pdf";
      a.click();
      /* Keep blob URL alive for Done page (iPhone often has no usable IDB/data-URL handoff). */
      navigate(`/album/${id}/done`, { state: { pdfBlobUrl } });
    } catch (e) {
      setError(e.message || "שגיאה ביצירת PDF");
    } finally {
      document.body.classList.remove("pdfCaptureMode");
      flushSync(() => {
        setViewIndex(saved.viewIndex);
        setActivePageId(saved.activePageId);
        setStudioPhotoSel(saved.studioPhotoSel);
        setStudioStickerSel(saved.studioStickerSel);
        setStudioTextSel(saved.studioTextSel);
        setStudioEditingTextId(saved.studioEditingTextId);
      });
      setGeneratingPdf(false);
    }
  }

  finishPdfRef.current = handleFinishAndDownload;

  useEffect(() => {
    const wantAutoPdf = location.state?.autoGeneratePdf || location.state?.openPdfFinish;
    if (!wantAutoPdf) return;
    if (!album || generatingPdf) return;
    if (autoPdfNavKeyRef.current === location.key) return;
    autoPdfNavKeyRef.current = location.key;
    navigate(".", { replace: true, state: {} });
    queueMicrotask(() => {
      finishPdfRef.current?.();
    });
  }, [album, location.state?.autoGeneratePdf, location.state?.openPdfFinish, location.key, generatingPdf, navigate]);

  useEffect(() => {
    if (!album?.cover_id) {
      if (album?.cover_config?.coverUrl) setCoverImageUrl(album.cover_config.coverUrl);
      else setCoverImageUrl(null);
      return;
    }
    getBaseCovers()
      .then((list) => {
        const c = list.find((x) => x.id === album.cover_id);
        setCoverImageUrl(c ? getCoverUrl(c.storage_path) : null);
      })
      .catch(() => setCoverImageUrl(null));
  }, [album?.cover_id, album?.cover_config?.coverUrl]);

  useEffect(() => {
    if (!album) return;
    const pgs = album.pages || [];
    if (viewIndex === 0) return;
    const idx = Math.max(0, viewIndex - 1);
    const left = pgs[idx * 2];
    const right = pgs[idx * 2 + 1];
    setActivePageId((prev) => {
      if (prev && (prev === left?.id || prev === right?.id)) return prev;
      return left?.id || right?.id || null;
    });
  }, [album, viewIndex]);

  useEffect(() => {
    setStudioPhotoSel(null);
    setStudioStickerSel(null);
    setStudioTextSel(null);
    setStudioEditingTextId(null);
    setStudioSpreadFontSizeLive(null);
    setShowStudioCropSheet(false);
  }, [viewIndex]);

  useEffect(
    () => () => {
      if (studioCropPersistTimerRef.current) window.clearTimeout(studioCropPersistTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!studioPhotoSel) setShowStudioCropSheet(false);
  }, [studioPhotoSel]);

  useEffect(() => {
    setStudioSpreadFontSizeLive(null);
  }, [studioTextSel?.pageId, studioTextSel?.textId]);

  useEffect(() => {
    if (!album) return;
    const sc = Math.max(1, Math.ceil((album.pages || []).length / 2));
    const vc = 1 + sc;
    setViewIndex((vi) => (vi >= vc ? Math.max(0, vc - 1) : vi));
  }, [album?.id, album?.pages?.length]);

  useEffect(() => {
    if (!showBgSheet || !album) return;
    const pgs = album.pages || [];
    const idx = Math.max(0, viewIndex - 1);
    const left = pgs[idx * 2];
    const ap = pgs.find((p) => p.id === activePageId) || left;
    if (!ap) return;
    setBgDraftColor(ap.page_config?.backgroundColor || DEFAULT_PAGE_BG);
  }, [showBgSheet, album, activePageId, viewIndex]);

  async function refreshAlbum(updatedPageFromSave) {
    if (updatedPageFromSave) {
      setAlbum((prev) => ({
        ...prev,
        pages: (prev.pages || []).map((p) =>
          p.id === updatedPageFromSave.id ? { ...p, page_config: updatedPageFromSave.page_config || p.page_config } : p
        ),
      }));
    }
    const a = await getAlbum(id);
    setAlbum(a);
  }

  const pages = album?.pages || [];
  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));
  const viewCount = 1 + spreadCount;
  const currentSpreadIndex = viewIndex === 0 ? 0 : viewIndex - 1;
  const leftPage = pages[currentSpreadIndex * 2] || null;
  const rightPage = pages[currentSpreadIndex * 2 + 1] || null;

  const studioSelPhotoDetail = useMemo(() => {
    if (!studioPhotoSel || !album) return null;
    const page = album.pages?.find((p) => p.id === studioPhotoSel.pageId);
    if (!page) return null;
    const ordered = [...(page.album_photos || [])].sort((a, b) => a.photo_order - b.photo_order);
    const photo = ordered.find((p) => p.id === studioPhotoSel.photoId);
    if (!photo) return null;
    const idx = ordered.findIndex((p) => p.id === photo.id);
    const layout = normalizePhotoLayoutFromAlbumPhoto(photo, idx >= 0 ? idx : 0);
    return { pageId: page.id, photo, layout };
  }, [studioPhotoSel, album]);

  useEffect(() => {
    if (studioSelPhotoDetail) {
      studioSpreadLayoutBaseRef.current = { ...studioSelPhotoDetail.layout };
    }
  }, [studioSelPhotoDetail]);

  const prevShowStudioCropRef = useRef(false);
  useEffect(() => {
    const opened = showStudioCropSheet && !prevShowStudioCropRef.current;
    prevShowStudioCropRef.current = showStudioCropSheet;
    if (!opened || !studioSelPhotoDetail) return;
    const seed = getPhotoLayoutCrop(studioSelPhotoDetail.layout) || { ...DEFAULT_PHOTO_CROP };
    studioCropDraftRef.current = seed;
    setStudioCropDraft(seed);
  }, [showStudioCropSheet, studioSelPhotoDetail]);

  const coverUrl = coverImageUrl ?? album?.cover_config?.coverUrl ?? null;

  function pushUndoSnapshot(pageId) {
    const p = album?.pages?.find((x) => x.id === pageId);
    if (!p) return;
    undoConfigStack.current.push({
      pageId,
      page_config: JSON.parse(JSON.stringify(p.page_config || {})),
    });
    redoConfigStack.current = [];
    if (undoConfigStack.current.length > 40) undoConfigStack.current.shift();
    setUndoDepth(undoConfigStack.current.length);
    setRedoDepth(0);
  }

  async function undoLastConfig() {
    const snap = undoConfigStack.current.pop();
    if (!snap || !album) {
      if (snap) undoConfigStack.current.push(snap);
      return;
    }
    const cur = album.pages?.find((x) => x.id === snap.pageId);
    const forward = cur ? JSON.parse(JSON.stringify(cur.page_config || {})) : {};
    try {
      setError(null);
      await updatePageConfig(id, snap.pageId, snap.page_config);
      redoConfigStack.current.push({ pageId: snap.pageId, page_config: forward });
      setUndoDepth(undoConfigStack.current.length);
      setRedoDepth(redoConfigStack.current.length);
      await refreshAlbum();
    } catch (e) {
      undoConfigStack.current.push(snap);
      setUndoDepth(undoConfigStack.current.length);
      setError(e.message);
    }
  }

  async function redoLastConfig() {
    const snap = redoConfigStack.current.pop();
    if (!snap || !album) {
      if (snap) redoConfigStack.current.push(snap);
      return;
    }
    const cur = album.pages?.find((x) => x.id === snap.pageId);
    const back = cur ? JSON.parse(JSON.stringify(cur.page_config || {})) : {};
    try {
      setError(null);
      await updatePageConfig(id, snap.pageId, snap.page_config);
      undoConfigStack.current.push({ pageId: snap.pageId, page_config: back });
      setUndoDepth(undoConfigStack.current.length);
      setRedoDepth(redoConfigStack.current.length);
      await refreshAlbum();
    } catch (e) {
      redoConfigStack.current.push(snap);
      setRedoDepth(redoConfigStack.current.length);
      setError(e.message);
    }
  }

  function openStudioPhotoPicker(pageId) {
    uploadTargetSlotIndexRef.current = null;
    photosBeforeIdsRef.current = null;
    setActivePageId(pageId);
    uploadTargetPageIdRef.current = pageId;
    studioFileInputRef.current?.click();
  }

  function openStudioPhotoPickerForSlot(pageId, slotIndex) {
    const page = album?.pages?.find((p) => p.id === pageId);
    photosBeforeIdsRef.current = new Set((page?.album_photos || []).map((p) => p.id));
    uploadTargetSlotIndexRef.current = slotIndex;
    uploadTargetPageIdRef.current = pageId;
    setActivePageId(pageId);
    setStudioPhotoSel(null);
    studioFileInputRef.current?.click();
  }

  async function handleStudioFilesSelected(fileList) {
    const pageId = uploadTargetPageIdRef.current || activePageId || leftPage?.id;
    if (!pageId || !fileList?.length) return;
    setStudioUploading(true);
    setError(null);
    try {
      await uploadPhotos(id, pageId, Array.from(fileList));
      let a = await getAlbum(id);
      setAlbum(a);
      const slotStart = uploadTargetSlotIndexRef.current;
      const beforeIds = photosBeforeIdsRef.current;
      if (slotStart != null && beforeIds != null) {
        const page = a.pages?.find((p) => p.id === pageId);
        const tmpl = page?.page_config?.studioTemplate?.slots;
        const ordered = [...(page?.album_photos || [])].sort((x, y) => x.photo_order - y.photo_order);
        const newOnes = ordered.filter((p) => !beforeIds.has(p.id));
        for (let j = 0; j < newOnes.length; j++) {
          const si = slotStart + j;
          const s = tmpl?.[si];
          if (s) {
            await updatePhotoLayout(id, newOnes[j].id, { ...s, rotation: s.rotation ?? 0 });
          }
        }
        uploadTargetSlotIndexRef.current = null;
        photosBeforeIdsRef.current = null;
        a = await getAlbum(id);
        setAlbum(a);
      }
    } catch (e) {
      uploadTargetSlotIndexRef.current = null;
      photosBeforeIdsRef.current = null;
      const msg = e?.message || "";
      const isTooLarge = /PAYLOAD_TOO_LARGE|413|too large|גדול/i.test(msg);
      setError(isTooLarge ? "התמונה גדולה מדי." : msg);
    } finally {
      setStudioUploading(false);
      if (studioFileInputRef.current) studioFileInputRef.current.value = "";
    }
  }

  async function studioAddSticker(path) {
    if (!path) return;
    const pid = activePageId || leftPage?.id;
    if (!pid || viewIndex === 0) {
      setError("בחרו עמוד פעיל (הקישו על אחד משני עמודי השיפוע).");
      return;
    }
    const page = pages.find((p) => p.id === pid);
    if (!page) return;
    pushUndoSnapshot(pid);
    const stickerId = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const prevStickers = Array.isArray(page.page_config?.stickers) ? page.page_config.stickers : [];
    try {
      setError(null);
      await updatePageConfig(id, pid, {
        ...(page.page_config || {}),
        stickers: [
          ...prevStickers,
          { id: stickerId, path, x: 15, y: 15, w: STICKER_DEFAULT_SIZE, h: STICKER_DEFAULT_SIZE, rotation: 0 },
        ],
      });
      await refreshAlbum();
      setShowStickersSheet(false);
      setStudioPhotoSel(null);
      setStudioTextSel(null);
      setStudioEditingTextId(null);
      setStudioSpreadFontSizeLive(null);
      setStudioStickerSel({ pageId: pid, stickerId });
    } catch (e) {
      undoConfigStack.current.pop();
      setUndoDepth(undoConfigStack.current.length);
      setError(e.message);
    }
  }

  async function addStudioText() {
    const pid = activePageId || leftPage?.id;
    if (!pid || viewIndex === 0) {
      setError("בחרו עמוד: הקישו על עמוד או הוסיפו תמונה.");
      return;
    }
    const page = pages.find((p) => p.id === pid);
    if (!page) return;
    pushUndoSnapshot(pid);
    const prevTexts = loadTextsFromPageConfig(page.page_config || {});
    const t = newPageText({ content: "טקסט" });
    try {
      setError(null);
      await updatePageConfig(id, pid, {
        ...(page.page_config || {}),
        texts: [...prevTexts, t],
      });
      await refreshAlbum();
      setStudioPhotoSel(null);
      setStudioTextSel({ pageId: pid, textId: t.id });
      flushSync(() => setStudioEditingTextId(t.id));
    } catch (e) {
      undoConfigStack.current.pop();
      setUndoDepth(undoConfigStack.current.length);
      setError(e.message);
    }
  }

  async function studioPatchText(pageId, textId, partial, { skipUndo = false } = {}) {
    if (!album) return;
    if (!skipUndo) pushUndoSnapshot(pageId);
    const page = (album.pages || []).find((p) => p.id === pageId);
    if (!page) return;
    const texts = loadTextsFromPageConfig(page.page_config || {});
    const next = texts.map((tx) => (tx.id === textId ? { ...tx, ...partial } : tx));
    try {
      setError(null);
      await updatePageConfig(id, pageId, { ...(page.page_config || {}), texts: next });
      await refreshAlbum();
      if (partial.fontSize !== undefined) setStudioSpreadFontSizeLive(null);
    } catch (e) {
      if (!skipUndo) {
        undoConfigStack.current.pop();
        setUndoDepth(undoConfigStack.current.length);
      }
      setError(e.message);
    }
  }

  async function studioRemoveSelectedText() {
    if (!studioTextSel || !album) return;
    const { pageId, textId } = studioTextSel;
    pushUndoSnapshot(pageId);
    const page = (album.pages || []).find((p) => p.id === pageId);
    if (!page) return;
    const texts = loadTextsFromPageConfig(page.page_config || {}).filter((tx) => tx.id !== textId);
    try {
      setError(null);
      await updatePageConfig(id, pageId, { ...(page.page_config || {}), texts });
      await refreshAlbum();
      setStudioTextSel(null);
      setStudioEditingTextId(null);
    } catch (e) {
      undoConfigStack.current.pop();
      setUndoDepth(undoConfigStack.current.length);
      setError(e.message);
    }
  }

  async function applyStudioTemplate(template) {
    const pid = activePageId || leftPage?.id;
    if (!pid || viewIndex === 0) return;
    const page = pages.find((p) => p.id === pid);
    if (!page) return;
    const slots = template.slots || [];
    const studioTemplate = { id: template.id, name: template.name, slots };
    try {
      setError(null);
      await updatePageConfig(id, pid, {
        ...(page.page_config || {}),
        studioTemplate,
      });
      const photos = [...(page.album_photos || [])].sort((a, b) => a.photo_order - b.photo_order);
      for (let i = 0; i < photos.length && i < slots.length; i++) {
        await updatePhotoLayout(id, photos[i].id, { ...slots[i], rotation: slots[i].rotation ?? 0 });
      }
      await refreshAlbum();
      setShowLayoutSheet(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function clearStudioTemplate() {
    const pid = activePageId || leftPage?.id;
    if (!pid || viewIndex === 0) return;
    const page = pages.find((p) => p.id === pid);
    if (!page) return;
    if (!page.page_config?.studioTemplate) {
      setShowLayoutSheet(false);
      return;
    }
    const pc = { ...(page.page_config || {}) };
    delete pc.studioTemplate;
    try {
      setError(null);
      await updatePageConfig(id, pid, pc);
      await refreshAlbum();
      setShowLayoutSheet(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function setStudioBackgroundColor(hex) {
    const pid = activePageId || leftPage?.id;
    if (!pid || viewIndex === 0) return;
    const page = pages.find((p) => p.id === pid);
    if (!page) return;
    pushUndoSnapshot(pid);
    try {
      setError(null);
      await updatePageConfig(id, pid, {
        ...(page.page_config || {}),
        backgroundColor: hex,
      });
      await refreshAlbum();
    } catch (e) {
      undoConfigStack.current.pop();
      setUndoDepth(undoConfigStack.current.length);
      setError(e.message);
    }
  }

  function openShareQrSheet() {
    if (!album || !id) return;
    // Same album through the editor flow (not /view which is read-only / copy).
    setShareUrlQr(`${window.location.origin}/album/${id}/cover`);
    setShowQrSheet(true);
  }

  const activePageForTools = pages.find((p) => p.id === activePageId) || leftPage;
  const activePageOrderLabel = activePageForTools ? (activePageForTools.page_order ?? 0) + 1 : null;

  async function handlePersistSpreadPhotoLayout(photoId, layout) {
    try {
      setError(null);
      await updatePhotoLayout(id, photoId, layout);
      await refreshAlbum();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handlePersistSpreadStickerLayout(pageId, stickerId, layout) {
    const page = album?.pages?.find((p) => p.id === pageId);
    if (!page) return;
    try {
      setError(null);
      const cfg = { ...(page.page_config || {}) };
      const list = [...(cfg.stickers || [])];
      const idx = list.findIndex((s) => s.id === stickerId);
      if (idx < 0) return;
      list[idx] = {
        ...list[idx],
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
        rotation: layout.rotation ?? list[idx].rotation ?? 0,
      };
      await updatePageConfig(id, pageId, { ...cfg, stickers: list });
      await refreshAlbum();
    } catch (e) {
      setError(e.message);
    }
  }

  async function studioRemoveSticker(pageId, stickerId) {
    const page = album?.pages?.find((p) => p.id === pageId);
    if (!page) return;
    pushUndoSnapshot(pageId);
    try {
      setError(null);
      const stickers = (page.page_config?.stickers || []).filter((s) => s.id !== stickerId);
      await updatePageConfig(id, pageId, { ...(page.page_config || {}), stickers });
      await refreshAlbum();
      setStudioStickerSel((prev) => (prev?.pageId === pageId && prev?.stickerId === stickerId ? null : prev));
    } catch (e) {
      undoConfigStack.current.pop();
      setUndoDepth(undoConfigStack.current.length);
      setError(e.message);
    }
  }

  function scheduleStudioCropPersist(nextCrop) {
    studioCropDraftRef.current = nextCrop;
    setStudioCropDraft(nextCrop);
    if (studioCropPersistTimerRef.current) window.clearTimeout(studioCropPersistTimerRef.current);
    studioCropPersistTimerRef.current = window.setTimeout(async () => {
      studioCropPersistTimerRef.current = null;
      const base = studioSpreadLayoutBaseRef.current;
      const photoId = studioPhotoSel?.photoId;
      if (!base || !photoId) return;
      try {
        setError(null);
        await updatePhotoLayout(id, photoId, { ...base, crop: nextCrop });
        await refreshAlbum();
      } catch (e) {
        setError(e.message);
      }
    }, 220);
  }

  function onStudioCropSliderChange(key, val) {
    const cur = { ...studioCropDraftRef.current };
    const crop = { ...cur, [key]: val };
    if (key === "l") crop.w = Math.min(crop.w, 100 - val);
    else if (key === "t") crop.h = Math.min(crop.h, 100 - val);
    else if (key === "w") crop.w = Math.min(100 - crop.l, Math.max(1, val));
    else if (key === "h") crop.h = Math.min(100 - crop.t, Math.max(1, val));
    scheduleStudioCropPersist(crop);
  }

  async function studioResetPhotoCrop() {
    if (!studioSelPhotoDetail) return;
    const base = studioSpreadLayoutBaseRef.current;
    if (!base) return;
    const next = { ...DEFAULT_PHOTO_CROP };
    studioCropDraftRef.current = next;
    setStudioCropDraft(next);
    if (studioCropPersistTimerRef.current) {
      window.clearTimeout(studioCropPersistTimerRef.current);
      studioCropPersistTimerRef.current = null;
    }
    try {
      setError(null);
      await updatePhotoLayout(id, studioSelPhotoDetail.photo.id, { ...base, crop: next });
      await refreshAlbum();
    } catch (e) {
      setError(e.message);
    }
  }

  async function studioRemoveSelectedPhoto() {
    if (!studioPhotoSel) return;
    setShowStudioCropSheet(false);
    const { pageId, photoId } = studioPhotoSel;
    try {
      setError(null);
      await removePhoto(id, pageId, photoId);
      await refreshAlbum();
      setStudioPhotoSel(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function closeStudioCropSheet() {
    if (studioCropPersistTimerRef.current) {
      window.clearTimeout(studioCropPersistTimerRef.current);
      studioCropPersistTimerRef.current = null;
      const base = studioSpreadLayoutBaseRef.current;
      const photoId = studioPhotoSel?.photoId;
      const crop = studioCropDraftRef.current;
      if (base && photoId) {
        try {
          setError(null);
          await updatePhotoLayout(id, photoId, { ...base, crop });
          await refreshAlbum();
        } catch (e) {
          setError(e.message);
        }
      }
    }
    setShowStudioCropSheet(false);
  }

  useEffect(() => {
    if (!showStudioCropSheet) return;
    const onKey = (e) => {
      if (e.key === "Escape") void closeStudioCropSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showStudioCropSheet]);

  async function handleDrop(photoId, targetPageId) {
    try {
      await movePhotoToPage(id, photoId, targetPageId);
      await refreshAlbum();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRemove(pageId, photoId) {
    try {
      await removePhoto(id, pageId, photoId);
      await refreshAlbum();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleEditPage(page) {
    setEditingPage(page);
  }

  async function handleAddSpread() {
    try {
      await addPage(id);
      await addPage(id);
      await refreshAlbum();
      setViewIndex(viewCount);
    } catch (e) {
      setError(e.message);
    }
  }

  const studioToolbarModel = useMemo(() => {
    if (!album || viewIndex === 0 || !studioTextSel) return null;
    const p = (album.pages || []).find((x) => x.id === studioTextSel.pageId);
    const texts = loadTextsFromPageConfig(p?.page_config || {});
    const t = texts.find((x) => x.id === studioTextSel.textId);
    if (!p || !t) return null;
    return { page: p, text: t };
  }, [album, studioTextSel, viewIndex]);

  if (!album) return <AlbumLoading />;

  return (
    <div className={styles.studioRoot}>
      <input
        ref={studioFileInputRef}
        type="file"
        accept="image/*,image/heic,image/heif"
        multiple
        style={{ display: "none" }}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files;
          if (f?.length) handleStudioFilesSelected(f);
        }}
      />

      <StageIndicator current={3} className={styles.studioStageIndicator} />

      <div className={styles.studioTopBar}>
        <button
          type="button"
          className={`${styles.studioTopBtn} ${styles.studioTopBtnNext}`}
          onClick={() => {
            navigate(`/album/${id}/preview`);
          }}
          title="שלב 4: צפייה באלבום"
          aria-label="שלב הבא: צפייה באלבום"
        >
          <span className={styles.studioTopBtnIcon} aria-hidden>›</span>
          <span>שלב הבא</span>
          <span className={styles.studioTopBtnNextSub}>צפייה באלבום</span>
          </button>
        <button
          type="button"
          className={styles.studioTopBtn}
          disabled={undoDepth === 0}
          onClick={() => undoLastConfig()}
          title="בטל"
        >
          <span className={styles.studioTopBtnIcon} aria-hidden>↶</span>
          בטל
          </button>
        <button
          type="button"
          className={styles.studioTopBtn}
          disabled={redoDepth === 0}
          onClick={() => redoLastConfig()}
          title="בצע שוב"
        >
          <span className={styles.studioTopBtnIcon} aria-hidden>↷</span>
          שוב
        </button>
        <button
          type="button"
          className={styles.studioTopBtn}
          onClick={() => setShowAllPagesSheet(true)}
          title="כל העמודים"
        >
          <span className={styles.studioTopBtnIcon} aria-hidden>▤</span>
          כל העמודים
        </button>
        <button
          type="button"
          className={styles.studioTopBtn}
          onClick={() => {
            const p = activePageForTools;
            if (p) setEditingPage(p);
            else setError("בחרו עמוד בשיפוע (הקישו על עמוד).");
          }}
          title="עריכה מתקדמת (הזזה, חיתוך, מדבקות)"
          aria-label="עריכה מתקדמת"
        >
          <span className={styles.studioTopBtnIcon} aria-hidden>✎</span>
          עריכת עמוד
        </button>
        <button
          type="button"
          className={styles.studioTopBtn}
          onClick={() => void handleFinishAndDownload()}
          disabled={generatingPdf}
          title="סיום והורדת PDF"
          aria-label="סיום והורדת PDF"
        >
          <span className={styles.studioTopBtnIcon} aria-hidden>↓</span>
          <span>{generatingPdf ? "מכין…" : "סיום והורדת PDF"}</span>
        </button>
        </div>

      {viewIndex > 0 && (
        <p className={styles.studioActivePageHint}>
          עמוד פעיל לכלים: <strong>{activePageOrderLabel != null ? `#${activePageOrderLabel}` : "—"}</strong>
          {studioUploading
            ? " · מעלה תמונות…"
            : " · תמונה ואלמנט: בחירה, גרירה ופינות לגודל. טקסט: גרירה, לחיצה כפולה לעריכה."}
        </p>
      )}

      <div className={styles.studioSpreadWrap}>
        <div className={styles.studioSpreadTop}>
          <div className={styles.studioPageNav}>
            <button
              type="button"
              className={styles.studioNavLink}
              disabled={viewIndex === 0}
              onClick={() => setViewIndex((i) => Math.max(0, i - 1))}
            >
              ‹ עמוד קודם
            </button>
            <div className={styles.studioPageSelectWrap}>
              <select
                className={styles.studioPageSelect}
                value={viewIndex}
                aria-label="בחירת עמוד או כריכה"
                onChange={(e) => setViewIndex(Number(e.target.value))}
              >
                <option value={0}>כריכה</option>
                {Array.from({ length: spreadCount }, (_, i) => {
                  const a = i * 2 + 1;
                  const b = Math.min(i * 2 + 2, pages.length);
                  const lab = b > a ? `עמודים ${a}–${b}` : `עמוד ${a}`;
                  return (
                    <option key={i} value={i + 1}>
                      {lab}
                    </option>
                  );
                })}
              </select>
            </div>
            <button
              type="button"
              className={styles.studioNavLink}
              disabled={viewIndex >= viewCount - 1}
              onClick={() => setViewIndex((i) => Math.min(viewCount - 1, i + 1))}
            >
              עמוד הבא ›
            </button>
          </div>
          {viewIndex > 0 && studioToolbarModel && (
            <StudioTextToolbar
              text={studioToolbarModel.text}
              onPatch={(partial) =>
                studioPatchText(studioToolbarModel.page.id, studioToolbarModel.text.id, partial, { skipUndo: true })
              }
              onLiveFontSizeChange={setStudioSpreadFontSizeLive}
              onRemove={() => studioRemoveSelectedText()}
              onDismiss={() => {
                setStudioTextSel(null);
                setStudioEditingTextId(null);
                setStudioSpreadFontSizeLive(null);
              }}
            />
          )}
        </div>

        <div className={viewIndex === 0 ? styles.studioCoverCard : styles.studioSpreadFrame}>
          {viewIndex > 0 && studioPhotoSel && (
            <div className={styles.studioPhotoSelectionBar} role="toolbar" aria-label="תמונה נבחרת">
              <button type="button" className={styles.studioPhotoSelectionBarBtn} onClick={() => setShowStudioCropSheet(true)}>
                חיתוך תמונה
              </button>
              <button
                type="button"
                className={`${styles.studioPhotoSelectionBarBtn} ${styles.studioPhotoSelectionBarBtnDanger}`}
                onClick={() => studioRemoveSelectedPhoto()}
              >
                מחק תמונה
              </button>
            </div>
          )}
          {viewIndex > 0 && studioStickerSel && (
            <div className={styles.studioPhotoSelectionBar} role="toolbar" aria-label="אלמנט נבחר">
              <button
                type="button"
                className={`${styles.studioPhotoSelectionBarBtn} ${styles.studioPhotoSelectionBarBtnDanger}`}
                onClick={() => studioRemoveSticker(studioStickerSel.pageId, studioStickerSel.stickerId)}
              >
                הסר אלמנט
              </button>
            </div>
          )}
          <div className={styles.albumView} style={{ minHeight: viewIndex === 0 ? "auto" : undefined }}>
          {viewIndex === 0 ? (
            <AlbumCover album={album} coverUrl={coverUrl} />
          ) : (
            <AlbumSpread
              leftPage={leftPage}
              rightPage={rightPage}
              albumId={id}
              onDrop={handleDrop}
              onRemove={handleRemove}
              onEditPage={handleEditPage}
                onAddPage={async () => { await addPage(id); await refreshAlbum(); }}
              getPhotoUrl={getPhotoUrl}
                getElementUrl={getElementUrl}
                studioSpreadChrome
                activePageId={activePageId}
                onStudioPageBackground={(pageId) => {
                  setStudioPhotoSel(null);
                  setStudioStickerSel(null);
                  setStudioTextSel(null);
                  setStudioEditingTextId(null);
                  setStudioSpreadFontSizeLive(null);
                  setActivePageId(pageId);
                }}
                onStudioTapAddPhotos={(pageId) => openStudioPhotoPicker(pageId)}
                studioPhotoSel={studioPhotoSel}
                onStudioSelectPhoto={(sel) => {
                  setStudioStickerSel(null);
                  setStudioTextSel(null);
                  setStudioEditingTextId(null);
                  setStudioSpreadFontSizeLive(null);
                  setStudioPhotoSel(sel);
                }}
                onPersistSpreadPhotoLayout={handlePersistSpreadPhotoLayout}
                studioStickerSel={studioStickerSel}
                onStudioSelectSticker={(sel) => {
                  setStudioPhotoSel(null);
                  setStudioTextSel(null);
                  setStudioEditingTextId(null);
                  setStudioSpreadFontSizeLive(null);
                  setStudioStickerSel(sel);
                }}
                onPersistSpreadStickerLayout={handlePersistSpreadStickerLayout}
                studioTextSel={studioTextSel}
                studioEditingTextId={studioEditingTextId}
                onStudioTextSelect={(pageId, textId) => {
                  setStudioPhotoSel(null);
                  setStudioStickerSel(null);
                  setStudioTextSel(textId ? { pageId, textId } : null);
                  if (!textId) setStudioEditingTextId(null);
                }}
                onStudioTextEditingChange={setStudioEditingTextId}
                onStudioTextPatch={studioPatchText}
                studioLiveFontSize={studioSpreadFontSizeLive}
                onStudioSlotAddPhoto={openStudioPhotoPickerForSlot}
              />
            )}
          </div>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {viewIndex > 0 && (
        <div className={styles.studioBottomDock}>
          <div className={styles.studioDockScroll} ref={dockScrollRef}>
            <button type="button" className={styles.studioDockItem} onClick={() => setShowLayoutSheet(true)}>
              <span className={styles.studioDockIcon}>
                <StudioDockIconLayout />
              </span>
              <span className={styles.studioDockLabel}>פריסות</span>
            </button>
            <button type="button" className={styles.studioDockItem} onClick={() => setShowBgSheet(true)}>
              <span className={styles.studioDockIcon}>
                <StudioDockIconBackground />
              </span>
              <span className={styles.studioDockLabel}>רקעים</span>
            </button>
            <button type="button" className={styles.studioDockItem} onClick={() => setShowStickersSheet(true)}>
              <span className={styles.studioDockIcon}>
                <StudioDockIconElements />
              </span>
              <span className={styles.studioDockLabel}>אלמנטים</span>
            </button>
            <button type="button" className={styles.studioDockItem} onClick={() => openShareQrSheet()}>
              <span className={styles.studioDockIcon}>
                <StudioDockIconQr />
              </span>
              <span className={styles.studioDockLabel}>QR</span>
            </button>
            <button type="button" className={styles.studioDockItem} onClick={() => addStudioText()}>
              <span className={styles.studioDockIcon}>
                <StudioDockIconText />
              </span>
              <span className={styles.studioDockLabel}>טקסט</span>
        </button>
      </div>
        </div>
      )}

      {viewIndex === 0 && (
        <div className={styles.studioFooterLinks}>
          <button type="button" onClick={() => setViewIndex(1)}>עריכת עמודים ←</button>
          <button type="button" onClick={() => navigate(`/album/${id}/preview`)}>צפייה באלבום</button>
        </div>
      )}

      {showStudioCropSheet && studioSelPhotoDetail && (
        <div className={styles.cropModalBackdrop} onClick={() => closeStudioCropSheet()} aria-hidden={false}>
          <div
            className={styles.cropModalCard}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-crop-title"
          >
            <header className={styles.cropModalHeader}>
              <div className={styles.cropModalHeaderText}>
                <h2 id="studio-crop-title" className={styles.cropModalTitle}>
                  חיתוך תמונה
                </h2>
                <p className={styles.cropModalSubtitle}>
                  האזור בתוך המסגרת הלבנה הוא מה שיוצג בעמוד. השינויים נשמרים אוטומטית.
                </p>
              </div>
              <button type="button" className={styles.cropModalClose} onClick={() => closeStudioCropSheet()} aria-label="סגור">
                ×
        </button>
            </header>
            <div className={styles.cropModalBody}>
              <CropModalPreview imageUrl={getPhotoUrl(studioSelPhotoDetail.photo.storage_path)} crop={studioCropDraft} />
              <CropModalSliderGrid crop={studioCropDraft} onFieldChange={onStudioCropSliderChange} />
            </div>
            <footer className={styles.cropModalFooter}>
              <button type="button" className={styles.cropModalBtnGhost} onClick={() => studioResetPhotoCrop()}>
                איפוס מלא
        </button>
              <button type="button" className={styles.cropModalBtnPrimary} onClick={() => closeStudioCropSheet()}>
                סיום
              </button>
            </footer>
      </div>
        </div>
      )}

      {showLayoutSheet && (
        <div className={styles.studioSheetBackdrop} onClick={() => setShowLayoutSheet(false)} role="presentation">
          <div className={styles.studioSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.studioSheetHeader}>
              <h3 className={styles.studioSheetTitle}>פריסת תמונות (עמוד פעיל)</h3>
              <button type="button" className={styles.studioSheetClose} onClick={() => setShowLayoutSheet(false)} aria-label="סגור">
                ×
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 0 }}>
              התבנית מוצגת על העמוד הפעיל: לחצו על כל מרובע עם + כדי להוסיף תמונה למקום הזה. אם כבר יש תמונות, הן יוזזו למסגרות לפי הסדר.
            </p>
            <div className={styles.studioTemplateGrid}>
              <button
                type="button"
                className={
                  styles.studioTemplateBtn +
                  (!activePageForTools?.page_config?.studioTemplate ? " " + styles.studioTemplateBtnSelected : "")
                }
                onClick={() => clearStudioTemplate()}
                aria-label="ללא תבנית — פריסה חופשית בלי מסגרות מוכנות"
              >
                <StudioNoTemplatePreviewThumb />
                <span className={styles.studioTemplateName}>ללא תבנית</span>
                <span className={styles.studioTemplateMeta}>פריסה חופשית</span>
              </button>
              {PAGE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={styles.studioTemplateBtn}
                  onClick={() => applyStudioTemplate(tpl)}
                  aria-label={`${tpl.name}, ${tpl.slots.length} מקומות לתמונה`}
                >
                  <StudioTemplatePreviewThumb slots={tpl.slots} />
                  <span className={styles.studioTemplateName}>{tpl.name}</span>
                  <span className={styles.studioTemplateMeta}>{tpl.slots.length} מקומות לתמונה</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showBgSheet && (
        <div className={styles.studioSheetBackdrop} onClick={() => setShowBgSheet(false)} role="presentation">
          <div className={styles.studioSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.studioSheetHeader}>
              <h3 className={styles.studioSheetTitle}>צבע רקע לעמוד</h3>
              <button type="button" className={styles.studioSheetClose} onClick={() => setShowBgSheet(false)} aria-label="סגור">
                ×
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>בחרו צבע</span>
              <input
                type="color"
                value={bgDraftColor}
                onChange={(e) => setBgDraftColor(e.target.value)}
                style={{ width: 56, height: 40, border: "none", cursor: "pointer" }}
              />
            </label>
            <button
              type="button"
              className={styles.cta}
              style={{ width: "100%", marginTop: "1rem" }}
              onClick={async () => {
                await setStudioBackgroundColor(bgDraftColor);
                setShowBgSheet(false);
              }}
            >
              החלת רקע
            </button>
          </div>
        </div>
      )}

      {showStickersSheet && (
        <div className={styles.studioSheetBackdrop} onClick={() => setShowStickersSheet(false)} role="presentation">
          <div className={`${styles.studioSheet} ${styles.studioStickersSheet}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.studioSheetHeader}>
              <h3 className={styles.studioSheetTitle}>אלמנטים מוכנים</h3>
              <button type="button" className={styles.studioSheetClose} onClick={() => setShowStickersSheet(false)} aria-label="סגור">
                ×
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 0 }}>
              נוספים לעמוד הפעיל. בחרו אלמנט בשיפוע, גררו להזזה, וגררו את הפינות לשינוי גודל (יחס גובה־רוחב נשמר כמו בתמונה).
            </p>
            <div className={styles.studioStickersSheetBody}>
              {studioElementsList.length === 0 ? (
                <p className={styles.stickerPickerHint}>טוען... או הוסיפו קבצים ל־bucket ״elements״ ב־Storage.</p>
              ) : (
                <div className={styles.stickerPickerRow}>
                  {studioElementsList.map((c) => (
                    <button
                      key={c.path}
                      type="button"
                      className={styles.stickerPickerBtn}
                      onClick={() => studioAddSticker(c.path)}
                      title={c.path}
                      aria-label={c.path}
                    >
                      <img src={getElementUrl(c.path)} alt="" className={styles.stickerPickerImg} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showQrSheet && shareUrlQr && (
        <div className={styles.studioSheetBackdrop} onClick={() => setShowQrSheet(false)} role="presentation">
          <div className={styles.studioSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.studioSheetHeader}>
              <h3 className={styles.studioSheetTitle}>שיתוף — סריקת QR</h3>
              <button type="button" className={styles.studioSheetClose} onClick={() => setShowQrSheet(false)} aria-label="סגור">
                ×
              </button>
            </div>
            <p style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: 0 }}>
              סריקה פותחת את יצירת האלבום עם אותו אלבום (מכריכה)—לא עותק חדש.
            </p>
            <img
              className={styles.studioQrImg}
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrlQr)}`}
              alt="QR להמשך עריכת האלבום"
              width={220}
              height={220}
            />
            <input type="text" readOnly value={shareUrlQr} style={{ width: "100%", padding: "0.5rem", fontSize: "0.8rem" }} />
            <button
              type="button"
              className={styles.cta}
              style={{ width: "100%", marginTop: "0.75rem" }}
              onClick={() => navigator.clipboard?.writeText(shareUrlQr)}
            >
              העתקת קישור
            </button>
          </div>
        </div>
      )}

      {showAllPagesSheet && (
        <div className={styles.studioSheetBackdrop} onClick={() => setShowAllPagesSheet(false)} role="presentation">
          <div className={styles.studioSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.studioSheetHeader}>
              <h3 className={styles.studioSheetTitle}>כל העמודים</h3>
              <button type="button" className={styles.studioSheetClose} onClick={() => setShowAllPagesSheet(false)} aria-label="סגור">
                ×
              </button>
            </div>
            <div className={styles.studioAllPagesGrid}>
              <button
                type="button"
                className={styles.studioThumb + (viewIndex === 0 ? " " + styles.studioThumbActive : "")}
                onClick={() => { setViewIndex(0); setShowAllPagesSheet(false); }}
              >
                <div style={{ height: "100%", background: "#d1d5db", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>
                  כריכה
                </div>
              </button>
              {Array.from({ length: spreadCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.studioThumb + (viewIndex === i + 1 ? " " + styles.studioThumbActive : "")}
                  onClick={() => { setViewIndex(i + 1); setShowAllPagesSheet(false); }}
                >
                  <div style={{ height: "100%", background: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", color: "#fff" }}>
                    {i * 2 + 1}
                    {i * 2 + 2 <= pages.length ? `–${i * 2 + 2}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingPage && (
        <FullScreenPageEditor
          page={editingPage}
          pageLabel={`עמוד ${(editingPage.page_order ?? 0) + 1}`}
          photos={editingPage.album_photos || []}
          albumId={id}
          getPhotoUrl={getPhotoUrl}
          onSave={refreshAlbum}
          onClose={() => setEditingPage(null)}
          onSaveError={(msg) => setError(msg)}
          onRemovePhoto={async (photoId, editorPageConfig) => {
            await removePhoto(id, editingPage.id, photoId);
            const a = await getAlbum(id);
            setAlbum(a);
            const updated = a.pages?.find((p) => p.id === editingPage.id);
            if (updated) setEditingPage({ ...updated, page_config: { ...updated?.page_config, ...(editorPageConfig || {}) } });
          }}
          onUploadToPage={async (files, editorPageConfig) => {
            try {
              await uploadPhotos(id, editingPage.id, files);
              const a = await getAlbum(id);
              setAlbum(a);
              const updated = a.pages?.find((p) => p.id === editingPage.id);
              if (updated) setEditingPage({ ...updated, page_config: { ...updated?.page_config, ...(editorPageConfig || {}) } });
            } catch (e) {
              const msg = e?.message || "";
              const isTooLarge = /PAYLOAD_TOO_LARGE|413|too large|גדול/i.test(msg);
              setError(isTooLarge ? "התמונה גדולה מדי. נסה לבחור תמונה קטנה יותר או צלם במצב חיסכון." : msg);
            }
          }}
        />
      )}
    </div>
  );
}
