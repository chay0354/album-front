import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlbum,
  getBaseCovers,
  addPage,
  uploadPhotos,
  getPhotoUrl,
  getCoverUrl,
  getPdfDownloadUrl,
  movePhotoToPage,
  removePhoto,
  updatePhotoLayout,
  updatePageConfig,
  getElementsList,
  getElementUrl,
} from "../api";
import styles from "./EditPages.module.css";

const DEFAULT_LAYOUT = (index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 48 + 2, y: row * 48 + 2, w: 46, h: 46, rotation: 0 };
};

const STICKER_DEFAULT_SIZE = 12;

/** Premade page layouts: each template is an array of { x, y, w, h, rotation } in % */
const PAGE_TEMPLATES = [
  { id: "1-full", name: "תמונה אחת", slots: [{ x: 5, y: 5, w: 90, h: 90, rotation: 0 }] },
  { id: "2-h", name: "2 אופקי", slots: [{ x: 2, y: 10, w: 46, h: 80, rotation: 0 }, { x: 52, y: 10, w: 46, h: 80, rotation: 0 }] },
  { id: "2-v", name: "2 אנכי", slots: [{ x: 10, y: 2, w: 80, h: 46, rotation: 0 }, { x: 10, y: 52, w: 80, h: 46, rotation: 0 }] },
  { id: "3-l", name: "3 (גדול+2)", slots: [{ x: 2, y: 5, w: 48, h: 90, rotation: 0 }, { x: 52, y: 5, w: 46, h: 43, rotation: 0 }, { x: 52, y: 52, w: 46, h: 46, rotation: 0 }] },
  { id: "4-grid", name: "4 רשת", slots: [{ x: 2, y: 2, w: 46, h: 46, rotation: 0 }, { x: 52, y: 2, w: 46, h: 46, rotation: 0 }, { x: 2, y: 52, w: 46, h: 46, rotation: 0 }, { x: 52, y: 52, w: 46, h: 46, rotation: 0 }] },
];

function setMinimalDragImage(e) {
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;";
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 0, 0);
  setTimeout(() => el.remove(), 0);
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
    <div className={styles.coverSingle} style={coverStyle}>
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

  useEffect(() => {
    getElementsList().then(setElementsList).catch(() => setElementsList([]));
  }, []);

  useEffect(() => {
    const cfg = page?.page_config || {};
    setPageConfig((prev) => ({
      ...prev,
      backgroundColor: cfg.backgroundColor ?? prev.backgroundColor ?? DEFAULT_PAGE_BG,
      textColor: cfg.textColor ?? prev.textColor ?? DEFAULT_PAGE_TEXT_COLOR,
      stickers: Array.isArray(cfg.stickers) ? cfg.stickers : [],
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
        setLayouts((prev) => {
          const l = prev[ref.id] || ref.startLayout;
          if (!l || typeof l.x !== "number") return prev;
          let newX = ref.startLayout.x + dx;
          let newY = ref.startLayout.y + dy;
          newX = Math.max(0, Math.min(100 - l.w, newX));
          newY = Math.max(0, Math.min(100 - l.h, newY));
          return { ...prev, [ref.id]: { ...l, x: newX, y: newY } };
        });
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
  }, [layouts, getCoords]);

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
      if (page?.id) await updatePageConfig(albumId, page.id, pageConfig);
      await onSave();
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
  const selectedLayout = selectedId
    ? (layouts[selectedId] || (selectedPhotoIndex >= 0 ? DEFAULT_LAYOUT(selectedPhotoIndex) : null))
    : null;
  const selectedSticker = selectedStickerId
    ? (pageConfig.stickers || []).find((s) => s.id === selectedStickerId)
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
    <div className={styles.fullScreenOverlay} onClick={(e) => { if (e.target === e.currentTarget) { setSelectedId(null); setSelectedStickerId(null); } }}>
      <div className={styles.fullScreenContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.fullScreenHeader}>
          <h2>עריכת מיקומים – {pageLabel}</h2>
          <div className={styles.fullScreenActions}>
            <button type="button" className={styles.secondary} onClick={onClose}>ביטול</button>
            <button type="button" className={styles.cta} onClick={handleSave} disabled={saving}>{saving ? "שומר..." : "שמור"}</button>
          </div>
        </div>
        <p className={styles.fullScreenHint}>גרור להזזה. בחר תמונה וכוון סיבוב וגודל בצד.</p>
        <div className={styles.editorLayout}>
          <div className={styles.fullScreenPageWrap} ref={containerRef}>
            <div
              className={styles.fullScreenPage}
              onClick={() => { setSelectedId(null); setSelectedStickerId(null); setSelectedSlotForPicker(null); }}
              style={{
                background: pageConfig.backgroundColor,
                backgroundColor: pageConfig.backgroundColor,
              }}
            >
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
                            styles.editorPhoto +
                            (draggingId === photoId ? " " + styles.editorPhotoDragging : "") +
                            (selectedId === photoId ? " " + styles.editorPhotoSelected : "")
                          }
                          style={{
                            left: `${layout.x}%`,
                            top: `${layout.y}%`,
                            width: `${layout.w}%`,
                            height: `${layout.h}%`,
                            transform: rot ? `rotate(${rot}deg)` : undefined,
                          }}
                          onMouseDown={(e) => handleMouseDown(e, p.id)}
                          onTouchStart={(e) => handleMouseDown(e, p.id)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <img src={getPhotoUrl(p.storage_path)} alt="" draggable={false} />
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
                        styles.editorPhoto +
                        (draggingId === p.id ? " " + styles.editorPhotoDragging : "") +
                        (selectedId === p.id ? " " + styles.editorPhotoSelected : "")
                      }
                      style={{
                        left: `${layout.x}%`,
                        top: `${layout.y}%`,
                        width: `${layout.w}%`,
                        height: `${layout.h}%`,
                        transform: rot ? `rotate(${rot}deg)` : undefined,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, p.id)}
                      onTouchStart={(e) => handleMouseDown(e, p.id)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img src={getPhotoUrl(p.storage_path)} alt="" draggable={false} />
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
                return (
                  <div
                    key={sticker.id}
                    className={
                      styles.editorSticker +
                      (draggingStickerId === sticker.id ? " " + styles.editorPhotoDragging : "") +
                      (selectedStickerId === sticker.id ? " " + styles.editorPhotoSelected : "")
                    }
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      transform: rot ? `rotate(${rot}deg)` : undefined,
                    }}
                    onMouseDown={(e) => handleStickerMouseDown(e, sticker)}
                    onTouchStart={(e) => handleStickerMouseDown(e, sticker)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img src={imgUrl} alt="" className={styles.stickerImg} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.editorControlsCol}>
            {selectedId && (
              <div className={styles.editorControls}>
                <h4>כיוונון תמונה</h4>
                {selectedLayout && (
                <>
                  <label className={styles.controlRow}>
                    <span>סיבוב (מעלות)</span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selectedLayout.rotation ?? 0}
                      onChange={(e) => updateLayout(selectedId, { rotation: Number(e.target.value) })}
                      className={styles.slider}
                    />
                    <span className={styles.controlValue}>{selectedLayout.rotation ?? 0}°</span>
                  </label>
                  <label className={styles.controlRow}>
                    <span>גודל (%)</span>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={Math.round(((selectedLayout.w ?? 46) + (selectedLayout.h ?? 46)) / 2)}
                      onChange={(e) => {
                        const size = Number(e.target.value);
                        updateLayout(selectedId, { w: size, h: size });
                      }}
                      className={styles.slider}
                    />
                    <span className={styles.controlValue}>{Math.round(((selectedLayout.w ?? 46) + (selectedLayout.h ?? 46)) / 2)}%</span>
                  </label>
                  {onRemovePhoto && (
                    <button type="button" className={styles.removeItemBtn} onClick={handleRemovePhoto}>
                      הסר תמונה
                    </button>
                  )}
                  {templateSlots && slotPhotoIds.includes(selectedId) && (
                    <button
                      type="button"
                      className={styles.removeItemBtn}
                      onClick={() => { const idx = slotPhotoIds.indexOf(selectedId); if (idx >= 0) unassignPhotoFromSlot(idx); setSelectedId(null); }}
                    >
                      הסר מהמקום
                    </button>
                  )}
                </>
              )}
              </div>
            )}
            {selectedStickerId && selectedSticker && (
              <div className={styles.editorControls}>
                <h4>כיוונון אלמנט</h4>
                <label className={styles.controlRow}>
                  <span>סיבוב (מעלות)</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedSticker.rotation ?? 0}
                    onChange={(e) => updateSticker(selectedStickerId, { rotation: Number(e.target.value) })}
                    className={styles.slider}
                  />
                  <span className={styles.controlValue}>{selectedSticker.rotation ?? 0}°</span>
                </label>
                <label className={styles.controlRow}>
                  <span>גודל (%)</span>
                  <input
                    type="range"
                    min={5}
                    max={45}
                    value={Math.round(((selectedSticker.w ?? STICKER_DEFAULT_SIZE) + (selectedSticker.h ?? STICKER_DEFAULT_SIZE)) / 2)}
                    onChange={(e) => {
                      const size = Number(e.target.value);
                      updateSticker(selectedStickerId, { w: size, h: size });
                    }}
                    className={styles.slider}
                  />
                  <span className={styles.controlValue}>{Math.round(((selectedSticker.w ?? STICKER_DEFAULT_SIZE) + (selectedSticker.h ?? STICKER_DEFAULT_SIZE)) / 2)}%</span>
                </label>
                <button type="button" className={styles.removeItemBtn} onClick={() => removeSticker(selectedStickerId)}>
                  הסר אלמנט
                </button>
              </div>
            )}
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
              <p className={styles.stickerPickerHint}>לחץ על תבנית — יופיעו מקומות עם +. לחץ על + ובחר תמונה.</p>
              <div className={styles.templatePickerRow}>
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
              {templateSlots && (
                <button type="button" className={styles.clearTemplateBtn} onClick={clearTemplate}>
                  ביטול תבנית
                </button>
              )}
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

function AlbumSpread({ leftPage, rightPage, albumId, onDrop, onRemove, onEditPage, onAddPage, getPhotoUrl, getElementUrl }) {
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

  return (
    <div className={styles.spread}>
      <div className={styles.halfPageWrapper}>
        <div
          className={styles.halfPage + (dragOverLeft ? " " + styles.dragOver : "")}
          style={leftPage?.page_config?.backgroundColor ? { background: leftPage.page_config.backgroundColor } : undefined}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverLeft(true); }}
          onDragLeave={() => setDragOverLeft(false)}
          onDrop={(e) => handleDrop(e, leftPage?.id)}
          data-page-id={leftPage?.id}
        >
          <PagePhotos
            photos={photosLeft}
            getPhotoUrl={getPhotoUrl}
            onRemove={(photoId) => onRemove(leftPage?.id, photoId)}
            useLayout={hasLayoutLeft}
            showRemoveButton={false}
          />
          {getElementUrl && <PageStickers stickers={stickersLeft} getElementUrl={getElementUrl} />}
          {leftPage && (
            <button type="button" className={styles.editPageBtnOnPage} onClick={(e) => { e.stopPropagation(); onEditPage(leftPage); }} title="ערוך עמוד">
              ערוך עמוד
            </button>
          )}
        </div>
      </div>
      <div className={styles.spine} />
      <div className={styles.halfPageWrapper}>
        <div
          className={styles.halfPage + (dragOverRight ? " " + styles.dragOver : "")}
          style={rightPage?.page_config?.backgroundColor ? { background: rightPage.page_config.backgroundColor } : undefined}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverRight(true); }}
          onDragLeave={() => setDragOverRight(false)}
          onDrop={(e) => handleDrop(e, rightPage?.id)}
          data-page-id={rightPage?.id}
        >
          <PagePhotos
            photos={photosRight}
            getPhotoUrl={getPhotoUrl}
            onRemove={(photoId) => onRemove(rightPage?.id, photoId)}
            useLayout={hasLayoutRight}
            showRemoveButton={false}
          />
          {getElementUrl && <PageStickers stickers={stickersRight} getElementUrl={getElementUrl} />}
          {rightPage ? (
            <button type="button" className={styles.editPageBtnOnPage} onClick={(e) => { e.stopPropagation(); onEditPage(rightPage); }} title="ערוך עמוד">
              ערוך עמוד
            </button>
          ) : onAddPage ? (
            <button type="button" className={styles.editPageBtnOnPage} onClick={(e) => { e.stopPropagation(); onAddPage(); }} title="הוסף עמוד">
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
  const [album, setAlbum] = useState(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [error, setError] = useState(null);
  const [editingPage, setEditingPage] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    getAlbum(id).then(setAlbum).catch((e) => setError(e.message));
  }, [id]);

  async function handleFinishAndDownload() {
    setGeneratingPdf(true);
    setError(null);
    try {
      const url = getPdfDownloadUrl(id);
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      await r.blob();
      navigate(`/album/${id}/done`);
    } catch (e) {
      setError(e.message || "שגיאה ביצירת PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

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

  async function refreshAlbum() {
    const a = await getAlbum(id);
    setAlbum(a);
  }

  const pages = album?.pages || [];
  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));
  const viewCount = 1 + spreadCount;
  const currentSpreadIndex = viewIndex === 0 ? 0 : viewIndex - 1;
  const leftPage = pages[currentSpreadIndex * 2] || null;
  const rightPage = pages[currentSpreadIndex * 2 + 1] || null;

  const coverUrl = coverImageUrl ?? album?.cover_config?.coverUrl ?? null;

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

  if (!album) return <div className={styles.center}><span className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>הוספת תמונות לאלבום</h1>
        <p className={styles.sub}>לחץ "ערוך עמוד" להוספת תמונות ולהזזתן על העמוד.</p>
      </header>

      <div className={styles.albumModel}>
        <div className={styles.viewNav}>
          <button type="button" className={styles.navBtn} onClick={() => setViewIndex((i) => Math.max(0, i - 1))} disabled={viewIndex === 0}>
            ‹
          </button>
          <span className={styles.viewLabel}>
            {viewIndex === 0 ? "כריכה" : rightPage ? `עמודים ${currentSpreadIndex * 2 + 1}–${currentSpreadIndex * 2 + 2}` : `עמוד ${currentSpreadIndex * 2 + 1}`}
          </span>
          <button type="button" className={styles.navBtn} onClick={() => setViewIndex((i) => Math.min(viewCount - 1, i + 1))} disabled={viewIndex >= viewCount - 1}>
            ›
          </button>
        </div>

        <div className={styles.albumView}>
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
            />
          )}
        </div>
      </div>

      <div className={styles.spreadActions}>
        <button type="button" className={styles.addSpreadBtn} onClick={handleAddSpread}>
          + הוסף spread (2 עמודים)
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" onClick={() => navigate(`/album/${id}/cover`)} className={styles.secondary}>
          חזרה לכריכה
        </button>
        <button type="button" onClick={handleFinishAndDownload} disabled={generatingPdf} className={styles.cta}>
          {generatingPdf ? "יוצר PDF ושומר..." : "סיום והורדת PDF"}
        </button>
      </div>

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
