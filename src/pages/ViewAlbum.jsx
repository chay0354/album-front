import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import HTMLFlipBook from "react-pageflip";
import { getAlbumByShareToken, getBaseCovers, getPhotoUrl, getCoverUrl, getElementUrl, createAlbumFromShareToken } from "../api";
import AlbumLoading from "../components/AlbumLoading";
import {
  StandaloneCover,
  StandaloneBackCover,
  SinglePage,
  useMobile,
  BOOK_WIDTH_MOBILE,
  BOOK_HEIGHT_MOBILE,
  BOOK_WIDTH_DESKTOP,
  BOOK_HEIGHT_DESKTOP,
} from "./Preview";
import StageIndicator from "../components/StageIndicator";
import styles from "./Preview.module.css";

export default function ViewAlbum() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState(null);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneError, setCloneError] = useState(null);
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

  useEffect(() => {
    // Don't clear when on last inner page (totalFlipPages - 2) so next Prev doesn't get stuck
    if (currentPage >= 1 && currentPage < pagesLength && initialBookStartPage != null) {
      setInitialBookStartPage(null);
    }
  }, [currentPage, pagesLength, initialBookStartPage]);

  const handleGetForMyself = useCallback(() => {
    setCloneError(null);
    setCloneLoading(true);
    createAlbumFromShareToken(token)
      .then((newAlbum) => {
        navigate(`/album/${newAlbum.id}/cover`, { replace: true });
      })
      .catch((e) => {
        setCloneLoading(false);
        setCloneError(e?.message || "לא ניתן ליצור עותק");
      });
  }, [token, navigate]);

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

  const onFlip = useCallback((e) => {
    setCurrentPage(e.data + 1);
  }, []);

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.center} style={{ flexDirection: "column", gap: "1rem" }}>
          <p className={styles.error}>{error}</p>
          <Link to="/" className={styles.secondary}>
            לדף הבית
          </Link>
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className={styles.page}>
        <AlbumLoading label="טוען את האלבום..." />
      </div>
    );
  }

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
            <div
              className={styles.standaloneCoverWrap}
              style={{
                transform: `scale(${bookScale})`,
                transformOrigin: "top center",
              }}
            >
              <StandaloneCover album={album} coverUrl={coverUrl} />
            </div>
          ) : isStandaloneBack ? (
            <div
              key="standalone-back"
              className={styles.standaloneCoverWrap + " " + styles.standaloneCoverWrapBack}
              style={{
                transform: `scale(${bookScale})`,
                transformOrigin: "top center",
              }}
            >
              <StandaloneBackCover album={album} coverUrl={coverUrl} />
            </div>
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
        <button
          type="button"
          className={styles.cta}
          onClick={handleGetForMyself}
          disabled={cloneLoading}
        >
          {cloneLoading ? "יוצר עותק..." : "לקבל את האלבום שלי"}
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
      {cloneError && <p className={styles.error}>{cloneError}</p>}
    </div>
  );
}
