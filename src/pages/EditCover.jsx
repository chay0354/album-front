import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAlbum, updateAlbum, getBaseCovers, uploadCover, getCoverUrl } from "../api";
import styles from "./EditCover.module.css";

const DEFAULT_HEADER_X = 50;
const DEFAULT_HEADER_Y = 18;
const DEFAULT_HEADER_FONT_SIZE = 28;
const MIN_FONT = 14;
const MAX_FONT = 52;

export default function EditCover() {
  const { id } = useParams();
  const navigate = useNavigate();
  const coverFrameRef = useRef(null);
  const [album, setAlbum] = useState(null);
  const [baseCovers, setBaseCovers] = useState([]);
  const [headerText, setHeaderText] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [headerX, setHeaderX] = useState(DEFAULT_HEADER_X);
  const [headerY, setHeaderY] = useState(DEFAULT_HEADER_Y);
  const [headerFontSize, setHeaderFontSize] = useState(DEFAULT_HEADER_FONT_SIZE);
  const [selectedCover, setSelectedCover] = useState(null);
  const [customCoverUrl, setCustomCoverUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

  useEffect(() => {
    getAlbum(id).then((a) => {
      setAlbum(a);
      const cfg = a.cover_config || {};
      setHeaderText(cfg.headerText || "");
      setUserEmail(cfg.userEmail || "");
      setHeaderX(typeof cfg.headerX === "number" ? cfg.headerX : DEFAULT_HEADER_X);
      setHeaderY(typeof cfg.headerY === "number" ? cfg.headerY : DEFAULT_HEADER_Y);
      setHeaderFontSize(typeof cfg.headerFontSize === "number" ? cfg.headerFontSize : DEFAULT_HEADER_FONT_SIZE);
      setSelectedCover(a.cover_id || null);
      setCustomCoverUrl(cfg.coverUrl || null);
    }).catch((e) => setError(e.message));
    getBaseCovers().then(setBaseCovers).catch(() => setBaseCovers([]));
  }, [id]);

  const handleDragStart = useCallback((e) => {
    if (!headerText) return;
    e.preventDefault();
    setDragging(true);
    dragStartRef.current = {
      x: headerX,
      y: headerY,
      startX: e.clientX,
      startY: e.clientY,
    };
  }, [headerText, headerX, headerY]);

  useEffect(() => {
    if (!dragging) return;
    const frame = coverFrameRef.current;
    const onMove = (e) => {
      const rect = frame?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100;
      setHeaderX(Math.max(0, Math.min(100, dragStartRef.current.x + dx)));
      setHeaderY(Math.max(0, Math.min(100, dragStartRef.current.y + dy)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadCover(file);
      setCustomCoverUrl(url);
      setSelectedCover(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function coverImage(c) {
    if (c?.storage_path) return getCoverUrl(c.storage_path);
    return null;
  }

  async function handleNext() {
    setSaving(true);
    setError(null);
    try {
      await updateAlbum(id, {
        cover_id: selectedCover || null,
        cover_config: {
          headerText,
          userEmail,
          headerX,
          headerY,
          headerFontSize,
          coverUrl: customCoverUrl || undefined,
        },
      });
      navigate(`/album/${id}/pages`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!album) return <div className={styles.center}><span className={styles.spinner} /></div>;

  const currentCoverUrl = customCoverUrl || (selectedCover && coverImage(baseCovers.find((c) => c.id === selectedCover)));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>עיצוב כריכה</h1>
        <p className={styles.sub}>בחר רקע כריכה והוסף כותרת</p>
      </header>

      <div className={styles.headerInputWrap}>
        <label className={styles.headerLabel}>כותרת על הכריכה</label>
        <input
          type="text"
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          placeholder="כותרת האלבום"
          className={styles.headerInput}
        />
      </div>

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

      <div className={styles.sizeRow}>
        <label className={styles.headerLabel}>גודל הכותרת</label>
        <input
          type="range"
          min={MIN_FONT}
          max={MAX_FONT}
          value={headerFontSize}
          onChange={(e) => setHeaderFontSize(Number(e.target.value))}
          className={styles.sizeSlider}
        />
        <span className={styles.sizeValue}>{headerFontSize}px</span>
      </div>
      <p className={styles.dragHint}>גרור את הכותרת על הכריכה כדי להזיז אותה</p>

      <div className={styles.preview}>
        <div
          ref={coverFrameRef}
          className={styles.coverFrame}
          style={currentCoverUrl ? { backgroundImage: `url(${currentCoverUrl})` } : {}}
        >
          <div className={styles.coverOverlay} />
          {headerText ? (
            <div
              className={styles.coverTextDisplay + (dragging ? " " + styles.dragging : "")}
              style={{
                left: `${headerX}%`,
                top: `${headerY}%`,
                transform: "translate(-50%, -50%)",
                fontSize: `${headerFontSize}px`,
              }}
              onMouseDown={handleDragStart}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleDragStart(e)}
              aria-label="גרור להזזת הכותרת"
            >
              <span className={styles.coverTitle}>{headerText}</span>
            </div>
          ) : null}
        </div>
      </div>

      <section className={styles.section}>
        <h3>בחר רקע כריכה</h3>
        <div className={styles.options}>
          {baseCovers.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.option + (selectedCover === c.id ? " " + styles.selected : "")}
              onClick={() => { setSelectedCover(c.id); setCustomCoverUrl(null); }}
            >
              <img src={getCoverUrl(c.storage_path)} alt="" />
            </button>
          ))}
          <label className={styles.option + styles.upload}>
            <input type="file" accept="image/*" onChange={handleCoverUpload} disabled={uploading} hidden />
            {uploading ? "מעלה..." : "העלה תמונה"}
          </label>
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
