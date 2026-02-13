import { useState, useEffect, useRef, useCallback, forwardRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import HTMLFlipBook from "react-pageflip";
import { getAlbum, getBaseCovers, getPhotoUrl, getCoverUrl, getElementUrl } from "../api";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import styles from "./Preview.module.css";

const DEFAULT_LAYOUT = (index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 48 + 2, y: row * 48 + 2, w: 46, h: 46, rotation: 0 };
};

export const BOOK_WIDTH_MOBILE = 340;
export const BOOK_HEIGHT_MOBILE = 460;
export const BOOK_WIDTH_DESKTOP = 680;
export const BOOK_HEIGHT_DESKTOP = 920;

export const CoverPage = forwardRef(function CoverPage({ album, coverUrl }, ref) {
  const cfg = album?.cover_config || {};
  const texts = Array.isArray(cfg.texts) && cfg.texts.length > 0
    ? cfg.texts
    : cfg.headerText
      ? [{ content: cfg.headerText, x: cfg.headerX ?? 50, y: cfg.headerY ?? 18, fontSize: cfg.headerFontSize ?? 28, color: "#ffffff" }]
      : [];
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")` }
    : { background: "#333" };
  return (
    <div ref={ref} className={styles.flipPage}>
      <div className={styles.flipPageCover} style={coverStyle}>
        {texts.map((t, i) => (
            <div
              key={i}
              className={styles.flipPageCoverText}
              style={{
                left: `${t.x ?? 50}%`,
                top: `${t.y ?? 18}%`,
                fontSize: `clamp(12px, 3vw, ${t.fontSize ?? 28}px)`,
                color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#fff",
              }}
            >
              {t.content}
            </div>
          ))}
      </div>
    </div>
  );
});

export const BackCoverPage = forwardRef(function BackCoverPage({ coverUrl }, ref) {
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")`, backgroundPosition: "right center" }
    : { background: "#333" };
  return (
    <div ref={ref} className={styles.flipPage}>
      <div className={styles.flipPageCover + " " + styles.flipPageCoverBack} style={coverStyle} />
    </div>
  );
});

const SpreadPage = forwardRef(function SpreadPage({ leftPage, rightPage, getPhotoUrl, getElementUrl }, ref) {
  const photosLeft = (leftPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const photosRight = (rightPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const hasLayoutLeft = photosLeft.some((p) => p.layout && typeof p.layout.x === "number");
  const hasLayoutRight = photosRight.some((p) => p.layout && typeof p.layout.x === "number");
  const stickersLeft = leftPage?.page_config?.stickers || [];
  const stickersRight = rightPage?.page_config?.stickers || [];

  function Photos({ photos, useLayout }) {
    if (!photos.length) return null;
    return (
      <div className={styles.flipHalfPhotos}>
        {photos.map((p, i) => {
          const layout = p.layout && typeof p.layout.x === "number" ? p.layout : DEFAULT_LAYOUT(i);
          const rot = layout.rotation ?? 0;
          return (
            <div
              key={p.id}
              className={styles.flipHalfPhoto}
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
      <div className={styles.flipHalfStickers}>
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
              className={styles.flipHalfSticker}
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

  const leftBg = leftPage?.page_config?.backgroundColor || "#fff";
  const rightBg = rightPage?.page_config?.backgroundColor || "#fff";

  return (
    <div ref={ref} className={styles.flipPage}>
      <div className={styles.flipPageSpread}>
        <div className={styles.flipHalf} style={{ background: leftBg }}>
          <Photos photos={photosLeft} useLayout={hasLayoutLeft} />
          <Stickers stickers={stickersLeft} />
        </div>
        <div className={styles.flipHalf} style={{ background: rightBg }}>
          <Photos photos={photosRight} useLayout={hasLayoutRight} />
          <Stickers stickers={stickersRight} />
        </div>
      </div>
    </div>
  );
});

function HalfContent({ photos, stickers, texts, hasLayout, getPhotoUrl, getElementUrl }) {
  const photosList = (photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const hasLayoutPhotos = photosList.some((p) => p.layout && typeof p.layout.x === "number");
  const textsList = Array.isArray(texts) ? texts : [];
  return (
    <>
      <div className={styles.flipHalfPhotos}>
        {photosList.map((p, i) => {
          const layout = p.layout && typeof p.layout.x === "number" ? p.layout : DEFAULT_LAYOUT(i);
          const rot = layout.rotation ?? 0;
          const crop = layout?.crop && typeof layout.crop.w === "number" ? layout.crop : null;
          const hasCrop = crop && (crop.l > 0 || crop.t > 0 || crop.w < 100 || crop.h < 100);
          return (
            <div
              key={p.id}
              className={styles.flipHalfPhoto}
              style={{
                left: `${layout.x}%`,
                top: `${layout.y}%`,
                width: `${layout.w}%`,
                height: `${layout.h}%`,
                transform: rot ? `rotate(${rot}deg)` : undefined,
              }}
            >
              {hasCrop ? (
                <div className={styles.flipHalfPhotoCropWrap}>
                  <img
                    src={getPhotoUrl(p.storage_path)}
                    alt=""
                    className={styles.flipHalfPhotoCroppedImg}
                    style={{
                      width: `${(100 / crop.w) * 100}%`,
                      height: `${(100 / crop.h) * 100}%`,
                      left: `${-(crop.l / crop.w) * 100}%`,
                      top: `${-(crop.t / crop.h) * 100}%`,
                    }}
                  />
                </div>
              ) : (
                <img src={getPhotoUrl(p.storage_path)} alt="" />
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.flipHalfStickers}>
        {(stickers || []).map((s) => {
          if (!s?.path) return null;
          const x = s.x ?? 10;
          const y = s.y ?? 10;
          const w = s.w ?? 12;
          const h = s.h ?? 12;
          const rot = s.rotation ?? 0;
          return (
            <div
              key={s.id}
              className={styles.flipHalfSticker}
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
      {textsList.length > 0 && (
        <div className={styles.flipHalfTexts}>
          {textsList.map((t, i) => (
            <div
              key={t.id || i}
              className={styles.flipHalfText}
              style={{
                left: `${t.x ?? 50}%`,
                top: `${t.y ?? 25}%`,
                transform: "translate(-50%, -50%)",
                fontSize: `clamp(12px, 3vw, ${t.fontSize ?? 28}px)`,
                color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#000",
              }}
            >
              {t.content}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export const SinglePage = forwardRef(function SinglePage({ page, getPhotoUrl, getElementUrl }, ref) {
  const bg = page?.page_config?.backgroundColor || "#fff";
  const photos = page?.album_photos || [];
  const stickers = page?.page_config?.stickers || [];
  return (
    <div ref={ref} className={styles.flipPage}>
      <div className={styles.flipPageSingle}>
        <div className={styles.flipHalf} style={{ background: bg }}>
          <HalfContent
            photos={photos}
            stickers={stickers}
            texts={page?.page_config?.texts}
            hasLayout={photos.some((p) => p.layout && typeof p.layout.x === "number")}
            getPhotoUrl={getPhotoUrl}
            getElementUrl={getElementUrl}
          />
        </div>
      </div>
    </div>
  );
});

export function useMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(typeof window !== "undefined" && window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onMatch = (e) => setMobile(e.matches);
    onMatch(mq);
    mq.addEventListener("change", onMatch);
    return () => mq.removeEventListener("change", onMatch);
  }, [breakpoint]);
  return mobile;
}

export default function Preview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const bookRef = useRef(null);
  const isMobile = useMobile(768);

  useEffect(() => {
    let cancelled = false;
    getAlbum(id).then((a) => {
      if (!cancelled) setAlbum(a);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

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

  const onFlip = useCallback((e) => {
    setCurrentPage(e.data);
  }, []);

  if (!album) return <AlbumLoading />;

  const pages = album.pages || [];
  const coverUrl = coverImageUrl ?? album?.cover_config?.coverUrl ?? null;

  const totalFlipPages = 1 + pages.length + 1;
  const pageLabels = ["כריכה", ...pages.map((_, i) => `עמוד ${i + 1}`), "כריכה אחורית"];

  const bookPages = [
    <CoverPage key="cover" album={album} coverUrl={coverUrl} />,
    ...pages.map((page, i) => (
      <SinglePage
        key={i}
        page={page}
        getPhotoUrl={getPhotoUrl}
        getElementUrl={getElementUrl}
      />
    )),
    <BackCoverPage key="back" coverUrl={coverUrl} />,
  ];

  return (
    <div className={styles.page}>
      <StageIndicator current={4} />
      <header className={styles.header}>
        <h1>צפייה באלבום</h1>
      </header>

      <div className={styles.bookWrap}>
        <div className={styles.bookFrame}>
          <div className={styles.bookContainer}>
          <HTMLFlipBook
            ref={bookRef}
            width={isMobile ? BOOK_WIDTH_MOBILE : BOOK_WIDTH_DESKTOP}
            height={isMobile ? BOOK_HEIGHT_MOBILE : BOOK_HEIGHT_DESKTOP}
            size="fixed"
            showCover={true}
            drawShadow={true}
            flippingTime={600}
            usePortrait={true}
            startZIndex={0}
            useMouseEvents={false}
            swipeDistance={0}
            onFlip={onFlip}
            key={isMobile ? "mobile" : "desktop"}
          >
            {bookPages}
          </HTMLFlipBook>
          </div>
        </div>

        <div className={styles.navWrap}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => bookRef.current?.pageFlip()?.flipPrev()}
            disabled={currentPage <= 0}
            aria-label="עמוד קודם"
          >
            ‹
          </button>
          <span className={styles.viewLabel}>
            {pageLabels[currentPage] ?? ""}
          </span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => bookRef.current?.pageFlip()?.flipNext()}
            disabled={currentPage >= totalFlipPages - 1}
            aria-label="עמוד הבא"
          >
            ›
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={() => navigate(`/album/${id}/pages`)} className={styles.secondary}>
          חזרה לעריכה
        </button>
        <button type="button" onClick={() => navigate(`/album/${id}/done`)} className={styles.cta}>
          סיום
        </button>
      </div>
    </div>
  );
}
