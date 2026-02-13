import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getAlbum, updateAlbum, getPdfDownloadUrl } from "../api";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import styles from "./Done.module.css";

function ensureShareToken(album) {
  if (album?.share_token) return album.share_token;
  const token = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return token;
}

export default function Done() {
  const { id } = useParams();
  const [album, setAlbum] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  const pdfUrl = id ? getPdfDownloadUrl(id) : "";

  useEffect(() => {
    let cancelled = false;
    getAlbum(id)
      .then((a) => {
        if (cancelled) return;
        setAlbum(a);
        if (!a.share_token) {
          const token = ensureShareToken(a);
          updateAlbum(id, { share_token: token })
            .then((updated) => {
              if (!cancelled) {
                setAlbum(updated);
                setShareUrl(`${window.location.origin}/view/${updated.share_token}`);
              }
            })
            .catch(() => {
              if (!cancelled) setShareUrl(`${window.location.origin}/view/${token}`);
            });
        } else {
          setShareUrl(`${window.location.origin}/view/${a.share_token}`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (album?.share_token && !shareUrl)
      setShareUrl(`${window.location.origin}/view/${album.share_token}`);
  }, [album?.share_token, shareUrl]);

  if (!album) return <AlbumLoading />;

  return (
    <div className={styles.page}>
      <StageIndicator current={5} />
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1>האלבום מוכן!</h1>
        <p className={styles.sub}>הורד את האלבום כקובץ PDF לשמירה או הדפסה.</p>
        <a href={pdfUrl} download="album.pdf" className={styles.cta}>
          הורד PDF
        </a>
        {shareUrl && (
          <div className={styles.shareSection}>
            <p className={styles.shareLabel}>קישור לשיתוף – כל מי שישלחו לו את הקישור יוכל לצפות באלבום:</p>
            <div className={styles.shareRow}>
              <input type="text" readOnly value={shareUrl} className={styles.shareInput} aria-label="קישור שיתוף" />
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl);
                }}
              >
                העתק
              </button>
            </div>
          </div>
        )}
        <div className={styles.links}>
          <Link to={`/album/${id}/preview`}>צפייה באלבום</Link>
          <Link to={`/album/${id}/pages`}>עריכת תמונות</Link>
          <Link to={`/album/${id}/cover`}>עריכת כריכה</Link>
          <Link to="/">חזרה לדף הבית</Link>
        </div>
      </div>
    </div>
  );
}
