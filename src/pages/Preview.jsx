import { useState, useEffect, useRef, useCallback, forwardRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import HTMLFlipBook from "react-pageflip";
import { getAlbum, getBaseCovers, getPhotoUrl, getCoverUrl, getElementUrl } from "../api";
import { getFontStack } from "../constants/fonts";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import { getMyglobyCheckoutUrl } from "../myglobyCheckout";
import styles from "./Preview.module.css";

const DEFAULT_LAYOUT = (index) => {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: col * 48 + 2, y: row * 48 + 2, w: 46, h: 46, rotation: 0 };
};

export const BOOK_WIDTH_MOBILE = 340;
export const BOOK_HEIGHT_MOBILE = 481; /* A4: 340 * (297/210) */
export const BOOK_WIDTH_DESKTOP = 680;
export const BOOK_HEIGHT_DESKTOP = 481; /* A4 per half: (680/2) * (297/210) */
const EDITOR_PAGE_WIDTH = 420;
const VIEWER_HALF_WIDTH = BOOK_WIDTH_DESKTOP / 2;
const VIEWER_TEXT_SCALE = VIEWER_HALF_WIDTH / EDITOR_PAGE_WIDTH;
const COVER_FRONT_START = 0;
const COVER_FRONT_END = 48;
const COVER_BACK_START = 52;
const COVER_BACK_END = 100;

function getCoverTexts(cfg) {
  return Array.isArray(cfg.texts) && cfg.texts.length > 0
    ? cfg.texts
    : cfg.headerText
      ? [{ content: cfg.headerText, x: cfg.headerX ?? 50, y: cfg.headerY ?? 18, fontSize: cfg.headerFontSize ?? 28, color: "#ffffff" }]
      : [];
}

function projectTextToCoverSide(text, sideStart, sideEnd) {
  const span = sideEnd - sideStart;
  if (span <= 0) return null;
  const parsed = Number(text?.x);
  const x = Number.isFinite(parsed) ? parsed : 50;
  if (x < sideStart || x > sideEnd) return null;
  const sideX = ((x - sideStart) / span) * 100;
  return { ...text, x: Math.max(0, Math.min(100, sideX)) };
}

function normalizeCoverTextForSide(text, side) {
  const sideStart = side === "back" ? COVER_BACK_START : COVER_FRONT_START;
  const sideEnd = side === "back" ? COVER_BACK_END : COVER_FRONT_END;
  const rawSide = typeof text?.side === "string" ? text.side.toLowerCase() : "";
  const explicitSide = rawSide === "back" ? "back" : rawSide === "front" ? "front" : null;
  const parsed = Number(text?.x);
  const x = Number.isFinite(parsed) ? parsed : 50;
  const inferredSide = x >= COVER_BACK_START ? "back" : x <= COVER_FRONT_END ? "front" : "front";
  const effectiveSide = explicitSide || inferredSide;

  if (effectiveSide !== side) return null;

  const ranged = projectTextToCoverSide(text, sideStart, sideEnd);
  if (ranged) return ranged;

  // Support local-per-side saved coords (0..100) for older payloads.
  if (Number.isFinite(x) && x >= 0 && x <= 100) {
    return { ...text, x };
  }

  return null;
}

export const CoverPage = forwardRef(function CoverPage({ album, coverUrl }, ref) {
  const cfg = album?.cover_config || {};
  const texts = getCoverTexts(cfg)
    .map((t) => normalizeCoverTextForSide(t, "front"))
    .filter(Boolean);
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")` }
    : { background: "#333" };
  return (
    <div ref={ref} className={styles.flipPage + " " + styles.coverPage}>
      <div className={styles.flipPageCover + " " + styles.coverClipRight} style={coverStyle}>
        {texts.map((t, i) => {
            const designSize = t.fontSize ?? 28;
            const viewerSize = Math.max(12, Math.round(designSize * VIEWER_TEXT_SCALE));
            return (
              <div
                key={i}
                className={styles.flipPageCoverText}
                style={{
                  left: `${t.x ?? 50}%`,
                  top: `${t.y ?? 18}%`,
                  fontSize: `${viewerSize}px`,
                  color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#fff",
                  fontFamily: getFontStack(t.fontFamily),
                }}
              >
                {t.content}
              </div>
            );
          })}
      </div>
    </div>
  );
});

export const BackCoverPage = forwardRef(function BackCoverPage({ album, coverUrl }, ref) {
  const cfg = album?.cover_config || {};
  const texts = getCoverTexts(cfg)
    .map((t) => normalizeCoverTextForSide(t, "back"))
    .filter(Boolean);
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")`, backgroundPosition: "right center" }
    : { background: "#333" };
  return (
    <div ref={ref} className={styles.flipPage + " " + styles.coverPage + " " + styles.backCoverPage}>
      <div className={styles.flipPageCover + " " + styles.flipPageCoverBack + " " + styles.coverClipLeft} style={coverStyle}>
        {texts.map((t, i) => {
          const designSize = t.fontSize ?? 28;
          const viewerSize = Math.max(12, Math.round(designSize * VIEWER_TEXT_SCALE));
          return (
            <div
              key={i}
              className={styles.flipPageCoverText}
              style={{
                left: `${t.x ?? 50}%`,
                top: `${t.y ?? 18}%`,
                fontSize: `${viewerSize}px`,
                color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#fff",
                fontFamily: getFontStack(t.fontFamily),
              }}
            >
              {t.content}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/** Standalone cover image (not in the flip book) – full height, no library cropping */
export function StandaloneCover({ album, coverUrl }) {
  const cfg = album?.cover_config || {};
  const texts = getCoverTexts(cfg)
    .map((t) => projectTextToCoverSide(t, COVER_FRONT_START, COVER_FRONT_END))
    .filter(Boolean);
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")` }
    : { background: "#333" };
  return (
    <div className={styles.standaloneCoverPane}>
      {coverUrl && (
        <div
          className={styles.standaloneCoverPaneBg + " " + styles.standaloneCoverPaneClipFront}
          style={coverStyle}
          aria-hidden
        />
      )}
      <div className={styles.standaloneCoverPaneOverlay} />
      {texts.map((t, i) => (
        <div
          key={i}
          className={styles.standaloneCoverPaneText}
          style={{
            left: `${t.x ?? 50}%`,
            top: `${t.y ?? 18}%`,
            transform: "translate(-50%, -50%)",
            fontSize: `${t.fontSize ?? 28}px`,
            color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#fff",
            fontFamily: getFontStack(t.fontFamily),
          }}
        >
          <span className={styles.standaloneCoverPaneTextInner}>
            {(typeof t.content === "string" ? t.content.trim() : "") || "טקסט"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Standalone back cover (not in the flip book) – same frame as front, right 48% of image */
export function StandaloneBackCover({ album, coverUrl }) {
  const cfg = album?.cover_config || {};
  const texts = getCoverTexts(cfg)
    .map((t) => projectTextToCoverSide(t, COVER_BACK_START, COVER_BACK_END))
    .filter(Boolean);
  const coverStyle = coverUrl
    ? { backgroundImage: `url("${coverUrl}")` }
    : { background: "#333" };
  return (
    <div className={styles.standaloneCoverPane}>
      {coverUrl && (
        <div
          className={styles.standaloneCoverPaneBg + " " + styles.standaloneCoverPaneClipBack}
          style={coverStyle}
          aria-hidden
        />
      )}
      <div className={styles.standaloneCoverPaneOverlay} />
      {texts.map((t, i) => (
        <div
          key={i}
          className={styles.standaloneCoverPaneText}
          style={{
            left: `${t.x ?? 50}%`,
            top: `${t.y ?? 18}%`,
            transform: "translate(-50%, -50%)",
            fontSize: `${t.fontSize ?? 28}px`,
            color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#fff",
            fontFamily: getFontStack(t.fontFamily),
          }}
        >
          <span className={styles.standaloneCoverPaneTextInner}>
            {(typeof t.content === "string" ? t.content.trim() : "") || "טקסט"}
          </span>
        </div>
      ))}
    </div>
  );
}

const SpreadPage = forwardRef(function SpreadPage({ leftPage, rightPage, getPhotoUrl, getElementUrl }, ref) {
  const leftBg = leftPage?.page_config?.backgroundColor || "#fff";
  const rightBg = rightPage?.page_config?.backgroundColor || "#fff";
  const photosLeft = (leftPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const photosRight = (rightPage?.album_photos || []).sort((a, b) => a.photo_order - b.photo_order);
  const hasLayoutLeft = photosLeft.some((p) => p.layout && typeof p.layout.x === "number");
  const hasLayoutRight = photosRight.some((p) => p.layout && typeof p.layout.x === "number");

  return (
    <div ref={ref} className={styles.flipPage}>
      <div className={styles.flipPageSpread}>
        <div className={styles.flipHalf} style={{ background: leftBg }}>
          <HalfContent
            photos={leftPage?.album_photos || []}
            stickers={leftPage?.page_config?.stickers || []}
            texts={leftPage?.page_config?.texts}
            hasLayout={hasLayoutLeft}
            getPhotoUrl={getPhotoUrl}
            getElementUrl={getElementUrl}
          />
        </div>
        <div className={styles.spine} aria-hidden />
        <div className={styles.flipHalf} style={{ background: rightBg }}>
          <HalfContent
            photos={rightPage?.album_photos || []}
            stickers={rightPage?.page_config?.stickers || []}
            texts={rightPage?.page_config?.texts}
            hasLayout={hasLayoutRight}
            getPhotoUrl={getPhotoUrl}
            getElementUrl={getElementUrl}
          />
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
          {textsList.map((t, i) => {
            const designSize = t.fontSize ?? 28;
            const viewerSize = Math.round(designSize * VIEWER_TEXT_SCALE);
            return (
              <div
                key={t.id || i}
                className={styles.flipHalfText}
                style={{
                  left: `${t.x ?? 50}%`,
                  top: `${t.y ?? 25}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: `${Math.max(12, viewerSize)}px`,
                  color: /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : "#000",
                  fontFamily: getFontStack(t.fontFamily),
                }}
              >
                {t.content}
              </div>
            );
          })}
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
  const [bookScale, setBookScale] = useState(1);
  const [initialBookStartPage, setInitialBookStartPage] = useState(null);
  const bookRef = useRef(null);
  const bookFrameRef = useRef(null);
  const totalFlipPagesRef = useRef(2);
  const isMobile = useMobile(768);
  const pagesLength = album?.pages?.length ?? 0;

  useEffect(() => {
    const el = bookFrameRef.current;
    if (!el) return;
    const updateScale = () => {
      const { width: boxW, height: boxH } = el.getBoundingClientRect();
      if (boxW <= 0 || boxH <= 0) return;
      const isStandaloneFrame = currentPage === 0 || currentPage === pagesLength + 1;
      const bookW = isStandaloneFrame ? BOOK_WIDTH_MOBILE : (isMobile ? BOOK_WIDTH_MOBILE : BOOK_WIDTH_DESKTOP);
      const bookH = BOOK_HEIGHT_MOBILE;
      const scale = Math.max(0.1, Math.min(boxW / bookW, boxH / bookH, 1));
      setBookScale(scale);
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, currentPage, pagesLength]);

  // Clear initialBookStartPage when navigating within the book, but NOT when on the last inner
  // page (totalFlipPages - 2). Clearing there would pass startPage=0 and can leave the book
  // out of sync so the next Prev gets stuck.
  useEffect(() => {
    if (currentPage >= 1 && currentPage < pagesLength && initialBookStartPage != null) {
      setInitialBookStartPage(null);
    }
  }, [currentPage, pagesLength, initialBookStartPage]);

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
    setCurrentPage(e.data + 1);
  }, []);

  if (!album) return <AlbumLoading />;

  const pages = album.pages || [];
  const coverUrl = coverImageUrl ?? album?.cover_config?.coverUrl ?? null;

  const blankPageNumbers = pages
    .map((p, i) => {
      const hasPhotos = (p?.album_photos?.length ?? 0) > 0;
      const hasTexts = (p?.page_config?.texts?.length ?? 0) > 0;
      const hasStickers = (p?.page_config?.stickers?.length ?? 0) > 0;
      return hasPhotos || hasTexts || hasStickers ? null : i + 1;
    })
    .filter((n) => n != null);

  const totalFlipPages = 1 + pages.length + 1;
  const pageLabels = [
    "כריכה",
    ...pages.map((_, i) =>
      isMobile
        ? `עמוד ${i + 1}`
        : (() => {
            const pair = Math.floor(i / 2) * 2;
            const a = pair + 1;
            const b = pair + 2;
            return b <= pages.length ? `עמודים ${a}–${b}` : `עמוד ${a}`;
          })()
    ),
    "כריכה אחורית",
  ];

  const swappedPageIndices = [];
  for (let i = 0; i < pages.length; i++) {
    if (i % 2 === 0 && i + 1 < pages.length) {
      swappedPageIndices.push(i + 1, i);
    } else if (i % 2 === 0) {
      swappedPageIndices.push(i);
    }
  }
  const innerPageIndices = isMobile ? pages.map((_, i) => i) : swappedPageIndices;
  const bookPages = [
    ...innerPageIndices.map((idx) => (
      <SinglePage
        key={idx}
        page={pages[idx]}
        getPhotoUrl={getPhotoUrl}
        getElementUrl={getElementUrl}
      />
    )),
  ];

  totalFlipPagesRef.current = totalFlipPages;
  const isStandaloneCover = currentPage === 0;
  const isStandaloneBack = currentPage === totalFlipPages - 1;

  return (
    <div className={styles.page}>
      <StageIndicator current={4} />

      <div className={styles.bookWrap + (isStandaloneCover || isStandaloneBack ? " " + styles.bookWrapStandaloneCover : "")}>
        <div
          ref={bookFrameRef}
          className={styles.bookFrame + (isStandaloneCover || isStandaloneBack ? " " + styles.standaloneCoverFrame : "")}
        >
          {isStandaloneCover ? (
            <StandaloneCover album={album} coverUrl={coverUrl} />
          ) : isStandaloneBack ? (
            <StandaloneBackCover key="standalone-back" album={album} coverUrl={coverUrl} />
          ) : (
            <div
              className={styles.bookContainer}
              style={{
                transform: `scale(${bookScale})`,
                transformOrigin: "top center",
              }}
            >
              <HTMLFlipBook
                ref={bookRef}
                width={isMobile ? BOOK_WIDTH_MOBILE : BOOK_WIDTH_DESKTOP / 2}
                height={isMobile ? BOOK_HEIGHT_MOBILE : BOOK_HEIGHT_DESKTOP}
                size="fixed"
                showCover={false}
                drawShadow={true}
                flippingTime={600}
                usePortrait={isMobile}
                startZIndex={0}
                useMouseEvents={isMobile}
                swipeDistance={isMobile ? 30 : 0}
                onFlip={onFlip}
                startPage={initialBookStartPage != null ? initialBookStartPage : 0}
                key={isMobile ? "mobile" : "desktop"}
              >
                {bookPages}
              </HTMLFlipBook>
            </div>
          )}
        </div>

        <div className={styles.navWrap}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => {
              if (currentPage === 1) setCurrentPage(0);
              else if (currentPage === totalFlipPages - 1) {
                setCurrentPage(totalFlipPages - 2);
                setInitialBookStartPage(totalFlipPages - 3);
              } else bookRef.current?.pageFlip()?.flipPrev();
            }}
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
            onClick={() => {
              const total = totalFlipPagesRef.current;
              if (currentPage === 0) {
                setCurrentPage(1);
                return;
              }
              if (currentPage >= total - 1) return;
              if (currentPage >= total - 3) {
                setCurrentPage(total - 1);
                return;
              }
              bookRef.current?.pageFlip()?.flipNext();
            }}
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
        <button
          type="button"
          onClick={() => {
            // Do NOT open the payment tab here — it must open only after the PDF finishes saving.
            navigate(`/album/${id}/pages`, { state: { openPdfFinish: true } });
          }}
          className={styles.cta}
        >
          המשך לתשלום
        </button>
      </div>

      {blankPageNumbers.length > 0 && (
        <p className={styles.blankNotice} role="status">
          יש {blankPageNumbers.length === 1 ? "עמוד אחד" : `${blankPageNumbers.length} עמודים`} ללא תוכן
          {blankPageNumbers.length <= 5
            ? ` (עמוד ${blankPageNumbers.join(", ")})`
            : ` (עמודים ${blankPageNumbers.slice(0, 3).join(", ")} ועוד)`}
          . אפשר להוסיף תמונות או טקסט בעריכה.
        </p>
      )}
    </div>
  );
}
