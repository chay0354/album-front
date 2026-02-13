import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAlbum, addPage, deletePage } from "../api";
import StageIndicator from "../components/StageIndicator";
import styles from "./PagesCount.module.css";

const MIN_PAGES = 1;
const MAX_PAGES = 50;

export default function PagesCount() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState(null);
  const [customCount, setCustomCount] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAlbum(id)
      .then((a) => {
        if (!cancelled) {
          setAlbum(a);
          const n = (a.pages || []).length;
          setCustomCount(String(n));
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [id]);

  const currentCount = (album?.pages || []).length;
  const effectiveTarget = Math.min(MAX_PAGES, Math.max(MIN_PAGES, parseInt(customCount, 10) || currentCount || MIN_PAGES));

  async function handleNext() {
    setApplying(true);
    setError(null);
    try {
      let a = await getAlbum(id);
      let pages = a.pages || [];
      while (pages.length < effectiveTarget) {
        await addPage(id);
        a = await getAlbum(id);
        pages = a.pages || [];
      }
      while (pages.length > effectiveTarget) {
        const sorted = [...pages].sort((x, y) => (x.page_order ?? 0) - (y.page_order ?? 0));
        const last = sorted[sorted.length - 1];
        if (last?.id) {
          await deletePage(id, last.id);
          a = await getAlbum(id);
          pages = a.pages || [];
        } else break;
      }
      navigate(`/album/${id}/pages`);
    } catch (e) {
      setError(e?.message || "שגיאה");
    } finally {
      setApplying(false);
    }
  }

  if (!album) return <div className={styles.center}><span className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <StageIndicator current={2} />
      <header className={styles.header}>
        <h1>כמה עמודים באלבום?</h1>
      </header>

      <div className={styles.customRow}>
        <label className={styles.customLabel}>מספר עמודים</label>
        <input
          type="number"
          min={MIN_PAGES}
          max={MAX_PAGES}
          value={customCount}
          onChange={(e) => { setCustomCount(e.target.value); }}
          placeholder="הזן מספר"
          className={styles.customInput}
        />
      </div>

      <p className={styles.summary}>
        יוצגו <strong>{effectiveTarget}</strong> עמודים באלבום.
      </p>

      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={() => navigate(`/album/${id}/cover`)} className={styles.secondary}>
          חזרה לכריכה
        </button>
        <button type="button" onClick={handleNext} disabled={applying} className={styles.cta}>
          {applying ? "מעדכן..." : "המשך לעריכת עמודים"}
        </button>
      </div>
    </div>
  );
}
