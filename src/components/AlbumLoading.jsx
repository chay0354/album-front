import styles from "./AlbumLoading.module.css";

export default function AlbumLoading({ label = "טוען את האלבום..." }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.albumShape}>
        <div className={styles.albumSpine} aria-hidden />
        <div className={styles.albumFill} aria-hidden />
      </div>
      <p className={styles.label}>{label}</p>
    </div>
  );
}
