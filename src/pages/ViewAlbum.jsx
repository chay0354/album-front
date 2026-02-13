import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import HTMLFlipBook from "react-pageflip";
import { getAlbumByShareToken, getBaseCovers, getPhotoUrl, getCoverUrl, getElementUrl } from "../api";
import AlbumLoading from "../components/AlbumLoading";
import {
  CoverPage,
  BackCoverPage,
  SinglePage,
  useMobile,
  BOOK_WIDTH_MOBILE,
  BOOK_HEIGHT_MOBILE,
  BOOK_WIDTH_DESKTOP,
  BOOK_HEIGHT_DESKTOP,
} from "./Preview";
import styles from "./Preview.module.css";

export default function ViewAlbum() {
  const { token } = useParams();
  const [album, setAlbum] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState(null);
  const bookRef = useRef(null);
  const isMobile = useMobile(768);

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
    setCurrentPage(e.data);
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
    </div>
  );
}
