import { useParams, Link } from "react-router-dom";
import { getPdfDownloadUrl } from "../api";
import styles from "./Done.module.css";

export default function Done() {
  const { id } = useParams();
  const pdfUrl = getPdfDownloadUrl(id);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1>האלבום מוכן!</h1>
        <p className={styles.sub}>הורד את האלבום כקובץ PDF לשמירה או הדפסה.</p>
        <a href={pdfUrl} download="album.pdf" className={styles.cta}>
          הורד PDF
        </a>
        <div className={styles.links}>
          <Link to={`/album/${id}/pages`}>עריכת תמונות</Link>
          <Link to={`/album/${id}/cover`}>עריכת כריכה</Link>
          <Link to="/">חזרה לדף הבית</Link>
        </div>
      </div>
    </div>
  );
}
