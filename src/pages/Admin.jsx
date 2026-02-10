import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getPdfDeliveries } from "../api";
import styles from "./Admin.module.css";

export default function Admin() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getPdfDeliveries()
      .then((data) => setList(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Group by email (user)
  const byEmail = list.reduce((acc, row) => {
    const mail = row.mail || "(ללא אימייל)";
    if (!acc[mail]) acc[mail] = [];
    acc[mail].push(row);
    return acc;
  }, {});

  const entries = Object.entries(byEmail).sort((a, b) => a[0].localeCompare(b[0]));

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.center}>
          <span className={styles.spinner} />
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>ניהול – משתמשים ו־PDF</h1>
        <p className={styles.sub}>כל משתמש (אימייל) והקבצים שיצר</p>
        <Link to="/" className={styles.backLink}>← חזרה לדף הבית</Link>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      {entries.length === 0 ? (
        <p className={styles.empty}>אין עדיין רשומות.</p>
      ) : (
        <ul className={styles.userList}>
          {entries.map(([email, rows]) => (
            <li key={email} className={styles.userCard}>
              <h3 className={styles.userEmail}>{email}</h3>
              <ul className={styles.pdfList}>
                {rows.map((row) => (
                  <li key={row.id} className={styles.pdfRow}>
                    <a
                      href={row.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.pdfLink}
                    >
                      צפה / הורד PDF
                    </a>
                    <span className={styles.pdfDate}>
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString("he-IL")
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
