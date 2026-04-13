import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAlbum, updateAlbum, getPremadeCoverList, uploadCover, getPremadeCoverUrl } from "../api";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import { FONT_OPTIONS, DEFAULT_FONT, getFontStack } from "../constants/fonts";
import styles from "./EditCover.module.css";

const MIN_FONT = 14;
const MAX_FONT = 52;
const DEFAULT_X = 50;
const DEFAULT_Y = 18;
const DEFAULT_FONT_SIZE = 28;
const DEFAULT_COLOR = "#ffffff";
const COVER_FRONT_START = 0;
const COVER_FRONT_END = 48;
const COVER_BACK_START = 52;
const COVER_BACK_END = 100;

function isValidHex(s) {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function newText(overrides = {}) {
  return {
    id: "t" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    content: "טקסט",
    side: "front",
    x: DEFAULT_X,
    y: DEFAULT_Y,
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    fontFamily: DEFAULT_FONT,
    ...overrides,
  };
}

function toEditorXForSide(storedX, side) {
  const parsed = Number(storedX);
  const x = Number.isFinite(parsed) ? parsed : DEFAULT_X;
  if (side === "back") {
    if (x >= COVER_BACK_START && x <= COVER_BACK_END) {
      return ((x - COVER_BACK_START) / (COVER_BACK_END - COVER_BACK_START)) * 100;
    }
    return x;
  }
  if (x >= COVER_FRONT_START && x <= COVER_FRONT_END) {
    return ((x - COVER_FRONT_START) / (COVER_FRONT_END - COVER_FRONT_START)) * 100;
  }
  return x;
}

function toStoredXBySide(editorX, side) {
  const parsed = Number(editorX);
  const local = Number.isFinite(parsed) ? parsed : DEFAULT_X;
  const clamped = Math.max(0, Math.min(100, local));
  if (side === "back") {
    return COVER_BACK_START + (clamped / 100) * (COVER_BACK_END - COVER_BACK_START);
  }
  return COVER_FRONT_START + (clamped / 100) * (COVER_FRONT_END - COVER_FRONT_START);
}

function loadTextsFromConfig(cfg) {
  if (cfg.texts && Array.isArray(cfg.texts) && cfg.texts.length > 0) {
    return cfg.texts.map((t, i) => ({
      ...t,
      id: t.id || "t-" + i + "-" + Math.random().toString(36).slice(2, 8),
      side: typeof t.side === "string" ? t.side : ((typeof t.x === "number" && t.x >= COVER_BACK_START) ? "back" : "front"),
      x: toEditorXForSide(t.x, (typeof t.side === "string" ? t.side : ((typeof t.x === "number" && t.x >= COVER_BACK_START) ? "back" : "front"))),
      color: t.color || DEFAULT_COLOR,
    }));
  }
  if (cfg.headerText) {
    return [newText({
      content: cfg.headerText,
      side: "front",
      x: toEditorXForSide(typeof cfg.headerX === "number" ? cfg.headerX : DEFAULT_X, "front"),
      y: typeof cfg.headerY === "number" ? cfg.headerY : DEFAULT_Y,
      fontSize: typeof cfg.headerFontSize === "number" ? cfg.headerFontSize : DEFAULT_FONT_SIZE,
      color: DEFAULT_COLOR,
      fontFamily: cfg.headerFontFamily || DEFAULT_FONT,
    })];
  }
  return [];
}

export default function EditCover() {
  const { id } = useParams();
  const navigate = useNavigate();
  const frontCoverFrameRef = useRef(null);
  const backCoverFrameRef = useRef(null);
  const coverUploadInputRef = useRef(null);
  const [album, setAlbum] = useState(null);
  const [premadeCovers, setPremadeCovers] = useState([]);
  const [texts, setTexts] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [selectedPremadePath, setSelectedPremadePath] = useState(null);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState(null);
  const [coverSearchQuery, setCoverSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0, side: "front" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAlbum(id), getPremadeCoverList().catch(() => [])]).then(([a, list]) => {
      if (cancelled) return;
      setAlbum(a);
      setPremadeCovers(Array.isArray(list) ? list : []);
      const cfg = a.cover_config || {};
      setUserEmail(cfg.userEmail || "");
      const coverUrl = cfg.coverUrl || null;
      if (coverUrl && typeof coverUrl === "string" && coverUrl.includes("premade-covers/")) {
        const path = coverUrl.split("premade-covers/")[1]?.split("?")[0] || null;
        setSelectedPremadePath(path);
        setUploadedCoverUrl(null);
      } else if (coverUrl) {
        setSelectedPremadePath(null);
        setUploadedCoverUrl(coverUrl);
      } else {
        setUploadedCoverUrl(null);
        setSelectedPremadePath(Array.isArray(list) && list.length > 0 ? list[0].path : null);
      }
      setTexts(loadTextsFromConfig(cfg));
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [id]);

  const selectedText = texts.find((t) => t.id === selectedTextId);

  const resolvedCoverUrl = useMemo(
    () => uploadedCoverUrl || (selectedPremadePath ? getPremadeCoverUrl(selectedPremadePath) : null),
    [uploadedCoverUrl, selectedPremadePath]
  );

  const buildCoverConfigPayload = useCallback(() => {
    const prev = album?.cover_config || {};
    const nextTexts = texts
      .map((t) => ({
        id: t.id,
        content: typeof t.content === "string" ? t.content : "",
        side: t.side === "back" ? "back" : "front",
        x: toStoredXBySide(t.x, t.side === "back" ? "back" : "front"),
        y: Number.isFinite(Number(t.y)) ? Number(t.y) : DEFAULT_Y,
        fontSize: Number.isFinite(Number(t.fontSize)) ? Number(t.fontSize) : DEFAULT_FONT_SIZE,
        color: isValidHex(t.color) ? t.color : DEFAULT_COLOR,
        fontFamily: t.fontFamily || DEFAULT_FONT,
      }));
    return {
      ...prev,
      userEmail,
      texts: nextTexts,
      ...(resolvedCoverUrl ? { coverUrl: resolvedCoverUrl } : {}),
    };
  }, [album?.cover_config, userEmail, texts, resolvedCoverUrl]);

  const updateText = useCallback((id, updates) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const addText = useCallback((side) => {
    const t = newText({ side: side === "back" ? "back" : "front" });
    setTexts((prev) => [...prev, t]);
    setSelectedTextId(t.id);
  }, []);

  const removeText = useCallback((id) => {
    setTexts((prev) => prev.filter((t) => t.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  }, [selectedTextId]);

  const getCoords = useCallback((e) => {
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }, []);

  const handleDragStart = useCallback((e, textId, side) => {
    e.preventDefault();
    const t = texts.find((x) => x.id === textId);
    if (!t) return;
    setDraggingId(textId);
    const { x, y } = getCoords(e);
    dragStartRef.current = { x: t.x, y: t.y, startX: x, startY: y, side: side === "back" ? "back" : "front" };
  }, [texts, getCoords]);

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e) => {
      e.preventDefault();
      const frame = dragStartRef.current.side === "back" ? backCoverFrameRef.current : frontCoverFrameRef.current;
      const rect = frame?.getBoundingClientRect();
      if (!rect) return;
      const { x, y } = getCoords(e);
      const dx = ((x - dragStartRef.current.startX) / rect.width) * 100;
      const dy = ((y - dragStartRef.current.startY) / rect.height) * 100;
      const newX = Math.max(0, Math.min(100, dragStartRef.current.x + dx));
      const newY = Math.max(0, Math.min(100, dragStartRef.current.y + dy));
      updateText(draggingId, { x: newX, y: newY });
    };
    const onUp = () => setDraggingId(null);
    const opts = { passive: false };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, opts);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [draggingId, updateText, getCoords]);

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadCover(file);
      setSelectedPremadePath(null);
      setUploadedCoverUrl(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleSelectPremade(path) {
    if (!path) return;
    setUploadedCoverUrl(null);
    setSelectedPremadePath(path);
  }

  const autosaveTimerRef = useRef(null);
  useEffect(() => {
    if (!album) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      const cfg = buildCoverConfigPayload();
      updateAlbum(id, { cover_config: cfg }).catch((e) => {
        setError(e?.message || "שמירת הכריכה נכשלה");
      });
    }, 700);
    return () => window.clearTimeout(autosaveTimerRef.current);
  }, [id, album, buildCoverConfigPayload]);

  async function handleNext() {
    setSaving(true);
    setError(null);
    try {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      const cfg = buildCoverConfigPayload();
      const row = await updateAlbum(id, { cover_config: cfg });
      setAlbum((a) => (a && row ? { ...a, cover_config: row.cover_config ?? cfg } : a));
      navigate(`/album/${id}/pages-count`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!album) return <AlbumLoading />;

  const currentCoverUrl = resolvedCoverUrl;
  const frontTexts = texts.filter((t) => (t.side || "front") !== "back");
  const backTexts = texts.filter((t) => t.side === "back");

  return (
    <div className={styles.page}>
      <StageIndicator current={1} />
      <header className={styles.header}>
        <h1>עיצוב כריכה</h1>
        <p className={styles.sub}>בחר רקע והוסף טקסטים על הכריכה</p>
      </header>

      <div className={styles.headerInputWrap}>
        <label className={styles.headerLabel}>אימייל</label>
        <input
          type="email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          placeholder="example@email.com"
          className={styles.headerInput}
        />
      </div>

      <div className={styles.textToolbar}>
        {texts.length > 0 && (
          <p className={styles.dragHint}>לחץ על טקסט על הכריכה כדי לבחור • גרור להזזה</p>
        )}
      </div>

      <div className={styles.preview}>
        <div className={styles.coverSplit}>
          <div className={styles.coverPane}>
            <button type="button" className={`${styles.addTextBtn} ${styles.coverPaneAddBtn}`} onClick={() => addText("front")}>
              + טקסט לכריכה קדמית
            </button>
            <div ref={frontCoverFrameRef} className={styles.coverFrame}>
              {currentCoverUrl ? (
                <div
                  className={`${styles.coverFrameBg} ${styles.coverClipRight}`}
                  style={{ backgroundImage: `url("${currentCoverUrl}")` }}
                  aria-hidden
                />
              ) : null}
              <div className={styles.coverOverlay} />
              {frontTexts.map((t) => (
                <div
                  key={t.id}
                  className={
                    styles.coverTextDisplay +
                    (draggingId === t.id ? " " + styles.dragging : "") +
                    (selectedTextId === t.id ? " " + styles.selectedText : "")
                  }
                  style={{
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `${t.fontSize}px`,
                    color: isValidHex(t.color) ? t.color : DEFAULT_COLOR,
                    fontFamily: getFontStack(t.fontFamily || DEFAULT_FONT),
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedTextId(t.id);
                    handleDragStart(e, t.id, "front");
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setSelectedTextId(t.id);
                    handleDragStart(e, t.id, "front");
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedTextId(t.id);
                  }}
                  aria-label="טקסט על כריכה קדמית"
                >
                  <span className={styles.coverTitle}>
                    {t.content.trim() || "טקסט"}
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.coverPaneLabel}>כריכה קדמית</p>
          </div>

          <div className={styles.coverPane}>
            <button type="button" className={`${styles.addTextBtn} ${styles.coverPaneAddBtn}`} onClick={() => addText("back")}>
              + טקסט לכריכה אחורית
            </button>
            <div ref={backCoverFrameRef} className={styles.coverFrame}>
              {currentCoverUrl ? (
                <div
                  className={`${styles.coverFrameBg} ${styles.coverClipLeft}`}
                  style={{ backgroundImage: `url("${currentCoverUrl}")` }}
                  aria-hidden
                />
              ) : null}
              <div className={styles.coverOverlay} />
              {backTexts.map((t) => (
                <div
                  key={t.id}
                  className={
                    styles.coverTextDisplay +
                    (draggingId === t.id ? " " + styles.dragging : "") +
                    (selectedTextId === t.id ? " " + styles.selectedText : "")
                  }
                  style={{
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `${t.fontSize}px`,
                    color: isValidHex(t.color) ? t.color : DEFAULT_COLOR,
                    fontFamily: getFontStack(t.fontFamily || DEFAULT_FONT),
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedTextId(t.id);
                    handleDragStart(e, t.id, "back");
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    setSelectedTextId(t.id);
                    handleDragStart(e, t.id, "back");
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedTextId(t.id);
                  }}
                  aria-label="טקסט על כריכה אחורית"
                >
                  <span className={styles.coverTitle}>
                    {t.content.trim() || "טקסט"}
                  </span>
                </div>
              ))}
            </div>
            <p className={styles.coverPaneLabel}>כריכה אחורית</p>
          </div>
        </div>
      </div>

      {selectedText && (
        <div className={styles.textEditorPanel}>
          <h3 className={styles.textEditorTitle}>עריכת טקסט</h3>
          <div className={styles.textEditorRow}>
            <label className={styles.headerLabel}>תוכן</label>
            <input
              type="text"
              value={selectedText.content}
              onChange={(e) => updateText(selectedText.id, { content: e.target.value })}
              placeholder="הטקסט על הכריכה"
              className={styles.headerInput}
            />
          </div>
          <div className={styles.textEditorRow}>
            <label className={styles.headerLabel}>גופן</label>
            <select
              value={selectedText.fontFamily || DEFAULT_FONT}
              onChange={(e) => updateText(selectedText.id, { fontFamily: e.target.value })}
              className={styles.fontSelect}
              aria-label="בחר גופן"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.textEditorRow}>
            <label className={styles.headerLabel}>גודל</label>
            <div className={styles.sizeRow}>
              <input
                type="range"
                min={MIN_FONT}
                max={MAX_FONT}
                value={selectedText.fontSize}
                onChange={(e) => updateText(selectedText.id, { fontSize: Number(e.target.value) })}
                className={styles.sizeSlider}
              />
              <span className={styles.sizeValue}>{selectedText.fontSize}px</span>
            </div>
          </div>
          <div className={styles.textEditorRow}>
            <label className={styles.headerLabel}>צבע</label>
            <div className={styles.colorRow}>
              <input
                type="color"
                value={selectedText.color}
                onChange={(e) => updateText(selectedText.id, { color: e.target.value })}
                className={styles.colorInput}
                aria-label="בחר צבע"
              />
              <input
                type="text"
                value={selectedText.color}
                onChange={(e) => updateText(selectedText.id, { color: e.target.value.startsWith("#") ? e.target.value : "#" + e.target.value })}
                className={styles.colorHex}
                placeholder="#ffffff"
              />
            </div>
          </div>
          <button
            type="button"
            className={styles.deleteTextBtn}
            onClick={() => removeText(selectedText.id)}
          >
            מחק טקסט
          </button>
        </div>
      )}

      <section className={styles.section}>
        <h3>בחר רקע כריכה</h3>
        {premadeCovers.length > 0 && (
          <div className={styles.coverSearchWrap}>
            <input
              type="search"
              value={coverSearchQuery}
              onChange={(e) => setCoverSearchQuery(e.target.value)}
              placeholder="חפש כריכה לפי שם..."
              className={styles.coverSearchInput}
              aria-label="חיפוש כריכה לפי שם"
            />
          </div>
        )}
        {premadeCovers.length === 0 && (
          <p className={styles.hint}>אין כריכות מוכנות. העלה תמונה למטה או הוסף כריכות ל־premade-covers.</p>
        )}
        <div className={styles.options} role="group" aria-label="בחר רקע כריכה">
          {(() => {
            const getDisplayName = (c) =>
              c.name || (c.path && c.path.split("/").pop()?.replace(/\.[^.]+$/, "")) || c.path || "";
            const q = (coverSearchQuery || "").trim().toLowerCase();
            const filtered = q
              ? premadeCovers.filter((c) => getDisplayName(c).toLowerCase().includes(q))
              : premadeCovers;
            if (filtered.length === 0 && premadeCovers.length > 0) {
              return (
                <p className={styles.hint} style={{ width: "100%", marginBottom: 0 }}>
                  לא נמצאו כריכות התואמות את החיפוש.
                </p>
              );
            }
            return filtered.map((c) => {
              const url = getPremadeCoverUrl(c.path);
              const isSelected = selectedPremadePath === c.path;
              const path = c.path;
              const name = getDisplayName(c);
              return (
                <label
                  key={"premade-" + path}
                  className={styles.option + (isSelected ? " " + styles.selected : "")}
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="cover-premade"
                    value={path}
                    checked={isSelected}
                    onChange={() => path && handleSelectPremade(path)}
                    className={styles.optionRadio}
                  />
                  <img src={url} alt={name || "כריכה"} />
                  {name ? <span className={styles.coverName}>{name}</span> : null}
                </label>
              );
            });
          })()}
          <>
            <input
              ref={coverUploadInputRef}
              type="file"
              accept="image/*,image/heic,image/heif"
              onChange={handleCoverUpload}
              disabled={uploading}
              style={{ display: "none" }}
              aria-hidden
            />
            <button
              type="button"
              className={styles.option + " " + styles.upload}
              onClick={() => coverUploadInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "מעלה..." : "העלה תמונה"}
            </button>
          </>
        </div>
      </section>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={() => navigate("/")} className={styles.secondary}>ביטול</button>
        <button type="button" onClick={handleNext} disabled={saving} className={styles.cta}>
          {saving ? "שומר..." : "המשך להוספת תמונות"}
        </button>
      </div>
    </div>
  );
}
