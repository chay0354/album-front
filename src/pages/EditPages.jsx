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
} from "../api";
import styles from "./EditPages.module.css";

const DEFAULT_LAYOUT = (index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 48 + 2, y: row * 48 + 2, w: 46, h: 46, rotation: 0 };
};

function setMinimalDragImage(e) {
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:1px;height:1px;";
  document.body.appendChild(el);
  e.dataTransfer.setDragImage(el, 0, 0);
  setTimeout(() => el.remove(), 0);
}

function AlbumCover({ album, coverUrl }) {
  const cfg = album?.cover_config || {};
  return (
    <div className={styles.coverSingle} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}>
      <div className={styles.coverOverlay} />
      {cfg.headerText && (
        <div
          className={styles.coverTitleOnModel}
          style={{
            left: `${cfg.headerX ?? 50}%`,
            top: `${cfg.headerY ?? 18}%`,
            transform: "translate(-50%, -50%)",
            fontSize: `${cfg.headerFontSize ?? 28}px`,
          }}
        >
          {cfg.headerText}
        </div>
      )}
    </div>
  );
}

function PagePhotos({ photos, getPhotoUrl, onRemove, useLayout }) {
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
              <button type="button" className={styles.removeBtn} onClick={() => onRemove(p.id)} aria-label="הסר">×</button>
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
          <button type="button" className={styles.removeBtn} onClick={() => onRemove(p.id)} aria-label="הסר">×</button>
        </div>
      ))}
    </div>
  );
}

function FullScreenPageEditor({ page, pageLabel, photos, albumId, getPhotoUrl, onSave, onClose, onUploadToPage }) {
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
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
  const dragRef = useRef({ id: null, startX: 0, startY: 0, startLayout: null, dragStarted: false });

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

  const handleMouseDown = useCallback((e, photoId) => {
    e.preventDefault();
    e.stopPropagation();
    const layout = layouts[photoId] || DEFAULT_LAYOUT(0);
    dragRef.current = {
      id: photoId,
      startX: e.clientX,
      startY: e.clientY,
      startLayout: { ...layout },
      dragStarted: false,
    };
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const onMove = (e) => {
      const ref = dragRef.current;
      if (!ref.id) return;
      const dist = Math.hypot(e.clientX - ref.startX, e.clientY - ref.startY);
      if (!ref.dragStarted) {
        if (dist > 5) {
          ref.dragStarted = true;
          setDraggingId(ref.id);
        } else return;
      }
      const dx = ((e.clientX - ref.startX) / rect.width) * 100;
      const dy = ((e.clientY - ref.startY) / rect.height) * 100;
      setLayouts((prev) => {
        const l = prev[ref.id] || ref.startLayout;
        if (!l || typeof l.x !== "number") return prev;
        let x = ref.startLayout.x + dx;
        let y = ref.startLayout.y + dy;
        x = Math.max(0, Math.min(100 - l.w, x));
        y = Math.max(0, Math.min(100 - l.h, y));
        return { ...prev, [ref.id]: { ...l, x, y } };
      });
    };
    const onUp = () => {
      if (!dragRef.current.dragStarted) {
        setSelectedId(dragRef.current.id);
      }
      setDraggingId(null);
      dragRef.current.id = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [layouts]);

  async function handleSave() {
    setSaving(true);
    try {
      for (const p of photos || []) {
        if (layouts[p.id]) await updatePhotoLayout(albumId, p.id, layouts[p.id]);
      }
      onSave();
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

  function updateLayout(photoId, updates) {
    setLayouts((prev) => {
      const cur = prev[photoId] || DEFAULT_LAYOUT(0);
      return { ...prev, [photoId]: { ...cur, ...updates } };
    });
  }

  return (
    <div className={styles.fullScreenOverlay} onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}>
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
            <div className={styles.fullScreenPage} onClick={() => setSelectedId(null)}>
              {sortedPhotos.map((p) => {
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
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img src={getPhotoUrl(p.storage_path)} alt="" draggable={false} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.editorControlsCol}>
            <div className={styles.editorControls}>
              <h4>כיוונון תמונה</h4>
              {selectedLayout && selectedId && (
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
                </>
              )}
            </div>
            {onUploadToPage && (
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
                      onUploadToPage(Array.from(files)).finally(() => {
                        setUploading(false);
                        e.target.value = "";
                      });
                    }
                  }}
                  hidden
                />
                <span>{uploading ? "מעלה..." : "הוסף תמונות לעמוד"}</span>
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AlbumSpread({ leftPage, rightPage, albumId, onDrop, onRemove, onEditPage, getPhotoUrl }) {
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

  return (
    <div className={styles.spread}>
      <div className={styles.halfPageWrapper}>
        <div
          className={styles.halfPage + (dragOverLeft ? " " + styles.dragOver : "")}
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
          />
          {photosLeft.length === 0 && <span className={styles.dropHint}>גרור לכאן</span>}
        </div>
        {leftPage && (
          <button type="button" className={styles.editPageBtn} onClick={() => onEditPage(leftPage)} title="ערוך עמוד">
            ערוך עמוד
          </button>
        )}
      </div>
      <div className={styles.spine} />
      <div className={styles.halfPageWrapper}>
        <div
          className={styles.halfPage + (dragOverRight ? " " + styles.dragOver : "")}
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
          />
          {photosRight.length === 0 && rightPage && <span className={styles.dropHint}>גרור לכאן</span>}
          {!rightPage && <span className={styles.dropHint}>הוסף עמודים</span>}
        </div>
        {rightPage && (
          <button type="button" className={styles.editPageBtn} onClick={() => onEditPage(rightPage)} title="ערוך עמוד">
            ערוך עמוד
          </button>
        )}
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
              getPhotoUrl={getPhotoUrl}
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
          onUploadToPage={async (files) => {
            try {
              await uploadPhotos(id, editingPage.id, files);
              const a = await getAlbum(id);
              setAlbum(a);
              const updated = a.pages?.find((p) => p.id === editingPage.id);
              if (updated) setEditingPage(updated);
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      )}
    </div>
  );
}
