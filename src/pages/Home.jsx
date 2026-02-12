import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createAlbum } from "../api";
import styles from "./Home.module.css";

export default function Home() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    createAlbum({ title: "אלבום חדש" })
      .then((album) => {
        if (!cancelled) navigate(`/album/${album.id}/cover`, { replace: true });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <p className={styles.error}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.center}>
        <span className={styles.spinner} />
        <p>יוצר אלבום...</p>
      </div>
    </div>
  );
}
