import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { getPdfDeliveries, getPremadeCoverList, uploadPremadeCover } from "../api";
import styles from "./Admin.module.css";

const LOGO_WATERMARK_SRC = "/לוגו%20ללא%20רקע.png";
const WATERMARK_WIDTH_PCT = 0.32; // width as % of cover width – wide
const WATERMARK_MAX_WIDTH_PX = 320;
const WATERMARK_MAX_HEIGHT_PX = 44; // low height so logo is wide and short
const WATERMARK_MARGIN_PCT = 0.02;

/** Load an image from URL or File. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    if (src instanceof Blob) img.src = URL.createObjectURL(src);
    else img.src = src;
  });
}

/** Draw logo watermark on cover image; return new File. */
async function addWatermarkToCover(file) {
  const [coverImg, logoImg] = await Promise.all([
    loadImage(file),
    loadImage(LOGO_WATERMARK_SRC),
  ]);
  const w = coverImg.naturalWidth || coverImg.width;
  const h = coverImg.naturalHeight || coverImg.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(coverImg, 0, 0, w, h);
  const lw = logoImg.naturalWidth || logoImg.width || 1;
  const lh = logoImg.naturalHeight || logoImg.height || 1;
  const maxLogoW = Math.min(Math.round(w * WATERMARK_WIDTH_PCT), WATERMARK_MAX_WIDTH_PX);
  const maxLogoH = WATERMARK_MAX_HEIGHT_PX;
  const scale = Math.min(maxLogoW / lw, maxLogoH / lh, 1);
  const logoDrawW = Math.round(lw * scale);
  const logoDrawH = Math.round(lh * scale);
  const margin = Math.max(2, Math.round(Math.min(w, h) * WATERMARK_MARGIN_PCT));
  const x = w - logoDrawW - margin;
  const y = h - logoDrawH - margin;
  ctx.drawImage(logoImg, x, y, logoDrawW, logoDrawH);
  if (coverImg.src && coverImg.src.startsWith("blob:")) URL.revokeObjectURL(coverImg.src);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create image"));
          return;
        }
        const name = file.name.replace(/\.[^.]+$/, "") ? `${file.name.replace(/\.[^.]+$/, "")}-watermark.jpg` : "cover-watermark.jpg";
        resolve(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  });
}

export default function Admin() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [premadeCovers, setPremadeCovers] = useState([]);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState(null);
  const coverInputRef = useRef(null);

  useEffect(() => {
    getPdfDeliveries()
      .then((data) => setList(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getPremadeCoverList()
      .then((data) => setPremadeCovers(Array.isArray(data) ? data : []))
      .catch(() => setPremadeCovers([]));
  }, []);

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setCoverError("נא לבחור קובץ תמונה.");
      return;
    }
    setCoverError(null);
    setCoverUploading(true);
    try {
      const watermarked = await addWatermarkToCover(file);
      await uploadPremadeCover(watermarked);
      const data = await getPremadeCoverList();
      setPremadeCovers(Array.isArray(data) ? data : []);
      if (coverInputRef.current) coverInputRef.current.value = "";
    } catch (err) {
      setCoverError(err?.message || "שגיאה בהעלאת הכריכה");
    } finally {
      setCoverUploading(false);
    }
  }

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

      <section className={styles.coverSection}>
        <h2 className={styles.coverSectionTitle}>העלאת כריכות מוכנות</h2>
        <p className={styles.coverSectionSub}>
          כריכות שתעלה יופיעו בעמוד עיצוב הכריכה בבחירת רקע.
        </p>
        <div className={styles.coverUploadRow}>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverUpload}
            disabled={coverUploading}
            className={styles.coverFileInput}
            aria-label="בחר תמונה לכריכה"
          />
          <button
            type="button"
            className={styles.coverUploadBtn}
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
          >
            {coverUploading ? "מעלה..." : "בחר תמונה והעלה"}
          </button>
        </div>
        {coverError && <p className={styles.error}>{coverError}</p>}
        {premadeCovers.length > 0 && (
          <p className={styles.coverCount}>
            כרגע {premadeCovers.length} כריכות מוכנות באחסון.
          </p>
        )}
      </section>

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
