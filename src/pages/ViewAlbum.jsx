import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getAlbumByShareToken, getBaseCovers, getPhotoUrl, getCoverUrl, getElementUrl } from "../api";
import styles from "./EditPages.module.css";

const DEFAULT_LAYOUT = (index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 48 + 2, y: row * 48 + 2, w: 46, h: 46, rotation: 0 };
};

function CoverDisplay({ album, coverUrl }) {
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

function SpreadDisplay({ leftPage, rightPage, getPhotoUrl, getElementUrl }) {
  const photosLeft = (leftPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const photosRight = (rightPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const hasLayoutLeft = photosLeft.some((p) => p.layout && typeof p.layout.x === "number");
  const hasLayoutRight = photosRight.some((p) => p.layout && typeof p.layout.x === "number");
  const stickersLeft = leftPage?.page_config?.stickers || [];
  const stickersRight = rightPage?.page_config?.stickers || [];

  function Photos({ photos, useLayout }) {
    if (!photos.length) return null;
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
            >
              <img src={getPhotoUrl(p.storage_path)} alt="" />
            </div>
          );
        })}
      </div>
    );
  }

  function Stickers({ stickers }) {
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

  return (
    <div className={styles.spread}>
      <div className={styles.halfPageWrapper}>
        <div
          className={styles.halfPage}
          style={leftPage?.page_config?.backgroundColor ? { background: leftPage.page_config.backgroundColor } : undefined}
        >
          <Photos photos={photosLeft} useLayout={hasLayoutLeft} />
          <Stickers stickers={stickersLeft} />
        </div>
      </div>
      <div className={styles.spine} />
      <div className={styles.halfPageWrapper}>
        <div
          className={styles.halfPage}
          style={rightPage?.page_config?.backgroundColor ? { background: rightPage.page_config.backgroundColor } : undefined}
        >
          <Photos photos={photosRight} useLayout={hasLayoutRight} />
          <Stickers stickers={stickersRight} />
        </div>
      </div>
    </div>
  );
}

export default function ViewAlbum() {
  const { token } = useParams();
  const [album, setAlbum] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAlbumByShareToken(token)
      .then((a) => {
        if (!cancelled) setAlbum(a);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "אלבום לא נמצא");
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!album?.cover_id) {
      if (album?.cover_config?.coverUrl) setCoverImageUrl(album.cover_config.coverUrl);
      else setCoverImageUrl(null);
      return;
    }
    getBaseCovers()
      .then((list) => {
        const c = list?.find((x) => x.id === album.cover_id);
        setCoverImageUrl(c ? getCoverUrl(c.storage_path) : null);
      })
      .catch(() => setCoverImageUrl(null));
  }, [album?.cover_id, album?.cover_config?.coverUrl]);

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <p className={styles.error}>{error}</p>
          <Link to="/">לדף הבית</Link>
        </div>
      </div>
    );
  }

  if (!album) return <div className={styles.center}><span className={styles.spinner} /></div>;

  const pages = album.pages || [];
  const spreadCount = Math.max(1, Math.ceil(pages.length / 2));
  const viewCount = 1 + spreadCount;
  const currentSpreadIndex = viewIndex === 0 ? 0 : viewIndex - 1;
  const leftPage = pages[currentSpreadIndex * 2] || null;
  const rightPage = pages[currentSpreadIndex * 2 + 1] || null;
  const coverUrl = coverImageUrl ?? album?.cover_config?.coverUrl ?? null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>צפייה באלבום</h1>
        <p className={styles.sub}>אלבום משותף – עיינו בעמודים</p>
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
            <CoverDisplay album={album} coverUrl={coverUrl} />
          ) : (
            <SpreadDisplay leftPage={leftPage} rightPage={rightPage} getPhotoUrl={getPhotoUrl} getElementUrl={getElementUrl} />
          )}
        </div>
      </div>

      <div className={styles.actions} style={{ marginTop: "1.5rem" }}>
        <Link to="/" className={styles.secondary} style={{ padding: "0.6rem 1rem", borderRadius: "var(--radius)", border: "1px solid var(--surface2)", background: "var(--surface)", fontSize: "0.95rem", textDecoration: "none", color: "inherit" }}>
          לדף הבית
        </Link>
      </div>
    </div>
  );
}
