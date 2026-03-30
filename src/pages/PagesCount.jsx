import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAlbum, syncAlbumPageCount } from "../api";
import StageIndicator from "../components/StageIndicator";
import AlbumLoading from "../components/AlbumLoading";
import styles from "./PagesCount.module.css";

const PAGE_OPTIONS = [26, 36, 50, 76, 100, 120, 140];

export default function PagesCount() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [album, setAlbum] = useState(null);
  const [selectedCount, setSelectedCount] = useState(PAGE_OPTIONS[0]);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAlbum(id)
      .then((a) => {
        if (!cancelled) {
          setAlbum(a);
          const n = (a.pages || []).length;
          const closest = PAGE_OPTIONS.find((opt) => opt >= n) || PAGE_OPTIONS[PAGE_OPTIONS.length - 1];
          setSelectedCount(closest);
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [id]);

  const effectiveTarget = selectedCount;

  async function handleNext() {
    setApplying(true);
    setError(null);
    try {
      await syncAlbumPageCount(id, effectiveTarget);
      navigate(`/album/${id}/pages`);
    } catch (e) {
      setError(e?.message || "שגיאה");
    } finally {
      setApplying(false);
    }
  }

  if (!album) return <AlbumLoading />;

  return (
    <div className={styles.page}>
      <StageIndicator current={2} />
      <header className={styles.header}>
        <h1>כמה עמודים באלבום?</h1>
      </header>

      <div className={styles.customRow}>
        <span className={styles.customLabel}>מספר עמודים</span>
        <div className={styles.pageOptions} role="group" aria-label="בחר מספר עמודים">
          {PAGE_OPTIONS.map((num) => (
            <button
              key={num}
              type="button"
              className={selectedCount === num ? styles.pageOptionBtnSelected : styles.pageOptionBtn}
              onClick={() => setSelectedCount(num)}
            >
              {num}
            </button>
          ))}
        </div>
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
