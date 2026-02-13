import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAlbum, updateAlbum, getPremadeCoverList, uploadCover, getPremadeCoverUrl } from "../api";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import styles from "./EditCover.module.css";

const MIN_FONT = 14;
const MAX_FONT = 52;
const DEFAULT_X = 50;
const DEFAULT_Y = 18;
const DEFAULT_FONT_SIZE = 28;
const DEFAULT_COLOR = "#ffffff";

function isValidHex(s) {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function newText(overrides = {}) {
  return {
    id: "t" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    content: "",
    x: DEFAULT_X,
    y: DEFAULT_Y,
    fontSize: DEFAULT_FONT_SIZE,
    color: DEFAULT_COLOR,
    ...overrides,
  };
}

function loadTextsFromConfig(cfg) {
  if (cfg.texts && Array.isArray(cfg.texts) && cfg.texts.length > 0) {
    return cfg.texts.map((t, i) => ({
      ...t,
      id: t.id || "t-" + i + "-" + Math.random().toString(36).slice(2, 8),
      color: t.color || DEFAULT_COLOR,
    }));
  }
  if (cfg.headerText) {
    return [newText({
      content: cfg.headerText,
      x: typeof cfg.headerX === "number" ? cfg.headerX : DEFAULT_X,
      y: typeof cfg.headerY === "number" ? cfg.headerY : DEFAULT_Y,
      fontSize: typeof cfg.headerFontSize === "number" ? cfg.headerFontSize : DEFAULT_FONT_SIZE,
      color: DEFAULT_COLOR,
    })];
  }
  return [];
}

export default function EditCover() {
  const { id } = useParams();
  const navigate = useNavigate();
  const coverFrameRef = useRef(null);
  const coverUploadInputRef = useRef(null);
  const [album, setAlbum] = useState(null);
  const [premadeCovers, setPremadeCovers] = useState([]);
  const [texts, setTexts] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [selectedPremadePath, setSelectedPremadePath] = useState(null);
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

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

  const updateText = useCallback((id, updates) => {
    setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const addText = useCallback(() => {
    const t = newText();
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

  const handleDragStart = useCallback((e, textId) => {
    e.preventDefault();
    const t = texts.find((x) => x.id === textId);
    if (!t) return;
    setDraggingId(textId);
    const { x, y } = getCoords(e);
    dragStartRef.current = { x: t.x, y: t.y, startX: x, startY: y };
  }, [texts, getCoords]);

  useEffect(() => {
    if (!draggingId) return;
    const frame = coverFrameRef.current;
    const onMove = (e) => {
      e.preventDefault();
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

  async function handleNext() {
    setSaving(true);
    setError(null);
    try {
      const coverUrl = uploadedCoverUrl || (selectedPremadePath ? getPremadeCoverUrl(selectedPremadePath) : null);
      await updateAlbum(id, {
        cover_config: {
          userEmail,
          coverUrl: coverUrl || undefined,
          texts: texts.filter((t) => t.content.trim() !== "").map(({ id: _id, ...t }) => t),
        },
      });
      navigate(`/album/${id}/pages-count`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!album) return <AlbumLoading />;

  const currentCoverUrl = uploadedCoverUrl || (selectedPremadePath ? getPremadeCoverUrl(selectedPremadePath) : null);
  const customCoverUrl = currentCoverUrl; // alias so any reference to customCoverUrl works

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
        <button type="button" className={styles.addTextBtn} onClick={addText}>
          + הוסף טקסט
        </button>
        {texts.length > 0 && (
          <p className={styles.dragHint}>לחץ על טקסט על הכריכה כדי לבחור • גרור להזזה</p>
        )}
      </div>

      <div className={styles.preview}>
        <div ref={coverFrameRef} className={styles.coverFrame}>
          {currentCoverUrl ? (
            <div
              className={styles.coverFrameBg}
              style={{ backgroundImage: `url("${currentCoverUrl}")` }}
              aria-hidden
            />
          ) : null}
          <div className={styles.coverOverlay} />
          {texts.map((t) => (
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
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedTextId(t.id);
                handleDragStart(e, t.id);
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setSelectedTextId(t.id);
                handleDragStart(e, t.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelectedTextId(t.id);
              }}
              aria-label="טקסט על הכריכה"
            >
              <span className={styles.coverTitle}>
                {t.content.trim() || "טקסט"}
              </span>
            </div>
          ))}
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
        {premadeCovers.length === 0 && (
          <p className={styles.hint}>אין כריכות מוכנות. העלה תמונה למטה או הוסף כריכות ל־premade-covers.</p>
        )}
        <div className={styles.options} role="group" aria-label="בחר רקע כריכה">
          {premadeCovers.map((c) => {
            const url = getPremadeCoverUrl(c.path);
            const isSelected = selectedPremadePath === c.path;
            const path = c.path;
            const name = c.name || (path && path.split("/").pop()?.replace(/\.[^.]+$/, "")) || path || "";
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
          })}
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
