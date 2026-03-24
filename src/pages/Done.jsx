import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { getAlbum, updateAlbum } from "../api";
import { getLocalPdfBlob } from "../pdfLocalCache";
import { peekPdfDataUrlFromSession, peekPdfBlobUrlFromSession } from "../pdfSessionBridge";
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
  const { state } = useLocation();
  const idbObjectUrlRef = useRef(null);
  const [album, setAlbum] = useState(null);
  const [shareUrl, setShareUrl] = useState("");
  /** data: or blob: URL for download */
  const [pdfHref, setPdfHref] = useState(null);
  /** loading | ready | missing */
  const [pdfStatus, setPdfStatus] = useState("loading");

  useLayoutEffect(() => {
    if (!id) return;
    const fromNav = state?.pdfBlobUrl;
    if (fromNav && typeof fromNav === "string" && fromNav.startsWith("blob:")) {
      setPdfHref(fromNav);
      setPdfStatus("ready");
      return;
    }
    const fromBlobSession = peekPdfBlobUrlFromSession(id);
    if (fromBlobSession && fromBlobSession.startsWith("blob:")) {
      setPdfHref(fromBlobSession);
      setPdfStatus("ready");
      return;
    }
    const fromDataSession = peekPdfDataUrlFromSession(id);
    if (fromDataSession) {
      setPdfHref(fromDataSession);
      setPdfStatus("ready");
      return;
    }
    setPdfHref(null);
    setPdfStatus("loading");
  }, [id, state?.pdfBlobUrl]);

  useEffect(() => {
    if (!id) return undefined;
    if (state?.pdfBlobUrl && String(state.pdfBlobUrl).startsWith("blob:")) return undefined;
    if (peekPdfBlobUrlFromSession(id)) return undefined;
    if (peekPdfDataUrlFromSession(id)) return undefined;

    let cancelled = false;
    (async () => {
      const blob = await getLocalPdfBlob(id).catch(() => null);
      if (cancelled) return;
      if (blob && blob.size > 0) {
        const objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        idbObjectUrlRef.current = objectUrl;
        setPdfHref(objectUrl);
        setPdfStatus("ready");
      } else {
        setPdfStatus("missing");
      }
    })();

    return () => {
      cancelled = true;
      if (idbObjectUrlRef.current) {
        URL.revokeObjectURL(idbObjectUrlRef.current);
        idbObjectUrlRef.current = null;
      }
    };
  }, [id, state?.pdfBlobUrl]);

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
    return () => {
      cancelled = true;
    };
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

        {pdfStatus === "loading" && <p className={styles.sub}>טוען את הקובץ…</p>}

        {pdfStatus === "ready" && pdfHref && (
          <a href={pdfHref} download="album.pdf" className={styles.cta}>
            הורד PDF
          </a>
        )}

        {pdfStatus === "missing" && (
          <div className={styles.sub} style={{ textAlign: "center", maxWidth: "22rem", margin: "0 auto 1rem" }}>
            <p style={{ marginBottom: "0.75rem" }}>
              הקובץ נוצר במכשיר זה ולא נשמר אחרי סגירת הדפדפן. לחצו שוב על &quot;סיום והורדת PDF&quot; מהסטודיו כדי ליצור עותק עם עברית תקינה.
            </p>
            <Link to={`/album/${id}/pages`} className={styles.cta}>
              חזרה לסטודיו
            </Link>
          </div>
        )}

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
