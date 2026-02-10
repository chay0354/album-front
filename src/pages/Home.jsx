import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAlbums, createAlbum } from "../api";
import styles from "./Home.module.css";

export default function Home() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAlbums()
      .then(setAlbums)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleNewAlbum() {
    setError(null);
    setCreating(true);
    try {
      const album = await createAlbum({ title: "אלבום חדש" });
      navigate(`/album/${album.id}/cover`);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  }

  if (loading) return <div className={styles.center}><span className={styles.spinner} /></div>;
  if (error) return <div className={styles.center}><p className={styles.error}>{error}</p></div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>יוצר אלבומים</h1>
        <p className={styles.sub}>צור אלבום תמונות מותאם אישית והורד כ־PDF</p>
        <button type="button" onClick={handleNewAlbum} disabled={creating} className={styles.cta}>
          {creating ? "יוצר..." : "אלבום חדש"}
        </button>
      </header>
      <section className={styles.list}>
        <h2>האלבומים שלי</h2>
        {albums.length === 0 ? (
          <p className={styles.empty}>עדיין אין אלבומים. צור את הראשון.</p>
        ) : (
          <ul className={styles.grid}>
            {albums.map((a) => (
              <li key={a.id}>
                <Link to={`/album/${a.id}/cover`} className={styles.card}>
                  <span className={styles.cardTitle}>{a.title || "אלבום ללא כותרת"}</span>
                  <span className={styles.cardMeta}>{a.album_pages?.length ?? 0} עמודים</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
